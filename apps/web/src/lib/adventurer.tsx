import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_AVATAR, checkNickname, randomAvatar, sanitizeAvatar, type AvatarConfig } from '@elimquest/game-core';
import { lastAvatar, lastNickname, store } from './storage';
import { useAuth } from './auth';
import { AvatarEditor, AvatarFigure } from '../components/Avatar';
import { Button, Input } from '../components/ui';

/**
 * "Your adventurer": the name + look a person chose once. It follows them into joining, solo play and hosting so
 * nothing is asked twice. Stored only in this browser (and as account defaults is a later step).
 */
interface Ctx {
  nickname: string;
  avatar: AvatarConfig;
  /** True once the person has actually chosen a look/name (not just the auto-assigned random one). */
  chosen: boolean;
  setLook(nickname: string, avatar: AvatarConfig): void;
  openEditor(): void;
}
const AdventurerCtx = createContext<Ctx | null>(null);

function initial() {
  const saved = lastAvatar.get();
  const chosen = store.get('eq:adv-chosen') === '1';
  const avatar = saved ? sanitizeAvatar(saved) : randomAvatar();
  if (!saved) lastAvatar.set(avatar);
  return { avatar, nickname: lastNickname.get(), chosen };
}

export function AdventurerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(false);
  // Signed-in people without a chosen nickname default to their display name.
  useEffect(() => { if (user && !state.nickname) setState((s) => ({ ...s, nickname: user.displayName.slice(0, 20) })); }, [user, state.nickname]);
  const setLook = useCallback((nickname: string, avatar: AvatarConfig) => {
    lastNickname.set(nickname); lastAvatar.set(avatar); store.set('eq:adv-chosen', '1');
    setState({ nickname, avatar, chosen: true });
  }, []);
  const value = useMemo<Ctx>(() => ({ ...state, setLook, openEditor: () => setOpen(true) }), [state, setLook]);
  return <AdventurerCtx.Provider value={value}>{children}<AdventurerSheet open={open} onClose={() => setOpen(false)} /></AdventurerCtx.Provider>;
}

export function useAdventurer(): Ctx {
  const c = useContext(AdventurerCtx);
  if (!c) throw new Error('useAdventurer outside AdventurerProvider');
  return c;
}

function AdventurerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAdventurer();
  const ref = useRef<HTMLDialogElement>(null);
  const [nick, setNick] = useState(a.nickname);
  const [look, setLook] = useState<AvatarConfig>(a.avatar);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { setNick(a.nickname); setLook(a.avatar); setErr(null); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open, a.nickname, a.avatar]);
  const save = () => {
    const c = checkNickname(nick || 'Adventurer');
    if (!c.ok) { setErr(c.reason); return; }
    a.setLook(c.nickname, look); onClose();
  };
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="adv-title" className="m-auto max-h-[92svh] w-[min(94vw,30rem)] overflow-y-auto rounded-2xl border border-line bg-ink-soft p-0 text-ivory backdrop:bg-black/70">
      {open && <div className="grid gap-4 p-5">
        <h2 id="adv-title" className="text-xl">Your adventurer</h2>
        <div className="flex items-center gap-4">
          <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-teal/40 to-ink"><AvatarFigure config={look} size={76} title="Your avatar preview" /></div>
          <div className="flex-1"><Input label="Nickname" value={nick} onChange={(e) => { setNick(e.target.value); setErr(null); }} maxLength={20} error={err} hint="Used when you join games." /></div>
        </div>
        <AvatarEditor value={look} onChange={setLook} />
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => setLook(randomAvatar())}>Surprise me</Button>
          <div className="flex gap-2"><Button variant="ghost" onClick={() => setLook(DEFAULT_AVATAR)}>Reset</Button><Button onClick={save}>Save</Button></div>
        </div>
        <button className="min-h-11 justify-self-start text-sm underline" onClick={onClose}>Close without saving</button>
      </div>}
    </dialog>
  );
}

/** Navbar chip: tap to change your look. */
export function AdventurerChip() {
  const a = useAdventurer();
  return (
    <button type="button" onClick={a.openEditor} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white/5 py-1 pl-1.5 pr-3 text-sm hover:bg-white/10" aria-label={`Your adventurer${a.nickname ? `: ${a.nickname}` : ''}. Change look`}>
      <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-ink-raised"><AvatarFigure config={a.avatar} size={26} /></span>
      <span className="hidden max-w-24 truncate sm:inline">{a.nickname || 'Your look'}</span>
    </button>
  );
}
