/**
 * Visual + performance probe for the staircase scene.
 *   npm run build -w @elimquest/web && (cd apps/web && npx vite preview --port 4173 --strictPort &)   # proxy -> :8787
 *   npx tsx tests/tools/scene-shot.ts <outDir>
 * Starts the real server in-process on :8787, seeds players on different steps, screenshots phone + desktop, and measures
 * main-thread busy time while the scene is idle (should be near zero: the render loop sleeps).
 */
import { chromium } from '@playwright/test';
import { io } from 'socket.io-client';
import { createApp } from '../../apps/server/src/app';

const out = process.argv[2] ?? '.';
const app = await createApp({ NODE_ENV: 'test', DB_DRIVER: 'pglite', AUTH_MODE: 'dev', EMAIL_MODE: 'log', RATE_LIMIT_DISABLED: 'true', ALLOW_FIXTURE_QUESTIONS: 'true', LOG_LEVEL: 'error', MAX_ACTIVE_ROOMS: '20' });
await app.listen(8790);
const base = 'http://127.0.0.1:8790';
const j = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, b: (await r.json().catch(() => ({}))) as any }; };

const reg = await j('POST', '/api/dev-auth/register', { email: `shot${Date.now()}@x.com`, password: 'password123', displayName: 'Shot' });
const auth = { authorization: `Bearer ${reg.b.token}` };
const topics = (await j('GET', '/api/topics')).b.topics.map((t: any) => t.id);
const g = (await j('POST', '/api/games', { title: 'shot', hostMode: 'audience', categoryIds: topics, minLevel: 1, maxLevel: 10, settings: { questionLimit: 20, summitHeight: 10, timeLimitS: 60, maxPlayers: 150 }, openNow: true }, auth)).b;
const looks = [
  { body: 'amber', eyes: 'happy', glasses: 'none', headwear: 'cap', gear: 'backpack' }, { body: 'violet', eyes: 'round', glasses: 'round', headwear: 'crown', gear: 'cape' },
  { body: 'blue', eyes: 'calm', glasses: 'visor', headwear: 'none', gear: 'scarf' }, { body: 'ivory', eyes: 'happy', glasses: 'none', headwear: 'beanie', gear: 'backpack' },
  { body: 'night', eyes: 'round', glasses: 'square', headwear: 'crescent', gear: 'cape' }, { body: 'teal', eyes: 'happy', glasses: 'none', headwear: 'none', gear: 'hood' },
];
const ids: string[] = [];
for (let i = 0; i < 6; i++) { const r = await j('POST', `/api/rooms/${g.code}/join`, { nickname: ['Amina', 'Musa', 'Zainab', 'Ibrahim', 'Layla', 'Omar'][i], avatar: looks[i] }); ids.push(r.b.participantId); }
for (let i = 0; i < 40; i++) { const r = await j('POST', `/api/rooms/${g.code}/join`, { nickname: `Extra${i}`, avatar: looks[i % 6] }); ids.push(r.b.participantId); }

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
await page.goto(`http://localhost:4174/join/${g.code}`);
await page.getByLabel('Nickname').fill('Yusuf');
await page.getByRole('button', { name: /join game/i }).click();
await page.waitForURL(/lobby/);
const host = io(base, { auth: { code: g.code, accessToken: reg.b.token }, transports: ['websocket'] });
await new Promise((r) => host.on('connect', r));
await host.emitWithAck('host', { cmd: 'start' });
await page.waitForSelector('input[name="answer"]', { state: 'attached', timeout: 20000 });
// Spread players over the staircase, then reload so the snapshot carries the positions.
const spread = [4, 6, 6, 7, 8, 3, ...Array.from({ length: 40 }, (_, i) => [1, 2, 2, 3, 5, 0][i % 6]!)];
for (let i = 0; i < ids.length; i++) await app.db.query('update participants set position=$2 where id=$1', [ids[i], spread[i] ?? 0]);
const me = await app.db.query<any>("select id from participants where nickname='Yusuf'");
await app.db.query('update participants set position=4 where id=$1', [me.rows[0].id]);
await page.reload();
await page.waitForSelector('input[name="answer"]', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/stairs-390.png` });

// Idle cost: main-thread busy time over 4 s with the scene idle (React timer ring still ticks 4x/s).
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const task = async () => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0);
const busy = async (label: string) => { const t0 = await task(); await page.waitForTimeout(3000); const t1 = await task(); console.log(`idle busy [${label}]: ${(((t1 - t0) / 3) * 100).toFixed(1)}% of one core`); };
await busy('everything');
await page.evaluate(() => document.querySelectorAll('[role=timer]').forEach((e) => e.remove()));
await busy('timer ring removed');
await page.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.style.display = 'none'; });
await busy('timer + canvas removed');

await page.reload();
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForSelector('input[name="answer"]', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/stairs-1280.png` });
await b.close(); host.close(); await app.close();
process.exit(0);
