/**
 * Time-zone and calendar helpers. Zero dependencies: IANA rules come from the
 * runtime's Intl implementation, resolved per instant (DST-correct).
 *
 * Internally every instant is a number of epoch milliseconds (UTC). A civil
 * calendar date is a "day number": whole days since 1970-01-01.
 */

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** True when `tz` is an IANA zone name the runtime knows. Raw offsets ("+05:00") are rejected. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim() === '' || tz !== tz.trim()) return false;
  if (/^[+\-−]?\d/.test(tz)) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock fields of `ms` in `tz`. */
export function wallParts(tz: string, ms: number): WallParts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

const offsetCache = new Map<string, number>();

/** UTC offset of `tz` at instant `ms`, in minutes (e.g. -300 for EST). */
export function offsetMinutes(tz: string, ms: number): number {
  const key = tz + '|' + ms;
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  const p = wallParts(tz, ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const whole = ms - (((ms % 1000) + 1000) % 1000);
  const off = Math.round((asUtc - whole) / MINUTE);
  if (offsetCache.size > 200_000) offsetCache.clear();
  offsetCache.set(key, off);
  return off;
}

/** UTC offset in hours (fractional for :30/:45 zones). */
export function offsetHours(tz: string, ms: number): number {
  return offsetMinutes(tz, ms) / 60;
}

/** Civil date (day number) of instant `ms` in `tz`. */
export function localDayNumber(tz: string, ms: number): number {
  const p = wallParts(tz, ms);
  return Date.UTC(p.year, p.month - 1, p.day) / DAY;
}

/**
 * Convert a local wall-clock time to UTC: day number `dayNum` at `minutes` past
 * local midnight (may be negative or ≥ 1440; it rolls over). In a DST gap the
 * later valid instant is used (the wall time shifted forward by the gap); in an
 * overlap the first occurrence.
 */
export function localToUtc(tz: string, dayNum: number, minutes: number): number {
  const wall = dayNum * DAY + Math.round(minutes * MINUTE);
  const candidates = new Set<number>([
    offsetMinutes(tz, wall - DAY),
    offsetMinutes(tz, wall),
    offsetMinutes(tz, wall + DAY),
  ]);
  const valid: number[] = [];
  const all: number[] = [];
  for (const o of candidates) {
    const u = wall - o * MINUTE;
    all.push(u);
    if (offsetMinutes(tz, u) === o) valid.push(u);
  }
  if (valid.length > 0) return Math.min(...valid);
  return Math.max(...all);
}

/** "YYYY-MM-DD" for a day number. */
export function dayNumberToIso(dayNum: number): string {
  return new Date(dayNum * DAY).toISOString().slice(0, 10);
}

/** ISO-8601 UTC string without milliseconds when they are zero. */
export function toIso(ms: number): string {
  const s = new Date(ms).toISOString();
  return s.endsWith('.000Z') ? s.slice(0, -5) + 'Z' : s;
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parse an ISO-8601 instant with an explicit zone designator. Returns NaN if malformed. */
export function parseInstant(s: unknown): number {
  if (typeof s !== 'string' || !ISO_INSTANT.test(s)) return NaN;
  return Date.parse(s);
}

/** Parse "HH:mm" (24 h) into minutes past midnight, or NaN. */
export function parseHHmm(s: unknown): number {
  if (typeof s !== 'string') return NaN;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** "HH:mm" wall clock of `ms` in `tz`. */
export function formatHHmm(tz: string, ms: number): string {
  const p = wallParts(tz, ms);
  return String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0');
}

export function mod(x: number, m: number): number {
  return ((x % m) + m) % m;
}

export function roundToMinute(ms: number): number {
  return Math.round(ms / MINUTE) * MINUTE;
}
