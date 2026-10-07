import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import { findEmployeeDetailById } from '../models/employee.model.js';
import { getEffectiveShiftHours } from './settings.service.js';
import {
  findSalaryStructureByEmployee,
  upsertSalaryStructure,
  findActiveDeductionRules,
  findAllDeductionRules,
  findDeductionRuleById,
  insertDeductionRule,
  updateDeductionRule,
  findAttendanceForRange,
  findApprovedLeavesOverlappingRange,
  findHolidaysInRange,
  findPayrollRecord,
  insertPayroll,
  updatePayrollDraft,
  findPayrollDetailById,
  findPayrollPaginated,
  updatePayrollStatus,
  findActiveEmployeeIds,
  isAttendanceDeductionWaived,
} from '../models/payroll.model.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function assertCanAccessEmployee(requester, employeeId) {
  const isSelf = requester.id === employeeId;
  if (!requester.canViewAllPayroll && !isSelf) {
    throw new ApiError(403, "You do not have permission to view this employee's payroll records");
  }
}

// Every 3 late check-ins within the payroll period become 1 unpaid day
// (a full day's pay deducted) — remainders under 3 carry no deduction.
// Returns the grouped, dated breakdown so payroll/attendance screens can
// show exactly which 3 late days triggered which deduction, not just a
// lump total.
const LATE_GROUP_SIZE = 3;

function buildLateDeductionBreakdown(lateAttendanceRows, officeStartTime, dailyRate) {
  const sorted = [...lateAttendanceRows].sort((a, b) =>
    a.attendance_date < b.attendance_date ? -1 : a.attendance_date > b.attendance_date ? 1 : 0,
  );

  const breakdown = [];
  for (let i = 0; i + LATE_GROUP_SIZE <= sorted.length; i += LATE_GROUP_SIZE) {
    const group = sorted.slice(i, i + LATE_GROUP_SIZE);
    breakdown.push({
      groupNumber: breakdown.length + 1,
      officeStartTime,
      lateDays: group.map((row) => ({
        date: row.attendance_date,
        checkInTime: row.check_in_time,
      })),
      deductionDate: group[group.length - 1].attendance_date,
      deductionAmount: round2(dailyRate),
    });
  }
  return breakdown;
}

async function calculatePayrollForEmployee(employeeId, month, year) {
  const salaryStructure = await findSalaryStructureByEmployee(employeeId);
  if (!salaryStructure) {
    throw new ApiError(422, 'Salary structure has not been set up for this employee');
  }

  const grossSalary =
    Number(salaryStructure.basic_salary) +
    Number(salaryStructure.house_rent_allowance) +
    Number(salaryStructure.medical_allowance) +
    Number(salaryStructure.transport_allowance) +
    Number(salaryStructure.other_allowance);

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rangeStart = `${year}-${pad(month)}-01`;
  const rangeEnd = `${year}-${pad(month)}-${pad(lastDay)}`;

  const [attendanceRows, leaveRows, holidayDates] = await Promise.all([
    findAttendanceForRange(employeeId, rangeStart, rangeEnd),
    findApprovedLeavesOverlappingRange(employeeId, rangeStart, rangeEnd),
    findHolidaysInRange(rangeStart, rangeEnd),
  ]);

  const attendanceMap = new Map(attendanceRows.map((row) => [row.attendance_date, row]));
  const holidaySet = new Set(holidayDates);

  const leaveDaySet = new Set();
  for (const leave of leaveRows) {
    const from = new Date(`${leave.from_date}T00:00:00Z`);
    const to = new Date(`${leave.to_date}T00:00:00Z`);
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      leaveDaySet.add(d.toISOString().slice(0, 10));
    }
  }

  let workingDays = 0;
  let presentDays = 0;
  let lateDays = 0;
  let leaveDays = 0;
  let absentDays = 0;
  const lateAttendanceRows = [];

  for (let d = 1; d <= lastDay; d += 1) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    const dayOfWeek = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    // Sunday only — Monday through Saturday are working days.
    const isWeekend = dayOfWeek === 0;

    if (isWeekend || holidaySet.has(dateStr)) continue;

    workingDays += 1;

    if (leaveDaySet.has(dateStr)) {
      leaveDays += 1;
      continue;
    }

    const attendanceRow = attendanceMap.get(dateStr);
    const status = attendanceRow?.status;
    if (status === 'present' || status === 'late') {
      presentDays += 1;
      if (status === 'late') {
        lateDays += 1;
        lateAttendanceRows.push(attendanceRow);
      }
    } else {
      absentDays += 1;
    }
  }

  const dailyRate = workingDays > 0 ? grossSalary / workingDays : 0;
  const deductionRules = await findActiveDeductionRules();
  // See migrations/014_current_month_deduction_waiver.sql — a one-time,
  // company-wide waiver of attendance-related deductions for a specific
  // month, e.g. while a shift-date bug was mismarking people absent.
  // Non-attendance rules (tax, provident fund, etc.) are never waived.
  const attendanceDeductionsWaived = await isAttendanceDeductionWaived(month, year);

  let totalDeductions = 0;
  for (const rule of deductionRules) {
    // Lateness is handled below via the explicit 3-lates-=1-unpaid-day
    // rule, not a per-late-day rate — an active 'late_penalty' rule here
    // would double-deduct.
    if (rule.rule_type === 'late_penalty') continue;
    if (rule.rule_type === 'absent_penalty') {
      if (attendanceDeductionsWaived) continue;
      const value = Number(rule.value);
      const isPercentage = rule.percentage_or_fixed === 'percentage';
      totalDeductions += (isPercentage ? dailyRate * (value / 100) : value) * absentDays;
      continue;
    }

    const value = Number(rule.value);
    const isPercentage = rule.percentage_or_fixed === 'percentage';
    totalDeductions += isPercentage ? grossSalary * (value / 100) : value;
  }

  const { officeStartTime } = await getEffectiveShiftHours(employeeId);
  const lateDeductionBreakdown = attendanceDeductionsWaived
    ? []
    : buildLateDeductionBreakdown(lateAttendanceRows, officeStartTime, dailyRate);
  const lateDeductionDays = lateDeductionBreakdown.length;
  const lateDeductionAmount = round2(lateDeductionDays * dailyRate);
  totalDeductions += lateDeductionAmount;

  const netSalary = Math.max(0, grossSalary - totalDeductions);

  return {
    totalPresentDays: presentDays,
    totalAbsentDays: absentDays,
    totalLeaveDays: leaveDays,
    totalLateDays: lateDays,
    lateDeductionDays,
    lateDeductionAmount,
    lateDeductionBreakdown,
    grossSalary: round2(grossSalary),
    totalDeductions: round2(totalDeductions),
    netSalary: round2(netSalary),
  };
}

// Live view of the 3-lates rule before payroll is generated, so employees,
// the manager and the CEO can see this month's running deduction. Uses the
// exact payroll calculation so the preview always matches the real payslip.
// Returns null when the employee has no salary structure yet.
export async function getLateDeductionPreview(employeeId, month, year) {
  try {
    const calc = await calculatePayrollForEmployee(employeeId, month, year);
    return {
      lateDays: calc.totalLateDays,
      deductionDays: calc.lateDeductionDays,
      deductionAmount: calc.lateDeductionAmount,
      breakdown: calc.lateDeductionBreakdown,
    };
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 422) return null;
    throw err;
  }
}

export async function setSalaryStructure(employeeId, fields) {
  const employee = await findEmployeeDetailById(employeeId);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }
  return upsertSalaryStructure(employeeId, fields);
}

export async function getSalaryStructure(employeeId, requester) {
  assertCanAccessEmployee(requester, employeeId);

  const structure = await findSalaryStructureByEmployee(employeeId);
  if (!structure) {
    throw new ApiError(404, 'Salary structure has not been set up for this employee');
  }
  return structure;
}

export async function listDeductionRules() {
  return findAllDeductionRules();
}

export async function createDeductionRule(fields) {
  return insertDeductionRule(fields);
}

export async function updateDeductionRuleById(id, fields) {
  const existing = await findDeductionRuleById(id);
  if (!existing) {
    throw new ApiError(404, 'Deduction rule not found');
  }
  await updateDeductionRule(id, fields);
  return findDeductionRuleById(id);
}

export async function generatePayroll(employeeId, month, year) {
  const employee = await findEmployeeDetailById(employeeId);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  const existing = await findPayrollRecord(employeeId, month, year);
  if (existing && existing.status !== 'draft') {
    throw new ApiError(409, `Payroll for this period has already been ${existing.status}`);
  }

  const calculation = await calculatePayrollForEmployee(employeeId, month, year);

  const id = existing
    ? existing.id
    : await insertPayroll({ employeeId, month, year, ...calculation });

  if (existing) {
    await updatePayrollDraft(existing.id, calculation);
  }

  return findPayrollDetailById(id);
}

export async function generatePayrollBulk(month, year) {
  const employeeIds = await findActiveEmployeeIds();
  const generated = [];
  const skipped = [];

  for (const employeeId of employeeIds) {
    try {
      const payroll = await generatePayroll(employeeId, month, year);
      generated.push(payroll);
    } catch (err) {
      const reason = err instanceof ApiError ? err.message : 'Unexpected error';
      skipped.push({ employeeId, reason });
    }
  }

  return { generated, skipped };
}

export async function listPayroll(requester, { page, limit, offset, employeeId, month, year, status }) {
  const filterEmployeeId = requester.canViewAllPayroll ? employeeId : requester.id;
  const { rows, total } = await findPayrollPaginated({
    limit,
    offset,
    employeeId: filterEmployeeId,
    month,
    year,
    status,
  });
  return { items: rows, pagination: buildPaginationMeta(page, limit, total) };
}

export async function getPayrollById(id, requester) {
  const payroll = await findPayrollDetailById(id);
  if (!payroll) {
    throw new ApiError(404, 'Payroll record not found');
  }
  assertCanAccessEmployee(requester, payroll.employee_id);
  return payroll;
}

export async function finalizePayroll(id) {
  const payroll = await findPayrollDetailById(id);
  if (!payroll) {
    throw new ApiError(404, 'Payroll record not found');
  }
  if (payroll.status !== 'draft') {
    throw new ApiError(409, 'Only draft payroll can be finalized');
  }
  await updatePayrollStatus(id, 'finalized');
  return findPayrollDetailById(id);
}

export async function markPayrollPaid(id) {
  const payroll = await findPayrollDetailById(id);
  if (!payroll) {
    throw new ApiError(404, 'Payroll record not found');
  }
  if (payroll.status !== 'finalized') {
    throw new ApiError(409, 'Only finalized payroll can be marked as paid');
  }
  await updatePayrollStatus(id, 'paid');
  return findPayrollDetailById(id);
}
