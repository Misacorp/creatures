/**
 * Screenshots of one workbench page at a phone and a desktop width, side by side, for showing work
 * to Misa (docs/design/ux-patterns.md, "Showing work to Misa": every round has both widths).
 *
 *   cd apps/activity && node scripts/shoot.mjs <Entry> [--props '{"fight":"Raid"}'] [--widths 390,1100]
 *     [--sel 'section.stage'] [--wait 1500] [--out <dir>] [--name <file name>]
 *
 * It opens the entry (with `--props` over its defaults) in a real window per width, like
 * `ui-audit.mjs`, at twice the pixel density, waits `--wait` ms (animations, fonts), and saves
 * `<name>-<width>.png` for each width plus `<name>.png` with them side by side, labelled. `--sel`
 * shoots one element of the page (default: the whole workbench stage). The output folder defaults to
 * `screenshots/` here (gitignored); point `--out` at a scratch folder to keep the repo clean.
 *
 * It starts its own Vite dev server and uses Playwright with the preinstalled Chromium: set
 * PLAYWRIGHT_PATH to `playwright/index.mjs` and CHROME to the Chromium binary if they are not in the
 * default places. Nothing here ships in the game.
 */
/* global console, document */
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const USAGE =
  "usage: node scripts/shoot.mjs <Entry> [--props '<json>'] [--widths 390,1100] [--sel <css>] [--wait <ms>] [--out <dir>] [--name <name>]";

function readArgs(argv) {
  const [entry, ...rest] = argv;
  if (entry === undefined || entry.startsWith('--')) {
    console.error(USAGE);
    process.exit(2);
  }
  const opts = { entry, props: {}, widths: [390, 1100], sel: '.wb-frame-stage', wait: 1500 };
  opts.out = 'screenshots';
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
    else {
      console.error(USAGE);
      process.exit(2);
    }
  }
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

const outDir = resolve(opts.out);
mkdirSync(outDir, { recursive: true });
const shots = [];
try {
  for (const width of opts.widths) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const hash = `c=${encodeURIComponent(opts.entry)}&p=${encodeURIComponent(JSON.stringify(opts.props))}&w=full&bg=dusk`;
    await page.goto(`${base}workbench.html?frame=1#${hash}`);
    await page.waitForSelector('.wb-frame-stage', { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(opts.wait);
    const file = join(outDir, `${opts.name}-${String(width)}.png`);
    await page.locator(opts.sel).first().screenshot({ path: file });
    shots.push({ width, file });
    await ctx.close();
  }

  // The widths side by side on one image, each labelled, so one file shows both.
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const cells = shots
    .map(
      (s) =>
        `<figure><figcaption>${String(s.width)} px</figcaption><img src="data:image/png;base64,${readFileSync(s.file).toString('base64')}"></figure>`,
    )
    .join('');
  await page.setContent(
    `<body style="margin:0;padding:24px;background:#17132b;display:flex;gap:24px;align-items:flex-start;width:max-content;font:bold 28px sans-serif;color:#ffd25a">${cells}</body>`,
  );
  await page.addStyleTag({ content: 'figure{margin:0} figcaption{margin-bottom:12px}' });
  await page.waitForTimeout(200);
  const sheet = join(outDir, `${opts.name}.png`);
  await page.screenshot({ path: sheet, fullPage: true });
  for (const s of shots) console.log(s.file);
  console.log(sheet);
} finally {
  await browser.close();
  await server.close();
}
