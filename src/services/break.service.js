import { ApiError } from '../utils/ApiError.js';
import { pktDateString, parseFlexibleDateTime } from '../utils/timezone.js';
import { addDaysToShiftDate } from '../utils/shift.js';
import { getCurrentStatus } from './attendance.service.js';
import { resolveEmployeeScope } from './visibility.service.js';
import {
  findOpenBreakByEmployee,
  findBreakById,
  insertBreakStart,
  endBreakNow,
  findBreaksForEmployees,
} from '../models/break.model.js';

// Breaks only exist inside a shift: the current shift's attendance row must
// be checked in and not yet checked out. The current shift is resolved by
// shift date, so a break at 01:00 lands on the shift that started the
// previous evening.
export async function startBreak(employeeId) {
  const attendance = await getCurrentStatus(employeeId);
  if (!attendance?.check_in_time) {
    throw new ApiError(400, 'You need to check in before starting a break');
  }
  if (attendance.check_out_time) {
    throw new ApiError(400, 'You have already checked out for this shift');
  }

  const open = await findOpenBreakByEmployee(employeeId);
  if (open) {
    throw new ApiError(409, 'You are already on a break');
  }

  try {
    const id = await insertBreakStart(employeeId, attendance.id, attendance.attendance_date);
    return findBreakById(id);
  } catch (err) {
    // Unique (employee_id, open_flag) — a concurrent double-click.
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'You are already on a break');
    throw err;
  }
}

export async function endBreak(employeeId) {
  const open = await findOpenBreakByEmployee(employeeId);
  if (!open) {
    throw new ApiError(400, 'You are not on a break');
  }
  await endBreakNow(open.id);
  return findBreakById(open.id);
}

export async function getActiveBreak(employeeId) {
  return findOpenBreakByEmployee(employeeId);
}

function secondsSince(start) {
  return Math.max(0, Math.round((Date.now() - parseFlexibleDateTime(start).getTime()) / 1000));
}

// Break history grouped per person per shift date, with each day's total.
// Defaults to the last 30 days.
export async function getBreakHistory(user, { employeeId, from, to }) {
  const people = await resolveEmployeeScope(user, employeeId);
  const rangeEnd = to ?? pktDateString();
  const rangeStart = from ?? addDaysToShiftDate(rangeEnd, -29);

  const rows = await findBreaksForEmployees(
    people.map((p) => p.id),
    rangeStart,
    rangeEnd,
  );
  const byId = new Map(people.map((p) => [p.id, p]));

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.employee_id}|${row.shift_date}`;
    if (!groups.has(key)) {
      const person = byId.get(row.employee_id);
      groups.set(key, {
        employeeId: row.employee_id,
        employeeCode: person?.employee_code ?? null,
        fullName: person?.full_name ?? null,
        role: person?.role_name ?? null,
        shiftDate: row.shift_date,
        totalSeconds: 0,
        breaks: [],
      });
    }
    const group = groups.get(key);
    // An open break counts up to "now" so today's running total is live.
    const seconds = row.duration_seconds ?? secondsSince(row.break_start);
    group.totalSeconds += seconds;
    group.breaks.push({
      id: row.id,
      breakStart: row.break_start,
      breakEnd: row.break_end,
      durationSeconds: seconds,
      isActive: row.break_end == null,
    });
  }

  return { from: rangeStart, to: rangeEnd, days: Array.from(groups.values()) };
}
