/** Phase marker estimate (SCIENCE.md §1) and the day-to-day Tmin update (§3, §10). */

import { PARAMS } from './params';
import type { Chronotype } from './types';
import { HOUR, MINUTE, mod } from './time';

/** Habitual sleep duration in hours from bedtime/wake given as minutes past midnight. */
export function sleepDurationHours(bedMin: number, wakeMin: number): number {
  return mod(wakeMin - bedMin, 1440) / 60;
}

/** Estimated Tmin as minutes past midnight on the home clock (§1). */
export function tminClockMinutes(bedMin: number, wakeMin: number, chronotype: Chronotype): number {
  const D = sleepDurationHours(bedMin, wakeMin);
  const raw = PARAMS.TMIN_BEFORE_WAKE[chronotype];
  const off = Math.min(Math.max(raw, PARAMS.TMIN_MIN_BEFORE_WAKE), D / 2);
  return mod(wakeMin - off * 60, 1440);
}

export type Phase = 'pre' | 'post';

export interface TminEvent {
  /** Tmin instant, epoch ms. */
  t: number;
  /** Remaining shift (h) at this event, before this event's step is applied. */
  remaining: number;
  phase: Phase;
  index: number;
}

export interface SimulationInput {
  t0: number;
  planned: number;
  departMs: number;
  nPre: number;
  melatonin: boolean;
  horizonEnd: number;
  /**
   * Hours by which the destination's local target has moved since arrival at instant t
   * (destination UTC offset at t minus offset at arrival; 0 before arrival). Lets the
   * remaining shift follow a destination DST change. Default: always 0.
   */
  targetShiftAt?: (t: number) => number;
  /**
   * Per pre-flight event factor (0–1) applied to the pre-flight rate, used when a pre-flight
   * night could only be shifted part of the planned step. Default: 1 for every event.
   */
  preStepScale?: readonly number[];
}

export interface SimulationResult {
  events: TminEvent[];
  estimatedDaysToAdapt: number;
  /** True when the horizon stopped the simulation before adaptation. */
  horizonHit: boolean;
}

function rate(phase: Phase, i: number, dir: number, nPre: number, mel: boolean, scale?: readonly number[]): number {
  if (phase === 'pre') {
    if (i >= nPre) return 0;
    const k = Math.min(Math.max(scale?.[i] ?? 1, 0), 1);
    if (dir > 0) return k * (mel ? PARAMS.PRE_ADV_RATE_MEL : PARAMS.PRE_ADV_RATE);
    return k * PARAMS.PRE_DEL_RATE;
  }
  if (dir > 0) return mel ? PARAMS.POST_ADV_RATE_MEL : PARAMS.POST_ADV_RATE;
  return PARAMS.POST_DEL_RATE;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Capped linear catch-up (§10): Tmin is iterated in UTC (the body clock ignores
 * DST and zones): t_{i+1} = t_i + 24 h − dir·step_i.
 *
 * `base` is the misalignment against the destination target as it stood at arrival
 * (fixed in UTC); the reported `remaining` adds any later move of the local target
 * (destination DST change), so it always means "body clock vs destination local time".
 * Steps only ever go in the planned direction.
 */
export function simulateTmin(input: SimulationInput): SimulationResult {
  const { planned, departMs, nPre, melatonin, horizonEnd } = input;
  const shiftAt = input.targetShiftAt ?? (() => 0);
  const dir = Math.sign(planned);
  const events: TminEvent[] = [];
  let t = input.t0;
  let base = planned;
  let horizonHit = false;
  // Hard stop well beyond any reachable horizon, purely as a safety net.
  for (let i = 0; i < 400; i++) {
    const phase: Phase = t < departMs ? 'pre' : 'post';
    const remaining = round6(base + shiftAt(t));
    events.push({ t, remaining, phase, index: i });
    if (phase === 'post' && Math.abs(remaining) <= PARAMS.ADAPTED_TOL) break;
    if (t > horizonEnd) {
      horizonHit = true;
      break;
    }
    const step = Math.min(rate(phase, i, dir, nPre, melatonin, input.preStepScale), Math.max(0, dir * remaining));
    base = round6(base - dir * step);
    t = Math.round((t + 24 * HOUR - dir * step * HOUR) / MINUTE) * MINUTE;
  }
  const estimatedDaysToAdapt = events.filter(
    (e) => e.phase === 'post' && Math.abs(e.remaining) > PARAMS.ADAPTED_TOL,
  ).length;
  return { events, estimatedDaysToAdapt, horizonHit };
}
