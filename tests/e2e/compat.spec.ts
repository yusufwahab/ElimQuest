import { expect, test } from '@playwright/test';

// Older phones (iOS 15 / early 16, older Android) lack some browser features. The site must stay usable without them.
// A missing canvas `roundRect` once crashed the whole home page for people on older iPhones.
const OLD_BROWSER = `
  delete CanvasRenderingContext2D.prototype.roundRect;
  if (window.Path2D) delete Path2D.prototype.roundRect;
  Object.defineProperty(crypto, 'randomUUID', { value: undefined });
  delete Array.prototype.at;
  delete window.structuredClone;
`;

for (const path of ['/', '/topics', '/topics/quran', '/join', '/practice', '/how-it-works', '/sign-in', '/games/new']) {
  test(`older browser without roundRect / randomUUID / Array.at: ${path} still loads`, async ({ page }) => {
    await page.addInitScript(OLD_BROWSER);
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
    await expect(page.locator('main h1').first()).toBeVisible();
    expect(crashes).toEqual([]);
  });
}

test('older browser can start a quick climb (uses the device id fallback)', async ({ page }) => {
  await page.addInitScript(OLD_BROWSER);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /start climbing/i }).first().click();
  await page.waitForURL(/practice\/.*play/);
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
});
