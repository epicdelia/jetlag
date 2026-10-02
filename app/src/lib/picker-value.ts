import { parseDate, parseTime } from './tz';

/**
 * Bridge between the form's wall-clock strings and the native date/time pickers.
 *
 * The form stores what the ticket says: "YYYY-MM-DD" + "HH:mm" in the airport's own zone, and
 * `localToUtc` turns that into an instant later. The pickers are therefore only used to edit a
 * wall-clock value, never an instant: we hand them a Date whose *UTC* fields equal the wall clock
 * and pin the picker to `timeZoneName="UTC"`, so the device's own zone (and its DST gaps) never
 * leaks into what the user picks.
 */
export const PICKER_TZ = 'UTC';

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock strings → picker Date (UTC fields = wall clock). Missing parts fall back to `fallback`. */
export function wallToPickerDate(date: string, time: string, fallback: { date: string; time: string }): Date {
  const d = parseDate(date) ?? parseDate(fallback.date) ?? { y: 2026, m: 1, d: 1 };
  const t = parseTime(time) ?? parseTime(fallback.time) ?? { h: 12, min: 0 };
  return new Date(Date.UTC(d.y, d.m - 1, d.d, t.h, t.min));
}

export function pickerDateToDateKey(v: Date): string {
  return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
}

export function pickerDateToHHmm(v: Date): string {
  return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
}
