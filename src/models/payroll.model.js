import { pool } from '../config/db.js';

// See migrations/014_current_month_deduction_waiver.sql — a one-time,
// company-wide waiver of attendance-related payroll deductions for a
// specific month/year (e.g. while a shift-date bug was mismarking people
// absent). Checked once per payroll calculation; unrelated to any
// per-employee data, so no employeeId param.
export async function isAttendanceDeductionWaived(month, year) {
  const [rows] = await pool.query(
    `SELECT 1 FROM payroll_deduction_waivers WHERE month = ? AND year = ? LIMIT 1`,
    [month, year],
  );
  return rows.length > 0;
}

export async function findSalaryStructureByEmployee(employeeId) {
  const [rows] = await pool.query(`SELECT * FROM salary_structure WHERE employee_id = ?`, [employeeId]);
  return rows[0] ?? null;
}

export async function upsertSalaryStructure(employeeId, fields) {
  await pool.query(
    `INSERT INTO salary_structure
       (employee_id, basic_salary, house_rent_allowance, medical_allowance, transport_allowance, other_allowance, effective_from)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       basic_salary = VALUES(basic_salary),
       house_rent_allowance = VALUES(house_rent_allowance),
       medical_allowance = VALUES(medical_allowance),
       transport_allowance = VALUES(transport_allowance),
       other_allowance = VALUES(other_allowance),
       effective_from = VALUES(effective_from)`,
    [
      employeeId,
      fields.basicSalary,
      fields.houseRentAllowance ?? 0,
      fields.medicalAllowance ?? 0,
      fields.transportAllowance ?? 0,
      fields.otherAllowance ?? 0,
      fields.effectiveFrom,
    ],
  );
  return findSalaryStructureByEmployee(employeeId);
}

// Keeps salary_structure.basic_salary in sync with employees.base_salary,
// which is the only salary figure the Add/Edit Employee form actually
// collects — there's no separate UI for setting up a salary structure, so
// without this, payroll generation fails with "Salary structure has not
// been set up" for every employee that only ever went through that form.
// Allowances (set via the dedicated salary-structure endpoint, if used) are
// left untouched on conflict.
export async function syncBasicSalaryFromEmployee(employeeId, basicSalary, effectiveFrom) {
  await pool.query(
    `INSERT INTO salary_structure
       (employee_id, basic_salary, house_rent_allowance, medical_allowance, transport_allowance, other_allowance, effective_from)
     VALUES (?, ?, 0, 0, 0, 0, ?)
     ON DUPLICATE KEY UPDATE basic_salary = VALUES(basic_salary)`,
    [employeeId, basicSalary, effectiveFrom],
  );
}

export async function findActiveDeductionRules() {
  const [rows] = await pool.query(`SELECT * FROM salary_deduction_rules WHERE is_active = 1`);
  return rows;
}

export async function findAllDeductionRules() {
  const [rows] = await pool.query(`SELECT * FROM salary_deduction_rules ORDER BY id ASC`);
  return rows;
}

export async function findDeductionRuleById(id) {
  const [rows] = await pool.query(`SELECT * FROM salary_deduction_rules WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function insertDeductionRule(fields) {
  const [result] = await pool.query(
    `INSERT INTO salary_deduction_rules (rule_name, rule_type, percentage_or_fixed, value, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [fields.ruleName, fields.ruleType, fields.percentageOrFixed, fields.value, fields.isActive ?? 1],
  );
  return findDeductionRuleById(result.insertId);
}

const RULE_UPDATABLE_FIELDS = {
  ruleName: 'rule_name',
  ruleType: 'rule_type',
  percentageOrFixed: 'percentage_or_fixed',
  value: 'value',
  isActive: 'is_active',
};

export async function updateDeductionRule(id, fields) {
  const columns = [];
  const values = [];

  for (const [key, column] of Object.entries(RULE_UPDATABLE_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      columns.push(`${column} = ?`);
      values.push(fields[key]);
    }
  }

  if (columns.length === 0) return false;

  values.push(id);
  const [result] = await pool.query(
    `UPDATE salary_deduction_rules SET ${columns.join(', ')} WHERE id = ?`,
    values,
  );
  return result.affectedRows > 0;
}

export async function findAttendanceForRange(employeeId, rangeStart, rangeEnd) {
  const [rows] = await pool.query(
    `SELECT attendance_date, status, check_in_time
     FROM attendance
     WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?`,
    [employeeId, rangeStart, rangeEnd],
  );
  return rows;
}

export async function findApprovedLeavesOverlappingRange(employeeId, rangeStart, rangeEnd) {
  const [rows] = await pool.query(
    `SELECT from_date, to_date FROM leaves
     WHERE employee_id = ? AND status = 'approved' AND from_date <= ? AND to_date >= ?`,
    [employeeId, rangeEnd, rangeStart],
  );
  return rows;
}

export async function findHolidaysInRange(rangeStart, rangeEnd) {
  const [rows] = await pool.query(
    `SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN ? AND ?`,
    [rangeStart, rangeEnd],
  );
  return rows.map((row) => row.holiday_date);
}

export async function findPayrollRecord(employeeId, month, year) {
  const [rows] = await pool.query(
    `SELECT * FROM payroll WHERE employee_id = ? AND month = ? AND year = ?`,
    [employeeId, month, year],
  );
  return rows[0] ?? null;
}

export async function insertPayroll(payroll) {
  const [result] = await pool.query(
    `INSERT INTO payroll
       (employee_id, month, year, total_present_days, total_absent_days, total_leave_days,
        late_deduction_days, gross_salary, total_deductions, late_deduction_amount,
        late_deduction_breakdown, net_salary, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [
      payroll.employeeId,
      payroll.month,
      payroll.year,
      payroll.totalPresentDays,
      payroll.totalAbsentDays,
      payroll.totalLeaveDays,
      payroll.lateDeductionDays,
      payroll.grossSalary,
      payroll.totalDeductions,
      payroll.lateDeductionAmount,
      JSON.stringify(payroll.lateDeductionBreakdown ?? []),
      payroll.netSalary,
    ],
  );
  return result.insertId;
}

export async function updatePayrollDraft(id, payroll) {
  await pool.query(
    `UPDATE payroll
     SET total_present_days = ?, total_absent_days = ?, total_leave_days = ?,
         late_deduction_days = ?, gross_salary = ?, total_deductions = ?,
         late_deduction_amount = ?, late_deduction_breakdown = ?, net_salary = ?
     WHERE id = ?`,
    [
      payroll.totalPresentDays,
      payroll.totalAbsentDays,
      payroll.totalLeaveDays,
      payroll.lateDeductionDays,
      payroll.grossSalary,
      payroll.totalDeductions,
      payroll.lateDeductionAmount,
      JSON.stringify(payroll.lateDeductionBreakdown ?? []),
      payroll.netSalary,
      id,
    ],
  );
}

const PAYROLL_DETAIL_SELECT = `
  SELECT p.id, p.employee_id, e.full_name AS employee_name, e.employee_code,
         p.month, p.year, p.total_present_days, p.total_absent_days, p.total_leave_days,
         p.late_deduction_days, p.gross_salary, p.total_deductions, p.late_deduction_amount,
         p.late_deduction_breakdown, p.net_salary, p.status, p.generated_at
  FROM payroll p
  JOIN employees e ON e.id = p.employee_id
`;

export async function findPayrollDetailById(id) {
  const [rows] = await pool.query(`${PAYROLL_DETAIL_SELECT} WHERE p.id = ?`, [id]);
  return rows[0] ?? null;
}

export async function findPayrollPaginated({ limit, offset, employeeId, month, year, status }) {
  const conditions = [];
  const params = [];

  if (employeeId) {
    conditions.push('p.employee_id = ?');
    params.push(employeeId);
  }
  if (month) {
    conditions.push('p.month = ?');
    params.push(month);
  }
  if (year) {
    conditions.push('p.year = ?');
    params.push(year);
  }
  if (status) {
    conditions.push('p.status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `${PAYROLL_DETAIL_SELECT} ${whereClause} ORDER BY p.year DESC, p.month DESC, e.full_name ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM payroll p ${whereClause}`,
    params,
  );

  return { rows, total: countRows[0].total };
}

export async function updatePayrollStatus(id, status) {
  const [result] = await pool.query(`UPDATE payroll SET status = ? WHERE id = ?`, [status, id]);
  return result.affectedRows > 0;
}

export async function findActiveEmployeeIds() {
  const [rows] = await pool.query(`SELECT id FROM employees WHERE is_active = 1`);
  return rows.map((row) => row.id);
}
