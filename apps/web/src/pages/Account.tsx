import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DEFAULT_AVATAR, sanitizeAvatar, type AvatarConfig } from '@elimquest/game-core';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { lastAvatar, lastNickname, prefs } from '../lib/storage';
import { AvatarEditor, AvatarFigure } from '../components/Avatar';
import { Alert, Button, ConfirmDialog, Input, LinkButton } from '../components/ui';

export default function Account() {
  const { user, signOut, loading } = useAuth();
  const [p, setP] = useState(prefs.get());
  const [avatar, setAvatar] = useState<AvatarConfig>(sanitizeAvatar(lastAvatar.get() ?? DEFAULT_AVATAR));
  const [nick, setNick] = useState(lastNickname.get());
  const [saved, setSaved] = useState(false);
  const [del, setDel] = useState(false);
  const hist = useQuery({ queryKey: ['history'], enabled: !!user, queryFn: () => api<{ games: any[]; practice: any[] }>('GET', '/api/me/history') });
  const requestDelete = useMutation({ mutationFn: () => api<{ note: string }>('POST', '/api/me/delete-request'), onSuccess: () => setDel(false) });
  const savePrefs = (n: Partial<typeof p>) => { const next = { ...p, ...n }; setP(next); prefs.set(next); if (user) void api('PATCH', '/api/me/prefs', { sound: next.sound, reducedMotion: next.reducedMotion }).catch(() => undefined); };
  if (loading) return null;
  return (
    <div className="container-page grid max-w-3xl gap-6 py-8">
      <div><p className="eyebrow mb-1">Account</p><h1 className="text-3xl">{user ? user.displayName : 'Preferences'}</h1>{user && <p className="text-ivory/75">{user.email} · {user.role.replace('_', ' ')}</p>}</div>
      {!user && <Alert tone="info" title="You’re playing as a guest">Preferences below are saved only in this browser. <Link className="underline" to="/sign-up">Create an account</Link> to keep results and host games.</Alert>}

      <section className="card grid gap-3" aria-labelledby="pref-h" id="prefs"><h2 id="pref-h" className="text-xl">Sound &amp; motion</h2>
        <label className="flex min-h-11 items-center justify-between gap-4"><span>Sound effects <span className="block text-xs text-ivory/70">Off by default. The game never needs sound.</span></span><input type="checkbox" className="size-6 accent-amber" checked={p.sound} onChange={(e) => savePrefs({ sound: e.target.checked })} /></label>
        <label className="flex min-h-11 items-center justify-between gap-4"><span>Reduce motion <span className="block text-xs text-ivory/70">Skips climb animations and celebrations.</span></span><input type="checkbox" className="size-6 accent-amber" checked={p.reducedMotion} onChange={(e) => savePrefs({ reducedMotion: e.target.checked })} /></label></section>

      <section className="card grid gap-4" aria-labelledby="av-h"><h2 id="av-h" className="text-xl">Default nickname &amp; avatar</h2>
        <div className="flex items-center gap-4"><AvatarFigure config={avatar} size={88} title="Avatar preview" /><div className="flex-1"><Input label="Nickname" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} /></div></div>
        <AvatarEditor value={avatar} onChange={(a) => { setAvatar(a); setSaved(false); }} />
        <div><Button onClick={() => { lastAvatar.set(avatar); lastNickname.set(nick.trim()); setSaved(true); }}>Save</Button>{saved && <span className="ml-3 text-sm text-success" role="status">Saved — used next time you join.</span>}</div></section>

      {user && (<>
        <section className="card grid gap-3" aria-labelledby="hist-h"><h2 id="hist-h" className="text-xl">Your results</h2>
          {hist.isPending ? <p>Loading…</p> : hist.data && (hist.data.games.length + hist.data.practice.length === 0) ? <p className="text-ivory/75">Nothing saved yet. Results from games you join while signed in appear here.</p> : (<>
            <ul className="grid gap-2">{hist.data?.games.map((g) => <li key={g.id} className="rounded-lg bg-white/5 p-3 text-sm"><Link className="font-semibold underline" to={`/games/${g.id}/results`}>{g.title}</Link> — {g.finalStep == null ? 'not finished' : `step ${g.finalStep}, rank ${g.rank}${g.isWinner ? ' ★ winner' : ''}`} <span className="text-ivory/60">· {g.correct ?? 0} ✓ {g.wrong ?? 0} ✕ {g.unanswered ?? 0} ⏱</span></li>)}</ul>
            {hist.data && hist.data.practice.length > 0 && <><h3 className="text-lg">Solo practice</h3><ul className="grid gap-2">{hist.data.practice.map((s) => <li key={s.id} className="rounded-lg bg-white/5 p-3 text-sm">{s.mode === 'mistakes' ? 'Mistake practice' : 'Practice'} · step {s.position} · {s.status === 'finished' ? (s.succeeded ? 'reached the summit' : 'finished') : 'in progress'}</li>)}</ul></>}</>)}</section>
        <section className="card grid gap-3" aria-labelledby="del-h"><h2 id="del-h" className="text-xl">Your data</h2>
          <p className="text-sm text-ivory/80">Requesting deletion removes your profile, saved history and private packs within 30 days (see <Link className="underline" to="/privacy">Privacy</Link>).</p>
          {requestDelete.isSuccess && <Alert tone="success">{requestDelete.data.note}</Alert>}{requestDelete.isError && <Alert tone="error">{errMsg(requestDelete.error)}</Alert>}
          <div className="flex flex-wrap gap-3"><Button variant="danger" onClick={() => setDel(true)}>Request account deletion</Button><Button variant="ghost" onClick={() => void signOut()}>Sign out</Button><LinkButton variant="ghost" to="/dashboard">Dashboard</LinkButton></div></section>
        <ConfirmDialog open={del} title="Delete your account?" danger confirmLabel="Request deletion" onCancel={() => setDel(false)} onConfirm={() => requestDelete.mutate()}>This can’t be undone once processed. Games you’re hosting won’t be cancelled automatically.</ConfirmDialog>
      </>)}
    </div>
  );
}
