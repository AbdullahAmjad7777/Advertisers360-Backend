import { pool } from '../config/db.js';

export async function findAllLeaveTypes() {
  const [rows] = await pool.query(
    `SELECT id, type_name, default_annual_quota, is_paid FROM leave_types ORDER BY id ASC`,
  );
  return rows;
}

export async function findLeaveTypeById(leaveTypeId) {
  const [rows] = await pool.query(`SELECT * FROM leave_types WHERE id = ?`, [leaveTypeId]);
  return rows[0] ?? null;
}

export async function findOverlappingLeave(employeeId, fromDate, toDate) {
  const [rows] = await pool.query(
    `SELECT id FROM leaves
     WHERE employee_id = ?
       AND status IN ('pending', 'approved')
       AND from_date <= ? AND to_date >= ?
     LIMIT 1`,
    [employeeId, toDate, fromDate],
  );
  return rows[0] ?? null;
}

export async function insertLeave(employeeId, { leaveTypeId, fromDate, toDate, totalDays, reason }) {
  const [result] = await pool.query(
    `INSERT INTO leaves (employee_id, leave_type_id, from_date, to_date, total_days, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [employeeId, leaveTypeId, fromDate, toDate, totalDays, reason ?? null],
  );
  return result.insertId;
}

const LEAVE_DETAIL_SELECT = `
  SELECT l.id, l.employee_id, e.full_name AS employee_name, e.employee_code,
         l.leave_type_id, lt.type_name AS leave_type_name, lt.is_paid,
         l.from_date, l.to_date, l.total_days, l.reason, l.status,
         l.approved_by, a.full_name AS approved_by_name, l.approved_at, l.created_at
  FROM leaves l
  JOIN employees e ON e.id = l.employee_id
  JOIN leave_types lt ON lt.id = l.leave_type_id
  LEFT JOIN employees a ON a.id = l.approved_by
`;

export async function findLeaveDetailById(id) {
  const [rows] = await pool.query(`${LEAVE_DETAIL_SELECT} WHERE l.id = ?`, [id]);
  return rows[0] ?? null;
}

export async function findLeaveById(id, connection = pool) {
  const [rows] = await connection.query(`SELECT * FROM leaves WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function lockLeaveById(connection, id) {
  const [rows] = await connection.query(`SELECT * FROM leaves WHERE id = ? FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

export async function findLeavesPaginated({ limit, offset, employeeId, status }) {
  const conditions = [];
  const params = [];

  if (employeeId) {
    conditions.push('l.employee_id = ?');
    params.push(employeeId);
  }
  if (status) {
    conditions.push('l.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `${LEAVE_DETAIL_SELECT} ${whereClause} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM leaves l ${whereClause}`,
    params,
  );

  return { rows, total: countRows[0].total };
}

export async function updateLeaveStatus(connection, id, { status, approvedBy }) {
  await connection.query(
    `UPDATE leaves SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
    [status, approvedBy, id],
  );
}

export async function setLeaveCancelled(connection, id) {
  await connection.query(`UPDATE leaves SET status = 'cancelled' WHERE id = ?`, [id]);
}

export async function getOrCreateBalance(connection, employeeId, leaveTypeId, year, defaultAllotted) {
  const [rows] = await connection.query(
    `SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ? FOR UPDATE`,
    [employeeId, leaveTypeId, year],
  );
  if (rows[0]) return rows[0];

  const [result] = await connection.query(
    `INSERT INTO leave_balances (employee_id, leave_type_id, year, total_allotted, used) VALUES (?, ?, ?, ?, 0)`,
    [employeeId, leaveTypeId, year, defaultAllotted],
  );
  const [newRows] = await connection.query(`SELECT * FROM leave_balances WHERE id = ?`, [result.insertId]);
  return newRows[0];
}

export async function adjustBalanceUsed(connection, balanceId, delta) {
  await connection.query(
    `UPDATE leave_balances SET used = GREATEST(0, used + ?) WHERE id = ?`,
    [delta, balanceId],
  );
}

export async function findBalancesForEmployee(employeeId, year) {
  const [rows] = await pool.query(
    `SELECT lt.id AS leave_type_id, lt.type_name, lt.is_paid,
            COALESCE(lb.total_allotted, lt.default_annual_quota) AS total_allotted,
            COALESCE(lb.used, 0) AS used,
            COALESCE(lb.remaining, lt.default_annual_quota) AS remaining
     FROM leave_types lt
     LEFT JOIN leave_balances lb ON lb.leave_type_id = lt.id AND lb.employee_id = ? AND lb.year = ?
     ORDER BY lt.id ASC`,
    [employeeId, year],
  );
  return rows;
}
