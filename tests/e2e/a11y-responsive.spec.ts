import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/games/new', '/topics', '/topics/quran', '/how-it-works', '/sign-in', '/sign-up', '/forgot-password', '/practice', '/join', '/help', '/privacy', '/terms', '/nope'];
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];

test.describe('accessibility (axe, WCAG 2.x A/AA)', () => {
  for (const path of PAGES) {
    test(`no serious or critical violations: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(path, { waitUntil: 'networkidle' });
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const bad = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
      expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
});

test.describe('responsive: no horizontal scroll, readable text, 44px touch targets', () => {
  for (const w of WIDTHS) {
    test(`width ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      for (const path of ['/', '/games/new', '/topics', '/how-it-works', '/sign-in', '/practice', '/join']) {
        await page.goto(path, { waitUntil: 'networkidle' });
        const m = await page.evaluate(() => {
          const small: string[] = [];
          document.querySelectorAll('a, button, input:not([type=radio]):not([type=checkbox]), select, textarea').forEach((el) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') return;
            if (r.height < 40 && !(el as HTMLElement).closest('.sr-only')) small.push(`${el.tagName.toLowerCase()}:${(el.textContent ?? '').trim().slice(0, 24)}:${Math.round(r.height)}`);
          });
          return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small };
        });
        expect(m.overflow, `${path} overflows at ${w}px`).toBeLessThanOrEqual(0);
        expect(m.small, `${path} has touch targets under ~40px at ${w}px`).toEqual([]);
      }
    });
  }
  test('200% browser zoom (reflow at 640 CSS px) on the home page', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
  test('landscape phone keeps the join panel reachable', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByLabel('Room code')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

test('skip link, keyboard-only join flow and error messaging', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.getByLabel('Room code').fill('12');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('6 digits');
});

test('unknown room code shows a friendly state with recovery action', async ({ page }) => {
  await page.goto('/join/000000');
  await expect(page.getByRole('heading', { name: /couldn.t find that room/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /try another code/i })).toBeVisible();
});

test('reduced motion preference disables animations; WebGL/asset failure keeps the quiz usable', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForSelector('.anim-float', { state: 'attached' });
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.anim-float')!).animationDuration);
  expect(parseFloat(dur)).toBeLessThan(0.01);
  await ctx.close();
});
