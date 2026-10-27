import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { HttpError } from '../repo/util';
import { SignupService, SupabaseAdmin } from '../signup';
import { api, startServer, type TestServer } from './helpers';

let s: TestServer;
beforeAll(async () => { s = await startServer(); });
afterAll(async () => { await s.close(); });

const uniq = () => `otp${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
const start = (email: string, displayName = 'Amina') => api(s, 'POST', '/api/auth/signup/start', { email, displayName });
const verify = (email: string, code: string, password = 'password123', displayName = 'Amina') => api(s, 'POST', '/api/auth/signup/verify', { email, code, password, displayName });
const lastCode = (email: string) => {
  const m = [...s.ctx.mailer.outbox].reverse().find((x) => x.to === email);
  return { mail: m, code: /\b(\d{6})\b/.exec(m?.text ?? '')?.[1] ?? '' };
};
/** Pretend the cooldown has elapsed. */
const age = (email: string) => s.db.query("update email_otps set created_at = created_at - interval '40 seconds' where email=$1", [email]);

describe('email one-time-code sign-up', () => {
  it('emails a 6-digit code, never returns it over HTTP, stores only a hash, and creates the account only after verification', async () => {
    const email = uniq();
    const r = await start(email);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, cooldown: 30 });
    const { mail, code } = lastCode(email);
    expect(code).toMatch(/^\d{6}$/);
    expect(mail!.subject).toContain(code);
    expect(JSON.stringify(r.body)).not.toContain(code);                                  // the code only travels by email
    const row = (await s.db.query<any>('select * from email_otps where email=$1', [email])).rows[0];
    expect(row.code_hash).not.toContain(code); expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    // No account yet: signing in fails.
    expect((await api(s, 'POST', '/api/dev-auth/login', { email, password: 'password123' })).status).toBe(401);
    const v = await verify(email, code);
    expect(v.status).toBe(201);
    const login = await api(s, 'POST', '/api/dev-auth/login', { email, password: 'password123' });
    expect(login.status).toBe(200);
    expect((await api(s, 'GET', '/api/me', undefined, { bearer: login.body.token })).body.user.displayName).toBe('Amina');
  });

  it('a code works once only', async () => {
    const email = uniq();
    await start(email);
    const { code } = lastCode(email);
    expect((await verify(email, code)).status).toBe(201);
    const again = await verify(email, code, 'another-pass-1');
    expect(again.status).toBe(400); expect(again.body.code).toBe('bad_code');
  });

  it('wrong codes count down and lock after 5 tries — even the right code is then refused', async () => {
    const email = uniq();
    await start(email);
    const { code } = lastCode(email);
    const wrong = code === '000000' ? '111111' : '000000';
    const first = await verify(email, wrong);
    expect(first.body.code).toBe('bad_code'); expect(first.body.error).toMatch(/4 tries left/);
    for (let i = 0; i < 3; i++) await verify(email, wrong);
    const last = await verify(email, wrong);
    expect(last.body.code).toBe('locked');
    const rightButLocked = await verify(email, code);
    expect(rightButLocked.status).toBe(400); expect(rightButLocked.body.code).toBe('locked');
    expect((await api(s, 'POST', '/api/dev-auth/login', { email, password: 'password123' })).status).toBe(401);
  });

  it('resend has a cooldown; only the newest code works', async () => {
    const email = uniq();
    await start(email);
    const first = lastCode(email).code;
    const tooSoon = await start(email);
    expect(tooSoon.status).toBe(429); expect(tooSoon.body.code).toBe('cooldown'); expect(tooSoon.body.details.retryAfter).toBeGreaterThan(0);
    await age(email);
    expect((await start(email)).status).toBe(200);
    const second = lastCode(email).code;
    if (second !== first) expect((await verify(email, first)).status).toBe(400);          // the old code no longer works
    expect((await verify(email, second)).status).toBe(201);
  });

  it('expired codes are refused', async () => {
    const email = uniq();
    await start(email);
    const { code } = lastCode(email);
    await s.db.query("update email_otps set expires_at = now() - interval '1 second' where email=$1", [email]);
    expect((await verify(email, code)).body.code).toBe('bad_code');
  });

  it('caps codes at 5 per hour per address', async () => {
    const email = uniq();
    for (let i = 0; i < 5; i++) { expect((await start(email)).status).toBe(200); await age(email); }
    const sixth = await start(email);
    expect(sixth.status).toBe(429); expect(sixth.body.code).toBe('too_many_codes');
  });

  it('an existing account gets the same answer but an "already registered" email, and no usable code', async () => {
    const r = await start('host@dev.local');
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ ok: true, cooldown: 30 });   // identical shape: addresses can't be probed
    const mail = [...s.ctx.mailer.outbox].reverse().find((m) => m.to === 'host@dev.local')!;
    expect(mail.subject).toMatch(/already have/i); expect(mail.text).not.toMatch(/\b\d{6}\b/);
    expect((await verify('host@dev.local', '123456')).status).toBe(400);
  });

  it('validates input without burning the code (short password, bad code format)', async () => {
    const email = uniq();
    await start(email);
    const { code } = lastCode(email);
    expect((await verify(email, code, 'short')).status).toBe(400);                       // rejected before the code is touched
    expect((await verify(email, '12ab56')).status).toBe(400);
    expect((await verify(email, code)).status).toBe(201);
    expect((await api(s, 'POST', '/api/auth/signup/start', { email: 'not-an-email', displayName: 'x' })).status).toBe(400);
  });

  it('two parallel verifications of one code create exactly one account', async () => {
    const email = uniq();
    await start(email);
    const { code } = lastCode(email);
    const [a, b] = await Promise.all([verify(email, code), verify(email, code, 'second-password-2')]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
  });
});

describe('creating the account in Supabase', () => {
  const env = (over: Partial<Env> = {}) => ({ ...s.env, AUTH_MODE: 'supabase', SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key-123', ...over }) as Env;
  const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('calls the Admin API with a confirmed email and the service key (server-side only)', async () => {
    let seen: any;
    const admin = new SupabaseAdmin(env(), (async (url: string, init: any) => { seen = { url, init }; return new Response('{}', { status: 200 }); }) as any);
    await admin.createUser('a@b.co', 'password123', 'Amina');
    expect(seen.url).toBe('https://ref.supabase.co/auth/v1/admin/users');
    expect(seen.init.headers.authorization).toBe('Bearer service-key-123');
    expect(JSON.parse(seen.init.body)).toMatchObject({ email: 'a@b.co', email_confirm: true, user_metadata: { display_name: 'Amina' } });
  });
  it('maps Supabase errors to clear messages', async () => {
    const run = (status: number, body: unknown) => new SupabaseAdmin(env(), reply(status, body) as any).createUser('a@b.co', 'pw123456', 'A').catch((e) => e as HttpError);
    expect(await run(422, { error_code: 'email_exists', msg: 'exists' })).toMatchObject({ status: 409, code: 'exists' });
    expect(await run(422, { error_code: 'weak_password', msg: 'Password should be at least 12 characters' })).toMatchObject({ status: 400, code: 'weak_password' });
    expect(await run(500, {})).toMatchObject({ status: 502, code: 'upstream' });
    expect(await new SupabaseAdmin(env({ SUPABASE_SERVICE_ROLE_KEY: undefined })).createUser('a@b.co', 'pw123456', 'A').catch((e) => e)).toMatchObject({ code: 'not_configured' });
  });
  it('a weak-password rejection does not burn the code; an existing account does', async () => {
    let mode: 'weak' | 'ok' | 'exists' = 'weak';
    const admin = { createUser: async () => { if (mode === 'weak') throw new HttpError(400, 'weak', 'weak_password'); if (mode === 'exists') throw new HttpError(409, 'exists', 'exists'); } } as unknown as SupabaseAdmin;
    const svc = new SignupService(s.db, env(), s.ctx.mailer, s.ctx.auth, admin);
    const email = uniq();
    await svc.start(email, 'Amina');
    const code = /\b(\d{6})\b/.exec([...s.ctx.mailer.outbox].reverse().find((m) => m.to === email)!.text)![1]!;
    await expect(svc.verify({ email, code, password: 'password123', displayName: 'Amina' })).rejects.toMatchObject({ code: 'weak_password' });
    mode = 'ok';
    await expect(svc.verify({ email, code, password: 'a-much-better-password', displayName: 'Amina' })).resolves.toEqual({ ok: true });
    const email2 = uniq(); await svc.start(email2, 'Z');
    const code2 = /\b(\d{6})\b/.exec([...s.ctx.mailer.outbox].reverse().find((m) => m.to === email2)!.text)![1]!;
    mode = 'exists';
    await expect(svc.verify({ email: email2, code: code2, password: 'password123', displayName: 'Z' })).rejects.toMatchObject({ code: 'exists' });
    mode = 'ok';
    await expect(svc.verify({ email: email2, code: code2, password: 'password123', displayName: 'Z' })).rejects.toMatchObject({ code: 'bad_code' }); // consumed
  });
  it('if the email cannot be sent the request fails cleanly and leaves no code behind', async () => {
    const failing = { send: async () => ({ status: 'failed' as const, error: 'brevo down' }), outbox: [] } as any;
    const svc = new SignupService(s.db, env(), failing, s.ctx.auth);
    const email = uniq();
    await expect(svc.start(email, 'Amina')).rejects.toMatchObject({ status: 502, code: 'email_failed' });
    expect((await s.db.query('select count(*)::int n from email_otps where email=$1', [email])).rows[0].n).toBe(0);
  });
});
