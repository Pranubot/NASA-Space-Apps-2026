// UTC formatting helpers. The app never shows local time: mission clocks are UTC.

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");

/** 2027-01-14 */
export function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/** 14 Jan 2027 */
export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** 14 Jan */
export function fmtDayMonth(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** 06:00 */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** 14 Jan 2027 06:00 UTC */
export const fmtDateTime = (ms: number) => `${fmtDate(ms)} ${fmtTime(ms)} UTC`;

export const monthName = (ms: number) => MONTHS[new Date(ms).getUTCMonth()];

/** Parse YYYY-MM-DD as UTC midnight. Returns null if invalid. */
export function parseIsoDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(ms) ? ms : null;
}

/** 4d 06h, 13h 20m, 45m. Hours in, compact duration out. */
export function fmtDuration(hours: number): string {
  if (!Number.isFinite(hours)) return "n/a";
  const totalMin = Math.max(0, Math.round(hours * 60));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${p2(h)}h`;
  if (h > 0) return `${h}h ${p2(m)}m`;
  return `${m}m`;
}

/** Mission elapsed time: T+3d 04h */
export function fmtElapsed(ms: number): string {
  const sign = ms < 0 ? "−" : "+";
  return `T${sign}${fmtDuration(Math.abs(ms) / HOUR)}`;
}

export const fmtDeg = (v: number, digits = 2) => `${v.toFixed(digits)}°`;

export function fmtLatLon(lat: number, lon: number, digits = 2): string {
  return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(digits)}°${lon < 0 ? "W" : "E"}`;
}

const CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const cardinal = (az: number) => CARDINALS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
