import { expect, test } from './fixtures';
import { bodyText, createTorontoLondon } from './helpers';

test.describe('static screens and bad links', () => {
  test('about screen', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'About, science & limitations' }).click();
    await expect(page).toHaveURL(/\/about$/);
    for (const s of ['How it works', 'What the advice is based on', 'Limitations', 'About melatonin', 'Your data']) {
      await expect(page.getByText(s, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/not medical advice/i).first()).toBeVisible();
  });

  test('unknown route shows the not-found screen', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await expect(page.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible();
    expect(await bodyText(page)).not.toMatch(/Sitemap|Unmatched Route/);
    await page.getByRole('button', { name: 'Go to Today' }).click();
    await expect(page.getByRole('heading', { name: 'Plan your next trip' })).toBeVisible();
  });

  test('unknown trip ids', async ({ page }) => {
    await page.goto('/trip/doesnotexist');
    await expect(page.getByText('Trip not found')).toBeVisible();
    await page.getByRole('button', { name: 'Back to trips' }).click();
    await expect(page).toHaveURL(/\/trips$/);

    await page.goto('/trip/new?edit=nope');
    await expect(page.getByText('That trip no longer exists.')).toBeVisible();
  });
});

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('Today, a plan and Settings render on a dark background', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Plan your next trip' })).toBeVisible();
    const luminance = async () =>
      page.evaluate(() => {
        // The background of the topmost element under the middle of the screen with a solid fill.
        let el: Element | null = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        while (el) {
          const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
          if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
            const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number];
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          }
          el = el.parentElement;
        }
        return 1;
      });
    const textColor = async (text: string) =>
      page.getByText(text, { exact: true }).first().evaluate((e) => getComputedStyle(e).color);
    expect(await luminance()).toBeLessThan(0.25);
    expect(await textColor('Plan your next trip')).not.toBe('rgb(0, 0, 0)');

    await createTorontoLondon(page);
    expect(await luminance()).toBeLessThan(0.25);
    await expect(page.getByText('Day 4 after departure', { exact: true })).toBeAttached();

    await page.goto('/settings');
    await expect(page.getByText('Usual sleep at home')).toBeVisible();
    expect(await luminance()).toBeLessThan(0.25);
  });
});
