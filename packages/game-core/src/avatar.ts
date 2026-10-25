/** Customisable non-human avatar (latest mockup). Pure config + validation. */
export const BODY_COLOURS = ['teal', 'amber', 'violet', 'blue', 'ivory', 'night'] as const;
export const EYES = ['round', 'happy', 'calm'] as const;
export const GLASSES = ['none', 'round', 'square', 'visor'] as const;
export const HEADWEAR = ['none', 'crown', 'cap', 'beanie', 'crescent'] as const;
export const GEAR = ['none', 'cape', 'backpack', 'scarf', 'hood'] as const;

export interface AvatarConfig {
  body: (typeof BODY_COLOURS)[number];
  eyes: (typeof EYES)[number];
  glasses: (typeof GLASSES)[number];
  headwear: (typeof HEADWEAR)[number];
  gear: (typeof GEAR)[number];
}
export const DEFAULT_AVATAR: AvatarConfig = { body: 'teal', eyes: 'round', glasses: 'round', headwear: 'none', gear: 'cape' };

function pick<T extends string>(list: readonly T[], v: unknown, d: T): T {
  return (list as readonly string[]).includes(v as string) ? (v as T) : d;
}

export function sanitizeAvatar(input: unknown): AvatarConfig {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    body: pick(BODY_COLOURS, o.body, DEFAULT_AVATAR.body),
    eyes: pick(EYES, o.eyes, DEFAULT_AVATAR.eyes),
    glasses: pick(GLASSES, o.glasses, DEFAULT_AVATAR.glasses),
    headwear: pick(HEADWEAR, o.headwear, DEFAULT_AVATAR.headwear),
    gear: pick(GEAR, o.gear, DEFAULT_AVATAR.gear),
  };
}

export function randomAvatar(rand: () => number = Math.random): AvatarConfig {
  const p = <T extends string>(l: readonly T[]): T => l[Math.floor(rand() * l.length)]!;
  return { body: p(BODY_COLOURS), eyes: p(EYES), glasses: p(GLASSES), headwear: p(HEADWEAR), gear: p(GEAR) };
}
