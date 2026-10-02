# Shift app (Expo SDK 57)

iOS-first React Native app for the jet-lag planner. Runs on web for testing.

```sh
npm install
npm run ios         # or: npm run web
npm run typecheck   # tsc --noEmit
npm run export:web  # build smoke test -> dist/ (git-ignored)
```

## Engine wiring

The app imports the circadian engine straight from its TypeScript sources:

- `metro.config.js` adds `../engine` to `watchFolders`, maps `@jetlag/engine` to it via
  `resolver.extraNodeModules` (engine `package.json` `main` = `src/index.ts`), pins third-party
  resolution to the app's `node_modules`, and blocks `../engine/node_modules`.
- `tsconfig.json` maps `@jetlag/engine` to `../engine/src/index.ts`.
- `src/lib/plan.ts` is the only caller of `buildPlan`.

Dev only: `EXPO_PUBLIC_PLAN_FIXTURE=1 npx expo start` renders a synthetic plan
(`src/lib/fixture.ts`) instead of calling the engine. Production builds always call the engine.

## Layout

- `src/app` routes (expo-router): `onboarding`, `(tabs)/index` (Today), `(tabs)/trips`,
  `(tabs)/settings`, `trip/new` (also `?edit=<id>` and `?returnOf=<id>`), `trip/[id]` (plan), `about`,
  `+not-found` (unknown links).
- `src/lib/plan.ts`: `computeTripPlan` (an outbound plan stops where its return plan starts; used by
  Today, the plan screen, the trip list and reminders), day spans (`dayRange`, `dayAt`) and the
  24-hour strips for a day (`dayStrips`: the travel day gets the arrival date on the destination clock too).
- `src/lib/tz.ts`: Intl-based, DST-aware local-to-UTC conversion and formatting.
- `src/lib/cities.ts`: ~90 major cities with IATA code and IANA zone.
- `src/lib/notifications.ts` / `.web.ts`: local reminders (native) / no-op (web).
