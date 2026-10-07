// Pure day-classification rules shared by the year calendar, the dashboard
// attendance % and the leave/absence chart, so all three always agree.
// Every date here is a SHIFT date ("YYYY-MM-DD") — the 18:00 -> 03:00 shift
// that starts on the 7th is the 7th, including its after-midnight part.

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Day 0 of the next month is the last day of this one; Date.UTC handles
// February in leap years.
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toDateString(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// Sunday is the only weekly off: the shift that would START on Sunday.
export function isWeeklyOff(dateStr) {
  return dayOfWeek(dateStr) === 0;
}

export function* eachDate(from, to) {
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export function expandLeaveDates(leaves) {
  const dates = new Set();
  for (const leave of leaves) {
    for (const d of eachDate(leave.from_date, leave.to_date)) dates.add(d);
  }
  return dates;
}

const ATTENDED_STATUSES = new Set(['present', 'late', 'half_day']);

// Statuses that are not working days and never count toward attendance %:
//   not_joined, off (Sunday), holiday, upcoming (future), pending (today's
//   shift with no check-in yet — not absent until the shift is over).
export const NON_COUNTING_STATUSES = new Set(['not_joined', 'off', 'holiday', 'upcoming', 'pending']);

export function classifyDay({ date, record, isHoliday, onLeave, joinDate, currentShiftDate }) {
  if (joinDate && date < joinDate) return 'not_joined';
  if (isWeeklyOff(date)) return 'off';
  if (isHoliday) return 'holiday';
  if (record?.check_in_time) {
    return ATTENDED_STATUSES.has(record.status) ? record.status : 'present';
  }
  if (date > currentShiftDate) return 'upcoming';
  if (onLeave || record?.status === 'on_leave') return 'on_leave';
  if (date === currentShiftDate) return 'pending';
  return 'absent';
}

export function isAttended(status) {
  return ATTENDED_STATUSES.has(status);
}
