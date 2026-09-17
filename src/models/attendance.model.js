import { pool } from '../config/db.js';
import { parseFlexibleDateTime } from '../utils/timezone.js';

export async function findByEmployeeAndDate(employeeId, attendanceDate) {
  const [rows] = await pool.query(
    `SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?`,
    [employeeId, attendanceDate],
  );
  return rows[0] ?? null;
}

export async function insertCheckIn(employeeId, attendanceDate, status, ipAddress) {
  const [result] = await pool.query(
    `INSERT INTO attendance (employee_id, attendance_date, check_in_time, status, ip_address)
     VALUES (?, ?, NOW(), ?, ?)`,
    [employeeId, attendanceDate, status, ipAddress],
  );
  return result.insertId;
}

export async function updateCheckIn(attendanceId, status, ipAddress) {
  await pool.query(
    `UPDATE attendance SET check_in_time = NOW(), status = ?, ip_address = ? WHERE id = ?`,
    [status, ipAddress, attendanceId],
  );
}

export async function recordCheckOut(attendanceId) {
  await pool.query(
    `UPDATE attendance
     SET check_out_time = NOW(),
         total_hours = ROUND(TIMESTAMPDIFF(MINUTE, check_in_time, NOW()) / 60, 2)
     WHERE id = ?`,
    [attendanceId],
  );
}

export async function findById(attendanceId) {
  const [rows] = await pool.query(`SELECT * FROM attendance WHERE id = ?`, [attendanceId]);
  return rows[0] ?? null;
}

export async function findTodayForAllActiveEmployees({ limit, offset, date }) {
  const [rows] = await pool.query(
    `SELECT e.id AS employee_id, e.employee_code, e.full_name,
            a.id AS attendance_id, a.check_in_time, a.check_out_time, a.total_hours, a.ip_address,
            COALESCE(a.status, 'absent') AS status
     FROM employees e
     LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date = ?
     WHERE e.is_active = 1
     ORDER BY e.full_name ASC
     LIMIT ? OFFSET ?`,
    [date, limit, offset],
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM employees WHERE is_active = 1`);
  return { rows, total: countRows[0].total };
}

export async function isHoliday(date) {
  const [rows] = await pool.query(`SELECT 1 FROM holidays WHERE holiday_date = ? LIMIT 1`, [date]);
  return rows.length > 0;
}

// employeeIds narrows each of these to a specific subset of active
// employees (used by the auto-mark job to run custom-shift employees
// through a different shiftDate than everyone on the company default —
// see attendance.service.js's runAttendanceAutoMark). Pass null/undefined
// to apply to all active employees, as before.
function employeeIdsClause(employeeIds) {
  return employeeIds && employeeIds.length > 0 ? 'AND e.id IN (?)' : '';
}

export async function markHolidayForMissingAttendance(date, employeeIds) {
  const clause = employeeIdsClause(employeeIds);
  const params = [date, date, date];
  if (clause) params.push(employeeIds);
  const [result] = await pool.query(
    `INSERT IGNORE INTO attendance (employee_id, attendance_date, status)
     SELECT e.id, ?, 'holiday'
     FROM employees e
     WHERE e.is_active = 1
       AND e.join_date <= ?
       AND NOT EXISTS (
         SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.attendance_date = ?
       )
       ${clause}`,
    params,
  );
  return result.affectedRows;
}

export async function markOnLeaveForMissingAttendance(date, employeeIds) {
  const clause = employeeIdsClause(employeeIds);
  const params = [date, date, date, date, date];
  if (clause) params.push(employeeIds);
  const [result] = await pool.query(
    `INSERT IGNORE INTO attendance (employee_id, attendance_date, status)
     SELECT e.id, ?, 'on_leave'
     FROM employees e
     WHERE e.is_active = 1
       AND e.join_date <= ?
       AND NOT EXISTS (
         SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.attendance_date = ?
       )
       AND EXISTS (
         SELECT 1 FROM leaves l
         WHERE l.employee_id = e.id AND l.status = 'approved'
           AND l.from_date <= ? AND l.to_date >= ?
       )
       ${clause}`,
    params,
  );
  return result.affectedRows;
}

// Who's about to be marked absent — called right before
// markAbsentForMissingAttendance so the caller can email exactly that set.
// Querying "who currently has no attendance row for this date" also makes
// this naturally idempotent if the job ever reruns for the same date: once
// markAbsentForMissingAttendance has inserted their row, this list comes
// back empty for them, so a rerun can't send duplicate emails.
export async function findEmployeesMissingAttendance(date, employeeIds) {
  const clause = employeeIdsClause(employeeIds);
  const params = [date, date];
  if (clause) params.push(employeeIds);
  const [rows] = await pool.query(
    `SELECT e.id, e.full_name, e.email
     FROM employees e
     WHERE e.is_active = 1
       AND e.join_date <= ?
       AND NOT EXISTS (
         SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.attendance_date = ?
       )
       ${clause}`,
    params,
  );
  return rows;
}

export async function markAbsentForMissingAttendance(date, employeeIds) {
  const clause = employeeIdsClause(employeeIds);
  const params = [date, date, date];
  if (clause) params.push(employeeIds);
  const [result] = await pool.query(
    `INSERT IGNORE INTO attendance (employee_id, attendance_date, status)
     SELECT e.id, ?, 'absent'
     FROM employees e
     WHERE e.is_active = 1
       AND e.join_date <= ?
       AND NOT EXISTS (
         SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.attendance_date = ?
       )
       ${clause}`,
    params,
  );
  return result.affectedRows;
}

// All active employees' shift override columns — used by the auto-mark job
// to split employees into "company default" (the common case, handled in
// one bulk pass) vs "custom shift" (handled individually, since each one's
// shift can conclude at a completely different time).
export async function findActiveEmployeeShiftInfo() {
  const [rows] = await pool.query(
    `SELECT id, join_date, shift_start_time, shift_end_time
     FROM employees
     WHERE is_active = 1`,
  );
  return rows;
}

export async function findDailyStatusCounts(rangeStart, rangeEnd, employeeId) {
  const conditions = ['attendance_date BETWEEN ? AND ?'];
  const params = [rangeStart, rangeEnd];

  if (employeeId) {
    conditions.push('employee_id = ?');
    params.push(employeeId);
  }

  const [rows] = await pool.query(
    `SELECT attendance_date, status, COUNT(*) AS count
     FROM attendance
     WHERE ${conditions.join(' AND ')}
     GROUP BY attendance_date, status`,
    params,
  );
  return rows;
}

export async function updateAttendanceFields(id, { checkInTime, checkOutTime, status, totalHours }) {
  await pool.query(
    `UPDATE attendance
     SET check_in_time = ?, check_out_time = ?, status = ?, total_hours = ?
     WHERE id = ?`,
    [
      parseFlexibleDateTime(checkInTime),
      parseFlexibleDateTime(checkOutTime),
      status,
      totalHours,
      id,
    ],
  );
}

export async function insertAttendanceEditLog({
  attendanceId,
  editedBy,
  oldCheckInTime,
  oldCheckOutTime,
  oldStatus,
  newCheckInTime,
  newCheckOutTime,
  newStatus,
  reason,
}) {
  await pool.query(
    `INSERT INTO attendance_edit_log
       (attendance_id, edited_by, old_check_in_time, old_check_out_time, old_status,
        new_check_in_time, new_check_out_time, new_status, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attendanceId,
      editedBy,
      parseFlexibleDateTime(oldCheckInTime),
      parseFlexibleDateTime(oldCheckOutTime),
      oldStatus,
      parseFlexibleDateTime(newCheckInTime),
      parseFlexibleDateTime(newCheckOutTime),
      newStatus,
      reason,
    ],
  );
}

export async function findEditLogByAttendance(attendanceId) {
  const [rows] = await pool.query(
    `SELECT l.id, l.old_check_in_time, l.old_check_out_time, l.old_status,
            l.new_check_in_time, l.new_check_out_time, l.new_status, l.reason, l.edited_at,
            e.full_name AS edited_by_name
     FROM attendance_edit_log l
     LEFT JOIN employees e ON e.id = l.edited_by
     WHERE l.attendance_id = ?
     ORDER BY l.edited_at DESC`,
    [attendanceId],
  );
  return rows;
}

export async function findHistoryByEmployee(employeeId, { limit, offset, from, to }) {
  const conditions = ['employee_id = ?'];
  const params = [employeeId];

  if (from) {
    conditions.push('attendance_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('attendance_date <= ?');
    params.push(to);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT id, attendance_date, check_in_time, check_out_time, total_hours, status, ip_address
     FROM attendance
     ${whereClause}
     ORDER BY attendance_date DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM attendance ${whereClause}`,
    params,
  );

  return { rows, total: countRows[0].total };
}
