# Shift: jet-lag planning (v0)

Shift builds a day-by-day plan to help a traveller move their body clock to a new time zone. The idea is the same as Timeshifter: you enter your flights and usual sleep times. The plan then says when to seek or avoid light and when to sleep. It can also cover naps, caffeine timing and (if you opt in) low-dose melatonin timing. Each item comes with a one-sentence reason.

This is v0. The engine is deterministic and covered by tests. The iOS-first app works end to end on device and on the web. **Nothing has been clinically validated yet** (see [Honesty notes](#honesty-notes)).

## Repository layout

```
engine/   Pure TypeScript circadian engine. No runtime dependencies. Tested with vitest.
  src/types.ts      Public contract: buildPlan(input: TripInput): Plan. The app depends only on this
                    and on the small display helpers in src/format.ts.
  src/plan.ts       The algorithm (docs/SCIENCE.md §11): strategy, pre-flight days, Tmin simulation,
                    sleep/light/melatonin/caffeine/nap windows, bucketing into days.
  src/phase.ts      Phase estimate from habitual sleep, and the day-to-day Tmin update (§1, §10).
  src/params.ts     Every tunable number, each with its source or marked DESIGN CHOICE.
  src/journey.ts    Where the traveller is at an instant, and sleep placement around flights.
  src/time.ts       IANA time-zone arithmetic (DST gaps and overlaps, :30/:45 zones) built on Intl.
  src/rationale.ts  The plain-language sentences and warnings.
  test/             Scenario tests (SCIENCE.md §13), property invariants over about 290 itineraries,
                    edge cases and review regressions.
app/      Expo (SDK 57) React Native app. Expo Router, iOS-first, also runs on the web for testing.
  src/app/          Screens: onboarding, Today, Trips, Settings, New trip, Plan, About.
  src/lib/          Trip form → engine input (local wall-clock → UTC), storage, local notifications.
docs/     SCIENCE.md (the model spec with citations, parameters, tests and limitations), screenshots.
```

### How it works

1. **Phase estimate.** The engine estimates core body temperature minimum (Tmin) from usual bed and wake times plus chronotype. DLMO is taken as about 7 h before Tmin.
2. **Strategy.** The engine works out the zone difference at arrival and chooses one of four strategies: advance (east), delay (west, or 10 h or more east, which is antidromic), stay on home time (stays of 2 days or less), or no plan (under 2 h).
3. **Simulation.** Tmin is iterated in UTC with capped per-day rates, each taken from published data. Shifting starts up to 3 days before departure. The target is the habitual Tmin on the destination's *local* clock, so a DST change at the destination moves it.
4. **Windows.** Light windows sit on the correct side of the light phase-response curve, with a 1 h safety margin around Tmin. Sleep follows the pre-flight shift, then destination nights, and in-flight sleep when it is realistic. Naps, caffeine and melatonin are added under conservative rules.
5. **Output.** Windows are assigned to days. Every window carries the IANA zone the traveller is in at that moment, and the app displays it in that zone.

The full specification, citations and parameter table are in [`docs/SCIENCE.md`](docs/SCIENCE.md).

## Running it

Requirements: Node 22 and npm.

### Engine

```sh
cd engine
npm install
npx vitest run      # all tests
npx tsc --noEmit    # type check
```

### App

```sh
cd app
npm install
npx tsc --noEmit
npx expo start      # dev server; press i for the iOS simulator, w for web
```

- **iOS on a phone:** install Expo Go, run `npx expo start`, then scan the QR code. Local notifications need a real device. For production-like behaviour (notification permissions, icons, no Expo Go shell), make a development build: `npx expo run:ios`, or with EAS, `eas build --profile development --platform ios`.
- **Web (for testing):** `npx expo start --web`, or build a static bundle with `npx expo export --platform web` (output in `app/dist`). Reminders are disabled on the web.
- The app imports the engine from source (`@jetlag/engine` → `../engine/src`). There is no separate build step.

## Honesty notes

- **Not medical advice.** Shift gives general, behavioural guidance based on published circadian research: when to seek or avoid light, sleep timing and caffeine. It does not diagnose or treat anything. The app shows this note on onboarding, on Today, on every plan and in About. It also tells people never to drive or work drowsy because a plan says to stay awake.
- **Melatonin is off by default.** Turning it on adds 0.5 mg timing for advance (eastward) plans only, described as "commonly used". The app shows a "talk to a clinician" note whenever it is enabled. Delay plans get no melatonin windows, because evidence for that use is weak.
- **Limitations** (from SCIENCE.md §14):
  - **Not clinically validated.** The rules have not been tested against measured DLMO in travellers. Rates and windows come from lab studies, mostly of young, healthy adults.
  - **Phase estimate error.** A Tmin inferred from self-reported sleep is uncertain by about ±1–2 h. The 1 h margins reduce the risk of light on the wrong side, but cannot remove it.
  - **No light-dose model.** The engine says *when* to seek or avoid light, not how much the person actually got. There is no adherence feedback yet.
  - **Fixed rates.** Real shift rates vary by person and trip. Sleep loss, meals, exercise and age are ignored.
  - **Untested thresholds.** The antidromic threshold (10 h east) and several buffers (nap, caffeine, minimum shift, delay seek-light reach) are design choices, not empirical cut-offs.
  - **Not modelled:** return trips, origin DST changes during pre-flight days, polar daylight, and the person's commitments.
  - Items marked † in SCIENCE.md were checked only against abstracts or secondary sources. Re-check them before making any public claims.

## Roadmap to a real product

1. **Clinical and expert review.**
   - Have a circadian scientist review SCIENCE.md and the parameter table, and a sleep physician review the safety copy.
   - Re-verify every † citation from full text.
   - Run a small pilot comparing plan adherence and symptom scores (e.g. the Liverpool Jet Lag Questionnaire). Measure DLMO in a subset if possible.
   - Decide on regulatory positioning (general wellness rather than a medical device) and keep the copy inside it.
2. **Wearable and behavioural data.**
   - Read sleep and wake times from HealthKit (Apple Watch, Oura via Health) to improve the phase estimate.
   - Log actual light exposure (ambient-light sensor where available) and whether people followed the plan.
   - Replace the capped-linear model with an oscillator model that responds to partial adherence (Kronauer/Forger family) once there is data to validate it.
3. **Return trips and chains.**
   - Plan out and back as one itinerary: choose between adapting and staying on home time using the stay length and the return.
   - Model a re-adaptation plan after the return.
   - Support chained multi-city trips without resetting to "fully adapted" in between.
4. **App Store requirements.**
   - Privacy nutrition label: all data is on the device today, and HealthKit later would need purpose strings.
   - Write a privacy policy, a support URL and medical-disclaimer wording that meets Guideline 1.4.1 (health apps).
   - Notification permission copy, accessibility review (VoiceOver labels already exist), real app icon and screenshots, and the bundle ID change from `com.example.*`.
   - Add crash reporting and opt-in analytics, and sign in with Apple if accounts are added.
   - Plan for StoreKit if this becomes a subscription.
5. **Product polish.**
   - Calendar import of flights (or a flight-number lookup).
   - Widgets and Live Activities for "right now" advice.
   - Day-by-day editing around commitments ("I have a meeting at 9").
   - A sunrise and sunset model for daylight wording, and localization.
6. **Wedge options** (pick one to lead):
   - **Frequent flyers with chained trips.** Consultants, flight crew-adjacent roles, sales. This is the strongest pain point and the case Timeshifter handles least well (back-to-back legs, short stays). It needs return-trip and chained-trip modelling (item 3).
   - **Wearable-driven.** "Your Oura/Apple Watch already knows your body clock." Personalised phase from real sleep data with adherence feedback. This differentiates on accuracy and needs item 2 plus validation.
   - **Digital nomads.** Slower, one-way, multi-week moves where the "stay on home time" logic matters less and gradual pre-adaptation matters more. These people are price-sensitive and community-driven, so they are easy to reach but monetise less well.
