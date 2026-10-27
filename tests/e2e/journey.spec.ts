import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (p: Page, name: string) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${name}.png` }); } };

/** Two-step sign-up: email a code (local dev shows it on screen), then enter it with a chosen password. */
export async function signUpWithCode(page: Page, name: string, email: string, password = 'password123') {
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Choose a password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
  const code = (await page.locator('strong.tracking-widest').innerText()).trim();
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: /verify and create account/i }).click();
}

async function guest(browser: Browser, code: string, name: string, viewport = { width: 1280, height: 800 }, html = false) {
  const ctx = await browser.newContext({ viewport });
  if (html) await ctx.addInitScript(() => localStorage.setItem('eq:nogame', '1'));
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('Nickname').fill(name);          // first visit: the full "choose your look" form
  await page.getByRole('button', { name: /join game/i }).click();
  await expect(page).toHaveURL(/\/rooms\/\d{6}\/lobby/);
  return { ctx, page };
}

/** Answer whatever is open, round after round, until the results page. */
async function playUntilResults(page: Page, shots?: string) {
  let shotTaken = false;
  for (let i = 0; i < 40; i++) {
    if (/\/results/.test(page.url())) return;
    const radio = page.locator('input[name="answer"]').first();
    const results = page.waitForURL(/\/results/, { timeout: 15_000 }).then(() => 'done').catch(() => null);
    const open = radio.waitFor({ state: 'attached', timeout: 15_000 }).then(() => 'open').catch(() => null);
    const which = await Promise.race([results, open]);
    if (which === 'done' || /\/results/.test(page.url())) return;
    if (which !== 'open') continue;
    await page.locator('label:has(input[name="answer"])').first().click();
    await page.getByRole('button', { name: /^submit answer$/i }).click({ timeout: 4000 }).catch(() => undefined);
    await expect(page.getByRole('button', { name: /answer received/i }).or(page.getByText('Correct answer')).or(page.getByRole('heading', { name: /rankings/i })).first()).toBeVisible({ timeout: 12_000 });
    if (shots && !shotTaken) { shotTaken = true; await shot(page, shots); }
    await page.getByText('Correct answer').waitFor({ timeout: 15_000 }).catch(() => undefined);
  }
}

test('host sets up on one screen (signing in only at Create); guests join; real rounds run to the results page', async ({ browser }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await hostCtx.addInitScript(() => localStorage.setItem('eq:nogame', '1')); // keep CPU free: one Phaser scene (the phone) is enough here
  const host = await hostCtx.newPage();

  // Landing → Host a game. No account needed to look around or fill the form.
  await host.goto('/');
  await expect(host.getByRole('heading', { name: /every answer/i })).toBeVisible();
  await host.getByRole('link', { name: /^host a game/i }).first().click();
  await expect(host).toHaveURL(/\/games\/new/);
  expect(await host.locator('select').count()).toBe(0);                      // gamified tiles, not dropdowns

  const next = () => host.getByRole('button', { name: /^continue/i }).click();
  await host.getByRole('button', { name: /family night/i }).click();           // template fills everything in (step 1 of 4)
  await next(); await next();                                                 // → Questions → Game
  await host.getByRole('radio', { name: '3', exact: true }).check({ force: true });  // summit of 3 so the game finishes quickly
  await next();                                                               // → Rules & launch
  await expect(host.getByLabel('Game title')).toHaveValue('Family night');
  await expect(host.getByLabel(/Super question/)).toBeChecked();             // family template turns both house rules on
  await expect(host.getByLabel(/Gentle mode/)).toBeChecked();

  // Sign in only now, then land back on the form with the choices intact.
  await host.getByRole('button', { name: /sign in to create/i }).click();
  await expect(host).toHaveURL(/sign-in/);
  await host.getByRole('link', { name: /create an account/i }).first().click();
  await signUpWithCode(host, 'E2E Host', `e2e${Date.now()}@example.com`);
  await expect(host).toHaveURL(/\/games\/new/);
  await expect(host.getByLabel('Game title')).toHaveValue('Family night');       // back on the last step with choices intact
  await host.getByRole('button', { name: /create & open room/i }).click();

  // A playing host goes straight into the lobby, already joined, with the invite panel docked.
  await expect(host).toHaveURL(/\/rooms\/\d{6}\/lobby/);
  const code = host.url().match(/rooms\/(\d{6})/)![1]!;
  await expect(host.getByAltText(/QR code/)).toBeVisible();
  await expect(host.getByRole('button', { name: /copy invite/i })).toBeVisible();
  await expect(host.getByRole('list', { name: /where you are/i }).or(host.getByLabel('Where you are'))).toBeVisible();

  const g1 = await guest(browser, code, 'Amina', { width: 390, height: 800 });   // phone portrait
  const g2 = await guest(browser, code, 'Musa', { width: 1280, height: 800 }, true);
  await expect(host.getByText(/Players\s*\(3/)).toBeVisible();

  // House rules are spelled out to players, a sticker can be sent (and has a cooldown), and the landing page offers a rejoin.
  await expect(g1.page.getByText(/super question/i).first()).toBeVisible();
  await g2.page.getByRole('button', { name: /send a star sticker/i }).click();
  await expect(g2.page.getByRole('button', { name: /send a star sticker/i })).toBeDisabled();
  await g1.page.goto('/');
  await expect(g1.page.getByText(/pick up where you left off/i)).toBeVisible();
  await g1.page.getByRole('button', { name: 'Rejoin' }).click();
  await expect(g1.page).toHaveURL(/lobby/);
  await shot(g1.page, 'lobby-390');

  await expect(host.getByRole('button', { name: 'Start game' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start game' }).click();

  for (const p of [host, g1.page, g2.page]) await expect(p).toHaveURL(/\/play/);
  await expect(g1.page.locator('canvas, [aria-label="Staircase"]').first()).toBeVisible();
  const overflow = await g1.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  await Promise.all([playUntilResults(host), playUntilResults(g1.page, 'play-390'), playUntilResults(g2.page, 'play-1280')]);
  for (const p of [host, g1.page, g2.page]) {
    await expect(p.getByRole('heading', { name: /rankings/i })).toBeVisible({ timeout: 30_000 });
    await expect(p.getByRole('heading', { name: /what next/i })).toBeVisible();      // the finish line leads somewhere
    await expect(p.getByRole('button', { name: /share my result/i })).toBeVisible();
  }
  await shot(g1.page, 'results-390');
  await shot(host, 'results-1280');
  const winners = await Promise.all([host, g1.page, g2.page].map((p) => p.locator('section[aria-labelledby="fin-h"] li').allInnerTexts().then((a) => a.map((x) => x.replace(' (you)', '')))));
  expect(winners[0]).toEqual(winners[1]); expect(winners[1]).toEqual(winners[2]);
  await Promise.all([hostCtx.close(), g1.ctx.close(), g2.ctx.close()]);
});

test('quick climb: one tap from the landing page, guided by the first-run tutorial, with house rules explained', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Super question').first()).toBeVisible();           // house rules are described before you start
  await page.getByRole('button', { name: /more about super question/i }).click();   // long explanations sit behind an "i"
  await expect(page.getByText(/climb two steps instead of one/i)).toBeVisible();
  await page.getByRole('button', { name: /more about gentle mode/i }).click();
  await expect(page.getByText(/you simply stay on your step/i)).toBeVisible();
  await page.getByLabel(/Gentle mode/).check();
  await page.getByRole('button', { name: /start climbing/i }).first().click();
  await expect(page).toHaveURL(/\/practice\/.+\/play/);
  await expect(page.getByRole('note', { name: /tutorial step 1 of 3/i })).toBeVisible();
  await page.locator('label:has(input[name="a"])').first().click();
  await expect(page.getByRole('note', { name: /tutorial step 2 of 3/i })).toBeVisible();
  await page.getByRole('button', { name: /^submit answer$/i }).click();
  await expect(page.getByRole('note', { name: /tutorial step 3 of 3/i })).toBeVisible();
  await expect(page.getByText('Correct answer')).toBeVisible();
  await expect(page.getByRole('list', { name: /house rules/i })).toContainText('Gentle');
});

test('solo setup uses tile selectors (no dropdowns) and levels can be tapped as a range', async ({ page }) => {
  await page.goto('/practice');
  expect(await page.locator('select').count()).toBe(0);
  await page.getByRole('button', { name: /^Level 3,/ }).click();
  await page.getByRole('button', { name: /^Level 6,/ }).click();
  await expect(page.getByText(/Levels 3–6/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Level 4,/ })).toHaveAttribute('aria-pressed', 'true');
});

test('time per question: presets plus a custom value clamped to 5–120 seconds', async ({ page }) => {
  await page.goto('/practice');
  await page.getByRole('button', { name: /^continue/i }).click();                // step 2: length & time
  const box = page.getByLabel('Or set your own');
  await page.getByRole('radio', { name: '10 seconds' }).check({ force: true });
  await expect(box).toHaveValue('10');
  await box.fill('3'); await box.blur();
  await expect(box).toHaveValue('5');
  await box.fill('500'); await box.blur();
  await expect(box).toHaveValue('120');
  await box.fill('17'); await box.blur();
  await expect(box).toHaveValue('17');
});

test('landing topic cards start a game instead of opening a catalogue', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^seerah.*tap to play/i }).click();
  await expect(page).toHaveURL(/\/practice\/.+\/play/);
  await expect(page.getByText('Seerah').first()).toBeVisible();
});
