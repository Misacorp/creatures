/**
 * Screenshots of a boss move's animation, one picture per phase, from the workbench page `BossAnimation`
 * (docs/design/boss-animations.md). For showing a boss's look to Misa, or checking a new one.
 *
 *   cd apps/activity && node scripts/boss-anim-shots.mjs [--look storm-sovereign|generic] [--moves id:shape,id:shape]
 *     [--shapes columns,row,...] [--phases windup,aim,throw,strike,impact] [--element spark] [--widths 390]
 *     [--out <dir>] [--sel '.wb-frame-stage']
 *
 * `--moves` takes move ids with their shape (the look's art for the move applies); `--shapes` takes bare shapes (the generic art, or
 * the look's art for the shape). With neither it shoots the Storm Sovereign's eight moves. Files are `<name>-<phase>-<width>.png`,
 * at twice the pixel density, plus `<name>-<width>.png` with the phases side by side. It starts its own Vite dev server and uses
 * Playwright with the preinstalled Chromium (PLAYWRIGHT_PATH / CHROME as for `shoot.mjs`). Nothing here ships in the game.
 */
/* global console, document */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { drawSheet } from './sheet.mjs';

const STORM = [
  'lightning-bolt:columns',
  'thunderclap:line3',
  'static-strike:line3',
  'forked-lightning:scatter',
  'judgement-bolt:single',
  'storm-front:all',
  'thunderbolt:single',
  'plain:chain',
];

const opts = {
  look: 'storm-sovereign',
  moves: null,
  shapes: null,
  phases: ['aim', 'throw', 'strike'],
  element: 'spark',
  widths: [390],
  out: 'screenshots/boss-anim',
  sel: '.wb-frame-stage',
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const [key, value] = [argv[i], argv[i + 1]];
  if (value === undefined) {
    console.error('usage: see the top of scripts/boss-anim-shots.mjs');
    process.exit(2);
  }
  if (key === '--look') opts.look = value;
  else if (key === '--moves') opts.moves = value.split(',');
  else if (key === '--shapes') opts.shapes = value.split(',');
  else if (key === '--phases') opts.phases = value.split(',');
  else if (key === '--element') opts.element = value;
  else if (key === '--widths') opts.widths = value.split(',').map((w) => Number.parseInt(w, 10));
  else if (key === '--out') opts.out = value;
  else if (key === '--sel') opts.sel = value;
  else {
    console.error(`unknown option ${key}`);
    process.exit(2);
  }
}

const jobs =
  opts.shapes !== null
    ? opts.shapes.map((shape) => ({ name: `generic-${shape}`, shape, moveId: '' }))
    : (opts.moves ?? STORM).map((m) => {
        const [moveId, shape] = m.split(':');
        return { name: moveId, shape, moveId };
      });

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
const outDir = resolve(opts.out);
mkdirSync(outDir, { recursive: true });
try {
  for (const width of opts.widths) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    for (const job of jobs) {
      const shots = [];
      for (const phase of opts.phases) {
        const props = {
          look: opts.look,
          element: opts.element,
          shape: job.shape,
          moveId: job.moveId,
          cells: 'auto',
          at: phase,
        };
        const hash = `c=BossAnimation&p=${encodeURIComponent(JSON.stringify(props))}&w=full&bg=dusk`;
        await page.goto(`http://localhost:${String(port)}/workbench.html?frame=1#${hash}`);
        await page.reload();
        await page.waitForSelector('.wb-frame-stage', { timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForSelector('.boss-anim');
        await page.waitForTimeout(400);
        const file = join(outDir, `${job.name}-${phase}-${String(width)}.png`);
        await page.locator(opts.sel).first().screenshot({ path: file });
        shots.push({ label: `${job.name}: ${phase}`, file });
      }
      await drawSheet(browser, shots, join(outDir, `${job.name}-${String(width)}.png`));
      for (const s of shots) console.log(s.file);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
