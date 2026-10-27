import { useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, download, errMsg } from '../lib/api';
import { Alert, Button, ConfirmDialog, EmptyState, ErrorState, Input, LinkButton, PageLoading, Textarea } from '../components/ui';
import { QuestionForm, emptyQuestion, type QuestionDraft } from '../components/QuestionForm';

const NOTICE = 'Custom content is provided by you and is not reviewed by ElimQuest. Games that use a pack always run with an audience host.';

function PackList() {
  const q = useQuery({ queryKey: ['packs'], queryFn: () => api<{ packs: { id: string; title: string; description: string; questionCount: number }[] }>('GET', '/api/packs') });
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="container-page grid max-w-3xl gap-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow mb-1">Private packs</p><h1 className="text-3xl">Your question packs</h1></div><LinkButton to="/packs/new">New pack</LinkButton></div>
      <Alert tone="info">{NOTICE}</Alert>
      {q.data.packs.length === 0 ? <EmptyState title="No packs yet" action={<LinkButton to="/packs/new">Create your first pack</LinkButton>}>Write questions yourself or import a spreadsheet, then host a quiz with them.</EmptyState> : (
        <ul className="grid gap-3">{q.data.packs.map((p) => <li key={p.id} className="card flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg">{p.title}</h2><p className="text-sm text-ivory/70">{p.questionCount} question{p.questionCount === 1 ? '' : 's'}{p.description ? ` · ${p.description}` : ''}</p></div><LinkButton variant="ghost" to={`/packs/${p.id}/edit`} className="!min-h-10 text-sm">Edit</LinkButton></li>)}</ul>)}
    </div>
  );
}

function NewPack() {
  const nav = useNavigate();
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const create = useMutation({ mutationFn: () => api<{ id: string }>('POST', '/api/packs', { title, description }), onSuccess: (r) => nav(`/packs/${r.id}/edit`) });
  return (
    <div className="container-page grid max-w-xl gap-4 py-8"><h1 className="text-3xl">New pack</h1>
      <form className="card grid gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
        <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} />
        {create.isError && <Alert tone="error">{errMsg(create.error)}</Alert>}
        <div className="flex gap-3"><Button type="submit" loading={create.isPending} disabled={!title.trim()}>Create pack</Button><LinkButton variant="ghost" to="/packs">Cancel</LinkButton></div>
      </form></div>
  );
}

function ImportWizard({ packId, onDone }: { packId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const prev = useMutation({ mutationFn: async () => api<{ batchId: string; summary: any; rows: { row: number; ok: boolean; errors: string[]; duplicate: boolean; preview: { text: string } }[] }>('POST', `/api/packs/${packId}/import/preview`, undefined, { raw: await file!.arrayBuffer(), filename: file!.name }) });
  const save = useMutation({ mutationFn: () => api<{ saved: number; skipped: number }>('POST', `/api/packs/${packId}/import/${prev.data!.batchId}/save`), onSuccess: onDone });
  const s = prev.data?.summary;
  return (
    <section className="card grid gap-3" aria-labelledby="imp-h"><h2 id="imp-h" className="text-xl">Import from CSV or Excel</h2>
      <ol className="grid list-decimal gap-1 pl-5 text-sm text-ivory/85"><li><button className="underline" onClick={() => void download('/api/packs/template.csv', 'elimquest-template.csv', 'text/csv')}>Download the template</button></li><li>Fill it in (correct answer is A, B, C or D; level is Beginner, Intermediate, Advanced or Scholar; leave category as “custom” or use a topic name).</li><li>Upload it (.csv or .xlsx, up to 2 MB and 200 rows) and review the preview before anything is saved.</li></ol>
      <input aria-label="Choose a CSV or XLSX file" type="file" accept=".csv,.xlsx" className="field" onChange={(e) => { setFile(e.target.files?.[0] ?? null); prev.reset(); }} />
      <div><Button variant="ghost" disabled={!file} loading={prev.isPending} onClick={() => prev.mutate()}>Check file</Button></div>
      {prev.isError && <Alert tone="error">{errMsg(prev.error)}</Alert>}
      {s && <>
        <Alert tone={s.invalid || s.duplicates ? 'warn' : 'success'} title={`${s.valid} of ${s.total} rows are ready to import`}>{s.invalid} with errors, {s.duplicates} duplicates (skipped).</Alert>
        {prev.data!.rows.some((r) => !r.ok || r.duplicate) && <div className="max-h-56 overflow-auto rounded-lg bg-white/5 p-2 text-sm"><table className="w-full"><thead className="text-left text-xs text-ivory/60"><tr><th className="p-1">Row</th><th>Question</th><th>Problem</th></tr></thead><tbody>{prev.data!.rows.filter((r) => !r.ok || r.duplicate).map((r) => <tr key={r.row} className="border-t border-line align-top"><td className="p-1">{r.row}</td><td className="pr-2">{r.preview.text}</td><td>{r.duplicate ? 'Duplicate of an existing question' : r.errors.join('; ')}</td></tr>)}</tbody></table></div>}
        <div><Button loading={save.isPending} disabled={!s.valid} onClick={() => save.mutate()}>Save {s.valid} question{s.valid === 1 ? '' : 's'} to this pack</Button></div>
        {save.isError && <Alert tone="error">{errMsg(save.error)}</Alert>}</>}
    </section>
  );
}

function EditPack({ id }: { id: string }) {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  void pathname;
  const pack = useQuery({ queryKey: ['pack', id], queryFn: () => api<{ pack: { id: string; title: string; description: string }; questions: { id: string; text: string; level: number; categoryName: string }[] }>('GET', `/api/packs/${id}`) });
  const cats = useQuery({ queryKey: ['all-cats'], queryFn: () => api<{ topics: { id: string; name: string }[] }>('GET', '/api/topics', undefined, { auth: false }) });
  const [editing, setEditing] = useState<{ vid: string | null; draft: QuestionDraft } | null>(null);
  const [delQ, setDelQ] = useState<string | null>(null);
  const nav = useNavigate();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['pack', id] }); void qc.invalidateQueries({ queryKey: ['packs'] }); };
  const save = useMutation({ mutationFn: (x: { vid: string | null; q: QuestionDraft }) => (x.vid ? api('PUT', `/api/packs/${id}/questions/${x.vid}`, x.q) : api('POST', `/api/packs/${id}/questions`, x.q)), onSuccess: () => { setEditing(null); refresh(); } });
  const remove = useMutation({ mutationFn: (vid: string) => api('DELETE', `/api/packs/${id}/questions/${vid}`), onSuccess: () => { setDelQ(null); refresh(); } });
  const dup = useMutation({ mutationFn: (vid: string) => api('POST', `/api/packs/${id}/questions/${vid}/duplicate`), onSuccess: refresh });
  const archive = useMutation({ mutationFn: () => api('DELETE', `/api/packs/${id}`), onSuccess: () => nav('/packs') });
  const reorder = useMutation({ mutationFn: (order: string[]) => api('POST', `/api/packs/${id}/reorder`, { order }), onSuccess: refresh });
  if (pack.isPending) return <PageLoading />;
  if (pack.isError) return <ErrorState error={pack.error} />;
  // Private packs may use any category; the hidden "custom" bucket plus public topic names are offered.
  const categories = [...(cats.data?.topics ?? [])];
  const qs = pack.data.questions;
  const move = (i: number, d: number) => { const ids = qs.map((x) => x.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j]!, ids[i]!]; reorder.mutate(ids); };
  const startEdit = async (vid: string) => {
    const d = await api<any>('GET', `/api/packs/${id}/questions/${vid}`);
    setEditing({ vid, draft: { text: d.text, options: d.options.map((o: any) => o.text) as QuestionDraft['options'], correctIndex: d.options.findIndex((o: any) => o.isCorrect), explanation: d.explanation, categoryId: d.category_id, level: d.level, reference: d.reference, provenance: '', licence: '', disputed: false, disputeNote: '', language: d.language } });
  };
  return (
    <div className="container-page grid max-w-3xl gap-5 py-8">
      <div><Link to="/packs" className="text-sm underline">← All packs</Link><h1 className="mt-1 text-3xl">{pack.data.pack.title}</h1></div>
      <Alert tone="info">{NOTICE}</Alert>
      <div className="flex flex-wrap gap-3"><Button onClick={() => setEditing({ vid: null, draft: emptyQuestion(categories[0]?.id ?? '') })}>Add question</Button><LinkButton variant="ghost" to={`/games/new?pack=${id}`}>Host a game with this pack</LinkButton></div>
      {editing && <section className="card" aria-labelledby="ed-h"><h2 id="ed-h" className="mb-3 text-xl">{editing.vid ? 'Edit question' : 'New question'}</h2>
        <QuestionForm initial={editing.draft} categories={categories.length ? categories : [{ id: '', name: 'Loading…' }]} busy={save.isPending} error={save.isError ? errMsg(save.error) : null} submitLabel="Save question" onSubmit={(q) => save.mutate({ vid: editing.vid, q })} />
        <div className="mt-3"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div></section>}
      <section aria-labelledby="ql-h"><h2 id="ql-h" className="mb-2 text-xl">Questions ({qs.length})</h2>
        {qs.length === 0 ? <EmptyState title="No questions yet">Add one above, or import a spreadsheet below.</EmptyState> : (
          <ol className="grid gap-2">{qs.map((x, i) => (
            <li key={x.id} className="card flex flex-wrap items-center gap-2 !p-3"><span className="min-w-0 flex-1 break-words text-sm"><strong>{i + 1}.</strong> {x.text} <span className="text-ivory/60">· level {x.level}</span></span>
              <span className="flex flex-wrap gap-1.5">
                <button className="btn btn-ghost !min-h-9 !px-2.5 text-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move question ${i + 1} up`}>↑</button>
                <button className="btn btn-ghost !min-h-9 !px-2.5 text-sm" onClick={() => move(i, 1)} disabled={i === qs.length - 1} aria-label={`Move question ${i + 1} down`}>↓</button>
                <button className="btn btn-ghost !min-h-9 !px-3 text-sm" onClick={() => void startEdit(x.id)}>Edit</button>
                <button className="btn btn-ghost !min-h-9 !px-3 text-sm" onClick={() => dup.mutate(x.id)}>Duplicate</button>
                <button className="btn btn-ghost !min-h-9 !px-3 text-sm text-danger" onClick={() => setDelQ(x.id)}>Delete</button></span></li>))}</ol>)}
      </section>
      <ImportWizard packId={id} onDone={refresh} />
      <div><Button variant="ghost" onClick={() => archive.mutate()} loading={archive.isPending}>Archive this pack</Button>{archive.isError && <p className="mt-1 text-sm text-danger">{errMsg(archive.error)}</p>}</div>
      <ConfirmDialog open={!!delQ} title="Delete this question?" danger confirmLabel="Delete" onCancel={() => setDelQ(null)} onConfirm={() => delQ && remove.mutate(delQ)}>It will be removed from the pack. Games already running keep their own copy.</ConfirmDialog>
    </div>
  );
}

export default function Packs() {
  const { '*': rest = '' } = useParams();
  const parts = rest.split('/').filter(Boolean);
  if (parts[0] === 'new') return <NewPack />;
  if (parts[0] && parts[1] === 'edit') return <EditPack id={parts[0]} />;
  return <PackList />;
}
