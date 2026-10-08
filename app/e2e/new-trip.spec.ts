import { expect, storedTrips, test } from './fixtures';
import { createTorontoLondon, expectPlanPage, fillLeg, openNewTrip, pickCity, pickManualZone, TORONTO_LONDON } from './helpers';

test.describe('new trip', () => {
  test('single leg: defaults to the device zone and saves local times as UTC', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New trip' }).click();
    await expect(page).toHaveURL(/\/trip\/new$/);
    await expect(page.getByRole('button', { name: 'From: Toronto (YYZ), America/Toronto' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'To: not set' })).toBeVisible();

    await pickCity(page, 'To', 'London', /^London, .*LHR$/);
    await expect(page.getByRole('button', { name: 'To: London (LHR), Europe/London' })).toBeVisible();
    await fillLeg(page, TORONTO_LONDON);
    await expect(page.getByText(/^Flight time: 7h 00m\./)).toBeVisible();
    await page.getByLabel(/Days at your destination/).fill('6');
    await expect(page.getByLabel('Name (optional)')).toHaveAttribute('placeholder', 'Toronto → London');
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expectPlanPage(page, 'Toronto → London');

    const trips = await storedTrips(page);
    expect(trips).toHaveLength(1);
    expect(trips[0].name).toBe('Toronto → London');
    expect(trips[0].input.stayDays).toBe(6);
    expect(trips[0].input.legs).toHaveLength(1);
    expect(trips[0].input.legs[0]).toMatchObject({
      from: { tz: 'America/Toronto' },
      to: { tz: 'Europe/London' },
      departUtc: '2026-10-07T22:30:00Z',
      arriveUtc: '2026-10-08T05:30:00Z',
    });

    // The trip is listed on Trips and opens from there.
    await page.goto('/trips');
    await page.getByText('Toronto → London').first().click();
    await expectPlanPage(page, 'Toronto → London');
  });

  test('city search matches name, airport code and accents', async ({ page }) => {
    await openNewTrip(page);
    await page.getByRole('button', { name: /^To:/ }).click();
    const search = page.getByLabel('Search city, airport code, country or zone');
    const results = page.getByRole('button', { name: /, [A-Z]{3}$/ });

    await search.fill('lhr');
    await expect(results.first()).toHaveAccessibleName(/^London, United Kingdom, LHR$/);
    await search.fill('Sao');
    await expect(page.getByRole('button', { name: /^São Paulo, Brazil, GRU$/ })).toBeVisible();
    await search.fill('São Paulo');
    await expect(page.getByRole('button', { name: /^São Paulo, Brazil, GRU$/ })).toBeVisible();
    await search.fill('zzzz');
    await expect(page.getByText('No matching city. Enter the IANA time zone below instead.')).toBeVisible();
    await expect(results).toHaveCount(0);

    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await expect(search).toBeHidden();
    await expect(page.getByRole('button', { name: 'To: not set' })).toBeVisible();
  });

  test('manual IANA zone: rejects unknown zones and stores the canonical spelling', async ({ page }) => {
    await openNewTrip(page);
    await pickManualZone(page, 'To', 'Mars/Base');
    await expect(page.getByText(/^Not a recognised IANA zone\./)).toBeVisible();
    // The picker stays open; a lowercase zone is accepted and canonicalised.
    await page.getByLabel('Or enter an IANA time zone').fill('asia/kolkata');
    await page.getByRole('button', { name: 'Use this zone' }).click();
    await expect(page.getByLabel('Or enter an IANA time zone')).toBeHidden();
    await expect(page.getByRole('button', { name: /^To: .*Asia\/Kolkata$/ })).toBeVisible();

    await fillLeg(page, { departDate: '2026-10-07', departTime: '18:30', arriveDate: '2026-10-08', arriveTime: '20:00' });
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expectPlanPage(page, /^Toronto → /);
    const [trip] = await storedTrips(page);
    expect(trip.input.legs[0].to.tz).toBe('Asia/Kolkata');
    expect(trip.legsLocal[0].toTz).toBe('Asia/Kolkata');
  });

  test('a departure time inside the DST gap is rejected', async ({ page }) => {
    await openNewTrip(page);
    await pickCity(page, 'To', 'London', /^London, .*LHR$/);
    // Toronto springs forward at 02:00 on 14 Mar 2027: 02:30 never happens.
    await fillLeg(page, { departDate: '2027-03-14', departTime: '02:30', arriveDate: '2027-03-14', arriveTime: '15:00' });
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expect(page.getByText("This local time doesn't exist (clocks spring forward then). Check the time.")).toBeVisible();
    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible();
    await expect(page).toHaveURL(/\/trip\/new$/);
    expect(await storedTrips(page)).toEqual([]);

    // 03:30 exists: the trip saves.
    await fillLeg(page, { departTime: '03:30' });
    await expect(page.getByText("This local time doesn't exist (clocks spring forward then). Check the time.")).toBeHidden();
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expectPlanPage(page, 'Toronto → London');
  });

  test('a repeated (fall-back) hour is accepted with a note', async ({ page }) => {
    await openNewTrip(page);
    await pickCity(page, 'To', 'London', /^London, .*LHR$/);
    await fillLeg(page, { departDate: '2026-11-01', departTime: '01:30', arriveDate: '2026-11-01', arriveTime: '12:00' });
    await expect(
      page.getByText('Leg 1: departure falls in a repeated hour (clocks go back); using the first occurrence.'),
    ).toBeVisible();
  });

  test('arrival before departure is rejected', async ({ page }) => {
    await openNewTrip(page);
    await pickCity(page, 'To', 'London', /^London, .*LHR$/);
    await fillLeg(page, { departDate: '2026-10-07', departTime: '18:30', arriveDate: '2026-10-07', arriveTime: '08:00' });
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expect(
      page.getByText('Arrival is 15h 30m before departure once time zones are applied. Check the dates.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/trip\/new$/);
    expect(await storedTrips(page)).toEqual([]);
  });

  test('missing destination, bad formats and stay length are reported', async ({ page }) => {
    await openNewTrip(page);
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expect(page.getByText('Choose where this flight lands.')).toBeVisible();

    await pickCity(page, 'To', 'London', /^London, .*LHR$/);
    await fillLeg(page, { departDate: '2026-13-40', departTime: '25:00' });
    await expect(page.getByText('Use the format YYYY-MM-DD.')).toBeVisible();
    await fillLeg(page, TORONTO_LONDON);
    await expect(page.getByText('Use the format YYYY-MM-DD.')).toBeHidden();

    for (const bad of ['0', '2.5', '400', 'abc']) {
      await page.getByLabel(/Days at your destination/).fill(bad);
      await expect(page.getByText('Enter a whole number of days between 1 and 365, or leave blank.')).toBeVisible();
    }
    await page.getByLabel(/Days at your destination/).fill('3');
    await expect(page.getByText('Enter a whole number of days between 1 and 365, or leave blank.')).toBeHidden();
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expectPlanPage(page, 'Toronto → London');
  });

  test('multi-leg trip JFK → DOH → SIN builds one plan', async ({ page }) => {
    await openNewTrip(page);
    await pickCity(page, 'From', 'JFK', /New York.*JFK/);
    await pickCity(page, 'To', 'DOH', /Doha.*DOH/);
    await fillLeg(page, { departDate: '2026-10-10', departTime: '22:00', arriveDate: '2026-10-11', arriveTime: '18:10' });
    await page.getByRole('button', { name: 'Add a connecting flight' }).click();
    await expect(page.getByRole('heading', { name: 'Flight 2' })).toBeVisible();
    // The new leg leaves from where the first one landed.
    await expect(page.getByRole('button', { name: /^From: Doha \(DOH\)/ })).toBeVisible();
    await pickCity(page, 'To', 'SIN', /Singapore.*SIN/, 1);
    await fillLeg(page, { departDate: '2026-10-11', departTime: '20:30', arriveDate: '2026-10-12', arriveTime: '09:15' }, 1);
    await page.getByLabel(/Days at your destination/).fill('10');
    await page.getByRole('button', { name: 'Build my plan' }).click();

    await expectPlanPage(page, 'New York → Singapore');
    // 12h east: the antidromic rule shifts the clock later instead.
    await expect(page.getByRole('heading', { name: 'Shift your body clock later' })).toBeVisible();
    await expect(page.getByText('+12h', { exact: true })).toBeVisible();
    await expect(page.getByText(/Crossing ~12h east: shifting your body clock later/)).toBeVisible();
    const [trip] = await storedTrips(page);
    expect(trip.input.legs.map((l: any) => [l.from.tz, l.to.tz])).toEqual([
      ['America/New_York', 'Asia/Qatar'],
      ['Asia/Qatar', 'Asia/Singapore'],
    ]);
  });

  test('out-of-order and disconnected legs are rejected', async ({ page }) => {
    await openNewTrip(page);
    await pickCity(page, 'From', 'JFK', /New York.*JFK/);
    await pickCity(page, 'To', 'DOH', /Doha.*DOH/);
    await fillLeg(page, { departDate: '2026-10-10', departTime: '22:00', arriveDate: '2026-10-11', arriveTime: '18:10' });
    await page.getByRole('button', { name: 'Add a connecting flight' }).click();
    await pickCity(page, 'To', 'SIN', /Singapore.*SIN/, 1);
    // Leg 2 leaves before leg 1 lands.
    await fillLeg(page, { departDate: '2026-10-11', departTime: '10:00', arriveDate: '2026-10-11', arriveTime: '23:00' }, 1);
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expect(page.getByText('Departs before leg 1 lands. Legs must be in order.')).toBeVisible();
    await expect(page).toHaveURL(/\/trip\/new$/);

    // Leg 2 leaves from somewhere else.
    await pickCity(page, 'From', 'DXB', /^Dubai, .*DXB$/, 1);
    await fillLeg(page, { departTime: '20:30', arriveDate: '2026-10-12', arriveTime: '09:15' }, 1);
    await expect(page.getByText('Leg 2 should leave from where leg 1 landed (Doha (DOH)).')).toBeVisible();
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expect(page).toHaveURL(/\/trip\/new$/);
    expect(await storedTrips(page)).toEqual([]);

    // Changing leg 1's destination carries over to leg 2's origin and clears the error.
    await pickCity(page, 'To', 'DXB', /^Dubai, .*DXB$/, 0);
    await expect(page.getByText(/^Leg 2 should leave from where leg 1 landed/)).toBeHidden();
    await fillLeg(page, { arriveTime: '19:10' }, 0);
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expectPlanPage(page, 'New York → Singapore');
  });

  test('typing a new departure date moves the arrival date with it', async ({ page }) => {
    await openNewTrip(page);
    await pickCity(page, 'To', 'London', /^London, .*LHR$/);
    await fillLeg(page, { departDate: '2026-10-07', arriveDate: '2026-10-08' });
    const dep = page.getByLabel('Departure date');
    await dep.click();
    await dep.press('ControlOrMeta+a');
    await dep.press('Backspace');
    await dep.pressSequentially('2026-10-20');
    await expect(page.getByLabel('Arrival date')).toHaveValue('2026-10-21');
  });

  test('cancel on a deep-linked form goes to Today', async ({ page }) => {
    await createTorontoLondon(page);
    await openNewTrip(page);
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(page.getByRole('heading', { name: 'Toronto → London' })).toBeVisible();
    expect(await storedTrips(page)).toHaveLength(1);
  });
});
