import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RoundResultEvent, ServerEvent } from '@elimquest/contracts';
import { api, attach, correctOptionFor, createGame, joinBot, login, register, sleep, startServer, topicIds, wrongOptionFor, type Bot, type TestServer } from './helpers';

let s: TestServer; let hostTok: string;
beforeAll(async () => { s = await startServer(); hostTok = await login(s); });
afterAll(async () => { await s.close(); });

const settings = (over: Record<string, unknown> = {}) => ({ questionLimit: 10, summitHeight: 8, timeLimitS: 30, maxPlayers: 150, superQuestion: false, gentle: false, ...over });
type Plan = (name: string, roundIdx: number, isSuper: boolean) => 'right' | 'wrong' | 'skip';

/** Drive rounds until the game finishes (or `stopAfter` rounds), collecting opens and results. */
async function drive(bots: Bot[], plan: Plan, stopAfter = 99) {
  const opens: { roundId: string; isSuper: boolean }[] = [];
  const results: RoundResultEvent[] = [];
  const lead = bots[0]!;
  const finished = lead.waitFor('game:finished', 90_000).then(() => null);
  for (let i = 0; i < stopAfter; i++) {
    const open = await Promise.race([lead.waitFor('round:open', 30_000), finished]);
    if (!open) break;
    const q = open.question;
    opens.push({ roundId: q.roundId, isSuper: !!q.isSuper });
    const res = lead.waitFor('round:result', 30_000);
    for (const b of bots) {
      const how = plan(b.name, i, !!q.isSuper);
      if (how === 'skip') continue;
      await b.emit('answer', { roundId: q.roundId, optionId: how === 'right' ? await correctOptionFor(s, q.roundId) : await wrongOptionFor(s, q.roundId) });
    }
    results.push((await res).result);
  }
  return { opens, results, finished };
}

describe('super question', () => {
  it('exactly one super question; announced when it opens; a correct answer climbs two steps; wrong is a normal −1', async () => {
    const g = await createGame(s, hostTok, { settings: settings({ superQuestion: true }) });
    const host = await joinBot(s, g.code, 'Sup1', { bearer: hostTok });
    const a = await joinBot(s, g.code, 'Sup2'); const c = await joinBot(s, g.code, 'Sup3');
    const bots = [host, a, c];
    await host.emit('host', { cmd: 'start' });
    const gq = await s.db.query<any>("select seq from game_questions where game_id=$1 and is_super", [g.id]);
    expect(gq.rowCount).toBe(1);                                                        // exactly one, chosen at start
    expect(gq.rows[0].seq).toBeGreaterThanOrEqual(3); expect(gq.rows[0].seq).toBeLessThanOrEqual(6);

    const { opens, results } = await drive(bots, (name, i) => (name === 'Sup3' ? (i % 2 ? 'wrong' : 'skip') : 'right'));
    expect(opens.filter((o) => o.isSuper)).toHaveLength(1);                             // announced exactly once
    const superIdx = opens.findIndex((o) => o.isSuper);
    const r = results[superIdx]!;
    expect(r.isSuper).toBe(true);
    const mine = r.standings.find((x) => x.id === a.id)!;
    expect(mine.to - mine.from).toBe(2);                                                // +2
    for (let i = 0; i < results.length; i++) if (i !== superIdx) for (const x of results[i]!.standings.filter((x) => x.id === a.id)) expect(x.to - x.from).toBe(1);
    const loser = r.standings.find((x) => x.id === c.id)!;
    expect(loser.to).toBe(Math.max(0, loser.from - 1));                                 // a miss on the super question is still just −1
    bots.forEach((b) => b.close());
  });

  it('the super question is not visible in snapshots before it opens, and is off unless the host enables it', async () => {
    const g = await createGame(s, hostTok, { settings: settings() });
    const host = await joinBot(s, g.code, 'Off1', { bearer: hostTok }); const p = await joinBot(s, g.code, 'Off2');
    await host.emit('host', { cmd: 'start' });
    expect((await s.db.query("select count(*)::int n from game_questions where game_id=$1 and is_super", [g.id])).rows[0].n).toBe(0);
    const open = await p.waitFor('round:open');
    expect(open.question.isSuper).toBeFalsy();
    const snap = (await p.emit<any>('snapshot')).data;
    expect(JSON.stringify(snap.settings)).toContain('"superQuestion":false');
    [host, p].forEach((b) => b.close());
  });

  it('voiding the super question hands the super status to its replacement', async () => {
    const org = await register(s, `supvoid${Date.now()}@example.com`, 'Org');
    const g = await createGame(s, org, { hostMode: 'audience', settings: settings({ superQuestion: true }) });
    const a = await joinBot(s, g.code, 'Vd1'); const b = await joinBot(s, g.code, 'Vd2');
    const hostSock = await attach(s, g.code, 'host', undefined, '', org);
    await hostSock.emit('host', { cmd: 'start' });
    let voided = false;
    for (let i = 0; i < 8 && !voided; i++) {
      const open = await a.waitFor('round:open', 30_000);
      if (open.question.isSuper) {
        const next = a.waitFor('round:open', 30_000);
        expect((await hostSock.emit('host', { cmd: 'void', reason: 'faulty super question' })).ok).toBe(true);
        const replacement = await next;
        expect(replacement.question.isSuper).toBe(true);                                // still exactly one super question
        expect((await s.db.query("select count(*)::int n from game_questions where game_id=$1 and is_super and status<>'voided'", [g.id])).rows[0].n).toBe(1);
        voided = true;
      } else { await a.waitFor('round:result', 30_000); }
    }
    expect(voided).toBe(true);
    [a, b, hostSock].forEach((x) => x.close());
  });
});

describe('gentle mode', () => {
  it('wrong and missed answers never move you down; right answers still climb', async () => {
    const g = await createGame(s, hostTok, { settings: settings({ gentle: true }) });
    const host = await joinBot(s, g.code, 'Gn1', { bearer: hostTok }); const p = await joinBot(s, g.code, 'Gn2');
    await host.emit('host', { cmd: 'start' });
    // Gn2: right, right, wrong, skip, right → 1,2,2,2,3. Gn1 skips all.
    const seq: ('right' | 'wrong' | 'skip')[] = ['right', 'right', 'wrong', 'skip', 'right'];
    const { results } = await drive([host, p], (name, i) => (name === 'Gn2' ? seq[i]! : 'skip'), 5);
    expect(results.map((r) => r.standings.find((x) => x.id === p.id)!.to)).toEqual([1, 2, 2, 2, 3]);
    expect(results.every((r) => r.standings.every((x) => x.to >= x.from))).toBe(true); // nobody ever dropped
    [host, p].forEach((b) => b.close());
  });
});

describe('reveal chart, streak and highlights', () => {
  it('reports option counts that add up, positive-only highlights, and a personal streak', async () => {
    const g = await createGame(s, hostTok, { settings: settings({ summitHeight: 10 }) });
    const host = await joinBot(s, g.code, 'Ch1', { bearer: hostTok });
    const a = await joinBot(s, g.code, 'Ch2'); const b = await joinBot(s, g.code, 'Ch3');
    await host.emit('host', { cmd: 'start' });
    const { results } = await drive([host, a, b], (name, i) => (name === 'Ch1' ? 'right' : name === 'Ch2' ? (i < 2 ? 'right' : 'wrong') : 'skip'), 3);
    const r1 = results[0]!;
    const answered = Object.values(r1.optionCounts).reduce((t, n) => t + n, 0);
    expect(answered + r1.unansweredCount).toBe(r1.playerTotal);                         // counts add up
    expect(r1.playerTotal).toBe(3); expect(r1.unansweredCount).toBe(1);
    expect(r1.optionCounts[r1.correctOptionId]).toBe(2);
    expect(r1.highlights.climbBy).toBe(1); expect(r1.highlights.topClimbers.sort()).toEqual([host.id, a.id].sort());
    expect(JSON.stringify(r1.highlights)).not.toMatch(/worst|lowest/i);
    // Streak: Ch1 is right three rounds in a row; Ch2 broke theirs in round 3.
    expect((await host.emit<any>('snapshot')).data.myStreak).toBe(3);
    expect((await a.emit<any>('snapshot')).data.myStreak).toBe(0);
    [host, a, b].forEach((x) => x.close());
  });
});

describe('sticker reactions', () => {
  it('fixed icon set, between rounds only, rate-limited, broadcast in batches; free text and "clap" are refused', async () => {
    const g = await createGame(s, hostTok, { settings: settings() });
    const host = await joinBot(s, g.code, 'Rx1', { bearer: hostTok }); const p = await joinBot(s, g.code, 'Rx2');
    const seen: any[] = [];
    p.socket.on('reactions', (e) => seen.push(...e.items));
    const lobbyOk = await host.emit('react', { kind: 'star' });
    expect(lobbyOk.ok).toBe(true);                                                      // lobby counts as "between rounds"
    await sleep(600);
    expect(seen).toEqual([{ id: host.id, kind: 'star' }]);
    expect((await host.emit('react', { kind: 'lantern' })).code).toBe('rate_limited');  // 1 per 1.5 s
    expect((await host.emit('react', { kind: 'clap' })).code).toBe('invalid');
    expect((await host.emit('react', { kind: 'hello everyone' })).code).toBe('invalid');
    await host.emit('host', { cmd: 'start' });
    await p.waitFor('round:open');
    await sleep(1600);
    expect((await p.emit('react', { kind: 'heart' })).code).toBe('bad_phase');          // not while a question is open
    await p.waitFor('round:result');
    await sleep(100);
    expect((await p.emit('react', { kind: 'bolt' })).ok).toBe(true);                    // fine during the reveal
    [host, p].forEach((x) => x.close());
  });
});

describe('solo practice house rules', () => {
  it('quick climb with super + gentle: one super question, +2 on it, nothing ever drops', async () => {
    const created = await api(s, 'POST', '/api/practice', { categoryIds: await topicIds(s), questionLimit: 10, summitHeight: 9, timeLimitS: 30, superQuestion: true, gentle: true });
    expect(created.status).toBe(201);
    const { id, token } = created.body;
    const row = await s.db.query<any>('select queue from practice_sessions where id=$1', [id]);
    expect(row.rows[0].queue.filter((x: any) => x.isSuper)).toHaveLength(1);
    let pos = 0; let sawSuper = 0;
    for (let i = 0; i < 6; i++) {
      const st = (await api(s, 'POST', `/api/practice/${id}/next`, undefined, { guest: token })).body;
      const snap = (await s.db.query<any>('select queue, round_no from practice_sessions where id=$1', [id])).rows[0];
      const item = snap.queue[snap.round_no];
      const wrong = i % 3 === 2;
      if (st.question.isSuper) sawSuper++;
      expect(!!st.question.isSuper).toBe(!!item.isSuper);
      const r = (await api(s, 'POST', `/api/practice/${id}/answer`, { optionId: wrong ? (item.snapshot.correctOptionId === 'a' ? 'b' : 'a') : item.snapshot.correctOptionId }, { guest: token })).body;
      expect(r.to).toBe(wrong ? pos : pos + (item.isSuper ? 2 : 1));                   // gentle: no drop; super: +2
      pos = r.to;
    }
    expect(sawSuper).toBeLessThanOrEqual(1);
  });
});

describe('custom time per question', () => {
  const make = (timeLimitS: number) => createGame(s, hostTok, { settings: settings({ timeLimitS }) }).then((g) => g, (e) => e as Error);
  it('a host can set any time from 5 s, and the round uses exactly that window', async () => {
    const g = await createGame(s, hostTok, { settings: settings({ timeLimitS: 5 }) });
    const host = await joinBot(s, g.code, 'Tm1', { bearer: hostTok }); const p = await joinBot(s, g.code, 'Tm2');
    await host.emit('host', { cmd: 'start' });
    const open = await p.waitFor('round:open');
    expect(open.question.deadline - open.question.openedAt).toBe(Math.round(5 * 1000 * 0.05));   // 5 s × test TIMING_SCALE
    [host, p].forEach((b) => b.close());
  });
  it('rejects under 5 s or over 120 s', async () => {
    for (const t of [4, 121]) {
      const res = await api(s, 'POST', '/api/games', { title: 'x', hostMode: 'competing', categoryIds: await topicIds(s), minLevel: 1, maxLevel: 10, settings: settings({ timeLimitS: t }), openNow: true }, { bearer: hostTok });
      expect(res.status).toBe(400);
    }
    void make;
  });
  it('solo practice takes the same custom range', async () => {
    const ok = await api(s, 'POST', '/api/practice', { categoryIds: await topicIds(s), questionLimit: 10, summitHeight: 5, timeLimitS: 7 });
    expect(ok.status).toBe(201); expect(ok.body.settings.timeLimitS).toBe(7);
    expect((await api(s, 'POST', '/api/practice', { categoryIds: await topicIds(s), questionLimit: 10, summitHeight: 5, timeLimitS: 3 })).status).toBe(400);
  });
});

describe('room chat', () => {
  it('works in the lobby, stays shut during questions by default, refuses links/abuse, rate-limits, and the host can mute, delete and switch it off', async () => {
    const g = await createGame(s, hostTok, { settings: settings() });
    const host = await joinBot(s, g.code, 'Ch1', { bearer: hostTok }); const p = await joinBot(s, g.code, 'Ch2');
    const spec = await joinBot(s, g.code, 'Watcher', { spectator: true });
    const seen: any[] = []; p.socket.on('chat', (m) => seen.push(m));
    expect((await p.emit<any>('chat:send', { text: '  Good luck   everyone!  ' })).ok).toBe(true);
    await sleep(100);
    expect(seen).toMatchObject([{ nick: 'Ch2', text: 'Good luck everyone!' }]);
    expect(seen[0].host).toBeUndefined();
    expect((await host.emit<any>('chat:sync')).data.messages).toHaveLength(1);       // late arrivals get the history
    await sleep(700);
    expect((await p.emit('chat:send', { text: 'see http://evil.example' })).code).toBe('chat_refused');
    expect((await p.emit('chat:send', { text: 'mail me a@b.com' })).code).toBe('chat_refused');
    expect((await p.emit('chat:send', { text: '' })).code).toBe('invalid');
    expect((await spec.emit('chat:send', { text: 'hello' })).code).toBe('forbidden'); // spectators read only
    expect((await spec.emit<any>('chat:sync')).data.messages).toHaveLength(1);
    // rate limit: a burst is refused
    await sleep(700);
    const burst = [];
    for (let i = 0; i < 5; i++) burst.push((await p.emit('chat:send', { text: `msg ${i}` })).code ?? 'ok');
    expect(burst).toContain('rate_limited');
    // host: delete a message, mute a player
    await sleep(700);
    const msgs = (await host.emit<any>('chat:sync')).data.messages;
    expect((await p.emit('host', { cmd: 'chatDelete', id: msgs[0].id })).code).toBe('forbidden');   // players cannot moderate
    expect((await host.emit('host', { cmd: 'chatDelete', id: msgs[0].id })).ok).toBe(true);
    expect((await host.emit<any>('chat:sync')).data.messages.find((m: any) => m.id === msgs[0].id)).toBeUndefined();
    expect((await host.emit('host', { cmd: 'chatMute', participantId: p.id, muted: true })).ok).toBe(true);
    expect((await p.emit('chat:send', { text: 'am I muted?' })).code).toBe('muted');
    expect((await p.emit<any>('chat:sync')).data.muted).toBe(true);
    expect((await host.emit('host', { cmd: 'chatMute', participantId: p.id, muted: false })).ok).toBe(true);
    // during a question the default mode is closed; "always" opens it; "off" closes everything
    await host.emit('host', { cmd: 'start' });
    await p.waitFor('round:open');
    await sleep(700);
    expect((await p.emit('chat:send', { text: 'no sharing answers' })).code).toBe('bad_phase');
    expect((await host.emit('host', { cmd: 'chatMode', mode: 'always' })).ok).toBe(true);
    expect((await p.emit('chat:send', { text: 'open now' })).ok).toBe(true);
    expect((await host.emit('host', { cmd: 'chatMode', mode: 'off' })).ok).toBe(true);
    await sleep(700);
    expect((await p.emit('chat:send', { text: 'still there?' })).code).toBe('chat_off');
    expect((await host.emit('host', { cmd: 'chatMode', mode: 'loud' })).code).toBe('invalid');
    [host, p, spec].forEach((x) => x.close());
  });
});
