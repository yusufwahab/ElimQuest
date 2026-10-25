/**
 * Socket.IO-aware load harness (real clients, real protocol). Usage:
 *   npx tsx tests/load/run.ts <players> [rounds=10] [timeScale=0.2] [spectators=0]
 * Starts the server IN-PROCESS (so CPU / memory / event-loop delay can be sampled) on PGlite (single-connection WASM
 * Postgres: NOT representative of Supabase). Clients and server share this machine, which is pessimistic for the server.
 * Every bot answers inside the final ~400 ms of the window (deadline burst) to stress the acceptance boundary.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp } from '../../apps/server/src/app';

const N = Number(process.argv[2] ?? 20);
const ROUNDS = Number(process.argv[3] ?? 10);
const SCALE = Number(process.argv[4] ?? 0.2);
const SPEC = Number(process.argv[5] ?? 0);
const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]! : NaN);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const app = await createApp({
  NODE_ENV: 'test', DB_DRIVER: 'pglite', AUTH_MODE: 'dev', EMAIL_MODE: 'log', RATE_LIMIT_DISABLED: 'true', ALLOW_FIXTURE_QUESTIONS: 'true',
  TIMING_SCALE: String(SCALE), ANSWER_GRACE_MS: '750', MAX_ACTIVE_ROOMS: '50', MAX_OPEN_ROOMS_PER_HOST: '50', SPECTATOR_BUDGET_PER_ROOM: '30', LOG_LEVEL: 'error',
});
const port = await app.listen(0);
const base = `http://127.0.0.1:${port}`;
const j = async (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => {
  const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, b: (await r.json().catch(() => ({}))) as any };
};

const reg = await j('POST', '/api/dev-auth/register', { email: `load${Date.now()}@x.com`, password: 'password123', displayName: 'Load' });
const auth = { authorization: `Bearer ${reg.b.token}` };
const topics = (await j('GET', '/api/topics')).b.topics.map((t: any) => t.id);
const questionLimit = ROUNDS <= 10 ? 10 : ROUNDS <= 20 ? 20 : 30;
const g = (await j('POST', '/api/games', {
  title: 'load', hostMode: 'audience', categoryIds: topics, minLevel: 1, maxLevel: 10, allowHistoryReuse: true,
  settings: { questionLimit, summitHeight: questionLimit, timeLimitS: 30, maxPlayers: Math.max(2, N) }, openNow: true,
}, auth)).b;
if (!g.code) throw new Error('create failed ' + JSON.stringify(g));

const avatar = { body: 'teal', eyes: 'round', glasses: 'none', headwear: 'none', gear: 'none' };
const t0 = Date.now();
const joins = await Promise.all(Array.from({ length: N }, (_, i) => j('POST', `/api/rooms/${g.code}/join`, { nickname: `Bot${i}`, avatar })));
const joinMs = Date.now() - t0;
const ok = joins.filter((x) => x.s === 201);
console.log(`joined ${ok.length}/${N} in ${joinMs} ms (simultaneous HTTP joins)`);

const ackMs: number[] = [];
const resultLag: number[] = [];
let disconnects = 0, rejected = 0, accepted = 0;
const sockets: Socket[] = [];
const deadlines = new Map<string, number>();
const eld = monitorEventLoopDelay({ resolution: 10 });
eld.enable();
const cpu0 = process.cpuUsage();
let peakRss = 0;
const mem = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 200);

const mk = (a: Record<string, unknown>) => new Promise<Socket>((res, rej) => {
  const s = connect(base, { auth: { code: g.code, ...a }, transports: ['websocket'], reconnection: false, forceNew: true });
  s.once('connect', () => res(s));
  s.once('connect_error', rej);
  s.on('disconnect', () => { disconnects++; });
  sockets.push(s);
});
const bots = await Promise.all(ok.map((x) => mk({ token: x.b.participantToken })));
const hostSock = await mk({ accessToken: reg.b.token });
const specs: Socket[] = [];
for (let i = 0; i < SPEC; i++) {
  const r = await j('POST', `/api/rooms/${g.code}/join`, { nickname: `Spec${i}`, avatar, spectator: true });
  if (r.s === 201) specs.push(await mk({ token: r.b.participantToken }));
}
console.log(`${bots.length} player sockets + ${specs.length} spectators + 1 host connected`);

let finished = false;
const done = new Promise<void>((res) => {
  for (const s of bots) {
    s.on('ev', (ev: any) => {
      if (ev.t === 'round:open') {
        deadlines.set(ev.question.roundId, ev.question.deadline);
        const wait = Math.max(0, ev.question.deadline - Date.now() - 400 + Math.random() * 350);
        setTimeout(() => {
          const t = Date.now();
          s.emit('answer', { roundId: ev.question.roundId, optionId: 'a' }, (a: any) => { ackMs.push(Date.now() - t); if (a?.ok) accepted++; else rejected++; });
        }, wait);
      }
      if (ev.t === 'round:result' && s === bots[0]) resultLag.push(Date.now() - deadlines.get(ev.result.roundId)!);
      if (ev.t === 'game:finished' && s === bots[0]) { finished = true; res(); }
    });
  }
});
const startAck = await new Promise<any>((r) => hostSock.emit('host', { cmd: 'start' }, r));
if (!startAck.ok) throw new Error('start failed: ' + JSON.stringify(startAck));
// Stop the game after the requested number of rounds.
const stopper = (async () => {
  while (!finished) {
    await sleep(300);
    if (resultLag.length >= ROUNDS) { await new Promise((r) => hostSock.emit('host', { cmd: 'end' }, r)); return; }
  }
})();
await Promise.race([Promise.all([done, stopper]), sleep(10 * 60_000)]);
const cpu = process.cpuUsage(cpu0);
clearInterval(mem);
eld.disable();

const q = async (sql: string, p: unknown[] = []) => (await app.db.query<any>(sql, p)).rows[0].n as number;
const dupes = await q('select count(*)::int n from (select round_id, participant_id from answers group by 1,2 having count(*)>1) x');
const scored = await q("select count(*)::int n from rounds where game_id=$1 and status='scored'", [g.id]);
const outcomes = await q("select count(*)::int n from round_outcomes o join rounds r on r.id=o.round_id where r.game_id=$1 and r.status='scored'", [g.id]);
const persisted = await q("select count(*)::int n from answers a join rounds r on r.id=a.round_id where r.game_id=$1 and r.status='scored'", [g.id]);
const missing = scored * ok.length - outcomes;

const out = {
  players: ok.length, spectators: specs.length, roundsScored: scored, finished, windowMs: Math.round(30_000 * SCALE),
  ackLatencyMs: { n: ackMs.length, p50: pct(ackMs, 50), p95: pct(ackMs, 95), p99: pct(ackMs, 99), max: Math.max(...ackMs) },
  resultAfterDeadlineMs: { p50: pct(resultLag, 50), p95: pct(resultLag, 95), max: Math.max(...resultLag), note: 'deadline → round:result received (includes the 750 ms answer grace)' },
  answers: { accepted, rejected, persistedInScoredRounds: persisted, duplicatesInDb: dupes },
  scoring: { expectedOutcomeRows: scored * ok.length, actualOutcomeRows: outcomes, missing },
  unexpectedDisconnects: disconnects,
  serverProcess: { cpuSeconds: +((cpu.user + cpu.system) / 1e6).toFixed(1), peakRssMB: Math.round(peakRss / 1048576), eventLoopDelayMs: { mean: +(eld.mean / 1e6).toFixed(1), p99: +(eld.percentile(99) / 1e6).toFixed(1), max: +(eld.max / 1e6).toFixed(1) } },
  caveat: 'In-process, PGlite (not Supabase), clients and server on one machine, no network latency. Not a capacity proof.',
};
console.log(JSON.stringify(out, null, 2));
sockets.forEach((s) => s.close());
await app.close();
process.exit(dupes === 0 && missing === 0 ? 0 : 1);
