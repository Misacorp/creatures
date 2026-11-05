/**
 * The valley's end-to-end checklist (phase 4, step 5b): the real game in a real browser with `VALLEY` on, walked
 * through every row of "Where each of today's screens lives" in `docs/design/valley/phase4-plan.md`.
 *
 *   cd apps/activity && node scripts/e2e-valley.mjs [--out <dir>] [--width 390] [--reduced]
 *   pnpm --filter @creatures/activity e2e:valley
 *
 * What it starts: its own Vite server (the page as `main.tsx` builds it) with `@discord/embedded-app-sdk` swapped
 * for `scripts/e2e/discord-sdk-stub.mjs`, and Playwright's Chromium (PLAYWRIGHT_PATH and CHROME as in
 * `shoot.mjs`). There is no server: every `/api/*` call is answered from the worker's captured fixtures
 * (`src/fixtures/`, staging-shaped data from `pnpm fixtures:capture`), with `valley: true` in the config, the
 * starter chosen, and an away notice that the first dismissal clears. Nothing is mocked inside the game.
 *
 * It prints one line per checklist item and exits 1 on the first failure (with a screenshot of it in `--out`).
 * With `--out` it also writes a shot of the map at the end. About 30 s; not part of `check:changed`.
 */
/* global console, document, getComputedStyle, URL */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  JSON.parse(readFileSync(join(here, '../src/fixtures', `${name}.json`), 'utf8'));

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const at = args.indexOf(flag);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};
const out = resolve(argOf('--out', join(here, '../screenshots/e2e-valley')));
const width = Number.parseInt(argOf('--width', '390'), 10);
const reduced = args.includes('--reduced');
mkdirSync(out, { recursive: true });

// --- The server's answers ---------------------------------------------------------------------------------

const AWAY = {
  sources: [
    { kind: 'leet', bait: 12, essence: 3, items: 0, creatures: 0, medals: 0, xp: 40 },
    { kind: 'raid', bait: 0, essence: 0, items: 1, creatures: 0, medals: 0, xp: 0 },
  ],
  since: 1799700000000,
  until: 1799760000000,
  tripsWaiting: 0,
  jobsWaiting: 0,
};

const baseState = { ...fixture('collection-state'), starterChosen: true };
let awayDismissed = false;
/** Test-only changes to the answers of one scenario (set by `scenario`, cleared after it): never the fixtures themselves. */
let stateOverride = {};
const answerOverride = new Map();
/** Milliseconds a path's answer is held back, to see the page before its data arrives. */
const delays = new Map();
const state = () => ({ ...baseState, ...stateOverride, awayRewards: awayDismissed ? null : AWAY });

/** Fixture answers for the pages' own loads, by path; the rest answer `{}` with 404 (the page shows its own error line). */
const ROUTES = new Map([
  [
    '/api/config',
    () => ({
      discordClientId: '1',
      environment: 'e2e',
      version: 'e2e',
      leetSource: 'disabled',
      devTools: false,
      valley: true,
    }),
  ],
  [
    '/api/auth/session',
    () => ({
      sessionToken: 'e2e-session',
      accessToken: 'e2e-access',
      guildId: '1',
      user: { id: '100000000000000001', displayName: 'Misa' },
    }),
  ],
  [
    '/api/me',
    () => ({
      guildId: '1',
      user: { id: '100000000000000001', displayName: 'Misa' },
      balances: baseState.balances,
      leetSync: baseState.leetSync,
    }),
  ],
  ['/api/state', state],
  [
    '/api/away/dismiss',
    () => {
      awayDismissed = true;
      return state();
    },
  ],
  ['/api/dungeon/today', () => fixture('dungeon-today')],
  ['/api/weather', () => fixture('weather-forecast')],
  ['/api/gear', () => fixture('gear-state')],
  ['/api/games', () => fixture('games-entries')],
  ['/api/destinations', () => fixture('expedition-destinations')],
  ['/api/profile', () => fixture('expedition-profile')],
  ['/api/raid', () => fixture('raid-reveal-seen')],
  ['/api/raid/channel', () => fixture('raid-channel')],
  ['/api/raid/live', () => fixture('live-none')],
]);

const unanswered = new Set();
async function answer(route) {
  const url = new URL(route.request().url());
  const make = answerOverride.get(url.pathname) ?? ROUTES.get(url.pathname);
  const wait = delays.get(url.pathname);
  if (wait !== undefined) await new Promise((r) => setTimeout(r, wait));
  if (make === undefined) {
    unanswered.add(`${route.request().method()} ${url.pathname}`);
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"e2e"}' });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(make()),
  });
}

// --- The checklist ----------------------------------------------------------------------------------------

/** The seven places that open today's page: the place, its name (the HUD's title), and the row of the plan's table. */
const OPEN = [
  ['paddock', 'Paddock', 'Creatures list, filters, creature page; waiting catches'],
  ['forge', 'Forge', 'Workshop'],
  ['signpost', 'Signpost', 'Expeditions'],
  ['cave', 'Cave', 'Dungeon'],
  ['arena', 'Arena', 'Raid'],
  ['fair', 'Fairground', 'Valley Games'],
  ['house', 'House', 'House (Journal and Stats)'],
];
/** The four places not open yet and what a tap on each says. */
const SOON = [
  ['bonfire', 'A fire will burn here, and your creatures will rest by it.'],
  ['school', 'A teacher will visit here.'],
  ['visitor', 'A stranger will set up a stall here once a week.'],
  ['market', 'A market will open here, for shards and trades.'],
];

const playwrightPath =
  process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const server = await createServer({
  server: { port: 0 },
  logLevel: 'error',
  resolve: {
    alias: { '@discord/embedded-app-sdk': join(here, 'e2e/discord-sdk-stub.mjs') },
  },
});
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address !== null ? address.port : 5173;
const browser = await chromium.launch(
  process.env.CHROME === undefined ? {} : { executablePath: process.env.CHROME },
);
const ctx = await browser.newContext({
  viewport: { width, height: 844 },
  deviceScaleFactor: 1,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (process.env.DEBUG_E2E && m.type() === 'error') console.log('console:', m.text());
});
page.on('requestfailed', (r) => {
  if (process.env.DEBUG_E2E) console.log('failed:', r.url(), r.failure()?.errorText);
});
page.on('response', async (r) => {
  console.log('starter:', r.status(), (await r.text()).slice(0, 300));
});
await page.route('**/api/**', answer);

let done = 0;
async function step(name, run) {
  try {
    await run();
    done += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : String(error)}`);
    await page
      .screenshot({ path: join(out, `fail-${String(done + 1)}.png`) })
      .catch(() => undefined);
    throw error;
  }
}

const place = (id) => page.locator(`button[data-place="${id}"]`);
/** The HUD's title (the page's one h1): the place's name, or the book's. */
const heading = (text) => page.locator('h1.hud-title', { hasText: text });
/** The valley's way back, in the HUD before the title. */
const hudBack = () => page.locator('header.hud button.hud-back');
const shot = (name) =>
  page.screenshot({ path: join(out, `${name}-${String(width)}${reduced ? '-reduced' : ''}.png`) });
const waitFor = (locator, state = 'visible') => locator.first().waitFor({ state, timeout: 10000 });
/** The map's list of place buttons: it has no box of its own (the buttons are placed over the art). */
const VALLEY = 'ul[aria-label="The valley"]';
/** The element at the centre of `locator`'s box is the locator's own element (or inside it): nothing is drawn over it. */
const expectTopmost = async (locator, what) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${what} has no box`);
  // A grid of points over the box (a plate over the title is near the top, not in the middle).
  const points = [];
  for (let i = 0; i < 12; i += 1)
    for (let j = 0; j < 8; j += 1)
      points.push({
        x: box.x + (box.width * (i + 0.5)) / 12,
        y: box.y + (box.height * (j + 0.5)) / 8,
      });
  // Plates and layers that take no touches still draw: let every element be hit while the points are tried.
  const lift = await page.addStyleTag({ content: '* { pointer-events: auto !important; }' });
  const hits = await locator.evaluate(
    (el, ats) =>
      ats
        .map((at) => document.elementFromPoint(at.x, at.y))
        .filter((top) => top === null || !(top === el || el.contains(top)))
        .map((top) => `${top?.tagName ?? 'nothing'}.${String(top?.className)}`)
        .filter((v, i, all) => all.indexOf(v) === i),
    points,
  );
  await lift.evaluate((node) => {
    node.remove();
  });
  if (hits.length > 0) throw new Error(`${what} is covered by ${hits.join(' | ')}`);
};
const backToValley = async () => {
  await hudBack().click();
  await waitFor(page.locator(VALLEY), 'attached');
};

try {
  await page.goto(`http://localhost:${String(port)}/?frame_id=e2e`);
  await page.evaluate(() => document.fonts.ready);

  await step('the valley opens with the map, the tray and the HUD', async () => {
    await waitFor(page.locator(VALLEY), 'attached');
    await waitFor(page.locator('section[aria-label="Your creatures"]'));
    const count = await page.locator('button[data-place]').count();
    if (count !== 11) throw new Error(`expected 11 places, found ${String(count)}`);
  });

  await step('the welcome-back Gazette opens over the valley with the away notice', async () => {
    await waitFor(page.getByRole('dialog'));
    await waitFor(page.locator('article[aria-label="The Valley Gazette"]'));
  });

  await step('closing the Gazette dismisses the notice and leaves the valley', async () => {
    const dismissed = page
      .waitForRequest((r) => r.url().endsWith('/api/away/dismiss'), { timeout: 10000 })
      .catch((e) => e);
    await page
      .getByRole('button', { name: /more things?|Into the valley/i })
      .last()
      .click();
    const sent = await dismissed;
    if (sent instanceof Error) throw sent;
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
    await waitFor(page.locator(VALLEY), 'attached');
    // The still of the coming-home note (reduced motion: "+N" by the purse, at least five seconds).
    if (reduced) await shot('gains-note');
  });

  // The coming-home moment is over before the HUD is measured or shot (its plates fly over the purse).
  await page.locator('.gz-fly').waitFor({ state: 'detached', timeout: 15000 });

  await step('nothing on the map takes focus on load', async () => {
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el === null || el === document.body
        ? null
        : (el.getAttribute('aria-label') ?? el.className);
    });
    if (focused !== null) throw new Error(`the map took focus on load: ${focused}`);
  });

  if (reduced) {
    await step('reduced motion: the gains are said in a polite status region', async () => {
      const text = await page.locator('[role="status"][aria-live="polite"]').allInnerTexts();
      if (!text.some((t) => t.startsWith('Home: +') && t.includes('Bait') && t.includes('Essence')))
        throw new Error(`no gains in the status regions: ${JSON.stringify(text)}`);
    });
  }

  await step('every button on the map has a spoken name', async () => {
    const nameless = await page.evaluate(() =>
      [...document.querySelectorAll('.vy-frame button')]
        .filter((b) => !b.hidden && b.getClientRects().length > 0)
        .filter((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === '')
        .map((b) => b.className),
    );
    if (nameless.length > 0) throw new Error(`buttons without a name: ${nameless.join(', ')}`);
  });

  await step('Left and Right walk the places on the map', async () => {
    await place('cave').focus();
    await page.keyboard.press('ArrowRight');
    const at = await page.evaluate(() => document.activeElement?.getAttribute('data-place'));
    if (at !== 'fair')
      throw new Error(`Right from the cave went to ${String(at)}, not the fairground`);
    await page.keyboard.press('ArrowLeft');
    const back = await page.evaluate(() => document.activeElement?.getAttribute('data-place'));
    if (back !== 'cave') throw new Error(`Left went to ${String(back)}`);
  });

  await step(
    'Tab walks the valley in reading order and every stop shows a focus ring',
    async () => {
      await page.evaluate(() => {
        document.activeElement?.blur();
      });
      const stops = [];
      for (let i = 0; i < 60; i += 1) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const el = document.activeElement;
          if (el === null || !el.closest('.vy-frame')) return null;
          const css = getComputedStyle(el);
          const ring =
            css.boxShadow !== 'none' || (css.outlineStyle !== 'none' && css.outlineWidth !== '0px');
          return {
            place: el.getAttribute('data-place'),
            name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30),
            ring,
          };
        });
        if (stop !== null) stops.push(stop);
      }
      const bare = stops.filter((s) => !s.ring).map((s) => s.name);
      if (bare.length > 0) throw new Error(`no visible focus ring on: ${bare.join(' | ')}`);
      const places = stops.map((s) => s.place).filter((id) => id !== null);
      const order = await page.evaluate(() =>
        [...document.querySelectorAll('button[data-place]')].map((b) =>
          b.getAttribute('data-place'),
        ),
      );
      const seen = [...new Set(places)];
      // Tab starts after the button the last step left focused, so the walk may begin part way round.
      const at = order.indexOf(seen[0]);
      const turned = [...order.slice(at), ...order.slice(0, at)];
      if (seen.join() !== turned.slice(0, seen.length).join()) {
        throw new Error(
          `Tab reached the places as ${seen.join(', ')}; reading order is ${order.join(', ')}`,
        );
      }
      if (seen.length < order.length) throw new Error('Tab did not reach every place');
    },
  );

  await step('the Places button says how many places wait', async () => {
    const name = await page.locator('button.vy-hatch').getAttribute('aria-label');
    if (name === null || !/^Places(, \d+ waiting)?$/.test(name)) throw new Error(`name: ${name}`);
    await shot('map-places-count');
  });

  for (const [id, title, row] of OPEN) {
    await step(`${row}: ${id} opens today's page (HUD "${title}") and goes back`, async () => {
      await place(id).evaluate((el) => el.click());
      await waitFor(heading(title));
      if ((await hudBack().getAttribute('aria-label')) !== 'Back to the valley')
        throw new Error('the HUD has no way back to the valley');
      if ((await page.locator('.vy-page .drill-head').count()) > 0)
        throw new Error('a second title row is still inside the place');
      // Nothing overflows its parent: back, title, purse and cog share one row; the title gives way first.
      const hud = await page.evaluate(() => {
        const bar = document.querySelector('header.hud');
        if (bar === null) return null;
        const box = bar.getBoundingClientRect();
        const inside = (sel) => {
          const el = bar.querySelector(sel);
          if (el === null) return false;
          const r = el.getBoundingClientRect();
          return r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.width > 0;
        };
        const title = bar.querySelector('h1.hud-title');
        return {
          back: inside('.hud-back'),
          purse: inside('.currency-pile'),
          cog: inside('.hud-gear'),
          scrolls: bar.scrollWidth > bar.clientWidth,
          titleCut: title !== null && title.scrollWidth > title.clientWidth,
        };
      });
      if (hud === null || !hud.back || !hud.purse || !hud.cog || hud.scrolls)
        throw new Error(`the HUD overflows at ${String(width)} px: ${JSON.stringify(hud)}`);
      if (id === 'paddock' || id === 'arena') await page.waitForTimeout(400);
      if (id === 'paddock' || id === 'arena' || id === 'forge') await shot(`place-${id}`);
      // The page loaded from its fixtures: no error line is showing in it.
      await page.waitForTimeout(600);
      const alerts = await page.locator('.vy-page [role="alert"]').allInnerTexts();
      if (alerts.length > 0) throw new Error(`the page shows an error: ${alerts.join(' | ')}`);
      await backToValley();
    });
  }

  await step('Journal and Stats open from the House and go back to it', async () => {
    for (const [book, title] of [
      ['Journal', 'Journal'],
      ['Stats', 'Stats'],
    ]) {
      await place('house').evaluate((el) => el.click());
      await waitFor(page.getByRole('button', { name: new RegExp(`^${book}`) }));
      await page
        .getByRole('button', { name: new RegExp(`^${book}`) })
        .first()
        .click();
      await waitFor(heading(title));
      if (book === 'Journal') {
        // From 60 rem a list of places and the open place's pages beside it; a phone keeps the folded headings.
        const wide = width >= 960;
        const lists = await page.locator('.journal .choice-list').count();
        const panels = await page.locator('.journal .side-panel').count();
        const folds = await page.locator('.journal .journal-place').count();
        if (wide && (lists !== 1 || panels !== 1 || folds !== 0))
          throw new Error(
            `the wide Journal is not a list and a panel: ${lists}/${panels}/${folds}`,
          );
        if (!wide && (lists !== 0 || folds < 2))
          throw new Error(`the phone Journal lost its folded headings: ${lists}/${folds}`);
        await page.waitForTimeout(300);
        await shot('journal');
      }
      await page.getByRole('button', { name: 'Back to the House' }).click();
      await waitFor(page.getByRole('button', { name: /^Journal/ }));
      await backToValley();
    }
  });

  for (const [id, line] of SOON) {
    await step(`${id} is not open yet and says what it will be`, async () => {
      await place(id).evaluate((el) => el.click());
      await waitFor(page.getByText(line));
      await backToValley();
    });
  }

  await step(
    'the Places list opens, names all eleven places, the new four last, and opens one',
    async () => {
      await page.getByRole('button', { name: /^Places/ }).click();
      const rows = page.locator('ul[aria-label="Places"] button.vy-row');
      await waitFor(rows);
      const n = await rows.count();
      if (n !== 11) throw new Error(`expected 11 rows, found ${String(n)}`);
      const muted = await rows.evaluateAll((els) =>
        els.map((el) => el.classList.contains('vy-row-muted')),
      );
      if (muted.slice(0, 7).some(Boolean) || muted.slice(7).some((m) => !m))
        throw new Error(`the four places not open yet are not last and muted: ${muted.join()}`);
      await shot('places-list');
      await rows.last().scrollIntoViewIfNeeded();
      await shot('places-list-end');
      await rows.filter({ hasText: 'Forge' }).first().click();
      await waitFor(heading('Forge'));
      await backToValley();
    },
  );

  await step(
    'a place opened with a tap focuses its back control with no ring; Escape goes back',
    async () => {
      await place('cave').click({ force: true });
      await waitFor(heading('Cave'));
      const state = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          back: el?.classList.contains('hud-back') === true,
          ring: el?.matches(':focus-visible') === true,
        };
      });
      if (!state.back) throw new Error('the focus did not move to the HUD back control');
      if (state.ring) throw new Error('a ring shows on the back control after a tap');
      await page.keyboard.press('Escape');
      await waitFor(page.locator(VALLEY), 'attached');
    },
  );

  await step('a place opened with the keyboard shows the ring on its back control', async () => {
    await place('fair').focus();
    await page.keyboard.press('Enter');
    await waitFor(heading('Fairground'));
    const ring = await page.evaluate(
      () =>
        document.activeElement?.classList.contains('hud-back') === true &&
        document.activeElement.matches(':focus-visible'),
    );
    if (!ring) throw new Error('no ring on the back control for the keyboard');
    await backToValley();
  });

  await step(
    'back to the map from the House (Escape, then the HUD back) leaves no ring on any place',
    async () => {
      for (const how of ['Escape', 'back']) {
        await place('house').focus();
        await page.keyboard.press('Enter');
        await waitFor(heading('House'));
        if (how === 'Escape') await page.keyboard.press('Escape');
        else await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
        await page.waitForTimeout(200);
        const at = await page.evaluate(() => {
          const el = document.activeElement;
          if (el === null) return { on: 'nothing', ring: false };
          const css = getComputedStyle(el);
          return {
            on: el.getAttribute('data-place') ?? el.className,
            ring:
              css.boxShadow !== 'none' ||
              (css.outlineStyle !== 'none' && css.outlineWidth !== '0px'),
          };
        });
        if (
          at.on === 'house' ||
          (await page.locator('button[data-place]:focus-visible').count()) > 0
        )
          throw new Error(`a place holds the focus after ${how}: ${JSON.stringify(at)}`);
        if (at.ring) throw new Error(`a ring shows after ${how}: ${JSON.stringify(at)}`);
      }
      await shot('map-after-escape');
      // The keyboard still walks into the map, and its stops keep their rings.
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.matches('button[data-place]:focus-visible') === true;
      });
      if (!ring) throw new Error('Tab from the map did not reach a place with a ring');
    },
  );

  await step('edge chips on a phone are at least 44 px tall and wide', async () => {
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll('.vy-edge')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width < 43.5 || r.height < 43.5).length,
    );
    if (small > 0) throw new Error(`${String(small)} edge chips are under 44 px`);
  });

  await step(
    'a creature in the Paddock can be dragged and dropped, and a tap still opens its popover',
    async () => {
      await place('paddock').evaluate((el) => el.click());
      await waitFor(heading('Paddock'));
      const mon = page.locator('.vy-drag button.vy-stand-btn');
      await waitFor(mon);
      const centre = async () => {
        const b = await mon.first().boundingBox();
        if (b === null) throw new Error('the creature has no box');
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      };
      const from = await centre();
      const scene = await page.locator('.vy-scene').first().boundingBox();
      if (scene === null) throw new Error('no scene');
      const to = { x: scene.x + scene.width * 0.3, y: scene.y + scene.height * 0.5 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
      await page.screenshot({
        path: join(out, `drag-mid-${String(width)}${reduced ? '-reduced' : ''}.png`),
      });
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
      if ((await page.getByRole('dialog').count()) > 0)
        throw new Error('a drag opened the popover');
      const dropped = await centre();
      if (Math.hypot(dropped.x - to.x, dropped.y - to.y) > 60) {
        throw new Error(
          `dropped near (${String(Math.round(dropped.x))}, ${String(Math.round(dropped.y))}), not at (${String(Math.round(to.x))}, ${String(Math.round(to.y))})`,
        );
      }
      // A press that hardly moves is a tap.
      await mon.first().click();
      await waitFor(page.getByRole('dialog'));
      await page.waitForTimeout(300);
      await shot('paddock-popover');
      await expectTopmost(page.getByRole('dialog').first(), 'the creature popover (Paddock)');
      await page.getByRole('dialog').getByRole('button', { name: 'View' }).click();
      await waitFor(page.locator('.creature-page'));
      await page.waitForTimeout(1200);
      const pageTop = await page.evaluate(() => ({
        y: window.scrollY,
        top: document.querySelector('.creature-page')?.getBoundingClientRect().top ?? null,
        hud: document.querySelector('header.hud')?.getBoundingClientRect().bottom ?? 0,
      }));
      // On a wide window the scene and the page may both fit: the page then is in view without a scroll.
      if (pageTop.top === null || pageTop.top > 600 || pageTop.top < pageTop.hud - 2)
        throw new Error(`"View" left the creature's page at ${JSON.stringify(pageTop)}`);
      // The scene's band is taller than the window's top: on a phone the page has to have moved up under the HUD.
      if (width < 700 && pageTop.top > pageTop.hud + 40)
        throw new Error(`"View" did not scroll down to the creature: ${JSON.stringify(pageTop)}`);
      await shot('paddock-view');
      await backToValley();
      await place('paddock').evaluate((el) => el.click());
      await waitFor(heading('Paddock'));
      await mon.first().click();
      await waitFor(page.getByRole('dialog'));
      await page.keyboard.press('Escape');
      await backToValley();
    },
  );

  // --- Scenarios: the same game in other states. Each reloads the page with test-only answers ---------------

  /** Runs `run` on a fresh load of the valley with `change` applied to the server's answers; the answers are put back after. */
  async function scenario(name, change, run) {
    await step(name, async () => {
      awayDismissed = true;
      change();
      try {
        await page.goto(`http://localhost:${String(port)}/?frame_id=e2e`);
        await page.evaluate(() => document.fonts.ready);
        await run();
      } finally {
        stateOverride = {};
        answerOverride.clear();
        delays.clear();
      }
    });
  }
  const textIn = (locator) => locator.first().innerText();

  await scenario(
    'a dungeon run in progress: the Cave never says it is quiet, and offers to continue the run',
    () => {
      stateOverride = { attention: { dungeon: true, raid: false, recheckAt: null } };
      answerOverride.set('/api/dungeon/today', () => fixture('dungeon-today-active'));
      delays.set('/api/dungeon/today', 1500);
    },
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      await place('cave').evaluate((el) => el.click());
      await waitFor(heading('Cave'));
      // Before the Dungeon page has answered, no claim either way: not quiet, not "Start the run".
      await waitFor(page.getByRole('button', { name: /^Enter the cave/ }));
      if ((await page.getByText(/cave is quiet/i).count()) > 0)
        throw new Error('quiet before known');
      if ((await page.getByRole('button', { name: /^Start the run/ }).count()) > 0)
        throw new Error('"Start the run" before the page said what the run is');
      await shot('cave-before-known');
      // Then the page says a run is open: the Cave says so.
      await waitFor(page.getByRole('button', { name: /^Continue the run/ }));
      if ((await page.getByText(/cave is quiet/i).count()) > 0) throw new Error('quiet mid-run');
      await page.waitForTimeout(400);
      await shot('cave-mid-run');
    },
  );

  await scenario(
    'a run waiting to start: the Cave says Start the run',
    () => {
      stateOverride = { attention: { dungeon: true, raid: false, recheckAt: null } };
    },
    async () => {
      await place('cave').evaluate((el) => el.click());
      await waitFor(page.getByRole('button', { name: /^Start the run/ }));
      if ((await page.getByText(/cave is quiet/i).count()) > 0)
        throw new Error('quiet with a run waiting');
    },
  );

  await scenario(
    'no run at all (done for today): the Cave is calm',
    () => {
      stateOverride = { attention: { dungeon: false, raid: false, recheckAt: null } };
      answerOverride.set('/api/dungeon/today', () => fixture('dungeon-today-done'));
    },
    async () => {
      await place('cave').evaluate((el) => el.click());
      await waitFor(page.getByText(/cave is quiet/i));
      if ((await page.getByRole('button', { name: /^(Start|Continue) the run/ }).count()) > 0)
        throw new Error('a run is offered with none to run');
    },
  );

  // The raid's finale of the fixture week: the state's clock sets "now" (the game keeps the server's offset).
  const FINALE = fixture('raid-reveal-seen').schedule.finale;
  for (const [label, now, want] of [
    ['the weekend raid is today', FINALE - 3 * 3600 * 1000, 'today'],
    ['the raid is live now', FINALE + 60 * 1000, 'live now'],
  ]) {
    await scenario(
      `a raid weekend: ${label} (the Arena's band says "${want}")`,
      () => {
        stateOverride = { serverNow: now };
        answerOverride.set('/api/raid', () => ({ ...fixture('raid-reveal-seen'), serverNow: now }));
      },
      async () => {
        await place('arena').evaluate((el) => el.click());
        await waitFor(heading('Arena'));
        const timing = page.getByRole('img', { name: `Raid: ${want}` });
        await waitFor(timing);
        await expectTopmost(timing, `the Arena's "${want}" label`);
        await page.waitForTimeout(400);
        await shot(`arena-${want.replace(' ', '-')}`);
      },
    );
  }

  await scenario(
    'a full bag: the Forge shows its notice and the bag count, and both can be reached',
    () => {
      answerOverride.set('/api/gear', () => {
        const gear = fixture('gear-state');
        return { ...gear, inventory: { ...gear.inventory, used: gear.inventory.cap, reserved: 0 } };
      });
    },
    async () => {
      await place('forge').evaluate((el) => el.click());
      await waitFor(heading('Forge'));
      const warning = page.locator('[role="status"]', {
        hasText: 'Gear you find becomes parts until the bag has room.',
      });
      await waitFor(warning);
      await warning.first().scrollIntoViewIfNeeded();
      await expectTopmost(warning.first(), 'the full-bag notice');
      const count = await textIn(page.locator('.bag-count.over'));
      if (!/60 ?\/ ?60/.test(count)) throw new Error(`the bag count says "${count}"`);
      await shot('forge-full-bag');
      // The same warning where a run sets off (the Cave's setup), still reachable.
      await backToValley();
      await place('cave').evaluate((el) => el.click());
      await waitFor(page.locator('.bag-full-note'));
      await page.locator('.bag-full-note').first().scrollIntoViewIfNeeded();
      await expectTopmost(page.locator('.bag-full-note').first(), "the Cave's full-bag note");
    },
  );

  await scenario(
    'a brand-new player: the starter pick first, then the valley with that one creature',
    () => {
      const chosen = baseState.creatures[0];
      stateOverride = {
        starterChosen: false,
        creatures: [],
        pending: [],
        loungerId: null,
        loungeXp: {},
        attention: null,
      };
      answerOverride.set('/api/starter', () => {
        stateOverride = { creatures: [chosen], pending: [], loungerId: null, loungeXp: {} };
        // The server wraps a state an action returns as `{ state }`.
        return { state: state() };
      });
    },
    async () => {
      const options = page.getByRole('button', { name: /^Choose / });
      await waitFor(options);
      if ((await page.locator('button[data-place]').count()) > 0)
        throw new Error('the valley is drawn before a starter is chosen');
      await shot('new-player-starter');
      await options.first().click();
      await waitFor(page.locator(VALLEY), 'attached');
      const count = await page.locator('button[data-place]').count();
      if (count !== 11) throw new Error(`expected 11 places, found ${String(count)}`);
      await waitFor(page.locator('section[aria-label="Your creatures"] button'));
      await shot('new-player-valley');
    },
  );

  // The map as a player sees it (nothing focused), then the keyboard's own walk for the focus shot.
  await page.screenshot({ path: join(out, `valley-${String(width)}.png`) });
  await place('forge').focus();
  await page.keyboard.press('ArrowLeft');
  await page.screenshot({ path: join(out, `focus-map-${String(width)}.png`) });
  console.log(`\n${String(done)} items passed`);
  if (pageErrors.length > 0) console.log(`page errors: ${pageErrors.join(' | ')}`);
  if (unanswered.size > 0) {
    console.log(`API calls with no fixture: ${[...unanswered].join(', ')}`);
  }
} catch {
  process.exitCode = 1;
  if (unanswered.size > 0) console.log(`unanswered: ${[...unanswered].join(', ')}`);
} finally {
  await browser.close();
  await server.close();
}
