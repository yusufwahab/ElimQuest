import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '../db/db';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error', public extra?: Record<string, unknown>) {
    super(message);
  }
}

export async function one<T = any>(q: Queryable, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const r = await q.query<T>(sql, params);
  return r.rows[0];
}
export async function many<T = any>(q: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await q.query<T>(sql, params)).rows;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** 256-bit opaque credential, URL-safe. Only its hash is stored. */
export const newToken = () => randomBytes(32).toString('base64url');

export async function audit(
  q: Queryable,
  e: { actorId?: string | null; actorLabel?: string; action: string; entityType: string; entityId?: string; gameId?: string | null; detail?: Record<string, unknown> },
) {
  await q.query(
    'insert into audit_events(actor_id, actor_label, action, entity_type, entity_id, game_id, detail) values ($1,$2,$3,$4,$5,$6,$7)',
    [e.actorId ?? null, e.actorLabel ?? '', e.action, e.entityType, e.entityId ?? '', e.gameId ?? null, JSON.stringify(e.detail ?? {})],
  );
}

export const toMs = (d: Date | string | null | undefined): number | null => (d == null ? null : new Date(d).getTime());

/** Neutralise spreadsheet formula injection for CSV exports. */
export function csvSafe(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Strip anything HTML-ish from user supplied text shown to others. */
export function plainText(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}
