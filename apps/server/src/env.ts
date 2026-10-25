import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const list = z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

/** Every server setting, validated at boot. Names are mirrored in apps/server/.env.example. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8787),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: list.default(() => ['http://localhost:5173']),

  // Database: pglite is development/test only.
  DB_DRIVER: z.enum(['pglite', 'pg']).default('pglite'),
  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  PGLITE_DIR: z.string().optional(), // omit = in-memory

  // Auth
  AUTH_MODE: z.enum(['dev', 'supabase']).default('dev'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  DEV_AUTH_SECRET: z.string().min(16).default('dev-only-secret-change-me-0123456789'),

  // Redis (optional cache / rate limit counters)
  REDIS_URL: z.string().optional(),

  // Email
  EMAIL_MODE: z.enum(['log', 'brevo']).default('log'),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().default('ElimQuest'),

  // Game limits
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(2).max(150).default(150),
  MAX_ACTIVE_ROOMS: z.coerce.number().int().min(1).default(5),
  MAX_OPEN_ROOMS_PER_HOST: z.coerce.number().int().min(1).default(5),
  SPECTATOR_BUDGET_PER_ROOM: z.coerce.number().int().min(0).default(30),
  ANSWER_GRACE_MS: z.coerce.number().int().min(0).max(3000).default(750),
  ROOM_TTL_HOURS: z.coerce.number().int().min(1).default(24),
  ALLOW_FIXTURE_QUESTIONS: bool.default(false),
  /** Test hook: scale down countdown/reveal durations. Never set in production. */
  TIMING_SCALE: z.coerce.number().min(0.01).max(1).default(1),
  RATE_LIMIT_DISABLED: bool.default(false),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(rawIn: Record<string, string | undefined> = process.env): Env {
  // A blank value (KEY=) means "not set", so a freshly copied .env with empty secrets is valid.
  const raw = Object.fromEntries(Object.entries(rawIn).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${msg}`);
  }
  const env = parsed.data;
  const problems: string[] = [];
  if (env.NODE_ENV === 'production') {
    if (env.DB_DRIVER !== 'pg') problems.push('DB_DRIVER must be "pg" in production (PGlite is development only)');
    if (env.AUTH_MODE !== 'supabase') problems.push('AUTH_MODE must be "supabase" in production (dev auth is development only)');
    if (env.ALLOW_FIXTURE_QUESTIONS) problems.push('ALLOW_FIXTURE_QUESTIONS must be false in production');
    if (env.TIMING_SCALE !== 1) problems.push('TIMING_SCALE must be 1 in production');
    if (env.RATE_LIMIT_DISABLED) problems.push('RATE_LIMIT_DISABLED must be false in production');
    if (env.ALLOWED_ORIGINS.some((o) => o === '*')) problems.push('ALLOWED_ORIGINS must be an explicit allowlist');
  }
  if (env.DB_DRIVER === 'pg' && !env.DATABASE_URL) problems.push('DATABASE_URL is required when DB_DRIVER=pg');
  if (env.AUTH_MODE === 'supabase' && !env.SUPABASE_URL) problems.push('SUPABASE_URL is required when AUTH_MODE=supabase');
  if (env.EMAIL_MODE === 'brevo' && (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL)) problems.push('BREVO_API_KEY and BREVO_SENDER_EMAIL are required when EMAIL_MODE=brevo');
  if (problems.length) throw new Error(`Invalid environment: ${problems.join('; ')}`);
  return env;
}
