/** SCIENCE.md §13 TEST SCENARIOS, one describe block per scenario. */
import { describe, expect, it } from 'vitest';
import { buildPlan, type Plan } from '../src';
import { buildPlanDetailed } from '../src/plan';
import { toIso, HOUR } from '../src/time';
import {
  trip,
  leg,
  ms,
  local,
  allWindows,
  windowsOf,
  inside,
  overlaps,
  YYZ_LHR,
  LAX_SYD,
  JFK_HND,
  LHR_SIN,
} from './helpers';

function localStart(w: { startUtc: string; tz: string; endUtc: string; kind: string; rationale: string }) {
  return local(w as never).slice(0, 5);
}

function noLightInSleep(plan: Plan) {
  const sleeps = windowsOf(plan, 'sleep');
  for (const w of allWindows(plan)) {
    if (w.kind === 'sleep') continue;
    for (const s of sleeps) expect(inside(w, s), `${w.kind} ${w.startUtc} inside sleep ${s.startUtc}`).toBe(false);
  }
}

describe('1. Toronto → London, 5 h east', () => {
  const input = trip([YYZ_LHR], { stayDays: 10 });
  const { plan, debug } = buildPlanDetailed(input);

  it('advances 5 h with 3 pre-days and adapts in 3 days', () => {
    expect(plan.strategy).toBe('advance');
    expect(plan.zoneDeltaHours).toBe(5);
    expect(plan.plannedShiftHours).toBe(5);
    expect(debug.nPre).toBe(3);
    expect(plan.estimatedDaysToAdapt).toBe(3);
    expect(plan.days.map((d) => d.dayIndex).slice(0, 4)).toEqual([-3, -2, -1, 0]);
    expect(plan.warnings).toEqual([]);
  });

  it('takes 4 days without pre-adapting', () => {
    const p = buildPlan(trip([YYZ_LHR], { stayDays: 10, prefs: { preAdapt: false } }));
    expect(p.estimatedDaysToAdapt).toBe(4);
    expect(p.days[0]!.dayIndex).toBe(0);
  });

  it('moves pre-flight sleep 1 h earlier per night', () => {
    const pre = plan.days.filter((d) => d.dayIndex < 0).map((d) => windowsOf({ ...plan, days: [d] }, 'sleep').map(local));
    expect(pre).toEqual([['22:00-06:00'], ['21:00-05:00'], ['20:00-04:00']]);
  });

  it('seeks light from waking each pre-flight morning', () => {
    const sleeps = windowsOf(plan, 'sleep');
    for (const k of [-2, -1, 0]) {
      const seek = windowsOf(plan, 'seek_light', k)[0]!;
      expect(sleeps.some((s) => s.endUtc === seek.startUtc), `day ${k}`).toBe(true);
    }
  });

  it('iterates Tmin as specified (UTC, continuous)', () => {
    expect(debug.events.map((e) => [toIso(e.t), e.remaining, e.phase])).toEqual([
      ['2026-11-07T09:00:00Z', 5, 'pre'], // 04:00 EST
      ['2026-11-08T08:30:00Z', 4.5, 'pre'], // 03:30
      ['2026-11-09T08:00:00Z', 4, 'pre'], // 03:00
      ['2026-11-10T07:30:00Z', 3.5, 'pre'], // 02:30, step 0
      ['2026-11-11T07:30:00Z', 3.5, 'post'], // 07:30 GMT
      ['2026-11-12T06:30:00Z', 2.5, 'post'],
      ['2026-11-13T05:30:00Z', 1.5, 'post'],
      ['2026-11-14T04:30:00Z', 0.5, 'post'],
    ]);
  });

  it('arrival-day and day-1 light windows match the spec', () => {
    const d0 = windowsOf(plan, 'seek_light', 0).filter((w) => w.tz === 'Europe/London');
    expect(d0.map(local)).toEqual(['08:50-12:30']);
    expect(windowsOf(plan, 'seek_light', 1).map(local)).toEqual(['07:30-11:30']);
    expect(windowsOf(plan, 'avoid_light', 1).map(local)).toEqual(['07:00-07:30']);
  });

  it('never puts light advice inside sleep', () => noLightInSleep(plan));

  it('morning seek windows move earlier each day and remaining shift falls to ≤ 1', () => {
    const ends = [1, 2].map((k) => ms(windowsOf(plan, 'seek_light', k)[0]!.endUtc) % (24 * HOUR));
    expect(ends[1]!).toBeLessThan(ends[0]!);
    const rem = plan.days.map((d) => d.remainingShiftHours);
    for (let i = 1; i < rem.length; i++) expect(rem[i]!).toBeLessThanOrEqual(rem[i - 1]!);
    expect(rem[rem.length - 1]!).toBeLessThanOrEqual(1);
  });

  it('schedules in-flight sleep 03:00–07:00 London', () => {
    const flight = windowsOf(plan, 'sleep', 0).filter((w) => ms(w.startUtc) >= ms(YYZ_LHR.departUtc) && ms(w.endUtc) <= ms(YYZ_LHR.arriveUtc));
    expect(flight.map(local)).toEqual(['03:00-07:00']);
    expect(flight[0]!.tz).toBe('Europe/London');
    expect(flight[0]!.rationale).toMatch(/plane/);
  });
});

describe('2. LA → Sydney (crosses the date line)', () => {
  const { plan, debug } = buildPlanDetailed(trip([LAX_SYD]));

  it('normalises +19 to −5 and delays', () => {
    expect(plan.zoneDeltaHours).toBe(-5);
    expect(plan.strategy).toBe('delay');
    expect(plan.plannedShiftHours).toBe(-5);
    expect(debug.nPre).toBe(3);
    expect(plan.estimatedDaysToAdapt).toBe(2);
    expect(debug.events.filter((e) => e.phase === 'post').map((e) => e.remaining)).toEqual([-2.75, -1.25, 0]);
  });

  it('takes 3 days without pre-adapting (5, 3.5, 2)', () => {
    const { plan: p, debug: d } = buildPlanDetailed(trip([LAX_SYD], { prefs: { preAdapt: false } }));
    expect(p.estimatedDaysToAdapt).toBe(3);
    expect(d.events.filter((e) => e.phase === 'post').map((e) => e.remaining)).toEqual([-5, -3.5, -2, -0.5]);
  });

  it('seeks light in the destination afternoon/evening', () => {
    const seek = windowsOf(plan, 'seek_light').filter((w) => w.tz === 'Australia/Sydney');
    expect(seek.length).toBeGreaterThan(0);
    for (const w of seek) expect(Number(localStart(w).slice(0, 2))).toBeGreaterThanOrEqual(12);
    const p = buildPlan(trip([LAX_SYD], { prefs: { preAdapt: false } }));
    const avoid = windowsOf(p, 'avoid_light').filter((w) => w.tz === 'Australia/Sydney');
    const seek2 = windowsOf(p, 'seek_light').filter((w) => w.tz === 'Australia/Sydney');
    // seek comes before avoid around each body-clock night (light, then the night, then dark
    // until Tmin + 4 h; the avoid piece may be the morning after the sleep)
    expect(seek2.length).toBeGreaterThan(0);
    for (const a of avoid) {
      const before = seek2.filter((s) => ms(s.endUtc) <= ms(a.startUtc) && ms(a.startUtc) - ms(s.endUtc) < 10 * HOUR);
      expect(before.length).toBeGreaterThan(0);
    }
  });

  it('labels days on the right side of the date line', () => {
    const d0 = plan.days.find((d) => d.dayIndex === 0)!;
    expect(d0.date).toBe('2026-11-10');
    expect(d0.tz).toBe('America/Los_Angeles');
    // Landing two calendar dates later (11-12 Sydney): the arrival date is day 1, not part of day 0.
    const d1 = plan.days.find((d) => d.dayIndex === 1)!;
    expect(d1.date).toBe('2026-11-12');
    expect(d1.tz).toBe('Australia/Sydney');
  });

  it('never puts light advice inside sleep', () => noLightInSleep(plan));
});

describe('3. NYC → Tokyo, 14 h east → antidromic delay', () => {
  const { plan, debug } = buildPlanDetailed(trip([JFK_HND]));

  it('delays 10 h instead of advancing 14 h', () => {
    expect(plan.zoneDeltaHours).toBe(14);
    expect(plan.strategy).toBe('delay');
    expect(plan.plannedShiftHours).toBe(-10);
    expect(plan.warnings.some((w) => w.startsWith('Crossing ~14h east'))).toBe(true);
    expect(plan.estimatedDaysToAdapt).toBe(5);
    expect(buildPlan(trip([JFK_HND], { prefs: { preAdapt: false } })).estimatedDaysToAdapt).toBe(6);
  });

  it('first post-departure Tmin is 06:15 EST = 20:15 JST', () => {
    const first = debug.events.find((e) => e.phase === 'post')!;
    expect(toIso(first.t)).toBe('2026-11-11T11:15:00Z');
  });

  it('seeks light ~15:15–19:15 JST then avoids it until bed; both move ~1.5 h later daily', () => {
    const tokyoSeek = windowsOf(plan, 'seek_light').filter((w) => w.tz === 'Asia/Tokyo');
    // arrival at 15:30 clips the 15:15 start
    expect(local(tokyoSeek[0]!)).toBe('15:30-19:15');
    const tokyoAvoid = windowsOf(plan, 'avoid_light').filter((w) => w.tz === 'Asia/Tokyo');
    expect(local(tokyoAvoid[0]!)).toBe('19:15-23:00');
    expect(ms(tokyoSeek[1]!.endUtc) - ms(tokyoSeek[0]!.endUtc)).toBe(25.5 * HOUR);
    expect(ms(tokyoAvoid[1]!.startUtc) - ms(tokyoAvoid[0]!.startUtc)).toBe(25.5 * HOUR);
  });

  it('EDT variant (Oct 1): +13 → planned −11, still delay', () => {
    const p = buildPlan(trip([leg('America/New_York', 'Asia/Tokyo', '2026-10-01T16:00:00Z', '2026-10-02T06:30:00Z')]));
    expect(p.zoneDeltaHours).toBe(13);
    expect(p.strategy).toBe('delay');
    expect(p.plannedShiftHours).toBe(-11);
  });

  it('melatonin on: no melatonin windows, warning instead, same strategy', () => {
    const p = buildPlan(trip([JFK_HND], { prefs: { useMelatonin: true } }));
    expect(windowsOf(p, 'melatonin')).toEqual([]);
    expect(p.warnings).toContain(
      "Melatonin isn't scheduled for this trip because evidence for using it to shift your clock later is limited.",
    );
    expect(p.strategy).toBe(plan.strategy);
    expect(p.estimatedDaysToAdapt).toBe(plan.estimatedDaysToAdapt);
  });

  it('never puts light advice inside sleep', () => noLightInSleep(plan));
});

describe('4. London → Singapore, 8 h east', () => {
  const { plan, debug } = buildPlanDetailed(trip([LHR_SIN]));

  it('advances with the large-eastward warning', () => {
    expect(plan.zoneDeltaHours).toBe(8);
    expect(plan.strategy).toBe('advance');
    expect(plan.warnings).toContain('Large eastward shift: avoiding bright morning light for the first days matters.');
    expect(plan.estimatedDaysToAdapt).toBe(6);
  });

  it('first post Tmin is 10:30 SGT, in flight', () => {
    const first = debug.events.find((e) => e.phase === 'post')!;
    expect(toIso(first.t)).toBe('2026-11-11T02:30:00Z');
    expect(first.t).toBeLessThan(ms(LHR_SIN.arriveUtc));
  });

  it('day 1: avoid 07:00–10:30, seek 10:30–14:30 SGT; then ~1 h earlier daily', () => {
    expect(windowsOf(plan, 'avoid_light', 1).map(local)).toEqual(['07:00-10:30']);
    expect(windowsOf(plan, 'seek_light', 1).map(local)).toEqual(['10:30-14:30']);
    expect(windowsOf(plan, 'seek_light', 2).map(local)).toEqual(['09:30-13:30']);
  });

  it('BST variant (Jul 10): +7, no warning', () => {
    const p = buildPlan(trip([leg('Europe/London', 'Asia/Singapore', '2026-07-10T20:00:00Z', '2026-07-11T09:00:00Z')]));
    expect(p.zoneDeltaHours).toBe(7);
    expect(p.strategy).toBe('advance');
    expect(p.warnings).toEqual([]);
  });

  it('a long overnight flight still gets in-flight sleep (no 30+ h awake stretch)', () => {
    const sleeps = windowsOf(plan, 'sleep').map((w) => [ms(w.startUtc), ms(w.endUtc)] as const);
    for (let i = 1; i < sleeps.length; i++) {
      expect(sleeps[i]![0] - sleeps[i - 1]![1]).toBeLessThanOrEqual(20 * HOUR);
    }
  });

  it('never puts light advice inside sleep', () => noLightInSleep(plan));
});

describe('5. Short 2-day stay → stay on home time', () => {
  const plan = buildPlan(trip([YYZ_LHR], { stayDays: 2, prefs: { useMelatonin: true } }));

  it('keeps home time', () => {
    expect(plan.strategy).toBe('stay_on_home_time');
    expect(plan.plannedShiftHours).toBe(0);
    expect(plan.estimatedDaysToAdapt).toBe(0);
    expect(plan.zoneDeltaHours).toBe(5);
    expect(plan.days.map((d) => d.remainingShiftHours)).toEqual(plan.days.map(() => 5));
    expect(plan.days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
    expect(plan.warnings.some((w) => w.startsWith('Short stay: keeping close to home time'))).toBe(true);
  });

  it('sleeps 04:00–12:00 London and avoids light around home Tmin', () => {
    expect(windowsOf(plan, 'sleep', 1).map(local)).toEqual(['04:00-12:00']);
    expect(windowsOf(plan, 'avoid_light', 1).map(local)).toEqual(['12:00-13:00']);
    for (const w of windowsOf(plan, 'avoid_light')) {
      expect(w.rationale).toBe('Avoiding bright light now helps keep your body clock on home time.');
    }
  });

  it('has no seek-light, melatonin or nap windows', () => {
    for (const k of ['seek_light', 'melatonin', 'nap'] as const) expect(windowsOf(plan, k)).toEqual([]);
  });

  it('never puts advice inside sleep', () => noLightInSleep(plan));
});

describe('6. No shift', () => {
  it('Toronto → New York is none with no days', () => {
    const p = buildPlan(trip([leg('America/Toronto', 'America/New_York', '2026-11-10T14:00:00Z', '2026-11-10T15:30:00Z')]));
    expect(p).toEqual({
      strategy: 'none',
      zoneDeltaHours: 0,
      plannedShiftHours: 0,
      estimatedDaysToAdapt: 0,
      days: [],
      warnings: [],
    });
  });
});

describe('7. Small westward: NYC → LA', () => {
  it('delays 3 h with 2 pre-days, adapts in 1 day', () => {
    const { plan, debug } = buildPlanDetailed(
      trip([leg('America/New_York', 'America/Los_Angeles', '2026-11-10T17:00:00Z', '2026-11-10T23:00:00Z')]),
    );
    expect(plan.zoneDeltaHours).toBe(-3);
    expect(plan.strategy).toBe('delay');
    expect(debug.nPre).toBe(2);
    expect(plan.days[0]!.dayIndex).toBe(-2);
    expect(plan.estimatedDaysToAdapt).toBe(1);
  });
});

describe('8. Threshold boundaries', () => {
  const cases: [string, number, string, number][] = [
    ['Australia/Darwin', 9.5, 'advance', 9.5],
    ['Asia/Vladivostok', 10, 'delay', -14],
    ['Asia/Kamchatka', 12, 'delay', -12],
    ['Pacific/Kiritimati', 14, 'delay', -10],
    ['Pacific/Pago_Pago', -11, 'delay', -11],
    ['Asia/Singapore', 8, 'advance', 8],
    ['Asia/Yangon', 6.5, 'advance', 6.5],
  ];
  for (const [tz, delta, strategy, planned] of cases) {
    it(`UTC → ${tz}: ${delta} → ${strategy} ${planned}`, () => {
      const p = buildPlan(trip([leg('UTC', tz, '2026-11-10T10:00:00Z', '2026-11-10T22:00:00Z')]));
      expect(p.zoneDeltaHours).toBe(delta);
      expect(p.strategy).toBe(strategy);
      expect(p.plannedShiftHours).toBe(planned);
      const antidromic = p.warnings.some((w) => w.startsWith('Crossing'));
      expect(antidromic).toBe(delta >= 10);
      const risk = p.warnings.some((w) => w.startsWith('Large eastward'));
      expect(risk).toBe(delta >= 8 && delta < 10);
    });
  }

  it('exactly at the 10 h threshold delays; 9.5 h still advances; quarter-hour zones work', () => {
    const pAt = buildPlan(trip([leg('Europe/London', 'Australia/Brisbane', '2026-11-10T10:00:00Z', '2026-11-11T10:00:00Z')]));
    expect(pAt.zoneDeltaHours).toBe(10);
    expect(pAt.strategy).toBe('delay');
    expect(pAt.plannedShiftHours).toBe(-14);
    const pBelow = buildPlan(trip([leg('Europe/London', 'Australia/Darwin', '2026-11-10T10:00:00Z', '2026-11-11T10:00:00Z')]));
    expect(pBelow.zoneDeltaHours).toBe(9.5);
    expect(pBelow.strategy).toBe('advance');
    // July: Chatham +12:45, Kolkata +5:30 → +7.25
    const pq = buildPlan(trip([leg('Asia/Kolkata', 'Pacific/Chatham', '2026-07-10T00:00:00Z', '2026-07-10T12:00:00Z')]));
    expect(pq.zoneDeltaHours).toBe(7.25);
    expect(pq.strategy).toBe('advance');
  });
});

describe('9. Melatonin on, scenario 1', () => {
  const off = buildPlan(trip([YYZ_LHR], { stayDays: 10 }));
  const { plan } = buildPlanDetailed(trip([YYZ_LHR], { stayDays: 10, prefs: { useMelatonin: true } }));
  const doses = windowsOf(plan, 'melatonin');

  it('gives one pre-day dose per day, ~DLMO − 3 h and getting earlier', () => {
    const pre = [-3, -2, -1].map((k) => windowsOf(plan, 'melatonin', k));
    for (const d of pre) expect(d.length).toBe(1);
    expect(pre.map((d) => local(d[0]!).slice(0, 5))).toEqual(['17:15', '16:30', '15:45']);
  });

  it('doses are points, opt-in wording, ≤ 5 after departure, never inside sleep', () => {
    for (const d of doses) {
      expect(d.startUtc).toBe(d.endUtc);
      expect(d.rationale).toMatch(/0\.5 mg/);
      expect(d.rationale).toMatch(/commonly used/);
    }
    expect(doses.filter((d) => ms(d.startUtc) >= ms(YYZ_LHR.departUtc) - 24 * HOUR).length).toBeLessThanOrEqual(5);
    for (const d of doses) for (const s of windowsOf(plan, 'sleep')) expect(inside(d, s)).toBe(false);
  });

  it('adapts no slower than without melatonin, and strategy is unchanged', () => {
    expect(plan.estimatedDaysToAdapt).toBeLessThanOrEqual(off.estimatedDaysToAdapt);
    expect(plan.estimatedDaysToAdapt).toBe(2);
    expect(plan.strategy).toBe(off.strategy);
  });

  it('uses the bedtime fallback when the candidate falls in sleep (and only on the advance side)', () => {
    // LA → Berlin (+9): after arrival the DLMO − 3 h candidate falls inside Berlin-night sleep.
    const { plan: p, debug } = buildPlanDetailed(
      trip([leg('America/Los_Angeles', 'Europe/Berlin', '2026-11-10T15:00:00Z', '2026-11-11T01:00:00Z')], {
        prefs: { useMelatonin: true },
      }),
    );
    const sleepStarts = new Set(windowsOf(p, 'sleep').map((w) => w.startUtc));
    const atBedtime = windowsOf(p, 'melatonin').filter((d) => sleepStarts.has(d.startUtc));
    expect(atBedtime.length).toBeGreaterThan(0);
    for (const d of atBedtime) {
      // some Tmin event has its DLMO between 0.5 h and 6 h after this dose
      const t = ms(d.startUtc);
      expect(debug.events.some((e) => {
        const dlmo = e.t - 7 * HOUR;
        return t >= dlmo - 6 * HOUR && t <= dlmo - 0.5 * HOUR;
      })).toBe(true);
    }
    for (const d of windowsOf(p, 'melatonin')) for (const s of windowsOf(p, 'sleep')) expect(inside(d, s)).toBe(false);
  });
});

describe('10. Late chronotype', () => {
  const late = buildPlanDetailed(trip([YYZ_LHR], { stayDays: 10, sleep: { usualBedtime: '01:00', usualWake: '09:00', chronotype: 'late' } }));
  const base = buildPlanDetailed(trip([YYZ_LHR], { stayDays: 10 }));

  it('estimates Tmin at 06:30', () => {
    expect(late.debug.tminClockMinutes).toBe(390);
  });

  it('moves Tmin-anchored windows 2.5 h later than the default profile', () => {
    const lateEvents = late.debug.events.map((e) => e.t);
    const baseEvents = base.debug.events.map((e) => e.t);
    expect(lateEvents.length).toBe(baseEvents.length);
    lateEvents.forEach((t, i) => expect(t - baseEvents[i]!).toBe(2.5 * HOUR));
    const ls = windowsOf(late.plan, 'seek_light', 1)[0]!;
    const bs = windowsOf(base.plan, 'seek_light', 1)[0]!;
    expect(ms(ls.startUtc) - ms(bs.startUtc)).toBe(2.5 * HOUR);
    expect(ms(ls.endUtc) - ms(bs.endUtc)).toBe(2.5 * HOUR);
    expect(local(ls)).toBe('10:00-14:00');
  });

  it('sleeps follow the later habitual schedule (no evening-to-afternoon slide)', () => {
    // pre-nights 1 h, 2 h, 3 h earlier than the 01:00 habit; windows bucket by start instant,
    // so the first (00:00) lands on the calendar day after pre-day −3.
    const pre = late.plan.days.filter((d) => d.dayIndex < 0 || d.dayIndex === 0).flatMap((d) =>
      windowsOf({ ...late.plan, days: [d] }, 'sleep').filter((w) => w.tz === 'America/Toronto'),
    );
    expect(pre.map(local)).toEqual(['00:00-08:00', '23:00-07:00', '22:00-06:00']);
    expect(windowsOf(late.plan, 'sleep', 2).map(local)).toEqual(['01:00-09:00']);
  });
});

describe('11. Multi-leg Toronto → Frankfurt → Delhi', () => {
  const legs = [
    leg('America/Toronto', 'Europe/Berlin', '2026-11-10T23:00:00Z', '2026-11-11T07:00:00Z'),
    leg('Europe/Berlin', 'Asia/Kolkata', '2026-11-11T11:00:00Z', '2026-11-11T19:00:00Z'),
  ];
  const plan = buildPlan(trip(legs));

  it('uses the net shift origin → final destination (+10.5 → delay −13.5)', () => {
    expect(plan.zoneDeltaHours).toBe(10.5);
    expect(plan.strategy).toBe('delay');
    expect(plan.plannedShiftHours).toBe(-13.5);
    expect(plan.warnings.some((w) => w.startsWith('Crossing ~10.5h east'))).toBe(true);
  });

  it('labels windows with Frankfurt during leg 1 and the layover, Kolkata after', () => {
    for (const w of allWindows(plan)) {
      const t = ms(w.startUtc);
      const expected =
        t < ms(legs[0]!.departUtc)
          ? 'America/Toronto'
          : t < ms(legs[1]!.departUtc)
            ? 'Europe/Berlin'
            : 'Asia/Kolkata';
      expect(w.tz, `${w.kind} at ${w.startUtc}`).toBe(expected);
    }
    const layover = allWindows(plan).filter(
      (w) => ms(w.startUtc) >= ms(legs[0]!.arriveUtc) && ms(w.startUtc) < ms(legs[1]!.departUtc),
    );
    expect(layover.length).toBeGreaterThan(0);
    expect(plan.days.at(-1)!.tz).toBe('Asia/Kolkata');
  });

  it('never puts light advice inside sleep', () => noLightInSleep(plan));
});

describe('12. DST during the plan', () => {
  it('Toronto → London departing Oct 30: continuous UTC Tmin, local-clock sleep, nothing duplicated', () => {
    const { plan, debug } = buildPlanDetailed(
      trip([leg('America/Toronto', 'Europe/London', '2026-10-30T23:00:00Z', '2026-10-31T06:00:00Z')]),
    );
    expect(plan.zoneDeltaHours).toBe(4); // EDT vs GMT at arrival
    checkTminContinuity(debug.events, plan.plannedShiftHours > 0 ? 1 : -1);
    checkNoDuplicates(plan);
    // London nights stay at 23:00 local
    for (const d of plan.days.filter((x) => x.dayIndex >= 1)) {
      for (const s of windowsOf({ ...plan, days: [d] }, 'sleep')) expect(local(s)).toBe('23:00-07:00');
    }
  });

  it('pre-days spanning the Nov 1 fall-back keep local bedtimes and a 25 h day', () => {
    const { plan, debug } = buildPlanDetailed(
      trip([leg('America/Toronto', 'Europe/London', '2026-11-02T23:00:00Z', '2026-11-03T06:00:00Z')]),
    );
    checkTminContinuity(debug.events, 1);
    checkNoDuplicates(plan);
    const starts = plan.days.filter((d) => d.dayIndex < 0).map((d) => windowsOf({ ...plan, days: [d] }, 'sleep')[0]!);
    expect(starts.map((s) => local(s).slice(0, 5))).toEqual(['22:00', '21:00', '20:00']);
    expect(plan.days.map((d) => d.date)).toEqual([...new Set(plan.days.map((d) => d.date))]);
    // the 2026-11-01 Toronto day is 25 h: a window at 23:30 EST is still in day −1
    const dm1 = plan.days.find((d) => d.date === '2026-11-01')!;
    expect(dm1.dayIndex).toBe(-1);
  });

  it('pre-days spanning the Mar 8 spring-forward (New York → London)', () => {
    const { plan, debug } = buildPlanDetailed(
      trip([leg('America/New_York', 'Europe/London', '2026-03-10T02:00:00Z', '2026-03-10T09:00:00Z')]),
    );
    expect(plan.zoneDeltaHours).toBe(4);
    checkTminContinuity(debug.events, 1);
    checkNoDuplicates(plan);
    const pre = plan.days.filter((d) => d.dayIndex < 0).map((d) => windowsOf({ ...plan, days: [d] }, 'sleep').map(local));
    expect(pre.map((x) => x[0]!.slice(0, 5))).toEqual(['22:00', '21:00', '20:00']);
  });
});

function checkTminContinuity(events: { t: number; remaining: number }[], dir: number) {
  for (let i = 1; i < events.length; i++) {
    const step = Math.abs(events[i - 1]!.remaining - events[i]!.remaining);
    expect(events[i]!.t - events[i - 1]!.t).toBe(24 * HOUR - dir * step * HOUR);
  }
}

function checkNoDuplicates(plan: Plan) {
  const keys = allWindows(plan).map((w) => `${w.kind}|${w.startUtc}|${w.endUtc}`);
  expect(new Set(keys).size).toBe(keys.length);
  for (const k of ['seek_light', 'avoid_light', 'sleep'] as const) {
    const ws = windowsOf(plan, k);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) expect(overlaps(ws[i]!, ws[j]!)).toBe(false);
  }
}
