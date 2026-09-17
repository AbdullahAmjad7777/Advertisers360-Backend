import { pool } from '../config/db.js';

export async function recordLoginAttempt({ employeeId, ipAddress, deviceInfo, status }) {
  const [result] = await pool.query(
    `INSERT INTO login_logs (employee_id, ip_address, device_info, status)
     VALUES (?, ?, ?, ?)`,
    [employeeId, ipAddress, deviceInfo, status],
  );
  return result.insertId;
}

export async function closeLatestSession(employeeId) {
  await pool.query(
    `UPDATE login_logs
     SET logout_time = NOW()
     WHERE employee_id = ? AND status = 'success' AND logout_time IS NULL
     ORDER BY login_time DESC
     LIMIT 1`,
    [employeeId],
  );
}
