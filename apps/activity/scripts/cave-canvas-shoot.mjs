/**
 * Screenshots of the CaveCanvas workbench entry, every state, at 390 and 1100 px wide (device scale 2), for Misa's review page.
 *
 *   cd apps/activity && node scripts/cave-canvas-shoot.mjs [--only fight] [--out ../../screenshots/cave-canvas]
 *
 * Files are `<state>-<width>.png`; a state with a drawer also has `<state>-scene-<width>.png` (the scene alone: on a phone an open
 * drawer is a full page). The fight is shot after its banner, mid-fight.
 */
/* global console, document */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const out = resolve(flag('--out', '../../screenshots/cave-canvas'));
const only = flag('--only', null);
mkdirSync(out, { recursive: true });

/** [state, name, drawers closed, wait ms]. */
const SHOTS = [
  ['before a run', 'before-a-run', false, 1200],
  ['before a run', 'before-a-run-scene', true, 1200],
  ['loading', 'loading', true, 600],
  ['blocked', 'blocked', false, 1200],
  ['blocked', 'blocked-scene', true, 1200],
  ['retry', 'retry', false, 1200],
  ['retry', 'retry-scene', true, 1200],
  ['picking a path', 'picking-a-path', false, 1200],
  ['picking a path', 'picking-a-path-scene', true, 1200],
  ['mystery room', 'mystery-room', false, 1200],
  ['mystery room', 'mystery-room-scene', true, 1200],
  ['a fight', 'a-fight', true, 9000],
  ['camp', 'camp', false, 1200],
  ['camp', 'camp-scene', true, 1200],
  ['pack drawer', 'pack-drawer', false, 1200],
  ['way down', 'way-down', false, 1200],
  ['way down', 'way-down-scene', true, 1200],
  ['undercroft', 'undercroft', true, 1500],
  ['result', 'result', false, 1500],
  ['result', 'result-scene', true, 1500],
];

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
try {
  for (const width of [390, 1100]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
    });
    for (const [state, label, closed, wait] of SHOTS) {
      if (only !== null && label !== only) continue;
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error(label, 'pageerror', e.message));
      const props = { state, drawers: closed ? 'closed' : 'as the state opens them' };
      const hash = `c=CaveCanvas&p=${encodeURIComponent(JSON.stringify(props))}&w=full&bg=dusk`;
      await page.goto(`http://localhost:${String(port)}/workbench.html?frame=1#${hash}`);
      await page.waitForSelector('.wb-cave-canvas', { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(wait);
      const file = join(out, `${label}-${String(width)}.png`);
      await page.locator('.wb-cave-canvas').first().screenshot({ path: file });
      console.log(file);
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
