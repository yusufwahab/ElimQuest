// Debug probe: one real browser player; host + second player driven via API/socket.
import { chromium } from '@playwright/test';
import { io } from 'socket.io-client';
const API = 'http://localhost:8788';
const j = async (m, p, b, h = {}) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const reg = await j('POST', '/api/dev-auth/register', { email: `probe${Date.now()}@x.com`, password: 'password123', displayName: 'Probe' });
const auth = { authorization: `Bearer ${reg.b.token}` };
const topics = (await j('GET', '/api/topics')).b.topics.map((t) => t.id);
const g = (await j('POST', '/api/games', { title: 'probe', hostMode: 'audience', categoryIds: topics, minLevel: 1, maxLevel: 10, settings: { questionLimit: 10, summitHeight: 3, timeLimitS: 30, maxPlayers: 20 }, openNow: true }, auth)).b;
await j('POST', `/api/rooms/${g.code}/join`, { nickname: 'Bot' });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
const page = await ctx.newPage();
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto(`http://localhost:4173/join/${g.code}`);
await page.getByLabel('Nickname').fill('Browser');
await page.getByRole('button', { name: /join game/i }).click();
await page.waitForURL(/lobby/);
const host = io(API, { auth: { code: g.code, accessToken: reg.b.token }, transports: ['websocket'] });
await new Promise((r) => host.on('connect', r));
console.log('start ack', JSON.stringify(await host.emitWithAck('host', { cmd: 'start' })).slice(0, 120));
await page.waitForSelector('input[name="answer"]', { state: 'attached', timeout: 20000 });
for (let i = 0; i < 14; i++) {
  const st = await page.evaluate(() => ({ url: location.pathname, btn: document.querySelector('button.btn-gold.w-full')?.textContent, dis: document.querySelector('button.btn-gold.w-full')?.disabled, fs: document.querySelector('fieldset')?.disabled, sel: !!document.querySelector('input[name="answer"]:checked'), timer: document.querySelector('[role=timer]')?.textContent }));
  console.log(i, JSON.stringify(st));
  if (i === 1) { await page.locator('label:has(input[name="answer"])').first().click({ timeout: 3000 }).then(() => console.log('clicked label')).catch((e) => console.log('click failed', e.message.split('\n')[0])); }
  if (i === 3) { await page.getByRole('button', { name: /^submit answer$/i }).click({ timeout: 4000 }).then(() => console.log('clicked submit')).catch((e) => console.log('submit failed', e.message.split(String.fromCharCode(10)).slice(0,6).join(' | '))); }
  await page.waitForTimeout(500);
  await page.waitForTimeout(500);
}
await page.screenshot({ path: process.argv[2] + '/probe.png' });
host.close(); await b.close();
