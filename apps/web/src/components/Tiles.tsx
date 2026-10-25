import { useEffect, useId, useState, type ReactNode } from 'react';
import { MAX_TIME_LIMIT_S, MIN_TIME_LIMIT_S, TIME_PRESETS } from '@elimquest/game-core';

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

const LEVEL_TITLES = ['Foundations', 'Common', 'Basic detail', 'Comfortable', 'Developing', 'Strong', 'Advanced', 'Specialist', 'Expert', 'Mastery'];

/** Difficulty as a tappable 1–10 ladder. Tap one level for a single level; tap another to stretch the range. */
export function LevelRange({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }) {
  const tap = (i: number) => {
    if (min === max) { if (i < min) onChange(i, max); else if (i > max) onChange(min, i); else onChange(i, i); }
    else if (i < min) onChange(i, max); else if (i > max) onChange(min, i); else onChange(i, i);
  };
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-ivory/90">Difficulty</legend>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="group" aria-label="Difficulty levels">
        {Array.from({ length: 10 }, (_, k) => k + 1).map((i) => {
          const on = i >= min && i <= max;
          return (
            <button key={i} type="button" aria-pressed={on} aria-label={`Level ${i}, ${LEVEL_TITLES[i - 1]}`} onClick={() => tap(i)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-xl border text-base font-bold transition active:scale-95 ${on ? 'border-amber bg-amber/20 text-amber' : 'border-line bg-ink text-ivory/80 hover:bg-ink-raised'}`}>
              {i}<span aria-hidden className="text-[9px] font-normal text-ivory/60">{'▮'.repeat(Math.ceil(i / 3.4))}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-ivory/75" aria-live="polite">{min === max ? `Level ${min} only (${LEVEL_TITLES[min - 1]}).` : `Levels ${min}–${max} (${LEVEL_TITLES[min - 1]} → ${LEVEL_TITLES[max - 1]}).`} Tap a level to pick it; tap another to widen the range.</p>
    </fieldset>
  );
}

/** A rule you can switch on, with its description always visible. */
export function RuleToggle({ title, description, on, onChange, badge }: { title: string; description: string; on: boolean; onChange: (v: boolean) => void; badge?: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-amber ${on ? 'border-amber bg-amber/10 ring-2 ring-amber' : 'border-line bg-ink hover:bg-ink-raised'}`}>
      <input type="checkbox" className="mt-1 size-5 shrink-0 accent-amber" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-base font-semibold">{title}{badge && <span className="rounded bg-teal px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{badge}</span>}</span><span className="block text-sm font-normal text-ivory/80">{description}</span></span>
    </label>
  );
}

export const RULE_TEXT = {
  superQuestion: { title: 'Super question', description: 'One hidden question in the game is a super question. When it opens, everyone is told. Answer it correctly and you climb two steps instead of one. Getting it wrong is the usual one step down.' },
  gentle: { title: 'Gentle mode', description: 'Wrong or missed answers never push you down — you simply stay on your step. Great for beginners, children and classes.' },
};
