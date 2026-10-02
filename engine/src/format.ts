/** Small display helpers for the app. Deterministic: no locale-dependent output. */

import type { AdviceWindow, DayPlan } from './types';
import { dayNumberToIso, formatHHmm, localDayNumber, parseInstant } from './time';

export interface LocalWindowTimes {
  /** "HH:mm" (24 h) of startUtc in window.tz. */
  startLocal: string;
  /** "HH:mm" (24 h) of endUtc in window.tz. */
  endLocal: string;
  /**
   * Local calendar date "YYYY-MM-DD" of startUtc in window.tz. Day 0 can span more than one
   * local date (flight, date line), so show it when it differs from the day's own date.
   */
  localDate: string;
  /** Calendar days between the local start and end dates (0 = same day, 1 = ends next day). */
  endDayOffset: number;
}

/** Local wall-clock start/end of a window in the zone the traveller is in (window.tz). */
export function formatWindowLocal(window: AdviceWindow): LocalWindowTimes {
  const s = parseInstant(window.startUtc);
  const e = parseInstant(window.endUtc);
  return {
    startLocal: formatHHmm(window.tz, s),
    endLocal: formatHHmm(window.tz, e),
    localDate: dayNumberToIso(localDayNumber(window.tz, s)),
    endDayOffset: localDayNumber(window.tz, e) - localDayNumber(window.tz, s),
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Short heading for a day: "3 days before departure", "Day before departure",
 * "Travel day", "Day 1", ... followed by the local date, e.g. "Travel day · Tue 10 Nov".
 */
export function dayLabel(day: DayPlan): string {
  let head: string;
  if (day.dayIndex < -1) head = `${-day.dayIndex} days before departure`;
  else if (day.dayIndex === -1) head = 'Day before departure';
  else if (day.dayIndex === 0) head = 'Travel day';
  else head = `Day ${day.dayIndex}`;
  const [y, m, d] = day.date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${head} · ${WEEKDAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/**
 * Group a day's windows (sorted by start, as DayPlan.windows are) so that same-kind windows
 * that follow on without a gap form one group: e.g. avoid_light on the plane until landing
 * followed by avoid_light on the ground. The engine keeps such pieces separate only when their
 * wording differs (window shade vs sunglasses); the app can show each group as one row
 * (first start → last end) with each piece's rationale. Every other window is its own group.
 */
export function groupContiguousWindows(windows: readonly AdviceWindow[]): AdviceWindow[][] {
  const groups: AdviceWindow[][] = [];
  const openByKind = new Map<string, AdviceWindow[]>();
  for (const w of windows) {
    const g = w.startUtc !== w.endUtc ? openByKind.get(w.kind) : undefined;
    const last = g?.[g.length - 1];
    if (g && last && last.endUtc === w.startUtc) {
      g.push(w);
      continue;
    }
    const fresh = [w];
    groups.push(fresh);
    if (w.startUtc !== w.endUtc) openByKind.set(w.kind, fresh);
  }
  return groups;
}
