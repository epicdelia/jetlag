import { buildPlan, TripInputError, type AdviceWindow, type Plan, type TripInput } from '@jetlag/engine';

import { buildFixturePlan } from './fixture';

export type PlanResult =
  | { ok: true; plan: Plan; fixture: boolean }
  | { ok: false; kind: 'input' | 'engine'; message: string };

/**
 * Development-only escape hatch: set EXPO_PUBLIC_PLAN_FIXTURE=1 to render a
 * synthetic plan instead of calling the engine. Never enabled in production builds.
 */
const USE_FIXTURE = __DEV__ && process.env.EXPO_PUBLIC_PLAN_FIXTURE === '1';

const cache = new Map<string, PlanResult>();

/** Calls the real engine (`buildPlan`). Pure and memoised by input. */
export function computePlan(input: TripInput): PlanResult {
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return hit;
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
  return result;
}

export function windowMs(w: AdviceWindow): { start: number; end: number } {
  return { start: Date.parse(w.startUtc), end: Date.parse(w.endUtc) };
}

export function isPoint(w: AdviceWindow): boolean {
  return w.startUtc === w.endUtc;
}

/** All windows in the plan, sorted by start. */
export function allWindows(plan: Plan): AdviceWindow[] {
  const out: AdviceWindow[] = [];
  for (const d of plan.days) out.push(...d.windows);
  return out.sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
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
