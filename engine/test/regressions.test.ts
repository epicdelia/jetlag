/** Regression tests for review findings (one describe per finding). */
import { describe, expect, it } from 'vitest';
import { buildPlan, PARAMS, type Plan } from '../src';
import { buildPlanDetailed } from '../src/plan';
import { formatWindowLocal } from '../src/format';
import { tminClockMinutes } from '../src/phase';
import { HOUR, localDayNumber, localToUtc, dayNumberToIso } from '../src/time';
import { trip, leg, ms, windowsOf, allWindows } from './helpers';

const DEFAULT_TMIN = tminClockMinutes(23 * 60, 7 * 60, 'intermediate');

/** Body-clock misalignment vs the destination's *local* habitual Tmin on the nearest day, hours. */
function actualMisalignment(dest: string, t: number, tminMin = DEFAULT_TMIN): number {
  const day = localDayNumber(dest, t);
  let best = Infinity;
  for (const d of [day - 1, day, day + 1]) {
    const target = localToUtc(dest, d, tminMin);
    const r = (t - target) / HOUR;
    if (Math.abs(r) < Math.abs(best)) best = r;
  }
  return best;
}

function seekHours(plan: Plan, dayIndex: number): number {
  return windowsOf(plan, 'seek_light', dayIndex).reduce((a, w) => a + (ms(w.endUtc) - ms(w.startUtc)) / HOUR, 0);
}

describe('finding 1 (high): destination DST change during the plan', () => {
  const cases = [
    {
      name: 'YYZ→LHR across UK spring-forward',
      input: trip([leg('America/Toronto', 'Europe/London', '2026-03-26T23:30:00Z', '2026-03-27T06:30:00Z')], {
        stayDays: 7,
      }),
    },
    {
      name: 'NYC→LON across UK fall-back',
      input: trip([leg('America/New_York', 'Europe/London', '2026-10-22T23:00:00Z', '2026-10-23T06:00:00Z')], {
        stayDays: 7,
      }),
    },
  ];
  for (const c of cases) {
    it(`${c.name}: remaining tracks the local target after the change`, () => {
      const { plan, debug } = buildPlanDetailed(c.input);
      const post = debug.events.filter((e) => e.t >= ms(c.input.legs[0]!.arriveUtc));
      expect(post.length).toBeGreaterThan(0);
      for (const e of post) {
        expect(e.remaining).toBeCloseTo(actualMisalignment('Europe/London', e.t), 5);
      }
      const last = post[post.length - 1]!;
      expect(Math.abs(actualMisalignment('Europe/London', last.t))).toBeLessThanOrEqual(PARAMS.ADAPTED_TOL);
      expect(plan.days.length).toBeGreaterThan(0);
    });
  }

  it('YYZ→LHR spring-forward: light advice continues until actually adapted', () => {
    const input = cases[0]!.input;
    const { plan } = buildPlanDetailed(input);
    // On 03-29 (DST night) the body clock is still 1.5 h behind London; there must be light advice that day or later.
    const after = plan.days.filter((d) => d.date >= '2026-03-29');
    expect(after.some((d) => d.windows.some((w) => w.kind === 'seek_light' || w.kind === 'avoid_light'))).toBe(true);
  });
});

describe('finding 2 (medium): pre-flight delay nights never cut short by an early departure', () => {
  it('DXB→LHR 07:45 departure: last pre night is not shifted into a 4 h sleep', () => {
    const plan = buildPlan(
      trip([leg('Asia/Dubai', 'Europe/London', '2026-11-10T03:45:00Z', '2026-11-10T12:00:00Z')], { stayDays: 7 }),
    );
    for (const w of windowsOf(plan, 'sleep').filter((w) => ms(w.endUtc) <= ms('2026-11-10T03:45:00Z'))) {
      const h = (ms(w.endUtc) - ms(w.startUtc)) / HOUR;
      expect(h, `${w.startUtc}`).toBeGreaterThanOrEqual(6.5);
      expect(w.rationale).not.toMatch(/3 hours later/);
    }
  });

  it('night owl SFO→NRT 11:00 departure: last pre night keeps ≥ 7 h', () => {
    const plan = buildPlan(
      trip([leg('America/Los_Angeles', 'Asia/Tokyo', '2026-11-12T19:00:00Z', '2026-11-13T06:30:00Z')], {
        sleep: { usualBedtime: '02:00', usualWake: '10:00', chronotype: 'late' },
        stayDays: 7,
      }),
    );
    const pre = windowsOf(plan, 'sleep').filter((w) => ms(w.endUtc) <= ms('2026-11-12T19:00:00Z'));
    expect(pre.length).toBeGreaterThan(0);
    for (const w of pre) expect((ms(w.endUtc) - ms(w.startUtc)) / HOUR).toBeGreaterThanOrEqual(7);
  });

  it('a capped night reduces the modelled pre-flight shift', () => {
    const capped = buildPlanDetailed(
      trip([leg('Asia/Dubai', 'Europe/London', '2026-11-10T03:45:00Z', '2026-11-10T12:00:00Z')], { stayDays: 7 }),
    );
    const firstPost = capped.debug.events.find((e) => e.phase === 'post')!;
    // Full 3-night credit would leave −4 + 2.25 = −1.75; capping the last night must credit less.
    expect(Math.abs(firstPost.remaining)).toBeGreaterThan(1.75);
  });
});

describe('finding 3 (medium): delay plans get usable seek-light before bedtime', () => {
  it('LHR→YYZ: every pre-flight day has ≥ 1 h of seek_light', () => {
    const plan = buildPlan(
      trip([leg('Europe/London', 'America/Toronto', '2026-11-12T12:00:00Z', '2026-11-12T20:00:00Z')], { stayDays: 7 }),
    );
    for (const k of [-3, -2, -1]) expect(seekHours(plan, k), `day ${k}`).toBeGreaterThanOrEqual(1);
  });

  it('SFO→NRT: every post-arrival delay step has ≥ 1 h of seek light before the Tmin it moves', () => {
    const { plan, debug } = buildPlanDetailed(
      trip([leg('America/Los_Angeles', 'Asia/Tokyo', '2026-11-12T19:00:00Z', '2026-11-13T06:30:00Z')], {
        stayDays: 10,
      }),
    );
    const seek = windowsOf(plan, 'seek_light');
    const ev = debug.events;
    let checked = 0;
    for (let i = 1; i < ev.length; i++) {
      if (ev[i - 1]!.phase !== 'post' || Math.abs(ev[i - 1]!.remaining) <= PARAMS.ADAPTED_TOL) continue;
      const lo = ev[i]!.t - PARAMS.DELAY_SEEK_MAX_BEFORE_TMIN_H * HOUR;
      const hi = ev[i]!.t + PARAMS.LIGHT.delay.seek[1] * HOUR;
      const h = seek.reduce((a, w) => a + Math.max(0, Math.min(ms(w.endUtc), hi) - Math.max(ms(w.startUtc), lo)), 0) / HOUR;
      expect(h, `event ${i}`).toBeGreaterThanOrEqual(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(1);
  });

  it('delay seek light stays on the delay side of Tmin', () => {
    const { plan, debug } = buildPlanDetailed(
      trip([leg('Europe/London', 'America/Toronto', '2026-11-12T12:00:00Z', '2026-11-12T20:00:00Z')], { stayDays: 7 }),
    );
    for (const w of windowsOf(plan, 'seek_light')) {
      const s = ms(w.startUtc);
      const e = ms(w.endUtc);
      const t = debug.events.find((ev) => ev.t >= e)!; // the Tmin this light is meant to delay
      expect(e).toBeLessThanOrEqual(t.t + PARAMS.LIGHT.delay.seek[1] * HOUR);
      expect(s).toBeGreaterThanOrEqual(t.t - PARAMS.DELAY_SEEK_MAX_BEFORE_TMIN_H * HOUR);
    }
  });
});

describe('finding 4 (medium): day 0 does not swallow later calendar dates', () => {
  it('LAX→SYD: arrival date becomes day 1', () => {
    const plan = buildPlan(
      trip([leg('America/Los_Angeles', 'Australia/Sydney', '2026-11-11T06:30:00Z', '2026-11-11T20:30:00Z')], {
        stayDays: 10,
      }),
    );
    const d0 = plan.days.find((d) => d.dayIndex === 0)!;
    const d1 = plan.days.find((d) => d.dayIndex === 1)!;
    expect(d0.date).toBe('2026-11-10');
    expect(d1.date).toBe('2026-11-12');
    // No ground window on the Sydney arrival date is filed under day 0.
    for (const w of d0.windows) expect(formatWindowLocal(w).localDate <= '2026-11-11').toBe(true);
  });

  it('formatWindowLocal exposes the local date of the window start', () => {
    const plan = buildPlan(
      trip([leg('Europe/London', 'Asia/Singapore', '2026-11-10T21:00:00Z', '2026-11-11T09:00:00Z')], { stayDays: 10 }),
    );
    const d0 = plan.days.find((d) => d.dayIndex === 0)!;
    const dates = new Set(d0.windows.map((w) => formatWindowLocal(w).localDate));
    expect([...dates].every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))).toBe(true);
    expect(dates.has('2026-11-11')).toBe(true);
    const w = d0.windows[0]!;
    expect(formatWindowLocal(w).localDate).toBe(dayNumberToIso(localDayNumber(w.tz, ms(w.startUtc))));
  });
});

describe('finding 5 (low): no nap at the minute of touchdown', () => {
  for (const preAdapt of [true, false]) {
    it(`NRT→SFO preAdapt=${preAdapt}`, () => {
      const arrive = '2026-11-20T18:00:00Z';
      const plan = buildPlan(
        trip([leg('Asia/Tokyo', 'America/Los_Angeles', '2026-11-20T08:00:00Z', arrive)], {
          stayDays: 10,
          prefs: { preAdapt },
        }),
      );
      for (const n of windowsOf(plan, 'nap')) {
        expect(ms(n.startUtc)).toBeGreaterThanOrEqual(ms(arrive) + PARAMS.NAP_AFTER_ARRIVAL_H * HOUR);
      }
    });
  }
});

describe('finding 6 (low): in-flight sleep not right after waking', () => {
  it('SFO→NRT: in-flight sleep starts ≥ 4 h after the previous sleep ends', () => {
    const { debug } = buildPlanDetailed(
      trip([leg('America/Los_Angeles', 'Asia/Tokyo', '2026-11-12T19:00:00Z', '2026-11-13T06:30:00Z')], {
        stayDays: 10,
      }),
    );
    const sl = debug.sleeps;
    for (let i = 1; i < sl.length; i++) {
      if (sl[i]!.kind !== 'flight') continue;
      expect(sl[i]!.start - sl[i - 1]!.end).toBeGreaterThanOrEqual(PARAMS.FLIGHT_SLEEP_AFTER_WAKE_H * HOUR);
    }
  });
});

describe('finding 7 (low): remainingShiftHours agrees with the headline', () => {
  const inputs = [
    trip([leg('Europe/London', 'America/Toronto', '2026-11-12T12:00:00Z', '2026-11-12T20:00:00Z')], { stayDays: 7 }),
    trip([leg('America/Los_Angeles', 'Asia/Tokyo', '2026-11-12T19:00:00Z', '2026-11-13T06:30:00Z')], { stayDays: 10 }),
    trip([leg('Asia/Dubai', 'Europe/London', '2026-11-10T03:45:00Z', '2026-11-10T12:00:00Z')], { stayDays: 7 }),
    trip([leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00Z', '2026-11-11T08:50:00Z')], { stayDays: 10 }),
  ];
  inputs.forEach((input, i) => {
    it(`case ${i}`, () => {
      const plan = buildPlan(input);
      for (const d of plan.days) {
        if (d.dayIndex > plan.estimatedDaysToAdapt) {
          expect(Math.abs(d.remainingShiftHours), `day ${d.dayIndex}`).toBeLessThanOrEqual(PARAMS.ADAPTED_TOL);
        }
      }
      const post = plan.days.filter((d) => d.dayIndex >= 1 && Math.abs(d.remainingShiftHours) > PARAMS.ADAPTED_TOL);
      for (let k = 1; k < post.length; k++) {
        expect(post[k]!.remainingShiftHours).not.toBe(post[k - 1]!.remainingShiftHours);
      }
    });
  });
});

describe('finding 8 (low): night-time light windows do not promise daylight', () => {
  it('early chronotype YYZ→LHR pre-flight 02:00 light says indoor light', () => {
    const plan = buildPlan(
      trip([leg('America/Toronto', 'Europe/London', '2026-11-06T00:30:00Z', '2026-11-06T07:25:00Z')], {
        sleep: { usualBedtime: '21:30', usualWake: '05:00', chronotype: 'early' },
        stayDays: 10,
      }),
    );
    for (const w of windowsOf(plan, 'seek_light')) {
      const f = formatWindowLocal(w);
      const h = Number(f.startLocal.slice(0, 2));
      if (h < 5 && f.endDayOffset === 0 && Number(f.endLocal.slice(0, 2)) < 6) {
        expect(w.rationale, `${w.startUtc}`).not.toMatch(/daylight/);
      }
    }
    expect(allWindows(plan).length).toBeGreaterThan(0);
  });
});
