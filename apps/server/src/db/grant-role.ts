/**
 * Owner-run bootstrap for the FIRST super admin (public sign-up never grants roles; spec §7).
 *   DATABASE_URL=... DB_DRIVER=pg AUTH_MODE=supabase SUPABASE_URL=... NODE_ENV=production \
 *     npx tsx apps/server/src/db/grant-role.ts you@example.com super_admin
 * The person must have signed in at least once so a profile row exists. The change is audited.
 */
import { loadEnv } from '../env';
import { openDb } from './db';
import { audit, one } from '../repo/util';

const [email, role] = process.argv.slice(2);
if (!email || !['member', 'content_reviewer', 'super_admin'].includes(role ?? '')) {
  console.error('Usage: grant-role.ts <email> <member|content_reviewer|super_admin>');
  process.exit(2);
}
const db = await openDb(loadEnv());
const p = await one<{ id: string }>(db, 'update profiles set role=$2 where lower(email)=lower($1) returning id', [email, role]);
if (!p) { console.error('No profile with that email. Ask them to sign in once first.'); await db.close(); process.exit(1); }
await audit(db, { actorLabel: 'cli', action: 'role.grant', entityType: 'profile', entityId: p.id, detail: { role, via: 'grant-role cli' } });
console.log(`Granted ${role} to ${email}`);
await db.close();
