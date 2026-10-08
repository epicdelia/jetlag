import { expect, storedProfile, storedTrips, test } from './fixtures';
import { createTorontoLondon, expectPlanPage } from './helpers';

test.describe('trip lifecycle', () => {
  test('edit trip: form is prefilled and saving rebuilds the same trip', async ({ page }) => {
    const url = await createTorontoLondon(page);
    await page.getByRole('button', { name: 'Edit trip' }).click();
    await expect(page.getByRole('button', { name: 'Save and rebuild plan' })).toBeVisible();
    await expect(page.getByLabel('Departure date')).toHaveValue('2026-10-07');
    await expect(page.getByLabel('Departure time')).toHaveValue('18:30');
    await expect(page.getByLabel('Arrival date')).toHaveValue('2026-10-08');
    await expect(page.getByLabel('Arrival time')).toHaveValue('06:30');
    await expect(page.getByLabel(/Days at your destination/)).toHaveValue('6');
    await expect(page.getByRole('button', { name: 'To: London (LHR), Europe/London' })).toBeVisible();

    await page.getByLabel(/Days at your destination/).fill('2');
    await page.getByLabel('Name (optional)').fill('London work trip');
    await page.getByRole('button', { name: 'Save and rebuild plan' }).click();
    await expectPlanPage(page, 'London work trip');
    expect(page.url()).toBe(url);
    await expect(page.getByText('Staying 2 days').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stay on home time' }).filter({ visible: true })).toBeVisible();
    const trips = await storedTrips(page);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ name: 'London work trip', input: { stayDays: 2 } });
  });

  // Regression: saving an edit used to replace the form with a second copy of the plan, so the
  // original plan stayed underneath and Back showed the same plan again.
  test('edit trip: Back after saving leaves the plan instead of showing it twice', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New trip' }).click();
    await createTorontoLondon(page);
    await page.getByRole('button', { name: 'Edit trip' }).click();
    await page.getByLabel(/Days at your destination/).fill('5');
    await page.getByRole('button', { name: 'Save and rebuild plan' }).click();
    await expect(page.getByText('Staying 5 days').filter({ visible: true })).toBeVisible();
    // No hidden second copy of the plan is left in the page.
    await expect(page.getByText('Strategy', { exact: true })).toHaveCount(1);
    await page.goBack();
    await expect(page.getByText('Coming up', { exact: true })).toBeVisible({ timeout: 3000 });
  });

  test('plan my return: reversed route and linked plans', async ({ page }) => {
    const outUrl = await createTorontoLondon(page);
    await page.getByRole('button', { name: 'Plan my return' }).click();
    await expect(page.getByText('Route reversed from “Toronto → London”.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'From: London (LHR), Europe/London' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'To: Toronto (YYZ), America/Toronto' })).toBeVisible();
    await expect(page.getByLabel('Departure date')).toHaveValue('2026-10-14');
    await page.getByLabel('Departure time').fill('11:00');
    await page.getByLabel('Arrival time').fill('13:45');
    await page.getByRole('button', { name: 'Build my return plan' }).click();

    await expectPlanPage(page, 'London → Toronto');
    await expect(page.getByRole('heading', { name: 'Shift your body clock later' }).filter({ visible: true })).toBeVisible();
    // A return trip cannot plan its own return.
    await expect(page.getByRole('button', { name: 'Plan my return' })).toHaveCount(0);
    const retUrl = page.url();

    const trips = await storedTrips(page);
    expect(trips).toHaveLength(2);
    const out = trips.find((t: any) => !t.returnOf);
    const ret = trips.find((t: any) => t.returnOf);
    expect(ret.returnOf).toBe(out.id);
    expect(ret.input.legs[0]).toMatchObject({ from: { tz: 'Europe/London' }, to: { tz: 'America/Toronto' } });
    expect(typeof ret.input.startingBodyClockOffsetHours === 'number' || ret.input.startingBodyClockOffsetHours === undefined).toBe(true);

    // The outbound plan links to the return plan.
    await page.goto(outUrl);
    await expectPlanPage(page, 'Toronto → London');
    await page.getByRole('button', { name: 'View my return plan' }).click();
    await expect(page).toHaveURL(retUrl);
  });

  test('a return that overlaps the outbound plan takes over from it', async ({ page }) => {
    const outUrl = await createTorontoLondon(page, '3');
    await page.getByRole('button', { name: 'Plan my return' }).click();
    await expect(page.getByLabel('Departure date')).toHaveValue('2026-10-11');
    await expect(
      page.getByText(/^Your outbound plan expects you to be adapted to local time by the time you fly home\./),
    ).toBeVisible();
    await page.getByLabel('Departure time').fill('11:00');
    await page.getByLabel('Arrival time').fill('13:45');
    await page.getByRole('button', { name: 'Build my return plan' }).click();
    await expectPlanPage(page, 'London → Toronto');

    await page.goto(outUrl);
    await expectPlanPage(page, 'Toronto → London');
    await expect(page.getByText('From Sun 11 Oct, 07:00 UTC+1, your return plan takes over, so this plan stops there.')).toBeVisible();

    // Today follows the outbound plan until the hand-off, then the return plan.
    await page.clock.setFixedTime(new Date('2026-10-10T20:00:00+01:00'));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Toronto → London' })).toBeVisible();
    await expect(page.getByText('20:00 UTC+1 · Sat 10 Oct · Day 2 after departure')).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-10-11T08:00:00+01:00'));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'London → Toronto' })).toBeVisible();
  });

  test('settings change shows the rebuild banner; rebuilding applies the new profile', async ({ page }) => {
    const url = await createTorontoLondon(page);
    await page.goto('/');
    await page.getByRole('tab', { name: /Settings/ }).click();
    await page.getByRole('button', { name: 'Bedtime 15 minutes earlier' }).click();
    await page.getByRole('radio', { name: 'Late' }).click();
    await expect(page.getByText(/^Unsaved changes\./)).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/^Saved\. Changes apply to new trips/)).toBeVisible();
    expect((await storedProfile(page)).sleep).toEqual({ usualBedtime: '22:45', usualWake: '07:00', chronotype: 'late' });

    await page.goto(url);
    await expectPlanPage(page, 'Toronto → London');
    await expect(page.getByText('Your sleep profile or preferences changed since this plan was made.')).toBeVisible();
    await page.getByRole('button', { name: 'Rebuild with current profile' }).click();
    await expect(page.getByText('Your sleep profile or preferences changed since this plan was made.')).toBeHidden();
    const [trip] = await storedTrips(page);
    expect(trip.input.sleep).toEqual({ usualBedtime: '22:45', usualWake: '07:00', chronotype: 'late' });
  });

  test('settings: an out-of-range draft is discarded on leaving', async ({ page }) => {
    await page.goto('/settings');
    const later = page.getByRole('button', { name: 'Bedtime 15 minutes later' });
    for (let i = 0; i < 20; i++) await later.click();
    await expect(page.getByText(/^Not saved: these sleep times are out of range\./)).toBeVisible();
    await page.getByRole('tab', { name: /Today/ }).click();
    await expect(page.getByRole('heading', { name: 'Plan your next trip' })).toBeVisible();
    expect((await storedProfile(page)).sleep.usualBedtime).toBe('23:00');
  });

  test('delete trip: confirm removes it and returns to Trips', async ({ page, dialogs }) => {
    await createTorontoLondon(page);
    await page.getByRole('button', { name: 'Delete trip' }).click();
    await expect(page).toHaveURL(/\/trips$/);
    expect(dialogs).toEqual(['confirm: Delete this trip and its reminders?']);
    expect(await storedTrips(page)).toEqual([]);
    await expect(page.getByText('Toronto → London')).toHaveCount(0);
  });

  test('erase all data returns to onboarding', async ({ page, dialogs }) => {
    await createTorontoLondon(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Erase all data' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    expect(dialogs).toHaveLength(1);
    expect(await storedTrips(page)).toEqual([]);
    expect(await storedProfile(page)).toBeNull();
  });
});
