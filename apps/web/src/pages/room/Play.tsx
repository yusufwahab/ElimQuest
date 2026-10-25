import { useEffect, useMemo, useRef, useState } from 'react';
import { feedbackMessage, optionOrder } from '@elimquest/game-core';
import type { RoomSnapshot } from '@elimquest/contracts';
import { api } from '../../lib/api';
import { playSfx } from '../../lib/sound';
import { prefs, roomCred } from '../../lib/storage';
import { Staircase, RosterList } from '../../components/Staircase';
import { CountdownOverlay, QuestionHeader, useSecondsLeft } from '../../components/Countdown';
import { Alert, Button, LiveRegion } from '../../components/ui';
import { OPTION_LETTERS, RevealChart, RoundHighlights, StreakBadge, TensionCue } from '../../components/RoundInsights';
import { StickerBar, StickerBurst, StickerIcon } from '../../components/Stickers';
import { useRoomCtx } from './RoomLayout';

const LETTERS = OPTION_LETTERS;

/** One-line scoring reminder that always matches the game's house rules. */
export const ruleHint = (s: RoomSnapshot['settings']) => `Correct +1${s.superQuestion ? ' (super question +2)' : ''} · ${s.gentle ? 'Wrong or unanswered: stay put' : 'Wrong or unanswered −1'}`;

/** Stats bar (reference): big "your step" and "leading step" numbers plus the roster toggle. */
export function StatBar({ snap, onPlayers, playersOpen }: { snap: RoomSnapshot; onPlayers?: () => void; playersOpen?: boolean }) {
  const me = snap.players.find((p) => p.id === snap.you.participantId);
  const lead = snap.players.reduce((m, p) => Math.max(m, p.position), 0);
  return (
    <dl className="flex items-center gap-3 rounded-2xl border border-line bg-ink-soft/90 px-3.5 py-1.5 sm:gap-5" aria-label="Game status">
      <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-ivory/70">{me ? 'Your step' : 'Players'}</dt><dd className="flex items-center gap-2 font-display text-2xl font-semibold leading-none tabular-nums">{me ? me.position : snap.players.length}<StreakBadge streak={snap.myStreak} /></dd></div>
      <span className="h-8 w-px bg-line" aria-hidden />
      <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-teal-bright">Leading step</dt><dd className="font-display text-2xl font-semibold leading-none tabular-nums text-amber">{lead}</dd></div>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-xs text-ivory/70 sm:inline">{snap.players.length} players · summit {snap.settings.summitHeight}</span>
        {onPlayers && <button type="button" onClick={onPlayers} aria-expanded={playersOpen} className="btn btn-ghost !min-h-11 !px-3.5 text-sm">{playersOpen ? 'Hide players' : 'View players'} <span aria-hidden>›</span></button>}
      </div>
    </dl>
  );
}

function Question({ snap, room }: { snap: RoomSnapshot; room: ReturnType<typeof useRoomCtx>['room'] }) {
  const { selection, sending, offset } = room.state;
  const q = snap.question!;
  const [err, setErr] = useState<string | null>(null);
  const locked = snap.myAnswerAccepted;
  const spectator = snap.you.role === 'spectator';
  const left = useSecondsLeft(q.deadline, offset);
  const closed = left <= 0;
  const opts = useMemo(() => optionOrder(q.options, snap.you.participantId ?? 'spectator', q.shuffleSalt), [q, snap.you.participantId]);
  const group = useRef<HTMLFieldSetElement>(null);
  useEffect(() => { setErr(null); }, [q.roundId]);
  const total = snap.players.length;
  return (
    <div className="grid gap-3">
      <QuestionHeader roundNo={q.roundNo} total={snap.settings.questionLimit} openedAt={q.openedAt} deadline={q.deadline} offset={offset} level={q.level} category={q.categoryName} />
      {q.isSuper && <div role="status" className="flex items-center gap-2.5 rounded-xl border-2 border-amber bg-amber/15 px-3 py-2 text-sm font-semibold anim-rise"><StickerIcon kind="star" size={26} /><span><span className="block text-base text-amber">Super question!</span>Answer correctly to climb <strong>two steps</strong>. A miss costs the usual one.</span></div>}
      <h2 className="text-lg leading-snug sm:text-2xl" id="q-text">{q.text}</h2>
      <fieldset ref={group} disabled={locked || closed || spectator} className="grid gap-2 disabled:opacity-100" aria-labelledby="q-text">
        <legend className="sr-only">Choose one answer</legend>
        {opts.map((o, i) => {
          const on = selection === o.id;
          return (
            <label key={o.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-base transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber ${on ? 'border-teal-bright bg-teal/40 ring-2 ring-teal-bright' : 'border-line bg-ink-soft hover:bg-ink-raised'} ${(locked || closed || spectator) && !on ? 'opacity-60' : ''} ${(locked || closed || spectator) ? 'cursor-default' : ''}`}>
              <input type="radio" name="answer" value={o.id} checked={on} onChange={() => room.select(o.id)} className="sr-only" />
              <span aria-hidden className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${on ? 'border-teal-bright bg-teal-bright text-ink' : 'border-line'}`}>{on ? '✓' : LETTERS[i]}</span>
              <span className="min-w-0 break-words">{o.text}</span>
            </label>
          );
        })}
      </fieldset>
      <div className="sticky bottom-0 z-10 -mx-3 grid gap-1.5 border-t border-line bg-ink-soft px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_16px_rgba(7,27,45,.7)] sm:-mx-4 sm:px-4 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:shadow-none">
        {spectator ? <p className="text-center text-sm text-ivory/80">You’re watching. Spectators can’t answer.</p> : (
          <Button className="min-h-12 w-full" loading={sending} disabled={!selection || locked || closed} onClick={async () => { setErr(await room.submit()); playSfx('submit'); }}>
            {locked ? 'Answer received ✓' : sending ? 'Sending…' : closed ? 'Time’s up' : 'Submit answer'}
          </Button>
        )}
        <p className={`text-center text-xs text-ivory/75 ${locked ? '' : 'sr-only sm:not-sr-only'}`} aria-live="polite">{locked ? 'Your answer is locked in. Results appear when the timer ends.' : spectator ? '' : 'Pick an answer, then press Submit. You can change your pick until you submit.'}</p>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-2 text-xs text-ivory/80"><span><strong className="text-ivory">{snap.answeredCount}</strong> of {total} answered</span><span>{ruleHint(snap.settings)}</span></div>
        {err && <Alert tone="error">{err}</Alert>}
      </div>
    </div>
  );
}

function Reveal({ snap, code, offset }: { snap: RoomSnapshot; code: string; offset: number }) {
  const r = snap.lastResult!;
  const left = useSecondsLeft(r.nextAt, offset);
  const my = r.standings.find((s) => s.id === snap.you.participantId);
  const fb = my ? feedbackMessage(my, { gentle: !!snap.settings.gentle, superRound: !!r.isSuper }) : null;
  const order = useMemo(() => (snap.question ? optionOrder(snap.question.options, snap.you.participantId ?? 'spectator', snap.question.shuffleSalt) : []), [snap.question, snap.you.participantId]);
  const tone = !my ? 'border-line bg-white/5' : my.outcome === 'correct' ? 'border-success/70 bg-success/15' : 'border-danger/60 bg-danger/10';
  const icon = !my ? '' : my.outcome === 'correct' ? '▲ ✓' : my.outcome === 'wrong' ? '▼ ✕' : '▼ ⏱';
  const [reported, setReported] = useState(false);
  return (
    <div className="grid gap-3 anim-rise">
      {fb ? (
        <div className={`rounded-2xl border p-4 ${tone}`} role="status"><p className="text-2xl font-display"><span aria-hidden className="mr-2 text-xl">{icon}</span>{fb.title}{r.isSuper && my?.outcome === 'correct' && <span className="ml-2 align-middle"><StickerIcon kind="star" size={22} /></span>}</p><p className="text-ivory/90">{fb.detail}{my && my.to !== my.from ? ` (step ${my.from} → ${my.to})` : ''}</p></div>
      ) : <div className="rounded-2xl border border-line bg-white/5 p-4" role="status"><p className="text-xl font-display">Round {r.roundNo} results</p></div>}
      <div className="rounded-xl bg-white/5 p-3"><p className="text-xs uppercase tracking-wider text-ivory/60">Correct answer</p><p className="text-lg font-semibold">{r.correctText}</p></div>
      <p className="text-ivory/90">{r.explanation}</p>
      {order.length > 0 && <RevealChart result={r} order={order} myChoice={snap.myChoice} />}
      <RoundHighlights result={r} players={snap.players} youId={snap.you.participantId} />
      {r.reference && <details className="text-sm"><summary className="cursor-pointer font-semibold">Source / reference</summary><p className="mt-1 text-ivory/80">{r.reference}</p></details>}
      {r.finalePending && <Alert tone="warn" title="Someone has reached the summit!">Confirming the result… winners are announced in a moment.</Alert>}
      {!r.finalePending && r.nextAt && <p className="text-sm text-ivory/75" aria-live="off">Next question in {Math.ceil(left / 1000)}s</p>}
      {snap.you.role === 'player' && <button className="justify-self-start text-xs underline disabled:no-underline" disabled={reported} onClick={() => { setReported(true); void api('POST', '/api/reports', { questionVersionId: r.questionVersionId, reason: 'wrong_answer', note: '' }, { guest: roomCred.get(code)?.token }).catch(() => setReported(false)); }}>{reported ? 'Thanks — reported for review' : 'Report this question'}</button>}
    </div>
  );
}

export default function Play() {
  const { room, code } = useRoomCtx();
  const { snap, moveSeq } = room.state;
  const [roster, setRoster] = useState(false);
  const [sound, setSound] = useState(prefs.get().sound);
  const lastSeq = useRef(moveSeq);

  const myId = snap?.you.participantId ?? null;
  const my = snap?.lastResult?.standings.find((s) => s.id === myId);
  useEffect(() => {
    if (moveSeq === lastSeq.current) return; lastSeq.current = moveSeq;
    playSfx('reveal'); if (my) setTimeout(() => playSfx(my.outcome === 'correct' ? 'up' : 'down'), 350);
  }, [moveSeq, my]);

  if (!snap) return null;
  const phase = snap.phase;
  const answering = phase === 'question_open';
  const announce = answering ? `Question ${snap.question?.roundNo} is open.` : phase === 'reveal' && my ? `${feedbackMessage(my).title} ${feedbackMessage(my).detail}` : phase === 'countdown' ? 'Next question starting.' : phase === 'paused' ? 'The game is paused.' : '';
  // Mobile: compact scene while answering, roomier during the reveal (spec §9.10).
  const sceneH = answering ? 'h-[28svh] min-h-[190px] max-h-[320px]' : 'h-[42svh] min-h-[240px] max-h-[420px]';

  return (
    <div className="container-page grid gap-3 py-3 lg:grid-cols-[1.15fr_1fr] lg:gap-5 lg:py-6">
      <section aria-label="Staircase" className="grid content-start gap-2 lg:sticky lg:top-4 lg:self-start">
        <div className="relative">
          <Staircase players={snap.players} youId={myId} summit={snap.settings.summitHeight} moveSeq={moveSeq} className={`${sceneH} lg:h-[min(68svh,620px)]`} />
          {phase === 'countdown' && <CountdownOverlay endsAt={snap.countdownEndsAt} offset={room.state.offset} first={snap.roundNo === 0} />}
          <StickerBurst items={room.reactions} players={snap.players} onDone={room.dismissReaction} />
          <button type="button" aria-pressed={sound} aria-label={sound ? 'Turn sound off' : 'Turn sound on'} onClick={() => { const v = !sound; setSound(v); prefs.set({ ...prefs.get(), sound: v }); }} className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full border border-line bg-ink/70 backdrop-blur-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 9v6h4l5 4V5L8 9z" />{sound ? <path d="M16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}</svg>
          </button>
        </div>
        <StatBar snap={snap} onPlayers={() => setRoster((r) => !r)} playersOpen={roster} />
        <TensionCue snap={snap} />
        {snap.you.role === 'player' && !answering && ['reveal', 'countdown', 'paused'].includes(phase) && <StickerBar onSend={room.react} />}
        {roster && <div className="card max-h-64 overflow-auto !p-3"><RosterList players={snap.players} youId={myId} summit={snap.settings.summitHeight} /></div>}
      </section>

      <section aria-label="Question" className="card grid content-start gap-3 !p-4 sm:!p-5">
        <LiveRegion message={announce} />
        {snap.announcement && <Alert tone="info" title="Message from the host">{snap.announcement}</Alert>}
        {snap.recovery || phase === 'recovery_pause' ? <Alert tone="warn" title="Game paused">The server restarted, so the game is paused. The host can resume it — your progress is saved and nothing was scored unfairly.</Alert>
          : snap.paused && phase === 'paused' ? <Alert tone="info" title="The host paused the game">Hang tight — it will continue shortly.</Alert> : null}
        {phase === 'countdown' && <p className="py-6 text-center text-ivory/80" role="status">{snap.roundNo === 0 ? 'The first question starts in a moment — watch the stairs.' : 'Next question starting — watch the stairs.'}</p>}
        {answering && snap.question && <Question snap={snap} room={room} />}
        {phase === 'reveal' && snap.lastResult && <Reveal snap={snap} code={code} offset={room.state.offset} />}
        {phase === 'paused' && snap.lastResult && <Reveal snap={snap} code={code} offset={room.state.offset} />}
        {phase === 'lobby' && <p className="text-ivory/80">Waiting in the lobby…</p>}
      </section>
    </div>
  );
}
