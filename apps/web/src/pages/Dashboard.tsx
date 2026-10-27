import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatRoomCode } from '@elimquest/game-core';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAdventurer } from '../lib/adventurer';
import { AvatarFigure } from '../components/Avatar';
import { Alert, ConfirmDialog, ErrorState, LinkButton, PageLoading } from '../components/ui';
import { JoinPanel } from './Home';

interface G { id: string; code: string; title: string; hostMode: 'competing' | 'audience'; phase: string; scheduledAt: string | null; timezone: string; createdAt: string; playerCount: number; settings: { questionLimit: number } }

const LIVE = ['countdown', 'question_open', 'reveal', 'climb', 'paused', 'recovery_pause'];
const DONE = ['finished', 'cancelled', 'expired'];
const label: Record<string, string> = { draft: 'Draft', lobby: 'Open lobby', countdown: 'Starting', question_open: 'Live', reveal: 'Live', climb: 'Live', paused: 'Paused', recovery_pause: 'Needs resume', finished: 'Finished', cancelled: 'Cancelled', expired: 'Expired' };
const roomPath = (g: G) => (g.hostMode === 'audience' ? `/rooms/${g.code}/host` : `/join/${g.code}`);
const shortWhen = (g: G) => (g.scheduledAt ? new Date(g.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: g.timezone }) : null);

interface Rec { key: string; title: string; text: string; to: string; cta: string }

/** What to do next, from this person's real state only. First item is the headline suggestion. */
function recommend(games: G[], packCount: number, staff: boolean): Rec[] {
  const out: Rec[] = [];
  const live = games.find((g) => LIVE.includes(g.phase));
  const lobby = games.find((g) => g.phase === 'lobby');
  const draft = games.find((g) => g.phase === 'draft');
  if (live) out.push({ key: 'live', title: `Back to “${live.title}”`, text: live.phase === 'recovery_pause' ? 'The game paused after a restart. Open it to resume.' : 'Your game is in progress.', to: roomPath(live), cta: live.phase === 'recovery_pause' ? 'Resume' : 'Open game' });
  if (lobby) out.push({ key: 'lobby', title: `Your room is open`, text: `“${lobby.title}” has ${lobby.playerCount} joined. Share the code ${formatRoomCode(lobby.code)} and start when everyone is in.`, to: roomPath(lobby), cta: 'Enter lobby' });
  if (draft) out.push({ key: 'draft', title: 'Finish setting up', text: `“${draft.title}” is saved as a draft.`, to: `/games/${draft.id}/edit`, cta: 'Continue setup' });
  if (!games.length) out.push({ key: 'first', title: 'Host your first game', text: 'Four quick steps, then share a link or QR code. Try the family-night template.', to: '/games/new?template=family', cta: 'Start hosting' });
  else if (!live && !lobby && !draft) out.push({ key: 'again', title: 'Host another game', text: 'Pick a template, tweak it and invite people in a minute.', to: '/games/new', cta: 'Host a game' });
  out.push({ key: 'solo', title: 'Warm up with a quick climb', text: 'Ten questions on your own: no waiting, no sign-in needed.', to: '/practice', cta: 'Climb solo' });
  if (!packCount) out.push({ key: 'pack', title: 'Write your own questions', text: 'Make a private pack for a class or event and run it with an audience host.', to: '/packs/new', cta: 'Create a pack' });
  if (staff) out.push({ key: 'admin', title: 'Review and publish questions', text: 'Open the admin area: review queue, imports and topics.', to: '/admin', cta: 'Open admin area' });
  return out;
}

function Row({ g, onCancel }: { g: G; onCancel: (g: G) => void }) {
  const when = shortWhen(g);
  const open = ['lobby', ...LIVE].includes(g.phase);
  return (
    <li className="rounded-xl border border-line bg-ink p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><h3 className="truncate text-base font-semibold">{g.title}</h3>
          <p className="truncate text-xs text-ivory/70">{g.hostMode === 'audience' ? 'Audience host' : 'Playing host'} · {g.playerCount} joined · {g.settings.questionLimit} questions{when ? ` · ${when}` : ''}{!['draft', 'cancelled', 'expired'].includes(g.phase) ? ` · code ${formatRoomCode(g.code)}` : ''}</p></div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LIVE.includes(g.phase) ? 'bg-success/25 text-success' : g.phase === 'lobby' ? 'bg-amber/20 text-amber' : 'bg-white/10 text-ivory/80'}`}>{label[g.phase] ?? g.phase}</span>
          {g.phase === 'draft' && <LinkButton to={`/games/${g.id}/edit`} className="!min-h-10 !px-3 text-sm">Finish setup</LinkButton>}
          {open && <LinkButton to={roomPath(g)} className="!min-h-10 !px-3 text-sm">{g.phase === 'lobby' ? 'Enter lobby' : 'Open'}</LinkButton>}
          {g.phase === 'finished' && <LinkButton variant="ghost" to={`/games/${g.id}/results`} className="!min-h-10 !px-3 text-sm">Results</LinkButton>}
        </div>
      </div>
      {['lobby', 'draft'].includes(g.phase) && (
        <details className="mt-1"><summary className="inline-flex min-h-9 cursor-pointer items-center text-xs text-ivory/75 underline underline-offset-2">More</summary>
          <div className="mt-1 flex flex-wrap gap-2">
            <LinkButton variant="ghost" to={`/games/${g.id}/share`} className="!min-h-10 !px-3 text-sm">Share</LinkButton>
            <LinkButton variant="ghost" to={`/games/${g.id}/edit`} className="!min-h-10 !px-3 text-sm">Edit</LinkButton>
            <button className="btn btn-ghost !min-h-10 !px-3 text-sm" onClick={() => onCancel(g)}>Cancel game</button>
          </div></details>
      )}
    </li>
  );
}

function Stat({ value, label: l }: { value: ReactNode; label: string }) {
  return <div className="rounded-xl border border-line bg-ink-soft px-3 py-2 text-center"><p className="font-display text-2xl leading-none text-amber">{value}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-ivory/70">{l}</p></div>;
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const adv = useAdventurer();
  const q = useQuery({ queryKey: ['my-games'], queryFn: () => api<{ games: G[] }>('GET', '/api/games'), refetchInterval: 15_000 });
  const packs = useQuery({ queryKey: ['packs'], queryFn: () => api<{ packs: { id: string; title: string; questionCount: number }[] }>('GET', '/api/packs') });
  const [confirm, setConfirm] = useState<G | null>(null);
  const [tab, setTab] = useState<'open' | 'past' | null>(null);
  const [all, setAll] = useState(false);
  const cancel = useMutation({ mutationFn: (g: G) => api('POST', `/api/games/${g.id}/cancel`), onSuccess: () => { setConfirm(null); void qc.invalidateQueries({ queryKey: ['my-games'] }); } });
  if (q.isPending) return <PageLoading label="Loading your dashboard…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const games = q.data.games;
  const openGames = games.filter((g) => !DONE.includes(g.phase));
  const pastGames = games.filter((g) => DONE.includes(g.phase));
  const staff = !!user && user.role !== 'member';
  const packList = packs.data?.packs ?? [];
  const recs = recommend(games, packList.length, staff);
  const [head, ...more] = recs;
  const current = tab ?? (openGames.length || !pastGames.length ? 'open' : 'past');
  const list = current === 'open' ? openGames : pastGames;
  const shown = all ? list : list.slice(0, 3);
  const first = (user?.displayName || adv.nickname || 'there').split(' ')[0];
  const players = games.reduce((n, g) => n + (g.phase === 'cancelled' ? 0 : g.playerCount), 0);

  return (
    <div className="container-page grid gap-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="hidden size-14 shrink-0 overflow-hidden rounded-2xl border border-line bg-ink-soft sm:block" aria-hidden><AvatarFigure config={adv.avatar} size={56} /></div>
          <div><p className="eyebrow mb-0.5">{staff ? (user?.role === 'super_admin' ? 'Super admin' : 'Content reviewer') : 'Your space'}</p><h1 className="text-2xl sm:text-3xl">Welcome back, {first}</h1></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-3 gap-2" aria-label="Your numbers"><Stat value={games.length} label="Games" /><Stat value={players} label="Players" /><Stat value={packList.length} label="Packs" /></div>
          <LinkButton to="/games/new" className="!min-h-12">Create game</LinkButton>
        </div>
      </header>
      {cancel.isError && <Alert tone="error">{errMsg(cancel.error)}</Alert>}

      {head && (
        <section aria-labelledby="next-h" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber bg-gradient-to-r from-amber/15 to-ink-soft p-4">
          <div className="min-w-0"><p className="eyebrow mb-0.5" id="next-h">Do this next</p><h2 className="text-xl sm:text-2xl">{head.title}</h2><p className="mt-0.5 max-w-2xl text-sm text-ivory/85">{head.text}</p></div>
          <LinkButton to={head.to} className="!min-h-12 shrink-0">{head.cta} <span aria-hidden>→</span></LinkButton>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <section aria-labelledby="games-h" className="card grid content-start gap-3 !p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="games-h" className="text-xl">Your games</h2>
            <div role="tablist" aria-label="Games" className="flex gap-1 rounded-xl border border-line bg-ink p-1">
              {([['open', `Open & upcoming (${openGames.length})`], ['past', `Past (${pastGames.length})`]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={current === k} onClick={() => { setTab(k); setAll(false); }} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${current === k ? 'bg-amber text-ink' : 'text-ivory/80 hover:bg-white/10'}`}>{l}</button>
              ))}
            </div>
          </div>
          {list.length ? (
            <>
              <ul className="grid gap-2">{shown.map((g) => <Row key={g.id} g={g} onCancel={setConfirm} />)}</ul>
              {list.length > 3 && <button className="justify-self-start text-sm underline underline-offset-4" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
            </>
          ) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ivory/75">{current === 'open' ? 'Nothing open right now. Create a game and it appears here, ready to share.' : 'Finished games and their results will appear here.'}</p>}
        </section>

        <div className="grid gap-4">
          {more.length > 0 && (
            <section aria-labelledby="rec-h" className="card grid gap-2 !p-4">
              <h2 id="rec-h" className="text-xl">Also for you</h2>
              <ul className="grid gap-2">{more.slice(0, 3).map((r) => (
                <li key={r.key}><Link to={r.to} className="group flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-ink p-3 transition hover:border-amber hover:bg-ink-raised">
                  <span className="min-w-0"><span className="block font-semibold">{r.title}</span><span className="block text-xs text-ivory/70">{r.text}</span></span>
                  <span className="shrink-0 text-sm font-semibold text-amber group-hover:underline">{r.cta} <span aria-hidden>→</span></span>
                </Link></li>
              ))}</ul>
            </section>
          )}
          <section aria-labelledby="join-h" className="card grid gap-2 !p-4">
            <h2 id="join-h" className="text-xl">Join a friend’s game</h2>
            <div className="rounded-xl bg-ivory p-3 text-ink"><JoinPanel compact /></div>
          </section>
          <section aria-labelledby="packs-h" className="card flex flex-wrap items-center justify-between gap-2 !p-4">
            <div><h2 id="packs-h" className="text-lg">Private question packs</h2><p className="text-xs text-ivory/70">{packList.length ? `${packList.length} pack${packList.length === 1 ? '' : 's'}: ${packList.slice(0, 2).map((p) => p.title).join(', ')}${packList.length > 2 ? '…' : ''}` : 'For classes and events, run with an audience host.'}</p></div>
            <LinkButton variant="ghost" to="/packs" className="!min-h-10 text-sm">Manage packs</LinkButton>
          </section>
        </div>
      </div>

      <ConfirmDialog open={!!confirm} title="Cancel this game?" confirmLabel="Cancel game" danger onCancel={() => setConfirm(null)} onConfirm={() => confirm && cancel.mutate(confirm)}>
        “{confirm?.title}” will close and the room code stops working. Anyone who already joined will see that it was cancelled. Remember to tell your audience.
      </ConfirmDialog>
    </div>
  );
}
