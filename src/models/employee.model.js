import { pool } from '../config/db.js';

export async function findByEmailWithRole(email) {
  const [rows] = await pool.query(
    `SELECT e.id, e.employee_code, e.full_name, e.email, e.password_hash, e.phone,
            e.department_id, e.designation_id, e.role_id, e.manager_id, e.is_active,
            e.session_epoch, r.role_name
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     WHERE e.email = ?
     LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findByIdWithRole(id) {
  const [rows] = await pool.query(
    `SELECT e.id, e.employee_code, e.full_name, e.email, e.phone, e.gender,
            e.date_of_birth, e.department_id, e.designation_id, e.role_id,
            e.manager_id, e.join_date, e.is_active, e.session_epoch,
            r.role_name
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     WHERE e.id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findFullAccessRecipientIds(excludeEmployeeId) {
  const [rows] = await pool.query(
    `SELECT e.id
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     WHERE r.role_name IN ('ceo', 'manager')
       AND e.is_active = 1
       AND e.id != ?`,
    [excludeEmployeeId],
  );
  return rows.map((row) => row.id);
}

const EMPLOYEE_DETAIL_SELECT = `
  SELECT e.id, e.employee_code, e.full_name, e.email, e.phone, e.cnic_number, e.address,
         e.profile_picture_url, e.emergency_contact_name, e.emergency_contact_phone,
         e.emergency_contact_relation, e.gender,
         e.date_of_birth, e.department_id, d.department_name, e.designation_id,
         des.designation_name, e.role_id, r.role_name, e.manager_id, m.full_name AS manager_name,
         e.join_date, e.resign_date, e.base_salary, e.shift_start_time, e.shift_end_time,
         e.is_active, e.created_at, e.updated_at,
         bd.bank_name, bd.account_title, bd.account_number, bd.iban
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN designations des ON des.id = e.designation_id
  JOIN roles r ON r.id = e.role_id
  LEFT JOIN employees m ON m.id = e.manager_id
  LEFT JOIN employee_bank_details bd ON bd.employee_id = e.id
`;

export async function generateNextEmployeeCode(connection) {
  const [rows] = await connection.query(
    `SELECT employee_code FROM employees
     WHERE employee_code REGEXP '^ADV360-[0-9]+$'
     ORDER BY CAST(SUBSTRING(employee_code, 8) AS UNSIGNED) DESC
     LIMIT 1
     FOR UPDATE`,
  );
  const lastNumber = rows.length > 0 ? parseInt(rows[0].employee_code.split('-')[1], 10) : 0;
  return `ADV360-${String(lastNumber + 1).padStart(4, '0')}`;
}

export async function insertEmployee(connection, employee) {
  const [result] = await connection.query(
    `INSERT INTO employees
       (employee_code, full_name, email, password_hash, phone, cnic_number, address,
        profile_picture_url, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relation, gender, date_of_birth, department_id, designation_id,
        role_id, manager_id, join_date, base_salary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employee.employeeCode,
      employee.fullName,
      employee.email,
      employee.passwordHash,
      employee.phone ?? null,
      employee.cnicNumber ?? null,
      employee.address ?? null,
      employee.profilePictureUrl ?? null,
      employee.emergencyContactName ?? null,
      employee.emergencyContactPhone ?? null,
      employee.emergencyContactRelation ?? null,
      employee.gender ?? null,
      employee.dateOfBirth ?? null,
      employee.departmentId ?? null,
      employee.designationId ?? null,
      employee.roleId,
      employee.managerId ?? null,
      employee.joinDate,
      employee.baseSalary ?? 0,
    ],
  );
  return result.insertId;
}

export async function findShiftOverrideByEmployee(employeeId) {
  const [rows] = await pool.query(
    `SELECT shift_start_time, shift_end_time FROM employees WHERE id = ?`,
    [employeeId],
  );
  return rows[0] ?? null;
}

export async function findEmployeeDetailById(id) {
  const [rows] = await pool.query(`${EMPLOYEE_DETAIL_SELECT} WHERE e.id = ?`, [id]);
  return rows[0] ?? null;
}

export async function findEmployeesPaginated({ limit, offset, search, status }) {
  const conditions = [];
  const params = [];
  

  if (status === 'active') {
    conditions.push('e.is_active = 1');
  } else if (status === 'inactive') {
    conditions.push('e.is_active = 0');
  }

  if (search) {
    conditions.push('(e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `${EMPLOYEE_DETAIL_SELECT} ${whereClause} ORDER BY e.id ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM employees e ${whereClause}`,
    params,
  );

  return { rows, total: countRows[0].total };
}

const UPDATABLE_FIELDS = {
  fullName: 'full_name',
  email: 'email',
  phone: 'phone',
  cnicNumber: 'cnic_number',
  address: 'address',
  profilePictureUrl: 'profile_picture_url',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
  emergencyContactRelation: 'emergency_contact_relation',
  gender: 'gender',
  dateOfBirth: 'date_of_birth',
  departmentId: 'department_id',
  designationId: 'designation_id',
  roleId: 'role_id',
  managerId: 'manager_id',
  joinDate: 'join_date',
  baseSalary: 'base_salary',
  shiftStartTime: 'shift_start_time',
  shiftEndTime: 'shift_end_time',
};

export async function updateEmployee(id, fields) {
  const columns = [];
  const values = [];

  for (const [key, column] of Object.entries(UPDATABLE_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      columns.push(`${column} = ?`);
      values.push(fields[key]);
    }
  }

  if (columns.length === 0) return false;

  values.push(id);
  const [result] = await pool.query(
    `UPDATE employees SET ${columns.join(', ')} WHERE id = ?`,
    values,
  );
  return result.affectedRows > 0;
}

// Deactivating an employee now hard-deletes their record and everything
// solely theirs (attendance, sessions, payroll, leave, etc.) —
// this is what keeps the email/CNIC/employee_code UNIQUE constraints from
// being permanently squatted on by an employee who no longer appears
// anywhere in the app, which was causing "This record already exists" when
// re-adding someone with the same details.
//
// Rows OWNED by other people that merely reference this employee (their
// manager_id, a leave they approved, a message they sent in a still-active
// shared conversation) are preserved — only the reference is cleared to
// NULL — so deleting one employee never deletes another employee's data.
export async function deleteEmployeeCascade(id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Clear references living on rows this employee doesn't own.
    await connection.query('UPDATE employees SET manager_id = NULL WHERE manager_id = ?', [id]);
    await connection.query('UPDATE leaves SET approved_by = NULL WHERE approved_by = ?', [id]);
    await connection.query(
      'UPDATE notifications SET related_employee_id = NULL WHERE related_employee_id = ?',
      [id],
    );
    await connection.query('UPDATE messages SET sender_id = NULL WHERE sender_id = ?', [id]);
    await connection.query('UPDATE conversations SET created_by = NULL WHERE created_by = ?', [id]);
    await connection.query(
      'UPDATE employee_invitations SET employee_id = NULL WHERE employee_id = ?',
      [id],
    );
    await connection.query(
      'UPDATE employee_invitations SET invited_by = NULL WHERE invited_by = ?',
      [id],
    );
    await connection.query('UPDATE company_settings SET updated_by = NULL WHERE updated_by = ?', [
      id,
    ]);
    await connection.query(
      'UPDATE payroll_deduction_waivers SET created_by = NULL WHERE created_by = ?',
      [id],
    );
    await connection.query(
      'UPDATE agent_resync_requests SET requested_by = NULL WHERE requested_by = ?',
      [id],
    );
    await connection.query(
      'UPDATE agent_uninstall_requests SET requested_by = NULL WHERE requested_by = ?',
      [id],
    );
    await connection.query(
      'UPDATE agent_uninstall_requests SET resolved_by = NULL WHERE resolved_by = ?',
      [id],
    );

    // Delete rows that belong solely to this employee.
    await connection.query('DELETE FROM message_read_receipts WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM conversation_participants WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM notifications WHERE recipient_id = ?', [id]);
    await connection.query('DELETE FROM login_logs WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM agent_resync_acks WHERE employee_id = ?', [id]);
    // Must run before deleting attendance: attendance_edit_log rows reference
    // attendance(id) with no cascade, so orphaning them here would otherwise
    // block the DELETE FROM attendance below with a FK violation.
    await connection.query(
      `DELETE FROM attendance_edit_log
       WHERE edited_by = ? OR attendance_id IN (SELECT id FROM attendance WHERE employee_id = ?)`,
      [id, id],
    );
    await connection.query('DELETE FROM attendance WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM payroll WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM salary_structure WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM leave_balances WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM leaves WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM employee_documents WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM employee_bank_details WHERE employee_id = ?', [id]);
    await connection.query('DELETE FROM audit_logs WHERE performed_by = ?', [id]);

    const [result] = await connection.query('DELETE FROM employees WHERE id = ?', [id]);

    await connection.commit();
    return result.affectedRows > 0;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function insertBankDetails(connection, employeeId, bankDetails) {
  await connection.query(
    `INSERT INTO employee_bank_details (employee_id, bank_name, account_title, account_number, iban)
     VALUES (?, ?, ?, ?, ?)`,
    [
      employeeId,
      bankDetails.bankName,
      bankDetails.accountTitle,
      bankDetails.accountNumber,
      bankDetails.iban ?? null,
    ],
  );
}

export async function findBankDetailsByEmployee(employeeId) {
  const [rows] = await pool.query(
    `SELECT bank_name, account_title, account_number, iban FROM employee_bank_details WHERE employee_id = ?`,
    [employeeId],
  );
  return rows[0] ?? null;
}

// Stamped on every successful /auth/agent-login — the only signal the
// onboarding flow's "check agent status" step has for whether the employee
// has actually signed into the desktop agent yet.
export async function updateAgentLastLogin(employeeId) {
  await pool.query(`UPDATE employees SET agent_last_login_at = NOW() WHERE id = ?`, [employeeId]);
}

export async function hasAgentSignedIn(employeeId) {
  const [rows] = await pool.query(`SELECT agent_last_login_at FROM employees WHERE id = ?`, [
    employeeId,
  ]);
  return rows[0]?.agent_last_login_at != null;
}

// Invalidates every outstanding access/refresh token for this employee (web
// and desktop agent alike) by advancing the epoch embedded in newly-issued
// tokens past whatever older tokens carry — see auth.service.js and
// middleware/auth.js for where that comparison happens.
export async function bumpSessionEpoch(employeeId) {
  await pool.query('UPDATE employees SET session_epoch = session_epoch + 1 WHERE id = ?', [
    employeeId,
  ]);
}
