import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { checkNickname, defaultSummit, rulesSummary } from '@elimquest/game-core';
import { api, ApiError, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAdventurer } from '../lib/adventurer';
import { deviceId, roomCred, store } from '../lib/storage';
import { Alert, Button, ErrorState, Input, LinkButton, PageLoading } from '../components/ui';
import { LevelRange, RULE_TEXT, RuleToggle, TileGrid, TileMulti, TimePicker } from '../components/Tiles';

interface Topic { id: string; slug: string; name: string; questionCount: number }
interface Form {
  title: string; hostMode: 'competing' | 'audience'; source: 'system' | 'pack'; packId: string; categoryIds: string[]; minLevel: number; maxLevel: number;
  questionLimit: number; summitHeight: number; timeLimitS: number; maxPlayers: number; when: 'now' | 'later'; local: string; timezone: string;
  allowHistoryReuse: boolean; topicVoting: boolean; superQuestion: boolean; gentle: boolean;
}
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const blank = (): Form => ({ title: '', hostMode: 'competing', source: 'system', packId: '', categoryIds: [], minLevel: 1, maxLevel: 10, questionLimit: 20, summitHeight: 10, timeLimitS: 30, maxPlayers: 150, when: 'now', local: '', timezone: tz(), allowHistoryReuse: false, topicVoting: false, superQuestion: false, gentle: false });

/** Templates fill the form with sensible choices; everything stays editable. */
const TEMPLATES: Record<string, { label: string; blurb: string; patch: Partial<Form> }> = {
  family: { label: 'Family night', blurb: 'Play together, relaxed pace, nobody drops down.', patch: { title: 'Family night', hostMode: 'competing', minLevel: 1, maxLevel: 5, questionLimit: 10, summitHeight: 5, timeLimitS: 45, maxPlayers: 20, gentle: true, superQuestion: true } },
  class: { label: 'Class quiz', blurb: 'You run it for the group and stay in control.', patch: { title: 'Class quiz', hostMode: 'audience', minLevel: 1, maxLevel: 6, questionLimit: 20, summitHeight: 10, timeLimitS: 30, maxPlayers: 60, gentle: false, superQuestion: false } },
  event: { label: 'Community event', blurb: 'A bigger gathering with a super question.', patch: { title: 'Community event', hostMode: 'audience', minLevel: 1, maxLevel: 8, questionLimit: 30, summitHeight: 15, timeLimitS: 30, maxPlayers: 150, superQuestion: true, gentle: false } },
};
const DRAFT_KEY = 'eq:hostform';
/** An account name may contain words the nickname filter reserves (e.g. "Host"); never let that block hosting. */
const safeNick = (n: string) => { const c = checkNickname(n); return c.ok ? c.nickname : 'Adventurer'; };
const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function Section({ n, title, children, hint }: { n: number; title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="card grid gap-4" aria-labelledby={`sec-${n}`}>
      <div><h2 id={`sec-${n}`} className="flex items-center gap-2 text-xl"><span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-amber text-sm font-bold text-ink">{n}</span>{title}</h2>{hint && <p className="mt-1 text-sm text-ivory/75">{hint}</p>}</div>
      {children}
    </section>
  );
}

export default function GameWizard() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const adv = useAdventurer();
  const [form, setForm] = useState<Form>(() => { try { const s = sessionStorage.getItem(DRAFT_KEY); return !id && s ? { ...blank(), ...JSON.parse(s) } : blank(); } catch { return blank(); } });
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  const topics = useQuery({ queryKey: ['topics'], queryFn: () => api<{ topics: Topic[] }>('GET', '/api/topics', undefined, { auth: false }) });
  const packs = useQuery({ queryKey: ['packs'], enabled: !!user, queryFn: () => api<{ packs: { id: string; title: string; questionCount: number }[] }>('GET', '/api/packs') });
  const cfg = useQuery({ queryKey: ['config'], queryFn: () => api<{ maxPlayersPerRoom: number }>('GET', '/api/config', undefined, { auth: false }) });
  const existing = useQuery({ queryKey: ['game', id], enabled: !!id && !!user, queryFn: () => api<any>('GET', `/api/games/${id}`) });
  const maxCap = cfg.data?.maxPlayersPerRoom ?? 150;

  // Keep the form across the sign-in detour (session only).
  useEffect(() => { if (!id) try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* ignore */ } }, [form, id]);
  // Query-string presets: ?template=…, ?topic=…, ?pack=…
  const applied = useRef(false);
  useEffect(() => {
    if (id || applied.current || !topics.data) return;
    const t = sp.get('template'), slug = sp.get('topic'), pack = sp.get('pack');
    if (!t && !slug && !pack) return;
    applied.current = true;
    const all = topics.data.topics.map((x) => x.id);
    setForm((f) => {
      let n = { ...f };
      if (t && TEMPLATES[t]) n = { ...n, ...TEMPLATES[t]!.patch, categoryIds: all };
      const topic = topics.data!.topics.find((x) => x.slug === slug);
      if (topic) n = { ...n, categoryIds: [topic.id], title: n.title || `${topic.name} quiz` };
      if (pack) n = { ...n, source: 'pack', packId: pack, hostMode: 'audience' };
      return n;
    });
  }, [sp, topics.data, id]);
  useEffect(() => {
    const g = existing.data; if (!g) return;
    setForm((f) => ({ ...f, title: g.title, hostMode: g.hostMode, source: g.source, packId: g.packId ?? '', categoryIds: g.categories.map((c: any) => c.id), minLevel: g.minLevel, maxLevel: g.maxLevel, questionLimit: g.settings.questionLimit, summitHeight: g.settings.summitHeight, timeLimitS: g.settings.timeLimitS, maxPlayers: g.settings.maxPlayers, superQuestion: !!g.settings.superQuestion, gentle: !!g.settings.gentle, when: g.scheduledAt ? 'later' : 'now', local: g.scheduledAt ? toLocal(g.scheduledAt) : '', timezone: g.timezone, allowHistoryReuse: g.allowHistoryReuse, topicVoting: g.topicVoting }));
  }, [existing.data]);

  const mode = form.source === 'pack' ? 'audience' : form.hostMode;
  const summit = Math.min(form.summitHeight, form.questionLimit);
  const body = () => ({
    title: form.title.trim() || 'My ElimQuest game', hostMode: mode, source: form.source, packId: form.source === 'pack' ? form.packId : undefined,
    categoryIds: form.source === 'pack' ? [] : form.categoryIds, minLevel: form.minLevel, maxLevel: form.maxLevel,
    settings: { questionLimit: form.questionLimit, summitHeight: summit, timeLimitS: form.timeLimitS, maxPlayers: Math.min(form.maxPlayers, maxCap), superQuestion: form.superQuestion, gentle: form.gentle },
    scheduledAt: form.when === 'later' && form.local ? new Date(form.local).toISOString() : null, timezone: form.timezone, allowHistoryReuse: form.allowHistoryReuse,
    topicVoting: form.topicVoting && form.source === 'system',
  });
  const ready = form.source === 'pack' ? !!form.packId : form.categoryIds.length > 0;

  const inv = useQuery({
    queryKey: ['inventory', form.source, form.packId, form.categoryIds, form.minLevel, form.maxLevel, form.questionLimit, form.allowHistoryReuse, !!user],
    enabled: ready && (form.source === 'system' || !!user),
    queryFn: () => api<{ eligible: number; fresh: number; needed: number; shortage: number; usable: number }>('POST', '/api/games/inventory', { ...body(), openNow: false }),
  });
  const shortage = !!inv.data && inv.data.shortage > 0;

  const save = useMutation({
    mutationFn: async (open: boolean) => {
      if (id) {
        const b = body() as Record<string, unknown>; for (const k of ['hostMode', 'source', 'packId', 'topicVoting']) delete b[k];
        await api('PATCH', `/api/games/${id}`, b);
        if (open && existing.data?.phase === 'draft') await api('POST', `/api/games/${id}/open`);
        return { id, code: existing.data?.code as string, open, mode };
      }
      const r = await api<{ id: string; code: string; phase: string }>('POST', '/api/games', { ...body(), openNow: open });
      return { id: r.id, code: r.code, open, mode };
    },
    onSuccess: async (r) => {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      if (!r.open) return nav('/dashboard');
      if (r.mode === 'audience') return nav(`/rooms/${r.code}/host`);
      // A playing host joins automatically with their adventurer: no second form.
      try {
        const j = await api<{ participantToken: string; participantId: string; nickname: string; spectator: boolean }>('POST', `/api/rooms/${r.code}/join`, { nickname: safeNick(adv.nickname || user?.displayName?.slice(0, 20) || ''), avatar: adv.avatar, deviceId: deviceId() });
        roomCred.set(r.code, { token: j.participantToken, participantId: j.participantId, nickname: j.nickname, spectator: false });
        nav(`/rooms/${r.code}/lobby`);
      } catch { nav(`/join/${r.code}`); }
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const create = (open: boolean) => {
    setErr(null);
    if (!user) { nav('/sign-in', { state: { from: '/games/new' } }); return; }
    save.mutate(open);
  };

  const topicOptions = useMemo(() => (topics.data?.topics ?? []).map((t) => ({ value: t.id, label: t.name, sub: `${t.questionCount} questions` })), [topics.data]);
  if (topics.isPending || (id && existing.isPending)) return <PageLoading />;
  if (topics.isError) return <ErrorState error={topics.error} onRetry={() => topics.refetch()} />;
  if (existing.isError) return <ErrorState error={existing.error} />;
  const shortageErr = save.error instanceof ApiError && save.error.code === 'shortage';
  const rules = rulesSummary({ questionLimit: form.questionLimit, summitHeight: summit, timeLimitS: form.timeLimitS, maxPlayers: form.maxPlayers, superQuestion: form.superQuestion, gentle: form.gentle });
  const locked = !!id;
  const players = [10, 25, 50, 100, 150].filter((n) => n <= maxCap);
  if (!players.includes(Math.min(form.maxPlayers, maxCap))) players.push(Math.min(form.maxPlayers, maxCap));
  players.sort((a, b) => a - b);
  const fitting = inv.data ? ([30, 20, 10].find((n) => n <= inv.data!.usable) ?? null) : null;

  return (
    <div className="container-page grid max-w-3xl gap-4 py-6 pb-32">
      <div><p className="eyebrow mb-1">{id ? 'Edit game' : 'Host a game'}</p><h1 className="text-3xl">Set up your game</h1><p className="mt-1 text-ivory/80">One screen. Pick a template or tune it yourself — you can’t get this wrong, and nothing starts until you press Start.</p></div>

      {!id && (
        <section aria-labelledby="tpl-h" className="grid gap-2"><h2 id="tpl-h" className="text-sm font-semibold text-ivory/90">Start from a template <span className="font-normal text-ivory/60">(optional)</span></h2>
          <div className="grid gap-2 sm:grid-cols-3">{Object.entries(TEMPLATES).map(([k, t]) => (
            <button key={k} type="button" onClick={() => patch({ ...t.patch, categoryIds: topics.data.topics.map((x) => x.id) })} className="rounded-xl border border-line bg-ink-soft p-3 text-left transition hover:bg-ink-raised active:scale-[.98]"><span className="block font-semibold">{t.label}</span><span className="block text-xs text-ivory/75">{t.blurb}</span></button>))}</div></section>
      )}

      <Section n={1} title="How will you take part?">
        <TileGrid legend="Your role" value={mode} onChange={(v) => set('hostMode', v)} cols="grid-cols-1 sm:grid-cols-2"
          options={[{ value: 'competing', label: 'I’ll play too', sub: 'You join as a player. You pick the settings but never see the questions, and can’t change scores once it starts.' }, { value: 'audience', label: 'I’ll run it for others', sub: 'You stay in control without competing: pause, announce, void a faulty question, and see the questions.' }]} />
        {locked && <p className="text-xs text-ivory/70">Role and question source can’t change after the game is created.</p>}
        {form.source === 'pack' && <Alert tone="info">Games using your own pack always run in “run it for others” mode, because you already know the answers.</Alert>}
      </Section>

      <Section n={2} title="What will players be asked?">
        <TileGrid legend="Questions from" value={form.source} onChange={(v) => set('source', v)} cols="grid-cols-1 sm:grid-cols-2"
          options={[{ value: 'system', label: 'Ready-made questions', sub: 'Reviewed questions chosen for you, favouring ones you haven’t seen recently.' }, { value: 'pack', label: 'My own pack', sub: 'Questions you wrote or imported. Not reviewed by ElimQuest.' }]} />
        {form.source === 'pack' ? (!user ? <Alert tone="info">Sign in to use your private packs. Your choices here are kept.</Alert> : packs.data?.packs.length ? <TileGrid legend="Choose a pack" value={form.packId} onChange={(v) => set('packId', v)} cols="grid-cols-1 sm:grid-cols-2" options={packs.data.packs.map((p) => ({ value: p.id, label: p.title, sub: `${p.questionCount} questions` }))} /> : <Alert tone="info">You don’t have a pack yet. <a className="underline" href="/packs/new">Create one</a>, then come back.</Alert>) : (<>
          <TileMulti legend="Topics" values={form.categoryIds} onChange={(v) => set('categoryIds', v)} options={topicOptions} hint={form.categoryIds.length ? `${form.categoryIds.length} selected` : 'Pick at least one topic.'} />
          <LevelRange min={form.minLevel} max={form.maxLevel} onChange={(a, b) => patch({ minLevel: a, maxLevel: b })} />
          {!locked && <RuleToggle title="Let players vote on topics" description="Players pick up to three favourites from your selection in the lobby. You close voting before you start; everyone still gets the same questions." on={form.topicVoting} onChange={(v) => set('topicVoting', v)} />}
        </>)}
      </Section>

      <Section n={3} title="Game length" hint="Summit height and question count are separate, so a long game doesn’t need a perfect run.">
        <TileGrid legend="Questions" value={form.questionLimit} onChange={(v) => setForm((f) => ({ ...f, questionLimit: v, summitHeight: Math.min(f.summitHeight, v) < 3 || f.summitHeight > v ? defaultSummit(v) : f.summitHeight }))} cols="grid-cols-3" options={[10, 20, 30].map((n) => ({ value: n, label: n, sub: `about ${Math.round((n * (form.timeLimitS + 12)) / 60)} min` }))} />
        <TimePicker value={form.timeLimitS} onChange={(v) => set('timeLimitS', v)} />
        <TileGrid legend="Steps to win (summit height)" value={summit} onChange={(v) => set('summitHeight', v)} cols="grid-cols-6 sm:grid-cols-8" hint={`The first to reach step ${summit} wins; everyone arriving in the same round wins together.`} options={Array.from({ length: form.questionLimit - 2 }, (_, i) => i + 3).map((n) => ({ value: n, label: n }))} />
        <TileGrid legend="Maximum players" value={Math.min(form.maxPlayers, maxCap)} onChange={(v) => set('maxPlayers', v)} cols="grid-cols-3 sm:grid-cols-5" hint={`This server allows up to ${maxCap} per room. Larger rooms need load-testing.`} options={players.map((n) => ({ value: n, label: n }))} />
      </Section>

      <Section n={4} title="House rules" hint="Optional twists. Both are explained to players before they join.">
        <RuleToggle {...RULE_TEXT.superQuestion} on={form.superQuestion} onChange={(v) => set('superQuestion', v)} badge="New" />
        <RuleToggle {...RULE_TEXT.gentle} on={form.gentle} onChange={(v) => set('gentle', v)} />
      </Section>

      <Section n={5} title="When and what to call it">
        <TileGrid legend="Gathering time" value={form.when} onChange={(v) => set('when', v)} cols="grid-cols-2" options={[{ value: 'now', label: 'Open the room now' }, { value: 'later', label: 'Pick a time', sub: 'Advertised only — never auto-starts' }]} />
        {form.when === 'later' && <div className="grid gap-3 sm:grid-cols-2"><Input label="Date and time" type="datetime-local" value={form.local} onChange={(e) => set('local', e.target.value)} required /><Input label="Time zone" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} hint="Shown to players in their own time." /></div>}
        <Input label="Game title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={80} placeholder="e.g. Friday family quiz" />
      </Section>

      <details className="card"><summary className="cursor-pointer text-lg font-semibold">Rules players will see</summary><ul className="mt-2 grid list-disc gap-1 pl-5 text-sm text-ivory/85">{rules.map((r) => <li key={r}>{r}</li>)}</ul></details>

      {(shortage || shortageErr) && (
        <Alert tone="warn" title={`Only ${inv.data?.usable ?? 0} suitable questions available`}>
          We need {form.questionLimit} ({inv.data?.eligible} match; {inv.data?.fresh} you haven’t used recently). Options:
          <div className="mt-2 flex flex-wrap gap-2">
            {fitting && <Button variant="ghost" className="!min-h-11 text-sm" onClick={() => setForm((f) => ({ ...f, questionLimit: fitting, summitHeight: Math.min(f.summitHeight, fitting) }))}>Use {fitting} questions</Button>}
            {form.source === 'system' && <Button variant="ghost" className="!min-h-11 text-sm" onClick={() => patch({ minLevel: 1, maxLevel: 10, categoryIds: topics.data.topics.map((t) => t.id) })}>Use all topics and levels</Button>}
            {form.source === 'system' && !form.allowHistoryReuse && <Button variant="ghost" className="!min-h-11 text-sm" onClick={() => set('allowHistoryReuse', true)}>Allow recently used questions</Button>}
          </div>
        </Alert>
      )}
      {!shortage && inv.data && <p className="text-sm text-success" aria-live="polite">✓ {inv.data.eligible} matching questions — enough for {form.questionLimit} rounds. The selection stays hidden{mode === 'competing' ? ' from you and' : ' from players until each round, and'} from everyone else.</p>}
      {err && <Alert tone="error">{err}</Alert>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-soft/95 backdrop-blur-sm">
        <div className="container-page flex max-w-3xl flex-wrap items-center justify-between gap-2 py-3 safe-bottom">
          <p className="min-w-0 text-xs text-ivory/75 sm:text-sm">{mode === 'competing' ? 'You’ll play too' : 'Run for others'} · {form.questionLimit} questions · summit {summit}{form.superQuestion ? ' · super' : ''}{form.gentle ? ' · gentle' : ''}</p>
          <div className="flex items-center gap-2">
            <LinkButton variant="ghost" to={id ? '/dashboard' : '/'} className="!min-h-11 text-sm">Cancel</LinkButton>
            {(!id || existing.data?.phase === 'draft') && <Button variant="ghost" className="!min-h-11 text-sm" loading={save.isPending} disabled={!ready} onClick={() => create(false)}>Save draft</Button>}
            <Button className="!min-h-11" loading={save.isPending} disabled={!ready || shortage} onClick={() => create(true)}>{id && existing.data?.phase === 'lobby' ? 'Save changes' : user ? 'Create & open room' : 'Sign in to create'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
void store;
