// Proves PGLITE_DIR persists the dev database (stable ids, data survives a restart).
import { rmSync } from 'node:fs';
import { createApp } from '../../apps/server/src/app';
const dir = '.pglite-check';
rmSync(dir, { recursive: true, force: true });
const env = { NODE_ENV: 'test', DB_DRIVER: 'pglite', PGLITE_DIR: dir, AUTH_MODE: 'dev', EMAIL_MODE: 'log', ALLOW_FIXTURE_QUESTIONS: 'true', LOG_LEVEL: 'error' };
const ids = async () => { const a = await createApp(env); const r = await a.db.query<any>("select id from categories where slug='quran'"); const n = await a.db.query<any>('select count(*)::int n from question_versions'); await a.close(); return [r.rows[0].id, n.rows[0].n]; };
const first = await ids(); const second = await ids();
console.log('category id stable across restarts:', first[0] === second[0], '| questions:', first[1], '->', second[1]);
rmSync(dir, { recursive: true, force: true });
process.exit(first[0] === second[0] && first[1] === second[1] ? 0 : 1);
