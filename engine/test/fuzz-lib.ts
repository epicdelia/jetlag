/**
 * Generators and invariant checks for the property-based fuzz suite (fuzz.test.ts).
 * Every check returns a list of violations (empty = the invariant holds) so the same code can
 * drive fast-check assertions and ad-hoc failure census runs.
 */
import fc from 'fast-check';
import { PARAMS, type AdviceWindow, type Plan, type TripInput } from '../src';
import { buildPlanDetailed } from '../src/plan';
import { RATIONALE } from '../src/rationale';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Zones and dates
// ---------------------------------------------------------------------------

export const ZONES = [
  // DST, northern hemisphere
  'America/New_York',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/St_Johns', // −3:30, DST
  'America/Havana', // DST at 00:00/01:00
  'Europe/London',
  'Europe/Berlin',
  'Europe/Athens',
  'Asia/Jerusalem',
  'Africa/Cairo',
  // DST, southern hemisphere
  'Australia/Sydney',
  'Australia/Adelaide', // +9:30/+10:30
  'Australia/Lord_Howe', // +10:30/+11 (30-minute DST)
  'Pacific/Auckland',
  'Pacific/Chatham', // +12:45/+13:45
  'America/Santiago',
  // no DST, half/quarter-hour
  'Asia/Kolkata',
  'Asia/Kathmandu', // +5:45
  'Asia/Tehran', // +3:30
  'Asia/Kabul', // +4:30
  'Asia/Yangon', // +6:30
  'Australia/Darwin', // +9:30
  'Australia/Eucla', // +8:45
  'Pacific/Marquesas', // −9:30
  // extremes
  'Pacific/Kiritimati', // +14
  'Pacific/Tongatapu', // +13
  'Pacific/Apia', // +13
  'Pacific/Pago_Pago', // −11
  'Pacific/Niue', // −11
  'Etc/GMT+12', // −12
  // plain
  'UTC',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'America/Sao_Paulo',
  'Pacific/Honolulu',
  'Atlantic/Azores',
  'America/Phoenix',
] as const;

const DST_DATES = [
  '2026-03-08', // US spring
  '2026-03-29', // EU spring
  '2026-04-05', // AU/NZ/Chile end
  '2026-09-06', // Chile start
  '2026-09-27', // NZ start
  '2026-10-04', // AU start
  '2026-10-25', // EU end
  '2026-11-01', // US end
  '2027-03-14',
  '2027-03-28',
  '2027-04-04',
  '2027-09-26',
  '2027-10-03',
  '2027-10-31',
  '2027-11-07',
].map((d) => Date.parse(`${d}T00:00:00Z`));

export const iso = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z');
export const ms = (s: string) => Date.parse(s);

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const zoneArb = fc.constantFrom(...ZONES);
const departArb = fc.oneof(
  {
    weight: 3,
    arbitrary: fc
      .integer({ min: Date.UTC(2026, 0, 1) / MIN, max: Date.UTC(2027, 11, 31) / MIN })
      .map((m) => m * MIN),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(fc.constantFrom(...DST_DATES), fc.integer({ min: -4 * 1440, max: 4 * 1440 }))
      .map(([d, m]) => d + m * MIN),
  },
);

const legsArb = fc
  .record({
    n: fc.integer({ min: 1, max: 4 }),
    zones: fc.array(zoneArb, { minLength: 5, maxLength: 5 }),
    durs: fc.array(fc.integer({ min: 60, max: 19 * 60 }), { minLength: 4, maxLength: 4 }),
    lays: fc.array(fc.integer({ min: 60, max: 30 * 60 }), { minLength: 3, maxLength: 3 }),
    dep: departArb,
  })
  .map(({ n, zones, durs, lays, dep }) => {
    const legs: TripInput['legs'] = [];
    let t = dep;
    for (let i = 0; i < n; i++) {
      const a = t + durs[i]! * MIN;
      legs.push({ from: { tz: zones[i]! }, to: { tz: zones[i + 1]! }, departUtc: iso(t), arriveUtc: iso(a) });
      t = a + (lays[i] ?? 0) * MIN;
    }
    return legs;
  });

const hhmm = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

const sleepArb = fc
  .record({
    bed: fc.integer({ min: 20 * 60, max: 27 * 60 }),
    wake: fc.integer({ min: 4 * 60, max: 11 * 60 }),
    chronotype: fc.constantFrom('early' as const, 'intermediate' as const, 'late' as const),
  })
  .filter(({ bed, wake }) => {
    const d = ((((wake - bed) % 1440) + 1440) % 1440) / 60;
    return d >= 4 && d <= 12;
  })
  .map(({ bed, wake, chronotype }) => ({ usualBedtime: hhmm(bed), usualWake: hhmm(wake), chronotype }));

const prefsArb = fc.record(
  {
    useMelatonin: fc.boolean(),
    useCaffeine: fc.boolean(),
    preAdapt: fc.boolean(),
    maxPreDays: fc.integer({ min: 0, max: 3 }),
  },
  { requiredKeys: ['useMelatonin', 'useCaffeine', 'preAdapt'] },
);

const stayArb = fc.option(
  fc.oneof(
    { weight: 4, arbitrary: fc.integer({ min: 1, max: 30 }) },
    { weight: 1, arbitrary: fc.integer({ min: 2, max: 10 }).map((x) => x / 2 + 0.25) },
  ),
  { nil: undefined, freq: 2 },
);
const offsetArb = fc.option(fc.integer({ min: -48, max: 48 }).map((x) => x / 4), { nil: undefined, freq: 4 });

export const tripArb: fc.Arbitrary<TripInput> = fc
  .record({ legs: legsArb, sleep: sleepArb, prefs: prefsArb, stayDays: stayArb, offset: offsetArb })
  .map(({ legs, sleep, prefs, stayDays, offset }) => {
    const input: TripInput = { legs, sleep, prefs };
    if (stayDays !== undefined) input.stayDays = stayDays;
    if (offset !== undefined) input.startingBodyClockOffsetHours = offset;
    return input;
  });

// ---------------------------------------------------------------------------
// Memoised plans and independent helpers
// ---------------------------------------------------------------------------

export type Detailed = ReturnType<typeof buildPlanDetailed>;
const memo = new Map<string, Detailed>();
export function detailed(input: TripInput): Detailed {
  const k = JSON.stringify(input);
  let d = memo.get(k);
  if (!d) {
    d = buildPlanDetailed(input);
    memo.set(k, d);
  }
  return d;
}
export const plan = (input: TripInput): Plan => detailed(input).plan;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function localParts(tz: string, t: number) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}
export function offsetMin(tz: string, t: number): number {
  const p = localParts(tz, t);
  const [y, m, d] = p.date.split('-').map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!, p.hour, p.minute) - Math.floor(t / MIN) * MIN) / MIN);
}
export const addDays = (date: string, k: number) => new Date(Date.parse(`${date}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);

export const all = (p: Plan) => p.days.flatMap((d) => d.windows);
export const of = (p: Plan, k: AdviceWindow['kind']) => all(p).filter((w) => w.kind === k);
export const overlap = (a: AdviceWindow, b: AdviceWindow) => ms(a.startUtc) < ms(b.endUtc) && ms(b.startUtc) < ms(a.endUtc);
const legSpans = (i: TripInput) => i.legs.map((l) => [ms(l.departUtc), ms(l.arriveUtc)] as const);
export const flying = (i: TripInput, t: number) => legSpans(i).some(([a, b]) => t >= a && t < b);
export const adaptivePlan = (p: Plan) => p.strategy === 'advance' || p.strategy === 'delay';

/** Expected zone at an instant (journey.ts contract, re-derived independently). */
function tzExpected(i: TripInput, t: number): string {
  if (t < ms(i.legs[0]!.departUtc)) return i.legs[0]!.from.tz;
  for (let k = 0; k < i.legs.length; k++) {
    const next = i.legs[k + 1];
    if (!next || t < ms(next.departUtc)) return i.legs[k]!.to.tz;
  }
  return i.legs[i.legs.length - 1]!.to.tz;
}


// ---------------------------------------------------------------------------
// Invariant checks: each returns violations (empty = holds)
// ---------------------------------------------------------------------------

export type Check = (input: TripInput, d: Detailed) => string[];

const kindsOf = (p: Plan) => all(p);
const lastLeg = (i: TripInput) => i.legs[i.legs.length - 1]!;
export const zonesIn = (i: TripInput) => [...new Set(i.legs.flatMap((l) => [l.from.tz, l.to.tz]))];

export const CHECKS: Record<string, Check> = {
  /** Sorted, 5-minute grid, well-formed, tz = where the traveller is, inside the plan days and stay. */
  shape(input, { plan: p }) {
    const v: string[] = [];
    const ws = kindsOf(p);
    for (let k = 1; k < ws.length; k++)
      if (ms(ws[k]!.startUtc) < ms(ws[k - 1]!.startUtc)) v.push(`unsorted ${ws[k - 1]!.kind}@${ws[k - 1]!.startUtc} > ${ws[k]!.kind}@${ws[k]!.startUtc}`);
    for (let k = 1; k < p.days.length; k++) if (p.days[k]!.dayIndex <= p.days[k - 1]!.dayIndex) v.push('dayIndex not increasing');
    for (const w of ws) {
      const t = ms(w.startUtc);
      if (t % (5 * MIN) || ms(w.endUtc) % (5 * MIN)) v.push(`off-grid ${w.kind}@${w.startUtc}`);
      if (w.kind === 'melatonin' ? w.endUtc !== w.startUtc : ms(w.endUtc) <= t) v.push(`bad length ${w.kind}@${w.startUtc}`);
      // tz is taken at the unrounded start, which is within 2.5 min of the rounded one.
      const ok = [t, t - 150_000, t + 150_000].map((x) => tzExpected(input, x));
      if (!ok.includes(w.tz)) v.push(`tz ${w.tz} for ${w.kind}@${w.startUtc}, expected ${ok[0]}`);
      if (localParts(w.tz, t).minute % 5) v.push(`local off-grid ${w.kind}@${w.startUtc}`);
    }
    if (p.days.length === 0) return v;
    const first = p.days[0]!;
    for (const w of ws) if (localParts(first.tz, ms(w.startUtc)).date < first.date) v.push(`before first day ${w.kind}@${w.startUtc}`);
    // Except day 0 (which spans the journey), a window starts on its day's local date, or the
    // next date for a sleep after midnight and the evening windows bucketed with it.
    for (const d of p.days) {
      if (d.dayIndex === 0) continue;
      for (const w of d.windows) {
        const dt = localParts(d.tz, ms(w.startUtc)).date;
        if (dt !== d.date && dt !== addDays(d.date, 1)) v.push(`day ${d.dayIndex} (${d.date}) holds ${w.kind}@${w.startUtc} (${dt})`);
      }
    }
    if (input.stayDays !== undefined && adaptivePlan(p)) {
      const dest = lastLeg(input).to.tz;
      const endDate = localParts(dest, ms(lastLeg(input).arriveUtc) + input.stayDays * DAY).date;
      // The engine filters on the unrounded start, which may be up to 2.5 min before the rounded one.
      for (const w of ws)
        if (localParts(dest, ms(w.startUtc) - 150_000).date > endDate) v.push(`after stay ${w.kind}@${w.startUtc}`);
    }
    return v;
  },

  /** Each plan day carries its own calendar date (no two days share a label). */
  dates(_input, { plan: p }) {
    const v: string[] = [];
    for (let k = 1; k < p.days.length; k++) {
      const a = p.days[k - 1]!;
      const b = p.days[k]!;
      if (!(b.date > a.date)) v.push(`day ${a.dayIndex} ${a.date} (${a.tz}) then day ${b.dayIndex} ${b.date} (${b.tz})`);
    }
    return v;
  },

  /** Nothing scheduled inside a sleep; sleeps never overlap. */
  insideSleep(_input, { plan: p }) {
    const v: string[] = [];
    const sleeps = of(p, 'sleep');
    for (const w of all(p)) {
      if (w.kind === 'sleep') continue;
      for (const s of sleeps) {
        const t = ms(w.startUtc);
        const bad = w.kind === 'melatonin' ? t > ms(s.startUtc) && t < ms(s.endUtc) : overlap(w, s);
        if (bad) v.push(`${w.kind}@${w.startUtc} inside sleep ${s.startUtc}..${s.endUtc}`);
      }
    }
    for (let a = 0; a < sleeps.length; a++)
      for (let b = a + 1; b < sleeps.length; b++)
        if (overlap(sleeps[a]!, sleeps[b]!)) v.push(`sleeps overlap ${sleeps[a]!.startUtc} ${sleeps[b]!.startUtc}`);
    return v;
  },

  /** Contradictory advice never overlaps. */
  contradictions(_input, { plan: p }) {
    const v: string[] = [];
    const pairs = [
      ['seek_light', 'avoid_light'],
      ['caffeine_ok', 'avoid_caffeine'],
      ['nap', 'seek_light'],
    ] as const;
    for (const [x, y] of pairs)
      for (const a of of(p, x)) for (const b of of(p, y)) if (overlap(a, b)) v.push(`${x}@${a.startUtc} overlaps ${y}@${b.startUtc}`);
    return v;
  },

  /** No caffeine_ok within CAFFEINE_CUTOFF_H (8 h) before any planned sleep (SCIENCE.md §6). */
  caffeine(_input, { plan: p }) {
    const v: string[] = [];
    for (const c of of(p, 'caffeine_ok'))
      for (const s of of(p, 'sleep')) {
        const lo = ms(s.startUtc) - PARAMS.CAFFEINE_CUTOFF_H * HOUR;
        if (ms(c.startUtc) < ms(s.startUtc) && ms(c.endUtc) > lo) v.push(`caffeine_ok ${c.startUtc}..${c.endUtc} within 8 h of sleep@${s.startUtc}`);
      }
    return v;
  },

  /**
   * Light is never sought on the wrong side of the modelled Tmin (SCIENCE.md §2): advance plans
   * never in [Tmin − 5, Tmin + 1), delay plans never in [Tmin − 1, Tmin + 4). The modelled Tmin is
   * every simulated event plus the unshifted continuation after the last one. Rounding to the
   * 5-minute output grid may move a boundary by up to 2.5 min.
   */
  lightSafety(input, d) {
    const p = d.plan;
    if (!adaptivePlan(p)) return [];
    const v: string[] = [];
    const ev = d.debug.events.map((e) => e.t);
    const last = ev[ev.length - 1]!;
    const tmins = [ev[0]! - DAY, ...ev, ...Array.from({ length: 20 }, (_, k) => last + (k + 1) * DAY)];
    const [lo, hi] = p.strategy === 'advance' ? [-5, 1] : [-1, 4];
    const tol = 150_000;
    for (const w of of(p, 'seek_light')) {
      const s = ms(w.startUtc);
      const e = ms(w.endUtc);
      for (const t of tmins)
        if (s < t + hi * HOUR - tol && e > t + lo * HOUR + tol)
          v.push(`${p.strategy} seek_light ${w.startUtc}..${w.endUtc} vs Tmin ${iso(t)}`);
    }
    void input;
    return v;
  },

  /**
   * remainingShiftHours: |rem| never grows except by a destination DST change, keeps the planned
   * sign above tolerance, and ends adapted unless the horizon or the stay cuts the plan.
   */
  convergence(input, d) {
    const p = d.plan;
    if (!adaptivePlan(p)) return [];
    const v: string[] = [];
    const rem = p.days.map((x) => x.remainingShiftHours);
    // The target is the destination's local clock (SCIENCE.md §10): a DST change there between two
    // days moves the remaining shift by the size of that change.
    const dest = lastLeg(input).to.tz;
    const noon = (x: Plan['days'][number]) => Date.parse(`${x.date}T12:00:00Z`) - offsetMin(x.tz, Date.parse(`${x.date}T12:00:00Z`)) * MIN;
    for (let k = 1; k < rem.length; k++) {
      // remaining is sampled at the usual wake but follows the Tmin events, so the change can show
      // up to a day late: look back two days.
      const dst = Math.abs(offsetMin(dest, noon(p.days[k]!)) - offsetMin(dest, noon(p.days[k - 1]!) - 2 * DAY)) / 60;
      if (Math.abs(rem[k]!) > Math.abs(rem[k - 1]!) + dst + 0.05 + 1e-9) v.push(`|rem| grows day ${p.days[k]!.dayIndex}: ${rem[k - 1]} → ${rem[k]}`);
    }
    for (const r of rem) if (Math.abs(r) > PARAMS.ADAPTED_TOL && Math.sign(r) !== Math.sign(p.plannedShiftHours)) v.push(`rem sign ${r}`);
    const horizon = p.warnings.some((w) => w.startsWith('Plan covers') || w.startsWith('Short stay'));
    let stayCut = false;
    if (input.stayDays !== undefined) {
      const dest = lastLeg(input).to.tz;
      const endDate = localParts(dest, ms(lastLeg(input).arriveUtc) + input.stayDays * DAY).date;
      stayCut = p.days[p.days.length - 1]!.date >= endDate;
    }
    const lastEv = d.debug.events[d.debug.events.length - 1]!;
    if (!horizon && Math.abs(lastEv.remaining) > PARAMS.ADAPTED_TOL) v.push(`simulation ends at ${lastEv.remaining} without a horizon warning`);
    if (!horizon && !stayCut && Math.abs(rem[rem.length - 1]!) > PARAMS.ADAPTED_TOL) v.push(`last day rem ${rem[rem.length - 1]}`);
    return v;
  },

  /** No awake span between consecutive sleeps longer than 30 h. */
  sleepGap(_input, { plan: p }) {
    const v: string[] = [];
    const s = of(p, 'sleep');
    for (let k = 1; k < s.length; k++) {
      const gap = (ms(s[k]!.startUtc) - ms(s[k - 1]!.endUtc)) / HOUR;
      if (gap > 30) v.push(`awake ${gap.toFixed(1)} h ${s[k - 1]!.endUtc} → ${s[k]!.startUtc}`);
    }
    return v;
  },

  /**
   * Sleep length: ≤ 12 h (13 h on a DST fall-back night: the wake time stays on the local clock,
   * journey.ts wallEnd); a ground sleep ≥ MIN_GROUND_SLEEP_H (2 h, SCIENCE.md §12: the rest of a
   * night cut by a departure or an arrival is kept when at least 2 h long); in-flight ≥ 1.5 h.
   */
  sleepLength(input, { plan: p }) {
    const v: string[] = [];
    for (const s of of(p, 'sleep')) {
      const len = (ms(s.endUtc) - ms(s.startUtc)) / HOUR;
      const air = flying(input, ms(s.startUtc));
      const min = air ? PARAMS.MIN_FLIGHT_SLEEP_WINDOW_H : PARAMS.MIN_GROUND_SLEEP_H;
      // Home-time and layover sleeps follow another zone's clock than the window's tz.
      const fallBack = Math.max(
        0,
        ...zonesIn(input).map((z) => (offsetMin(z, ms(s.startUtc)) - offsetMin(z, ms(s.endUtc))) / 60),
      );
      if (len > 12 + fallBack + 1e-9 || len < min - 1e-9) v.push(`${air ? 'flight' : 'ground'} sleep ${len.toFixed(2)} h ${s.startUtc}..${s.endUtc}`);
    }
    return v;
  },

  /** Preferences and output ranges. */
  prefs(input, { plan: p }) {
    const v: string[] = [];
    if ((!input.prefs.useMelatonin || p.strategy !== 'advance') && of(p, 'melatonin').length) v.push('melatonin without opt-in/advance');
    if (!input.prefs.useCaffeine && (of(p, 'caffeine_ok').length || of(p, 'avoid_caffeine').length)) v.push('caffeine windows with caffeine off');
    if (!(p.zoneDeltaHours > -12 && p.zoneDeltaHours <= 14)) v.push(`zoneDelta ${p.zoneDeltaHours}`);
    return v;
  },
};

const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

/**
 * A destination night after arrival (not a recovery sleep) ends at the usual wake time on the destination clock (rounded
 * to the 5-minute grid), DST nights included: "the alarm still rings at the usual local wake time"
 * (journey.ts wallEnd, SCIENCE.md §11).
 */
CHECKS.destWake = (input, { plan: p }) => {
  if (!adaptivePlan(p)) return [];
  const v: string[] = [];
  const dest = lastLeg(input).to.tz;
  const arr = ms(lastLeg(input).arriveUtc);
  const wake = (Math.round(hm(input.sleep.usualWake) / 5) * 5) % 1440;
  for (const s of of(p, 'sleep')) {
    // A recovery sleep (awake-span safety cap, PARAMS.MAX_AWAKE_HARD_H) is not a habitual night.
    if (s.tz !== dest || ms(s.startUtc) < arr || s.rationale === RATIONALE.sleepRecovery) continue;
    const e = localParts(dest, ms(s.endUtc));
    if (e.hour * 60 + e.minute !== wake) v.push(`dest sleep ${s.startUtc}..${s.endUtc} ends ${String(e.hour).padStart(2, '0')}:${String(e.minute).padStart(2, '0')} local, usual wake ${input.sleep.usualWake}`);
  }
  return v;
};
