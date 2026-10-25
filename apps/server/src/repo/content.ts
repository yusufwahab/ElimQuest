import type { PoolQuestion } from '@elimquest/game-core';
import { OPTION_IDS } from '@elimquest/game-core';
import type { QuestionInput } from '@elimquest/contracts';
import type { Db, Queryable } from '../db/db';
import { FIXTURE_CATEGORIES, FIXTURE_QUESTIONS } from '../db/fixtures';
import { HttpError, audit, many, one } from './util';

export interface QuestionSnapshot {
  versionId: string;
  canonicalId: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  reference: string;
  categoryName: string;
  level: number;
  disputed: boolean;
  disputeNote: string;
}

const LEVEL_RUBRIC: [string, string][] = [
  ['Foundations', 'Widely known facts; one step of recall; no prerequisite knowledge.'],
  ['Common knowledge', 'Well-known facts a regular learner would recall; one step.'],
  ['Basic detail', 'Needs a small amount of context or a specific name/number.'],
  ['Comfortable learner', 'Combines two facts or recalls a specific detail from a familiar topic.'],
  ['Developing student', 'Requires knowing context around an event, text or ruling.'],
  ['Strong student', 'Two reasoning steps or prerequisite knowledge of the period/source.'],
  ['Advanced', 'Detailed knowledge of sources, chronology or comparison.'],
  ['Specialist-leaning', 'Multi-step reasoning across sources; fine distinctions.'],
  ['Expert', 'Deep prerequisite knowledge; subtle distinctions between sources or opinions.'],
  ['Mastery', 'Rare detail that still follows from understanding, not mere obscurity.'],
];

/** Required in every environment: level rubric and the hidden category that holds private pack questions. */
export async function ensureBaseData(db: Db): Promise<void> {
  for (let i = 0; i < LEVEL_RUBRIC.length; i++) {
    await db.query('insert into difficulty_definitions(level,title,rubric) values ($1,$2,$3) on conflict do nothing', [i + 1, LEVEL_RUBRIC[i]![0], LEVEL_RUBRIC[i]![1]]);
  }
  await db.query("insert into categories(slug,name,description,published,sort_order) values ('custom','Custom (private)','Holds private custom pack questions. Never listed publicly.',false,999) on conflict (slug) do nothing");
}

/** Development seed. Idempotent. Never run in production (guarded by caller). */
export async function seedFixtures(db: Db): Promise<void> {
  const exists = await one(db, "select 1 from categories where slug='quran'");
  if (exists) return;
  await db.tx(async (q) => {
    for (const c of FIXTURE_CATEGORIES) {
      const cat = await one<{ id: string }>(q, 'insert into categories(slug,name,description,published,sort_order) values ($1,$2,$3,true,$4) returning id', [c.slug, c.name, c.description, c.sort]);
      for (const f of FIXTURE_QUESTIONS[c.slug] ?? []) {
        const qu = await one<{ id: string }>(q, 'insert into questions(category_id) values ($1) returning id', [cat!.id]);
        const v = await one<{ id: string }>(
          q,
          `insert into question_versions(question_id,text,explanation,level,reference,provenance,licence,status,is_fixture)
           values ($1,$2,$3,$4,$5,'Development fixture — NOT scholar-reviewed','Author-drafted for testing','draft',true) returning id`,
          [qu!.id, f.t, f.e, f.l, f.r ?? ''],
        );
        for (let i = 0; i < 4; i++) await q.query('insert into question_options(version_id,option_id,text,is_correct) values ($1,$2,$3,$4)', [v!.id, OPTION_IDS[i], f.o[i], i === f.c]);
        await q.query("update question_versions set status='published', published_at=now() where id=$1", [v!.id]);
      }
    }
  });
}

const playable = (allowFixtures: boolean) =>
  `qv.status = 'published' and q.scope = 'platform' and c.published ${allowFixtures ? '' : 'and not qv.is_fixture'}`;

export async function publishedTopics(q: Queryable, allowFixtures: boolean) {
  const cats = await many<{ id: string; slug: string; name: string; description: string }>(
    q, 'select id, slug, name, description from categories where published order by sort_order, name');
  const counts = await many<{ category_id: string; level: number; n: number }>(
    q,
    `select q.category_id, qv.level, count(*)::int n from question_versions qv
       join questions q on q.id = qv.question_id join categories c on c.id = q.category_id
      where ${playable(allowFixtures)} group by q.category_id, qv.level`,
  );
  return cats.map((c) => {
    const mine = counts.filter((x) => x.category_id === c.id);
    return { ...c, questionCount: mine.reduce((s, x) => s + x.n, 0), levels: mine.map((x) => ({ level: x.level, count: x.n })).sort((a, b) => a.level - b.level) };
  });
}

export async function loadPlatformPool(q: Queryable, categoryIds: string[], allowFixtures: boolean): Promise<PoolQuestion[]> {
  if (!categoryIds.length) return [];
  const rows = await many<{ versionId: string; canonicalId: string; categoryId: string; level: number }>(
    q,
    `select qv.id as "versionId", q.id as "canonicalId", q.category_id as "categoryId", qv.level
       from question_versions qv join questions q on q.id = qv.question_id join categories c on c.id = q.category_id
      where ${playable(allowFixtures)} and q.category_id = any($1::uuid[])`,
    [categoryIds],
  );
  return rows;
}

export async function loadPackPool(q: Queryable, packId: string): Promise<PoolQuestion[]> {
  return many(
    q,
    `select qv.id as "versionId", q.id as "canonicalId", q.category_id as "categoryId", qv.level
       from question_versions qv join questions q on q.id = qv.question_id
      where q.pack_id = $1 and qv.status <> 'archived' and qv.status <> 'rejected'`,
    [packId],
  );
}

export async function snapshotsFor(q: Queryable, versionIds: string[]): Promise<Map<string, QuestionSnapshot>> {
  const rows = await many(
    q,
    `select qv.id, qv.question_id, qv.text, qv.explanation, qv.reference, qv.level, qv.disputed, qv.dispute_note, c.name as category_name
       from question_versions qv join questions q on q.id = qv.question_id join categories c on c.id = q.category_id
      where qv.id = any($1::uuid[])`,
    [versionIds],
  );
  const opts = await many(q, 'select version_id, option_id, text, is_correct from question_options where version_id = any($1::uuid[]) order by option_id', [versionIds]);
  const out = new Map<string, QuestionSnapshot>();
  for (const r of rows) {
    const o = opts.filter((x) => x.version_id === r.id);
    out.set(r.id, {
      versionId: r.id, canonicalId: r.question_id, text: r.text,
      options: o.map((x) => ({ id: x.option_id, text: x.text })),
      correctOptionId: o.find((x) => x.is_correct)?.option_id ?? 'a',
      explanation: r.explanation, reference: r.reference, categoryName: r.category_name, level: r.level,
      disputed: r.disputed, disputeNote: r.dispute_note,
    });
  }
  return out;
}

// ---- Authoring ------------------------------------------------------------------------------------
async function writeOptions(q: Queryable, versionId: string, input: QuestionInput) {
  await q.query('delete from question_options where version_id = $1', [versionId]);
  for (let i = 0; i < 4; i++) {
    await q.query('insert into question_options(version_id,option_id,text,is_correct) values ($1,$2,$3,$4)', [versionId, OPTION_IDS[i], input.options[i]!.trim(), i === input.correctIndex]);
  }
}

export async function createQuestion(q: Queryable, input: QuestionInput, o: { authorId: string; scope?: 'platform' | 'pack'; packId?: string; position?: number }) {
  const scope = o.scope ?? 'platform';
  const cat = await one(q, 'select 1 from categories where id = $1', [input.categoryId]);
  if (!cat) throw new HttpError(400, 'Unknown category', 'bad_category');
  const qu = await one<{ id: string }>(q, 'insert into questions(category_id, scope, pack_id, created_by) values ($1,$2,$3,$4) returning id', [input.categoryId, scope, o.packId ?? null, o.authorId]);
  const v = await one<{ id: string }>(
    q,
    `insert into question_versions(question_id,text,explanation,level,language,reference,provenance,licence,disputed,dispute_note,author_id,position)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [qu!.id, input.text, input.explanation, input.level, input.language, input.reference, input.provenance, input.licence, input.disputed, input.disputeNote, o.authorId, o.position ?? 0],
  );
  await writeOptions(q, v!.id, input);
  return { questionId: qu!.id, versionId: v!.id };
}

/** Edits drafts in place; a published/approved/in-review version is never mutated — a new draft version is created. */
export async function updateQuestion(q: Queryable, versionId: string, input: QuestionInput, actorId: string) {
  const cur = await one<{ id: string; question_id: string; status: string; version: number; scope: string }>(
    q, 'select qv.id, qv.question_id, qv.status, qv.version, qu.scope from question_versions qv join questions qu on qu.id = qv.question_id where qv.id = $1', [versionId]);
  if (!cur) throw new HttpError(404, 'Question not found');
  await q.query('update questions set category_id = $2 where id = $1', [cur.question_id, input.categoryId]);
  const inPlace = ['draft', 'changes_requested', 'rejected'].includes(cur.status) || cur.scope === 'pack';
  const fields = [input.text, input.explanation, input.level, input.language, input.reference, input.provenance, input.licence, input.disputed, input.disputeNote];
  if (inPlace) {
    await q.query(
      `update question_versions set text=$2, explanation=$3, level=$4, language=$5, reference=$6, provenance=$7, licence=$8, disputed=$9, dispute_note=$10,
         status = case when status in ('rejected','changes_requested') then 'draft' else status end where id=$1`,
      [versionId, ...fields]);
    await writeOptions(q, versionId, input);
    return { versionId, created: false };
  }
  const nv = await one<{ id: string }>(
    q,
    `insert into question_versions(question_id,version,text,explanation,level,language,reference,provenance,licence,disputed,dispute_note,author_id)
     select $1, coalesce(max(version),0)+1, $2,$3,$4,$5,$6,$7,$8,$9,$10,$11 from question_versions where question_id=$1 returning id`,
    [cur.question_id, ...fields, actorId]);
  await writeOptions(q, nv!.id, input);
  return { versionId: nv!.id, created: true };
}

export type ReviewAction = 'submit' | 'approve' | 'request_changes' | 'reject' | 'archive' | 'publish';

export async function reviewAction(q: Queryable, versionId: string, action: ReviewAction, actor: { id: string; role: string }, note = '') {
  const v = await one<{ id: string; status: string; author_id: string | null; question_id: string; scope: string }>(
    q, 'select qv.id, qv.status, qv.author_id, qv.question_id, qu.scope from question_versions qv join questions qu on qu.id=qv.question_id where qv.id=$1', [versionId]);
  if (!v) throw new HttpError(404, 'Question not found');
  if (v.scope !== 'platform') throw new HttpError(400, 'Custom pack questions are not part of platform review');
  const transitions: Record<ReviewAction, { from: string[]; to: string }> = {
    submit: { from: ['draft', 'changes_requested'], to: 'in_review' },
    approve: { from: ['in_review'], to: 'approved' },
    request_changes: { from: ['in_review', 'approved'], to: 'changes_requested' },
    reject: { from: ['in_review', 'approved'], to: 'rejected' },
    publish: { from: ['approved'], to: 'published' },
    archive: { from: ['draft', 'in_review', 'changes_requested', 'approved', 'published', 'rejected'], to: 'archived' },
  };
  const t = transitions[action];
  if (!t.from.includes(v.status)) throw new HttpError(409, `Cannot ${action} a ${v.status} question`, 'bad_transition');
  // Authoring and review are separate; super_admin may override explicitly (audited).
  let override = false;
  if ((action === 'approve' || action === 'publish') && v.author_id === actor.id) {
    if (actor.role !== 'super_admin') throw new HttpError(403, 'Authors cannot approve or publish their own questions', 'self_review');
    override = true;
  }
  try {
    await q.query('update question_versions set status=$2, published_at = case when $2 = \'published\' then now() else published_at end where id=$1', [versionId, t.to]);
  } catch (e) {
    throw new HttpError(422, (e as Error).message.replace(/^error: /i, ''), 'not_ready');
  }
  if (action === 'publish') await q.query("update question_versions set status='archived' where question_id=$1 and id<>$2 and status='published'", [v.question_id, versionId]);
  await q.query('insert into review_decisions(version_id, reviewer_id, action, note, override) values ($1,$2,$3,$4,$5)', [versionId, actor.id, action, note, override]);
  await audit(q, { actorId: actor.id, action: `question.${action}`, entityType: 'question_version', entityId: versionId, detail: { note, override, from: v.status, to: t.to } });
  return { status: t.to, override };
}

export async function listQuestions(q: Queryable, f: { status?: string; categoryId?: string; level?: number; search?: string; limit?: number; offset?: number }) {
  const where = ["qu.scope = 'platform'"];
  const p: unknown[] = [];
  if (f.status) { p.push(f.status); where.push(`qv.status = $${p.length}`); }
  if (f.categoryId) { p.push(f.categoryId); where.push(`qu.category_id = $${p.length}`); }
  if (f.level) { p.push(f.level); where.push(`qv.level = $${p.length}`); }
  if (f.search) { p.push(`%${f.search.replace(/[%_]/g, '')}%`); where.push(`qv.text ilike $${p.length}`); }
  p.push(f.limit ?? 50, f.offset ?? 0);
  return many(
    q,
    `select qv.id, qv.question_id as "questionId", qv.version, qv.text, qv.level, qv.status, qv.is_fixture as "isFixture", qv.created_at as "createdAt",
            c.name as "categoryName", qu.category_id as "categoryId", pr.display_name as "authorName"
       from question_versions qv join questions qu on qu.id = qv.question_id join categories c on c.id = qu.category_id
       left join profiles pr on pr.id = qv.author_id
      where ${where.join(' and ')} order by qv.created_at desc limit $${p.length - 1} offset $${p.length}`,
    p,
  );
}

export async function getQuestionDetail(q: Queryable, versionId: string) {
  const v = await one(
    q,
    `select qv.*, qu.category_id, qu.scope, qu.pack_id from question_versions qv join questions qu on qu.id=qv.question_id where qv.id=$1`, [versionId]);
  if (!v) return undefined;
  const options = await many(q, 'select option_id as id, text, is_correct as "isCorrect" from question_options where version_id=$1 order by option_id', [versionId]);
  const history = await many(q, `select d.action, d.note, d.override, d.created_at as "createdAt", p.display_name as "reviewer" from review_decisions d left join profiles p on p.id=d.reviewer_id where d.version_id=$1 order by d.created_at`, [versionId]);
  return { ...v, options, history };
}

export async function adminCounts(q: Queryable) {
  const s = await many<{ status: string; n: number }>(q, "select qv.status, count(*)::int n from question_versions qv join questions qu on qu.id=qv.question_id where qu.scope='platform' and not qv.is_fixture group by qv.status");
  const f = await one<{ n: number }>(q, "select count(*)::int n from question_versions where is_fixture");
  const reports = await one<{ n: number }>(q, "select count(*)::int n from content_reports where status='open'");
  return { byStatus: Object.fromEntries(s.map((x) => [x.status, x.n])), fixtures: f?.n ?? 0, openReports: reports?.n ?? 0 };
}
