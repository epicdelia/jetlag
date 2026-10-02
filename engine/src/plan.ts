/**
 * buildPlan: implementation of docs/SCIENCE.md §11 (ALGORITHM).
 * Pure and deterministic: the same input always produces the same plan.
 */

import {
  TripInputError,
  type AdviceKind,
  type AdviceWindow,
  type Chronotype,
  type DayPlan,
  type Plan,
  type Strategy,
  type TripInput,
} from './types';
import { PARAMS } from './params';
import { RATIONALE, WARNINGS } from './rationale';
import { intersect, normalize, splitAt, subtract, type Interval } from './intervals';
import {
  HOUR,
  MINUTE,
  DAY,
  dayNumberToIso,
  isValidTimeZone,
  localDayNumber,
  localToUtc,
  offsetMinutes,
  parseHHmm,
  parseInstant,
  roundToMinute,
  toIso,
  wallParts,
} from './time';
import { simulateTmin, sleepDurationHours, tminClockMinutes, type TminEvent } from './phase';
import {
  flightPieces,
  inFlight,
  layoverSpans,
  longEnough,
  makeJourney,
  nightStart,
  nights,
  wallEnd,
  nightsOverlapping,
  tzAt,
  type Journey,
  type Leg,
  type SleepBlock,
} from './journey';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface Normalized {
  journey: Journey;
  bedMin: number;
  wakeMin: number;
  durH: number;
  chronotype: Chronotype;
  useMelatonin: boolean;
  useCaffeine: boolean;
  preAdapt: boolean;
  maxPreDays: number;
  stayDays?: number;
  warnings: string[];
}

const CHRONOTYPES: readonly Chronotype[] = ['early', 'intermediate', 'late'];

function fail(msg: string): never {
  throw new TripInputError(msg);
}

function optionalBool(v: unknown, dflt: boolean, name: string): boolean {
  if (v === undefined || v === null) return dflt;
  if (typeof v !== 'boolean') fail(`prefs.${name} must be a boolean`);
  return v;
}

function validate(input: TripInput): Normalized {
  if (!input || typeof input !== 'object') fail('Trip input is required');
  const rawLegs = (input as Partial<TripInput>).legs;
  if (!Array.isArray(rawLegs) || rawLegs.length === 0) fail('At least one flight leg is required');

  const warnings: string[] = [];
  const legs: Leg[] = rawLegs.map((leg, i) => {
    if (!leg || typeof leg !== 'object') fail(`Leg ${i + 1} is malformed`);
    const fromTz: unknown = leg.from?.tz;
    const toTz: unknown = leg.to?.tz;
    if (!isValidTimeZone(fromTz)) fail(`Leg ${i + 1}: unknown departure time zone "${String(fromTz)}"`);
    if (!isValidTimeZone(toTz)) fail(`Leg ${i + 1}: unknown arrival time zone "${String(toTz)}"`);
    const dep = parseInstant(leg.departUtc);
    const arr = parseInstant(leg.arriveUtc);
    if (!Number.isFinite(dep)) fail(`Leg ${i + 1}: departUtc is not an ISO-8601 instant`);
    if (!Number.isFinite(arr)) fail(`Leg ${i + 1}: arriveUtc is not an ISO-8601 instant`);
    if (!(dep < arr)) fail(`Leg ${i + 1}: arrival must be after departure`);
    return { fromTz, toTz, dep, arr };
  });
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1]!;
    const cur = legs[i]!;
    if (cur.dep < prev.arr) fail(`Leg ${i + 1} departs before leg ${i} arrives; legs must be chronological`);
    if (cur.fromTz !== prev.toTz && !warnings.includes(WARNINGS.legsDontConnect)) {
      warnings.push(WARNINGS.legsDontConnect);
    }
  }

  const sleep = (input as Partial<TripInput>).sleep;
  if (!sleep || typeof sleep !== 'object') fail('Sleep profile is required');
  const bedMin = parseHHmm(sleep.usualBedtime);
  const wakeMin = parseHHmm(sleep.usualWake);
  if (!Number.isFinite(bedMin)) fail(`usualBedtime must be "HH:mm" (24 h), got "${String(sleep.usualBedtime)}"`);
  if (!Number.isFinite(wakeMin)) fail(`usualWake must be "HH:mm" (24 h), got "${String(sleep.usualWake)}"`);
  if (!CHRONOTYPES.includes(sleep.chronotype)) fail(`chronotype must be one of ${CHRONOTYPES.join(', ')}`);
  const durH = sleepDurationHours(bedMin, wakeMin);
  const [minD, maxD] = PARAMS.SLEEP_DURATION_RANGE;
  if (durH < minD || durH > maxD) fail(`Usual sleep must last between ${minD} and ${maxD} hours`);

  const prefs: unknown = (input as Partial<TripInput>).prefs;
  if (prefs !== undefined && (prefs === null || typeof prefs !== 'object')) fail('prefs must be an object');
  const p = (prefs ?? {}) as Partial<TripInput['prefs']>;
  const useMelatonin = optionalBool(p.useMelatonin, false, 'useMelatonin');
  const useCaffeine = optionalBool(p.useCaffeine, true, 'useCaffeine');
  const preAdapt = optionalBool(p.preAdapt, true, 'preAdapt');
  let maxPreDays: number = PARAMS.MAX_PRE_DAYS;
  if (p.maxPreDays !== undefined && p.maxPreDays !== null) {
    if (typeof p.maxPreDays !== 'number' || !Number.isFinite(p.maxPreDays)) fail('prefs.maxPreDays must be a number');
    maxPreDays = Math.floor(Math.min(Math.max(p.maxPreDays, 0), PARAMS.MAX_PRE_DAYS));
  }

  let stayDays: number | undefined;
  const sd: unknown = (input as Partial<TripInput>).stayDays;
  if (sd !== undefined && sd !== null) {
    if (typeof sd !== 'number' || !Number.isFinite(sd) || sd <= 0) fail('stayDays must be a positive number');
    stayDays = sd;
  }

  return {
    journey: makeJourney(legs),
    bedMin,
    wakeMin,
    durH,
    chronotype: sleep.chronotype,
    useMelatonin,
    useCaffeine,
    preAdapt,
    maxPreDays,
    stayDays,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Net zone difference destination − origin at an instant, normalised to (−12, +14]. */
export function zoneDelta(origin: string, dest: string, at: number): number {
  let x = (offsetMinutes(dest, at) - offsetMinutes(origin, at)) / 60;
  while (x > 14) x -= 24;
  while (x <= -12) x += 24;
  return x;
}

interface DayInterval {
  index: number;
  dayNum: number;
  tz: string;
  start: number;
  end: number;
}

function dayIntervals(
  j: Journey,
  nPre: number,
  depDate: number,
  arrDate: number,
  coverUntil: number,
  minLastIndex: number,
): DayInterval[] {
  const out: DayInterval[] = [];
  for (let k = -nPre; k < 0; k++) {
    out.push({
      index: k,
      dayNum: depDate + k,
      tz: j.origin,
      start: localToUtc(j.origin, depDate + k, 0),
      end: localToUtc(j.origin, depDate + k + 1, 0),
    });
  }
  // Day 0 runs to the end of the arrival date when the traveller lands on the departure date
  // or the next one. When the arrival date is two or more dates later (date line), day 0 ends
  // at the start of the arrival date so that date becomes day 1 and keeps its own label.
  const firstPostDate = arrDate > depDate + 1 ? arrDate : arrDate + 1;
  const day0Start = localToUtc(j.origin, depDate, 0);
  out.push({
    index: 0,
    dayNum: depDate,
    tz: j.origin,
    start: day0Start,
    end: Math.max(localToUtc(j.dest, firstPostDate, 0), j.depart),
  });
  for (let k = 1; out[out.length - 1]!.end <= coverUntil || k <= minLastIndex; k++) {
    const dayNum = firstPostDate + k - 1;
    out.push({
      index: k,
      dayNum,
      tz: j.dest,
      start: out[out.length - 1]!.end,
      end: localToUtc(j.dest, dayNum + 1, 0),
    });
  }
  return out;
}

interface RawWindow {
  kind: AdviceKind;
  start: number;
  end: number;
  rationale: string;
}

const KIND_ORDER: readonly AdviceKind[] = [
  'sleep',
  'nap',
  'seek_light',
  'avoid_light',
  'melatonin',
  'caffeine_ok',
  'avoid_caffeine',
];

function compareWindows(a: AdviceWindow, b: AdviceWindow): number {
  if (a.startUtc !== b.startUtc) return Date.parse(a.startUtc) - Date.parse(b.startUtc);
  const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (k !== 0) return k;
  return Date.parse(a.endUtc) - Date.parse(b.endUtc);
}

function toWindow(j: Journey, w: RawWindow): AdviceWindow {
  return {
    kind: w.kind,
    startUtc: toIso(w.start),
    endUtc: toIso(w.end),
    tz: tzAt(j, w.start),
    rationale: w.rationale,
  };
}

const round1 = (x: number) => {
  const r = (Math.sign(x) * Math.round(Math.abs(x) * 10)) / 10; // symmetric rounding
  return r === 0 ? 0 : r; // avoid -0
};

/** The last `total` ms of a sorted interval list. */
function latest(list: Interval[], total: number): Interval[] {
  const out: Interval[] = [];
  let left = total;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) {
    const [s, e] = list[i]!;
    const s2 = Math.max(s, e - left);
    out.unshift([s2, e]);
    left -= e - s2;
  }
  return out;
}

function minLen(list: Interval[], hours: number): Interval[] {
  return list.filter(([s, e]) => e - s >= hours * HOUR);
}

/** §6 caffeine windows against the sorted sleeps (which may include the unshown mask night). */
function caffeineWindows(
  sleeps: SleepBlock[],
  awake: Interval[],
  planStart: number,
  day0: DayInterval,
  remainingAt: (ms: number) => number,
): RawWindow[] {
  const cutoff = PARAMS.CAFFEINE_CUTOFF_H * HOUR;
  const avoid: Interval[] = [];
  const ok: Interval[] = [];
  sleeps.forEach((S, idx) => {
    if (S.kind === 'mask') return;
    const prevEnd = idx > 0 ? sleeps[idx - 1]!.end : planStart;
    avoid.push(...intersect([[S.start - cutoff, S.start]], awake));
    const okEnd = S.start - cutoff;
    const startsDay0OrLater = S.start >= day0.start;
    const inDay0 = S.start >= day0.start && S.start < day0.end;
    if (
      okEnd - prevEnd >= PARAMS.CAFFEINE_OK_MIN_H * HOUR &&
      startsDay0OrLater &&
      (inDay0 || Math.abs(remainingAt(okEnd)) >= PARAMS.CAFFEINE_OK_REMAINING)
    ) {
      ok.push(...intersect([[prevEnd, okEnd]], awake));
    }
  });
  const avoidN = normalize(avoid).filter(([s, e]) => e - s >= MINUTE);
  const okN = minLen(subtract(normalize(ok), avoidN), PARAMS.CAFFEINE_OK_MIN_H);
  return [
    ...avoidN.map(([s, e]) => ({ kind: 'avoid_caffeine' as const, start: s, end: e, rationale: RATIONALE.avoidCaffeine })),
    ...okN.map(([s, e]) => ({ kind: 'caffeine_ok' as const, start: s, end: e, rationale: RATIONALE.caffeineOk })),
  ];
}

function sleepRationale(S: SleepBlock, dir: number, stay: boolean): string {
  if (S.kind === 'flight') return RATIONALE.sleepFlight;
  if (S.kind === 'pre') return S.shiftH ? RATIONALE.sleepPre(S.shiftH, dir) : RATIONALE.sleepPreKeep;
  return stay ? RATIONALE.sleepHome : RATIONALE.sleepDest;
}

function windowsInDay(windows: AdviceWindow[], d: DayInterval): AdviceWindow[] {
  return windows.filter((w) => {
    const ms = Date.parse(w.startUtc);
    return ms >= d.start && ms < d.end;
  });
}

function assembleDays(
  days: DayInterval[],
  windows: AdviceWindow[],
  remainingOf: (d: DayInterval) => number,
): DayPlan[] {
  const out: DayPlan[] = [];
  for (const d of days) {
    const ws = windowsInDay(windows, d).sort(compareWindows);
    if (ws.length === 0 && d.index !== 0) continue; // drop empty days except day 0
    out.push({
      date: dayNumberToIso(d.dayNum),
      tz: d.tz,
      dayIndex: d.index,
      windows: ws,
      remainingShiftHours: round1(remainingOf(d)),
    });
  }
  return out;
}

/** True when most of [s, e) falls in local night hours (no daylight to promise; no solar model). */
function isNightTime(tz: string, s: number, e: number): boolean {
  const p = wallParts(tz, Math.round((s + e) / 2));
  const h = p.hour + p.minute / 60;
  return h < PARAMS.DAYLIGHT_HOURS[0] || h >= PARAMS.DAYLIGHT_HOURS[1];
}

function lightRationale(kind: 'seek' | 'avoid', dir: number, flight: boolean, night = false): string {
  if (kind === 'seek') {
    if (flight) return dir > 0 ? RATIONALE.seekAdvanceFlight : RATIONALE.seekDelayFlight;
    if (night) return dir > 0 ? RATIONALE.seekAdvanceIndoor : RATIONALE.seekDelayIndoor;
    return dir > 0 ? RATIONALE.seekAdvance : RATIONALE.seekDelay;
  }
  if (dir > 0) return flight ? RATIONALE.avoidAdvanceFlight : RATIONALE.avoidAdvance;
  return flight ? RATIONALE.avoidDelayFlight : RATIONALE.avoidDelay;
}

// ---------------------------------------------------------------------------
// buildPlan
// ---------------------------------------------------------------------------

/** Internal model state, exposed for tests and debugging (not part of the app contract). */
export interface PlanDebug {
  tminClockMinutes: number;
  nPre: number;
  events: TminEvent[];
  sleeps: SleepBlock[];
  planStart: number;
  planEnd: number;
}

export function buildPlan(input: TripInput): Plan {
  return buildPlanDetailed(input).plan;
}

export function buildPlanDetailed(input: TripInput): { plan: Plan; debug: PlanDebug } {
  const n = validate(input);
  const j = n.journey;
  const warnings = [...n.warnings];

  // 1. Zone delta
  const delta = zoneDelta(j.origin, j.dest, j.arrive);

  // 2. Phase estimate (origin clock)
  const tminMin = tminClockMinutes(n.bedMin, n.wakeMin, n.chronotype);
  const depDate = localDayNumber(j.origin, j.depart);
  const arrDate = localDayNumber(j.dest, j.arrive);

  // 3. Strategy
  if (Math.abs(delta) < PARAMS.MIN_SHIFT_TO_PLAN) {
    return {
      plan: {
        strategy: 'none',
        zoneDeltaHours: delta,
        plannedShiftHours: 0,
        estimatedDaysToAdapt: 0,
        days: [],
        warnings,
      },
      debug: { tminClockMinutes: tminMin, nPre: 0, events: [], sleeps: [], planStart: j.depart, planEnd: j.depart },
    };
  }
  if (
    n.stayDays !== undefined &&
    n.stayDays <= PARAMS.STAY_HOME_MAX_DAYS &&
    Math.abs(delta) >= PARAMS.STAY_HOME_MIN_DELTA
  ) {
    return stayOnHomeTimePlan(n, delta, tminMin, depDate, arrDate, warnings);
  }

  let strategy: Strategy;
  let planned: number;
  if (delta > 0 && delta >= PARAMS.ANTIDROMIC_EAST_THRESHOLD) {
    strategy = 'delay';
    planned = -(24 - delta);
    warnings.push(WARNINGS.antidromic(delta));
  } else if (delta > 0) {
    strategy = 'advance';
    planned = delta;
    if (delta >= PARAMS.ANTIDROMIC_RISK_LOW) warnings.push(WARNINGS.largeEast);
  } else {
    strategy = 'delay';
    planned = delta;
  }
  const dir = Math.sign(planned);
  if (strategy === 'delay' && n.useMelatonin) warnings.push(WARNINGS.melatoninDelay);

  // 4. Pre-flight days
  let nPre = 0;
  if (n.preAdapt && Math.abs(planned) >= PARAMS.PREADAPT_MIN) {
    nPre = Math.max(0, Math.min(n.maxPreDays, Math.ceil(Math.abs(planned)) - 1));
  }

  // 4b. Pre-flight nights (needed before the simulation: a night that cannot be shifted
  // fully, because the traveller must leave for the airport, earns less pre-flight shift).
  const preDepartureLimit = j.depart - PARAMS.PRE_DEPARTURE_BUFFER_H * HOUR;
  const preNights: SleepBlock[] = [];
  const preStepScale: number[] = [];
  {
    let prevShift = 0;
    for (let k = -nPre; k <= -1; k++) {
      const want = (k + nPre + 1) * PARAMS.PRE_SLEEP_STEP;
      const habitual = nightStart(j.origin, depDate + k, n.bedMin);
      let shift = want;
      if (dir < 0) {
        // Never push bedtime so late that the night has to be cut short for the flight.
        const roomH = (preDepartureLimit - n.durH * HOUR - habitual) / HOUR;
        shift = Math.max(0, Math.min(want, Math.floor(roomH * 4) / 4));
      }
      preStepScale.push(Math.min(1, Math.max(0, (shift - prevShift) / PARAMS.PRE_SLEEP_STEP)));
      prevShift = shift;
      const start = habitual - dir * shift * HOUR;
      const end = Math.min(wallEnd(j.origin, start, n.durH), preDepartureLimit);
      if (end - start >= PARAMS.MIN_GROUND_SLEEP_H * HOUR) preNights.push({ start, end, kind: 'pre', shiftH: shift });
    }
  }

  // 5. Simulate Tmin
  const mel = n.useMelatonin && dir > 0;
  const t0 = localToUtc(j.origin, depDate - nPre, tminMin);
  const maxHorizon = j.arrive + PARAMS.MAX_POST_DAYS * DAY;
  const horizonEnd = n.stayDays !== undefined ? Math.min(maxHorizon, j.arrive + n.stayDays * DAY) : maxHorizon;
  // The target is the habitual Tmin on the destination's *local* clock, so a destination DST
  // change after arrival moves it (SCIENCE.md §10).
  const arriveOffset = offsetMinutes(j.dest, j.arrive);
  const targetShiftAt = (t: number) => (t < j.arrive ? 0 : (offsetMinutes(j.dest, t) - arriveOffset) / 60);
  const simBase = { t0, planned, departMs: j.depart, nPre, melatonin: mel, targetShiftAt, preStepScale };
  const sim = simulateTmin({ ...simBase, horizonEnd });
  const events = sim.events;
  let estimatedDaysToAdapt = sim.estimatedDaysToAdapt;
  if (n.stayDays !== undefined && n.stayDays <= PARAMS.SHORT_STAY_WARN_DAYS) {
    const full = simulateTmin({ ...simBase, horizonEnd: maxHorizon });
    if (full.estimatedDaysToAdapt > n.stayDays) warnings.push(WARNINGS.shortStay);
  }
  if (sim.horizonHit) {
    warnings.push(WARNINGS.horizon(Math.ceil(Math.min(PARAMS.MAX_POST_DAYS, n.stayDays ?? Infinity))));
  }
  const remainingAt = (ms: number): number => {
    let r = planned;
    for (const e of events) if (e.t <= ms) r = e.remaining;
    return r;
  };

  const planStart = localToUtc(j.origin, depDate - nPre, 0);
  const lastEvent = events[events.length - 1]!;
  const lastDate = Math.max(arrDate, localDayNumber(j.dest, lastEvent.t) + 1);

  // 6. Sleep windows
  const sleeps: SleepBlock[] = [];
  {
    // Habitual night before the first plan day: not shown, but the traveller is asleep then.
    const s = nightStart(j.origin, depDate - nPre - 1, n.bedMin);
    const e = Math.min(s + n.durH * HOUR, preDepartureLimit);
    if (e > s) sleeps.push({ start: s, end: e, kind: 'mask' });
  }
  sleeps.push(...preNights);
  for (const span of layoverSpans(j)) {
    for (const N of nightsOverlapping(j.dest, span[0], span[1], n.bedMin, n.durH)) {
      for (const [s, e] of longEnough(intersect([N], [span]), PARAMS.MIN_GROUND_SLEEP_H)) {
        sleeps.push({ start: s, end: e, kind: 'layover' });
      }
    }
  }
  // In-flight sleep never starts within FLIGHT_SLEEP_AFTER_WAKE_H of the previous sleep's end
  // (sleep that soon after waking is unlikely; it would also fall in the body-clock morning).
  const lastWakeBefore = (ms: number) =>
    Math.max(-Infinity, ...sleeps.filter((S) => S.end <= ms).map((S) => S.end));
  const awakeEnough = (piece: Interval, wokeAt: number): Interval | null => {
    const s = Math.max(piece[0], wokeAt + PARAMS.FLIGHT_SLEEP_AFTER_WAKE_H * HOUR);
    return piece[1] - s >= PARAMS.MIN_FLIGHT_SLEEP_WINDOW_H * HOUR ? [s, piece[1]] : null;
  };
  for (const leg of j.legs) {
    const woke = lastWakeBefore(leg.dep);
    for (const N of nightsOverlapping(j.dest, leg.dep, leg.arr, n.bedMin, n.durH)) {
      for (const p of flightPieces({ ...j, legs: [leg] }, N)) {
        const q = awakeEnough(p, woke);
        if (q) sleeps.push({ start: q[0], end: q[1], kind: 'flight' });
      }
    }
  }
  const groundAfter = j.arrive + PARAMS.POST_ARRIVAL_BUFFER_H * HOUR;
  for (const N of nights(j.dest, arrDate - 1, lastDate, n.bedMin, n.durH)) {
    for (const [s, e] of longEnough(intersect([N], [[groundAfter, Infinity]]), PARAMS.MIN_GROUND_SLEEP_H)) {
      sleeps.push({ start: s, end: e, kind: 'dest' });
    }
  }
  // Extension: a long flight with no destination-night sleep that would leave the traveller
  // awake for more than MAX_AWAKE_H gets in-flight sleep in the body-clock night instead.
  const tminBeforeWakeH = (((n.wakeMin - tminMin) % 1440) + 1440) % 1440 / 60;
  for (const leg of j.legs) {
    if (leg.arr - leg.dep < PARAMS.MIN_FLIGHT_SLEEP_H * HOUR) continue;
    if (sleeps.some((S) => S.kind === 'flight' && S.start >= leg.dep && S.end <= leg.arr)) continue;
    const prevEnd = Math.max(planStart, ...sleeps.filter((S) => S.end <= leg.dep).map((S) => S.end));
    const nextStart = Math.min(...sleeps.filter((S) => S.start >= leg.arr).map((S) => S.start));
    if (nextStart - prevEnd <= PARAMS.MAX_AWAKE_H * HOUR) continue;
    let best: Interval | null = null;
    for (const e of events) {
      const bodyNight: Interval = [e.t - (n.durH - tminBeforeWakeH) * HOUR, e.t + tminBeforeWakeH * HOUR];
      for (const p0 of flightPieces({ ...j, legs: [leg] }, bodyNight)) {
        const p = awakeEnough(p0, prevEnd);
        if (p && (!best || p[1] - p[0] > best[1] - best[0])) best = p;
      }
    }
    if (best) sleeps.push({ start: best[0], end: best[1], kind: 'flight' });
  }
  sleeps.sort((a, b) => a.start - b.start || a.end - b.end);

  const planEnd = Math.max(localToUtc(j.dest, lastDate + 1, 0), ...sleeps.map((s) => s.end));
  const awake = subtract(
    [[planStart, planEnd]],
    sleeps.map((s) => [s.start, s.end] as Interval),
  );

  // 7. Light windows
  const L = dir > 0 ? PARAMS.LIGHT.advance : PARAMS.LIGHT.delay;
  const seekRaw: Interval[] = [];
  const avoidRaw: Interval[] = [];
  const lightFloor = nPre === 0 ? Math.max(j.depart, planStart) : planStart;
  events.forEach((e, idx) => {
    if (e.phase === 'pre' && nPre === 0) return;
    // Advance: morning light after Tmin_i drives the step from event i. Delay: evening light
    // before Tmin_i drives the step that lands at event i, i.e. the previous event's step.
    const driver = dir > 0 ? e : events[idx - 1];
    if (!driver || Math.abs(driver.remaining) <= PARAMS.ADAPTED_TOL) return;
    if (dir > 0) {
      seekRaw.push(...intersect([[Math.max(lightFloor, e.t + L.seek[0] * HOUR), e.t + L.seek[1] * HOUR]], awake));
    } else {
      // Delay: the latest 4 h of waking time in [t − 8, t − 1). Equals [t − 5, t − 1) when the
      // traveller is awake then; otherwise it reaches back into the evening before bedtime.
      const span = intersect(
        [[Math.max(lightFloor, e.t - PARAMS.DELAY_SEEK_MAX_BEFORE_TMIN_H * HOUR), e.t + L.seek[1] * HOUR]],
        awake,
      );
      seekRaw.push(...latest(span, (L.seek[1] - L.seek[0]) * HOUR));
    }
    avoidRaw.push(...intersect([[Math.max(lightFloor, e.t + L.avoid[0] * HOUR), e.t + L.avoid[1] * HOUR]], awake));
  });
  // Defensive: seek and avoid must never overlap; darkness wins (the conservative side).
  // Windows are split at takeoff/landing so in-flight advice is its own window.
  const avoidLight = minLen(splitAt(normalize(avoidRaw), j.cuts), PARAMS.MIN_WINDOW_H);
  const seekLight = minLen(splitAt(subtract(seekRaw, avoidRaw), j.cuts), PARAMS.MIN_WINDOW_H);

  const raw: RawWindow[] = [];
  for (const S of sleeps) {
    if (S.kind === 'mask') continue;
    raw.push({ kind: 'sleep', start: S.start, end: S.end, rationale: sleepRationale(S, dir, false) });
  }
  for (const [s, e] of seekLight) {
    const rationale = lightRationale('seek', dir, inFlight(j, s), isNightTime(tzAt(j, s), s, e));
    raw.push({ kind: 'seek_light', start: s, end: e, rationale });
  }
  for (const [s, e] of avoidLight) {
    raw.push({ kind: 'avoid_light', start: s, end: e, rationale: lightRationale('avoid', dir, inFlight(j, s)) });
  }

  // 8. Melatonin (advance only)
  if (mel) {
    let postDoses = 0;
    for (const e of events) {
      if (Math.abs(e.remaining) <= PARAMS.ADAPTED_TOL) continue;
      if (!(e.phase === 'post' || nPre > 0)) continue;
      if (e.phase === 'post' && postDoses >= PARAMS.MELATONIN_MAX_POST_DOSES) break;
      const dlmo = e.t - PARAMS.DLMO_TO_TMIN * HOUR;
      const c = dlmo - PARAMS.MEL_BEFORE_DLMO_H * HOUR;
      let dose: number | null = null;
      if (!sleeps.some((S) => c > S.start && c < S.end)) {
        dose = c;
      } else {
        const b = sleeps.find((S) => S.start >= c - 12 * HOUR);
        const [lo, hi] = PARAMS.MEL_FALLBACK_RANGE;
        if (b && b.start >= dlmo + lo * HOUR && b.start <= dlmo + hi * HOUR) dose = b.start;
      }
      if (dose === null || dose < planStart || dose >= planEnd) continue;
      raw.push({ kind: 'melatonin', start: dose, end: dose, rationale: RATIONALE.melatonin });
      if (e.phase === 'post') postDoses++;
    }
  }

  const days = dayIntervals(j, nPre, depDate, arrDate, Math.max(planStart, ...raw.map((w) => w.start)), 0);
  const day0 = days.find((d) => d.index === 0)!;

  // 9. Caffeine
  if (n.useCaffeine) raw.push(...caffeineWindows(sleeps, awake, planStart, day0, remainingAt));

  // 10. Naps
  const napLen = PARAMS.NAP_MIN * MINUTE;
  for (const d of days) {
    if (d.index < 0) continue;
    if (!(d.index === 0 || Math.abs(remainingAt(d.start)) >= PARAMS.NAP_REMAINING)) continue;
    const lo = Math.max(d.start, j.arrive + PARAMS.NAP_AFTER_ARRIVAL_H * HOUR);
    if (lo >= d.end) continue;
    const region: Interval[] = [];
    for (let i = 0; i + 1 < sleeps.length; i++) {
      const a = sleeps[i]!.end + PARAMS.NAP_AFTER_WAKE_H * HOUR;
      const b = sleeps[i + 1]!.start - PARAMS.NAP_BEFORE_BED_H * HOUR;
      region.push(...intersect([[a, b]], [[lo, d.end]]));
    }
    const usable = subtract(intersect(region, awake), seekLight).filter(([s, e]) => e - s >= napLen);
    if (usable.length === 0) continue;
    const dark = intersect(usable, avoidLight).filter(([s, e]) => e - s >= napLen);
    let start: number;
    if (dark.length > 0) {
      start = dark[0]![0];
    } else {
      let best = usable[0]!;
      for (const p of usable) if (p[1] - p[0] > best[1] - best[0]) best = p;
      start = roundToMinute((best[0] + best[1]) / 2 - napLen / 2);
      start = Math.min(Math.max(start, best[0]), best[1] - napLen);
    }
    raw.push({ kind: 'nap', start, end: start + napLen, rationale: RATIONALE.nap });
  }

  // 11. Bucket into days
  const windows = raw.filter((w) => w.start >= planStart && w.start < planEnd).map((w) => toWindow(j, w));
  let lastIndex = 0;
  for (const d of days) {
    const active =
      windowsInDay(windows, d).length > 0 ||
      events.some((e) => e.t >= d.start && e.t < d.end && Math.abs(e.remaining) > PARAMS.ADAPTED_TOL);
    if (active) lastIndex = Math.max(lastIndex, d.index);
  }
  // Sampled at the day's usual wake time (local to the day's zone): "this morning's" estimate,
  // after the night's Tmin, so consecutive days don't repeat yesterday's value.
  const remainingOf = (d: DayInterval) => {
    const wake = localToUtc(d.tz, d.dayNum, n.wakeMin);
    return remainingAt(Math.min(Math.max(wake, d.start), d.end - MINUTE));
  };
  const planDays = assembleDays(
    days.filter((d) => d.index <= lastIndex),
    windows,
    remainingOf,
  );

  return {
    plan: {
      strategy,
      zoneDeltaHours: delta,
      plannedShiftHours: planned,
      estimatedDaysToAdapt,
      days: planDays,
      warnings,
    },
    debug: { tminClockMinutes: tminMin, nPre, events, sleeps, planStart, planEnd },
  };
}

// ---------------------------------------------------------------------------
// §11.6 stay on home time
// ---------------------------------------------------------------------------

function stayOnHomeTimePlan(
  n: Normalized,
  delta: number,
  tminMin: number,
  depDate: number,
  arrDate: number,
  warningsIn: string[],
): { plan: Plan; debug: PlanDebug } {
  const j = n.journey;
  const warnings = [...warningsIn, WARNINGS.stayHome];
  const nDays = Math.ceil(n.stayDays ?? 1);
  const days = dayIntervals(j, 0, depDate, arrDate, -Infinity, nDays);
  const planStart = days[0]!.start;
  const planEnd = days[days.length - 1]!.end;

  // Habitual home-clock nights, kept clear of airports and moved onto the plane where possible.
  const transit: Interval = [
    j.depart - PARAMS.PRE_DEPARTURE_BUFFER_H * HOUR,
    j.arrive + PARAMS.POST_ARRIVAL_BUFFER_H * HOUR,
  ];
  const layovers = layoverSpans(j);
  const sleeps: SleepBlock[] = [];
  for (const N of nights(j.origin, depDate - 2, localDayNumber(j.origin, planEnd) + 1, n.bedMin, n.durH)) {
    const ground = [
      ...longEnough(subtract([N], [transit]), PARAMS.MIN_GROUND_SLEEP_H),
      ...longEnough(intersect([N], layovers), PARAMS.MIN_GROUND_SLEEP_H),
    ];
    for (const [s, e] of ground) sleeps.push({ start: s, end: e, kind: s < planStart ? 'mask' : 'home' });
    for (const [s, e] of flightPieces(j, N)) {
      sleeps.push({ start: s, end: e, kind: s < planStart ? 'mask' : 'flight' });
    }
  }
  sleeps.sort((a, b) => a.start - b.start || a.end - b.end);
  const awake = subtract(
    [[planStart, planEnd]],
    sleeps.map((s) => [s.start, s.end] as Interval),
  );

  // Home Tmin does not move; keep light away from both sides of it.
  const events: TminEvent[] = [];
  const avoidRaw: Interval[] = [];
  const lastOriginDay = localDayNumber(j.origin, planEnd) + 1;
  for (let d = depDate - 1, i = 0; d <= lastOriginDay; d++, i++) {
    const t = localToUtc(j.origin, d, tminMin);
    events.push({ t, remaining: delta, phase: t < j.depart ? 'pre' : 'post', index: i });
    avoidRaw.push(...intersect([[t + PARAMS.STAY_AVOID[0] * HOUR, t + PARAMS.STAY_AVOID[1] * HOUR]], awake));
  }
  const avoidLight = minLen(splitAt(normalize(avoidRaw), j.cuts), PARAMS.MIN_WINDOW_H);

  const raw: RawWindow[] = [];
  for (const S of sleeps) {
    if (S.kind === 'mask') continue;
    raw.push({ kind: 'sleep', start: S.start, end: S.end, rationale: sleepRationale(S, 0, true) });
  }
  for (const [s, e] of avoidLight) raw.push({ kind: 'avoid_light', start: s, end: e, rationale: RATIONALE.avoidStay });
  if (n.useCaffeine) {
    raw.push(...caffeineWindows(sleeps, awake, planStart, days.find((d) => d.index === 0)!, () => delta));
  }

  const windows = raw.filter((w) => w.start >= planStart && w.start < planEnd).map((w) => toWindow(j, w));
  const planDays = assembleDays(days, windows, () => delta);

  return {
    plan: {
      strategy: 'stay_on_home_time',
      zoneDeltaHours: delta,
      plannedShiftHours: 0,
      estimatedDaysToAdapt: 0,
      days: planDays,
      warnings,
    },
    debug: { tminClockMinutes: tminMin, nPre: 0, events, sleeps, planStart, planEnd },
  };
}
