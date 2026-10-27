import { useState, type ReactNode } from 'react';
import { Button } from './ui';

/** Progress header for a multi-step form. Finished steps are buttons so people can jump back. */
export function StepBar({ steps, current, reached, onGo }: { steps: string[]; current: number; reached: number; onGo: (i: number) => void }) {
  return (
    <nav aria-label="Setup steps">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {steps.map((s, i) => {
          const done = i < current, here = i === current, can = i <= reached;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
              <button type="button" disabled={!can || here} onClick={() => onGo(i)} aria-current={here ? 'step' : undefined}
                className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border px-2 text-left text-sm font-semibold transition sm:px-3 ${here ? 'border-amber bg-amber/15' : done ? 'border-line bg-ink-soft hover:bg-ink-raised' : 'border-line/60 bg-ink text-ivory/60'}`}>
                <span aria-hidden className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${here ? 'bg-amber text-ink' : done ? 'bg-success text-ink' : 'bg-white/10'}`}>{done ? '✓' : i + 1}</span>
                <span className={`truncate ${here ? '' : 'max-sm:sr-only'}`}>{s}</span>
                <span className="sr-only">{done ? ' (done)' : here ? ' (current step)' : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Back / Continue footer (or a custom final action). */
export function StepNav({ current, last, onBack, onNext, canNext = true, final }: { current: number; last: number; onBack: () => void; onNext: () => void; canNext?: boolean; final?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" className="!min-h-11 text-sm" onClick={onBack} disabled={current === 0}>← Back</Button>
      {current < last ? <Button className="!min-h-11" onClick={onNext} disabled={!canNext}>Continue <span aria-hidden>→</span></Button> : final}
    </div>
  );
}

/** A small "i" that opens the long explanation. Keeps screens short; nothing is hidden from screen readers (button + region). */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex flex-col">
      <button type="button" aria-expanded={open} aria-label={`More about ${label.toLowerCase()}`} onClick={() => setOpen((o) => !o)}
        className="inline-flex size-11 items-center justify-center rounded-full border border-line text-sm font-bold text-ivory/80 hover:bg-white/10">i</button>
      {open && <span role="note" className="mt-1 block max-w-xs rounded-lg border border-line bg-ink-raised p-2.5 text-xs font-normal text-ivory/90">{children}</span>}
    </span>
  );
}
