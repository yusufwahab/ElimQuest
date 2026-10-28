import { randomInt } from 'node:crypto';
import type { Server as IOServer } from 'socket.io';
import {
  COUNTDOWN_S, REVEAL_MS, checkNickname, disambiguate, evaluateAfterRound, hashString, highest, isWithinWindow, mulberry32, quotaFromVotes, rankByStep, rulesSummary,
  checkChatText, sanitizeAvatar, scoreRound, selectQuestions, validateSettings, type GamePhase, type GameSettings,
} from '@elimquest/game-core';
import type {
  ChatMessage, ChatMode, ChatState, CreateGameInput, FinalStanding, GameFinishedEvent, PlayerPublic, QuestionPublic, ReactionKind, RoomPreview, RoomSnapshot, RoundResultEvent, ServerEvent,
} from '@elimquest/contracts';
import type { Env } from '../env';
import type { Db, Queryable } from '../db/db';
import { HttpError, audit, many, newToken, one, plainText, sha256, toMs } from '../repo/util';
import { loadPackPool, loadPlatformPool, snapshotsFor, type QuestionSnapshot } from '../repo/content';
import type { AuthUser } from '../auth';

const FINALE_REVIEW_MS = { audience: 8000, competing: 4000 };
const SOCKET_ROOM = (gameId: string) => `game:${gameId}`;

interface Controller {
  gameId: string;
  v: number;
  tail: Promise<unknown>;
  timer?: NodeJS.Timeout;
  presence: Map<string, number>; // participantId -> open sockets
  answered: Set<string>;
  currentRound?: { id: string; deadline: number };
  countTimer?: NodeJS.Timeout;
  deltaTimer?: NodeJS.Timeout;
  pendingJoined: PlayerPublic[];
  pendingLeft: string[];
  pendingConn: Map<string, boolean>;
  pendingReactions: { id: string; kind: ReactionKind }[];
  reactionTimer?: NodeJS.Timeout;
  lastReaction: Map<string, number>;
  // Room chat lives in memory only (never saved): last 100 messages, who is muted, and each sender's recent send times.
  chat: ChatMessage[];
  chatSeq: number;
  chatMode: ChatMode;
  muted: Set<string>;
  chatTimes: Map<string, number[]>;
}

export interface Identity { participantId: string | null; userId: string | null }

export class GameService {
  io: IOServer | null = null;
  private ctls = new Map<string, Controller>();
  public stopped = false;
  constructor(private db: Db, private env: Env) {}

  // ---- time helpers ----------------------------------------------------------------------------
  private scale(ms: number) { return Math.max(5, Math.round(ms * this.env.TIMING_SCALE)); }
  now() { return Date.now(); }

  private ctl(gameId: string): Controller {
    let c = this.ctls.get(gameId);
    if (!c) {
      c = { gameId, v: Date.now(), tail: Promise.resolve(), presence: new Map(), answered: new Set(), pendingJoined: [], pendingLeft: [], pendingConn: new Map(), pendingReactions: [], lastReaction: new Map(), chat: [], chatSeq: 0, chatMode: 'between', muted: new Set(), chatTimes: new Map() };
      this.ctls.set(gameId, c);
    }
    return c;
  }
  /** Serialise state transitions per room; errors are returned to the caller. */
  private run<T>(c: Controller, fn: () => Promise<T>): Promise<T> {
    const p = c.tail.then(fn, fn);
    c.tail = p.catch(() => undefined);
    return p;
  }
  private schedule(c: Controller, atMs: number, fn: () => Promise<void>) {
    if (c.timer) clearTimeout(c.timer);
    const delay = Math.max(0, atMs - this.now());
    c.timer = setTimeout(() => {
      if (this.stopped) return;
      this.run(c, fn).catch((e) => console.error('[game] timer error', e));
    }, delay);
    c.timer.unref?.();
  }
  private emit(c: Controller, ev: Omit<ServerEvent, 'v'> & Record<string, unknown>) {
    const full = { ...ev, v: ++c.v } as ServerEvent;
    this.io?.to(SOCKET_ROOM(c.gameId)).emit('ev', full);
  }

  // ---- queries ---------------------------------------------------------------------------------
  async getGameByCode(code: string, q: Queryable = this.db) {
    return one<any>(q, "select * from games where code = $1 and phase <> 'draft' order by created_at desc limit 1", [code]);
  }
  async getGame(id: string, q: Queryable = this.db) { return one<any>(q, 'select * from games where id = $1', [id]); }

  private hostName(hostUserId: string, q: Queryable = this.db) {
    return one<{ display_name: string }>(q, 'select display_name from profiles where id=$1', [hostUserId]).then((r) => r?.display_name ?? 'Host');
  }

  private async categories(ids: string[], q: Queryable = this.db) {
    if (!ids.length) return [];
    return many<{ id: string; name: string; slug: string }>(q, 'select id, name, slug from categories where id = any($1::uuid[]) order by sort_order', [ids]);
  }

  private async playerRows(gameId: string, q: Queryable = this.db) {
    return many<any>(q, 'select id, nickname, avatar, position, is_host_player, user_id from participants where game_id=$1 and not is_spectator and not removed order by joined_at', [gameId]);
  }
  private toPublic(c: Controller | undefined, r: any): PlayerPublic {
    return { id: r.id, nickname: r.nickname, avatar: r.avatar, position: r.position, connected: (c?.presence.get(r.id) ?? 0) > 0, isHostPlayer: r.is_host_player || undefined };
  }

  async preview(code: string): Promise<RoomPreview> {
    const g = await this.getGameByCode(code);
    if (!g) throw new HttpError(404, 'We could not find that room code', 'not_found');
    const settings = g.settings as GameSettings;
    const cats = await this.categories(g.category_ids);
    const count = await one<{ n: number }>(this.db, 'select count(*)::int n from participants where game_id=$1 and not is_spectator and not removed', [g.id]);
    const specCount = await one<{ n: number }>(this.db, 'select count(*)::int n from participants where game_id=$1 and is_spectator', [g.id]);
    const phase = g.phase as GamePhase;
    const isLobby = phase === 'lobby';
    const full = (count?.n ?? 0) >= Math.min(settings.maxPlayers, this.env.MAX_PLAYERS_PER_ROOM);
    let reason: RoomPreview['reason'];
    if (phase === 'cancelled') reason = 'cancelled';
    else if (phase === 'expired' || new Date(g.expires_at).getTime() < this.now() && !['finished', 'countdown', 'question_open', 'reveal', 'paused', 'recovery_pause'].includes(phase)) reason = 'expired';
    else if (phase === 'finished') reason = 'finished';
    else if (!isLobby) reason = 'started';
    else if (full) reason = 'full';
    const canSpectate = (['countdown', 'question_open', 'reveal', 'paused', 'recovery_pause', 'finished'].includes(phase)) && (specCount?.n ?? 0) < this.env.SPECTATOR_BUDGET_PER_ROOM;
    return {
      code: g.code, gameId: g.id, title: g.title, hostName: await this.hostName(g.host_user_id), hostMode: g.host_mode, phase,
      scheduledAt: g.scheduled_at ? new Date(g.scheduled_at).toISOString() : null, timezone: g.timezone, categories: cats,
      minLevel: g.min_level, maxLevel: g.max_level, settings, playerCount: count?.n ?? 0, rules: rulesSummary(settings),
      canJoin: isLobby && !full && !reason, canSpectate, reason, customContent: g.source === 'pack',
    };
  }

  // ---- creation --------------------------------------------------------------------------------
  private async newCode(q: Queryable): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = String(randomInt(100000, 1000000));
      const taken = await one(q, "select 1 from games where code=$1 and phase not in ('finished','cancelled','expired')", [code]);
      if (!taken) return code;
    }
    throw new HttpError(503, 'Could not allocate a room code, please retry', 'code_alloc');
  }

  /** Inventory for the wizard: counts only, never the questions themselves. */
  async inventory(input: Pick<CreateGameInput, 'categoryIds' | 'minLevel' | 'maxLevel' | 'source' | 'packId'>, hostUserId: string, needed: number, allowReuse: boolean) {
    const { pool, history } = await this.poolAndHistory(this.db, input, hostUserId, []);
    const res = selectQuestions({
      pool, count: needed, categoryIds: input.source === 'pack' ? [...new Set(pool.map((p) => p.categoryId))] : input.categoryIds,
      minLevel: input.minLevel, maxLevel: input.maxLevel, historyCanonicalIds: history, allowHistoryReuse: allowReuse || input.source === 'pack', seed: 'inventory',
    });
    return { eligible: res.eligible, fresh: res.fresh, needed, shortage: res.shortage, usable: res.selected.length };
  }

  private async poolAndHistory(q: Queryable, g: { categoryIds: string[]; source: string; packId?: string | null }, hostUserId: string, participantOwners: string[]) {
    if (g.source === 'pack') {
      const pool = await loadPackPool(q, g.packId!);
      return { pool, history: new Set<string>() }; // documented exception: custom packs ignore historical freshness
    }
    const pool = await loadPlatformPool(q, g.categoryIds, this.env.ALLOW_FIXTURE_QUESTIONS);
    const owners = [`h:${hostUserId}`, ...participantOwners];
    const rows = await many<{ canonical_id: string }>(q, 'select canonical_id from usage_history where owner_key = any($1::text[]) and used_at > now() - interval \'60 days\'', [owners]);
    return { pool, history: new Set(rows.map((r) => r.canonical_id)) };
  }

  async createGame(user: AuthUser, input: CreateGameInput) {
    const settings: GameSettings = input.settings;
    const errs = validateSettings(settings, this.env.MAX_PLAYERS_PER_ROOM);
    if (errs.length) throw new HttpError(400, errs.join(' '), 'bad_settings');
    let hostMode = input.hostMode;
    if (input.source === 'pack') {
      if (!input.packId) throw new HttpError(400, 'Choose a question pack', 'no_pack');
      const pack = await one(this.db, 'select 1 from packs where id=$1 and owner_id=$2 and not archived', [input.packId, user.id]);
      if (!pack) throw new HttpError(404, 'Pack not found', 'pack_not_found');
      hostMode = 'audience'; // authors know the answers
    } else if (input.categoryIds.length === 0) {
      throw new HttpError(400, 'Choose at least one topic', 'no_topics');
    }
    const active = await one<{ n: number }>(this.db, "select count(*)::int n from games where phase in ('lobby','countdown','question_open','reveal','climb','paused','recovery_pause')");
    if ((active?.n ?? 0) >= this.env.MAX_ACTIVE_ROOMS) throw new HttpError(429, `The platform is at its current limit of ${this.env.MAX_ACTIVE_ROOMS} live rooms. Please try again later.`, 'platform_full');
    const mine = await one<{ n: number }>(this.db, "select count(*)::int n from games where host_user_id=$1 and phase in ('draft','lobby')", [user.id]);
    if ((mine?.n ?? 0) >= this.env.MAX_OPEN_ROOMS_PER_HOST) throw new HttpError(429, `You already have ${this.env.MAX_OPEN_ROOMS_PER_HOST} open or draft rooms. Cancel one first.`, 'too_many_rooms');

    const inv = await this.inventory({ ...input, source: input.source }, user.id, settings.questionLimit, input.allowHistoryReuse);
    if (inv.shortage > 0 && input.openNow) {
      throw new HttpError(409, `Only ${inv.usable} suitable questions are available for ${settings.questionLimit} rounds.`, 'shortage', { ...inv });
    }
    const voting = input.topicVoting && input.source === 'system' ? { open: true, shortlist: input.categoryIds } : null;
    const phase: GamePhase = input.openNow ? 'lobby' : 'draft';
    const g = await this.db.tx(async (q) => {
      const code = await this.newCode(q);
      const row = await one<any>(
        q,
        `insert into games(code, host_user_id, title, host_mode, source, pack_id, category_ids, min_level, max_level, settings, scheduled_at, timezone,
           allow_history_reuse, voting, phase, opened_at, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7::uuid[],$8,$9,$10,$11,$12,$13,$14,$15, case when $15='lobby' then now() end, now() + ($16 || ' hours')::interval) returning *`,
        [code, user.id, plainText(input.title), hostMode, input.source, input.packId ?? null, input.categoryIds, input.minLevel, input.maxLevel, JSON.stringify(settings),
          input.scheduledAt ?? null, input.timezone, input.allowHistoryReuse, voting ? JSON.stringify(voting) : null, phase, String(this.env.ROOM_TTL_HOURS)],
      );
      await audit(q, { actorId: user.id, action: 'game.create', entityType: 'game', entityId: row.id, gameId: row.id, detail: { hostMode, source: input.source } });
      return row;
    });
    return { game: g, inventory: inv };
  }

  async openLobby(gameId: string, userId: string) {
    const c = this.ctl(gameId);
    return this.run(c, async () => {
      const g = await this.mustHost(gameId, userId);
      if (g.phase !== 'draft') throw new HttpError(409, 'This game is already open', 'bad_phase');
      const settings = g.settings as GameSettings;
      const inv = await this.inventory({ categoryIds: g.category_ids, minLevel: g.min_level, maxLevel: g.max_level, source: g.source, packId: g.pack_id }, userId, settings.questionLimit, g.allow_history_reuse);
      if (inv.shortage > 0) throw new HttpError(409, `Only ${inv.usable} suitable questions are available.`, 'shortage', { ...inv });
      await this.db.query("update games set phase='lobby', opened_at=now(), version=version+1 where id=$1", [gameId]);
      return this.getGame(gameId);
    });
  }

  async updateGame(gameId: string, userId: string, patch: Partial<CreateGameInput>) {
    const c = this.ctl(gameId);
    return this.run(c, async () => {
      const g = await this.mustHost(gameId, userId);
      if (!['draft', 'lobby'].includes(g.phase)) throw new HttpError(409, 'Settings are locked once the game starts', 'locked');
      if (patch.hostMode && patch.hostMode !== g.host_mode) throw new HttpError(409, 'Host mode cannot be changed after creation', 'locked');
      const settings: GameSettings = patch.settings ?? g.settings;
      const errs = validateSettings(settings, this.env.MAX_PLAYERS_PER_ROOM);
      if (errs.length) throw new HttpError(400, errs.join(' '), 'bad_settings');
      const sched = patch.scheduledAt !== undefined ? patch.scheduledAt : g.scheduled_at;
      await this.db.query(
        `update games set title=$2, category_ids=$3::uuid[], min_level=$4, max_level=$5, settings=$6, scheduled_at=$7, timezone=$8, allow_history_reuse=$9, version=version+1 where id=$1`,
        [gameId, patch.title ? plainText(patch.title) : g.title, patch.categoryIds ?? g.category_ids, patch.minLevel ?? g.min_level, patch.maxLevel ?? g.max_level,
          JSON.stringify(settings), sched, patch.timezone ?? g.timezone, patch.allowHistoryReuse ?? g.allow_history_reuse],
      );
      const dateChanged = patch.scheduledAt !== undefined && (toMs(sched as any) !== toMs(g.scheduled_at));
      await audit(this.db, { actorId: userId, action: 'game.update', entityType: 'game', entityId: gameId, gameId, detail: { dateChanged } });
      return { game: await this.getGame(gameId), dateChanged };
    });
  }

  async cancelGame(gameId: string, userId: string) {
    const c = this.ctl(gameId);
    return this.run(c, async () => {
      const g = await this.mustHost(gameId, userId);
      if (!['draft', 'lobby'].includes(g.phase)) throw new HttpError(409, 'A running game cannot be cancelled. Use End game instead.', 'bad_phase');
      await this.db.query("update games set phase='cancelled', version=version+1 where id=$1", [gameId]);
      await audit(this.db, { actorId: userId, action: 'game.cancel', entityType: 'game', entityId: gameId, gameId });
      this.emit(c, { t: 'phase', phase: 'cancelled' });
    });
  }

  private async mustHost(gameId: string, userId: string) {
    const g = await this.getGame(gameId);
    if (!g) throw new HttpError(404, 'Game not found', 'not_found');
    if (g.host_user_id !== userId) throw new HttpError(403, 'Only the host can do that', 'forbidden');
    return g;
  }

  // ---- joining & identity ---------------------------------------------------------------------
  async join(code: string, body: { nickname: string; avatar?: unknown; resumeToken?: string; spectator?: boolean; deviceId?: string }, user?: AuthUser) {
    const g = await this.getGameByCode(code);
    if (!g) throw new HttpError(404, 'We could not find that room code', 'not_found');
    if (g.phase === 'cancelled') throw new HttpError(410, 'This game was cancelled', 'cancelled');
    if (g.phase === 'expired') throw new HttpError(410, 'This room has expired', 'expired');
    if (body.resumeToken) {
      const existing = await one<any>(this.db, 'select id, nickname from participants where game_id=$1 and token_hash=$2 and not removed', [g.id, sha256(body.resumeToken)]);
      if (existing) return { participantToken: body.resumeToken, participantId: existing.id, nickname: existing.nickname, resumed: true, spectator: false };
    }
    const nick = checkNickname(body.nickname);
    if (!nick.ok) throw new HttpError(400, nick.reason, 'bad_nickname');
    const avatar = sanitizeAvatar(body.avatar);
    const token = newToken();
    const deviceKey = body.deviceId ? `d:${sha256(body.deviceId).slice(0, 32)}` : null;
    const settings = g.settings as GameSettings;
    const isHostUser = !!user && user.id === g.host_user_id;
    if (isHostUser && g.host_mode === 'audience') throw new HttpError(403, 'As the organiser you manage the quiz and do not compete. Open the host controls instead.', 'host_no_compete');
    const asSpectator = !!body.spectator || g.phase !== 'lobby';
    const c = this.ctl(g.id);

    const row = await this.db.tx(async (q) => {
      await q.query('select id from games where id=$1 for update', [g.id]); // serialise capacity checks
      const fresh = await one<any>(q, 'select phase, settings from games where id=$1', [g.id]);
      if (asSpectator) {
        if (fresh.phase === 'lobby' && !body.spectator) { /* phase changed meanwhile: fall through as spectator */ }
        const n = await one<{ n: number }>(q, 'select count(*)::int n from participants where game_id=$1 and is_spectator and not removed', [g.id]);
        if ((n?.n ?? 0) >= this.env.SPECTATOR_BUDGET_PER_ROOM) throw new HttpError(409, 'This room cannot take more spectators right now.', 'spectators_full');
      } else {
        const n = await one<{ n: number }>(q, 'select count(*)::int n from participants where game_id=$1 and not is_spectator and not removed', [g.id]);
        if ((n?.n ?? 0) >= Math.min(settings.maxPlayers, this.env.MAX_PLAYERS_PER_ROOM)) throw new HttpError(409, 'This room is full', 'full');
      }
      const taken = new Set((await many<{ nickname: string }>(q, 'select nickname from participants where game_id=$1', [g.id])).map((r) => r.nickname));
      const nickname = disambiguate(nick.nickname, taken);
      return one<any>(
        q,
        `insert into participants(game_id, user_id, nickname, avatar, token_hash, device_key, is_spectator, is_host_player)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, nickname, avatar, position, is_host_player`,
        [g.id, user?.id ?? null, nickname, JSON.stringify(avatar), sha256(token), deviceKey, asSpectator, isHostUser && !asSpectator],
      );
    });
    if (!asSpectator) {
      c.pendingJoined.push(this.toPublic(c, row));
      this.flushDeltaSoon(c);
    }
    return { participantToken: token, participantId: row.id as string, nickname: row.nickname as string, resumed: false, spectator: asSpectator };
  }

  async identify(gameId: string, auth: { token?: string; user?: AuthUser | null }): Promise<{ participant: any | null; canControl: boolean }> {
    let participant: any = null;
    if (auth.token) participant = await one<any>(this.db, 'select * from participants where game_id=$1 and token_hash=$2 and not removed', [gameId, sha256(auth.token)]) ?? null;
    const g = await this.getGame(gameId);
    const canControl = !!auth.user && g?.host_user_id === auth.user.id;
    return { participant, canControl };
  }

  async linkGuestToAccount(user: AuthUser, gameId: string, participantToken: string) {
    const r = await this.db.query('update participants set user_id=$3 where game_id=$1 and token_hash=$2 and (user_id is null or user_id=$3)', [gameId, sha256(participantToken), user.id]);
    if (!r.rowCount) throw new HttpError(403, 'We could not verify that guest session', 'not_owner');
  }

  // ---- presence --------------------------------------------------------------------------------
  attach(gameId: string, participantId: string | null) {
    const c = this.ctl(gameId);
    if (!participantId) return;
    const n = (c.presence.get(participantId) ?? 0) + 1;
    c.presence.set(participantId, n);
    if (n === 1) { c.pendingConn.set(participantId, true); this.flushDeltaSoon(c); }
  }
  detach(gameId: string, participantId: string | null) {
    const c = this.ctls.get(gameId);
    if (!c || !participantId) return;
    const n = (c.presence.get(participantId) ?? 1) - 1;
    if (n <= 0) { c.presence.delete(participantId); c.pendingConn.set(participantId, false); this.flushDeltaSoon(c); } else c.presence.set(participantId, n);
  }
  connectionCount(gameId: string) { return this.io?.sockets.adapter.rooms.get(SOCKET_ROOM(gameId))?.size ?? 0; }
  roomName = SOCKET_ROOM;

  private flushDeltaSoon(c: Controller) {
    if (c.deltaTimer) return;
    c.deltaTimer = setTimeout(() => {
      c.deltaTimer = undefined;
      const joined = c.pendingJoined.splice(0); const left = c.pendingLeft.splice(0);
      const connection = [...c.pendingConn.entries()].map(([id, connected]) => ({ id, connected })); c.pendingConn.clear();
      if (joined.length || left.length || connection.length) this.emit(c, { t: 'players:delta', joined, left, connection });
    }, 400);
    c.deltaTimer.unref?.();
  }

  // ---- room chat ---------------------------------------------------------------------------------
  /** 'between' keeps chat closed while a question is open so nobody can share answers; the host can open it fully or turn it off. */
  private chatOpen(c: Controller, phase: string) {
    if (c.chatMode === 'off') return false;
    const between = ['lobby', 'countdown', 'reveal', 'climb', 'paused', 'recovery_pause'];
    return c.chatMode === 'always' ? [...between, 'question_open'].includes(phase) : between.includes(phase);
  }
  chatState(gameId: string, participantId: string | null, canControl = false): ChatState {
    const c = this.ctl(gameId);
    return { mode: c.chatMode, messages: c.chat, muted: !!participantId && c.muted.has(participantId), ...(canControl ? { mutedIds: [...c.muted] } : {}) };
  }
  async chatSend(gameId: string, who: { participantId: string | null; spectator: boolean; canControl: boolean; userId: string | null }, raw: string): Promise<{ id: string }> {
    const c = this.ctl(gameId);
    const g = await this.getGame(gameId);
    if (!g) throw new HttpError(404, 'Game not found');
    if (c.chatMode === 'off') throw new HttpError(409, 'The host has turned chat off', 'chat_off');
    if (!this.chatOpen(c, g.phase)) throw new HttpError(409, g.phase === 'question_open' ? 'Chat reopens after this question' : 'Chat is closed right now', 'bad_phase');
    if (who.spectator || (!who.participantId && !who.canControl)) throw new HttpError(403, 'Spectators can read the chat but not write', 'forbidden');
    if (who.participantId && c.muted.has(who.participantId)) throw new HttpError(403, 'The host has muted you in chat', 'muted');
    const key = who.participantId ?? `host:${who.userId}`;
    const now = this.now();
    const recent = (c.chatTimes.get(key) ?? []).filter((t) => now - t < 10_000);
    if (recent.length >= 4 || (recent.length && now - recent[recent.length - 1]! < 600)) throw new HttpError(429, 'Slow down a little', 'rate_limited');
    const check = checkChatText(raw, 200);
    if (!check.ok) throw new HttpError(422, check.reason, 'chat_refused');
    let nick: string;
    if (who.participantId) {
      const p = await one<{ nickname: string }>(this.db, 'select nickname from participants where id=$1 and game_id=$2 and not removed', [who.participantId, gameId]);
      if (!p) throw new HttpError(403, 'You are not in this game', 'forbidden');
      nick = p.nickname;
    } else nick = await this.hostName(who.userId!);
    recent.push(now); c.chatTimes.set(key, recent);
    const msg: ChatMessage = { id: String(++c.chatSeq), at: now, from: who.participantId ?? 'host', nick, ...(who.canControl ? { host: true } : {}), text: check.text };
    c.chat.push(msg);
    if (c.chat.length > 100) c.chat.splice(0, c.chat.length - 100);
    this.io?.to(SOCKET_ROOM(gameId)).emit('chat', msg);
    return { id: msg.id };
  }
  /** Host moderation: open/close chat, mute a player, remove one message. Mode and mute changes are audited. */
  async chatAdmin(gameId: string, userId: string, cmd: 'mode' | 'mute' | 'delete', p: { mode?: ChatMode; participantId?: string; muted?: boolean; id?: string }) {
    const c = this.ctl(gameId);
    await this.mustHost(gameId, userId);
    const room = SOCKET_ROOM(gameId);
    if (cmd === 'mode' && p.mode) {
      c.chatMode = p.mode;
      await audit(this.db, { actorId: userId, action: 'host.chat_mode', entityType: 'game', entityId: gameId, gameId, detail: { mode: p.mode } });
      this.io?.to(room).emit('chat:mode', { mode: p.mode });
    } else if (cmd === 'mute' && p.participantId) {
      if (p.muted) c.muted.add(p.participantId); else c.muted.delete(p.participantId);
      await audit(this.db, { actorId: userId, action: p.muted ? 'host.chat_mute' : 'host.chat_unmute', entityType: 'participant', entityId: p.participantId, gameId });
      this.io?.to(room).emit('chat:muted', { participantId: p.participantId, muted: !!p.muted });
    } else if (cmd === 'delete' && p.id) {
      c.chat = c.chat.filter((m) => m.id !== p.id);
      this.io?.to(room).emit('chat:del', { id: p.id });
    } else throw new HttpError(400, 'Bad chat command', 'bad_cmd');
    return { ok: true };
  }

  /** Sticker reactions: fixed icon set, players only, between rounds only, 1 per 1.5 s each; batched into one broadcast. */
  async react(gameId: string, participantId: string, kind: ReactionKind) {
    const c = this.ctl(gameId);
    const g = await this.getGame(gameId);
    if (!g || !['lobby', 'countdown', 'reveal', 'paused'].includes(g.phase)) throw new HttpError(409, 'Stickers are sent between questions', 'bad_phase');
    const now = this.now();
    if (now - (c.lastReaction.get(participantId) ?? 0) < 1500) throw new HttpError(429, 'Easy there — one sticker at a time', 'rate_limited');
    c.lastReaction.set(participantId, now);
    if (c.pendingReactions.length < 40) c.pendingReactions.push({ id: participantId, kind });
    if (!c.reactionTimer) {
      c.reactionTimer = setTimeout(() => {
        c.reactionTimer = undefined;
        const items = c.pendingReactions.splice(0);
        if (items.length) this.io?.to(SOCKET_ROOM(gameId)).emit('reactions', { items });
      }, 350);
      c.reactionTimer.unref?.();
    }
    return { sent: true };
  }

  // ---- snapshots -------------------------------------------------------------------------------
  async snapshot(gameId: string, who: { participant: any | null; canControl: boolean }): Promise<RoomSnapshot> {
    const c = this.ctl(gameId);
    const g = await this.getGame(gameId);
    if (!g) throw new HttpError(404, 'Game not found');
    const rows = await this.playerRows(gameId);
    const settings = g.settings as GameSettings;
    const latest = await one<any>(this.db, `select r.*, gq.snapshot, gq.is_super from rounds r join game_questions gq on gq.id=r.game_question_id where r.game_id=$1 and r.status in ('open','closed','scored') order by r.round_seq desc limit 1`, [gameId]);
    let question: QuestionPublic | null = null; let lastResult: RoundResultEvent | null = null; let myChoice: string | null = null; let answered = 0;
    const validRounds = (await one<{ n: number }>(this.db, "select count(*)::int n from rounds where game_id=$1 and status='scored'", [gameId]))?.n ?? 0;
    if (latest) {
      if (latest.status === 'open' || latest.status === 'closed') {
        question = this.publicQuestion(latest, validRounds + 1);
        answered = (await one<{ n: number }>(this.db, 'select count(*)::int n from answers where round_id=$1', [latest.id]))?.n ?? 0;
        if (who.participant) myChoice = (await one<any>(this.db, 'select option_id from answers where round_id=$1 and participant_id=$2', [latest.id, who.participant.id]))?.option_id ?? null;
      } else if (['reveal', 'paused', 'recovery_pause', 'countdown', 'climb'].includes(g.phase)) {
        lastResult = await this.resultEvent(this.db, latest, g);
        if (who.participant) myChoice = (await one<any>(this.db, 'select option_id from answers where round_id=$1 and participant_id=$2', [latest.id, who.participant.id]))?.option_id ?? null;
      }
    }
    let finished: GameFinishedEvent | null = null;
    if (g.phase === 'finished') finished = await this.finishedEvent(this.db, g);
    let voting: RoomSnapshot['voting'] = null;
    if (g.voting) {
      const sl = await this.categories(g.voting.shortlist);
      const mine = who.participant ? (await one<any>(this.db, 'select category_ids from topic_votes where game_id=$1 and participant_id=$2', [gameId, who.participant.id]))?.category_ids ?? [] : [];
      voting = { open: !!g.voting.open && g.phase === 'lobby', shortlist: sl, myVote: mine };
    }
    let myStreak = 0;
    if (who.participant && !who.participant.is_spectator) {
      const recent = await many<{ outcome: string }>(this.db, "select o.outcome from round_outcomes o join rounds r on r.id=o.round_id where o.participant_id=$1 and r.status='scored' order by r.round_no desc limit 30", [who.participant.id]);
      for (const r of recent) { if (r.outcome === 'correct') myStreak++; else break; }
    }
    const role: RoomSnapshot['you']['role'] = who.participant ? (who.participant.is_spectator ? 'spectator' : 'player') : 'host';
    return {
      v: c.v, serverTime: this.now(), code: g.code, gameId, title: g.title, phase: g.phase, hostMode: g.host_mode, settings,
      scheduledAt: g.scheduled_at ? new Date(g.scheduled_at).toISOString() : null, timezone: g.timezone,
      you: { participantId: who.participant?.id ?? null, role, isHostPlayer: !!who.participant?.is_host_player, canControl: who.canControl },
      players: rows.map((r) => this.toPublic(c, r)), roundNo: validRounds, question, answeredCount: answered,
      myChoice, myAnswerAccepted: myChoice != null, lastResult,
      countdownEndsAt: g.phase === 'countdown' ? toMs(g.phase_deadline) : null, paused: g.paused, recovery: g.recovery, announcement: g.announcement,
      finished, voting, endedEarly: g.ended_early, myStreak,
    };
  }

  private publicQuestion(round: any, roundNo: number): QuestionPublic {
    const s = round.snapshot as QuestionSnapshot;
    return { roundId: round.id, roundNo, text: s.text, options: s.options, shuffleSalt: round.shuffle_salt, openedAt: toMs(round.opened_at)!, deadline: toMs(round.deadline)!, categoryName: s.categoryName, level: s.level, isSuper: !!round.is_super };
  }

  private async resultEvent(q: Queryable, round: any, g: any): Promise<RoundResultEvent> {
    const s = round.snapshot as QuestionSnapshot;
    const settings = g.settings as GameSettings;
    const outs = await many<any>(q, 'select participant_id as id, step_before as "from", step_after as "to", outcome from round_outcomes where round_id=$1', [round.id]);
    const counts = await many<{ option_id: string; n: number }>(q, 'select a.option_id, count(*)::int n from answers a join round_outcomes o on o.round_id=a.round_id and o.participant_id=a.participant_id where a.round_id=$1 group by a.option_id', [round.id]);
    const optionCounts: Record<string, number> = Object.fromEntries(s.options.map((o) => [o.id, 0]));
    for (const c of counts) optionCounts[c.option_id] = c.n;
    const answered = counts.reduce((t, c) => t + c.n, 0);
    // Positive-only highlights: who climbed most, and who leads the staircase. Never a "worst" list.
    const climbBy = outs.reduce((m, o) => Math.max(m, o.to - o.from), 0);
    const topClimbers = climbBy > 0 ? outs.filter((o) => o.to - o.from === climbBy).map((o) => o.id).slice(0, 3) : [];
    const leaderStep = outs.reduce((m, o) => Math.max(m, o.to), 0);
    const leaders = leaderStep > 0 ? outs.filter((o) => o.to === leaderStep).map((o) => o.id).slice(0, 3) : [];
    const pending = g.pending as { winners: string[] } | null;
    return {
      roundId: round.id, roundNo: round.round_no ?? 0, questionVersionId: s.versionId, correctOptionId: s.correctOptionId, correctText: s.options.find((o) => o.id === s.correctOptionId)?.text ?? '',
      explanation: s.explanation, reference: s.reference, standings: outs, finalePending: !!pending, pendingWinnerIds: pending?.winners ?? [],
      nextAt: g.phase === 'reveal' ? toMs(g.phase_deadline) : null,
      isSuper: !!round.is_super, optionCounts, unansweredCount: Math.max(0, outs.length - answered), playerTotal: outs.length,
      highlights: { topClimbers, climbBy, leaders, leaderStep: Math.min(leaderStep, settings.summitHeight) },
    };
  }

  private async finishedEvent(q: Queryable, g: any): Promise<GameFinishedEvent> {
    const rows = await many<any>(
      q,
      `select p.id, p.nickname, p.avatar, r.final_step as position, r.rank, r.is_winner, r.correct, r.wrong, r.unanswered
         from game_results r join participants p on p.id = r.participant_id where r.game_id=$1 order by r.rank, p.joined_at`, [g.id]);
    const valid = (await one<{ n: number }>(q, "select count(*)::int n from rounds where game_id=$1 and status='scored'", [g.id]))?.n ?? 0;
    const standings: FinalStanding[] = rows.map((r) => ({ id: r.id, nickname: r.nickname, avatar: r.avatar, position: r.position, rank: r.rank, isWinner: r.is_winner, correct: r.correct, wrong: r.wrong, unanswered: r.unanswered }));
    return { gameId: g.id, reason: g.end_reason, winners: standings.filter((s) => s.isWinner).map((s) => s.id), standings, validRounds: valid, summitHeight: (g.settings as GameSettings).summitHeight };
  }

  // ---- host commands ---------------------------------------------------------------------------
  async start(gameId: string, userId: string) {
    const c = this.ctl(gameId);
    return this.run(c, async () => {
      const g = await this.mustHost(gameId, userId);
      if (g.phase !== 'lobby') throw new HttpError(409, 'The game has already started or is not open', 'bad_phase');
      const settings = g.settings as GameSettings;
      const players = await this.playerRows(gameId);
      if (players.length < 2) throw new HttpError(409, 'At least two players are needed to start. You can practise solo instead.', 'need_players');
      if (g.voting?.open) await this.db.query(`update games set voting = jsonb_set(voting,'{open}','false') where id=$1`, [gameId]);

      const owners = (await many<any>(this.db, 'select user_id, device_key, id from participants where game_id=$1 and not is_spectator and not removed', [gameId]))
        .map((p) => (p.user_id ? `u:${p.user_id}` : p.device_key ?? `g:${p.id}`));
      const { pool, history } = await this.poolAndHistory(this.db, { categoryIds: g.category_ids, source: g.source, packId: g.pack_id }, g.host_user_id, owners);
      let quota: Record<string, number> | undefined;
      if (g.voting) {
        const votes = (await many<any>(this.db, 'select category_ids from topic_votes where game_id=$1', [gameId])).map((v) => v.category_ids as string[]);
        quota = quotaFromVotes(g.voting.shortlist, votes);
      }
      const sel = selectQuestions({
        pool, count: settings.questionLimit, categoryIds: g.source === 'pack' ? [...new Set(pool.map((p) => p.categoryId))] : g.category_ids,
        minLevel: g.source === 'pack' ? 1 : g.min_level, maxLevel: g.source === 'pack' ? 10 : g.max_level, historyCanonicalIds: history,
        allowHistoryReuse: g.allow_history_reuse || g.source === 'pack', categoryQuota: quota, seed: `${gameId}:${g.code}`,
      });
      if (sel.shortage > 0) {
        throw new HttpError(409, `Only ${sel.selected.length} suitable questions are available for ${settings.questionLimit} rounds.`, 'shortage', { eligible: sel.eligible, fresh: sel.fresh, needed: settings.questionLimit, usable: sel.selected.length });
      }
      const snaps = await snapshotsFor(this.db, [...sel.selected, ...sel.reserve].map((x) => x.versionId));
      const deadline = new Date(this.now() + this.scale(COUNTDOWN_S * 1000));
      // One super question, hidden until it opens: chosen deterministically from rounds 3..60% of the game.
      let superSeq = -1;
      if (settings.superQuestion) {
        const lo = Math.min(3, settings.questionLimit), hi = Math.max(lo, Math.ceil(settings.questionLimit * 0.6));
        superSeq = lo + Math.floor(mulberry32(hashString(`${gameId}:super`))() * (hi - lo + 1));
      }
      await this.db.tx(async (q) => {
        let seq = 1;
        for (const [role, list] of [['main', sel.selected], ['reserve', sel.reserve]] as const) {
          for (const p of list) {
            await q.query(
              'insert into game_questions(game_id, seq, question_version_id, canonical_id, snapshot, role, is_super) values ($1,$2,$3,$4,$5,$6,$7)',
              [gameId, seq, p.versionId, p.canonicalId, JSON.stringify(snaps.get(p.versionId)), role, role === 'main' && seq === superSeq]);
            seq++;
          }
        }
        await q.query("update games set phase='countdown', started_at=now(), phase_deadline=$2, version=version+1, announcement=null where id=$1", [gameId, deadline]);
        await audit(q, { actorId: userId, action: 'game.start', entityType: 'game', entityId: gameId, gameId, detail: { players: players.length, early: g.scheduled_at ? new Date(g.scheduled_at).getTime() > this.now() : false } });
      });
      this.emit(c, { t: 'phase', phase: 'countdown', countdownEndsAt: deadline.getTime(), paused: false });
      this.schedule(c, deadline.getTime(), () => this.openRound(gameId));
      return { startedAt: this.now() };
    });
  }

  private async openRound(gameId: string): Promise<void> {
    const c = this.ctl(gameId);
    const g = await this.getGame(gameId);
    if (!g || ['finished', 'cancelled', 'expired'].includes(g.phase)) return;
    if (g.paused) { await this.setPaused(c, g); return; }
    const settings = g.settings as GameSettings;
    const nextQ = await one<any>(this.db, "select * from game_questions where game_id=$1 and status='queued' order by (role='main') desc, seq limit 1", [gameId]);
    if (!nextQ) { await this.finalise(c, g, 'question_shortage'); return; }
    const opened = this.now();
    const deadline = opened + this.scale(settings.timeLimitS * 1000);
    const salt = newToken().slice(0, 12);
    const validRounds = (await one<{ n: number }>(this.db, "select count(*)::int n from rounds where game_id=$1 and status='scored'", [gameId]))?.n ?? 0;
    const round = await this.db.tx(async (q) => {
      const seq = g.round_seq + 1;
      const r = await one<any>(q, 'insert into rounds(game_id, round_seq, game_question_id, shuffle_salt, opened_at, deadline) values ($1,$2,$3,$4,$5,$6) returning *', [gameId, seq, nextQ.id, salt, new Date(opened), new Date(deadline)]);
      await q.query("update game_questions set status='used' where id=$1", [nextQ.id]);
      await q.query("update games set phase='question_open', round_seq=$2, phase_deadline=$3, version=version+1, announcement=null, recovery=false where id=$1", [gameId, seq, new Date(deadline)]);
      return r;
    });
    c.answered.clear();
    c.currentRound = { id: round.id, deadline };
    this.emit(c, { t: 'round:open', question: this.publicQuestion({ ...round, snapshot: nextQ.snapshot, is_super: nextQ.is_super }, validRounds + 1) });
    this.schedule(c, deadline + this.env.ANSWER_GRACE_MS, () => this.closeAndScore(gameId, round.id));
  }

  /** Accept an answer. Persisted before it is acknowledged; idempotent per (round, participant). */
  async submitAnswer(gameId: string, participantId: string, roundId: string, optionId: string, receivedAt = this.now()) {
    const c = this.ctl(gameId);
    const cur = c.currentRound;
    if (!cur || cur.id !== roundId) throw new HttpError(409, 'That question is no longer open', 'stale_round');
    if (!isWithinWindow(receivedAt, cur.deadline, this.env.ANSWER_GRACE_MS)) throw new HttpError(409, 'Time is up for this question', 'late');
    const ins = await this.db.query(
      `insert into answers(round_id, participant_id, option_id)
       select r.id, p.id, $3 from rounds r, participants p
        where r.id=$1 and r.status='open' and p.id=$2 and p.game_id=r.game_id and not p.is_spectator and not p.removed
       on conflict (round_id, participant_id) do nothing returning option_id`,
      [roundId, participantId, optionId]);
    if (ins.rowCount) {
      c.answered.add(participantId);
      this.scheduleCount(c);
      return { accepted: true, optionId, duplicate: false };
    }
    const prior = await one<{ option_id: string }>(this.db, 'select option_id from answers where round_id=$1 and participant_id=$2', [roundId, participantId]);
    if (prior) {
      if (prior.option_id === optionId) return { accepted: true, optionId, duplicate: true };
      throw new HttpError(409, 'Your first answer is locked in', 'already_answered', { optionId: prior.option_id });
    }
    throw new HttpError(409, 'That question is closed', 'closed');
  }

  private scheduleCount(c: Controller) {
    if (c.countTimer) return;
    c.countTimer = setTimeout(async () => {
      c.countTimer = undefined;
      if (!c.currentRound) return;
      const total = (await one<{ n: number }>(this.db, 'select count(*)::int n from participants where game_id=$1 and not is_spectator and not removed', [c.gameId]))?.n ?? 0;
      this.emit(c, { t: 'answers:count', roundId: c.currentRound.id, answered: c.answered.size, total });
    }, 1000);
    c.countTimer.unref?.();
  }

  private async closeAndScore(gameId: string, roundId: string): Promise<void> {
    const c = this.ctl(gameId);
    await this.db.query("update rounds set status='closed', closed_at=now() where id=$1 and status='open'", [roundId]);
    c.currentRound = undefined;
    await this.scoreRoundTx(c, roundId);
  }

  /** Atomic, idempotent scoring: guarded by the closed→scored transition. */
  private async scoreRoundTx(c: Controller, roundId: string): Promise<void> {
    const gameId = c.gameId;
    const g0 = await this.getGame(gameId);
    if (!g0) return;
    const settings = g0.settings as GameSettings;
    const hold = g0.host_mode === 'audience' ? FINALE_REVIEW_MS.audience : FINALE_REVIEW_MS.competing;
    const out = await this.db.tx(async (q) => {
      const claimed = await q.query("update rounds set status='scored', scored_at=now() where id=$1 and status='closed' returning id", [roundId]);
      if (!claimed.rowCount) return null; // already scored (idempotent)
      const round = await one<any>(q, 'select r.*, gq.snapshot, gq.is_super from rounds r join game_questions gq on gq.id=r.game_question_id where r.id=$1', [roundId]);
      const snap = round.snapshot as QuestionSnapshot;
      const players = await many<any>(q, 'select p.id, p.position, a.option_id as chosen from participants p left join answers a on a.round_id=$1 and a.participant_id=p.id where p.game_id=$2 and not p.is_spectator and not p.removed', [roundId, gameId]);
      const scored = scoreRound(players.map((p) => ({ id: p.id, position: p.position, chosen: p.chosen ?? null })), snap.correctOptionId, { gentle: !!settings.gentle, superRound: !!round.is_super, summit: settings.summitHeight });
      if (scored.length) {
        await q.query(
          'insert into round_outcomes(round_id, participant_id, outcome, step_before, step_after) select $1, * from unnest($2::uuid[], $3::text[], $4::int[], $5::int[])',
          [roundId, scored.map((s) => s.id), scored.map((s) => s.outcome), scored.map((s) => s.from), scored.map((s) => s.to)]);
        await q.query('update participants p set position = v.pos from (select unnest($1::uuid[]) id, unnest($2::int[]) pos) v where p.id = v.id', [scored.map((s) => s.id), scored.map((s) => s.to)]);
      }
      const validRounds = (await one<{ n: number }>(q, "select count(*)::int n from rounds where game_id=$1 and status='scored'", [gameId]))!.n;
      await q.query('update rounds set round_no=$2 where id=$1', [roundId, validRounds]);
      const evalr = evaluateAfterRound({ positions: scored.map((s) => ({ id: s.id, position: s.to })), summitHeight: settings.summitHeight, validRoundsPlayed: validRounds, questionLimit: settings.questionLimit });
      const revealMs = this.scale(REVEAL_MS);
      const until = this.now() + revealMs + (evalr.finished ? this.scale(hold) : 0);
      const pending = evalr.finished ? { reason: evalr.reason, winners: evalr.winners, until } : null;
      await q.query("update games set phase='reveal', phase_deadline=$2, pending=$3, version=version+1 where id=$1", [gameId, new Date(until), pending ? JSON.stringify(pending) : null]);
      return { round: { ...round, round_no: validRounds }, scored, pending, until };
    });
    if (!out) return;
    const g = await this.getGame(gameId);
    const result = await this.resultEvent(this.db, out.round, g);
    result.nextAt = out.until;
    this.emit(c, { t: 'round:result', result });
    this.schedule(c, out.until, () => this.afterReveal(gameId));
  }

  private async afterReveal(gameId: string): Promise<void> {
    const c = this.ctl(gameId);
    const g = await this.getGame(gameId);
    if (!g || g.phase !== 'reveal') return;
    if (g.pending) { await this.finalise(c, g, g.pending.reason); return; }
    if (g.paused) { await this.setPaused(c, g); return; }
    await this.startCountdown(c, g);
  }

  private async startCountdown(c: Controller, g: any) {
    const deadline = this.now() + this.scale(COUNTDOWN_S * 1000);
    await this.db.query("update games set phase='countdown', phase_deadline=$2, version=version+1 where id=$1", [g.id, new Date(deadline)]);
    this.emit(c, { t: 'phase', phase: 'countdown', countdownEndsAt: deadline, paused: false });
    this.schedule(c, deadline, () => this.openRound(g.id));
  }

  private async setPaused(c: Controller, g: any, announcement?: string) {
    await this.db.query("update games set phase='paused', paused=true, version=version+1, announcement=coalesce($2, announcement) where id=$1", [g.id, announcement ?? null]);
    this.emit(c, { t: 'phase', phase: 'paused', paused: true });
  }

  private async finalise(c: Controller, g: any, reason: 'summit' | 'question_limit' | 'ended_early' | 'question_shortage') {
    if (c.timer) clearTimeout(c.timer);
    const done = await this.db.tx(async (q) => {
      const claimed = await q.query("update games set phase='finished', finished_at=now(), end_reason=$2, ended_early=$3, pending=null, paused=false, version=version+1 where id=$1 and phase <> 'finished' returning id", [g.id, reason, reason === 'ended_early']);
      if (!claimed.rowCount) return false;
      const players = await many<any>(q, 'select id, position, user_id, device_key from participants where game_id=$1 and not is_spectator and not removed', [g.id]);
      const stats = await many<any>(
        q,
        `select o.participant_id as id, count(*) filter (where o.outcome='correct')::int correct, count(*) filter (where o.outcome='wrong')::int wrong, count(*) filter (where o.outcome='unanswered')::int unanswered
           from round_outcomes o join rounds r on r.id=o.round_id where r.game_id=$1 and r.status='scored' group by o.participant_id`, [g.id]);
      const settings = g.settings as GameSettings;
      const winners = reason === 'summit' ? players.filter((p) => p.position >= settings.summitHeight).map((p) => p.id) : highest(players);
      const ranked = rankByStep(players);
      for (const r of ranked) {
        const s = stats.find((x) => x.id === r.item.id);
        await q.query('insert into game_results(game_id, participant_id, final_step, rank, is_winner, correct, wrong, unanswered) values ($1,$2,$3,$4,$5,$6,$7,$8)',
          [g.id, r.item.id, r.item.position, r.rank, players.length > 0 && winners.includes(r.item.id), s?.correct ?? 0, s?.wrong ?? 0, s?.unanswered ?? 0]);
      }
      // Freshness history (best-effort, keyed by account or device).
      const canon = await many<{ canonical_id: string }>(q, "select gq.canonical_id from game_questions gq join rounds r on r.game_question_id=gq.id where gq.game_id=$1 and r.status='scored'", [g.id]);
      const owners = new Set<string>([`h:${g.host_user_id}`]);
      for (const p of players) owners.add(p.user_id ? `u:${p.user_id}` : p.device_key ?? `g:${p.id}`);
      for (const o of owners) {
        if (!canon.length) break;
        await q.query('insert into usage_history(owner_key, canonical_id, game_id) select $1, unnest($2::uuid[]), $3 on conflict (owner_key, canonical_id) do update set used_at = now()', [o, canon.map((x) => x.canonical_id), g.id]);
      }
      await audit(q, { actorId: null, actorLabel: 'system', action: 'game.finish', entityType: 'game', entityId: g.id, gameId: g.id, detail: { reason, winners: winners.length } });
      return true;
    });
    if (!done) return;
    const row = await this.getGame(g.id);
    this.emit(c, { t: 'game:finished', finished: await this.finishedEvent(this.db, row) });
    c.currentRound = undefined;
    // Free the in-memory controller later so late reconnects still get consistent v.
    setTimeout(() => { if (!this.stopped) this.ctls.delete(g.id); }, 10 * 60_000).unref?.();
  }

  // ---- audience / competing host controls ---------------------------------------------------------
  async control(gameId: string, userId: string, cmd: 'pause' | 'resume' | 'next' | 'end' | 'closeVoting', _arg?: unknown) {
    const c = this.ctl(gameId);
    return this.run(c, async () => {
      const g = await this.mustHost(gameId, userId);
      const audience = g.host_mode === 'audience';
      if (cmd === 'closeVoting') {
        if (g.phase !== 'lobby' || !g.voting) throw new HttpError(409, 'Voting is not open', 'bad_phase');
        await this.db.query(`update games set voting = jsonb_set(voting,'{open}','false'), version=version+1 where id=$1`, [gameId]);
        await audit(this.db, { actorId: userId, action: 'game.voting_closed', entityType: 'game', entityId: gameId, gameId });
        this.emit(c, { t: 'phase', phase: 'lobby' });
        return;
      }
      // A competing host may only resume after a server recovery; everything else is audience-host only.
      if (!audience && !(cmd === 'resume' && g.phase === 'recovery_pause')) throw new HttpError(403, 'Competing hosts cannot control a running game', 'forbidden');
      switch (cmd) {
        case 'pause':
          if (!['question_open', 'reveal', 'countdown'].includes(g.phase)) throw new HttpError(409, 'You can pause while a round is running', 'bad_phase');
          await this.db.query('update games set paused=true, version=version+1 where id=$1', [gameId]);
          await audit(this.db, { actorId: userId, action: 'host.pause', entityType: 'game', entityId: gameId, gameId });
          this.emit(c, { t: 'phase', phase: g.phase, paused: true });
          return;
        case 'resume':
        case 'next': {
          if (g.phase === 'recovery_pause') return this.resumeFromRecovery(c, g, userId);
          if (g.phase !== 'paused' && !(cmd === 'resume' && g.paused)) throw new HttpError(409, 'The game is not paused', 'bad_phase');
          if (cmd === 'resume') await this.db.query('update games set paused=false, announcement=null, version=version+1 where id=$1', [gameId]);
          await audit(this.db, { actorId: userId, action: `host.${cmd}`, entityType: 'game', entityId: gameId, gameId });
          if (g.phase === 'paused') {
            const fresh = await this.getGame(gameId);
            // `next` runs exactly one round and pauses again afterwards (paused flag stays set).
            const deadline = this.now() + this.scale(COUNTDOWN_S * 1000);
            await this.db.query("update games set phase='countdown', phase_deadline=$2, version=version+1 where id=$1", [gameId, new Date(deadline)]);
            this.emit(c, { t: 'phase', phase: 'countdown', countdownEndsAt: deadline, paused: fresh.paused && cmd === 'next' });
            this.schedule(c, deadline, async () => {
              const again = await this.getGame(gameId);
              if (cmd === 'next') await this.runOneRound(c, again); else await this.openRound(gameId);
            });
          } else this.emit(c, { t: 'phase', phase: g.phase, paused: false });
          return;
        }
        case 'end': {
          if (!['countdown', 'question_open', 'reveal', 'paused', 'recovery_pause'].includes(g.phase)) throw new HttpError(409, 'Nothing to end', 'bad_phase');
          if (g.phase === 'question_open') await this.db.query("update rounds set status='voided', void_reason='ended early' where game_id=$1 and status='open'", [gameId]);
          await audit(this.db, { actorId: userId, action: 'host.end_early', entityType: 'game', entityId: gameId, gameId });
          c.currentRound = undefined;
          await this.finalise(c, g, 'ended_early');
          return;
        }
      }
    });
  }

  /** `next` from a paused state: open one round without clearing the pause flag. */
  private async runOneRound(c: Controller, g: any) {
    await this.db.query('update games set paused=false where id=$1', [g.id]);
    await this.openRound(g.id);
    await this.db.query('update games set paused=true where id=$1', [g.id]);
  }

  private async resumeFromRecovery(c: Controller, g: any, userId: string) {
    await audit(this.db, { actorId: userId, action: 'game.recovery_resume', entityType: 'game', entityId: g.id, gameId: g.id });
    const latest = await one<any>(this.db, `select r.*, gq.snapshot, gq.is_super from rounds r join game_questions gq on gq.id=r.game_question_id where r.game_id=$1 and r.status in ('open','closed','scored') order by r.round_seq desc limit 1`, [g.id]);
    await this.db.query('update games set recovery=false where id=$1', [g.id]);
    const settings = g.settings as GameSettings;
    if (latest?.status === 'open') {
      // Answers were not exposed: give a fair full window; accepted answers are retained and stay locked.
      const deadline = this.now() + this.scale(settings.timeLimitS * 1000);
      await this.db.query("update rounds set deadline=$2 where id=$1", [latest.id, new Date(deadline)]);
      await this.db.query("update games set phase='question_open', phase_deadline=$2, version=version+1 where id=$1", [g.id, new Date(deadline)]);
      const valid = (await one<{ n: number }>(this.db, "select count(*)::int n from rounds where game_id=$1 and status='scored'", [g.id]))!.n;
      c.currentRound = { id: latest.id, deadline };
      c.answered = new Set((await many<any>(this.db, 'select participant_id from answers where round_id=$1', [latest.id])).map((x) => x.participant_id));
      this.emit(c, { t: 'round:open', question: this.publicQuestion({ ...latest, deadline: new Date(deadline) }, valid + 1) });
      this.schedule(c, deadline + this.env.ANSWER_GRACE_MS, () => this.closeAndScore(g.id, latest.id));
    } else if (latest?.status === 'closed') {
      await this.scoreRoundTx(c, latest.id);
    } else if (latest?.status === 'scored' && g.pending) {
      const until = this.now() + this.scale(FINALE_REVIEW_MS.audience);
      await this.db.query("update games set phase='reveal', phase_deadline=$2, version=version+1 where id=$1", [g.id, new Date(until)]);
      this.emit(c, { t: 'phase', phase: 'reveal', recovery: false });
      this.schedule(c, until, () => this.afterReveal(g.id));
    } else {
      await this.startCountdown(c, g);
    }
  }

  async announce(gameId: string, userId: string, message: string) {
    const c = this.ctl(gameId);
    return this.run(c, async () => {
      const g = await this.mustHost(gameId, userId);
      if (g.host_mode !== 'audience') throw new HttpError(403, 'Only an audience host can announce', 'forbidden');
      if (g.phase === 'question_open') throw new HttpError(409, 'Announcements are sent between questions', 'bad_phase');
      const clean = plainText(message).slice(0, 200);
      if (!clean) throw new HttpError(400, 'Message is empty');
      await this.db.query('update games set announcement=$2, version=version+1 where id=$1', [gameId, clean]);
      await audit(this.db, { actorId: userId, action: 'host.announce', entityType: 'game', entityId: gameId, gameId, detail: { message: clean } });
      this.emit(c, { t: 'announce', message: clean });
    });
  }

  /** Void an open or just-revealed question (audience host only), reverse its effects, and replace it. */
  async voidCurrent(gameId: string, userId: string, reason: string) {
    const c = this.ctl(gameId);
    return this.run(c, async () => {
      const g = await this.mustHost(gameId, userId);
      if (g.host_mode !== 'audience') throw new HttpError(403, 'Only an audience host can void a question', 'forbidden');
      if (!['question_open', 'reveal'].includes(g.phase)) throw new HttpError(409, 'You can void a question while it is open or just revealed', 'bad_phase');
      const round = await one<any>(this.db, "select * from rounds where game_id=$1 and status in ('open','scored') order by round_seq desc limit 1", [gameId]);
      if (!round) throw new HttpError(409, 'No question to void');
      if (c.timer) clearTimeout(c.timer);
      await this.db.tx(async (q) => {
        if (round.status === 'scored') {
          await q.query('update participants p set position = o.step_before from round_outcomes o where o.round_id=$1 and o.participant_id=p.id', [round.id]);
        }
        await q.query("update rounds set status='voided', void_reason=$2, round_no=null where id=$1", [round.id, reason]);
        const gq = await one<any>(q, 'select is_super from game_questions where id=$1', [round.game_question_id]);
        await q.query("update game_questions set status='voided', is_super=false where id=$1", [round.game_question_id]);
        // The super question must survive a void: its replacement becomes the super question.
        if (gq?.is_super) await q.query("update game_questions set is_super=true where id = (select id from game_questions where game_id=$1 and status='queued' order by (role='main') desc, seq limit 1)", [gameId]);
        await q.query('update games set pending=null, version=version+1 where id=$1', [gameId]);
        await audit(q, { actorId: userId, action: 'host.void_question', entityType: 'round', entityId: round.id, gameId, detail: { reason, wasScored: round.status === 'scored' } });
      });
      c.currentRound = undefined; c.answered.clear();
      this.emit(c, { t: 'round:voided', roundId: round.id, reason });
      const replacement = await one(this.db, "select 1 from game_questions where game_id=$1 and status='queued'", [gameId]);
      if (replacement) {
        await this.startCountdown(c, await this.getGame(gameId));
      } else {
        await this.setPaused(c, await this.getGame(gameId), 'No replacement question is available. You can end the quiz using the valid rounds played so far.');
      }
    });
  }

  async kick(gameId: string, userId: string, participantId: string) {
    const c = this.ctl(gameId);
    return this.run(c, async () => {
      const g = await this.mustHost(gameId, userId);
      if (g.host_mode === 'competing' && g.phase !== 'lobby') throw new HttpError(403, 'Competing hosts can only remove players from the lobby', 'forbidden');
      const p = await one<any>(this.db, 'select id, is_host_player from participants where id=$1 and game_id=$2 and not removed', [participantId, gameId]);
      if (!p) throw new HttpError(404, 'Player not found');
      if (p.is_host_player) throw new HttpError(400, 'You cannot remove yourself');
      await this.db.query('update participants set removed=true where id=$1', [participantId]);
      await audit(this.db, { actorId: userId, action: 'host.remove_player', entityType: 'participant', entityId: participantId, gameId });
      c.pendingLeft.push(participantId);
      this.flushDeltaSoon(c);
      // Tell and disconnect that participant's sockets.
      for (const s of (await this.io?.in(SOCKET_ROOM(gameId)).fetchSockets()) ?? []) {
        if (s.data.participantId === participantId) { s.emit('ev', { t: 'kicked', v: ++c.v }); s.disconnect(true); }
      }
    });
  }

  async vote(gameId: string, participantId: string, categoryIds: string[]) {
    const g = await this.getGame(gameId);
    if (!g?.voting?.open || g.phase !== 'lobby') throw new HttpError(409, 'Voting is closed', 'voting_closed');
    const allowed = new Set<string>(g.voting.shortlist);
    const ids = [...new Set(categoryIds)].filter((x) => allowed.has(x)).slice(0, 3);
    await this.db.query('insert into topic_votes(game_id, participant_id, category_ids) values ($1,$2,$3::uuid[]) on conflict (game_id, participant_id) do update set category_ids=excluded.category_ids', [gameId, participantId, ids]);
    return { ids };
  }

  // ---- results ---------------------------------------------------------------------------------
  async results(gameId: string, who: { participant: any | null; canControl: boolean }) {
    const g = await this.getGame(gameId);
    if (!g) throw new HttpError(404, 'Game not found');
    if (!who.participant && !who.canControl) throw new HttpError(403, 'Results are only visible to people who took part', 'forbidden');
    if (g.phase !== 'finished') throw new HttpError(409, 'The game has not finished yet', 'not_finished');
    const finished = await this.finishedEvent(this.db, g);
    let mine: any = null; let review: any[] = [];
    if (who.participant && !who.participant.is_spectator) {
      const rows = await many<any>(
        this.db,
        `select r.round_no, gq.snapshot, a.option_id as chosen, o.outcome, o.step_before, o.step_after
           from rounds r join game_questions gq on gq.id=r.game_question_id
           left join answers a on a.round_id=r.id and a.participant_id=$2
           left join round_outcomes o on o.round_id=r.id and o.participant_id=$2
          where r.game_id=$1 and r.status='scored' order by r.round_no`, [gameId, who.participant.id]);
      review = rows.map((r) => ({
        roundNo: r.round_no, text: r.snapshot.text, options: r.snapshot.options, correctOptionId: r.snapshot.correctOptionId, chosen: r.chosen, outcome: r.outcome,
        explanation: r.snapshot.explanation, reference: r.snapshot.reference, categoryName: r.snapshot.categoryName, from: r.step_before, to: r.step_after,
      }));
      mine = finished.standings.find((s) => s.id === who.participant.id) ?? null;
    }
    const breakdown = await many<any>(
      this.db,
      `select gq.snapshot->>'categoryName' as category, count(*)::int total, count(*) filter (where o.outcome='correct')::int correct
         from round_outcomes o join rounds r on r.id=o.round_id join game_questions gq on gq.id=r.game_question_id
        where r.game_id=$1 and r.status='scored' ${who.participant && !who.canControl ? 'and o.participant_id=$2' : ''} group by 1 order by 1`,
      who.participant && !who.canControl ? [gameId, who.participant.id] : [gameId]);
    return { finished, mine, review, breakdown, hostMode: g.host_mode, title: g.title, endedEarly: g.ended_early, canControl: who.canControl, code: g.code };
  }

  async csvExport(gameId: string, userId: string): Promise<string> {
    const { csvSafe } = await import('../repo/util');
    const g = await this.mustHost(gameId, userId);
    if (g.host_mode !== 'audience') throw new HttpError(403, 'Exports are for audience hosts', 'forbidden');
    if (g.phase !== 'finished') throw new HttpError(409, 'The game has not finished yet');
    const f = await this.finishedEvent(this.db, g);
    const lines = ['Rank,Nickname,Final step,Correct,Wrong,Unanswered,Winner'];
    for (const s of f.standings) lines.push([s.rank, csvSafe(s.nickname), s.position, s.correct, s.wrong, s.unanswered, s.isWinner ? 'yes' : 'no'].join(','));
    return lines.join('\n');
  }

  /** Audience hosts may preview the selected question set (never competing hosts or players). */
  async hostPreview(gameId: string, userId: string) {
    const g = await this.mustHost(gameId, userId);
    if (g.host_mode !== 'audience') throw new HttpError(403, 'Competing hosts cannot preview questions', 'forbidden');
    const rows = await many<any>(this.db, "select seq, role, status, snapshot from game_questions where game_id=$1 order by seq", [gameId]);
    return rows.map((r) => ({ seq: r.seq, role: r.role, status: r.status, text: r.snapshot.text, options: r.snapshot.options, correctOptionId: r.snapshot.correctOptionId }));
  }

  async rematch(gameId: string, userId: string) {
    const g = await this.mustHost(gameId, userId);
    if (g.phase !== 'finished') throw new HttpError(409, 'The game has not finished yet', 'not_finished');
    const u = await one<any>(this.db, 'select id, email, display_name, role from profiles where id=$1', [userId]);
    const next = await this.createGame({ id: u.id, email: u.email, displayName: u.display_name, role: u.role }, {
      title: g.title, hostMode: g.host_mode, source: g.source, packId: g.pack_id ?? undefined, categoryIds: g.category_ids, minLevel: g.min_level, maxLevel: g.max_level,
      settings: g.settings, scheduledAt: null, timezone: g.timezone, allowHistoryReuse: g.allow_history_reuse, topicVoting: !!g.voting, openNow: true,
    });
    await this.db.query('update games set rematch_of=$2 where id=$1', [next.game.id, gameId]);
    const c = this.ctl(gameId);
    this.io?.to(SOCKET_ROOM(gameId)).emit('rematch', { code: next.game.code });
    void c;
    return { code: next.game.code, gameId: next.game.id };
  }

  async rematchCode(gameId: string): Promise<string | null> {
    const r = await one<any>(this.db, "select code from games where rematch_of=$1 and phase not in ('cancelled','expired') order by created_at desc limit 1", [gameId]);
    return r?.code ?? null;
  }

  // ---- lifecycle -------------------------------------------------------------------------------
  /** On boot: any game that was mid-flight becomes a visible recovery pause. Nothing is auto-scored. */
  async recover(): Promise<number> {
    const r = await this.db.query("update games set phase='recovery_pause', recovery=true, version=version+1 where phase in ('countdown','question_open','reveal','climb','paused') returning id");
    return r.rowCount;
  }

  async sweep() {
    await this.db.query("update games set phase='expired', version=version+1 where phase in ('draft','lobby') and expires_at < now()");
    await this.db.query("delete from games where (phase in ('cancelled','expired') and created_at < now() - interval '7 days') or (phase='finished' and finished_at < now() - interval '90 days')");
    await this.db.query("delete from practice_sessions where created_at < now() - interval '30 days' and user_id is null");
  }

  async myGames(userId: string) {
    return many<any>(
      this.db,
      `select g.id, g.code, g.title, g.host_mode as "hostMode", g.phase, g.scheduled_at as "scheduledAt", g.timezone, g.created_at as "createdAt", g.settings,
              (select count(*)::int from participants p where p.game_id=g.id and not p.is_spectator and not p.removed) as "playerCount"
         from games g where g.host_user_id=$1 order by g.created_at desc limit 100`, [userId]);
  }

  async stop() {
    this.stopped = true;
    for (const c of this.ctls.values()) { if (c.timer) clearTimeout(c.timer); if (c.countTimer) clearTimeout(c.countTimer); if (c.deltaTimer) clearTimeout(c.deltaTimer); }
  }
}
