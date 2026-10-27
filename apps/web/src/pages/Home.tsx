import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brand } from '@elimquest/config';
import { isValidRoomCode, normaliseRoomCode } from '@elimquest/game-core';
import type { RoomPreview } from '@elimquest/contracts';
import { api, errMsg } from '../lib/api';
import { useAdventurer } from '../lib/adventurer';
import { deviceId, practiceCred, quickRules, recentCredentials, roomCred } from '../lib/storage';
import { CategoryArt } from '../components/art';
import { HallHero } from '../components/HallHero';
import { Alert, Button, Divider, LinkButton, SectionTitle, Spinner } from '../components/ui';
import { RULE_TEXT, RuleToggle } from '../components/Tiles';

interface Topic { id: string; slug: string; name: string; description: string; questionCount: number }

/** Room-code entry. Shared with /join (no code). */
export function JoinPanel({ compact = false }: { compact?: boolean }) {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = normaliseRoomCode(code);
    if (!isValidRoomCode(c)) { setErr('Room codes are 6 digits, like 482 916.'); return; }
    nav(`/join/${c}`);
  };
  return (
    <form onSubmit={submit} noValidate aria-label="Join a game" className={`grid gap-2.5 ${compact ? '' : 'rounded-2xl bg-ivory p-5 text-ink'}`}>
      <label htmlFor="room-code" className="text-sm font-semibold">Room code</label>
      <div className="flex gap-2">
        <input id="room-code" inputMode="numeric" autoComplete="off" pattern="[0-9 ]*" maxLength={7} value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} placeholder="e.g. 482 916"
          aria-invalid={err ? true : undefined} aria-describedby={err ? 'code-err' : undefined}
          className="min-h-12 w-full min-w-0 rounded-xl border border-ink/25 bg-white px-4 text-lg tracking-widest text-ink placeholder:tracking-normal placeholder:text-ink/55" />
        <button type="submit" className="btn min-h-12 shrink-0 bg-teal px-5 text-ivory hover:bg-[#0a6a80]">Join <span aria-hidden>→</span></button>
      </div>
      {err && <p id="code-err" role="alert" className="text-sm font-medium text-[#a8322b]">{err}</p>}
    </form>
  );
}

/** "Rejoin your game" — only for a recent room/practice this browser really belongs to, and only while still open. */
function ResumeBanner() {
  const nav = useNavigate();
  const [item, setItem] = useState<{ label: string; to: string } | null>(null);
  useEffect(() => {
    let dead = false;
    void (async () => {
      for (const c of recentCredentials().slice(0, 3)) {
        try {
          if (c.kind === 'room') {
            const cred = roomCred.get(c.key);
            const r = await api<RoomPreview>('GET', `/api/rooms/${c.key}`, undefined, { auth: false });
            if (cred && !['finished', 'cancelled', 'expired'].includes(r.phase)) { if (!dead) setItem({ label: `You’re in “${r.title}”`, to: `/rooms/${c.key}/${r.phase === 'lobby' ? 'lobby' : 'play'}` }); return; }
          } else {
            const tok = practiceCred.get(c.key)?.token;
            const s = await api<{ status: string; roundNo: number; settings: { questionLimit: number } }>('GET', `/api/practice/${c.key}`, undefined, { guest: tok, auth: false });
            if (s.status === 'active') { if (!dead) setItem({ label: `Your solo climb is at question ${s.roundNo + 1} of ${s.settings.questionLimit}`, to: `/practice/${c.key}/play` }); return; }
          }
        } catch { /* stale credential: ignore */ }
      }
    })();
    return () => { dead = true; };
  }, []);
  if (!item) return null;
  return (
    <div className="container-page pt-3"><div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber/60 bg-amber/10 px-4 py-2.5 text-sm">
      <span><strong>Pick up where you left off.</strong> {item.label}.</span>
      <Button className="!min-h-10 text-sm" onClick={() => nav(item.to)}>Rejoin</Button>
    </div></div>
  );
}

export function useQuickClimb() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const topics = useQuery({ queryKey: ['topics'], queryFn: () => api<{ topics: Topic[] }>('GET', '/api/topics', undefined, { auth: false }) });
  const m = useMutation({
    mutationFn: async (o: { topicIds?: string[]; superQuestion: boolean; gentle: boolean }) => {
      const ids = o.topicIds ?? topics.data?.topics.map((t) => t.id) ?? [];
      return api<{ id: string; token: string }>('POST', '/api/practice', { categoryIds: ids, minLevel: 1, maxLevel: 10, questionLimit: 10, summitHeight: 5, timeLimitS: 30, superQuestion: o.superQuestion, gentle: o.gentle }, { headers: { 'x-device-id': deviceId() } });
    },
    onSuccess: (r) => { practiceCred.set(r.id, { token: r.token }); nav(`/practice/${r.id}/play`); },
    // A stale tab can hold topic ids from before a server restart: refresh them so the next tap works.
    onError: () => { void qc.invalidateQueries({ queryKey: ['topics'] }); },
  });
  return { topics, start: m.mutate, starting: m.isPending, error: m.isError ? errMsg(m.error) : null };
}

export default function Home() {
  const adv = useAdventurer();
  const [rules, setRules] = useState(quickRules.get());
  const quick = useQuickClimb();
  const topics = quick.topics.data?.topics ?? [];
  const setRule = (k: 'superQuestion' | 'gentle', v: boolean) => { const n = { ...rules, [k]: v }; setRules(n); quickRules.set(n); };
  return (
    <>
      <ResumeBanner />
      <section className="container-page grid items-center gap-5 py-5 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:py-6" aria-labelledby="hero-title">
        <div className="order-2 grid gap-4 lg:order-1">
          <div>
            <p className="eyebrow mb-2">{brand.hero.eyebrow}</p>
            <h1 id="hero-title" className="text-4xl font-semibold leading-[1.02] sm:text-5xl xl:text-6xl">{brand.hero.line1}<br /><span className="text-amber">{brand.hero.line2}</span></h1>
            <p className="mt-2 max-w-md text-base text-ivory/90">{brand.description}</p>
          </div>

          <div aria-labelledby="start-h" role="group" className="grid gap-3">
            <h2 id="start-h" className="sr-only">Choose how to play</h2>
            <article className="relative rounded-2xl border-2 border-amber bg-ink-soft p-4 shadow-xl shadow-black/30" aria-labelledby="quick-h">
              <span className="absolute -top-3 left-4 rounded-full bg-amber px-3 py-0.5 text-xs font-bold text-ink">Start here</span>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0"><h3 id="quick-h" className="text-xl">Quick climb</h3><p className="text-sm text-ivory/80">Solo, 10 questions, no sign-up. Reach step 5 to win.</p></div>
                <Button className="min-h-12 shrink-0" loading={quick.starting} disabled={!topics.length} onClick={() => quick.start({ ...rules })}>Start climbing <span aria-hidden>→</span></Button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <RuleToggle {...RULE_TEXT.superQuestion} on={rules.superQuestion} onChange={(v) => setRule('superQuestion', v)} />
                <RuleToggle {...RULE_TEXT.gentle} on={rules.gentle} onChange={(v) => setRule('gentle', v)} />
              </div>
              <Link to="/practice" className="mt-1 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Choose topics &amp; length</Link>
              {quick.error && <div className="mt-1"><Alert tone="error">{quick.error}</Alert></div>}
            </article>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border border-line bg-ink-soft p-4" aria-labelledby="join-h">
                <h3 id="join-h" className="mb-2 text-xl">Join friends</h3>
                <div className="rounded-xl bg-ivory p-3 text-ink"><JoinPanel compact /></div>
              </article>
              <article className="flex flex-col rounded-2xl border border-line bg-ink-soft p-4" aria-labelledby="host-h">
                <h3 id="host-h" className="text-xl">Host a game</h3>
                <p className="mb-2 text-sm text-ivory/80">Four quick steps, then share a link.</p>
                <LinkButton to="/games/new" className="min-h-12 w-full">Host a game <span aria-hidden>→</span></LinkButton>
                <div className="mt-2 flex flex-wrap gap-1.5">{[['family', 'Family night'], ['class', 'Class quiz'], ['event', 'Community event']].map(([t, l]) => <Link key={t} to={`/games/new?template=${t}`} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white/5 px-2.5 text-xs font-semibold hover:bg-white/10">{l}</Link>)}</div>
              </article>
            </div>
          </div>
          <p className="text-sm text-ivory/75">That’s <strong className="text-ivory">{adv.nickname || 'your adventurer'}</strong> on the stairs. <button type="button" onClick={adv.openEditor} className="inline-flex min-h-11 items-center font-semibold text-amber underline underline-offset-4">Change your look</button></p>
        </div>
        <div className="order-1 lg:order-2"><HallHero avatar={adv.avatar} className="h-[12rem] rounded-3xl border border-line sm:h-[20rem] lg:h-[34rem]" /></div>
      </section>

      <section className="container-page mt-12" aria-labelledby="paths-title">
        <SectionTitle eyebrow="Pick a path" sub="Tap a topic to start a quick climb in it right away.">Choose your path of knowledge</SectionTitle>
        <h2 id="paths-title" className="sr-only">Topics</h2>
        {quick.topics.isPending ? <p className="flex justify-center text-ivory/70"><Spinner label="Loading topics…" /></p> : (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {topics.slice(0, 7).map((t) => (
              <li key={t.id} className="group relative overflow-hidden rounded-2xl border border-line">
                <button type="button" onClick={() => quick.start({ topicIds: [t.id], ...rules })} disabled={quick.starting} className="relative flex aspect-[4/3] w-full items-end text-left">
                  <CategoryArt slug={t.slug} className="absolute inset-0 size-full transition duration-500 group-hover:scale-105" />
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent" aria-hidden />
                  <span className="relative p-3.5"><span className="block font-display text-lg sm:text-xl">{t.name}</span><span className="block text-xs text-ivory/80">{t.questionCount} questions · tap to play</span></span>
                </button>
                <Link to={`/games/new?topic=${t.slug}`} className="absolute right-2 top-2 inline-flex min-h-11 items-center rounded-lg bg-ink/75 px-2.5 text-xs font-semibold backdrop-blur-sm hover:bg-ink">Host</Link>
              </li>
            ))}
          </ul>
        )}
        {!quick.topics.isPending && !topics.length && <p className="mt-3 text-center text-sm text-ivory/70">Topics will appear here once the server is reachable.</p>}
      </section>

      <section className="container-page mt-14" aria-labelledby="how-title">
        <SectionTitle eyebrow="How it works" sub="Your first quick climb walks you through it step by step.">Three steps to the summit</SectionTitle>
        <h2 id="how-title" className="sr-only">How it works</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {[['1', 'Pick an answer', 'Everyone gets the same question and the same timer. Tap an answer, then press Submit.'], ['2', 'Climb', 'Right answers go up a step; wrong or missed ones step down (unless Gentle mode is on).'], ['3', 'Reach the summit', 'The first to the top wins — ties are shared. Watch for the super question: it’s worth two steps.']].map(([n, t, d]) => (
            <li key={n} className="card !p-4"><span className="mb-2 flex size-8 items-center justify-center rounded-full bg-amber font-bold text-ink" aria-hidden>{n}</span><h3 className="text-lg">{t}</h3><p className="mt-1 text-sm text-ivory/80">{d}</p></li>
          ))}
        </ol>
        <Divider />
      </section>
    </>
  );
}
