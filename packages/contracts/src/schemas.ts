import { z } from 'zod';
import { BODY_COLOURS, EYES, GEAR, GLASSES, HEADWEAR, MAX_TIME_LIMIT_S, MIN_TIME_LIMIT_S, OPTION_IDS, QUESTION_LIMIT_OPTIONS } from '@elimquest/game-core';

export const avatarSchema = z.object({
  body: z.enum(BODY_COLOURS),
  eyes: z.enum(EYES),
  glasses: z.enum(GLASSES),
  headwear: z.enum(HEADWEAR),
  gear: z.enum(GEAR),
});

export const optionIdSchema = z.enum(OPTION_IDS);
export const roomCodeSchema = z.string().regex(/^\d{6}$/, 'Room codes are 6 digits');
const text = (max: number) => z.string().trim().min(1).max(max);

export const joinBodySchema = z.object({
  nickname: z.string().min(1).max(40),
  avatar: avatarSchema.partial().optional(),
  /** Present when rejoining from the same browser. */
  resumeToken: z.string().min(20).max(200).optional(),
  spectator: z.boolean().optional(),
});
export type JoinBody = z.infer<typeof joinBodySchema>;

export const gameSettingsSchema = z.object({
  questionLimit: z.number().refine((n) => (QUESTION_LIMIT_OPTIONS as readonly number[]).includes(n)),
  summitHeight: z.number().int().min(3).max(30),
  timeLimitS: z.number().int().min(MIN_TIME_LIMIT_S).max(MAX_TIME_LIMIT_S),
  maxPlayers: z.number().int().min(2).max(150),
  superQuestion: z.boolean().optional().default(false),
  gentle: z.boolean().optional().default(false),
});

export const createGameSchema = z.object({
  title: text(80),
  hostMode: z.enum(['competing', 'audience']),
  source: z.enum(['system', 'pack']).default('system'),
  packId: z.string().uuid().optional(),
  categoryIds: z.array(z.string().uuid()).max(12).default([]),
  minLevel: z.number().int().min(1).max(10).default(1),
  maxLevel: z.number().int().min(1).max(10).default(10),
  settings: gameSettingsSchema,
  scheduledAt: z.string().datetime().nullable().optional(),
  timezone: z.string().max(64).default('UTC'),
  allowHistoryReuse: z.boolean().default(false),
  topicVoting: z.boolean().default(false),
  /** Tell the host about a shortage before creating; true = open the lobby right away. */
  openNow: z.boolean().default(true),
}).refine((g) => g.minLevel <= g.maxLevel, { message: 'Minimum level cannot exceed maximum level', path: ['maxLevel'] });
export type CreateGameInput = z.infer<typeof createGameSchema>;

/** PATCH body: every field optional, no defaults (so omitted fields are never overwritten). */
export const updateGameSchema = z.object({
  title: text(80).optional(),
  categoryIds: z.array(z.string().uuid()).max(12).optional(),
  minLevel: z.number().int().min(1).max(10).optional(),
  maxLevel: z.number().int().min(1).max(10).optional(),
  settings: gameSettingsSchema.optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  timezone: z.string().max(64).optional(),
  allowHistoryReuse: z.boolean().optional(),
});

export const practiceCreateSchema = z.object({
  categoryIds: z.array(z.string().uuid()).max(12).default([]),
  minLevel: z.number().int().min(1).max(10).default(1),
  maxLevel: z.number().int().min(1).max(10).default(10),
  questionLimit: z.number().int().min(5).max(30).default(10),
  summitHeight: z.number().int().min(3).max(30).default(10),
  timeLimitS: z.number().int().min(MIN_TIME_LIMIT_S).max(MAX_TIME_LIMIT_S).default(30),
  superQuestion: z.boolean().default(false),
  gentle: z.boolean().default(false),
  mode: z.enum(['fresh', 'mistakes']).default('fresh'),
  sourceGameId: z.string().uuid().optional(),
});
export type PracticeCreateInput = z.infer<typeof practiceCreateSchema>;

export const practiceAnswerSchema = z.object({ optionId: optionIdSchema.nullable() });

/** Question authoring (admin + packs). */
export const questionInputSchema = z.object({
  text: text(600),
  options: z.array(text(200)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: text(1200),
  categoryId: z.string().uuid(),
  level: z.number().int().min(1).max(10),
  language: z.string().max(8).default('en'),
  reference: z.string().max(400).optional().default(''),
  provenance: z.string().max(200).optional().default(''),
  licence: z.string().max(120).optional().default(''),
  disputed: z.boolean().optional().default(false),
  disputeNote: z.string().max(600).optional().default(''),
}).superRefine((q, ctx) => {
  const norm = q.options.map((o) => o.trim().toLowerCase());
  if (new Set(norm).size !== norm.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be distinct' });
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const reviewActionSchema = z.object({
  action: z.enum(['approve', 'request_changes', 'reject', 'archive', 'publish']),
  note: z.string().max(600).optional().default(''),
});

export const categoryInputSchema = z.object({
  name: text(60),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  description: z.string().max(400).default(''),
  parentId: z.string().uuid().nullable().optional(),
  published: z.boolean().default(false),
  /** Launch only exposes categories with public=true; others stay hidden (spec §2). */
  sortOrder: z.number().int().default(0),
});

export const levelDefinitionSchema = z.object({
  level: z.number().int().min(1).max(10),
  title: text(60),
  rubric: text(600),
});

export const packInputSchema = z.object({ title: text(80), description: z.string().max(400).default('') });

export const reportSchema = z.object({
  questionVersionId: z.string().uuid(),
  reason: z.enum(['wrong_answer', 'unclear', 'offensive', 'duplicate', 'other']),
  note: z.string().max(500).optional().default(''),
});

export const registerDevSchema = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(100), displayName: text(40) });
export const loginDevSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(100) });

export const announceSchema = z.object({ message: z.string().trim().min(1).max(200) });
export const submitAnswerSchema = z.object({ roundId: z.string().uuid(), optionId: optionIdSchema });
export const voteSchema = z.object({ categoryIds: z.array(z.string().uuid()).max(3) });
export const voidSchema = z.object({ reason: z.string().trim().min(3).max(200) });
export const kickSchema = z.object({ participantId: z.string().uuid() });

/** Fixed sticker set: drawn icons only (no free text, no emoji, deliberately no clapping). */
export const REACTION_KINDS = ['star', 'lantern', 'heart', 'bolt', 'flame'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];
export const reactSchema = z.object({ kind: z.enum(REACTION_KINDS) });
