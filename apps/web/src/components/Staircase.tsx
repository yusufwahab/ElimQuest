import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerPublic } from '@elimquest/contracts';
import { rankByStep } from '@elimquest/game-core';
import { prefs, store } from '../lib/storage';
import { AvatarFigure } from './Avatar';
import { avatarSvgMarkup } from './avatarMarkup';
import type { SceneHandle } from '../scene/staircase';

interface Props {
  players: PlayerPublic[];
  youId: string | null;
  summit: number;
  /** Changes once per round result so the scene animates exactly then. */
  moveSeq: number;
  celebrate?: string[];
  className?: string;
}

const isLowPower = () => {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || matchMedia('(max-width: 640px)').matches;
};

function groupByStep(players: PlayerPublic[]) {
  const m = new Map<number, PlayerPublic[]>();
  for (const p of players) m.set(p.position, [...(m.get(p.position) ?? []), p]);
  return [...m.entries()].sort((a, b) => b[0] - a[0]);
}

/** Text alternative to the staircase, always in the DOM for screen readers; also the expandable full roster. */
export function RosterList({ players, youId, summit }: { players: PlayerPublic[]; youId: string | null; summit: number }) {
  const ranked = rankByStep(players);
  return (
    <ol className="grid gap-1.5 text-sm" aria-label="Players by step">
      {groupByStep(players).map(([step, list]) => {
        const rank = ranked.find((r) => r.item.position === step)?.rank;
        return (
          <li key={step} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/5 px-2.5 py-1.5">
            <span className="min-w-20 font-semibold">{step >= summit ? `Summit (${step})` : step === 0 ? 'Start' : `Step ${step}`}</span>
            <span className="text-xs text-ivory/60">rank {rank}</span>
            <span className="flex flex-wrap gap-x-2">{list.map((p) => <span key={p.id} className={p.id === youId ? 'font-bold text-amber' : p.connected ? '' : 'text-ivory/50'}>{p.nickname}{p.id === youId ? ' (you)' : ''}{p.connected ? '' : ' · offline'}</span>)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Simple HTML staircase: used when the scene can't load, and as the visual under reduced capability. */
function FallbackStairs({ players, youId, summit }: Pick<Props, 'players' | 'youId' | 'summit'>) {
  const rows = useMemo(() => { const m = new Map<number, PlayerPublic[]>(); for (const p of players) m.set(p.position, [...(m.get(p.position) ?? []), p]); return m; }, [players]);
  const shown = Array.from({ length: Math.min(summit, 12) + 1 }, (_, i) => summit - i).filter((n) => n >= 0);
  return (
    <div className="flex h-full flex-col justify-end gap-0.5 overflow-hidden bg-gradient-to-b from-ink to-teal/50 px-4 pb-2 pt-3" aria-hidden>
      {shown.map((step) => {
        const list = rows.get(step) ?? [];
        const w = 55 + (1 - step / Math.max(1, summit)) * 40;
        return (
          <div key={step} className="mx-auto flex h-[1.6rem] items-end justify-center gap-0.5 rounded-sm bg-sand/80 px-1 text-[10px] font-bold text-ink" style={{ width: `${w}%` }}>
            <span className="mr-auto">{step === 0 ? 'Start' : step}</span>
            {list.slice(0, 3).map((p) => <span key={p.id} className="-mb-0.5"><AvatarFigure config={p.avatar} view="back" size={20} /></span>)}
            {list.length > 3 && <span>+{list.length - 3}</span>}
            {list.some((p) => p.id === youId) && <span className="rounded bg-amber px-1">You</span>}
          </div>
        );
      })}
    </div>
  );
}

export function Staircase({ players, youId, summit, moveSeq, celebrate, className = '' }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const lastSeq = useRef(moveSeq);

  const scenePlayers = useMemo(() => {
    const cache = new Map<string, string>();
    return players.map((p) => {
      const k = JSON.stringify(p.avatar);
      if (!cache.has(k)) cache.set(k, avatarSvgMarkup(p.avatar, 'back'));
      return { id: p.id, nickname: p.nickname, position: p.position, svg: cache.get(k)!, isYou: p.id === youId };
    });
  }, [players, youId]);

  // Create the scene once; Phaser is loaded lazily and never restarted by React re-renders.
  useEffect(() => {
    let dead = false;
    const el = host.current;
    if (!el || new URLSearchParams(location.search).has('nogame') || store.get('eq:nogame') === '1') { setFailed(true); return; }
    void import('../scene/staircase').then(async ({ createStaircase }) => {
      if (dead) return;
      try {
        const h = createStaircase(el, { summit, reducedMotion: prefs.get().reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches, lowPower: isLowPower() });
        handle.current = h;
        await Promise.race([h.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('scene timeout')), 8000))]);
        if (!dead) setReady(true);
      } catch { if (!dead) setFailed(true); }
    }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; handle.current?.destroy(); handle.current = null; setReady(false); };
    // summit is fixed for the lifetime of a game
  }, [summit]);

  useEffect(() => {
    if (!ready) return;
    const animate = moveSeq !== lastSeq.current;
    lastSeq.current = moveSeq;
    handle.current?.setPlayers(scenePlayers, animate);
  }, [scenePlayers, moveSeq, ready]);

  useEffect(() => { if (ready && celebrate?.length) handle.current?.celebrate(celebrate); }, [celebrate, ready]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-ink ${className}`}>
      {failed ? <FallbackStairs players={players} youId={youId} summit={summit} /> : <div ref={host} className="size-full" aria-hidden="true" />}
      {!failed && !ready && <div className="absolute inset-0 flex items-center justify-center bg-ink/80 text-sm text-ivory/80" aria-hidden>Loading scene…</div>}
      <p className="sr-only">Staircase with {players.length} players. {players.find((p) => p.id === youId) ? `You are on step ${players.find((p) => p.id === youId)!.position} of ${summit}.` : ''}</p>
    </div>
  );
}
