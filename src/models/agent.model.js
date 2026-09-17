import { pool } from '../config/db.js';

export async function insertResyncRequest(requestedBy, requestType) {
  const [result] = await pool.query(
    `INSERT INTO agent_resync_requests (requested_by, request_type) VALUES (?, ?)`,
    [requestedBy ?? null, requestType],
  );
  return result.insertId;
}

// Latest of each type independently, not just the single latest overall —
// otherwise a newer request of one type would mask an unacted-on older
// request of the other type, and an agent would never see it.
export async function findLatestResyncRequestByType(requestType) {
  const [rows] = await pool.query(
    `SELECT id, requested_at FROM agent_resync_requests WHERE request_type = ? ORDER BY id DESC LIMIT 1`,
    [requestType],
  );
  return rows[0] ?? null;
}

export async function findResyncRequestById(id) {
  const [rows] = await pool.query(
    `SELECT id, request_type, requested_at FROM agent_resync_requests WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

export async function insertResyncAck(requestId, employeeId, updateOutcome) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO agent_resync_acks (request_id, employee_id, update_outcome) VALUES (?, ?, ?)`,
    [requestId, employeeId, updateOutcome ?? null],
  );
  return result.affectedRows > 0;
}

export async function countResyncAcks(requestId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM agent_resync_acks WHERE request_id = ?`,
    [requestId],
  );
  return rows[0].count;
}

// Distinct employees who acked at least one of the given requests — used to
// report one combined "X agents responded" figure for "Fix All", instead of
// double-counting an agent that acked both the resync and the update-check.
export async function countDistinctAcksAcrossRequests(requestIds) {
  if (requestIds.length === 0) return 0;
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT employee_id) AS count FROM agent_resync_acks WHERE request_id IN (?)`,
    [requestIds],
  );
  return rows[0].count;
}

// Breakdown of what agents actually found when they checked for an update,
// for one specific (check_update-type) request.
export async function countAckOutcomes(requestId) {
  const [rows] = await pool.query(
    `SELECT update_outcome, COUNT(*) AS count FROM agent_resync_acks
     WHERE request_id = ? AND update_outcome IS NOT NULL
     GROUP BY update_outcome`,
    [requestId],
  );
  const byOutcome = { updated: 0, already_current: 0 };
  for (const row of rows) byOutcome[row.update_outcome] = row.count;
  return byOutcome;
}

// "Reachable" is an estimate, not a guarantee: an employee whose agent
// polled recently is very likely still running and will pick up a resync
// request on its next cycle, but there's no way to be certain until it
// actually acks.
export async function countRecentlySeenAgents(sinceMinutesAgo) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM employees
     WHERE is_active = 1 AND agent_last_seen_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [sinceMinutesAgo],
  );
  return rows[0].count;
}

export async function touchAgentLastSeen(employeeId) {
  await pool.query(`UPDATE employees SET agent_last_seen_at = NOW() WHERE id = ?`, [employeeId]);
}

// Employees who have set up the desktop agent before (agent_last_login_at
// is set — distinguishes "genuinely offline right now" from "never
// installed the agent at all", which is a different problem) but haven't
// polled recently — i.e. their agent isn't currently running/reachable by
// any signal. This is the list a manager/CEO needs to message personally,
// since nothing software-side can reach an agent that isn't open.
// Snapshots employee_code/full_name at delete time rather than joining to
// employees later — by the time anyone reads this row back, the employees
// row it's "about" may well be long gone (see 022_agent_uninstall.sql).
// ON DUPLICATE KEY handles the (rare, employee-id-reuse-impossible-but-
// belt-and-suspenders) case of a second delete attempt on the same
// tombstone: re-arms it as pending instead of erroring on the unique key.
export async function insertUninstallRequest({ employeeId, employeeCode, fullName, requestedBy }) {
  await pool.query(
    `INSERT INTO agent_uninstall_requests (employee_id, employee_code, full_name, requested_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = 'pending', delivered_at = NULL, requested_at = NOW()`,
    [employeeId, employeeCode, fullName, requestedBy ?? null],
  );
}

export async function findPendingUninstallByEmployeeId(employeeId) {
  const [rows] = await pool.query(
    `SELECT id FROM agent_uninstall_requests WHERE employee_id = ? AND status = 'pending' LIMIT 1`,
    [employeeId],
  );
  return rows[0] ?? null;
}

export async function markUninstallDelivered(employeeId) {
  await pool.query(
    `UPDATE agent_uninstall_requests SET status = 'delivered', delivered_at = NOW()
     WHERE employee_id = ? AND status = 'pending'`,
    [employeeId],
  );
}

// Manual override for a stuck dashboard entry — the CEO/manager personally
// confirmed the machine is handled (wiped, agent removed by hand, etc.)
// instead of waiting on an ack that may never come. Distinguished from a
// real agent ack by resolved_by being set (see 023_agent_uninstall_manual_
// resolve.sql) — same visible effect (row drops off the pending list),
// different audit trail.
export async function markUninstallResolvedManually(employeeId, resolvedBy) {
  const [result] = await pool.query(
    `UPDATE agent_uninstall_requests
     SET status = 'delivered', delivered_at = NOW(), resolved_by = ?
     WHERE employee_id = ? AND status = 'pending'`,
    [resolvedBy, employeeId],
  );
  return result.affectedRows > 0;
}

// Powers the CEO/manager dashboard's "these deleted employees' agents are
// still offline" list — the whole reason the tombstone (rather than just a
// column on employees) exists: it has to keep answering this after the
// employees row itself is gone.
export async function findPendingUninstalls() {
  const [rows] = await pool.query(
    `SELECT employee_id, employee_code, full_name, requested_at
     FROM agent_uninstall_requests
     WHERE status = 'pending'
     ORDER BY requested_at ASC`,
  );
  return rows;
}

export async function findOfflineAgents(sinceMinutesAgo) {
  const [rows] = await pool.query(
    `SELECT id, employee_code, full_name, email, agent_last_seen_at
     FROM employees
     WHERE is_active = 1
       AND agent_last_login_at IS NOT NULL
       AND (agent_last_seen_at IS NULL OR agent_last_seen_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))
     ORDER BY full_name ASC`,
    [sinceMinutesAgo],
  );
  return rows;
}
