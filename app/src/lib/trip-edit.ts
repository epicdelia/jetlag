import { PARAMS, returnStart, type Plan, type Preferences, type ReturnStart, type TripInput } from '@jetlag/engine';

import type { LegDraft, Trip } from './types';
import { dateKeyPlusDays, formatDateKey, formatTime } from './tz';

/** Form state for a trip: what the New / Edit trip screen starts from. */
export interface TripDraft {
  legs: LegDraft[];
  stay: string;
  name: string;
}

/**
 * The legs as the user entered them. Falls back to rebuilding wall-clock values from the
 * stored UTC instants (each in its airport's zone) if the saved drafts are missing or stale.
 */
export function legDraftsFromTrip(trip: Trip): LegDraft[] {
  const saved = trip.legsLocal;
  if (Array.isArray(saved) && saved.length === trip.input.legs.length && saved.length > 0) {
    return saved.map((l) => ({ ...l }));
  }
  return trip.input.legs.map((l) => {
    const dep = Date.parse(l.departUtc);
    const arr = Date.parse(l.arriveUtc);
    return {
      fromTz: l.from.tz,
      fromLabel: l.from.label ?? '',
      toTz: l.to.tz,
      toLabel: l.to.label ?? '',
      departDate: formatDateKey(dep, l.from.tz),
      departTime: formatTime(dep, l.from.tz),
      arriveDate: formatDateKey(arr, l.to.tz),
      arriveTime: formatTime(arr, l.to.tz),
    };
  });
}

/** Prefill for editing an existing trip. */
export function editDraft(trip: Trip): TripDraft {
  return {
    legs: legDraftsFromTrip(trip),
    stay: trip.input.stayDays != null ? String(trip.input.stayDays) : '',
    name: trip.name,
  };
}

/** Days assumed at the destination when the outbound trip has no stay length. */
export const DEFAULT_RETURN_AFTER_DAYS = 7;

/**
 * Prefill for the return journey: the outbound route reversed (destination → origin), legs in
 * reverse order. Flight times are left blank for the user to fill in from the ticket; the date
 * defaults to the outbound arrival date plus the stay length.
 */
export function returnDraft(trip: Trip): TripDraft & { returnDate: string; assumedStay: boolean } {
  const out = legDraftsFromTrip(trip);
  const last = out[out.length - 1];
  const stay = trip.input.stayDays;
  const assumedStay = stay == null;
  const after = Math.max(1, Math.round(stay ?? DEFAULT_RETURN_AFTER_DAYS));
  const returnDate = last?.arriveDate ? dateKeyPlusDays(last.arriveDate, after) : '';
  const legs: LegDraft[] = [...out].reverse().map((l) => ({
    fromTz: l.toTz,
    fromLabel: l.toLabel,
    toTz: l.fromTz,
    toLabel: l.fromLabel,
    departDate: returnDate,
    departTime: '',
    arriveDate: returnDate,
    arriveTime: '',
  }));
  return { legs, stay: '', name: '', returnDate, assumedStay };
}

/**
 * How far the traveller's body clock is expected to have moved toward the destination by the
 * time they fly home, as a fraction 0..1 of the outbound planned shift. Used only for the
 * explanatory note on the return form; the plan itself uses the engine's `returnStart`.
 */
export function outboundAdaptationFraction(plan: Plan, stayDays: number | undefined): number | null {
  if (plan.strategy !== 'advance' && plan.strategy !== 'delay') return 0;
  if (stayDays == null) return null;
  if (plan.estimatedDaysToAdapt <= 0) return 1;
  return Math.max(0, Math.min(1, stayDays / plan.estimatedDaysToAdapt));
}

/** Limit pre-flight days (the engine never plans more than `maxPreDays`). */
function capPreDays(prefs: Preferences, max: number): Preferences {
  if (!prefs.preAdapt) return prefs;
  const want = prefs.maxPreDays ?? PARAMS.MAX_PRE_DAYS;
  if (max <= 0) return { ...prefs, preAdapt: false, maxPreDays: 0 };
  return max < want ? { ...prefs, maxPreDays: max } : prefs;
}

/**
 * Return-trip engine input: the plan starts from the body clock the outbound plan leaves behind
 * (engine `returnStart`, SCIENCE.md §8.1) rather than from one fully adapted to the destination,
 * and its pre-flight days never overlap the outbound plan (none while the outbound plan is still
 * adapting the traveller when they fly home).
 */
export function withReturnStart(input: TripInput, outbound: Trip): TripInput {
  let start: ReturnStart;
  try {
    start = returnStart(outbound.input, input.legs);
  } catch {
    return input;
  }
  const { startingBodyClockOffsetHours: _drop, ...rest } = input;
  const prefs = capPreDays(input.prefs, start.maxPreDays);
  return start.offsetHours === 0
    ? { ...rest, prefs }
    : { ...rest, prefs, startingBodyClockOffsetHours: start.offsetHours };
}

/**
 * Editing a return trip whose outbound trip was deleted: nothing to recompute the starting body
 * clock from, so keep the estimate (and pre-flight limit) saved with the return trip.
 */
export function keepSavedReturnStart(input: TripInput, saved: TripInput): TripInput {
  const { startingBodyClockOffsetHours: _drop, ...rest } = input;
  const savedMax = saved.prefs.preAdapt ? (saved.prefs.maxPreDays ?? PARAMS.MAX_PRE_DAYS) : 0;
  const prefs = capPreDays(input.prefs, savedMax);
  const off = saved.startingBodyClockOffsetHours;
  return off ? { ...rest, prefs, startingBodyClockOffsetHours: off } : { ...rest, prefs };
}
