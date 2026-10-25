import { describe, expect, it } from 'vitest';
import { api, attach, correctOptionFor, createGame, joinBot, login, openTestDb, startServer, wrongOptionFor } from './helpers';

describe('crash recovery (second server instance on the same database)', () => {
  it('open round: recovery pause → host resumes → fresh full window, accepted answers kept, scored exactly once', async () => {
    const db = await openTestDb();
    const s1 = await startServer({ TIMING_SCALE: '0.2' }, db);                        // 6 s window so the crash lands mid-round
    const hostTok = await login(s1);
    const g = await createGame(s1, hostTok);
    const h = await joinBot(s1, g.code, 'Rhost', { bearer: hostTok });
    const p = await joinBot(s1, g.code, 'Rplayer');
    await h.emit('host', { cmd: 'start' });
    const open = await p.waitFor('round:open');
    const rid = open.question.roundId;
    expect((await p.emit('answer', { roundId: rid, optionId: await correctOptionFor(s1, rid) })).ok).toBe(true);
    const originalDeadline = open.question.deadline;
    h.close(); p.close();
    await s1.close();                                                                  // the "crash"

    const s2 = await startServer({ TIMING_SCALE: '0.2' }, db);
    const row = await db.query<any>('select phase, recovery from games where id=$1', [g.id]);
    expect(row.rows[0]).toMatchObject({ phase: 'recovery_pause', recovery: true });    // visible recovery pause, nothing auto-scored
    expect((await db.query('select count(*)::int n from round_outcomes')).rows[0].n).toBe(0);

    const p2 = await attach(s2, g.code, 'Rplayer', p.token, p.id);
    const h2 = await attach(s2, g.code, 'Rhost', h.token, h.id, hostTok);
    const snap = (await p2.emit<any>('snapshot')).data;
    expect(snap.phase).toBe('recovery_pause'); expect(snap.recovery).toBe(true);

    expect((await p2.emit('host', { cmd: 'resume' })).ok).toBe(false);                 // a guest cannot resume
    const reopened = p2.waitFor('round:open');
    expect((await h2.emit('host', { cmd: 'resume' })).ok).toBe(true);
    const again = await reopened;
    expect(again.question.roundId).toBe(rid);                                           // same round, not a skipped one
    expect(again.question.deadline).toBeGreaterThan(originalDeadline);                  // fair full window
    const locked = await p2.emit('answer', { roundId: rid, optionId: await wrongOptionFor(s2, rid) });
    expect(locked.code).toBe('already_answered');                                       // retained answer stays locked

    const res = await p2.waitFor('round:result', 30_000);
    const mine = res.result.standings.find((x) => x.id === p.id)!;
    expect(mine).toMatchObject({ outcome: 'correct', from: 0, to: 1 });
    const outs = await db.query('select count(*)::int n from round_outcomes where round_id=$1', [rid]);
    expect(outs.rows[0].n).toBe(2);                                                     // exactly one outcome per player
    const pos = await db.query<any>('select position from participants where id=$1', [p.id]);
    expect(pos.rows[0].position).toBe(1);                                               // no double movement
    [p2, h2].forEach((x) => x.close());
    await s2.close(); await db.close();
  });

  it('crash between close and scoring: resume scores the closed round once', async () => {
    const db = await openTestDb();
    const s1 = await startServer({ TIMING_SCALE: '0.2' }, db);
    const t = await login(s1);
    const g = await createGame(s1, t);
    const h = await joinBot(s1, g.code, 'Ch', { bearer: t });
    const p = await joinBot(s1, g.code, 'Cp');
    await h.emit('host', { cmd: 'start' });
    const open = await p.waitFor('round:open');
    const rid = open.question.roundId;
    await p.emit('answer', { roundId: rid, optionId: await correctOptionFor(s1, rid) });
    await db.query("update rounds set status='closed' where id=$1", [rid]);            // closed but never scored
    h.close(); p.close(); await s1.close();

    const s2 = await startServer({ TIMING_SCALE: '0.2' }, db);
    const h2 = await attach(s2, g.code, 'Ch', h.token, h.id, t);
    const res = h2.waitFor('round:result', 30_000);
    await h2.emit('host', { cmd: 'resume' });
    const out = (await res).result;
    expect(out.standings.find((x) => x.id === p.id)).toMatchObject({ outcome: 'correct', to: 1 });
    expect((await db.query('select count(*)::int n from round_outcomes where round_id=$1', [rid])).rows[0].n).toBe(2);
    h2.close(); await s2.close(); await db.close();
  });

  it('readyz reports database health', async () => {
    const s = await startServer();
    expect((await api(s, 'GET', '/readyz')).status).toBe(200);
    await s.close();
  });
});
