import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, correctOptionFor, createGame, joinBot, login, startServer, type TestServer } from './helpers';
import { browserOf, deviceOf, normalisePath } from '../stats';

let s: TestServer; let admin: string; let reviewer: string; let member: string;
beforeAll(async () => { s = await startServer(); admin = await login(s, 'admin@dev.local'); reviewer = await login(s, 'reviewer@dev.local'); member = await login(s, 'host@dev.local'); });
afterAll(async () => { await s.close(); });

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const hit = (path: string, ua: string, extra: Record<string, string> = {}, ref?: string) => fetch(`${s.base}/api/t`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua, ...extra }, body: JSON.stringify({ path, ref }) });

describe('path and device normalisation', () => {
  it('collapses ids and codes, never counts staff pages, and buckets unknown paths', () => {
    expect(normalisePath('/')).toBe('/');
    expect(normalisePath('/join/123456?x=1')).toBe('/join/:code');
    expect(normalisePath('/rooms/123456/play')).toBe('/rooms/:code/play');
    expect(normalisePath('/games/3f2b8c1e-1111-4222-8333-444455556666/results')).toBe('/games/:id/results');
    expect(normalisePath('/topics/quran')).toBe('/topics/:slug');
    expect(normalisePath('/admin/stats')).toBeNull();
    expect(normalisePath('/wp-login.php')).toBe('/other');
    expect(deviceOf(IPHONE)).toBe('mobile'); expect(deviceOf(CHROME)).toBe('desktop');
    expect(browserOf(CHROME)).toBe('Chrome'); expect(browserOf(IPHONE)).toBe('Safari');
  });
});

describe('usage statistics (super admin only)', () => {
  it('counts visitors and page views without storing who they are, honours opt-outs, and ignores bots and staff pages', async () => {
    expect((await hit('/', CHROME, {}, 'https://www.google.com/search?q=x')).status).toBe(204);
    await hit('/join/123456', CHROME);                    // same visitor, second page: one visitor, two views
    await hit('/rooms/654321/lobby', IPHONE);             // a second visitor
    await hit('/admin/stats', CHROME);                    // staff page: not counted
    await hit('/', CHROME, { dnt: '1' });                 // Do-Not-Track: not counted
    await hit('/', 'Googlebot/2.1 (+http://www.google.com/bot.html)');
    const st = (await api(s, 'GET', '/api/admin/stats?days=7', undefined, { bearer: admin })).body;
    expect(st.totals.visitors).toBe(2);
    expect(st.totals.pageviews).toBe(3);
    expect(Object.fromEntries(st.top.pages.map((x: any) => [x.key, x.n]))).toEqual({ '/': 1, '/join/:code': 1, '/rooms/:code/lobby': 1 });
    expect(Object.fromEntries(st.top.devices.map((x: any) => [x.key, x.n]))).toEqual({ desktop: 1, mobile: 1 });
    expect(Object.fromEntries(st.top.referrers.map((x: any) => [x.key, x.n]))).toEqual({ 'google.com': 1, '(direct)': 1 });
    expect(st.series).toHaveLength(7);
    // nothing identifying is stored
    const dump = JSON.stringify(await s.db.query('select * from site_visitors')) + JSON.stringify(await s.db.query('select * from site_daily'));
    expect(dump).not.toMatch(/127\.0\.0\.1|Mozilla|iPhone/);
  });

  it('counts sign-ups, new sign-in sessions and daily active accounts; failed attempts are counted, never identified', async () => {
    const before = (await api(s, 'GET', '/api/admin/stats?days=7', undefined, { bearer: admin })).body;
    expect(before.totals.signins).toBeGreaterThanOrEqual(1);          // the admin login above started a session
    const t = await api(s, 'POST', '/api/dev-auth/register', { email: 'newbie@dev.local', password: 'password123', displayName: 'Newbie' });
    await api(s, 'GET', '/api/me', undefined, { bearer: t.body.token });
    await fetch(`${s.base}/api/t/signin-failed`, { method: 'POST' });
    const after = (await api(s, 'GET', '/api/admin/stats?days=7', undefined, { bearer: admin })).body;
    expect(after.totals.signups).toBe(before.totals.signups + 1);
    expect(after.totals.signins).toBe(before.totals.signins + 1);
    expect(after.totals.signinFailed).toBe(before.totals.signinFailed + 1);
    expect(after.activeUsers.today).toBeGreaterThanOrEqual(2);
    await api(s, 'GET', '/api/me', undefined, { bearer: t.body.token });   // same session again: not a new sign-in
    expect((await api(s, 'GET', '/api/admin/stats?days=7', undefined, { bearer: admin })).body.totals.signins).toBe(after.totals.signins);
  });

  it('only a super admin can read statistics, the question-quality list or the sign-in log', async () => {
    for (const path of ['/api/admin/stats', '/api/admin/stats/questions', '/api/admin/audit?kind=signins']) {
      expect((await api(s, 'GET', path, undefined, { bearer: reviewer })).status).toBe(403);
      expect((await api(s, 'GET', path, undefined, { bearer: member })).status).toBe(403);
      expect((await api(s, 'GET', path)).status).toBe(401);
      expect((await api(s, 'GET', path, undefined, { bearer: admin })).status).toBe(200);
    }
    const log = (await api(s, 'GET', '/api/admin/audit?kind=signins', undefined, { bearer: admin })).body.events;
    expect(log.length).toBeGreaterThan(0); expect(log.every((e: any) => e.action === 'auth.signin')).toBe(true);
    const adminLog = (await api(s, 'GET', '/api/admin/audit', undefined, { bearer: reviewer })).body.events;
    expect(adminLog.some((e: any) => e.action.startsWith('auth.'))).toBe(false);   // sign-ins never mix into the admin log
  });

  it('question quality reports the share answered correctly from scored rounds', async () => {
    const g = await createGame(s, member, { settings: { questionLimit: 10, summitHeight: 3, timeLimitS: 30, maxPlayers: 20 } });
    const host = await joinBot(s, g.code, 'Qh', { bearer: member }); const p = await joinBot(s, g.code, 'Qp');
    await host.emit('host', { cmd: 'start' });
    const open = await p.waitFor('round:open');
    const done = p.waitFor('round:result', 30_000);
    await p.emit('answer', { roundId: open.question.roundId, optionId: await correctOptionFor(s, open.question.roundId) });
    await done;
    const r = (await api(s, 'GET', '/api/admin/stats/questions?min=1&sort=most', undefined, { bearer: admin })).body;
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions[0]).toMatchObject({ answered: 1, correct: 1, pct: 100 });
    [host, p].forEach((x) => x.close());
  });
});
