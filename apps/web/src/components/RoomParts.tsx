import { useEffect, useState } from 'react';
import type { PlayerPublic, RoomSnapshot } from '@elimquest/contracts';
import { formatRoomCode, rulesSummary } from '@elimquest/game-core';
import { AvatarFigure } from './Avatar';
import { Button } from './ui';
import { useMsLeft } from './Countdown';

export function PlayerTile({ p, you, onRemove }: { p: PlayerPublic; you: boolean; onRemove?: () => void }) {
  return (
    <li className={`relative flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-center ${you ? 'border-amber bg-amber/10' : 'border-line bg-ink-soft/70'} ${p.connected ? '' : 'opacity-55'}`}>
      {p.isHostPlayer && <span className="absolute left-1.5 top-1.5 rounded bg-amber px-1.5 text-[10px] font-bold text-ink" title="Host">★ Host</span>}
      <AvatarFigure config={p.avatar} size={64} />
      <span className="max-w-full truncate text-sm font-semibold">{p.nickname}</span>
      <span className="text-xs text-ivory/70">{you ? 'You' : p.connected ? 'Ready' : 'Offline'}</span>
      {onRemove && !p.isHostPlayer && <button className="mt-0.5 min-h-8 rounded-lg px-2 text-xs text-danger underline" onClick={onRemove} aria-label={`Remove ${p.nickname}`}>Remove</button>}
    </li>
  );
}

export function RulesCard({ snap }: { snap: RoomSnapshot }) {
  const s = snap.settings;
  return (
    <section className="card grid gap-2" aria-labelledby="rules-h">
      <h2 id="rules-h" className="text-xl">Rules & settings</h2>
      <p className="text-sm text-ivory/80">{s.questionLimit} questions · {s.timeLimitS}s each · summit at step {s.summitHeight} · up to {s.maxPlayers} players</p>
      <ul className="grid list-disc gap-1 pl-5 text-sm text-ivory/85">{rulesSummary(s).map((r) => <li key={r}>{r}</li>)}</ul>
    </section>
  );
}

export function CopyCode({ code, showCopy = true }: { code: string; showCopy?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-display text-4xl tracking-[0.14em] text-amber sm:text-5xl" aria-label={`Room code ${code.split('').join(' ')}`}>{formatRoomCode(code)}</span>
      {showCopy && <Button variant="ghost" className="!min-h-10 text-sm" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${import.meta.env.BASE_URL}join/${code}`); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* ignore */ } }}>{done ? 'Link copied ✓' : 'Copy invite link'}</Button>}
    </div>
  );
}

/** Gathering time shown with the live time remaining — explicitly NOT an automatic start countdown. */
export function ScheduleNotice({ scheduledAt, offset }: { scheduledAt: string | null; offset: number }) {
  const target = scheduledAt ? new Date(scheduledAt).getTime() : null;
  const ms = useMsLeft(target, offset, 1000);
  if (!target) return null;
  const when = new Date(target).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  const mins = Math.floor(ms / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
  const left = ms <= 0 ? 'The gathering time has arrived' : days > 0 ? `${days}d ${hrs % 24}h until the gathering time` : hrs > 0 ? `${hrs}h ${mins % 60}m until the gathering time` : `${mins}m until the gathering time`;
  return <p className="rounded-xl bg-white/5 p-3 text-sm"><strong>{when}</strong> · {left}. <em>This is not an automatic start — the host starts the game.</em></p>;
}

export function VotingPanel({ snap, onVote }: { snap: RoomSnapshot; onVote: (ids: string[]) => Promise<unknown> }) {
  const v = snap.voting;
  const [mine, setMine] = useState<string[]>(v?.myVote ?? []);
  useEffect(() => setMine(v?.myVote ?? []), [v?.myVote]);
  if (!v) return null;
  const toggle = (id: string) => { const next = mine.includes(id) ? mine.filter((x) => x !== id) : mine.length >= 3 ? mine : [...mine, id]; setMine(next); void onVote(next); };
  return (
    <section className="card grid gap-2" aria-labelledby="vote-h">
      <h2 id="vote-h" className="text-xl">{v.open ? 'Pick up to three topics you’d like' : 'Topic voting is closed'}</h2>
      <p className="text-sm text-ivory/75">The host’s shortlist. Votes shape how many questions each topic gets; everyone still answers the same questions.</p>
      <div className="flex flex-wrap gap-2">{v.shortlist.map((c) => { const on = mine.includes(c.id); return (
        <label key={c.id} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-amber ${on ? 'border-amber bg-amber/15' : 'border-line bg-ink'} ${v.open ? 'cursor-pointer' : 'opacity-70'}`}>
          <input type="checkbox" className="size-5 accent-amber" checked={on} disabled={!v.open || (!on && mine.length >= 3)} onChange={() => toggle(c.id)} />{c.name}</label>); })}</div>
    </section>
  );
}
