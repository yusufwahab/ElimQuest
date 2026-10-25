// Debug probe: open the join page on a phone viewport and report what the Nickname field looks like.
import { chromium } from '@playwright/test';
import { createApp } from '../../apps/server/src/app';

const app = await createApp({ NODE_ENV: 'test', DB_DRIVER: 'pglite', AUTH_MODE: 'dev', EMAIL_MODE: 'log', RATE_LIMIT_DISABLED: 'true', ALLOW_FIXTURE_QUESTIONS: 'true', LOG_LEVEL: 'error' });
await app.listen(8798);
const base = 'http://127.0.0.1:8798';
const j = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, b: (await r.json().catch(() => ({}))) as any }; };
const reg = await j('POST', '/api/dev-auth/register', { email: `dbg${Date.now()}@x.com`, password: 'password123', displayName: 'Dbg' });
const topics = (await j('GET', '/api/topics')).b.topics.map((t: any) => t.id);
const g = (await j('POST', '/api/games', { title: 'dbg', hostMode: 'audience', categoryIds: topics, minLevel: 1, maxLevel: 5, settings: { questionLimit: 10, summitHeight: 3, timeLimitS: 30, maxPlayers: 20, superQuestion: true, gentle: true }, openNow: true }, { authorization: `Bearer ${reg.b.token}` })).b;
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
await page.goto(`http://localhost:4199/join/${g.code}`);
await page.waitForTimeout(1500);
const info = await page.evaluate(() => [...document.querySelectorAll('label')].filter((l) => /nickname/i.test(l.textContent ?? '')).map((l) => { const i = document.getElementById(l.getAttribute('for') ?? '') as HTMLInputElement | null; const r = i?.getBoundingClientRect(); return { for: l.getAttribute('for'), inDialog: !!l.closest('dialog'), found: !!i, w: r?.width, h: r?.height, display: i ? getComputedStyle(i).display : null }; }));
console.log(JSON.stringify(info));
console.log('chosen flag:', await page.evaluate(() => localStorage.getItem('eq:adv-chosen')));
await b.close(); await app.close();
process.exit(0);
