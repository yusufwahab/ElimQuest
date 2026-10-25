import { useEffect, useState } from 'react';
import { msLeft } from '../lib/roomState';

/**
 * Local display clock. Only this tiny component ticks (4×/s); the room state is not touched.
 * `deadline` is on the server clock; `offset` is serverTime − clientTime.
 */
export function useMsLeft(deadline: number | null, offset: number, tickMs = 250) {
  const [ms, setMs] = useState(() => (deadline ? msLeft(deadline, offset) : 0));
  useEffect(() => {
    if (!deadline) { setMs(0); return; }
    const update = () => setMs(msLeft(deadline, offset));
    update();
    const id = setInterval(update, tickMs);
    return () => clearInterval(id);
  }, [deadline, offset, tickMs]);
  return ms;
}

/** Ticks only when the displayed whole second changes (1 update/s instead of 4), aligned to the deadline. */
export function useSecondsLeft(deadline: number | null, offset: number) {
  const [ms, setMs] = useState(() => (deadline ? msLeft(deadline, offset) : 0));
  useEffect(() => {
    if (!deadline) { setMs(0); return; }
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const left = msLeft(deadline, offset);
      setMs(left);
      if (left > 0) t = setTimeout(tick, left - (Math.ceil(left / 1000) - 1) * 1000 + 2);
    };
    tick();
    return () => clearTimeout(t);
  }, [deadline, offset]);
  return ms;
}

export function TimerBar({ openedAt, deadline, offset }: { openedAt: number; deadline: number; offset: number }) {
  const ms = useSecondsLeft(deadline, offset);
  const total = Math.max(1, deadline - openedAt);
  const frac = Math.max(0, Math.min(1, ms / total));
  const secs = Math.ceil(ms / 1000);
  const urgent = secs <= 5;
  return (
    <div className="flex items-center gap-3" role="timer" aria-label="Time left">
      <span className={`min-w-[3.2rem] text-right font-display text-3xl tabular-nums ${urgent ? 'text-danger' : 'text-amber'}`} aria-hidden>{secs}s</span>
      <span className="sr-only">{secs} seconds left</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden><div className={`h-full origin-left rounded-full transition-transform duration-1000 ease-linear will-change-transform ${urgent ? 'bg-danger' : 'bg-teal-bright'}`} style={{ transform: `scaleX(${frac})` }} /></div>
    </div>
  );
}

/** Circular countdown (SVG ring). Ticks 4x/s in this component only. */
export function TimerRing({ openedAt, deadline, offset, size = 56 }: { openedAt: number; deadline: number; offset: number; size?: number }) {
  const ms = useSecondsLeft(deadline, offset);
  const frac = Math.max(0, Math.min(1, ms / Math.max(1, deadline - openedAt)));
  const secs = Math.ceil(ms / 1000);
  const urgent = secs <= 5;
  const r = (size - 8) / 2, circ = 2 * Math.PI * r;
  return (
    <div role="timer" aria-label="Time left" className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(247,241,229,.15)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={urgent ? '#e5736b' : '#f2b858'} strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums ${urgent ? 'text-danger' : 'text-ivory'}`} aria-hidden>{secs}s</span>
      <span className="sr-only">{secs} seconds left</span>
    </div>
  );
}

/** "Question 7 of 20", timer ring, level/topic chip and progress segments (reference layout). */
export function QuestionHeader({ roundNo, total, openedAt, deadline, offset, level, category }: { roundNo: number; total: number; openedAt: number; deadline: number; offset: number; level?: number; category?: string }) {
  const chip = [level ? `Level ${level}` : '', category].filter(Boolean).join(' · ');
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="font-display text-xl leading-tight">Question {roundNo} <span className="text-sm font-normal text-ivory/70">of {total}</span></p>
          {chip && <span className="w-fit max-w-full truncate rounded-md border border-teal-bright/50 bg-teal/30 px-2 py-0.5 text-xs font-semibold text-teal-bright">{chip}</span>}
        </div>
        <TimerRing openedAt={openedAt} deadline={deadline} offset={offset} size={52} />
      </div>
      <div className="flex gap-0.5" role="img" aria-label={`Question ${roundNo} of ${total}`}>{Array.from({ length: total }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < roundNo ? 'bg-teal-bright' : 'bg-white/12'}`} />)}</div>
    </div>
  );
}

/** Big "3-2-1" drawn over the staircase scene while the next question is about to open (everyone sees it on the stairs). */
export function CountdownOverlay({ endsAt, offset, first }: { endsAt: number | null; offset: number; first: boolean }) {
  const ms = useSecondsLeft(endsAt, offset);
  if (!endsAt || ms <= 0) return null;
  const secs = Math.max(1, Math.ceil(ms / 1000));
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-ink/60" aria-hidden>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber sm:text-sm">{first ? 'Get ready' : 'Next question'}</p>
      <p key={secs} className="anim-pop font-display text-7xl font-semibold tabular-nums leading-none text-ivory drop-shadow-[0_2px_12px_rgba(0,0,0,.6)] sm:text-8xl">{secs}</p>
    </div>
  );
}
