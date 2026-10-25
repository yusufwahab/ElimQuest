import { chromium } from '@playwright/test';
const out = process.argv[2], base = process.argv[3];
const b = await chromium.launch();
for (const [name, w, h, path, full] of [['landing-390', 390, 844, '/', true], ['landing-1440', 1440, 900, '/', false], ['host-390', 390, 844, '/games/new?template=family', false], ['host-1440', 1440, 1000, '/games/new', false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(base + path, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  await ctx.close();
}
await b.close();
