import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DEFAULT_AVATAR, describeLevels, feedbackMessage, optionOrder, sanitizeAvatar } from '@elimquest/game-core';
import type { PlayerPublic } from '@elimquest/contracts';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAdventurer } from '../lib/adventurer';
import { deviceId, practiceCred, quickRules, tutorial } from '../lib/storage';
import { playSfx } from '../lib/sound';
import { Staircase } from '../components/Staircase';
import { QuestionHeader } from '../components/Countdown';
import { CoachTip, JourneyStrip } from '../components/Journey';
import { NextSteps, RecapShare, type NextCard } from '../components/NextSteps';
import { StickerIcon } from '../components/Stickers';
import { DifficultyPicker, RULE_TEXT, RuleToggle, TileGrid, TileMulti, TimePicker } from '../components/Tiles';
import { StepBar, StepNav } from '../components/Stepper';
import { Alert, Button, ErrorState, LinkButton, LiveRegion, PageLoading } from '../components/ui';

interface Topic { id: string; slug: string; name: string; questionCount: number; levels: { level: number; count: number }[] }
interface QView { roundNo: number; text: string; options: { id: string; text: string }[]; shuffleSalt: string; openedAt: number; deadline: number; level?: number; categoryName?: string; isSuper?: boolean }
interface Settings { questionLimit: number; summitHeight: number; timeLimitS: number; mode: string; superQuestion?: boolean; gentle?: boolean; categoryIds?: string[]; minLevel?: number; maxLevel?: number }
interface State { id: string; status: 'active' | 'finished'; position: number; roundNo: number; settings: Settings; question: QView | null; succeeded: boolean | null; serverTime: number; history?: any[] }
interface Answer { outcome: 'correct' | 'wrong' | 'unanswered'; from: number; to: number; title: string; detail: string; correctOptionId: string; correctText: string; explanation: string; reference: string; finished: boolean; succeeded: boolean | null; roundNo: number; superRound?: boolean; gentle?: boolean }

const LETTERS = ['A', 'B', 'C', 'D'];
const JOURNEY = ['Set up', 'Climb', 'Results'];

function startPractice(body: Record<string, unknown>) {
  return api<{ id: string; token: string }>('POST', '/api/practice', body, { headers: { 'x-device-id': deviceId() } });
}

function Setup() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const topics = useQuery({ queryKey: ['topics'], queryFn: () => api<{ topics: Topic[] }>('GET', '/api/topics', undefined, { auth: false }) });
  const [sel, setSel] = useState<string[] | null>(null);
  const [lv, setLv] = useState<[number, number]>([1, 10]);
  const [limit, setLimit] = useState(10); const [summit, setSummit] = useState(5); const [time, setTime] = useState(30);
  const [rules, setRules] = useState(quickRules.get());
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const go = (i: number) => { setStep(i); setReached((r) => Math.max(r, i)); };
  const ids = sel ?? (() => { const t = topics.data?.topics.find((x) => x.slug === sp.get('topic')); return t ? [t.id] : topics.data?.topics.map((x) => x.id) ?? []; })();
  const sum = Math.min(summit, limit);
  const start = useMutation({
    mutationFn: () => startPractice({ categoryIds: ids, minLevel: lv[0], maxLevel: lv[1], questionLimit: limit, summitHeight: sum, timeLimitS: time, ...rules }),
    onSuccess: (r) => { practiceCred.set(r.id, { token: r.token }); nav(`/practice/${r.id}/play`); },
  });
  const setRule = (k: 'superQuestion' | 'gentle', v: boolean) => { const n = { ...rules, [k]: v }; setRules(n); quickRules.set(n); };
  if (topics.isPending) return <PageLoading />;
  if (topics.isError) return <ErrorState error={topics.error} onRetry={() => topics.refetch()} />;
  return (
    <>
      <JourneyStrip current={0} steps={JOURNEY} />
      <div className="container-page grid max-w-4xl gap-3 py-4 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="eyebrow mb-0.5">Solo</p><h1 className="text-2xl sm:text-3xl">Climb at your own pace</h1></div>
          <p className="flex items-center gap-2 text-sm text-ivory/70">Same staircase and rules as a live game. No account needed.</p></div>
        <StepBar steps={['Topics', 'Length', 'Rules & go']} current={step} reached={reached} onGo={go} />
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (step === 2) start.mutate(); }} noValidate>
          <div className="card grid gap-4 !p-4 sm:!p-5">
            {step === 0 && <>
              <TileMulti legend="Topics" values={ids} onChange={setSel} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" options={topics.data.topics.map((t) => ({ value: t.id, label: t.name, sub: `${t.questionCount} questions` }))} hint={ids.length ? `${ids.length} selected` : 'Pick at least one.'} />
              <DifficultyPicker min={lv[0]} max={lv[1]} onChange={(a, b) => setLv([a, b])} counts={(lo, hi) => { const t = topics.data.topics.filter((x) => ids.includes(x.id)); return t.length ? t.reduce((n, x) => n + x.levels.filter((l) => l.level >= lo && l.level <= hi).reduce((y, l) => y + l.count, 0), 0) : null; }} />
            </>}
            {step === 1 && <>
              <TileGrid legend="Questions" value={limit} onChange={(v) => { setLimit(v); setSummit(Math.min(summit, v)); }} cols="grid-cols-5" options={[5, 10, 15, 20, 30].map((n) => ({ value: n, label: n }))} />
              <TimePicker value={time} onChange={setTime} />
              <TileGrid legend="Steps to the summit" value={sum} onChange={setSummit} cols="grid-cols-7 sm:grid-cols-9 lg:grid-cols-14" hint="Reach this step within the question limit to succeed." options={Array.from({ length: limit - 2 }, (_, i) => i + 3).map((n) => ({ value: n, label: n }))} />
            </>}
            {step === 2 && <>
              <h2 className="text-lg">House rules <span className="text-sm font-normal text-ivory/60">(optional)</span></h2>
              <div className="grid gap-2 md:grid-cols-2">
                <RuleToggle {...RULE_TEXT.superQuestion} on={rules.superQuestion} onChange={(v) => setRule('superQuestion', v)} />
                <RuleToggle {...RULE_TEXT.gentle} on={rules.gentle} onChange={(v) => setRule('gentle', v)} />
              </div>
              <p className="rounded-xl bg-ink p-3 text-sm text-ivory/85">{limit} questions · {time}s each · summit step {sum} · {ids.length} topic{ids.length === 1 ? '' : 's'} · {describeLevels(lv[0], lv[1]).toLowerCase()}</p>
              {start.isError && <Alert tone="error">{errMsg(start.error)}</Alert>}
            </>}
          </div>
          <StepNav current={step} last={2} onBack={() => go(Math.max(0, step - 1))} onNext={() => go(step + 1)} canNext={step === 0 ? ids.length > 0 : true}
            final={<Button type="submit" className="min-h-12" loading={start.isPending} disabled={!ids.length}>Start climbing <span aria-hidden>→</span></Button>} />
        </form>
      </div>
    </>
  );
}

function Play({ id }: { id: string }) {
  const nav = useNavigate();
  const token = practiceCred.get(id)?.token;
  const adv = useAdventurer();
  const [state, setState] = useState<State | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [moveSeq, setMoveSeq] = useState(0);
  const [offset, setOffset] = useState(0);
  const avatar = useMemo(() => sanitizeAvatar(adv.avatar ?? DEFAULT_AVATAR), [adv.avatar]);
  const load = useCallback(async () => {
    try {
      let s = await api<State>('GET', `/api/practice/${id}`, undefined, { guest: token });
      setOffset(s.serverTime - Date.now());
      if (s.status === 'active' && !s.question) s = await api<State>('POST', `/api/practice/${id}/next`, undefined, { guest: token });
      setState(s); setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  }, [id, token]);
  useEffect(() => { void load(); }, [load]);

  const send = useCallback(async (optionId: string | null) => {
    if (busy) return; setBusy(true);
    try {
      const r = await api<Answer>('POST', `/api/practice/${id}/answer`, { optionId }, { guest: token });
      setAnswer(r); setMoveSeq((n) => n + 1); playSfx(r.outcome === 'correct' ? 'up' : 'down');
      setState((s) => (s ? { ...s, position: r.to, roundNo: r.roundNo, question: null, status: r.finished ? 'finished' : 'active', succeeded: r.succeeded } : s));
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }, [id, token, busy]);

  // Auto-submit "no answer" at the deadline.
  const q = state?.question;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!q || answer) return;
    const ms = q.deadline - (Date.now() + offset);
    timer.current = setTimeout(() => void send(null), Math.max(0, ms) + 150);
    return () => clearTimeout(timer.current);
  }, [q, offset, answer, send]);

  const opts = useMemo(() => (q ? optionOrder(q.options, 'solo', q.shuffleSalt) : []), [q]);
  if (!token) return <div className="container-page max-w-xl py-10"><Alert tone="warn" title="This practice session isn’t on this device">Start a new one.</Alert><div className="mt-4"><LinkButton to="/practice">New practice</LinkButton></div></div>;
  if (err && !state) return <ErrorState error={new Error(err)} onRetry={() => void load()} />;
  if (!state) return <PageLoading />;
  const you: PlayerPublic[] = [{ id: 'you', nickname: adv.nickname || 'You', avatar, position: state.position, connected: true }];
  const s = state.settings;
  const stage = answer ? 'result' : q ? (sel ? 'submit' : 'pick') : null;
  if (answer && !tutorial.done() && answer.finished) tutorial.finish();

  return (
    <>
      <JourneyStrip current={1} steps={JOURNEY} />
      <div className="container-page grid gap-3 py-2 lg:grid-cols-[1.15fr_1fr] lg:gap-5 lg:py-4">
        <section aria-label="Staircase" className="grid content-start gap-2 lg:sticky lg:top-4 lg:self-start">
          <Staircase players={you} youId="you" summit={s.summitHeight} moveSeq={moveSeq} className={`${q ? 'h-[28svh] min-h-[190px] max-h-[320px]' : 'h-[42svh] min-h-[240px] max-h-[420px]'} lg:h-[min(68svh,620px)]`} celebrate={state.succeeded ? ['you'] : undefined} />
          <dl className="flex items-center gap-4 rounded-2xl border border-line bg-ink-soft/90 px-3.5 py-1.5">
            <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-ivory/70">Your step</dt><dd className="font-display text-2xl font-semibold leading-none tabular-nums">{state.position}<span className="text-sm font-normal text-ivory/60"> / {s.summitHeight}</span></dd></div>
            <span className="h-8 w-px bg-line" aria-hidden />
            <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-teal-bright">Question</dt><dd className="font-display text-2xl font-semibold leading-none tabular-nums text-amber">{Math.min(state.roundNo + (q ? 1 : 0), s.questionLimit)}<span className="text-sm font-normal text-ivory/60"> / {s.questionLimit}</span></dd></div>
            <ul className="ml-auto flex flex-wrap justify-end gap-1.5 text-[11px] font-semibold" aria-label="House rules">{s.mode === 'mistakes' && <li className="rounded-full bg-white/10 px-2 py-0.5">Mistakes</li>}{s.superQuestion && <li className="rounded-full bg-amber/20 px-2 py-0.5 text-amber">Super</li>}{s.gentle && <li className="rounded-full bg-teal-bright/20 px-2 py-0.5 text-teal-bright">Gentle</li>}</ul>
          </dl>
          {s.mode === 'mistakes' && <p className="text-xs text-ivory/70">Mistake practice deliberately repeats questions you missed. It’s the one exception to “fresh questions”.</p>}
        </section>
        <section aria-label="Question" className="card grid content-start gap-3 !p-4 sm:!p-5">
          <LiveRegion message={answer ? `${answer.title} ${answer.detail}` : q ? `Question ${q.roundNo}` : ''} />
          <CoachTip stage={stage} summit={s.summitHeight} />
          {err && <Alert tone="error">{err}</Alert>}
          {q && !answer && (<>
            <QuestionHeader roundNo={q.roundNo} total={s.questionLimit} openedAt={q.openedAt} deadline={q.deadline} offset={offset} level={q.level} category={q.categoryName} />
            {q.isSuper && <div role="status" className="flex items-center gap-2.5 rounded-xl border-2 border-amber bg-amber/15 px-3 py-2 text-sm font-semibold anim-rise"><StickerIcon kind="star" size={26} /><span><span className="block text-base text-amber">Super question!</span>Answer correctly to climb <strong>two steps</strong>. A miss costs the usual one.</span></div>}
            <h2 className="text-lg leading-snug sm:text-2xl" id="pq">{q.text}</h2>
            <fieldset className="grid gap-2" aria-labelledby="pq"><legend className="sr-only">Choose one answer</legend>
              {opts.map((o, i) => { const on = sel === o.id; return <label key={o.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-amber ${on ? 'border-teal-bright bg-teal/40 ring-2 ring-teal-bright' : 'border-line bg-ink-soft hover:bg-ink-raised'}`}><input type="radio" name="a" className="sr-only" checked={on} onChange={() => setSel(o.id)} /><span aria-hidden className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${on ? 'border-teal-bright bg-teal-bright text-ink' : 'border-line'}`}>{on ? '✓' : LETTERS[i]}</span><span className="break-words">{o.text}</span></label>; })}
            </fieldset>
            <Button className="min-h-12" loading={busy} disabled={!sel} onClick={() => void send(sel)}>Submit answer</Button>
          </>)}
          {answer && (() => { const fb = feedbackMessage(answer, { gentle: !!answer.gentle, superRound: !!answer.superRound }); const good = answer.outcome === 'correct'; return (
            <div className="grid gap-3 anim-rise">
              <div className={`rounded-2xl border p-4 ${good ? 'border-success/70 bg-success/15' : 'border-danger/60 bg-danger/10'}`} role="status"><p className="font-display text-2xl"><span aria-hidden className="mr-2 text-xl">{good ? '▲ ✓' : answer.outcome === 'wrong' ? '▼ ✕' : '▼ ⏱'}</span>{fb.title}{answer.superRound && good && <span className="ml-2 align-middle"><StickerIcon kind="star" size={22} /></span>}</p><p>{fb.detail}</p></div>
              <div className="rounded-xl bg-white/5 p-3"><p className="text-xs uppercase tracking-wider text-ivory/60">Correct answer</p><p className="text-lg font-semibold">{answer.correctText}</p></div>
              <p className="text-ivory/90">{answer.explanation}</p>
              {answer.reference && <details className="text-sm"><summary className="cursor-pointer font-semibold">Source / reference</summary><p className="mt-1">{answer.reference}</p></details>}
              {answer.finished ? <Button onClick={() => nav(`/practice/${id}/results`)}>See results</Button> : <Button onClick={() => { setAnswer(null); setSel(null); void load(); }}>Next question</Button>}
            </div>); })()}
          {!q && !answer && <PageLoading />}
        </section>
      </div>
    </>
  );
}

function PracticeResults({ id }: { id: string }) {
  const token = practiceCred.get(id)?.token;
  const { user } = useAuth();
  const adv = useAdventurer();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['practice', id], queryFn: () => api<State>('GET', `/api/practice/${id}`, undefined, { guest: token }) });
  const save = useMutation({ mutationFn: () => api('POST', `/api/practice/${id}/save`, undefined, { guest: token }) });
  const again = useMutation({
    mutationFn: (o: { minLevel?: number; maxLevel?: number }) => { const s = q.data!.settings; return startPractice({ categoryIds: s.categoryIds ?? [], minLevel: o.minLevel ?? s.minLevel ?? 1, maxLevel: o.maxLevel ?? s.maxLevel ?? 10, questionLimit: s.questionLimit, summitHeight: s.summitHeight, timeLimitS: s.timeLimitS, superQuestion: !!s.superQuestion, gentle: !!s.gentle }); },
    onSuccess: (r) => { practiceCred.set(r.id, { token: r.token }); nav(`/practice/${r.id}/play`); },
  });
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const s = q.data; const h = s.history ?? [];
  const right = h.filter((r) => r.outcome === 'correct').length;
  const pct = h.length ? Math.round((right / h.length) * 100) : 0;
  const lo = s.settings.minLevel ?? 1, hi = s.settings.maxLevel ?? 10;
  const cards: NextCard[] = [
    { key: 'again', title: 'Climb again', text: 'A fresh set of questions with the same settings.', action: <Button className="!min-h-11 text-sm" loading={again.isPending} disabled={!s.settings.categoryIds?.length} onClick={() => again.mutate({})}>Quick climb</Button> },
  ];
  // Only suggest stepping up when there is real evidence (enough questions and a strong result).
  if (h.length >= 5 && pct >= 70 && hi < 10) cards.push({ key: 'harder', title: 'Ready for harder ones?', text: `You got ${pct}% right. Try ${describeLevels(Math.min(10, lo + 2), Math.min(10, hi + 3)).toLowerCase()} questions.`, action: <Button variant="ghost" className="!min-h-11 text-sm" loading={again.isPending} onClick={() => again.mutate({ minLevel: Math.min(10, lo + 2), maxLevel: Math.min(10, hi + 3) })}>Step it up</Button> });
  cards.push({ key: 'host', title: 'Play with friends', text: 'Host your own game in one screen and invite people with a link or QR code.', action: <LinkButton variant="ghost" to="/games/new?template=family" className="!min-h-11 text-sm">Host a game</LinkButton> });
  cards.push({ key: 'topics', title: 'Try other topics', text: 'Change topics, length or house rules.', action: <LinkButton variant="ghost" to="/practice" className="!min-h-11 text-sm">Choose topics</LinkButton> });
  const recap = { title: 'Quick climb', heading: s.succeeded ? 'Summit reached!' : `Step ${s.position}`, lines: [`${right} of ${h.length} correct`, `Summit at step ${s.settings.summitHeight}`, s.settings.superQuestion ? 'Super question on' : '', s.settings.gentle ? 'Gentle mode' : ''].filter(Boolean), avatar: adv.avatar, nickname: adv.nickname || 'Adventurer', footer: 'Play on ElimQuest' };
  return (
    <>
      <JourneyStrip current={2} steps={JOURNEY} />
      <div className="container-page grid max-w-4xl gap-5 py-4 pb-8">
        <section className="card text-center"><p className="eyebrow mb-1">Climb complete</p><h1 className="text-3xl">{s.succeeded ? 'You reached the summit!' : 'Good climb — the summit is still waiting'}</h1><p className="mt-1 text-ivory/80">Final step {s.position} of {s.settings.summitHeight} in {s.roundNo} question{s.roundNo === 1 ? '' : 's'}. {right} correct. This is practice: no ranking, no winners.</p>
          <div className="mt-4 flex justify-center"><RecapShare data={recap} shareText={`I got ${right}/${h.length} on a ElimQuest quick climb${s.succeeded ? ' and reached the summit' : ''}!`} shareUrl={location.origin + import.meta.env.BASE_URL} /></div></section>
        <NextSteps cards={cards} />
        {again.isError && <Alert tone="error">{errMsg(again.error)}</Alert>}
        {user && !save.isSuccess && <div><Button variant="ghost" loading={save.isPending} onClick={() => save.mutate()}>Save to my history</Button></div>}
        {!user && <Alert tone="info">Want to keep your history? <Link className="inline-flex min-h-11 items-center underline" to="/sign-up" state={{ from: `/practice/${id}/results` }}>Create a free account</Link>.</Alert>}
        {save.isSuccess && <Alert tone="success">Saved to your history.</Alert>}
        <ol className="grid gap-2" aria-label="Review">{h.map((r) => <li key={r.roundNo}><details className="card !p-3"><summary className="cursor-pointer"><span aria-hidden className="mr-2">{r.outcome === 'correct' ? '✓' : r.outcome === 'wrong' ? '✕' : '⏱'}</span><span className="sr-only">{r.outcome}. </span><span className="font-semibold">{r.roundNo}. {r.text}</span>{r.isSuper && <span className="ml-2 rounded bg-amber/20 px-1.5 text-xs font-semibold text-amber">super</span>}</summary><div className="mt-2 grid gap-1 pl-6 text-sm"><p>Correct: <strong>{r.options.find((o: any) => o.id === r.correctOptionId)?.text}</strong></p>{r.chosen && r.chosen !== r.correctOptionId && <p>You chose: {r.options.find((o: any) => o.id === r.chosen)?.text}</p>}<p className="text-ivory/85">{r.explanation}</p></div></details></li>)}</ol>
      </div>
    </>
  );
}

export default function Practice() {
  const { id } = useParams();
  const { pathname } = useLocation();
  if (!id) return <Setup />;
  return pathname.endsWith('/results') ? <PracticeResults id={id} /> : <Play id={id} />;
}
