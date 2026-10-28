/**
 * Popover spacing audit: opens every popover the workbench can show and checks its spacing against the
 * popover scale (docs/design/ux-patterns.md, "Spacing inside a popover").
 *
 *   cd apps/activity && node scripts/popover-audit.mjs [--only <entry name substring>] [--width 390]
 *
 * For every workbench entry (default props) it taps each kind of popover trigger on the page
 * (`aria-haspopup="dialog"`, one per class name), and in the popover that opens checks:
 *   (a) a button, an action row or the "More in How to play" link sits at least 8px under the block above
 *       it (2026-10-28: the link sat 2px under a glossary entry with no lines);
 *   (b) the children of the stacks (`.popover`, `.pop-body`, `.pop-stack`) are the scale's `gap` apart (or
 *       `action` above a button), those of the groups (`.pop-heading`, `.pop-head-text`) its `tight` step:
 *       a part that sets its own margin shows here;
 *   (c) the content starts and ends at the popover's padding: no doubled space at the top or the bottom.
 * Items side by side (a row of tags) are not compared. Output: one line per finding with the entry, the
 * popover's name and the gap in px, then `AUDIT CLEAN` or `AUDIT FAILED (n)`; exit code 1 on findings.
 *
 * It starts its own Vite dev server and uses Playwright with the preinstalled Chromium (like
 * `ui-audit.mjs`): set PLAYWRIGHT_PATH to `playwright/index.mjs` and CHROME to the Chromium binary if
 * they are not in the default places. Nothing here ships in the game.
 */
/* global console, document, getComputedStyle */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath =
  process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const chrome = process.env.CHROME;
const { chromium } = await import(pathToFileURL(playwrightPath).href);

/** The most triggers tapped per entry (one per class name). */
const TRIGGERS_PER_ENTRY = 8;

function readArgs(argv) {
  let only = null;
  let width = 390;
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (argv[i] === '--only' && value !== undefined) only = value.toLowerCase();
    else if (argv[i] === '--width' && value !== undefined) width = Number.parseInt(value, 10);
    else {
      console.error('usage: node scripts/popover-audit.mjs [--only <entry>] [--width 390]');
      process.exit(2);
    }
  }
  return { only, width };
}

/** Runs in the page: the findings in the open popover, as text lines. */
function audit() {
  const pop =
    document.querySelector('.popover-layer .popover') ?? document.querySelector('.popover');
  if (pop === null) return null;
  const out = [];
  const px = (v) => Number.parseFloat(v) * (v.endsWith('rem') ? 16 : 1);
  const style = getComputedStyle(pop);
  // The scale as popover.css sets it, or its values today if a token is gone.
  const token = (prop, fallback) => px(style.getPropertyValue(prop).trim()) || fallback;
  const scale = {
    tight: token('--pop-tight', 4),
    gap: token('--pop-gap', 8),
    action: token('--pop-action', 12),
  };
  const name = (el) => {
    const classes = [...el.classList].filter((c) => !c.startsWith('rarity-')).slice(0, 2);
    return el.localName + classes.map((c) => `.${c}`).join('');
  };
  const isAction = (el) =>
    el.localName === 'button' || el.matches('.pop-actions, .pop-more, .pop-action');
  const blocks = (el) =>
    [...el.children].filter((k) => {
      const s = getComputedStyle(k);
      return (
        k.getBoundingClientRect().height > 0 &&
        s.display !== 'inline' &&
        s.display !== 'contents' &&
        s.position !== 'absolute' &&
        s.position !== 'fixed'
      );
    });
  const near = (a, b) => Math.abs(a - b) <= 1;
  const walk = (el) => {
    const layout = getComputedStyle(el);
    // A row that wraps (tags, chips) is side by side, not stacked.
    const row = layout.display.endsWith('flex') && layout.flexDirection.startsWith('row');
    const kids = row ? [] : blocks(el);
    const stack = el === pop || el.matches('.pop-body, .pop-stack');
    const group = el.matches('.pop-heading, .pop-head-text');
    for (let i = 1; i < kids.length; i += 1) {
      const a = kids[i - 1].getBoundingClientRect();
      const b = kids[i].getBoundingClientRect();
      if (b.top < a.bottom - 1) continue; // side by side, or a row that wraps
      const gap = Math.round(b.top - a.bottom);
      const pair = `${name(kids[i - 1])} > ${name(kids[i])}`;
      if (isAction(kids[i]) && gap < scale.gap)
        out.push(`(a) button hugs the block above: ${pair} ${gap}px`);
      if (stack) {
        const want = isAction(kids[i]) ? scale.action : scale.gap;
        if (!near(gap, want)) out.push(`(b) off the scale (want ${want}px): ${pair} ${gap}px`);
      } else if (group && !near(gap, scale.tight)) {
        out.push(`(b) off the tight step (want ${scale.tight}px): ${pair} ${gap}px`);
      }
    }
    for (const k of row ? blocks(el) : kids) walk(k);
  };
  walk(pop);
  const box = pop.getBoundingClientRect();
  const kids = blocks(pop);
  const first = kids[0]?.getBoundingClientRect();
  const last = kids.at(-1)?.getBoundingClientRect();
  if (first !== undefined && last !== undefined) {
    const top = Math.round(first.top - box.top - px(style.paddingTop));
    const bottom = Math.round(box.bottom - last.bottom - px(style.paddingBottom));
    if (top > 2) out.push(`(c) ${top}px more than the padding at the top`);
    if (bottom > 2) out.push(`(c) ${bottom}px more than the padding at the bottom`);
  }
  return { label: pop.getAttribute('aria-label') ?? '?', found: out };
}

const { only, width } = readArgs(process.argv.slice(2));
const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = `http://localhost:${String(server.httpServer.address().port)}/`;
const { ENTRIES } = await server.ssrLoadModule('/src/workbench/registry.ts');
const browser = await chromium.launch(chrome === undefined ? {} : { executablePath: chrome });
const ctx = await browser.newContext({
  viewport: { width, height: 900 },
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();
let failures = 0;
let checked = 0;
try {
  for (const entry of ENTRIES) {
    if (only !== null && !entry.name.toLowerCase().includes(only)) continue;
    const hash = `c=${encodeURIComponent(entry.name)}&p=${encodeURIComponent('{}')}&w=full&bg=dusk`;
    // One retry: the dev server now and then drops a load while it bundles a page's modules.
    let loaded = false;
    for (let attempt = 0; attempt < 2 && !loaded; attempt += 1) {
      try {
        await page.goto('about:blank');
        await page.goto(`${base}workbench.html?frame=1#${hash}`);
        await page.waitForSelector('.wb-frame-stage', { timeout: 15000 });
        loaded = true;
      } catch {
        // tried again below, or reported
      }
    }
    if (!loaded) {
      console.log(`${entry.name}: could not load`);
      failures += 1;
      continue;
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const triggers = await page.evaluate((max) => {
      const seen = new Map();
      document.querySelectorAll('[aria-haspopup="dialog"]').forEach((el, i) => {
        if (el.closest('.popover') === null && !seen.has(el.className)) seen.set(el.className, i);
      });
      return [...seen.values()].slice(0, max);
    }, TRIGGERS_PER_ENTRY);
    for (const index of triggers) {
      try {
        const trigger = page.locator('[aria-haspopup="dialog"]').nth(index);
        await trigger.scrollIntoViewIfNeeded({ timeout: 2000 });
        await trigger.click({ timeout: 2000 });
        await page.waitForTimeout(300);
      } catch {
        continue; // hidden, covered or gone: not a popover this page shows
      }
      const result = await page.evaluate(audit);
      if (result !== null) {
        checked += 1;
        for (const line of result.found) console.log(`${entry.name} / ${result.label}: ${line}`);
        failures += result.found.length;
      }
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`${String(checked)} popovers checked`);
console.log(failures === 0 ? 'AUDIT CLEAN' : `AUDIT FAILED (${String(failures)})`);
process.exit(failures === 0 ? 0 : 1);
