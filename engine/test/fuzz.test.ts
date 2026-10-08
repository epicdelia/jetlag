/**
 * Property-based fuzz suite (fast-check, fixed seed, deterministic). Generators and checks live
 * in fuzz-lib.ts.
 *
 * Inputs: real IANA zones (half/quarter-hour offsets, +13/+14, −11/−12, DST in both hemispheres),
 * departures across 2026–2027 biased toward DST-transition weeks, 1–4 legs of 1–19 h with 1–30 h
 * layovers, sleep profiles (bed 20:00–03:00, wake 04:00–11:00, 4–12 h, any minute), random
 * preferences, stays (none, 1–30 days, some fractional) and occasional starting body-clock offsets.
 *
 * Every property runs over the same seeded sequence of inputs; plans are memoised, so each plan is
 * built once. fast-check shrinks any counterexample.
 *
 * Engine bugs this suite found (2026-10), all fixed; each has a regression test below and its
 * property now runs as a normal assertion:
 *  BUG-1 Long awake spans: no in-flight or post-arrival sleep was planned when neither the
 *        destination night nor ≥ 1.5 h of the body-clock night fell inside the flight, so a
 *        traveller could be told to stay awake 35–45 h. Fix: plan.ts fillLongAwakeSpans
 *        (PARAMS.MAX_AWAKE_HARD_H) adds one sleep, in flight or on the ground, to any span > 30 h.
 *  BUG-2 Duplicate day labels when the arrival date is before the departure date (westward over
 *        the date line). Fix: plan.ts dayIntervals, day 1 is the date after both.
 *  BUG-3 DST-gap bedtime: a habitual bedtime inside a spring-forward gap moved the alarm an hour
 *        late. Fix: journey.ts habitualNight keeps the usual local wake time.
 *  BUG-4 Stay cut-off hid adaptation: the plan could end showing shift still to go though the
 *        model adapts during the stay. Fix: plan.ts keeps the stay's tail days (even empty) until
 *        one shows the model adapted or the stay's last date is reached.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildPlan, TripInputError, type Plan, type TripInput } from '../src';
import {
  CHECKS,
  DAY,
  HOUR,
  addDays,
  detailed,
  iso,
  ms,
  of,
  offsetMin,
  plan,
  tripArb,
  zonesIn,
} from './fuzz-lib';

const SEED = 20261008;
const RUNS = 2000;

function property(check: string) {
  return () =>
    fc.assert(
      fc.property(tripArb, (input) => {
        const v = CHECKS[check]!(input, detailed(input));
        expect(v, JSON.stringify(input)).toEqual([]);
      }),
      { seed: SEED, numRuns: RUNS },
    );
}

describe(`fuzz: ${RUNS} random itineraries per property (seed ${SEED})`, () => {
  it('valid input never throws, does not mutate the input, and is deterministic', () => {
    fc.assert(
      fc.property(tripArb, (input) => {
        const before = JSON.stringify(input);
        const a = buildPlan(input);
        expect(JSON.stringify(input)).toBe(before);
        const b = buildPlan(JSON.parse(before) as TripInput);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(JSON.stringify(plan(input))).toBe(JSON.stringify(a));
      }),
      { seed: SEED, numRuns: RUNS },
    );
  }, 60_000);

  it('windows are sorted, on the 5-minute grid, in the right tz, inside the plan days and stay', property('shape'), 60_000);
  it('nothing is scheduled inside a sleep; sleeps never overlap', property('insideSleep'), 60_000);
  it('seek/avoid light, caffeine_ok/avoid_caffeine and nap/seek_light never overlap', property('contradictions'), 60_000);
  it('no caffeine_ok within 8 h before any sleep', property('caffeine'), 60_000);
  it('light is never sought on the wrong side of the modelled Tmin', property('lightSafety'), 60_000);
  it('sleeps last 2–12 h on the ground (+1 h on a fall-back night), ≥ 1.5 h in flight', property('sleepLength'), 60_000);
  it('preferences are honoured and the zone delta is in (−12, 14]', property('prefs'), 60_000);

  // BUG-4
  it('remaining shift is monotone (DST aside), has the planned sign and ends adapted', property('convergence'), 60_000);
  // BUG-1
  it('no awake span between consecutive sleeps exceeds 30 h', property('sleepGap'), 60_000);
  // BUG-2
  it('each plan day has its own, later, calendar date', property('dates'), 60_000);
  // BUG-3
  it('a destination night ends at the usual wake time on the local clock', property('destWake'), 60_000);
});

// ---------------------------------------------------------------------------
// Regression tests: minimal repros of the bugs above (expected behaviour)
// ---------------------------------------------------------------------------

const one = (from: string, to: string, dep: string, arr: string, bed: string, wake: string, chronotype: 'early' | 'intermediate' | 'late', extra: Partial<TripInput> = {}): TripInput => ({
  legs: [{ from: { tz: from }, to: { tz: to }, departUtc: dep, arriveUtc: arr }],
  sleep: { usualBedtime: bed, usualWake: wake, chronotype },
  prefs: { useMelatonin: false, useCaffeine: true, preAdapt: true },
  ...extra,
});

describe('fuzz: regressions for engine bugs found by fuzzing', () => {
  it('BUG-1: a 9 h overnight Kolkata → Eucla flight never leaves the traveller awake > 30 h', () => {
    const input = one('Asia/Kolkata', 'Australia/Eucla', '2026-03-09T17:46:00Z', '2026-03-10T02:46:00Z', '20:00', '04:00', 'early', {
      prefs: { useMelatonin: true, useCaffeine: false, preAdapt: true },
    });
    // Was: wake 2026-03-08T19:30Z (01:00 IST), no in-flight sleep, next sleep 2026-03-10T11:15Z (39.8 h).
    const p = detailed(input).plan;
    expect(CHECKS.sleepGap!(input, detailed(input))).toEqual([]);
    // One extra sleep between the last pre-flight night and the first night in Eucla.
    const extra = of(p, 'sleep').filter((w) => w.startUtc > '2026-03-08T19:30:00Z' && w.startUtc < '2026-03-10T11:15:00Z');
    expect(extra).toHaveLength(1);
    expect(ms(extra[0]!.endUtc) - ms(extra[0]!.startUtc)).toBeGreaterThanOrEqual(2 * HOUR);
    expect(ms(extra[0]!.endUtc)).toBeLessThanOrEqual(ms('2026-03-09T17:46:00Z'));
  });

  it('BUG-2: HND 00:05 → LAX 17:10 the previous day gives every day its own, later date', () => {
    const input = one('Asia/Tokyo', 'America/Los_Angeles', '2026-11-10T15:05:00Z', '2026-11-11T01:10:00Z', '23:00', '07:00', 'intermediate');
    // Was: day 0 "2026-11-11" (Asia/Tokyo) and day 1 "2026-11-11" (America/Los_Angeles).
    expect(CHECKS.dates!(input, detailed(input))).toEqual([]);
    const days = detailed(input).plan.days.filter((d) => d.dayIndex >= 0);
    expect(days.slice(0, 2).map((d) => [d.dayIndex, d.date, d.tz])).toEqual([
      [0, '2026-11-11', 'Asia/Tokyo'],
      [1, '2026-11-12', 'America/Los_Angeles'],
    ]);
    // The arrival evening (10 Nov in Los Angeles) is part of the travel day.
    const arrivalNight = of(detailed(input).plan, 'sleep').find((w) => w.startUtc === '2026-11-11T07:00:00Z');
    expect(arrivalNight).toBeDefined();
    expect(days[0]!.windows).toContainEqual(arrivalNight);
  });

  it('BUG-3: bedtime 02:30 on the US spring-forward night still wakes the traveller at 09:30', () => {
    const input = one('Europe/London', 'America/New_York', '2026-03-05T11:00:00Z', '2026-03-05T19:00:00Z', '02:30', '09:30', 'late', {
      prefs: { useMelatonin: false, useCaffeine: false, preAdapt: false },
    });
    // Was: sleep 2026-03-08T07:30Z..14:30Z = 03:30–10:30 EDT.
    expect(CHECKS.destWake!(input, detailed(input))).toEqual([]);
    const night = of(detailed(input).plan, 'sleep').find((w) => w.startUtc === '2026-03-08T07:30:00Z');
    expect(night?.endUtc).toBe('2026-03-08T13:30:00Z'); // 09:30 EDT
  });

  it('BUG-4: New York → Anchorage with a 2.75-day stay shows the stay\'s last date, adapted', () => {
    const input = one('America/New_York', 'America/Anchorage', '2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z', '00:00', '05:02', 'early', {
      prefs: { useMelatonin: false, useCaffeine: false, preAdapt: false },
      stayDays: 2.75,
    });
    // Was: last day 2026-10-26 rem −2.5; 2026-10-27 (adapted, −1) was dropped for having no windows.
    expect(CHECKS.convergence!(input, detailed(input))).toEqual([]);
    const last = detailed(input).plan.days.at(-1)!;
    expect([last.date, last.remainingShiftHours]).toEqual(['2026-10-27', -1]);
  });
});

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

type Mutation = (i: TripInput) => unknown;
const MUTATIONS: [string, Mutation][] = [
  ['no legs', (i) => ({ ...i, legs: [] })],
  ['unknown from tz', (i) => ({ ...i, legs: [{ ...i.legs[0]!, from: { tz: 'Mars/Olympus' } }, ...i.legs.slice(1)] })],
  ['raw offset tz', (i) => ({ ...i, legs: [{ ...i.legs[0]!, to: { tz: '+05:00' } }, ...i.legs.slice(1)] })],
  ['empty tz', (i) => ({ ...i, legs: [...i.legs.slice(0, -1), { ...i.legs[i.legs.length - 1]!, to: { tz: '' } }] })],
  ['arrive == depart', (i) => ({ ...i, legs: [{ ...i.legs[0]!, arriveUtc: i.legs[0]!.departUtc }, ...i.legs.slice(1)] })],
  ['bad instant', (i) => ({ ...i, legs: [{ ...i.legs[0]!, departUtc: '2026-13-45 25:00' }, ...i.legs.slice(1)] })],
  ['instant without zone', (i) => ({ ...i, legs: [{ ...i.legs[0]!, departUtc: '2026-05-01T10:00:00' }, ...i.legs.slice(1)] })],
  [
    'legs out of order',
    (i) => {
      const first = i.legs[0]!;
      return { ...i, legs: [first, { ...first, departUtc: iso(ms(first.departUtc) - 3 * HOUR), arriveUtc: iso(ms(first.departUtc) - HOUR) }] };
    },
  ],
  ['bedtime 24:30', (i) => ({ ...i, sleep: { ...i.sleep, usualBedtime: '24:30' } })],
  ['wake "7:00"', (i) => ({ ...i, sleep: { ...i.sleep, usualWake: '7:00' } })],
  ['sleep 2 h', (i) => ({ ...i, sleep: { ...i.sleep, usualBedtime: '23:00', usualWake: '01:00' } })],
  ['sleep 13 h', (i) => ({ ...i, sleep: { ...i.sleep, usualBedtime: '20:00', usualWake: '09:00' } })],
  ['chronotype', (i) => ({ ...i, sleep: { ...i.sleep, chronotype: 'owl' } })],
  ['stayDays 0', (i) => ({ ...i, stayDays: 0 })],
  ['stayDays NaN', (i) => ({ ...i, stayDays: NaN })],
  ['offset 13', (i) => ({ ...i, startingBodyClockOffsetHours: 13 })],
  ['offset string', (i) => ({ ...i, startingBodyClockOffsetHours: '2' })],
  ['melatonin "yes"', (i) => ({ ...i, prefs: { ...i.prefs, useMelatonin: 'yes' } })],
  ['maxPreDays NaN', (i) => ({ ...i, prefs: { ...i.prefs, maxPreDays: NaN } })],
  ['no sleep', (i) => ({ ...i, sleep: undefined })],
];

describe('fuzz: invalid input', () => {
  it('every invalid mutation throws TripInputError (and nothing else)', () => {
    fc.assert(
      fc.property(tripArb, fc.integer({ min: 0, max: MUTATIONS.length - 1 }), (input, m) => {
        const [name, mutate] = MUTATIONS[m]!;
        let err: unknown = null;
        try {
          buildPlan(mutate(input) as TripInput);
        } catch (e) {
          err = e;
        }
        expect(err instanceof TripInputError, `${name}: ${String(err)}`).toBe(true);
      }),
      { seed: SEED, numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Metamorphic properties
// ---------------------------------------------------------------------------

function noTransition(zones: string[], from: number, to: number): boolean {
  for (const z of zones) {
    const o = offsetMin(z, from);
    for (let t = from; t <= to; t += 6 * HOUR) if (offsetMin(z, t) !== o) return false;
  }
  return true;
}
const shiftInput = (i: TripInput, d: number): TripInput => ({
  ...i,
  legs: i.legs.map((l) => ({ ...l, departUtc: iso(ms(l.departUtc) + d), arriveUtc: iso(ms(l.arriveUtc) + d) })),
});

describe('fuzz: metamorphic', () => {
  it('moving the whole trip by +7 days (no DST change in range) moves every window by exactly 7 days', () => {
    fc.assert(
      fc.property(tripArb, (input) => {
        const dep = ms(input.legs[0]!.departUtc);
        const arr = ms(input.legs[input.legs.length - 1]!.arriveUtc);
        fc.pre(noTransition(zonesIn(input), dep - 5 * DAY, arr + 25 * DAY));
        const a = plan(input);
        const b = buildPlan(shiftInput(input, 7 * DAY));
        const moved: Plan = {
          ...a,
          days: a.days.map((d) => ({
            ...d,
            date: addDays(d.date, 7),
            windows: d.windows.map((w) => ({ ...w, startUtc: iso(ms(w.startUtc) + 7 * DAY), endUtc: iso(ms(w.endUtc) + 7 * DAY) })),
          })),
        };
        expect(b).toEqual(moved);
      }),
      { seed: SEED, numRuns: 1000 },
    );
  }, 60_000);

  it('turning melatonin on or off never changes strategy, zone delta or planned shift', () => {
    fc.assert(
      fc.property(tripArb, (input) => {
        const a = plan(input);
        const b = buildPlan({ ...input, prefs: { ...input.prefs, useMelatonin: !input.prefs.useMelatonin } });
        expect([b.strategy, b.zoneDeltaHours, b.plannedShiftHours]).toEqual([a.strategy, a.zoneDeltaHours, a.plannedShiftHours]);
      }),
      { seed: SEED, numRuns: 1000 },
    );
  }, 60_000);

  it('turning caffeine off removes the caffeine windows and changes nothing else', () => {
    fc.assert(
      fc.property(tripArb, (input) => {
        const on = buildPlan({ ...input, prefs: { ...input.prefs, useCaffeine: true } });
        const off = buildPlan({ ...input, prefs: { ...input.prefs, useCaffeine: false } });
        // Compared without empty days: with a stay, an empty tail day can be kept to show the
        // remaining shift, and whether a day is empty depends on its caffeine windows.
        const strip = (p: Plan) =>
          p.days
            .map((d) => ({ ...d, windows: d.windows.filter((w) => w.kind !== 'caffeine_ok' && w.kind !== 'avoid_caffeine') }))
            .filter((d) => d.windows.length > 0 || d.dayIndex === 0);
        expect(strip(off)).toEqual(strip(on));
        expect(of(off, 'caffeine_ok').length + of(off, 'avoid_caffeine').length).toBe(0);
        expect(off.warnings).toEqual(on.warnings);
      }),
      { seed: SEED, numRuns: 800 },
    );
  }, 60_000);

  it('a trip back to the same zone (or a zone with the same offset) has strategy none', () => {
    const TWINS: Record<string, string> = { 'Europe/Berlin': 'Europe/Paris', 'America/New_York': 'America/Toronto', UTC: 'Etc/UTC' };
    fc.assert(
      fc.property(tripArb, fc.boolean(), (input, twin) => {
        const origin = input.legs[0]!.from.tz;
        const destTz = twin && TWINS[origin] ? TWINS[origin]! : origin;
        const legs = input.legs.map((l, k) => (k === input.legs.length - 1 ? { ...l, to: { tz: destTz } } : l));
        const { startingBodyClockOffsetHours: _o, ...rest } = input;
        const p = buildPlan({ ...rest, legs });
        expect(p.strategy).toBe('none');
        expect(p.zoneDeltaHours).toBe(0);
        expect(p.days).toEqual([]);
      }),
      { seed: SEED, numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Performance and awake-span distribution
// ---------------------------------------------------------------------------

describe('fuzz: performance', () => {
  it('every plan builds in < 50 ms', () => {
    const inputs = fc.sample(tripArb, { seed: SEED + 1, numRuns: RUNS });
    // Warm up the JIT and the per-zone Intl formatters (the first use of a zone costs a few ms).
    for (const i of inputs.slice(0, 200)) buildPlan(i);
    const times: number[] = [];
    let worst = { t: 0, input: inputs[0]! };
    const gaps = new Map<string, number>();
    const time = (i: TripInput) => {
      const t0 = performance.now();
      const p = buildPlan(i);
      return { p, dt: performance.now() - t0 };
    };
    for (const i of inputs) {
      const r = time(i);
      const p = r.p;
      // A slow outlier is re-timed (best of 3) so a GC pause is not reported as a slow plan.
      const dt = r.dt < 20 ? r.dt : Math.min(r.dt, time(i).dt, time(i).dt);
      times.push(dt);
      if (dt > worst.t) worst = { t: dt, input: i };
      const s = of(p, 'sleep');
      let max = 0;
      for (let k = 1; k < s.length; k++) max = Math.max(max, (ms(s[k]!.startUtc) - ms(s[k - 1]!.endUtc)) / HOUR);
      const b = max < 16 ? '<16h' : max < 20 ? '16-20h' : max < 24 ? '20-24h' : max < 30 ? '24-30h' : '>=30h';
      gaps.set(b, (gaps.get(b) ?? 0) + 1);
    }
    times.sort((a, b) => a - b);
    const q = (x: number) => times[Math.min(times.length - 1, Math.floor(x * times.length))]!.toFixed(2);
    console.log(
      `[fuzz] build time n=${times.length} median=${q(0.5)}ms p99=${q(0.99)}ms max=${worst.t.toFixed(2)}ms; ` +
        `longest awake span per plan: ${JSON.stringify(Object.fromEntries(gaps))}`,
    );
    expect(worst.t, JSON.stringify(worst.input)).toBeLessThan(50);
  }, 60_000);
});
