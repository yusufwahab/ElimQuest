import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Auth } from './auth';
import type { Db } from './db/db';
import type { Env } from './env';
import type { Mailer } from './email';
import { accountExistsEmail, otpEmail } from './email-otp';
import { HttpError, many, one, plainText } from './repo/util';

export const OTP_MINUTES = 10;
export const OTP_COOLDOWN_S = 30;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

/** Creates a confirmed Supabase user via the Admin API. Needs the service-role key (server only). `fetchImpl` is injectable for tests. */
export class SupabaseAdmin {
  constructor(private env: Env, private fetchImpl: typeof fetch = fetch) {}

  async createUser(email: string, password: string, displayName: string): Promise<void> {
    const key = this.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !this.env.SUPABASE_URL) throw new HttpError(500, 'Sign-up is not configured on the server', 'not_configured');
    const res = await this.fetchImpl(`${this.env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: displayName } }),
    });
    if (res.ok) return;
    const body = (await res.json().catch(() => ({}))) as { error_code?: string; msg?: string; message?: string };
    const text = body.msg ?? body.message ?? '';
    if (body.error_code === 'email_exists' || (res.status === 422 && /already|registered/i.test(text))) throw new HttpError(409, 'An account with this email already exists. Try signing in.', 'exists');
    if (body.error_code === 'weak_password') throw new HttpError(400, text || 'That password is too weak. Try a longer or less common one.', 'weak_password');
    throw new HttpError(502, 'We couldn’t create your account right now. Please try again.', 'upstream');
  }
}

/**
 * Email one-time-code sign-up. (1) `start` emails a 6-digit code. (2) `verify` checks it and only then creates the account.
 * Codes are stored only as a keyed hash, expire, are single-use and lock after 5 wrong tries.
 * Responses never reveal whether an address already has an account.
 */
export class SignupService {
  constructor(private db: Db, private env: Env, private mailer: Mailer, private auth: Auth, private admin = new SupabaseAdmin(env)) {}

  private hash(email: string, code: string) {
    return createHmac('sha256', this.env.OTP_SECRET).update(`${email}:${code}`).digest('hex');
  }

  async start(email: string, displayName: string) {
    const name = plainText(displayName).slice(0, 40) || 'there';
    const recent = await many<{ created_at: Date }>(this.db, "select created_at from email_otps where email=$1 and created_at > now() - interval '1 hour' order by created_at desc", [email]);
    if (recent.length >= MAX_CODES_PER_HOUR) throw new HttpError(429, 'Too many codes requested for this email. Please try again later.', 'too_many_codes');
    const last = recent[0];
    if (last) {
      const wait = OTP_COOLDOWN_S - Math.floor((Date.now() - new Date(last.created_at).getTime()) / 1000);
      if (wait > 0) throw new HttpError(429, `Please wait ${wait} seconds before requesting another code.`, 'cooldown', { retryAfter: wait });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const exists = await one(this.db, 'select 1 from profiles where lower(email)=$1', [email]);
    // A row is written even for an existing account, so cooldowns and caps behave identically (no probing through them).
    const row = await one<{ id: string }>(this.db, "insert into email_otps(email, code_hash, display_name, expires_at) values ($1,$2,$3, now() + ($4 || ' minutes')::interval) returning id", [email, exists ? 'x' : this.hash(email, code), name, String(OTP_MINUTES)]);
    const mail = exists
      ? accountExistsEmail({ to: email, name, signInUrl: `${this.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/sign-in` })
      : otpEmail({ to: email, code, name, minutes: OTP_MINUTES });
    const sent = await this.mailer.send(mail);
    if (sent.status === 'failed') {
      await this.db.query('delete from email_otps where id=$1', [row!.id]);
      throw new HttpError(502, 'We couldn’t send the email right now. Please try again in a moment.', 'email_failed');
    }
    return { ok: true, cooldown: OTP_COOLDOWN_S, expiresInMinutes: OTP_MINUTES };
  }

  async verify(a: { email: string; code: string; password: string; displayName: string }) {
    const bad = () => new HttpError(400, 'That code is wrong or has expired. Check the newest email, or request a new code.', 'bad_code');
    const row = await one<any>(this.db, 'select * from email_otps where email=$1 and consumed_at is null and expires_at > now() order by created_at desc limit 1', [a.email]);
    if (!row) throw bad();
    if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(400, 'Too many wrong tries. Please request a new code.', 'locked');
    const expected = Buffer.from(this.hash(a.email, a.code), 'hex');
    const actual = Buffer.from(String(row.code_hash), 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      await this.db.query('update email_otps set attempts = attempts + 1 where id=$1', [row.id]);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      throw new HttpError(400, left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Please request a new code.', left > 0 ? 'bad_code' : 'locked');
    }
    const claimed = await this.db.query('update email_otps set consumed_at=now() where id=$1 and consumed_at is null returning id', [row.id]);
    if (!claimed.rowCount) throw bad(); // lost a race with a parallel request: the code is single-use
    try {
      const name = plainText(a.displayName).slice(0, 40) || row.display_name || 'Player';
      if (this.env.AUTH_MODE === 'dev') await this.auth.devRegister(a.email, a.password, name);
      else await this.admin.createUser(a.email, a.password, name);
    } catch (e) {
      // A fixable problem (e.g. a weak password) shouldn't burn the code; an already-existing account should.
      if (!(e instanceof HttpError && e.code === 'exists')) await this.db.query('update email_otps set consumed_at=null where id=$1', [row.id]);
      throw e;
    }
    return { ok: true };
  }

  async cleanup() { await this.db.query("delete from email_otps where created_at < now() - interval '1 day'"); }
}
