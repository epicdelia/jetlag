/** Where the traveller is at a given instant, and sleep-placement helpers around flights. */

import { PARAMS } from './params';
import { HOUR, MINUTE, localDayNumber, localToUtc, offsetMinutes } from './time';
import { intersect, normalize, type Interval } from './intervals';

export interface Leg {
  fromTz: string;
  toTz: string;
  dep: number;
  arr: number;
}

export interface Journey {
  legs: Leg[];
  origin: string;
  dest: string;
  depart: number;
  arrive: number;
  /** All takeoff and landing instants, sorted. */
  cuts: number[];
}

export function makeJourney(legs: Leg[]): Journey {
  const first = legs[0]!;
  const last = legs[legs.length - 1]!;
  return {
    legs,
    origin: first.fromTz,
    dest: last.toTz,
    depart: first.dep,
    arrive: last.arr,
    cuts: legs.flatMap((l) => [l.dep, l.arr]).sort((a, b) => a - b),
  };
}

/**
 * Zone the traveller is in at `ms`: origin before the first departure; legs[i].to
 * during leg i and the layover after it; the final destination after arrival.
 */
export function tzAt(j: Journey, ms: number): string {
  if (ms < j.depart) return j.origin;
  for (let i = 0; i < j.legs.length; i++) {
    const next = j.legs[i + 1];
    if (!next || ms < next.dep) return j.legs[i]!.toTz;
  }
  return j.dest;
}

export function inFlight(j: Journey, ms: number): boolean {
  return j.legs.some((l) => ms >= l.dep && ms < l.arr);
}

/**
 * Start of the habitual night belonging to calendar day `dayNum` in `tz`.
 * Bedtimes from 12:00 to 23:59 fall on that date; 00:00–11:59 on the next date
 * (so a 01:00 bedtime is the night *after* `dayNum`).
 */
export function nightStart(tz: string, dayNum: number, bedMin: number): number {
  return localToUtc(tz, bedMin >= 720 ? dayNum : dayNum + 1, bedMin);
}

/**
 * End of a sleep that starts at `start` and lasts `durH` hours of *wall-clock* time in `tz`:
 * on a DST night the alarm still rings at the usual local wake time (a 23:00–07:00 night
 * is 7 h on spring-forward and 9 h on fall-back), as the traveller's phone will show.
 */
export function wallEnd(tz: string, start: number, durH: number): number {
  const naive = start + durH * HOUR;
  const end = naive - (offsetMinutes(tz, naive) - offsetMinutes(tz, start)) * MINUTE;
  // Guard against landing inside a DST gap edge: fall back to elapsed time if inconsistent.
  return end > start ? end : naive;
}

/** Habitual nights (on `tz` clock) whose start falls on days [fromDay, toDay]. */
export function nights(tz: string, fromDay: number, toDay: number, bedMin: number, durH: number): Interval[] {
  const out: Interval[] = [];
  for (let d = fromDay; d <= toDay; d++) {
    const s = nightStart(tz, d, bedMin);
    out.push([s, wallEnd(tz, s, durH)]);
  }
  return out;
}

/** Nights on `tz` clock that could overlap [a, b). */
export function nightsOverlapping(tz: string, a: number, b: number, bedMin: number, durH: number): Interval[] {
  return nights(tz, localDayNumber(tz, a) - 2, localDayNumber(tz, b) + 1, bedMin, durH).filter(
    ([s, e]) => e > a && s < b,
  );
}

export type SleepKind = 'mask' | 'pre' | 'flight' | 'layover' | 'dest' | 'home';

export interface SleepBlock {
  start: number;
  end: number;
  kind: SleepKind;
  /** Pre-flight shift in hours (pre nights only). */
  shiftH?: number;
}

/** In-flight sleep pieces: `night` ∩ [dep + 1 h, arr − 1 h] on legs long enough. */
export function flightPieces(j: Journey, night: Interval): Interval[] {
  const out: Interval[] = [];
  for (const l of j.legs) {
    if (l.arr - l.dep < PARAMS.MIN_FLIGHT_SLEEP_H * HOUR) continue;
    const w = intersect(
      [[l.dep + PARAMS.FLIGHT_SLEEP_BUFFER_H * HOUR, l.arr - PARAMS.FLIGHT_SLEEP_BUFFER_H * HOUR]],
      [night],
    );
    for (const p of w) if (p[1] - p[0] >= PARAMS.MIN_FLIGHT_SLEEP_WINDOW_H * HOUR) out.push(p);
  }
  return out;
}

/** Layover ground time usable for sleep: [arr_i + 1 h, dep_{i+1} − 2 h]. */
export function layoverSpans(j: Journey): Interval[] {
  const out: Interval[] = [];
  for (let i = 0; i + 1 < j.legs.length; i++) {
    out.push([
      j.legs[i]!.arr + PARAMS.POST_ARRIVAL_BUFFER_H * HOUR,
      j.legs[i + 1]!.dep - PARAMS.PRE_DEPARTURE_BUFFER_H * HOUR,
    ]);
  }
  return normalize(out);
}

/** Ground pieces of `night` that are at least the minimum ground-sleep length. */
export function longEnough(pieces: Interval[], minH: number): Interval[] {
  return pieces.filter(([s, e]) => e - s >= minH * HOUR);
}
