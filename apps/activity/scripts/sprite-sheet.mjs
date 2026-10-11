/**
 * Renders a contact sheet of every sprite (species, then bosses) as PNG files, for reviewing art.
 *
 *   cd apps/activity && node scripts/sprite-sheet.mjs <out.png> [id,id,...]
 *
 * With a list of species or boss ids, only those are drawn, larger (x10, or x14 for three or fewer), for a close look.
 *
 * Writes `<out>.png` (every sprite at x6 on the `dusk` panel colour) and `<out>-small.png` (x3 next
 * to a solid silhouette, to check that shapes differ at small sizes). Uses Vite to load the
 * TypeScript sprite data and Playwright (with the preinstalled Chromium) to draw it. Set
 * PLAYWRIGHT_PATH to the `playwright/index.mjs` file if it is not in the default place.
 */
/* global console, document */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath =
  process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const out = process.argv[2] ?? 'sprite-sheet.png';
const only = process.argv[3]?.split(',');
const smallOut = out.replace(/\.png$/, '') + '-small.png';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const sprites = await server.ssrLoadModule('/src/sprites/creature-sprites.ts');
  const data = await server.ssrLoadModule('/src/sprites/sprite-data.ts');
  const game = await server.ssrLoadModule('@creatures/game');
  const { content } = game;

  const item = (label, def, group) => ({
    label,
    group,
    rows: data.expandRows(def),
    palette: def.palette,
  });
  const wanted = (id) => only === undefined || only.includes(id);
  const species = [];
  for (const c of content.creatures.filter((s) => s.stage === 1)) {
    const line = content.creatures
      .filter((s) => s.line === c.line)
      .sort((a, b) => a.stage - b.stage);
    for (const s of line.filter((x) => wanted(x.id)))
      species.push(item(s.name, sprites.creatureSpriteOrFallback(s.id), 'c'));
  }
  const bosses = content.bosses
    .filter((b) => wanted(b.id))
    .map((b) =>
      item(b.name, sprites.bossSprite(b.id) ?? sprites.creatureSpriteOrFallback(b.id), 'b'),
    );

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 800 },
      deviceScaleFactor: 1,
    });
    await page.setContent('<body style="margin:0"></body>');

    /** Draws labelled sprite tiles into a grid and screenshots it. */
    const render = async (file, groups, scale, silhouette, perRow) => {
      await page.evaluate(
        ({ groups, scale, silhouette, perRow }) => {
          document.body.replaceChildren();
          const root = document.createElement('div');
          root.style.cssText =
            'background:#17132b;padding:12px;font:12px monospace;color:#f4eedc;display:inline-block';
          document.body.append(root);
          for (const group of groups) {
            const grid = document.createElement('div');
            grid.style.cssText = `display:grid;grid-template-columns:repeat(${String(perRow)},auto);gap:8px;margin-bottom:12px`;
            root.append(grid);
            for (const s of group) {
              const w = s.rows[0].length;
              const h = s.rows.length;
              const tile = document.createElement('div');
              tile.style.cssText = 'background:#241e42;padding:6px;text-align:center';
              const cv = document.createElement('canvas');
              cv.width = w * scale * (silhouette ? 2 : 1) + (silhouette ? scale : 0);
              cv.height = h * scale;
              cv.style.cssText = 'display:block;margin:auto;image-rendering:pixelated';
              const ctx = cv.getContext('2d');
              for (let pass = 0; pass < (silhouette ? 2 : 1); pass++) {
                const ox = pass * (w * scale + scale);
                s.rows.forEach((row, y) => {
                  [...row].forEach((ch, x) => {
                    const colour = s.palette[ch];
                    if (ch === '.' || colour === undefined) return;
                    ctx.fillStyle = pass === 1 ? '#000000' : colour;
                    ctx.fillRect(ox + x * scale, y * scale, scale, scale);
                  });
                });
              }
              const label = document.createElement('div');
              label.textContent = s.label;
              label.style.marginTop = '4px';
              tile.append(cv, label);
              grid.append(tile);
            }
          }
        },
        { groups, scale, silhouette, perRow },
      );
      await page.locator('body > div').screenshot({ path: file });
    };

    // Evolution lines side by side: four lines (eight sprites) per row.
    const groups = [species, bosses].filter((g) => g.length > 0);
    if (only === undefined) {
      await render(out, groups, 6, false, 8);
      await render(smallOut, groups, 3, true, 6);
    } else {
      await render(out, groups, only.length <= 3 ? 14 : 10, false, 4);
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
console.log(out, smallOut);
