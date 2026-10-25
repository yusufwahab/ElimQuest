import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatRoomCode } from '@elimquest/game-core';
import { api, errMsg } from '../lib/api';
import { Alert, ConfirmDialog, EmptyState, ErrorState, LinkButton, PageLoading } from '../components/ui';

interface G { id: string; code: string; title: string; hostMode: 'competing' | 'audience'; phase: string; scheduledAt: string | null; timezone: string; createdAt: string; playerCount: number; settings: { questionLimit: number } }

const LIVE = ['countdown', 'question_open', 'reveal', 'climb', 'paused', 'recovery_pause'];
const label: Record<string, string> = { draft: 'Draft', lobby: 'Open lobby', countdown: 'Starting', question_open: 'Live', reveal: 'Live', climb: 'Live', paused: 'Paused', recovery_pause: 'Needs resume', finished: 'Finished', cancelled: 'Cancelled', expired: 'Expired' };

function Card({ g, onCancel }: { g: G; onCancel: (g: G) => void }) {
  const when = g.scheduledAt ? new Date(g.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: g.timezone }) : null;
  const room = g.hostMode === 'audience' ? `/rooms/${g.code}/host` : `/join/${g.code}`;
  return (
    <li className="card grid gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg">{g.title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LIVE.includes(g.phase) ? 'bg-success/25 text-success' : g.phase === 'lobby' ? 'bg-amber/20 text-amber' : 'bg-white/10 text-ivory/80'}`}>{label[g.phase] ?? g.phase}</span>
      </div>
      <p className="text-sm text-ivory/75">{g.hostMode === 'audience' ? 'Audience host' : 'Competing host'} · {g.playerCount} joined · {g.settings.questionLimit} questions{when ? ` · ${when}` : ''}</p>
      {g.phase !== 'draft' && g.phase !== 'cancelled' && g.phase !== 'expired' && <p className="text-sm">Room code <strong className="tracking-widest">{formatRoomCode(g.code)}</strong></p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {g.phase === 'draft' && <LinkButton to={`/games/${g.id}/edit`} className="!min-h-10 !px-4 text-sm">Finish setup</LinkButton>}
        {['lobby', ...LIVE].includes(g.phase) && <LinkButton to={room} className="!min-h-10 !px-4 text-sm">{g.phase === 'lobby' ? 'Enter lobby' : 'Open game'}</LinkButton>}
        {['lobby', 'draft'].includes(g.phase) && <><LinkButton variant="ghost" to={`/games/${g.id}/share`} className="!min-h-10 !px-4 text-sm">Share</LinkButton><LinkButton variant="ghost" to={`/games/${g.id}/edit`} className="!min-h-10 !px-4 text-sm">Edit</LinkButton><button className="btn btn-ghost !min-h-10 !px-4 text-sm" onClick={() => onCancel(g)}>Cancel game</button></>}
        {g.phase === 'finished' && <LinkButton variant="ghost" to={`/games/${g.id}/results`} className="!min-h-10 !px-4 text-sm">Results</LinkButton>}
      </div>
    </li>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-games'], queryFn: () => api<{ games: G[] }>('GET', '/api/games'), refetchInterval: 15_000 });
  const packs = useQuery({ queryKey: ['packs'], queryFn: () => api<{ packs: { id: string; title: string; questionCount: number }[] }>('GET', '/api/packs') });
  const [confirm, setConfirm] = useState<G | null>(null);
  const cancel = useMutation({ mutationFn: (g: G) => api('POST', `/api/games/${g.id}/cancel`), onSuccess: () => { setConfirm(null); void qc.invalidateQueries({ queryKey: ['my-games'] }); } });
  if (q.isPending) return <PageLoading label="Loading your games…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const games = q.data.games;
  const upcoming = games.filter((g) => ['draft', 'lobby'].includes(g.phase));
  const active = games.filter((g) => LIVE.includes(g.phase));
  const done = games.filter((g) => ['finished', 'cancelled', 'expired'].includes(g.phase));
  const section = (title: string, list: G[], empty: string) => (
    <section aria-labelledby={title.replace(/\W/g, '')} className="grid gap-3"><h2 id={title.replace(/\W/g, '')} className="text-2xl">{title}</h2>
      {list.length ? <ul className="grid gap-3 md:grid-cols-2">{list.map((g) => <Card key={g.id} g={g} onCancel={setConfirm} />)}</ul> : <p className="text-ivory/70">{empty}</p>}</section>
  );
  return (
    <div className="container-page grid gap-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow mb-1">Host dashboard</p><h1 className="text-3xl">Your games</h1></div><LinkButton to="/games/new">Create game</LinkButton></div>
      {cancel.isError && <Alert tone="error">{errMsg(cancel.error)}</Alert>}
      {games.length === 0 && <EmptyState title="No games yet" action={<LinkButton to="/games/new">Create your first game</LinkButton>}>Create a room, share the link, and start when everyone has arrived.</EmptyState>}
      {games.length > 0 && <>{section('Upcoming and open rooms', upcoming, 'Nothing open right now.')}{section('Active sessions', active, 'No games are running.')}{section('Completed games', done, 'Finished games will appear here.')}</>}
      <section aria-labelledby="packs-h" className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="packs-h" className="text-2xl">Private question packs</h2><LinkButton variant="ghost" to="/packs">Manage packs</LinkButton></div>
        {packs.data?.packs.length ? <ul className="grid gap-2 sm:grid-cols-2">{packs.data.packs.map((p) => <li key={p.id} className="card !p-4"><Link className="font-semibold underline" to={`/packs/${p.id}/edit`}>{p.title}</Link><span className="text-sm text-ivory/70"> · {p.questionCount} questions</span></li>)}</ul> : <p className="text-ivory/70">Write your own questions for classes or events. Games using a pack run with an audience host.</p>}</section>
      <ConfirmDialog open={!!confirm} title="Cancel this game?" confirmLabel="Cancel game" danger onCancel={() => setConfirm(null)} onConfirm={() => confirm && cancel.mutate(confirm)}>
        “{confirm?.title}” will close and the room code stops working. Anyone who already joined will see that it was cancelled. Remember to tell your audience.
      </ConfirmDialog>
    </div>
  );
}
