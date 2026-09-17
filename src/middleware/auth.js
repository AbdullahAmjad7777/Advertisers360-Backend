import { verifyAccessToken } from '../utils/jwt.js';
import { hasPermission } from '../permissions/permissions.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pool } from '../config/db.js';

// Access tokens are short-lived JWTs, so a deactivated employee's existing
// token would otherwise keep working until it expires. This cache backs a
// per-request DB check so deactivation (or a forced session revoke) takes
// effect within seconds instead of waiting out the token's full TTL,
// without hitting the DB on every call.
const ACTIVE_STATUS_CACHE_TTL_MS = 15_000;
const activeStatusCache = new Map();

export function invalidateActiveStatusCache(employeeId) {
  activeStatusCache.delete(employeeId);
}

async function getEmployeeAuthState(employeeId) {
  const cached = activeStatusCache.get(employeeId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const [rows] = await pool.query('SELECT is_active, session_epoch FROM employees WHERE id = ?', [
    employeeId,
  ]);
  const state = {
    isActive: rows.length > 0 && rows[0].is_active === 1,
    sessionEpoch: rows.length > 0 ? rows[0].session_epoch : 0,
    expiresAt: Date.now() + ACTIVE_STATUS_CACHE_TTL_MS,
  };
  activeStatusCache.set(employeeId, state);
  return state;
}

function extractToken(req) {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function extractTokenFlexible(req) {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : (req.query.token ?? null);
}

async function authenticate(req, token) {
  if (!token) {
    throw new ApiError(401, 'Authentication token is required');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired token');
  }

  const state = await getEmployeeAuthState(payload.id);
  if (!state.isActive) {
    throw new ApiError(403, 'This account has been deactivated', 'ACCOUNT_DEACTIVATED');
  }

  // `?? 0` keeps this a no-op for tokens issued before session_epoch existed.
  if ((payload.sessionEpoch ?? 0) !== state.sessionEpoch) {
    throw new ApiError(401, 'Your session has been reset. Please log in again.', 'SESSION_REVOKED');
  }

  req.user = { id: payload.id, role: payload.role, employeeCode: payload.employeeCode };
}

export const authenticateToken = asyncHandler(async (req, res, next) => {
  await authenticate(req, extractToken(req));
  next();
});

// Same as authenticateToken, but also accepts the access token via a
// ?token= query param. Needed for routes loaded as plain <img>/<a> URLs
// (e.g. chat attachments), which can't attach an Authorization header.
export const authenticateTokenFlexible = asyncHandler(async (req, res, next) => {
  await authenticate(req, extractTokenFlexible(req));
  next();
});

export function requireRole(...roles) {
  return function checkRole(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
    next();
  };
}

export function requirePermission(action) {
  return function checkPermission(req, res, next) {
    if (!req.user || !hasPermission(req.user.role, action)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
    next();
  };
}
