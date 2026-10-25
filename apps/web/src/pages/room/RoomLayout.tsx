import { useEffect } from 'react';
import { Link, Outlet, useNavigate, useOutletContext, useParams } from 'react-router';
import { formatRoomCode } from '@elimquest/game-core';
import { brand } from '@elimquest/config';
import { useRoom, type RoomApi } from '../../lib/useRoom';
import { gameCode, roomCred } from '../../lib/storage';
import { Brand } from '../../components/Layout';
import { LinkButton, PageLoading, Spinner } from '../../components/ui';
import { JourneyStrip } from '../../components/Journey';

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh"><header className="border-b border-line/60"><div className="container-page flex min-h-14 items-center"><Brand /></div></header><div className="container-page py-12">{children}</div></div>;
}

export interface RoomCtx { room: RoomApi; code: string }
export const useRoomCtx = () => useOutletContext<RoomCtx>();

export default function RoomLayout() {
  const { code = '' } = useParams();
  const room = useRoom(code);
  const nav = useNavigate();
  const { snap, conn, denyReason } = room.state;
  const here = location.pathname.split('/').pop();

  // Keep the URL in step with the game: lobby → play, audience host → host console, finished → results.
  useEffect(() => {
    if (!snap) return;
    gameCode.set(snap.gameId, code);
    const control = snap.you.canControl && snap.hostMode === 'audience';
    if (snap.phase === 'finished') { nav(`/games/${snap.gameId}/results`, { replace: true }); return; }
    if (snap.phase === 'cancelled' || snap.phase === 'expired') return;
    const want = control ? 'host' : snap.phase === 'lobby' || snap.phase === 'draft' ? 'lobby' : 'play';
    if (here !== want) nav(`/rooms/${code}/${want}`, { replace: true });
  }, [snap?.phase, snap?.you.canControl, snap?.hostMode, snap?.gameId, code, here, nav, snap]);

  useEffect(() => { if (conn === 'denied' && denyReason !== 'room_connections_full' && !roomCred.get(code)) nav(`/join/${code}`, { replace: true }); }, [conn, denyReason, code, nav]);


  if (conn === 'removed') return <Shell><div className="card mx-auto max-w-lg text-center"><h1 className="text-2xl">You were removed from this game</h1><p className="mt-2 text-ivory/80">The host removed you from the room.</p><div className="mt-4 flex justify-center"><LinkButton to="/">Home</LinkButton></div></div></Shell>;
  if (conn === 'denied') return <Shell><div className="card mx-auto max-w-lg text-center"><h1 className="text-2xl">{denyReason === 'room_connections_full' ? 'This room is at its connection limit' : 'You’re not in this room'}</h1><p className="mt-2 text-ivory/80">{denyReason === 'room_connections_full' ? 'Too many people are watching right now. Try again in a moment.' : 'Join with the room code to take part.'}</p><div className="mt-4 flex justify-center gap-3"><LinkButton to={`/join/${code}`}>Join room</LinkButton><LinkButton variant="ghost" to="/">Home</LinkButton></div></div></Shell>;
  if (!snap) return <Shell><PageLoading label={conn === 'reconnecting' ? 'Reconnecting… the server may be waking up' : 'Connecting to the room…'} /></Shell>;
  if (snap.phase === 'cancelled' || snap.phase === 'expired') return <Shell><div className="card mx-auto max-w-lg text-center"><h1 className="text-2xl">{snap.phase === 'cancelled' ? 'This game was cancelled' : 'This room has expired'}</h1><p className="mt-2 text-ivory/80">Ask the host for a new link.</p><div className="mt-4 flex justify-center"><LinkButton to="/">Home</LinkButton></div></div></Shell>;

  return (
    <div className="min-h-svh">
      {conn === 'reconnecting' && <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber px-3 py-1.5 text-sm font-semibold text-ink"><Spinner />Reconnecting… your place is saved.</div>}
      <header className="border-b border-line/60"><div className="container-page flex min-h-14 items-center justify-between gap-3"><Brand /><p className="truncate text-sm text-ivory/70"><span className="hidden sm:inline">{brand.name} · </span>Room <strong className="tracking-widest text-ivory">{formatRoomCode(code)}</strong></p><Link className="inline-flex min-h-11 items-center px-2 text-sm underline" to="/">Leave</Link></div></header>
      <JourneyStrip current={snap.phase === 'lobby' ? 0 : snap.phase === 'finished' ? 2 : 1} />
      <Outlet context={{ room, code } satisfies RoomCtx} />
    </div>
  );
}
