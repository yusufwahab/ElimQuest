import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import type { Db } from './db';
import { one } from '../repo/util';

/**
 * DEVELOPMENT ONLY (AUTH_MODE=dev, PGlite). Creates local accounts so the admin UI can be exercised.
 * These credentials are public in the repository and must never exist in a real environment.
 */
export const DEV_ACCOUNTS = [
  { email: 'admin@dev.local', name: 'Dev Admin', role: 'super_admin', password: 'devpassword1' },
  { email: 'reviewer@dev.local', name: 'Dev Reviewer', role: 'content_reviewer', password: 'devpassword1' },
  { email: 'host@dev.local', name: 'Dev Host', role: 'member', password: 'devpassword1' },
] as const;

export async function seedDevUsers(db: Db) {
  for (const a of DEV_ACCOUNTS) {
    if (await one(db, 'select 1 from profiles where email=$1', [a.email])) continue;
    const id = randomUUID();
    const salt = randomBytes(16);
    const hash = `${salt.toString('hex')}:${scryptSync(a.password, salt, 32).toString('hex')}`;
    await db.tx(async (q) => {
      await q.query('insert into profiles(id,email,display_name,role) values ($1,$2,$3,$4)', [id, a.email, a.name, a.role]);
      await q.query('insert into dev_credentials(user_id,password_hash) values ($1,$2)', [id, hash]);
    });
  }
}
