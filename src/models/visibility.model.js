import { pool } from '../config/db.js';

// Active employees whose role is in `roles`, plus (optionally) one extra
// employee id regardless of role — see visibility.service.js.
export async function findActiveEmployeesByRoles(roles, alsoIncludeId) {
  const conditions = [];
  const params = [];
  if (roles.length > 0) {
    conditions.push('r.role_name IN (?)');
    params.push(roles);
  }
  if (alsoIncludeId) {
    conditions.push('e.id = ?');
    params.push(alsoIncludeId);
  }
  if (conditions.length === 0) return [];

  const [rows] = await pool.query(
    // tracking_start: attendance can't be recorded before the account
    // existed, so days before it must not count as absences even when
    // join_date is earlier (e.g. someone who joined in 2025 but was only
    // added to the system in Aug 2026).
    `SELECT e.id, e.employee_code, e.full_name, e.join_date,
            GREATEST(e.join_date, DATE(e.created_at)) AS tracking_start, r.role_name
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     WHERE e.is_active = 1 AND (${conditions.join(' OR ')})
     ORDER BY e.full_name ASC`,
    params,
  );
  return rows;
}
