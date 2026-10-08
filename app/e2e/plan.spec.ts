import { expect, test } from './fixtures';
import { createTorontoLondon, expectPlanPage, fillLeg, pickCity } from './helpers';

/** The labels of the day cards on a plan, in order (DOM text, before CSS upper-casing). */
const DAY_TITLES = [
  '3 days before you fly',
  '2 days before you fly',
  '1 day before you fly',
  'Travel day',
  'Day 1 after departure',
  'Day 2 after departure',
  'Day 3 after departure',
  'Day 4 after departure',
];

test.describe('plan view: Toronto → London (6-day stay)', () => {
  test('strategy card, day cards and key windows', async ({ page }) => {
    await createTorontoLondon(page);

    await expect(page.getByText('Toronto (YYZ) Wed 7 Oct, 18:30 EDT → London (LHR) Thu 8 Oct, 06:30 UTC+1')).toBeVisible();
    await expect(page.getByText('Staying 6 days')).toBeVisible();

    // Strategy card.
    await expect(page.getByRole('heading', { name: 'Shift your body clock earlier' })).toBeVisible();
    await expect(
      page.getByText(
        'Your destination is +5h from home. The plan moves your clock about 5h earlier using morning light and darker evenings.',
      ),
    ).toBeVisible();
    await expect(page.getByText('+5h', { exact: true })).toBeVisible();
    await expect(page.getByText('5h earlier', { exact: true })).toBeVisible();
    await expect(page.getByText('≈ 3', { exact: true })).toBeVisible();

    // All day cards (the first three render at once, the rest follow in a transition).
    const dayLabels = page.getByText(/^(\d+ days? before you fly|Travel day|Day \d+ after departure)$/);
    await expect(dayLabels).toHaveCount(DAY_TITLES.length);
    await expect(dayLabels).toHaveText(DAY_TITLES);
    await expect(page.getByRole('heading', { name: 'Sun 4 Oct · Toronto' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Wed 7 Oct · Toronto' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mon 12 Oct · London' })).toBeVisible();

    // Seek-light rows, by their accessible label: "<title>, <time>. <rationale>".
    await expect(page.getByLabel(/^Seek light, 07:00–09:00 EDT\. /)).toBeVisible();
    await expect(page.getByLabel(/^Seek light, Thu 8 Oct, 08:30–12:30 UTC\+1\. /)).toBeVisible();
    await expect(page.getByLabel(/^Seek light, 07:30–11:30 UTC\+1\. /)).toBeVisible();
    // In-flight sleep on the travel day, shown on the arrival clock.
    await expect(page.getByLabel(/^Sleep, Thu 8 Oct, 00:30–05:30 UTC\+1\. Try to sleep on the plane/)).toBeVisible();
    // The travel day has two strips: departure date (EDT) and arrival date (London).
    await expect(page.getByLabel('Timeline for Wed 7 Oct, EDT. Details are listed below.')).toBeVisible();
    await expect(page.getByLabel('Timeline for Thu 8 Oct, UTC+1. Details are listed below.')).toBeVisible();
    await expect(page.getByText('Times in UTC+1 (Europe/London) unless marked. Body clock: ~0.5h behind local time.')).toHaveCount(2);

    // No melatonin by default.
    await expect(page.getByText(/Talk to a clinician/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Plan my return' })).toBeVisible();
  });

  test('opening the plan from Trips shows the first day without waiting for the rest', async ({ page }) => {
    const url = await createTorontoLondon(page);
    await page.goto('/trips');
    await page.getByText('Toronto → London').first().click();
    await expect(page).toHaveURL(url);
    await expectPlanPage(page, 'Toronto → London');
    await expect(page.getByText('3 days before you fly', { exact: true })).toBeVisible();
    await expect(page.getByText('Day 4 after departure', { exact: true })).toBeAttached();
    // Back to the list.
    await page.goBack();
    await expect(page).toHaveURL(/\/trips$/);
  });

  test('melatonin, when turned on in Settings, adds doses and the clinician note', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('switch', { name: /Melatonin/ }).click();
    // Leaving Settings through the tab bar saves the change.
    await page.getByRole('tab', { name: /Today/ }).click();
    await expect(page.getByRole('heading', { name: 'Plan your next trip' })).toBeVisible();
    await createTorontoLondon(page);
    await expect(page.getByText(/Talk to a clinician/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByLabel(/^Melatonin, /).first()).toBeVisible();
  });

  test('a short stay keeps the traveller on home time', async ({ page }) => {
    await createTorontoLondon(page, '2');
    await expect(page.getByRole('heading', { name: 'Stay on home time' })).toBeVisible();
    await expect(page.getByText('Planned shift')).toHaveCount(0);
  });

});

test.describe('plan view: antidromic (Toronto → Tokyo, 13h east)', () => {
  // Regression: shiftStatus (components/timeline.tsx) did not wrap the body-clock offset to
  // ±12h, so a delay plan for a trip 10h+ east said "~24h ahead of local time" on the days at
  // home, when the body clock is in fact on local time.
  test('pre-flight days at home say the body clock is in step with local time', async ({ page }) => {
    await page.goto('/trip/new');
    await pickCity(page, 'To', 'Tokyo', /^Tokyo, .*HND$/);
    await fillLeg(page, { departDate: '2026-10-07', departTime: '13:00', arriveDate: '2026-10-08', arriveTime: '15:00' });
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expectPlanPage(page, 'Toronto → Tokyo');
    await expect(page.getByRole('heading', { name: 'Shift your body clock later' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sun 4 Oct · Toronto' })).toBeVisible();
    await expect(page.getByText('Travel day', { exact: true })).toBeAttached();
    // Anything past 12h is the same offset the other way round the clock.
    await expect(page.getByText(/~(1[3-9]|2\d)(\.5)?h (ahead of|behind) local time/)).toHaveCount(0, { timeout: 3000 });
    // Before pre-adapting the body clock is on Toronto time; each pre-flight day moves it later.
    await expect(page.getByText(/Body clock: in step with local time, ~1\d(\.5)?h ahead of Tokyo time/).first()).toBeAttached();
    await expect(page.getByText(/Body clock: ~\d(\.5)?h behind local time, ~1\d(\.5)?h ahead of Tokyo time/).first()).toBeAttached();
  });
});

test.describe('plan view: westward over the date line (Tokyo → Los Angeles)', () => {
  // Regression (engine BUG-2): HND 00:05 → LAX 17:10 the previous day gave the travel day and
  // day 1 the same date (11 Nov), and the arrival evening was listed under the Tokyo date only.
  test('every day card has its own, later date and the travel day shows the Los Angeles clock', async ({ page }) => {
    await page.goto('/trip/new');
    await pickCity(page, 'From', 'Tokyo', /^Tokyo, .*HND$/);
    await pickCity(page, 'To', 'Los Angeles', /^Los Angeles, .*LAX$/);
    await fillLeg(page, { departDate: '2026-11-11', departTime: '00:05', arriveDate: '2026-11-10', arriveTime: '17:10' });
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expectPlanPage(page, 'Tokyo → Los Angeles');
    await expect(page.getByText('Travel day', { exact: true })).toBeAttached();
    await expect(page.getByRole('heading', { name: 'Wed 11 Nov · Tokyo' })).toBeAttached();
    await expect(page.getByRole('heading', { name: 'Thu 12 Nov · Los Angeles' })).toBeAttached();
    await expect(page.getByRole('heading', { name: /^Wed 11 Nov · Los Angeles$/ })).toHaveCount(0);
    // Day headings are strictly increasing dates.
    const titles = await page.getByRole('heading', { name: /^\w{3} \d{1,2} \w{3} · / }).allTextContents();
    const dates = titles.map((t) => Date.parse(`${t.split(' · ')[0]!.slice(4)} 2026`));
    expect(dates.length).toBeGreaterThan(2);
    for (let i = 1; i < dates.length; i++) expect(dates[i]!, titles.join(' | ')).toBeGreaterThan(dates[i - 1]!);
    // The travel day also gets a strip on the Los Angeles clock.
    await expect(page.getByLabel(/^Timeline for Wed 11 Nov, PST\./)).toBeAttached();
  });
});

test.describe('plan view with a running clock', () => {
  test.use({ clockMode: 'flowing' });

  test('the now line and the active row follow the 30 s tick', async ({ page }) => {
    const url = await createTorontoLondon(page);
    await page.clock.setSystemTime(new Date('2026-10-04T08:58:00-04:00'));
    await page.goto(url);
    await expectPlanPage(page, 'Toronto → London');

    const row = page.getByLabel(/^Seek light, 07:00–09:00 EDT\. /);
    const strip = page.getByLabel('Timeline for Sun 4 Oct, EDT. Details are listed below.');
    const rowBg = () => row.evaluate((e) => getComputedStyle(e).backgroundColor);
    // The now line: a 2px-wide absolutely positioned bar in each lane; returns their left offsets (%).
    const nowLines = () =>
      strip.evaluate((root) =>
        [...root.querySelectorAll<HTMLElement>('div')]
          .filter((d) => d.style.width === '2px' || getComputedStyle(d).width === '2px')
          .map((d) => parseFloat(d.style.left)),
      );

    expect(await rowBg()).not.toBe('rgba(0, 0, 0, 0)');
    const before = await nowLines();
    expect(before.length).toBeGreaterThan(0);
    expect(before[0]).toBeCloseTo(((8 * 60 + 58) / 1440) * 100, 0);
    // No other day shows a now line.
    await expect(page.getByLabel('Timeline for Mon 5 Oct, EDT. Details are listed below.')).toBeVisible();
    expect(
      await page
        .getByLabel('Timeline for Mon 5 Oct, EDT. Details are listed below.')
        .evaluate((root) => [...root.querySelectorAll('div')].filter((d) => getComputedStyle(d).width === '2px').length),
    ).toBe(0);

    await page.clock.fastForward('03:00');
    await expect.poll(rowBg).toBe('rgba(0, 0, 0, 0)');
    await expect.poll(async () => (await nowLines())[0]).toBeGreaterThan(before[0]!);
  });
});
