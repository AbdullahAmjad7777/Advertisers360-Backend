// Pakistan Standard Time is a fixed UTC+5 offset with no DST, so it can be
// hardcoded rather than resolved from the environment. This matters because
// the Node process's own local timezone can't be trusted — it's whatever
// the host happens to be set to (PKT on a Pakistani dev machine, UTC on a
// typical cloud deployment), and `.env` (which sets TZ=Asia/Karachi
// locally) isn't deployed. Every "what's today/now in PKT" computation in
// the app should go through these helpers instead of Date's local
// getters/setters, so the answer is the same regardless of host timezone.
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

// A Date whose UTC getters/setters read/write as Pakistan wall-clock values
// for the real instant `date` represents. Deliberately not a "real" Date
// (its own local/UTC-instant meaning is meaningless) — only use the getUTC*/
// setUTCC* accessors on it, and convert back with fromPktShifted before
// treating it as an instant again (e.g. comparing to another Date).
export function toPktShifted(date = new Date()) {
  return new Date(date.getTime() + PKT_OFFSET_MS);
}

export function fromPktShifted(pktShifted) {
  return new Date(pktShifted.getTime() - PKT_OFFSET_MS);
}

export function pktDateString(date = new Date()) {
  const shifted = toPktShifted(date);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function pktYear(date = new Date()) {
  return toPktShifted(date).getUTCFullYear();
}

// Parses a datetime value that may come from either of two sources with
// different, incompatible string formats: the DB driver (mysql2 configured
// with dateStrings + timezone '+05:00', so it returns "YYYY-MM-DD HH:MM:SS"
// with no offset — that string IS a PKT wall-clock reading), or the frontend
// (a real ISO 8601 string with an explicit "Z"/offset — an unambiguous
// instant). `new Date(str)` handles the ISO case correctly everywhere, but
// for the space-separated DB format it falls back to the JS engine's
// *host-local* timezone, which is wrong on any host not explicitly set to
// PKT (e.g. production, which deliberately avoids depending on host TZ —
// see the file header comment). This picks the right interpretation either
// way so callers can safely mix values from both sources.
export function parseFlexibleDateTime(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'string' && !value.includes('T') && !value.endsWith('Z')) {
    const [datePart, timePart] = value.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = (timePart ?? '00:00:00').split(':').map(Number);
    return fromPktShifted(new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0)));
  }

  return new Date(value);
}

// e.g. "6:42 PM" — for human-readable strings (alerts, notifications) that
// need to show PKT wall-clock time regardless of the viewer/host timezone.
export function formatPktTime(date = new Date()) {
  const shifted = toPktShifted(date);
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  const hour24 = shifted.getUTCHours();
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}
