import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const unique = () => `otp${Date.now()}${Math.floor(Math.random() * 1e5)}@example.com`;
async function startSignup(page: Page, email: string, name = 'Amina') {
  await page.goto('/sign-up');
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Choose a password').fill('password123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
}

test('sign-up needs the emailed code; wrong codes are refused with a countdown, the right one creates the account', async ({ page }) => {
  const email = unique();
  await startSignup(page, email);
  await expect(page.getByText(`We sent a 6-digit code to ${email}`)).toBeVisible();
  const code = (await page.locator('strong.tracking-widest').innerText()).trim();
  const wrong = code === '000000' ? '111111' : '000000';

  // Step 2 asks for the code alone; the button stays off until all 6 digits are present.
  const create = page.getByRole('button', { name: /verify and create account/i });
  await expect(page.getByLabel('Choose a password')).toHaveCount(0);
  await expect(create).toBeDisabled();

  await page.getByLabel('6-digit code').fill(wrong);
  await create.click();
  await expect(page.getByRole('alert').filter({ hasText: /4 tries left/ })).toBeVisible();
  await expect(page.getByLabel('6-digit code')).toHaveValue('');                         // cleared for a retry

  // Resend is rate-limited (cooldown), and "different email" goes back to step 1.
  await expect(page.getByRole('button', { name: /send a new code in \d+s/i })).toBeDisabled();

  await page.getByLabel('6-digit code').fill(code);
  await create.click();
  await expect(page).toHaveURL(/\/dashboard/);                                           // account created and signed in
});

test('5 wrong codes lock the code; a new code is needed', async ({ page }) => {
  await startSignup(page, unique());
  const code = (await page.locator('strong.tracking-widest').innerText()).trim();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) { await page.getByLabel('6-digit code').fill(wrong); await page.getByRole('button', { name: /verify and create account/i }).click(); await expect(page.getByLabel('6-digit code')).toHaveValue(''); }
  await expect(page.getByRole('alert').filter({ hasText: /too many wrong tries/i })).toBeVisible();
  await page.getByLabel('6-digit code').fill(code);                                      // even the right code is now refused
  await page.getByRole('button', { name: /verify and create account/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /too many wrong tries/i })).toBeVisible();
  await expect(page).toHaveURL(/sign-up/);
});

test('an address that already has an account gets no code (and the page does not say so)', async ({ page }) => {
  await startSignup(page, 'host@dev.local');
  await expect(page.locator('strong.tracking-widest')).toHaveCount(0);                   // no code exists to show, even in dev
  await expect(page.getByText(/already has an account we email you a sign-in link/i)).toBeVisible();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: /verify and create account/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /tries left/i })).toBeVisible();     // identical to any wrong code, so addresses can't be probed
});

test('"use a different email" returns to step 1; the code screen has no serious accessibility violations', async ({ page }) => {
  await startSignup(page, unique());
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(res.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
  await page.getByRole('button', { name: /use a different email/i }).click();
  await expect(page.getByLabel('Display name')).toBeVisible();
  await expect(page.getByLabel('Choose a password')).toBeVisible();
});
