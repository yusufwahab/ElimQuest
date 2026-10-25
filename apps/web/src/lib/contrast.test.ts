import { describe, expect, it } from 'vitest';
import { themeTokens } from '@elimquest/config';

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
// Blend ivory at `alpha` over a background (for the text-ivory/70 style muted text).
const blend = (fg: string, bg: string, alpha: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');

describe('design-token contrast (WCAG AA = 4.5:1 body text, 3:1 large text/UI)', () => {
  const t = themeTokens;
  it.each([
    ['ivory text on ink', t.ivory, t.ink, 4.5],
    ['ivory text on soft ink card', t.ivory, t.inkSoft, 4.5],
    ['amber on ink (links, eyebrow, timer)', t.amber, t.ink, 4.5],
    ['ink on amber (primary button)', t.ink, t.amber, 4.5],
    ['ivory on teal (secondary button)', t.ivory, t.teal, 4.5],
    ['ink on ivory (join panel)', t.ink, t.ivory, 4.5],
    ['success green on ink', t.success, t.ink, 4.5],
    ['danger red on ink', t.danger, t.ink, 4.5],
    ['muted ivory/70 on ink', blend(t.ivory, t.ink, 0.7), t.ink, 4.5],
    ['muted ivory/70 on soft ink', blend(t.ivory, t.inkSoft, 0.7), t.inkSoft, 4.5],
  ])('%s', (_n, fg, bg, min) => { expect(ratio(fg as string, bg as string)).toBeGreaterThanOrEqual(min as number); });
});
