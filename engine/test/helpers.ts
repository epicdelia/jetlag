import type { AdviceKind, AdviceWindow, Plan, TripInput, FlightLeg, SleepProfile, Preferences } from '../src/types';
import { formatWindowLocal } from '../src/format';

export const DEFAULT_SLEEP: SleepProfile = { usualBedtime: '23:00', usualWake: '07:00', chronotype: 'intermediate' };
export const DEFAULT_PREFS: Preferences = { useMelatonin: false, useCaffeine: true, preAdapt: true, maxPreDays: 3 };

export function leg(fromTz: string, toTz: string, departUtc: string, arriveUtc: string): FlightLeg {
  return { from: { tz: fromTz }, to: { tz: toTz }, departUtc, arriveUtc };
}

export function trip(
  legs: FlightLeg[],
  opts: { sleep?: Partial<SleepProfile>; prefs?: Partial<Preferences>; stayDays?: number } = {},
): TripInput {
  return {
    legs,
    sleep: { ...DEFAULT_SLEEP, ...opts.sleep },
    prefs: { ...DEFAULT_PREFS, ...opts.prefs },
    ...(opts.stayDays !== undefined ? { stayDays: opts.stayDays } : {}),
  };
}

export const ms = (iso: string) => Date.parse(iso);

export function allWindows(plan: Plan): AdviceWindow[] {
  return plan.days.flatMap((d) => d.windows);
}

export function windowsOf(plan: Plan, kind: AdviceKind, dayIndex?: number): AdviceWindow[] {
  return plan.days
    .filter((d) => dayIndex === undefined || d.dayIndex === dayIndex)
    .flatMap((d) => d.windows.filter((w) => w.kind === kind));
}

export function local(w: AdviceWindow): string {
  const f = formatWindowLocal(w);
  return `${f.startLocal}-${f.endLocal}`;
}

export function overlaps(a: AdviceWindow, b: AdviceWindow): boolean {
  return ms(a.startUtc) < ms(b.endUtc) && ms(b.startUtc) < ms(a.endUtc);
}

/** Point windows (start == end) count as inside when strictly within. */
export function inside(point: AdviceWindow, container: AdviceWindow): boolean {
  if (point.startUtc === point.endUtc) {
    const t = ms(point.startUtc);
    return t > ms(container.startUtc) && t < ms(container.endUtc);
  }
  return overlaps(point, container);
}

/** Readable dump for debugging. */
export function dump(plan: Plan): string {
  const lines = [
    `${plan.strategy} delta=${plan.zoneDeltaHours} planned=${plan.plannedShiftHours} days=${plan.estimatedDaysToAdapt}`,
    ...plan.warnings.map((w) => `  ! ${w}`),
  ];
  for (const d of plan.days) {
    lines.push(`day ${d.dayIndex} ${d.date} ${d.tz} rem=${d.remainingShiftHours}`);
    for (const w of d.windows) lines.push(`    ${w.kind.padEnd(15)} ${local(w).padEnd(12)} ${w.tz}  ${w.startUtc}`);
  }
  return lines.join('\n');
}

// Scenario fixtures from SCIENCE.md §13
export const YYZ_LHR = leg('America/Toronto', 'Europe/London', '2026-11-11T02:00:00Z', '2026-11-11T08:50:00Z');
export const LAX_SYD = leg('America/Los_Angeles', 'Australia/Sydney', '2026-11-11T06:00:00Z', '2026-11-11T19:30:00Z');
export const JFK_HND = leg('America/New_York', 'Asia/Tokyo', '2026-11-10T17:00:00Z', '2026-11-11T06:30:00Z');
export const LHR_SIN = leg('Europe/London', 'Asia/Singapore', '2026-11-10T21:00:00Z', '2026-11-11T09:00:00Z');
