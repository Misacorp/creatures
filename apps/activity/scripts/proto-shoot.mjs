/**
 * Screenshots of the prototypes (`prototype.html`, `src/proto/`): every step of the tour of every prototype,
 * at a phone and at a desktop size, and a numbered flow sheet per prototype and size. For reviewing the
 * concepts and showing them to Misa.
 *
 *   cd apps/activity && node scripts/proto-shoot.mjs --out <dir> [--protos valley,party]
 *     [--sizes phone,desktop] [--wait 1500]
 *   cd apps/activity && node scripts/proto-shoot.mjs --out <dir> --shots <name>=<hash>,<name>=<hash> [--sizes ...]
 *
 * With `--shots` it takes named shots of any address instead of the tour: each `<hash>` is what follows `#` in
 * `prototype.html#...` (the return walk: `walk?step=1&visit=3&bare=1&t=4500`; `&t=<ms>` holds the walk at that
 * moment, a large one is its end), saved as `<out>/shots/<name>-<size>.png`. No flow sheets.
 *
 * Sizes: phone 390x844 (with Discord's phone safe areas, 40 px top and 24 px bottom, as `screens.mjs`) and
 * desktop 1440x900. Each shot opens `prototype.html#<proto>?step=<n>&bare=1` (`bare` hides the tour strip),
 * waits for the fonts and `--wait` ms (default 1500), and saves `<out>/<proto>/<nn>-<step id>-<size>.png`.
 * Per prototype and size it also writes a flow sheet, `<out>/<proto>-phone.png` (steps left to right) and
 * `<out>/<proto>-desktop.png` (a grid, four wide, at half size), each step labelled "1. Arrive" and so on.
 * Starts its own Vite server and uses Playwright with the preinstalled Chromium (PLAYWRIGHT_PATH, CHROME as in
 * `shoot.mjs`). Dev only.
 */
/* global console, document, window */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { drawSheet } from './sheet.mjs';

/** The steps of the tour: the same ids and titles as `src/proto/tour.ts` (a test keeps them equal). */
const STEPS = [
  ['arrive', 'Arrive'],
  ['claim-trip', 'Claim the trip'],
  ['send-trip', 'Send a trip'],
  ['workshop', 'Workshop'],
  ['raid', 'Raid placement'],
  ['evolve', 'Evolve'],
  ['peek', 'Peek'],
];
const ALL_PROTOS = ['valley', 'party'];
const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};
const USAGE =
  'usage: node scripts/proto-shoot.mjs --out <dir> [--protos valley,party | --shots <name>=<hash>,...] [--sizes phone,desktop] [--wait <ms>]';

function fail(message) {
  console.error(message);
  process.exit(2);
}

function readArgs(argv) {
  const opts = {
    out: null,
    protos: ALL_PROTOS,
    sizes: Object.keys(SIZES),
    wait: 1500,
    shots: null,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (value === undefined) fail(USAGE);
    if (key === '--out') opts.out = resolve(value);
    else if (key === '--protos') opts.protos = value.split(',');
    else if (key === '--sizes') opts.sizes = value.split(',');
    else if (key === '--wait') opts.wait = Number.parseInt(value, 10);
    else if (key === '--shots') {
      opts.shots = value.split(',').map((pair) => {
        const at = pair.indexOf('=');
        if (at < 1) fail(`bad shot ${pair}: use <name>=<hash>`);
        return [pair.slice(0, at), pair.slice(at + 1)];
      });
    } else fail(USAGE);
  }
  if (opts.out === null) fail(USAGE);
  for (const p of opts.protos) if (!ALL_PROTOS.includes(p)) fail(`unknown prototype ${p}`);
  for (const s of opts.sizes) if (!(s in SIZES)) fail(`unknown size ${s}`);
  return opts;
}

const opts = readArgs(process.argv.slice(2));
const started = Date.now();
const playwrightPath =
  process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address !== null ? address.port : 5173;
const base = `http://localhost:${String(port)}/`;
const browser = await chromium.launch(
  process.env.CHROME === undefined ? {} : { executablePath: process.env.CHROME },
);

const two = (n) => String(n).padStart(2, '0');

/** Opens one address in a fresh page at a size, settled, with the phone's safe areas on a phone. */
async function openShot(ctx, sizeName, hash) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}prototype.html#${hash}`);
  await page.waitForSelector('#prototype > *', { timeout: 20000 });
  if (sizeName === 'phone') {
    await page.evaluate(() => {
      const root = document.documentElement.style;
      root.setProperty('--discord-safe-area-inset-top', '40px');
      root.setProperty('--discord-safe-area-inset-bottom', '24px');
    });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(opts.wait);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  return { page, errors };
}

try {
  mkdirSync(opts.out, { recursive: true });
  if (opts.shots !== null) {
    mkdirSync(join(opts.out, 'shots'), { recursive: true });
    for (const sizeName of opts.sizes) {
      const { width, height } = SIZES[sizeName];
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      for (const [name, hash] of opts.shots) {
        const { page, errors } = await openShot(ctx, sizeName, hash);
        const file = join(opts.out, 'shots', `${name}-${sizeName}.png`);
        await page.screenshot({ path: file });
        for (const message of errors) console.error(`${name}: ${message}`);
        console.log(file);
        await page.close();
      }
      await ctx.close();
    }
  }
  for (const proto of opts.shots === null ? opts.protos : []) {
    mkdirSync(join(opts.out, proto), { recursive: true });
    for (const sizeName of opts.sizes) {
      const { width, height } = SIZES[sizeName];
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const shots = [];
      for (const [index, [stepId, title]] of STEPS.entries()) {
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${base}prototype.html#${proto}?step=${String(index + 1)}&bare=1`);
        await page.waitForSelector('#prototype > *', { timeout: 20000 });
        if (sizeName === 'phone') {
          await page.evaluate(() => {
            const root = document.documentElement.style;
            root.setProperty('--discord-safe-area-inset-top', '40px');
            root.setProperty('--discord-safe-area-inset-bottom', '24px');
          });
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(opts.wait);
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        const file = join(opts.out, proto, `${two(index + 1)}-${stepId}-${sizeName}.png`);
        await page.screenshot({ path: file });
        for (const message of errors)
          console.error(`${proto} step ${String(index + 1)}: ${message}`);
        shots.push({ label: title, file });
        console.log(file);
        await page.close();
      }
      await ctx.close();
      const sheet = join(opts.out, `${proto}-${sizeName}.png`);
      await drawSheet(
        browser,
        shots,
        sheet,
        sizeName === 'phone' ? { numbered: true } : { numbered: true, perRow: 4, scale: 0.5 },
      );
      console.log(sheet);
    }
  }
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await browser.close();
  await server.close();
}
