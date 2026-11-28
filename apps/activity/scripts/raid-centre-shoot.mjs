/**
 * Screenshots and centring measurements of the RaidCanvas board (workbench entry), at phone and desktop widths.
 *
 *   cd apps/activity && node scripts/raid-centre-shoot.mjs <before|after> [--out ../../screenshots/raid-centre]
 *
 * Files are `<prefix>-<state>-<width>.png`; each line printed is the offset in px of the seats, the boss and the now line from the
 * middle of the space the scene leaves (positive: right of it).
 */
/* global document, console */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const prefix = process.argv[2] ?? 'after';
const oi = process.argv.indexOf('--out');
const out = resolve(oi < 0 ? '../../screenshots/raid-centre' : process.argv[oi + 1]);
mkdirSync(out, { recursive: true });
const playwrightPath =
  process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address !== null ? address.port : 5173;
const browser = await chromium.launch(
  process.env.CHROME === undefined ? {} : { executablePath: process.env.CHROME },
);
const SHOTS = [
  ['placing', { state: 'placing' }],
  ['stage', { state: 'stage playing' }],
];
const WIDTHS = [
  [360, 800],
  [390, 800],
  [412, 800],
  [1440, 900],
  [1920, 1080],
];
try {
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 2,
    });
    const list = [...SHOTS];
    if (w >= 1440) {
      list.push(['drawer-left', { state: 'placing', open: 'players' }]);
      list.push(['drawer-right', { state: 'placing', open: 'your creature' }]);
    }
    for (const [label, props] of list) {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error('pageerror', e.message));
      const hash = `c=RaidCanvas&p=${encodeURIComponent(JSON.stringify(props))}&w=full&bg=dusk`;
      await page.goto(`http://localhost:${String(port)}/workbench.html?frame=1#${hash}`);
      await page.waitForSelector('.rc-scene', { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(label === 'stage' ? 2500 : 1200);
      const m = await page.evaluate(() => {
        const scene = document.querySelector('.rc-scene');
        const sr = scene.getBoundingClientRect();
        const sm = sr.left + sr.width / 2;
        const mid = (el) => {
          if (el === null) return null;
          const r = el.getBoundingClientRect();
          return Math.round((r.left + r.width / 2 - sm) * 10) / 10;
        };
        const q = (s) => document.querySelector(s);
        let l = 1e9;
        let r = -1e9;
        for (const el of document.querySelectorAll(
          '.rc-scene .board-grid .sprite, .rc-scene .board-grid button',
        )) {
          const b = el.getBoundingClientRect();
          if (b.width === 0) continue;
          l = Math.min(l, b.left);
          r = Math.max(r, b.right);
        }
        return {
          sceneMid: Math.round(sm),
          sceneW: Math.round(sr.width),
          seats: r < l ? null : Math.round(((l + r) / 2 - sm) * 10) / 10,
          grid: mid(q('.rc-scene .board-grid')),
          boss: mid(q('.rc-boss-art, .stage-boss-art')),
          now: mid(q('.rc-now')),
          scrollW: document.documentElement.scrollWidth,
        };
      });
      const file = join(out, `${prefix}-${label}-${String(w)}.png`);
      await page.locator('.wb-raid-canvas').first().screenshot({ path: file });
      console.log(prefix, label, w, JSON.stringify(m));
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
