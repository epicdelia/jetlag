import type { Chronotype } from './types';

/**
 * Every tunable number of the model, with its source (see docs/SCIENCE.md §12).
 * Hours unless the name says otherwise.
 */
export const PARAMS = {
  /** Tmin sits this many hours before habitual wake (Baehr2000, Duffy1999 direction; magnitude DESIGN CHOICE). */
  TMIN_BEFORE_WAKE: { early: 3.5, intermediate: 3.0, late: 2.5 } as Readonly<Record<Chronotype, number>>,
  /** Lower clamp for Tmin-before-wake; upper clamp is D/2 (DESIGN CHOICE). */
  TMIN_MIN_BEFORE_WAKE: 1.5,
  /** DLMO ≈ 7 h before Tmin (widely used approximation). */
  DLMO_TO_TMIN: 7,
  /** Below this |zone delta| no plan is made (DESIGN CHOICE). */
  MIN_SHIFT_TO_PLAN: 2,
  /** Eastward delta at or above this uses the delay strategy (derived from rates; weak evidence). */
  ANTIDROMIC_EAST_THRESHOLD: 10,
  /** Eastward delta at or above this (and below the threshold) gets the morning-light warning (DESIGN CHOICE). */
  ANTIDROMIC_RISK_LOW: 8,
  /** Pre-flight advance rate, h/day (Burgess2003 intermittent-light arm). */
  PRE_ADV_RATE: 0.5,
  /** Pre-flight advance rate with melatonin, h/day (Revell2006, discounted). */
  PRE_ADV_RATE_MEL: 0.75,
  /** Pre-flight delay rate, h/day (DESIGN CHOICE, weak evidence). */
  PRE_DEL_RATE: 0.75,
  /** Post-departure advance rate, h/day (CDC Yellow Book ~57 min/day). */
  POST_ADV_RATE: 1.0,
  /** Post-departure advance rate with melatonin (DESIGN CHOICE, Revell2006 ratio discounted). */
  POST_ADV_RATE_MEL: 1.25,
  /** Post-departure delay rate, h/day (CDC Yellow Book ~92 min/day). */
  POST_DEL_RATE: 1.5,
  /** Pre-flight sleep moves this much per night (Burgess2003, Eastman2005). */
  PRE_SLEEP_STEP: 1,
  /** Hard cap on pre-flight days (3-day protocols). */
  MAX_PRE_DAYS: 3,
  /** Minimum |planned shift| for pre-adaptation (DESIGN CHOICE). */
  PREADAPT_MIN: 3,
  /** Light windows relative to Tmin, [from, to) hours. */
  LIGHT: {
    advance: { seek: [1, 5], avoid: [-5, 1] },
    delay: { seek: [-5, -1], avoid: [-1, 4] },
  } as const,
  /**
   * Delay seek-light may extend this far before Tmin when the [t−5, t−1) window is lost to
   * sleep: light in the evening before bedtime is still in the light-PRC delay region
   * (Khalsa2003). The engine keeps the latest 4 h of waking time in [t−8, t−1) (DESIGN CHOICE).
   */
  DELAY_SEEK_MAX_BEFORE_TMIN_H: 8,
  /**
   * Local hours [from, to) treated as possible daylight for rationale wording only. Outside
   * them, seek-light advice says bright indoor light instead of daylight (no solar model).
   */
  DAYLIGHT_HOURS: [6.5, 19.5] as const,
  /**
   * Local hours [from, to) that are daylight year-round at mid latitudes, including winter
   * (no solar model, no latitude). Only light windows entirely inside them say "ideally
   * daylight"; windows that straddle the edges say daylight "if it's light out" (DESIGN CHOICE).
   */
  DAYLIGHT_CORE_HOURS: [8, 16.5] as const,
  /** Stay-on-home-time avoid-light window around home Tmin. */
  STAY_AVOID: [-4, 4] as const,
  /** Light windows shorter than this are dropped (DESIGN CHOICE). */
  MIN_WINDOW_H: 0.5,
  /** |remaining| at or below this counts as adapted (DESIGN CHOICE). */
  ADAPTED_TOL: 1.0,
  /** Simulation horizon after arrival, days (DESIGN CHOICE). */
  MAX_POST_DAYS: 14,
  /** stayDays at or below this (with |delta| ≥ 3) → stay on home time (DESIGN CHOICE). */
  STAY_HOME_MAX_DAYS: 2,
  /** |delta| needed for stay-on-home-time to apply. */
  STAY_HOME_MIN_DELTA: 3,
  /** Stays this short get the "may only partly adapt" warning when adaptation takes longer. */
  SHORT_STAY_WARN_DAYS: 4,
  /** Melatonin dose, mg (Burgess2010, Revell2006). */
  MEL_DOSE_MG: 0.5,
  /** Melatonin candidate time: this many hours before DLMO (Burgess2010: 2–4 h). */
  MEL_BEFORE_DLMO_H: 3,
  /** Bedtime fallback must lie in [DLMO − 6, DLMO − 0.5] (DESIGN CHOICE). */
  MEL_FALLBACK_RANGE: [-6, -0.5] as const,
  /** Max melatonin doses after departure (Herxheimer2002: 2–5 days). */
  MELATONIN_MAX_POST_DOSES: 5,
  /** No caffeine this long before any planned sleep (Gardiner2023, Drake2013). */
  CAFFEINE_CUTOFF_H: 8,
  /** caffeine_ok needs at least this long a slot. */
  CAFFEINE_OK_MIN_H: 1,
  /** caffeine_ok after the arrival day only while |remaining| ≥ this (DESIGN CHOICE). */
  CAFFEINE_OK_REMAINING: 2,
  /** Nap length, minutes (BrooksLack2006, Rosekind1995). */
  NAP_MIN: 20,
  /** No nap closer than this to the next sleep (DESIGN CHOICE). */
  NAP_BEFORE_BED_H: 6,
  /** No nap sooner than this after waking. */
  NAP_AFTER_WAKE_H: 2,
  /** No nap sooner than this after landing (deplaning, immigration, transfer; DESIGN CHOICE). */
  NAP_AFTER_ARRIVAL_H: 1.5,
  /**
   * Ground naps stay out of the body-clock night and the first hours after it: not before
   * Tmin + this many hours, when sleep inertia is worst (DESIGN CHOICE).
   */
  NAP_AFTER_TMIN_H: 2,
  /** Naps after the arrival day only while |remaining| ≥ this (DESIGN CHOICE). */
  NAP_REMAINING: 3,
  /** Legs shorter than this get no in-flight sleep (DESIGN CHOICE). */
  MIN_FLIGHT_SLEEP_H: 4,
  /** Minimum in-flight sleep window (DESIGN CHOICE). */
  MIN_FLIGHT_SLEEP_WINDOW_H: 1.5,
  /** In-flight sleep starts at least this long after the previous sleep ended (DESIGN CHOICE). */
  FLIGHT_SLEEP_AFTER_WAKE_H: 4,
  /**
   * In-flight sleep is placed only inside the body-clock night (habitual sleep period on the
   * current Tmin estimate) widened by this many hours on each side. A destination night that
   * falls in the body-clock daytime is not a realistic sleep (DESIGN CHOICE).
   */
  FLIGHT_SLEEP_BODY_MARGIN_H: 2,
  /**
   * ...unless the traveller has been awake at least this long by then: with that much sleep
   * pressure, sleep on the plane is realistic at any body-clock time (DESIGN CHOICE).
   */
  FLIGHT_SLEEP_PRESSURE_H: 8,
  /** In-flight sleep keeps this far from takeoff and landing. */
  FLIGHT_SLEEP_BUFFER_H: 1,
  /**
   * If the traveller would be awake longer than this from the last sleep before a long leg to
   * the first sleep on or after it (including a late in-flight sleep), schedule in-flight sleep
   * during the body-clock night (DESIGN CHOICE; extension to SCIENCE.md §11 step 6).
   */
  MAX_AWAKE_H: 20,
  /**
   * In-flight nap on a long travel day (SCIENCE.md §7.1): when no in-flight sleep is placed on a
   * leg and the traveller would be awake at least this long from the last sleep before the leg
   * to the first sleep after it (DESIGN CHOICE).
   */
  INFLIGHT_NAP_AWAKE_H: 18,
  /** Awake at least this long → the in-flight nap may be one full sleep cycle (DESIGN CHOICE). */
  INFLIGHT_NAP_LONG_AWAKE_H: 22,
  /** In-flight nap opportunity, minutes (Rosekind1995: 40-min planned rest, ~26 min asleep). */
  INFLIGHT_NAP_MIN: 40,
  /** Long-wake in-flight nap, minutes: about one NREM–REM cycle (widely used approximation). */
  INFLIGHT_NAP_LONG_MIN: 90,
  /** Shortest in-flight nap worth suggesting when a longer one does not fit, minutes. */
  INFLIGHT_NAP_SHORTEST_MIN: 20,
  /**
   * Preferred in-flight nap time: the body-clock early afternoon, this many hours after the
   * current Tmin estimate (≈ 14:00 for a 04:00 Tmin; DESIGN CHOICE).
   */
  NAP_BODY_AFTERNOON_AFTER_TMIN_H: 10,
  /** Every window boundary is rounded to this many minutes at output (DESIGN CHOICE). */
  OUTPUT_ROUND_MIN: 5,
  /** Allowed |TripInput.startingBodyClockOffsetHours|. */
  MAX_START_OFFSET_H: 12,
  /** Minimum ground sleep window. */
  MIN_GROUND_SLEEP_H: 2,
  /** Leave for the airport: ground sleep ends this long before a departure. */
  PRE_DEPARTURE_BUFFER_H: 2,
  /** Ground sleep starts at least this long after landing. */
  POST_ARRIVAL_BUFFER_H: 1,
  /** Sleep habits must give a sleep period in this range, hours. */
  SLEEP_DURATION_RANGE: [4, 12] as const,
} as const;

export type Params = typeof PARAMS;
