import { hashString, mulberry32, shuffle } from './rng';

export interface PoolQuestion {
  /** Specific published version id. */
  versionId: string;
  /** Stable canonical id: rewording a question keeps this id. */
  canonicalId: string;
  categoryId: string;
  level: number;
}

export interface SelectionRequest {
  pool: PoolQuestion[];
  count: number;
  categoryIds: string[];
  minLevel: number;
  maxLevel: number;
  /** Canonical ids seen recently (host history / signed-in participants). */
  historyCanonicalIds?: ReadonlySet<string>;
  allowHistoryReuse?: boolean;
  /** Per-category weights (e.g. from topic voting); even split when omitted. */
  categoryQuota?: Record<string, number>;
  seed: string;
}

export interface SelectionResult {
  selected: PoolQuestion[];
  /** Extra eligible questions kept server-side to replace voided ones. */
  reserve: PoolQuestion[];
  shortage: number;
  /** Eligible count ignoring history, and unseen count, for the inventory message. */
  eligible: number;
  fresh: number;
}

/**
 * Deterministic selection. Never repeats a canonicalId within a match; prefers unseen questions and
 * only uses history when explicitly allowed. A shortage is reported, never silently padded.
 */
export function selectQuestions(req: SelectionRequest): SelectionResult {
  const rand = mulberry32(hashString(req.seed));
  const history = req.historyCanonicalIds ?? new Set<string>();
  const seen = new Set<string>();
  const eligibleAll: PoolQuestion[] = [];
  for (const q of req.pool) {
    if (!req.categoryIds.includes(q.categoryId)) continue;
    if (q.level < req.minLevel || q.level > req.maxLevel) continue;
    if (seen.has(q.canonicalId)) continue;
    seen.add(q.canonicalId);
    eligibleAll.push(q);
  }
  const fresh = eligibleAll.filter((q) => !history.has(q.canonicalId));
  const stale = eligibleAll.filter((q) => history.has(q.canonicalId));
  const ordered = [...shuffle(fresh, rand), ...(req.allowHistoryReuse ? shuffle(stale, rand) : [])];

  const buckets = new Map<string, PoolQuestion[]>();
  for (const id of req.categoryIds) buckets.set(id, []);
  for (const q of ordered) buckets.get(q.categoryId)!.push(q);

  const quota = computeQuota(req.categoryIds, req.count, req.categoryQuota, buckets);
  const selected: PoolQuestion[] = [];
  for (const id of req.categoryIds) selected.push(...buckets.get(id)!.splice(0, quota[id] ?? 0));
  // Transparent redistribution when a category cannot fill its quota.
  const leftovers = [...buckets.values()].flat();
  while (selected.length < req.count && leftovers.length) selected.push(leftovers.shift()!);
  const final = shuffle(selected, rand).slice(0, req.count);
  const chosen = new Set(final.map((q) => q.canonicalId));
  const reserve = ordered.filter((q) => !chosen.has(q.canonicalId)).slice(0, 5);
  return { selected: final, reserve, shortage: Math.max(0, req.count - final.length), eligible: eligibleAll.length, fresh: fresh.length };
}

function computeQuota(ids: string[], count: number, weights: Record<string, number> | undefined, buckets: Map<string, PoolQuestion[]>): Record<string, number> {
  const w: Record<string, number> = {};
  let total = 0;
  for (const id of ids) { w[id] = Math.max(0, weights?.[id] ?? 1); total += w[id]!; }
  if (total === 0) { for (const id of ids) w[id] = 1; total = ids.length; }
  const quota: Record<string, number> = {};
  const rem: { id: string; frac: number }[] = [];
  let assigned = 0;
  for (const id of ids) {
    const exact = (w[id]! / total) * count;
    quota[id] = Math.min(Math.floor(exact), buckets.get(id)!.length);
    assigned += quota[id]!;
    rem.push({ id, frac: exact - Math.floor(exact) });
  }
  // Largest remainder; ties by category id (deterministic, never by input timing).
  rem.sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id));
  for (let guard = 0; assigned < count && guard < count; guard++) {
    let progressed = false;
    for (const r of rem) {
      if (assigned >= count) break;
      if (quota[r.id]! < buckets.get(r.id)!.length) { quota[r.id]!++; assigned++; progressed = true; }
    }
    if (!progressed) break;
  }
  return quota;
}

/** Turn up-to-three-preference ballots into category weights (spec §9.6). */
export function quotaFromVotes(shortlist: string[], votes: string[][]): Record<string, number> {
  const w: Record<string, number> = {};
  for (const id of shortlist) w[id] = 0;
  const points = [3, 2, 1];
  for (const ballot of votes) {
    const seen = new Set<string>();
    ballot.slice(0, 3).forEach((id, i) => {
      if (id in w && !seen.has(id)) { w[id]! += points[i]!; seen.add(id); }
    });
  }
  // Every shortlisted topic keeps a floor of 1 so nothing vanishes silently.
  for (const id of shortlist) w[id] = Math.max(1, w[id]!);
  return w;
}
