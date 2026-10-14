import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against the static web export (app/dist). Build it first:
 *   npx expo export --platform web && npm run test:e2e
 * Every test runs in America/Toronto on a 390x844 phone viewport with a fixed clock
 * (see e2e/fixtures.ts), so dates and plan contents are deterministic.
 */
const PORT = Number(process.env.E2E_PORT ?? 8099);
/**
 * Set E2E_BASE_URL to run the same suite against a deployed site (e.g. a Vercel
 * deployment) instead of the local export; no local server is started then.
 * VERCEL_AUTOMATION_BYPASS_SECRET lets the tests through Vercel Deployment Protection.
 */
const REMOTE = process.env.E2E_BASE_URL?.replace(/\/$/, '');
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: REMOTE ?? `http://127.0.0.1:${PORT}`,
    extraHTTPHeaders: BYPASS
      ? { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' }
      : undefined,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: 'America/Toronto',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: REMOTE
    ? undefined
    : {
        command: `node e2e/serve.mjs ${PORT}`,
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
