import { describe, expect, it } from 'vitest';
import type { RoomSnapshot, ServerEvent } from '@elimquest/contracts';
import { initialRoomState, msLeft, roomReducer, type RoomState } from './roomState';

const snap = (over: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  v: 100, serverTime: 5000, code: '123456', gameId: 'g', title: 't', phase: 'lobby', hostMode: 'competing',
  settings: { questionLimit: 10, summitHeight: 5, timeLimitS: 30, maxPlayers: 150 }, scheduledAt: null, timezone: 'UTC',
  you: { participantId: 'me', role: 'player', isHostPlayer: false, canControl: false },
  players: [{ id: 'me', nickname: 'Me', avatar: { body: 'teal', eyes: 'round', glasses: 'none', headwear: 'none', gear: 'none' }, position: 2, connected: true }, { id: 'p2', nickname: 'P2', avatar: { body: 'teal', eyes: 'round', glasses: 'none', headwear: 'none', gear: 'none' }, position: 0, connected: true }],
  roundNo: 0, question: null, answeredCount: 0, myChoice: null, myAnswerAccepted: false, lastResult: null, countdownEndsAt: null, paused: false, recovery: false,
  announcement: null, finished: null, voting: null, endedEarly: false, myStreak: 0, ...over,
});
const live = (): RoomState => roomReducer(initialRoomState, { type: 'snapshot', snap: snap(), receivedAt: 4000 });
const open = (v: number, roundId = 'r1'): ServerEvent => ({ t: 'round:open', v, question: { roundId, roundNo: 1, text: 'Q?', options: [{ id: 'a', text: 'A' }], shuffleSalt: 's', openedAt: 1, deadline: 99999 } });

describe('room reducer', () => {
  it('computes the server clock offset from the snapshot', () => {
    expect(live().offset).toBe(1000);
    expect(msLeft(10_000, 1000, 4000)).toBe(5000);
    expect(msLeft(10_000, 0, 20_000)).toBe(0);
  });
  it('ignores events before the first snapshot and stale/duplicate events', () => {
    expect(roomReducer(initialRoomState, { type: 'event', ev: open(1) }).snap).toBeNull();
    const s = live();
    expect(roomReducer(s, { type: 'event', ev: open(100) })).toBe(s);
    expect(roomReducer(s, { type: 'event', ev: open(50) })).toBe(s);
  });
  it('flags a sequence gap instead of applying the event', () => {
    const s = roomReducer(live(), { type: 'event', ev: open(105) });
    expect(s.gap).toBe(true);
    expect(s.snap!.question).toBeNull();
    expect(roomReducer(s, { type: 'snapshot', snap: snap({ v: 105 }), receivedAt: 1 }).gap).toBe(false);
  });
  it('applies round open → answer accepted → result with movement and position update', () => {
    let s = roomReducer(live(), { type: 'event', ev: open(101) });
    expect(s.snap!.phase).toBe('question_open');
    s = roomReducer(s, { type: 'select', optionId: 'a' });
    expect(s.selection).toBe('a');
    s = roomReducer(s, { type: 'accepted', optionId: 'a' });
    expect(s.snap!.myAnswerAccepted).toBe(true);
    s = roomReducer(s, { type: 'select', optionId: 'b' });          // locked after acceptance
    expect(s.selection).toBe('a');
    s = roomReducer(s, { type: 'event', ev: { t: 'round:result', v: 102, result: { roundId: 'r1', roundNo: 1, questionVersionId: 'v1', correctOptionId: 'a', correctText: 'A', explanation: 'x', reference: '', finalePending: false, pendingWinnerIds: [], nextAt: null, optionCounts: { a: 1 }, unansweredCount: 1, playerTotal: 2, highlights: { topClimbers: ['me'], climbBy: 1, leaders: ['me'], leaderStep: 3 }, standings: [{ id: 'me', from: 2, to: 3, outcome: 'correct' }, { id: 'p2', from: 0, to: 0, outcome: 'wrong' }] } } });
    expect(s.snap!.phase).toBe('reveal');
    expect(s.snap!.players.find((p) => p.id === 'me')!.position).toBe(3);
    expect(s.movement).toEqual({ me: { from: 2, to: 3 }, p2: { from: 0, to: 0 } });
    expect(s.moveSeq).toBe(1);
    expect(s.snap!.myStreak).toBe(1);                                  // streak grows on a correct answer
  });
  it('a streak resets on a miss and is display-only', () => {
    const res = (v: number, outcome: 'correct' | 'wrong') => ({ t: 'round:result', v, result: { roundId: 'r' + v, roundNo: v, questionVersionId: 'v', correctOptionId: 'a', correctText: 'A', explanation: '', reference: '', finalePending: false, pendingWinnerIds: [], nextAt: null, optionCounts: {}, unansweredCount: 0, playerTotal: 2, highlights: { topClimbers: [], climbBy: 0, leaders: [], leaderStep: 0 }, standings: [{ id: 'me', from: 2, to: outcome === 'correct' ? 3 : 1, outcome }] } }) as ServerEvent;
    let s = live();
    s = roomReducer(s, { type: 'event', ev: res(101, 'correct') }); s = roomReducer(s, { type: 'event', ev: res(102, 'correct') });
    expect(s.snap!.myStreak).toBe(2);
    s = roomReducer(s, { type: 'event', ev: res(103, 'wrong') });
    expect(s.snap!.myStreak).toBe(0);
  });
  it('a recovery re-open of the same round keeps the locked answer; a new round clears it', () => {
    let s = roomReducer(live(), { type: 'event', ev: open(101) });
    s = roomReducer(s, { type: 'accepted', optionId: 'b' });
    const again = roomReducer(s, { type: 'event', ev: open(102, 'r1') });
    expect(again.snap!.myAnswerAccepted).toBe(true);
    const next = roomReducer(again, { type: 'event', ev: open(103, 'r2') });
    expect(next.snap!.myAnswerAccepted).toBe(false);
    expect(next.selection).toBeNull();
  });
  it('merges roster deltas, removed players, connection flags, and handles being kicked', () => {
    let s = live();
    const joiner = { id: 'p3', nickname: 'P3', avatar: s.snap!.players[0]!.avatar, position: 0, connected: true };
    s = roomReducer(s, { type: 'event', ev: { t: 'players:delta', v: 101, joined: [joiner], left: ['p2'], connection: [{ id: 'me', connected: false }] } });
    expect(s.snap!.players.map((p) => p.id)).toEqual(['me', 'p3']);
    expect(s.snap!.players[0]!.connected).toBe(false);
    s = roomReducer(s, { type: 'event', ev: { t: 'kicked', v: 102 } });
    expect(s.conn).toBe('removed');
  });
  it('a voided question requests a resync and shows an explanation', () => {
    const s = roomReducer(roomReducer(live(), { type: 'event', ev: open(101) }), { type: 'event', ev: { t: 'round:voided', v: 102, roundId: 'r1', reason: 'faulty' } });
    expect(s.gap).toBe(true);
    expect(s.snap!.announcement).toMatch(/voided/);
  });
});
