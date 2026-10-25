export type Outcome = 'correct' | 'wrong' | 'unanswered';

export interface ScoreOptions {
  /** Wrong/unanswered = stay put instead of dropping. */
  gentle?: boolean;
  /** This is the super question: a correct answer climbs two steps. */
  superRound?: boolean;
  /** Cap climbs at the summit so a super jump can't overshoot it. */
  summit?: number;
}

export function outcomeFor(chosen: string | null | undefined, correctOptionId: string): Outcome {
  if (chosen == null) return 'unanswered';
  return chosen === correctOptionId ? 'correct' : 'wrong';
}

/** Correct: +1 (+2 on the super question, capped at the summit). Otherwise −1 with a floor of zero (0 in gentle mode). */
export function nextPosition(position: number, outcome: Outcome, o: ScoreOptions = {}): number {
  if (outcome === 'correct') {
    const up = position + (o.superRound ? 2 : 1);
    return o.summit != null ? Math.min(up, Math.max(position, o.summit)) : up;
  }
  return o.gentle ? position : Math.max(0, position - 1);
}

export interface PlayerRoundInput { id: string; position: number; chosen: string | null }
export interface PlayerRoundResult { id: string; outcome: Outcome; from: number; to: number }

/** Score a whole round at once. Input order never affects the result. */
export function scoreRound(players: PlayerRoundInput[], correctOptionId: string, o: ScoreOptions = {}): PlayerRoundResult[] {
  return players.map((p) => {
    const outcome = outcomeFor(p.chosen, correctOptionId);
    return { id: p.id, outcome, from: p.position, to: nextPosition(p.position, outcome, o) };
  });
}

/** Personal feedback headline (spec §9.11). Colour is never the only signal. */
export function feedbackMessage(r: Pick<PlayerRoundResult, 'outcome' | 'from' | 'to'>, o: Pick<ScoreOptions, 'gentle' | 'superRound'> = {}): { title: string; detail: string } {
  if (r.outcome === 'correct') {
    if (o.superRound) return { title: 'Super question!', detail: r.to - r.from >= 2 ? 'Up two steps!' : 'Straight to the summit!' };
    return { title: 'Correct!', detail: 'Up one step.' };
  }
  const detail = r.from === 0 ? 'You stay at the starting step.' : o.gentle ? 'You stay on your step.' : 'Down one step.';
  return { title: r.outcome === 'wrong' ? 'Not quite' : "Time's up", detail };
}
