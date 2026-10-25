import { describe, expect, it } from 'vitest';
import { defaultSettings, feedbackMessage, nextPosition, rulesSummary, scoreRound, tensionCue, evaluateAfterRound } from './index';

describe('super question', () => {
  it('a correct answer climbs two steps regardless of position', () => {
    for (const from of [0, 1, 4, 7]) expect(nextPosition(from, 'correct', { superRound: true, summit: 10 })).toBe(from + 2);
  });
  it('is capped at the summit and never overshoots', () => {
    expect(nextPosition(9, 'correct', { superRound: true, summit: 10 })).toBe(10);
    expect(nextPosition(8, 'correct', { superRound: true, summit: 10 })).toBe(10);
  });
  it('a wrong or missed answer on the super question is a normal −1 (floor 0), not a bigger penalty', () => {
    expect(nextPosition(5, 'wrong', { superRound: true })).toBe(4);
    expect(nextPosition(0, 'unanswered', { superRound: true })).toBe(0);
  });
  it('is applied to everyone in the round, independent of order', () => {
    const ps = [{ id: 'a', position: 0, chosen: 'x' }, { id: 'b', position: 6, chosen: 'x' }, { id: 'c', position: 9, chosen: 'x' }, { id: 'd', position: 3, chosen: 'y' }];
    const r = scoreRound(ps, 'x', { superRound: true, summit: 10 });
    expect(r.map((x) => x.to)).toEqual([2, 8, 10, 2]);
    expect(scoreRound([...ps].reverse(), 'x', { superRound: true, summit: 10 }).map((x) => x.to).reverse()).toEqual([2, 8, 10, 2]);
  });
  it('players who jump to the summit in the same round are joint winners', () => {
    const r = scoreRound([{ id: 'a', position: 9, chosen: 'x' }, { id: 'b', position: 8, chosen: 'x' }, { id: 'c', position: 8, chosen: 'y' }], 'x', { superRound: true, summit: 10 });
    const e = evaluateAfterRound({ positions: r.map((x) => ({ id: x.id, position: x.to })), summitHeight: 10, validRoundsPlayed: 4, questionLimit: 20 });
    expect(e.winners.sort()).toEqual(['a', 'b']);
  });
  it('explains itself in feedback', () => {
    expect(feedbackMessage({ outcome: 'correct', from: 2, to: 4 }, { superRound: true })).toEqual({ title: 'Super question!', detail: 'Up two steps!' });
    expect(feedbackMessage({ outcome: 'correct', from: 9, to: 10 }, { superRound: true }).detail).toBe('Straight to the summit!');
  });
});

describe('gentle mode', () => {
  it('wrong and unanswered keep your step; correct still climbs', () => {
    expect(nextPosition(4, 'wrong', { gentle: true })).toBe(4);
    expect(nextPosition(4, 'unanswered', { gentle: true })).toBe(4);
    expect(nextPosition(4, 'correct', { gentle: true })).toBe(5);
  });
  it('classic default is unchanged', () => {
    expect(nextPosition(4, 'wrong')).toBe(3);
    expect(nextPosition(0, 'wrong')).toBe(0);
  });
  it('feedback never claims a descent', () => {
    expect(feedbackMessage({ outcome: 'wrong', from: 4, to: 4 }, { gentle: true }).detail).toBe('You stay on your step.');
    expect(feedbackMessage({ outcome: 'wrong', from: 0, to: 0 }, { gentle: true }).detail).toBe('You stay at the starting step.');
  });
});

describe('rules text describes house rules', () => {
  it('defaults to classic with no house rules', () => {
    const t = rulesSummary(defaultSettings()).join(' ');
    expect(t).toMatch(/down one step/); expect(t).not.toMatch(/super question/i); expect(t).not.toMatch(/Gentle/);
  });
  it('spells out Gentle mode and the super question', () => {
    const t = rulesSummary(defaultSettings({ gentle: true, superQuestion: true })).join(' ');
    expect(t).toMatch(/Gentle mode/); expect(t).toMatch(/super question/i); expect(t).toMatch(/two steps/); expect(t).not.toMatch(/down one step/);
  });
});

describe('tension cues', () => {
  it('celebrates being one step from the summit', () => {
    expect(tensionCue({ positions: [9, 3, 2], summit: 10, you: 9 })).toBe("You're one step from the summit!");
    expect(tensionCue({ positions: [9, 9, 3], summit: 10, you: 9 })).toBe('You and 1 other are one step from the summit!');
  });
  it('tells you when others are close, without naming anyone', () => {
    expect(tensionCue({ positions: [9, 4, 2], summit: 10, you: 4 })).toBe('1 player is one step from the summit!');
    expect(tensionCue({ positions: [9, 9, 4], summit: 10, you: 4 })).toBe('2 players are one step from the summit!');
  });
  it('covers two-steps-away and "right behind you"', () => {
    expect(tensionCue({ positions: [8, 2, 1], summit: 10, you: 8 })).toBe("You're two steps from the summit.");
    expect(tensionCue({ positions: [5, 4, 4, 1], summit: 12, you: 5 })).toBe('2 players are right behind you.');
  });
  it('is quiet when nothing is close', () => {
    expect(tensionCue({ positions: [0, 0, 1], summit: 10, you: 0 })).toBeNull();
    expect(tensionCue({ positions: [], summit: 10 })).toBeNull();
  });
});
