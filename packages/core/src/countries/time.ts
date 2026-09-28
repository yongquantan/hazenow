/** Wall-clock helpers for fixed-offset zones (no DST anywhere in SEA). Pure, no Intl. */

const pad = (n: number) => String(n).padStart(2, "0");

export function offsetLabel(hours: number): string {
  const sign = hours >= 0 ? "+" : "-";
  const a = Math.abs(hours);
  return `${sign}${pad(Math.floor(a))}:${pad(Math.round((a % 1) * 60))}`;
}

/** "2026-09-28 16:00[:00]" (local wall time) + offset → "2026-09-28T16:00:00+07:00". Null if unparseable. */
export function wallToIso(wall: string, offsetHours: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(wall.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${offsetLabel(offsetHours)}`;
}

/** Instant (ms) → local ISO with offset, seconds precision. */
export function msToIso(ms: number, offsetHours: number): string {
  const d = new Date(ms + offsetHours * 3600_000);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${offsetLabel(offsetHours)}`
  );
}

/** Local calendar date "YYYY-MM-DD" at an instant. */
export function localDate(ms: number, offsetHours: number): string {
  return msToIso(ms, offsetHours).slice(0, 10);
}

/** Local hour-of-day and minute at an instant. */
export function localClock(ms: number, offsetHours: number): { hour: number; minute: number } {
  const d = new Date(ms + offsetHours * 3600_000);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export const HOUR_MS = 3600_000;

/** Parse a number that may arrive as a string; sentinel/invalid values → null. */
export function num(v: unknown, sentinels: readonly number[] = [-1, -999, -9999]): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || sentinels.includes(n)) return null;
  return n;
}
