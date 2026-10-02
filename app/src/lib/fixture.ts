/**
 * DEV-ONLY synthetic plan used to build the UI while the engine is in
 * progress (enable with EXPO_PUBLIC_PLAN_FIXTURE=1). It is NOT advice and is
 * never used in production builds. Shape follows engine/src/types.ts.
 */
import type { AdviceKind, AdviceWindow, DayPlan, Plan, TripInput } from '@jetlag/engine';

import { dateKeyPlusDays, formatDateKey, hhmmToMinutes, localToUtc, minutesToHHmm, offsetMinutes } from './tz';

export function buildFixturePlan(input: TripInput): Plan {
  const first = input.legs[0]!;
  const last = input.legs[input.legs.length - 1]!;
  const home = first.from.tz;
  const dest = last.to.tz;
  const arrive = Date.parse(last.arriveUtc);
  let delta = (offsetMinutes(arrive, dest) - offsetMinutes(arrive, home)) / 60;
  if (delta <= -12) delta += 24;
  if (delta > 14) delta -= 24;
  const advance = delta > 0 && delta <= 9;
  const planned = advance ? delta : delta > 0 ? delta - 24 : delta;
  const rate = advance ? 1 : 1.5;
  const daysToAdapt = Math.ceil(Math.abs(planned) / rate);
  const bed = hhmmToMinutes(input.sleep.usualBedtime) ?? 23 * 60;
  const wake = hhmmToMinutes(input.sleep.usualWake) ?? 7 * 60;
  const departDate = formatDateKey(Date.parse(first.departUtc), home);

  const days: DayPlan[] = [];
  const pre = input.prefs.preAdapt ? Math.min(input.prefs.maxPreDays ?? 3, 2) : 0;
  for (let i = -pre; i <= daysToAdapt; i++) {
    const tz = i <= 0 ? home : dest;
    const date = i <= 0 ? dateKeyPlusDays(departDate, i) : formatDateKey(arrive + (i - 1) * 864e5, dest);
    const shifted = i < 0 ? (advance ? -1 : 1) * (pre + i + 1) * 60 : 0;
    const remaining = Math.max(0, Math.abs(planned) - Math.max(0, i) * rate) * Math.sign(planned);
    const windows: AdviceWindow[] = [];
    const at = (min: number, dayOffset = 0) => {
      const d = dateKeyPlusDays(date, dayOffset + Math.floor(min / 1440));
      const r = localToUtc(d, minutesToHHmm(min), tz);
      return r.ok ? r.iso : null;
    };
    const push = (kind: AdviceKind, s: number, e: number, rationale: string) => {
      const a = at(s);
      const b = at(e, e < s ? 1 : 0);
      if (a && b) windows.push({ kind, startUtc: a, endUtc: b, tz, rationale });
    };
    const w = wake + shifted;
    const b = bed + shifted;
    push('seek_light', w, w + 120, 'Fixture: morning light helps move your body clock earlier.');
    push('caffeine_ok', w, w + 360, 'Fixture: caffeine early in the day is unlikely to disturb sleep.');
    push('avoid_caffeine', b - 480, b, 'Fixture: caffeine late in the day can delay and fragment sleep.');
    push('avoid_light', b - 120, b, 'Fixture: dim evening light avoids pushing your clock later.');
    if (input.prefs.useMelatonin) push('melatonin', b - 300, b - 300, 'Fixture: a low dose in the late afternoon is commonly used to shift earlier.');
    push('sleep', b, w + 1440, 'Fixture: keep a consistent sleep window.');
    if (i === 1) push('nap', 14 * 60, 14 * 60 + 20, 'Fixture: a short early-afternoon nap can ease sleep loss.');
    days.push({ date, tz, dayIndex: i, windows, remainingShiftHours: i < 1 ? planned : remaining });
  }
  return {
    strategy: Math.abs(delta) < 2 ? 'none' : advance ? 'advance' : 'delay',
    zoneDeltaHours: delta,
    plannedShiftHours: planned,
    estimatedDaysToAdapt: daysToAdapt,
    days,
    warnings: ['Development fixture: this is not a real plan.'],
  };
}
