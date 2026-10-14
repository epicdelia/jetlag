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
  test/             Scenario tests (SCIENCE.md §13), property invariants over about 410 itineraries,
                    edge cases and review regressions (round3.test.ts: awake spans, return-trip
                    overlap, arrival day, stay cut-off, nap timing, daylight wording, bucketing),
                    and a property-based fuzz suite (fuzz.test.ts, fuzz-lib.ts).
app/      Expo (SDK 57) React Native app. Expo Router, iOS-first, also runs on the web for testing.
  src/app/          Screens: onboarding, Today, Trips, Settings, New/Edit/Return trip, Plan, About.
  src/lib/          Trip form → engine input (local wall-clock → UTC), storage, local notifications.
  scripts/          generate-icons.mjs (app icon, adaptive icon, splash, favicon from SVG).
  e2e/              Playwright end-to-end suite (web build) and perf/plan-open.perf.mjs.
  eas.json          EAS Build profiles (development, preview, production).
docs/     SCIENCE.md (the model spec with citations, parameters, tests and limitations), screenshots.
```

### How it works

1. **Phase estimate.** The engine estimates core body temperature minimum (Tmin) from usual bed and wake times plus chronotype. DLMO is taken as about 7 h before Tmin.
2. **Strategy.** The engine works out the zone difference at arrival and chooses one of four strategies: advance (east), delay (west, or 10 h or more east, which is antidromic), stay on home time (stays of 2 days or less), or no plan (under 2 h).
3. **Simulation.** Tmin is iterated in UTC with capped per-day rates, each taken from published data. Shifting starts up to 3 days before departure. The target is the habitual Tmin on the destination's *local* clock, so a DST change at the destination moves it.
4. **Windows.** Light windows sit on the correct side of the light phase-response curve, with a 1 h safety margin around Tmin. Sleep follows the pre-flight shift, then destination nights, and in-flight sleep when it is realistic: near the body-clock night, or after 8 h or more awake, never within 4 h of waking. A long leg that would leave the traveller awake more than 20 h gets in-flight sleep in the body-clock night, even when a destination-night sleep comes later in the flight. As a safety cap, no plan leaves more than 30 h awake between two sleeps: if the rules above would, one extra sleep is added on the flight or on the ground away from the airport ("recovery" sleep), preferring the body-clock night. Naps (including an in-flight nap when a travel day would otherwise mean 18 h or more awake), caffeine and melatonin are added under conservative rules. Ground naps sit in the body-clock afternoon, never near Tmin.
5. **Output.** Times are rounded to 5 minutes, touching windows with the same advice are merged, and windows are assigned to days (a sleep that starts after midnight is listed under the evening it belongs to). Every day has its own, later date, also when a flight lands on the date before it left (westward over the date line). With a known stay, nothing is planned after the date the stay ends, but the plan still shows the days up to the stay's last date until the model is adapted. Every window carries the IANA zone the traveller is in at that moment, and the app displays it in that zone. Light wording only promises daylight inside 08:00–16:30 local and never suggests sunglasses in the dark.

Return trips: `buildReturnInput(outbound, returnLegs)` builds the journey home and sets the optional `TripInput.startingBodyClockOffsetHours` when the stay was too short to adapt fully (SCIENCE.md §8.1). `returnStart` (used by the app) also caps the return's pre-flight days so they never overlap the outbound plan: none while the outbound plan is still adapting the traveller, otherwise only the days after it has finished.

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

- **Web (for testing):** `npx expo start --web`, or build a static bundle with `npx expo export --platform web` (output in `app/dist`). Serve `app/dist` with any static server that falls back to `index.html` for unknown paths (the app's own not-found screen handles bad links). Reminders are disabled on the web, and dates and times are typed (`YYYY-MM-DD`, `HH:mm`) instead of using the native pickers.
- The app imports the engine from source (`@jetlag/engine` → `../engine/src`). There is no separate build step.
- Dependencies: the sandbox proxy blocks Expo's API, so `npx expo install` can fail. Take the SDK-57 version of a native module from `app/node_modules/expo/bundledNativeModules.json` and `npm install <pkg>@<version>` instead.
- CI (`.github/workflows/ci.yml`) runs on Node 22: `npm ci` in both packages, engine tests and type check, app type check and a web export, then (separate `e2e` job) the Playwright suite against that export.

### Testing

Run everything from the package folder named in each step. CI (`.github/workflows/ci.yml`) runs the engine tests, both type checks, the web export and the end-to-end suite.

| What | Command | Time |
|---|---|---|
| Engine unit, scenario, invariant and fuzz tests | `cd engine && npx vitest run` | ~20 s |
| Engine type check | `cd engine && npx tsc --noEmit` | ~5 s |
| App type check (includes the e2e files) | `cd app && npx tsc --noEmit` | ~10 s |
| Web build used by e2e and perf | `cd app && npx expo export --platform web` | ~1 min cold |
| End-to-end suite | `cd app && npm run test:e2e` (after the export) | ~30 s |
| Performance check | `cd app && node e2e/perf/plan-open.perf.mjs --target prod` (after the export) | ~2 min |

- **Unit and scenario tests** (`engine/test/*.test.ts`): the SCIENCE.md §13 scenarios, invariants over about 410 itineraries, edge cases, time-zone arithmetic and review regressions. `npx vitest run test/round3.test.ts` runs one file; `-t "<name>"` runs matching tests.
- **Fuzz tests** (`engine/test/fuzz.test.ts`, generators and checks in `fuzz-lib.ts`): property-based tests with [fast-check](https://fast-check.dev) and a fixed seed, so every run sees the same 2000 random itineraries per property (38 real zones including :30/:45 offsets, ±12–14 h and DST in both hemispheres; 1–4 legs; random sleep habits, preferences, stays and starting offsets). Checks: no throw, determinism, window shape, nothing inside a sleep, no contradictory advice, caffeine and light safety, sleep lengths, awake spans ≤ 30 h, increasing day dates, destination nights waking at the usual local time, convergence, invalid input, metamorphic checks (+7 days, melatonin and caffeine toggles, same-zone trips) and build time (< 50 ms per plan; median ≈ 1 ms). The `BUG-1`…`BUG-4` tests are regressions for engine bugs this suite found. When a property fails, fast-check prints the shrunk counterexample input; paste it into a test to debug. To explore more inputs, change `SEED` or `RUNS` locally.
- **End-to-end tests** (`app/e2e/*.spec.ts`): a Playwright suite (`@playwright/test` pinned to 1.56.1, the Chromium in `/opt/pw-browsers`; never run `playwright install` in the sandbox) that serves `app/dist` itself and drives it at 390×844 in `America/Toronto`, light and dark, with a fixed clock (`page.clock`) so plan dates are deterministic. It covers onboarding, new trips (single and multi-leg, city search, manual zones, DST gaps, ordering errors), plan contents (including a date-line trip and an antidromic trip), Today at several times on a trip, edit (and Back after saving), return trips, settings, delete, About and bad links. Any console error fails the test, and there are no fixed sleeps. `npx playwright test e2e/plan.spec.ts` runs one file; `--repeat-each=3` checks for flakes; `CI=1` uses CI settings (2 workers, an HTML report, no reuse of a running server). Use `test.fail` only to document a known bug, and remove it with the fix. Screenshots from earlier manual QA are in `docs/screenshots` (`v1-*`, `v1-dark-*`).
- **Performance check** (`app/e2e/perf/plan-open.perf.mjs`): seeds three trips and measures, under 4× CPU throttling (`--cpu 4`), tapping a trip until the plan shows (first card and whole screen), scroll frame times, the 30 s clock tick while idle on a plan, and going back. Run it against the production export (`--target prod`), or against a dev server with `--target dev --url http://localhost:8081` while `npx expo start --web --port 8081` runs (dev builds are several times slower). `--json out.json` saves the numbers; `--profile out.json` adds a CPU profile and its top functions. Other options are listed at the top of the file. Don't run it alongside another build or test run: the machine's CPU load skews the numbers.

### Run on an iPhone

**Quick testing with Expo Go** (no Apple developer account needed):

1. Install **Expo Go** from the App Store on the iPhone.
2. On your computer: `cd app && npm install && npx expo start`. Keep the phone on the same Wi-Fi network (or run `npx expo start --tunnel`).
3. Scan the QR code with the iPhone Camera app; it opens in Expo Go.

Local notifications (the plan reminders) work in Expo Go. Remote/push features of `expo-notifications` are limited in Expo Go, but Shift does not use them. Expo Go shows its own icon and name rather than Shift's.

**Development build** (Shift's own icon, name and bundle ID, closest to the App Store app):

```sh
npm install -g eas-cli
cd app
eas login
eas init                                   # once: links the project to your Expo account
eas device:create                          # once: register the iPhone for internal builds
eas build --profile development --platform ios
```

Install the build from the link or QR code EAS prints, then run `npx expo start --dev-client` and open the project from the Shift dev app. `eas build --profile development-simulator --platform ios` builds for the iOS Simulator instead, and `npx expo run:ios` builds locally if you have Xcode. Build profiles live in `app/eas.json`:

| Profile | Use |
|---|---|
| `development` | Dev client (`expo-dev-client`), internal distribution to registered devices. |
| `development-simulator` | Same, for the iOS Simulator. |
| `preview` | Release build, internal distribution to registered test devices. |
| `production` | App Store build; the build number auto-increments. |

**App Store submission** (high level):

1. Join the Apple Developer Program and create the app in App Store Connect with bundle ID `com.epicdelia.shift` (name "Shift: Jet Lag").
2. `eas build --profile production --platform ios` (EAS manages signing certificates and provisioning profiles).
3. `eas submit --profile production --platform ios` uploads the build to App Store Connect. Test it in TestFlight.
4. Fill in the listing: screenshots, description, a privacy policy URL, a support URL, the privacy nutrition label (all data stays on the device today) and the age rating. Keep the health-related wording inside general wellness (Guideline 1.4.1), with the "not medical advice" note.
5. Submit for review. `ITSAppUsesNonExemptEncryption` is already set to `false` in `app.json`.

### App identity

- Name: **Shift: Jet Lag** (`expo.name`), slug `shift`, bundle ID and Android package `com.epicdelia.shift`.
- Icon, Android adaptive icon (background, foreground, monochrome layers), splash mark and favicon are drawn from SVG in `app/scripts/generate-icons.mjs`: a night-to-day gradient with a setting moon and a rising sun. Run `npm run icons` in `app/` to regenerate the PNGs in `app/assets/images` (source SVGs are written to `app/assets/icon-src`). The iOS icon is written without an alpha channel, as the App Store requires.

### Trips

- **New trip**: native date and time pickers on iOS and Android, typed entry on the web. Times are entered as the ticket shows them, in each airport's local time. The app converts them to UTC with the zone's rules on that date (DST gaps and repeated hours are flagged). Changing the departure date moves the arrival date by the same number of days (on the web, once the typed date is complete). Stays are whole days (1–365). A trip whose flight has already left gets a note instead of the "too soon to adjust" note. A hand-typed IANA zone is stored in its canonical spelling.
- **Edit trip** (plan screen): opens the form prefilled. Saving rebuilds the plan and reschedules reminders.
- **Plan my return** (plan screen): opens New trip with the route reversed (destination → origin), dated from the outbound arrival plus the stay. The return plan starts from the body clock the outbound plan is expected to leave behind, using the engine's `returnStart` (SCIENCE.md §8.1), and adds pre-flight days only after the outbound plan has finished. The outbound plan stops where the return plan starts (plan screen, Today and reminders), with a note on the outbound plan. Editing the outbound trip later does not update an existing return plan. If the outbound trip is deleted, editing the return keeps the body-clock estimate saved with it.
- **Today**: picks the plan day by time span, so the arrival date counts as the travel day, and shows the 24-hour strip for the clock you are on now. The body-clock line is measured against local time (and against destination time when they differ). When an outbound plan and its return would overlap, the return plan wins.
- **Plan screen**: the travel day shows two strips when it runs past the departure date (departure date on the origin clock, arrival date on the destination clock). Plans with melatonin show the "talk to a clinician" note, as does Today.
- **Settings**: sleep-time and preference edits are saved with Save or when you leave the screen. Out-of-range sleep times are discarded on leaving, so values passed while stepping through times never reach new trips.

## Deploying the web app (Vercel)

The web build is a static single-page app (`expo export --platform web`, output
`single`), so Vercel serves it as static files with a catch-all rewrite to
`index.html` — no server functions. `vercel.json` at the repo root holds the build
config; the build runs from the root because the app bundles the engine from
`../engine` source.

Deploys are done by GitHub Actions (`.github/workflows/ci.yml`), never by hand:

```
check (engine unit + fuzz tests, type checks, web export)
  └─ e2e (41 Playwright tests against the local export)
       └─ deploy (vercel build + vercel deploy --prebuilt)
            └─ e2e-deployed (HTTP smoke + the same 41 tests against the live URL)
```

A push to `main` deploys to production; a same-repo pull request gets a preview
deployment. Nothing deploys unless every test above it passed.

One-time setup (repository → Settings → Secrets and variables → Actions):

| Secret | Required | What |
|---|---|---|
| `VERCEL_TOKEN` | yes | vercel.com → Account Settings → Tokens |
| `VERCEL_SCOPE` | only for a Vercel team | the team slug |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | only if preview Deployment Protection is on | Project → Settings → Deployment Protection → Protection Bypass for Automation |

The first deploy creates the Vercel project `shift-jetlag`. Without `VERCEL_TOKEN`
the deploy job is skipped with a warning and CI stays green.

Do **not** also connect the repo through Vercel's Git integration — that would
deploy on every push without waiting for the tests.

To run the e2e suite against any deployed URL locally:

```sh
cd app && E2E_BASE_URL=https://shift-jetlag.vercel.app npm run test:e2e
```

## Honesty notes

- **Not medical advice.** Shift gives general, behavioural guidance based on published circadian research: when to seek or avoid light, sleep timing and caffeine. It does not diagnose or treat anything. The app shows this note on onboarding, on Today, on every plan and in About. It also tells people never to drive or work drowsy because a plan says to stay awake.
- **Melatonin is off by default.** Turning it on adds 0.5 mg timing for advance (eastward) plans only, described as "commonly used". The app shows a "talk to a clinician" note in Settings and About, and on every plan (and Today) that schedules a dose. Delay plans get no melatonin windows, because evidence for that use is weak.
- **Limitations** (from SCIENCE.md §14):
  - **Not clinically validated.** The rules have not been tested against measured DLMO in travellers. Rates and windows come from lab studies, mostly of young, healthy adults.
  - **Phase estimate error.** A Tmin inferred from self-reported sleep is uncertain by about ±1–2 h. The 1 h margins reduce the risk of light on the wrong side, but cannot remove it.
  - **No light-dose model.** The engine says *when* to seek or avoid light, not how much the person actually got. There is no adherence feedback yet.
  - **Fixed rates.** Real shift rates vary by person and trip. Sleep loss, meals, exercise and age are ignored.
  - **Untested thresholds.** The antidromic threshold (10 h east) and several buffers (nap, caffeine, minimum shift, delay seek-light reach) are design choices, not empirical cut-offs.
  - **Return trips** start from an estimate of the body clock the outbound plan leaves behind, assuming it was followed. **Not modelled:** chained trips (one destination after another), origin DST changes during pre-flight days, polar daylight, sunrise and sunset (daylight wording uses fixed local-clock bands), and the person's commitments.
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
   - Done in v0: a return plan starts from the estimated body clock and never overlaps the outbound plan.
   - Plan out and back as one itinerary: choose between adapting and staying on home time using the stay length and the return date together.
   - Update an existing return plan when the outbound trip is edited.
   - Support chained multi-city trips without resetting to "fully adapted" in between.
4. **App Store requirements.**
   - Privacy nutrition label: all data is on the device today, and HealthKit later would need purpose strings.
   - Write a privacy policy, a support URL and medical-disclaimer wording that meets Guideline 1.4.1 (health apps).
   - Notification permission copy, accessibility review (VoiceOver labels already exist) and App Store screenshots. The app icon and bundle ID (`com.epicdelia.shift`) are in place.
   - Add crash reporting and opt-in analytics, and sign in with Apple if accounts are added.
   - Plan for StoreKit if this becomes a subscription.
5. **Product polish.**
   - Calendar import of flights (or a flight-number lookup).
   - Widgets and Live Activities for "right now" advice.
   - Day-by-day editing around commitments ("I have a meeting at 9").
   - A sunrise and sunset model for daylight wording (needs a latitude per city), and localization.
6. **Wedge options** (pick one to lead):
   - **Frequent flyers with chained trips.** Consultants, flight crew-adjacent roles, sales. This is the strongest pain point and the case Timeshifter handles least well (back-to-back legs, short stays). It needs return-trip and chained-trip modelling (item 3).
   - **Wearable-driven.** "Your Oura/Apple Watch already knows your body clock." Personalised phase from real sleep data with adherence feedback. This differentiates on accuracy and needs item 2 plus validation.
   - **Digital nomads.** Slower, one-way, multi-week moves where the "stay on home time" logic matters less and gradual pre-adaptation matters more. These people are price-sensitive and community-driven, so they are easy to reach but monetise less well.
