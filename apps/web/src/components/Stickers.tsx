import { useEffect, useRef, useState } from 'react';
import type { PlayerPublic } from '@elimquest/contracts';
import { REACTION_KINDS, type ReactionKind } from '@elimquest/contracts';

/** Drawn sticker icons — deliberately not emoji. */
export function StickerIcon({ kind, size = 28 }: { kind: ReactionKind; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': true } as const;
  switch (kind) {
    case 'star': return <svg {...p}><path d="M16 3l3.6 8.1 8.8.8-6.7 5.8 2 8.6L16 21.8 8.3 26.3l2-8.6L3.6 11.9l8.8-.8z" fill="#f2b858" stroke="#a67a22" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case 'lantern': return <svg {...p}><path d="M12 5h8M16 2v3" stroke="#a67a22" strokeWidth="2" strokeLinecap="round" /><rect x="9" y="6" width="14" height="19" rx="4" fill="#ffd98a" stroke="#a67a22" strokeWidth="1.8" /><path d="M16 9v13M9 15h14" stroke="#c98d2c" strokeWidth="1.2" /><path d="M12 25v3h8v-3" stroke="#a67a22" strokeWidth="1.8" fill="none" /></svg>;
    case 'heart': return <svg {...p}><path d="M16 27C7 20 4 15.5 4 11.5 4 8 6.6 5.5 9.8 5.5c2.2 0 4.2 1.2 6.2 3.6 2-2.4 4-3.6 6.2-3.6C25.4 5.5 28 8 28 11.5 28 15.5 25 20 16 27z" fill="#e5736b" stroke="#a8453f" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case 'bolt': return <svg {...p}><path d="M18 2L6 18h8l-2 12 12-17h-8z" fill="#19a7b8" stroke="#0b6a76" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case 'flame': return <svg {...p}><path d="M16 2c1 5 7 8 7 15a7 7 0 0 1-14 0c0-3 1.6-4.6 3-6 .2 2 1.2 3 2.2 3C13.600 9.500 14.500 5.500 16 2z" fill="#f08a3c" stroke="#a8541c" strokeWidth="1.5" strokeLinejoin="round" /><path d="M16 15c1.500 2 3 3 3 5a3 3 0 0 1-6 0c0-1.500 1.500-2.500 3-5z" fill="#ffd98a" /></svg>;
  }
}

export const STICKER_LABEL: Record<ReactionKind, string> = { star: 'Star', lantern: 'Lantern', heart: 'Heart', bolt: 'Spark', flame: 'Flame' };

/** Row of sticker buttons. Only offered between questions; each press has a short cooldown (the server enforces it too). */
export function StickerBar({ onSend, disabled }: { onSend: (k: ReactionKind) => Promise<{ ok: boolean; error?: string }>; disabled?: boolean }) {
  const [cool, setCool] = useState(false);
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const send = async (k: ReactionKind) => {
    if (cool || disabled) return;
    setCool(true); setMsg('');
    const r = await onSend(k);
    if (!r.ok) setMsg(r.error ?? '');
    timer.current = setTimeout(() => setCool(false), 1600);
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Send a sticker to the room">
      <span className="text-xs text-ivory/70">Cheer the room</span>
      {REACTION_KINDS.map((k) => (
        <button key={k} type="button" disabled={cool || disabled} onClick={() => void send(k)} aria-label={`Send a ${STICKER_LABEL[k].toLowerCase()} sticker`}
          className="flex size-11 items-center justify-center rounded-xl border border-line bg-white/5 transition active:scale-90 enabled:hover:bg-white/10 disabled:opacity-45"><StickerIcon kind={k} /></button>
      ))}
      {msg && <span className="text-xs text-ivory/70" role="status">{msg}</span>}
    </div>
  );
}

/** Stickers drift up over the scene. Pure CSS transform/opacity (compositor-only); capped and self-cleaning. */
export function StickerBurst({ items, players, onDone }: { items: { key: number; id: string; kind: ReactionKind }[]; players: PlayerPublic[]; onDone: (key: number) => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((r) => {
        const name = players.find((p) => p.id === r.id)?.nickname ?? '';
        const x = 12 + ((r.key * 37) % 76);
        return (
          <span key={r.key} onAnimationEnd={() => onDone(r.key)} className="absolute bottom-3 flex flex-col items-center will-change-transform" style={{ left: `${x}%`, animation: 'sticker-rise 2.2s ease-out forwards' }}>
            <StickerIcon kind={r.kind} size={34} />
            {name && <span className="mt-0.5 max-w-20 truncate rounded bg-ink/80 px-1.5 text-[10px] font-semibold">{name}</span>}
          </span>
        );
      })}
    </div>
  );
}
