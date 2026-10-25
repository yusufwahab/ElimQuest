import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../env';

// Load apps/server/.env if present (real environment variables take precedence).
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { migrate, openDb } from './db';

const env = loadEnv();
const db = await openDb(env);
const applied = await migrate(db, { dev: env.DB_DRIVER === 'pglite' });
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
await db.close();
