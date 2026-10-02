import { PARAMS, type FlightLeg, type Preferences, type SleepProfile, type TripInput } from '@jetlag/engine';

import { CITIES, labelForZone } from './cities';
import type { LegDraft, Profile } from './types';
import { dateKeyPlusDays, deviceTimeZone, formatDateKey, formatDuration, hhmmToMinutes, localToUtc } from './tz';

export type LegErrors = Partial<Record<'from' | 'to' | 'depart' | 'arrive' | 'leg', string>>;

export interface FormResult {
  input: TripInput | null;
  legErrors: LegErrors[];
  stayError: string | null;
  /** Per-leg flight duration in minutes when both ends parse. */
  durations: (number | null)[];
  notes: string[];
}

const MAX_LEG_MINUTES = 22 * 60; // longest scheduled non-stop is ~19h

const ERR: Record<string, string> = {
  bad_date: 'Use the format YYYY-MM-DD.',
  bad_time: 'Use 24-hour time, HH:mm.',
  bad_zone: 'Choose a city first.',
  nonexistent: "This local time doesn't exist (clocks spring forward then). Check the time.",
};

export function emptyLeg(prev?: LegDraft): LegDraft {
  if (prev) {
    return {
      fromTz: prev.toTz,
      fromLabel: prev.toLabel,
      toTz: '',
      toLabel: '',
      departDate: prev.arriveDate,
      departTime: '',
      arriveDate: prev.arriveDate,
      arriveTime: '',
    };
  }
  const home = deviceTimeZone();
  const city = CITIES.find((c) => c.tz === home);
  const tomorrow = dateKeyPlusDays(formatDateKey(Date.now(), home), 1);
  return {
    fromTz: home === 'UTC' ? '' : home,
    fromLabel: home === 'UTC' ? '' : city ? `${city.name} (${city.code})` : labelForZone(home),
    toTz: '',
    toLabel: '',
    departDate: tomorrow,
    departTime: '18:00',
    arriveDate: dateKeyPlusDays(tomorrow, 1),
    arriveTime: '08:00',
  };
}

/** Sleep length the engine accepts, hours (same source as the engine's own validation). */
export const SLEEP_RANGE_H = PARAMS.SLEEP_DURATION_RANGE;

/** Why the engine would reject this sleep profile, in plain words, or null when it is usable. */
export function sleepProfileError(sleep: SleepProfile): string | null {
  const bed = hhmmToMinutes(sleep.usualBedtime);
  const wake = hhmmToMinutes(sleep.usualWake);
  if (bed == null || wake == null) return 'Set both a bedtime and a wake time.';
  const h = ((wake - bed + 1440) % 1440) / 60;
  const [lo, hi] = SLEEP_RANGE_H;
  if (h < lo || h > hi) {
    return `The planner needs a usual night of ${lo} to ${hi} hours; this is ${formatDuration(h * 60)}. Adjust bedtime or wake time.`;
  }
  return null;
}

/**
 * Whole local days (at the origin) between today and the departure date, not counting either.
 * Pre-flight plan days must not be in the past: the engine has no idea what "now" is.
 */
export function availablePreDays(departUtc: string, originTz: string, now: number): number {
  const dep = Date.parse(`${formatDateKey(Date.parse(departUtc), originTz)}T00:00:00Z`);
  const today = Date.parse(`${formatDateKey(now, originTz)}T00:00:00Z`);
  return Math.max(0, Math.round((dep - today) / 864e5) - 1);
}

/** Profile preferences limited to the pre-flight days still ahead of `now`. */
export function prefsForNow(prefs: Preferences, legs: FlightLeg[], now: number): Preferences {
  const first = legs[0];
  if (!prefs.preAdapt || !first) return prefs;
  const want = prefs.maxPreDays ?? PARAMS.MAX_PRE_DAYS;
  const max = Math.min(want, availablePreDays(first.departUtc, first.from.tz, now));
  if (max <= 0) return { ...prefs, preAdapt: false, maxPreDays: 0 };
  return max === want ? prefs : { ...prefs, maxPreDays: max };
}

export function validateTrip(legs: LegDraft[], stayText: string, profile: Profile, now = Date.now()): FormResult {
  const legErrors: LegErrors[] = legs.map(() => ({}));
  const durations: (number | null)[] = legs.map(() => null);
  const notes: string[] = [];
  const out: FlightLeg[] = [];

  legs.forEach((l, i) => {
    const e = legErrors[i]!;
    if (!l.fromTz) e.from = 'Choose where this flight leaves from.';
    if (!l.toTz) e.to = 'Choose where this flight lands.';
    const dep = l.fromTz ? localToUtc(l.departDate, l.departTime, l.fromTz) : null;
    const arr = l.toTz ? localToUtc(l.arriveDate, l.arriveTime, l.toTz) : null;
    if (dep && !dep.ok) e.depart = ERR[dep.error];
    if (arr && !arr.ok) e.arrive = ERR[arr.error];
    if (dep?.ok && dep.note === 'ambiguous') notes.push(`Leg ${i + 1}: departure falls in a repeated hour (clocks go back); using the first occurrence.`);
    if (arr?.ok && arr.note === 'ambiguous') notes.push(`Leg ${i + 1}: arrival falls in a repeated hour (clocks go back); using the first occurrence.`);
    if (dep?.ok && arr?.ok) {
      const mins = (arr.ms - dep.ms) / 60000;
      durations[i] = mins;
      if (mins <= 0) {
        e.arrive = `Arrival is ${formatDuration(-mins)} before departure once time zones are applied. Check the dates.`;
      } else if (mins > MAX_LEG_MINUTES) {
        e.arrive = `That's a ${formatDuration(mins)} flight. Check the dates, or split it into legs.`;
      } else {
        out.push({
          from: { tz: l.fromTz, label: l.fromLabel || undefined },
          to: { tz: l.toTz, label: l.toLabel || undefined },
          departUtc: dep.iso,
          arriveUtc: arr.iso,
        });
      }
    }
    if (i > 0) {
      const prev = legs[i - 1]!;
      if (prev.toTz && l.fromTz && prev.toTz !== l.fromTz) {
        e.leg = `Leg ${i + 1} should leave from where leg ${i} landed (${prev.toLabel || prev.toTz}).`;
      }
      const prevOut = out[out.length - 2];
      const cur = out[out.length - 1];
      if (prevOut && cur && out.length === i + 1 && Date.parse(cur.departUtc) < Date.parse(prevOut.arriveUtc)) {
        e.depart = `Departs before leg ${i} lands. Legs must be in order.`;
      }
    }
  });

  let stayError: string | null = null;
  let stayDays: number | undefined;
  const st = stayText.trim();
  if (st) {
    const n = Number(st);
    if (!Number.isFinite(n) || n <= 0 || n > 365) stayError = 'Enter a number of days between 1 and 365, or leave blank.';
    else stayDays = n;
  }

  const ok = out.length === legs.length && legErrors.every((e) => Object.keys(e).length === 0) && !stayError;
  const prefs = ok ? prefsForNow(profile.prefs, out, now) : profile.prefs;
  if (ok && profile.prefs.preAdapt) {
    const want = profile.prefs.maxPreDays ?? PARAMS.MAX_PRE_DAYS;
    const got = prefs.preAdapt ? (prefs.maxPreDays ?? want) : 0;
    if (got < want) {
      notes.push(
        got === 0
          ? 'Departure is too soon to start adjusting at home, so the plan starts on travel day.'
          : `Departure is soon, so the plan adjusts ${got} day${got === 1 ? '' : 's'} before you fly instead of ${want}.`,
      );
    }
  }
  return {
    input: ok
      ? {
          legs: out,
          sleep: { ...profile.sleep },
          prefs: { ...prefs },
          ...(stayDays !== undefined ? { stayDays } : {}),
        }
      : null,
    legErrors,
    stayError,
    durations,
    notes,
  };
}

export function defaultTripName(legs: LegDraft[]): string {
  const first = legs[0];
  const last = legs[legs.length - 1];
  const short = (s: string) => s.replace(/\s*\([A-Z]{3}\)$/, '');
  if (!first || !last) return 'Trip';
  return `${short(first.fromLabel || first.fromTz)} → ${short(last.toLabel || last.toTz)}`;
}
