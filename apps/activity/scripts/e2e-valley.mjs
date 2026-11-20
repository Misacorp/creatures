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
 *   --only <text>   run only the items whose name contains the text (for iterating on one)
 *
 * It prints one line per checklist item and exits 1 on the first failure (with a screenshot of it in `--out`).
 * With `--out` it also writes a shot of the map at the end. About 30 s; not part of `check:changed`.
 */
/* global console, document, getComputedStyle, requestAnimationFrame, setTimeout, URL, window */
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
const height = Number.parseInt(argOf('--height', '844'), 10);
/** The device pixel ratio of the page (`--dpr 2` for a high-density screen); shots of a ratio other than 1 say so in their names. */
const dpr = Number.parseFloat(argOf('--dpr', '1'));
/** Extra page-address options for a look at the game (`E2E_QUERY='name=value'`). */
const extraQuery = process.env.E2E_QUERY === undefined ? '' : `&${process.env.E2E_QUERY}`;
const reduced = args.includes('--reduced');
/** Runs only the checklist items whose name contains this text (for iterating on one: `--only School`). */
const only = argOf('--only', null);
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
      // The server wraps a state an action returns as `{ state }`.
      return { state: state() };
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
  const made = make(route.request());
  // A refusal: `{ refuse: 409, error: 'code' }` answers that status with `{ error }` (the game reads the code).
  const refused = made !== null && typeof made === 'object' && 'refuse' in made;
  await route.fulfill({
    status: refused ? made.refuse : 200,
    contentType: 'application/json',
    body: JSON.stringify(refused ? { error: made.error } : made),
  });
}

// --- The valley's scouts (phase 5 step 2): a small server of its own for the Signpost's three routes ---------

const PLACES = [
  ['tidepools', 'tide', 'scrap', true],
  ['ember-caves', 'ember', 'shards', true],
  ['verdant-hollow', 'grove', 'creatures', true],
  ['festival-grounds', null, 'rare', false],
].map(([id, element, rich, open]) => ({
  id,
  element,
  rich,
  open,
  night: false,
  special: id === 'ember-caves',
}));
const LADDER = [0, 113, 188, 281, 394, 525];
/** The Signpost's state of a scenario: the seats (id, destination, creatureId, hours), the kit owned and the creatures' ids. */
const scouts = { seats: [], owned: [], ids: [] };
/** The Bonfire's state of a scenario (phase 5 step 5): who is online with which creatures, who is catching up, whose post is in the raid. */
const bonfire = { online: [], warm: new Set(), raid: new Set() };
/** The server's unread paper of a scenario (phase 5 step 4: `valley.paper`), and what the Gazette's routes were asked. */
const gazette = { paper: null };
const gazetteCalls = [];
const headline = (kind, weight, count, extra = {}) => ({
  kind,
  weight,
  count,
  creatureIds: [],
  species: null,
  step: null,
  rarity: null,
  turn: null,
  items: [],
  blueprints: [],
  newcomers: [],
  ...extra,
});
const paperOf = (kind, creatures) => {
  const [a, , c] = creatures;
  const newest = creatures[creatures.length - 1];
  // The fixture has three creatures, so the newest is also `c`: three distinct newcomers are the newest, the second and the first.
  const long = kind === 'long absence';
  const headlines = long
    ? [
        headline('new-species', 95, 3, {
          creatureIds: [a.id],
          species: newest.species,
          newcomers: [newest.id, creatures[1].id, a.id],
        }),
        headline('mastery-scout', 90, 2, { creatureIds: [a.id], step: 3 }),
        headline('found-gear', 95, 7, {
          creatureIds: [a.id],
          rarity: 'epic',
          items: [
            { id: 'e2e-1', baseId: 'kelp-cap', rarity: 'epic', level: 9 },
            { id: 'e2e-2', baseId: 'kelp-cap', rarity: 'rare', level: 8 },
          ],
        }),
      ]
    : [
        headline('new-species', 100, 1, {
          creatureIds: [a.id],
          species: newest.species,
          newcomers: [newest.id],
        }),
        headline('found-gear', 80, 2, {
          creatureIds: [a.id],
          rarity: 'rare',
          items: [{ id: 'e2e-3', baseId: 'kelp-cap', rarity: 'rare', level: 5 }],
        }),
        headline('resting-xp', 45, 1, { creatureIds: [c.id] }),
      ];
  return {
    id: String(1799760000000 + (long ? 1 : 0)),
    at: 1799760000000,
    awayHours: long ? 216 : 26,
    headlines: headlines.sort((x, y) => y.weight - x.weight),
    more: long ? 9 : 2,
    brought: { acorns: long ? 480 : 130, scrap: 60, shards: 7 },
    decision: long
      ? null
      : { kind: 'push-on', seatId: 'seat-1', creatureId: a.id, destination: 'ember-caves' },
  };
};
const seatView = (s) => ({
  id: s.id,
  destination: s.destination,
  creatureId: s.creatureId,
  kit: s.kit ?? null,
  fit: false,
  paused: s.creatureId !== null && bonfire.raid.has(s.creatureId) ? 'raid' : null,
  second: false,
  deep: s.deep === true,
  mastery: { hours: 0, step: 0, bonusBp: 0 },
  store: {
    hours: s.creatureId === null ? 0 : s.hours,
    capHours: 72,
    full: s.creatureId !== null && s.hours >= 72,
    wasFull: false,
    fullInHours: s.creatureId === null || s.hours >= 72 ? null : 72 - s.hours,
    scrap: Math.round(s.hours * 2),
    shards: Math.round(s.hours * 0.13),
    gear: 0,
    blueprints: 0,
    pages: 0,
  },
  perDay: { scrap: 50, shards: 3, creatures: 0.3, gear: 0.2, blueprints: 0.07, pages: 0.1 },
});
/** The Forge's state of a scenario (phase 5 step 3): the anvils (id, creatureId, kit, orders), the shelf and the order counter. */
const forgeState = {
  anvils: [],
  shelf: { scrap: 120, essence: 30, shards: { tide: 4, ember: 7, grove: 0, spark: 2, mire: 3 } },
  nextOrder: 1,
  /** Other players' smiths at work, for the workshop's background (the valley block's `smiths`). */
  crowd: [],
  /** An element every smith with an order waits for (Q64's wait line); null: nobody waits for a shard. */
  waitShard: null,
  /** The sealed crate (V-FORGE-5): the rarities of the pieces waiting in it, oldest first (empty: nothing sealed). */
  crate: [],
};
/** The best rarity sealed in a crate, as the valley block says it. */
const crateBest = (crate) =>
  crate.includes('epic') ? 'epic' : crate.includes('rare') ? 'rare' : null;
const ANVIL_LADDER = [
  { acorns: 0, scrap: 0 },
  { acorns: 123, scrap: 38 },
];
const orderView = (o) => ({
  id: o.id,
  blueprintId: o.blueprintId ?? null,
  forTeam: o.blueprintId === undefined || o.blueprintId === null,
  count: o.count,
  made: 0,
  reach: o.reach,
  needs: {
    scrap: 36,
    shardElement:
      forgeState.waitShard ??
      (o.blueprintId === undefined || o.blueprintId === null
        ? null
        : String(o.blueprintId).startsWith('patchwork-')
          ? (o.element ?? null)
          : 'tide'),
    shard: 1,
    essence: o.reach === 'rare' ? 25 : o.reach === 'epic' ? 70 : 0,
  },
  waiting: forgeState.waitShard === null ? null : 'shard',
});
const anvilView = (a) => ({
  id: a.id,
  creatureId: a.creatureId,
  kit: a.kit ?? null,
  paused: a.creatureId !== null && bonfire.raid.has(a.creatureId) ? 'raid' : null,
  mastery: { hours: 0, step: 0, bonusBp: 0 },
  orders: a.orders.map(orderView),
  piece:
    a.creatureId !== null && a.orders.length > 0 && forgeState.waitShard === null
      ? { orderId: a.orders[0].id, rarity: 0, progress: 6, need: 16, leftHours: 10 }
      : null,
  tinkering:
    a.creatureId !== null &&
    a.orders.length > 0 &&
    forgeState.waitShard !== null &&
    !bonfire.raid.has(a.creatureId)
      ? { reason: 'shard', shardElement: forgeState.waitShard, sinceHours: 3 }
      : a.creatureId !== null && a.orders.length === 0 && !bonfire.raid.has(a.creatureId)
        ? { reason: 'idle', shardElement: null, sinceHours: 3 }
        : null,
  floor: { count: 2, cap: 5, full: false, byRarity: [2, 0, 0] },
  perDay: { pieces: a.creatureId !== null && a.orders.length > 0 ? 1.5 : 0 },
});
/** The Market's state of a scenario (phase 5 step 7): whether the block is sent, the broker's creature and what it trades toward. */
const marketState = { on: false, built: false, creatureId: null, toward: null };
const BROKER_TIER = { rate: 2.4, critBp: 1000, critYield: 2 };
const marketBlock = () => ({
  open: marketState.built,
  seat: marketState.built
    ? {
        id: 'broker-1',
        creatureId: marketState.creatureId,
        paused: null,
        toward: marketState.toward,
        mastery: { hours: 0, step: 0, bonusBp: 0 },
        terms: BROKER_TIER,
        next: { rate: 2.4, critBp: 1500, critYield: 2, atHours: 48 },
        blocked: null,
      }
    : null,
});
/** The trial of a creature with no honour and nothing ticked: Bronze is next. */
const NO_TRIAL = { honour: 0, tier: 1, boxes: [false, false, false, false], ready: false };
/** The server's `valley` block for the scenario's seats; every creature rests unless a seat holds it. */
const valleyBlock = () => ({
  settledAt: 1799760000000,
  arrived: true,
  awayHours: 6,
  creatures: scouts.ids.map((id, i) => {
    const seat = scouts.seats.find((s) => s.creatureId === id);
    const anvil = forgeState.anvils.find((a) => a.creatureId === id);
    const helps = Object.entries(commonsState.communal).find(([, creatureId]) => creatureId === id);
    const trades = marketState.on && marketState.creatureId === id;
    return {
      id,
      state:
        seat !== undefined
          ? 'scouting'
          : anvil !== undefined
            ? 'smithing'
            : trades
              ? 'trading'
              : helps !== undefined
                ? 'helping'
                : 'resting',
      gained: 25 + i * 11,
      catchUpBp: bonfire.warm.has(id) ? 24000 : 10000,
      ...(trialsState.on ? { trial: trialsState.byId[id] ?? NO_TRIAL } : {}),
      seatId:
        seat?.id ??
        anvil?.id ??
        (trades ? 'broker-1' : helps === undefined ? null : `communal-${helps[0]}`),
    };
  }),
  online: bonfire.online,
  smiths: forgeState.crowd,
  allowance: { store: 0, cap: 480, brought: 0 },
  anvils: forgeState.anvils.map(anvilView),
  anvilPrices: {
    owned: forgeState.anvils.length,
    max: 2,
    next: ANVIL_LADDER[forgeState.anvils.length] ?? null,
    ladder: ANVIL_LADDER,
  },
  forge: {
    shelf: forgeState.shelf,
    bag: { count: 34, cap: 200 },
    fireLevel: 1,
    exchange: { rate: 3, critBp: 1000, critYield: 2 },
    queueMax: 3,
    orderCountMax: 99,
    crate: { count: forgeState.crate.length, cap: 30, best: crateBest(forgeState.crate) },
  },
  seats: scouts.seats.map(seatView),
  seatPrices: {
    owned: scouts.seats.length,
    max: 2,
    next: scouts.seats.length >= 2 ? null : LADDER[scouts.seats.length],
    ladder: LADDER,
  },
  kit: { owned: scouts.owned, price: 875 },
  places: PLACES,
  night: false,
  special: { destination: 'ember-caves', twist: 'rich-veins' },
  ...(gazette.paper === null ? {} : { paper: gazette.paper }),
  ...(trialsState.on
    ? { graduation: { ready: trialsState.ready, nextAt: 1799760000000 + 5 * 3600 * 1000 } }
    : {}),
  ...(commonsState.on ? { commons: commonsBlock() } : {}),
  ...(marketState.on ? { market: marketBlock() } : {}),
});
/** Puts the scouts' state into the state the page asks for (and answers each route with it). */
const syncValley = () => {
  stateOverride = { ...stateOverride, valley: valleyBlock() };
  return { valley: valleyBlock(), state: { ...state(), valley: undefined } };
};
/** What the Signpost's routes were asked, in order (the body of each). */
const scoutCalls = [];
const bodyOf = (request) => JSON.parse(request.postData() ?? '{}');
ROUTES.set('/api/valley/seat', (request) => {
  const body = bodyOf(request);
  scoutCalls.push(['seat', body]);
  if (body.seatId === 'broker-1' && body.creatureId !== undefined) {
    marketState.creatureId = body.creatureId;
  }
  const anvil = forgeState.anvils.find((a) => a.id === body.seatId);
  if (anvil !== undefined && body.creatureId !== undefined) {
    const other = forgeState.anvils.find((a) => a.creatureId === body.creatureId && a !== anvil);
    if (other !== undefined) other.creatureId = anvil.creatureId;
    anvil.creatureId = body.creatureId;
  }
  const seat = scouts.seats.find((s) => s.id === body.seatId);
  if (seat !== undefined) {
    if (body.destination !== undefined)
      Object.assign(seat, { destination: body.destination, hours: 0 });
    if (body.creatureId !== undefined) {
      const other = scouts.seats.find((s) => s.creatureId === body.creatureId && s !== seat);
      if (other !== undefined) other.creatureId = seat.creatureId;
      seat.creatureId = body.creatureId;
      if (body.creatureId !== null && seat.hours === 0) seat.hours = 12;
    }
  }
  return { seatId: body.seatId, ...syncValley() };
});
ROUTES.set('/api/valley/seat/buy', (request) => {
  scoutCalls.push(['buy', bodyOf(request)]);
  scouts.seats.push({
    id: `seat-${String(scouts.seats.length + 1)}`,
    destination: 'tidepools',
    creatureId: null,
    hours: 0,
  });
  return { seatId: scouts.seats.at(-1).id, price: 0, ...syncValley() };
});
ROUTES.set('/api/valley/kit', (request) => {
  const body = bodyOf(request);
  scoutCalls.push(['kit', body]);
  if (body.action === 'buy') scouts.owned.push(body.kit);
  else {
    const seat =
      scouts.seats.find((s) => s.id === body.seatId) ??
      forgeState.anvils.find((a) => a.id === body.seatId);
    if (seat !== undefined) seat.kit = body.kit;
  }
  return { ...syncValley() };
});

/** What the Forge's routes were asked, in order (the route and the body of each). */
const forgeCalls = [];
ROUTES.set('/api/valley/anvil/buy', (request) => {
  forgeCalls.push(['anvil/buy', bodyOf(request)]);
  const next = ANVIL_LADDER[forgeState.anvils.length];
  forgeState.shelf.scrap -= next.scrap;
  forgeState.anvils.push({
    id: `anvil-${String(forgeState.anvils.length + 1)}`,
    creatureId: null,
    kit: null,
    orders: [],
  });
  return { seatId: forgeState.anvils.at(-1).id, ...syncValley() };
});
/** The sealed crate's answers by idempotency key (a retry of the same key answers the same, and opens nothing twice). */
const crateAnswers = new Map();
ROUTES.set('/api/valley/forge/crate/open', (request) => {
  const body = bodyOf(request);
  forgeCalls.push(['crate/open', body]);
  const kept = crateAnswers.get(body.idempotencyKey);
  if (kept !== undefined) return { ...kept, ...syncValley() };
  const gear = fixture('gear-state').items;
  const maker = scouts.ids[0] ?? null;
  const pieces = forgeState.crate.map((rarity, i) => ({
    item: {
      ...gear[(i + 2) % gear.length],
      id: `crate-${String(i)}`,
      rarity,
      itemLevel: 5 + i * 4,
      equippedOn: null,
    },
    wornBy: i === 1 ? maker : null,
    madeBy: maker,
  }));
  forgeState.crate = [];
  const answer = { pieces, sealed: 0, bagFull: false };
  crateAnswers.set(body.idempotencyKey, answer);
  return { ...answer, ...syncValley() };
});
ROUTES.set('/api/valley/order', (request) => {
  const body = bodyOf(request);
  forgeCalls.push(['order', body]);
  if (body.action === 'add') {
    const anvil = forgeState.anvils.find((a) => a.id === body.seatId);
    anvil.orders.push({
      id: `order-${String(forgeState.nextOrder++)}`,
      blueprintId: body.forTeam ? null : body.blueprintId,
      count: body.count ?? 1,
      reach: body.reach ?? 'none',
      element: body.element,
    });
  } else if (body.action === 'edit') {
    for (const a of forgeState.anvils) {
      const order = a.orders.find((o) => o.id === body.orderId);
      if (order !== undefined)
        Object.assign(order, {
          count: body.count ?? order.count,
          reach: body.reach ?? order.reach,
        });
    }
  } else {
    for (const a of forgeState.anvils) a.orders = a.orders.filter((o) => o.id !== body.orderId);
  }
  return { ...syncValley() };
});
ROUTES.set('/api/valley/exchange', (request) => {
  const body = bodyOf(request);
  forgeCalls.push(['exchange', body]);
  const shards = forgeState.shelf.shards;
  const from =
    body.from ??
    Object.keys(shards)
      .filter((e) => e !== body.to)
      .sort((x, y) => shards[y] - shards[x])[0];
  shards[from] -= 3 * body.times;
  shards[body.to] += body.times;
  return {
    trades: Array.from({ length: body.times }, () => ({})),
    gained: body.times,
    ...syncValley(),
  };
});

/**
 * The commons of a scenario (phase 5 step 6b): each place's level, project (its size and what each part has taken), build days, plaque and
 * keepsakes, the collections' finders, the fire, and the communal seats. `commonsBlock` makes the server's `valley.commons` from it.
 */
const commonsState = {
  on: false,
  hearthBp: 10000,
  fire: {
    level: 12,
    milli: 12400,
    next: 25,
    recent: [
      { source: 'place', place: 'forge', at: 1799700000000 },
      { source: 'collection', place: 'signpost', at: 1799600000000 },
    ],
  },
  places: {},
  sockets: {},
  communal: {},
};
const COMMONS_PLACES = ['bonfire', 'forge', 'signpost', 'paddock', 'school', 'market'];
const COMMONS_ELEMENT = {
  bonfire: 'ember',
  forge: 'ember',
  signpost: 'grove',
  paddock: 'tide',
  school: 'spark',
  market: 'mire',
};
const COMMONS_BOARDS = {
  forge: [
    'keystone:tidepools',
    'keystone:ember-caves',
    'keystone:verdant-hollow',
    'keystone:storm-ridge',
    'everyday',
  ],
  signpost: [
    'keystone:sunken-fen',
    'keystone:old-crossroads',
    'keystone:tidepools',
    'keystone:storm-ridge',
    'everyday',
  ],
  bonfire: ['landmark:1', 'landmark:2', 'landmark:3', 'landmark:4', 'everyday'],
  paddock: ['resident:1', 'resident:2', 'resident:3', 'resident:4', 'everyday'],
  school: ['page:1', 'page:2', 'page:3', 'page:4', 'everyday'],
};
/**
 * The units each part of a project of `size` needs: the shares 0.4, 0.4 and 0.2 over the parts' values 1, 0.5 and 2. The Market's
 * (V-COM-15): 0.5 and 0.5 of Acorns and scrap, and shards of any element, one value each (`MARKET_SHARD`), may fill the whole of it.
 */
const MARKET_SHARD = 0.25;
const needsOf = (size, id = '') =>
  id === 'market'
    ? { acorns: size * 0.5, scrap: size, shards: size / MARKET_SHARD }
    : { acorns: size * 0.4, scrap: size * 0.8, shards: size * 0.1 };
const valueOfPart = (part, id) =>
  part === 'shards' && id === 'market' ? MARKET_SHARD : PART_VALUE[part];
/** How much of a project is filled, in Acorns' worth (the Market's never past its size). */
const filledOf = (p, id) => {
  const need = needsOf(p.size, id);
  const sum = ['acorns', 'scrap', 'shards'].reduce(
    (total, part) => total + Math.min(p.have[part], need[part]) * valueOfPart(part, id),
    0,
  );
  return id === 'market' ? Math.min(p.size, sum) : sum;
};
/** The units a part still takes (the Market's no more than what the project still lacks). */
const roomOfPart = (p, id, part) => {
  const own = Math.max(0, needsOf(p.size, id)[part] - p.have[part]);
  return id === 'market'
    ? Math.min(own, Math.max(0, p.size - filledOf(p, id)) / valueOfPart(part, id))
    : own;
};
const PART_VALUE = { acorns: 1, scrap: 0.5, shards: 2 };
const placeOf = (id) => ({
  level: 1,
  state: 'waiting',
  size: 0,
  have: { acorns: 0, scrap: 0, shards: 0 },
  given: 0,
  buildDays: 0,
  plaque: [],
  keepsakes: 0,
  ...commonsState.places[id],
});
/** The commons' places, a few of them open or built, for a scenario that wants the boards. */
const commonsScene = (overrides = {}) => {
  commonsState.on = true;
  commonsState.hearthBp = 10000;
  commonsState.communal = {};
  commonsCalls.length = 0;
  commonsState.sockets = {
    forge: [null, 'Mia', null, null, 'Ada'],
    signpost: [null, null, null, null, null],
  };
  commonsState.places = {
    bonfire: {
      level: 1,
      state: 'open',
      size: 400,
      have: { acorns: 60, scrap: 100, shards: 4 },
      given: 60,
    },
    forge: {
      level: 2,
      state: 'building',
      buildDays: 2,
      plaque: ['Ada', 'Mia', 'Tobias'],
      keepsakes: 1,
    },
    signpost: {
      level: 2,
      state: 'open',
      size: 900,
      have: { acorns: 120, scrap: 200, shards: 20 },
      plaque: ['Ada', 'Mia', 'Tobias', 'You'],
      keepsakes: 1,
    },
    paddock: { level: 1, state: 'open', size: 600, have: { acorns: 180, scrap: 360, shards: 45 } },
    school: { level: 1, state: 'waiting' },
    // The guided start (Q48) opens the Market second, before the Forge: a valley with a Forge being built has its Market built.
    market: { level: 2, state: 'done', plaque: ['Ada'] },
    ...overrides,
  };
};
const commonsBlock = () => ({
  places: COMMONS_PLACES.map((id) => {
    const p = placeOf(id);
    const open = p.state === 'open';
    const progress = open ? filledOf(p, id) : 0;
    return {
      id,
      level: p.level,
      max: id === 'market' ? 2 : 5,
      cosmetic: 0,
      state: p.state,
      project: open
        ? {
            size: p.size,
            progress,
            needs: {
              acorns: roomOfPart(p, id, 'acorns'),
              scrap: roomOfPart(p, id, 'scrap'),
              shards: roomOfPart(p, id, 'shards'),
            },
            shardElement: COMMONS_ELEMENT[id],
            anyShard: id === 'market' ? MARKET_SHARD : null,
            cosmetic: false,
          }
        : null,
      buildDaysLeft: p.state === 'building' ? p.buildDays : 0,
      mine: {
        given: Math.round(p.given),
        shareBp: p.given > 0 && open ? Math.round((p.given / Math.max(1, progress)) * 10000) : 0,
      },
      plaque: p.plaque,
      keepsakes: p.keepsakes,
    };
  }),
  collections: COMMONS_PLACES.filter((id) => id in COMMONS_BOARDS).map((id) => {
    const finders = commonsState.sockets[id] ?? [];
    return {
      place: id,
      sockets: COMMONS_BOARDS[id].map((source, k) => ({
        source,
        set: finders[k] !== undefined && finders[k] !== null,
        finder: finders[k] ?? null,
      })),
      done: false,
    };
  }),
  fire: commonsState.fire,
  hearthBp: commonsState.hearthBp,
  keystones: { found: 1, meanDays: 21 },
  communal: COMMONS_PLACES.map((id) => ({
    place: id,
    seatId: id in commonsState.communal ? `communal-${id}` : null,
    creatureId: commonsState.communal[id] ?? null,
    storeHours: 0,
    perDay: 6,
  })),
});
/** What the commons' routes were asked, in order (the route and the body of each). */
const commonsCalls = [];
ROUTES.set('/api/valley/gift', (request) => {
  const body = bodyOf(request);
  commonsCalls.push(['gift', body]);
  const p = placeOf(body.place);
  const need = needsOf(p.size, body.place);
  const part = body.currency;
  // The Market counts shards of every element in full (V-COM-15); other places count only their own so.
  const own = body.place === 'market' || body.element === COMMONS_ELEMENT[body.place];
  const units = part === 'shards' && !own ? Math.floor(body.amount / 3) : body.amount;
  const room = Math.max(0, Math.ceil(roomOfPart(p, body.place, part) - 1e-9));
  const taken = Math.min(units, room);
  const spent = part === 'shards' && !own ? taken * 3 : taken;
  const have = { ...p.have, [part]: p.have[part] + taken };
  const done =
    body.place === 'market'
      ? filledOf({ ...p, have }, 'market') >= p.size - 1e-9
      : ['acorns', 'scrap', 'shards'].every((k) => have[k] >= need[k] - 1e-9);
  commonsState.places[body.place] = done
    ? {
        ...p,
        have: { acorns: 0, scrap: 0, shards: 0 },
        level: p.level + 1,
        state: body.place === 'market' ? 'done' : 'building',
        buildDays: 3,
        plaque: [...p.plaque, 'You'].sort(),
        keepsakes: p.keepsakes + 1,
        given: 0,
      }
    : { ...p, have, given: p.given + taken * valueOfPart(part, body.place) };
  return {
    place: body.place,
    currency: part,
    spent,
    value: taken * valueOfPart(part, body.place),
    levelUp: done,
    level: commonsState.places[body.place].level,
    ...syncValley(),
  };
});
ROUTES.set('/api/valley/broker', (request) => {
  const body = bodyOf(request);
  commonsCalls.push(['broker', body]);
  marketState.toward = body.toward;
  return { seatId: body.seatId, ...syncValley() };
});
ROUTES.set('/api/valley/communal', (request) => {
  const body = bodyOf(request);
  commonsCalls.push(['communal', body]);
  for (const [place, creatureId] of Object.entries(commonsState.communal)) {
    if (creatureId === body.creatureId && place !== body.place) {
      commonsState.communal[place] = commonsState.communal[body.place] ?? null;
    }
  }
  commonsState.communal[body.place] = body.creatureId;
  return { seatId: `communal-${body.place}`, ...syncValley() };
});

// --- The weekly visitor (phase 5 step 8b): a small server of its own for his three routes -------------------

/**
 * The visitor's state of a scenario: whether he is here, the rerolls this player made this week, whether the blueprint was bought, which
 * pieces were rerolled (their lines' tiers move up one), what the player holds, and what his routes were asked (the bodies, in order).
 */
const visitorState = {
  here: false,
  rerolls: 0,
  bought: false,
  rerolled: new Set(),
  bait: 900,
  scrap: 9000,
  shards: 120,
  calls: [],
};
const visitorReset = () => {
  Object.assign(visitorState, {
    here: false,
    rerolls: 0,
    bought: false,
    bait: 900,
    scrap: 9000,
    shards: 120,
    calls: [],
  });
  visitorState.rerolled.clear();
};
const VISITOR_BLUEPRINT = 'thundercap';
/** A reroll's price at an item level after `n` rerolls this week (`rerollPrice`: 60 Acorns and 400 scrap at item level 10, times 1.5 each). */
const visitorPrice = (level, n) => ({
  acorns: Math.round(((60 * level) / 10) * 1.5 ** n),
  scrap: Math.round(((400 * level) / 10) * 1.5 ** n),
});
/** The captured bag with the player's piles and the lines' tiers of rerolled pieces moved up one. */
const visitorGear = () => {
  const gear = fixture('gear-state');
  const each = Math.floor(visitorState.shards / 5);
  return {
    ...gear,
    parts: {
      ...gear.parts,
      scrap: visitorState.scrap,
      'tide-shard': each,
      'ember-shard': each,
      'grove-shard': each,
      'spark-shard': each,
      'mire-shard': each,
    },
    items: gear.items.map((item) =>
      visitorState.rerolled.has(item.id)
        ? {
            ...item,
            lines: item.lines.map((l) =>
              l.source === 'rolled' && l.tier !== null
                ? { ...l, tier: (l.tier % (l.bestTier ?? 5)) + 1 }
                : l,
            ),
          }
        : item,
    ),
  };
};
const visitorOdds = (item) => ({
  lines: item.lines.filter((l) => l.source === 'rolled').length,
  topTier: 3,
  tiers: [
    { tier: 3, chance: 0.4 },
    { tier: 2, chance: 0.3 },
    { tier: 1, chance: 0.2 },
    { tier: 0, chance: 0.1 },
  ],
  topChance: 0.4,
  singleShare: 0,
});
ROUTES.set('/api/valley/visitor', (request) => {
  if (!visitorState.here) return { here: false };
  const id = new URL(request.url()).searchParams.get('item');
  const stock = {
    here: true,
    blueprint: { baseId: VISITOR_BLUEPRINT, acorns: 40, shards: 50, bought: visitorState.bought },
    rerolls: visitorState.rerolls,
  };
  const item = id === null ? undefined : visitorGear().items.find((i) => i.id === id);
  return item === undefined
    ? stock
    : {
        ...stock,
        item: {
          id: item.id,
          itemLevel: item.itemLevel,
          rarity: item.rarity,
          price: visitorPrice(item.itemLevel, visitorState.rerolls),
          odds: visitorOdds(item),
        },
      };
});
ROUTES.set('/api/valley/visitor/reroll', (request) => {
  const body = bodyOf(request);
  visitorState.calls.push(['reroll', body]);
  if (!visitorState.here) return { refuse: 409, error: 'visitor_away' };
  const item = visitorGear().items.find((i) => i.id === body.itemId);
  if (item === undefined) return { refuse: 404, error: 'not_found' };
  const paid = visitorPrice(item.itemLevel, visitorState.rerolls);
  const next = visitorPrice(item.itemLevel, visitorState.rerolls + 1);
  const linesOf = (list) =>
    list.filter((l) => l.source === 'rolled').map((l) => ({ id: l.id, tier: l.tier - 1 }));
  const before = linesOf(item.lines);
  visitorState.bait -= paid.acorns;
  visitorState.scrap -= paid.scrap;
  visitorState.rerolls += 1;
  visitorState.rerolled.add(item.id);
  const after = linesOf(visitorGear().items.find((i) => i.id === item.id).lines);
  stateOverride = {
    ...stateOverride,
    balances: { ...baseState.balances, bait: visitorState.bait },
  };
  return {
    itemId: item.id,
    before,
    after,
    paid,
    rerolls: visitorState.rerolls,
    next,
    ...syncValley(),
  };
});
ROUTES.set('/api/valley/visitor/blueprint', (request) => {
  visitorState.calls.push(['blueprint', bodyOf(request)]);
  if (!visitorState.here) return { refuse: 409, error: 'visitor_away' };
  if (visitorState.bought) return { refuse: 409, error: 'already_bought' };
  visitorState.bought = true;
  visitorState.bait -= 40;
  visitorState.shards -= 50;
  stateOverride = {
    ...stateOverride,
    balances: { ...baseState.balances, bait: visitorState.bait },
  };
  return {
    baseId: VISITOR_BLUEPRINT,
    duplicate: false,
    paid: { acorns: 40, shards: 50 },
    ...syncValley(),
  };
});

// --- The School and the trials (phase 5 step 9b): a small server of its own for the School's two routes ---------

/**
 * The School's state of a scenario: where the teacher stands, which creatures would learn the talent (ids), who sits at the two seats, and
 * what the seat route was asked (the bodies, in order); and the trials of the creatures (by id) with the ceremony's count.
 */
const schoolState = { phase: 'away', would: [], seats: [null, null], calls: [], refuse: null };
const trialsState = { on: false, byId: {}, ready: 0 };
const schoolReset = () => {
  Object.assign(schoolState, {
    phase: 'away',
    would: [],
    seats: [null, null],
    calls: [],
    refuse: null,
  });
  Object.assign(trialsState, { on: false, byId: {}, ready: 0 });
};
const STAY_FROM = Date.UTC(2027, 0, 17, 22);
const schoolView = () => {
  const open = schoolState.phase !== 'away';
  return {
    phase: schoolState.phase,
    talent: open
      ? { id: 'first-pounce', name: 'First Pounce', text: 'Your first attack hits harder.' }
      : null,
    arrivesAt: open ? STAY_FROM : null,
    leavesAt: open ? STAY_FROM + 3 * 24 * 3600 * 1000 : null,
    seats: schoolState.seats.map((creatureId, index) => ({
      index,
      creatureId,
      learnsAt: creatureId === null ? null : STAY_FROM + 24 * 3600 * 1000,
    })),
    wouldLearn: open ? schoolState.would : [],
  };
};
ROUTES.set('/api/valley/school', () => schoolView());
ROUTES.set('/api/valley/school/seat', (request) => {
  const body = bodyOf(request);
  schoolState.calls.push(body);
  if (schoolState.refuse !== null) return { refuse: 409, error: schoolState.refuse };
  schoolState.seats[body.index] = body.creatureId;
  // A student leaves the fire, but the server's valley still says "resting" (step 9a): the client takes the School's word.
  return { index: body.index, creatureId: body.creatureId, ...syncValley() };
});

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
/** The housing samples (what the server's house routes answer), built from the app's own samples. */
const houseSamples = await (async () => {
  const sample = await server.ssrLoadModule('/src/housing/house-sample.ts');
  return {
    house: sample.sampleHouse(),
    own: sample.sampleOwn('rich'),
    list: sample.sampleList(),
    catalogue: sample.sampleCatalogue(),
  };
})();
const browser = await chromium.launch(
  process.env.CHROME === undefined ? {} : { executablePath: process.env.CHROME },
);
const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: dpr,
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
  // Debug line for the starter pick only; a body the page already dropped is not an error.
  if (!r.url().endsWith('/api/starter')) return;
  console.log('starter:', r.status(), (await r.text().catch(() => '')).slice(0, 300));
});
await page.route('**/api/**', answer);

let done = 0;
async function step(name, run) {
  if (only !== null && !name.toLowerCase().includes(only.toLowerCase())) return;
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
  page.screenshot({
    path: join(
      out,
      `${name}-${String(width)}x${String(height)}${dpr === 1 ? '' : `-${String(dpr)}x`}${reduced ? '-reduced' : ''}.png`,
    ),
  });
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
/** A place as a canvas (`PlaceCanvas`): a thing in the scene you click, by the start of its name. */
const sceneTarget = (name) =>
  page.locator(`button.cv-target[aria-label^="${name}"]`).locator('visible=true');
/** The expedition map's two corner buttons (the packs, the project board): the Signpost's way into the left drawer. */
const mapTool = (name) =>
  page.locator(`button.sg-map-tool[aria-label^="${name}"]`).locator('visible=true');
/**
 * Misa's rule 6 (2026-11-15): no focus ring is ever visible in an art scene. With the keyboard (Tab back onto the target, so the
 * browser matches :focus-visible) the target has no outline and no ring shadow and shows the in-world cue (the gold arrow, `::after`);
 * with a mouse click it shows neither.
 */
const focusLook = (locator) =>
  locator.evaluate((el) => {
    const css = getComputedStyle(el);
    // The game's focus ring (`--ring`), as the browser computes it: a button's own bevel is not a ring.
    const probe = document.createElement('i');
    probe.style.boxShadow = 'var(--ring)';
    document.body.append(probe);
    const ring = getComputedStyle(probe).boxShadow;
    probe.remove();
    const cue = getComputedStyle(el, '::after');
    return {
      visible: el.matches(':focus-visible'),
      outline: `${css.outlineStyle} ${css.outlineWidth}`,
      ring: css.boxShadow === ring,
      cue: cue.content,
    };
  });
const expectFocusCue = async (locator, what) => {
  await locator.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const look = await focusLook(locator);
  if (!look.visible) throw new Error(`${what}: the keyboard focus did not land on it`);
  if (!look.outline.startsWith('none'))
    throw new Error(`${what} shows a focus outline: ${look.outline}`);
  if (look.ring) throw new Error(`${what} shows a focus ring`);
  if (look.cue === 'none' || look.cue === 'normal')
    throw new Error(`${what} has no in-world cue on keyboard focus`);
};
const expectNoFocusOnClick = async (locator, what) => {
  // A phone's page hides the scene once the click opens a panel, so keep hold of the element itself.
  const handle = await locator.elementHandle();
  if (handle === null) throw new Error(`${what}: not found`);
  await handle.evaluate((el) => el.blur());
  await locator.click();
  const look = await focusLook(handle);
  if (look.visible || look.cue !== 'none')
    throw new Error(`${what} shows a focus cue after a mouse click`);
  if (!look.outline.startsWith('none')) throw new Error(`${what} shows an outline after a click`);
};
/** What a click opens: the drawer beside the scene on a wide window, a page of its own on a phone. */
const drawer = page.locator('.pc-side, .pc-page');
/** The right drawer (the thing clicked) and the left one (a collection): each a page on a phone, where only one shows at a time. */
const rightPanel = page.locator('.pc-side.pc-right, .pc-page[data-side="right"]');
const leftPanel = page.locator('.pc-side.pc-left, .pc-page[data-side="left"]');
/** A canvas never scrolls: the page, the frame and the document all fit their box (a drawer's own body may scroll). */
const expectNoScroll = async () => {
  const over = await page.evaluate(() =>
    [
      document.scrollingElement,
      ...document.querySelectorAll('main.card, .vy-page, .pc-root, .pc-view'),
    ]
      .filter((el) => el !== null && el.scrollHeight > el.clientHeight + 1)
      .map(
        (el) =>
          `${el.tagName}.${String(el.className)} ${String(el.scrollHeight)}>${String(el.clientHeight)}`,
      ),
  );
  if (over.length > 0) throw new Error(`the canvas scrolls: ${over.join(' | ')}`);
};
/** The Forge opens straight on its interior (Misa, 2026-11-15): one click on the building in the valley, no outside view first. */
const forgeCanvas = () => page.locator('.vy-in-forge .vy-canvas').first().boundingBox();
const goInside = async () => {
  await waitFor(sceneTarget('The furnace'));
  if ((await page.locator('button[aria-label^="The forge. Go inside"]').count()) > 0)
    throw new Error('the Forge still has an outside view');
};
/** The Bonfire opens straight on its scene as a canvas (no page under it): the scene is inside the canvas shell. */
const bonfireCanvasChecks = async () => {
  await waitFor(page.locator('.pc-root .vy-in-bonfire'));
  if ((await page.locator('.vy-soon .vy-page').count()) > 0)
    throw new Error('the Bonfire has a page under its scene');
};
/** The Market opens straight on its scene as a canvas (no page under it): the stall and the builders' corner are inside the canvas shell. */
const marketCanvasChecks = async () => {
  await waitFor(page.locator('.pc-root .vy-in-market'), 'attached');
  if ((await page.locator('.vy-soon .vy-page').count()) > 0)
    throw new Error('the Market has a page under its scene');
};
/** The Paddock opens straight on its yard as a canvas (no page under it): the scene is inside the canvas shell, with no board on it. */
const paddockCanvasChecks = async () => {
  await waitFor(page.locator('.pc-root .vy-in-paddock'));
  if ((await page.locator('.vy-page section[aria-label="Paddock project"]').count()) > 0)
    throw new Error('the Paddock has its project board on the yard');
  if ((await page.locator('.vy-band').count()) > 0) throw new Error('the Paddock has a band scene');
};
/** The Paddock's "Creatures" button (or "+N more" when not all fit): the way into the Creatures page, the left drawer. */
const creaturesButton = () =>
  page.locator('button.cv-target[aria-label*="your creatures"]').locator('visible=true');
const backToValley = async () => {
  await hudBack().click();
  await waitFor(page.locator(VALLEY), 'attached');
};

try {
  await page.goto(`http://localhost:${String(port)}/?frame_id=e2e${extraQuery}`);
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

  // A laptop's window is shorter than the valley: a mouse drags the map up and down (as a finger swipes it), a drag that starts on a place
  // never opens it, and a press without a drag still does (Misa, 2026-11-11).
  await step(
    'a mouse drags the map up and down on a short window, and a drag never opens a place',
    async () => {
      const size = page.viewportSize();
      await page.setViewportSize({ width: Math.max(width, 1280), height: 600 });
      try {
        await page.waitForTimeout(300);
        const scroller = page.locator('.vy-valley.pans-y .vy-scroller');
        await waitFor(scroller, 'attached');
        const top = () => scroller.evaluate((el) => el.scrollTop);
        const before = await top();
        // Start on a place's button, so the drag-click guard is what keeps it closed.
        let at = null;
        for (const id of ['house', 'paddock', 'forge', 'cave', 'fair', 'arena']) {
          const box = await place(id).boundingBox();
          if (
            box !== null &&
            box.y > 120 &&
            box.y + box.height < 440 &&
            box.x > 20 &&
            box.x + box.width < 1200
          )
            at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          if (at !== null) break;
        }
        if (at === null) throw new Error('no place is in view to start the drag on');
        const { x, y } = at;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, y - 60, { steps: 6 });
        await page.mouse.up();
        const after = await top();
        if (after <= before)
          throw new Error(`the map did not move up: ${String(before)} to ${String(after)}`);
        if ((await page.locator(VALLEY).count()) === 0) throw new Error('a drag opened a place');
        // The way back: drag down again.
        await page.mouse.move(x, y - 100);
        await page.mouse.down();
        await page.mouse.move(x, y + 20, { steps: 6 });
        await page.mouse.up();
        if ((await top()) >= after) throw new Error('the map did not move down again');
        if ((await page.locator(VALLEY).count()) === 0) throw new Error('a drag opened a place');
        // The purse and the cog float over the map: the bar has no row of its own.
        const hud = await page.evaluate(() => {
          const bar = document.querySelector('header.hud');
          const frame = document.querySelector('.vy-frame');
          return {
            float: bar?.classList.contains('hud-float') === true,
            barBottom: bar?.getBoundingClientRect().bottom ?? 0,
            frameTop: frame?.getBoundingClientRect().top ?? 1,
          };
        });
        if (!hud.float || hud.frameTop > 1)
          throw new Error(`the bar still takes a row: ${JSON.stringify(hud)}`);
        await expectTopmost(page.locator('header.hud button.hud-gear'), 'the cog over the map');
        await shot('map-short-window');
      } finally {
        if (size !== null) await page.setViewportSize(size);
        await page.waitForTimeout(300);
      }
    },
  );

  await step(
    'Tab walks the valley in reading order and every stop shows the in-world cue, never a ring',
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
          const probe = document.createElement('i');
          probe.style.boxShadow = 'var(--ring)';
          document.body.append(probe);
          const ringShadow = getComputedStyle(probe).boxShadow;
          probe.remove();
          const ring =
            css.boxShadow === ringShadow ||
            (css.outlineStyle !== 'none' && css.outlineWidth !== '0px');
          const cue = !['none', 'normal'].includes(getComputedStyle(el, '::after').content);
          return {
            place: el.getAttribute('data-place'),
            name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30),
            ring,
            cue,
          };
        });
        if (stop !== null) stops.push(stop);
      }
      // Misa's rule 6 (2026-11-15): no ring in the art scene; the keyboard sees a gold arrow over the stop instead.
      const ringed = stops.filter((s) => s.ring).map((s) => s.name);
      if (ringed.length > 0) throw new Error(`a focus ring shows on: ${ringed.join(' | ')}`);
      const bare = stops.filter((s) => !s.cue).map((s) => s.name);
      if (bare.length > 0) throw new Error(`no in-world focus cue on: ${bare.join(' | ')}`);
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
      // Scrolled to the very end (and every card brought to the middle) the way back is still there and nothing slid the HUD up (Misa, 2026-11-11).
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('.vy-page, .vy-page *'))
          el.scrollTop = el.scrollHeight;
        document.querySelector('.vy-page *:last-child')?.scrollIntoView({ block: 'center' });
      });
      await expectTopmost(hudBack(), `the way back from ${id}`);
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
        // The Journal loads its entries first: the list is there once it has.
        await page
          .locator(wide ? '.journal .choice-list' : '.journal .journal-place')
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => undefined);
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
      await page.waitForTimeout(150);
      if ((await page.getByRole('dialog').count()) > 0)
        throw new Error('a drag opened the popover');
      const dropped = await centre();
      if (Math.hypot(dropped.x - to.x, dropped.y - to.y) > 60) {
        throw new Error(
          `dropped near (${String(Math.round(dropped.x))}, ${String(Math.round(dropped.y))}), not at (${String(Math.round(to.x))}, ${String(Math.round(to.y))})`,
        );
      }
      // A drag that is released back over the creature it started on is still a drag, not a tap.
      const back = await centre();
      await page.mouse.move(back.x, back.y);
      await page.mouse.down();
      await page.mouse.move(back.x + 40, back.y + 10, { steps: 5 });
      await page.mouse.move(back.x, back.y, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      if ((await page.getByRole('dialog').count()) > 0)
        throw new Error('a drag released over its own creature opened the popover');
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

  // --- No flashing: a pixel scene is never seen empty, not on a re-render, not on the way in or back ---------
  // A watcher samples every frame (before the browser paints it): a visible scene canvas or sprite canvas with no
  // opaque pixel at all is a frame where the art is gone (a fresh or resized canvas waiting for its paint).
  const flashWatch = {
    start: () =>
      page.evaluate(() => {
        const w = window;
        w.__flash = { frames: 0, blank: 0, last: '' };
        w.__flashOn = true;
        const blankOf = (c) => {
          const r = c.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || c.width === 0 || c.height === 0) return false;
          const ctx = c.getContext('2d');
          if (ctx === null) return false;
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
          return true;
        };
        const tick = () => {
          if (!w.__flashOn) return;
          w.__flash.frames += 1;
          for (const c of document.querySelectorAll('canvas.vy-canvas, canvas.sprite')) {
            if (blankOf(c)) {
              w.__flash.blank += 1;
              w.__flash.last = `${c.className} ${String(c.width)}x${String(c.height)}`;
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    stop: () =>
      page.evaluate(() => {
        window.__flashOn = false;
        return window.__flash;
      }),
  };
  await step(
    'no pixel scene flashes: not on a re-render, not on the way into a place or back to the map',
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      await flashWatch.start();
      for (const id of ['paddock', 'school', 'forge', 'signpost']) {
        await place(id).evaluate((el) => el.click());
        await waitFor(hudBack());
        await page.waitForTimeout(500);
        await backToValley();
        await page.waitForTimeout(400);
      }
      // A window resize re-renders the map under the player's eyes.
      await page.setViewportSize({ width: width + 20, height: 800 });
      await page.waitForTimeout(500);
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(500);
      const result = await flashWatch.stop();
      console.log(
        `     flash watch: ${String(result.blank)} blank frames in ${String(result.frames)} (${result.last})`,
      );
      if (result.blank > 0)
        throw new Error(
          `${String(result.blank)} frames showed an empty scene or sprite (${result.last})`,
        );
    },
  );

  // --- Scenarios: the same game in other states. Each reloads the page with test-only answers ---------------

  /** Runs `run` on a fresh load of the valley with `change` applied to the server's answers; the answers are put back after. */
  async function scenario(name, change, run) {
    await step(name, async () => {
      awayDismissed = true;
      change();
      try {
        await page.goto(`http://localhost:${String(port)}/?frame_id=e2e${extraQuery}`);
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

  // The valley's base systems on (phase 5 step 1): every creature rests, the Bonfire opens with a few round the fire.
  await scenario(
    'valley systems on: the Bonfire opens with the resting creatures, their gains and "+N more"',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
      scouts.seats = [];
      scouts.ids = creatures.map((c) => c.id);
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      // The tray says each creature rests.
      await waitFor(
        page.locator('section[aria-label="Your creatures"] button[aria-label*="Resting"]'),
      );
      await shot('tray-resting');
      await place('bonfire').evaluate((el) => el.click());
      await waitFor(heading('Bonfire'));
      // Not the "not open yet" line: creatures sit round the fire, each with its +N on the plate (a plate of its tap target).
      if ((await page.getByText(/will burn here/).count()) > 0)
        throw new Error('the Bonfire is still "not open yet"');
      await bonfireCanvasChecks();
      const plates = page.locator('.cv-plate .nameplate-gain');
      await waitFor(plates);
      const drawn = await page.locator('button.cv-target[aria-label*="by the fire"]').count();
      for (let i = 0; i < (await plates.count()); i += 1)
        await expectTopmost(plates.nth(i).locator('xpath=..'), `plate ${String(i)} at the fire`);
      await expectNoScroll();
      await page.waitForTimeout(300);
      await shot('bonfire-open');
      // A tap on a resting creature opens it in the right drawer: its gain, and the hearth post (a page on a phone).
      const first = page.locator('button.cv-target[aria-label*="by the fire"]').first();
      await first.click();
      await waitFor(rightPanel.locator('.cs-summary'));
      // One name: the drawer's title; the summary under it draws the portrait, tags and experience, never the name again.
      if ((await rightPanel.locator('.cs-summary .cc-name').count()) > 0)
        throw new Error('the creature drawer says the name twice');
      await page.waitForTimeout(300);
      await shot('bonfire-creature');
      await page.keyboard.press('Escape');
      await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
      if (
        (await page.locator('button.cv-target[aria-label*="show everyone resting"]').count()) > 0
      ) {
        const moreButton = page
          .locator('button.cv-target[aria-label*="show everyone resting"]')
          .first();
        await expectTopmost(moreButton, 'the "+N more" target');
        await moreButton.click();
        await waitFor(leftPanel);
        const rows = await leftPanel.getByRole('option').count();
        if (rows !== baseState.creatures.length)
          throw new Error(
            `the list shows ${String(rows)} of ${String(baseState.creatures.length)}`,
          );
        await page.waitForTimeout(300);
        await shot('bonfire-all-resting');
        // A row of the list opens that creature in the right drawer (a step of the list's panel on a phone).
        await leftPanel.getByRole('option').first().click();
        await waitFor(rightPanel.locator('.cs-summary'));
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      } else if (drawn !== baseState.creatures.length) {
        throw new Error(`${String(drawn)} drawn, no "+N more" for the rest`);
      }
    },
  );

  // The Signpost with the valley's systems on, as a canvas (Misa, 2026-11-11): the scene, a click on the signpost opens the expedition map,
  // which is dragged and where a destination is picked; its drawer sends a scout (who, seat, kit, confirm) and the scout stands on the map.
  // Nothing may overlap (`expectTopmost`) and nothing scrolls (`expectNoScroll`) at any width.
  await scenario(
    'valley systems on: the Signpost is a canvas: buy a seat, open the map, drag it, pick a place, send a scout, move it, drag one on, rest it',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
      scouts.seats = [];
      scouts.owned = [];
      scouts.ids = creatures.map((c) => c.id);
      scoutCalls.length = 0;
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      await place('signpost').evaluate((el) => el.click());
      await waitFor(heading('Signpost'));
      // Today's Expeditions page is gone: no trips, no explorer to send, no page of seat cards.
      if ((await page.getByText(/Send an explorer|Send on a trip/i).count()) > 0)
        throw new Error('the Expeditions page is still drawn');
      if ((await page.locator('li.sp-seat').count()) > 0)
        throw new Error('the old page of seat cards is still drawn');
      // The place opens straight on the expedition map (no scene first): its two corner buttons are the way to the packs and the board.
      const map = page.locator('.world-map.fill');
      await waitFor(map);
      await waitFor(place('ember-caves'));
      await waitFor(mapTool('The packs'));
      if ((await page.locator('button[aria-label^="The signpost: the map"]').count()) > 0)
        throw new Error('the Signpost still has a scene with a signpost to click first');
      await expectNoScroll();
      await expectTopmost(mapTool('The packs'), 'the packs button');
      await shot('signpost-map');
      // Buy the first seat from the packs drawer: the buy step opens beside the canvas (a page on a phone).
      await mapTool('The packs').click();
      await waitFor(leftPanel.getByRole('button', { name: /^A new seat\. Buy it/ }));
      await shot('signpost-canvas-no-seats');
      await leftPanel.getByRole('button', { name: /^A new seat\. Buy it/ }).click();
      await waitFor(drawer.getByRole('heading', { name: 'A new scout seat' }));
      await shot('signpost-step-buy');
      await drawer.getByRole('button', { name: /^Buy the seat/ }).click();
      await drawer
        .getByRole('heading', { name: 'A new scout seat' })
        .waitFor({ state: 'detached', timeout: 10000 });
      await waitFor(leftPanel.getByRole('button', { name: /^Seat 1: nobody posted|^Seat 1\b/ }));
      if (
        !scoutCalls.some(
          ([kind, body]) => kind === 'buy' && typeof body.idempotencyKey === 'string',
        )
      )
        throw new Error('the seat was bought without an idempotency key');
      await expectNoScroll();
      await shot('signpost-canvas-one-seat');
      await leftPanel
        .getByRole('button', { name: /Close|^Back/ })
        .first()
        .click();
      await leftPanel.waitFor({ state: 'detached', timeout: 10000 });
      // The map pans by drag (when the view is smaller than the map), and a drag that starts on a place never opens it.
      const before = await map.evaluate((el) => [el.scrollLeft, el.scrollTop]);
      const room = await map.evaluate((el) => [
        el.scrollWidth - el.clientWidth,
        el.scrollHeight - el.clientHeight,
      ]);
      const pin = place('tidepools').locator('.wm-pin');
      const at = await pin.boundingBox();
      if (at === null) throw new Error('no box for the Tidepools pin');
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      // The content follows the hand: drag toward the side of the map that has room to scroll.
      const dx = before[0] < room[0] / 2 ? -40 : 40;
      const dy = before[1] < room[1] / 2 ? -30 : 30;
      await page.mouse.move(at.x + at.width / 2 + dx, at.y + at.height / 2 + dy, { steps: 6 });
      await page.mouse.up();
      if ((await drawer.count()) > 0) throw new Error('a drag on a place opened it');
      const after = await map.evaluate((el) => [el.scrollLeft, el.scrollTop]);
      if ((room[0] > 0 || room[1] > 0) && after[0] === before[0] && after[1] === before[1])
        throw new Error('the map did not pan by drag');
      await shot('signpost-map-dragged');
      // A place is picked: its drawer, with what it is and the one gold button.
      const mapBefore = await map.boundingBox();
      await place('ember-caves').locator('.wm-pin').click();
      await waitFor(drawer.getByRole('heading', { name: 'Ember Caves' }));
      await waitFor(drawer.getByRole('button', { name: /^Send a scout here/ }));
      await page.waitForTimeout(500);
      // The drawer lies over the map's edge: the map keeps its size and place (Misa, 2026-11-15), and the picked place is clear of it.
      const mapAfter = await map.boundingBox();
      if (
        mapBefore === null ||
        mapAfter === null ||
        mapBefore.x !== mapAfter.x ||
        mapBefore.width !== mapAfter.width ||
        mapBefore.height !== mapAfter.height
      )
        throw new Error(
          `the map moved or resized when a place was picked: ${JSON.stringify([mapBefore, mapAfter])}`,
        );
      if (width >= 960) {
        const pinAt = await place('ember-caves').locator('.wm-pin').boundingBox();
        const sideAt = await page.locator('.pc-right').boundingBox();
        if (pinAt === null || sideAt === null || pinAt.x + pinAt.width > sideAt.x)
          throw new Error('the picked place is under the drawer');
      }
      await shot('signpost-step-place');
      await drawer.getByRole('button', { name: /^Send a scout here/ }).click();
      await waitFor(drawer.getByRole('heading', { name: 'Who scouts here?' }));
      await shot('signpost-step-who');
      await drawer
        .getByRole('option')
        .filter({ hasText: /Sproutle/ })
        .first()
        .click();
      // Sproutle has no seat yet: which seat (the free one), then the kit, then the confirm.
      await waitFor(drawer.getByRole('heading', { name: 'Which seat?' }));
      await shot('signpost-step-seat');
      await drawer.getByRole('button', { name: /^Seat 1/ }).click();
      await waitFor(drawer.getByRole('heading', { name: 'Kit' }));
      await shot('signpost-step-kit');
      await drawer.getByRole('button', { name: /^No kit/ }).click();
      await waitFor(drawer.getByRole('heading', { name: /Send a scout to Ember Caves/ }));
      await shot('signpost-step-ready');
      const [first, second] = baseState.creatures;
      if (scoutCalls.some(([kind]) => kind === 'seat')) throw new Error('sent before the confirm');
      await drawer.getByRole('button', { name: /^Send Sproutle to Ember Caves/ }).click();
      await drawer.waitFor({ state: 'detached', timeout: 10000 });
      const sent = scoutCalls.filter(([k]) => k === 'seat').at(-1)?.[1];
      if (
        sent?.seatId !== 'seat-1' ||
        sent.creatureId !== second.id ||
        sent.destination !== 'ember-caves'
      )
        throw new Error(`the post was ${JSON.stringify(sent)}`);
      // The scout stands at the place on the map, with the pack's state on a small flag.
      await waitFor(place('ember-caves').locator('.wm-chip'));
      if (!/1 scout there/.test((await place('ember-caves').getAttribute('aria-label')) ?? ''))
        throw new Error('the map does not say a scout is at Ember Caves');
      await waitFor(place('ember-caves').locator('.wm-flag'));
      await expectNoScroll();
      await shot('signpost-map-scout');
      // The tray calls the scout Scouting (no z on it).
      const tray = page.locator(
        `section[aria-label="Creatures to post"] button[data-creature="${second.id}"]`,
      );
      if (!/Scouting/.test((await tray.getAttribute('aria-label')) ?? ''))
        throw new Error('the tray does not say Scouting');
      if ((await tray.locator('.vy-zz').count()) > 0) throw new Error('a scout carries the z');
      // The scout's own step: its pack and pace; move it to another place.
      await place('ember-caves').locator('.wm-pin').click();
      await waitFor(drawer.getByRole('button', { name: /^Seat 1: Sproutle/ }));
      await drawer.getByRole('button', { name: /^Seat 1: Sproutle/ }).click();
      await waitFor(drawer.getByText('In the pack'));
      await shot('signpost-step-scout');
      await drawer.getByRole('button', { name: /^Move to another place/ }).click();
      await waitFor(drawer.getByRole('heading', { name: 'Move the scout' }));
      await shot('signpost-step-move');
      await drawer.getByRole('button', { name: /^Tidepools/ }).click();
      await drawer.waitFor({ state: 'detached', timeout: 10000 });
      await waitFor(place('tidepools').locator('.wm-chip'));
      if ((await place('ember-caves').locator('.wm-chip').count()) > 0)
        throw new Error('the scout is still drawn at Ember Caves');
      // A closed place is dimmed and says what opens it; it cannot be sent to.
      if (!/locked/.test((await place('festival-grounds').getAttribute('class')) ?? ''))
        throw new Error('the closed place is not dimmed');
      await place('festival-grounds').locator('.wm-pin').click();
      await waitFor(drawer.getByText(/Closed until a Festival week/));
      if (await drawer.getByRole('button', { name: /^Send a scout here/ }).isEnabled())
        throw new Error('a closed place can be sent to');
      await shot('signpost-step-closed');
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'detached', timeout: 10000 });
      // The packs drawer lists the seat: on a wide window a resting creature is dragged from the tray onto its row, which previews the fit.
      await mapTool('The packs').click();
      await waitFor(leftPanel.getByRole('button', { name: /^Seat 1: Sproutle/ }));
      if (width >= 960) {
        const mover = page.locator(
          `section[aria-label="Creatures to post"] button[data-creature="${first.id}"]`,
        );
        const start = await mover.boundingBox();
        const over = await leftPanel
          .getByRole('button', { name: /^Seat 1: Sproutle/ })
          .boundingBox();
        if (start === null || over === null) throw new Error('no boxes to drag between');
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down();
        await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 12, {
          steps: 4,
        });
        await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 10 });
        // A slow machine may not have settled the hand over the row yet: nudge it until the preview shows.
        await page.mouse.move(over.x + over.width / 2 + 2, over.y + over.height / 2 + 2, {
          steps: 3,
        });
        await page.waitForTimeout(150);
        await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 3 });
        await waitFor(page.locator('.sp-preview'));
        await expectTopmost(page.locator('.sp-preview').first(), 'the fit preview');
        await shot('signpost-drag-preview');
        await page.mouse.up();
        await waitFor(leftPanel.getByRole('button', { name: /^Seat 1: Cindle/ }));
        if (scoutCalls.filter(([k]) => k === 'seat').at(-1)?.[1].creatureId !== first.id)
          throw new Error('the drop posted another creature');
      }
      // Rest it: the seat's own step, back to resting.
      const seatName = width >= 960 ? /^Seat 1: Cindle/ : /^Seat 1: Sproutle/;
      await leftPanel.getByRole('button', { name: seatName }).click();
      await waitFor(drawer.getByRole('button', { name: /^Back to resting/ }));
      await drawer.getByRole('button', { name: /^Back to resting/ }).click();
      await waitFor(
        leftPanel.getByRole('button', { name: /^Seat 1: nobody posted|^Seat 1\b(?!:)/ }),
      );
      if (scoutCalls.filter(([k]) => k === 'seat').at(-1)?.[1].creatureId !== null)
        throw new Error('rest did not send null');
      await expectNoScroll();
      await shot('signpost-canvas-rested');
      await expectTopmost(hudBack(), 'the way back from the Signpost');
      await backToValley();
    },
  );

  await scenario(
    'valley systems on: a full pack says so on the seat and on the Signpost',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
      scouts.seats = [
        { id: 'seat-1', destination: 'ember-caves', creatureId: creatures[1].id, hours: 80 },
        { id: 'seat-2', destination: 'tidepools', creatureId: creatures[2].id, hours: 30 },
      ];
      scouts.owned = [];
      scouts.ids = creatures.map((c) => c.id);
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      // The Signpost's bubble on the map says a pack is full.
      const bubble = place('signpost');
      await waitFor(bubble);
      if (!/pack is full/i.test((await bubble.getAttribute('aria-label')) ?? ''))
        throw new Error('the Signpost has no full-pack bubble');
      await bubble.evaluate((el) => el.click());
      await waitFor(heading('Signpost'));
      // The packs button counts the full packs; its drawer says it on the seat.
      await waitFor(mapTool('The packs'));
      if (!/1 full/.test((await mapTool('The packs').getAttribute('aria-label')) ?? ''))
        throw new Error('the packs button does not count the full pack');
      await expectNoScroll();
      await shot('signpost-two-seats');
      // The packs button opens the packs of every seat in the left drawer; a tap on one leads to its scout on the map.
      await mapTool('The packs').click();
      await waitFor(leftPanel.getByRole('button', { name: /^Seat 1.*Pack full/ }));
      if (
        !/Pack filling|Full in/.test(
          (await leftPanel.getByRole('button', { name: /^Seat 2/ }).getAttribute('aria-label')) ??
            '',
        )
      )
        throw new Error('the second seat does not say its pack is filling');
      await page.waitForTimeout(400);
      await expectTopmost(leftPanel.first(), 'the packs drawer');
      await shot('signpost-packs');
      await leftPanel.getByRole('button', { name: /^Seat 1.*Pack full/ }).click();
      await waitFor(drawer.getByText('In the pack'));
      await page.waitForTimeout(600);
      await expectTopmost(rightPanel.first(), 'the pack drawer');
      await shot('signpost-pack');
      // The map flags the full pack and the fill of the other, each at its place.
      // Escape closes the top panel while the focus is inside it.
      await rightPanel.first().focus();
      await page.keyboard.press('Escape');
      await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
      // The packs list is still open (a page of its own on a phone, under the pack): close it.
      await leftPanel
        .getByRole('button', { name: /Close|^Back/ })
        .first()
        .click();
      await leftPanel.waitFor({ state: 'detached', timeout: 10000 });
      await waitFor(place('ember-caves'));
      if ((await place('ember-caves').locator('.wm-flag').innerText()) !== 'FULL')
        throw new Error('the map does not flag the full pack at Ember Caves');
      if ((await place('tidepools').locator('.wm-flag').innerText()) !== '41%')
        throw new Error('the map does not show the second pack at Tidepools');
      await shot('signpost-map-packs');
    },
  );

  // The Forge with the valley's systems on (phase 5 step 3): buy an anvil, post a smith, order, edit, remove, a second anvil (the exchange is at the Market, Q64).
  await scenario(
    'valley systems on: the Forge is its anvils: buy one, post a smith, add, edit and remove an order, a second anvil',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
      scouts.seats = [];
      scouts.owned = [];
      scouts.ids = creatures.map((c) => c.id);
      forgeState.anvils = [];
      forgeState.nextOrder = 1;
      forgeCalls.length = 0;
      // Another player's smith at work, for the workshop's background.
      forgeState.crowd = [
        {
          owner: 'Bea',
          creature: { id: 'far-1', species: 'splashet', shiny: false, level: 5, name: 'Dot' },
          working: true,
        },
      ];
      // Acorns for the second anvil (123).
      stateOverride = {
        creatures,
        balances: { ...baseState.balances, bait: 1000 },
        valley: valleyBlock(),
      };
    },
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      await place('forge').evaluate((el) => el.click());
      await waitFor(heading('Forge'));
      // Today's job slots are gone, and the page is a canvas: nothing scrolls, everything starts from a click in the scene.
      if ((await page.getByText(/Craft supplies/).count()) > 0)
        throw new Error('the Workshop still draws supply crafts');
      if (process.env.DEBUG_CANVAS)
        console.log(
          await page.evaluate(() =>
            [
              '.vy-body',
              '.vy-page',
              '.fc-root',
              '.pc-root',
              '.pc-view',
              '.pc-stage',
              '.pc-main',
              '.vy-interior',
              '.vy-scene-box',
              '.pc-below',
            ].map((q) => {
              const el = document.querySelector(q);
              return el === null
                ? `${q}: none`
                : `${q}: ${String(el.clientWidth)}x${String(el.clientHeight)} ${getComputedStyle(el).display}`;
            }),
          ),
        );
      // The Forge opens straight on its interior: the anvils, the furnace and the door are there at once, and nothing scrolls.
      await goInside();
      await waitFor(sceneTarget('A new anvil'));
      await expectNoScroll();
      await expectTopmost(sceneTarget('A new anvil'), 'the dashed outline of the next anvil');
      await expectTopmost(sceneTarget('The door. Back to the valley'), 'the door');
      await expectTopmost(sceneTarget('The furnace'), 'the furnace');
      // Every clickable thing has its name plate (the cue), and the room fills the window (the scene is as wide as the stage).
      const bare = await page
        .locator('.vy-in-forge button.cv-target:not(:has(.cv-plate))')
        .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
      if (bare.length > 0) throw new Error(`clickable things without a plate: ${bare.join(' | ')}`);
      await page.waitForTimeout(300);
      await shot('layout-forge-rest');
      if (width >= 960) {
        await sceneTarget('The plans').hover();
        await page.waitForTimeout(150);
        await shot('layout-forge-hover');
        await page.mouse.move(2, 400);
      }
      // Rule 6: no focus ring in the art scene. The HUD's back took the focus by script on entry with no key pressed: no ring there.
      const backLook = await focusLook(hudBack());
      if (backLook.visible && !backLook.outline.startsWith('none'))
        throw new Error(`the HUD back shows a focus ring on entry: ${backLook.outline}`);
      await expectFocusCue(sceneTarget('A new anvil'), 'the new-anvil outline');
      await expectFocusCue(sceneTarget('The plans'), 'the plans table');
      await expectFocusCue(
        page.locator('.fc-shelf :is(button, [tabindex]):not([tabindex="-1"])').first(),
        'a resource chip under the scene',
      );
      await expectNoFocusOnClick(sceneTarget('The plans'), 'the plans table');
      await drawer
        .getByRole('button', { name: /Close|^Back/ })
        .first()
        .click();
      await drawer.waitFor({ state: 'detached', timeout: 10000 });
      // The scene settles back to its full width before the next look at it.
      await page.waitForTimeout(500);
      // Another player's smith works at a bench behind: a tap shows its owner on a plate; a second tap closes it.
      await waitFor(sceneTarget("Bea's Dot"));
      await expectTopmost(sceneTarget("Bea's Dot"), "Bea's smith");
      await sceneTarget("Bea's Dot").click();
      await waitFor(page.locator('.nameplate-owner', { hasText: 'Bea' }));
      await shot('forge-inside-background-smith');
      await sceneTarget("Bea's Dot").click();
      await page.locator('.nameplate-owner').waitFor({ state: 'detached', timeout: 10000 });
      await shot('forge-canvas-no-anvils');
      const restCanvas = await forgeCanvas();
      // Buy the first anvil from its outline: the buy step opens beside the canvas (a page on a phone).
      await sceneTarget('A new anvil').click();
      await waitFor(drawer.getByRole('heading', { name: 'A new anvil' }));
      await shot('forge-step-buy');
      if (width >= 960) {
        // The drawer lies over the scene: it keeps its size and place, and a drawer's first step has no Back, only the X.
        await page.waitForTimeout(400);
        const now = await forgeCanvas();
        if (
          now === null ||
          restCanvas === null ||
          now.width !== restCanvas.width ||
          now.height !== restCanvas.height
        )
          throw new Error(
            `the scene resized when the drawer opened: ${JSON.stringify([restCanvas, now])}`,
          );
        if (now.x !== restCanvas.x)
          throw new Error('the scene moved though the clicked anvil was clear of the drawer');
        if ((await drawer.getByRole('button', { name: /^Back/ }).count()) > 0)
          throw new Error('the first step of a drawer has a Back');
        if ((await drawer.getByRole('button', { name: 'Close' }).count()) === 0)
          throw new Error('the drawer has no X');
      }
      await drawer.getByRole('button', { name: /^Buy the anvil/ }).click();
      await drawer
        .getByRole('heading', { name: 'A new anvil' })
        .waitFor({ state: 'detached', timeout: 10000 });
      await waitFor(sceneTarget('Anvil 1: nobody posted'));
      if (!forgeCalls.some(([k, b]) => k === 'anvil/buy' && typeof b.idempotencyKey === 'string'))
        throw new Error('the anvil was bought without an idempotency key');
      // Click the anvil: an anvil nobody smiths at opens on who smiths. Post a smith from the list.
      await expectTopmost(sceneTarget('Anvil 1: nobody posted'), 'the empty anvil');
      await sceneTarget('Anvil 1: nobody posted').click();
      await waitFor(drawer.getByRole('heading', { name: 'Who smiths here?' }));
      await shot('forge-step-smith');
      await drawer
        .getByRole('option')
        .filter({ hasText: /Sproutle/ })
        .first()
        .click();
      await waitFor(drawer.getByRole('button', { name: /^Anvil 1: Sproutle/ }));
      await waitFor(drawer.getByText(/Tinkering/));
      await shot('forge-step-anvil');
      const [first, second] = baseState.creatures;
      const tray = page.locator(
        `section[aria-label="Creatures to post"] button[data-creature="${second.id}"]`,
      );
      if (!/Smithing/.test((await tray.getAttribute('aria-label')) ?? ''))
        throw new Error('the tray does not say Smithing');
      if ((await tray.locator('.vy-zz').count()) > 0) throw new Error('a smith carries the z');
      // Add an order from the anvil's page: what to make, then the order (a blueprint, one more, Reach for Rare).
      await drawer.getByRole('button', { name: /^Add an order/ }).click();
      await waitFor(drawer.getByRole('heading', { name: 'What to make' }));
      await shot('forge-step-what');
      await drawer.locator('ul[aria-label="Blueprints"] button').nth(1).click();
      await waitFor(drawer.getByRole('heading', { name: 'The order' }));
      await drawer.getByRole('button', { name: /One more piece/ }).click();
      await drawer.getByRole('button', { name: /Reach for Rare/ }).click();
      await page.waitForTimeout(300);
      await shot('forge-step-order');
      await drawer.getByRole('button', { name: /^Add to the queue/ }).click();
      const added = forgeCalls.at(-1)?.[1];
      if (added?.action !== 'add' || added.count !== 2 || added.reach !== 'rare')
        throw new Error(`the order was ${JSON.stringify(added)}`);
      // Back on the anvil's page with the order in its queue.
      await waitFor(drawer.locator('button.fg-order'));
      await shot('forge-step-anvil-at-work');
      // Edit it, then take it off.
      await drawer.locator('button.fg-order').first().click();
      await waitFor(drawer.getByRole('heading', { name: 'Change the order' }));
      await drawer.getByRole('button', { name: /One more piece/ }).click();
      await drawer.getByRole('button', { name: /^Save/ }).click();
      await waitFor(drawer.locator('button.fg-order'));
      if (forgeCalls.at(-1)?.[1].count !== 3) throw new Error('the edit did not send count 3');
      await drawer.locator('button.fg-order').first().click();
      await waitFor(drawer.getByRole('heading', { name: 'Change the order' }));
      await drawer.getByRole('button', { name: /Take it off the queue/ }).click();
      await waitFor(drawer.getByText(/No orders yet/));
      if (forgeCalls.at(-1)?.[1].action !== 'remove') throw new Error('remove was not sent');
      // The focus goes back to the anvil that was clicked when the keyboard closes its drawer.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      if ((await drawer.count()) > 0) {
        await drawer.getByRole('button', { name: /^Back/ }).first().click();
      }
      await drawer.waitFor({ state: 'detached', timeout: 10000 });
      // The keyboard: Enter on an anvil opens its drawer with the focus inside it; Escape closes it and the focus is back on that anvil.
      await page.keyboard.press('Tab');
      await sceneTarget('Anvil 1:').focus();
      await page.keyboard.press('Enter');
      await waitFor(rightPanel);
      await page
        .waitForFunction(
          () => document.activeElement?.closest('.pc-side, .pc-page') != null,
          null,
          {
            timeout: 3000,
          },
        )
        .catch(() => {
          throw new Error('the focus did not move into the anvil drawer');
        });
      await page.keyboard.press('Escape');
      await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
      await page
        .waitForFunction(
          () => document.activeElement?.getAttribute('aria-label')?.startsWith('Anvil 1:') === true,
          null,
          { timeout: 3000 },
        )
        .catch(async () => {
          const now = await page.evaluate(
            () =>
              document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
          );
          throw new Error(`the focus went to "${String(now)}", not back to the anvil`);
        });
      // A second anvil from its outline, then a smith carried onto it from the tray (the canvas never scrolls, so a drop is always in reach).
      await sceneTarget('A new anvil').click();
      await drawer.getByRole('button', { name: /^Buy the anvil/ }).click();
      await waitFor(sceneTarget('Anvil 2: nobody posted'));
      const mover = page.locator(
        `section[aria-label="Creatures to post"] button[data-creature="${first.id}"]`,
      );
      const start = await mover.boundingBox();
      const target = await sceneTarget('Anvil 2: nobody posted').boundingBox();
      if (start === null || target === null) throw new Error('no boxes to drag');
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
      await page.mouse.down();
      await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 12, {
        steps: 4,
      });
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
        steps: 10,
      });
      await page.mouse.up();
      await waitFor(sceneTarget('Anvil 2: Cindle'));
      await expectNoScroll();
      await shot('forge-canvas-two-anvils');
      // The bag is the chest in the yard: it opens in the left drawer (a page on a phone), with its count against the cap and its filter.
      await sceneTarget('The bag').click();
      await waitFor(drawer.getByText(/Bag: \d+ \/ \d+/));
      await page.waitForTimeout(300);
      await shot('forge-bag-open');
      const tools = drawer.getByRole('button', { name: /Filter and sort/ });
      await tools.click();
      await drawer.getByRole('button', { name: 'Rare', exact: true }).first().click();
      await page.waitForTimeout(300);
      await expectTopmost(tools, 'the bag tools header');
      await shot('forge-step-bag');
      // An item's card: beside the bag on a wide window, a page of its own on a phone.
      await drawer.locator('.bag-grid button.item-tile').first().click();
      await page.waitForTimeout(400);
      await shot('forge-bag-card');
      {
        // The card beside the bag has no Back head and no Prev / Next row; on a phone it keeps both.
        const card = page.locator('.pc-side .ps-step, .pc-page .ps-step');
        const head = await card.locator('.drill-head').count();
        const pager = await card.locator('.ps-flip').count();
        if (width >= 960 && (head > 0 || pager > 0))
          throw new Error('the item card beside the bag still has its Back head or pager');
        if (width < 960 && (head === 0 || pager === 0))
          throw new Error('the phone item card lost its Back or pager');
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      if (width >= 960) {
        // The bag's chest is under the left drawer's reach: the scene is panned (not resized) to keep it clear.
        await page.waitForTimeout(400);
        const now = await forgeCanvas();
        const chest = await sceneTarget('The bag').boundingBox();
        const side = await page.locator('.pc-left').boundingBox();
        if (
          now === null ||
          restCanvas === null ||
          now.width !== restCanvas.width ||
          now.height !== restCanvas.height
        )
          throw new Error(
            `the scene resized when the bag opened: ${JSON.stringify([restCanvas, now])}`,
          );
        if (chest === null || side === null || chest.x < side.x + side.width)
          throw new Error('the bag chest is under the left drawer');
      }
      await expectNoScroll();
      await drawer
        .getByRole('button', { name: /Close|^Back/ })
        .first()
        .click();
      await drawer.waitFor({ state: 'detached', timeout: 10000 });
      await expectTopmost(hudBack(), 'the way back from the Forge');
      // The door goes back to the valley, as the place's back does.
      await sceneTarget('The door. Back to the valley').click();
      await waitFor(page.locator(VALLEY), 'attached');

      forgeState.anvils = [];
      forgeState.crowd = [];
    },
  );

  // The Forge's sealed crate (V-FORGE-5, Misa's option C): rare and epic pieces wait in a crate in the room; the Gazette teases it, the map's
  // Forge has a bubble, and a click opens it: it rattles, then the pieces are revealed one at a time, worst first and best last, ending on a
  // summary of everything. One keyed call opens it.
  await scenario(
    'valley systems on: the sealed crate is teased, opened and revealed worst first, best last',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
      scouts.seats = [];
      scouts.owned = [];
      scouts.ids = creatures.map((c) => c.id);
      forgeState.anvils = [
        { id: 'anvil-1', creatureId: creatures[0].id, kit: null, orders: [] },
        { id: 'anvil-2', creatureId: creatures[1].id, kit: null, orders: [] },
      ];
      forgeState.crate = ['rare', 'rare', 'epic'];
      forgeCalls.length = 0;
      crateAnswers.clear();
      gazette.paper = {
        ...paperOf('short absence', creatures),
        headlines: [headline('crate-waits', 99, 3, { rarity: 'epic' })],
        decision: null,
        more: 0,
      };
      answerOverride.set('/api/valley/gazette/close', () => {
        gazette.paper = null;
        stateOverride = { ...stateOverride, valley: valleyBlock() };
        return { closed: true };
      });
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      // The Gazette teases the crate and never names a piece.
      await waitFor(
        page.locator('h3.gz-headline', { hasText: /SOMETHING EPIC WAITS AT THE FORGE/i }),
      );
      await shot('crate-gazette');
      await page
        .getByRole('button', { name: /more things?|Into the valley/i })
        .last()
        .click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      await page.locator('.gz-fly').waitFor({ state: 'detached', timeout: 15000 });
      await waitFor(page.locator(VALLEY), 'attached');
      // The Forge has its bubble on the map, and says what waits.
      const forgeLabel = (await place('forge').getAttribute('aria-label')) ?? '';
      if (!/Something epic waits in the sealed crate/.test(forgeLabel))
        throw new Error(`the Forge's bubble does not say the crate waits: ${forgeLabel}`);
      await shot('crate-map-bubble');
      await place('forge').evaluate((el) => el.click());
      await waitFor(heading('Forge'));
      await goInside();
      const crate = sceneTarget('The sealed crate');
      await waitFor(crate);
      await expectNoScroll();
      await expectTopmost(crate, 'the sealed crate');
      if ((await page.locator('.vy-in-forge button.cv-target:not(:has(.cv-plate))').count()) > 0)
        throw new Error('a clickable thing in the Forge has no plate');
      await page.waitForTimeout(400);
      await shot('crate-sealed');
      await expectFocusCue(crate, 'the sealed crate');
      // A click: it rattles, then the first card (the worst piece) shows over its rare burst.
      await crate.click();
      const reveal = page.getByRole('dialog', { name: 'The sealed crate is open' });
      await waitFor(reveal);
      const card = reveal.locator('button.cr-piece');
      await waitFor(card);
      await page.waitForTimeout(900);
      await shot('crate-reveal-first');
      if (!/Rare/.test((await card.getAttribute('aria-label')) ?? ''))
        throw new Error('the first piece is not the rare one');
      await expectTopmost(card, 'the first card');
      const look = await focusLook(card);
      if (!look.outline.startsWith('none') || look.ring)
        throw new Error(`the card shows a focus ring: ${look.outline}`);
      // The server was asked once, with a key.
      const opens = forgeCalls.filter(([k]) => k === 'crate/open');
      if (opens.length !== 1 || typeof opens[0][1].idempotencyKey !== 'string')
        throw new Error(`the crate was opened ${String(opens.length)} times, or without a key`);
      // The scene behind is out of reach: Tab goes round the reveal's own buttons and never leaves it.
      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(
          () => document.activeElement?.closest('.cr-reveal') != null,
        );
        if (!inside) throw new Error('Tab left the reveal for the scene behind it');
      }
      // The piece shows its item card on hover (a mouse) and on a tap, inside the reveal, and a second tap closes it.
      const pop = reveal.locator('.cr-pop');
      await card.hover();
      await waitFor(pop);
      await expectTopmost(pop.locator('.idc'), 'the hovered piece card');
      await shot('crate-reveal-card-hover');
      await page.mouse.move(2, 2);
      await pop.waitFor({ state: 'detached', timeout: 5000 });
      await card.click();
      await waitFor(pop);
      if (!/1 \/ 3/.test((await reveal.locator('.cr-count').textContent()) ?? ''))
        throw new Error('tapping the piece went on instead of showing its card');
      await page.mouse.move(2, 2);
      await waitFor(pop);
      await shot('crate-reveal-card-tap');
      // A second tap closes it: on a phone the card lies over the piece, so the tap lands on the card, which closes it too.
      await (width < 720 ? pop : card).click();
      await page.mouse.move(2, 2);
      await pop.waitFor({ state: 'detached', timeout: 5000 });
      // Enter on the focused piece toggles the card too; Escape closes it before it skips.
      await card.focus();
      await page.keyboard.press('Enter');
      await waitFor(pop);
      await page.keyboard.press('Escape');
      await pop.waitFor({ state: 'detached', timeout: 5000 });
      if ((await reveal.locator('.cr-summary').count()) > 0)
        throw new Error('Escape skipped instead of closing the card');
      // Next goes on to the second piece (a creature puts it on), then the best, last.
      await reveal.getByRole('button', { name: 'Next' }).click();
      await page.waitForFunction(() =>
        /2 \/ 3/.test(document.querySelector('.cr-count')?.textContent ?? ''),
      );
      await page.waitForTimeout(700);
      if (!/puts it on/.test(await reveal.locator('.cr-card').innerText()))
        throw new Error('the second piece does not say who puts it on');
      await shot('crate-reveal-second');
      // A tap on the stage outside the piece goes on too.
      await reveal.locator('.cr-name').click();
      await page.waitForFunction(() =>
        /3 \/ 3/.test(document.querySelector('.cr-count')?.textContent ?? ''),
      );
      await page.waitForTimeout(900);
      if (!/Epic/.test((await card.getAttribute('aria-label')) ?? ''))
        throw new Error('the last piece is not the epic one');
      await shot('crate-reveal-epic');
      // The best waits: it does not move on by itself.
      await page.waitForTimeout(3200);
      if ((await reveal.locator('button.cr-piece').count()) !== 1)
        throw new Error('the best piece moved on by itself');
      await reveal.getByRole('button', { name: 'Show everything' }).click();
      const summary = reveal.locator('.cr-summary');
      await waitFor(summary);
      await page.waitForTimeout(500);
      await expectTopmost(summary, 'the summary');
      if (
        !/3 pieces/.test(await summary.innerText()) ||
        !/1 epic, 2 rare/.test(await summary.innerText())
      )
        throw new Error(`the summary says: ${await summary.innerText()}`);
      await shot('crate-reveal-summary');
      // Each listed piece shows its card on hover and tap.
      const thumb = reveal.locator('.cr-thumb').first();
      await thumb.hover();
      await waitFor(pop);
      await shot('crate-reveal-summary-hover');
      await page.mouse.move(2, 2);
      await pop.waitFor({ state: 'detached', timeout: 5000 });
      await thumb.click();
      await waitFor(pop);
      await page.mouse.move(2, 2);
      await shot('crate-reveal-summary-card');
      await page.keyboard.press('Escape');
      await pop.waitFor({ state: 'detached', timeout: 5000 });
      await reveal.getByRole('button', { name: 'Done' }).click();
      await reveal.waitFor({ state: 'detached', timeout: 10000 });
      // The crate is gone from the room (nothing waits), and so is the Forge's bubble.
      if ((await sceneTarget('The sealed crate').count()) > 0)
        throw new Error('the crate is still in the room');
      await expectNoScroll();
      await shot('crate-after');
      // Skip shows the summary at once; Escape does the same, and on the summary it closes. A reload keeps nothing of the reveal.
      for (const how of ['Skip', 'Escape']) {
        forgeState.crate = ['rare', 'epic'];
        syncValley();
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        await waitFor(page.locator(VALLEY), 'attached');
        await place('forge').evaluate((el) => el.click());
        await waitFor(heading('Forge'));
        await sceneTarget('The sealed crate').click();
        await waitFor(reveal.locator('button.cr-piece'));
        if (how === 'Skip') await reveal.getByRole('button', { name: 'Skip' }).click();
        else await page.keyboard.press('Escape');
        await waitFor(reveal.locator('.cr-summary'));
        if (!/2 pieces/.test(await reveal.locator('.cr-summary').innerText()))
          throw new Error(`${how}: the summary does not show both pieces`);
        if (how === 'Skip') {
          await page.waitForTimeout(500);
          await shot('crate-reveal-skipped');
          await reveal.getByRole('button', { name: 'Done' }).click();
        } else {
          await page.keyboard.press('Escape');
        }
        await reveal.waitFor({ state: 'detached', timeout: 10000 });
        // Escape closed the reveal, not the Forge.
        await waitFor(sceneTarget('The furnace'));
      }
    },
  );

  // Patchwork pieces (V-FORGE-12): blueprints every player knows, taking shards of any element. In the Blueprints list with icon costs, and in the
  // order editor with "Most held" as the default (the pile now holding most, as an icon) or a named element.
  await scenario(
    'valley systems on: a patchwork piece is ordered with "Most held" and with a named element',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
      scouts.seats = [];
      scouts.owned = [];
      scouts.ids = creatures.map((c) => c.id);
      forgeState.anvils = [{ id: 'anvil-1', creatureId: creatures[1].id, kit: null, orders: [] }];
      forgeState.nextOrder = 1;
      forgeCalls.length = 0;
      stateOverride = { creatures, valley: valleyBlock() };
      // A finished patchwork piece in the bag: an ordinary Ember hat (the plainest one) with no rolled lines.
      answerOverride.set('/api/gear', () => {
        const gear = fixture('gear-state');
        const stats = [
          { stat: 'atk', value: 2, base: 2, text: 'Attack 2' },
          { stat: 'hp', value: 3, base: 3, text: 'HP 3' },
        ];
        return {
          ...gear,
          items: gear.items.map((i) =>
            i.baseId === 'kelp-cap'
              ? { ...i, baseId: 'coal-warm-cap', tag: 'ember', rarity: 'common', stats, lines: [] }
              : i,
          ),
        };
      });
    },
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      await place('forge').evaluate((el) => el.click());
      await waitFor(heading('Forge'));
      await goInside();
      await waitFor(sceneTarget('Anvil 1: '));
      // The plans table in the workshop opens the Blueprints list, with the three patchwork blueprints and their price as icons (no words, no quality).
      await sceneTarget('The plans').click();
      const rows = page.locator('li.blueprint').filter({ hasText: /Patchwork/ });
      await waitFor(rows);
      if ((await rows.count()) !== 3)
        throw new Error('the Blueprints list has no 3 patchwork rows');
      const row = rows.first();
      await row.scrollIntoViewIfNeeded();
      if (/Quality|shards?\b/i.test((await row.locator('.bp-meta').textContent()) ?? ''))
        throw new Error('a patchwork row names its costs or its quality in words');
      if ((await row.locator('.bp-meta [role="img"], .bp-meta button').count()) < 2)
        throw new Error('a patchwork row has no cost badges');
      await expectTopmost(
        row.getByRole('button', { name: /^Order/ }),
        'the patchwork Order button',
      );
      await row.evaluate((el) => {
        el.scrollIntoView({ block: 'center' });
      });
      await shot('patch-blueprints');
      // Order it from its row: the editor opens with the blueprint picked and "Most held" (Ember holds most: 7).
      await row.getByRole('button', { name: /^Order/ }).click();
      await waitFor(rightPanel.getByRole('heading', { name: 'The order' }));
      const shards = page.getByRole('button', { name: /^Shards: most held, now Ember/ });
      await waitFor(shards);
      if ((await page.locator('ul[aria-label="Reach"]').count()) > 0)
        throw new Error('a patchwork order offers a Reach');
      await page.waitForTimeout(400);
      await expectTopmost(rightPanel.first(), 'the patchwork order wizard');
      await expectTopmost(shards, 'the shard slot');
      await shot('patch-order-editor');
      await rightPanel.getByRole('button', { name: /^Add to the queue/ }).click();
      await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
      const most = forgeCalls.at(-1)?.[1];
      if (
        most?.action !== 'add' ||
        most.blueprintId !== 'patchwork-hat' ||
        most.element !== undefined ||
        most.reach !== 'none'
      )
        throw new Error(`the "most held" order was ${JSON.stringify(most)}`);
      // Close the plans, open the anvil: the order is in its queue.
      await leftPanel
        .getByRole('button', { name: /Close|^Back/ })
        .first()
        .click();
      await leftPanel.waitFor({ state: 'detached', timeout: 10000 });
      await sceneTarget('Anvil 1: ').click();
      await waitFor(drawer.locator('button.fg-order'));
      // A second one with a named element: the shard choice lists Most held and the five elements.
      await drawer.getByRole('button', { name: /^Add an order/ }).click();
      await waitFor(drawer.getByRole('heading', { name: 'What to make' }));
      const pick = page.locator('ul[aria-label="Blueprints"] button').filter({
        hasText: /Patchwork Charm/,
      });
      await waitFor(pick);
      await expectTopmost(pick.first(), 'the patchwork blueprint choice');
      await shot('patch-what-to-make');
      await pick.first().click();
      await page.getByRole('button', { name: /^Shards: most held/ }).click();
      await waitFor(page.getByText('Which shards'));
      if ((await page.locator('ul[aria-label="Shards"] button').count()) !== 6)
        throw new Error('the shard choice does not list Most held and the five elements');
      await page.waitForTimeout(300);
      await expectTopmost(drawer.first(), 'the shard choice');
      await shot('patch-shard-choice');
      await page.locator('ul[aria-label="Shards"] button').filter({ hasText: /Grove/ }).click();
      await waitFor(page.getByRole('button', { name: /^Shards: Grove/ }));
      await drawer.getByRole('button', { name: /^Add to the queue/ }).click();
      await waitFor(drawer.locator('button.fg-order').nth(1));
      const named = forgeCalls.at(-1)?.[1];
      if (
        named?.action !== 'add' ||
        named.blueprintId !== 'patchwork-charm' ||
        named.element !== 'grove' ||
        named.reach !== 'none'
      )
        throw new Error(`the named order was ${JSON.stringify(named)}`);
      await shot('patch-queue');
      // The finished piece in the bag is an Ember hat like any other: its element badge and tint are the element's.
      await drawer
        .getByRole('button', { name: /Close|^Back/ })
        .first()
        .click();
      await drawer.waitFor({ state: 'detached', timeout: 10000 });
      await sceneTarget('The bag').click();
      const piece = page.getByRole('option', { name: /Coal-Warm Cap/ }).first();
      await piece.scrollIntoViewIfNeeded();
      await piece.click();
      // The item card is a step, never a sheet over the drawer: on a wide window it opens in the OTHER drawer, the bag staying on the
      // left (Misa's pick, 2026-11-15); on a phone it is a page of its own.
      await waitFor(drawer.locator('.item-detail'));
      await page.waitForTimeout(500);
      if (width >= 960) {
        await waitFor(rightPanel.locator('.item-detail'));
        if ((await leftPanel.locator('.item-detail').count()) !== 0)
          throw new Error('the item card opened in the bag drawer instead of beside it');
        await waitFor(leftPanel.getByRole('option', { name: /Coal-Warm Cap/ }).first());
      }
      await shot('patch-bag-card');
      if ((await page.getByRole('dialog').count()) !== 0)
        throw new Error('a sheet is over the drawer');
      await expectTopmost(drawer.locator('.item-detail').first(), 'the finished piece card');
      if (!/Ember/.test((await drawer.locator('.item-detail').first().textContent()) ?? ''))
        throw new Error('the finished piece does not show its element');
      await shot('patch-finished-piece');
      forgeState.anvils = [];
    },
  );

  // The welcome-back Gazette on the server's real paper (phase 5 step 4): it opens over the valley for an unread paper (and again after a
  // reload), shows the paper's one choice at its end, takes it (a scout goes deeper), closes (the server is told once) and is gone after a
  // reload. A short absence, a long one and the choice are each looked at; nothing may overlap (`expectTopmost`) at any width.
  for (const kind of ['short absence', 'long absence']) {
    await scenario(
      `the Gazette on the server's paper (${kind}): opens, replays on a reload, takes the choice, closes`,
      () => {
        const config = ROUTES.get('/api/config');
        answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
        const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
        scouts.seats = [
          { id: 'seat-1', destination: 'ember-caves', creatureId: creatures[0].id, hours: 20 },
        ];
        scouts.owned = [];
        scouts.ids = creatures.map((c) => c.id);
        scoutCalls.length = 0;
        gazetteCalls.length = 0;
        gazette.paper = paperOf(kind, creatures);
        stateOverride = { creatures, valley: valleyBlock() };
        answerOverride.set('/api/valley/gazette/close', (request) => {
          gazetteCalls.push(['close', bodyOf(request)]);
          gazette.paper = null;
          stateOverride = { ...stateOverride, valley: valleyBlock() };
          return { closed: true };
        });
        answerOverride.set('/api/valley/deep', (request) => {
          gazetteCalls.push(['deep', bodyOf(request)]);
          const seat = scouts.seats.find((s) => s.id === bodyOf(request).seatId);
          if (seat !== undefined) seat.deep = bodyOf(request).deep;
          if (gazette.paper !== null) gazette.paper = { ...gazette.paper, decision: null };
          return { seatId: bodyOf(request).seatId, ...syncValley() };
        });
      },
      async () => {
        const paper = page.locator('article[aria-label="The Valley Gazette"]');
        await waitFor(paper);
        await waitFor(page.locator('h3.gz-headline'));
        // The sheet slides up and the paper unfolds: measure once it is still.
        await page.waitForTimeout(800);
        const tag = kind.replace(' ', '-');
        await expectTopmost(page.locator('.gz-masthead').first(), 'the masthead');
        await expectTopmost(page.locator('h3.gz-headline').first(), 'the headline');
        await shot(`gazette-${tag}`);
        // A reload replays the unread paper.
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        await waitFor(paper);
        const heads = await page.locator('.gz-headline, .gz-brief-headline').count();
        if (heads > 3) throw new Error(`${String(heads)} stories on the paper`);
        if ((await page.getByText(/\b(missed|lost|reduced)\b/i).count()) > 0)
          throw new Error('the paper uses loss wording');
        if (kind === 'long absence') {
          const note = await page.locator('.gz-home-note').innerText();
          if (!/kept the fire going/.test(note)) throw new Error(`no welcome line: ${note}`);
        }
        // The choice, last on the paper (a scout's way deeper, only in the short paper).
        const choice = page.locator('.gz-choice');
        if (kind === 'short absence') {
          await waitFor(choice);
          await choice.first().scrollIntoViewIfNeeded();
          await expectTopmost(choice.first(), 'the paper’s choice');
          await expectTopmost(page.getByRole('button', { name: 'Push on' }), 'the Push on button');
          await shot('gazette-decision');
          await page.getByRole('button', { name: 'Push on' }).click();
          await waitFor(page.locator('.gz-choice', { hasText: 'is deep in' }));
          if (!gazetteCalls.some(([name, body]) => name === 'deep' && body.deep === true))
            throw new Error('the scout was not sent deeper');
          if ((await page.getByRole('button', { name: 'Push on' }).count()) > 0)
            throw new Error('the button stays after the choice');
          await expectTopmost(page.locator('.gz-choice').first(), 'the taken choice');
          await shot('gazette-decision-taken');
        } else if ((await choice.count()) > 0) {
          throw new Error('a choice on a paper without one');
        }
        const closer = page.getByRole('button', { name: /more things?|Into the valley/i }).last();
        await closer.scrollIntoViewIfNeeded();
        await expectTopmost(closer, 'the paper’s closing button');
        await closer.click();
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        const closes = gazetteCalls.filter(([name]) => name === 'close');
        if (closes.length !== 1)
          throw new Error(`the server was told ${String(closes.length)} times`);
        await page.locator('.gz-fly').waitFor({ state: 'detached', timeout: 15000 });
        // Closed: nothing holds a ring on the map.
        const ringed = await page.locator(':focus-visible').count();
        if (ringed > 0) throw new Error('a focus ring is left after the paper closed');
        await shot(`gazette-closed-${tag}`);
        // Closed: a reload shows no paper.
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        await waitFor(page.locator(VALLEY), 'attached');
        if ((await paper.count()) > 0) throw new Error('the paper came back after it was closed');
        scouts.seats = [];
      },
    );
  }

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

  // The bonfire in full (phase 5 step 5): another player's creatures round the fire with their owner's name, a creature warming up
  // under its flame, and a scout and a smith in the raid whose posts say so.
  await scenario(
    'valley systems on: visitors at the fire, a warming flame, and posts paused for the raid',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      // Eight of the player's own (the fixture has three): the first two are posted, two more are catching up.
      const creatures = Array.from({ length: 8 }, (_, i) => {
        const from = baseState.creatures[i % baseState.creatures.length];
        return {
          ...from,
          id: i < baseState.creatures.length ? from.id : `${from.id}-r${String(i)}`,
          level: 4 + ((i * 3) % 9),
          busy: null,
          away: false,
        };
      });
      scouts.seats = [
        { id: 'seat-1', destination: 'tidepools', creatureId: creatures[0].id, hours: 30 },
      ];
      forgeState.anvils = [{ id: 'anvil-1', creatureId: creatures[1].id, kit: null, orders: [] }];
      scouts.ids = creatures.map((c) => c.id);
      bonfire.online = [
        {
          name: 'Mia',
          creatures: [
            { id: 'v1', species: creatures[2].species, shiny: false, level: 9, name: null },
          ],
        },
        {
          name: 'Tobias',
          creatures: [
            { id: 'v2', species: creatures[3].species, shiny: false, level: 14, name: 'Pebble' },
          ],
        },
      ];
      bonfire.warm = new Set([creatures[4].id, creatures[5].id]);
      bonfire.raid = new Set([creatures[0].id, creatures[1].id]);
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('bonfire').evaluate((el) => el.click());
        await waitFor(heading('Bonfire'));
        await bonfireCanvasChecks();
        const owners = page.locator('.cv-plate .nameplate-owner');
        await waitFor(owners);
        const names = (await owners.allInnerTexts()).join(',');
        if (!names.includes('Mia') || !names.includes('Tobias'))
          throw new Error(`the visitors' owners are not on their plates: ${names}`);
        await waitFor(page.locator('.vy-flame'));
        const plates = page.locator('.cv-plate .nameplate');
        for (let i = 0; i < (await plates.count()); i += 1)
          await expectTopmost(plates.nth(i), `plate ${String(i)} at the fire`);
        // A tap on a visitor's creature shows its owner's plate, as at the Forge (no drawer: it is not the player's).
        await page.locator('button.cv-target[aria-label*="visiting the fire"]').first().click();
        await waitFor(page.locator('.vy-scene .vy-feet-plate .nameplate-owner'));
        await page.waitForTimeout(300);
        await shot('bonfire5-company');
        // A hand picks a resting creature up and puts it down anywhere on the ground; dropped high in the sky it lands on the ground
        // (Misa, 2026-11-16: no dragging into the sky), and a drag opens no drawer.
        const mine = page.locator('button.cv-target[aria-label*="by the fire"]');
        const rows = [];
        for (let i = 0; i < (await mine.count()); i += 1)
          rows.push(await mine.nth(i).boundingBox());
        const highest = Math.min(...rows.map((r) => r.y + r.height));
        const target = mine.first();
        const was = await target.boundingBox();
        const label = await target.getAttribute('aria-label');
        await page.mouse.move(was.x + was.width / 2, was.y + was.height / 2);
        await page.mouse.down();
        await page.mouse.move(was.x + was.width / 2 + 60, was.y - 40, { steps: 6 });
        await page.mouse.move(was.x + was.width / 2 + 120, 70, { steps: 10 });
        await shot('bonfirefix-drag-mid');
        await page.mouse.up();
        await page.waitForTimeout(300);
        const now = await page.locator(`button.cv-target[aria-label="${label}"]`).boundingBox();
        // The highest seat's feet are 36 scene pixels under the art's top, the horizon's grass line 14 and the least it may stand 20.
        const px = was.width / 16;
        if (now.y + now.height < highest - 16 * px - 1)
          throw new Error(
            `a creature dropped in the sky stands above the ground: feet at ${String(now.y + now.height)}, ground from ${String(highest - 16 * px)}`,
          );
        if (Math.abs(now.y - was.y) < 1 && Math.abs(now.x - was.x) < 1)
          throw new Error('the dragged creature did not move');
        if ((await rightPanel.count()) > 0 && (await rightPanel.isVisible()))
          throw new Error('a drag opened a drawer');
        await page.waitForTimeout(300);
        await shot('bonfirefix-drag');
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
        await place('signpost').evaluate((el) => el.click());
        await waitFor(heading('Signpost'));
        // The seat in the packs drawer says its scout is in the raid (its pack waits for the finale).
        await waitFor(mapTool('The packs'));
        await mapTool('The packs').click();
        const seatRow = leftPanel.getByRole('button', { name: /^Seat 1/ });
        await waitFor(seatRow);
        if (!/In the raid until Sunday/.test((await seatRow.getAttribute('aria-label')) ?? ''))
          throw new Error('the seat in the packs drawer does not say its scout is in the raid');
        await shot('bonfire5-signpost-paused');
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
        await place('forge').evaluate((el) => el.click());
        await waitFor(heading('Forge'));
        await goInside();
        // The anvil in the scene says it is paused; its page (the drawer) says why.
        await waitFor(sceneTarget('Anvil 1: '));
        if (
          !/paused for the raid/.test(
            (await sceneTarget('Anvil 1: ').getAttribute('aria-label')) ?? '',
          )
        )
          throw new Error('the anvil in the scene does not say it is paused');
        await sceneTarget('Anvil 1: ').click();
        await waitFor(drawer.getByText('In the raid until Sunday'));
        await shot('bonfire5-forge-paused');
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
      } finally {
        bonfire.online = [];
        bonfire.warm = new Set();
        bonfire.raid = new Set();
        scouts.seats = [];
        forgeState.anvils = [];
      }
    },
  );

  // The commons on the client (phase 5 step 6b): the project boards, gifts, communal seats, the plaque, collections, the fire, the hearth.
  const commonsOn = () => {
    const config = ROUTES.get('/api/config');
    answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
    const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
    scouts.seats = [];
    scouts.owned = [];
    scouts.ids = creatures.map((c) => c.id);
    forgeState.anvils = [];
    return creatures;
  };
  const commonsOff = () => {
    commonsState.on = false;
    commonsState.communal = {};
    commonsState.hearthBp = 10000;
  };

  await scenario(
    "valley systems on: the Signpost's project board: give Acorns, post a helper, the plaque and the collection",
    () => {
      const creatures = commonsOn();
      commonsScene();
      stateOverride = {
        creatures,
        balances: { ...baseState.balances, bait: 1000 },
        valley: valleyBlock(),
      };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('signpost').evaluate((el) => el.click());
        await waitFor(heading('Signpost'));
        // The board button over the map is the way to the project board (the left drawer; a page on a phone).
        await waitFor(mapTool('The project board'));
        // The scaffolding stands round the road as the project fills.
        await page.waitForTimeout(300);
        await shot('commons-signpost-scaffolding');
        await mapTool('The project board').click();
        const board = page.locator('section[aria-label="Signpost project"]');
        await waitFor(board);
        await board.scrollIntoViewIfNeeded();
        await expectTopmost(board, 'the Signpost board');
        await shot('commons-signpost-board');
        // Give: the list, then the amount, then the one confirm. Each is a step of the panel (Back returns), never a sheet over it.
        await board.getByRole('button', { name: /^Give/ }).click();
        await waitFor(drawer.getByRole('heading', { name: /Give to the project/ }));
        await page.waitForTimeout(500);
        if ((await page.getByRole('dialog').count()) !== 0)
          throw new Error('a sheet is over the drawer');
        await expectTopmost(board, 'the give step');
        await shot('commons-give-list');
        await board.getByRole('button', { name: /^Bait/ }).click();
        await waitFor(board.getByRole('button', { name: /^Give/ }));
        await page.waitForTimeout(300);
        await expectTopmost(board, 'the give amount');
        await shot('commons-give-amount');
        await board.getByRole('button', { name: /One fewer/ }).click();
        await board.getByRole('button', { name: /^Give/ }).click();
        await waitFor(board.getByText(/You gave/));
        const gift = commonsCalls.find(([k]) => k === 'gift')?.[1];
        if (
          gift === undefined ||
          gift.place !== 'signpost' ||
          gift.currency !== 'acorns' ||
          gift.amount !== 239 ||
          typeof gift.idempotencyKey !== 'string'
        )
          throw new Error(`the gift was ${JSON.stringify(gift)}`);
        // A helper on the communal seat: the creature list is a step of the panel, then the slot and the tray say so.
        const seat = board.getByRole('button', { name: /^Signpost: nobody helps/ });
        await seat.scrollIntoViewIfNeeded();
        await expectTopmost(seat, 'the empty helper slot');
        await seat.click();
        await waitFor(drawer.getByRole('heading', { name: /Who helps build/ }));
        if ((await page.getByRole('dialog').count()) !== 0)
          throw new Error('a sheet is over the drawer');
        await page
          .getByRole('option')
          .filter({ hasText: /Sproutle/ })
          .first()
          .click();
        await waitFor(board.getByRole('button', { name: /^Signpost: Sproutle.*helping/ }));
        const posted = commonsCalls.find(([k]) => k === 'communal')?.[1];
        if (posted?.place !== 'signpost' || typeof posted.creatureId !== 'string')
          throw new Error(`the helper was ${JSON.stringify(posted)}`);
        const second = baseState.creatures[1];
        const tray = page.locator(
          `section[aria-label="Creatures to post"] button[data-creature="${second.id}"]`,
        );
        if (!/Helping/.test((await tray.getAttribute('aria-label')) ?? ''))
          throw new Error('the tray does not say Helping');
        await board.scrollIntoViewIfNeeded();
        await shot('commons-signpost-helper');
        // The plaque of the last finished level: names, no amounts.
        await board.getByRole('button', { name: /The plaque of level 2/ }).click();
        await waitFor(drawer.getByRole('heading', { name: /Plaque, level 2/ }));
        await page.waitForTimeout(500);
        await expectTopmost(board, 'the plaque');
        if ((await board.getByText(/\d+%|\bAcorns\b/).count()) > 0)
          throw new Error('the plaque shows an amount');
        await shot('commons-plaque');
        // Escape goes one step back, to the board.
        await page.keyboard.press('Escape');
        await waitFor(board.getByRole('button', { name: /Stones of the Roads/ }));
        // The collection board with its five sockets.
        await board.getByRole('button', { name: /Stones of the Roads/ }).click();
        await waitFor(drawer.getByRole('heading', { name: /Stones of the Roads/ }));
        await page.waitForTimeout(500);
        await expectTopmost(board, 'the collection board');
        if ((await board.locator('.cm-socket').count()) !== 5)
          throw new Error('the board does not have five sockets');
        await shot('commons-collection');
        await page.keyboard.press('Escape');
        await waitFor(board.getByRole('button', { name: /^Give/ }));
      } finally {
        commonsOff();
      }
    },
  );

  await scenario(
    'valley systems on: the Forge shows its fire and a project being built; a Paddock board is open',
    () => {
      const creatures = commonsOn();
      commonsScene();
      stateOverride = {
        creatures,
        balances: { ...baseState.balances, bait: 1000 },
        valley: valleyBlock(),
      };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        // The Places list mentions a project only while it is being built.
        await page.locator('button.vy-hatch').click();
        await waitFor(page.getByRole('dialog'));
        const forgeRow = page
          .getByRole('dialog')
          .getByText(/the Forge is being built, 2 days left/);
        await waitFor(forgeRow);
        await page.waitForTimeout(500);
        await shot('commons-places-list');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        await place('forge').evaluate((el) => el.click());
        await waitFor(heading('Forge'));
        // The furnace is the way to the fire and the project board (the left drawer; a page on a phone).
        await waitFor(sceneTarget('The furnace'));
        await shot('commons-forge-canvas');
        await sceneTarget('The furnace').click();
        const fire = drawer.getByRole('button', { name: /^The fire\./ });
        await waitFor(fire);
        await expectTopmost(fire, 'the fire');
        await shot('commons-forge-fire');
        const board = drawer.locator('section[aria-label="Forge project"]');
        await board.scrollIntoViewIfNeeded();
        await waitFor(board.getByText(/being built, 2 days left/));
        await expectTopmost(board, 'the Forge board');
        await shot('commons-forge-building');
        await fire.scrollIntoViewIfNeeded();
        await fire.click();
        // The fire's numbers are a step of the board's panel (Back returns), never a sheet over it.
        await waitFor(drawer.getByRole('heading', { name: /The fire, level/ }));
        await page.waitForTimeout(500);
        if ((await page.getByRole('dialog').count()) !== 0)
          throw new Error('a sheet is over the drawer');
        await expectTopmost(drawer.first(), 'the fire step');
        await shot('commons-forge-fire-numbers');
        await drawer.getByRole('button', { name: /Back to the project board/ }).click();
        await waitFor(fire);
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
        await place('paddock').evaluate((el) => el.click());
        await waitFor(heading('Paddock'));
        // The Paddock is a canvas: the yard is the page, and its project is in the builders' corner, never on the yard.
        await paddockCanvasChecks();
        // The scaffolding stands high round the Paddock: its project is three quarters full.
        await page.waitForTimeout(300);
        await expectNoScroll();
        await shot('commons-paddock-scaffolding');
        // A helper at the Paddock works at the builders' table (it does not wander the meadow).
        await sceneTarget('The helper spot').click();
        await waitFor(rightPanel.getByRole('option').first());
        await page.waitForTimeout(300);
        await shot('commons-paddock-helper-picker');
        await rightPanel
          .getByRole('option')
          .filter({ hasText: /Sproutle/ })
          .first()
          .click();
        await waitFor(
          page
            .locator('button.cv-target[aria-label*="helping build the Paddock at the builders"]')
            .locator('visible=true'),
        );
        await page.waitForTimeout(400);
        await shot('commons-paddock-helper');
        await sceneTarget("The builders' table").click();
        const paddock = leftPanel.locator('section[aria-label="Paddock project"]');
        await waitFor(paddock);
        await paddock.scrollIntoViewIfNeeded();
        await expectTopmost(paddock, 'the Paddock board');
        await shot('commons-paddock-board');
      } finally {
        commonsOff();
      }
    },
  );

  // The Paddock with the valley's systems on, as a canvas (Misa, 2026-11-15): the yard fills the window, the creatures at home roam in it
  // and are taps (a drag moves one and opens nothing), the gate opens the waiting catches, "Creatures" opens the Creatures page.
  await scenario(
    'valley systems on: the Paddock is a canvas: a creature opens in the right drawer, the gate has the newcomers, Creatures is the left drawer',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      // A state with newcomers waiting at the gate (the creatures-state fixture's four duplicates and the roster they belong to).
      const waiting = fixture('creatures-state');
      // Each of them is ready to evolve (its page has the Evolve button, which opens as a step of the same drawer).
      const creatures = waiting.creatures.map((c) => ({
        ...c,
        busy: null,
        away: false,
        level: 15,
        ...(c.evolution === undefined ? {} : { evolution: { ...c.evolution, available: true } }),
      }));
      scouts.seats = [];
      scouts.ids = creatures.map((c) => c.id);
      stateOverride = { creatures, pending: waiting.pending, valley: valleyBlock() };
    },
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      await place('paddock').evaluate((el) => el.click());
      await waitFor(heading('Paddock'));
      await paddockCanvasChecks();
      const roamers = page.locator('button.cv-target[aria-label*="at home in the Paddock"]');
      await waitFor(roamers);
      await expectNoScroll();
      await page.waitForTimeout(400);
      await shot('paddock-open');
      // A drag moves a creature and opens no drawer.
      const box = await roamers.first().boundingBox();
      if (box === null) throw new Error('a creature has no box');
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 30, cy + 6, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      if ((await rightPanel.count()) > 0) throw new Error('a drag opened a drawer');
      // A tap opens it in the right drawer: where it is, and its page one step on.
      await roamers.first().evaluate((el) => el.click());
      const openPage = rightPanel.getByRole('button', { name: /^Open its page/ });
      await waitFor(openPage);
      await expectNoScroll();
      await page.waitForTimeout(300);
      await shot('paddock-creature');
      await openPage.click();
      const back = rightPanel.getByRole('button', { name: /Back/ });
      await waitFor(back);
      await page.waitForTimeout(300);
      await shot('paddock-creature-page');
      // Evolve is a step of the same drawer, not a sheet over it: its own Back returns to the creature's page.
      await rightPanel
        .getByRole('button', { name: /^Evolve/ })
        .first()
        .click();
      const evolveBack = rightPanel.getByRole('button', { name: /to .*Back|Back/ });
      await waitFor(rightPanel.locator('.evolve-forms'));
      if ((await page.locator('.evolve-drawer').count()) > 0)
        throw new Error('evolve opened as a sheet over the Paddock drawer');
      await expectNoScroll();
      await page.waitForTimeout(300);
      await shot('paddock-evolve');
      await evolveBack.first().click();
      await waitFor(rightPanel.getByRole('button', { name: /^Evolve/ }));
      await back.first().click();
      await waitFor(openPage);
      await page.keyboard.press('Escape');
      await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
      // The gate is a tap while newcomers wait: the same cards and the one Confirm as the Creatures page had.
      const gate = page.locator('button.cv-target[aria-label^="The gate"]').locator('visible=true');
      if ((await gate.count()) > 0) {
        await expectTopmost(gate.first(), 'the gate');
        await gate.first().click();
        await waitFor(rightPanel.getByRole('button', { name: /^Confirm/ }));
        await page.waitForTimeout(300);
        await shot('paddock-gate');
        await page.keyboard.press('Escape');
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
      }
      // The Creatures page is the left drawer; the waiting catches are not repeated in it (the scene settles back first).
      await page.waitForTimeout(500);
      await expectTopmost(creaturesButton().first(), 'the Creatures button');
      await creaturesButton().first().click();
      await waitFor(leftPanel.locator('li.creature-card'));
      if ((await leftPanel.locator('section.pending-catches').count()) > 0)
        throw new Error('the waiting catches are in the Creatures drawer as well as at the gate');
      await expectNoScroll();
      await page.waitForTimeout(300);
      await shot('paddock-creatures');
    },
  );

  await scenario(
    'valley systems on: the Bonfire at level 3 has the grand hearth, shows its bonus, and its board opens in one drawer',
    () => {
      const creatures = commonsOn();
      commonsScene({
        bonfire: {
          level: 3,
          state: 'open',
          size: 900,
          have: { acorns: 120, scrap: 200, shards: 20 },
          given: 0,
          plaque: ['Ada', 'Mia'],
          keepsakes: 1,
        },
      });
      commonsState.hearthBp = 10800;
      stateOverride = {
        creatures,
        balances: { ...baseState.balances, bait: 1000 },
        valley: valleyBlock(),
      };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('bonfire').evaluate((el) => el.click());
        await waitFor(heading('Bonfire'));
        await bonfireCanvasChecks();
        // The builders' corner (the project is being built): its table is the project board's way in, the fire is no target, the
        // helper spot beside the table is a dashed outline; nothing scrolls.
        const fire = sceneTarget("The builders' table");
        await waitFor(fire);
        await expectTopmost(fire, 'the builders table target');
        if ((await sceneTarget('The hearth').count()) > 0)
          throw new Error('the fire is a target while the builders corner stands');
        await waitFor(page.locator('button.cv-target.cv-slot[aria-label^="The helper spot"]'));
        const plates = page.locator('.cv-plate .nameplate');
        for (let i = 0; i < (await plates.count()); i += 1)
          await expectTopmost(plates.nth(i), `plate ${String(i)} at the fire`);
        await expectNoScroll();
        await page.waitForTimeout(300);
        await shot('commons-bonfire-level3');
        // A tap on a resting creature opens it in the right drawer with the one thing it can do here: help build the hearth.
        await page.locator('button.cv-target[aria-label*="by the fire"]').first().click();
        await waitFor(rightPanel.getByRole('button', { name: /^Help build the hearth/ }));
        await page.waitForTimeout(300);
        await shot('commons-bonfire-creature');
        await page.keyboard.press('Escape');
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        await fire.click();
        await waitFor(leftPanel.getByText(/The hearth adds 8% to every creature/));
        await page.waitForTimeout(500);
        await expectTopmost(leftPanel, 'the Bonfire board');
        await shot('commons-bonfire-board');
        // The give flow is a step of the same drawer: one panel at all times.
        await leftPanel.getByRole('button', { name: /^Give/ }).click();
        await waitFor(leftPanel.getByRole('button', { name: /^Bait/ }));
        if ((await page.getByRole('dialog').count()) !== 0)
          throw new Error('a sheet is over the drawer');
        await leftPanel.getByRole('button', { name: /^Bait/ }).click();
        await leftPanel.getByRole('button', { name: /^Give/ }).click();
        // The gift lands and the drawer is back on the board.
        await waitFor(leftPanel.getByText(/You gave/));
        if (!commonsCalls.some(([k, b]) => k === 'gift' && b.place === 'bonfire'))
          throw new Error('no gift to the hearth');
        // A helper at the fire (the lamplighter) is a step of the same drawer too.
        await leftPanel.getByRole('button', { name: /^Bonfire: nobody helps/ }).click();
        await waitFor(leftPanel.getByRole('option').first());
        if ((await page.getByRole('dialog').count()) !== 0)
          throw new Error('a sheet is over the drawer');
        await leftPanel
          .getByRole('option')
          .filter({ hasText: /Sproutle/ })
          .first()
          .click();
        await waitFor(leftPanel.getByRole('button', { name: /helping/ }));
        await page.keyboard.press('Escape');
        await leftPanel.waitFor({ state: 'detached', timeout: 10000 });
        await page.waitForTimeout(300);
        await shot('commons-bonfire-lamplighter');
        // The helper stands on its seat now; a tap on it picks who helps (the right drawer), and the dashed outline is gone.
        if ((await page.locator('button.cv-target.cv-slot').count()) !== 0)
          throw new Error('the helper seat is still an empty outline');
        await page
          .locator('button.cv-target[aria-label*="at the builders\' table. Change"]')
          .click();
        await waitFor(rightPanel.getByRole('option').first());
        await page.waitForTimeout(500);
        if (width >= 960) {
          // The builders' corner is kept in view: its table and its helper spot both stand clear of the right drawer.
          const drawerBox = await rightPanel.boundingBox();
          for (const name of [/^The builders' table/, /at the builders' table\. Change/]) {
            const box = await page
              .locator('button.cv-target')
              .and(page.getByLabel(name))
              .first()
              .boundingBox();
            if (box === null || drawerBox === null || box.x + box.width > drawerBox.x)
              throw new Error(
                `the builders' corner is under the drawer: ${JSON.stringify([box, drawerBox])}`,
              );
          }
        }
        await shot('commons-bonfire-seat');
        await page.keyboard.press('Escape');
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        // The creature tray stays under the scene: on a wide window a tray creature dragged onto the helper spot is posted as the
        // helper, and a drag opens no drawer (a phone's tray creature needs a hold, which the mouse here does not give).
        await waitFor(page.locator('section[aria-label="Creatures to post"]'));
        // The scene pans back as the drawer goes: measure once it has settled.
        await page.waitForTimeout(700);
        if (width >= 960) {
          const mover = page
            .locator('section[aria-label="Creatures to post"] button[data-creature]')
            .first();
          const moverId = await mover.getAttribute('data-creature');
          const start = await mover.boundingBox();
          const spot = await page
            .locator('button.cv-target[aria-label*="at the builders\' table"]')
            .last()
            .boundingBox();
          if (start === null || spot === null) throw new Error('no boxes to drag between');
          const before = commonsCalls.filter(([k]) => k === 'communal').length;
          await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
          await page.mouse.down();
          await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 12, {
            steps: 4,
          });
          await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2, { steps: 12 });
          await page.waitForTimeout(150);
          await page.mouse.move(spot.x + spot.width / 2 + 1, spot.y + spot.height / 2 + 1, {
            steps: 2,
          });
          await shot('bonfire-tray-drag');
          await page.mouse.up();
          await page.waitForTimeout(300);
          const posted = commonsCalls.filter(([k]) => k === 'communal');
          if (posted.length !== before + 1 || posted.at(-1)?.[1].creatureId !== moverId)
            throw new Error('the dragged tray creature was not posted as the helper');
          if (posted.at(-1)?.[1].place !== 'bonfire') throw new Error('posted to another place');
          if ((await page.locator('.pc-side, .pc-page').count()) !== 0)
            throw new Error('a drag opened a drawer');
        }
        // The map draws the grand bonfire too.
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
        await shot('commons-map-level3');
      } finally {
        commonsOff();
      }
    },
  );

  await scenario(
    'valley systems on: the Bonfire at its top level has no builders corner, and the fire opens the board',
    () => {
      const creatures = commonsOn();
      commonsScene({
        bonfire: {
          level: 5,
          state: 'open',
          size: 900,
          have: { acorns: 120, scrap: 200, shards: 20 },
          given: 0,
          plaque: ['Ada', 'Mia'],
          keepsakes: 1,
        },
      });
      commonsState.hearthBp = 12500;
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('bonfire').evaluate((el) => el.click());
        await waitFor(heading('Bonfire'));
        await bonfireCanvasChecks();
        const fire = sceneTarget('The hearth');
        await waitFor(fire);
        await expectTopmost(fire, 'the hearth target');
        if ((await page.locator('button.cv-target[aria-label^="The builders"]').count()) > 0)
          throw new Error('the builders corner stands at the top level');
        if ((await page.locator('button.cv-target[aria-label^="The helper spot"]').count()) > 0)
          throw new Error('a helper spot stands at the top level');
        await expectNoScroll();
        await page.waitForTimeout(300);
        await shot('bonfire-top-level');
        await fire.click();
        await waitFor(leftPanel.getByText(/The hearth adds 25% to every creature/));
        await page.keyboard.press('Escape');
      } finally {
        commonsOff();
      }
    },
  );

  await scenario(
    'valley systems on: the House shelves the keepsakes of the levels the player helped build',
    () => {
      const creatures = commonsOn();
      commonsScene();
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('house').evaluate((el) => el.click());
        await waitFor(heading('House'));
        const shelf = page.locator('section[aria-label="Keepsakes"]');
        await waitFor(shelf);
        await expectTopmost(shelf, 'the keepsake shelf');
        await page.waitForTimeout(300);
        await shot('commons-keepsakes');
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
      } finally {
        commonsOff();
      }
    },
  );

  // The Market (phase 5 step 7): not open until the guided start reaches it, the project board while it is built, then the broker's seat.
  const marketOff = () => {
    marketState.on = false;
    marketState.built = false;
    marketState.creatureId = null;
    marketState.toward = null;
    commonsOff();
  };

  await scenario(
    'valley systems on: the Market is not open yet until the guided start reaches it',
    () => {
      const creatures = commonsOn();
      // A young server: only the hearth's project is open, so the Market (second in the guided start) is not.
      commonsScene({
        forge: { level: 1, state: 'waiting' },
        signpost: { level: 1, state: 'waiting' },
        paddock: { level: 1, state: 'waiting' },
        market: { level: 1, state: 'waiting' },
      });
      marketState.on = true;
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('market').evaluate((el) => el.click());
        await waitFor(heading('Market'));
        await waitFor(page.getByText('A market will open here, for shards and trades.'));
        await page.waitForTimeout(300);
        await shot('market-not-open');
        await backToValley();
      } finally {
        marketOff();
      }
    },
  );

  await scenario(
    "valley systems on: the Market's project is built with the board (Acorns, scrap and shards of any kind)",
    () => {
      const creatures = commonsOn();
      commonsScene({
        market: {
          level: 1,
          state: 'open',
          size: 700,
          have: { acorns: 150, scrap: 300, shards: 0 },
          given: 40,
        },
      });
      marketState.on = true;
      stateOverride = {
        creatures,
        balances: { ...baseState.balances, bait: 1000 },
        valley: valleyBlock(),
      };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('market').evaluate((el) => el.click());
        await waitFor(heading('Market'));
        await marketCanvasChecks();
        // Before it is built the whole Market is a building site: no stall to use and no broker seat, the builders' corner with its
        // table (the project board's way in) and the helper's dashed spot.
        const table = sceneTarget("The builders' table");
        await waitFor(table);
        await expectTopmost(table, 'the builders table target');
        await waitFor(page.locator('button.cv-target.cv-slot[aria-label^="The helper spot"]'));
        if ((await sceneTarget('The shard stall').count()) > 0)
          throw new Error('the stall can be used before the Market is built');
        if ((await page.locator('button.cv-target[aria-label*="broker"]').count()) > 0)
          throw new Error('a broker seat stands before the Market is built');
        const plates = page.locator('.cv-plate .nameplate');
        for (let i = 0; i < (await plates.count()); i += 1)
          await expectTopmost(plates.nth(i), `plate ${String(i)} at the Market`);
        await expectNoScroll();
        await page.waitForTimeout(300);
        await shot('market-building');
        await table.click();
        const board = leftPanel.locator('section[aria-label="Market project"]');
        await waitFor(board);
        await page.waitForTimeout(500);
        await expectTopmost(leftPanel, 'the Market board');
        // What is needed is icons and numbers (Acorns, scrap), never words.
        await waitFor(board.getByText(/Still needed:/));
        // Shards of any kind count too (V-COM-15): a line says so with the any-shard icon, and "Still needed" names no shard part.
        await waitFor(board.getByText(/counts too, as many as you like/));
        const needLine = await board
          .locator('p', { hasText: /^Still needed:/ })
          .first()
          .innerText();
        if (/shard|acorn|scrap/i.test(needLine))
          throw new Error(`the Market board spells a resource out: ${needLine}`);
        if (
          (await board
            .locator('p', { hasText: /^Still needed:/ })
            .first()
            .locator('[role="img"]')
            .count()) !== 2
        )
          throw new Error('the Market board should need exactly Acorns and scrap, as icons');
        await expectTopmost(board.getByText(/counts too, as many as you like/), 'the shard line');
        await shot('mshards-board');
        // The give flow is a step of the same drawer: one panel at all times, never a sheet over it.
        await board.getByRole('button', { name: /^Give/ }).click();
        await waitFor(leftPanel.getByRole('button', { name: /^Ember Shard/ }));
        if ((await page.getByRole('dialog').count()) !== 0)
          throw new Error('a sheet is over the drawer');
        await page.waitForTimeout(500);
        await expectTopmost(leftPanel, 'the Market give step');
        // A row is an icon and a number: its name is the icon's spoken label ("Ember Shards: 7").
        const rows = await leftPanel
          .getByRole('button')
          .evaluateAll((els) =>
            els.map((e) => e.querySelector('[role="img"]')?.getAttribute('aria-label') ?? ''),
          );
        // The shelf holds Ember 7, Tide 4, Mire 3, Spark 2 (Grove 0): every pile held, the biggest first, none for Grove.
        const shardRows = rows.filter((r) => /shard/i.test(r));
        const order = ['Ember', 'Tide', 'Mire', 'Spark'].map((n) =>
          shardRows.findIndex((r) => r.startsWith(`${n} Shard`)),
        );
        if (order.join() !== '0,1,2,3' || shardRows.length !== 4)
          throw new Error(`the give list offers shards in the wrong order: ${rows.join(' | ')}`);
        await shot('mshards-give-list');
        // Give Ember shards (any element counts in full): the gift names the element, one keyed gift.
        await leftPanel.getByRole('button', { name: /^Ember Shard/ }).click();
        await waitFor(leftPanel.getByRole('button', { name: /^Give/ }));
        await page.waitForTimeout(300);
        await expectTopmost(leftPanel, 'the Market shard amount');
        await shot('mshards-give-amount');
        await leftPanel.getByRole('button', { name: /^Give/ }).click();
        await waitFor(leftPanel.getByText(/You gave/));
        const gift = commonsCalls.find(([k]) => k === 'gift')?.[1];
        if (
          gift === undefined ||
          gift.place !== 'market' ||
          gift.currency !== 'shards' ||
          gift.element !== 'ember' ||
          gift.amount !== 7 ||
          typeof gift.idempotencyKey !== 'string'
        )
          throw new Error(`the shard gift was wrong: ${JSON.stringify(gift)}`);
        // The helper's spot beside the table: a tap lists who can help (the right drawer).
        await page.keyboard.press('Escape');
        await leftPanel.waitFor({ state: 'detached', timeout: 10000 });
        await sceneTarget('The helper spot').click();
        await waitFor(rightPanel.getByRole('option').first());
        await shot('market-helper-seat');
        await backToValley();
      } finally {
        marketOff();
      }
    },
  );

  await scenario(
    'valley systems on: the Market is built: post the broker, what it trades toward, its rates',
    () => {
      const creatures = commonsOn();
      commonsScene({ market: { level: 2, state: 'done', plaque: ['Ada', 'You'], keepsakes: 1 } });
      marketState.on = true;
      marketState.built = true;
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('market').evaluate((el) => el.click());
        await waitFor(heading('Market'));
        await marketCanvasChecks();
        // Built: the stall (the exchange) and the broker's dashed seat in front of it; the builders' corner is gone with the project.
        const stall = sceneTarget('The shard stall');
        const seat = page.locator('button.cv-target.cv-slot[aria-label^="The broker seat"]');
        await waitFor(stall);
        await waitFor(seat);
        await expectTopmost(stall, 'the shard stall');
        await expectTopmost(seat, 'the empty broker seat');
        if ((await sceneTarget("The builders' table").count()) > 0)
          throw new Error('the builders corner stands at a built Market');
        const plates = page.locator('.cv-plate .nameplate');
        for (let i = 0; i < (await plates.count()); i += 1)
          await expectTopmost(plates.nth(i), `plate ${String(i)} at the Market`);
        await expectNoScroll();
        await page.waitForTimeout(300);
        await shot('market-free-seat');
        await expectFocusCue(stall, 'the shard stall');
        await expectNoFocusOnClick(seat, 'the broker seat');
        await waitFor(rightPanel.getByRole('option').first());
        await waitFor(page.getByText('Who trades at the Market?').first());
        await page.waitForTimeout(400);
        await expectTopmost(rightPanel, 'the broker list');
        if ((await page.getByRole('dialog').count()) !== 0)
          throw new Error('a sheet is over the drawer');
        await shot('market-broker-picker');
        await rightPanel
          .getByRole('option')
          .filter({ hasText: /Sproutle/ })
          .first()
          .click();
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        const posted = scoutCalls.filter(([k]) => k === 'seat').at(-1)?.[1];
        if (posted?.seatId !== 'broker-1' || typeof posted.creatureId !== 'string')
          throw new Error(`the broker was ${JSON.stringify(posted)}`);
        // The broker stands at its seat now, no empty outline; a tap opens it.
        const broker = page.locator('button.cv-target[aria-label*="the broker."]');
        await waitFor(broker);
        if ((await page.locator('button.cv-target.cv-slot').count()) !== 0)
          throw new Error('the broker seat is still an empty outline');
        await page.waitForTimeout(300);
        await shot('market-broker-posted');
        await broker.click();
        await waitFor(rightPanel.getByText(/Swaps\s+12\s+for\s+5, with a 10% chance of one extra/));
        await page.waitForTimeout(400);
        await expectTopmost(rightPanel, 'the broker panel');
        await shot('market-rates');
        // What it trades toward: a step of the same panel, one tap.
        await rightPanel
          .getByRole('button', { name: /^Trades toward: What the orders need/ })
          .click();
        await waitFor(rightPanel.getByText(/It never trades the few shards you keep/));
        await page.waitForTimeout(500);
        if ((await page.getByRole('dialog').count()) !== 0)
          throw new Error('a sheet is over the drawer');
        await expectTopmost(rightPanel, 'the trade-toward step');
        await shot('market-trade-toward');
        await rightPanel.getByRole('button', { name: /^Grove Shard/ }).click();
        const sent = commonsCalls.find(([k]) => k === 'broker')?.[1];
        if (sent?.seatId !== 'broker-1' || sent.toward !== 'grove')
          throw new Error(`the setting was ${JSON.stringify(sent)}`);
        await waitFor(rightPanel.getByRole('button', { name: /^Trades toward: Grove shards/ }));
        await page.keyboard.press('Escape');
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        // The stall opens the exchange in the right drawer.
        await stall.click();
        await waitFor(rightPanel.getByRole('button', { name: /^Trade\b.*× \d/ }));
        await page.waitForTimeout(500);
        await expectTopmost(rightPanel, 'the exchange');
        await shot('market-exchange');
        await page.keyboard.press('Escape');
        // A creature carried from the tray onto the broker takes its seat, and the drag never opens a drawer.
        const mover = page
          .locator('section[aria-label="Creatures to post"] button[data-creature]')
          .nth(1);
        const moverId = await mover.getAttribute('data-creature');
        const from = await mover.boundingBox();
        const to = await broker.boundingBox();
        if (from === null || to === null) throw new Error('no boxes to drag');
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, {
          steps: 4,
        });
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        const dragged = scoutCalls.filter(([k]) => k === 'seat').at(-1)?.[1];
        if (dragged?.seatId !== 'broker-1' || dragged.creatureId !== moverId)
          throw new Error(`the dragged broker was ${JSON.stringify(dragged)}`);
        if ((await drawer.count()) !== 0) throw new Error('a drag opened a drawer');
        await shot('market-tray-drag');
        // The tray (the map's) says Trading for the creature at the seat.
        await backToValley();
        await waitFor(page.getByRole('button', { name: /Trading at the Market/ }));
      } finally {
        marketOff();
      }
    },
  );

  // Q64: shards change hands at the Market only. Before it is built an anvil that waits for a shard says the Market will trade for it and
  // leads to the Market's project board; once it is built the same anvil leads to the Market's exchange, which is where the drawer lives.
  await scenario(
    "valley systems on: the Forge's wait line before and after the Market is built, and the exchange at the Market",
    () => {
      const creatures = commonsOn();
      commonsScene({
        market: {
          level: 1,
          state: 'open',
          size: 700,
          have: { acorns: 150, scrap: 300, shards: 0 },
          given: 40,
        },
      });
      forgeState.anvils = [
        {
          id: 'anvil-1',
          creatureId: creatures[1].id,
          kit: null,
          orders: [{ id: 'order-1', blueprintId: 'kelp-cap', count: 2, reach: 'none' }],
        },
      ];
      forgeState.waitShard = 'grove';
      forgeCalls.length = 0;
      marketState.on = true;
      stateOverride = {
        creatures,
        balances: { ...baseState.balances, bait: 1000 },
        valley: valleyBlock(),
      };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('forge').evaluate((el) => el.click());
        await waitFor(heading('Forge'));
        await goInside();
        // The anvil in the scene says it waits for a shard; a click opens its page, whose wait line is below.
        await waitFor(sceneTarget('Anvil 1: '));
        await sceneTarget('Anvil 1: ').click();
        // Before: the wait line says the Market will trade once the valley builds it; there is no exchange tap at the Forge.
        const before = page.getByText(
          /Waiting for\s+for 3 h\. The Market will trade for them once the valley builds it\./,
        );
        await waitFor(before);
        await before.first().scrollIntoViewIfNeeded();
        await expectTopmost(before.first(), 'the wait line before the Market');
        const go = page.getByRole('button', { name: /Go to the Market/ });
        await waitFor(go);
        await expectTopmost(go.first(), 'the button to the Market');
        if (
          (await page.getByRole('button', { name: /Trade shards|Trade for|Trade at/ }).count()) > 0
        )
          throw new Error('the Forge still has an exchange tap before the Market is built');
        await page.waitForTimeout(300);
        await shot('q64-forge-wait-before');
        // It leads to the Market's project board.
        await go.first().click();
        await waitFor(heading('Market'));
        await marketCanvasChecks();
        await waitFor(sceneTarget("The builders' table"));
        if ((await sceneTarget('The shard stall').count()) > 0)
          throw new Error('the Market offers the exchange before it is built');
        await sceneTarget("The builders' table").click();
        const board = leftPanel.locator('section[aria-label="Market project"]');
        await waitFor(board);
        await expectTopmost(leftPanel, 'the Market board');
        await backToValley();

        // The server builds the Market: the same anvil now leads to the exchange.
        commonsScene({ market: { level: 2, state: 'done', plaque: ['Ada', 'You'], keepsakes: 1 } });
        marketState.built = true;
        stateOverride = { ...stateOverride, valley: valleyBlock() };
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        await waitFor(page.locator(VALLEY), 'attached');
        await place('forge').evaluate((el) => el.click());
        await waitFor(heading('Forge'));
        await goInside();
        await waitFor(sceneTarget('Anvil 1: '));
        await sceneTarget('Anvil 1: ').click();
        const after = page.getByText(/Waiting for\s+for 3 h/);
        await waitFor(after);
        await after.first().scrollIntoViewIfNeeded();
        await expectTopmost(after.first(), 'the wait line after the Market');
        if ((await page.getByText(/once the valley builds it/).count()) > 0)
          throw new Error('the Forge still says the Market is not built');
        const trade = page.getByRole('button', { name: /Trade at the Market/ });
        await waitFor(trade);
        await expectTopmost(trade.first(), 'the button to the exchange');
        await page.waitForTimeout(300);
        await shot('q64-forge-wait-after');
        // It leads to the Market's exchange, on the shard the anvil waits for: rate and crit are shown, the trade is keyed.
        await trade.first().click();
        await waitFor(heading('Market'));
        await marketCanvasChecks();
        await waitFor(rightPanel.getByRole('button', { name: /^Trade\b.*× \d/ }));
        await page.waitForTimeout(500);
        const text = await rightPanel.innerText();
        if (!/10% chance to get\s+2/.test(text))
          throw new Error('the exchange does not show the crit chance');
        // The shard to get is its icon (Grove) with a number, then "You get".
        if (
          !/You get/.test(text) ||
          (await rightPanel.locator('[role="img"][aria-label^="Grove Shard"]').count()) === 0
        )
          throw new Error(`the exchange did not start on Grove: ${text}`);
        await expectTopmost(rightPanel, 'the exchange drawer');
        await shot('q64-market-exchange');
        await rightPanel.getByRole('button', { name: /^Trade\b.*× \d/ }).click();
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        const traded = forgeCalls.at(-1);
        if (
          traded?.[0] !== 'exchange' ||
          typeof traded[1].idempotencyKey !== 'string' ||
          traded[1].to !== 'grove'
        )
          throw new Error('the trade was sent without an idempotency key, or not for Grove');
        // The exchange is also one tap away on the Market's own stall.
        await expectTopmost(sceneTarget('The shard stall'), 'the stall');
        await backToValley();
      } finally {
        forgeState.waitShard = null;
        forgeState.anvils = [];
        marketOff();
      }
    },
  );

  // Q64: the Market's opening is the one story every player's next paper leads with (even after a short absence).
  await scenario(
    "the Gazette leads with the Market's opening (Q64): the stall is the picture, and it closes as any paper does",
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
      scouts.seats = [];
      scouts.owned = [];
      scouts.ids = creatures.map((c) => c.id);
      gazetteCalls.length = 0;
      const [a, , c] = creatures;
      gazette.paper = {
        id: '1799760000777',
        at: 1799760000000,
        awayHours: 5,
        headlines: [
          headline('market-open', 120, 0),
          headline('new-species', 100, 1, {
            creatureIds: [a.id],
            species: creatures[creatures.length - 1].species,
            newcomers: [creatures[creatures.length - 1].id],
          }),
          headline('resting-xp', 45, 1, { creatureIds: [c.id] }),
        ],
        more: 0,
        brought: { acorns: 0, scrap: 0, shards: 0 },
        decision: null,
      };
      stateOverride = { creatures, valley: valleyBlock() };
      answerOverride.set('/api/valley/gazette/close', (request) => {
        gazetteCalls.push(['close', bodyOf(request)]);
        gazette.paper = null;
        stateOverride = { ...stateOverride, valley: valleyBlock() };
        return { closed: true };
      });
    },
    async () => {
      try {
        const paper = page.locator('article[aria-label="The Valley Gazette"]');
        await waitFor(paper);
        await waitFor(page.locator('h3.gz-headline'));
        await page.waitForTimeout(800);
        const lead = page.locator('h3.gz-headline').first();
        const words = await lead.innerText();
        if (!/MARKET OPENS/i.test(words)) throw new Error(`the paper leads with: ${words}`);
        await expectTopmost(lead, 'the Market headline');
        await expectTopmost(page.locator('.gz-masthead').first(), 'the masthead');
        await shot('q64-paper-market');
        const closer = page.getByRole('button', { name: /more things?|Into the valley/i }).last();
        await closer.scrollIntoViewIfNeeded();
        await expectTopmost(closer, 'the paper’s closing button');
        await closer.click();
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        if (gazetteCalls.filter(([name]) => name === 'close').length !== 1)
          throw new Error('the server was not told once');
        await page.locator('.gz-fly').waitFor({ state: 'detached', timeout: 15000 });
      } finally {
        gazette.paper = null;
      }
    },
  );

  // The weekly visitor (phase 5 step 8b), his stall as a canvas: his place as the server says (the shuttered stall and its sign while away;
  // the visitor and the blueprint on his counter while here), the reroll of one piece (picker, price and odds, one confirm, before and
  // after) and the week's blueprint.
  const visitorOn = (here) => {
    const creatures = commonsOn();
    visitorReset();
    visitorState.here = here;
    answerOverride.set('/api/gear', visitorGear);
    stateOverride = {
      creatures,
      balances: { ...baseState.balances, bait: visitorState.bait },
      valley: valleyBlock(),
    };
  };
  const visitorOff = () => {
    visitorReset();
    commonsOff();
  };

  /** The visitor's stall is a canvas: the scene is inside the canvas shell, with no page under it and no builders' corner. */
  const visitorCanvasChecks = async () => {
    await waitFor(page.locator('.pc-root .vy-in-visitor'));
    if ((await page.locator('.vy-soon .vy-page, .vs-page').count()) > 0)
      throw new Error('his stall has a page under its scene');
    if ((await page.locator('button.cv-target[aria-label*="builders" i]').count()) > 0)
      throw new Error('his stall has a builders corner');
    await expectNoScroll();
    // The creature tray stays under the scene, as at the other places.
    await waitFor(page.locator('.pc-below section[aria-label="Your creatures"]'));
  };

  await scenario(
    'the visitor away (V-VIS-1): the shuttered stall is the canvas, its sign says back Thursday and it offers nothing else',
    () => {
      visitorOn(false);
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await page.waitForTimeout(300);
        await shot('visitor-map-away');
        await place('visitor').evaluate((el) => el.click());
        await waitFor(heading('Visitor'));
        await visitorCanvasChecks();
        // The sign is the one thing to click, and its plate says when he is back (no timer).
        await waitFor(sceneTarget('The sign'));
        if ((await page.locator('button.cv-target').locator('visible=true').count()) !== 1)
          throw new Error('his shuttered place offers more than its sign');
        await waitFor(page.locator('.cv-plate', { hasText: 'Back Thursday' }));
        if ((await page.getByRole('button', { name: /Reroll|Choose a piece|Buy/ }).count()) > 0)
          throw new Error('his shuttered place offers something');
        const body = await page.locator('main').innerText();
        if (/until|\d+ ?h\b|\d+ ?days?/i.test(body))
          throw new Error(`a countdown on his shuttered place: ${body}`);
        await page.waitForTimeout(300);
        await shot('visitor-away');
        await expectFocusCue(sceneTarget('The sign'), 'the sign');
        await sceneTarget('The sign').click();
        await waitFor(rightPanel.getByText('The stall is shuttered. Back Thursday.'));
        await shot('visitor-away-sign');
        await page.keyboard.press('Escape');
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        await backToValley();
        // The Places list says it too.
        await page.getByRole('button', { name: /^Places/ }).click();
        await waitFor(page.getByText('back Thursday', { exact: true }));
        await page.keyboard.press('Escape');
      } finally {
        visitorOff();
      }
    },
  );

  await scenario(
    'the visitor here (V-VIS-2, 4, 5): click him to reroll one piece with one confirm, see before and after and the next price; click the blueprint on his counter to buy it',
    () => {
      visitorOn(true);
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await page.waitForTimeout(300);
        await shot('visitor-map-here');
        await place('visitor').evaluate((el) => el.click());
        await waitFor(heading('Visitor'));
        await visitorCanvasChecks();
        // The two things to click, each with one plate; no timer, no "until" line, no away line.
        await waitFor(sceneTarget('The visitor'));
        await waitFor(sceneTarget("This week's blueprint"));
        if ((await page.locator('button.cv-target').locator('visible=true').count()) !== 2)
          throw new Error('his stall offers more than the visitor and the blueprint');
        const plates = page.locator('.cv-plate .nameplate');
        if ((await plates.count()) !== 2) throw new Error('each clickable thing has one plate');
        for (let i = 0; i < 2; i += 1)
          await expectTopmost(plates.nth(i), `plate ${String(i)} at his stall`);
        const text = await page.locator('main').innerText();
        if (/until|Back Thursday/i.test(text)) throw new Error(`a countdown or away line: ${text}`);
        await page.waitForTimeout(300);
        await shot('visitor-here');
        // The reroll: a click on him opens the picker (worn pieces first) in the right drawer, a page on a phone.
        await expectNoFocusOnClick(sceneTarget('The visitor'), 'the visitor');
        await waitFor(rightPanel);
        await waitFor(rightPanel.locator('.item-tile'));
        await expectNoScroll();
        await page.waitForTimeout(300);
        await shot('visitor-picker');
        await rightPanel
          .getByRole('button', { name: /Emberkeeper/ })
          .first()
          .click();
        await waitFor(rightPanel.getByText(/chance of Tier 4 \/ 5/));
        await waitFor(rightPanel.getByText(/old lines are gone for good/));
        if (visitorState.calls.length > 0) throw new Error('looking at a piece spent something');
        const confirm = rightPanel.locator('button.action-btn', { hasText: /^Reroll/ });
        await expectTopmost(confirm.first(), 'the Reroll button');
        await page.waitForTimeout(200);
        await shot('visitor-confirm');
        await confirm.first().click();
        await waitFor(rightPanel.getByText(/Rerolled\. The old lines are gone\./));
        const [reroll] = visitorState.calls;
        if (
          reroll === undefined ||
          reroll[0] !== 'reroll' ||
          typeof reroll[1].idempotencyKey !== 'string' ||
          reroll[1].idempotencyKey.length < 8
        )
          throw new Error(
            `the reroll was sent without an idempotency key: ${JSON.stringify(reroll)}`,
          );
        if (visitorState.calls.length !== 1) throw new Error('a reroll was sent twice');
        await waitFor(rightPanel.getByText('Before', { exact: true }));
        await waitFor(rightPanel.getByText('After', { exact: true }));
        await waitFor(rightPanel.getByText(/Next reroll/));
        await page.waitForTimeout(200);
        await shot('visitor-result');
        // Again: back to the pieces, then a piece, whose price rose.
        await rightPanel
          .locator('button.action-btn', { hasText: /Reroll again/ })
          .first()
          .click();
        await waitFor(rightPanel.locator('.item-tile'));
        await rightPanel
          .getByRole('button', { name: /Emberkeeper/ })
          .first()
          .click();
        await waitFor(rightPanel.getByText(/chance of Tier 4 \/ 5/));
        // On a wide window the item card is in the left drawer: Escape closes the layers one at a time (the card, then the panel).
        for (let i = 0; i < 3 && (await rightPanel.count()) > 0; i += 1) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(250);
        }
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        // The blueprint on the counter: its price is icons and numbers; one tap buys, then it says so for the week.
        await sceneTarget("This week's blueprint").click();
        await waitFor(rightPanel);
        const buy = rightPanel.locator('button.action-btn', { hasText: /^Buy/ });
        await waitFor(buy.first());
        await expectTopmost(buy.first(), 'the Buy button');
        await shot('visitor-blueprint');
        await buy.first().click();
        await waitFor(rightPanel.getByText('Bought this week.'));
        const calls = visitorState.calls.filter(([name]) => name === 'blueprint');
        if (calls.length !== 1 || typeof calls[0][1].idempotencyKey !== 'string')
          throw new Error(`the blueprint was sent without a key: ${JSON.stringify(calls)}`);
        await shot('visitor-bought');
        await page.keyboard.press('Escape');
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        await expectNoScroll();
        await backToValley();
      } finally {
        visitorOff();
      }
    },
  );

  await scenario(
    'the visitor leaves while his blueprint is open (409 visitor_away before any spend): the scene turns to his shuttered stall and its sign',
    () => {
      visitorOn(true);
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('visitor').evaluate((el) => el.click());
        await waitFor(sceneTarget("This week's blueprint"));
        await sceneTarget("This week's blueprint").click();
        visitorState.here = false;
        const buy = rightPanel.locator('button.action-btn', { hasText: /^Buy/ });
        await waitFor(buy.first());
        await buy.first().click();
        await waitFor(sceneTarget('The sign'));
        if ((await page.getByRole('button', { name: /Choose a piece|^Buy/ }).count()) > 0)
          throw new Error('the stall still offers his stock after he left');
        await shot('visitor-left');
        await backToValley();
      } finally {
        visitorOff();
      }
    },
  );

  // The School and the trials (phase 5 step 9b): the School's place as the server says (the teacher announced, here, or away), Send and
  // Take off, a student that leaves the fire and the tray's "z", the refusals, a creature's next trial as pips with its list a tap away,
  // an honour on the card and the sprite, and a graduation told in the paper.
  const schoolOn = (phase, wouldLearn, honours = {}) => {
    const creatures = commonsOn();
    schoolReset();
    schoolState.phase = phase;
    schoolState.would = wouldLearn(creatures.map((c) => c.id));
    trialsState.on = true;
    trialsState.ready = 2;
    trialsState.byId = honours;
    stateOverride = { creatures, valley: valleyBlock() };
    return creatures;
  };
  const schoolOff = () => {
    schoolReset();
    commonsOff();
  };
  const noCountdown = (text, what) => {
    if (/until|\d+ ?h\b|\d+ ?minutes?|\d+ ?days?|left/i.test(text))
      throw new Error(`a countdown on ${what}: ${text}`);
  };
  const BRONZE_HONOUR = { honour: 1, tier: 2, boxes: [false, false, false], ready: false };
  const TWO_OF_FOUR = { honour: 0, tier: 1, boxes: [true, true, false, false], ready: false };

  /** The School opens straight on its scene as a canvas (no page under it): the scene is inside the canvas shell. */
  const schoolCanvasChecks = async () => {
    await waitFor(page.locator('.pc-root .vy-in-school'));
    if ((await page.locator('.vy-soon .vy-page').count()) > 0)
      throw new Error('the School has a page under its scene');
    await expectNoScroll();
  };
  const schoolSeats = () => page.locator('button.cv-target[aria-label^="A student seat"]');
  const sitting = () => page.locator('button.cv-target[aria-label*="sits at the School"]');

  await scenario(
    'the School with the teacher here (V-SCH-11, 13): the lectern opens the days and the faces with one Send, a student leaves the fire, Take off, the seat, a drag from the tray, and the refusals',
    () => {
      const creatures = schoolOn('here', (ids) => ids.slice(0, 3), {});
      trialsState.byId = { [creatures[1].id]: BRONZE_HONOUR };
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await page.waitForTimeout(300);
        await shot('school-map-here');
        await page.getByRole('button', { name: /^Places/ }).click();
        await waitFor(page.getByText('2 ready to graduate · a teacher is here', { exact: true }));
        await shot('school-places');
        await page.keyboard.press('Escape');
        await place('school').evaluate((el) => el.click());
        await waitFor(heading('School'));
        await schoolCanvasChecks();
        await waitFor(sceneTarget('The lectern'));
        // Everything in the scene is a named, topmost tap with a plate: the lectern, the two seats, the graduation stage.
        for (const name of ['The lectern', 'The graduation stage'])
          await expectTopmost(sceneTarget(name), name);
        if ((await schoolSeats().count()) !== 2) throw new Error('the bench has not two seats');
        await expectTopmost(schoolSeats().first(), 'the first seat');
        await expectTopmost(schoolSeats().nth(1), 'the second seat');
        if (
          (await page.locator('.cv-plate').count()) !==
          (await page.locator('button.cv-target').count())
        )
          throw new Error('a tap in the School has no plate, or decoration has one');
        await page.waitForTimeout(300);
        await shot('school-here');
        // The lectern opens the teacher: the days, the talent, who would learn it.
        await sceneTarget('The lectern').click();
        await waitFor(rightPanel);
        await waitFor(rightPanel.getByText(/The visiting teacher is here \w+ to \w+\./));
        const text = await rightPanel.innerText();
        noCountdown(text, 'the School');
        if (/\bAcorns?\b|\bscrap\b|\bshards?\b/i.test(text))
          throw new Error(`a currency named in words on the School: ${text}`);
        await waitFor(rightPanel.getByText('First Pounce'));
        await page.waitForTimeout(300);
        await shot('school-teacher');
        // The faces that would learn, one Send each.
        const sends = rightPanel.getByRole('button', { name: /^Send / });
        if ((await sends.count()) !== 3) throw new Error('not one Send for each face');
        // The second face (Cindle, the first, can evolve and shows that mark on the tray instead).
        await expectTopmost(sends.nth(1), 'the Send button');
        await sends.nth(1).click();
        await waitFor(rightPanel.getByText('Learns it by morning'));
        if (schoolState.calls.length !== 1 || schoolState.calls[0].index !== 0)
          throw new Error(`Send asked the server wrongly: ${JSON.stringify(schoolState.calls)}`);
        await page.keyboard.press('Escape');
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        await page.waitForTimeout(300);
        // The student sits on the bench in the scene, wearing its honour on the sprite.
        if ((await page.locator('.vy-stand .honour-ribbon').count()) !== 1)
          throw new Error('the seated student shows no ribbon in the scene');
        await waitFor(sitting());
        await expectNoScroll();
        await shot('school-send');
        // The seat's own tap opens that student, and the one Take off is there.
        await sitting().click();
        await waitFor(rightPanel.getByText('Learns it by morning'));
        await page.waitForTimeout(300);
        await shot('school-student');
        await page.keyboard.press('Escape');
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        // The student left the fire: the tray marks it, the Bonfire's ring has no one of that name.
        const studentId = schoolState.seats[0];
        await backToValley();
        await waitFor(page.locator(`button[data-creature="${studentId}"].vy-mon-studying`));
        await shot('school-student-tray');
        await place('bonfire').evaluate((el) => el.click());
        await waitFor(heading('Bonfire'));
        await page.waitForTimeout(300);
        const resting = await page
          .locator('button.cv-target[aria-label*="resting by the fire"]')
          .count();
        if (resting !== baseState.creatures.length - 1)
          throw new Error(`${String(resting)} rest by the fire; a student still sits there`);
        await backToValley();
        // Take off: the seat is free again.
        await place('school').evaluate((el) => el.click());
        await waitFor(sitting());
        await sitting().click();
        await rightPanel.getByRole('button', { name: /^Take off the seat/ }).click();
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        await waitFor(schoolSeats().first());
        if ((await schoolSeats().count()) !== 2) throw new Error('the seat is not free again');
        if (schoolState.calls.length !== 2 || schoolState.calls[1].creatureId !== null)
          throw new Error(
            `Take off asked the server wrongly: ${JSON.stringify(schoolState.calls)}`,
          );
        // An empty seat picks who joins: a tap on a face sends it to that seat.
        await schoolSeats().nth(1).click();
        await waitFor(rightPanel.getByRole('option').first());
        await page.waitForTimeout(300);
        await shot('school-seat-empty');
        if ((await rightPanel.getByRole('option').count()) !== 3)
          throw new Error('the empty seat does not offer the three faces');
        await rightPanel.getByRole('option').nth(2).click();
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        if (schoolState.calls.length !== 3 || schoolState.calls[2].index !== 1)
          throw new Error(`the seat pick asked wrongly: ${JSON.stringify(schoolState.calls)}`);
        // Take that one off by its seat again.
        await waitFor(sitting());
        await sitting().click();
        await rightPanel.getByRole('button', { name: /^Take off the seat/ }).click();
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        await waitFor(schoolSeats().nth(1));
        // A hand carries a creature from the tray onto a free seat (a wide window; a phone's tray is a strip a finger holds).
        if (width >= 960) {
          const mover = page.locator(
            `section[aria-label="Creatures to send"] button[data-creature="${schoolState.would[2]}"]`,
          );
          const start = await mover.boundingBox();
          const over = await schoolSeats().first().boundingBox();
          if (start === null || over === null) throw new Error('no boxes to drag between');
          await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
          await page.mouse.down();
          await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 12, {
            steps: 4,
          });
          await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 10 });
          await page.mouse.move(over.x + over.width / 2 + 2, over.y + over.height / 2 + 2, {
            steps: 3,
          });
          await page.waitForTimeout(150);
          await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 3 });
          await shot('school-drag');
          await page.mouse.up();
          await waitFor(sitting());
          const last = schoolState.calls.at(-1);
          if (last.creatureId !== schoolState.would[2])
            throw new Error(`the drop seated another creature: ${JSON.stringify(last)}`);
          await sitting().click();
          await rightPanel.getByRole('button', { name: /^Take off the seat/ }).click();
          await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        }
        // A refusal is the game's shared alert in words.
        schoolState.refuse = 'would_not_learn';
        await schoolSeats().first().click();
        await waitFor(rightPanel.getByRole('option').first());
        await rightPanel.getByRole('option').first().click();
        await waitFor(page.getByText('That creature would not learn this lesson.'));
        await shot('school-refusal');
        await backToValley();
      } finally {
        schoolOff();
      }
    },
  );

  await scenario(
    'the School with the teacher announced (V-SCH-11): the bell and the lectern at the door, the days, a seat can already be used',
    () => {
      schoolOn('announced', (ids) => ids.slice(0, 2));
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('school').evaluate((el) => el.click());
        await waitFor(heading('School'));
        await schoolCanvasChecks();
        await shot('school-announced');
        await sceneTarget('The lectern').click();
        await waitFor(rightPanel.getByText(/A visiting teacher comes \w+ to \w+\./));
        noCountdown(await rightPanel.innerText(), 'the announced School');
        await waitFor(rightPanel.getByRole('button', { name: /^Send / }));
        await page.waitForTimeout(300);
        await shot('school-announced-teacher');
        await page.keyboard.press('Escape');
        await backToValley();
      } finally {
        schoolOff();
      }
    },
  );

  await scenario(
    'the School when none of yours would learn it ("none of yours this time" in words), and with no teacher (the empty yard and the ceremony at the house)',
    () => {
      schoolOn('here', () => []);
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('school').evaluate((el) => el.click());
        await waitFor(heading('School'));
        await schoolCanvasChecks();
        await sceneTarget('The lectern').click();
        await waitFor(rightPanel.getByText('None of yours this time.'));
        if ((await rightPanel.getByRole('button', { name: /^Send / }).count()) > 0)
          throw new Error('a Send with nobody to send');
        await shot('school-none-of-yours');
        await page.keyboard.press('Escape');
        await backToValley();
        schoolState.phase = 'away';
        // The place is read again each time it is opened.
        await place('school').evaluate((el) => el.click());
        await waitFor(heading('School'));
        await schoolCanvasChecks();
        await waitFor(sceneTarget('The graduation stage'));
        if ((await page.locator('button.cv-target[aria-label^="The lectern"]').count()) > 0)
          throw new Error('the lectern stands with no teacher');
        if ((await schoolSeats().count()) > 0) throw new Error('a seat to use with no teacher');
        await shot('school-away');
        await sceneTarget('The graduation stage').click();
        await waitFor(rightPanel.getByText('No teacher at the School right now.'));
        await waitFor(rightPanel.getByText('2 ready to graduate', { exact: true }));
        await waitFor(rightPanel.getByText(/The next ceremony is (today|this evening|tomorrow)/));
        noCountdown(await rightPanel.innerText(), 'the School without a teacher');
        await page.waitForTimeout(300);
        await shot('school-graduation');
        await page.keyboard.press('Escape');
        await backToValley();
      } finally {
        schoolOff();
      }
    },
  );

  await scenario(
    'the School while its project is built (V-COM-6): the builders corner stands apart, the table opens the board, the helper spot picks a helper, and the yard keeps its seats',
    () => {
      const creatures = schoolOn('here', (ids) => ids.slice(0, 3), {});
      commonsScene({
        school: {
          level: 1,
          state: 'open',
          size: 600,
          have: { acorns: 60, scrap: 100, shards: 4 },
          given: 0,
        },
      });
      stateOverride = {
        creatures,
        balances: { ...baseState.balances, bait: 1000 },
        valley: valleyBlock(),
      };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('school').evaluate((el) => el.click());
        await waitFor(heading('School'));
        await schoolCanvasChecks();
        const table = sceneTarget("The builders' table");
        await waitFor(table);
        await expectTopmost(table, 'the builders table target');
        await waitFor(page.locator('button.cv-target.cv-slot[aria-label^="The helper spot"]'));
        await expectTopmost(sceneTarget('The helper spot'), 'the helper spot');
        await expectTopmost(sceneTarget('The lectern'), 'the lectern');
        if ((await schoolSeats().count()) !== 2) throw new Error('the corner took a seat away');
        const plates = page.locator('.cv-plate .nameplate');
        for (let i = 0; i < (await plates.count()); i += 1)
          await expectTopmost(plates.nth(i), `plate ${String(i)} at the School`);
        await expectNoScroll();
        await page.waitForTimeout(300);
        await shot('school-corner');
        // The table opens the project board in the left drawer (a page on a phone), the give flow a step of it.
        await table.click();
        await waitFor(leftPanel.getByRole('button', { name: /^Give/ }));
        await page.waitForTimeout(300);
        await shot('school-board');
        await page.keyboard.press('Escape');
        await leftPanel.waitFor({ state: 'detached', timeout: 10000 });
        // The helper spot picks who helps build, in the right drawer; the pick is the commons' post to the School.
        await sceneTarget('The helper spot').click();
        await waitFor(rightPanel.getByRole('option').first());
        await waitFor(rightPanel.getByText(/Who helps build the School/));
        await page.waitForTimeout(300);
        await shot('school-helper');
        await rightPanel
          .getByRole('option')
          .filter({ hasText: /Sproutle/ })
          .first()
          .click();
        await rightPanel.waitFor({ state: 'detached', timeout: 10000 });
        if (!commonsCalls.some(([k, b]) => k === 'communal' && b.place === 'school'))
          throw new Error('no post to the School');
        await waitFor(
          page.locator('button.cv-target[aria-label*="at the builders\' table. Change"]'),
        );
        if ((await page.locator('.fi-hammer').count()) !== 1)
          throw new Error('the helper does not hammer at the table');
        await shot('school-helper-posted');
        await backToValley();
      } finally {
        schoolOff();
      }
    },
  );

  await scenario(
    'a creature’s next trial on its card (V-TRIAL-3): pips for its ticked boxes, the list a tap away, and an honour as a title, a badge and a ribbon (V-TRIAL-1)',
    () => {
      const creatures = commonsOn();
      schoolReset();
      trialsState.on = true;
      trialsState.byId = { [creatures[0].id]: TWO_OF_FOUR, [creatures[1].id]: BRONZE_HONOUR };
      stateOverride = { creatures, valley: valleyBlock() };
    },
    async () => {
      try {
        await waitFor(page.locator(VALLEY), 'attached');
        await place('paddock').evaluate((el) => el.click());
        await waitFor(heading('Paddock'));
        // The Creatures page is the Paddock's left drawer.
        await creaturesButton().click();
        await waitFor(leftPanel.locator('li.creature-card'));
        const pips = page.locator('button.trial-pips');
        await waitFor(pips);
        const labels = await pips.evaluateAll((els) =>
          els.map((el) => el.getAttribute('aria-label')),
        );
        if (!labels.includes('Bronze trial, 2 / 4 boxes ticked'))
          throw new Error(`the pips are not named: ${labels.join(' | ')}`);
        if (!labels.some((l) => /^Silver trial/.test(l ?? '')))
          throw new Error('the creature with Bronze shows no Silver trial next');
        // Only the next trial shows on the card.
        const cards = await page.locator('li.creature-card').first().innerText();
        if (/Gold/.test(cards)) throw new Error('a later trial shows on the card');
        await pips.first().scrollIntoViewIfNeeded();
        await expectTopmost(pips.first(), 'the trial pips');
        await shot('trial-pips-card');
        // The list is a tap away, in the one popover, and nothing opens it but a tap.
        await pips.first().click();
        const list = page.locator('ul.trial-list');
        await waitFor(list);
        const rows = await list.locator('li').count();
        if (rows < 3) throw new Error('the trial list has too few rows');
        await waitFor(page.getByText('A moment at the bonfire'));
        await expectTopmost(page.getByRole('dialog').first(), 'the trial popover');
        await shot('trial-list');
        await page.keyboard.press('Escape');
        // An honour: the title, a badge, a ribbon on the sprite.
        const honoured = page.locator('li.creature-card', { hasText: /, Bronze/ });
        await waitFor(honoured);
        await honoured.first().scrollIntoViewIfNeeded();
        if ((await honoured.first().locator('.honour-ribbon').count()) !== 1)
          throw new Error('an honour shows no ribbon on the sprite');
        await shot('trial-honour-card');
        await backToValley();
      } finally {
        schoolOff();
      }
    },
  );

  await scenario(
    'a graduation told in the paper (V-TRIAL-4): "graduated at the School", with the teacher’s and the lesson’s lines in the same paper',
    () => {
      const config = ROUTES.get('/api/config');
      answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
      const creatures = baseState.creatures.map((c) => ({ ...c, busy: null, away: false }));
      scouts.seats = [];
      scouts.owned = [];
      scouts.ids = creatures.map((c) => c.id);
      gazetteCalls.length = 0;
      const [a, b, c] = creatures;
      schoolReset();
      trialsState.on = true;
      trialsState.byId = { [a.id]: BRONZE_HONOUR };
      gazette.paper = {
        id: '1799760000888',
        at: 1799760000000,
        awayHours: 30,
        headlines: [
          headline('graduation', 80, 3, { creatureIds: [a.id, b.id, c.id], step: 1 }),
          headline('teacher', 45, 0, { talent: 'first-pounce' }),
          headline('lesson', 35, 1, { creatureIds: [b.id], talent: 'first-pounce' }),
        ],
        more: 0,
        brought: { acorns: 0, scrap: 0, shards: 0 },
        decision: null,
      };
      stateOverride = { creatures, valley: valleyBlock() };
      answerOverride.set('/api/valley/gazette/close', (request) => {
        gazetteCalls.push(['close', bodyOf(request)]);
        gazette.paper = null;
        stateOverride = { ...stateOverride, valley: valleyBlock() };
        return { closed: true };
      });
    },
    async () => {
      try {
        const paper = page.locator('article[aria-label="The Valley Gazette"]');
        await waitFor(paper);
        await waitFor(page.locator('h3.gz-headline'));
        await page.waitForTimeout(800);
        const heads = await page.locator('.gz-headline, .gz-brief-headline').allInnerTexts();
        if (!heads.some((h) => /^THREE OF YOURS GRADUATED AT THE SCHOOL$/i.test(h.trim())))
          throw new Error(`the paper does not tell the graduation: ${heads.join(' | ')}`);
        if (!heads.some((h) => /A TEACHER VISITS THE SCHOOL: FIRST POUNCE/i.test(h)))
          throw new Error(`the paper does not name the teacher’s talent: ${heads.join(' | ')}`);
        await expectTopmost(page.locator('h3.gz-headline').first(), 'the graduation headline');
        await shot('school-paper-graduation');
        const closer = page.getByRole('button', { name: /more things?|Into the valley/i }).last();
        await closer.scrollIntoViewIfNeeded();
        await closer.click();
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        await page.locator('.gz-fly').waitFor({ state: 'detached', timeout: 15000 });
      } finally {
        gazette.paper = null;
        schoolOff();
      }
    },
  );

  // The House as a canvas (housing on): the house is the scene, no ring in it, a drawer opens and closes, a room fills the stage.
  await scenario(
    'the House with housing on is a canvas: no focus ring in the scene, a drawer opens and closes, a room fills the stage',
    () => {
      const samples = houseSamples;
      answerOverride.set('/api/config', () => ({ ...ROUTES.get('/api/config')(), housing: true }));
      answerOverride.set('/api/house', () => ({ house: samples.house, own: samples.own }));
      answerOverride.set('/api/houses', () => samples.list);
      answerOverride.set('/api/house/catalogue', () => samples.catalogue);
    },
    async () => {
      await waitFor(page.locator(VALLEY), 'attached');
      await place('house').evaluate((el) => el.click());
      await waitFor(page.locator('.hc-root .house-scene[data-canvas]'));
      await page.waitForTimeout(400);
      await expectNoScroll();
      // The house is the scene: no rows, no outside picture.
      if ((await page.locator('.hc-root .vy-row, .vy-house').count()) > 0)
        throw new Error('the House still has its rows');
      // No focus ring: the keyboard sees the gold arrow on a room, a mouse click leaves nothing.
      const room = page.locator('.house-scene button.house-room').locator('visible=true');
      await expectFocusCue(room.first(), 'a room of the house');
      await expectFocusCue(page.locator('.hc-tools button.hc-tool').first(), 'a collection button');
      // A drawer opens from a corner button and closes with its X (a phone: its Back); the house does not move.
      const before = await page.locator('.house-plane').first().boundingBox();
      await page.locator('.hc-tools button.hc-tool[aria-label^="Build"]').click();
      await waitFor(leftPanel);
      if (width >= 960) {
        const during = await page.locator('.house-plane').first().boundingBox();
        if (before === null || during === null || Math.abs(during.x - before.x) > 1)
          throw new Error('a corner button moved the house');
      }
      await shot('house-build-drawer');
      await drawer.locator('button.side-panel-close, button.drill-back').first().click();
      await leftPanel.first().waitFor({ state: 'detached', timeout: 10000 });
      // A room fills the stage at a whole scale; its looks are the strip under it.
      await room.first().click();
      await waitFor(page.locator('.hc-root .house-focus[data-canvas]'));
      await page.waitForTimeout(300);
      const box = await page.locator('.house-focus').first().boundingBox();
      const stage = await page.locator('.house-focus .house-stage').first().boundingBox();
      if (box === null || stage === null) throw new Error('no room on screen');
      if (stage.width < box.width * 0.6 && stage.height < box.height * 0.6)
        throw new Error(
          `the room does not fill the stage: ${String(stage.width)}x${String(stage.height)} in ${String(box.width)}x${String(box.height)}`,
        );
      if ((await page.locator('.hc-stage .house-chips').count()) > 0)
        throw new Error('the look chips are inside the stage');
      await waitFor(page.locator('.pc-below .house-chips'));
      await expectNoScroll();
      await shot('house-room');
    },
  );

  // --- The Fairground as a canvas (Misa's pick A, stalls, 2026-11-20): the games API answers per state ---------------------
  // The four states of a show day come from the captured games fixtures (never edited): entries open, locked (stands filling), the
  // show live, and after it (results). The fixtures name their own creatures; the scenario's five are put in their place when read.
  const FAIR_IDS = [1, 2, 3, 4, 5].map((n) => `00000000-0000-4000-8500-0000000000a${String(n)}`);
  const fairState = { base: 'games-entries', entries: null, wednesday: false, puts: [] };
  const fairView = () => {
    const text = JSON.stringify(fixture(fairState.base)).replace(
      /00000000-0000-4000-8600-00000000000([1-5])/g,
      (_, n) => FAIR_IDS[Number(n) - 1],
    );
    const view = JSON.parse(text);
    if (fairState.entries !== null) view.next.entries = { ...fairState.entries };
    if (fairState.wednesday) {
      view.stall = {
        ...view.stall,
        open: true,
        opensAt: view.serverNow - 3600000,
        closesAt: view.serverNow + 86400000,
      };
      view.you = { ...view.you, pocket: 12 };
    }
    return view;
  };
  const fairScenario = (name, base, setup, run) =>
    scenario(
      name,
      () => {
        const config = ROUTES.get('/api/config');
        answerOverride.set('/api/config', () => ({ ...config(), valleySystems: true }));
        const creatures = FAIR_IDS.map((id, i) => ({
          ...baseState.creatures[i % baseState.creatures.length],
          id,
          nickname: ['Splash', 'Toast', 'Sprout', 'Pip', 'Mossy'][i],
          busy: null,
          away: false,
        }));
        scouts.seats = [];
        scouts.owned = [];
        scouts.ids = creatures.map((c) => c.id);
        // The game's clock is the state's: it is the games fixture's, so "now" is where that day's fixture says.
        stateOverride = { creatures, valley: valleyBlock(), serverNow: fixture(base).serverNow };
        fairState.base = base;
        fairState.entries = null;
        fairState.wednesday = false;
        fairState.puts = [];
        setup();
        answerOverride.set('/api/games', fairView);
        answerOverride.set('/api/games/entry', (request) => {
          const body = request.postDataJSON();
          const view = fairView();
          if (!view.next.open) return { refuse: 409, error: 'entries_closed' };
          const entries = { ...view.next.entries };
          const elsewhere = Object.entries(entries).some(
            ([event, ids]) =>
              event !== body.eventId && body.creatureIds.some((id) => ids.includes(id)),
          );
          if (elsewhere) return { refuse: 409, error: 'already_entered' };
          entries[body.eventId] = body.creatureIds;
          if (body.creatureIds.length === 0) delete entries[body.eventId];
          fairState.entries = entries;
          fairState.puts.push(body);
          return { next: { ...view.next, entries } };
        });
      },
      run,
    );
  const fairStall = (name) => sceneTarget(name);
  const fairIn = (eventId) => page.locator(`.fg-stall[data-event="${eventId}"] .vy-creature`);
  const fairCount = (eventId, n) =>
    page.waitForFunction(
      ([id, want]) =>
        document.querySelectorAll(`.fg-stall[data-event="${id}"] .vy-creature`).length === want,
      [eventId, n],
    );
  const openFair = async () => {
    await waitFor(page.locator(VALLEY), 'attached');
    await place('fair').evaluate((el) => el.click());
    await waitFor(heading('Fairground'));
    await page.waitForTimeout(600);
  };
  /** Closes whatever drawer (or phone page) is open. */
  const closeDrawers = async () => {
    while ((await drawer.count()) > 0) {
      await drawer.first().locator('button.side-panel-close, button.drill-back').first().click();
      await page.waitForTimeout(150);
    }
  };
  const dragFromTray = async (creatureId, to) => {
    const from = await page
      .locator(`.fg-root section.vy-tray button[data-creature="${creatureId}"]`)
      .boundingBox();
    const target = await to.boundingBox();
    if (from === null || target === null) throw new Error('no boxes to drag');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, {
      steps: 4,
    });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.mouse.up();
  };
  /** The frame never scrolls and every thing you can tap has a plate. */
  const fairChecks = async () => {
    await expectNoScroll();
    if ((await page.locator('.vy-in-fairground button.cv-target:not(:has(.cv-plate))').count()) > 0)
      throw new Error('a clickable thing in the Fairground has no plate');
    if ((await page.locator('.fg-root .vy-page, .fg-root .vy-act').count()) > 0)
      throw new Error('the Fairground has a page or a pinned action under its scene');
  };

  await fairScenario(
    'the Fairground with entries open: a stall, a slot and the picker, a drag from the tray, the plates',
    'games-entries',
    () => {},
    async () => {
      await openFair();
      await waitFor(page.locator('.vy-in-fairground'), 'attached');
      await fairChecks();
      if ((await page.locator('.vy-hatch.fg-tool').count()) !== 2)
        throw new Error('the Fairground does not have its two corner buttons');
      const stalls = page.locator('.vy-in-fairground button.cv-target[data-seat^="stall:"]');
      if ((await stalls.count()) !== 3)
        throw new Error('the day has three events, not three stalls');
      // Plates never cover each other.
      const plates = await page
        .locator('.vy-in-fairground .cv-plate')
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect()).map((r) => [r.x, r.y, r.right, r.bottom]),
        );
      for (let i = 0; i < plates.length; i += 1)
        for (let j = i + 1; j < plates.length; j += 1) {
          const [a, b] = [plates[i], plates[j]];
          if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3])
            throw new Error(`two plates overlap: ${JSON.stringify(a)} ${JSON.stringify(b)}`);
        }
      await expectFocusCue(fairStall('Melon Run'), 'a stall');
      await page.mouse.move(2, 2);
      await shot('fair-open');
      // Tap a stall: its event in the right drawer, with its slot; the slot opens the creature list as a step, with Back.
      await expectNoFocusOnClick(fairStall('Melon Run'), 'the Melon Run stall');
      await waitFor(rightPanel);
      await waitFor(rightPanel.locator('.ge-slot'));
      await waitFor(rightPanel.getByText('A giant watermelon is rolling down the hill'));
      await page.waitForTimeout(300);
      await shot('fair-stall-drawer');
      await rightPanel.locator('button.ge-slot').first().click();
      await waitFor(rightPanel.locator('[role="option"]'));
      await waitFor(rightPanel.locator('.ps-step .drill-back'));
      await shot('fair-stall-picker');
      // Back returns to the event; the slot again, then a creature enters.
      await rightPanel.locator('.ps-step .drill-back').first().click();
      await waitFor(rightPanel.locator('button.ge-slot'));
      await rightPanel.locator('button.ge-slot').first().click();
      await rightPanel.locator('[role="option"]').first().click();
      await fairCount('melon-run', 1);
      if (fairState.puts.length !== 1 || fairState.puts[0].eventId !== 'melon-run')
        throw new Error(`the picker asked the server ${JSON.stringify(fairState.puts)}`);
      await waitFor(rightPanel.locator('.ge-slot.is-filled'));
      await shot('fair-stall-entered');
      // Clear lives in the picker step.
      await rightPanel.locator('button.ge-slot').first().click();
      await rightPanel.getByRole('button', { name: 'Clear' }).click();
      await fairCount('melon-run', 0);
      await closeDrawers();
      // A creature dragged from the tray onto a stall enters it by the same action.
      await dragFromTray(FAIR_IDS[2], fairStall('Pepper Panic'));
      await fairCount('pepper-panic', 1);
      // Dragged on to another stall, it moves (the picker's own rule).
      await dragFromTray(FAIR_IDS[2], fairStall('Melon Run'));
      await fairCount('melon-run', 1);
      await fairCount('pepper-panic', 0);
      // The three seats of the team stall fill; a fourth is refused with the line the server gives for a team that does not fit.
      await dragFromTray(FAIR_IDS[0], fairStall('Log Carry'));
      await fairCount('log-carry', 1);
      await dragFromTray(FAIR_IDS[1], fairStall('Log Carry'));
      await fairCount('log-carry', 2);
      await dragFromTray(FAIR_IDS[3], fairStall('Log Carry'));
      await fairCount('log-carry', 3);
      await shot('fair-open-entered');
      await dragFromTray(FAIR_IDS[4], fairStall('Log Carry'));
      await waitFor(page.locator('.fg-error', { hasText: 'That team does not fit the event.' }));
      await expectNoScroll();
      await shot('fair-drop-refused-full');
      if ((await fairIn('log-carry').count()) !== 3)
        throw new Error('the refused creature went in');
    },
  );

  await fairScenario(
    'the Fairground locked: the stands fill, the stalls are shut and refuse a drop',
    'games-locked',
    () => {
      fairState.entries = {
        'melon-run': [FAIR_IDS[0]],
        'log-carry': [FAIR_IDS[1], FAIR_IDS[2]],
      };
    },
    async () => {
      await openFair();
      await waitFor(page.locator('.vy-in-fairground'), 'attached');
      await fairChecks();
      await waitFor(page.locator('.cv-plate', { hasText: /Show in/ }));
      if ((await fairIn('melon-run').count()) !== 1 || (await fairIn('log-carry').count()) !== 2)
        throw new Error('the entered creatures are not at their counters');
      await page.mouse.move(2, 2);
      await shot('fair-locked');
      await dragFromTray(FAIR_IDS[3], fairStall('Pepper Panic'));
      await waitFor(page.locator('.fg-error', { hasText: 'Entries are closed for this show.' }));
      if ((await fairIn('pepper-panic').count()) !== 0)
        throw new Error('a locked stall took a creature');
      // The stall still opens, its slots plain (nothing to pick for).
      await fairStall('Melon Run').click();
      await waitFor(rightPanel.getByText('Entries are closed for this show.'));
      if ((await rightPanel.locator('button.ge-slot').count()) !== 0)
        throw new Error('a slot can be tapped after the lock');
    },
  );

  await fairScenario(
    'the Fairground with the show live: the stage takes the picture, the standings are in the left drawer',
    'games-show',
    () => {},
    async () => {
      await openFair();
      const stage = page.locator('.fg-root .fg-stage .games-show.is-stage');
      await waitFor(stage);
      if ((await page.locator('.vy-in-fairground').count()) > 0)
        throw new Error('the scene is still drawn under the live show');
      await expectNoScroll();
      // The caption and the pips sit under the stage, and no board is inline in it.
      await waitFor(stage.locator('.gs-pips'));
      if ((await stage.locator('.gs-board').count()) > 0)
        throw new Error('the standings are inline in the stage');
      await page.waitForTimeout(2000);
      await shot('fair-running');
      // The standings are in the left drawer: open on a wide window, a corner button's page on a phone.
      if (width < 960) await page.locator('button.fg-tool[aria-label^="Standings"]').click();
      await waitFor(leftPanel.locator('.fg-standings .gs-board'));
      await page.waitForTimeout(500);
      await expectNoScroll();
      if (width < 960) await shot('fair-running-standings');
    },
  );

  await fairScenario(
    'the Fairground after the show: rosettes on the tent, Last show with its replay, the Medals, the Prize Stall shuttered, the Rules',
    'games-after',
    () => {},
    async () => {
      await openFair();
      await waitFor(page.locator('.vy-in-fairground'), 'attached');
      await fairChecks();
      await shot('fair-results');
      // Prize Stall off Wednesday: shuttered, its plate says when it opens, the drawer the same.
      await waitFor(page.locator('.cv-plate', { hasText: /^Opens / }));
      await sceneTarget('The Prize Stall is shuttered').click();
      await waitFor(rightPanel.getByText(/^Opens /));
      if ((await rightPanel.getByRole('button', { name: 'Buy' }).count()) > 0)
        throw new Error('a shuttered stall offers Buy');
      await shot('fair-prize-shuttered');
      await closeDrawers();
      // The Rules board: the Games' words.
      await sceneTarget('The rules').click();
      await waitFor(rightPanel.getByText('Good fit').first());
      await waitFor(rightPanel.getByText(/Gold, silver and bronze/));
      await shot('fair-rules');
      await closeDrawers();
      // The tent: the schedule.
      await sceneTarget('The show tent').click();
      await waitFor(rightPanel.getByText('Entries close'));
      await closeDrawers();
      // Medals: the cabinet in the left drawer.
      await page.locator('button.fg-tool[aria-label^="Medals"]').click();
      await waitFor(leftPanel.locator('.gm-cabinet'));
      await shot('fair-medals');
      await closeDrawers();
      // Last show: the medals per event, the XP rows and Watch the show, which puts the replay on the stage.
      await page.locator('button.fg-tool[aria-label^="Last show"]').click();
      await waitFor(leftPanel.locator('.gr-row'));
      await waitFor(leftPanel.getByRole('button', { name: /Watch the show/ }));
      await shot('fair-last-show');
      await leftPanel.getByRole('button', { name: /Watch the show/ }).click();
      await waitFor(page.locator('.fg-stage .games-show.is-stage'));
      await page.waitForTimeout(1500);
      await expectNoScroll();
      await shot('fair-replay');
      // Back is the left drawer's foot on a wide window (the corner button lies under the drawer), the corner button on a phone.
      if (width < 960) await page.locator('button.fg-tool[aria-label="Back to the fair"]').click();
      else await leftPanel.getByRole('button', { name: 'Back to the fair' }).click();
      await waitFor(page.locator('.vy-in-fairground'), 'attached');
    },
  );

  await fairScenario(
    'the Fairground on a Wednesday: the Prize Stall is open and its offers are in the right drawer',
    'games-after',
    () => {
      fairState.wednesday = true;
    },
    async () => {
      await openFair();
      await waitFor(page.locator('.cv-plate', { hasText: /^Prize Stall$/ }));
      await sceneTarget('The Prize Stall is open').click();
      await waitFor(rightPanel.getByRole('button', { name: 'Buy' }));
      await page.waitForTimeout(300);
      await shot('fair-prize-open');
      // Back to the valley for the checks that follow (the map's last shots).
      await closeDrawers();
      await backToValley();
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
