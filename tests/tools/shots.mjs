// Visual QA helper: node tests/tools/shots.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? 'shots';
const base = process.argv[3] ?? 'http://localhost:4173';
const widths = [[320, 640], [375, 760], [390, 800], [768, 1000], [1024, 768], [1440, 900], [1920, 1080]];
const b = await chromium.launch();
for (const [w, h] of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`${base}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/home-${w}.png`, fullPage: w <= 390 });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(w, 'horizontal overflow:', overflow);
  await ctx.close();
}
await b.close();
