export type GamePhase =
  | 'draft' | 'lobby' | 'countdown' | 'question_open' | 'reveal' | 'climb'
  | 'paused' | 'recovery_pause' | 'finished' | 'cancelled' | 'expired';

const T: Record<GamePhase, GamePhase[]> = {
  draft: ['lobby', 'cancelled'],
  lobby: ['countdown', 'cancelled', 'expired'],
  countdown: ['question_open', 'recovery_pause', 'finished'],
  question_open: ['reveal', 'recovery_pause', 'countdown'],
  reveal: ['climb', 'countdown', 'finished', 'paused', 'recovery_pause'],
  climb: ['countdown', 'finished', 'paused', 'recovery_pause'],
  paused: ['countdown', 'finished', 'recovery_pause'],
  recovery_pause: ['countdown', 'question_open', 'climb', 'reveal', 'finished'],
  finished: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return T[from].includes(to);
}
export function isTerminal(p: GamePhase): boolean {
  return p === 'finished' || p === 'cancelled' || p === 'expired';
}
export function isLive(p: GamePhase): boolean {
  return ['countdown', 'question_open', 'reveal', 'climb', 'paused', 'recovery_pause'].includes(p);
}
