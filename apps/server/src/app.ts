import { createServer } from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { Server as IOServer } from 'socket.io';
import { ZodError } from 'zod';
import { Auth } from './auth';
import { migrate, openDb, type Db } from './db/db';
import { loadEnv, type Env } from './env';
import { Mailer } from './email';
import { GameService } from './game/service';
import { PracticeService } from './game/practice';
import { SignupService } from './signup';
import { Stats } from './stats';
import { limiter, makeCounter } from './ratelimit';
import { ensureBaseData, seedFixtures } from './repo/content';
import { HttpError } from './repo/util';
import { adminRoutes } from './routes/admin';
import { gameRoutes } from './routes/games';
import { packRoutes } from './routes/packs';
import { publicRoutes } from './routes/public';
import { attachSockets } from './socket';
import { seedDevUsers } from './db/devseed';
import type { Ctx } from './ctx';

export interface AppHandle {
  env: Env;
  db: Db;
  ctx: Ctx;
  io: IOServer;
  server: ReturnType<typeof createServer>;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export async function createApp(envOverrides: Record<string, string | undefined> = {}, existingDb?: Db): Promise<AppHandle> {
  const env = loadEnv({ ...process.env, ...envOverrides });
  const db = existingDb ?? (await openDb(env));
  await migrate(db, { dev: env.DB_DRIVER === 'pglite' });
  await ensureBaseData(db);
  if (env.DB_DRIVER === 'pglite' && env.NODE_ENV !== 'production') {
    await seedFixtures(db);
    if (env.AUTH_MODE === 'dev') await seedDevUsers(db);
  }

  const counter = makeCounter(env);
  const mailer = new Mailer(env);
  const games = new GameService(db, env);
  const practice = new PracticeService(db, env);
  const auth = new Auth(env, db);
  const signup = new SignupService(db, env, mailer, auth);
  const stats = new Stats(db, env);
  auth.onSeen = (u) => { void stats.userSeen({ id: u.id, sessionId: u.sessionId }).catch(() => undefined); };
  const ctx: Ctx = { env, db, auth, games, practice, mailer, signup, stats, limit: limiter(counter, env) };

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // CORS is not authorisation: it only lets our own web origins read responses. Credentials travel as bearer headers.
  app.use(cors({ origin: env.ALLOWED_ORIGINS, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['content-type', 'authorization', 'x-guest-token', 'x-device-id', 'x-filename'], maxAge: 600 }));
  app.use((req, res, next) => (req.path.includes('/import/') ? next() : express.json({ limit: '64kb' })(req, res, next)));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', async (_req, res) => {
    try { await db.query('select 1'); res.json({ ok: true, db: db.kind }); } catch { res.status(503).json({ ok: false }); }
  });

  // Privacy-preserving visit counter: counts only, no cookie, no IP or user agent stored. Do-Not-Track / Global Privacy Control are honoured.
  const optedOut = (req: Request) => req.headers.dnt === '1' || req.headers['sec-gpc'] === '1';
  app.post('/api/t', ctx.limit('track', 120, 60_000, (req) => req.ip ?? 'anon'), (req, res) => {
    const b = req.body as { path?: unknown; ref?: unknown } | undefined;
    if (typeof b?.path === 'string' && b.path.length <= 200) {
      void stats.pageview({ path: b.path, ref: typeof b.ref === 'string' ? b.ref.slice(0, 200) : undefined, ua: String(req.headers['user-agent'] ?? ''), ip: req.ip ?? '', optOut: optedOut(req) }).catch(() => undefined);
    }
    res.status(204).end();
  });
  app.post('/api/t/signin-failed', ctx.limit('track-fail', 30, 60_000, (req) => req.ip ?? 'anon'), (req, res) => { if (!optedOut(req)) stats.signinFailed(); res.status(204).end(); });

  app.use('/api', publicRoutes(ctx), gameRoutes(ctx));
  app.use('/api/packs', packRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found', 'not_found')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra ? { details: err.extra } : {}) });
    if (err instanceof ZodError) return void res.status(400).json({ error: 'Please check the highlighted fields', code: 'invalid', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    if ((err as any)?.type === 'entity.too.large') return void res.status(413).json({ error: 'Request too large', code: 'too_big' });
    if (err instanceof SyntaxError) return void res.status(400).json({ error: 'Malformed JSON', code: 'invalid' });
    const message = (err as Error)?.message ?? '';
    if (/duplicate key|unique constraint/i.test(message)) return void res.status(409).json({ error: 'That already exists', code: 'conflict' });
    console.error('[http] unexpected error', _req.method, _req.path, message); // never log request bodies (may hold answers/tokens)
    res.status(500).json({ error: 'Something went wrong', code: 'internal' });
  });

  const server = createServer(app);
  const io = new IOServer(server, {
    cors: { origin: env.ALLOWED_ORIGINS },
    maxHttpBufferSize: 10_000,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    transports: ['websocket', 'polling'],
  });
  attachSockets(io, ctx);

  const recovered = await games.recover();
  if (recovered) console.warn(`[game] ${recovered} in-flight game(s) placed in recovery pause`);
  const sweepTimer = setInterval(() => { games.sweep().catch((e) => console.error('[sweep]', e)); signup.cleanup().catch((e) => console.error('[sweep]', e)); }, 10 * 60_000);
  sweepTimer.unref();

  return {
    env, db, ctx, io, server,
    listen: (port = env.PORT) => new Promise((resolve) => server.listen(port, () => resolve((server.address() as { port: number }).port))),
    close: async () => {
      clearInterval(sweepTimer);
      await games.stop();
      await stats.stop();
      await new Promise<void>((r) => { io.close(() => r()); });
      await counter.close();
      if (!existingDb) await db.close();
    },
  };
}
