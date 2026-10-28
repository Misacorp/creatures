/**
 * Screenshots of one workbench page at a phone and a desktop width, side by side, for showing work
 * to Misa (docs/design/ux-patterns.md, "Showing work to Misa": every round has both widths).
 *
 *   cd apps/activity && node scripts/shoot.mjs <Entry> [--props '{"fight":"Raid"}'] [--widths 390,1100]
 *     [--sel 'section.stage'] [--wait 1500] [--out <dir>] [--name <file name>]
 *     [--shell 40,24] [--scroll 600] [--click 'button[aria-label^="Signature"]']
 *
 * It opens the entry (with `--props` over its defaults) in a real window per width, like
 * `ui-audit.mjs`, at twice the pixel density, waits `--wait` ms (animations, fonts), and saves
 * `<name>-<width>.png` for each width plus `<name>.png` with them side by side, labelled. `--sel`
 * shoots one element of the page (default: the whole workbench stage). `--click <css>` taps the first
 * element that matches before the shot, so a popover, drawer or menu shows open; give it more than once
 * to tap in turn (each tap waits 400 ms). The output folder defaults to
 * `screenshots/` here (gitignored); point `--out` at a scratch folder to keep the repo clean.
 *
 * `--shell <top,bottom>` shoots the game's frame as a phone in Discord sees it, for any change to the HUD, the
 * dock or the top of a page (retro 2026-10-25: a gap under the dock, a page showing above the HUD and a field cut
 * under it were only found on Misa's phone). The entry must draw the HUD and the dock (MainNav, HomePage, with
 * `--props` for the place). The script lifts its HUD, screen and dock into a real `main.card` in the document
 * (so the window scrolls and fixed bars are fixed, as in the app), sets Discord's safe areas
 * (`--discord-safe-area-inset-top` / `-bottom`, in px), and saves the window at the top of the page
 * (`<name>-<width>-top.png`) and scrolled by `--scroll` px (default 600; `<name>-<width>-scrolled.png`), on a
 * 844 px high window. Widths default to 390. It cannot show momentum scrolling or Discord's exact strips.
 *
 * It starts its own Vite dev server and uses Playwright with the preinstalled Chromium: set
 * PLAYWRIGHT_PATH to `playwright/index.mjs` and CHROME to the Chromium binary if they are not in the
 * default places. Nothing here ships in the game.
 */
/* global console, document, window */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { drawSheet } from './sheet.mjs';

const USAGE =
  "usage: node scripts/shoot.mjs <Entry> [--props '<json>'] [--widths 390,1100] [--sel <css>] [--wait <ms>] [--out <dir>] [--name <name>] [--shell <top,bottom>] [--scroll <px>] [--click <css>]...";

function readArgs(argv) {
  const [entry, ...rest] = argv;
  if (entry === undefined || entry.startsWith('--')) {
    console.error(USAGE);
    process.exit(2);
  }
  const opts = { entry, props: {}, widths: null, sel: '.wb-frame-stage', wait: 1500 };
  opts.shell = null;
  opts.scroll = 600;
  opts.out = 'screenshots';
  opts.clicks = [];
  opts.name = entry.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (let i = 0; i < rest.length; i += 2) {
    const [key, value] = [rest[i], rest[i + 1]];
    if (value === undefined) {
      console.error(USAGE);
      process.exit(2);
    }
    if (key === '--props') opts.props = JSON.parse(value);
    else if (key === '--widths') opts.widths = value.split(',').map((w) => Number.parseInt(w, 10));
    else if (key === '--sel') opts.sel = value;
    else if (key === '--wait') opts.wait = Number.parseInt(value, 10);
    else if (key === '--out') opts.out = value;
    else if (key === '--name') opts.name = value.replace(/[^A-Za-z0-9._-]+/g, '-');
    else if (key === '--shell') {
      const [top, bottom] = value.split(',').map((n) => Number.parseInt(n, 10));
      if (!Number.isFinite(top) || !Number.isFinite(bottom ?? 0)) {
        console.error('--shell wants the safe areas in px, top and bottom, like 40,24');
        process.exit(2);
      }
      opts.shell = { top, bottom: bottom ?? 0 };
    } else if (key === '--scroll') opts.scroll = Number.parseInt(value, 10);
    else if (key === '--click') opts.clicks.push(value);
    else {
      console.error(USAGE);
      process.exit(2);
    }
  }
  opts.widths ??= opts.shell === null ? [390, 1100] : [390];
  if (opts.widths.some((w) => !Number.isFinite(w) || w < 200)) {
    console.error('--widths wants a list of pixel widths, like 390,1100');
    process.exit(2);
  }
  return opts;
}

const opts = readArgs(process.argv.slice(2));
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

/** The `--shell` shots: the entry's HUD, screen and dock in a real `main.card`, at the top and scrolled. */
async function shootShell(page, width) {
  const missing = await page.evaluate((insets) => {
    const hud = document.querySelector('.wb-frame-stage .hud');
    const dock = document.querySelector('.wb-frame-stage .main-nav.dock');
    const screen = document.querySelector('.wb-frame-stage .nd-screen');
    if (hud === null || dock === null || screen === null) return true;
    const main = document.createElement('main');
    main.className = 'card';
    const shell = document.createElement('div');
    shell.className = 'nav-shell';
    const inner = document.createElement('div');
    inner.append(...screen.childNodes);
    shell.append(inner, dock);
    main.append(hud, shell);
    document.body.replaceChildren(main);
    const root = document.documentElement.style;
    root.setProperty('--discord-safe-area-inset-top', `${String(insets.top)}px`);
    root.setProperty('--discord-safe-area-inset-bottom', `${String(insets.bottom)}px`);
    return false;
  }, opts.shell);
  if (missing) {
    console.error(
      `--shell: ${opts.entry} draws no HUD, screen and dock at ${String(width)} px (try MainNav or HomePage at a phone width)`,
    );
    process.exitCode = 1;
    return;
  }
  await page.waitForTimeout(300);
  for (const [at, top] of [
    ['top', 0],
    ['scrolled', opts.scroll],
  ]) {
    await page.evaluate((y) => {
      window.scrollTo(0, y);
    }, top);
    await page.waitForTimeout(200);
    const file = join(outDir, `${opts.name}-${String(width)}-${at}.png`);
    await page.screenshot({ path: file });
    shots.push({ label: `${String(width)} px, ${at}`, file });
  }
}

const outDir = resolve(opts.out);
mkdirSync(outDir, { recursive: true });
const shots = [];
try {
  for (const width of opts.widths) {
    const ctx = await browser.newContext({
      viewport: { width, height: opts.shell === null ? 900 : 844 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const hash = `c=${encodeURIComponent(opts.entry)}&p=${encodeURIComponent(JSON.stringify(opts.props))}&w=full&bg=dusk`;
    await page.goto(`${base}workbench.html?frame=1#${hash}`);
    await page.waitForSelector('.wb-frame-stage', { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(opts.wait);
    for (const target of opts.clicks) {
      await page.locator(target).first().click();
      await page.waitForTimeout(400);
    }
    if (opts.shell !== null) {
      await shootShell(page, width);
      await ctx.close();
      continue;
    }
    const file = join(outDir, `${opts.name}-${String(width)}.png`);
    await page.locator(opts.sel).first().screenshot({ path: file });
    shots.push({ label: `${String(width)} px`, file });
    await ctx.close();
  }

  if (shots.length === 0) process.exit(process.exitCode ?? 1);
  // The widths side by side on one image, each labelled, so one file shows both.
  const sheet = join(outDir, `${opts.name}.png`);
  await drawSheet(browser, shots, sheet);
  for (const s of shots) console.log(s.file);
  console.log(sheet);
} finally {
  await browser.close();
  await server.close();
}
