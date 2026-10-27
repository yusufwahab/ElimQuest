// Finds relative imports whose capitalisation doesn't match the real file name (works on Windows, breaks on Linux hosts like Render/Vercel).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';

const roots = ['apps/server/src', 'apps/web/src', 'packages/game-core/src', 'packages/contracts/src', 'packages/config/src'];
const exts = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '.css', '/index.ts', '/index.tsx'];
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : walk(p);
  return /\.(tsx?|mjs|js)$/.test(n) ? [p] : [];
});
/** True only if every path segment exists with exactly this capitalisation. */
const existsExact = (p) => {
  const abs = resolve(p);
  let cur = parse(abs).root;
  for (const seg of relative(cur, abs).split(sep).filter(Boolean)) {
    let list;
    try { list = readdirSync(cur); } catch { return false; }
    if (!list.includes(seg)) return false;
    cur = join(cur, seg);
  }
  return true;
};
let bad = 0, total = 0;
for (const root of roots) {
  for (const f of walk(root)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      total++;
      const target = join(dirname(f), m[1].split('?')[0]);
      if (!exts.some((e) => existsExact(target + e))) { bad++; console.log(`CASE/MISSING: ${f} -> ${m[1]}`); }
    }
  }
}
console.log(`${total} relative imports checked, ${bad} problems`);
process.exit(bad ? 1 : 0);
