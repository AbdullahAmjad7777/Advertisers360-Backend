import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import {
  resolveShiftDate,
  resolveCheckInStatus,
  resolveCompletedShiftDate,
  hasShiftConcluded,
  addDaysToShiftDate,
} from '../utils/shift.js';
import { pktDateString, parseFlexibleDateTime } from '../utils/timezone.js';
import { getOfficeHours, getEffectiveShiftHours, getLateGraceMinutes } from './settings.service.js';
import { resolveEmployeeScope, getVisibleEmployees } from './visibility.service.js';
import { getLateDeductionPreview } from './payroll.service.js';
import { findPendingTasksDueBy } from '../models/task.model.js';
import { closeOpenBreaksForAttendance } from '../models/break.model.js';
import { findHolidaysInRange } from '../models/payroll.model.js';
import {
  classifyDay,
  daysInMonth,
  eachDate,
  expandLeaveDates,
  isAttended,
  isLeapYear,
  NON_COUNTING_STATUSES,
  toDateString,
} from '../utils/attendance-calendar.js';
import { sendMail } from '../utils/mailer.js';
import { autoAbsentEmail } from '../utils/emailTemplates.js';
import {
  findByEmployeeAndDate,
  insertCheckIn,
  updateCheckIn,
  recordCheckOut,
  findById,
  findTodayForAllActiveEmployees,
  findHistoryByEmployee,
  findDailyStatusCounts,
  findEmployeesMissingAttendance,
  isHoliday,
  markHolidayForMissingAttendance,
  markOnLeaveForMissingAttendance,
  markAbsentForMissingAttendance,
  updateAttendanceFields,
  insertAttendanceEditLog,
  findEditLogByAttendance,
  findActiveEmployeeShiftInfo,
  findLatestCheckedInBefore,
  findBlockingMissedCheckouts,
  findAttendanceForEmployeesInRange,
  findApprovedLeavesForEmployeesInRange,
} from '../models/attendance.model.js';

async function currentShiftDateFor(employeeId, now = new Date()) {
  const { officeStartTime, officeEndTime } = await getEffectiveShiftHours(employeeId);
  return resolveShiftDate(officeStartTime, officeEndTime, now);
}

// Not checking out of a shift blocks the next check-in until a manager/CEO
// closes that shift (closeMissedCheckout). Returns the blocking shift's row
// or null.
async function findMissedCheckout(employeeId, shiftDate) {
  const previous = await findLatestCheckedInBefore(employeeId, shiftDate);
  return previous && !previous.check_out_time ? previous : null;
}

function missedCheckoutError(missed) {
  return new ApiError(
    409,
    `You did not check out of your ${missed.attendance_date} shift, so you can't check in yet. ` +
      'Ask your manager or the CEO to close that shift, then try again.',
    'MISSED_CHECKOUT',
    { attendanceId: missed.id, attendanceDate: missed.attendance_date, checkInTime: missed.check_in_time },
  );
}

export async function getCheckInBlock(employeeId) {
  const shiftDate = await currentShiftDateFor(employeeId);
  const missed = await findMissedCheckout(employeeId, shiftDate);
  if (!missed) return { blocked: false };
  const err = missedCheckoutError(missed);
  return { blocked: true, message: err.message, ...err.details };
}

export async function checkIn(employeeId, ipAddress) {
  const { officeStartTime, officeEndTime } = await getEffectiveShiftHours(employeeId);
  const now = new Date();
  const shiftDate = resolveShiftDate(officeStartTime, officeEndTime, now);

  const missed = await findMissedCheckout(employeeId, shiftDate);
  if (missed) throw missedCheckoutError(missed);

  const graceMinutes = await getLateGraceMinutes();
  const status = resolveCheckInStatus(officeStartTime, graceMinutes, now, shiftDate);
  const existing = await findByEmployeeAndDate(employeeId, shiftDate);

  if (existing) {
    if (existing.check_in_time) {
      throw new ApiError(409, 'You have already checked in for this shift');
    }
    await updateCheckIn(existing.id, status, ipAddress);
    return findById(existing.id);
  }

  const insertId = await insertCheckIn(employeeId, shiftDate, status, ipAddress);
  return findById(insertId);
}

export async function checkOut(employeeId) {
  const { officeStartTime, officeEndTime } = await getEffectiveShiftHours(employeeId);
  const shiftDate = resolveShiftDate(officeStartTime, officeEndTime, new Date());
  const existing = await findByEmployeeAndDate(employeeId, shiftDate);

  if (!existing || !existing.check_in_time) {
    throw new ApiError(400, 'You must check in before checking out');
  }
  if (existing.check_out_time) {
    throw new ApiError(409, 'You have already checked out for this shift');
  }

  // Every task due on or before this shift must be ticked off first.
  const pendingTasks = await findPendingTasksDueBy(employeeId, shiftDate);
  if (pendingTasks.length > 0) {
    throw new ApiError(
      409,
      `You can't check out yet: ${pendingTasks.length} task${pendingTasks.length === 1 ? ' is' : 's are'} still pending.`,
      'TASKS_PENDING',
      { pendingTasks },
    );
  }

  await closeOpenBreaksForAttendance(existing.id);
  await recordCheckOut(existing.id);
  return findById(existing.id);
}

// The record for whichever shift is currently open/most recent, resolved by
// shift date rather than calendar date — an overnight shift checked into at
// 6pm is still "current" at 1am the next calendar day. This is what the
// dashboard's check-in/check-out button should always read from instead of
// querying attendance history by today's plain calendar date, which stops
// matching the moment midnight passes mid-shift.
export async function getCurrentStatus(employeeId) {
  const { officeStartTime, officeEndTime } = await getEffectiveShiftHours(employeeId);
  const shiftDate = resolveShiftDate(officeStartTime, officeEndTime, new Date());
  const record = await findByEmployeeAndDate(employeeId, shiftDate);
  return record ?? null;
}

export async function getToday({ page, limit, offset }) {
  const { officeStartTime, officeEndTime } = await getOfficeHours();
  const shiftDate = resolveShiftDate(officeStartTime, officeEndTime, new Date());
  const { rows, total } = await findTodayForAllActiveEmployees({ limit, offset, date: shiftDate });
  return { items: rows, pagination: buildPaginationMeta(page, limit, total) };
}

// employeeIds narrows this to a specific subset of active employees — see
// runAttendanceAutoMark, which calls this once for the (majority)
// company-default-shift group and once per custom-shift employee, since
// each of those can have a different completed shift date.
export async function autoMarkAttendanceForDate(date, employeeIds) {
  // Sunday is the fixed weekly off (see payroll.service.js's identical
  // working-day rule) and isn't necessarily in the `holidays` table, so it
  // needs its own check — otherwise everyone would get wrongly marked
  // absent and emailed every Sunday.
  const isWeeklyOff = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
  const holiday = isWeeklyOff || (await isHoliday(date));
  if (holiday) {
    const marked = await markHolidayForMissingAttendance(date, employeeIds);
    return { date, holiday: true, holidayMarked: marked, onLeaveMarked: 0, absentMarked: 0 };
  }

  const onLeaveMarked = await markOnLeaveForMissingAttendance(date, employeeIds);

  // Captured before the insert so it's exactly the set about to be marked
  // absent (on-leave employees already got their row above and are
  // excluded here) — used both for the insert and to know who to email.
  const aboutToBeAbsent = await findEmployeesMissingAttendance(date, employeeIds);
  const absentMarked = await markAbsentForMissingAttendance(date, employeeIds);

  await Promise.all(
    aboutToBeAbsent.map((employee) => {
      const { subject, text, html } = autoAbsentEmail(employee.full_name);
      return sendMail({ to: employee.email, subject, text, html });
    }),
  );

  return { date, holiday: false, holidayMarked: 0, onLeaveMarked, absentMarked };
}

// Splits active employees into "using the company default shift" (the
// common case — one bulk pass, exactly as before) and "custom shift" (each
// checked individually, since a 7am-3pm employee's shift can conclude many
// hours apart from the company default's). A custom-shift employee is only
// acted on once hasShiftConcluded confirms their shift has actually ended
// as of `now` — otherwise they're silently skipped this run and picked up
// on a later run once their shift really is over, rather than being marked
// absent mid-shift just because the job happened to fire early for them.
export async function runAttendanceAutoMark(now = new Date()) {
  const company = await getOfficeHours();
  const employees = await findActiveEmployeeShiftInfo();

  const defaultShiftEmployeeIds = [];
  const customShiftTasks = new Map(); // shiftDate -> employeeIds[]

  for (const emp of employees) {
    if (!emp.shift_start_time || !emp.shift_end_time) {
      defaultShiftEmployeeIds.push(emp.id);
      continue;
    }

    const hours = { officeStartTime: emp.shift_start_time, officeEndTime: emp.shift_end_time };
    // Which shift date "now" belongs to depends on shift type: for an
    // overnight shift, resolveShiftDate already rolls back to yesterday
    // while still inside the early-morning tail of it, so the *previous*
    // bucket is the one that just concluded. For a same-day shift it always
    // returns today regardless of whether the shift has actually ended yet
    // that day, so today's own bucket needs checking too — not just
    // yesterday's. Checking both is safe either way: hasShiftConcluded
    // skips whichever hasn't ended, and the underlying queries are
    // idempotent no-ops for any date already handled by an earlier run.
    const currentBucket = resolveShiftDate(hours.officeStartTime, hours.officeEndTime, now);
    const candidates = [addDaysToShiftDate(currentBucket, -1), currentBucket];

    for (const candidateDate of candidates) {
      if (hasShiftConcluded(hours.officeStartTime, hours.officeEndTime, candidateDate, now)) {
        const ids = customShiftTasks.get(candidateDate) ?? [];
        ids.push(emp.id);
        customShiftTasks.set(candidateDate, ids);
      }
    }
  }

  const results = [];

  if (defaultShiftEmployeeIds.length > 0) {
    const companyDate = resolveCompletedShiftDate(company.officeStartTime, company.officeEndTime, now);
    results.push(await autoMarkAttendanceForDate(companyDate, defaultShiftEmployeeIds));
  }

  for (const [shiftDate, employeeIds] of customShiftTasks) {
    results.push(await autoMarkAttendanceForDate(shiftDate, employeeIds));
  }

  return results;
}

// Powers the dashboard attendance-trend chart. Full-access roles (ceo/manager)
// see the company-wide trend by default, or a single employee's if they pass
// employeeId; everyone else is locked to their own regardless of what they pass.
export async function getTrend(requester, { days, employeeId }) {
  const numDays = Math.min(Math.max(Number(days) || 14, 1), 90);
  const targetEmployeeId = requester.canViewAllAttendance ? (employeeId ?? null) : requester.id;

  const today = new Date();
  const start = new Date(today.getTime() - (numDays - 1) * 86400000);

  const rangeStart = pktDateString(start);
  const rangeEnd = pktDateString(today);

  const rows = await findDailyStatusCounts(rangeStart, rangeEnd, targetEmployeeId);

  const byDate = new Map();
  for (let i = 0; i < numDays; i += 1) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = pktDateString(d);
    byDate.set(key, { date: key, present: 0, late: 0, absent: 0, onLeave: 0, halfDay: 0, holiday: 0 });
  }

  const STATUS_FIELD = {
    present: 'present',
    late: 'late',
    absent: 'absent',
    on_leave: 'onLeave',
    half_day: 'halfDay',
    holiday: 'holiday',
  };

  for (const row of rows) {
    const entry = byDate.get(row.attendance_date);
    const field = STATUS_FIELD[row.status];
    if (entry && field) {
      entry[field] += row.count;
    }
  }

  return Array.from(byDate.values());
}

export async function getEmployeeHistory(employeeId, requester, { page, limit, offset, from, to }) {
  const isSelf = requester.id === employeeId;
  if (!requester.canViewAllAttendance && !isSelf) {
    throw new ApiError(403, 'You do not have permission to view this attendance history');
  }

  const { rows, total } = await findHistoryByEmployee(employeeId, { limit, offset, from, to });
  return { items: rows, pagination: buildPaginationMeta(page, limit, total) };
}

function computeHours(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) return null;
  const minutes = (parseFlexibleDateTime(checkOutTime) - parseFlexibleDateTime(checkInTime)) / 60000;
  return minutes >= 0 ? Math.round((minutes / 60) * 100) / 100 : null;
}

// Manager/CEO correction — e.g. an employee accidentally checked out
// mid-shift and needs it undone (pass checkOutTime: null), or a check-in/out
// time is simply wrong. Every change is written to attendance_edit_log with
// the full before/after so there's a transparent record of who changed what.
export async function correctAttendance(attendanceId, editorId, { checkInTime, checkOutTime, status, reason }) {
  const existing = await findById(attendanceId);
  if (!existing) {
    throw new ApiError(404, 'Attendance record not found');
  }

  const nextCheckInTime = checkInTime !== undefined ? checkInTime : existing.check_in_time;
  const nextCheckOutTime = checkOutTime !== undefined ? checkOutTime : existing.check_out_time;
  const nextStatus = status ?? existing.status;
  const nextTotalHours = computeHours(nextCheckInTime, nextCheckOutTime);

  await updateAttendanceFields(attendanceId, {
    checkInTime: nextCheckInTime,
    checkOutTime: nextCheckOutTime,
    status: nextStatus,
    totalHours: nextTotalHours,
  });

  // A break can't outlive the shift it belongs to.
  if (nextCheckOutTime) {
    await closeOpenBreaksForAttendance(attendanceId, parseFlexibleDateTime(nextCheckOutTime));
  } else if (!nextCheckInTime) {
    await closeOpenBreaksForAttendance(attendanceId);
  }

  await insertAttendanceEditLog({
    attendanceId,
    editedBy: editorId,
    oldCheckInTime: existing.check_in_time,
    oldCheckOutTime: existing.check_out_time,
    oldStatus: existing.status,
    newCheckInTime: nextCheckInTime,
    newCheckOutTime: nextCheckOutTime,
    newStatus: nextStatus,
    reason: reason ?? null,
  });

  return findById(attendanceId);
}

export async function getAttendanceEditLog(attendanceId) {
  const existing = await findById(attendanceId);
  if (!existing) {
    throw new ApiError(404, 'Attendance record not found');
  }
  return findEditLogByAttendance(attendanceId);
}

// People (within the requester's scope, never themselves) currently blocked
// from checking in by a missed check-out.
export async function listMissedCheckouts(user) {
  const people = (await getVisibleEmployees(user)).filter((p) => p.id !== user.id);
  const shiftDate = await currentShiftDateFor(null);
  return findBlockingMissedCheckouts(
    people.map((p) => p.id),
    shiftDate,
  );
}

// Manager/CEO unblock: closes the missed shift with the real check-out time
// and a reason, recorded in attendance_edit_log via correctAttendance. The
// manager can unblock employees; only the CEO can unblock the manager
// (enforced by resolveEmployeeScope). Nobody can unblock themselves.
export async function closeMissedCheckout(user, attendanceId, { checkOutTime, reason }) {
  const record = await findById(attendanceId);
  if (!record) throw new ApiError(404, 'Attendance record not found');
  if (record.employee_id === user.id) {
    throw new ApiError(403, 'You cannot close your own missed check-out');
  }
  await resolveEmployeeScope(user, record.employee_id);

  if (!record.check_in_time || record.check_out_time) {
    throw new ApiError(422, 'This shift does not have a missing check-out');
  }
  const shiftDate = await currentShiftDateFor(record.employee_id);
  if (record.attendance_date >= shiftDate) {
    throw new ApiError(422, 'This shift is still in progress; it can only be closed after it ends');
  }

  const checkOut = parseFlexibleDateTime(checkOutTime);
  if (!checkOut || Number.isNaN(checkOut.getTime())) {
    throw new ApiError(422, 'checkOutTime must be a valid date and time');
  }
  if (checkOut <= parseFlexibleDateTime(record.check_in_time) || checkOut > new Date()) {
    throw new ApiError(422, 'Check-out time must be after the check-in time and not in the future');
  }

  return correctAttendance(attendanceId, user.id, {
    checkOutTime: checkOut.toISOString(),
    reason: `Missed check-out closed: ${reason}`.slice(0, 255),
  });
}

// Day-by-day status for a set of people over [from, to], using the shared
// classification rules. Returns Map(employeeId -> [{ date, status, record }]).
async function buildDays(people, from, to) {
  const ids = people.map((p) => p.id);
  const [records, leaves, holidays] = await Promise.all([
    findAttendanceForEmployeesInRange(ids, from, to),
    findApprovedLeavesForEmployeesInRange(ids, from, to),
    findHolidaysInRange(from, to),
  ]);
  const holidaySet = new Set(holidays);

  const recordsByPerson = new Map();
  for (const r of records) {
    if (!recordsByPerson.has(r.employee_id)) recordsByPerson.set(r.employee_id, new Map());
    recordsByPerson.get(r.employee_id).set(r.attendance_date, r);
  }
  const leavesByPerson = new Map();
  for (const l of leaves) {
    if (!leavesByPerson.has(l.employee_id)) leavesByPerson.set(l.employee_id, []);
    leavesByPerson.get(l.employee_id).push(l);
  }

  const result = new Map();
  for (const person of people) {
    const currentShiftDate = await currentShiftDateFor(person.id);
    const personRecords = recordsByPerson.get(person.id) ?? new Map();
    const leaveDates = expandLeaveDates(leavesByPerson.get(person.id) ?? []);
    const days = [];
    for (const date of eachDate(from, to)) {
      const record = personRecords.get(date) ?? null;
      days.push({
        date,
        record,
        status: classifyDay({
          date,
          record,
          isHoliday: holidaySet.has(date),
          onLeave: leaveDates.has(date),
          joinDate: person.join_date,
          currentShiftDate,
        }),
      });
    }
    result.set(person.id, days);
  }
  return result;
}

function summarize(days) {
  let workingDays = 0;
  let attendedDays = 0;
  let lateDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  for (const { status } of days) {
    if (NON_COUNTING_STATUSES.has(status)) continue;
    workingDays += 1;
    if (isAttended(status)) attendedDays += 1;
    if (status === 'late') lateDays += 1;
    if (status === 'absent') absentDays += 1;
    if (status === 'on_leave') leaveDays += 1;
  }
  return {
    workingDays,
    attendedDays,
    lateDays,
    absentDays,
    leaveDays,
    attendancePercentage: workingDays > 0 ? Math.round((attendedDays / workingDays) * 1000) / 10 : null,
  };
}

export async function getYearCalendar(user, { employeeId, year }) {
  const [person] = await resolveEmployeeScope(user, employeeId ?? user.id);
  const days = (await buildDays([person], `${year}-01-01`, `${year}-12-31`)).get(person.id);

  const months = [];
  let cursor = 0;
  for (let month = 1; month <= 12; month += 1) {
    const count = daysInMonth(year, month);
    months.push({
      month,
      daysInMonth: count,
      days: days.slice(cursor, cursor + count).map(({ date, status, record }) => ({
        date,
        status,
        checkInTime: record?.check_in_time ?? null,
        checkOutTime: record?.check_out_time ?? null,
        totalHours: record?.total_hours ?? null,
      })),
    });
    cursor += count;
  }

  return {
    employee: { id: person.id, fullName: person.full_name, employeeCode: person.employee_code },
    year,
    isLeapYear: isLeapYear(year),
    months,
    summary: summarize(days),
  };
}

// Per-person attendance %, leaves and absences for the year so far. Powers
// the dashboard donut and bar charts. Scope comes from visibility.service.
export async function getAttendanceStats(user, { year }) {
  const people = await getVisibleEmployees(user);
  const daysByPerson = await buildDays(people, `${year}-01-01`, `${year}-12-31`);
  return people.map((p) => ({
    employeeId: p.id,
    employeeCode: p.employee_code,
    fullName: p.full_name,
    role: p.role_name,
    ...summarize(daysByPerson.get(p.id)),
  }));
}

// This month's late check-ins and the resulting "3 lates = 1 day" deduction
// per person, before payroll is generated.
export async function getLateSummary(user, { month, year }) {
  const people = await getVisibleEmployees(user);
  const from = toDateString(year, month, 1);
  const to = toDateString(year, month, daysInMonth(year, month));
  const daysByPerson = await buildDays(people, from, to);

  return Promise.all(
    people.map(async (p) => {
      const lateDates = daysByPerson
        .get(p.id)
        .filter((d) => d.status === 'late')
        .map((d) => ({ date: d.date, checkInTime: d.record?.check_in_time ?? null }));
      const preview = await getLateDeductionPreview(p.id, month, year);
      return {
        employeeId: p.id,
        employeeCode: p.employee_code,
        fullName: p.full_name,
        role: p.role_name,
        lateCount: lateDates.length,
        lateDates,
        deductionDays: preview ? preview.deductionDays : Math.floor(lateDates.length / 3),
        // null when there's no salary structure to price the day against.
        deductionAmount: preview ? preview.deductionAmount : null,
        breakdown: preview?.breakdown ?? [],
      };
    }),
  );
}
