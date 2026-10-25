import type { Server as IOServer, Socket } from 'socket.io';
import { announceSchema, kickSchema, reactSchema, submitAnswerSchema, voidSchema, voteSchema } from '@elimquest/contracts';
import { isValidRoomCode } from '@elimquest/game-core';
import { ZodError } from 'zod';
import type { Ctx } from './ctx';
import { HttpError } from './repo/util';

type AckFn = (r: { ok: boolean; error?: string; code?: string; data?: unknown }) => void;

/** Tiny per-socket token bucket: protects the answer path from a single misbehaving client. */
function bucket(rate: number, burst: number) {
  let tokens = burst; let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * rate); last = now;
    if (tokens < 1) return false;
    tokens -= 1; return true;
  };
}

function toAck(e: unknown): { ok: false; error: string; code: string; data?: unknown } {
  if (e instanceof HttpError) return { ok: false, error: e.message, code: e.code, data: e.extra };
  if (e instanceof ZodError) return { ok: false, error: 'Invalid request', code: 'invalid' };
  console.error('[socket] unexpected', e);
  return { ok: false, error: 'Something went wrong', code: 'internal' };
}

export function attachSockets(io: IOServer, ctx: Ctx) {
  const { games, auth, env } = ctx;
  games.io = io;

  io.use(async (socket, next) => {
    try {
      const a = socket.handshake.auth as { code?: string; token?: string; accessToken?: string };
      if (!a.code || !isValidRoomCode(a.code)) return next(new Error('bad_code'));
      const g = await games.getGameByCode(a.code);
      if (!g) return next(new Error('not_found'));
      const user = a.accessToken ? await auth.verifyBearer(a.accessToken) : null;
      const who = await games.identify(g.id, { token: a.token, user });
      if (!who.participant && !who.canControl) return next(new Error('not_member'));
      // Total connection budget: players + spectators + host.
      const budget = Math.min(g.settings.maxPlayers, env.MAX_PLAYERS_PER_ROOM) + env.SPECTATOR_BUDGET_PER_ROOM + 2;
      if (games.connectionCount(g.id) >= budget) return next(new Error('room_connections_full'));
      socket.data = { gameId: g.id, participantId: who.participant?.id ?? null, spectator: !!who.participant?.is_spectator, canControl: who.canControl, userId: user?.id ?? null };
      next();
    } catch {
      next(new Error('auth_failed'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { gameId, participantId, spectator, canControl, userId } = socket.data as { gameId: string; participantId: string | null; spectator: boolean; canControl: boolean; userId: string | null };
    socket.join(games.roomName(gameId));
    games.attach(gameId, participantId);
    const answerLimit = bucket(5, 8);
    const cmdLimit = bucket(3, 6);
    const who = () => ({ participant: participantId ? { id: participantId, is_spectator: spectator } : null, canControl });

    const wrap = (fn: (payload: any) => Promise<unknown>, limit?: () => boolean) => async (payload: unknown, ack?: AckFn) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        if (limit && !limit()) throw new HttpError(429, 'Slow down', 'rate_limited');
        reply({ ok: true, data: await fn(payload) });
      } catch (e) {
        reply(toAck(e));
      }
    };

    // Fresh authorised snapshot on request (reconnects, sequence gaps).
    socket.on('snapshot', wrap(async () => {
      const full = await games.identify(gameId, { token: undefined, user: undefined });
      void full;
      const g = await games.getGame(gameId);
      const row = participantId ? await ctx.db.query('select * from participants where id=$1 and not removed', [participantId]) : { rows: [] as any[] };
      if (participantId && !row.rows[0]) throw new HttpError(403, 'You were removed from this game', 'removed');
      return games.snapshot(g.id, { participant: row.rows[0] ?? null, canControl });
    }));

    socket.on('answer', wrap(async (p) => {
      if (!participantId || spectator) throw new HttpError(403, 'Spectators cannot answer', 'forbidden');
      const receivedAt = Date.now();
      const { roundId, optionId } = submitAnswerSchema.parse(p);
      return games.submitAnswer(gameId, participantId, roundId, optionId, receivedAt);
    }, answerLimit));

    socket.on('vote', wrap(async (p) => {
      if (!participantId || spectator) throw new HttpError(403, 'Only players can vote', 'forbidden');
      return games.vote(gameId, participantId, voteSchema.parse(p).categoryIds);
    }, cmdLimit));

    socket.on('react', wrap(async (p) => {
      if (!participantId || spectator) throw new HttpError(403, 'Only players can send stickers', 'forbidden');
      return games.react(gameId, participantId, reactSchema.parse(p).kind);
    }, cmdLimit));

    socket.on('host', wrap(async (p: any) => {
      if (!canControl || !userId) throw new HttpError(403, 'Only the host can do that', 'forbidden');
      switch (p?.cmd) {
        case 'start': return games.start(gameId, userId);
        case 'pause': case 'resume': case 'next': case 'end': case 'closeVoting': return games.control(gameId, userId, p.cmd);
        case 'announce': return games.announce(gameId, userId, announceSchema.parse(p).message);
        case 'void': return games.voidCurrent(gameId, userId, voidSchema.parse(p).reason);
        case 'kick': return games.kick(gameId, userId, kickSchema.parse(p).participantId);
        default: throw new HttpError(400, 'Unknown command', 'bad_cmd');
      }
    }, cmdLimit));

    socket.on('disconnect', () => games.detach(gameId, participantId));
    void who;
  });
}
