import { pool } from '../config/db.js';

const BREAK_SELECT = `
  SELECT b.id, b.employee_id, b.attendance_id, b.shift_date, b.break_start, b.break_end,
         b.duration_seconds
  FROM attendance_breaks b
`;

export async function findOpenBreakByEmployee(employeeId) {
  const [rows] = await pool.query(`${BREAK_SELECT} WHERE b.employee_id = ? AND b.break_end IS NULL`, [
    employeeId,
  ]);
  return rows[0] ?? null;
}

export async function findBreakById(id) {
  const [rows] = await pool.query(`${BREAK_SELECT} WHERE b.id = ?`, [id]);
  return rows[0] ?? null;
}

export async function insertBreakStart(employeeId, attendanceId, shiftDate) {
  const [result] = await pool.query(
    `INSERT INTO attendance_breaks (employee_id, attendance_id, shift_date, break_start)
     VALUES (?, ?, ?, NOW())`,
    [employeeId, attendanceId, shiftDate],
  );
  return result.insertId;
}

export async function endBreakNow(breakId) {
  await pool.query(
    `UPDATE attendance_breaks
     SET break_end = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, break_start, NOW())
     WHERE id = ? AND break_end IS NULL`,
    [breakId],
  );
}

// Closes any break still open on this attendance row — on check-out, and
// when a manager/CEO closes a missed check-out. `endAt` null means NOW().
// GREATEST guards against an end time earlier than the break's own start.
export async function closeOpenBreaksForAttendance(attendanceId, endAt = null) {
  await pool.query(
    `UPDATE attendance_breaks
     SET break_end = GREATEST(break_start, COALESCE(?, NOW())),
         duration_seconds = TIMESTAMPDIFF(SECOND, break_start, GREATEST(break_start, COALESCE(?, NOW())))
     WHERE attendance_id = ? AND break_end IS NULL`,
    [endAt, endAt, attendanceId],
  );
}

export async function findBreaksForEmployees(employeeIds, from, to) {
  if (employeeIds.length === 0) return [];
  const [rows] = await pool.query(
    `${BREAK_SELECT}
     WHERE b.employee_id IN (?) AND b.shift_date BETWEEN ? AND ?
     ORDER BY b.shift_date DESC, b.break_start ASC`,
    [employeeIds, from, to],
  );
  return rows;
}
