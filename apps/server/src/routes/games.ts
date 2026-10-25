import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { createGameSchema, practiceAnswerSchema, practiceCreateSchema, updateGameSchema } from '@elimquest/contracts';
import { formatRoomCode, rulesSummary } from '@elimquest/game-core';
import { brand } from '@elimquest/config';
import { guestToken, userKey, type Ctx } from '../ctx';
import { hostConfirmationEmail } from '../email';
import { HttpError, many, one } from '../repo/util';

const uuid = z.string().uuid();

export function gameRoutes(ctx: Ctx) {
  const r = Router();
  const { db, env, games, auth, mailer, practice } = ctx;
  const id = (raw: unknown) => uuid.parse(raw);

  const joinUrl = (code: string) => `${env.PUBLIC_WEB_URL.replace(/\/$/, '')}/join/${code}`;

  async function sendHostEmail(game: any, user: { id: string; email: string }, force = false) {
    const claimed = await one(db, "insert into email_log(kind, game_id, user_id, status) values ('host_confirmation',$1,$2,'failed') on conflict (kind, game_id) do nothing returning id", [game.id, user.id]);
    if (!claimed && !force) return { status: 'already_sent' as const };
    const when = game.scheduled_at ? new Date(game.scheduled_at).toLocaleString('en-GB', { timeZone: game.timezone, dateStyle: 'full', timeStyle: 'short' }) : null;
    const res = await mailer.send(hostConfirmationEmail({ to: user.email, title: game.title, code: formatRoomCode(game.code), joinUrl: joinUrl(game.code), when, timezone: game.timezone, hostMode: game.host_mode }));
    await db.query("update email_log set status=$3, error=$4, created_at=now() where kind='host_confirmation' and game_id=$1 and user_id=$2", [game.id, user.id, res.status, res.error ?? null]);
    return res;
  }

  // ---- host games -----------------------------------------------------------------------------
  r.post('/games', auth.require(), ctx.limit('game-create', 10, 3_600_000, userKey), async (req, res) => {
    const input = createGameSchema.parse(req.body);
    const out = await games.createGame(req.user!, input);
    let email: { status: string } = { status: 'skipped' };
    try { email = await sendHostEmail(out.game, req.user!); } catch { email = { status: 'failed' }; } // never destroys a created game
    res.status(201).json({ id: out.game.id, code: out.game.code, phase: out.game.phase, hostMode: out.game.host_mode, inventory: out.inventory, email });
  });

  r.post('/games/inventory', auth.optional(), async (req, res) => {
    const body = createGameSchema.parse({ ...req.body, openNow: false });
    res.json(await games.inventory(body, req.user?.id ?? 'anonymous', body.settings.questionLimit, body.allowHistoryReuse));
  });

  r.get('/games', auth.require(), async (req, res) => res.json({ games: await games.myGames(req.user!.id) }));

  r.get('/games/:id', auth.require(), async (req, res) => {
    const g = await games.getGame(id(req.params.id));
    if (!g || g.host_user_id !== req.user!.id) throw new HttpError(404, 'Game not found', 'not_found');
    const categories = await many(db, 'select id, name, slug from categories where id = any($1::uuid[])', [g.category_ids]);
    res.json({ id: g.id, code: g.code, title: g.title, hostMode: g.host_mode, source: g.source, packId: g.pack_id, phase: g.phase, settings: g.settings, scheduledAt: g.scheduled_at, timezone: g.timezone, minLevel: g.min_level, maxLevel: g.max_level, categories, topicVoting: !!g.voting, allowHistoryReuse: g.allow_history_reuse });
  });

  r.patch('/games/:id', auth.require(), async (req, res) => {
    const patch = updateGameSchema.parse(req.body);
    res.json(await games.updateGame(id(req.params.id), req.user!.id, patch as any).then((x) => ({ ok: true, dateChanged: x.dateChanged })));
  });
  r.post('/games/:id/open', auth.require(), async (req, res) => { const g = await games.openLobby(id(req.params.id), req.user!.id); res.json({ code: g.code }); });
  r.post('/games/:id/cancel', auth.require(), async (req, res) => { await games.cancelGame(id(req.params.id), req.user!.id); res.json({ ok: true }); });

  r.get('/games/:id/share', auth.require(), async (req, res) => {
    const g = await games.getGame(id(req.params.id));
    if (!g || g.host_user_id !== req.user!.id) throw new HttpError(404, 'Game not found');
    if (g.phase === 'draft') throw new HttpError(409, 'Open the lobby to get a code and link', 'draft');
    const url = joinUrl(g.code);
    const cats = await many(db, 'select name from categories where id = any($1::uuid[])', [g.category_ids]);
    const when = g.scheduled_at ? new Date(g.scheduled_at) : null;
    const whenText = when ? when.toLocaleString('en-GB', { timeZone: g.timezone, dateStyle: 'full', timeStyle: 'short' }) + ` (${g.timezone})` : 'Open now';
    const message = `Join my ${brand.name} quiz "${g.title}"!\nRoom code: ${formatRoomCode(g.code)}\nWhen: ${whenText}\n${url}\n(The host starts the game once everyone has arrived.)`;
    const ics = when ? [
      'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${brand.name}//EN`, 'BEGIN:VEVENT', `UID:${g.id}@elimquest`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')}`, `DTSTART:${when.toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
      `DTEND:${new Date(when.getTime() + 45 * 60_000).toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
      `SUMMARY:${g.title.replace(/[,;\n]/g, ' ')}`, `DESCRIPTION:Room code ${g.code}. ${url} The host starts the game manually.`, `URL:${url}`, 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n') : null;
    res.json({
      title: g.title, code: g.code, codeDisplay: formatRoomCode(g.code), joinUrl: url, scheduledAt: g.scheduled_at, timezone: g.timezone, whenText,
      hostMode: g.host_mode, topics: cats.map((c: any) => c.name), levelRange: [g.min_level, g.max_level], rules: rulesSummary(g.settings),
      qr: await QRCode.toDataURL(url, { margin: 1, width: 320 }), message, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}`, ics,
      notice: 'ElimQuest does not message your audience. Share this link yourself. The game starts only when you press Start.',
    });
  });

  r.post('/games/:id/resend-email', auth.require(), ctx.limit('email-resend', 3, 3_600_000, userKey), async (req, res) => {
    const g = await games.getGame(id(req.params.id));
    if (!g || g.host_user_id !== req.user!.id) throw new HttpError(404, 'Game not found');
    res.json(await sendHostEmail(g, req.user!, true));
  });

  r.get('/games/:id/preview', auth.require(), async (req, res) => res.json({ questions: await games.hostPreview(id(req.params.id), req.user!.id) }));
  r.post('/games/:id/rematch', auth.require(), ctx.limit('game-create', 10, 3_600_000, userKey), async (req, res) => res.status(201).json(await games.rematch(id(req.params.id), req.user!.id)));
  r.get('/games/:id/rematch', auth.optional(), async (req, res) => res.json({ code: await games.rematchCode(id(req.params.id)) }));
  r.get('/games/:id/results.csv', auth.require(), async (req, res) => {
    res.setHeader('content-type', 'text/csv; charset=utf-8').setHeader('content-disposition', 'attachment; filename="results.csv"').send(await games.csvExport(id(req.params.id), req.user!.id));
  });
  r.get('/games/:id/results', auth.optional(), async (req, res) => {
    const who = await games.identify(id(req.params.id), { token: guestToken(req), user: req.user });
    res.json(await games.results(id(req.params.id), who));
  });
  r.post('/games/:id/link-account', auth.require(), async (req, res) => {
    const { participantToken } = z.object({ participantToken: z.string().min(20).max(200) }).parse(req.body);
    await games.linkGuestToAccount(req.user!, id(req.params.id), participantToken);
    res.json({ ok: true });
  });

  // ---- practice -------------------------------------------------------------------------------
  r.post('/practice', ctx.limit('practice-create', 30, 3_600_000), auth.optional(), async (req, res) => {
    const input = practiceCreateSchema.parse(req.body);
    const deviceId = z.string().min(8).max(80).optional().parse(req.headers['x-device-id']);
    res.status(201).json(await practice.create(input, req.user, deviceId, guestToken(req)));
  });
  r.get('/practice/:id', auth.optional(), async (req, res) => res.json(await practice.state(id(req.params.id), guestToken(req), req.user)));
  r.post('/practice/:id/next', auth.optional(), async (req, res) => res.json(await practice.nextQuestion(id(req.params.id), guestToken(req), req.user)));
  r.post('/practice/:id/answer', ctx.limit('practice-answer', 120, 60_000), auth.optional(), async (req, res) => {
    const { optionId } = practiceAnswerSchema.parse(req.body);
    res.json(await practice.answer(id(req.params.id), guestToken(req), optionId, req.user));
  });
  r.post('/practice/:id/save', auth.require(), async (req, res) => {
    const t = guestToken(req); if (!t) throw new HttpError(400, 'Missing session credential');
    await practice.attachToAccount(id(req.params.id), t, req.user!); res.json({ ok: true });
  });

  return r;
}
