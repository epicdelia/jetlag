import type { TripInput } from '@jetlag/engine';
import { useMemo } from 'react';

import { computePlan } from '@/lib/plan';
import { outboundAdaptationFraction, returnDraft, withReturnStart, type TripDraft } from '@/lib/trip-edit';
import type { Trip } from '@/lib/types';
import { Banner, T } from './ui';

export interface ReturnTripInfo {
  key: string;
  outbound: Trip;
  draft: TripDraft;
  assumedStay: boolean;
  /** Fraction (0..1) of the outbound shift expected to be done by the time the traveller flies home. */
  adaptedFraction: number | null;
  adjustInput: (input: TripInput) => TripInput;
}

/** Prefill and planning hooks for the journey home from `outbound`. */
export function useReturnTrip(outbound: Trip | undefined): ReturnTripInfo | null {
  return useMemo(() => {
    if (!outbound) return null;
    const r = returnDraft(outbound);
    const plan = computePlan(outbound.input);
    const adaptedFraction = plan.ok ? outboundAdaptationFraction(plan.plan, outbound.input.stayDays) : null;
    return {
      key: `return-${outbound.id}`,
      outbound,
      draft: { legs: r.legs, stay: r.stay, name: r.name },
      assumedStay: r.assumedStay,
      adaptedFraction,
      // Start the return plan from the body clock the outbound plan leaves behind
      // (TripInput.startingBodyClockOffsetHours, from the engine's returnStart), with no
      // pre-flight days that overlap the outbound plan.
      adjustInput: (input) => withReturnStart(input, outbound),
    };
  }, [outbound]);
}

export function ReturnTripIntro({ info }: { info: ReturnTripInfo }) {
  const f = info.adaptedFraction;
  const adaptNote =
    f == null
      ? 'Your outbound trip has no stay length, so Shift cannot tell how far your body clock will have adjusted.'
      : f >= 1
        ? 'Your outbound plan expects you to be adapted to local time by the time you fly home.'
        : f <= 0
          ? 'Your outbound plan keeps you on (or close to) home time, so the way back needs little adjustment.'
          : `Your outbound plan expects you to be about ${Math.round(f * 100)}% adapted when you fly home.`;
  return (
    <Banner tone="info">
      <T variant="small">
        Route reversed from “{info.outbound.name}”. Add the flight times from your return ticket
        {info.assumedStay ? '; the date assumes a one-week stay, so check it' : ''}.
      </T>
      <T variant="small">
        {adaptNote} The return plan starts from that estimate, measured from your outbound arrival to your
        return departure. Days of adjusting before your flight home are only added once the outbound plan is
        done, so the two plans never overlap.
      </T>
    </Banner>
  );
}
