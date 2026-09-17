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
import { getOfficeHours, getEffectiveShiftHours } from './settings.service.js';
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
} from '../models/attendance.model.js';

export async function checkIn(employeeId, ipAddress) {
  const { officeStartTime, officeEndTime } = await getEffectiveShiftHours(employeeId);
  const now = new Date();
  const shiftDate = resolveShiftDate(officeStartTime, officeEndTime, now);
  const status = resolveCheckInStatus(officeStartTime, process.env.LATE_GRACE_MINUTES, now, shiftDate);
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
