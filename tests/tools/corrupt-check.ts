// Proves a corrupt PGLITE_DIR is moved aside and replaced instead of crashing the server.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createApp } from '../../apps/server/src/app';
const dir = '.pglite-corrupt-test';
for (const d of readdirSync('.').filter((x) => x.startsWith(dir))) rmSync(d, { recursive: true, force: true });
mkdirSync(dir); writeFileSync(`${dir}/PG_VERSION`, '17'); writeFileSync(`${dir}/garbage.bin`, 'not a database');
const app = await createApp({ NODE_ENV: 'test', DB_DRIVER: 'pglite', PGLITE_DIR: dir, AUTH_MODE: 'dev', EMAIL_MODE: 'log', ALLOW_FIXTURE_QUESTIONS: 'true', LOG_LEVEL: 'error' });
const n = (await app.db.query<any>('select count(*)::int n from question_versions')).rows[0].n;
const moved = readdirSync('.').filter((x) => x.startsWith(dir + '.corrupt-'));
console.log('started with fresh db; questions:', n, '| corrupt copy kept:', moved.length === 1);
await app.close();
for (const d of readdirSync('.').filter((x) => x.startsWith(dir))) rmSync(d, { recursive: true, force: true });
process.exit(n === 50 && moved.length === 1 && !existsSync(dir) ? 0 : 1);
