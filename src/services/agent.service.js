import { ApiError } from '../utils/ApiError.js';
import { verifyRefreshTokenIgnoringExpiry } from '../utils/jwt.js';
import {
  insertResyncRequest,
  findLatestResyncRequestByType,
  findResyncRequestById,
  insertResyncAck,
  countResyncAcks,
  countDistinctAcksAcrossRequests,
  countAckOutcomes,
  countRecentlySeenAgents,
  touchAgentLastSeen,
  findOfflineAgents,
  findPendingUninstallByEmployeeId,
  markUninstallDelivered,
  markUninstallResolvedManually,
  findPendingUninstalls,
} from '../models/agent.model.js';

// A "recently seen" agent (polled in the last 5 minutes, well over 15x its
// own ~15s poll interval) is the estimate shown to the manager/CEO right
// when they click the button — the real ack count keeps climbing after
// that as each agent's next poll cycle actually picks up the request.
const RECENTLY_SEEN_WINDOW_MINUTES = 5;

async function requestAll(requestedBy, requestType) {
  const requestId = await insertResyncRequest(requestedBy, requestType);
  const estimatedReachable = await countRecentlySeenAgents(RECENTLY_SEEN_WINDOW_MINUTES);
  const { requested_at } = await findResyncRequestById(requestId);
  return { requestId, requestedAt: requested_at, estimatedReachable };
}

export async function requestResyncAll(requestedBy) {
  return requestAll(requestedBy, 'resync');
}

export async function requestUpdateCheckAll(requestedBy) {
  return requestAll(requestedBy, 'check_update');
}

// Called by the agent on every poll cycle — returns the latest pending
// signal of each type independently (see agent.model.js for why "latest
// overall" would be wrong here), plus updates this employee's
// agent_last_seen_at as a side effect of the same round trip.
export async function getResyncStatus(employeeId) {
  await touchAgentLastSeen(employeeId);
  const [resync, checkUpdate] = await Promise.all([
    findLatestResyncRequestByType('resync'),
    findLatestResyncRequestByType('check_update'),
  ]);
  return {
    resync: resync ? { requestId: resync.id, requestedAt: resync.requested_at } : null,
    checkUpdate: checkUpdate ? { requestId: checkUpdate.id, requestedAt: checkUpdate.requested_at } : null,
  };
}

export async function ackResync(requestId, employeeId, updateOutcome) {
  const request = await findResyncRequestById(requestId);
  if (!request) {
    throw new ApiError(404, 'Resync request not found');
  }
  await insertResyncAck(requestId, employeeId, updateOutcome);
}

export async function getResyncRequestProgress(requestId) {
  const request = await findResyncRequestById(requestId);
  if (!request) {
    throw new ApiError(404, 'Resync request not found');
  }
  const ackCount = await countResyncAcks(requestId);
  const estimatedReachable = await countRecentlySeenAgents(RECENTLY_SEEN_WINDOW_MINUTES);
  return {
    requestId,
    requestType: request.request_type,
    requestedAt: request.requested_at,
    ackCount,
    estimatedReachable,
  };
}

// Powers the "Fix All Agents Now" button — combines a resync + an
// update-check into one click. Returns both request ids (the agent still
// tracks and acks them independently — see attendance-poller.js) plus the
// list of employees whose agent isn't reachable at all right now, so the
// manager/CEO knows exactly who needs a personal message instead of having
// to guess.
export async function requestFixAll(requestedBy) {
  const [resync, checkUpdate] = await Promise.all([
    requestAll(requestedBy, 'resync'),
    requestAll(requestedBy, 'check_update'),
  ]);
  const offlineAgents = await findOfflineAgents(RECENTLY_SEEN_WINDOW_MINUTES);
  return {
    resyncRequestId: resync.requestId,
    updateRequestId: checkUpdate.requestId,
    requestedAt: resync.requestedAt,
    estimatedReachable: resync.estimatedReachable,
    offlineAgents,
  };
}

// Dashboard list of deleted employees whose agent hasn't picked up (and
// acked) its uninstall instruction yet — i.e. is still installed and
// running somewhere. See 022_agent_uninstall.sql for why this survives the
// employees row itself being long gone.
export async function getPendingUninstalls() {
  return findPendingUninstalls();
}

// The "Mark as Resolved" button — a CEO/manager personally vouching that
// this machine is handled, so the entry stops sitting on the dashboard
// forever. Unlike checkUninstall/ackUninstall below, this goes through the
// normal authenticateToken + requirePermission('manageEmployees') gate (see
// agent.routes.js) — it's a real admin action against a real logged-in
// session, not something the (possibly already-hard-deleted) subject
// employee's own credential is proving anything about.
export async function resolveUninstallManually(employeeId, resolvedBy) {
  const resolved = await markUninstallResolvedManually(employeeId, resolvedBy);
  if (!resolved) {
    throw new ApiError(404, 'No pending uninstall request found for this employee');
  }
}

// The agent-uninstall check/ack endpoints (routes/agent-uninstall.routes.js)
// are deliberately NOT behind authenticateToken — by the time they're
// called, the employee row the normal auth middleware checks against may
// already be hard-deleted. Trust instead comes purely from the refresh
// token's signature (verified ignoring expiry, so a long-offline machine's
// lapsed-but-still-genuine token still counts) — see
// verifyRefreshTokenIgnoringExpiry's own comment for why that's safe here.
function employeeIdFromRefreshToken(refreshToken) {
  if (!refreshToken) {
    throw new ApiError(401, 'No credential provided');
  }
  let payload;
  try {
    payload = verifyRefreshTokenIgnoringExpiry(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid credential');
  }
  return payload.id;
}

export async function checkUninstall(refreshToken) {
  const employeeId = employeeIdFromRefreshToken(refreshToken);
  const pending = await findPendingUninstallByEmployeeId(employeeId);
  return { shouldUninstall: Boolean(pending) };
}

export async function ackUninstall(refreshToken) {
  const employeeId = employeeIdFromRefreshToken(refreshToken);
  await markUninstallDelivered(employeeId);
}

export async function getFixAllProgress(resyncRequestId, updateRequestId) {
  const [resyncRequest, updateRequest] = await Promise.all([
    findResyncRequestById(resyncRequestId),
    findResyncRequestById(updateRequestId),
  ]);
  if (!resyncRequest || !updateRequest) {
    throw new ApiError(404, 'Fix-all request not found');
  }

  const [respondedCount, updateOutcomes, offlineAgents] = await Promise.all([
    countDistinctAcksAcrossRequests([resyncRequestId, updateRequestId]),
    countAckOutcomes(updateRequestId),
    findOfflineAgents(RECENTLY_SEEN_WINDOW_MINUTES),
  ]);
  const estimatedReachable = await countRecentlySeenAgents(RECENTLY_SEEN_WINDOW_MINUTES);

  return {
    resyncRequestId,
    updateRequestId,
    respondedCount,
    estimatedReachable,
    updated: updateOutcomes.updated,
    alreadyCurrent: updateOutcomes.already_current,
    offlineAgents,
  };
}
