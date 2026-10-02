/**
 * Time-zone helpers built only on Intl (no runtime deps). All instants are
 * ISO-8601 UTC strings or epoch ms; all zones are IANA names.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
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
    fmtCache.set(tz, f);
  }
  return f;
}

/** True when `tz` is an IANA zone this runtime knows. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of instant `ms` in zone `tz`. */
export function zonedParts(ms: number, tz: string): ZonedParts {
  const f = partsFormatter(tz);
  let y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0;
  if (typeof f.formatToParts === 'function') {
    for (const p of f.formatToParts(ms)) {
      const v = Number(p.value);
      switch (p.type) {
        case 'year': y = v; break;
        case 'month': mo = v; break;
        case 'day': d = v; break;
        case 'hour': h = v; break;
        case 'minute': mi = v; break;
        case 'second': s = v; break;
      }
    }
  } else {
    // Fallback: "MM/DD/YYYY, HH:mm:ss"
    const m = /(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/.exec(f.format(ms));
    if (m) {
      mo = +m[1]!; d = +m[2]!; y = +m[3]!; h = +m[4]!; mi = +m[5]!; s = +m[6]!;
    }
  }
  if (h === 24) h = 0; // some engines emit 24 at midnight
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { year: y, month: mo, day: d, hour: h, minute: mi, second: s, weekday };
}

/** UTC offset of `tz` at instant `ms`, in minutes (east positive). */
export function offsetMinutes(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseDate(s: string): { y: number; m: number; d: number } | null {
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m: mo, d };
}

export function parseTime(s: string): { h: number; min: number } | null {
  const m = TIME_RE.exec(s.trim());
  if (!m) return null;
  return { h: +m[1]!, min: +m[2]! };
}

export type LocalToUtcResult =
  | { ok: true; ms: number; iso: string; note?: 'ambiguous' }
  | { ok: false; error: 'bad_date' | 'bad_time' | 'bad_zone' | 'nonexistent' };

/**
 * Convert a wall-clock date/time in zone `tz` to a UTC instant, resolving the
 * offset that actually applies at that instant (DST-aware).
 * - Times skipped by a spring-forward transition are rejected ("nonexistent").
 * - Times repeated by a fall-back transition resolve to the earlier instant.
 */
export function localToUtc(date: string, time: string, tz: string): LocalToUtcResult {
  const d = parseDate(date);
  if (!d) return { ok: false, error: 'bad_date' };
  const t = parseTime(time);
  if (!t) return { ok: false, error: 'bad_time' };
  if (!isValidTimeZone(tz)) return { ok: false, error: 'bad_zone' };

  const wall = Date.UTC(d.y, d.m - 1, d.d, t.h, t.min);
  // Candidate offsets: those in effect a day either side cover any transition.
  const offs = new Set<number>([
    offsetMinutes(wall - 36e5 * 24, tz),
    offsetMinutes(wall, tz),
    offsetMinutes(wall + 36e5 * 24, tz),
  ]);
  const matches: number[] = [];
  for (const off of offs) {
    const ms = wall - off * 60000;
    if (offsetMinutes(ms, tz) === off) matches.push(ms);
  }
  if (matches.length === 0) return { ok: false, error: 'nonexistent' };
  matches.sort((a, b) => a - b);
  const ms = matches[0]!;
  return {
    ok: true,
    ms,
    iso: toIsoUtc(ms),
    note: matches.length > 1 ? 'ambiguous' : undefined,
  };
}

/** ISO-8601 UTC without milliseconds, e.g. "2026-11-03T14:30:00Z". */
export function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "HH:mm" of instant in zone. */
export function formatTime(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DD" of instant in zone. */
export function formatDateKey(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue 4 Nov" for a "YYYY-MM-DD" calendar date. */
export function formatDateLabel(dateKey: string): string {
  const d = parseDate(dateKey);
  if (!d) return dateKey;
  const wd = new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d.d} ${MONTHS[d.m - 1]}`;
}

/** "Tue 4 Nov, 07:30" of instant in zone. */
export function formatDateTime(ms: number, tz: string): string {
  return `${formatDateLabel(formatDateKey(ms, tz))}, ${formatTime(ms, tz)}`;
}

/** "UTC+9", "UTC−3:30", "UTC" for the offset at instant `ms`. */
export function formatOffset(ms: number, tz: string): string {
  const off = offsetMinutes(ms, tz);
  if (off === 0) return 'UTC';
  const sign = off > 0 ? '+' : '−';
  const a = Math.abs(off);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ''}`;
}

const abbrCache = new Map<string, Intl.DateTimeFormat | null>();

/**
 * Short zone label at instant: a letter abbreviation when the runtime has a
 * real one ("JST", "EDT"), otherwise the numeric offset ("UTC+9").
 */
export function zoneAbbr(ms: number, tz: string): string {
  let f = abbrCache.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
    } catch {
      f = null;
    }
    abbrCache.set(tz, f);
  }
  if (f && typeof f.formatToParts === 'function') {
    try {
      const name = f.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value;
      if (name && /^[A-Z]{2,5}$/.test(name)) return name;
    } catch {
      // fall through
    }
  }
  return formatOffset(ms, tz);
}

/** Today's "YYYY-MM-DD" in zone, plus n days. */
export function dateKeyPlusDays(dateKey: string, n: number): string {
  const d = parseDate(dateKey);
  if (!d) return dateKey;
  const t = new Date(Date.UTC(d.y, d.m - 1, d.d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Device zone, falling back to UTC. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "7h 05m" */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '−' : '';
  const a = Math.abs(Math.round(minutes));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${pad(m)}m`;
}

/** Signed hours, e.g. "+9h", "−5.5h". */
export function formatSignedHours(h: number): string {
  const r = Math.round(h * 10) / 10;
  if (r === 0) return '0h';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)}h`;
}

/** Minutes since local midnight → "HH:mm" (wraps). */
export function minutesToHHmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function hhmmToMinutes(s: string): number | null {
  const t = parseTime(s);
  return t ? t.h * 60 + t.min : null;
}
