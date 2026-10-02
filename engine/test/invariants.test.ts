/** Property-style invariants (SCIENCE.md §13) over a grid of zone pairs, dates and preferences. */
import { describe, expect, it } from 'vitest';
import { buildPlan, PARAMS, type Plan, type TripInput, type AdviceWindow } from '../src';
import { buildPlanDetailed } from '../src/plan';
import { formatWindowLocal } from '../src/format';
import { HOUR, offsetMinutes } from '../src/time';
import { trip, leg, ms, allWindows, windowsOf, overlaps, inside } from './helpers';

const ZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/New_York',
  'America/Sao_Paulo',
  'Atlantic/Azores',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Honolulu',
  'Pacific/Kiritimati',
];

// Departure dates: plain November, around EU spring-forward, around US fall-back.
const DEPARTURES = ['2026-11-10T15:00:00Z', '2026-03-28T22:00:00Z', '2026-10-31T09:00:00Z'];

const SLEEPS = [
  { usualBedtime: '23:00', usualWake: '07:00', chronotype: 'intermediate' as const },
  { usualBedtime: '01:00', usualWake: '09:00', chronotype: 'late' as const },
  { usualBedtime: '21:30', usualWake: '05:30', chronotype: 'early' as const },
];

interface Case {
  name: string;
  input: TripInput;
}

function cases(): Case[] {
  const out: Case[] = [];
  let k = 0;
  for (const a of ZONES) {
    for (const b of ZONES) {
      if (a === b) continue;
      k++;
      const dep = DEPARTURES[k % DEPARTURES.length]!;
      const durH = 2 + ((k * 7) % 17); // 2..18 h
      const arr = new Date(ms(dep) + durH * HOUR).toISOString();
      const sleep = SLEEPS[k % SLEEPS.length]!;
      const prefs = {
        useMelatonin: k % 2 === 0,
        useCaffeine: k % 5 !== 0,
        preAdapt: k % 3 !== 0,
        maxPreDays: 3,
      };
      const stayDays = k % 7 === 0 ? 2 : k % 11 === 0 ? 3.5 : undefined;
      out.push({ name: `${a} → ${b} ${dep.slice(0, 10)} ${durH}h #${k}`, input: trip([leg(a, b, dep, arr)], { sleep, prefs, stayDays }) });
    }
  }
  // multi-leg itineraries with layovers of various lengths
  const multi: [string, string, string][] = [
    ['America/Toronto', 'Europe/Berlin', 'Asia/Kolkata'],
    ['Europe/London', 'Asia/Dubai', 'Australia/Sydney'],
    ['America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Tokyo'],
    ['Asia/Singapore', 'Europe/London', 'America/New_York'],
    ['Australia/Sydney', 'America/Los_Angeles', 'America/New_York'],
  ];
  multi.forEach(([a, b, c], i) => {
    for (const layH of [1, 5, 14, 26]) {
      const d1 = ms('2026-11-10T08:00:00Z') + i * 5 * HOUR;
      const a1 = d1 + (7 + i) * HOUR;
      const d2 = a1 + layH * HOUR;
      const a2 = d2 + (9 + i) * HOUR;
      const iso = (x: number) => new Date(x).toISOString();
      out.push({
        name: `${a} → ${b} → ${c} layover ${layH}h`,
        input: trip([leg(a, b, iso(d1), iso(a1)), leg(b, c, iso(d2), iso(a2))], {
          prefs: { useMelatonin: layH % 2 === 1 },
        }),
      });
    }
  });
  return out;
}

const ALL = cases();
const isPoint = (w: AdviceWindow) => w.startUtc === w.endUtc;

function checkPlan(plan: Plan, input: TripInput) {
  const ws = allWindows(plan);
  const sleeps = windowsOf(plan, 'sleep');

  // zone delta range
  expect(plan.zoneDeltaHours).toBeGreaterThan(-12);
  expect(plan.zoneDeltaHours).toBeLessThanOrEqual(14);

  // estimates
  expect(plan.estimatedDaysToAdapt).toBeGreaterThanOrEqual(0);
  expect(plan.estimatedDaysToAdapt).toBeLessThanOrEqual(PARAMS.MAX_POST_DAYS);
  if (plan.strategy === 'none' || plan.strategy === 'stay_on_home_time') {
    expect(plan.estimatedDaysToAdapt).toBe(0);
    expect(plan.plannedShiftHours).toBe(0);
  }
  if (plan.strategy === 'none') expect(plan.days).toEqual([]);
  else expect(plan.days.some((d) => d.dayIndex === 0)).toBe(true);

  // window shapes
  for (const w of ws) {
    if (w.kind === 'melatonin') expect(isPoint(w)).toBe(true);
    else expect(ms(w.startUtc)).toBeLessThan(ms(w.endUtc));
    expect(w.rationale.length).toBeGreaterThan(10);
    expect(w.rationale).not.toMatch(/\b(cure|treat|prevent|diagnos)/i);
  }

  // nothing inside sleep
  for (const w of ws) {
    if (w.kind === 'sleep') continue;
    for (const s of sleeps) expect(inside(w, s), `${w.kind}@${w.startUtc} in sleep@${s.startUtc}`).toBe(false);
  }
  // sleeps don't overlap each other
  for (let i = 0; i < sleeps.length; i++)
    for (let j = i + 1; j < sleeps.length; j++) expect(overlaps(sleeps[i]!, sleeps[j]!)).toBe(false);

  // contradictory pairs never overlap
  const pairs: [string, string][] = [
    ['seek_light', 'avoid_light'],
    ['caffeine_ok', 'avoid_caffeine'],
    ['nap', 'seek_light'],
  ];
  for (const [x, y] of pairs) {
    const X = ws.filter((w) => w.kind === x);
    const Y = ws.filter((w) => w.kind === y);
    for (const a of X) for (const b of Y) expect(overlaps(a, b), `${x}@${a.startUtc} vs ${y}@${b.startUtc}`).toBe(false);
  }
  // no exact duplicates; same-kind windows never overlap
  const keys = ws.map((w) => `${w.kind}|${w.startUtc}|${w.endUtc}`);
  expect(new Set(keys).size).toBe(keys.length);
  for (const kind of ['seek_light', 'avoid_light', 'caffeine_ok', 'avoid_caffeine', 'nap'] as const) {
    const K = windowsOf(plan, kind);
    for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) expect(overlaps(K[i]!, K[j]!)).toBe(false);
  }

  // light windows are at least 30 min; naps are 20 min, at most one per day
  for (const w of ws.filter((x) => x.kind === 'seek_light' || x.kind === 'avoid_light')) {
    expect(ms(w.endUtc) - ms(w.startUtc)).toBeGreaterThanOrEqual(0.5 * HOUR);
  }
  for (const d of plan.days) {
    const naps = d.windows.filter((w) => w.kind === 'nap');
    expect(naps.length).toBeLessThanOrEqual(1);
    for (const n of naps) expect(ms(n.endUtc) - ms(n.startUtc)).toBe(20 * 60_000);
  }

  // realistic sleep: ground sleep ≤ 12 h and never starts mid-afternoon on the local clock.
  // (In-flight and layover sleep follow the destination clock and may fall at any local hour.)
  const legs = input.legs.map((l) => [ms(l.departUtc), ms(l.arriveUtc)] as const);
  const lastArr = legs[legs.length - 1]![1];
  const firstDep = legs[0]![0];
  for (const s of sleeps) {
    const len = ms(s.endUtc) - ms(s.startUtc);
    expect(len).toBeLessThanOrEqual(12 * HOUR);
    const st = ms(s.startUtc);
    const onGround = st < firstDep || st >= lastArr;
    if (!onGround) continue;
    const h = Number(formatWindowLocal(s).startLocal.slice(0, 2));
    const homeTime = plan.strategy === 'stay_on_home_time' && st >= lastArr;
    if (!homeTime) expect(h >= 17 || h < 9, `bedtime ${formatWindowLocal(s).startLocal} in ${s.tz}`).toBe(true);
  }

  // sorting and day structure
  const idx = plan.days.map((d) => d.dayIndex);
  for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThan(idx[i - 1]!);
  const starts = ws.map((w) => ms(w.startUtc));
  for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThanOrEqual(starts[i - 1]!);
  for (const d of plan.days) if (d.dayIndex !== 0) expect(d.windows.length).toBeGreaterThan(0);

  // remaining shift: |rem| non-increasing; sign matches plan until adapted; ends adapted
  if (plan.strategy === 'advance' || plan.strategy === 'delay') {
    const rem = plan.days.map((d) => d.remainingShiftHours);
    for (let i = 1; i < rem.length; i++) expect(Math.abs(rem[i]!)).toBeLessThanOrEqual(Math.abs(rem[i - 1]!) + 1e-9);
    for (const r of rem) {
      if (Math.abs(r) > PARAMS.ADAPTED_TOL) expect(Math.sign(r)).toBe(Math.sign(plan.plannedShiftHours));
    }
    expect(Math.abs(rem[0]!)).toBeLessThanOrEqual(Math.abs(plan.plannedShiftHours) + 0.05);
    const horizonLimited = plan.warnings.some((w) => w.startsWith('Plan covers'));
    if (!horizonLimited) {
      expect(Math.abs(rem[rem.length - 1]!)).toBeLessThanOrEqual(PARAMS.ADAPTED_TOL);
      // estimatedDaysToAdapt matches the post-departure days still above tolerance (± the travel day)
      const postDays = plan.days.filter((d) => d.dayIndex >= 0);
      expect(plan.estimatedDaysToAdapt).toBeLessThanOrEqual(postDays.length);
    }
    expect(plan.strategy === 'advance').toBe(plan.plannedShiftHours > 0);
    if (plan.strategy === 'delay' && plan.zoneDeltaHours > 0) {
      expect(plan.zoneDeltaHours).toBeGreaterThanOrEqual(PARAMS.ANTIDROMIC_EAST_THRESHOLD);
    }
  } else if (plan.strategy === 'stay_on_home_time') {
    for (const d of plan.days) expect(Math.abs(d.remainingShiftHours - plan.zoneDeltaHours)).toBeLessThan(0.051);
  }

  // preferences
  if (!input.prefs.useMelatonin || plan.strategy !== 'advance') expect(windowsOf(plan, 'melatonin')).toEqual([]);
  if (!input.prefs.useCaffeine) {
    expect(windowsOf(plan, 'caffeine_ok')).toEqual([]);
    expect(windowsOf(plan, 'avoid_caffeine')).toEqual([]);
  }
  const postDoses = windowsOf(plan, 'melatonin').filter((w) => ms(w.startUtc) >= firstDep);
  expect(postDoses.length).toBeLessThanOrEqual(PARAMS.MELATONIN_MAX_POST_DOSES);
}

describe(`invariants over ${ALL.length} itineraries`, () => {
  it('every plan satisfies the SCIENCE.md invariants', () => {
    for (const c of ALL) {
      let plan: Plan;
      try {
        plan = buildPlan(c.input);
      } catch (e) {
        throw new Error(`${c.name}: ${String(e)}`);
      }
      try {
        checkPlan(plan, c.input);
      } catch (e) {
        throw new Error(`${c.name}: ${(e as Error).message}`);
      }
    }
  });

  it('strategy, delta and planned shift are independent of melatonin and caffeine preferences', () => {
    for (const c of ALL) {
      const base = buildPlan(c.input);
      for (const useMelatonin of [true, false]) {
        for (const useCaffeine of [true, false]) {
          const p = buildPlan({ ...c.input, prefs: { ...c.input.prefs, useMelatonin, useCaffeine } });
          expect([p.strategy, p.zoneDeltaHours, p.plannedShiftHours], c.name).toEqual([
            base.strategy,
            base.zoneDeltaHours,
            base.plannedShiftHours,
          ]);
        }
      }
    }
  });

  it('melatonin never slows adaptation; pre-adapting never slows it either', () => {
    // Compare full estimates: a stayDays horizon truncates the count differently per variant.
    for (const c0 of ALL) {
      const { stayDays: _ignored, ...rest } = c0.input;
      const c = { ...c0, input: rest as TripInput };
      const off = buildPlan({ ...c.input, prefs: { ...c.input.prefs, useMelatonin: false } });
      const on = buildPlan({ ...c.input, prefs: { ...c.input.prefs, useMelatonin: true } });
      expect(on.estimatedDaysToAdapt, c.name).toBeLessThanOrEqual(off.estimatedDaysToAdapt);
      const noPre = buildPlan({ ...c.input, prefs: { ...c.input.prefs, preAdapt: false } });
      const pre = buildPlan({ ...c.input, prefs: { ...c.input.prefs, preAdapt: true } });
      expect(pre.estimatedDaysToAdapt, c.name).toBeLessThanOrEqual(noPre.estimatedDaysToAdapt);
    }
  });

  it('Tmin events step by 24 h ∓ step in UTC and remaining moves monotonically to 0', () => {
    for (const c of ALL) {
      const { plan, debug } = buildPlanDetailed(c.input);
      if (plan.strategy !== 'advance' && plan.strategy !== 'delay') continue;
      const dir = Math.sign(plan.plannedShiftHours);
      const ev = debug.events;
      // remaining = fixed-UTC catch-up + any later move of the destination's local target (DST, §10).
      const arr = ms(c.input.legs[c.input.legs.length - 1]!.arriveUtc);
      const dest = c.input.legs[c.input.legs.length - 1]!.to.tz;
      const adj = (t: number) => (t < arr ? 0 : (offsetMinutes(dest, t) - offsetMinutes(dest, arr)) / 60);
      for (let i = 1; i < ev.length; i++) {
        const step = (ev[i - 1]!.remaining - adj(ev[i - 1]!.t) - (ev[i]!.remaining - adj(ev[i]!.t))) * dir;
        expect(step, c.name).toBeGreaterThanOrEqual(-1e-6);
        expect(Math.abs(ev[i]!.t - ev[i - 1]!.t - (24 * HOUR - dir * step * HOUR)), c.name).toBeLessThanOrEqual(60_000);
      }
      const post = ev.filter((e) => e.phase === 'post' && Math.abs(e.remaining) > PARAMS.ADAPTED_TOL);
      expect(post.length, c.name).toBe(plan.estimatedDaysToAdapt);
    }
  });

  it('is deterministic', () => {
    for (const c of ALL.slice(0, 40)) expect(JSON.stringify(buildPlan(c.input))).toBe(JSON.stringify(buildPlan(c.input)));
  });
});
