export interface Ranked<T> { item: T; rank: number }

/**
 * Standard competition ranking ("1, 1, 3"): equal steps share a rank and the next rank skips.
 * Ties are never broken by name, speed or timestamps; within a tie the input order is kept
 * (a stable *visual* order that carries no rank advantage).
 */
export function rankByStep<T extends { position: number }>(items: T[]): Ranked<T>[] {
  const sorted = [...items].sort((a, b) => b.position - a.position);
  const out: Ranked<T>[] = [];
  sorted.forEach((item, i) => {
    const prev = out[i - 1];
    const rank = prev && prev.item.position === item.position ? prev.rank : i + 1;
    out.push({ item, rank });
  });
  return out;
}
