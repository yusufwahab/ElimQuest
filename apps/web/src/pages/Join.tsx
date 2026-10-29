import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { RoomPreview } from '@elimquest/contracts';
import { DEFAULT_AVATAR, checkNickname, formatRoomCode, normaliseRoomCode, randomAvatar, type AvatarConfig } from '@elimquest/game-core';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAdventurer } from '../lib/adventurer';
import { deviceId, roomCred } from '../lib/storage';
import { Alert, Button, EmptyState, Input, LinkButton, PageLoading } from '../components/ui';
import { AvatarEditor, AvatarFigure } from '../components/Avatar';
import { describeLevels } from '@elimquest/game-core';
import { JoinPanel } from './Home';

export default function Join() {
  const { code: raw } = useParams();
  const code = raw ? normaliseRoomCode(raw) : '';
  if (!code) return (
    <div className="container-page grid gap-6 py-8 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-10 lg:py-14">
      <div className="grid content-start gap-4">
        <div><p className="eyebrow mb-2">Play with friends</p><h1 className="text-4xl">Join a game</h1><p className="mt-2 max-w-md text-ivory/85">Enter the 6-digit room code from your host. You’ll pick a nickname and a look, then wait in the lobby until the host starts.</p></div>
        <JoinPanel />
      </div>
      <ol className="grid gap-3" aria-label="How joining works">
        {[['1', 'Get the code', 'Your host shows a 6-digit code or a QR code — or sends you a link that fills it in for you.'], ['2', 'Choose your look', 'Pick a nickname and build your adventurer. No account is needed.'], ['3', 'Climb together', 'Everyone answers the same question at the same time. Right answers move you up the stairs.']].map(([n, t, d]) => (
          <li key={n} className="card flex gap-4 !p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber font-bold text-ink" aria-hidden>{n}</span><div><h2 className="text-lg">{t}</h2><p className="text-sm text-ivory/80">{d}</p></div></li>
        ))}
      </ol>
    </div>
  );
  return <JoinRoom code={code} />;
}

function JoinRoom({ code }: { code: string }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const adv = useAdventurer();
  const q = useQuery({ queryKey: ['preview', code], queryFn: () => api<RoomPreview>('GET', `/api/rooms/${code}`, undefined, { auth: false }), retry: false });
  const saved = roomCred.get(code);
  const [nick, setNick] = useState(adv.nickname || user?.displayName?.slice(0, 20) || '');
  const [avatar, setAvatar] = useState<AvatarConfig>(adv.avatar);
  const [editing, setEditing] = useState(!adv.chosen);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.isPending) return <PageLoading label="Finding your room…" />;
  if (q.isError) return <div className="container-page max-w-xl py-10"><EmptyState title="We couldn’t find that room" action={<LinkButton to="/">Try another code</LinkButton>}>{errMsg(q.error)} Check the digits or ask your host for the link.</EmptyState></div>;
  const r = q.data;

  const reasons: Record<string, { t: string; d: string }> = {
    cancelled: { t: 'This game was cancelled', d: 'The host cancelled it. Ask them for a new link.' },
    expired: { t: 'This room has expired', d: 'Rooms close after a period of inactivity.' },
    finished: { t: 'This game has finished', d: 'You can start a game of your own, or play a quick climb.' },
  };
  if (saved && !saved.spectator && !['cancelled', 'expired'].includes(r.reason ?? '')) {
    const dest = r.phase === 'finished' ? null : `/rooms/${code}/${r.phase === 'lobby' ? 'lobby' : 'play'}`;
    if (dest) return (
      <div className="container-page max-w-xl py-10"><div className="card grid gap-4 text-center"><h1 className="text-2xl">Welcome back, {saved.nickname}</h1><p className="text-ivory/80">You’re already in “{r.title}”. Rejoin to carry on where you left off.</p>
        <Button onClick={() => nav(dest)}>Rejoin the game</Button><button className="min-h-11 text-sm underline" onClick={() => { roomCred.del(code); location.reload(); }}>Join as someone else</button></div></div>
    );
  }
  if (r.reason && reasons[r.reason]) return <div className="container-page max-w-xl py-10"><EmptyState title={reasons[r.reason]!.t} action={<div className="flex gap-3"><LinkButton to="/">Home</LinkButton><LinkButton variant="ghost" to="/">Quick climb</LinkButton></div>}>{reasons[r.reason]!.d}</EmptyState></div>;

  const spectate = !r.canJoin && r.canSpectate;
  const submit = async (e?: FormEvent) => {
    e?.preventDefault(); setErr(null);
    const c = checkNickname(nick || adv.nickname || 'Adventurer');
    if (!c.ok) { setErr(c.reason); setEditing(true); return; }
    setBusy(true);
    try {
      const res = await api<{ participantToken: string; participantId: string; nickname: string; spectator: boolean }>('POST', `/api/rooms/${code}/join`, { nickname: c.nickname, avatar, spectator: spectate, deviceId: deviceId() });
      roomCred.set(code, { token: res.participantToken, participantId: res.participantId, nickname: res.nickname, spectator: res.spectator });
      adv.setLook(c.nickname, avatar);
      nav(`/rooms/${code}/${r.phase === 'lobby' ? 'lobby' : 'play'}`);
    } catch (x) { setErr(errMsg(x)); setEditing(true); } finally { setBusy(false); }
  };
  const when = r.scheduledAt ? new Date(r.scheduledAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }) : null;
  return (
    <div className="container-page grid gap-6 py-8 lg:grid-cols-[1fr_1.1fr]">
      <section className="card grid content-start gap-3" aria-labelledby="room-title">
        <p className="eyebrow">Room {formatRoomCode(code)}</p>
        <h1 id="room-title" className="text-3xl">{r.title}</h1>
        <p className="text-ivory/85">Hosted by <strong>{r.hostName}</strong> · {r.hostMode === 'audience' ? 'Run for a group' : 'Host plays too'} · {r.playerCount} joined</p>
        {when && <p className="text-sm text-ivory/80">Gathering: {when}. <em>The host starts the game manually.</em></p>}
        <p className="text-sm text-ivory/80">{r.categories.map((c) => c.name).join(', ') || 'Custom questions'} · {describeLevels(r.minLevel, r.maxLevel)} · {r.settings.questionLimit} questions · summit at step {r.settings.summitHeight}</p>
        {(r.settings.superQuestion || r.settings.gentle) && <ul className="flex flex-wrap gap-2" aria-label="House rules">{r.settings.superQuestion && <li className="rounded-full bg-amber/20 px-3 py-1 text-xs font-semibold text-amber">Super question</li>}{r.settings.gentle && <li className="rounded-full bg-teal-bright/20 px-3 py-1 text-xs font-semibold text-teal-bright">Gentle mode</li>}</ul>}
        {r.customContent && <Alert tone="info">These questions were written by the host and haven’t been reviewed by ElimQuest.</Alert>}
        <details open className="rounded-xl bg-white/5 p-3"><summary className="cursor-pointer font-semibold">Rules</summary><ul className="mt-2 grid list-disc gap-1 pl-5 text-sm text-ivory/85">{r.rules.map((x) => <li key={x}>{x}</li>)}</ul></details>
      </section>

      <form onSubmit={submit} noValidate className="card grid content-start gap-4" aria-labelledby="who-title">
        <h2 id="who-title" className="text-2xl">{spectate ? 'Watch this game' : editing ? 'Choose your look' : 'Ready to join?'}</h2>
        {spectate && <Alert tone="info">This game has already started, so you can’t compete — but you can watch. You’ll see the staircase but can’t answer.</Alert>}
        <div className="flex items-center gap-4">
          <div className="flex size-28 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-teal/40 to-ink"><AvatarFigure config={avatar} size={88} title="Your avatar" /></div>
          <div className="grid flex-1 gap-1">
            {editing ? <Input label="Nickname" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} autoComplete="nickname" required error={err} hint="2–20 characters. If someone has the same name, we add a number." />
              : <><p className="text-sm text-ivory/70">Joining as</p><p className="font-display text-2xl">{nick || adv.nickname}</p>{err && <p role="alert" className="text-sm text-danger">{err}</p>}</>}
          </div>
        </div>
        {editing && <>
          <AvatarEditor value={avatar} onChange={setAvatar} />
          <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={() => setAvatar(randomAvatar())}>Surprise me</Button><Button type="button" variant="ghost" onClick={() => setAvatar(DEFAULT_AVATAR)}>Reset</Button></div>
        </>}
        <Button type="submit" loading={busy} className="min-h-12">{spectate ? 'Watch game' : 'Join game'} <span aria-hidden>→</span></Button>
        {!editing && <button type="button" className="min-h-11 justify-self-start text-sm underline underline-offset-4" onClick={() => setEditing(true)}>Change name or look</button>}
        {!user && <p className="text-sm text-ivory/75">No account needed. <Link className="inline-flex min-h-11 items-center underline" to="/sign-in" state={{ from: `/join/${code}` }}>Sign in</Link> if you want to save your results.</p>}
      </form>
    </div>
  );
}
