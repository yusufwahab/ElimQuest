import express, { Router } from 'express';
import { z } from 'zod';
import { categoryInputSchema, levelDefinitionSchema, questionInputSchema, reviewActionSchema } from '@elimquest/contracts';
import type { Ctx } from '../ctx';
import { IMPORT_LIMITS, parseImport, templateCsv } from '../import';
import { adminCounts, createQuestion, getQuestionDetail, listQuestions, reviewAction, updateQuestion, type ReviewAction } from '../repo/content';
import { HttpError, audit, many, one } from '../repo/util';

const uuid = z.string().uuid();

export function adminRoutes(ctx: Ctx) {
  const r = Router();
  const { db, auth } = ctx;
  // Every admin route is enforced here on the server, not just hidden in the UI.
  r.use(auth.require(['content_reviewer', 'super_admin']));
  const superOnly = auth.require(['super_admin']);

  r.get('/summary', async (_req, res) => res.json(await adminCounts(db)));
  r.get('/template.csv', (_req, res) => { res.type('text/csv').setHeader('content-disposition', 'attachment; filename="elimquest-template.csv"').send(templateCsv()); });

  r.get('/questions', async (req, res) => {
    const f = z.object({ status: z.string().optional(), categoryId: z.string().uuid().optional(), level: z.coerce.number().int().min(1).max(10).optional(), minLevel: z.coerce.number().int().min(1).max(10).optional(), maxLevel: z.coerce.number().int().min(1).max(10).optional(), search: z.string().max(100).optional(), limit: z.coerce.number().int().max(200).optional(), offset: z.coerce.number().int().min(0).optional() }).parse(req.query);
    res.json({ questions: await listQuestions(db, f) });
  });
  r.get('/questions/:id', async (req, res) => {
    const d = await getQuestionDetail(db, uuid.parse(req.params.id));
    if (!d) throw new HttpError(404, 'Question not found');
    res.json(d);
  });
  r.post('/questions', async (req, res) => {
    const input = questionInputSchema.parse(req.body);
    const out = await createQuestion(db, input, { authorId: req.user!.id });
    await audit(db, { actorId: req.user!.id, action: 'question.create', entityType: 'question_version', entityId: out.versionId });
    res.status(201).json(out);
  });
  r.put('/questions/:id', async (req, res) => {
    const out = await updateQuestion(db, uuid.parse(req.params.id), questionInputSchema.parse(req.body), req.user!.id);
    await audit(db, { actorId: req.user!.id, action: 'question.update', entityType: 'question_version', entityId: out.versionId, detail: { newVersion: out.created } });
    res.json(out);
  });
  r.post('/questions/:id/review', async (req, res) => {
    const { action, note } = reviewActionSchema.parse(req.body);
    res.json(await db.tx((q) => reviewAction(q, uuid.parse(req.params.id), action as ReviewAction, req.user!, note)));
  });
  const bulkBusy = new Set<string>();
  // Bulk review steps for many questions at once. Each question is its own transaction, so one failure never blocks the rest.
  r.post('/questions/bulk', async (req, res) => {
    const { ids, action } = z.object({ ids: z.array(uuid).min(1).max(200), action: z.enum(['submit', 'approve', 'publish', 'archive', 'fast_track']) }).parse(req.body);
    if (bulkBusy.has(req.user!.id)) throw new HttpError(409, 'A bulk update is already running. Wait for it to finish, then check the list.', 'busy');
    if (action === 'fast_track' && req.user!.role !== 'super_admin') throw new HttpError(403, 'Only a super admin can fast-track questions to published', 'forbidden');
    const remaining: Record<string, ReviewAction[]> = { draft: ['submit', 'approve', 'publish'], changes_requested: ['submit', 'approve', 'publish'], in_review: ['approve', 'publish'], approved: ['publish'] };
    let done = 0;
    const failed: { id: string; message: string }[] = [];
    bulkBusy.add(req.user!.id);
    try { for (const id of ids) {
      try {
        await db.tx(async (q) => {
          let steps: ReviewAction[] = [action as ReviewAction];
          if (action === 'fast_track') {
            const v = await one<{ status: string }>(q, 'select status from question_versions where id=$1', [id]);
            steps = remaining[v?.status ?? ''] ?? [];
            if (!steps.length) throw new HttpError(409, `Cannot fast-track a ${v?.status ?? 'missing'} question`, 'bad_transition');
          }
          for (const st of steps) await reviewAction(q, id, st, req.user!, action === 'fast_track' ? 'Bulk fast-track' : 'Bulk action');
        });
        done++;
      } catch (e) { failed.push({ id, message: e instanceof HttpError ? e.message : 'Failed' }); }
    } } finally { bulkBusy.delete(req.user!.id); }
    res.json({ done, failed });
  });
  r.post('/questions/:id/submit', async (req, res) => res.json(await db.tx((q) => reviewAction(q, uuid.parse(req.params.id), 'submit', req.user!))));

  // Import: template → upload → parse/validate → preview → explicit save as drafts.
  const raw = express.raw({ type: () => true, limit: IMPORT_LIMITS.maxBytes });
  r.post('/import/preview', ctx.limit('import', 30, 3_600_000, (q) => q.user!.id), raw, async (req, res) => {
    const name = String(req.headers['x-filename'] ?? 'upload.csv').slice(0, 120);
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'No file received');
    const { rows, summary } = await parseImport(db, req.body, name, 'admin');
    const b = await one(db, "insert into import_batches(kind, created_by, file_name, summary, rows) values ('admin',$1,$2,$3,$4) returning id", [req.user!.id, name, JSON.stringify(summary), JSON.stringify(rows)]);
    res.json({ batchId: b!.id, summary, rows: rows.map(({ input: _i, ...x }) => x) });
  });
  const saving = new Set<string>();
  r.post('/import/:batchId/save', async (req, res) => {
    // Claim the batch first so a double click or retry can never insert the same rows twice.
    const batchId = uuid.parse(req.params.batchId);
    const b = saving.has(batchId) ? undefined : await one<any>(db, "select * from import_batches where id=$1 and kind='admin' and status='parsed'", [batchId]);
    if (!b) throw new HttpError(404, 'This import was already saved (or is still saving). Check Questions → Drafts before trying again.');
    const rows = (b.rows as any[]).filter((x) => x.ok && !x.duplicate);
    let saved = 0;
    saving.add(batchId);
    try {
      for (let i = 0; i < rows.length; i++) {
        await createQuestion(db, rows[i].input, { authorId: req.user!.id });
        saved++;
        if (i % 25 === 24) await new Promise((r) => setImmediate(r));
      }
    } finally { saving.delete(batchId); }
    await db.query("update import_batches set status='saved' where id=$1", [b.id]);
    await audit(db, { actorId: req.user!.id, action: 'import.save', entityType: 'import_batch', entityId: b.id, detail: { saved, total: (b.rows as any[]).length } });
    // Imported rows are always saved as drafts; nothing is published automatically.
    res.json({ saved, skipped: (b.rows as any[]).length - saved, status: 'draft' });
  });

  // Categories & levels
  r.get('/categories', async (_req, res) => res.json({ categories: await many(db, "select id, slug, name, description, published, sort_order as \"sortOrder\", parent_id as \"parentId\" from categories where slug <> 'custom' order by sort_order, name") }));
  r.post('/categories', async (req, res) => {
    const c = categoryInputSchema.parse(req.body);
    const row = await one(db, 'insert into categories(slug,name,description,parent_id,published,sort_order) values ($1,$2,$3,$4,$5,$6) returning id', [c.slug, c.name, c.description, c.parentId ?? null, c.published, c.sortOrder]);
    await audit(db, { actorId: req.user!.id, action: 'category.create', entityType: 'category', entityId: row!.id });
    res.status(201).json({ id: row!.id });
  });
  r.put('/categories/:id', async (req, res) => {
    const c = categoryInputSchema.parse(req.body);
    await db.query("update categories set slug=$2, name=$3, description=$4, parent_id=$5, published=$6, sort_order=$7 where id=$1 and slug <> 'custom'", [uuid.parse(req.params.id), c.slug, c.name, c.description, c.parentId ?? null, c.published, c.sortOrder]);
    await audit(db, { actorId: req.user!.id, action: 'category.update', entityType: 'category', entityId: req.params.id, detail: { published: c.published } });
    res.json({ ok: true });
  });
  r.put('/levels/:level', async (req, res) => {
    const d = levelDefinitionSchema.parse({ ...req.body, level: Number(req.params.level) });
    await db.query('update difficulty_definitions set title=$2, rubric=$3 where level=$1', [d.level, d.title, d.rubric]);
    await audit(db, { actorId: req.user!.id, action: 'level.update', entityType: 'level', entityId: String(d.level) });
    res.json({ ok: true });
  });

  // Reports
  r.get('/reports', async (_req, res) => res.json({ reports: await many(db, `select r.id, r.reason, r.note, r.status, r.created_at as "createdAt", r.version_id as "versionId", v.text from content_reports r join question_versions v on v.id=r.version_id order by r.created_at desc limit 200`) }));
  r.post('/reports/:id/resolve', async (req, res) => {
    const { status } = z.object({ status: z.enum(['resolved', 'dismissed']) }).parse(req.body);
    await db.query('update content_reports set status=$2 where id=$1', [uuid.parse(req.params.id), status]);
    await audit(db, { actorId: req.user!.id, action: `report.${status}`, entityType: 'report', entityId: req.params.id });
    res.json({ ok: true });
  });

  r.get('/audit', async (_req, res) => res.json({ events: await many(db, `select a.id, a.action, a.entity_type as "entityType", a.entity_id as "entityId", a.detail, a.created_at as "createdAt", coalesce(p.display_name, nullif(a.actor_label,''), 'system') as actor from audit_events a left join profiles p on p.id=a.actor_id order by a.id desc limit 200`) }));

  // Super-admin only: roles and platform settings
  r.get('/users', superOnly, async (req, res) => {
    const search = z.string().max(100).optional().parse(req.query.search);
    res.json({ users: await many(db, `select id, email, display_name as "displayName", role, created_at as "createdAt" from profiles where ($1::text is null or email ilike '%'||$1||'%' or display_name ilike '%'||$1||'%') order by created_at desc limit 50`, [search ?? null]) });
  });
  r.put('/users/:id/role', superOnly, async (req, res) => {
    const { role } = z.object({ role: z.enum(['member', 'content_reviewer', 'super_admin']) }).parse(req.body);
    const target = uuid.parse(req.params.id);
    if (target === req.user!.id) throw new HttpError(400, 'You cannot change your own role', 'self');
    await db.query('update profiles set role=$2 where id=$1', [target, role]);
    await audit(db, { actorId: req.user!.id, action: 'role.grant', entityType: 'profile', entityId: target, detail: { role } });
    res.json({ ok: true });
  });
  r.get('/platform', superOnly, async (_req, res) => {
    const live = await one<{ n: number }>(db, "select count(*)::int n from games where phase in ('lobby','countdown','question_open','reveal','climb','paused','recovery_pause')");
    res.json({ env: { maxPlayersPerRoom: ctx.env.MAX_PLAYERS_PER_ROOM, maxActiveRooms: ctx.env.MAX_ACTIVE_ROOMS, spectatorBudget: ctx.env.SPECTATOR_BUDGET_PER_ROOM, fixturesEnabled: ctx.env.ALLOW_FIXTURE_QUESTIONS, authMode: ctx.env.AUTH_MODE, emailMode: ctx.env.EMAIL_MODE, redis: !!ctx.env.REDIS_URL, db: ctx.db.kind }, liveRooms: live?.n ?? 0, note: 'Limits are environment settings. Raise them only with load-test evidence (docs/CAPACITY.md).' });
  });

  return r;
}
