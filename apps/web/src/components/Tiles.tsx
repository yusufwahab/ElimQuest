import { useEffect, useId, useState, type ReactNode } from 'react';
import { BANDS, MAX_TIME_LIMIT_S, MIN_TIME_LIMIT_S, TIME_PRESETS, describeLevels, difficultyOf, difficultyRange, type Difficulty } from '@elimquest/game-core';

/** Gamified selectors: grids of big, tappable tiles instead of dropdowns. All are real radio/checkbox groups. */

const tile = (on: boolean, extra = '') =>
  `relative flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-center text-sm font-semibold transition active:scale-[.97] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-amber ${on ? 'border-amber bg-amber/15 text-ivory ring-2 ring-amber' : 'border-line bg-ink hover:bg-ink-raised'} ${extra}`;

export interface TileOption<T> { value: T; label: ReactNode; sub?: ReactNode; ariaLabel?: string }

export function TileGrid<T extends string | number>({ legend, hint, value, options, onChange, cols = 'grid-cols-3' }: { legend: string; hint?: ReactNode; value: T; options: TileOption<T>[]; onChange: (v: T) => void; cols?: string }) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-ivory/90">{legend}</legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map((o) => (
          <label key={String(o.value)} className={tile(o.value === value)}>
            <input type="radio" name={name} className="sr-only" checked={o.value === value} onChange={() => onChange(o.value)} aria-label={o.ariaLabel} />
            <span className="text-base leading-tight">{o.label}</span>
            {o.sub && <span className="text-[11px] font-normal text-ivory/70">{o.sub}</span>}
            {o.value === value && <span aria-hidden className="absolute right-1.5 top-1 text-xs text-amber">✓</span>}
          </label>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-xs text-ivory/70">{hint}</p>}
    </fieldset>
  );
}

/** Multi-select tiles (topics). */
export function TileMulti({ legend, hint, values, options, onChange, cols = 'grid-cols-2 sm:grid-cols-3' }: { legend: string; hint?: ReactNode; values: string[]; options: TileOption<string>[]; onChange: (v: string[]) => void; cols?: string }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-ivory/90">{legend}</legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <label key={o.value} className={tile(on, 'min-h-14')}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? values.filter((x) => x !== o.value) : [...values, o.value])} />
              <span className="leading-tight">{o.label}</span>
              {o.sub && <span className="text-[11px] font-normal text-ivory/70">{o.sub}</span>}
              {on && <span aria-hidden className="absolute right-1.5 top-1 text-xs text-amber">✓</span>}
            </label>
          );
        })}
      </div>
      {hint && <p className="mt-1.5 text-xs text-ivory/70">{hint}</p>}
    </fieldset>
  );
}

/** Seconds per question: quick preset tiles, or any whole number from ${MIN_TIME_LIMIT_S} to ${MAX_TIME_LIMIT_S} of your own. */
export function TimePicker({ value, onChange, legend = 'Time per question' }: { value: number; onChange: (v: number) => void; legend?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => { const n = Math.round(Number(text)); const c = Number.isFinite(n) && text.trim() !== '' ? Math.min(MAX_TIME_LIMIT_S, Math.max(MIN_TIME_LIMIT_S, n)) : value; onChange(c); setText(String(c)); };
  const id = useId();
  return (
    <div className="grid gap-2">
      <TileGrid legend={legend} value={value} onChange={onChange} cols="grid-cols-4 sm:grid-cols-8" options={TIME_PRESETS.map((n) => ({ value: n as number, label: `${n}s`, ariaLabel: `${n} seconds` }))} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm text-ivory/85">Or set your own</label>
        <input id={id} type="number" inputMode="numeric" min={MIN_TIME_LIMIT_S} max={MAX_TIME_LIMIT_S} step={1} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} className="field !w-24 text-center" aria-describedby={id + '-h'} />
        <span id={id + '-h'} className="text-xs text-ivory/70">seconds ({MIN_TIME_LIMIT_S}–{MAX_TIME_LIMIT_S}). Everyone gets the same time on every question.</span>
      </div>
    </div>
  );
}

/** Mixed (default) or one of four named bands. `counts` is the number of published questions available at each choice. */
export function DifficultyPicker({ min, max, onChange, counts }: { min: number; max: number; onChange: (min: number, max: number) => void; counts?: (min: number, max: number) => number | null }) {
  const cur = difficultyOf(min, max);
  const n = (a: number, b: number) => { const c = counts?.(a, b); return c == null ? undefined : `${c} question${c === 1 ? '' : 's'}`; };
  const opts: TileOption<string>[] = [
    { value: 'mixed', label: 'Mixed', sub: n(1, 10) ?? 'A bit of everything' },
    ...BANDS.map((b) => ({ value: b.id as string, label: b.name, sub: n(b.min, b.max) })),
    ...(cur ? [] : [{ value: 'custom', label: 'Custom', sub: describeLevels(min, max) }]),
  ];
  const hint = cur && cur !== 'mixed' ? BANDS.find((b) => b.id === cur)!.blurb : 'Mixed gives everyone a bit of everything. Pick a band to make it easier or harder.';
  return <TileGrid legend="Difficulty" value={cur ?? 'custom'} onChange={(v) => { if (v !== 'custom') { const [a, b] = difficultyRange(v as Difficulty); onChange(a, b); } }} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" hint={hint} options={opts} />;
}

/** A rule you can switch on. With `short` the long description sits behind an "i" so the screen stays compact. */
export function RuleToggle({ title, description, short, on, onChange, badge }: { title: string; description: string; short?: string; on: boolean; onChange: (v: boolean) => void; badge?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border transition ${on ? 'border-amber bg-amber/10 ring-2 ring-amber' : 'border-line bg-ink hover:bg-ink-raised'}`}>
      <div className="flex items-start gap-1 pr-1">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl p-3 text-left has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-amber">
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-amber" checked={on} onChange={(e) => onChange(e.target.checked)} />
          <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-base font-semibold">{title}{badge && <span className="rounded bg-teal px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{badge}</span>}</span>
            <span className="block text-sm font-normal text-ivory/80">{short ?? description}</span></span>
        </label>
        {short && <button type="button" aria-expanded={open} aria-label={`More about ${title.toLowerCase()}`} onClick={() => setOpen((o) => !o)} className="mt-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-sm font-bold text-ivory/80 hover:bg-white/10">i</button>}
      </div>
      {short && open && <p role="note" className="border-t border-line/60 px-3 pb-3 pt-2 text-sm text-ivory/85">{description}</p>}
    </div>
  );
}

export const RULE_TEXT = {
  superQuestion: { title: 'Super question', short: 'One hidden question is worth two steps.', description: 'One hidden question in the game is a super question. When it opens, everyone is told. Answer it correctly and you climb two steps instead of one. Getting it wrong is the usual one step down.' },
  gentle: { title: 'Gentle mode', short: 'Wrong answers never push you down.', description: 'Wrong or missed answers never push you down — you simply stay on your step. Great for beginners, children and classes.' },
};
