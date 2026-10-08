import { expect, test as base, type Page } from '@playwright/test';

/**
 * Shared fixtures for the e2e suite.
 *
 * - `now`: the fixed wall clock for the test (default 2026-10-02 12:00 in Toronto). It is applied
 *   with page.clock.setFixedTime before the first navigation, so Date.now() never moves unless a
 *   test moves it. Timers still run, so the app behaves normally.
 * - `onboarded`: when true (default), a default sleep profile is seeded into storage before the app
 *   loads, so tests start on Today instead of onboarding. The onboarding spec turns it off.
 * - Every test fails if the page logged a console error, threw an uncaught exception, or showed an
 *   unexpected dialog (window.confirm dialogs are accepted and recorded in `dialogs`).
 */

export const DEFAULT_NOW = '2026-10-02T12:00:00-04:00';

export const DEFAULT_PROFILE = {
  sleep: { usualBedtime: '23:00', usualWake: '07:00', chronotype: 'intermediate' },
  prefs: { useMelatonin: false, useCaffeine: true, preAdapt: true, maxPreDays: 3 },
};

export const KEYS = {
  profile: 'jetlag.profile.v1',
  settings: 'jetlag.settings.v1',
  trips: 'jetlag.trips.v1',
} as const;

interface Fixtures {
  now: string;
  /**
   * 'fixed' (default): Date.now() stays at `now`; timers run in real time.
   * 'flowing': fake timers installed at `now`; time flows from there and tests jump ahead with
   * page.clock.fastForward (fires the app's 30 s clock tick without waiting).
   */
  clockMode: 'fixed' | 'flowing';
  onboarded: boolean;
  consoleErrors: string[];
  dialogs: string[];
}

export const test = base.extend<Fixtures>({
  now: [DEFAULT_NOW, { option: true }],
  clockMode: ['fixed', { option: true }],
  onboarded: [true, { option: true }],
  consoleErrors: async ({}, use) => {
    await use([]);
  },
  dialogs: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, now, clockMode, onboarded, consoleErrors, dialogs }, use) => {
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`[console.error] ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));
    page.on('dialog', (d) => {
      dialogs.push(`${d.type()}: ${d.message()}`);
      void d.accept();
    });
    if (clockMode === 'flowing') await page.clock.install({ time: new Date(now) });
    else await page.clock.setFixedTime(new Date(now));
    if (onboarded) {
      // Seed only once per test (the init script runs on every navigation).
      await page.addInitScript(
        ([key, profile]) => {
          if (!sessionStorage.getItem('e2e.seeded')) {
            sessionStorage.setItem('e2e.seeded', '1');
            localStorage.setItem(key, profile);
          }
        },
        [KEYS.profile, JSON.stringify(DEFAULT_PROFILE)] as const,
      );
    }
    await use(page);
    expect(consoleErrors, 'console errors / uncaught exceptions during the test').toEqual([]);
  },
});

export { expect };

/** Reads the saved trips straight from storage (the app persists AsyncStorage to localStorage). */
export async function storedTrips(page: Page): Promise<any[]> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), KEYS.trips);
}

export async function storedProfile(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEYS.profile);
}
