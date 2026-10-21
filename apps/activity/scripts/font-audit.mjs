/**
 * Font audit: keeps the wrong font from slipping into the game's panels again (Misa, 2026-10-18).
 *
 *   cd apps/activity && node scripts/font-audit.mjs
 *
 * The rule: inside a pixel panel (`.pix-panel`, set once on the container of the item card, the item
 * drawer, the picker's detail panel, the dismantle panel and the creature picker sheet) every piece of
 * text is in the pixel font (Jersey 10), except text inside a `.prose` part, which is in the body font
 * (Atkinson Hyperlegible). The script opens a list of workbench presets in a 390 px wide phone window,
 * walks the text of every pixel panel and prints each element whose computed font is the other one.
 * Exit code 1 if there is any, 0 if clean. Add a preset to PRESETS when a new view gets a pixel panel.
 *
 * It starts its own Vite dev server and uses Playwright with the preinstalled Chromium (the same setup as
 * `sprite-sheet.mjs`): set PLAYWRIGHT_PATH to `playwright/index.mjs` and CHROME to the Chromium binary if
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

/** The views to check: a workbench entry and its props; `panels` is how many pixel panels the view has (so a panel that loses its
 * `.pix-panel` class is noticed, not silently skipped), `tap` (a selector) is pressed first when a preset has one. */
const PRESETS = [
  {
    name: 'Item card, worn epic hat (Workshop drawer)',
    entry: 'CreaturePage',
    props: { scene: 'W1' },
    panels: 2,
  },
  {
    name: 'Item drawer, nobody wears it',
    entry: 'CreaturePage',
    props: { scene: 'W7' },
    panels: 2,
  },
  {
    name: 'Item drawer, a charm with no stats',
    entry: 'CreaturePage',
    props: { scene: 'W2' },
    panels: 2,
  },
  {
    name: 'Item drawer, a gear set piece',
    entry: 'CreaturePage',
    props: { scene: 'W3' },
    panels: 2,
  },
  {
    name: 'Equip on list in the drawer (every reason)',
    entry: 'CreaturePage',
    props: { scene: 'W4' },
    panels: 1,
  },
  {
    name: 'Equip on list for a worn item',
    entry: 'CreaturePage',
    props: { scene: 'W5' },
    panels: 1,
  },
  { name: 'Dismantle panel open', entry: 'CreaturePage', props: { scene: 'W6' }, panels: 3 },
  {
    name: 'Item picker, better item (compare on)',
    entry: 'CreaturePage',
    props: { scene: 'K1' },
    panels: 2,
  },
  {
    name: 'Item picker, empty slot (Equip)',
    entry: 'CreaturePage',
    props: { scene: 'K5' },
    panels: 2,
  },
  { name: 'Item picker, long Epic', entry: 'CreaturePage', props: { scene: 'K7' }, panels: 2 },
  {
    name: 'Item picker, an item that cannot be worn (the reason)',
    entry: 'CreaturePage',
    props: { scene: 'K8' },
    panels: 2,
  },
  { name: 'Raid creature picker sheet', entry: 'RosterPicker', props: {}, panels: 1 },
  // The dungeon's cards (2026-10-19): the pixel font is set once on the card, reading text is `.prose`.
  { name: 'Dungeon camp, the choices', entry: 'DungeonCamp', props: {}, panels: 1 },
  {
    name: 'Dungeon camp, the keepsakes',
    entry: 'DungeonCamp',
    props: { step: 'keepsakes' },
    panels: 1,
  },
  {
    name: 'Dungeon camp, who goes home',
    entry: 'DungeonCamp',
    props: { step: 'who goes home' },
    panels: 1,
  },
  {
    name: 'Dungeon camp, arrange the row',
    entry: 'DungeonCamp',
    props: { step: 'arrange after a swap' },
    panels: 1,
  },
  { name: 'Dungeon mystery room', entry: 'DungeonEvent', props: {}, panels: 1 },
  { name: 'Dungeon descent, the floor boss fell', entry: 'DungeonDescend', props: {}, panels: 1 },
  {
    name: 'Dungeon descent, nothing banked and an empty pack',
    entry: 'DungeonDescend',
    props: { card: 'nothing banked', emptyPack: true },
    panels: 1,
  },
  {
    name: 'Creature configurator, every part',
    entry: 'CreatureConfigurator',
    props: { creature: 0, explorer: true, crafting: true, ability: true },
    panels: 2,
  },
  {
    name: 'Dungeon team, a creature tapped (its configurator)',
    entry: 'DungeonSetup',
    props: { configure: true },
    tap: '.dungeon-team [data-slot="1"]',
    panels: 4,
  },
  { name: 'Gear list, tappable', entry: 'GearList', props: {}, panels: 1 },
  { name: 'Run strip: the pack and the keepsakes', entry: 'DungeonRunStrip', props: {}, panels: 1 },
  {
    name: 'Creature page, the whole page',
    entry: 'CreaturePage',
    props: { scene: 'P3' },
    panels: 2,
  },
  { name: 'Creature card', entry: 'CreatureCard', props: {}, panels: 1 },
  {
    name: 'Dungeon card, the team and the depth track',
    entry: 'DungeonSetup',
    props: {},
    panels: 2,
  },
  { name: 'Raid Roster', entry: 'RaidBoard', props: {}, panels: 1 },
  {
    name: 'Raid Roster, one of yours tapped (its configurator)',
    entry: 'RaidBoard',
    props: { configure: true, placed: 3 },
    tap: '.raid-board button.party-slot.mine',
    panels: 3,
  },
  {
    name: 'Drill head (shared by the item drawer and the camp)',
    entry: 'DrillHead',
    props: {},
    panels: 1,
  },
  {
    name: 'Expedition world map, phone with trips',
    entry: 'ExpeditionWorld',
    props: { layout: 'phone' },
    panels: 2,
  },
  {
    name: 'Expedition world map, phone place sheet',
    entry: 'ExpeditionWorld',
    props: { layout: 'phone', place: 'ember-caves' },
    panels: 3,
  },
  {
    name: 'Expedition world map, desktop place selected',
    entry: 'ExpeditionWorld',
    props: { layout: 'desktop', place: 'old-crossroads' },
    panels: 4,
  },
];

/** Runs in the page: the offenders among the text of every `.pix-panel` and `.prose` part. */
function audit() {
  const PIXEL = 'Jersey 10';
  const BODY = 'Atkinson Hyperlegible';
  const family = (el) =>
    getComputedStyle(el)
      .fontFamily.split(',')[0]
      .trim()
      .replace(/^["']|["']$/g, '');
  const ownText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim() !== '')
      .map((n) => n.textContent.trim())
      .join(' ');
  const found = [];
  const check = (el, expected, where) => {
    const text = ownText(el);
    if (text === '' || el.closest('.visually-hidden') !== null) return;
    const actual = family(el);
    if (actual !== expected) {
      found.push(
        `${where}: <${el.tagName.toLowerCase()} class="${el.className}"> "${text.slice(0, 40)}" is ${actual}, should be ${expected}`,
      );
    }
  };
  let texts = 0;
  for (const panel of document.querySelectorAll('.pix-panel')) {
    for (const el of [panel, ...panel.querySelectorAll('*')]) {
      if (el.closest('.prose') !== null) continue;
      if (ownText(el) !== '') texts += 1;
      check(el, PIXEL, 'pixel panel');
    }
  }
  for (const prose of document.querySelectorAll('.prose')) {
    for (const el of [prose, ...prose.querySelectorAll('*')]) {
      // A button or a heading inside prose keeps its own face (the accordion's title is a button).
      if (el.closest('button, h1, h2, h3, h4, h5') !== null) continue;
      check(el, BODY, 'prose');
    }
  }
  return { found, texts, panels: document.querySelectorAll('.pix-panel').length };
}

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
const browser = await chromium.launch(chrome === undefined ? {} : { executablePath: chrome });
let failures = 0;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const preset of PRESETS) {
    const hash = `c=${encodeURIComponent(preset.entry)}&p=${encodeURIComponent(JSON.stringify(preset.props))}&w=full&bg=night`;
    await page.goto(`${base}workbench.html?frame=1#${hash}`);
    await page.reload();
    // A view whose pixel panel opens with a tap waits for the thing to tap instead.
    await page.waitForSelector(preset.tap ?? '.pix-panel', { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    if (preset.tap !== undefined) {
      await page.locator(preset.tap).first().click();
      await page.waitForTimeout(300);
    }
    const result = await page.evaluate(audit);
    if (result.panels !== preset.panels) {
      failures += 1;
      console.log(
        `FAIL ${preset.name}: expected ${String(preset.panels)} pixel panels, found ${String(result.panels)}`,
      );
    } else if (result.texts === 0) {
      failures += 1;
      console.log(
        `FAIL ${preset.name}: no text found in a pixel panel (is the preset still right?)`,
      );
    } else if (result.found.length > 0) {
      failures += result.found.length;
      console.log(`FAIL ${preset.name}`);
      for (const line of result.found) console.log(`  ${line}`);
    } else {
      console.log(
        `ok   ${preset.name} (${String(result.panels)} panels, ${String(result.texts)} texts)`,
      );
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(
  failures === 0 ? 'Font audit clean.' : `Font audit found ${String(failures)} problem(s).`,
);
process.exit(failures === 0 ? 0 : 1);
