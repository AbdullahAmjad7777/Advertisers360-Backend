import { pool } from '../config/db.js';

export async function insertInvitation({ email, tokenHash, invitedBy, expiresAt }) {
  const [result] = await pool.query(
    `INSERT INTO employee_invitations (email, token_hash, invited_by, expires_at)
     VALUES (?, ?, ?, ?)`,
    [email, tokenHash, invitedBy, expiresAt],
  );
  return result.insertId;
}

export async function findPendingInvitationByEmail(email) {
  const [rows] = await pool.query(
    `SELECT id, expires_at FROM employee_invitations
     WHERE email = ? AND status = 'pending' AND expires_at > NOW()
     LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findInvitationByTokenHash(tokenHash) {
  const [rows] = await pool.query(
    `SELECT id, email, status, employee_id, expires_at FROM employee_invitations WHERE token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function findInvitationById(id) {
  const [rows] = await pool.query(
    `SELECT id, email, status, expires_at FROM employee_invitations WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateInvitationToken(id, { tokenHash, expiresAt }) {
  await pool.query(
    `UPDATE employee_invitations SET token_hash = ?, expires_at = ? WHERE id = ?`,
    [tokenHash, expiresAt, id],
  );
}

export async function markInvitationCompleted(id, employeeId) {
  await pool.query(
    `UPDATE employee_invitations SET status = 'completed', employee_id = ?, completed_at = NOW() WHERE id = ?`,
    [employeeId, id],
  );
}

export async function markInvitationRevoked(id) {
  const [result] = await pool.query(
    `UPDATE employee_invitations SET status = 'revoked' WHERE id = ? AND status = 'pending'`,
    [id],
  );
  return result.affectedRows > 0;
}

export async function listInvitations({ limit, offset, status }) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('ei.status = ?');
    params.push(status);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ei.id, ei.email, ei.status, ei.expires_at, ei.created_at, ei.completed_at,
            inviter.full_name AS invited_by_name
     FROM employee_invitations ei
     LEFT JOIN employees inviter ON inviter.id = ei.invited_by
     ${whereClause}
     ORDER BY ei.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM employee_invitations ei ${whereClause}`,
    params,
  );
  return { rows, total: countRows[0].total };
}

// Non-sensitive (id + name only) so it's safe to expose on the public
// onboarding form, letting the invitee pick who they report to.
export async function findManagersForOnboarding() {
  const [rows] = await pool.query(
    `SELECT e.id, e.full_name
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     WHERE r.role_name IN ('manager', 'ceo') AND e.is_active = 1
     ORDER BY e.full_name ASC`,
  );
  return rows;
}
