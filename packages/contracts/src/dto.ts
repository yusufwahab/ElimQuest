import type { AvatarConfig, EndReason, GamePhase, GameSettings, Outcome } from '@elimquest/game-core';

export type HostMode = 'competing' | 'audience';

export interface PlayerPublic {
  id: string;
  nickname: string;
  avatar: AvatarConfig;
  position: number;
  connected: boolean;
  isHostPlayer?: boolean;
}

export interface CategoryRef { id: string; name: string; slug: string }

export interface RoomPreview {
  code: string;
  gameId: string;
  title: string;
  hostName: string;
  hostMode: HostMode;
  phase: GamePhase;
  scheduledAt: string | null;
  timezone: string;
  categories: CategoryRef[];
  minLevel: number;
  maxLevel: number;
  settings: GameSettings;
  playerCount: number;
  rules: string[];
  /** Join state hints for the join screen. */
  canJoin: boolean;
  canSpectate: boolean;
  reason?: 'full' | 'started' | 'finished' | 'cancelled' | 'expired' | 'not_open';
  customContent: boolean;
}

/** What players receive at round opening. Never includes the answer key. */
export interface QuestionPublic {
  roundId: string;
  roundNo: number;
  text: string;
  options: { id: string; text: string }[];
  shuffleSalt: string;
  openedAt: number;
  deadline: number;
  categoryName?: string;
  level?: number;
  /** The super question is announced to everyone when it opens. */
  isSuper?: boolean;
}

export interface RoundOutcomeEntry { id: string; from: number; to: number; outcome: Outcome }

export interface RoundResultEvent {
  roundId: string;
  roundNo: number;
  /** Revealed with the answer so players can report a question. */
  questionVersionId: string;
  correctOptionId: string;
  correctText: string;
  explanation: string;
  reference: string;
  standings: RoundOutcomeEntry[];
  /** True when this reveal precedes a finale; official winners are announced only on `game:finished`. */
  finalePending: boolean;
  pendingWinnerIds: string[];
  nextAt: number | null;
  voided?: boolean;
  isSuper?: boolean;
  /** Reveal chart: how many players picked each option (stable ids), plus those who didn't answer. Aggregates only. */
  optionCounts: Record<string, number>;
  unansweredCount: number;
  playerTotal: number;
  /** Positive-only highlights; ids are resolved to nicknames on the client. */
  highlights: { topClimbers: string[]; climbBy: number; leaders: string[]; leaderStep: number };
}

export interface FinalStanding {
  id: string;
  nickname: string;
  avatar: AvatarConfig;
  position: number;
  rank: number;
  isWinner: boolean;
  correct: number;
  wrong: number;
  unanswered: number;
}

export interface GameFinishedEvent {
  gameId: string;
  reason: EndReason;
  winners: string[];
  standings: FinalStanding[];
  validRounds: number;
  summitHeight: number;
}

export interface RoomSnapshot {
  v: number;
  serverTime: number;
  code: string;
  gameId: string;
  title: string;
  phase: GamePhase;
  hostMode: HostMode;
  settings: GameSettings;
  scheduledAt: string | null;
  timezone: string;
  you: { participantId: string | null; role: 'player' | 'spectator' | 'host'; isHostPlayer: boolean; canControl: boolean };
  players: PlayerPublic[];
  roundNo: number;
  question: QuestionPublic | null;
  answeredCount: number;
  myChoice: string | null;
  myAnswerAccepted: boolean;
  lastResult: RoundResultEvent | null;
  countdownEndsAt: number | null;
  paused: boolean;
  recovery: boolean;
  announcement: string | null;
  finished: GameFinishedEvent | null;
  voting: { open: boolean; shortlist: CategoryRef[]; myVote: string[] } | null;
  endedEarly: boolean;
  /** Consecutive correct answers ending at the last scored round (display only; never changes movement). */
  myStreak: number;
}

export type ServerEvent =
  | { t: 'phase'; v: number; phase: GamePhase; countdownEndsAt?: number | null; paused?: boolean; recovery?: boolean }
  | { t: 'round:open'; v: number; question: QuestionPublic }
  | { t: 'answers:count'; v: number; roundId: string; answered: number; total: number }
  | { t: 'round:result'; v: number; result: RoundResultEvent }
  | { t: 'game:finished'; v: number; finished: GameFinishedEvent }
  | { t: 'announce'; v: number; message: string }
  | { t: 'players:delta'; v: number; joined: PlayerPublic[]; left: string[]; connection: { id: string; connected: boolean }[] }
  | { t: 'round:voided'; v: number; roundId: string; reason: string }
  | { t: 'kicked'; v: number };

export interface ChatMessage { id: string; at: number; from: string; nick: string; host?: boolean; text: string }
export interface ChatState { mode: import('./schemas').ChatMode; messages: ChatMessage[]; muted: boolean; mutedIds?: string[] }

export interface Ack<T = undefined> { ok: boolean; error?: string; code?: string; data?: T }

export interface HostRosterEntry extends PlayerPublic { answered?: boolean; removed?: boolean }
