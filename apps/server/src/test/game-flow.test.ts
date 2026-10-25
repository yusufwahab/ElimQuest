import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RoundResultEvent } from '@elimquest/contracts';
import { api, attach, baseSettings, correctOptionFor, createGame, joinBot, login, register, sleep, startServer, topicIds, wrongOptionFor, type Bot, type TestServer } from './helpers';

let s: TestServer;
let hostToken: string;
beforeAll(async () => { s = await startServer(); hostToken = await login(s); });
afterAll(async () => { await s.close(); });

/** Drive one round: `plan` maps bot name → 'right' | 'wrong' | 'skip'. Returns the round result. */
async function playRound(bots: Bot[], plan: Record<string, 'right' | 'wrong' | 'skip'>): Promise<RoundResultEvent> {
  const open = await bots[0]!.waitFor('round:open');
  const resultP = bots[0]!.waitFor('round:result');
  for (const b of bots) {
    const how = plan[b.name] ?? 'skip';
    if (how === 'skip') continue;
    const opt = how === 'right' ? await correctOptionFor(s, open.question.roundId) : await wrongOptionFor(s, open.question.roundId);
    const ack = await b.emit('answer', { roundId: open.question.roundId, optionId: opt });
    expect(ack.ok).toBe(true);
  }
  return (await resultP).result;
}

describe('competing game end-to-end', () => {
  it('guest join → host start → same question to all → scoring → joint winners at the summit', async () => {
    const g = await createGame(s, hostToken);
    const preview = await api(s, 'GET', `/api/rooms/${g.code}`);
    expect(preview.status).toBe(200);
    expect(preview.body.canJoin).toBe(true);
    expect(JSON.stringify(preview.body)).not.toMatch(/correctOptionId|isCorrect/);

    const host = await joinBot(s, g.code, 'Hostplayer', { bearer: hostToken });
    const amina = await joinBot(s, g.code, 'Amina');
    const musa = await joinBot(s, g.code, 'Musa');
    const bots = [host, amina, musa];

    // Only the host can start; a guest cannot.
    expect((await amina.emit('host', { cmd: 'start' })).ok).toBe(false);
    const sameOpen = Promise.all(bots.map((b) => b.waitFor('round:open')));
    expect((await host.emit('host', { cmd: 'start' })).ok).toBe(true);
    const opens = await sameOpen;
    // Everyone receives the identical question and deadline; no answer key is shipped.
    expect(new Set(opens.map((o) => o.question.roundId)).size).toBe(1);
    expect(new Set(opens.map((o) => o.question.deadline)).size).toBe(1);
    expect(JSON.stringify(opens[0])).not.toMatch(/correct|isCorrect|explanation/i);

    // Round 1: host right, Amina wrong, Musa skips.
    const resultP = host.waitFor('round:result');
    const r1id = opens[0]!.question.roundId;
    await host.emit('answer', { roundId: r1id, optionId: await correctOptionFor(s, r1id) });
    await amina.emit('answer', { roundId: r1id, optionId: await wrongOptionFor(s, r1id) });
    const r1 = (await resultP).result;
    const by = (id: string) => r1.standings.find((x) => x.id === id)!;
    expect(by(host.id)).toMatchObject({ outcome: 'correct', from: 0, to: 1 });
    expect(by(amina.id)).toMatchObject({ outcome: 'wrong', from: 0, to: 0 }); // floor at zero
    expect(by(musa.id)).toMatchObject({ outcome: 'unanswered', from: 0, to: 0 });
    expect(r1.explanation.length).toBeGreaterThan(0);

    // Rounds 2 and 3: host and Amina both answer right → both reach step 3 in the same round → joint winners.
    // (Amina is at 0; she needs 3 rights, host needs 2 more. Keep host answering right, Amina right.)
    const finishedP = host.waitFor('game:finished', 60_000);
    let guard = 0;
    while (!host.events.some((e) => e.t === 'game:finished') && guard++ < 8) {
      const res = await Promise.race([playRound(bots, { Hostplayer: 'right', Amina: 'right', Musa: 'right' }), finishedP.then(() => null)]);
      if (!res) break;
    }
    const fin = (await finishedP).finished;
    expect(fin.reason).toBe('summit');
    // Host, Amina, Musa all answer right every round after round 1 → Hostplayer reaches 3 on round 3,
    // Amina and Musa on round 4 only if the game continued; with a summit at 3 only the host wins.
    expect(fin.winners).toContain(host.id);
    const top = fin.standings.filter((x) => x.rank === 1);
    expect(top.length).toBe(fin.winners.length);
    expect(fin.standings.every((x) => x.position <= fin.summitHeight)).toBe(true);
    bots.forEach((b) => b.close());
  });

  it('joint winners: everyone who reaches the summit in the same round wins together', async () => {
    const g = await createGame(s, hostToken, { title: 'Joint' });
    const host = await joinBot(s, g.code, 'Hostp', { bearer: hostToken });
    const a = await joinBot(s, g.code, 'Aya');
    const b = await joinBot(s, g.code, 'Bilal');
    const c = await joinBot(s, g.code, 'Cara');
    const bots = [host, a, b, c];
    await host.emit('host', { cmd: 'start' });
    const finishedP = host.waitFor('game:finished', 60_000);
    // Hostp/Aya/Bilal always right; Cara always wrong. All three leaders hit step 3 in round 3 simultaneously.
    for (let i = 0; i < 3; i++) await playRound(bots, { Hostp: 'right', Aya: 'right', Bilal: 'right', Cara: 'wrong' });
    const fin = (await finishedP).finished;
    expect(fin.winners.sort()).toEqual([host.id, a.id, b.id].sort());
    expect(fin.standings.find((x) => x.id === c.id)!.isWinner).toBe(false);
    expect(fin.standings.filter((x) => x.rank === 1)).toHaveLength(3);
    expect(fin.validRounds).toBe(3);
    bots.forEach((x) => x.close());
  });

  it('rejects duplicate/conflicting/late/stale answers and is idempotent on retry', async () => {
    const g = await createGame(s, hostToken);
    const host = await joinBot(s, g.code, 'Hh2', { bearer: hostToken });
    const p = await joinBot(s, g.code, 'Player2');
    await host.emit('host', { cmd: 'start' });
    const open = await p.waitFor('round:open');
    const rid = open.question.roundId;
    const right = await correctOptionFor(s, rid);
    const wrong = await wrongOptionFor(s, rid);
    expect((await p.emit('answer', { roundId: rid, optionId: wrong })).ok).toBe(true);
    const retry = await p.emit<any>('answer', { roundId: rid, optionId: wrong });
    expect(retry.ok).toBe(true); expect(retry.data.duplicate).toBe(true);           // lost-ack retry → same ack
    const conflict = await p.emit('answer', { roundId: rid, optionId: right });
    expect(conflict.ok).toBe(false); expect(conflict.code).toBe('already_answered');   // second different answer locked out
    const stale = await p.emit('answer', { roundId: '00000000-0000-4000-8000-000000000000', optionId: 'a' });
    expect(stale.ok).toBe(false); expect(stale.code).toBe('stale_round');
    const dbCount = await s.db.query('select count(*)::int n from answers where round_id=$1 and participant_id=$2', [rid, p.id]);
    expect(dbCount.rows[0].n).toBe(1);                                                // unique (round, participant)
    await p.waitFor('round:result');
    const late = await p.emit('answer', { roundId: rid, optionId: right });
    expect(late.ok).toBe(false);                                                      // no submissions after reveal
    await host.emit('host', { cmd: 'end' });                                          // competing host cannot end
    host.close(); p.close();
  });

  it('enforces the room cap atomically under a simultaneous join burst', async () => {
    const g = await createGame(s, hostToken, { settings: { ...baseSettings, maxPlayers: 5 } });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => api(s, 'POST', `/api/rooms/${g.code}/join`, { nickname: `Racer${i}`, avatar: { body: 'teal', eyes: 'round', glasses: 'none', headwear: 'none', gear: 'none' } })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409 && r.body.code === 'full')).toHaveLength(7);
    const preview = await api(s, 'GET', `/api/rooms/${g.code}`);
    expect(preview.body.canJoin).toBe(false); expect(preview.body.reason).toBe('full');
  });

  it('one identity across tabs and reconnects: no duplicate players, no second answer', async () => {
    const g = await createGame(s, hostToken);
    const host = await joinBot(s, g.code, 'Hh', { bearer: hostToken });
    const p = await joinBot(s, g.code, 'Rejoiner');
    const again = await api(s, 'POST', `/api/rooms/${g.code}/join`, { nickname: 'Whatever', avatar: {}, resumeToken: p.token });
    expect(again.status).toBe(200);
    expect(again.body.participantId).toBe(p.id); expect(again.body.resumed).toBe(true);
    const tab2 = await attach(s, g.code, 'Rejoiner-tab2', p.token, p.id);
    await host.emit('host', { cmd: 'start' });
    const open = await p.waitFor('round:open');
    await tab2.waitFor('round:open');
    const rid = open.question.roundId;
    expect((await p.emit('answer', { roundId: rid, optionId: 'a' })).ok).toBe(true);
    const second = await tab2.emit('answer', { roundId: rid, optionId: 'b' });
    expect(second.ok).toBe(false);
    // Reconnect mid-round: a fresh socket gets the snapshot including the accepted (locked) choice.
    p.close();
    const back = await attach(s, g.code, 'Rejoiner', p.token, p.id);
    const snap = (await back.emit<any>('snapshot')).data;
    expect(snap.phase).toBe('question_open');
    expect(snap.myChoice).toBe('a');
    expect(snap.players.filter((x: any) => x.id === p.id)).toHaveLength(1);
    expect(JSON.stringify(snap)).not.toMatch(/correctOptionId/);                       // no answer key before reveal
    [host, tab2, back].forEach((x) => x.close());
  });

  it('needs at least two competitors; unauthenticated sockets and unknown tokens are refused', async () => {
    const g = await createGame(s, hostToken);
    const host = await joinBot(s, g.code, 'Solo', { bearer: hostToken });
    const ack = await host.emit('host', { cmd: 'start' });
    expect(ack.ok).toBe(false); expect(ack.code).toBe('need_players');
    await expect(attach(s, g.code, 'x', 'nonexistent-token-nonexistent-token', 'x')).rejects.toThrow();
    host.close();
  });

  it('late arrivals become read-only spectators and cannot answer', async () => {
    const g = await createGame(s, hostToken);
    const host = await joinBot(s, g.code, 'Hostx', { bearer: hostToken });
    const a = await joinBot(s, g.code, 'Ana');
    await host.emit('host', { cmd: 'start' });
    const pre = await api(s, 'GET', `/api/rooms/${g.code}`);
    expect(pre.body.canJoin).toBe(false); expect(pre.body.canSpectate).toBe(true);
    const spec = await joinBot(s, g.code, 'Late', { spectator: true });
    const open = await spec.waitFor('round:open');
    const ack = await spec.emit('answer', { roundId: open.question.roundId, optionId: 'a' });
    expect(ack.ok).toBe(false); expect(ack.code).toBe('forbidden');
    const snap = (await spec.emit<any>('snapshot')).data;
    expect(snap.you.role).toBe('spectator');
    [host, a, spec].forEach((x) => x.close());
  });
});

describe('audience host', () => {
  it('does not compete, can preview, control, void with reversal and replacement, and end early', async () => {
    const org = await register(s, `org${Date.now()}@example.com`, 'Organiser');
    const g = await createGame(s, org, { hostMode: 'audience', title: 'Class quiz' });
    const asPlayer = await api(s, 'POST', `/api/rooms/${g.code}/join`, { nickname: 'Orgplayer', avatar: {} }, { bearer: org });
    expect(asPlayer.status).toBe(403);

    const a = await joinBot(s, g.code, 'Zaid');
    const b = await joinBot(s, g.code, 'Yara');
    // Host socket: no participant token, only account.
    const hostSock = await attach(s, g.code, 'host', undefined, '', org);
    const hostSnap = (await hostSock.emit<any>('snapshot')).data;
    expect(hostSnap.you.canControl).toBe(true);
    expect(hostSnap.players).toHaveLength(2);                                          // host does not occupy a slot

    const previewOk = await api(s, 'GET', `/api/games/${g.id}/preview`, undefined, { bearer: org });
    expect(previewOk.status).toBe(200);

    await hostSock.emit('host', { cmd: 'start' });
    // Round 1: both answer right → scored; then host voids during reveal → positions revert, replacement opens.
    const r1 = await playRound([a, b], { Zaid: 'right', Yara: 'right' });
    expect(r1.standings.every((x) => x.to === 1)).toBe(true);
    const voided = a.waitFor('round:voided');
    const reopened = a.waitFor('round:open', 20_000);
    expect((await hostSock.emit('host', { cmd: 'void', reason: 'Question was faulty' })).ok).toBe(true);
    await voided;
    const open2 = await reopened;
    expect(open2.question.roundNo).toBe(1);                                           // voided round does not count
    const pos = await s.db.query('select position from participants where game_id=$1 and not is_spectator', [g.id]);
    expect(pos.rows.every((r: any) => r.position === 0)).toBe(true);
    const aud = await s.db.query("select action from audit_events where game_id=$1 and action='host.void_question'", [g.id]);
    expect(aud.rowCount).toBe(1);

    // Pause between rounds, then end with confirmation → "ended early".
    expect((await hostSock.emit('host', { cmd: 'pause' })).ok).toBe(true);
    const done = a.waitFor('game:finished', 30_000);
    expect((await hostSock.emit('host', { cmd: 'end' })).ok).toBe(true);
    const fin = (await done).finished;
    expect(fin.reason).toBe('ended_early');
    const csv = await api(s, 'GET', `/api/games/${g.id}/results.csv`, undefined, { bearer: org });
    expect(csv.status).toBe(200); expect(String(csv.body)).toContain('Rank,Nickname');
    [a, b, hostSock].forEach((x) => x.close());
  });

  it('competing host cannot preview questions or run audience controls', async () => {
    const g = await createGame(s, hostToken);
    expect((await api(s, 'GET', `/api/games/${g.id}/preview`, undefined, { bearer: hostToken })).status).toBe(403);
    const host = await joinBot(s, g.code, 'Compete', { bearer: hostToken });
    const other = await joinBot(s, g.code, 'Other');
    await host.emit('host', { cmd: 'start' });
    await host.waitFor('round:open');
    for (const cmd of ['pause', 'end', 'next'] as const) expect((await host.emit('host', { cmd })).code).toBe('forbidden');
    expect((await host.emit('host', { cmd: 'void', reason: 'trying to cheat' })).code).toBe('forbidden');
    expect((await host.emit('host', { cmd: 'kick', participantId: other.id })).code).toBe('forbidden');
    [host, other].forEach((x) => x.close());
  });
});
