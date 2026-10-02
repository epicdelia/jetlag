/**
 * Public contract of the circadian engine. The app depends ONLY on these types
 * and on `buildPlan`. Change this file deliberately: it is shared by engine and app.
 *
 * Conventions:
 * - All instants are ISO-8601 UTC strings (e.g. "2026-11-03T14:30:00Z").
 * - All time zones are IANA names (e.g. "America/Toronto"). Never raw offsets:
 *   offsets change with DST and the engine must resolve them per instant.
 * - Clock times of day ("HH:mm", 24h) are local to the zone named alongside them.
 */

export type Chronotype = 'early' | 'intermediate' | 'late';

export interface Place {
  /** IANA time zone, required. */
  tz: string;
  /** Optional display label, e.g. "YYZ" or "Toronto". */
  label?: string;
}

export interface FlightLeg {
  from: Place;
  to: Place;
  departUtc: string;
  arriveUtc: string;
}

export interface SleepProfile {
  /** Usual bedtime at home, "HH:mm" in the trip origin's time zone. */
  usualBedtime: string;
  /** Usual wake time at home, "HH:mm" in the trip origin's time zone. */
  usualWake: string;
  chronotype: Chronotype;
}

export interface Preferences {
  /** Include low-dose melatonin timing advice. Default false. */
  useMelatonin: boolean;
  /** Include caffeine timing advice. Default true. */
  useCaffeine: boolean;
  /** Allow shifting sleep/light before departure. Default true. */
  preAdapt: boolean;
  /** Max days of pre-departure adjustment when preAdapt is true. Default 3. */
  maxPreDays?: number;
}

export interface TripInput {
  /** One or more legs, chronological, forming one journey origin → final destination. */
  legs: FlightLeg[];
  sleep: SleepProfile;
  prefs: Preferences;
  /**
   * Planned stay at the final destination in days, if known. Used to decide whether
   * adapting is worthwhile at all (very short stays → stay on home time).
   */
  stayDays?: number;
}

export type AdviceKind =
  | 'seek_light'
  | 'avoid_light'
  | 'sleep'
  | 'nap'
  | 'caffeine_ok'
  | 'avoid_caffeine'
  | 'melatonin';

export interface AdviceWindow {
  kind: AdviceKind;
  startUtc: string;
  /** Equal to startUtc for point-in-time advice (e.g. melatonin dose). */
  endUtc: string;
  /** Zone the traveller is (expected to be) in at startUtc; the UI displays in this zone. */
  tz: string;
  /** One plain-language sentence explaining why. No medical claims. */
  rationale: string;
}

export interface DayPlan {
  /** Local calendar date "YYYY-MM-DD" in `tz`. */
  date: string;
  tz: string;
  /** Relative to departure day (day 0 = day of first departure, negative = pre-trip). */
  dayIndex: number;
  windows: AdviceWindow[];
  /**
   * Model estimate of the body clock's remaining misalignment vs destination time
   * at the start of this day, in hours. Positive = body clock behind destination
   * (needs to advance), negative = ahead (needs to delay). 0 = adapted.
   */
  remainingShiftHours: number;
}

export type Strategy = 'advance' | 'delay' | 'stay_on_home_time' | 'none';

export interface Plan {
  strategy: Strategy;
  /** Net zone difference destination − origin at arrival, hours, in (-12, +14]. */
  zoneDeltaHours: number;
  /** Hours the body clock is planned to move (sign: + advance, − delay). */
  plannedShiftHours: number;
  /** Estimated number of days until adapted (0 when strategy is none/stay). */
  estimatedDaysToAdapt: number;
  days: DayPlan[];
  /** Human-readable cautions (e.g. "very short stay", "crossing >10h: delaying instead"). */
  warnings: string[];
}

export class TripInputError extends Error {}
