/** Plain-language, one-sentence rationales (SCIENCE.md §11.7). No medical claims. */

export const RATIONALE = {
  seekAdvance: 'Bright light now, ideally daylight, helps move your body clock earlier.',
  seekDelay: 'Bright light now, ideally daylight, helps move your body clock later.',
  seekAdvanceIndoor:
    "Bright light now helps move your body clock earlier; it's likely dark outside, so use bright indoor light or a light box.",
  seekDelayIndoor:
    "Bright light now helps move your body clock later; it's likely dark outside, so use bright indoor light or a light box.",
  seekAdvanceDusk:
    "Bright light now helps move your body clock earlier; get daylight while it's light out, otherwise bright indoor light or a light box.",
  seekDelayDusk:
    "Bright light now helps move your body clock later; get daylight while it's light out, otherwise bright indoor light or a light box.",
  seekAdvanceFlightNight:
    "Bright light now helps move your body clock earlier; it's likely dark outside, so use the reading light or a bright screen.",
  seekDelayFlightNight:
    "Bright light now helps move your body clock later; it's likely dark outside, so use the reading light or a bright screen.",
  seekAdvanceFlight:
    'Bright light now helps move your body clock earlier; open the window shade or use the reading light.',
  seekDelayFlight:
    'Bright light now helps move your body clock later; open the window shade or use the reading light.',
  avoidAdvance: 'Light now would push your body clock the wrong way; keep it dim and wear sunglasses outside.',
  avoidDelay: 'Light now would pull your body clock earlier; keep it dim and wear sunglasses outside.',
  avoidAdvanceNight: 'Light now would push your body clock the wrong way; keep the lights dim and screens low.',
  avoidDelayNight: 'Light now would pull your body clock earlier; keep the lights dim and screens low.',
  avoidAdvanceFlight:
    'Light now would push your body clock the wrong way; close the window shade, dim your screen or use an eye mask.',
  avoidDelayFlight:
    'Light now would pull your body clock earlier; close the window shade, dim your screen or use an eye mask.',
  avoidStay: 'Avoiding bright light now helps keep your body clock on home time.',
  sleepDest: 'Sleeping now lines up with your plan for destination time.',
  sleepHome: 'Sleeping now lines up with your plan for home time.',
  sleepFlight: "Try to sleep on the plane now; an eye mask and earplugs help.",
  sleepPre: (hours: number, dir: number) =>
    `Going to bed ${formatHours(hours)} ${dir > 0 ? 'earlier' : 'later'} than usual starts moving your body clock toward destination time.`,
  sleepPreKeep: 'Keep your usual sleep times tonight so you get as much rest as possible before your flight.',
  nap: "If you're sleepy, a short nap (10–20 min) is fine now; keep it short so it doesn't affect tonight.",
  napFlight: (minutes: number) =>
    `It's a long time awake today; a nap of up to ${minutes} min on the plane now (set an alarm) helps you stay alert and still sleep tonight.`,
  napFlightLong: (minutes: number) =>
    `You'll be awake for about a day; a nap of up to ${minutes} min (about one sleep cycle) on the plane now helps, and waking after a full cycle limits grogginess.`,
  caffeineOk: "If you need it, caffeine now can help with daytime sleepiness without disturbing tonight's sleep.",
  avoidCaffeine: 'Skip caffeine from now until bedtime; it can disrupt sleep even hours later.',
  melatonin:
    'A low dose (0.5 mg) of melatonin at this time is commonly used to help shift the body clock earlier; it can make some people drowsy.',
} as const;

export const WARNINGS = {
  legsDontConnect: "Leg airports don't connect; using the final destination.",
  antidromic: (delta: number) =>
    `Crossing ~${formatNumber(delta)}h east: shifting your body clock later instead of earlier is usually faster.`,
  largeEast: 'Large eastward shift: avoiding bright morning light for the first days matters.',
  melatoninDelay:
    "Melatonin isn't scheduled for this trip because evidence for using it to shift your clock later is limited.",
  shortStay: 'Short stay: you may only partly adapt before you return.',
  stayHome: 'Short stay: keeping close to home time is usually easier than adapting and re-adapting.',
  horizon: (days: number) => `Plan covers the first ${days} days; you may not be fully adapted by then.`,
} as const;

function formatNumber(x: number): string {
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100);
}

function formatHours(h: number): string {
  return h === 1 ? '1 hour' : `${formatNumber(h)} hours`;
}
