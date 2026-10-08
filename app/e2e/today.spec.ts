import { expect, test } from './fixtures';
import { createTorontoLondon } from './helpers';
import type { Page } from '@playwright/test';

async function todayAt(page: Page, iso: string) {
  await page.clock.setFixedTime(new Date(iso));
  await page.goto('/');
  await expect(page.getByRole('tab', { name: /Today/ })).toBeVisible();
}

test.describe('Today across the Toronto → London trip', () => {
  test.beforeEach(async ({ page }) => {
    await createTorontoLondon(page);
  });

  test('before the plan starts: coming up', async ({ page }) => {
    await todayAt(page, '2026-10-02T12:00:00-04:00');
    await expect(page.getByText('Coming up', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Toronto → London' })).toBeVisible();
    await expect(page.getByText(/^Your plan starts in \d+h \d\dm\.$/)).toBeVisible();
    await expect(page.getByText('Right now', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/^Seek light, 07:00–09:00 EDT\. /)).toBeVisible();
  });

  test('pre-flight morning: seek light now', async ({ page }) => {
    await todayAt(page, '2026-10-04T08:00:00-04:00');
    await expect(page.getByText('08:00 EDT · Sun 4 Oct · 3 days before you fly')).toBeVisible();
    await expect(page.getByText('Right now', { exact: true })).toBeVisible();
    const nowCard = page.getByText('Right now', { exact: true }).locator('..');
    await expect(nowCard.getByLabel(/^Seek light, 07:00–09:00 EDT\. /)).toBeVisible();
    await expect(page.getByText('in 6h 00m', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^No caffeine, 14:00–22:00 EDT\. /)).toBeVisible();
    await expect(page.getByText('Body clock: in step with local time, ~5h behind London time.')).toBeVisible();
  });

  test('in flight: sleep on the plane', async ({ page }) => {
    await todayAt(page, '2026-10-07T21:00:00-04:00');
    await expect(page.getByText(/· Wed 7 Oct · Travel day$/)).toBeVisible();
    const nowCard = page.getByText('Right now', { exact: true }).locator('..');
    await expect(nowCard.getByLabel(/^Sleep, 00:30–05:30 UTC\+1\. Try to sleep on the plane/)).toBeVisible();
    await expect(page.getByLabel(/^Avoid light, 05:30–06:30 UTC\+1\. .*window shade/)).toBeVisible();
  });

  test('arrival day in London: morning light', async ({ page }) => {
    await todayAt(page, '2026-10-08T10:00:00+01:00');
    await expect(page.getByText('10:00 UTC+1 · Thu 8 Oct · Travel day')).toBeVisible();
    const nowCard = page.getByText('Right now', { exact: true }).locator('..');
    await expect(nowCard.getByLabel(/^Seek light, 08:30–12:30 UTC\+1\. /)).toBeVisible();
    await expect(nowCard.getByLabel(/^Caffeine OK, 05:30–15:00 UTC\+1\. /)).toBeVisible();
    await expect(page.getByText('Body clock: ~3.5h behind local time.')).toBeVisible();
  });

  test('last night of the plan: adapted, nothing next', async ({ page }) => {
    await todayAt(page, '2026-10-13T06:00:00+01:00');
    await expect(page.getByText('06:00 UTC+1 · Tue 13 Oct', { exact: true })).toBeVisible();
    const nowCard = page.getByText('Right now', { exact: true }).locator('..');
    await expect(nowCard.getByLabel(/^Sleep, 23:00–07:00 \(\+1\) UTC\+1\. /)).toBeVisible();
    await expect(page.getByText("That's the end of this plan. You should be close to adapted.")).toBeVisible();
  });

  test('after the plan: no plan running', async ({ page }) => {
    await todayAt(page, '2026-10-20T09:00:00+01:00');
    await expect(page.getByRole('heading', { name: 'No plan running today' })).toBeVisible();
  });

  test('See full plan opens the trip', async ({ page }) => {
    await todayAt(page, '2026-10-04T08:00:00-04:00');
    await page.getByRole('button', { name: 'See full plan' }).click();
    await expect(page.getByRole('heading', { name: 'Shift your body clock earlier' })).toBeVisible();
  });
});

test.describe('Today with a running clock', () => {
  // The trip is created on 2 Oct (so all three pre-flight days are planned), then the clock is
  // moved to 4 Oct 08:58 and runs from there.
  test.use({ clockMode: 'flowing' });

  test('the 30 s tick moves Today on when a window ends', async ({ page }) => {
    await createTorontoLondon(page);
    await page.clock.setSystemTime(new Date('2026-10-04T08:58:00-04:00'));
    await page.goto('/');
    await expect(page.getByText('08:58 EDT · Sun 4 Oct · 3 days before you fly')).toBeVisible();
    const nowCard = page.getByText('Right now', { exact: true }).locator('..');
    await expect(nowCard.getByLabel(/^Seek light, 07:00–09:00 EDT\. /)).toBeVisible();

    await page.clock.fastForward('03:00');
    await expect(page.getByText('09:01 EDT · Sun 4 Oct · 3 days before you fly')).toBeVisible();
    await expect(nowCard.getByLabel(/^Seek light, /)).toHaveCount(0);
    await expect(nowCard.getByText('Nothing specific: follow local daytime and night as best you can.')).toBeVisible();
  });

  test('Today catches up after time passes on another screen', async ({ page }) => {
    await createTorontoLondon(page);
    await page.clock.setSystemTime(new Date('2026-10-04T08:58:00-04:00'));
    await page.goto('/');
    await expect(page.getByText('08:58 EDT · Sun 4 Oct · 3 days before you fly')).toBeVisible();
    await page.getByRole('button', { name: 'See full plan' }).click();
    await expect(page.getByRole('heading', { name: 'Shift your body clock earlier' })).toBeVisible();
    await page.clock.fastForward('10:00');
    await page.goBack();
    await expect(page.getByText(/^09:0[78] EDT · Sun 4 Oct · 3 days before you fly$/)).toBeVisible();
    await expect(page.getByText('Nothing specific: follow local daytime and night as best you can.')).toBeVisible();
  });
});
