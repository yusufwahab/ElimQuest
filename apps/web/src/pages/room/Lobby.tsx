import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useRoomCtx } from './RoomLayout';
import { CopyCode, PlayerTile, RulesCard, ScheduleNotice, VotingPanel } from '../../components/RoomParts';
import { Alert, Button, ConfirmDialog, LiveRegion } from '../../components/ui';
import { SharePanel } from '../../components/SharePanel';
import { StickerBar, StickerBurst } from '../../components/Stickers';
import { ChatPanel } from '../../components/Chat';

export default function Lobby() {
  const { room, code } = useRoomCtx();
  const { snap, offset } = room.state;
  const [err, setErr] = useState<{ msg: string; extra?: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [early, setEarly] = useState(false);
  // Warm the lazy game chunk (Phaser + scene) while waiting. Failures are harmless: Play falls back to the HTML staircase.
  useEffect(() => { void import('../../scene/staircase').catch(() => undefined); }, []);
  if (!snap) return null;
  const isHost = snap.you.canControl;
  const players = snap.players;
  const ready = players.length >= 2;
  const run = async (cmd: string, extra?: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    const ack = await room.host(cmd, extra);
    setBusy(false);
    if (!ack.ok) setErr({ msg: ack.error ?? 'Something went wrong', extra: ack.data });
  };
  const start = () => { if (snap.scheduledAt && new Date(snap.scheduledAt).getTime() > Date.now() + offset) setEarly(true); else void run('start'); };

  return (
    <div className="container-page grid gap-5 py-6 lg:grid-cols-[1.4fr_1fr]">
      <section aria-labelledby="lobby-h" className="grid content-start gap-4">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-teal/40 via-ink-soft to-ink p-5">
          <StickerBurst items={room.reactions} players={snap.players} onDone={room.dismissReaction} />
          <div className="absolute inset-0 opacity-[.07] [background:repeating-conic-gradient(#f2b858_0_25%,transparent_0_50%)_0_0/26px_26px]" aria-hidden />
          <div className="relative grid gap-3">
            <div><p className="eyebrow">Game lobby</p><h1 id="lobby-h" className="text-3xl">{snap.title}</h1></div>
            <CopyCode code={code} showCopy={!isHost} />
            <ScheduleNotice scheduledAt={snap.scheduledAt} offset={offset} />
            <p className="text-ivory/85" aria-live="polite">{isHost ? (ready ? 'Everyone here? Start when you’re ready.' : 'Waiting for at least one more player…') : 'Waiting for the host to start the game…'}</p>
          </div>
        </div>

        <div className="flex items-center justify-between"><h2 className="text-xl">Players <span className="text-ivory/70">({players.length} / {snap.settings.maxPlayers})</span></h2></div>
        <LiveRegion message={`${players.length} players in the lobby`} />
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {players.map((p) => <PlayerTile key={p.id} p={p} you={p.id === snap.you.participantId} onRemove={isHost ? () => void run('kick', { participantId: p.id }) : undefined} />)}
        </ul>
        {players.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-ink-soft/50 p-6 text-center">
            <p className="font-display text-xl">Waiting for players…</p>
            <p className="mt-1 text-sm text-ivory/75">{isHost ? 'Share the code, link or QR below. People appear here the moment they join.' : 'Share the room code so friends can join you.'}</p>
          </div>
        )}
        {snap.you.role === 'player' && <StickerBar onSend={room.react} />}
        {isHost && <SharePanel gameId={snap.gameId} />}
      </section>

      <aside className="grid content-start gap-4">
        {isHost && (
          <div className="card grid gap-3">
            <h2 className="text-xl">Host controls</h2>
            <Button onClick={start} loading={busy} disabled={!ready}>Start game</Button>
            {!ready && <p className="text-sm text-ivory/75">You need at least two players. Want to play alone? <Link className="underline" to="/practice">Try solo practice</Link>.</p>}
            {snap.voting?.open && <Button variant="ghost" onClick={() => void run('closeVoting')}>Close topic voting</Button>}
            <p className="text-xs text-ivory/65">Once the game starts, rounds run automatically. You can’t see the questions or change scores.</p>
            {err && (err.extra?.usable !== undefined
              ? <Alert tone="warn" title="Not enough questions">{err.msg} Edit the game to reduce the number of questions or broaden topics. <Link className="underline" to="/dashboard">Go to dashboard</Link></Alert>
              : <Alert tone="error">{err.msg}</Alert>)}
          </div>
        )}
        {snap.voting && <VotingPanel snap={snap} onVote={room.vote} />}
        <ChatPanel room={room} snap={snap} />
        <RulesCard snap={snap} />
      </aside>
      <ConfirmDialog open={early} title="Start before the gathering time?" confirmLabel="Start now" onCancel={() => setEarly(false)} onConfirm={() => { setEarly(false); void run('start'); }}>
        You advertised a later time. Anyone who hasn’t arrived yet will miss the game — they can only watch once it starts.
      </ConfirmDialog>
    </div>
  );
}
