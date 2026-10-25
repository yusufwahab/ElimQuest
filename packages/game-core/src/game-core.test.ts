import { describe, expect, it } from 'vitest';
import {
  checkNickname, defaultSettings, disambiguate, evaluateAfterRound, feedbackMessage, highest, isWithinWindow,
  nextPosition, optionOrder, quotaFromVotes, rankByStep, sanitizeAvatar, scoreRound, selectQuestions, soloSucceeded,
  validateSettings, canTransition, type PoolQuestion,
} from './index';

describe('scoring', () => {
  it('correct = +1, wrong/unanswered = -1, floor zero', () => {
    expect(nextPosition(3, 'correct')).toBe(4);
    expect(nextPosition(3, 'wrong')).toBe(2);
    expect(nextPosition(3, 'unanswered')).toBe(2);
    expect(nextPosition(0, 'wrong')).toBe(0);
    expect(nextPosition(0, 'unanswered')).toBe(0);
  });
  it('scores a whole round independent of input order', () => {
    const players = [
      { id: 'a', position: 0, chosen: 'b' },
      { id: 'b', position: 5, chosen: null },
      { id: 'c', position: 9, chosen: 'a' },
    ];
    const r1 = scoreRound(players, 'a');
    const r2 = scoreRound([...players].reverse(), 'a');
    const by = (rs: typeof r1) => Object.fromEntries(rs.map((r) => [r.id, r]));
    expect(by(r1)).toEqual(by(r2));
    expect(by(r1).a).toMatchObject({ outcome: 'wrong', to: 0 });
    expect(by(r1).b).toMatchObject({ outcome: 'unanswered', to: 4 });
    expect(by(r1).c).toMatchObject({ outcome: 'correct', to: 10 });
  });
  it('uses no-descent wording at step 0', () => {
    expect(feedbackMessage({ outcome: 'wrong', from: 0, to: 0 }).detail).toBe('You stay at the starting step.');
    expect(feedbackMessage({ outcome: 'unanswered', from: 2, to: 1 }).title).toBe("Time's up");
  });
});

describe('ranking and winners', () => {
  it('uses competition ranking 1,1,3 without tie-breaking', () => {
    const r = rankByStep([{ position: 4 }, { position: 7 }, { position: 7 }, { position: 2 }]);
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3, 4]);
  });
  it('multiple players reaching the summit in one round are joint winners', () => {
    const e = evaluateAfterRound({
      positions: [{ id: 'a', position: 10 }, { id: 'b', position: 10 }, { id: 'c', position: 9 }],
      summitHeight: 10, validRoundsPlayed: 12, questionLimit: 20,
    });
    expect(e).toEqual({ finished: true, reason: 'summit', winners: ['a', 'b'] });
  });
  it('question limit: highest wins, ties shared', () => {
    const e = evaluateAfterRound({
      positions: [{ id: 'a', position: 6 }, { id: 'b', position: 6 }, { id: 'c', position: 1 }],
      summitHeight: 10, validRoundsPlayed: 20, questionLimit: 20,
    });
    expect(e.reason).toBe('question_limit');
    expect(e.winners.sort()).toEqual(['a', 'b']);
  });
  it('does not finish early', () => {
    expect(evaluateAfterRound({ positions: [{ id: 'a', position: 9 }], summitHeight: 10, validRoundsPlayed: 19, questionLimit: 20 }).finished).toBe(false);
  });
  it('solo needs the summit; no winners for empty field', () => {
    expect(soloSucceeded(10, 10)).toBe(true);
    expect(soloSucceeded(9, 10)).toBe(false);
    expect(highest([])).toEqual([]);
  });
});

describe('settings', () => {
  it('defaults: summit = min(10, questions) and separate from question count', () => {
    expect(defaultSettings().summitHeight).toBe(10);
    expect(defaultSettings({ questionLimit: 10 }).summitHeight).toBe(10);
    expect(validateSettings(defaultSettings())).toEqual([]);
  });
  it('rejects summit above question limit and over-cap players', () => {
    expect(validateSettings({ ...defaultSettings({ questionLimit: 10 }), summitHeight: 12 })).not.toEqual([]);
    expect(validateSettings({ ...defaultSettings(), maxPlayers: 151 })).not.toEqual([]);
    expect(validateSettings({ ...defaultSettings(), maxPlayers: 100 }, 50)).not.toEqual([]);
  });
});

describe('time per question', () => {
  it('accepts any whole number of seconds from 5 to 120', () => {
    for (const t of [5, 6, 17, 30, 119, 120]) expect(validateSettings({ ...defaultSettings(), timeLimitS: t })).toEqual([]);
  });
  it('rejects under 5 s, over 120 s and fractions', () => {
    for (const t of [0, 4, 4.5, 121, -10]) expect(validateSettings({ ...defaultSettings(), timeLimitS: t }).join(' ')).toMatch(/Time per question/);
  });
});

describe('deadline and phases', () => {
  it('accepts exactly at the boundary, rejects after grace', () => {
    expect(isWithinWindow(1000, 1000, 0)).toBe(true);
    expect(isWithinWindow(1001, 1000, 0)).toBe(false);
    expect(isWithinWindow(1750, 1000, 750)).toBe(true);
    expect(isWithinWindow(1751, 1000, 750)).toBe(false);
  });
  it('state machine rejects illegal jumps', () => {
    expect(canTransition('lobby', 'question_open')).toBe(false);
    expect(canTransition('finished', 'lobby')).toBe(false);
    expect(canTransition('lobby', 'countdown')).toBe(true);
  });
});

const mk = (n: number, cat: string, level = 3): PoolQuestion[] =>
  Array.from({ length: n }, (_, i) => ({ versionId: `${cat}-v${i}`, canonicalId: `${cat}-c${i}`, categoryId: cat, level }));

describe('question selection', () => {
  it('never repeats a canonical id, even across versions', () => {
    const pool = [...mk(10, 'q'), { versionId: 'q-v0b', canonicalId: 'q-c0', categoryId: 'q', level: 3 }];
    const r = selectQuestions({ pool, count: 10, categoryIds: ['q'], minLevel: 1, maxLevel: 10, seed: 's' });
    expect(new Set(r.selected.map((x) => x.canonicalId)).size).toBe(r.selected.length);
    expect(r.shortage).toBe(0);
  });
  it('is deterministic for a seed', () => {
    const args = { pool: mk(30, 'q'), count: 10, categoryIds: ['q'], minLevel: 1, maxLevel: 10, seed: 'same' };
    expect(selectQuestions(args).selected).toEqual(selectQuestions(args).selected);
  });
  it('reports shortage instead of padding, and respects history unless reuse allowed', () => {
    const pool = mk(8, 'q');
    const hist = new Set(pool.slice(0, 5).map((p) => p.canonicalId));
    const base = { pool, count: 8, categoryIds: ['q'], minLevel: 1, maxLevel: 10, historyCanonicalIds: hist, seed: 'x' };
    const strict = selectQuestions(base);
    expect(strict.selected).toHaveLength(3);
    expect(strict.shortage).toBe(5);
    expect(selectQuestions({ ...base, allowHistoryReuse: true }).shortage).toBe(0);
  });
  it('filters by level range and category', () => {
    const pool = [...mk(5, 'a', 2), ...mk(5, 'b', 9)];
    const r = selectQuestions({ pool, count: 5, categoryIds: ['b'], minLevel: 5, maxLevel: 10, seed: 'x' });
    expect(r.selected.every((q) => q.categoryId === 'b' && q.level >= 5)).toBe(true);
  });
  it('redistributes an unfillable category quota', () => {
    const pool = [...mk(1, 'a'), ...mk(20, 'b')];
    const r = selectQuestions({ pool, count: 10, categoryIds: ['a', 'b'], minLevel: 1, maxLevel: 10, seed: 'x' });
    expect(r.selected).toHaveLength(10);
  });
  it('vote quota is deterministic and keeps a floor for every shortlisted topic', () => {
    const q = quotaFromVotes(['a', 'b', 'c'], [['a', 'b'], ['a'], ['b', 'a', 'c']]);
    expect(q.a).toBeGreaterThan(q.b!);
    expect(q.c).toBeGreaterThanOrEqual(1);
    expect(quotaFromVotes(['a', 'b'], [])).toEqual({ a: 1, b: 1 });
  });
});

describe('options, avatar, nickname', () => {
  it('option order is stable per player/salt but differs between players', () => {
    const opts = ['a', 'b', 'c', 'd'];
    expect(optionOrder(opts, 'p1', 's')).toEqual(optionOrder(opts, 'p1', 's'));
    expect(optionOrder(opts, 'p1', 's').slice().sort()).toEqual(opts);
  });
  it('avatar sanitiser falls back to defaults for junk', () => {
    expect(sanitizeAvatar({ body: 'hacker', eyes: 'happy' })).toMatchObject({ body: 'teal', eyes: 'happy' });
    expect(sanitizeAvatar(null).glasses).toBe('round');
  });
  it('nickname rules: reserved, blocked, markup, disambiguation', () => {
    expect(checkNickname('Host').ok).toBe(false);
    expect(checkNickname('4dm1n').ok).toBe(false);
    expect(checkNickname('Official Host').ok).toBe(false);
    expect(checkNickname('Ghost').ok).toBe(true);
    expect(checkNickname('Hostplayer').ok).toBe(true);
    expect(checkNickname('<b>x</b>').ok).toBe(false);
    expect(checkNickname('a').ok).toBe(false);
    expect(checkNickname('  Amina  ')).toEqual({ ok: true, nickname: 'Amina' });
    expect(disambiguate('Amina', new Set(['amina']))).toBe('Amina·2');
    expect(disambiguate('Amina', new Set(['amina', 'Amina·2']))).toBe('Amina·3');
  });
});
