import { describe, expect, it } from 'vitest';
import { loadEnv } from '../env';

const prod = { NODE_ENV: 'production', DB_DRIVER: 'pg', DATABASE_URL: 'postgres://u:p@h:5432/db', AUTH_MODE: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', OTP_SECRET: 'a'.repeat(40), ALLOWED_ORIGINS: 'https://quiz.example.com', PUBLIC_WEB_URL: 'https://quiz.example.com' };

describe('environment validation', () => {
  it('accepts a coherent production configuration', () => {
    const e = loadEnv(prod);
    expect(e.NODE_ENV).toBe('production');
    expect(e.ALLOWED_ORIGINS).toEqual(['https://quiz.example.com']);
  });
  it.each([
    ['PGlite in production', { DB_DRIVER: 'pglite' }, /DB_DRIVER/],
    ['dev auth in production', { AUTH_MODE: 'dev' }, /AUTH_MODE/],
    ['fixture questions in production', { ALLOW_FIXTURE_QUESTIONS: 'true' }, /ALLOW_FIXTURE_QUESTIONS/],
    ['scaled timing in production', { TIMING_SCALE: '0.1' }, /TIMING_SCALE/],
    ['rate limiting disabled in production', { RATE_LIMIT_DISABLED: 'true' }, /RATE_LIMIT_DISABLED/],
    ['wildcard origins in production', { ALLOWED_ORIGINS: '*' }, /ALLOWED_ORIGINS/],
    ['missing database url', { DATABASE_URL: '' }, /DATABASE_URL/],
    ['no service-role key (cannot create verified accounts)', { SUPABASE_SERVICE_ROLE_KEY: '' }, /SERVICE_ROLE_KEY/],
    ['no OTP secret', { OTP_SECRET: '' }, /OTP_SECRET/],
    ['a short OTP secret', { OTP_SECRET: 'short' }, /OTP_SECRET/],
    ['brevo without a key', { EMAIL_MODE: 'brevo' }, /BREVO_API_KEY/],
  ])('refuses %s', (_n, over, msg) => {
    expect(() => loadEnv({ ...prod, ...over } as Record<string, string>)).toThrow(msg);
  });
  it('rejects more than 150 players per room', () => {
    expect(() => loadEnv({ MAX_PLAYERS_PER_ROOM: '200' })).toThrow();
  });
  it('defaults are development-safe: fixtures off, 150 cap, 750ms grace', () => {
    const e = loadEnv({});
    expect(e.ALLOW_FIXTURE_QUESTIONS).toBe(false);
    expect(e.MAX_PLAYERS_PER_ROOM).toBe(150);
    expect(e.ANSWER_GRACE_MS).toBe(750);
  });
});
