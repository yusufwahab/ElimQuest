/**
 * Difficulty is shown to people as four named bands, never as 1–10. The database keeps the 1–10 number (so nothing has to
 * migrate and a finer scale can return later); each band covers a few of those numbers.
 */
export interface Band { id: 'beginner' | 'intermediate' | 'advanced' | 'scholar'; name: string; min: number; max: number; rep: number; blurb: string }

export const BANDS: readonly Band[] = [
  { id: 'beginner', name: 'Beginner', min: 1, max: 3, rep: 2, blurb: 'Well-known basics most people have met.' },
  { id: 'intermediate', name: 'Intermediate', min: 4, max: 6, rep: 5, blurb: 'Needs some study or regular practice.' },
  { id: 'advanced', name: 'Advanced', min: 7, max: 8, rep: 7, blurb: 'Detail that takes real learning.' },
  { id: 'scholar', name: 'Scholar', min: 9, max: 10, rep: 9, blurb: 'Specialist knowledge.' },
];

export const bandOfLevel = (level: number): Band => BANDS.find((b) => level >= b.min && level <= b.max) ?? BANDS[0]!;

/** Accepts a band name ("Scholar") or a number 1–10 (CSV imports). Returns the stored 1–10 level, or null if unrecognised. */
export function parseLevel(raw: unknown): number | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  const band = BANDS.find((b) => b.id === s || b.name.toLowerCase() === s);
  if (band) return band.rep;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

/** What people choose on setup screens: Mixed (everything) or one band. Stored as the usual min/max level pair. */
export type Difficulty = 'mixed' | Band['id'];
export const difficultyRange = (d: Difficulty): [number, number] => { const b = BANDS.find((x) => x.id === d); return b ? [b.min, b.max] : [1, 10]; };
/** The choice a stored range corresponds to, or null for an older custom range. */
export function difficultyOf(min: number, max: number): Difficulty | null {
  if (min <= 1 && max >= 10) return 'mixed';
  return BANDS.find((b) => b.min === min && b.max === max)?.id ?? null;
}

/** "Beginner to Scholar", "Beginner", … for any stored range. */
export function describeLevels(min: number, max: number): string {
  const a = bandOfLevel(min), b = bandOfLevel(max);
  if (min <= 1 && max >= 10) return 'All difficulties';
  return a.id === b.id ? a.name : `${a.name} to ${b.name}`;
}
