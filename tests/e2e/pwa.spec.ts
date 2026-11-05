import { expect, test } from '@playwright/test';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Mobile/15E148 Safari/604.1';
const IPHONE_WHATSAPP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/23.1';

/** Pretend to be Chrome on Android offering its install prompt. */
const fireInstallPrompt = () => {
  const w = window as unknown as { __prompted?: number };
  const ev = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  ev.prompt = () => { w.__prompted = (w.__prompted ?? 0) + 1; return Promise.resolve(); };
  ev.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(ev);
};

test('the site is installable: manifest, icons, apple touch icon and a working service worker', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toMatch(/manifest\.webmanifest$/);
  const manifestUrl = new URL(href!, page.url());
  const res = await request.get(manifestUrl.toString());
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m).toMatchObject({ name: expect.stringContaining('ElimQuest'), short_name: 'ElimQuest', display: 'standalone', background_color: '#071B2D' });
  expect(m.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true);
  expect(m.icons.some((i: { sizes: string; purpose: string }) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, manifestUrl).toString());
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  const apple = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
  expect((await request.get(new URL(apple!, page.url()).toString())).status()).toBe(200);
  // the service worker registers and takes control; the offline page exists
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  expect((await request.get('/sw.js')).status()).toBe(200);
  expect((await request.get('/offline.html')).status()).toBe(200);
});

test('Android/Chrome: an install suggestion appears, one tap opens the browser install dialog, and it disappears once installed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('region', { name: 'Install the app' })).toHaveCount(0); // nothing until the browser says it can install
  await page.evaluate(fireInstallPrompt);
  const bar = page.getByRole('region', { name: 'Install the app' });
  await expect(bar).toBeVisible();
  const btn = bar.getByRole('button', { name: 'Install' });
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(bar).toHaveCount(0);
});

test('"Not now" hides the suggestion for a while, but the menu keeps an Install app link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(fireInstallPrompt);
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('region', { name: 'Install the app' })).toHaveCount(0);
  await page.getByRole('button', { name: /open menu/i }).click();
  await expect(page.getByRole('button', { name: 'Install app' }).first()).toBeVisible();
});

test('desktop: no top bar, but the footer has an Install app link', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(fireInstallPrompt);
  await expect(page.getByRole('region', { name: 'Install the app' })).toBeHidden();
  await expect(page.getByRole('contentinfo').getByRole('button', { name: 'Install app' })).toBeVisible();
});

test.describe('iPhone Safari (no install prompt exists)', () => {
  test.use({ userAgent: IPHONE_SAFARI, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('shows the suggestion and explains Share, then Add to Home Screen', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const bar = page.getByRole('region', { name: 'Install the app' });
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Install' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add ElimQuest to your home screen' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('Add to Home Screen');
    await dlg.getByRole('button', { name: 'Got it' }).click();
    await expect(dlg).toBeHidden();
  });
});

test.describe('opened inside WhatsApp', () => {
  test.use({ userAgent: IPHONE_WHATSAPP, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('asks people to open the page in their browser first', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('region', { name: 'Install the app' }).getByRole('button', { name: 'Install' }).click();
    await expect(page.getByRole('dialog', { name: 'Open in your browser first' })).toBeVisible();
  });
});
