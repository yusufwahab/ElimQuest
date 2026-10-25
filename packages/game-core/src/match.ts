import { rankByStep } from './ranking';

export type EndReason = 'summit' | 'question_limit' | 'ended_early' | 'question_shortage';

export interface MatchEvaluation {
  finished: boolean;
  reason?: EndReason;
  winners: string[];
}

/**
 * Decide whether the match ends after a scored round (rules 8–9).
 * `positions` are post-round positions of competing participants.
 * Winners never depend on submission order or animation timing.
 */
export function evaluateAfterRound(args: {
  positions: { id: string; position: number }[];
  summitHeight: number;
  validRoundsPlayed: number;
  questionLimit: number;
}): MatchEvaluation {
  const { positions, summitHeight, validRoundsPlayed, questionLimit } = args;
  const atSummit = positions.filter((p) => p.position >= summitHeight).map((p) => p.id);
  if (atSummit.length > 0) return { finished: true, reason: 'summit', winners: atSummit };
  if (validRoundsPlayed >= questionLimit) return { finished: true, reason: 'question_limit', winners: highest(positions) };
  return { finished: false, winners: [] };
}

/** Everyone at the highest step (shared winners). Empty when nobody competes. */
export function highest(positions: { id: string; position: number }[]): string[] {
  if (positions.length === 0) return [];
  return rankByStep(positions).filter((r) => r.rank === 1).map((r) => r.item.id);
}

/** Solo: success only by reaching the summit; no multiplayer "win" for being alone. */
export function soloSucceeded(position: number, summitHeight: number): boolean {
  return position >= summitHeight;
}
