// Read-only: validates apps/server/.env and checks the configured database. Prints no secrets.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const envFile = fileURLToPath(new URL('../../apps/server/.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const { loadEnv } = await import('../../apps/server/src/env');
const { openDb } = await import('../../apps/server/src/db/db');
const env = loadEnv();
const u = new URL(env.DATABASE_URL!);
console.log(`env OK: NODE_ENV=${env.NODE_ENV} db=${env.DB_DRIVER} auth=${env.AUTH_MODE} email=${env.EMAIL_MODE} fixtures=${env.ALLOW_FIXTURE_QUESTIONS}`);
console.log(`database host: ${u.hostname.replace(/^[^.]+/, '<ref>')} port: ${u.port || '5432'} (${u.port === '6543' ? 'transaction pooler' : u.port === '5432' ? 'session/direct' : 'other'})`);
const db = await openDb(env);
try {
  const v = await db.query<any>('select current_database() as db, split_part(version(), \' \', 2) as pg');
  const t = await db.query<any>("select table_name from information_schema.tables where table_schema='public' order by 1");
  console.log(`connected: database=${v.rows[0].db} postgres=${v.rows[0].pg}`);
  console.log(`public tables: ${t.rowCount} ${t.rowCount ? '(' + t.rows.map((r: any) => r.table_name).join(', ') + ')' : '(empty)'}`);
} catch (e) { console.log('CONNECTION FAILED:', (e as Error).message.replace(/postgres(ql)?:\/\/\S+/g, '<url>')); process.exitCode = 1; }
await db.close();
