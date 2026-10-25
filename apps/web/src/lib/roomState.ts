import type { RoomSnapshot, ServerEvent } from '@elimquest/contracts';

export type Conn = 'connecting' | 'live' | 'reconnecting' | 'denied' | 'removed';

export interface RoomState {
  snap: RoomSnapshot | null;
  v: number;
  conn: Conn;
  denyReason?: string;
  /** A sequence gap or stale connection was detected: the hook must fetch a fresh snapshot. */
  gap: boolean;
  /** serverTime - clientTime, from the latest snapshot. */
  offset: number;
  selection: string | null;
  sending: boolean;
  rematchCode: string | null;
  /** From/to positions of the latest result, for the scene to animate. `moveSeq` changes once per result. */
  movement: Record<string, { from: number; to: number }> | null;
  moveSeq: number;
}

export type RoomAction =
  | { type: 'snapshot'; snap: RoomSnapshot; receivedAt: number }
  | { type: 'event'; ev: ServerEvent }
  | { type: 'conn'; conn: Conn; reason?: string }
  | { type: 'select'; optionId: string | null }
  | { type: 'sending'; value: boolean }
  | { type: 'accepted'; optionId: string }
  | { type: 'rematch'; code: string };

export const initialRoomState: RoomState = { snap: null, v: 0, conn: 'connecting', gap: false, offset: 0, selection: null, sending: false, rematchCode: null, movement: null, moveSeq: 0 };

export function roomReducer(s: RoomState, a: RoomAction): RoomState {
  switch (a.type) {
    case 'snapshot':
      return {
        ...s, snap: a.snap, v: a.snap.v, gap: false, conn: 'live', offset: a.snap.serverTime - a.receivedAt,
        selection: a.snap.myChoice ?? (a.snap.question && s.snap?.question?.roundId === a.snap.question.roundId ? s.selection : null),
        sending: false,
      };
    case 'conn':
      return { ...s, conn: a.conn, denyReason: a.reason ?? s.denyReason };
    case 'select':
      return s.snap?.myAnswerAccepted ? s : { ...s, selection: a.optionId };
    case 'sending':
      return { ...s, sending: a.value };
    case 'accepted':
      return s.snap ? { ...s, sending: false, selection: a.optionId, snap: { ...s.snap, myChoice: a.optionId, myAnswerAccepted: true } } : s;
    case 'rematch':
      return { ...s, rematchCode: a.code };
    case 'event':
      return applyEvent(s, a.ev);
  }
}

function applyEvent(s: RoomState, ev: ServerEvent): RoomState {
  if (!s.snap) return s;                       // wait for the snapshot first
  if (ev.v <= s.v) return s;                   // stale or duplicate: ignore
  if (ev.v > s.v + 1) return { ...s, gap: true }; // missed something: resync (event not applied)
  const snap = s.snap;
  const base = { ...s, v: ev.v };
  switch (ev.t) {
    case 'phase':
      return { ...base, snap: { ...snap, phase: ev.phase, countdownEndsAt: ev.countdownEndsAt ?? (ev.phase === 'countdown' ? snap.countdownEndsAt : null), paused: ev.paused ?? snap.paused, recovery: ev.recovery ?? (ev.phase === 'recovery_pause') } };
    case 'round:open': {
      const same = snap.question?.roundId === ev.question.roundId;
      return {
        ...base, selection: same ? s.selection : null, sending: false,
        snap: { ...snap, phase: 'question_open', question: ev.question, lastResult: null, answeredCount: same ? snap.answeredCount : 0, myChoice: same ? snap.myChoice : null, myAnswerAccepted: same ? snap.myAnswerAccepted : false, announcement: null, recovery: false, roundNo: ev.question.roundNo - 1 },
      };
    }
    case 'answers:count':
      return snap.question?.roundId === ev.roundId ? { ...base, snap: { ...snap, answeredCount: ev.answered } } : base;
    case 'round:result': {
      const move: Record<string, { from: number; to: number }> = {};
      const byId = new Map(ev.result.standings.map((x) => [x.id, x]));
      for (const x of ev.result.standings) move[x.id] = { from: x.from, to: x.to };
      return {
        ...base, movement: move, moveSeq: s.moveSeq + 1, sending: false,
        snap: { ...snap, phase: 'reveal', lastResult: ev.result, roundNo: ev.result.roundNo, myStreak: byId.get(snap.you.participantId ?? '')?.outcome === 'correct' ? snap.myStreak + 1 : byId.has(snap.you.participantId ?? '') ? 0 : snap.myStreak, players: snap.players.map((p) => (byId.has(p.id) ? { ...p, position: byId.get(p.id)!.to } : p)) },
      };
    }
    case 'game:finished':
      return { ...base, snap: { ...snap, phase: 'finished', finished: ev.finished, paused: false } };
    case 'announce':
      return { ...base, snap: { ...snap, announcement: ev.message } };
    case 'round:voided':
      // Positions revert server-side; the replacement round (or a snapshot) follows immediately.
      return { ...base, gap: true, snap: { ...snap, question: null, lastResult: null, announcement: `That question was voided by the host: ${ev.reason}` } };
    case 'players:delta': {
      let players = snap.players.filter((p) => !ev.left.includes(p.id));
      for (const j of ev.joined) if (!players.some((p) => p.id === j.id)) players = [...players, j];
      players = players.map((p) => { const c = ev.connection.find((x) => x.id === p.id); return c ? { ...p, connected: c.connected } : p; });
      return { ...base, snap: { ...snap, players } };
    }
    case 'kicked':
      return { ...base, conn: 'removed' };
  }
}

/** Remaining ms until `deadline` (server clock) given our estimated offset. */
export const msLeft = (deadline: number, offset: number, now = Date.now()) => Math.max(0, deadline - (now + offset));
