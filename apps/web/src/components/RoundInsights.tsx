import type { PlayerPublic, RoomSnapshot, RoundResultEvent } from '@elimquest/contracts';
import { tensionCue } from '@elimquest/game-core';
import { StickerIcon } from './Stickers';

const LETTERS = ['A', 'B', 'C', 'D'];

/** How the room answered (aggregates only; shown after the round closes). Marks are symbols + text, never colour alone. */
export function RevealChart({ result, order, myChoice }: { result: RoundResultEvent; order: { id: string; text: string }[]; myChoice: string | null }) {
  const total = Math.max(1, result.playerTotal);
  const right = result.optionCounts[result.correctOptionId] ?? 0;
  return (
    <section className="grid gap-2 rounded-xl bg-white/5 p-3" aria-labelledby="chart-h">
      <h3 id="chart-h" className="text-sm font-semibold">How the room answered</h3>
      <ul className="grid gap-1.5">
        {order.map((o, i) => {
          const n = result.optionCounts[o.id] ?? 0;
          const pct = Math.round((n / total) * 100);
          const correct = o.id === result.correctOptionId;
          return (
            <li key={o.id} className="grid gap-0.5" aria-label={`${LETTERS[i]}: ${o.text}. ${n} of ${result.playerTotal} players, ${pct} percent.${correct ? ' Correct answer.' : ''}${o.id === myChoice ? ' Your pick.' : ''}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate"><strong>{LETTERS[i]}</strong> {o.text}{correct && <span className="ml-1.5 rounded bg-success/25 px-1 font-semibold text-success">✓ correct</span>}{o.id === myChoice && <span className="ml-1.5 rounded bg-white/15 px-1">your pick</span>}</span>
                <span className="shrink-0 tabular-nums text-ivory/80">{n} · {pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full origin-left rounded-full ${correct ? 'bg-success' : 'bg-teal-bright/70'}`} style={{ width: `${pct}%` }} /></div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ivory/75"><strong className="text-ivory">{right}</strong> of {result.playerTotal} got it right{result.unansweredCount > 0 ? ` · ${result.unansweredCount} didn’t answer in time` : ''}.</p>
    </section>
  );
}

const names = (ids: string[], players: PlayerPublic[], you: string | null) => ids.map((id) => (id === you ? 'You' : players.find((p) => p.id === id)?.nickname ?? 'Someone')).join(', ');

/** Positive-only highlights for the round (no "worst" lists, ever). */
export function RoundHighlights({ result, players, youId }: { result: RoundResultEvent; players: PlayerPublic[]; youId: string | null }) {
  const h = result.highlights;
  const lines: string[] = [];
  if (h.climbBy > 0 && h.topClimbers.length) lines.push(`${result.isSuper ? 'Super climb' : 'Biggest climb'}: ${names(h.topClimbers, players, youId)} (+${h.climbBy})`);
  if (h.leaders.length && h.leaderStep > 0) lines.push(`Leading the climb: ${names(h.leaders, players, youId)} on step ${h.leaderStep}`);
  if (!lines.length) return null;
  return <ul className="grid gap-1 rounded-xl bg-white/5 p-3 text-sm" aria-label="Round highlights">{lines.map((l) => <li key={l} className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><StickerIcon kind="star" size={16} /></span>{l}</li>)}</ul>;
}

/** One short, positive cue about how close the summit is. Derived from positions only. */
export function TensionCue({ snap }: { snap: RoomSnapshot }) {
  const me = snap.players.find((p) => p.id === snap.you.participantId);
  const text = tensionCue({ positions: snap.players.map((p) => p.position), summit: snap.settings.summitHeight, you: me?.position ?? null });
  if (!text || snap.phase === 'lobby' || snap.phase === 'finished') return null;
  return <p className="flex items-center gap-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-1.5 text-sm font-semibold text-amber"><StickerIcon kind="bolt" size={18} />{text}</p>;
}

/** Personal streak flair (display only; never changes movement). */
export function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-amber" aria-label={`${streak} correct in a row`}><StickerIcon kind="flame" size={14} />{streak} in a row</span>;
}

export const OPTION_LETTERS = LETTERS;
