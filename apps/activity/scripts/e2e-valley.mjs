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
const state = () => ({ ...baseState, awayRewards: awayDismissed ? null : AWAY });

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
  const make = ROUTES.get(url.pathname);
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

/** The seven places that open today's page: the place, its page's title, and the row of the plan's table. */
const OPEN = [
  ['paddock', 'Creatures', 'Creatures list, filters, creature page; waiting catches'],
  ['forge', 'Workshop', 'Workshop'],
  ['signpost', 'Expeditions', 'Expeditions'],
  ['cave', 'Dungeon', 'Dungeon'],
  ['arena', 'Raid', 'Raid'],
  ['fair', 'Valley Games', 'Valley Games'],
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
const heading = (text) => page.locator('h3.drill-title', { hasText: text });
const waitFor = (locator, state = 'visible') => locator.first().waitFor({ state, timeout: 10000 });
/** The map's list of place buttons: it has no box of its own (the buttons are placed over the art). */
const VALLEY = 'ul[aria-label="The valley"]';
const backToValley = async () => {
  await page
    .getByRole('button', { name: /^Valley/ })
    .first()
    .click();
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
  });

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

  for (const [id, title, row] of OPEN) {
    await step(`${row}: ${id} opens today's page ("${title}") and goes back`, async () => {
      await place(id).evaluate((el) => el.click());
      await waitFor(heading(title));
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
      await page
        .getByRole('button', { name: /^(Back|House)/ })
        .first()
        .click();
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

  await step('the Places list opens, names all eleven places and opens one', async () => {
    await page.getByRole('button', { name: 'Places', exact: true }).click();
    const rows = page.locator('ul[aria-label="Places"] button.vy-row');
    await waitFor(rows);
    const n = await rows.count();
    if (n !== 11) throw new Error(`expected 11 rows, found ${String(n)}`);
    await rows.filter({ hasText: 'Forge' }).first().click();
    await waitFor(heading('Workshop'));
    await backToValley();
  });

  await step(
    'a creature in the Paddock can be dragged and dropped, and a tap still opens its popover',
    async () => {
      await place('paddock').evaluate((el) => el.click());
      await waitFor(heading('Creatures'));
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
      await page.keyboard.press('Escape');
      await backToValley();
    },
  );

  await place('forge').focus();
  await page.keyboard.press('ArrowLeft');
  await page.screenshot({ path: join(out, `focus-map-${String(width)}.png`) });
  await page.screenshot({ path: join(out, `valley-${String(width)}.png`) });
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
