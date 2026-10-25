import { useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, download, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Button, EmptyState, ErrorState, Input, LinkButton, PageLoading, Select, Textarea } from '../../components/ui';
import { QuestionForm, emptyQuestion, type QuestionDraft } from '../../components/QuestionForm';

const STATUSES = ['draft', 'in_review', 'changes_requested', 'approved', 'published', 'rejected', 'archived'];
const badge = (s: string) => ({ published: 'bg-success/25 text-success', approved: 'bg-teal-bright/25 text-teal-bright', in_review: 'bg-amber/20 text-amber', rejected: 'bg-danger/25 text-danger', changes_requested: 'bg-danger/15 text-danger' } as Record<string, string>)[s] ?? 'bg-white/10 text-ivory/80';

function useCats() { return useQuery({ queryKey: ['admin-cats'], queryFn: () => api<{ categories: { id: string; slug: string; name: string; description: string; published: boolean; sortOrder: number }[] }>('GET', '/api/admin/categories') }); }

function Dashboard() {
  const q = useQuery({ queryKey: ['admin-summary'], queryFn: () => api<{ byStatus: Record<string, number>; fixtures: number; openReports: number }>('GET', '/api/admin/summary') });
  if (q.isPending) return <PageLoading />; if (q.isError) return <ErrorState error={q.error} />;
  const s = q.data;
  return (<div className="grid gap-4"><h1 className="text-2xl">Content overview</h1>
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">{STATUSES.map((st) => <li key={st} className="card !p-4"><p className="text-xs uppercase tracking-wider text-ivory/60">{st.replace('_', ' ')}</p><p className="font-display text-3xl tabular-nums">{s.byStatus[st] ?? 0}</p></li>)}<li className="card !p-4"><p className="text-xs uppercase tracking-wider text-ivory/60">Open reports</p><p className="font-display text-3xl tabular-nums">{s.openReports}</p></li></ul>
    {s.fixtures > 0 && <Alert tone="warn" title={`${s.fixtures} development fixture questions exist`}>They are flagged and never selected in production. Counts above exclude them.</Alert>}
    <p className="text-sm text-ivory/70">A question is playable only when its exact version is <em>published</em>. Real counts only — no fabricated analytics.</p></div>);
}

function Questions() {
  const [f, setF] = useState({ status: '', categoryId: '', level: '', search: '' });
  const cats = useCats();
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useQuery({ queryKey: ['admin-q', qs], queryFn: () => api<{ questions: any[] }>('GET', `/api/admin/questions?${qs}`) });
  return (<div className="grid gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl">Questions</h1><div className="flex gap-2"><LinkButton to="/admin/questions/new">New question</LinkButton><LinkButton variant="ghost" to="/admin/import">Import</LinkButton></div></div>
    <div className="grid gap-3 sm:grid-cols-4"><Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
      <Select label="Topic" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">All</option>{cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      <Select label="Level" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="">All</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</Select>
      <Input label="Search text" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} /></div>
    {q.isPending ? <PageLoading /> : q.isError ? <ErrorState error={q.error} /> : q.data.questions.length === 0 ? <EmptyState title="No questions match" /> : (
      <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><caption className="sr-only">Questions</caption><thead className="text-xs uppercase tracking-wider text-ivory/60"><tr><th className="p-2">Question</th><th>Topic</th><th>Lvl</th><th>Status</th><th>Author</th></tr></thead>
        <tbody>{q.data.questions.map((x) => <tr key={x.id} className="border-t border-line"><td className="max-w-md p-2"><Link className="underline" to={`/admin/questions/${x.id}`}>{x.text}</Link>{x.isFixture && <span className="ml-2 rounded bg-amber/20 px-1.5 text-xs text-amber">fixture</span>}<span className="ml-1 text-xs text-ivory/50">v{x.version}</span></td><td>{x.categoryName}</td><td>{x.level}</td><td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge(x.status)}`}>{x.status.replace('_', ' ')}</span></td><td>{x.authorName ?? '—'}</td></tr>)}</tbody></table></div>)}</div>);
}

function QuestionEditor({ id }: { id: string }) {
  const nav = useNavigate(); const qc = useQueryClient(); const { user } = useAuth();
  const cats = useCats();
  const d = useQuery({ queryKey: ['admin-qd', id], enabled: id !== 'new', queryFn: () => api<any>('GET', `/api/admin/questions/${id}`) });
  const [note, setNote] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin-qd', id] }); void qc.invalidateQueries({ queryKey: ['admin-q'] }); void qc.invalidateQueries({ queryKey: ['admin-summary'] }); };
  const save = useMutation({ mutationFn: (q: QuestionDraft) => (id === 'new' ? api<{ versionId: string }>('POST', '/api/admin/questions', q) : api<{ versionId: string; created: boolean }>('PUT', `/api/admin/questions/${id}`, q)), onSuccess: (r: any) => { refresh(); nav(`/admin/questions/${r.versionId}`); } });
  const act = useMutation({ mutationFn: (a: string) => (a === 'submit' ? api('POST', `/api/admin/questions/${id}/submit`) : api('POST', `/api/admin/questions/${id}/review`, { action: a, note })), onSuccess: () => { setNote(''); refresh(); } });
  if (id !== 'new' && d.isPending) return <PageLoading />; if (d.isError) return <ErrorState error={d.error} />;
  const v = d.data;
  const initial: QuestionDraft = v ? { text: v.text, options: v.options.map((o: any) => o.text), correctIndex: v.options.findIndex((o: any) => o.isCorrect), explanation: v.explanation, categoryId: v.category_id, level: v.level, reference: v.reference, provenance: v.provenance, licence: v.licence, disputed: v.disputed, disputeNote: v.dispute_note, language: v.language } : emptyQuestion();
  const own = v?.author_id === user?.id;
  const st: string = v?.status ?? 'draft';
  const can = (a: string) => ({ submit: ['draft', 'changes_requested'], approve: ['in_review'], request_changes: ['in_review', 'approved'], reject: ['in_review', 'approved'], publish: ['approved'], archive: ['draft', 'in_review', 'changes_requested', 'approved', 'published', 'rejected'] } as Record<string, string[]>)[a]!.includes(st);
  return (<div className="grid gap-4"><Link to="/admin/questions" className="text-sm underline">← Questions</Link><h1 className="text-2xl">{id === 'new' ? 'New question' : 'Question'} {v && <span className={`ml-2 rounded-full px-2.5 py-0.5 align-middle text-xs font-semibold ${badge(st)}`}>{st.replace('_', ' ')} · v{v.version}</span>}</h1>
    {v && ['published', 'approved', 'in_review'].includes(st) && <Alert tone="info">This version is {st.replace('_', ' ')} and can’t be edited in place. Saving creates a new draft version; the current one stays unchanged for running games.</Alert>}
    {cats.data && <QuestionForm key={v?.id ?? 'new'} admin initial={initial} categories={cats.data.categories} busy={save.isPending} error={save.isError ? errMsg(save.error) : null} submitLabel={id === 'new' ? 'Create draft' : 'Save'} onSubmit={(q) => save.mutate(q)} />}
    {v && <section className="card grid gap-3" aria-labelledby="rv"><h2 id="rv" className="text-xl">Review</h2>
      {own && <Alert tone="warn">You authored this version. {user?.role === 'super_admin' ? 'As super admin you may override — it is recorded.' : 'Another reviewer must approve it.'}</Alert>}
      <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} />
      <div className="flex flex-wrap gap-2">{[['submit', 'Submit for review'], ['approve', 'Approve'], ['request_changes', 'Request changes'], ['reject', 'Reject'], ['publish', 'Publish'], ['archive', 'Archive']].map(([a, l]) => <Button key={a} variant={a === 'publish' ? 'gold' : 'ghost'} disabled={!can(a!) || act.isPending} onClick={() => act.mutate(a!)}>{l}</Button>)}</div>
      {act.isError && <Alert tone="error">{errMsg(act.error)}</Alert>}
      <h3 className="text-lg">History</h3>{v.history.length ? <ul className="grid gap-1 text-sm">{v.history.map((h: any, i: number) => <li key={i} className="rounded-lg bg-white/5 p-2">{h.action}{h.override ? ' (override)' : ''} by {h.reviewer ?? 'unknown'} · {new Date(h.createdAt).toLocaleString()}{h.note ? ` — ${h.note}` : ''}</li>)}</ul> : <p className="text-sm text-ivory/70">No decisions yet.</p>}</section>}</div>);
}

function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const prev = useMutation({ mutationFn: async () => api<{ batchId: string; summary: any; rows: any[] }>('POST', '/api/admin/import/preview', undefined, { raw: await file!.arrayBuffer(), filename: file!.name }) });
  const save = useMutation({ mutationFn: () => api<{ saved: number; skipped: number }>('POST', `/api/admin/import/${prev.data!.batchId}/save`) });
  const s = prev.data?.summary;
  return (<div className="grid gap-4"><h1 className="text-2xl">Import questions</h1>
    <ol className="grid list-decimal gap-1 pl-5 text-sm text-ivory/85"><li><button className="underline" onClick={() => void download('/api/admin/template.csv', 'elimquest-template.csv', 'text/csv')}>Download template</button></li><li>Upload .csv or .xlsx (max 2 MB, 1000 rows; macro workbooks are refused).</li><li>Review row errors and duplicates.</li><li>Explicitly save valid rows as <strong>drafts</strong>. Nothing is published automatically.</li></ol>
    <input aria-label="Choose a CSV or XLSX file" type="file" accept=".csv,.xlsx" className="field max-w-lg" onChange={(e) => { setFile(e.target.files?.[0] ?? null); prev.reset(); save.reset(); }} />
    <div><Button disabled={!file} loading={prev.isPending} onClick={() => prev.mutate()}>Parse & validate</Button></div>
    {prev.isError && <Alert tone="error">{errMsg(prev.error)}</Alert>}
    {s && <><Alert tone={s.invalid ? 'warn' : 'success'} title={`${s.total} rows: ${s.valid} ready, ${s.invalid} with errors, ${s.duplicates} duplicates`}>Invalid rows and duplicates are skipped — they are never partially saved.</Alert>
      <div className="max-h-96 overflow-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="text-xs text-ivory/60"><tr><th className="p-1">Row</th><th>Question</th><th>Topic</th><th>Lvl</th><th>Result</th></tr></thead><tbody>{prev.data!.rows.map((r) => <tr key={r.row} className="border-t border-line align-top"><td className="p-1">{r.row}</td><td className="pr-2">{r.preview.text}</td><td>{r.preview.category ?? '—'}</td><td>{r.preview.level ?? '—'}</td><td>{r.duplicate ? <span className="text-amber">Duplicate candidate</span> : r.ok ? <span className="text-success">✓ Ready</span> : <span className="text-danger">{r.errors.join('; ')}</span>}</td></tr>)}</tbody></table></div>
      <div><Button disabled={!s.valid || save.isSuccess} loading={save.isPending} onClick={() => save.mutate()}>Save {s.valid} as drafts</Button></div>
      {save.isSuccess && <Alert tone="success">Saved {save.data.saved} drafts. <Link className="underline" to="/admin/questions?status=draft">Review them</Link>.</Alert>}{save.isError && <Alert tone="error">{errMsg(save.error)}</Alert>}</>}</div>);
}

function ReviewQueue() {
  const q = useQuery({ queryKey: ['admin-q', 'review'], queryFn: () => api<{ questions: any[] }>('GET', '/api/admin/questions?status=in_review') });
  return (<div className="grid gap-4"><h1 className="text-2xl">Review queue</h1>{q.isPending ? <PageLoading /> : q.isError ? <ErrorState error={q.error} /> : q.data.questions.length === 0 ? <EmptyState title="Nothing waiting for review" /> : <ul className="grid gap-2">{q.data.questions.map((x) => <li key={x.id} className="card flex flex-wrap items-center justify-between gap-3 !p-3"><span className="min-w-0 flex-1 break-words">{x.text}<span className="block text-xs text-ivory/60">{x.categoryName} · level {x.level} · by {x.authorName ?? 'unknown'}</span></span><LinkButton variant="ghost" to={`/admin/questions/${x.id}`} className="!min-h-10 text-sm">Review</LinkButton></li>)}</ul>}</div>);
}

function Categories() {
  const qc = useQueryClient(); const q = useCats();
  const [n, setN] = useState({ name: '', slug: '', description: '' });
  const levels = useQuery({ queryKey: ['levels'], queryFn: () => api<{ levels: { level: number; title: string; rubric: string }[] }>('GET', '/api/levels', undefined, { auth: false }) });
  const create = useMutation({ mutationFn: () => api('POST', '/api/admin/categories', { ...n, published: false, sortOrder: 100 }), onSuccess: () => { setN({ name: '', slug: '', description: '' }); void qc.invalidateQueries({ queryKey: ['admin-cats'] }); } });
  const toggle = useMutation({ mutationFn: (c: any) => api('PUT', `/api/admin/categories/${c.id}`, { name: c.name, slug: c.slug, description: c.description, published: !c.published, sortOrder: c.sortOrder }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-cats'] }) });
  const saveLevel = useMutation({ mutationFn: (l: any) => api('PUT', `/api/admin/levels/${l.level}`, { title: l.title, rubric: l.rubric }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['levels'] }) });
  const [edit, setEdit] = useState<Record<number, { title: string; rubric: string }>>({});
  return (<div className="grid gap-6"><section className="grid gap-3"><h1 className="text-2xl">Topics</h1>
    <Alert tone="info">Only <em>published</em> topics are visible to players. New topics start hidden — this is how non-Islamic subjects can be prepared without exposing them.</Alert>
    {q.data && <ul className="grid gap-2">{q.data.categories.map((c) => <li key={c.id} className="card flex flex-wrap items-center justify-between gap-3 !p-3"><span><strong>{c.name}</strong> <span className="text-xs text-ivory/60">/{c.slug}</span></span><Button variant="ghost" className="!min-h-9 text-sm" onClick={() => toggle.mutate(c)}>{c.published ? 'Published — unpublish' : 'Hidden — publish'}</Button></li>)}</ul>}
    <form className="card grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}><Input label="Name" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} required /><Input label="Slug" value={n.slug} onChange={(e) => setN({ ...n, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} hint="lowercase-with-dashes" required /><Input label="Description" value={n.description} onChange={(e) => setN({ ...n, description: e.target.value })} /><div className="sm:col-span-3"><Button type="submit" loading={create.isPending}>Add topic</Button>{create.isError && <span className="ml-3 text-sm text-danger">{errMsg(create.error)}</span>}</div></form></section>
    <section className="grid gap-3"><h2 className="text-2xl">Levels 1–10 rubric</h2><p className="text-sm text-ivory/75">Levels reflect depth of knowledge, reasoning steps and prerequisite knowledge — not mere obscurity.</p>
      <ul className="grid gap-2">{levels.data?.levels.map((l) => { const e = edit[l.level] ?? l; return <li key={l.level} className="card grid gap-2 !p-3 sm:grid-cols-[3rem_12rem_1fr_auto] sm:items-end"><span className="font-display text-2xl">{l.level}</span><Input label="Title" value={e.title} onChange={(ev) => setEdit({ ...edit, [l.level]: { ...e, title: ev.target.value } })} /><Input label="Rubric" value={e.rubric} onChange={(ev) => setEdit({ ...edit, [l.level]: { ...e, rubric: ev.target.value } })} /><Button variant="ghost" onClick={() => saveLevel.mutate({ level: l.level, ...e })}>Save</Button></li>; })}</ul></section></div>);
}

function Reports() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-reports'], queryFn: () => api<{ reports: any[] }>('GET', '/api/admin/reports') });
  const resolve = useMutation({ mutationFn: (x: { id: string; status: string }) => api('POST', `/api/admin/reports/${x.id}/resolve`, { status: x.status }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-reports'] }); void qc.invalidateQueries({ queryKey: ['admin-summary'] }); } });
  return (<div className="grid gap-4"><h1 className="text-2xl">Content reports</h1>{q.isPending ? <PageLoading /> : q.isError ? <ErrorState error={q.error} /> : q.data.reports.length === 0 ? <EmptyState title="No reports" /> : <ul className="grid gap-2">{q.data.reports.map((r) => <li key={r.id} className="card grid gap-1 !p-3"><p className="font-semibold">{r.text}</p><p className="text-sm text-ivory/75">{r.reason}{r.note ? ` — ${r.note}` : ''} · {r.status} · {new Date(r.createdAt).toLocaleString()}</p><div className="flex flex-wrap gap-2"><Link className="btn btn-ghost !min-h-9 text-sm" to={`/admin/questions/${r.versionId}`}>Open question</Link>{r.status === 'open' && <><Button variant="ghost" className="!min-h-9 text-sm" onClick={() => resolve.mutate({ id: r.id, status: 'resolved' })}>Resolve</Button><Button variant="ghost" className="!min-h-9 text-sm" onClick={() => resolve.mutate({ id: r.id, status: 'dismissed' })}>Dismiss</Button></>}</div></li>)}</ul>}</div>);
}

function Audit() {
  const q = useQuery({ queryKey: ['admin-audit'], queryFn: () => api<{ events: any[] }>('GET', '/api/admin/audit') });
  return (<div className="grid gap-4"><h1 className="text-2xl">Audit log</h1>{q.isPending ? <PageLoading /> : q.isError ? <ErrorState error={q.error} /> : <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-ivory/60"><tr><th className="p-2">When</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead><tbody>{q.data.events.map((e) => <tr key={e.id} className="border-t border-line"><td className="p-2 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td><td>{e.actor}</td><td>{e.action}</td><td className="max-w-48 truncate">{e.entityType} {e.entityId.slice(0, 8)}</td></tr>)}</tbody></table></div>}</div>);
}

function Users() {
  const qc = useQueryClient(); const [s, setS] = useState('');
  const q = useQuery({ queryKey: ['admin-users', s], queryFn: () => api<{ users: any[] }>('GET', `/api/admin/users?search=${encodeURIComponent(s)}`) });
  const plat = useQuery({ queryKey: ['admin-platform'], queryFn: () => api<any>('GET', '/api/admin/platform') });
  const role = useMutation({ mutationFn: (x: { id: string; role: string }) => api('PUT', `/api/admin/users/${x.id}/role`, { role: x.role }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-users'] }) });
  return (<div className="grid gap-6"><section className="grid gap-3"><h1 className="text-2xl">Roles</h1><Input label="Find a user by name or email" value={s} onChange={(e) => setS(e.target.value)} />
    {q.data && <ul className="grid gap-2">{q.data.users.map((u) => <li key={u.id} className="card flex flex-wrap items-center justify-between gap-3 !p-3"><span><strong>{u.displayName}</strong> <span className="text-sm text-ivory/70">{u.email}</span></span><Select label="Role" value={u.role} onChange={(e) => role.mutate({ id: u.id, role: e.target.value })}><option value="member">member</option><option value="content_reviewer">content reviewer</option><option value="super_admin">super admin</option></Select></li>)}</ul>}{role.isError && <Alert tone="error">{errMsg(role.error)}</Alert>}</section>
    <section className="grid gap-2"><h2 className="text-2xl">Platform capacity</h2>{plat.data && <><dl className="grid gap-2 text-sm sm:grid-cols-2">{[['Max players per room', plat.data.env.maxPlayersPerRoom], ['Max live rooms', plat.data.env.maxActiveRooms], ['Spectator budget / room', plat.data.env.spectatorBudget], ['Live rooms now', plat.data.liveRooms], ['Database', plat.data.env.db], ['Auth', plat.data.env.authMode], ['Email', plat.data.env.emailMode], ['Redis', plat.data.env.redis ? 'configured' : 'not configured'], ['Fixture questions', plat.data.env.fixturesEnabled ? 'enabled (dev only)' : 'disabled']].map(([k, v]) => <div key={String(k)} className="rounded-lg bg-white/5 p-3"><dt className="text-xs uppercase tracking-wider text-ivory/60">{k}</dt><dd>{String(v)}</dd></div>)}</dl><p className="text-sm text-ivory/70">{plat.data.note}</p></>}</section></div>);
}

export default function Admin() {
  const { user, loading } = useAuth();
  const { '*': rest = '' } = useParams();
  if (loading) return <PageLoading />;
  if (!user || !['content_reviewer', 'super_admin'].includes(user.role)) return <div className="container-page max-w-xl py-12"><EmptyState title="You don’t have access to this area" action={<LinkButton to="/">Home</LinkButton>}>Admin tools are limited to content reviewers and super admins.</EmptyState></div>;
  const [a, b] = rest.split('/').filter(Boolean);
  const nav = [['', 'Overview'], ['questions', 'Questions'], ['review', 'Review queue'], ['import', 'Import'], ['topics', 'Topics & levels'], ['reports', 'Reports'], ['audit', 'Audit log'], ...(user.role === 'super_admin' ? [['users', 'Roles & platform']] : [])];
  let page = <Dashboard />;
  if (a === 'questions') page = b ? <QuestionEditor id={b} /> : <Questions />;
  else if (a === 'review') page = <ReviewQueue />; else if (a === 'import') page = <ImportPage />; else if (a === 'topics') page = <Categories />;
  else if (a === 'reports') page = <Reports />; else if (a === 'audit') page = <Audit />; else if (a === 'users') page = user.role === 'super_admin' ? <Users /> : <EmptyState title="Super admins only" />;
  return (
    <div className="container-page grid gap-5 py-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">{nav.map(([to, l]) => <NavLink key={to} end={to === ''} to={`/admin/${to}`} className={({ isActive }) => `inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-amber text-ink' : 'bg-white/5 hover:bg-white/10'}`}>{l}</NavLink>)}</nav>
      <div className="min-w-0">{page}</div>
    </div>
  );
}
