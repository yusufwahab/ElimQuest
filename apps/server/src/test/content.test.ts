import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createGame, login, register, startServer, topicIds, type TestServer } from './helpers';
import { csvSafe } from '../repo/util';

let s: TestServer;
let admin: string; let reviewer: string; let member: string;
beforeAll(async () => {
  s = await startServer();
  admin = await login(s, 'admin@dev.local');
  reviewer = await login(s, 'reviewer@dev.local');
  member = await login(s, 'host@dev.local');
});
afterAll(async () => { await s.close(); });

const q = (categoryId: string, text = 'Which city hosts the Kaaba?') => ({
  text, options: ['Madinah', 'Makkah', 'Taif', 'Jeddah'], correctIndex: 1, explanation: 'The Kaaba is in Makkah.', categoryId, level: 2, reference: '', provenance: 'Test author', licence: 'own',
});

describe('permissions', () => {
  it('admin routes need a platform role; member and anonymous are refused server-side', async () => {
    expect((await api(s, 'GET', '/api/admin/summary')).status).toBe(401);
    expect((await api(s, 'GET', '/api/admin/summary', undefined, { bearer: member })).status).toBe(403);
    expect((await api(s, 'GET', '/api/admin/summary', undefined, { bearer: reviewer })).status).toBe(200);
    expect((await api(s, 'GET', '/api/admin/users', undefined, { bearer: reviewer })).status).toBe(403); // super-admin only
    expect((await api(s, 'GET', '/api/admin/platform', undefined, { bearer: reviewer })).status).toBe(403);
  });
  it('role escalation attempts fail: members cannot grant roles, public sign-up grants nothing', async () => {
    const t = await register(s, `esc${Date.now()}@example.com`);
    const me = (await api(s, 'GET', '/api/me', undefined, { bearer: t })).body.user;
    expect(me.role).toBe('member');
    expect((await api(s, 'PUT', `/api/admin/users/${me.id}/role`, { role: 'super_admin' }, { bearer: t })).status).toBe(403);
    expect((await api(s, 'PUT', `/api/admin/users/${me.id}/role`, { role: 'super_admin' }, { bearer: reviewer })).status).toBe(403);
    expect((await api(s, 'PUT', `/api/admin/users/${me.id}/role`, { role: 'content_reviewer' }, { bearer: admin })).status).toBe(200);
    const audit = await api(s, 'GET', '/api/admin/audit', undefined, { bearer: admin });
    expect(audit.body.events.some((e: any) => e.action === 'role.grant')).toBe(true);
    // A forged token is rejected.
    expect((await api(s, 'GET', '/api/admin/summary', undefined, { bearer: t.slice(0, -3) + 'abc' })).status).toBe(401);
  });
  it('a super admin cannot change their own role', async () => {
    const me = (await api(s, 'GET', '/api/me', undefined, { bearer: admin })).body.user;
    expect((await api(s, 'PUT', `/api/admin/users/${me.id}/role`, { role: 'member' }, { bearer: admin })).status).toBe(400);
  });
});

describe('question lifecycle: author → review → publish controls playable inventory', () => {
  it('only exact approved+published versions are playable; authors cannot self-approve; edits version immutably', async () => {
    const cat = await api(s, 'POST', '/api/admin/categories', { name: 'Lifecycle Topic', slug: 'lifecycle', description: 'x', published: true, sortOrder: 50 }, { bearer: admin });
    const categoryId = cat.body.id;
    const topic = async () => (await api(s, 'GET', '/api/topics/lifecycle')).body.topic;
    expect((await topic()).questionCount).toBe(0);

    const created = await api(s, 'POST', '/api/admin/questions', q(categoryId), { bearer: reviewer });
    expect(created.status).toBe(201);
    const vid = created.body.versionId;
    expect((await topic()).questionCount).toBe(0);                                        // draft is not playable
    expect((await api(s, 'POST', `/api/admin/questions/${vid}/review`, { action: 'publish' }, { bearer: admin })).status).toBe(409); // must be approved first
    expect((await api(s, 'POST', `/api/admin/questions/${vid}/submit`, undefined, { bearer: reviewer })).status).toBe(200);
    expect((await api(s, 'POST', `/api/admin/questions/${vid}/review`, { action: 'approve' }, { bearer: reviewer })).body.code).toBe('self_review');
    expect((await topic()).questionCount).toBe(0);                                        // in review is not playable
    expect((await api(s, 'POST', `/api/admin/questions/${vid}/review`, { action: 'approve' }, { bearer: admin })).status).toBe(200);
    expect((await topic()).questionCount).toBe(0);                                        // approved is not yet published
    expect((await api(s, 'POST', `/api/admin/questions/${vid}/review`, { action: 'publish' }, { bearer: admin })).status).toBe(200);
    expect((await topic()).questionCount).toBe(1);                                        // now playable

    // Editing a published question creates a new draft version; the published one is untouched.
    const edit = await api(s, 'PUT', `/api/admin/questions/${vid}`, q(categoryId, 'Edited wording of the question?'), { bearer: reviewer });
    expect(edit.body.created).toBe(true); expect(edit.body.versionId).not.toBe(vid);
    const old = (await api(s, 'GET', `/api/admin/questions/${vid}`, undefined, { bearer: admin })).body;
    expect(old.status).toBe('published'); expect(old.text).toBe('Which city hosts the Kaaba?');
    expect((await topic()).questionCount).toBe(1);

    const detail = (await api(s, 'GET', `/api/admin/questions/${vid}`, undefined, { bearer: admin })).body;
    expect(detail.history.map((h: any) => h.action)).toEqual(['submit', 'approve', 'publish']);
    // Archiving removes it from the playable inventory.
    await api(s, 'POST', `/api/admin/questions/${vid}/review`, { action: 'archive' }, { bearer: admin });
    expect((await topic()).questionCount).toBe(0);
  });

  it('super-admin override of self-approval is explicit and audited', async () => {
    const cat = (await api(s, 'GET', '/api/admin/categories', undefined, { bearer: admin })).body.categories[0].id;
    const v = (await api(s, 'POST', '/api/admin/questions', q(cat, 'Override check question text here?'), { bearer: admin })).body.versionId;
    await api(s, 'POST', `/api/admin/questions/${v}/submit`, undefined, { bearer: admin });
    const r = await api(s, 'POST', `/api/admin/questions/${v}/review`, { action: 'approve', note: 'urgent' }, { bearer: admin });
    expect(r.body.override).toBe(true);
    const d = (await api(s, 'GET', `/api/admin/questions/${v}`, undefined, { bearer: admin })).body;
    expect(d.history.find((h: any) => h.action === 'approve').override).toBe(true);
  });

  it('bulk actions step many questions at once; fast-track is super-admin only and failures do not block the rest', async () => {
    const cat = (await api(s, 'GET', '/api/admin/categories', undefined, { bearer: admin })).body.categories[0].id;
    const ids: string[] = [];
    for (const n of ['one', 'two', 'three']) ids.push((await api(s, 'POST', '/api/admin/questions', q(cat, `Bulk check question number ${n} here?`), { bearer: reviewer })).body.versionId);
    const sub = await api(s, 'POST', '/api/admin/questions/bulk', { ids, action: 'submit' }, { bearer: reviewer });
    expect(sub.body).toMatchObject({ done: 3, failed: [] });
    expect((await api(s, 'POST', '/api/admin/questions/bulk', { ids, action: 'fast_track' }, { bearer: reviewer })).status).toBe(403);
    const appr = await api(s, 'POST', '/api/admin/questions/bulk', { ids: [...ids, ids[0]!], action: 'approve' }, { bearer: admin });
    expect(appr.body.done).toBe(3); expect(appr.body.failed).toHaveLength(1);              // the repeated id is already approved
    const pub = await api(s, 'POST', '/api/admin/questions/bulk', { ids, action: 'publish' }, { bearer: admin });
    expect(pub.body).toMatchObject({ done: 3, failed: [] });
    const fresh = (await api(s, 'POST', '/api/admin/questions', q(cat, 'Bulk fast track question text here?'), { bearer: reviewer })).body.versionId;
    expect((await api(s, 'POST', '/api/admin/questions/bulk', { ids: [fresh], action: 'fast_track' }, { bearer: admin })).body.done).toBe(1);
    expect((await api(s, 'GET', `/api/admin/questions/${fresh}`, undefined, { bearer: admin })).body.status).toBe('published');
    expect((await api(s, 'POST', '/api/admin/questions/bulk', { ids: [], action: 'publish' }, { bearer: admin })).status).toBe(400);
  });
  it('validates content and the database refuses to publish an unready version', async () => {
    const cat = (await api(s, 'GET', '/api/admin/categories', undefined, { bearer: admin })).body.categories[0].id;
    const dup = await api(s, 'POST', '/api/admin/questions', { ...q(cat), options: ['Same', 'same', 'C', 'D'] }, { bearer: admin });
    expect(dup.status).toBe(400);
    const none = await api(s, 'POST', '/api/admin/questions', { ...q(cat), explanation: '' }, { bearer: admin });
    expect(none.status).toBe(400);
    const bad = await s.db.query("insert into questions(category_id) values ($1) returning id", [cat]);
    const ver = await s.db.query("insert into question_versions(question_id,text,explanation,level) values ($1,'t','e',1) returning id", [bad.rows[0].id]);
    await expect(s.db.query("update question_versions set status='published' where id=$1", [ver.rows[0].id])).rejects.toThrow(/not ready/);
  });
});

describe('fixtures never reach a production-like game', () => {
  it('with ALLOW_FIXTURE_QUESTIONS=false there is no playable inventory and creation reports a shortage', async () => {
    const p = await startServer({ ALLOW_FIXTURE_QUESTIONS: 'false' });
    const t = await login(p);
    const topics = (await api(p, 'GET', '/api/topics')).body.topics;
    expect(topics.every((x: any) => x.questionCount === 0)).toBe(true);
    const res = await api(p, 'POST', '/api/games', { title: 'x', hostMode: 'competing', categoryIds: await topicIds(p), minLevel: 1, maxLevel: 10, settings: { questionLimit: 10, summitHeight: 5, timeLimitS: 30, maxPlayers: 20 }, openNow: true }, { bearer: t });
    expect(res.status).toBe(409); expect(res.body.code).toBe('shortage');
    await p.close();
  });
});

describe('row level security', () => {
  it('browser roles cannot read answer keys, games or participants; published categories are readable', async () => {
    await s.db.exec('set role anon');
    try {
      await expect(s.db.query('select * from question_options')).rejects.toThrow(/permission denied/);
      await expect(s.db.query('select * from game_questions')).rejects.toThrow(/permission denied/);
      await expect(s.db.query('select * from participants')).rejects.toThrow(/permission denied/);
      await expect(s.db.query('select * from profiles')).rejects.toThrow(/permission denied/);
      const cats = await s.db.query('select slug, published from categories');
      expect(cats.rows.length).toBeGreaterThan(0);
      expect(cats.rows.every((c: any) => c.published)).toBe(true);                    // RLS hides unpublished (e.g. custom)
    } finally { await s.db.exec('reset role'); }
    await s.db.exec('set role authenticated');
    try { await expect(s.db.query('select * from question_versions')).rejects.toThrow(/permission denied/); }
    finally { await s.db.exec('reset role'); }
  });
});

describe('import safety', () => {
  const csv = (rows: string[]) => Buffer.from(['question,option_a,option_b,option_c,option_d,correct,explanation,category,level,reference', ...rows].join('\n'));
  it('previews row errors and duplicates, saves only valid rows as drafts, never publishes', async () => {
    const file = csv([
      '"Which month is the fast observed in?","Rajab","Ramadan","Shawwal","Safar","B","Fasting is in Ramadan.","quran","2",""',
      '"Bad level row","A","B","C","D","A","e","quran","99",""',
      '"Which month is the fast observed in?","Rajab","Ramadan","Shawwal","Safar","B","Duplicate.","quran","2",""',
      '"Unknown cat","A","B","C","D","A","e","nonexistent","3",""',
      '"=HYPERLINK(""http://evil"")","A","B","C","D","A","e","quran","3",""',
    ]);
    const prev = await api(s, 'POST', '/api/admin/import/preview', undefined, { bearer: admin, raw: file, filename: 'q.csv' });
    expect(prev.status).toBe(200);
    expect(prev.body.summary).toMatchObject({ total: 5, invalid: 2, duplicates: 1 });
    expect(prev.body.rows[1].errors.join(' ')).toMatch(/level/);
    const saved = await api(s, 'POST', `/api/admin/import/${prev.body.batchId}/save`, undefined, { bearer: admin });
    expect(saved.body).toMatchObject({ saved: 2, status: 'draft' });
    const rows = await s.db.query("select status from question_versions where provenance like 'Imported from q.csv'");
    expect(rows.rows.length).toBe(2);
    expect(rows.rows.every((r: any) => r.status === 'draft')).toBe(true);
    expect((await api(s, 'POST', `/api/admin/import/${prev.body.batchId}/save`, undefined, { bearer: admin })).status).toBe(404); // not re-savable
  });
  it('rejects macro workbooks, fake xlsx, oversize files and too many rows', async () => {
    expect((await api(s, 'POST', '/api/admin/import/preview', undefined, { bearer: admin, raw: Buffer.from('x'), filename: 'evil.xlsm' })).status).toBe(415);
    expect((await api(s, 'POST', '/api/admin/import/preview', undefined, { bearer: admin, raw: Buffer.from('not a zip'), filename: 'fake.xlsx' })).status).toBe(415);
    expect((await api(s, 'POST', '/api/admin/import/preview', undefined, { bearer: admin, raw: Buffer.from('x'.repeat(2 * 1024 * 1024 + 10)), filename: 'big.csv' })).status).toBe(413);
    const many = csv(Array.from({ length: 1001 }, (_, i) => `"Q${i}","a","b","c","d","A","e","quran","1",""`));
    expect((await api(s, 'POST', '/api/admin/import/preview', undefined, { bearer: admin, raw: many, filename: 'many.csv' })).status).toBe(413);
    expect((await api(s, 'POST', '/api/admin/import/preview', undefined, { bearer: member, raw: csv([]), filename: 'x.csv' })).status).toBe(403);
  });
  it('CSV exports neutralise formula injection', () => {
    expect(csvSafe('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvSafe('+1')).toBe(`"'+1"`); expect(csvSafe('@cmd')).toBe(`"'@cmd"`); expect(csvSafe('-2')).toBe(`"'-2"`);
    expect(csvSafe('Amina "A"')).toBe('"Amina ""A"""');
  });
});

describe('custom packs', () => {
  it('are private, force audience mode, import from CSV, and games use only pack questions', async () => {
    const owner = await register(s, `packowner${Date.now()}@example.com`, 'Pack Owner');
    const other = await register(s, `other${Date.now()}@example.com`, 'Other');
    const pack = (await api(s, 'POST', '/api/packs', { title: 'My pack', description: '' }, { bearer: owner })).body.id;
    expect((await api(s, 'GET', `/api/packs/${pack}`, undefined, { bearer: other })).status).toBe(404);   // isolation
    expect((await api(s, 'GET', `/api/packs`, undefined, { bearer: other })).body.packs).toHaveLength(0);

    const rows = Array.from({ length: 10 }, (_, i) => `"Pack question ${i} text?","One ${i}","Two ${i}","Three ${i}","Four ${i}","${'ABCD'[i % 4]}","Because ${i}.","custom","${(i % 5) + 1}",""`);
    const file = Buffer.from(['question,option_a,option_b,option_c,option_d,correct,explanation,category,level,reference', ...rows].join('\n'));
    const prev = await api(s, 'POST', `/api/packs/${pack}/import/preview`, undefined, { bearer: owner, raw: file, filename: 'pack.csv' });
    expect(prev.body.summary.valid).toBe(10);
    expect((await api(s, 'POST', `/api/packs/${pack}/import/${prev.body.batchId}/save`, undefined, { bearer: owner })).body.saved).toBe(10);
    expect((await api(s, 'POST', `/api/packs/${pack}/import/${prev.body.batchId}/save`, undefined, { bearer: other })).status).toBe(404);

    // Pack questions never leak into the public topic inventory.
    const customTopic = (await api(s, 'GET', '/api/topics')).body.topics.find((t: any) => t.slug === 'custom');
    expect(customTopic).toBeUndefined();

    const g = await api(s, 'POST', '/api/games', { title: 'Pack game', hostMode: 'competing', source: 'pack', packId: pack, categoryIds: [], minLevel: 1, maxLevel: 10, settings: { questionLimit: 10, summitHeight: 5, timeLimitS: 30, maxPlayers: 20 }, openNow: true }, { bearer: owner });
    expect(g.status).toBe(201);
    expect(g.body.hostMode).toBe('audience');                                         // competing request was overridden
    const stolen = await api(s, 'POST', '/api/games', { title: 'x', hostMode: 'audience', source: 'pack', packId: pack, categoryIds: [], minLevel: 1, maxLevel: 10, settings: { questionLimit: 10, summitHeight: 5, timeLimitS: 30, maxPlayers: 20 }, openNow: true }, { bearer: other });
    expect(stolen.status).toBe(404);                                                  // cannot host someone else's pack
    const share = await api(s, 'GET', `/api/games/${g.body.id}/share`, undefined, { bearer: owner });
    expect(JSON.stringify(share.body)).not.toMatch(/Pack question/);                 // share preview leaks no questions
    expect((await api(s, 'GET', `/api/games/${g.body.id}/share`, undefined, { bearer: other })).status).toBe(404);
    // A pack with too few questions reports a shortage rather than padding.
    const small = (await api(s, 'POST', '/api/packs', { title: 'tiny', description: '' }, { bearer: owner })).body.id;
    const short = await api(s, 'POST', '/api/games', { title: 'x', hostMode: 'audience', source: 'pack', packId: small, categoryIds: [], minLevel: 1, maxLevel: 10, settings: { questionLimit: 10, summitHeight: 5, timeLimitS: 30, maxPlayers: 20 }, openNow: true }, { bearer: owner });
    expect(short.status).toBe(409); expect(short.body.code).toBe('shortage');
    void createGame;
  });
});
