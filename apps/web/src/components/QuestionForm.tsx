import { useState, type FormEvent } from 'react';
import { BANDS, bandOfLevel } from '@elimquest/game-core';
import { Alert, Button, Input, Select, Textarea } from './ui';
import { TileGrid } from './Tiles';

export interface QuestionDraft {
  text: string; options: [string, string, string, string]; correctIndex: number; explanation: string; categoryId: string; level: number;
  reference: string; provenance: string; licence: string; disputed: boolean; disputeNote: string; language: string;
}
export const emptyQuestion = (categoryId = ''): QuestionDraft => ({ text: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', categoryId, level: 3, reference: '', provenance: '', licence: '', disputed: false, disputeNote: '', language: 'en' });

export function QuestionForm({ initial, categories, onSubmit, submitLabel = 'Save', admin = false, busy = false, error }: { initial: QuestionDraft; categories: { id: string; name: string }[]; onSubmit: (q: QuestionDraft) => void; submitLabel?: string; admin?: boolean; busy?: boolean; error?: string | null }) {
  const [q, setQ] = useState(initial);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof QuestionDraft>(k: K, v: QuestionDraft[K]) => setQ((s) => ({ ...s, [k]: v }));
  const opts = q.options.map((o) => o.trim().toLowerCase());
  const problems: string[] = [];
  if (!q.text.trim()) problems.push('Write the question.');
  if (opts.some((o) => !o)) problems.push('All four options need text.');
  else if (new Set(opts).size !== 4) problems.push('Options must all be different.');
  if (!q.explanation.trim()) problems.push('Add a short explanation shown after the round.');
  if (!q.categoryId) problems.push('Choose a topic.');
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!problems.length) onSubmit(q); };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Textarea label="Question" value={q.text} onChange={(e) => set('text', e.target.value)} maxLength={600} required />
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-semibold">Options — select the correct one</legend>
        {q.options.map((o, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="flex min-h-11 items-center gap-1.5 pb-0.5 text-sm font-semibold"><input type="radio" name="correct" className="size-5 accent-amber" checked={q.correctIndex === i} onChange={() => set('correctIndex', i)} /><span className="sr-only">Correct answer is option</span>{'ABCD'[i]}</label>
            <div className="flex-1"><Input label={`Option ${'ABCD'[i]}`} value={o} onChange={(e) => { const n = [...q.options] as QuestionDraft['options']; n[i] = e.target.value; set('options', n); }} maxLength={200} /></div>
          </div>))}
      </fieldset>
      <Textarea label="Explanation" value={q.explanation} onChange={(e) => set('explanation', e.target.value)} maxLength={1200} required hint="Shown to players after the answer is revealed." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Topic" value={q.categoryId} onChange={(e) => set('categoryId', e.target.value)}><option value="">Choose…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <TileGrid legend="Difficulty" value={bandOfLevel(q.level).id} onChange={(id) => { if (bandOfLevel(q.level).id !== id) set('level', BANDS.find((b) => b.id === id)!.rep); }} cols="grid-cols-2 sm:grid-cols-4" hint={bandOfLevel(q.level).blurb}
          options={BANDS.map((b) => ({ value: b.id, label: b.name }))} />
      </div>
      <Input label="Reference (optional)" value={q.reference} onChange={(e) => set('reference', e.target.value)} maxLength={400} hint="e.g. a book, surah and verse, or hadith collection." />
      {admin && <div className="grid gap-3 rounded-xl bg-white/5 p-3">
        <Input label="Provenance / author" value={q.provenance} onChange={(e) => set('provenance', e.target.value)} maxLength={200} hint="Who wrote this and from what source. Don’t claim scholar review unless it happened." />
        <Input label="Rights / licence" value={q.licence} onChange={(e) => set('licence', e.target.value)} maxLength={120} />
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5 accent-amber" checked={q.disputed} onChange={(e) => set('disputed', e.target.checked)} />Answer is disputed among scholars</label>
        {q.disputed && <Textarea label="Dispute context" value={q.disputeNote} onChange={(e) => set('disputeNote', e.target.value)} maxLength={600} />}
      </div>}
      {touched && problems.length > 0 && <Alert tone="error" title="Please fix:"><ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div><Button type="submit" loading={busy}>{submitLabel}</Button></div>
    </form>
  );
}
