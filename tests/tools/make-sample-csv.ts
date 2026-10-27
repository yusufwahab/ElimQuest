// Writes docs/sample-questions.csv from the dev fixtures, in the admin import format.
import { writeFileSync } from 'node:fs';
import { FIXTURE_CATEGORIES, FIXTURE_QUESTIONS } from '../../apps/server/src/db/fixtures';
const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
const rows = ['question,option_a,option_b,option_c,option_d,correct,explanation,category,level,reference'];
for (const c of FIXTURE_CATEGORIES) for (const f of FIXTURE_QUESTIONS[c.slug] ?? []) rows.push([f.t, ...f.o, 'ABCD'[f.c], f.e, c.slug, f.l, f.r ?? ''].map(q).join(','));
writeFileSync('docs/sample-questions.csv', rows.join('\n') + '\n');
console.log(`wrote ${rows.length - 1} questions`);
