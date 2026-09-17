import { ApiError } from '../utils/ApiError.js';
import {
  findCompanySettings,
  updateCompanySettings,
  updateLocationRestrictionEnabled,
} from '../models/settings.model.js';
import { findShiftOverrideByEmployee } from '../models/employee.model.js';

// Office hours and the location-restriction toggle are both read on
// hot paths (every check-in/check-out, every login, every location
// re-check while the app is open), so a short-TTL cache of the single
// settings row avoids a DB round-trip per call while still picking up a
// change from the settings screen within seconds.
const CACHE_TTL_MS = 30_000;
let cached = null;
let cachedAt = 0;

function invalidateCache() {
  cached = null;
  cachedAt = 0;
}

async function getCompanySettings() {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const row = await findCompanySettings();
  if (!row) {
    throw new ApiError(500, 'Company settings are not configured');
  }

  cached = {
    officeStartTime: row.office_start_time,
    officeEndTime: row.office_end_time,
    locationRestrictionEnabled: Boolean(row.location_restriction_enabled),
  };
  cachedAt = Date.now();
  return cached;
}

export async function getOfficeHours() {
  const { officeStartTime, officeEndTime } = await getCompanySettings();
  return { officeStartTime, officeEndTime };
}

// Not every employee works the company-default shift — an employee row with
// shift_start_time/shift_end_time set overrides the company-wide default
// from here on for that employee's check-in/check-out/late/payroll
// calculations. NULL (the common case) falls back to getOfficeHours().
export async function getEffectiveShiftHours(employeeId) {
  const company = await getOfficeHours();
  if (!employeeId) return company;

  const override = await findShiftOverrideByEmployee(employeeId);
  if (!override?.shift_start_time || !override?.shift_end_time) {
    return company;
  }
  return { officeStartTime: override.shift_start_time, officeEndTime: override.shift_end_time };
}

function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(value);
}

export async function setOfficeHours({ officeStartTime, officeEndTime, updatedBy }) {
  if (!isValidTime(officeStartTime) || !isValidTime(officeEndTime)) {
    throw new ApiError(422, 'officeStartTime and officeEndTime must be in HH:MM:SS format');
  }
  if (officeStartTime === officeEndTime) {
    throw new ApiError(422, 'Office start and end time cannot be the same');
  }

  const updated = await updateCompanySettings({ officeStartTime, officeEndTime, updatedBy });
  invalidateCache();
  return { officeStartTime: updated.office_start_time, officeEndTime: updated.office_end_time };
}

// Read by the login flow and the periodic in-app location re-check
// (auth.service.js) — both run for every non-CEO/manager employee, so this
// goes through the same cache as office hours rather than hitting the DB
// on every login/poll.
export async function isLocationRestrictionEnabled() {
  const { locationRestrictionEnabled } = await getCompanySettings();
  return locationRestrictionEnabled;
}

export async function getLocationRestrictionSetting() {
  const { locationRestrictionEnabled } = await getCompanySettings();
  return { enabled: locationRestrictionEnabled };
}

export async function setLocationRestrictionEnabled({ enabled, updatedBy }) {
  if (typeof enabled !== 'boolean') {
    throw new ApiError(422, 'enabled must be a boolean');
  }

  const updated = await updateLocationRestrictionEnabled({ enabled, updatedBy });
  invalidateCache();
  return { enabled: Boolean(updated.location_restriction_enabled) };
}
