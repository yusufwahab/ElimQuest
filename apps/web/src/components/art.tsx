import { DEFAULT_AVATAR, type AvatarConfig } from '@elimquest/game-core';
import { AvatarFigure } from './Avatar';

/**
 * PLACEHOLDER ART. Code-drawn SVG standing in for the production illustrations briefed in docs/ASSETS.md.
 * Replace by dropping files into apps/web/src/assets and swapping these components (see asset manifest).
 */
const LANTERNS: [number, number, number][] = [[1020, 560, 1], [1180, 470, 0.9], [1310, 390, 0.8], [1430, 320, 0.72], [880, 640, 1.1]];

export function HeroArt({ className = '' }: { className?: string }) {
  const you: AvatarConfig = { ...DEFAULT_AVATAR, gear: 'cape', headwear: 'none' };
  const friend: AvatarConfig = { body: 'amber', eyes: 'happy', glasses: 'none', headwear: 'none', gear: 'backpack' };
  const stars = Array.from({ length: 26 }, (_, i) => ({ x: (i * 197) % 1600, y: (i * 89) % 330, r: 1 + (i % 3) * 0.6, d: (i % 7) * 0.4 }));
  return (
    <div className={className} aria-hidden>
      {/* Desktop composition: quiet dark space on the left, architecture and the climb on the right. */}
      <svg className="hidden h-full w-full sm:block" viewBox="0 0 1600 800" preserveAspectRatio="xMaxYMid slice" role="presentation">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#050f1c" /><stop offset=".55" stopColor="#0a2a40" /><stop offset="1" stopColor="#0d4658" /></linearGradient>
          <radialGradient id="glow"><stop offset="0" stopColor="#ffd98a" stopOpacity=".95" /><stop offset=".4" stopColor="#f2b858" stopOpacity=".35" /><stop offset="1" stopColor="#f2b858" stopOpacity="0" /></radialGradient>
          <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9c9a3" /><stop offset="1" stopColor="#8e7f5d" /></linearGradient>
          <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fb7c4" stopOpacity="0" /><stop offset="1" stopColor="#7fb7c4" stopOpacity=".35" /></linearGradient>
          <linearGradient id="fadeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#071b2d" stopOpacity=".95" /><stop offset=".55" stopColor="#071b2d" stopOpacity="0" /></linearGradient>
        </defs>
        <rect width="1600" height="800" fill="url(#sky)" />
        {stars.map((s, i) => <circle key={i} className="anim-twinkle" style={{ animationDelay: `${s.d}s` }} cx={s.x} cy={s.y} r={s.r} fill="#fff" />)}
        <path d="M690 90a40 40 0 1 0 33 64a31 31 0 1 1-33-64z" fill="#f4ead0" opacity=".9" />
        {/* distant palace */}
        <g fill="#0c3347" opacity=".95"><path d="M700 520h520V300q-30-80-110-80t-110 80v-60q-40-70-110-70t-110 70z" /><path d="M1000 520V200q0-70 70-90 70 20 70 90v320z" /></g>
        <g fill="#f2b858"><path d="M1040 520v-170q0-40 30-50 30 10 30 50v170z" opacity=".9" /><rect x="1200" y="300" width="26" height="46" rx="13" opacity=".7" /></g>
        <path d="M1060 120l10-30 10 30z" fill="#f2b858" />
        {/* staircase */}
        <g>
          {Array.from({ length: 11 }, (_, i) => {
            const x = 760 + i * 66, y = 700 - i * 52, w = 330 - i * 10;
            return <g key={i}><path d={`M${x} ${y}h${w}l-14 -22h-${w}z`} fill="url(#stone)" opacity={0.95 - i * 0.02} /><rect x={x} y={y} width={w} height="16" fill="#6e6044" opacity=".85" /></g>;
          })}
          <path d="M740 700L1460 160" stroke="#c9b88f" strokeWidth="8" opacity=".7" />
          <path d="M1100 720L1580 400" stroke="#075567" strokeWidth="14" opacity=".55" />
        </g>
        {LANTERNS.map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <circle r="70" fill="url(#glow)" className="anim-twinkle" style={{ animationDelay: `${i * 0.5}s` }} />
            <rect x="-9" y="-16" width="18" height="30" rx="4" fill="#f9d98f" stroke="#a67a22" strokeWidth="2" /><path d="M-11 -16h22l-11 -10z" fill="#a67a22" />
          </g>
        ))}
        <rect y="560" width="1600" height="240" fill="url(#mist)" />
        <g transform="translate(1120 310) scale(.62)"><g className="anim-float"><AvatarFigure config={you} view="back" size={170} /></g></g>
        <g transform="translate(1250 235) scale(.52)"><g className="anim-float" style={{ animationDelay: '.6s' }}><AvatarFigure config={friend} view="back" size={170} /></g></g>
        <rect width="1600" height="800" fill="url(#fadeL)" />
      </svg>
      {/* Mobile composition: compact crop, quiet band at the top for the headline. */}
      <svg className="block h-full w-full sm:hidden" viewBox="0 0 600 420" preserveAspectRatio="xMidYMax slice" role="presentation">
        <defs>
          <linearGradient id="skym" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#071b2d" /><stop offset="1" stopColor="#0d4658" /></linearGradient>
          <radialGradient id="glowm"><stop offset="0" stopColor="#ffd98a" stopOpacity=".9" /><stop offset="1" stopColor="#f2b858" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="600" height="420" fill="url(#skym)" />
        <path d="M60 80a24 24 0 1 0 20 38a19 19 0 1 1-20-38z" fill="#f4ead0" opacity=".85" />
        <g fill="#0c3347"><path d="M120 300h360V190q-20-50-80-50t-100 40q-40-30-90 0z" /><path d="M250 300V120q0-40 50-55 50 15 50 55v180z" /></g>
        <path d="M300 62l7-20 7 20z" fill="#f2b858" />
        {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${130 + i * 40} ${400 - i * 34}h${280 - i * 12}l-10 -16h-${280 - i * 12}z`} fill="#cdbb92" opacity={0.95 - i * 0.05} />)}
        {[[170, 360], [300, 300], [420, 250]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="34" fill="url(#glowm)" className="anim-twinkle" style={{ animationDelay: `${i * 0.6}s` }} />)}
        <g transform="translate(330 300) scale(.4)"><g className="anim-float"><AvatarFigure config={you} view="back" size={170} /></g></g>
        <g transform="translate(415 262) scale(.33)"><g className="anim-float" style={{ animationDelay: '.5s' }}><AvatarFigure config={friend} view="back" size={170} /></g></g>
      </svg>
    </div>
  );
}

const CAT_STYLE: Record<string, [string, string]> = {
  quran: ['#0b4a5c', '#19a7b8'], hadith: ['#3a2a1a', '#c98d2c'], seerah: ['#7a3d1a', '#f2b858'], prophets: ['#1d3a5f', '#6aa6f5'],
  history: ['#3c2a55', '#b690f2'], practices: ['#14503a', '#3fb67a'], mixed: ['#12344f', '#f2b858'],
};

/** Placeholder category illustration (no text baked in). Replace with commissioned art per docs/ASSETS.md. */
export function CategoryArt({ slug, className = '' }: { slug: string; className?: string }) {
  const [a, b] = CAT_STYLE[slug] ?? CAT_STYLE.mixed!;
  return (
    <svg className={className} viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden role="presentation">
      <defs><linearGradient id={`cg-${slug}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} stopOpacity=".85" /></linearGradient>
        <pattern id={`cp-${slug}`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M20 2l6 12 12 6-12 6-6 12-6-12-12-6 12-6z" fill="none" stroke="#fff" strokeOpacity=".12" /></pattern></defs>
      <rect width="320" height="180" fill={`url(#cg-${slug})`} /><rect width="320" height="180" fill={`url(#cp-${slug})`} />
      <g fill="#fff" fillOpacity=".9">
        {slug === 'quran' && <path d="M60 130l90-30 90 30-90 14zM150 100v44" stroke="#f2b858" strokeWidth="3" fill="#f7f1e5" />}
        {slug === 'hadith' && <g><rect x="110" y="90" width="100" height="14" rx="3" /><rect x="118" y="106" width="92" height="14" rx="3" fillOpacity=".7" /><rect x="104" y="122" width="108" height="14" rx="3" fillOpacity=".5" /></g>}
        {slug === 'seerah' && <g><circle cx="230" cy="60" r="24" fill="#ffe29a" /><path d="M0 150Q80 100 160 140T320 130V180H0z" fill="#3b1d0c" fillOpacity=".6" /></g>}
        {slug === 'prophets' && <g><path d="M70 140h180l-20-30H90z" fillOpacity=".8" /><path d="M160 40v70M130 70h60" stroke="#fff" strokeWidth="4" /></g>}
        {slug === 'history' && <g><path d="M90 140V80q0-30 30-30t30 30v60zM170 140V90q0-24 24-24t24 24v50z" fillOpacity=".8" /></g>}
        {slug === 'practices' && <g><path d="M160 40a40 40 0 1 0 30 70a32 32 0 1 1-30-70z" fill="#ffe29a" /></g>}
        {!['quran', 'hadith', 'seerah', 'prophets', 'history', 'practices'].includes(slug) && <g><path d="M160 40l14 28 30 4-22 20 6 30-28-15-28 15 6-30-22-20 30-4z" fill="#ffe29a" /></g>}
      </g>
    </svg>
  );
}
