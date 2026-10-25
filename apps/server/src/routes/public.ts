import { Router } from 'express';
import { z } from 'zod';
import { joinBodySchema, loginDevSchema, registerDevSchema, reportSchema } from '@elimquest/contracts';
import { platformLimits } from '@elimquest/config';
import { normaliseRoomCode, isValidRoomCode } from '@elimquest/game-core';
import { guestToken, type Ctx } from '../ctx';
import { publishedTopics } from '../repo/content';
import { HttpError, many, one, sha256 } from '../repo/util';

const codeParam = (raw: unknown) => {
  const code = normaliseRoomCode(String(raw));
  if (!isValidRoomCode(code)) throw new HttpError(400, 'Room codes are 6 digits', 'bad_code');
  return code;
};

export function publicRoutes(ctx: Ctx) {
  const r = Router();
  const { db, env, games, auth } = ctx;

  r.get('/config', (_req, res) => {
    res.json({
      authMode: env.AUTH_MODE,
      maxPlayersPerRoom: env.MAX_PLAYERS_PER_ROOM,
      hardCap: platformLimits.maxPlayersHardCap,
      spectatorBudget: env.SPECTATOR_BUDGET_PER_ROOM,
      graceMs: env.ANSWER_GRACE_MS,
      fixturesEnabled: env.ALLOW_FIXTURE_QUESTIONS,
      emailMode: env.EMAIL_MODE,
      environment: env.NODE_ENV,
    });
  });

  r.get('/topics', async (_req, res) => res.json({ topics: await publishedTopics(db, env.ALLOW_FIXTURE_QUESTIONS) }));
  r.get('/topics/:slug', async (req, res) => {
    const t = (await publishedTopics(db, env.ALLOW_FIXTURE_QUESTIONS)).find((x) => x.slug === req.params.slug);
    if (!t) throw new HttpError(404, 'Topic not found', 'not_found');
    res.json({ topic: t });
  });
  r.get('/levels', async (_req, res) => res.json({ levels: await many(db, 'select level, title, rubric from difficulty_definitions order by level') }));

  // ---- rooms (guest-facing) ------------------------------------------------------------------
  r.get('/rooms/:code', ctx.limit('room-lookup', 40, 60_000), async (req, res) => res.json(await games.preview(codeParam(req.params.code))));

  r.post('/rooms/:code/join', ctx.limit('room-join', 20, 60_000), auth.optional(), async (req, res) => {
    const body = joinBodySchema.extend({ deviceId: z.string().min(8).max(80).optional() }).parse(req.body);
    const out = await games.join(codeParam(req.params.code), body, req.user);
    res.status(out.resumed ? 200 : 201).json(out);
  });

  r.get('/rooms/:code/snapshot', ctx.limit('room-snapshot', 120, 60_000), auth.optional(), async (req, res) => {
    const g = await games.getGameByCode(codeParam(req.params.code));
    if (!g) throw new HttpError(404, 'Room not found', 'not_found');
    const who = await games.identify(g.id, { token: guestToken(req), user: req.user });
    if (!who.participant && !who.canControl) throw new HttpError(403, 'Join the room first', 'not_member');
    res.json(await games.snapshot(g.id, who));
  });

  r.post('/reports', ctx.limit('report', 20, 3_600_000), async (req, res) => {
    const body = reportSchema.parse(req.body);
    const token = guestToken(req);
    // Reports must come from someone holding a participant or practice credential.
    const ok = token && (await one(db, 'select 1 from participants where token_hash=$1 union all select 1 from practice_sessions where token_hash=$1', [sha256(token)]));
    if (!ok) throw new HttpError(403, 'Only players can report a question', 'forbidden');
    await db.query('insert into content_reports(version_id, reason, note) values ($1,$2,$3)', [body.questionVersionId, body.reason, body.note]);
    res.status(201).json({ ok: true });
  });

  // ---- dev auth (never mounted in production) -------------------------------------------------
  if (env.AUTH_MODE === 'dev' && env.NODE_ENV !== 'production') {
    r.post('/dev-auth/register', ctx.limit('auth', 10, 60_000), async (req, res) => {
      const b = registerDevSchema.parse(req.body);
      res.status(201).json(await auth.devRegister(b.email, b.password, b.displayName));
    });
    r.post('/dev-auth/login', ctx.limit('auth', 10, 60_000), async (req, res) => {
      const b = loginDevSchema.parse(req.body);
      res.json(await auth.devLogin(b.email, b.password));
    });
  }

  // ---- account --------------------------------------------------------------------------------
  r.get('/me', auth.require(), async (req, res) => {
    const p = await one(db, 'select prefs, deletion_requested_at as "deletionRequestedAt" from profiles where id=$1', [req.user!.id]);
    res.json({ user: req.user, prefs: p?.prefs ?? {}, deletionRequestedAt: p?.deletionRequestedAt ?? null });
  });
  r.patch('/me/prefs', auth.require(), async (req, res) => {
    const prefs = z.object({ sound: z.boolean().optional(), reducedMotion: z.boolean().optional(), emailTips: z.boolean().optional(), nickname: z.string().max(20).optional() }).parse(req.body);
    await db.query("update profiles set prefs = prefs || $2::jsonb where id=$1", [req.user!.id, JSON.stringify(prefs)]);
    res.json({ ok: true });
  });
  r.post('/me/delete-request', auth.require(), async (req, res) => {
    await db.query('update profiles set deletion_requested_at = now() where id=$1', [req.user!.id]);
    res.json({ ok: true, note: 'Deletion requested. Your account and saved history are removed within 30 days (see Privacy).' });
  });
  r.get('/me/history', auth.require(), async (req, res) => {
    const games = await many(
      db,
      `select g.id, g.code, g.title, g.finished_at as "finishedAt", g.host_mode as "hostMode", r.final_step as "finalStep", r.rank, r.is_winner as "isWinner", r.correct, r.wrong, r.unanswered
         from participants p join games g on g.id=p.game_id left join game_results r on r.participant_id=p.id
        where p.user_id=$1 and not p.is_spectator order by g.created_at desc limit 50`, [req.user!.id]);
    const practice = await many(db, `select id, mode, status, position, round_no as "roundNo", succeeded, created_at as "createdAt" from practice_sessions where user_id=$1 order by created_at desc limit 50`, [req.user!.id]);
    res.json({ games, practice });
  });

  return r;
}
