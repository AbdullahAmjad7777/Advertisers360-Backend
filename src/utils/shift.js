import { toPktShifted, fromPktShifted, pktDateString } from './timezone.js';

function parseTime(value) {
  const [h, m, s] = value.split(':').map(Number);
  return { h, m, s: s || 0 };
}

// Office start/end time are an editable DB setting (see settings.service.js),
// not a build-time constant, so every function here takes them as
// parameters — callers fetch the current values once (via the cached
// settings service) and thread them through, rather than each helper
// re-reading env vars that no longer own this configuration.
export function isOvernightShift(officeStartTime, officeEndTime) {
  const start = parseTime(officeStartTime);
  const end = parseTime(officeEndTime);
  return end.h * 60 + end.m <= start.h * 60 + start.m;
}

// The shift a check-in/check-out belongs to, as of this exact moment.
// For an overnight shift, times before officeEndTime (e.g. 00:30) still
// belong to the shift that started the previous evening. All computed in
// PKT wall-clock terms (see timezone.js) regardless of host process TZ.
export function resolveShiftDate(officeStartTime, officeEndTime, now = new Date()) {
  if (!isOvernightShift(officeStartTime, officeEndTime)) {
    return pktDateString(now);
  }

  const end = parseTime(officeEndTime);
  const nowPkt = toPktShifted(now);
  const endBoundaryTodayPkt = new Date(nowPkt);
  endBoundaryTodayPkt.setUTCHours(end.h, end.m, end.s, 0);

  if (nowPkt < endBoundaryTodayPkt) {
    const yesterdayPkt = new Date(nowPkt);
    yesterdayPkt.setUTCDate(yesterdayPkt.getUTCDate() - 1);
    return pktDateString(fromPktShifted(yesterdayPkt));
  }
  return pktDateString(now);
}

// shiftDate must be the value resolveShiftDate() returned for this same
// `now` — callers always compute that first to know which attendance row
// to write to, so it's passed in rather than re-derived here.
export function resolveCheckInStatus(officeStartTime, graceMinutes, now, shiftDate) {
  const start = parseTime(officeStartTime);
  const [year, month, day] = shiftDate.split('-').map(Number);

  // Built in "PKT-shifted" space (Date.UTC so the numbers mean PKT wall
  // time), then converted back to a real instant to compare against `now`.
  const cutoffPktShifted = new Date(
    Date.UTC(year, month - 1, day, start.h, start.m + (Number(graceMinutes) || 0), start.s, 0),
  );
  const cutoff = fromPktShifted(cutoffPktShifted);

  return now > cutoff ? 'late' : 'present';
}

// Plain calendar-day arithmetic on a "YYYY-MM-DD" shift-date string — no PKT
// shifting needed here since it's just adding whole days to a date, not
// resolving a wall-clock instant.
export function addDaysToShiftDate(shiftDate, days) {
  const [year, month, day] = shiftDate.split('-').map(Number);
  return pktDateString(fromPktShifted(new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0))));
}

// Has the shift that started on `shiftDate` actually finished as of `now`?
// Needed because different employees can have very different shift windows
// (see getEffectiveShiftHours) — the daily auto-absent job fires once at a
// fixed company-tuned time, which is well after the *default* shift ends but
// could easily be well *before* a custom shift (e.g. a 7am-3pm day shift)
// has even started that same calendar day. Marking someone absent for a
// shift that hasn't ended yet would be wrong, so the job checks this per
// employee instead of assuming everyone's shift ends around the same time.
export function hasShiftConcluded(officeStartTime, officeEndTime, shiftDate, now = new Date()) {
  const end = parseTime(officeEndTime);
  const [year, month, day] = shiftDate.split('-').map(Number);
  // Date.UTC normalizes an out-of-range day (e.g. 32) into the correct next
  // month/year, so this is safe across month/year boundaries.
  const endDay = isOvernightShift(officeStartTime, officeEndTime) ? day + 1 : day;
  const endBoundaryPktShifted = new Date(Date.UTC(year, month - 1, endDay, end.h, end.m, end.s, 0));
  return now >= fromPktShifted(endBoundaryPktShifted);
}

// The shift date that has fully concluded as of "now" — used by the
// end-of-shift job, which always runs after the shift's end boundary.
// This is distinct from resolveShiftDate: at 2am, a *new* check-in belongs
// to tonight's upcoming shift, but the shift that just finished is yesterday's.
export function resolveCompletedShiftDate(officeStartTime, officeEndTime, now = new Date()) {
  if (!isOvernightShift(officeStartTime, officeEndTime)) {
    return pktDateString(now);
  }
  const yesterdayPkt = new Date(toPktShifted(now));
  yesterdayPkt.setUTCDate(yesterdayPkt.getUTCDate() - 1);
  return pktDateString(fromPktShifted(yesterdayPkt));
}
