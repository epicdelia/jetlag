import { describe, expect, it } from 'vitest';
import { buildPlan, TripInputError, formatWindowLocal, dayLabel, PARAMS, isValidTimeZone, type TripInput } from '../src';
import { buildPlanDetailed } from '../src/plan';
import { HOUR } from '../src/time';
import { trip, leg, ms, local, allWindows, windowsOf, inside, YYZ_LHR, LAX_SYD, JFK_HND } from './helpers';

describe('date line', () => {
  it('Honolulu → Tokyo (−5 after normalising +19): delay, dates on both sides', () => {
    const p = buildPlan(trip([leg('Pacific/Honolulu', 'Asia/Tokyo', '2026-11-10T22:00:00Z', '2026-11-11T07:00:00Z')]));
    expect(p.zoneDeltaHours).toBe(-5);
    expect(p.strategy).toBe('delay');
    const d0 = p.days.find((d) => d.dayIndex === 0)!;
    expect([d0.date, d0.tz]).toEqual(['2026-11-10', 'Pacific/Honolulu']);
    expect(p.days.find((d) => d.dayIndex === 1)!.date).toBe('2026-11-12');
  });

  it('Tokyo → Honolulu arrives "before" it left; day 0 still precedes day 1', () => {
    const p = buildPlan(trip([leg('Asia/Tokyo', 'Pacific/Honolulu', '2026-11-10T11:00:00Z', '2026-11-10T18:00:00Z')]));
    expect(p.zoneDeltaHours).toBe(5);
    expect(p.strategy).toBe('advance');
    const d0 = p.days.find((d) => d.dayIndex === 0)!;
    const d1 = p.days.find((d) => d.dayIndex === 1)!;
    expect(d0.date).toBe('2026-11-10'); // Tokyo date of departure
    expect(d1.date).toBe('2026-11-11'); // Honolulu: arrived on the 10th local
    const all = allWindows(p).map((w) => ms(w.startUtc));
    expect(all).toEqual([...all].sort((a, b) => a - b));
  });

  it('LAX → SYD skips a calendar date at the destination without losing windows', () => {
    const p = buildPlan(trip([LAX_SYD], { prefs: { preAdapt: false } }));
    const d0 = p.days.find((d) => d.dayIndex === 0)!;
    // day 0 spans from LA midnight to Sydney midnight after arrival (> 24 h)
    expect(d0.windows.some((w) => w.tz === 'Australia/Sydney')).toBe(true);
    expect(d0.windows.some((w) => w.tz === 'America/Los_Angeles')).toBe(true);
  });
});

describe('0 h and small shifts', () => {
  it('same zone → none', () => {
    const p = buildPlan(trip([leg('Europe/Paris', 'Europe/Berlin', '2026-11-10T08:00:00Z', '2026-11-10T09:30:00Z')]));
    expect(p.strategy).toBe('none');
    expect(p.days).toEqual([]);
  });
  it('1.5 h → none; 2 h → plan without pre-days', () => {
    const none = buildPlan(trip([leg('Asia/Kolkata', 'Asia/Bangkok', '2026-11-10T08:00:00Z', '2026-11-10T12:00:00Z')]));
    expect(none.zoneDeltaHours).toBe(1.5);
    expect(none.strategy).toBe('none');
    const { plan, debug } = buildPlanDetailed(trip([leg('Europe/London', 'Europe/Athens', '2026-11-10T08:00:00Z', '2026-11-10T11:30:00Z')]));
    expect(plan.zoneDeltaHours).toBe(2);
    expect(plan.strategy).toBe('advance');
    expect(debug.nPre).toBe(0);
    expect(plan.days[0]!.dayIndex).toBe(0);
  });
  it('a short eastward hop with nPre=0 gives no light advice before departure', () => {
    const l = leg('Europe/London', 'Europe/Athens', '2026-11-10T08:00:00Z', '2026-11-10T11:30:00Z');
    const p = buildPlan(trip([l]));
    for (const w of [...windowsOf(p, 'seek_light'), ...windowsOf(p, 'avoid_light')]) {
      expect(ms(w.startUtc)).toBeGreaterThanOrEqual(ms(l.departUtc));
    }
  });
});

describe('multi-leg with layover', () => {
  const legs = [
    leg('Europe/London', 'Asia/Dubai', '2026-11-10T08:00:00Z', '2026-11-10T15:00:00Z'),
    leg('Asia/Dubai', 'Australia/Sydney', '2026-11-11T02:00:00Z', '2026-11-11T16:00:00Z'),
  ];
  const { plan, debug } = buildPlanDetailed(trip(legs));

  it('uses the net shift to the final destination', () => {
    expect(plan.zoneDeltaHours).toBe(11); // GMT → AEDT
    expect(plan.strategy).toBe('delay');
    expect(plan.plannedShiftHours).toBe(-13);
  });

  it('can sleep during a long layover on the destination clock, labelled with the layover zone', () => {
    const lay = debug.sleeps.filter((s) => s.kind === 'layover');
    expect(lay.length).toBeGreaterThan(0);
    const w = windowsOf(plan, 'sleep').find((x) => ms(x.startUtc) === lay[0]!.start)!;
    expect(w.tz).toBe('Asia/Dubai');
    expect(ms(w.startUtc)).toBeGreaterThanOrEqual(ms(legs[0]!.arriveUtc) + HOUR);
    expect(ms(w.endUtc)).toBeLessThanOrEqual(ms(legs[1]!.departUtc) - 2 * HOUR);
  });

  it('warns but does not throw when airports do not connect', () => {
    const p = buildPlan(
      trip([
        leg('Europe/London', 'Asia/Dubai', '2026-11-10T08:00:00Z', '2026-11-10T15:00:00Z'),
        leg('Asia/Qatar', 'Australia/Sydney', '2026-11-11T02:00:00Z', '2026-11-11T16:00:00Z'),
      ]),
    );
    expect(p.warnings).toContain("Leg airports don't connect; using the final destination.");
  });

  it('allows a zero-length connection (depart == previous arrive)', () => {
    expect(() =>
      buildPlan(
        trip([
          leg('Europe/London', 'Asia/Dubai', '2026-11-10T08:00:00Z', '2026-11-10T15:00:00Z'),
          leg('Asia/Dubai', 'Australia/Sydney', '2026-11-10T15:00:00Z', '2026-11-11T05:00:00Z'),
        ]),
      ),
    ).not.toThrow();
  });
});

describe('short stays', () => {
  it('stayDays ≤ 2 but |Δ| < 3 → adapt normally', () => {
    const p = buildPlan(trip([leg('Europe/London', 'Europe/Athens', '2026-11-10T08:00:00Z', '2026-11-10T11:30:00Z')], { stayDays: 1 }));
    expect(p.strategy).toBe('advance');
  });

  it('stayDays 3 with a long adaptation → adapt, warn, and cap the horizon', () => {
    const p = buildPlan(trip([JFK_HND], { stayDays: 3 }));
    expect(p.strategy).toBe('delay');
    expect(p.warnings).toContain('Short stay: you may only partly adapt before you return.');
    expect(p.warnings).toContain('Plan covers the first 3 days; you may not be fully adapted by then.');
    expect(p.estimatedDaysToAdapt).toBeLessThanOrEqual(PARAMS.MAX_POST_DAYS);
  });

  it('stayDays 4 that is long enough → no short-stay warning', () => {
    const p = buildPlan(trip([leg('America/New_York', 'America/Los_Angeles', '2026-11-10T17:00:00Z', '2026-11-10T23:00:00Z')], { stayDays: 4 }));
    expect(p.warnings).toEqual([]);
  });

  it('fractional stay on home time rounds days up', () => {
    const p = buildPlan(trip([YYZ_LHR], { stayDays: 1.5 }));
    expect(p.strategy).toBe('stay_on_home_time');
    expect(p.days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
  });
});

describe('preferences', () => {
  it('caffeine off → no caffeine windows; other windows unchanged', () => {
    const on = buildPlan(trip([YYZ_LHR]));
    const off = buildPlan(trip([YYZ_LHR], { prefs: { useCaffeine: false } }));
    expect(windowsOf(off, 'caffeine_ok')).toEqual([]);
    expect(windowsOf(off, 'avoid_caffeine')).toEqual([]);
    const strip = (p: typeof on) => allWindows(p).filter((w) => !w.kind.includes('caffeine'));
    expect(strip(off)).toEqual(strip(on));
  });

  it('melatonin off → no melatonin windows, no melatonin warning', () => {
    const p = buildPlan(trip([YYZ_LHR]));
    expect(windowsOf(p, 'melatonin')).toEqual([]);
    expect(p.warnings.join(' ')).not.toMatch(/elatonin/);
  });

  it('maxPreDays limits pre-days (0, 1) and is clamped to 3', () => {
    expect(buildPlanDetailed(trip([YYZ_LHR], { prefs: { maxPreDays: 0 } })).debug.nPre).toBe(0);
    expect(buildPlanDetailed(trip([YYZ_LHR], { prefs: { maxPreDays: 1 } })).debug.nPre).toBe(1);
    expect(buildPlanDetailed(trip([YYZ_LHR], { prefs: { maxPreDays: 10 } })).debug.nPre).toBe(3);
  });

  it('missing optional prefs fall back to the documented defaults', () => {
    const input = trip([YYZ_LHR]) as unknown as Record<string, unknown>;
    const p = buildPlan({ ...input, prefs: {} } as unknown as TripInput);
    expect(p).toEqual(buildPlan(trip([YYZ_LHR], { prefs: { useMelatonin: false, useCaffeine: true, preAdapt: true, maxPreDays: 3 } })));
  });
});

describe('determinism', () => {
  it('identical input → identical output', () => {
    const a = JSON.stringify(buildPlan(trip([JFK_HND], { prefs: { useMelatonin: true } })));
    const b = JSON.stringify(buildPlan(trip([JFK_HND], { prefs: { useMelatonin: true } })));
    expect(a).toBe(b);
  });
  it('does not mutate its input', () => {
    const input = trip([YYZ_LHR], { stayDays: 5 });
    const copy = structuredClone(input);
    buildPlan(input);
    expect(input).toEqual(copy);
  });
});

describe('invalid input → TripInputError', () => {
  const ok = trip([YYZ_LHR]);
  const bad: [string, unknown][] = [
    ['no legs', { ...ok, legs: [] }],
    ['legs not an array', { ...ok, legs: 'x' }],
    ['unknown tz', trip([leg('Mars/Olympus', 'Europe/London', YYZ_LHR.departUtc, YYZ_LHR.arriveUtc)])],
    ['raw offset tz', trip([leg('America/Toronto', '+01:00', YYZ_LHR.departUtc, YYZ_LHR.arriveUtc)])],
    ['empty tz', trip([leg('', 'Europe/London', YYZ_LHR.departUtc, YYZ_LHR.arriveUtc)])],
    ['arrive before depart', trip([leg('America/Toronto', 'Europe/London', '2026-11-11T08:50:00Z', '2026-11-11T02:00:00Z')])],
    ['arrive == depart', trip([leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00Z', '2026-11-11T02:00:00Z')])],
    ['malformed instant', trip([leg('America/Toronto', 'Europe/London', '11/11/2026 02:00', '2026-11-11T08:50:00Z')])],
    ['instant without zone', trip([leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00', '2026-11-11T08:50:00Z')])],
    [
      'non-chronological legs',
      trip([
        leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00Z', '2026-11-11T08:50:00Z'),
        leg('Europe/London', 'Asia/Dubai', '2026-11-11T08:00:00Z', '2026-11-11T15:00:00Z'),
      ]),
    ],
    ['bedtime 7:00', trip([YYZ_LHR], { sleep: { usualBedtime: '7:00' } })],
    ['bedtime 24:00', trip([YYZ_LHR], { sleep: { usualBedtime: '24:00' } })],
    ['wake 07:60', trip([YYZ_LHR], { sleep: { usualWake: '07:60' } })],
    ['wake junk', trip([YYZ_LHR], { sleep: { usualWake: 'seven' } })],
    ['sleep too short', trip([YYZ_LHR], { sleep: { usualBedtime: '23:00', usualWake: '02:00' } })],
    ['sleep too long', trip([YYZ_LHR], { sleep: { usualBedtime: '19:00', usualWake: '08:00' } })],
    ['bed == wake', trip([YYZ_LHR], { sleep: { usualBedtime: '07:00', usualWake: '07:00' } })],
    ['bad chronotype', { ...ok, sleep: { ...ok.sleep, chronotype: 'owl' } }],
    ['missing sleep', { ...ok, sleep: undefined }],
    ['stayDays 0', trip([YYZ_LHR], { stayDays: 0 })],
    ['stayDays negative', trip([YYZ_LHR], { stayDays: -2 })],
    ['stayDays NaN', trip([YYZ_LHR], { stayDays: NaN })],
    ['prefs not boolean', { ...ok, prefs: { ...ok.prefs, useMelatonin: 'yes' } }],
    ['maxPreDays not number', { ...ok, prefs: { ...ok.prefs, maxPreDays: 'three' } }],
    ['null input', null],
  ];
  for (const [name, input] of bad) {
    it(name, () => {
      expect(() => buildPlan(input as TripInput)).toThrow(TripInputError);
    });
  }
});

describe('formatWindowLocal / dayLabel / isValidTimeZone', () => {
  const p = buildPlan(trip([YYZ_LHR], { stayDays: 10 }));

  it('formats in the window zone, flags windows that end the next day', () => {
    const sleep = windowsOf(p, 'sleep', 1)[0]!;
    expect(formatWindowLocal(sleep)).toEqual({
      startLocal: '23:00',
      endLocal: '07:00',
      localDate: sleep.startUtc.slice(0, 10),
      endDayOffset: 1,
    });
    const seek = windowsOf(p, 'seek_light', 1)[0]!;
    expect(formatWindowLocal(seek)).toEqual({
      startLocal: '07:30',
      endLocal: '11:30',
      localDate: seek.startUtc.slice(0, 10),
      endDayOffset: 0,
    });
    const kathmandu = { kind: 'nap' as const, startUtc: '2026-11-11T00:00:00Z', endUtc: '2026-11-11T00:20:00Z', tz: 'Asia/Kathmandu', rationale: '' };
    expect(formatWindowLocal(kathmandu)).toMatchObject({ startLocal: '05:45', endLocal: '06:05' });
  });

  it('labels days', () => {
    const labels = p.days.map(dayLabel);
    expect(labels[0]).toBe('3 days before departure · Sat 7 Nov');
    expect(labels[2]).toBe('Day before departure · Mon 9 Nov');
    expect(labels[3]).toBe('Travel day · Tue 10 Nov');
    expect(labels[4]).toBe('Day 1 · Thu 12 Nov');
  });

  it('exposes tz validation for the app', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Nowhere/Land')).toBe(false);
  });

  it('local() helper agrees with formatWindowLocal', () => {
    const w = windowsOf(p, 'sleep', 1)[0]!;
    expect(local(w)).toBe('23:00-07:00');
    expect(inside(w, w)).toBe(true);
  });
});
