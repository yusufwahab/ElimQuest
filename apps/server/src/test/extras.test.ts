import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, attach, baseSettings, correctOptionFor, createGame, joinBot, login, register, sleep, startServer, topicIds, type TestServer } from './helpers';

let s: TestServer; let host: string;
beforeAll(async () => { s = await startServer(); host = await login(s); });
afterAll(async () => { await s.close(); });

describe('solo practice', () => {
  const correctFor = async (id: string, guest: string) => {
    const st = (await api(s, 'GET', `/api/practice/${id}`, undefined, { guest })).body;
    const row = await s.db.query<any>("select queue, round_no from practice_sessions where id=$1", [id]);
    const snap = row.rows[0].queue[st.roundNo].snapshot;
    return { st, correct: snap.correctOptionId as string, wrong: snap.correctOptionId === 'a' ? 'b' : 'a' };
  };

  it('guest can play with the same scoring rules, reaches the summit, and no server answer key is sent early', async () => {
    const created = await api(s, 'POST', '/api/practice', { categoryIds: await topicIds(s), minLevel: 1, maxLevel: 10, questionLimit: 10, summitHeight: 3, timeLimitS: 30 });
    expect(created.status).toBe(201);
    const { id, token } = created.body;
    const nxt = await api(s, 'POST', `/api/practice/${id}/next`, undefined, { guest: token });
    expect(JSON.stringify(nxt.body)).not.toMatch(/correct|explanation/i);
    expect((await api(s, 'GET', `/api/practice/${id}`)).status).toBe(403);               // no credential
    expect((await api(s, 'GET', `/api/practice/${id}`, undefined, { guest: 'x'.repeat(43) })).status).toBe(403);

    // wrong at step 0 stays at 0 ("You stay at the starting step")
    let c = await correctFor(id, token);
    let r = (await api(s, 'POST', `/api/practice/${id}/answer`, { optionId: c.wrong }, { guest: token })).body;
    expect(r).toMatchObject({ outcome: 'wrong', from: 0, to: 0, detail: 'You stay at the starting step.' });
    for (let i = 0; i < 3; i++) {
      await api(s, 'POST', `/api/practice/${id}/next`, undefined, { guest: token });
      c = await correctFor(id, token);
      r = (await api(s, 'POST', `/api/practice/${id}/answer`, { optionId: c.correct }, { guest: token })).body;
      expect(r.to).toBe(i + 1);
    }
    expect(r.finished).toBe(true); expect(r.succeeded).toBe(true);
    const done = (await api(s, 'GET', `/api/practice/${id}`, undefined, { guest: token })).body;
    expect(done.status).toBe('finished'); expect(done.history).toHaveLength(4);
    expect((await api(s, 'POST', `/api/practice/${id}/answer`, { optionId: 'a' }, { guest: token })).status).toBe(409); // finished
  });

  it('an unanswered question past the deadline counts as unanswered; double submit is rejected', async () => {
    const created = (await api(s, 'POST', '/api/practice', { categoryIds: await topicIds(s), questionLimit: 10, summitHeight: 5, timeLimitS: 30 })).body;
    await api(s, 'POST', `/api/practice/${created.id}/next`, undefined, { guest: created.token });
    await sleep(1800 + 200);                                                             // window 1.5 s + 150 ms grace
    const st = (await api(s, 'GET', `/api/practice/${created.id}`, undefined, { guest: created.token })).body;
    expect(st.roundNo).toBe(1); expect(st.question).toBeNull();                           // lazily settled
    const hist = await s.db.query<any>('select history from practice_sessions where id=$1', [created.id]);
    expect(hist.rows[0].history[0].outcome).toBe('unanswered');
  });

  it('mistake practice repeats only missed questions and requires proof of having played that game', async () => {
    const hostTok = await login(s);
    const g = await createGame(s, hostTok);
    const h = await joinBot(s, g.code, 'Mph', { bearer: hostTok });
    const p = await joinBot(s, g.code, 'Mpp');
    await h.emit('host', { cmd: 'start' });
    const finished = p.waitFor('game:finished', 60_000);
    // Host always right; Mpp always skips (so every round is a "mistake" for Mpp).
    for (;;) {
      const open = await Promise.race([p.waitFor('round:open', 20_000), finished.then(() => null)]);
      if (!open) break;
      await h.emit('answer', { roundId: open.question.roundId, optionId: await correctOptionFor(s, open.question.roundId) });
      await Promise.race([p.waitFor('round:result', 20_000), finished]);
    }
    const fin = (await finished).finished;
    // Results: only participants may read them.
    expect((await api(s, 'GET', `/api/games/${g.id}/results`)).status).toBe(403);
    expect((await api(s, 'GET', `/api/games/${g.id}/results`, undefined, { guest: p.token })).status).toBe(200);
    const mine = (await api(s, 'GET', `/api/games/${g.id}/results`, undefined, { guest: p.token })).body;
    expect(mine.review.length).toBe(fin.validRounds);
    expect(mine.mine.unanswered).toBe(fin.validRounds);

    const noProof = await api(s, 'POST', '/api/practice', { mode: 'mistakes', sourceGameId: g.id });
    expect(noProof.status).toBe(403);
    const ok = await api(s, 'POST', '/api/practice', { mode: 'mistakes', sourceGameId: g.id, questionLimit: 10, summitHeight: 3 }, { guest: p.token });
    expect(ok.status).toBe(201);
    expect(ok.body.settings.questionLimit).toBe(fin.validRounds);                       // exactly the missed ones
    // The winner (host) answered everything right, so there is nothing to practise.
    const none = await api(s, 'POST', '/api/practice', { mode: 'mistakes', sourceGameId: g.id }, { guest: h.token });
    expect(none.status).toBe(409);
    h.close(); p.close();
  });
});

describe('scheduling, voting, lifecycle', () => {
  it('a scheduled room never auto-starts; host can start early; changing the date is flagged', async () => {
    const t = await login(s);
    const when = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const g = await createGame(s, t, { scheduledAt: when, timezone: 'Europe/London' });
    const prev = await api(s, 'GET', `/api/rooms/${g.code}`);
    expect(prev.body.scheduledAt).toBe(when); expect(prev.body.timezone).toBe('Europe/London');
    const hostBot = await joinBot(s, g.code, 'Early1', { bearer: t });
    const b = await joinBot(s, g.code, 'Early2');
    await sleep(500);
    const row = await s.db.query<any>('select phase from games where id=$1', [g.id]);
    expect(row.rows[0].phase).toBe('lobby');                                              // no automatic start
    const newDate = new Date(Date.now() + 8 * 86_400_000).toISOString();
    const upd = await api(s, 'PATCH', `/api/games/${g.id}`, { scheduledAt: newDate }, { bearer: t });
    expect(upd.body.dateChanged).toBe(true);
    const share = (await api(s, 'GET', `/api/games/${g.id}/share`, undefined, { bearer: t })).body;
    expect(share.ics).toContain('BEGIN:VEVENT'); expect(share.whatsappUrl).toContain('wa.me'); expect(share.qr).toMatch(/^data:image\/png/);
    expect(share.notice).toMatch(/does not message your audience/);
    const early = await hostBot.emit('host', { cmd: 'start' });
    expect(early.ok).toBe(true);                                                          // manual early start allowed
    [hostBot, b].forEach((x) => x.close());
  });

  it('topic voting builds a deterministic quota and respects the shortlist; settings lock after start', async () => {
    const t = await login(s);
    const topics = (await api(s, 'GET', '/api/topics')).body.topics.filter((x: any) => ['quran', 'seerah'].includes(x.slug));
    const g = await createGame(s, t, { categoryIds: topics.map((x: any) => x.id), topicVoting: true });
    const h = await joinBot(s, g.code, 'Vote1', { bearer: t });
    const p = await joinBot(s, g.code, 'Vote2');
    const seerah = topics.find((x: any) => x.slug === 'seerah').id;
    const bogus = (await api(s, 'GET', '/api/topics')).body.topics.find((x: any) => x.slug === 'hadith').id;
    const v = await p.emit<any>('vote', { categoryIds: [seerah, bogus] });
    expect(v.data.ids).toEqual([seerah]);                                                 // off-shortlist vote ignored
    expect((await h.emit('host', { cmd: 'closeVoting' })).ok).toBe(true);
    expect((await p.emit('vote', { categoryIds: [seerah] })).code).toBe('voting_closed');
    await h.emit('host', { cmd: 'start' });
    const locked = await api(s, 'PATCH', `/api/games/${g.id}`, { title: 'new title' }, { bearer: t });
    expect(locked.status).toBe(409);
    const cats = await s.db.query<any>("select distinct snapshot->>'categoryName' c from game_questions where game_id=$1 and role='main'", [g.id]);
    expect(cats.rows.map((r: any) => r.c).sort()).toEqual(['Qur’an', 'Seerah']);
    [h, p].forEach((x) => x.close());
  });

  it('never repeats a question within a match and uses history only with consent', async () => {
    const t = await register(s, `hist${Date.now()}@example.com`, 'History Host');
    const g = await createGame(s, t);
    const h = await joinBot(s, g.code, 'Rep1', { bearer: t });
    const p = await joinBot(s, g.code, 'Rep2');
    await h.emit('host', { cmd: 'start' });
    const rows = await s.db.query<any>("select count(*)::int n, count(distinct canonical_id)::int d from game_questions where game_id=$1", [g.id]);
    expect(rows.rows[0].n).toBe(rows.rows[0].d);
    // Exhaustion flow: ask for more fresh questions than exist after history is recorded.
    await s.db.query("insert into usage_history(owner_key, canonical_id) select 'h:' || $1::text, id from questions where scope='platform' on conflict do nothing", [(await api(s, 'GET', '/api/me', undefined, { bearer: t })).body.user.id]);
    const blocked = await api(s, 'POST', '/api/games', { title: 'fresh only', hostMode: 'competing', categoryIds: await topicIds(s), minLevel: 1, maxLevel: 10, settings: baseSettings, openNow: true }, { bearer: t });
    expect(blocked.status).toBe(409); expect(blocked.body.code).toBe('shortage'); expect(blocked.body.details.fresh).toBeLessThan(10);
    const allowed = await api(s, 'POST', '/api/games', { title: 'reuse ok', hostMode: 'competing', categoryIds: await topicIds(s), minLevel: 1, maxLevel: 10, settings: baseSettings, openNow: true, allowHistoryReuse: true }, { bearer: t });
    expect(allowed.status).toBe(201);
    [h, p].forEach((x) => x.close());
  });

  it('draft rooms are not joinable until opened; cancelled rooms report cancelled; expired lobbies expire', async () => {
    const t = await login(s);
    const d = await createGame(s, t, { openNow: false });
    expect(d.phase).toBe('draft');
    const opened = await api(s, 'POST', `/api/games/${d.id}/open`, undefined, { bearer: t });
    expect(opened.status).toBe(200);
    const g = await createGame(s, t);
    await api(s, 'POST', `/api/games/${g.id}/cancel`, undefined, { bearer: t });
    expect((await api(s, 'GET', `/api/rooms/${g.code}`)).body.reason).toBe('cancelled');
    expect((await api(s, 'POST', `/api/rooms/${g.code}/join`, { nickname: 'Late' })).status).toBe(410);
    const e = await createGame(s, t);
    await s.db.query("update games set expires_at = now() - interval '1 hour' where id=$1", [e.id]);
    expect((await api(s, 'GET', `/api/rooms/${e.code}`)).body.reason).toBe('expired');
    await s.ctx.games.sweep();
    expect((await s.db.query<any>('select phase from games where id=$1', [e.id])).rows[0].phase).toBe('expired');
    expect((await api(s, 'GET', '/api/rooms/12345')).status).toBe(400);
    expect((await api(s, 'GET', '/api/rooms/000000')).status).toBe(404);
  });

  it('impersonation and unsafe nicknames are refused; duplicate nicknames get a visible suffix', async () => {
    const t = await login(s);
    const g = await createGame(s, t);
    const join = (nickname: string) => api(s, 'POST', `/api/rooms/${g.code}/join`, { nickname });
    expect((await join('Host')).status).toBe(400);
    expect((await join('System')).status).toBe(400);
    expect((await join('<script>alert(1)</script>')).status).toBe(400);
    const a = await join('Amina'); const b = await join('amina');
    expect(a.body.nickname).toBe('Amina'); expect(b.body.nickname).toBe('amina·2');
    expect(a.body.participantToken).not.toBe(b.body.participantToken);
  });

  it('host confirmation email is sent once, includes the audience reminder, and never claims delivery in dev', async () => {
    const t = await register(s, `mailhost${Date.now()}@example.com`, 'Mail Host');
    const before = s.ctx.mailer.outbox.length;
    const g = await createGame(s, t, { title: 'Email game' });
    expect(s.ctx.mailer.outbox.length).toBe(before + 1);
    const mail = s.ctx.mailer.outbox.at(-1)!;
    expect(mail.text).toMatch(/does not start automatically/); expect(mail.text).toContain(g.code);
    const log = await s.db.query<any>("select status from email_log where game_id=$1", [g.id]);
    expect(log.rows[0].status).toBe('logged_dev');                                        // recorded as NOT sent
    const resend = await api(s, 'POST', `/api/games/${g.id}/resend-email`, undefined, { bearer: t });
    expect(resend.status).toBe(200);
  });
});

describe('abuse controls', () => {
  it('rate-limits room code guessing and join floods', async () => {
    const r = await startServer({ RATE_LIMIT_DISABLED: 'false' });
    const codes = await Promise.all(Array.from({ length: 60 }, (_, i) => api(r, 'GET', `/api/rooms/${String(100000 + i)}`)));
    expect(codes.filter((x) => x.status === 429).length).toBeGreaterThan(10);
    expect(codes.find((x) => x.status === 429)!.headers.get('retry-after')).toBeTruthy();
    const login = await Promise.all(Array.from({ length: 14 }, () => api(r, 'POST', '/api/dev-auth/login', { email: 'x@example.com', password: 'wrongwrong' })));
    expect(login.filter((x) => x.status === 429).length).toBeGreaterThan(0);
    expect(login.filter((x) => x.status === 401).length).toBeGreaterThan(0);
    await r.close();
  });
  it('oversized socket payloads drop the connection', async () => {
    const t = await login(s);
    const g = await createGame(s, t);
    const h = await joinBot(s, g.code, 'Cap1', { bearer: t });
    const closed = new Promise<string>((res) => h.socket.once('disconnect', (reason) => res(reason)));
    h.socket.emit('answer', { roundId: 'x'.repeat(20_000), optionId: 'a' });
    expect(await closed).toMatch(/close|error/);
  });
  it('enforces the per-room connection budget (players + spectators + host)', async () => {
    const r = await startServer({ SPECTATOR_BUDGET_PER_ROOM: '1' });
    const t = await login(r);
    const g = await createGame(r, t, { settings: { ...baseSettings, maxPlayers: 2 } });
    const p = await joinBot(r, g.code, 'Budget1', { bearer: t });
    const tabs = [p];
    for (let i = 0; i < 4; i++) tabs.push(await attach(r, g.code, `tab${i}`, p.token, p.id));   // budget = 2 + 1 + 2 = 5
    await expect(attach(r, g.code, 'tab-over', p.token, p.id)).rejects.toThrow(/room_connections_full/);
    tabs.forEach((x) => x.close());
    await r.close();
  });
  it('error responses and config never leak secrets or internals', async () => {
    const cfg = JSON.stringify((await api(s, 'GET', '/api/config')).body);
    expect(cfg).not.toMatch(/secret|password|api[-_]?key|DATABASE_URL|BREVO/i);
    const bad = await api(s, 'GET', '/api/games/not-a-uuid', undefined, { bearer: host });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(/select |pg_|stack|node_modules/i);
    expect((await api(s, 'GET', '/api/nope')).status).toBe(404);
  });
});
