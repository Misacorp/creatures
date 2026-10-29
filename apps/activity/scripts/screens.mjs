/**
 * Screenshots of every main screen of the game in the game's real frame (HUD, the living room band on a wide
 * window, dock or rail, the screen) on fixture data, at a phone and at desktop sizes, under each look (an app-wide
 * visual style, `src/looks.ts`). For designing looks and layouts.
 *
 *   cd apps/activity && node scripts/screens.mjs --out <dir> [--looks current,arcade]
 *     [--screens home,collection,...] [--sizes phone,wide,desktop,hd] [--room every,home] [--wait 1500]
 *
 * Sizes: phone 390x844 (the window at the top, plus the whole page capped at 2400 px high, with Discord's phone
 * safe areas: 40 px top, 24 px bottom), wide 1100x800 (just above the desktop break), desktop 1440x900 and hd 1920x1080 (the window only). Each shot opens the
 * workbench's `GameScreens` page bare (`workbench.html?frame=1&bare=1`), so `main.card` and its media queries
 * behave as in the game.
 *
 * `--room` picks where the living room is drawn on a wide window (`ROOM_MODES` in `src/looks.ts`: `every`, the
 * band under the HUD on every place, the default; `home`, a taller band on Home only). With more than one value the
 * look's folder, sheets and comparisons get the mode in their name (`<look>-room-home`); with one, the layout is
 * unchanged.
 *
 * Writes `<out>/<look>/<screen>-<size>.png` (phone: also `-full`), per look a labelled contact sheet of all
 * screens (`<out>/<look>-desktop.png` at 1440, `<out>/<look>-phone.png` at 390), and per screen one image of it
 * under every look (`<out>/compare-<screen>.png`, desktop when shot, else phone). Starts its own Vite server and
 * uses Playwright with the preinstalled Chromium (PLAYWRIGHT_PATH, CHROME as in `shoot.mjs`). Dev only.
 */
/* global console, document, window */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const ALL_SCREENS = [
  'home',
  'collection',
  'workshop',
  'journal',
  'expeditions',
  'dungeon',
  'raid',
  'games',
];
const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
  wide: { width: 1100, height: 800 },
  hd: { width: 1920, height: 1080 },
};
const ROOMS = ['every', 'home'];
const FULL_CAP = 2400;
const USAGE =
  'usage: node scripts/screens.mjs --out <dir> [--looks current,arcade] [--screens home,collection] [--sizes phone,wide,desktop,hd] [--room every,home] [--wait <ms>]';

function readArgs(argv) {
  const opts = {
    out: null,
    looks: ['current'],
    screens: ALL_SCREENS,
    sizes: Object.keys(SIZES),
    rooms: ['every'],
    wait: 1500,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (value === undefined) fail(USAGE);
    if (key === '--out') opts.out = resolve(value);
    else if (key === '--looks') opts.looks = value.split(',');
    else if (key === '--screens') opts.screens = value.split(',');
    else if (key === '--sizes') opts.sizes = value.split(',');
    else if (key === '--room') opts.rooms = value.split(',');
    else if (key === '--wait') opts.wait = Number.parseInt(value, 10);
    else fail(USAGE);
  }
  if (opts.out === null) fail(USAGE);
  for (const s of opts.screens) if (!ALL_SCREENS.includes(s)) fail(`unknown screen ${s}`);
  for (const s of opts.sizes) if (!(s in SIZES)) fail(`unknown size ${s}`);
  for (const r of opts.rooms) if (!ROOMS.includes(r)) fail(`unknown room mode ${r}`);
  return opts;
}

function fail(message) {
  console.error(message);
  process.exit(2);
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

/** Opens one screen under one look and room mode in a window of a size; resolves with the page, drawn and settled. */
async function open(ctx, look, room, screen, isPhone) {
  const page = await ctx.newPage();
  const props = JSON.stringify({ screen, look, room });
  const hash = `c=GameScreens&p=${encodeURIComponent(props)}&w=full&bg=dusk`;
  await page.goto(`${base}workbench.html?frame=1&bare=1#${hash}`);
  await page.waitForSelector('main.card .nav-shell', { timeout: 20000 });
  if (isPhone) {
    await page.evaluate(() => {
      const root = document.documentElement.style;
      root.setProperty('--discord-safe-area-inset-top', '40px');
      root.setProperty('--discord-safe-area-inset-bottom', '24px');
    });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(opts.wait);
  // Some screens scroll themselves into view (the dungeon map): every shot starts at the top.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  return page;
}

const files = {}; // files[key][screen][size] = path, key: the look, or `<look>-room-<mode>` with several modes
/** The name of a look's folder: with several room modes each gets its own. */
const keyOf = (look, room) => (opts.rooms.length > 1 ? `${look}-room-${room}` : look);
const keys = opts.looks.flatMap((look) =>
  opts.rooms.map((room) => ({ look, room, key: keyOf(look, room) })),
);
try {
  for (const { look, room, key } of keys) {
    mkdirSync(join(opts.out, key), { recursive: true });
    files[key] = {};
    for (const sizeName of opts.sizes) {
      const { width, height } = SIZES[sizeName];
      const isPhone = sizeName === 'phone';
      const ctx = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      for (const screen of opts.screens) {
        const page = await open(ctx, look, room, screen, isPhone);
        const file = join(opts.out, key, `${screen}-${sizeName}.png`);
        await page.screenshot({ path: file });
        (files[key][screen] ??= {})[sizeName] = file;
        if (isPhone) {
          const tall = await page.evaluate(() => document.documentElement.scrollHeight);
          const fullFile = join(opts.out, key, `${screen}-phone-full.png`);
          await page.setViewportSize({ width, height: Math.min(Math.max(tall, height), FULL_CAP) });
          await page.waitForTimeout(300);
          await page.screenshot({ path: fullFile });
        }
        console.log(file);
        await page.close();
      }
      await ctx.close();
    }
  }

  // Contact sheets: all screens of a look at one size, labelled; screens of a look side by side per size.
  for (const { key } of keys) {
    for (const [sizeName, suffix, perRow] of [
      ['desktop', 'desktop', 2],
      ['phone', 'phone', 0],
    ]) {
      const shots = opts.screens
        .map((s) => ({ label: `${key}: ${s}`, file: files[key][s]?.[sizeName] }))
        .filter((s) => s.file !== undefined);
      if (shots.length === 0) continue;
      const out = join(opts.out, `${key}-${suffix}.png`);
      await sheetOf(shots, out, perRow, sizeName === 'desktop' ? 0.5 : 1);
      console.log(out);
    }
  }
  // One screen across all looks.
  for (const screen of opts.screens) {
    const sizeName = opts.sizes.includes('desktop') ? 'desktop' : opts.sizes[0];
    for (const room of opts.rooms) {
      const shots = opts.looks
        .map((look) => ({
          label: `${keyOf(look, room)}: ${screen} (${sizeName})`,
          file: files[keyOf(look, room)]?.[screen]?.[sizeName],
        }))
        .filter((s) => s.file !== undefined);
      if (shots.length === 0) continue;
      const out = join(
        opts.out,
        opts.rooms.length > 1 ? `compare-${screen}-room-${room}.png` : `compare-${screen}.png`,
      );
      await sheetOf(shots, out, sizeName === 'phone' ? 0 : 2, sizeName === 'desktop' ? 0.5 : 1);
      console.log(out);
    }
  }
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await browser.close();
  await server.close();
}

/**
 * A labelled sheet of `shots`, `perRow` to a row (0: all in one row), each scaled by `scale`. Same look as
 * `sheet.mjs`'s `drawSheet`, which draws one unscaled row only; labels are set as text.
 */
async function sheetOf(shots, out, perRow, scale) {
  const { readFileSync } = await import('node:fs');
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(
    '<body style="margin:0;padding:24px;background:#17132b;width:max-content;font:bold 24px sans-serif;color:#ffd25a"></body>',
  );
  await page.evaluate(
    ({ cells, perRow, scale }) => {
      const grid = document.createElement('div');
      grid.style.cssText = `display:grid;gap:24px;align-items:start;grid-template-columns:repeat(${String(perRow === 0 ? cells.length : perRow)},max-content)`;
      for (const cell of cells) {
        const figure = document.createElement('figure');
        figure.style.margin = '0';
        const caption = document.createElement('figcaption');
        caption.textContent = cell.label;
        caption.style.marginBottom = '10px';
        const img = document.createElement('img');
        img.src = cell.src;
        img.dataset['scale'] = String(scale);
        img.addEventListener('load', () => {
          img.style.width = `${String(Math.round(img.naturalWidth * scale))}px`;
        });
        figure.append(caption, img);
        grid.append(figure);
      }
      document.body.append(grid);
    },
    {
      cells: shots.map((s) => ({
        label: s.label,
        src: `data:image/png;base64,${readFileSync(s.file).toString('base64')}`,
      })),
      perRow,
      scale,
    },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}
