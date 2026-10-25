import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { FinalStanding, GameFinishedEvent } from '@elimquest/contracts';
import { api, download, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { deviceId, gameCode, practiceCred, prefs, quickRules, roomCred } from '../lib/storage';
import { NextSteps, RecapShare, weakestTopic, type NextCard } from '../components/NextSteps';
import { playSfx } from '../lib/sound';
import { AvatarFigure } from '../components/Avatar';
import { Alert, Button, EmptyState, ErrorState, LinkButton, LiveRegion, PageLoading } from '../components/ui';

interface Review { roundNo: number; text: string; options: { id: string; text: string }[]; correctOptionId: string; chosen: string | null; outcome: 'correct' | 'wrong' | 'unanswered'; explanation: string; reference: string; categoryName: string }
interface Data { finished: GameFinishedEvent; mine: FinalStanding | null; review: Review[]; breakdown: { category: string; total: number; correct: number }[]; hostMode: 'competing' | 'audience'; title: string; endedEarly: boolean; canControl: boolean; code: string }

const REASON: Record<string, string> = { summit: 'Someone reached the summit', question_limit: 'The question limit was reached — the highest step wins', ended_early: 'Ended early by the host', question_shortage: 'The game ended because no more questions were available' };

function Confetti() {
  if (prefs.get().reducedMotion) return null;
  const bits = Array.from({ length: 22 }, (_, i) => ({ l: (i * 47) % 100, d: (i % 6) * 0.35, c: i % 2 ? '#f2b858' : '#19a7b8' }));
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>{bits.map((b, i) => <span key={i} className="absolute top-0 block h-2.5 w-1.5 animate-[confetti_2.6s_ease-in_both]" style={{ left: `${b.l}%`, background: b.c, animationDelay: `${b.d}s` }} />)}<style>{'@keyframes confetti{from{transform:translateY(-10px) rotate(0);opacity:1}to{transform:translateY(260px) rotate(300deg);opacity:0}}'}</style></div>;
}

function Finale({ f, youId, title }: { f: GameFinishedEvent; youId: string | null; title: string }) {
  const winners = f.standings.filter((s) => f.winners.includes(s.id));
  const shown = winners.slice(0, 6);
  const solo = winners.length === 0;
  useEffect(() => { playSfx('finish'); }, []);
  return (
    <section aria-labelledby="fin-h" className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-teal/50 via-ink-soft to-ink px-4 pb-6 pt-8 text-center">
      {f.reason === 'summit' && <Confetti />}
      <p className="eyebrow mb-2">{title}</p>
      <h1 id="fin-h" className="text-4xl sm:text-5xl">{f.reason === 'ended_early' ? 'Game ended early' : f.reason === 'summit' ? 'Climb complete!' : 'Final standings'}</h1>
      <p className="mt-1 text-amber">{solo ? '' : winners.length > 1 ? 'Joint winners' : 'Winner'}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ivory/80">{REASON[f.reason]}. Rankings reflect the staircase only — never speed, and never anyone’s faith.</p>
      <ul className="mt-5 flex flex-wrap items-end justify-center gap-x-2 gap-y-3">
        {shown.map((w, i) => (
          <li key={w.id} className="flex flex-col items-center anim-rise" style={{ animationDelay: `${i * 90}ms` }}>
            <div className="anim-float" style={{ animationDelay: `${i * 0.3}s` }}><AvatarFigure config={w.avatar} size={shown.length > 3 ? 78 : 104} /></div>
            <div className="-mt-1 w-28 rounded-lg bg-ink-raised/90 px-2 py-1 text-xs"><p className="truncate font-semibold">{w.nickname}{w.id === youId ? ' (you)' : ''}</p><p className="text-ivory/70">Step {w.position}</p></div>
          </li>))}
      </ul>
      {winners.length > shown.length && <p className="mt-2 text-sm">…and {winners.length - shown.length} more at the summit</p>}
      <div className="mx-auto mt-3 h-3 w-[min(22rem,80%)] rounded-full bg-gradient-to-r from-transparent via-amber/60 to-transparent" aria-hidden />
    </section>
  );
}

export default function Results() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const code = gameCode.get(id);
  const token = code ? roomCred.get(code)?.token : undefined;
  const q = useQuery({ queryKey: ['results', id], retry: 1, queryFn: () => api<Data>('GET', `/api/games/${id}/results`, undefined, { guest: token }) });
  const rematch = useQuery({ queryKey: ['rematch', id], enabled: q.isSuccess, refetchInterval: (s) => (s.state.data?.code ? false : 5000), queryFn: () => api<{ code: string | null }>('GET', `/api/games/${id}/rematch`) });
  const [saved, setSaved] = useState(false);
  const startRematch = useMutation({ mutationFn: () => api<{ code: string; gameId: string }>('POST', `/api/games/${id}/rematch`), onSuccess: (r) => nav(q.data?.hostMode === 'audience' ? `/games/${r.gameId}/share` : `/join/${r.code}`) });
  const mistakes = useMutation({ mutationFn: () => api<{ id: string; token: string }>('POST', '/api/practice', { mode: 'mistakes', sourceGameId: id, questionLimit: 30, summitHeight: 3 }, { guest: token }), onSuccess: (r) => { practiceCred.set(r.id, { token: r.token }); nav(`/practice/${r.id}/play`); } });
  const link = useMutation({ mutationFn: () => api('POST', `/api/games/${id}/link-account`, { participantToken: token }), onSuccess: () => setSaved(true) });

  const youId = q.data?.mine?.id ?? null;
  const missed = useMemo(() => q.data?.review.filter((r) => r.outcome !== 'correct') ?? [], [q.data]);
  const topicsQ = useQuery({ queryKey: ['topics'], queryFn: () => api<{ topics: { id: string; name: string }[] }>('GET', '/api/topics', undefined, { auth: false }) });
  const quick = useMutation({
    mutationFn: (ids: string[]) => api<{ id: string; token: string }>('POST', '/api/practice', { categoryIds: ids, minLevel: 1, maxLevel: 10, questionLimit: 10, summitHeight: 5, timeLimitS: 30, ...quickRules.get() }, { headers: { 'x-device-id': deviceId() } }),
    onSuccess: (r) => { practiceCred.set(r.id, { token: r.token }); nav(`/practice/${r.id}/play`); },
  });
  if (q.isPending) return <PageLoading label="Loading results…" />;
  if (q.isError) return <div className="container-page max-w-xl py-10"><ErrorState error={q.error} /><div className="flex justify-center"><LinkButton to="/">Home</LinkButton></div></div>;
  const d = q.data;
  const f = d.finished;
  const next = rematch.data?.code;
  const weak = weakestTopic(d.breakdown);
  const weakId = weak ? topicsQ.data?.topics.find((t) => t.name === weak.category)?.id : undefined;
  const inviteUrl = location.origin + import.meta.env.BASE_URL + (next ? `join/${next}` : '');
  const invite = async () => { try { if (navigator.share) await navigator.share({ title: 'ElimQuest', text: next ? 'Join our next ElimQuest game!' : 'Try ElimQuest with me!', url: inviteUrl }); else await navigator.clipboard.writeText(inviteUrl); } catch { /* cancelled */ } };
  const cards: NextCard[] = [
    d.canControl ? { key: 'rematch', title: 'Play again', text: 'A new room with fresh questions and the same settings.', action: <Button className="!min-h-11 text-sm" loading={startRematch.isPending} onClick={() => startRematch.mutate()}>Rematch</Button> }
      : next ? { key: 'rematch', title: 'Rematch is open', text: 'The host started a new room with fresh questions.', action: <LinkButton to={`/join/${next}`} className="!min-h-11 text-sm">Join the rematch</LinkButton> }
      : { key: 'rematch', title: 'Play again', text: 'Waiting for the host to start a rematch. Play a quick climb while you wait.', action: <Button variant="ghost" className="!min-h-11 text-sm" loading={quick.isPending} disabled={!topicsQ.data} onClick={() => quick.mutate((topicsQ.data?.topics ?? []).map((t) => t.id))}>Quick climb</Button> },
    ...(missed.length > 0 ? [{ key: 'mistakes', title: 'Practise my mistakes', text: `Replay the ${missed.length} question${missed.length === 1 ? '' : 's'} you missed, with the answers explained.`, action: <Button variant="ghost" className="!min-h-11 text-sm" loading={mistakes.isPending} onClick={() => mistakes.mutate()}>Practise ({missed.length})</Button> }] : []),
    ...(weak && weakId ? [{ key: 'weak', title: `Strengthen ${weak.category}`, text: `You got ${weak.pct}% right in this topic. A quick climb is a good next step.`, action: <Button variant="ghost" className="!min-h-11 text-sm" loading={quick.isPending} onClick={() => quick.mutate([weakId])}>Quick climb</Button> }] : []),
    { key: 'host', title: d.canControl ? 'Host a different game' : 'Host your own game', text: 'Set one up on a single screen and invite people with a link or QR code.', action: <LinkButton variant="ghost" to="/games/new?template=family" className="!min-h-11 text-sm">Host a game</LinkButton> },
    { key: 'invite', title: 'Bring a friend', text: next ? 'Share the link to the new room.' : 'Share ElimQuest with someone who’d enjoy it.', action: <Button variant="ghost" className="!min-h-11 text-sm" onClick={() => void invite()}>{typeof navigator !== 'undefined' && 'share' in navigator ? 'Share invite' : 'Copy invite link'}</Button> },
  ];
  return (
    <div className="container-page grid gap-6 py-6">
      <LiveRegion message={`Game finished. ${f.winners.length} ${f.winners.length === 1 ? 'winner' : 'joint winners'}.`} />
      <Finale f={f} youId={youId} title={d.title} />
      {d.endedEarly && <Alert tone="warn" title="Ended early">The host ended this game before it finished, so it isn’t a completed match.</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        {d.mine && <RecapShare data={{ title: d.title, heading: f.winners.includes(d.mine.id) ? (f.winners.length > 1 ? 'Joint winner!' : 'Winner!') : `Rank ${d.mine.rank}`, lines: [`Step ${d.mine.position} of ${f.summitHeight}`, `${d.mine.correct} correct, ${d.mine.wrong} wrong, ${d.mine.unanswered} unanswered`], avatar: d.mine.avatar, nickname: d.mine.nickname, footer: 'Play on ElimQuest' }} shareText={`I finished rank ${d.mine.rank} (step ${d.mine.position}) in "${d.title}" on ElimQuest!`} shareUrl={location.origin + import.meta.env.BASE_URL} />}
        {d.canControl && d.hostMode === 'audience' && <Button variant="ghost" className="!min-h-11 text-sm" onClick={() => void download(`/api/games/${id}/results.csv`, 'elimquest-results.csv', 'text/csv')}>Export results (CSV)</Button>}
        <LinkButton variant="ghost" to="/" className="!min-h-11 text-sm">Return home</LinkButton>
      </div>
      <NextSteps cards={cards} />
      {(startRematch.isError || mistakes.isError || quick.isError) && <Alert tone="error">{errMsg(startRematch.error ?? mistakes.error ?? quick.error)}</Alert>}
      {!user && token && <Alert tone="info" title="Save my results">Create a free account to keep this result in your history. <Link className="underline" to="/sign-up" state={{ from: `/games/${id}/results` }}>Create account</Link> or <Link className="underline" to="/sign-in" state={{ from: `/games/${id}/results` }}>sign in</Link>.</Alert>}
      {user && token && d.mine && !saved && <div><Button variant="ghost" loading={link.isPending} onClick={() => link.mutate()}>Save this result to my account</Button>{link.isError && <p className="mt-1 text-sm text-danger">{errMsg(link.error)}</p>}</div>}
      {saved && <Alert tone="success">Saved to your account history.</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="card overflow-x-auto" aria-labelledby="rank-h"><h2 id="rank-h" className="mb-3 text-xl">Rankings</h2>
          <table className="w-full min-w-[22rem] text-left text-sm"><caption className="sr-only">Final rankings</caption>
            <thead className="text-xs uppercase tracking-wider text-ivory/60"><tr><th className="py-1.5 pr-2">Rank</th><th className="pr-2">Player</th><th className="pr-2">Step</th><th className="pr-2"><span aria-hidden>✓</span><span className="sr-only">Correct</span></th><th className="pr-2"><span aria-hidden>✕</span><span className="sr-only">Wrong</span></th><th><span aria-hidden>⏱</span><span className="sr-only">Unanswered</span></th></tr></thead>
            <tbody>{f.standings.map((s) => <tr key={s.id} className={`border-t border-line ${s.id === youId ? 'bg-amber/10 font-semibold' : ''}`}><td className="py-1.5 pr-2 tabular-nums">{s.rank}{s.isWinner ? ' ★' : ''}</td><td className="max-w-40 truncate pr-2">{s.nickname}{s.id === youId ? ' (you)' : ''}</td><td className="pr-2 tabular-nums">{s.position}</td><td className="pr-2 tabular-nums">{s.correct}</td><td className="pr-2 tabular-nums">{s.wrong}</td><td className="tabular-nums">{s.unanswered}</td></tr>)}</tbody></table>
          <p className="mt-2 text-xs text-ivory/65">Ranking: equal steps share a rank (1, 1, 3). Ties are never broken by speed or name. ★ marks the winners. {f.validRounds} valid round{f.validRounds === 1 ? '' : 's'} played; summit at step {f.summitHeight}.</p></section>
        <div className="grid content-start gap-5">
          {d.mine && <section className="card" aria-labelledby="me-h"><h2 id="me-h" className="mb-2 text-xl">Your progress</h2><p className="text-sm text-ivory/85">Final step <strong>{d.mine.position}</strong> · rank <strong>{d.mine.rank}</strong> · {d.mine.correct} correct, {d.mine.wrong} wrong, {d.mine.unanswered} unanswered.</p></section>}
          <section className="card" aria-labelledby="bd-h"><h2 id="bd-h" className="mb-2 text-xl">By topic</h2>
            {d.breakdown.length ? <ul className="grid gap-1.5 text-sm">{d.breakdown.map((b) => <li key={b.category} className="flex justify-between gap-3"><span>{b.category}</span><span className="tabular-nums">{b.correct}/{b.total} correct</span></li>)}</ul> : <p className="text-sm text-ivory/70">No rounds were completed.</p>}
            <p className="mt-2 text-xs text-ivory/65">{d.breakdown.reduce((s, b) => s + b.total, 0) < 10 ? 'Small sample: a handful of questions can’t show real strengths or gaps. Treat this as a snapshot, not a verdict.' : 'This is a snapshot of one game, not a verdict on your knowledge.'}</p></section>
        </div>
      </div>

      {d.review.length > 0 && <section aria-labelledby="rv-h" className="grid gap-2"><h2 id="rv-h" className="text-2xl">Review your answers</h2>
        <ol className="grid gap-2">{d.review.map((r) => (
          <li key={r.roundNo}><details className="card !p-3"><summary className="flex cursor-pointer items-start gap-2"><span aria-hidden className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${r.outcome === 'correct' ? 'bg-success text-ink' : 'bg-danger text-ink'}`}>{r.outcome === 'correct' ? '✓' : r.outcome === 'wrong' ? '✕' : '⏱'}</span><span><span className="sr-only">{r.outcome === 'correct' ? 'Correct. ' : r.outcome === 'wrong' ? 'Wrong. ' : 'Unanswered. '}</span><span className="font-semibold">{r.roundNo}. {r.text}</span></span></summary>
            <div className="mt-2 grid gap-1 pl-8 text-sm"><p>Correct: <strong>{r.options.find((o) => o.id === r.correctOptionId)?.text}</strong></p>{r.chosen && r.chosen !== r.correctOptionId && <p>You chose: {r.options.find((o) => o.id === r.chosen)?.text}</p>}{!r.chosen && <p>You didn’t answer in time.</p>}<p className="text-ivory/85">{r.explanation}</p>{r.reference && <p className="text-ivory/65">Reference: {r.reference}</p>}</div></details></li>))}</ol></section>}
      {!d.review.length && !d.canControl && <EmptyState title="No answers to review" />}
    </div>
  );
}
