import { randomUUID, scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from './env';
import type { Db } from './db/db';
import { HttpError, one } from './repo/util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Role = 'member' | 'content_reviewer' | 'super_admin';
export interface AuthUser { id: string; email: string; displayName: string; role: Role }

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 32);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}
async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [s, k] = stored.split(':');
  if (!s || !k) return false;
  const key = await scryptAsync(pw, Buffer.from(s, 'hex'), 32);
  const expect = Buffer.from(k, 'hex');
  return key.length === expect.length && timingSafeEqual(key, expect);
}

const DEV_ISSUER = 'elimquest-dev';

export class Auth {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private devKey: Uint8Array;
  constructor(private env: Env, private db: Db) {
    this.devKey = new TextEncoder().encode(env.DEV_AUTH_SECRET);
    if (env.AUTH_MODE === 'supabase' && !env.SUPABASE_JWT_SECRET) {
      this.jwks = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
    }
  }

  /** Verifies the signature, issuer and audience; the role is always read from our database, never from the token. */
  async verifyBearer(token: string): Promise<AuthUser | null> {
    try {
      let sub: string; let email = ''; let name = '';
      if (this.env.AUTH_MODE === 'dev') {
        const { payload } = await jwtVerify(token, this.devKey, { issuer: DEV_ISSUER, algorithms: ['HS256'] });
        sub = String(payload.sub);
        email = String(payload.email ?? '');
        name = String(payload.name ?? '');
      } else {
        const issuer = `${this.env.SUPABASE_URL}/auth/v1`;
        const opts = { issuer, audience: 'authenticated' };
        const { payload } = this.env.SUPABASE_JWT_SECRET
          ? await jwtVerify(token, new TextEncoder().encode(this.env.SUPABASE_JWT_SECRET), { ...opts, algorithms: ['HS256'] })
          : await jwtVerify(token, this.jwks!, opts);
        sub = String(payload.sub);
        email = String(payload.email ?? '');
        const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
        name = String(meta.display_name ?? meta.name ?? email.split('@')[0] ?? 'Player');
        if (payload.email_verified === false || (meta.email_verified === false)) return null;
      }
      const p = await one<{ id: string; email: string; display_name: string; role: Role; deletion_requested_at: Date | null }>(
        this.db,
        `insert into profiles(id,email,display_name) values ($1,$2,$3)
         on conflict (id) do update set email = excluded.email returning id,email,display_name,role,deletion_requested_at`,
        [sub, email, name || email.split('@')[0] || 'Player'],
      );
      if (!p) return null;
      return { id: p.id, email: p.email, displayName: p.display_name, role: p.role };
    } catch {
      return null;
    }
  }

  async devRegister(email: string, password: string, displayName: string, role: Role = 'member') {
    this.assertDev();
    const id = randomUUID();
    const exists = await one(this.db, 'select 1 from profiles where lower(email)=lower($1)', [email]);
    if (exists) throw new HttpError(409, 'An account with that email already exists', 'exists');
    await this.db.tx(async (q) => {
      await q.query('insert into profiles(id,email,display_name,role) values ($1,$2,$3,$4)', [id, email, displayName, role]);
      await q.query('insert into dev_credentials(user_id,password_hash) values ($1,$2)', [id, await hashPassword(password)]);
    });
    return this.devToken(id, email, displayName);
  }

  async devLogin(email: string, password: string) {
    this.assertDev();
    const row = await one<{ id: string; display_name: string; password_hash: string }>(
      this.db, 'select p.id, p.display_name, c.password_hash from profiles p join dev_credentials c on c.user_id=p.id where lower(p.email)=lower($1)', [email]);
    // Same message for unknown email and wrong password (no account enumeration).
    if (!row || !(await verifyPassword(password, row.password_hash))) throw new HttpError(401, 'Incorrect email or password', 'bad_credentials');
    return this.devToken(row.id, email, row.display_name);
  }

  private async devToken(id: string, email: string, name: string) {
    const token = await new SignJWT({ email, name })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(id).setIssuer(DEV_ISSUER).setIssuedAt().setExpirationTime('12h').sign(this.devKey);
    return { token, user: { id, email, displayName: name } };
  }

  private assertDev() {
    if (this.env.AUTH_MODE !== 'dev' || this.env.NODE_ENV === 'production') throw new HttpError(404, 'Not found');
  }

  async fromRequest(req: Request): Promise<AuthUser | null> {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return null;
    return this.verifyBearer(h.slice(7));
  }

  /** Express middleware: require a verified account, optionally with one of the given platform roles. */
  require(roles?: Role[]) {
    return async (req: Request, _res: Response, next: NextFunction) => {
      const u = await this.fromRequest(req);
      if (!u) return next(new HttpError(401, 'Sign in required', 'unauthenticated'));
      if (roles && !roles.includes(u.role)) return next(new HttpError(403, 'You do not have permission to do that', 'forbidden'));
      req.user = u;
      next();
    };
  }
  optional() {
    return async (req: Request, _res: Response, next: NextFunction) => {
      req.user = (await this.fromRequest(req)) ?? undefined;
      next();
    };
  }
}
