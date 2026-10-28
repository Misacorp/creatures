/**
 * One labelled image of several screenshots that belong together, for showing work to Misa
 * (docs/design/ux-patterns.md, "Showing work to Misa"): the steps of one flow (what started it,
 * then each state), or one view at both widths. Shots of unrelated things go in separate sheets.
 *
 *   cd apps/activity && node scripts/sheet.mjs --out <file.png> [--title '<what this shows>']
 *     '<label>=<shot.png>' '<label>=<shot.png>' ...
 *
 * The shots go left to right in the order given, each under its label; with `--numbered` the labels
 * get step numbers ("1. Press and hold"). Uses Playwright with the preinstalled Chromium, like
 * `shoot.mjs` (PLAYWRIGHT_PATH and CHROME override the default places). Nothing here ships in the game.
 */
/* global console, document */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Draws `shots` ({ label, file }) side by side, each under its label, with an optional title, and
 * saves the sheet to `out`. Labels are set as text, never as markup.
 */
export async function drawSheet(browser, shots, out, { title = null, numbered = false } = {}) {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(
    '<body style="margin:0;padding:24px;background:#17132b;width:max-content;font:bold 28px sans-serif;color:#ffd25a"></body>',
  );
  await page.evaluate(
    ({ title, cells }) => {
      if (title !== null) {
        const h = document.createElement('h1');
        h.textContent = title;
        h.style.cssText = 'margin:0 0 20px;font-size:32px;color:#f4ecd8';
        document.body.append(h);
      }
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:24px;align-items:flex-start';
      for (const cell of cells) {
        const figure = document.createElement('figure');
        figure.style.margin = '0';
        const caption = document.createElement('figcaption');
        caption.textContent = cell.label;
        caption.style.marginBottom = '12px';
        const img = document.createElement('img');
        img.src = cell.src;
        figure.append(caption, img);
        row.append(figure);
      }
      document.body.append(row);
    },
    {
      title,
      cells: shots.map((s, i) => ({
        label: numbered ? `${String(i + 1)}. ${s.label}` : s.label,
        src: `data:image/png;base64,${readFileSync(s.file).toString('base64')}`,
      })),
    },
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

const USAGE =
  "usage: node scripts/sheet.mjs --out <file.png> [--title '<text>'] [--numbered] '<label>=<shot.png>' ...";

function readArgs(argv) {
  const opts = { out: null, title: null, numbered: false, shots: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' || arg === '--title') {
      const value = argv[i + 1];
      if (value === undefined) return null;
      if (arg === '--out') opts.out = resolve(value);
      else opts.title = value;
      i += 1;
    } else if (arg === '--numbered') opts.numbered = true;
    else {
      const at = arg.lastIndexOf('=');
      if (at <= 0) return null;
      opts.shots.push({ label: arg.slice(0, at), file: resolve(arg.slice(at + 1)) });
    }
  }
  return opts.out === null || opts.shots.length === 0 ? null : opts;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const opts = readArgs(process.argv.slice(2));
  if (opts === null) {
    console.error(USAGE);
    process.exit(2);
  }
  const playwrightPath =
    process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const browser = await chromium.launch(
    process.env.CHROME === undefined ? {} : { executablePath: process.env.CHROME },
  );
  try {
    await drawSheet(browser, opts.shots, opts.out, opts);
    console.log(opts.out);
  } finally {
    await browser.close();
  }
}
