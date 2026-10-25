/** Game defaults and bounds (spec §5). Pure data — no framework imports. */
export const MAX_PLAYERS_HARD_LIMIT = 150;
export const QUESTION_LIMIT_OPTIONS = [10, 20, 30] as const;
/** Hosts may choose any whole number of seconds in this range for each question. */
export const MIN_TIME_LIMIT_S = 5;
export const MAX_TIME_LIMIT_S = 120;
export const TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90] as const;
/** @deprecated kept for older imports; use TIME_PRESETS / the min and max above. */
export const TIME_LIMIT_OPTIONS = TIME_PRESETS;
export const DEFAULT_QUESTION_LIMIT = 20;
export const DEFAULT_TIME_LIMIT_S = 30;
export const COUNTDOWN_S = 3;
export const REVEAL_MS = 8000;
export const OPTION_IDS = ['a', 'b', 'c', 'd'] as const;
export type OptionId = (typeof OPTION_IDS)[number];

export interface GameSettings {
  questionLimit: number;
  summitHeight: number;
  timeLimitS: number;
  maxPlayers: number;
  /** House rule: exactly one super question per game; a correct answer climbs two steps. */
  superQuestion?: boolean;
  /** House rule: a wrong or missed answer means you stay on your step instead of dropping. */
  gentle?: boolean;
}

export function defaultSummit(questionLimit: number): number {
  return Math.min(10, questionLimit);
}

export function defaultSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  const questionLimit = overrides.questionLimit ?? DEFAULT_QUESTION_LIMIT;
  return {
    questionLimit,
    summitHeight: overrides.summitHeight ?? defaultSummit(questionLimit),
    timeLimitS: overrides.timeLimitS ?? DEFAULT_TIME_LIMIT_S,
    maxPlayers: overrides.maxPlayers ?? MAX_PLAYERS_HARD_LIMIT,
    superQuestion: overrides.superQuestion ?? false,
    gentle: overrides.gentle ?? false,
  };
}

/** Returns a list of human-readable problems; empty means valid. */
export function validateSettings(s: GameSettings, platformMaxPlayers = MAX_PLAYERS_HARD_LIMIT): string[] {
  const errs: string[] = [];
  const cap = Math.min(MAX_PLAYERS_HARD_LIMIT, platformMaxPlayers);
  if (!(QUESTION_LIMIT_OPTIONS as readonly number[]).includes(s.questionLimit)) errs.push('Question limit must be 10, 20 or 30.');
  if (!Number.isInteger(s.timeLimitS) || s.timeLimitS < MIN_TIME_LIMIT_S || s.timeLimitS > MAX_TIME_LIMIT_S) errs.push(`Time per question must be a whole number from ${MIN_TIME_LIMIT_S} to ${MAX_TIME_LIMIT_S} seconds.`);
  if (!Number.isInteger(s.summitHeight) || s.summitHeight < 3) errs.push('Summit height must be at least 3 steps.');
  if (s.summitHeight > s.questionLimit) errs.push('Summit height cannot exceed the question limit.');
  if (!Number.isInteger(s.maxPlayers) || s.maxPlayers < 2) errs.push('At least 2 players must be allowed.');
  if (s.maxPlayers > cap) errs.push(`Maximum players is ${cap}.`);
  return errs;
}

/** Plain-language rules shown before joining (spec §5: penalty and deadline visible). House rules are spelled out. */
export function rulesSummary(s: GameSettings): string[] {
  const rules = [
    `Everyone answers the same question. You have ${s.timeLimitS} seconds.`,
    'Pick an answer, then press Submit. You can change your pick until you submit.',
    s.gentle
      ? 'Correct answer: up one step. Wrong answer or no answer: you stay on your step (Gentle mode — nobody drops down).'
      : 'Correct answer: up one step. Wrong answer or no answer: down one step (never below the start).',
  ];
  if (s.superQuestion) rules.push('One super question is hidden in the game. When it opens, everyone is told: a correct answer on it climbs two steps instead of one. It is the same for everyone.');
  rules.push(
    `The first round in which anyone reaches step ${s.summitHeight} ends the game. Everyone reaching it that round wins together.`,
    `If nobody reaches the summit within ${s.questionLimit} questions, the highest step wins (ties are shared).`,
    'There are no speed bonuses: answering quickly gives no advantage.',
  );
  return rules;
}
