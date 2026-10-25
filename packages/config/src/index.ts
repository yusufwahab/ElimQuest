/**
 * Central brand + theme boundary (spec §1). Change the name, tagline, colours and email
 * branding here; nothing in business logic hard-codes them.
 */
export const brand = {
  name: 'ElimQuest',
  tagline: 'Every answer, a step higher.',
  description: 'Explore Islamic knowledge. Challenge your friends. Rise together.',
  hero: { eyebrow: 'Learn. Play. Rise.', line1: 'Every answer,', line2: 'a step higher.' },
  email: { fromName: 'ElimQuest', footer: 'You received this because you created a game on ElimQuest.' },
  /** Replace with the owner's final contact before launch. */
  supportEmail: 'support@example.invalid',
} as const;

/** Design tokens. Mirrored into Tailwind `@theme` in apps/web/src/index.css. */
export const themeTokens = {
  ink: '#071B2D',
  inkSoft: '#0D2A42',
  teal: '#075567',
  tealBright: '#19A7B8',
  amber: '#F2B858',
  ivory: '#F7F1E5',
  success: '#3FB67A',
  danger: '#E5736B',
} as const;

/** Platform-wide limits; server may lower (never raise past 150 without load evidence). */
export const platformLimits = {
  maxPlayersHardCap: 150,
  /** Spectators + host connections allowed on top of players (spec §6). */
  spectatorBudgetPerRoom: 30,
} as const;
