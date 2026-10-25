import { randomInt } from 'node:crypto';
import { optionOrder, scoreRound, selectQuestions, soloSucceeded, feedbackMessage, type PoolQuestion } from '@elimquest/game-core';
import type { PracticeCreateInput } from '@elimquest/contracts';
import type { Env } from '../env';
import type { Db } from '../db/db';
import { HttpError, many, newToken, one, sha256, toMs } from '../repo/util';
import { loadPlatformPool, snapshotsFor, type QuestionSnapshot } from '../repo/content';
import type { AuthUser } from '../auth';

/**
 * Solo practice. Server-authoritative per question (deadline stored server-side), same scoring functions
 * as multiplayer, separate session identity. No simulated opponents, no rankings.
 */
export class PracticeService {
  constructor(private db: Db, private env: Env) {}
  private scale(ms: number) { return Math.max(5, Math.round(ms * this.env.TIMING_SCALE)); }

  async create(input: PracticeCreateInput, user: AuthUser | undefined, deviceId: string | undefined, guestToken: string | undefined) {
    const owner = user ? `u:${user.id}` : deviceId ? `d:${sha256(deviceId).slice(0, 32)}` : null;
    let pool: PoolQuestion[] = []; let snaps = new Map<string, QuestionSnapshot>(); let queue: { canonical_id: string; version_id: string; snapshot: QuestionSnapshot }[] = [];
    let categoryIds = input.categoryIds;
    if (input.mode === 'mistakes') {
      if (!input.sourceGameId) throw new HttpError(400, 'Choose a finished game to review', 'no_source');
      // Prove ownership: either the signed-in account took part, or the caller holds that guest session's token.
      const part = await one<any>(this.db, 'select id from participants where game_id=$1 and not is_spectator and (token_hash = $2 or user_id = $3)', [input.sourceGameId, guestToken ? sha256(guestToken) : '-', user?.id ?? null]);
      if (!part) throw new HttpError(403, 'You can only practise mistakes from games you played', 'not_owner');
      const rows = await many<any>(
        this.db,
        `select gq.snapshot from round_outcomes o join rounds r on r.id=o.round_id join game_questions gq on gq.id=r.game_question_id
          where r.game_id=$1 and o.participant_id=$2 and o.outcome <> 'correct' and r.status='scored' order by r.round_no`, [input.sourceGameId, part.id]);
      if (!rows.length) throw new HttpError(409, 'You answered everything correctly — nothing to practise!', 'no_mistakes');
      queue = rows.map((r) => ({ canonical_id: r.snapshot.canonicalId, version_id: r.snapshot.versionId, snapshot: r.snapshot }));
    } else {
      if (!categoryIds.length) throw new HttpError(400, 'Choose at least one topic', 'no_topics');
      pool = await loadPlatformPool(this.db, categoryIds, this.env.ALLOW_FIXTURE_QUESTIONS);
      const hist = owner ? new Set((await many<any>(this.db, "select canonical_id from usage_history where owner_key=$1 and used_at > now() - interval '60 days'", [owner])).map((r) => r.canonical_id)) : new Set<string>();
      const sel = selectQuestions({ pool, count: input.questionLimit, categoryIds, minLevel: input.minLevel, maxLevel: input.maxLevel, historyCanonicalIds: hist, allowHistoryReuse: false, seed: newToken() });
      let chosen = sel.selected;
      let reused = false;
      if (chosen.length < input.questionLimit) {
        // Solo only: fall back to reusing seen questions rather than blocking, and tell the player.
        const again = selectQuestions({ pool, count: input.questionLimit, categoryIds, minLevel: input.minLevel, maxLevel: input.maxLevel, historyCanonicalIds: hist, allowHistoryReuse: true, seed: newToken() });
        chosen = again.selected; reused = again.selected.length > sel.selected.length;
      }
      if (chosen.length < 3) throw new HttpError(409, `Only ${chosen.length} suitable questions are available for those settings.`, 'shortage', { usable: chosen.length });
      snaps = await snapshotsFor(this.db, chosen.map((c) => c.versionId));
      queue = chosen.map((c) => ({ canonical_id: c.canonicalId, version_id: c.versionId, snapshot: snaps.get(c.versionId)! }));
      void reused;
    }
    const limit = Math.min(input.questionLimit, queue.length);
    const settings = { questionLimit: limit, summitHeight: Math.min(input.summitHeight, limit), timeLimitS: input.timeLimitS, categoryIds, mode: input.mode, minLevel: input.minLevel, maxLevel: input.maxLevel, superQuestion: !!input.superQuestion, gentle: !!input.gentle };
    // One super question, hidden until it opens: somewhere in rounds 3..60%.
    const items = queue.slice(0, limit).map((x) => ({ ...x, isSuper: false }));
    if (settings.superQuestion && items.length >= 4) { const lo = 2, hi = Math.max(lo, Math.ceil(items.length * 0.6) - 1); items[randomInt(lo, hi + 1)]!.isSuper = true; }
    const token = newToken();
    const row = await one<any>(this.db, 'insert into practice_sessions(token_hash, user_id, mode, settings, queue) values ($1,$2,$3,$4,$5) returning id', [sha256(token), user?.id ?? null, input.mode, JSON.stringify(settings), JSON.stringify(items)]);
    return { id: row.id as string, token, settings, mode: input.mode, reusedWarning: input.mode === 'fresh' && queue.length < input.questionLimit ? `Only ${queue.length} questions matched, so the session is shorter.` : undefined };
  }

  private async load(id: string, token: string | undefined, user?: AuthUser) {
    const s = await one<any>(this.db, 'select * from practice_sessions where id=$1', [id]);
    if (!s) throw new HttpError(404, 'Practice session not found', 'not_found');
    const ok = (token && sha256(token) === s.token_hash) || (user && s.user_id === user.id);
    if (!ok) throw new HttpError(403, 'This practice session belongs to someone else', 'forbidden');
    return s;
  }

  private view(s: any) {
    const settings = s.settings;
    const cur = s.current as { idx: number; openedAt: number; deadline: number; salt: string } | null;
    let question = null;
    if (s.status === 'active' && cur) {
      const snap = (s.queue[cur.idx].snapshot) as QuestionSnapshot;
      question = { roundNo: s.round_no + 1, text: snap.text, options: snap.options, shuffleSalt: cur.salt, openedAt: cur.openedAt, deadline: cur.deadline, categoryName: snap.categoryName, level: snap.level, isSuper: !!s.queue[cur.idx].isSuper };
    }
    return { id: s.id, status: s.status, position: s.position, roundNo: s.round_no, settings, question, succeeded: s.succeeded, serverTime: Date.now(), history: s.status === 'finished' ? s.history : undefined };
  }

  async state(id: string, token: string | undefined, user?: AuthUser) {
    let s = await this.load(id, token, user);
    // Lazily settle an expired question as "unanswered".
    const cur = s.current;
    if (s.status === 'active' && cur && Date.now() > cur.deadline + this.env.ANSWER_GRACE_MS) {
      await this.answer(id, token, null, user, true);
      s = await this.load(id, token, user);
    }
    return this.view(s);
  }

  async nextQuestion(id: string, token: string | undefined, user?: AuthUser) {
    const s = await this.load(id, token, user);
    if (s.status !== 'active') throw new HttpError(409, 'This session is finished', 'finished');
    if (s.current) return this.view(s);
    const idx = s.round_no;
    const openedAt = Date.now();
    const deadline = openedAt + this.scale(s.settings.timeLimitS * 1000);
    const current = { idx, openedAt, deadline, salt: newToken().slice(0, 10) };
    await this.db.query('update practice_sessions set current=$2 where id=$1 and current is null', [id, JSON.stringify(current)]);
    return this.view(await this.load(id, token, user));
  }

  async answer(id: string, token: string | undefined, optionId: string | null, user?: AuthUser, forced = false) {
    const s = await this.load(id, token, user);
    const cur = s.current as { idx: number; openedAt: number; deadline: number } | null;
    if (s.status !== 'active' || !cur) throw new HttpError(409, 'No question is open', 'closed');
    const late = Date.now() > cur.deadline + this.env.ANSWER_GRACE_MS;
    const chosen = late || forced ? null : optionId;
    const q = s.queue[cur.idx];
    const snap = q.snapshot as QuestionSnapshot;
    const superRound = !!q.isSuper;
    const [r] = scoreRound([{ id: 'me', position: s.position, chosen }], snap.correctOptionId, { gentle: !!s.settings.gentle, superRound, summit: s.settings.summitHeight });
    const roundNo = s.round_no + 1;
    const settings = s.settings;
    const history = [...s.history, { roundNo, text: snap.text, options: snap.options, chosen, correctOptionId: snap.correctOptionId, outcome: r!.outcome, explanation: snap.explanation, reference: snap.reference, from: r!.from, to: r!.to, isSuper: superRound }];
    const reached = soloSucceeded(r!.to, settings.summitHeight);
    const finished = reached || roundNo >= settings.questionLimit;
    const upd = await this.db.query(
      "update practice_sessions set position=$2, round_no=$3, current=null, history=$4, status=$5, succeeded=$6 where id=$1 and current is not null and status='active'",
      [id, r!.to, roundNo, JSON.stringify(history), finished ? 'finished' : 'active', finished ? reached : null]);
    if (!upd.rowCount) throw new HttpError(409, 'That answer was already recorded', 'duplicate');
    if (finished && s.mode === 'fresh') {
      const owner = s.user_id ? `u:${s.user_id}` : null;
      if (owner) await this.db.query('insert into usage_history(owner_key, canonical_id) select $1, unnest($2::uuid[]) on conflict (owner_key, canonical_id) do update set used_at=now()', [owner, history.map((_, i) => s.queue[i].canonical_id)]);
    }
    const fb = feedbackMessage(r!, { gentle: !!s.settings.gentle, superRound });
    return {
      outcome: r!.outcome, from: r!.from, to: r!.to, title: fb.title, detail: fb.detail, correctOptionId: snap.correctOptionId,
      correctText: snap.options.find((o: any) => o.id === snap.correctOptionId)?.text, explanation: snap.explanation, reference: snap.reference,
      finished, succeeded: finished ? reached : null, roundNo, superRound, gentle: !!s.settings.gentle,
    };
  }

  async attachToAccount(id: string, token: string, user: AuthUser) {
    const s = await this.load(id, token);
    if (s.user_id && s.user_id !== user.id) throw new HttpError(403, 'Already saved to another account');
    await this.db.query('update practice_sessions set user_id=$2 where id=$1', [id, user.id]);
  }

  /** For tests/UI that need a client-side order preview. */
  static order<T>(opts: T[], who: string, salt: string) { return optionOrder(opts, who, salt); }
  static deadlineOf(cur: { deadline: number } | null) { return cur ? toMs(new Date(cur.deadline)) : null; }
}
