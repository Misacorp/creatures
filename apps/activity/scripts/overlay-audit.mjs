/**
 * Overlay spacing audit: opens every popover, drawer and sheet the workbench can show and checks its
 * spacing against the scale of its kind (docs/design/ux-patterns.md, "Spacing inside a popover" and
 * "Spacing inside a drawer or sheet").
 *
 *   cd apps/activity && node scripts/overlay-audit.mjs [--kind popover|drawer|sheet|all] [--only <entry name substring>] [--width 390]
 *
 * Popovers: for every workbench entry (default props) it taps each kind of popover trigger on the page
 * (`aria-haspopup="dialog"`, one per class name), and in the popover that opens checks:
 *   (a) a button, an action row or the "More in How to play" link sits at least 8px under the block above
 *       it (2026-10-28: the link sat 2px under a glossary entry with no lines);
 *   (b) the children of the stacks (`.popover`, `.pop-body`, `.pop-stack`) are the scale's `gap` apart (or
 *       `action` above a button), those of the groups (`.pop-heading`, `.pop-head-text`) its `tight` step:
 *       a part that sets its own margin shows here;
 *   (c) the content starts and ends at the popover's padding: no doubled space at the top or the bottom.
 *
 * Drawers and sheets: only the entries in `OVERLAY_ENTRIES` are opened (the rest never draw one), with
 * their defaults and every preset (most presets draw the drawer already open); an entry's default view
 * that shows none gets its buttons tapped instead (up to 8 kinds). In the drawer or sheet that opens:
 *   (a) a button or action row sits at least `--dr-action` under the block above it, in a body and in a footer;
 *   (b) the children of the stacks (`.drawer-body`, `.drawer-toolbar`, `.drawer-footer`, `.dr-stack`, `.sheet`)
 *       are `--dr-gap` apart, `--dr-section` above a `.dr-section`, `--dr-action` above a button; those of a
 *       `.dr-group` are `--dr-tight` apart. A part that sets its own margin shows here;
 *   (c) the body starts and ends at its padding (no space of the first child's own), the footer too;
 *   (d) every full-width child of a stack has the stack's left and right edge (within the ring of a button).
 * Items side by side (a row of tags) are not compared. Output: one line per finding with the entry, the
 * overlay's name and the gap in px, then `AUDIT CLEAN` or `AUDIT FAILED (n)`; exit code 1 on findings.
 *
 * It starts its own Vite dev server and uses Playwright with the preinstalled Chromium (like
 * `ui-audit.mjs`): set PLAYWRIGHT_PATH to `playwright/index.mjs` and CHROME to the Chromium binary if
 * they are not in the default places. Chromium is relaunched every 10 entries (it dies after hundreds
 * of page loads). Nothing here ships in the game.
 */
/* global console, document, getComputedStyle, window */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath =
  process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const chrome = process.env.CHROME;
const { chromium } = await import(pathToFileURL(playwrightPath).href);

/** The most triggers tapped per entry (one per class name). */
const TRIGGERS_PER_ENTRY = 8;

/**
 * The workbench entries that can draw a drawer or a sheet (directly or through the screen they show).
 * An entry that draws one and is not here is not audited: `registry.test.ts` does not know either, so add it.
 */
const OVERLAY_ENTRIES = new Set([
  'Drawer',
  'JobDrawer',
  'EvolveDrawer',
  'SendForm',
  'WizardView',
  'FlipNav',
  'CreaturePage',
  'Collection',
  'DungeonMap',
  'DungeonSetup',
  'DungeonRun',
  'ExpeditionWorld',
  'EntryPicker',
  'GamesTab',
  'SupplyCrafting',
  'MainNav',
  'CreatureConfigurator',
  'RosterPicker',
  'LoungeSwap',
]);

const KINDS = ['popover', 'drawer', 'sheet'];

function readArgs(argv) {
  let only = null;
  let width = 390;
  let kind = 'all';
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (argv[i] === '--only' && value !== undefined) only = value.toLowerCase();
    else if (argv[i] === '--width' && value !== undefined) width = Number.parseInt(value, 10);
    else if (argv[i] === '--kind' && value !== undefined && [...KINDS, 'all'].includes(value))
      kind = value;
    else {
      console.error(
        'usage: node scripts/overlay-audit.mjs [--kind popover|drawer|sheet|all] [--only <entry>] [--width 390]',
      );
      process.exit(2);
    }
  }
  return { only, width, kinds: kind === 'all' ? KINDS : [kind] };
}

/** Runs in the page: the findings in the open popover, as text lines. */
function auditPopover() {
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

/** Runs in the page: the findings in the topmost open drawer or sheet, as text lines. */
function auditDrawer(kind) {
  const roots = [...document.querySelectorAll(kind === 'sheet' ? '.sheet' : '.drawer-panel')];
  const root = roots.at(-1);
  if (root === undefined) return null;
  const out = [];
  const px = (v) => Number.parseFloat(v) * (v.endsWith('rem') ? 16 : 1);
  const style = getComputedStyle(root);
  const token = (prop, fallback) => px(style.getPropertyValue(prop).trim()) || fallback;
  const scale = {
    tight: token('--dr-tight', 4),
    gap: token('--dr-gap', 8),
    action: token('--dr-action', 12),
    section: token('--dr-section', 16),
  };
  const name = (el) => {
    const classes = [...el.classList].filter((c) => !c.startsWith('rarity-')).slice(0, 2);
    return el.localName + classes.map((c) => `.${c}`).join('');
  };
  const ACTION = '.actions, .action-row, .ip-actions, .item-actions, .send-button, .dr-action';
  // The fold row is a quiet divider with a 44px tap box: it sits in the list's rhythm, not above it as a button.
  const isAction = (el) =>
    !el.matches('.fold-row') && (el.localName === 'button' || el.matches(ACTION));
  const STACK = '.drawer-body, .drawer-toolbar, .drawer-footer, .dr-stack, .sheet';
  const blocks = (el) =>
    [...el.children].filter((k) => {
      const s = getComputedStyle(k);
      return (
        k.getBoundingClientRect().height > 0 &&
        s.display !== 'inline' &&
        s.display !== 'contents' &&
        s.position !== 'absolute' &&
        s.position !== 'fixed' &&
        !k.matches('.drawer-handle, .visually-hidden')
      );
    });
  const near = (a, b) => Math.abs(a - b) <= 1;
  const contentBox = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { left: r.left + px(s.paddingLeft), right: r.right - px(s.paddingRight) };
  };
  const walk = (el) => {
    const layout = getComputedStyle(el);
    const row = layout.display.endsWith('flex') && layout.flexDirection.startsWith('row');
    const kids = row ? [] : blocks(el);
    const stack = el.matches(STACK);
    const group = el.matches('.dr-group');
    const edges = stack ? contentBox(el) : null;
    for (let i = 0; i < kids.length; i += 1) {
      const b = kids[i].getBoundingClientRect();
      // (d) A full-width child has the stack's edges: a ring (3px) sits in by its width.
      if (
        edges !== null &&
        !kids[i].matches('.drawer-flip, .flip-area') &&
        b.width >= (edges.right - edges.left) * 0.6
      ) {
        const left = Math.round(b.left - edges.left);
        const right = Math.round(b.right - edges.right);
        // Only a child that sticks out is a finding (a centred grid or a button narrower than the stack is fine).
        if (left < -3 || right > 3)
          out.push(
            `(d) sticks out of the stack (left ${left}px, right ${right}px): ${name(el)} > ${name(kids[i])}`,
          );
      }
      if (i === 0) continue;
      const a = kids[i - 1].getBoundingClientRect();
      if (b.top < a.bottom - 1) continue; // side by side, or a row that wraps
      // A scroll box with room for its frame sets a negative bottom margin that collapses through its wrapper:
      // the room it gives back is space too (the item picker's detail card).
      let room = 0;
      for (const inner of kids[i - 1].querySelectorAll('*')) {
        const m = px(getComputedStyle(inner).marginBottom);
        if (m < 0 && inner.getBoundingClientRect().bottom >= a.bottom - 1)
          room = Math.max(room, -m);
      }
      const gap = Math.round(b.top - a.bottom + room);
      const pair = `${name(kids[i - 1])} > ${name(kids[i])}`;
      if (isAction(kids[i]) && gap < scale.action)
        out.push(`(a) button hugs the block above: ${name(el)} :: ${pair} ${gap}px`);
      if (stack) {
        const want = isAction(kids[i])
          ? scale.action
          : kids[i].matches('.dr-section')
            ? scale.section
            : scale.gap;
        if (!near(gap, want))
          out.push(`(b) off the scale (want ${want}px): ${name(el)} :: ${pair} ${gap}px`);
      } else if (group && !near(gap, scale.tight)) {
        out.push(`(b) off the tight step (want ${scale.tight}px): ${name(el)} :: ${pair} ${gap}px`);
      }
    }
    for (const k of row ? blocks(el) : kids) walk(k);
  };
  walk(root);
  // (e) No part sets a vertical margin of its own (a ring's 3px aside): the stacks space everything.
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('svg, canvas') !== null && el.localName !== 'canvas') continue;
    // An accordion owns the spacing of what it holds (its content: first and last child flush, paragraphs between).
    if (el.closest('.acc-content') !== null) continue;
    // A frame (an item's) keeps room for its ring and outline.
    if (el.matches('.item-frame')) continue;
    const s = getComputedStyle(el);
    if (s.display === 'inline' || s.display === 'contents' || s.display === 'none') continue;
    if (el.getBoundingClientRect().height === 0) continue;
    const top = px(s.marginTop);
    const bottom = px(s.marginBottom);
    // A child of a stack has the stack's step above it (checked in (b)); nothing else may have a margin.
    const spaced = el.parentElement.matches(`${STACK}, .dr-group`);
    if ((top > 3 && !spaced) || bottom > 3)
      out.push(
        `(e) own margin (top ${top}px, bottom ${bottom}px): ${name(el.parentElement)} > ${name(el)}`,
      );
  }
  // (c) The body and the footer start and end at their own padding.
  for (const part of root.matches('.sheet')
    ? [root]
    : root.querySelectorAll(':scope > .drawer-body, :scope > .drawer-footer')) {
    const kids = blocks(part);
    if (kids.length === 0) continue;
    const box = part.getBoundingClientRect();
    const s = getComputedStyle(part);
    const first = kids[0].getBoundingClientRect();
    const last = kids.at(-1).getBoundingClientRect();
    const top = Math.round(first.top - box.top - px(s.paddingTop));
    const bottom = Math.round(box.bottom - last.bottom - px(s.paddingBottom));
    const scrolls = part.scrollHeight > part.clientHeight + 1;
    if (top > 2 && !scrolls)
      out.push(`(c) ${top}px more than the padding at the top of ${name(part)}`);
    if (bottom > 2 && !scrolls)
      out.push(`(c) ${bottom}px more than the padding at the bottom of ${name(part)}`);
  }
  const title = root.querySelector('.drawer-title, .sheet-title')?.textContent ?? '?';
  return { label: title, found: out };
}

const { only, width, kinds } = readArgs(process.argv.slice(2));
const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = `http://localhost:${String(server.httpServer.address().port)}/`;
const { ENTRIES } = await server.ssrLoadModule('/src/workbench/registry.ts');
let browser = null;
let page = null;

async function relaunch() {
  if (browser !== null) await browser.close().catch(() => undefined);
  browser = await chromium.launch(chrome === undefined ? {} : { executablePath: chrome });
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
  });
  page = await ctx.newPage();
}

/** Opens the entry with these props; false when it will not load. One retry: the dev server now and then drops a load. */
let loadedEntry = null;
async function load(entry, props) {
  const hash = `c=${encodeURIComponent(entry.name)}&p=${encodeURIComponent(JSON.stringify(props))}&w=full&bg=dusk`;
  // The same entry again (the next preset): only the address changes, the frame follows (a fresh page costs 2 s).
  if (loadedEntry === entry.name) {
    try {
      await page.evaluate((h) => {
        window.location.hash = h;
      }, hash);
      await page.waitForTimeout(250);
      return true;
    } catch {
      // loaded afresh below
    }
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      loadedEntry = null;
      await page.goto('about:blank');
      await page.goto(`${base}workbench.html?frame=1#${hash}`);
      await page.waitForSelector('.wb-frame-stage', { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      loadedEntry = entry.name;
      return true;
    } catch {
      // tried again, or reported
    }
  }
  return false;
}

let failures = 0;
const checked = { popover: 0, drawer: 0, sheet: 0 };

const reported = new Set();

function report(entry, kind, result) {
  if (result === null) return false;
  checked[kind] += 1;
  for (const line of result.found) {
    const text = `${entry.name} / ${kind} ${result.label}: ${line}`;
    if (reported.has(text)) continue; // the same finding in every preset
    reported.add(text);
    console.log(text);
    failures += 1;
  }
  return true;
}

async function auditPopovers(entry) {
  if (!(await load(entry, {}))) {
    console.log(`${entry.name}: could not load`);
    failures += 1;
    return;
  }
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
    report(entry, 'popover', await page.evaluate(auditPopover));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
}

const OVERLAY = 'button, [role=button], [role=tab], summary';

async function auditDrawers(entry, drawerKinds) {
  const variants = [{}, ...entry.presets.map((p) => p.props)];
  for (const [vi, props] of variants.entries()) {
    if (!(await load(entry, props))) {
      console.log(`${entry.name}: could not load`);
      failures += 1;
      continue;
    }
    let opened = false;
    for (const kind of drawerKinds) {
      if (report(entry, kind, await page.evaluate(auditDrawer, kind))) opened = true;
    }
    if (opened || vi !== 0) continue;
    // The default view shows none: tap its buttons (one per class name) and audit what opens.
    const indexes = await page.evaluate(
      ([sel, max]) => {
        const seen = new Map();
        document.querySelectorAll(sel).forEach((el, i) => {
          if (!el.disabled && !seen.has(el.className)) seen.set(el.className, i);
        });
        return [...seen.values()].slice(0, max);
      },
      [OVERLAY, TRIGGERS_PER_ENTRY],
    );
    for (const index of indexes) {
      try {
        const trigger = page.locator(OVERLAY).nth(index);
        await trigger.scrollIntoViewIfNeeded({ timeout: 1500 });
        await trigger.click({ timeout: 1500 });
        await page.waitForTimeout(300);
      } catch {
        continue;
      }
      let any = false;
      for (const kind of drawerKinds) {
        if (report(entry, kind, await page.evaluate(auditDrawer, kind))) any = true;
      }
      if (any) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
      }
    }
  }
}

try {
  let count = 0;
  for (const entry of ENTRIES) {
    if (only !== null && !entry.name.toLowerCase().includes(only)) continue;
    const drawerKinds = kinds.filter((k) => k !== 'popover');
    const wantDrawers = drawerKinds.length > 0 && OVERLAY_ENTRIES.has(entry.name);
    const wantPopovers = kinds.includes('popover');
    if (!wantDrawers && !wantPopovers) continue;
    if (page === null || count % 10 === 0) await relaunch();
    count += 1;
    if (wantPopovers) await auditPopovers(entry);
    if (wantDrawers) await auditDrawers(entry, drawerKinds);
  }
} finally {
  if (browser !== null) await browser.close().catch(() => undefined);
  await server.close();
}
console.log(
  `${String(checked.popover)} popovers, ${String(checked.drawer)} drawers, ${String(checked.sheet)} sheets checked`,
);
console.log(failures === 0 ? 'AUDIT CLEAN' : `AUDIT FAILED (${String(failures)})`);
process.exit(failures === 0 ? 0 : 1);
