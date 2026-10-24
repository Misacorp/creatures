/**
 * UI audit: finds layout overflow in every workbench page at phone, tablet and desktop widths.
 *
 *   cd apps/activity && node scripts/ui-audit.mjs [--only <entry name substring>] [--widths 360,1100]
 *
 * By default it opens every workbench entry (with its default props) and every one of its presets, at
 * 320, 360, 390, 412, 768 and 1100 px wide (a real window per width, so the game's media queries see
 * it), and checks:
 *   (a) the page scrolls sideways;
 *   (b) an element sticks out of its nearest clipping (hidden or clip, not scrolling) ancestor's content box (or is cut off vertically
 *       by a box that clips), or shows past the viewport (fixed boxes such as popovers and drawers are
 *       checked against the viewport only);
 *   (c) text spills out of its own box (unless that box truncates with an ellipsis);
 *   (d) anything steps out of the card's content box (the workbench stage is drawn as the app's card).
 * Deliberate crops are marked `data-audit-clip` in the markup: that element's descendants (and an
 * element carrying the attribute inside one) are skipped, but the marked box itself is still checked
 * against its own parent and the viewport. Put the attribute on art that is cut on purpose (a strip of
 * a scene, a row of bunting cut at the card's edge, a scene canvas's inside); never on text.
 *
 * `--only` keeps the entries whose name contains the text (case-insensitive) and the extra
 * interactive states of GAMES_STATES below whose entry matches. Output: one line per page and width,
 * "clean" or the findings with the overshoot in px, then `AUDIT CLEAN` or `AUDIT FAILED (n)`. Exit code
 * 1 if anything is found, 0 if clean.
 *
 * It starts its own Vite dev server and uses Playwright with the preinstalled Chromium (like
 * `font-audit.mjs`): set PLAYWRIGHT_PATH to `playwright/index.mjs` and CHROME to the Chromium binary if
 * they are not in the default places. The entry list is read through Vite's `ssrLoadModule` from
 * `src/workbench/registry.ts`, so a new entry or preset is audited with no change here. Nothing here
 * ships in the game.
 */
/* global console, document, getComputedStyle, window */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightPath =
  process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const chrome = process.env.CHROME;
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const PARALLEL = 3;
const ALL_WIDTHS = [320, 360, 390, 412, 768, 1100];

function readArgs(argv) {
  let only = null;
  let widths = ALL_WIDTHS;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--only' && argv[i + 1] !== undefined) {
      only = argv[i + 1].toLowerCase();
      i += 1;
    } else if (argv[i] === '--widths' && argv[i + 1] !== undefined) {
      widths = argv[i + 1].split(',').map((w) => Number.parseInt(w, 10));
      if (widths.some((w) => !Number.isFinite(w) || w < 200)) {
        console.error('--widths wants a list of pixel widths, like 360,1100');
        process.exit(2);
      }
      i += 1;
    } else {
      console.error(
        'usage: node scripts/ui-audit.mjs [--only <entry name substring>] [--widths 360,1100]',
      );
      process.exit(2);
    }
  }
  return { only, widths };
}

const click =
  (sel, n = 0) =>
  async (page) => {
    await page.locator(sel).nth(n).click();
    await page.waitForTimeout(500);
  };
const clickRole = (name) => async (page) => {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(1500);
};

/**
 * Interactive Valley Games states a plain preset cannot show (a picker open, a favour popover, a
 * replay). `entry` and `props` are as in the address; `act` runs after load; `scope` (a selector)
 * limits the check to the popover or drawer that `act` opened.
 */
const GAMES_STATES = [
  {
    name: 'tab replay',
    entry: 'GamesTab',
    props: { view: 'after: results and the next lineup' },
    act: clickRole('Replay Melon Run'),
  },
  {
    name: 'tab picker',
    entry: 'GamesTab',
    props: { view: 'entries: none entered' },
    act: click('button.ge-slot'),
  },
  {
    name: 'tab favour pop',
    entry: 'GamesTab',
    props: { view: 'entries: one entered' },
    act: click('.ge-favour', 1),
    scope: '.popover',
  },
  {
    name: 'card favour pop',
    entry: 'EventCard',
    props: {},
    act: click('.ge-favour', 0),
    scope: '.popover',
  },
  {
    name: 'card favour pop last',
    entry: 'EventCard',
    props: {},
    act: async (page) => {
      await page.locator('.ge-favour').last().click();
      await page.waitForTimeout(500);
    },
    scope: '.popover',
  },
  {
    name: 'picker favour pop',
    entry: 'EntryPicker',
    props: {},
    act: click('.ge-picker .ge-favour', 0),
    scope: '.popover',
  },
  {
    name: 'room trophy pop',
    entry: 'LivingRoom',
    props: { titleRow: false },
    act: click('.trophy-button'),
    scope: '.popover',
  },
];

/** Runs in the page: the findings, as text lines. */
function audit(scope) {
  const out = [];
  const de = document.documentElement;
  const vw = de.clientWidth;
  if (de.scrollWidth > vw) out.push(`(a) document scrolls sideways: ${de.scrollWidth} > ${vw}`);
  const bit = (e) =>
    e.tagName.toLowerCase() +
    [...e.classList]
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('');
  const name = (el) => {
    const p = el.parentElement;
    return (p ? `${bit(p)} > ` : '') + bit(el);
  };
  const roots = scope
    ? [...document.querySelectorAll(scope)]
    : [
        document.querySelector('.wb-frame-stage') ?? document.body,
        ...document.querySelectorAll('.drawer-panel, .popover'),
      ];
  if (roots.length === 0) out.push(`no element matches ${scope}`);
  // (d) The card's content box: nothing in the page may step out of it (popovers and drawers are fixed
  // and only checked against the viewport).
  const stage = document.querySelector('.wb-frame-stage');
  const st = stage?.getBoundingClientRect();
  const scs = stage ? getComputedStyle(stage) : null;
  const card =
    st && scs
      ? {
          left: st.left + parseFloat(scs.paddingLeft),
          right: st.right - parseFloat(scs.paddingRight),
        }
      : null;
  const seen = new Set();
  for (const r0 of roots) {
    for (const el of [r0, ...r0.querySelectorAll('*')]) {
      if (seen.has(el)) continue;
      seen.add(el);
      // A deliberate crop: what is inside is not checked.
      const clip = el.closest('[data-audit-clip]');
      if (clip !== null && clip !== el) continue;
      if (el.closest('.visually-hidden') !== null) continue;
      // Visually hidden until focused (clip-path: inset(50%)), like the drawer's close button.
      let hidden = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).clipPath.startsWith('inset(50%')) hidden = true;
      }
      if (hidden) continue;
      if (el.ownerSVGElement) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'contents' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // What can be seen of it: its box cut by every clipping ancestor (fixed boxes escape them).
      let vl = r.left;
      let vr = r.right;
      if (cs.position !== 'fixed') {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.overflowX !== 'visible') {
            const ar = a.getBoundingClientRect();
            vl = Math.max(vl, ar.left);
            vr = Math.min(vr, ar.right);
          }
          if (acs.position === 'fixed') break;
        }
      }
      let inFixed = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).position === 'fixed') inFixed = true;
      }
      // The creature page scenes of the workbench bleed over the stage's padding on purpose (.v3-bleed).
      const bleeds = el.closest('.v3-bleed') !== null;
      if (card && !scope && stage.contains(el) && el !== stage && vr > vl && !inFixed && !bleeds) {
        const over = Math.max(card.left - vl, vr - card.right);
        if (over > 0.5)
          out.push(`(d) ${name(el)} out of the card's content box by ${over.toFixed(1)} px`);
      }
      if (vr > vl && (vl < -0.5 || vr > vw + 0.5)) {
        out.push(
          `(b) ${name(el)} visible past the viewport: ${vl.toFixed(1)}..${vr.toFixed(1)} of ${vw}`,
        );
      }
      if (cs.position !== 'fixed') {
        let a = el.parentElement;
        while (a && a !== document.body && getComputedStyle(a).overflowX === 'visible')
          a = a.parentElement;
        if (a && a !== document.body && a.closest('[data-audit-clip]') === null) {
          const acs = getComputedStyle(a);
          if (acs.textOverflow !== 'ellipsis') {
            const ar = a.getBoundingClientRect();
            const left = ar.left + parseFloat(acs.borderLeftWidth) + parseFloat(acs.paddingLeft);
            const right =
              ar.right - parseFloat(acs.borderRightWidth) - parseFloat(acs.paddingRight);
            const over = Math.max(left - r.left, r.right - right);
            // A box that scrolls sideways (auto or scroll) is not clipping: its content is reachable.
            const scrolls = acs.overflowX === 'auto' || acs.overflowX === 'scroll';
            if (over > 0.5 && !scrolls) {
              out.push(`(b) ${name(el)} past ${name(a)} by ${over.toFixed(1)} px`);
            }
            if (acs.overflowY === 'hidden' || acs.overflowY === 'clip') {
              const top = ar.top + parseFloat(acs.borderTopWidth) + parseFloat(acs.paddingTop);
              const bottom =
                ar.bottom - parseFloat(acs.borderBottomWidth) - parseFloat(acs.paddingBottom);
              const v = Math.max(top - r.top, r.bottom - bottom);
              if (v > 0.5)
                out.push(`(b) ${name(el)} cut off vertically by ${name(a)}: ${v.toFixed(1)} px`);
            }
          }
        }
      }
      // (c) Its own text past its box: measured on the text itself, so a bigger tap area (a ::before)
      // does not count.
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || n.textContent.trim() === '') continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const t = range.getBoundingClientRect();
        if (t.width === 0 || cs.display === 'inline') continue;
        const left = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
        const right = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
        const over = Math.max(left - t.left, t.right - right);
        if (over > 0.5 && cs.textOverflow !== 'ellipsis') {
          out.push(
            `(c) ${name(el)} text "${n.textContent.trim().slice(0, 20)}" spills its box by ${over.toFixed(1)} px`,
          );
        }
      }
    }
  }
  return [...new Set(out)];
}

const { only, widths } = readArgs(process.argv.slice(2));
const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
let failures = 0;
const started = Date.now();
let browser;
try {
  const { ENTRIES } = await server.ssrLoadModule('/src/workbench/registry.ts');
  const entries = ENTRIES.filter((e) => only === null || e.name.toLowerCase().includes(only));
  const pages = [];
  for (const e of entries) {
    pages.push({ name: e.name, entry: e.name, props: {} });
    for (const p of e.presets) {
      pages.push({ name: `${e.name} / ${p.name}`, entry: e.name, props: p.props });
    }
  }
  for (const s of GAMES_STATES) {
    if (only === null || s.entry.toLowerCase().includes(only)) {
      pages.push({ ...s, name: `${s.entry} / ${s.name} (interactive)` });
    }
  }
  if (pages.length === 0) {
    console.error(`no workbench entry matches "${only}"`);
    process.exit(2);
  }
  browser = await chromium.launch(chrome === undefined ? {} : { executablePath: chrome });

  async function runWidth(w) {
    const lines = [];
    let count = 0;
    const ctx = await browser.newContext({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    let errors = [];
    let loaded = null;
    let done = 0;
    page.on('pageerror', (e) => errors.push(e.message));
    for (const pg of pages) {
      errors = [];
      const hash = `c=${encodeURIComponent(pg.entry)}&p=${encodeURIComponent(JSON.stringify(pg.props))}&w=full&bg=dusk`;
      const found = [];
      try {
        // A fresh load for the first page of an entry and for every tapped state; the other presets of
        // the entry only change the address (the frame listens to it), which is several times faster.
        if (pg.act === undefined && loaded === pg.entry) {
          await page.evaluate((h) => {
            window.location.hash = h;
          }, hash);
        } else {
          await page.goto('about:blank');
          await page.goto(`${base}workbench.html?frame=1#${hash}`);
          loaded = pg.act === undefined ? pg.entry : null;
        }
        await page.waitForSelector('.wb-frame-stage', { timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        if (pg.act !== undefined) await pg.act(page);
        if (pg.act !== undefined) await page.waitForTimeout(150);
        found.push(...(await page.evaluate(audit, pg.scope ?? null)));
      } catch (e) {
        found.push(`could not audit: ${String(e.message).split('\n')[0]}`);
      }
      for (const m of errors) found.push(`page error: ${m}`);
      count += found.length;
      done += 1;
      if (done % 100 === 0)
        console.error(`  ${String(w)} px: ${String(done)} of ${String(pages.length)} pages`);
      lines.push(`${String(w).padStart(4)} ${pg.name}: ${found.length === 0 ? 'clean' : ''}`);
      for (const f of found) lines.push(`      ${f}`);
    }
    await ctx.close();
    return { lines, count };
  }

  // A few widths at a time: the dev server and the browser run out of resources with all six at once.
  const results = [];
  for (let i = 0; i < widths.length; i += PARALLEL) {
    results.push(...(await Promise.all(widths.slice(i, i + PARALLEL).map(runWidth))));
  }
  for (const r of results) {
    for (const l of r.lines) console.log(l);
    failures += r.count;
  }
} finally {
  await browser?.close();
  await server.close();
}
console.log(
  `${failures === 0 ? 'AUDIT CLEAN' : `AUDIT FAILED (${String(failures)})`} in ${String(Math.round((Date.now() - started) / 1000))} s`,
);
process.exit(failures === 0 ? 0 : 1);
