import { buildPlan, TripInputError, type AdviceWindow, type DayPlan, type Plan, type TripInput } from '@jetlag/engine';

import { buildFixturePlan } from './fixture';
import type { Trip } from './types';
import { dateKeyPlusDays, formatDateKey, localToUtc } from './tz';

export type PlanResult =
  | { ok: true; plan: Plan; fixture: boolean }
  | { ok: false; kind: 'input' | 'engine'; message: string };

/**
 * Development-only escape hatch: set EXPO_PUBLIC_PLAN_FIXTURE=1 to render a
 * synthetic plan instead of calling the engine. Never enabled in production builds.
 */
const USE_FIXTURE = __DEV__ && process.env.EXPO_PUBLIC_PLAN_FIXTURE === '1';

const cache = new Map<string, PlanResult>();
// Stored trips keep their input objects, so most calls hit this without serialising the input.
const byInput = new WeakMap<TripInput, PlanResult>();

/** Calls the real engine (`buildPlan`). Pure and memoised by input. */
export function computePlan(input: TripInput): PlanResult {
  const same = byInput.get(input);
  if (same) return same;
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) {
    byInput.set(input, hit);
    return hit;
  }
  let result: PlanResult;
  if (USE_FIXTURE) {
    result = { ok: true, plan: buildFixturePlan(input), fixture: true };
  } else {
    try {
      result = { ok: true, plan: buildPlan(input), fixture: false };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result = { ok: false, kind: e instanceof TripInputError ? 'input' : 'engine', message };
    }
  }
  if (cache.size > 50) cache.clear();
  cache.set(key, result);
  byInput.set(input, result);
  return result;
}

export function windowMs(w: AdviceWindow): { start: number; end: number } {
  return { start: Date.parse(w.startUtc), end: Date.parse(w.endUtc) };
}

export function isPoint(w: AdviceWindow): boolean {
  return w.startUtc === w.endUtc;
}

const windowsCache = new WeakMap<Plan, readonly AdviceWindow[]>();

/** All windows in the plan, sorted by start. Cached per plan object: do not mutate. */
export function allWindows(plan: Plan): readonly AdviceWindow[] {
  const hit = windowsCache.get(plan);
  if (hit) return hit;
  const out: AdviceWindow[] = [];
  for (const d of plan.days) out.push(...d.windows);
  out.sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
  windowsCache.set(plan, out);
  return out;
}

/** UTC span covered by the plan's windows, or null if empty. */
export function planSpan(plan: Plan): { start: number; end: number } | null {
  const ws = allWindows(plan);
  if (ws.length === 0) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const w of ws) {
    const { start: s, end: e } = windowMs(w);
    start = Math.min(start, s);
    end = Math.max(end, e);
  }
  return { start, end };
}

/** A plan as the app shows and reminds it: an outbound trip hands over to its return plan. */
export type TripPlanResult = PlanResult & { handoffAt?: number; returnTrip?: Trip };

/** Drop windows starting at or after `at`, and days left empty. */
export function clipPlan(plan: Plan, at: number): Plan {
  let changed = false;
  const days: DayPlan[] = [];
  for (const d of plan.days) {
    const windows = d.windows.filter((w) => Date.parse(w.startUtc) < at);
    if (windows.length !== d.windows.length) changed = true;
    if (windows.length > 0 || (d.dayIndex === 0 && d.windows.length === 0)) days.push({ ...d, windows });
    else changed = true;
  }
  return changed ? { ...plan, days } : plan;
}

// computePlan results are cached by input, so (outbound result, return trip, return result)
// identifies a clipped plan; reusing it keeps the plan object stable across renders.
const tripPlanCache = new WeakMap<PlanResult, WeakMap<Trip, { r: PlanResult; out: TripPlanResult }>>();

/**
 * The plan for `trip`. When another trip is its return journey, the outbound plan stops where the
 * return plan starts, so Today, the plan screen and reminders never show both at once.
 * Returns the same object for the same inputs.
 */
export function computeTripPlan(trip: Trip, trips: readonly Trip[]): TripPlanResult {
  const base = computePlan(trip.input);
  if (!base.ok) return base;
  const returnTrip = trips.find((t) => t.returnOf === trip.id);
  if (!returnTrip) return base;
  const r = computePlan(returnTrip.input);
  let byTrip = tripPlanCache.get(base);
  const hit = byTrip?.get(returnTrip);
  if (hit && hit.r === r) return hit.out;
  const span = r.ok ? planSpan(r.plan) : null;
  let out: TripPlanResult;
  if (!span) out = { ...base, returnTrip };
  else {
    const plan = clipPlan(base.plan, span.start);
    out = { ...base, plan, returnTrip, handoffAt: plan === base.plan ? undefined : span.start };
  }
  if (!byTrip) tripPlanCache.set(base, (byTrip = new WeakMap()));
  byTrip.set(returnTrip, { r, out });
  return out;
}

const dayStartCache = new Map<string, number | null>();

/** UTC midnight-to-midnight bounds of a local date in a zone (01:00 if midnight does not exist). */
export function localDayStart(date: string, tz: string): number | null {
  const key = `${date}|${tz}`;
  const hit = dayStartCache.get(key);
  if (hit !== undefined) return hit;
  const a = localToUtc(date, '00:00', tz);
  const b = a.ok ? a : localToUtc(date, '01:00', tz);
  const ms = b.ok ? b.ms : null;
  if (dayStartCache.size > 5000) dayStartCache.clear();
  dayStartCache.set(key, ms);
  return ms;
}

export interface DayRange {
  start: number;
  end: number;
}

/**
 * Time span of `plan.days[i]`. A day is its local date, except the travel day (day 0): it runs
 * until the next plan day starts, so the arrival date belongs to it (SCIENCE.md §11 step 11).
 */
export function dayRange(plan: Plan, i: number): DayRange | null {
  const d = plan.days[i];
  if (!d) return null;
  const start = localDayStart(d.date, d.tz);
  const ownEnd = localDayStart(dateKeyPlusDays(d.date, 1), d.tz);
  if (start == null || ownEnd == null) return null;
  if (d.dayIndex !== 0) return { start, end: ownEnd };
  const next = plan.days[i + 1];
  if (next && next.dayIndex === 1) {
    const ns = localDayStart(next.date, next.tz);
    if (ns != null) return { start, end: Math.max(ownEnd, ns) };
  }
  // No day 1 (short plan, or clipped): extend to the end of the last window's local date.
  let end = ownEnd;
  for (const w of d.windows) {
    const s = Date.parse(w.startUtc);
    const e = localDayStart(dateKeyPlusDays(formatDateKey(s, w.tz), 1), w.tz);
    if (e != null) end = Math.max(end, e);
  }
  return { start, end };
}

/** The plan day whose span contains `now`, with its index. */
export function dayAt(plan: Plan, now: number): { day: DayPlan; index: number; range: DayRange } | null {
  for (let i = 0; i < plan.days.length; i++) {
    const range = dayRange(plan, i);
    if (range && now >= range.start && now < range.end) return { day: plan.days[i]!, index: i, range };
  }
  return null;
}

export interface Strip {
  date: string;
  tz: string;
  start: number;
  end: number;
}

/**
 * The 24-hour strips that show a day: its own local date, plus, for a travel day that runs past
 * that date, the arrival date on the destination clock.
 */
export function dayStrips(plan: Plan, i: number): readonly Strip[] {
  let perPlan = stripsCache.get(plan);
  if (!perPlan) stripsCache.set(plan, (perPlan = []));
  return (perPlan[i] ??= computeDayStrips(plan, i));
}

const stripsCache = new WeakMap<Plan, (readonly Strip[])[]>();

function computeDayStrips(plan: Plan, i: number): Strip[] {
  const d = plan.days[i];
  const range = dayRange(plan, i);
  if (!d || !range) return [];
  const first = localDayStart(d.date, d.tz);
  const firstEnd = localDayStart(dateKeyPlusDays(d.date, 1), d.tz);
  if (first == null || firstEnd == null) return [];
  const out: Strip[] = [{ date: d.date, tz: d.tz, start: first, end: firstEnd }];
  if (range.end > firstEnd + 60000) {
    const other = [...d.windows].reverse().find((w) => w.tz !== d.tz);
    const tz = plan.days[i + 1]?.tz ?? other?.tz ?? d.tz;
    const date = formatDateKey(range.end - 60000, tz);
    const s = localDayStart(date, tz);
    const e = localDayStart(dateKeyPlusDays(date, 1), tz);
    if (s != null && e != null && !(date === d.date && tz === d.tz)) out.push({ date, tz, start: s, end: e });
  }
  return out;
}

/** True when the plan has melatonin windows (the clinician note must be shown with them). */
export function hasMelatonin(plan: Plan): boolean {
  return plan.days.some((d) => d.windows.some((w) => w.kind === 'melatonin'));
}
