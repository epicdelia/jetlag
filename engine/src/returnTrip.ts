/**
 * Return trips (SCIENCE.md §8.1): build the TripInput for the flight home from the outbound
 * trip, carrying the sleep profile and preferences and estimating where the body clock is
 * when the return journey starts.
 */

import { TripInputError, type FlightLeg, type TripInput } from './types';
import { PARAMS } from './params';
import { buildPlanDetailed } from './plan';
import { localDayNumber, localToUtc, parseHHmm, parseInstant } from './time';

/**
 * Body-clock offset (hours AHEAD of the outbound destination's local time; negative = behind)
 * at instant `atMs`, assuming the traveller followed the outbound plan.
 *
 * Simplifying assumptions (documented in SCIENCE.md §8.1):
 * - The body clock moves exactly as the outbound plan's capped linear catch-up says (§10), from
 *   the plan's start. If the return leaves before adaptation completes (a stay shorter than the
 *   outbound estimatedDaysToAdapt), the clock is only partly shifted: offset = −remaining.
 * - Once the outbound plan counts the traveller as adapted (|remaining| ≤ ADAPTED_TOL), the
 *   clock is taken as fully on destination time (offset 0): local light and sleep keep it there.
 * - Stay-on-home-time trips keep the body on the outbound origin's clock; trips too small to
 *   plan ('none', under MIN_SHIFT_TO_PLAN) are treated as absorbed.
 */
export function bodyClockOffsetAt(outbound: TripInput, atMs: number): number {
  // The plan the traveller followed decides the strategy (stayDays can mean stay on home time)...
  const followed = buildPlanDetailed(outbound).plan;
  if (followed.strategy === 'none') return 0;
  if (followed.strategy === 'stay_on_home_time') return clean(-followed.days[0]!.remainingShiftHours);
  // ...but stayDays also truncates the simulated horizon; the return date is known here, so
  // simulate without it.
  const { stayDays: _ignored, ...rest } = outbound;
  const { plan, debug } = buildPlanDetailed(rest);
  let r = plan.plannedShiftHours;
  for (const e of debug.events) if (e.t <= atMs) r = e.remaining;
  if (Math.abs(r) <= PARAMS.ADAPTED_TOL) return 0;
  return clean(-r);
}

/** Round to the quarter hour, clamp to the allowed range and avoid −0. */
function clean(x: number): number {
  const lim = PARAMS.MAX_START_OFFSET_H;
  const r = Math.min(lim, Math.max(-lim, Math.round(x * 4) / 4));
  return r === 0 ? 0 : r;
}

export interface ReturnStart {
  /** Body clock vs the return origin's local time when the return plan starts (hours ahead; − = behind). */
  offsetHours: number;
  /**
   * Most pre-flight days the return plan may use: none of them may start before the outbound
   * plan is done. 0 when the outbound plan has not adapted the traveller by the return departure
   * (the outbound plan is still running), otherwise the full local days between the later of
   * (outbound arrival, outbound adaptation) and the return departure date.
   */
  maxPreDays: number;
}

/**
 * Where the return plan starts (SCIENCE.md §8.1): the body-clock offset at the return plan's
 * first Tmin and the pre-flight days it may use without overlapping the outbound plan.
 */
export function returnStart(outbound: TripInput, returnLegs: FlightLeg[]): ReturnStart {
  const first = returnLegs[0]!;
  const retOrigin = first.from.tz;
  const retDepart = parseInstant(first.departUtc);
  const outArrive = parseInstant(outbound.legs[outbound.legs.length - 1]!.arriveUtc);
  const depDay = localDayNumber(retOrigin, retDepart);
  // Full local days after the arrival night, before the departure date.
  const daysAfter = (ms: number) => Math.max(0, depDay - localDayNumber(retOrigin, ms) - 1);
  const want = Math.min(PARAMS.MAX_PRE_DAYS, Math.max(0, Math.floor(outbound.prefs?.maxPreDays ?? PARAMS.MAX_PRE_DAYS)));

  const followed = buildPlanDetailed(outbound).plan;
  if (followed.strategy === 'none' || followed.strategy === 'stay_on_home_time') {
    return { offsetHours: bodyClockOffsetAt(outbound, retDepart), maxPreDays: Math.min(want, daysAfter(outArrive)) };
  }
  const { stayDays: _ignored, ...rest } = outbound;
  const { debug } = buildPlanDetailed(rest);
  const adapted = debug.events.find((e) => e.phase === 'post' && Math.abs(e.remaining) <= PARAMS.ADAPTED_TOL);
  if (adapted && adapted.t <= retDepart) {
    return { offsetHours: 0, maxPreDays: Math.min(want, daysAfter(Math.max(outArrive, adapted.t))) };
  }
  // Still adapting when the return leaves: no return pre-days (the outbound plan is still
  // running), and the starting offset is read at the return plan's first Tmin, on the morning of
  // the departure date (not later than departure).
  const wake = parseHHmm(outbound.sleep.usualWake);
  const t0 = Number.isFinite(wake) ? Math.min(retDepart, localToUtc(retOrigin, depDay, wake)) : retDepart;
  return { offsetHours: bodyClockOffsetAt(outbound, t0), maxPreDays: 0 };
}

/**
 * TripInput for the journey home. Carries the outbound sleep profile and preferences: the usual
 * bedtime and wake are read on the return origin's clock (the outbound destination), i.e. we
 * assume the traveller kept the same wall-clock sleep times there, which is what the outbound
 * plan scheduled. The body clock's starting phase is passed as `startingBodyClockOffsetHours`
 * (omitted when 0): partial adaptation when the stay was shorter than adaptation took.
 * `prefs.maxPreDays` is capped so the return plan's pre-flight days never overlap the outbound
 * plan (see `returnStart`). No stayDays: the traveller is going home.
 */
export function buildReturnInput(outbound: TripInput, returnLegs: FlightLeg[]): TripInput {
  if (!Array.isArray(returnLegs) || returnLegs.length === 0) {
    throw new TripInputError('At least one return flight leg is required');
  }
  if (!outbound || !Array.isArray(outbound.legs) || outbound.legs.length === 0) {
    throw new TripInputError('The outbound trip needs at least one flight leg');
  }
  const outArrive = parseInstant(outbound.legs[outbound.legs.length - 1]!.arriveUtc);
  const retDepart = parseInstant(returnLegs[0]!.departUtc);
  if (!Number.isFinite(retDepart)) throw new TripInputError('Return leg 1: departUtc is not an ISO-8601 instant');
  if (Number.isFinite(outArrive) && retDepart < outArrive) {
    throw new TripInputError('The return flight departs before the outbound trip arrives');
  }
  const start = returnStart(outbound, returnLegs);
  const offset = start.offsetHours;
  return {
    legs: returnLegs,
    sleep: { ...outbound.sleep },
    prefs: { ...outbound.prefs, maxPreDays: start.maxPreDays },
    ...(offset !== 0 ? { startingBodyClockOffsetHours: offset } : {}),
  };
}
