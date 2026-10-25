import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Env } from '../env';

export interface QueryResult<T> { rows: T[]; rowCount: number }
export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Run a multi-statement script (migrations). No parameters. */
  exec(sql: string): Promise<void>;
}
export interface Db extends Queryable {
  kind: 'pglite' | 'pg';
  /** Run fn in one transaction. Inside fn use ONLY the supplied handle (PGlite would deadlock otherwise). */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const here = dirname(fileURLToPath(import.meta.url));
export const DB_DIR = join(here, '..', '..', '..', '..', 'database');

export async function openDb(env: Env): Promise<Db> {
  if (env.DB_DRIVER === 'pglite') {
    if (env.NODE_ENV === 'production') throw new Error('PGlite is refused in production');
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = env.PGLITE_DIR ? new PGlite(env.PGLITE_DIR) : new PGlite();
    await pg.waitReady;
    return {
      kind: 'pglite',
      query: async (sql, params) => {
        const r = await pg.query(sql, params as any[]);
        return { rows: r.rows as any[], rowCount: r.rows.length || (r.affectedRows ?? 0) };
      },
      exec: async (sql) => { await pg.exec(sql); },
      tx: (fn) =>
        pg.transaction(async (t) =>
          fn({
            query: async (sql, params) => {
              const r = await t.query(sql, params as any[]);
              return { rows: r.rows as any[], rowCount: r.rows.length || (r.affectedRows ?? 0) };
            },
            exec: async (sql) => { await t.exec(sql); },
          }),
        ),
      close: () => pg.close(),
    };
  }
  const { default: pgmod } = await import('pg');
  const pool = new pgmod.Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX, ssl: env.DATABASE_URL?.includes('localhost') ? undefined : { rejectUnauthorized: false } });
  return {
    kind: 'pg',
    query: async (sql, params) => {
      const r = await pool.query(sql, params as any[]);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    exec: async (sql) => { await pool.query(sql); },
    tx: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const out = await fn({
          query: async (sql, params) => {
            const r = await c.query(sql, params as any[]);
            return { rows: r.rows, rowCount: r.rowCount ?? 0 };
          },
          exec: async (sql) => { await c.query(sql); },
        });
        await c.query('commit');
        return out;
      } catch (e) {
        await c.query('rollback').catch(() => undefined);
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Apply pending migrations (and dev-only SQL for the PGlite driver). Records them in schema_migrations. */
export async function migrate(db: Db, opts: { dev: boolean }): Promise<string[]> {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const applied: string[] = [];
  const run = async (name: string, file: string) => {
    const done = await db.query('select 1 from schema_migrations where name = $1', [name]);
    if (done.rowCount) return;
    const sql = readFileSync(file, 'utf8');
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query('insert into schema_migrations(name) values ($1)', [name]);
    });
    applied.push(name);
  };
  if (opts.dev) await run('dev/roles', join(DB_DIR, 'dev', 'roles.sql'));
  const files = readdirSync(join(DB_DIR, 'migrations')).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();
  for (const f of files) await run(f, join(DB_DIR, 'migrations', f));
  if (opts.dev) await run('dev/dev_auth', join(DB_DIR, 'dev', 'dev_auth.sql'));
  return applied;
}
