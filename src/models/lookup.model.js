import { pool } from '../config/db.js';

export async function findAllRoles() {
  const [rows] = await pool.query(`SELECT id, role_name, description FROM roles ORDER BY id ASC`);
  return rows;
}

export async function findRoleIdByName(roleName) {
  const [rows] = await pool.query(`SELECT id FROM roles WHERE role_name = ? LIMIT 1`, [roleName]);
  return rows[0]?.id ?? null;
}

export async function findAllDepartments() {
  const [rows] = await pool.query(
    `SELECT id, department_name, description, is_active FROM departments WHERE is_active = 1 ORDER BY department_name ASC`,
  );
  return rows;
}

export async function findAllDesignations() {
  const [rows] = await pool.query(
    `SELECT id, designation_name, department_id, is_active FROM designations WHERE is_active = 1 ORDER BY designation_name ASC`,
  );
  return rows;
}

export async function findRoleNameById(roleId) {
  const [rows] = await pool.query(`SELECT role_name FROM roles WHERE id = ? LIMIT 1`, [roleId]);
  return rows[0]?.role_name ?? null;
}

// Other employees already holding this role (deleted employees are removed
// from the table entirely, so every remaining row counts).
export async function findOtherHoldersOfRole(roleId, excludeEmployeeId) {
  const [rows] = await pool.query(
    `SELECT id, full_name FROM employees WHERE role_id = ? AND id <> ?`,
    [roleId, excludeEmployeeId ?? 0],
  );
  return rows;
}
