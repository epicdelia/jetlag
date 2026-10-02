/**
 * Round-2 engine changes: 5-minute output grid, in-flight nap on long travel days (§7.1),
 * merging of adjacent same-kind windows, return trips and startingBodyClockOffsetHours (§8.1).
 */
import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  buildReturnInput,
  bodyClockOffsetAt,
  groupContiguousWindows,
  PARAMS,
  TripInputError,
  type AdviceWindow,
} from '../src';
import { buildPlanDetailed, finalizeWindows } from '../src/plan';
import { makeJourney } from '../src/journey';
import { HOUR, MINUTE, formatHHmm } from '../src/time';
import { trip, leg, ms, local, allWindows, windowsOf, overlaps, inside, YYZ_LHR } from './helpers';

const FIVE = 5 * MINUTE;

describe('every window boundary is on the 5-minute grid', () => {
  // Off-grid flight times and habitual sleep: nothing like "nap 14:13" may come out.
  const input = trip(
    [leg('America/Toronto', 'Europe/London', '2026-11-11T02:07:00Z', '2026-11-11T08:53:00Z')],
    { sleep: { usualBedtime: '22:47', usualWake: '06:52' }, prefs: { useMelatonin: true } },
  );
  const plan = buildPlan(input);

  it('rounds starts and ends in UTC and therefore in local time', () => {
    const ws = allWindows(plan);
    expect(ws.length).toBeGreaterThan(10);
    for (const w of ws) {
      expect(ms(w.startUtc) % FIVE).toBe(0);
      expect(ms(w.endUtc) % FIVE).toBe(0);
      expect(local(w)).toMatch(/^\d\d:\d[05]-\d\d:\d[05]$/);
    }
  });

  it('keeps the invariants: no contradictions, nothing inside sleep, naps keep their length', () => {
    const ws = allWindows(plan);
    const sleeps = windowsOf(plan, 'sleep');
    for (const w of ws) if (w.kind !== 'sleep') for (const s of sleeps) expect(inside(w, s)).toBe(false);
    for (const a of windowsOf(plan, 'seek_light')) for (const b of windowsOf(plan, 'avoid_light')) expect(overlaps(a, b)).toBe(false);
    for (const a of windowsOf(plan, 'caffeine_ok')) for (const b of windowsOf(plan, 'avoid_caffeine')) expect(overlaps(a, b)).toBe(false);
    for (const n of windowsOf(plan, 'nap')) {
      for (const s of windowsOf(plan, 'seek_light')) expect(overlaps(n, s)).toBe(false);
      expect(ms(n.endUtc) - ms(n.startUtc)).toBe(PARAMS.NAP_MIN * MINUTE);
    }
  });

  it('a 22:47 habitual bedtime shows as 22:45 (nearest 5 min)', () => {
    const pre = windowsOf(plan, 'sleep').filter((w) => w.tz === 'America/Toronto');
    expect(pre.map(local)).toContain('21:45-05:50'); // first pre-flight night: 1 h earlier
  });

  it('works for :45 zones too (Kathmandu)', () => {
    const p = buildPlan(trip([leg('Europe/London', 'Asia/Kathmandu', '2026-11-10T20:03:00Z', '2026-11-11T07:41:00Z')]));
    for (const w of allWindows(p)) expect(local(w)).toMatch(/^\d\d:\d[05]-\d\d:\d[05]$/);
  });
});

describe('in-flight nap on a long travel day (§7.1)', () => {
  // Regression: SFO → NRT, default 23:00/07:00 intermediate. The last pre-flight night ends at
  // 09:00 PST (17:00Z); no in-flight sleep fits; the next sleep is 23:00 JST (14:00Z) → 21 h awake.
  const SFO_NRT = leg('America/Los_Angeles', 'Asia/Tokyo', '2026-11-12T19:00:00Z', '2026-11-13T06:30:00Z');
  const { plan, debug } = buildPlanDetailed(trip([SFO_NRT]));
  const dep = ms(SFO_NRT.departUtc);
  const arr = ms(SFO_NRT.arriveUtc);
  const naps = windowsOf(plan, 'nap').filter((w) => ms(w.startUtc) >= dep && ms(w.startUtc) < arr);

  it('places no in-flight sleep and one 40-min in-flight nap', () => {
    expect(debug.sleeps.filter((s) => s.kind === 'flight')).toEqual([]);
    expect(naps).toHaveLength(1);
    const n = naps[0]!;
    expect(ms(n.endUtc) - ms(n.startUtc)).toBe(PARAMS.INFLIGHT_NAP_MIN * MINUTE);
    expect(n.tz).toBe('Asia/Tokyo');
    expect(n.rationale).toMatch(/plane/);
    expect(n.rationale).toMatch(/40 min/);
  });

  it('is inside the flight (1 h from takeoff/landing) and ≥ 4 h after waking', () => {
    const n = naps[0]!;
    const woke = Math.max(...debug.sleeps.filter((s) => s.end <= dep).map((s) => s.end));
    expect(ms(n.startUtc)).toBeGreaterThanOrEqual(dep + HOUR);
    expect(ms(n.endUtc)).toBeLessThanOrEqual(arr - HOUR);
    expect(ms(n.startUtc)).toBeGreaterThanOrEqual(woke + PARAMS.FLIGHT_SLEEP_AFTER_WAKE_H * HOUR);
  });

  it('avoids the caffeine cut-off before the next sleep and any seek-light window', () => {
    const n = naps[0]!;
    for (const c of windowsOf(plan, 'avoid_caffeine')) expect(overlaps(n, c)).toBe(false);
    for (const s of windowsOf(plan, 'seek_light')) expect(overlaps(n, s)).toBe(false);
    const next = Math.min(...debug.sleeps.filter((s) => s.start >= arr).map((s) => s.start));
    expect(ms(n.endUtc)).toBeLessThanOrEqual(next - PARAMS.CAFFEINE_CUTOFF_H * HOUR);
  });

  it('sits at the body-clock early afternoon (Tmin + 10 h) when the flight allows it', () => {
    const n = naps[0]!;
    const mid = (ms(n.startUtc) + ms(n.endUtc)) / 2;
    const anchor = Math.max(...debug.events.filter((e) => e.t <= mid).map((e) => e.t)) + 10 * HOUR;
    expect(Math.abs(mid - anchor)).toBeLessThanOrEqual(5 * MINUTE);
    // 15:10 Pacific; Tmin was pre-delayed to 05:30 Pacific, so ≈ 13:40 on the body clock
    expect(formatHHmm('America/Los_Angeles', ms(n.startUtc))).toBe('15:10');
  });

  it('keeps one nap per day: no extra ground nap on the travel day', () => {
    const day = plan.days.find((d) => d.windows.includes(naps[0]!))!;
    expect(day.windows.filter((w) => w.kind === 'nap')).toHaveLength(1);
  });

  it('awake ≥ 22 h → a 90-min (one sleep cycle) nap: JFK → HND leaving 15:00 EST', () => {
    const p = buildPlan(trip([leg('America/New_York', 'Asia/Tokyo', '2026-11-12T20:00:00Z', '2026-11-13T08:00:00Z')]));
    const n = windowsOf(p, 'nap').filter((w) => ms(w.startUtc) < ms('2026-11-13T08:00:00Z'));
    expect(n).toHaveLength(1);
    expect(ms(n[0]!.endUtc) - ms(n[0]!.startUtc)).toBe(PARAMS.INFLIGHT_NAP_LONG_MIN * MINUTE);
    expect(n[0]!.rationale).toMatch(/sleep cycle/);
  });

  it('no in-flight nap when in-flight sleep is placed (Toronto → London overnight)', () => {
    const p = buildPlan(trip([YYZ_LHR]));
    const inFlight = windowsOf(p, 'nap').filter((w) => ms(w.startUtc) < ms(YYZ_LHR.arriveUtc));
    expect(inFlight).toEqual([]);
  });

  it('no in-flight nap on a short wake (eastbound daytime hop, 13 h awake)', () => {
    const p = buildPlan(
      trip([leg('America/Los_Angeles', 'America/New_York', '2026-11-12T16:00:00Z', '2026-11-12T21:30:00Z')], {
        prefs: { preAdapt: false },
      }),
    );
    expect(windowsOf(p, 'nap').filter((w) => ms(w.startUtc) < ms('2026-11-12T21:30:00Z'))).toEqual([]);
  });
});

describe('merging adjacent same-kind windows', () => {
  const j = makeJourney([{ fromTz: 'America/Toronto', toTz: 'Europe/London', dep: ms('2026-11-11T02:00:00Z'), arr: ms('2026-11-11T08:50:00Z') }]);
  const at = (hhmm: string) => ms(`2026-11-12T${hhmm}:00Z`);
  const R = 'Light now would push your body clock the wrong way; keep it dim and wear sunglasses outside.';

  it('merges same kind + tz + wording that touch once rounded', () => {
    const out = finalizeWindows(j, [
      { kind: 'avoid_light', start: at('05:30'), end: at('06:28'), rationale: R },
      { kind: 'avoid_light', start: at('06:31'), end: at('07:45'), rationale: R },
    ]);
    expect(out.map((w) => [w.startUtc, w.endUtc])).toEqual([['2026-11-12T05:30:00Z', '2026-11-12T07:45:00Z']]);
  });

  it('keeps pieces whose wording differs (in-flight vs ground at landing) and the app can group them', () => {
    const out = finalizeWindows(j, [
      { kind: 'avoid_light', start: at('05:30'), end: at('06:30'), rationale: 'on the plane: close the shade' },
      { kind: 'avoid_light', start: at('06:30'), end: at('07:45'), rationale: R },
      { kind: 'caffeine_ok', start: at('06:30'), end: at('09:00'), rationale: 'caffeine' },
    ]);
    expect(out.filter((w) => w.kind === 'avoid_light')).toHaveLength(2);
    const groups = groupContiguousWindows([...out].sort((a, b) => ms(a.startUtc) - ms(b.startUtc)));
    expect(groups.map((g) => g.map((w) => w.kind))).toEqual([['avoid_light', 'avoid_light'], ['caffeine_ok']]);
  });

  it('drops windows rounding shortened below their minimum', () => {
    const out = finalizeWindows(j, [{ kind: 'seek_light', start: at('10:03'), end: at('10:32'), rationale: R }]);
    expect(out).toEqual([]);
  });

  it('real plans: the only same-kind windows left touching are landing splits with different wording', () => {
    const p = buildPlan(trip([leg('America/New_York', 'Asia/Tokyo', '2026-11-12T20:00:00Z', '2026-11-13T08:00:00Z')]));
    const ws = allWindows(p);
    const touching: [AdviceWindow, AdviceWindow][] = [];
    for (const a of ws) for (const b of ws) if (a !== b && a.kind === b.kind && a.tz === b.tz && a.endUtc === b.startUtc) touching.push([a, b]);
    expect(touching.length).toBeGreaterThan(0);
    for (const [a, b] of touching) {
      expect(a.endUtc).toBe('2026-11-13T08:00:00Z'); // landing
      expect(a.rationale).not.toBe(b.rationale);
    }
  });
});

describe('startingBodyClockOffsetHours', () => {
  const LHR_YYZ = leg('Europe/London', 'America/Toronto', '2026-11-12T12:00:00Z', '2026-11-12T19:00:00Z');

  it('defaults to 0 (identical plan when omitted or 0)', () => {
    const a = buildPlan(trip([LHR_YYZ]));
    const b = buildPlan({ ...trip([LHR_YYZ]), startingBodyClockOffsetHours: 0 });
    expect(b).toEqual(a);
    expect(a.plannedShiftHours).toBe(-5);
  });

  it('a body clock still on destination time needs no plan', () => {
    const p = buildPlan({ ...trip([LHR_YYZ]), startingBodyClockOffsetHours: -5 });
    expect(p.strategy).toBe('none');
    expect(p.zoneDeltaHours).toBe(-5);
  });

  it('partial adaptation shrinks the planned shift and moves Tmin on the origin clock', () => {
    const { plan, debug } = buildPlanDetailed({ ...trip([LHR_YYZ]), startingBodyClockOffsetHours: -2.5 });
    expect(plan.strategy).toBe('delay');
    expect(plan.plannedShiftHours).toBe(-2.5);
    expect(plan.zoneDeltaHours).toBe(-5);
    const base = buildPlanDetailed(trip([LHR_YYZ], { prefs: { preAdapt: false } })).debug;
    const off = buildPlanDetailed({ ...trip([LHR_YYZ], { prefs: { preAdapt: false } }), startingBodyClockOffsetHours: -2.5 }).debug;
    // behind by 2.5 h → Tmin 2.5 h later on the London clock
    expect(off.events[0]!.t - base.events[0]!.t).toBe(2.5 * HOUR);
    expect(debug.tminClockMinutes).toBe(base.tminClockMinutes);
    expect(plan.days[0]!.remainingShiftHours).toBeCloseTo(-2.5, 5);
  });

  it('wraps around: ahead by 4 h of Tokyo on the way to New York → advance 6 h', () => {
    const p = buildPlan({
      ...trip([leg('Asia/Tokyo', 'America/New_York', '2026-11-20T02:00:00Z', '2026-11-20T15:00:00Z')]),
      startingBodyClockOffsetHours: 4,
    });
    expect(p.zoneDeltaHours).toBe(10);
    expect(p.strategy).toBe('advance');
    expect(p.plannedShiftHours).toBe(6);
  });

  it('is validated', () => {
    for (const bad of [13, -12.5, Number.NaN, '3' as unknown as number]) {
      expect(() => buildPlan({ ...trip([LHR_YYZ]), startingBodyClockOffsetHours: bad })).toThrow(TripInputError);
    }
  });
});

describe('buildReturnInput', () => {
  const outbound = trip([YYZ_LHR], { stayDays: 10, prefs: { useCaffeine: false } });
  const home = (dep: string, arr: string) => [leg('Europe/London', 'America/Toronto', dep, arr)];

  it('carries the sleep profile and preferences and drops stayDays', () => {
    const r = buildReturnInput(outbound, home('2026-11-21T12:00:00Z', '2026-11-21T19:00:00Z'));
    expect(r.sleep).toEqual(outbound.sleep);
    expect(r.prefs).toEqual(outbound.prefs);
    expect(r.stayDays).toBeUndefined();
    expect(r.legs).toHaveLength(1);
  });

  it('a stay longer than adaptation → fully adapted (no offset): an ordinary 5 h westward plan', () => {
    const r = buildReturnInput(outbound, home('2026-11-21T12:00:00Z', '2026-11-21T19:00:00Z'));
    expect(r.startingBodyClockOffsetHours).toBeUndefined();
    const p = buildPlan(r);
    expect(p.strategy).toBe('delay');
    expect(p.plannedShiftHours).toBe(-5);
  });

  it('a stay shorter than adaptation → partly shifted body clock', () => {
    // Outbound Tmin events after arrival: 11-11 (rem 3.5), 11-12 06:30Z (rem 2.5) — leaving at
    // 12:00Z on 11-12 the body clock is still 2.5 h behind London.
    expect(bodyClockOffsetAt(outbound, ms('2026-11-12T12:00:00Z'))).toBe(-2.5);
    const r = buildReturnInput(outbound, home('2026-11-12T12:00:00Z', '2026-11-12T19:00:00Z'));
    expect(r.startingBodyClockOffsetHours).toBe(-2.5);
    const p = buildPlan(r);
    expect(p.strategy).toBe('delay');
    expect(p.plannedShiftHours).toBe(-2.5);
    expect(p.estimatedDaysToAdapt).toBeLessThan(buildPlan({ ...r, startingBodyClockOffsetHours: 0 }).estimatedDaysToAdapt);
  });

  it('stay on home time outbound → nothing to undo on the way back', () => {
    const short = trip([YYZ_LHR], { stayDays: 2 });
    expect(buildPlan(short).strategy).toBe('stay_on_home_time');
    const r = buildReturnInput(short, home('2026-11-13T12:00:00Z', '2026-11-13T19:00:00Z'));
    expect(r.startingBodyClockOffsetHours).toBe(-5);
    expect(buildPlan(r).strategy).toBe('none');
  });

  it('antidromic outbound (NYC → Tokyo, delay 10 h) partly done → advance the rest on return', () => {
    const out = trip([leg('America/New_York', 'Asia/Tokyo', '2026-11-10T17:00:00Z', '2026-11-11T06:30:00Z')]);
    const r = buildReturnInput(out, [leg('Asia/Tokyo', 'America/New_York', '2026-11-13T02:00:00Z', '2026-11-13T15:00:00Z')]);
    const o = r.startingBodyClockOffsetHours!;
    expect(o).toBeGreaterThan(0); // body clock still ahead of Tokyo (closer to New York)
    const p = buildPlan(r);
    expect(p.zoneDeltaHours).toBe(10);
    expect(p.strategy).toBe('advance');
    expect(p.plannedShiftHours).toBeCloseTo(10 - o, 6);
  });

  it('rejects a return that departs before the outbound arrives, or no legs', () => {
    expect(() => buildReturnInput(outbound, home('2026-11-11T05:00:00Z', '2026-11-11T12:00:00Z'))).toThrow(TripInputError);
    expect(() => buildReturnInput(outbound, [])).toThrow(TripInputError);
  });
});
