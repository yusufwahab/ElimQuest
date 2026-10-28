import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rankByStep } from '@elimquest/game-core';
import { api, errMsg } from '../../lib/api';
import { Staircase } from '../../components/Staircase';
import { CountdownOverlay, TimerBar, useMsLeft } from '../../components/Countdown';
import { CopyCode, PlayerTile, RulesCard, ScheduleNotice, VotingPanel } from '../../components/RoomParts';
import { ChatPanel } from '../../components/Chat';
import { Alert, Button, ConfirmDialog, Input, LiveRegion } from '../../components/ui';
import { SharePanel } from '../../components/SharePanel';
import { StatBar } from './Play';
import { useRoomCtx } from './RoomLayout';

const PHASE_LABEL: Record<string, string> = { lobby: 'Lobby', countdown: 'Starting next question', question_open: 'Question open', reveal: 'Showing results', paused: 'Paused', recovery_pause: 'Recovery pause — needs resume', climb: 'Showing results' };

export default function HostControls() {
  const { room, code } = useRoomCtx();
  const { snap, offset, moveSeq } = room.state;
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'end' | 'void' | 'early'>(null);
  const [reason, setReason] = useState('');
  const [peek, setPeek] = useState(false);
  const left = useMsLeft(snap?.countdownEndsAt ?? null, offset);
  const preview = useQuery({ queryKey: ['host-preview', snap?.gameId], enabled: peek && !!snap, queryFn: () => api<{ questions: { seq: number; role: string; status: string; text: string; options: { id: string; text: string }[]; correctOptionId: string }[] }>('GET', `/api/games/${snap!.gameId}/preview`) });
  if (!snap) return null;
  const ph = snap.phase;
  const run = async (cmd: string, extra?: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    const ack = await room.host(cmd, extra);
    setBusy(false);
    if (!ack.ok) setErr(ack.error ?? 'That didn’t work'); return ack.ok;
  };
  const standings = rankByStep(snap.players);
  const live = ['countdown', 'question_open', 'reveal', 'paused', 'recovery_pause', 'climb'].includes(ph);
  const canVoid = ph === 'question_open' || ph === 'reveal';
  const q = snap.question;

  const announce = async (e: FormEvent) => { e.preventDefault(); if (!msg.trim()) return; if (await run('announce', { message: msg })) setMsg(''); };

  return (
    <div className="container-page grid gap-5 py-5 lg:grid-cols-[1.1fr_1fr]">
      <LiveRegion message={PHASE_LABEL[ph] ?? ''} />
      <section className="grid content-start gap-4" aria-labelledby="host-h">
        <div className="card grid gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Audience host · you’re not competing</p><h1 id="host-h" className="text-2xl sm:text-3xl">{snap.title}</h1></div><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{PHASE_LABEL[ph] ?? ph}{snap.paused && ph !== 'paused' ? ' · pause pending' : ''}</span></div>
          <CopyCode code={code} showCopy={false} />
          {ph === 'lobby' && <ScheduleNotice scheduledAt={snap.scheduledAt} offset={offset} />}
          {snap.recovery || ph === 'recovery_pause' ? <Alert tone="warn" title="The server restarted">The game is paused so nobody is penalised. Press Resume: an open question restarts with a full timer and answers already given are kept.</Alert> : null}
          {ph === 'question_open' && q && <><TimerBar openedAt={q.openedAt} deadline={q.deadline} offset={offset} /><p className="text-sm text-ivory/80">{snap.answeredCount} of {snap.players.length} have submitted · round {q.roundNo} of {snap.settings.questionLimit}</p></>}
          {ph === 'countdown' && <p className="text-ivory/80">Next question in {Math.max(1, Math.ceil(left / 1000))}s…</p>}
          {ph === 'reveal' && snap.lastResult?.finalePending && <Alert tone="warn" title="Summit reached — winners not yet confirmed">You have a short window to void this question if it was faulty. Otherwise the result is final.</Alert>}
          {snap.announcement && <p className="text-sm text-ivory/75">Last announcement: “{snap.announcement}”</p>}
        </div>

        <div className="card grid gap-3" aria-labelledby="ctl-h">
          <h2 id="ctl-h" className="text-xl">Controls</h2>
          <div className="flex flex-wrap gap-2">
            {ph === 'lobby' && <Button loading={busy} disabled={snap.players.length < 2} onClick={() => void run('start')}>Start game</Button>}
            {ph === 'lobby' && snap.voting?.open && <Button variant="ghost" onClick={() => void run('closeVoting')}>Close topic voting</Button>}
            {live && ph !== 'paused' && ph !== 'recovery_pause' && !snap.paused && <Button variant="ghost" onClick={() => void run('pause')}>Pause after this round</Button>}
            {(ph === 'paused' || ph === 'recovery_pause' || snap.paused) && <Button loading={busy} onClick={() => void run('resume')}>Resume</Button>}
            {ph === 'paused' && <Button variant="ghost" onClick={() => void run('next')}>Run next round, then pause</Button>}
            {canVoid && <Button variant="ghost" onClick={() => setConfirm('void')}>Void this question…</Button>}
            {live && <Button variant="danger" onClick={() => setConfirm('end')}>End game…</Button>}
          </div>
          {ph === 'lobby' && snap.players.length < 2 && <p className="text-sm text-ivory/75">At least two players are needed to start.</p>}
          <form onSubmit={announce} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><Input label="Announcement between questions" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={200} disabled={ph === 'question_open'} hint={ph === 'question_open' ? 'Available between questions.' : 'Shown to everyone. Plain text only.'} /><Button type="submit" variant="ghost" disabled={ph === 'question_open' || !msg.trim()}>Send</Button></form>
          {err && <Alert tone="error">{err}</Alert>}
          <p className="text-xs text-ivory/65">Every control you use is recorded in an audit log that can’t be edited from here.</p>
        </div>

        <details className="card" onToggle={(e) => setPeek((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-lg font-semibold">Question list (host only)</summary>
          {peek && (preview.isPending ? <p className="mt-2 text-sm">Loading…</p> : preview.isError ? <p className="mt-2 text-sm text-ivory/75">{ph === 'lobby' ? 'Questions are selected when the game starts.' : errMsg(preview.error)}</p> : (
            <ol className="mt-3 grid gap-2 text-sm">{preview.data.questions.filter((x) => x.role === 'main').map((x) => <li key={x.seq} className="rounded-lg bg-white/5 p-2.5"><p className="font-semibold">{x.seq}. {x.text} <span className="text-xs font-normal text-ivory/60">({x.status})</span></p><p className="text-ivory/80">✓ {x.options.find((o) => o.id === x.correctOptionId)?.text}</p></li>)}</ol>))}
        </details>
      </section>

      <aside className="grid content-start gap-4">
        <SharePanel gameId={snap.gameId} defaultOpen={ph === 'lobby'} />
        {live && <><div className="relative"><Staircase players={snap.players} youId={null} summit={snap.settings.summitHeight} moveSeq={moveSeq} className="h-56 lg:h-72" />{ph === 'countdown' && <CountdownOverlay endsAt={snap.countdownEndsAt} offset={offset} first={snap.roundNo === 0} />}</div><StatBar snap={snap} /></>}
        <ChatPanel room={room} snap={snap} collapsible={live} />
        {snap.voting && <VotingPanel snap={snap} onVote={async () => undefined} />}
        <section className="card grid gap-2" aria-labelledby="ros"><h2 id="ros" className="text-xl">{live ? 'Standings' : `Players (${snap.players.length}/${snap.settings.maxPlayers})`}</h2>
          {live ? <ol className="grid max-h-80 gap-1 overflow-auto text-sm">{standings.map(({ item, rank }) => <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5"><span><span className="mr-2 text-ivory/60">#{rank}</span>{item.nickname}{!item.connected && <span className="text-xs text-ivory/50"> · offline</span>}</span><span className="flex items-center gap-2 tabular-nums">step {item.position}<button className="min-h-8 px-1.5 text-xs text-danger underline" onClick={() => { if (confirm !== null) return; void run('kick', { participantId: item.id }); }} aria-label={`Remove ${item.nickname}`}>Remove</button></span></li>)}</ol>
            : <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{snap.players.map((p) => <PlayerTile key={p.id} p={p} you={false} onRemove={() => void run('kick', { participantId: p.id })} />)}</ul>}
          {snap.players.length === 0 && <p className="text-ivory/70">Waiting for players to join with the code.</p>}
        </section>
        <RulesCard snap={snap} />
      </aside>

      <ConfirmDialog open={confirm === 'void'} title="Void this question?" confirmLabel="Void and replace" danger onCancel={() => setConfirm(null)} onConfirm={() => { const r = reason.trim() || 'Faulty question'; setConfirm(null); void run('void', { reason: r }); setReason(''); }}>
        <p>Everyone’s answers to this question are discarded, any movement is reversed, and an unused question replaces it. Voided questions don’t count towards the round limit.</p>
        <div className="mt-3"><Input label="Reason (recorded in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. The answer was disputed" /></div>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'end'} title="End the game now?" confirmLabel="End game" danger onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void run('end'); }}>
        Results will be marked <strong>“Ended early”</strong> and will not count as a completed match. Winners are whoever is highest on the staircase right now.
      </ConfirmDialog>
    </div>
  );
}
