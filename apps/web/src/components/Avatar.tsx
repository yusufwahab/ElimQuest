import { useId, type ReactNode } from 'react';
import { BODY_COLOURS, EYES, GEAR, GLASSES, HEADWEAR, type AvatarConfig } from '@elimquest/game-core';

const PALETTE: Record<AvatarConfig['body'], { main: string; shade: string; light: string; label: string }> = {
  teal: { main: '#1f9a8f', shade: '#0f6a66', light: '#41c9bb', label: 'Teal' },
  amber: { main: '#f0b23c', shade: '#c4881a', light: '#ffd878', label: 'Amber' },
  violet: { main: '#8a5bd0', shade: '#5c3a98', light: '#b690f2', label: 'Violet' },
  blue: { main: '#3b82e0', shade: '#2358a6', light: '#6fa9f7', label: 'Blue' },
  ivory: { main: '#ece6d6', shade: '#c4baa0', light: '#fffaf0', label: 'Ivory' },
  night: { main: '#2f3745', shade: '#151a23', light: '#515c70', label: 'Night' },
};
export const BODY_LABEL = (b: AvatarConfig['body']) => PALETTE[b].label;
const GOLD = '#f2b858';

/** One avatar drawing used for lobby/results tiles (HTML) and, rasterised, for Phaser textures. Non-human by design. */
export function AvatarFigure({ config, view = 'front', size = 96, title, className }: { config: AvatarConfig; view?: 'front' | 'back'; size?: number; title?: string; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const c = PALETTE[config.body];
  const ink = config.body === 'night' ? '#ffffff' : '#0b1b2a';
  const back = view === 'back';
  const parts: ReactNode[] = [];

  // Gear behind the body
  if (config.gear === 'cape' && !back) parts.push(<path key="cape" d="M26 52 Q60 38 94 52 L110 120 Q60 138 10 120 Z" fill="#1b2a4b" stroke="#0e1830" strokeWidth="2" />);
  if (config.gear === 'hood') parts.push(<path key="hood" d="M22 64 Q22 10 60 10 Q98 10 98 64 Q82 36 60 36 Q38 36 22 64Z" fill="#6a42a8" />);

  parts.push(
    <ellipse key="shadow" cx="60" cy="134" rx="34" ry="5" fill="#000" opacity=".28" />,
    <ellipse key="foot1" cx="44" cy="128" rx="13" ry="7" fill={c.shade} />,
    <ellipse key="foot2" cx="76" cy="128" rx="13" ry="7" fill={c.shade} />,
    <ellipse key="arm1" cx="19" cy="88" rx="9" ry="14" fill={c.main} stroke={c.shade} strokeWidth="2" />,
    <ellipse key="arm2" cx="101" cy="88" rx="9" ry="14" fill={c.main} stroke={c.shade} strokeWidth="2" />,
    <path key="body" d="M60 20 C90 20 104 50 104 84 C104 112 86 130 60 130 C34 130 16 112 16 84 C16 50 30 20 60 20Z" fill={`url(#b${uid})`} stroke={c.shade} strokeWidth="2.5" />,
    <ellipse key="shine" cx="44" cy="46" rx="11" ry="7" fill="#fff" opacity=".16" transform="rotate(-24 44 46)" />,
  );

  if (!back) {
    if (config.eyes === 'round') parts.push(
      <g key="eyes"><ellipse cx="46" cy="68" rx="7" ry="9.5" fill="#fff" stroke={ink} strokeWidth="1.5" /><ellipse cx="74" cy="68" rx="7" ry="9.5" fill="#fff" stroke={ink} strokeWidth="1.5" /><circle cx="47" cy="70" r="3.4" fill="#0b1b2a" /><circle cx="75" cy="70" r="3.4" fill="#0b1b2a" /></g>);
    if (config.eyes === 'happy') parts.push(<path key="eyes" d="M38 72 Q46 58 54 72 M66 72 Q74 58 82 72" fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />);
    if (config.eyes === 'calm') parts.push(<path key="eyes" d="M38 64 Q46 74 54 64 M66 64 Q74 74 82 64" fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />);
    if (config.glasses === 'round') parts.push(<g key="gl" fill="#fff" fillOpacity=".12" stroke={GOLD} strokeWidth="3.5"><circle cx="46" cy="68" r="13" /><circle cx="74" cy="68" r="13" /><path d="M59 67h2" /></g>);
    if (config.glasses === 'square') parts.push(<g key="gl" fill="#fff" fillOpacity=".12" stroke="#1d2530" strokeWidth="3.5"><rect x="32" y="56" width="26" height="22" rx="6" /><rect x="62" y="56" width="26" height="22" rx="6" /><path d="M58 66h4" /></g>);
    if (config.glasses === 'visor') parts.push(<path key="gl" d="M28 62 Q60 50 92 62 L86 80 Q60 86 34 80Z" fill={GOLD} fillOpacity=".22" stroke={GOLD} strokeWidth="3.5" strokeLinejoin="round" />);
  }

  // Gear over the body
  if (config.gear === 'cape' && back) parts.push(<g key="cape"><path d="M22 46 Q60 32 98 46 L108 120 Q60 136 12 120 Z" fill="#1b2a4b" stroke="#0e1830" strokeWidth="2" /><path d="M60 44 V122" stroke="#0e1830" strokeWidth="2" opacity=".5" /><path d="M60 38 l6 7-6 7-6-7z" fill={GOLD} /></g>);
  if (config.gear === 'cape' && !back) parts.push(<path key="clasp" d="M60 40 l6 7-6 7-6-7z" fill={GOLD} stroke="#a67a22" strokeWidth="1" />);
  if (config.gear === 'backpack') parts.push(back
    ? <g key="bp"><rect x="30" y="62" width="60" height="58" rx="14" fill="#8a5a2b" stroke="#5a3a1a" strokeWidth="2.5" /><rect x="40" y="90" width="40" height="22" rx="7" fill="#a56f38" stroke="#5a3a1a" strokeWidth="2" /><path d="M42 62 V50 M78 62 V50" stroke="#5a3a1a" strokeWidth="4" strokeLinecap="round" /></g>
    : <g key="bp"><rect x="92" y="66" width="22" height="46" rx="9" fill="#8a5a2b" stroke="#5a3a1a" strokeWidth="2.5" /><path d="M40 44 L46 100 M80 44 L74 100" stroke="#5a3a1a" strokeWidth="3.5" opacity=".7" /></g>);
  if (config.gear === 'scarf') parts.push(<g key="sc"><path d="M24 56 Q60 74 96 56 L98 70 Q60 88 22 70Z" fill="#1f8f5f" stroke="#0f5a3b" strokeWidth="2" /><path d="M80 74 L88 108 L76 104Z" fill="#1f8f5f" stroke="#0f5a3b" strokeWidth="2" /></g>);

  // Headwear
  if (config.headwear === 'crown') parts.push(<path key="hw" d="M40 28 L44 8 L53 20 L60 4 L67 20 L76 8 L80 28Z" fill={GOLD} stroke="#a67a22" strokeWidth="2" strokeLinejoin="round" />);
  if (config.headwear === 'cap') parts.push(<g key="hw"><path d="M36 34 Q60 2 84 34Z" fill="#f4f1ea" stroke="#c9c2b0" strokeWidth="2" /><path d="M36 34 H84" stroke="#2f8f7f" strokeWidth="5" /></g>);
  if (config.headwear === 'beanie') parts.push(<g key="hw"><path d="M33 36 Q60 -6 87 36Z" fill="#2d62c4" stroke="#1b3f82" strokeWidth="2" /><rect x="31" y="31" width="58" height="10" rx="5" fill="#244f9f" /><circle cx="60" cy="2" r="6" fill="#f4f1ea" /></g>);
  if (config.headwear === 'crescent') parts.push(<path key="hw" d="M50 24 A15 15 0 1 1 72 26 A11 11 0 1 0 50 24Z" fill={GOLD} stroke="#a67a22" strokeWidth="1.5" />);

  return (
    <svg viewBox="0 0 120 140" width={size} height={Math.round(size * (140 / 120))} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={className} xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id={`b${uid}`} x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor={c.light} /><stop offset=".45" stopColor={c.main} /><stop offset="1" stopColor={c.shade} /></linearGradient></defs>
      {parts}
    </svg>
  );
}

// ---- editor ------------------------------------------------------------------------------------
const LABELS = {
  eyes: { round: 'Round eyes', happy: 'Happy eyes', calm: 'Calm eyes' },
  glasses: { none: 'No glasses', round: 'Round glasses', square: 'Square glasses', visor: 'Visor glasses' },
  headwear: { none: 'No headwear', crown: 'Crown', cap: 'White cap', beanie: 'Blue beanie', crescent: 'Crescent' },
  gear: { none: 'No cape or backpack', cape: 'Cape', backpack: 'Backpack', scarf: 'Scarf', hood: 'Hood' },
} as const;

function Group<K extends keyof AvatarConfig>({ legend, field, options, value, onChange, preview }: { legend: string; field: K; options: readonly AvatarConfig[K][]; value: AvatarConfig; onChange: (c: AvatarConfig) => void; preview: (v: AvatarConfig[K]) => ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-ivory/85">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const selected = value[field] === o;
          const label = field === 'body' ? BODY_LABEL(o as AvatarConfig['body']) : (LABELS as any)[field][o as string];
          return (
            <label key={String(o)} className={`relative flex size-11 cursor-pointer items-center justify-center rounded-xl border text-xs transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-amber ${selected ? 'border-amber bg-amber/15 ring-2 ring-amber' : 'border-line bg-ink hover:bg-white/10'}`}>
              <input type="radio" name={`avatar-${field}`} value={String(o)} checked={selected} onChange={() => onChange({ ...value, [field]: o })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
              <span aria-hidden className="pointer-events-none flex items-center justify-center">{preview(o)}</span>
              {selected && <span className="sr-only">(selected)</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function AvatarEditor({ value, onChange }: { value: AvatarConfig; onChange: (c: AvatarConfig) => void }) {
  const swatch = (b: AvatarConfig['body']) => <span className="size-6 rounded-full border-2 border-white/30" style={{ background: PALETTE[b].main }} />;
  const mini = (patch: Partial<AvatarConfig>) => <AvatarFigure config={{ ...value, ...patch }} size={30} />;
  return (
    <div className="grid gap-4">
      <Group legend="Body colour" field="body" options={BODY_COLOURS} value={value} onChange={onChange} preview={swatch} />
      <Group legend="Eyes" field="eyes" options={EYES} value={value} onChange={onChange} preview={(v) => mini({ eyes: v, glasses: 'none', headwear: 'none', gear: 'none' })} />
      <Group legend="Glasses" field="glasses" options={GLASSES} value={value} onChange={onChange} preview={(v) => mini({ glasses: v, headwear: 'none', gear: 'none' })} />
      <Group legend="Headwear" field="headwear" options={HEADWEAR} value={value} onChange={onChange} preview={(v) => mini({ headwear: v, glasses: 'none', gear: 'none' })} />
      <Group legend="Cape or backpack" field="gear" options={GEAR} value={value} onChange={onChange} preview={(v) => mini({ gear: v, glasses: 'none', headwear: 'none' })} />
    </div>
  );
}
