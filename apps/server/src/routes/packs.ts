import express, { Router } from 'express';
import { z } from 'zod';
import { packInputSchema, questionInputSchema } from '@elimquest/contracts';
import type { Ctx } from '../ctx';
import { IMPORT_LIMITS, parseImport, templateCsv } from '../import';
import { createQuestion, getQuestionDetail, updateQuestion } from '../repo/content';
import { HttpError, audit, many, one } from '../repo/util';

const uuid = z.string().uuid();

export function packRoutes(ctx: Ctx) {
  const r = Router();
  const { db, auth } = ctx;
  r.use(auth.require());

  const ownPack = async (packId: unknown, userId: string) => {
    const p = await one<any>(db, 'select * from packs where id=$1 and owner_id=$2', [uuid.parse(packId), userId]);
    if (!p) throw new HttpError(404, 'Pack not found', 'not_found');
    return p;
  };

  r.get('/template.csv', (_req, res) => { res.type('text/csv').setHeader('content-disposition', 'attachment; filename="elimquest-template.csv"').send(templateCsv()); });

  r.get('/', async (req, res) => {
    res.json({ packs: await many(db, `select p.id, p.title, p.description, p.archived, p.updated_at as "updatedAt",
        (select count(*)::int from questions q join question_versions v on v.question_id=q.id where q.pack_id=p.id) as "questionCount"
        from packs p where p.owner_id=$1 and not p.archived order by p.updated_at desc`, [req.user!.id]) });
  });
  r.post('/', ctx.limit('pack-create', 20, 3_600_000, (q) => q.user!.id), async (req, res) => {
    const b = packInputSchema.parse(req.body);
    const p = await one(db, 'insert into packs(owner_id,title,description) values ($1,$2,$3) returning id', [req.user!.id, b.title, b.description]);
    res.status(201).json({ id: p!.id });
  });
  r.get('/:id', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const questions = await many(db, `select v.id, v.text, v.level, v.position, c.name as "categoryName" from questions q join question_versions v on v.question_id=q.id join categories c on c.id=q.category_id where q.pack_id=$1 order by v.position, v.created_at`, [p.id]);
    res.json({ pack: { id: p.id, title: p.title, description: p.description }, questions, notice: 'Custom content is provided by you and is not reviewed by ElimQuest.' });
  });
  r.patch('/:id', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const b = packInputSchema.partial().parse(req.body);
    await db.query('update packs set title=$2, description=$3, updated_at=now() where id=$1', [p.id, b.title ?? p.title, b.description ?? p.description]);
    res.json({ ok: true });
  });
  r.delete('/:id', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const inUse = await one(db, "select 1 from games where pack_id=$1 and phase in ('lobby','countdown','question_open','reveal','climb','paused','recovery_pause')", [p.id]);
    if (inUse) throw new HttpError(409, 'This pack is used by a live game', 'in_use');
    await db.query('update packs set archived=true where id=$1', [p.id]);
    res.json({ ok: true });
  });

  // Questions inside a pack. Running games hold immutable snapshots, so edits never affect them.
  r.post('/:id/questions', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const input = questionInputSchema.parse(req.body);
    const n = await one<{ n: number }>(db, 'select count(*)::int n from questions where pack_id=$1', [p.id]);
    if ((n?.n ?? 0) >= IMPORT_LIMITS.packRows) throw new HttpError(409, `A pack can hold ${IMPORT_LIMITS.packRows} questions`, 'pack_full');
    res.status(201).json(await createQuestion(db, input, { authorId: req.user!.id, scope: 'pack', packId: p.id, position: n?.n ?? 0 }));
  });
  r.get('/:id/questions/:vid', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const d = await getQuestionDetail(db, uuid.parse(req.params.vid));
    if (!d || d.pack_id !== p.id) throw new HttpError(404, 'Question not found');
    res.json(d);
  });
  r.put('/:id/questions/:vid', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const d = await getQuestionDetail(db, uuid.parse(req.params.vid));
    if (!d || d.pack_id !== p.id) throw new HttpError(404, 'Question not found');
    res.json(await updateQuestion(db, d.id, questionInputSchema.parse(req.body), req.user!.id));
  });
  r.delete('/:id/questions/:vid', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const d = await getQuestionDetail(db, uuid.parse(req.params.vid));
    if (!d || d.pack_id !== p.id) throw new HttpError(404, 'Question not found');
    await db.query('delete from questions where id=$1', [d.question_id]);
    res.json({ ok: true });
  });
  r.post('/:id/questions/:vid/duplicate', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const d: any = await getQuestionDetail(db, uuid.parse(req.params.vid));
    if (!d || d.pack_id !== p.id) throw new HttpError(404, 'Question not found');
    const input = { text: `${d.text} (copy)`.slice(0, 600), options: d.options.map((o: any) => o.text), correctIndex: d.options.findIndex((o: any) => o.isCorrect), explanation: d.explanation, categoryId: d.category_id, level: d.level, language: d.language, reference: d.reference, provenance: 'Host-provided', licence: '', disputed: false, disputeNote: '' };
    res.status(201).json(await createQuestion(db, input, { authorId: req.user!.id, scope: 'pack', packId: p.id, position: 9999 }));
  });
  r.post('/:id/reorder', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const { order } = z.object({ order: z.array(z.string().uuid()).max(200) }).parse(req.body);
    for (let i = 0; i < order.length; i++) await db.query('update question_versions v set position=$3 from questions q where v.question_id=q.id and q.pack_id=$1 and v.id=$2', [p.id, order[i], i]);
    res.json({ ok: true });
  });

  // Import: parse+validate (no writes) → explicit save.
  const raw = express.raw({ type: () => true, limit: IMPORT_LIMITS.maxBytes });
  r.post('/:id/import/preview', ctx.limit('import', 20, 3_600_000, (q) => q.user!.id), raw, async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const name = String(req.headers['x-filename'] ?? 'upload.csv').slice(0, 120);
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'No file received');
    const { rows, summary } = await parseImport(db, req.body, name, 'pack');
    const batch = await one(db, "insert into import_batches(kind, created_by, pack_id, file_name, summary, rows) values ('pack',$1,$2,$3,$4,$5) returning id", [req.user!.id, p.id, name, JSON.stringify(summary), JSON.stringify(rows)]);
    res.json({ batchId: batch!.id, summary, rows: rows.map(({ input: _i, ...x }) => x) });
  });
  r.post('/:id/import/:batchId/save', async (req, res) => {
    const p = await ownPack(req.params.id, req.user!.id);
    const b = await one<any>(db, "select * from import_batches where id=$1 and pack_id=$2 and created_by=$3 and status='parsed'", [uuid.parse(req.params.batchId), p.id, req.user!.id]);
    if (!b) throw new HttpError(404, 'Import not found or already saved');
    const have = (await one<{ n: number }>(db, 'select count(*)::int n from questions where pack_id=$1', [p.id]))!.n;
    const rows = (b.rows as any[]).filter((x) => x.ok && !x.duplicate);
    if (have + rows.length > IMPORT_LIMITS.packRows) throw new HttpError(409, `That would exceed ${IMPORT_LIMITS.packRows} questions in this pack`, 'pack_full');
    let saved = 0;
    for (let i = 0; i < rows.length; i++) {
      await createQuestion(db, rows[i].input, { authorId: req.user!.id, scope: 'pack', packId: p.id, position: have + i });
      saved++;
      if (i % 25 === 24) await new Promise((r) => setImmediate(r)); // bounded batches: let the event loop breathe
    }
    await db.query("update import_batches set status='saved' where id=$1", [b.id]);
    await audit(db, { actorId: req.user!.id, action: 'pack.import', entityType: 'pack', entityId: p.id, detail: { saved } });
    res.json({ saved, skipped: (b.rows as any[]).length - saved });
  });

  return r;
}
