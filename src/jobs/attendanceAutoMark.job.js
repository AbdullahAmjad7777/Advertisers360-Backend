import cron from 'node-cron';
import { runAttendanceAutoMark } from '../services/attendance.service.js';

function buildCronExpression() {
  const time = process.env.ATTENDANCE_AUTO_MARK_TIME || '02:00';
  const [hour, minute] = time.split(':').map(Number);
  return `${minute} ${hour} * * *`;
}

export function scheduleAttendanceAutoMark() {
  const expression = buildCronExpression();

  // The cron trigger time itself stays fixed (node-cron needs a static
  // expression), tuned for the company-default shift ending. Employees on a
  // custom shift (see getEffectiveShiftHours) are handled correctly
  // regardless — runAttendanceAutoMark checks each one's own shift end time
  // and skips anyone whose shift hasn't actually concluded yet as of this
  // run, picking them up on a later run instead of marking them absent
  // mid-shift.
  cron.schedule(
    expression,
    async () => {
      try {
        const results = await runAttendanceAutoMark();
        console.log('[attendance-auto-mark] completed:', results);
      } catch (err) {
        console.error('[attendance-auto-mark] failed:', err);
      }
    },
    // node-cron decides *when* to fire using the host's local timezone by
    // default — on a host not set to Asia/Karachi, ATTENDANCE_AUTO_MARK_TIME
    // would fire at the wrong wall-clock moment even though the shift-date
    // math is already host-TZ-independent.
    { timezone: 'Asia/Karachi' },
  );

  console.log(`Attendance auto-mark job scheduled (cron: "${expression}")`);
}
