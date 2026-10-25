import { io as connect, type Socket } from 'socket.io-client';
import { createApp, type AppHandle } from '../app';
import type { Db } from '../db/db';
import type { RoomSnapshot, ServerEvent } from '@elimquest/contracts';

export interface TestServer extends AppHandle { base: string; port: number }

/** Fast timing: question window = 30 s × scale. Uses an in-memory PGlite database. */
export async function startServer(env: Record<string, string> = {}, db?: Db): Promise<TestServer> {
  const app = await createApp({
    NODE_ENV: 'test', DB_DRIVER: 'pglite', AUTH_MODE: 'dev', EMAIL_MODE: 'log', RATE_LIMIT_DISABLED: 'true', ALLOW_FIXTURE_QUESTIONS: 'true',
    MAX_ACTIVE_ROOMS: '500', MAX_OPEN_ROOMS_PER_HOST: '500', TIMING_SCALE: '0.05', ANSWER_GRACE_MS: '150', LOG_LEVEL: 'error', ...env,
  }, db);
  const port = await app.listen(0);
  return Object.assign(app, { base: `http://127.0.0.1:${port}`, port });
}

export async function api<T = any>(s: TestServer, method: string, path: string, body?: unknown, h: { bearer?: string; guest?: string; raw?: Buffer; filename?: string } = {}): Promise<{ status: number; body: T; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (h.bearer) headers.authorization = `Bearer ${h.bearer}`;
  if (h.guest) headers['x-guest-token'] = h.guest;
  let payload: any;
  if (h.raw) { payload = h.raw; headers['content-type'] = 'application/octet-stream'; if (h.filename) headers['x-filename'] = h.filename; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  const res = await fetch(`${s.base}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body: parsed, headers: res.headers };
}

export const login = async (s: TestServer, email = 'host@dev.local', password = 'devpassword1') => (await api(s, 'POST', '/api/dev-auth/login', { email, password })).body.token as string;
export const register = async (s: TestServer, email: string, name = 'Tester') => (await api(s, 'POST', '/api/dev-auth/register', { email, password: 'password123', displayName: name })).body.token as string;

export async function topicIds(s: TestServer, slugs?: string[]): Promise<string[]> {
  const { body } = await api(s, 'GET', '/api/topics');
  return body.topics.filter((t: any) => !slugs || slugs.includes(t.slug)).map((t: any) => t.id);
}

export const baseSettings = { questionLimit: 10, summitHeight: 3, timeLimitS: 30, maxPlayers: 150 };

export async function createGame(s: TestServer, bearer: string, over: Record<string, unknown> = {}) {
  const categoryIds = await topicIds(s);
  const res = await api(s, 'POST', '/api/games', { title: 'Test game', hostMode: 'competing', categoryIds, minLevel: 1, maxLevel: 10, settings: baseSettings, openNow: true, ...over }, { bearer });
  if (res.status !== 201) throw new Error(`createGame failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; code: string; phase: string };
}

export interface Bot {
  name: string; id: string; token: string; socket: Socket; events: ServerEvent[]; snapshot?: RoomSnapshot;
  waitFor<T extends ServerEvent['t']>(t: T, timeout?: number, pred?: (e: Extract<ServerEvent, { t: T }>) => boolean): Promise<Extract<ServerEvent, { t: T }>>;
  emit<T = any>(ev: string, payload?: unknown): Promise<{ ok: boolean; error?: string; code?: string; data?: T }>;
  close(): void;
}

export async function joinBot(s: TestServer, code: string, name: string, opts: { bearer?: string; spectator?: boolean; resumeToken?: string } = {}): Promise<Bot> {
  const res = await api(s, 'POST', `/api/rooms/${code}/join`, { nickname: name, avatar: { body: 'teal', eyes: 'round', glasses: 'none', headwear: 'none', gear: 'none' }, spectator: opts.spectator, resumeToken: opts.resumeToken }, { bearer: opts.bearer });
  if (res.status > 201) throw new Error(`join failed ${res.status} ${JSON.stringify(res.body)}`);
  return attach(s, code, name, res.body.participantToken, res.body.participantId, opts.bearer);
}

export async function attach(s: TestServer, code: string, name: string, token: string | undefined, id: string, accessToken?: string): Promise<Bot> {
  const socket = connect(s.base, { auth: { code, token, accessToken }, transports: ['websocket'], reconnection: false, forceNew: true });
  const events: ServerEvent[] = [];
  const waiters: { t: string; pred?: (e: any) => boolean; res: (e: any) => void }[] = [];
  socket.on('ev', (e: ServerEvent) => {
    events.push(e);
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i]!.t === e.t && (!waiters[i]!.pred || waiters[i]!.pred!(e))) waiters.splice(i, 1)[0]!.res(e);
  });
  await new Promise<void>((res, rej) => { socket.once('connect', () => res()); socket.once('connect_error', (e) => rej(e)); });
  const bot: Bot = {
    name, id, token: token ?? '', socket, events,
    waitFor: (t, timeout = 20_000, pred) => new Promise((res, rej) => {
      const hit = events.find((e) => e.t === t && (!pred || pred(e as any)));
      if (hit && !pred) { /* historic events don't satisfy waits: only future ones */ }
      const timer = setTimeout(() => rej(new Error(`timeout waiting for ${t} (${name})`)), timeout);
      waiters.push({ t, pred, res: (e) => { clearTimeout(timer); res(e); } });
    }),
    emit: (ev, payload) => new Promise((res) => socket.emit(ev, payload, res)),
    close: () => socket.close(),
  };
  return bot;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function correctOptionFor(s: TestServer, roundId: string): Promise<string> {
  const r = await s.db.query<any>('select gq.snapshot from rounds r join game_questions gq on gq.id=r.game_question_id where r.id=$1', [roundId]);
  return r.rows[0].snapshot.correctOptionId;
}
export async function wrongOptionFor(s: TestServer, roundId: string): Promise<string> {
  const c = await correctOptionFor(s, roundId);
  return c === 'a' ? 'b' : 'a';
}

/** A database that outlives one server instance, to simulate a process restart. */
export async function openTestDb(): Promise<Db> {
  const { openDb } = await import('../db/db');
  const { loadEnv } = await import('../env');
  return openDb(loadEnv({ NODE_ENV: 'test', DB_DRIVER: 'pglite' }));
}
