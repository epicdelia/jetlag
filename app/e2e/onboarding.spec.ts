import { expect, storedProfile, test } from './fixtures';

test.describe('onboarding', () => {
  test.use({ onboarded: false });

  test('first launch lands on onboarding; Continue saves the profile and opens Today', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { name: 'Arrive on local time, sooner.' })).toBeVisible();
    await expect(page.getByText('That is about 8h 00m in bed.')).toBeVisible();
    expect(await storedProfile(page)).toBeNull();

    // Change something so the saved profile is clearly what was entered.
    await page.getByRole('button', { name: 'Bedtime 15 minutes later' }).click();
    await page.getByRole('radio', { name: 'Late' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Plan your next trip' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
    const profile = await storedProfile(page);
    expect(profile.sleep).toEqual({ usualBedtime: '23:15', usualWake: '07:00', chronotype: 'late' });

    // Reloading keeps the profile: no onboarding again.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Plan your next trip' })).toBeVisible();
  });

  test('an out-of-range night blocks Continue until it is fixed', async ({ page }) => {
    await page.goto('/onboarding');
    const earlier = page.getByRole('button', { name: 'Wake time 15 minutes earlier' });
    // 07:00 -> 00:00: one hour in bed.
    for (let i = 0; i < 28; i++) await earlier.click();
    await expect(page.getByText('That is about 1h 00m in bed.')).toBeVisible();
    await expect(page.getByText(/^The planner needs a usual night of .* hours; this is 1h 00m\./)).toBeVisible();
    await expect(page.getByText('Fix your usual sleep times above to continue.')).toBeVisible();

    const cont = page.getByRole('button', { name: 'Continue' });
    await expect(cont).toHaveAttribute('aria-disabled', 'true');
    await cont.click({ force: true });
    await expect(page).toHaveURL(/\/onboarding$/);
    expect(await storedProfile(page)).toBeNull();

    // Back to 07:00 wake: valid again.
    const later = page.getByRole('button', { name: 'Wake time 15 minutes later' });
    for (let i = 0; i < 28; i++) await later.click();
    await expect(page.getByText('That is about 8h 00m in bed.')).toBeVisible();
    await expect(page.getByText('Fix your usual sleep times above to continue.')).toBeHidden();
    await cont.click();
    await expect(page.getByRole('heading', { name: 'Plan your next trip' })).toBeVisible();
    expect((await storedProfile(page)).sleep.usualWake).toBe('07:00');
  });
});
