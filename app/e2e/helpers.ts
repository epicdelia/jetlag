import { expect, type Page } from '@playwright/test';

/** Opens the city picker for `label` ("From"/"To") on leg `leg`, searches and picks the first match. */
export async function pickCity(page: Page, label: 'From' | 'To', query: string, item: RegExp, leg = 0) {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).nth(leg).click();
  const search = page.getByLabel('Search city, airport code, country or zone');
  await search.fill(query);
  await page.getByRole('button', { name: item }).first().click();
  await expect(search).toBeHidden();
}

/** Types a manual IANA zone into the picker for `label`. Leaves the picker open if rejected. */
export async function pickManualZone(page: Page, label: 'From' | 'To', zone: string, leg = 0) {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).nth(leg).click();
  await page.getByLabel('Or enter an IANA time zone').fill(zone);
  await page.getByRole('button', { name: 'Use this zone' }).click();
}

export interface LegTimes {
  departDate?: string;
  departTime?: string;
  arriveDate?: string;
  arriveTime?: string;
}

export async function fillLeg(page: Page, t: LegTimes, leg = 0) {
  if (t.departDate !== undefined) await page.getByLabel('Departure date').nth(leg).fill(t.departDate);
  if (t.departTime !== undefined) await page.getByLabel('Departure time').nth(leg).fill(t.departTime);
  if (t.arriveDate !== undefined) await page.getByLabel('Arrival date').nth(leg).fill(t.arriveDate);
  if (t.arriveTime !== undefined) await page.getByLabel('Arrival time').nth(leg).fill(t.arriveTime);
}

export const TORONTO_LONDON = {
  departDate: '2026-10-07',
  departTime: '18:30',
  arriveDate: '2026-10-08',
  arriveTime: '06:30',
};

/** Opens New trip and waits for the form. */
export async function openNewTrip(page: Page, query = '') {
  await page.goto(`/trip/new${query}`);
  await expect(page.getByLabel('Departure date').first()).toBeVisible();
}

/**
 * Builds the Toronto → London trip used across the suite (dep 7 Oct 18:30 EDT, arr 8 Oct
 * 06:30 BST) and waits for its plan. Returns the plan URL.
 */
export async function createTorontoLondon(page: Page, stay = '6'): Promise<string> {
  await openNewTrip(page);
  await pickCity(page, 'To', 'London', /^London, .*LHR$/);
  await fillLeg(page, TORONTO_LONDON);
  if (stay) await page.getByLabel(/Days at your destination/).fill(stay);
  await page.getByRole('button', { name: 'Build my plan' }).click();
  await expectPlanPage(page, 'Toronto → London');
  return page.url();
}

/** Waits until a plan page for `name` is shown with its strategy card. */
export async function expectPlanPage(page: Page, name: string | RegExp) {
  await expect(page).toHaveURL(/\/trip\/(?!new)[^/?]+$/);
  // A screen left underneath in the stack stays in the DOM (hidden), so look at visible elements only.
  await expect(
    page.getByRole('heading', { name, exact: typeof name === 'string' }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('Strategy', { exact: true }).filter({ visible: true })).toBeVisible();
}

/** Visible text of the page, blank lines collapsed. */
export async function bodyText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).replace(/\n\s*\n+/g, '\n');
}
