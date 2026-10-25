import { useState, type ReactNode } from 'react';
import { tutorial } from '../lib/storage';

/** Slim wayfinding strip so people always know where they are in the flow. */
export function JourneyStrip({ current, steps = ['Lobby', 'Climb', 'Results'] }: { current: 0 | 1 | 2; steps?: [string, string, string] | string[] }) {
  return (
    <ol className="container-page flex items-center gap-2 py-2 text-xs font-semibold" aria-label="Where you are">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === current ? 'step' : undefined}>
          {i > 0 && <span aria-hidden className="h-px w-5 bg-line sm:w-10" />}
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${i === current ? 'bg-amber text-ink' : i < current ? 'bg-teal text-ivory' : 'bg-white/5 text-ivory/60'}`}>
            <span aria-hidden>{i < current ? '✓' : i + 1}</span>{s}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** First-solo-game coach marks: pick → submit → results. Skippable and remembered. */
export function CoachTip({ stage, summit }: { stage: 'pick' | 'submit' | 'result' | null; summit?: number }) {
  const [skipped, setSkipped] = useState(tutorial.done());
  if (skipped || !stage) return null;
  const steps = { pick: [1, 'Pick an answer', 'Tap the answer you think is right. You can change your mind until you submit.'], submit: [2, 'Press Submit', 'Submitting locks your answer in. Results appear when the timer ends.'], result: [3, 'Climb!', `Right answers go up a step; wrong or missed ones step down. ${summit ? `Reach step ${summit} to win` : 'Reach the summit to win'} — the question count and the summit height are separate, so you have room for mistakes.`] } as const;
  const [n, title, text] = steps[stage];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-teal-bright/60 bg-teal/30 p-3 text-sm anim-rise" role="note" aria-label={`Tutorial step ${n} of 3`}>
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-bright font-bold text-ink">{n}</span>
      <div className="min-w-0 flex-1"><p className="font-semibold">{title}</p><p className="text-ivory/90">{text}</p></div>
      <button className="min-h-11 shrink-0 px-2 text-xs underline" onClick={() => { tutorial.finish(); setSkipped(true); }}>{stage === 'result' ? 'Got it' : 'Skip'}</button>
    </div>
  );
}
export type { ReactNode };
