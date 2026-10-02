/** Regressions for the third review round (engine review + e2e QA, 2026-10-02). */
import { describe, expect, it } from 'vitest';
import { buildPlan, buildReturnInput, returnStart, PARAMS, type Plan, type TripInput } from '../src';
import { buildPlanDetailed } from '../src/plan';
import { formatWindowLocal } from '../src/format';
import { HOUR, wallParts } from '../src/time';
import { trip, leg, ms, allWindows, windowsOf } from './helpers';

const flyingIn = (input: TripInput, t: number) =>
  input.legs.some((l) => t >= ms(l.departUtc) && t < ms(l.arriveUtc));

/** Gaps (h) between consecutive planned sleeps, with what lies between. */
function gaps(input: TripInput) {
  const { debug } = buildPlanDetailed(input);
  const sl = debug.sleeps;
  return sl.slice(1).map((S, i) => ({ from: sl[i]!.end, to: S.start, h: (S.start - sl[i]!.end) / HOUR, events: debug.events }));
}

describe('awake cap applies to legs that already have some in-flight sleep (review: 28 h awake)', () => {
  const CDG_SYD = trip([leg('Europe/Paris', 'Australia/Sydney', '2026-11-10T00:00:00Z', '2026-11-10T15:00:00Z')]);
  const MEL_DXB_LHR = trip([
    leg('Australia/Melbourne', 'Asia/Dubai', '2026-11-10T11:15:00Z', '2026-11-11T02:00:00Z'),
    leg('Asia/Dubai', 'Europe/London', '2026-11-11T03:45:00Z', '2026-11-11T11:30:00Z'),
  ]);
  const DEL_YYZ = trip([leg('Asia/Kolkata', 'America/Toronto', '2026-11-10T18:10:00Z', '2026-11-11T10:20:00Z')]);

  it('CDG → SYD: sleeps in the body-clock night on the plane, not 28 h awake', () => {
    const { debug } = buildPlanDetailed(CDG_SYD);
    const lastPre = Math.max(...debug.sleeps.filter((S) => S.end <= ms('2026-11-10T00:00:00Z')).map((S) => S.end));
    const firstAfter = Math.min(...debug.sleeps.filter((S) => S.start >= lastPre).map((S) => S.start));
    expect((firstAfter - lastPre) / HOUR).toBeLessThanOrEqual(PARAMS.MAX_AWAKE_H);
    // The body-clock night (≈ 01:00–07:00Z) is a planned in-flight sleep, so no seek-light then.
    const plan = buildPlan(CDG_SYD);
    const sleepAt3 = windowsOf(plan, 'sleep').some((w) => ms(w.startUtc) <= ms('2026-11-10T03:00:00Z') && ms(w.endUtc) > ms('2026-11-10T03:00:00Z'));
    expect(sleepAt3).toBe(true);
    for (const w of windowsOf(plan, 'seek_light')) {
      expect(ms(w.endUtc) <= ms('2026-11-10T01:00:00Z') || ms(w.startUtc) >= ms('2026-11-10T04:30:00Z')).toBe(true);
    }
  });

  it('MEL → DXB → LHR and DEL → YYZ: the first sleep after leaving home comes within MAX_AWAKE_H', () => {
    for (const input of [MEL_DXB_LHR, DEL_YYZ]) {
      const dep = ms(input.legs[0]!.departUtc);
      const g = gaps(input).find((x) => x.to > dep - 2 * HOUR);
      expect(g!.h).toBeLessThanOrEqual(PARAMS.MAX_AWAKE_H);
    }
  });

  it('two in-flight sleeps on one leg are never minutes apart (re-checked after the body-night sleep)', () => {
    for (const input of [MEL_DXB_LHR, DEL_YYZ, CDG_SYD]) {
      const { debug } = buildPlanDetailed(input);
      const fl = debug.sleeps.filter((S) => S.kind === 'flight');
      for (let i = 1; i < fl.length; i++) {
        expect(fl[i]!.start - fl[i - 1]!.end).toBeGreaterThanOrEqual(PARAMS.FLIGHT_SLEEP_AFTER_WAKE_H * HOUR);
      }
    }
  });

  it('over a grid: no >20 h awake span leaves ≥1.5 h of in-flight body-clock night awake, and every >22 h span has a nap', () => {
    const zones = ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Honolulu'];
    let checked = 0;
    for (const a of zones) {
      for (const b of zones) {
        if (a === b) continue;
        for (const depH of [0, 6, 12, 18]) {
          for (const dur of [8, 13, 17]) {
            const dep = Date.UTC(2026, 10, 10, depH);
            const arr = dep + dur * HOUR;
            const input = trip([leg(a, b, new Date(dep).toISOString(), new Date(arr).toISOString())]);
            const { plan, debug } = buildPlanDetailed(input);
            if (plan.strategy === 'none') continue;
            checked++;
            const naps = windowsOf(plan, 'nap').map((w) => ms(w.startUtc));
            for (const g of gaps(input)) {
              if (g.to > arr + 48 * HOUR) break;
              if (g.h > PARAMS.MAX_AWAKE_H) {
                let bodyNightAwake = 0;
                for (const e of debug.events) {
                  const lo = Math.max(e.t - 5 * HOUR, dep + HOUR, g.from + PARAMS.FLIGHT_SLEEP_AFTER_WAKE_H * HOUR);
                  const hi = Math.min(e.t + 3 * HOUR, arr - HOUR, g.to);
                  if (hi > lo) bodyNightAwake += hi - lo;
                }
                expect(bodyNightAwake, `${a} → ${b} ${depH}:00 ${dur}h`).toBeLessThan(1.5 * HOUR);
              }
              if (g.h > 22) expect(naps.some((t) => t > g.from && t < g.to), `${a} → ${b} ${depH}:00 ${dur}h`).toBe(true);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('return trips never overlap the outbound plan (review: opposite advice on the same date)', () => {
  const home = (dep: string, arr: string) => [leg('Europe/London', 'America/Toronto', dep, arr)];
  const outbound = trip([leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00Z', '2026-11-11T08:50:00Z')], { stayDays: 3 });

  it('outbound still adapting at the return departure → no return pre-days; offset read on the departure morning', () => {
    const legs = home('2026-11-13T11:00:00Z', '2026-11-13T19:00:00Z');
    const start = returnStart(outbound, legs);
    expect(start).toEqual({ offsetHours: -1.5, maxPreDays: 0 });
    const r = buildReturnInput(outbound, legs);
    expect(r.prefs.maxPreDays).toBe(0);
    const p = buildPlan(r);
    expect(p.days[0]!.dayIndex).toBe(0);
    expect(p.days[0]!.date).toBe('2026-11-13');
    // No return window before the outbound arrival.
    for (const w of allWindows(p)) expect(ms(w.startUtc)).toBeGreaterThanOrEqual(ms('2026-11-11T08:50:00Z'));
  });

  it('JFK → HND then home two days later: no Tokyo advice before the outbound lands', () => {
    const out = trip([leg('America/New_York', 'Asia/Tokyo', '2026-11-10T17:00:00Z', '2026-11-11T06:30:00Z')]);
    const r = buildReturnInput(out, [leg('Asia/Tokyo', 'America/New_York', '2026-11-13T02:00:00Z', '2026-11-13T15:00:00Z')]);
    expect(r.prefs.maxPreDays).toBe(0);
    for (const w of allWindows(buildPlan(r))) expect(ms(w.startUtc)).toBeGreaterThanOrEqual(ms('2026-11-11T06:30:00Z'));
  });

  it('a long stay → pre-days only after the outbound plan has adapted the traveller', () => {
    const long = trip([leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00Z', '2026-11-11T08:50:00Z')], { stayDays: 5 });
    const legs = home('2026-11-16T11:00:00Z', '2026-11-16T19:00:00Z');
    const out = buildPlanDetailed({ ...long, stayDays: undefined });
    const adaptedAt = out.debug.events.find((e) => e.phase === 'post' && Math.abs(e.remaining) <= PARAMS.ADAPTED_TOL)!.t;
    const r = buildReturnInput(long, legs);
    expect(r.startingBodyClockOffsetHours).toBeUndefined();
    expect(r.prefs.maxPreDays).toBe(1); // adapted on 11-14 → only 11-15 is free before the 11-16 flight
    const p = buildPlan(r);
    expect(Math.min(...allWindows(p).map((w) => ms(w.startUtc)))).toBeGreaterThan(adaptedAt);
  });
});

describe('no in-flight "sleep" at body-clock midday right after a full night (review: LHR → LAX)', () => {
  const LHR_LAX = trip([leg('Europe/London', 'America/Los_Angeles', '2026-11-10T11:00:00Z', '2026-11-10T22:15:00Z')]);

  it('no sleep window within 8 h of waking, and no "skip caffeine until bedtime" at wake', () => {
    const plan = buildPlan(LHR_LAX);
    const wake = ms('2026-11-10T09:00:00Z');
    for (const w of windowsOf(plan, 'sleep')) {
      if (ms(w.startUtc) > wake) expect(ms(w.startUtc) - wake).toBeGreaterThanOrEqual(PARAMS.FLIGHT_SLEEP_PRESSURE_H * HOUR);
    }
    for (const w of windowsOf(plan, 'avoid_caffeine', 0)) expect(ms(w.startUtc)).not.toBe(wake);
    // A caffeine_ok window starts at that wake instead, and the long day gets an in-flight nap.
    expect(windowsOf(plan, 'caffeine_ok', 0).some((w) => ms(w.startUtc) === wake)).toBe(true);
    expect(windowsOf(plan, 'nap', 0).some((w) => flyingIn(LHR_LAX, ms(w.startUtc)))).toBe(true);
  });
});

describe('arrival-day nap and caffeine exemptions follow the arrival day, not day 0 (review: HNL → SYD)', () => {
  it('a date-line arrival on day 1 keeps its nap and caffeine_ok', () => {
    const plan = buildPlan(trip([leg('Pacific/Honolulu', 'Australia/Sydney', '2026-11-11T09:00:00Z', '2026-11-11T19:00:00Z')]));
    const day1 = plan.days.find((d) => d.dayIndex === 1)!;
    expect(day1.date).toBe('2026-11-12');
    expect(Math.abs(day1.remainingShiftHours)).toBeLessThan(PARAMS.NAP_REMAINING);
    expect(day1.windows.some((w) => w.kind === 'nap')).toBe(true);
    expect(day1.windows.some((w) => w.kind === 'caffeine_ok')).toBe(true);
  });
});

describe('a known stay ends the plan (review: advice after the traveller has left)', () => {
  it('LHR → SIN, stay 4: nothing after the local date the stay ends', () => {
    const plan = buildPlan(trip([leg('Europe/London', 'Asia/Singapore', '2026-11-10T21:00:00Z', '2026-11-11T09:00:00Z')], { stayDays: 4 }));
    const lastDate = plan.days[plan.days.length - 1]!.date;
    expect(lastDate).toBe('2026-11-15');
    for (const w of allWindows(plan)) expect(ms(w.startUtc)).toBeLessThan(ms('2026-11-15T16:00:00Z')); // 11-16 00:00 SGT
  });

  it('YYZ → LHR, stay 3: no window after 11-14', () => {
    const plan = buildPlan(trip([leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00Z', '2026-11-11T08:50:00Z')], { stayDays: 3 }));
    for (const w of allWindows(plan)) expect(ms(w.startUtc)).toBeLessThan(ms('2026-11-15T00:00:00Z'));
  });
});

describe('ground naps keep clear of the body-clock night and Tmin (review: 07:30 nap after a 05:30 wake)', () => {
  it('LAX → CDG early chronotype and LHR → SIN: every ground nap is ≥ Tmin + 2 h and outside the body night', () => {
    const cases = [
      trip([leg('America/Los_Angeles', 'Europe/Paris', '2026-11-10T23:30:00Z', '2026-11-11T10:30:00Z')], {
        sleep: { usualBedtime: '21:30', usualWake: '05:30', chronotype: 'early' },
      }),
      trip([leg('Europe/London', 'Asia/Singapore', '2026-11-10T21:00:00Z', '2026-11-11T09:00:00Z')]),
    ];
    for (const input of cases) {
      const { plan, debug } = buildPlanDetailed(input);
      const naps = windowsOf(plan, 'nap').filter((w) => !flyingIn(input, ms(w.startUtc)));
      expect(naps.length).toBeGreaterThan(0);
      for (const n of naps) {
        const s = ms(n.startUtc);
        for (const e of debug.events) {
          // never inside [Tmin − (sleep length − Tmin-before-wake), Tmin + 2 h)
          expect(s >= e.t + PARAMS.NAP_AFTER_TMIN_H * HOUR || s + 20 * 60_000 <= e.t - 5 * HOUR, `${n.startUtc}`).toBe(true);
        }
      }
    }
  });
});

describe('daylight wording (review: "ideally daylight" after sunset, sunglasses at night)', () => {
  const plans: [string, Plan][] = [
    ['MEL→DXB→LHR', buildPlan(trip([
      leg('Australia/Melbourne', 'Asia/Dubai', '2026-11-10T11:15:00Z', '2026-11-11T02:00:00Z'),
      leg('Asia/Dubai', 'Europe/London', '2026-11-11T03:45:00Z', '2026-11-11T11:30:00Z'),
    ]))],
    ['LHR→LAX', buildPlan(trip([leg('Europe/London', 'America/Los_Angeles', '2026-11-10T11:00:00Z', '2026-11-10T22:15:00Z')]))],
    ['YYZ→LHR', buildPlan(trip([leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00Z', '2026-11-11T08:50:00Z')]))],
    ['LAX→SYD', buildPlan(trip([leg('America/Los_Angeles', 'Australia/Sydney', '2026-11-11T06:00:00Z', '2026-11-11T19:30:00Z')]))],
  ];
  const hourOf = (tz: string, t: number) => {
    const p = wallParts(tz, t);
    return p.hour + p.minute / 60;
  };
  const allIn = (tz: string, s: number, e: number, test: (h: number) => boolean) => {
    for (let t = s; t < e; t += 15 * 60_000) if (!test(hourOf(tz, t))) return false;
    return test(hourOf(tz, e - 60_000));
  };

  it('"ideally daylight" only for windows inside the year-round daylight band; no sunglasses in the dark', () => {
    for (const [name, plan] of plans) {
      for (const w of allWindows(plan)) {
        const s = ms(w.startUtc);
        const e = ms(w.endUtc);
        if (w.kind === 'seek_light' && w.rationale.includes('ideally daylight')) {
          expect(allIn(w.tz, s, e, (h) => h >= PARAMS.DAYLIGHT_CORE_HOURS[0] && h < PARAMS.DAYLIGHT_CORE_HOURS[1]), `${name} ${formatWindowLocal(w).startLocal}`).toBe(true);
        }
        if (w.kind === 'avoid_light' && w.rationale.includes('sunglasses')) {
          expect(allIn(w.tz, s, e, (h) => h < PARAMS.DAYLIGHT_HOURS[0] || h >= PARAMS.DAYLIGHT_HOURS[1]), `${name} ${formatWindowLocal(w).startLocal}`).toBe(false);
        }
      }
    }
  });

  it('LHR → LAX arrival-evening light says daylight only while it is light out', () => {
    const [, plan] = plans[1]!;
    const evening = windowsOf(plan, 'seek_light', 0).find((w) => formatWindowLocal(w).startLocal === '16:30')!;
    expect(evening.rationale).toMatch(/while it's light out/);
  });

  it('in-flight seek light at night leads with the reading light, not the window shade', () => {
    for (const [, plan] of plans) {
      for (const w of windowsOf(plan, 'seek_light')) {
        if (!w.rationale.includes('reading light') && !w.rationale.includes('window shade')) continue;
        const s = ms(w.startUtc);
        const e = ms(w.endUtc);
        const dark = allIn(w.tz, s, e, (h) => h < PARAMS.DAYLIGHT_HOURS[0] || h >= PARAMS.DAYLIGHT_HOURS[1]);
        if (dark) expect(w.rationale).not.toMatch(/window shade/);
      }
    }
  });
});

describe('bedtimes after midnight are listed under the day they belong to (review: BOS → CDG, late)', () => {
  it('each pre-flight day shows exactly one night', () => {
    const plan = buildPlan(trip([leg('America/New_York', 'Europe/Paris', '2026-11-11T00:00:00Z', '2026-11-11T07:15:00Z')], {
      sleep: { usualBedtime: '01:00', usualWake: '09:00', chronotype: 'late' },
    }));
    for (const d of plan.days.filter((x) => x.dayIndex < 0)) {
      expect(d.windows.filter((w) => w.kind === 'sleep'), d.date).toHaveLength(1);
    }
    const first = plan.days[0]!;
    const s = first.windows.find((w) => w.kind === 'sleep')!;
    expect(formatWindowLocal(s).localDate).toBe('2026-11-08'); // "tonight" after 11-07, past midnight
  });
});
