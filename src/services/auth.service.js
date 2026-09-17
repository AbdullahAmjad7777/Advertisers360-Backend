import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { haversineDistanceMeters } from '../utils/geolocation.js';
import { formatPktTime } from '../utils/timezone.js';
import {
  OFFICE_LATITUDE,
  OFFICE_LONGITUDE,
  OFFICE_RADIUS_METERS,
} from '../config/office-location.js';
import {
  findByEmailWithRole,
  findByIdWithRole,
  findFullAccessRecipientIds,
  updateAgentLastLogin,
} from '../models/employee.model.js';
import { recordLoginAttempt, closeLatestSession } from '../models/loginLog.model.js';
import { createBulkNotifications } from '../models/notification.model.js';
import { isLocationRestrictionEnabled } from './settings.service.js';

const LOCATION_EXEMPT_ROLES = new Set(['ceo']);

// TEMPORARY DEBUG (2026-08-04): also persist geo-check lines to a file, not
// just console.log — console output only reaches whichever terminal happens
// to be running the dev server, which isn't readable after the fact. Safe
// to strip once the radius/accuracy tuning is confirmed.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEO_LOG_PATH = path.join(__dirname, '..', '..', 'logs', 'geo-debug.log');

function logGeoDebug(line) {
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(GEO_LOG_PATH), { recursive: true });
    fs.appendFileSync(GEO_LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Best-effort debug logging — never let a logging failure break login.
  }
}

async function assertWithinOfficeRadius(roleName, latitude, longitude, accuracyMeters) {
  if (!(await isLocationRestrictionEnabled())) return;
  if (LOCATION_EXEMPT_ROLES.has(roleName)) return;

  if (latitude == null || longitude == null) {
    logGeoDebug(
      `[geo-login] role=${roleName} result=DENIED reason=no-coordinates (browser did not provide a location — permission denied or unsupported)`,
    );
    throw new ApiError(
      403,
      'Location access is required to sign in. Please allow location permissions and try again.',
      'LOCATION_PERMISSION_REQUIRED',
      { detectedLatitude: null, detectedLongitude: null, accuracyMeters: accuracyMeters ?? null },
    );
  }

  const distance = haversineDistanceMeters(latitude, longitude, OFFICE_LATITUDE, OFFICE_LONGITUDE);
  const details = {
    detectedLatitude: latitude,
    detectedLongitude: longitude,
    accuracyMeters: accuracyMeters ?? null,
    distanceMeters: Math.round(distance),
    officeLatitude: OFFICE_LATITUDE,
    officeLongitude: OFFICE_LONGITUDE,
    radiusMeters: OFFICE_RADIUS_METERS,
  };

  logGeoDebug(
    `[geo-login] role=${roleName} detected=(${latitude}, ${longitude}) accuracy=${accuracyMeters ?? 'unknown'}m ` +
      `office=(${OFFICE_LATITUDE}, ${OFFICE_LONGITUDE}) distance=${Math.round(distance)}m radius=${OFFICE_RADIUS_METERS}m ` +
      `result=${distance > OFFICE_RADIUS_METERS ? 'DENIED' : 'ALLOWED'}`,
  );

  if (distance > OFFICE_RADIUS_METERS) {
    throw new ApiError(403, 'You must be at the office to access this portal.', 'LOCATION_OUT_OF_RANGE', details);
  }

  return distance;
}

function buildTokenPayload(employee) {
  return {
    id: employee.id,
    role: employee.role_name,
    employeeCode: employee.employee_code,
    sessionEpoch: employee.session_epoch ?? 0,
  };
}

function toPublicProfile(employee) {
  const { password_hash, role_name, role_id, ...rest } = employee;
  return { ...rest, role: role_name };
}

async function verifyCredentials(email, password, ipAddress, deviceInfo) {
  const employee = await findByEmailWithRole(email);

  if (!employee) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, employee.password_hash);

  if (!passwordMatches) {
    await recordLoginAttempt({ employeeId: employee.id, ipAddress, deviceInfo, status: 'failed' });
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!employee.is_active) {
    await recordLoginAttempt({ employeeId: employee.id, ipAddress, deviceInfo, status: 'failed' });
    throw new ApiError(403, 'This account has been deactivated');
  }

  return employee;
}

async function completeLogin(employee, ipAddress, deviceInfo) {
  await recordLoginAttempt({ employeeId: employee.id, ipAddress, deviceInfo, status: 'success' });

  const recipientIds = await findFullAccessRecipientIds(employee.id);
  if (recipientIds.length > 0) {
    const loginTime = formatPktTime();
    const message = `${employee.full_name} logged in at ${loginTime}`;
    await createBulkNotifications(
      recipientIds.map((recipientId) => ({
        recipientId,
        type: 'login_alert',
        message,
        relatedEmployeeId: employee.id,
      })),
    );
  }

  const payload = buildTokenPayload(employee);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return { accessToken, refreshToken, user: toPublicProfile(employee) };
}

export async function login({ email, password, ipAddress, deviceInfo, latitude, longitude, accuracyMeters }) {
  const employee = await verifyCredentials(email, password, ipAddress, deviceInfo);

  try {
    await assertWithinOfficeRadius(employee.role_name, latitude, longitude, accuracyMeters);
  } catch (err) {
    await recordLoginAttempt({ employeeId: employee.id, ipAddress, deviceInfo, status: 'failed' });
    throw err;
  }

  return completeLogin(employee, ipAddress, deviceInfo);
}

// Desktop-agent login: email/password only, no office-location check. The
// agent's only job is background attendance tracking — physical-presence
// verification already happens through the web portal's own login/check-in
// flow, and the agent never asks the OS for a
// location fix, so requiring one here would just break it without adding
// real security value. Kept as a separate endpoint (not a flag on login())
// so the exemption is explicit and can't accidentally leak into the web
// portal's own login path.
export async function agentLogin({ email, password, ipAddress, deviceInfo }) {
  const employee = await verifyCredentials(email, password, ipAddress, deviceInfo);
  // The only signal onboarding step 2 has for "has this employee actually
  // signed into the desktop agent yet" — stamped here, not on the web
  // login path, since that's specifically what it needs to know.
  await updateAgentLastLogin(employee.id);
  return completeLogin(employee, ipAddress, deviceInfo);
}

export async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new ApiError(401, 'Refresh token is required');
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const employee = await findByIdWithRole(payload.id);
  if (!employee || !employee.is_active) {
    throw new ApiError(401, 'Account is no longer active');
  }

  // A manager/CEO's "force session refresh" action bumps session_epoch,
  // which immediately invalidates any refresh token minted before that
  // bump — even though its JWT signature/expiry are still perfectly valid.
  // `?? 0` keeps this a no-op for tokens issued before this column existed.
  if ((payload.sessionEpoch ?? 0) !== employee.session_epoch) {
    throw new ApiError(401, 'Your session has been reset. Please log in again.', 'SESSION_REVOKED');
  }

  const newPayload = buildTokenPayload(employee);
  const accessToken = signAccessToken(newPayload);
  const newRefreshToken = signRefreshToken(newPayload);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(employeeId) {
  await closeLatestSession(employeeId);
}

export async function verifyLocation(employeeId, latitude, longitude, accuracyMeters) {
  const employee = await findByIdWithRole(employeeId);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  if (!(await isLocationRestrictionEnabled()) || LOCATION_EXEMPT_ROLES.has(employee.role_name)) {
    return { inRange: true, exempt: true, distanceMeters: null };
  }

  if (latitude == null || longitude == null) {
    logGeoDebug(`[geo-verify] employeeId=${employeeId} result=OUT_OF_RANGE reason=no-coordinates`);
    return { inRange: false, exempt: false, distanceMeters: null };
  }

  const distance = haversineDistanceMeters(latitude, longitude, OFFICE_LATITUDE, OFFICE_LONGITUDE);
  logGeoDebug(
    `[geo-verify] employeeId=${employeeId} detected=(${latitude}, ${longitude}) accuracy=${accuracyMeters ?? 'unknown'}m ` +
      `distance=${Math.round(distance)}m radius=${OFFICE_RADIUS_METERS}m result=${distance <= OFFICE_RADIUS_METERS ? 'IN_RANGE' : 'OUT_OF_RANGE'}`,
  );
  return {
    inRange: distance <= OFFICE_RADIUS_METERS,
    exempt: false,
    distanceMeters: Math.round(distance),
    detectedLatitude: latitude,
    detectedLongitude: longitude,
    accuracyMeters: accuracyMeters ?? null,
  };
}

export async function getProfile(employeeId) {
  const employee = await findByIdWithRole(employeeId);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }
  const { role_name, role_id, ...rest } = employee;
  return { ...rest, role: role_name };
}

