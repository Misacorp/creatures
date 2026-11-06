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
/* global console, document, getComputedStyle, setTimeout, URL, window */
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
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(make(route.request())),
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
  const long = kind === 'long absence';
  const headlines = long
    ? [
        headline('new-species', 95, 3, {
          creatureIds: [a.id],
          species: newest.species,
          newcomers: [newest.id, creatures[1].id, c.id],
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
  /** An element every smith with an order waits for (Q64's wait line); null: nobody waits for a shard. */
  waitShard: null,
};
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
      (o.blueprintId === undefined || o.blueprintId === null ? null : 'tide'),
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
      seatId:
        seat?.id ??
        anvil?.id ??
        (trades ? 'broker-1' : helps === undefined ? null : `communal-${helps[0]}`),
    };
  }),
  online: bonfire.online,
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
/** The units each part of a project of `size` needs: the shares 0.4, 0.4 and 0.2 over the parts' values 1, 0.5 and 2 (the Market's: 0.5 and 0.5, no shards). */
const needsOf = (size, id = '') =>
  id === 'market'
    ? { acorns: size * 0.5, scrap: size, shards: 0 }
    : { acorns: size * 0.4, scrap: size * 0.8, shards: size * 0.1 };
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
    market: { level: 1, state: 'waiting' },
    ...overrides,
  };
};
const commonsBlock = () => ({
  places: COMMONS_PLACES.map((id) => {
    const p = placeOf(id);
    const open = p.state === 'open';
    const need = needsOf(p.size, id);
    const progress = open
      ? ['acorns', 'scrap', 'shards'].reduce(
          (sum, part) => sum + Math.min(p.have[part], need[part]) * PART_VALUE[part],
          0,
        )
      : 0;
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
              acorns: Math.max(0, need.acorns - p.have.acorns),
              scrap: Math.max(0, need.scrap - p.have.scrap),
              shards: Math.max(0, need.shards - p.have.shards),
            },
            shardElement: COMMONS_ELEMENT[id],
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
  const own = body.element === COMMONS_ELEMENT[body.place];
  const units = part === 'shards' && !own ? Math.floor(body.amount / 3) : body.amount;
  const room = Math.max(0, Math.ceil(need[part] - p.have[part] - 1e-9));
  const taken = Math.min(units, room);
  const spent = part === 'shards' && !own ? taken * 3 : taken;
  const have = { ...p.have, [part]: p.have[part] + taken };
  const done = ['acorns', 'scrap', 'shards'].every((k) => have[k] >= need[k] - 1e-9);
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
    : { ...p, have, given: p.given + taken * PART_VALUE[part] };
  return {
    place: body.place,
    currency: part,
    spent,
    value: taken * PART_VALUE[part],
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
  // Debug line for the starter pick only; a body the page already dropped is not an error.
  if (!r.url().endsWith('/api/starter')) return;
  console.log('starter:', r.status(), (await r.text().catch(() => '')).slice(0, 300));
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
      // Not the "not open yet" line: creatures sit round the fire, each with its +N on the plate.
      if ((await page.getByText(/will burn here/).count()) > 0)
        throw new Error('the Bonfire is still "not open yet"');
      const plates = page.locator('.vy-feet-plate .nameplate-gain');
      await waitFor(plates);
      const drawn = await plates.count();
      for (let i = 0; i < drawn; i += 1)
        await expectTopmost(plates.nth(i).locator('xpath=..'), `plate ${String(i)} at the fire`);
      await page.waitForTimeout(300);
      await shot('bonfire-open');
      const more = page.getByRole('button', { name: /more: show all \d+ resting/ });
      if ((await more.count()) > 0) {
        await expectTopmost(more.first(), 'the "+N more" button');
        await more.first().click();
        await waitFor(page.getByRole('dialog'));
        const rows = await page.getByRole('dialog').locator('ul li').count();
        if (rows !== baseState.creatures.length)
          throw new Error(
            `the list shows ${String(rows)} of ${String(baseState.creatures.length)}`,
          );
        await shot('bonfire-all-resting');
        await page.keyboard.press('Escape');
      } else if (drawn !== baseState.creatures.length) {
        throw new Error(`${String(drawn)} drawn, no "+N more" for the rest`);
      }
    },
  );

  // The Signpost with the valley's systems on (phase 5 step 2): take a seat, post a scout, move it, drag one on with the fit
  // previewed, remove it; a full pack. Nothing may overlap (`expectTopmost`) at any width.
  await scenario(
    'valley systems on: the Signpost is its scouts: take a seat, post, move, drag with a preview, remove',
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
      // Today's Expeditions page is gone: no trips, no explorer to send.
      if ((await page.getByText(/Send an explorer|Send on a trip/i).count()) > 0)
        throw new Error('the Expeditions page is still drawn');
      await shot('signpost-no-seats');
      // The scene's one step, then the seat to buy (the first is free).
      const take = page.getByRole('button', { name: /^Take your first seat/ });
      await waitFor(take);
      await expectTopmost(take.first(), 'the "Take your first seat" button');
      await page.getByRole('button', { name: /A new seat/ }).click();
      await waitFor(page.getByRole('dialog'));
      await page.getByRole('button', { name: /^Buy the seat/ }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      await waitFor(page.getByRole('heading', { name: 'Seat 1' }));
      if (
        !scoutCalls.some(
          ([kind, body]) => kind === 'buy' && typeof body.idempotencyKey === 'string',
        )
      )
        throw new Error('the seat was bought without an idempotency key');
      // Post a scout from the picker.
      const slot = page.getByRole('button', { name: /^Seat 1: nobody posted/ });
      await expectTopmost(slot, 'the empty scout slot');
      await slot.click();
      await waitFor(page.getByRole('dialog', { name: /Who scouts/ }));
      await shot('signpost-picker');
      const [first, second] = baseState.creatures;
      await page
        .getByRole('option')
        .filter({ hasText: /Sproutle/ })
        .first()
        .click();
      await waitFor(page.getByRole('button', { name: /^Seat 1: Sproutle/ }));
      if (scoutCalls.at(-1)?.[1].creatureId !== second.id)
        throw new Error('the post named another creature');
      // The pack's line, and the tray calls the scout Scouting (no z on it).
      await waitFor(page.getByRole('button', { name: /^Full in / }));
      const tray = page.locator(
        `section[aria-label="Creatures to post"] button[data-creature="${second.id}"]`,
      );
      if (!/Scouting/.test((await tray.getAttribute('aria-label')) ?? ''))
        throw new Error('the tray does not say Scouting');
      if ((await tray.locator('.vy-zz').count()) > 0) throw new Error('a scout carries the z');
      // Move it: another destination, from the drawer.
      await page.getByRole('button', { name: /^Seat 1: scouting Tidepools/ }).click();
      await waitFor(page.getByRole('dialog'));
      await shot('signpost-where');
      await page.getByRole('button', { name: /^Ember Caves/ }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      await waitFor(page.getByRole('button', { name: /^Seat 1: scouting Ember Caves/ }));
      // Drag a resting creature from the tray onto the seat: the seat previews the change before the drop.
      const mover = page.locator(
        `section[aria-label="Creatures to post"] button[data-creature="${first.id}"]`,
      );
      const card = page.locator('li.sp-seat').first();
      await mover.scrollIntoViewIfNeeded();
      const at = await mover.boundingBox();
      const over = await card.boundingBox();
      if (at === null || over === null) throw new Error('no boxes to drag between');
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      await page.mouse.move(at.x + at.width / 2 + 12, at.y + at.height / 2 + 12, { steps: 4 });
      await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 10 });
      await waitFor(page.locator('.sp-preview'));
      await expectTopmost(page.locator('.sp-preview').first(), 'the fit preview');
      await shot('signpost-drag-preview');
      await page.mouse.up();
      await waitFor(page.getByRole('button', { name: /^Seat 1: Cindle/ }));
      if (scoutCalls.at(-1)?.[1].creatureId !== first.id)
        throw new Error('the drop posted another creature');
      // Remove it: back to resting.
      await page.getByRole('button', { name: /^Seat 1: Cindle/ }).click();
      await waitFor(page.getByRole('dialog', { name: /Who scouts/ }));
      await page
        .getByRole('option')
        .filter({ hasText: /Back to resting/ })
        .first()
        .click();
      await waitFor(page.getByRole('button', { name: /^Seat 1: nobody posted/ }));
      if (scoutCalls.at(-1)?.[1].creatureId !== null) throw new Error('remove did not send null');
      // No two things overlap: every seat card and the tray is the topmost thing at its box.
      for (const loc of [
        page.locator('li.sp-seat').first(),
        page.locator('.sp-page .vy-tray').first(),
      ]) {
        await loc.scrollIntoViewIfNeeded();
        await expectTopmost(loc, 'a Signpost card');
      }
      await shot('signpost-one-seat');
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
      await waitFor(page.getByText('Pack full').first());
      await waitFor(page.getByRole('heading', { name: 'Seat 2' }));
      await page
        .getByRole('button', { name: /^Pack full/ })
        .first()
        .click();
      await waitFor(page.getByRole('dialog', { name: /Pack and pace/ }));
      await page.waitForTimeout(600);
      await expectTopmost(page.getByRole('dialog').first(), 'the pack drawer');
      await shot('signpost-pack');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      await shot('signpost-two-seats');
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
      // Today's job slots are gone.
      if ((await page.getByText(/Craft supplies/).count()) > 0)
        throw new Error('the Workshop still draws supply crafts');
      await waitFor(page.getByRole('button', { name: /A new anvil/ }));
      const take = page.getByRole('button', { name: /^Take your first anvil/ });
      await waitFor(take);
      await expectTopmost(take.first(), 'the "Take your first anvil" button');
      await shot('forge-no-anvils');
      await page.getByRole('button', { name: /A new anvil/ }).click();
      await waitFor(page.getByRole('dialog'));
      await page.getByRole('button', { name: /^Buy the anvil/ }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      await waitFor(page.getByRole('heading', { name: 'Anvil 1' }));
      if (!forgeCalls.some(([k, b]) => k === 'anvil/buy' && typeof b.idempotencyKey === 'string'))
        throw new Error('the anvil was bought without an idempotency key');
      // Post a smith from the picker.
      const slot = page.getByRole('button', { name: /^Anvil 1: nobody posted/ });
      await slot.scrollIntoViewIfNeeded();
      await expectTopmost(slot, 'the empty smith slot');
      await slot.click();
      await waitFor(page.getByRole('dialog', { name: /Who smiths/ }));
      await page
        .getByRole('option')
        .filter({ hasText: /Sproutle/ })
        .first()
        .click();
      await waitFor(page.getByRole('button', { name: /^Anvil 1: Sproutle/ }));
      const [first, second] = baseState.creatures;
      const tray = page.locator(
        `section[aria-label="Creatures to post"] button[data-creature="${second.id}"]`,
      );
      if (!/Smithing/.test((await tray.getAttribute('aria-label')) ?? ''))
        throw new Error('the tray does not say Smithing');
      if ((await tray.locator('.vy-zz').count()) > 0) throw new Error('a smith carries the z');
      await waitFor(page.getByText(/Tinkering/));
      await shot('forge-one-smith-tinkering');
      // Add an order: a blueprint, one more, Reach for Rare.
      await page.getByRole('button', { name: /^Add an order/ }).click();
      await waitFor(page.getByRole('dialog', { name: /Add an order/ }));
      await page.getByRole('button', { name: /What to make: nothing chosen/ }).click();
      await page.locator('ul[aria-label="Blueprints"] button').nth(1).click();
      await page.getByRole('button', { name: /One more piece/ }).click();
      await page.getByRole('button', { name: /Reach for Rare/ }).click();
      await page.waitForTimeout(400);
      await expectTopmost(page.getByRole('dialog').first(), 'the order editor');
      await shot('forge-order-editor');
      await page.getByRole('button', { name: /^Add to the queue/ }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      const added = forgeCalls.at(-1)?.[1];
      if (added?.action !== 'add' || added.count !== 2 || added.reach !== 'rare')
        throw new Error(`the order was ${JSON.stringify(added)}`);
      await waitFor(page.locator('button.fg-order'));
      await shot('forge-one-smith-at-work');
      // Edit it, then take it off.
      await page.locator('button.fg-order').first().click();
      await waitFor(page.getByRole('dialog', { name: /Change the order/ }));
      await page.getByRole('button', { name: /One more piece/ }).click();
      await page.getByRole('button', { name: /^Save/ }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      if (forgeCalls.at(-1)?.[1].count !== 3) throw new Error('the edit did not send count 3');
      await page.locator('button.fg-order').first().click();
      await waitFor(page.getByRole('dialog', { name: /Change the order/ }));
      await page.getByRole('button', { name: /Take it off the queue/ }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      if (forgeCalls.at(-1)?.[1].action !== 'remove') throw new Error('remove was not sent');
      // A second anvil, a smith dragged on from the tray.
      await page.getByRole('button', { name: /A new anvil/ }).click();
      await waitFor(page.getByRole('dialog'));
      await page.getByRole('button', { name: /^Buy the anvil/ }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
      await waitFor(page.getByRole('heading', { name: 'Anvil 2' }));
      const mover = page.locator(
        `section[aria-label="Creatures to post"] button[data-creature="${first.id}"]`,
      );
      const card = page.locator('li.sp-seat').nth(1);
      await mover.scrollIntoViewIfNeeded();
      const start = await mover.boundingBox();
      const target = await card.boundingBox();
      const view = page.viewportSize();
      if (start === null || target === null || view === null) throw new Error('no boxes to drag');
      // A drop needs the card on screen with the tray (there is no scroll while carrying): wide pages
      // drag it; a phone, where the card is screens below the tray, posts the smith from the picker.
      const reachable = target.y + target.height / 2 < view.height && target.y > 0;
      if (reachable) {
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down();
        await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 12, {
          steps: 4,
        });
        await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
          steps: 10,
        });
        await page.mouse.up();
      } else {
        await page.getByRole('button', { name: /^Anvil 2: nobody posted/ }).click();
        await waitFor(page.getByRole('dialog', { name: /Who smiths/ }));
        await page
          .getByRole('option')
          .filter({ hasText: /Cindle/ })
          .first()
          .click();
      }
      await waitFor(page.getByRole('button', { name: /^Anvil 2: Cindle/ }));
      await shot('forge-two-anvils');
      // The bag's filter and sort, with the count against the cap.
      await waitFor(page.getByText(/Bag: \d+ \/ \d+/));
      const tools = page.getByRole('button', { name: /Filter and sort/ });
      await tools.scrollIntoViewIfNeeded();
      await tools.click();
      await page.getByRole('button', { name: 'Rare', exact: true }).first().click();
      await page.waitForTimeout(300);
      await expectTopmost(tools, 'the bag tools header');
      await shot('forge-bag-filter');
      // The trade's notice floats at the top of the screen: bring each card to the middle.
      for (const loc of [
        page.locator('li.sp-seat').first(),
        page.locator('.fg-page .vy-tray').first(),
      ]) {
        await loc.evaluate((el) => {
          el.scrollIntoView({ block: 'center' });
        });
        await expectTopmost(loc, 'a Forge card');
      }
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
        const owners = page.locator('.vy-feet-plate .nameplate-owner');
        await waitFor(owners);
        const names = (await owners.allInnerTexts()).join(',');
        if (!names.includes('Mia') || !names.includes('Tobias'))
          throw new Error(`the visitors' owners are not on their plates: ${names}`);
        await waitFor(page.locator('.vy-flame'));
        const plates = page.locator('.vy-feet-plate .nameplate');
        for (let i = 0; i < (await plates.count()); i += 1)
          await expectTopmost(plates.nth(i), `plate ${String(i)} at the fire`);
        await page.waitForTimeout(300);
        await shot('bonfire5-company');
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
        await place('signpost').evaluate((el) => el.click());
        await waitFor(heading('Signpost'));
        await waitFor(page.getByText('In the raid until Sunday'));
        await shot('bonfire5-signpost-paused');
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
        await place('forge').evaluate((el) => el.click());
        await waitFor(heading('Forge'));
        await waitFor(page.getByText('In the raid until Sunday'));
        await page.getByText('In the raid until Sunday').first().scrollIntoViewIfNeeded();
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
  const dialogOf = (name) => page.getByRole('dialog', { name });

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
        const board = page.locator('section[aria-label="Signpost project"]');
        await waitFor(board);
        // The scaffolding stands round the road as the project fills.
        await page.waitForTimeout(300);
        await shot('commons-signpost-scaffolding');
        await board.scrollIntoViewIfNeeded();
        await expectTopmost(board, 'the Signpost board');
        await shot('commons-signpost-board');
        // Give: the list, then the amount, then the one confirm.
        await board.getByRole('button', { name: /^Give/ }).click();
        await waitFor(dialogOf(/Give to the project/));
        await page.waitForTimeout(500);
        await expectTopmost(page.getByRole('dialog').first(), 'the give drawer');
        await shot('commons-give-list');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^Acorns/ })
          .click();
        await waitFor(page.getByRole('dialog').getByRole('button', { name: /^Give/ }));
        await page.waitForTimeout(300);
        await expectTopmost(page.getByRole('dialog').first(), 'the give amount');
        await shot('commons-give-amount');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /One fewer/ })
          .click();
        await page.getByRole('dialog').getByRole('button', { name: /^Give/ }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        const gift = commonsCalls.find(([k]) => k === 'gift')?.[1];
        if (
          gift === undefined ||
          gift.place !== 'signpost' ||
          gift.currency !== 'acorns' ||
          gift.amount !== 239 ||
          typeof gift.idempotencyKey !== 'string'
        )
          throw new Error(`the gift was ${JSON.stringify(gift)}`);
        await waitFor(board.getByText(/You gave/));
        // A helper on the communal seat: the shared picker, then the slot and the tray say so.
        const seat = board.getByRole('button', { name: /^Signpost: nobody helps/ });
        await seat.scrollIntoViewIfNeeded();
        await expectTopmost(seat, 'the empty helper slot');
        await seat.click();
        await waitFor(dialogOf(/Who helps build/));
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
        await waitFor(dialogOf(/Plaque, level 2/));
        await page.waitForTimeout(500);
        await expectTopmost(page.getByRole('dialog').first(), 'the plaque');
        if (
          (await page
            .getByRole('dialog')
            .getByText(/\d+%|\bAcorns\b/)
            .count()) > 0
        )
          throw new Error('the plaque shows an amount');
        await shot('commons-plaque');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        // The collection board with its five sockets.
        await board.getByRole('button', { name: /Stones of the Roads/ }).click();
        await waitFor(dialogOf(/Stones of the Roads/));
        await page.waitForTimeout(500);
        await expectTopmost(page.getByRole('dialog').first(), 'the collection board');
        if ((await page.getByRole('dialog').locator('.cm-socket').count()) !== 5)
          throw new Error('the board does not have five sockets');
        await shot('commons-collection');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
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
        const fire = page.getByRole('button', { name: /^The fire\./ });
        await waitFor(fire);
        await expectTopmost(fire, 'the fire');
        await shot('commons-forge-fire');
        const board = page.locator('section[aria-label="Forge project"]');
        await board.scrollIntoViewIfNeeded();
        await waitFor(board.getByText(/being built, 2 days left/));
        await expectTopmost(board, 'the Forge board');
        await shot('commons-forge-building');
        await fire.scrollIntoViewIfNeeded();
        await fire.click();
        await waitFor(dialogOf(/The fire/));
        await page.waitForTimeout(500);
        await expectTopmost(page.getByRole('dialog').first(), 'the fire drawer');
        await shot('commons-forge-fire-numbers');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        await hudBack().click();
        await waitFor(page.locator(VALLEY), 'attached');
        await place('paddock').evaluate((el) => el.click());
        await waitFor(heading('Paddock'));
        const paddock = page.locator('section[aria-label="Paddock project"]');
        await waitFor(paddock);
        // The scaffolding stands high round the Paddock: its project is three quarters full.
        await page.waitForTimeout(300);
        await shot('commons-paddock-scaffolding');
        // A helper at the Paddock stands at its rails (it does not wander the meadow).
        await paddock.getByRole('button', { name: /^Paddock: nobody helps/ }).click();
        await waitFor(dialogOf(/Who helps build/));
        await page
          .getByRole('option')
          .filter({ hasText: /Sproutle/ })
          .first()
          .click();
        await waitFor(paddock.getByRole('button', { name: /^Paddock: Sproutle.*helping/ }));
        await page.waitForTimeout(400);
        await shot('commons-paddock-helper');
        await paddock.scrollIntoViewIfNeeded();
        await expectTopmost(paddock, 'the Paddock board');
        await shot('commons-paddock-board');
      } finally {
        commonsOff();
      }
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
        await waitFor(page.getByText(/Hearth adds 8% to every creature/));
        const act = page.getByRole('button', { name: /^Help build the hearth/ });
        await waitFor(act);
        await expectTopmost(act, 'the hearth button');
        const plates = page.locator('.vy-feet-plate .nameplate');
        for (let i = 0; i < (await plates.count()); i += 1)
          await expectTopmost(plates.nth(i), `plate ${String(i)} at the fire`);
        await page.waitForTimeout(300);
        await shot('commons-bonfire-level3');
        await act.click();
        await waitFor(dialogOf(/^Bonfire/));
        await page.waitForTimeout(500);
        await expectTopmost(page.getByRole('dialog').first(), 'the Bonfire board');
        await shot('commons-bonfire-board');
        // The give flow is a drill-in of the same drawer: one dialog at all times.
        await page.getByRole('dialog').getByRole('button', { name: /^Give/ }).click();
        await waitFor(page.getByRole('dialog').getByRole('button', { name: /^Acorns/ }));
        if ((await page.getByRole('dialog').count()) !== 1) throw new Error('two layers are up');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^Acorns/ })
          .click();
        await page.getByRole('dialog').getByRole('button', { name: /^Give/ }).click();
        // The gift lands and the drawer is back on the board.
        await waitFor(page.getByRole('dialog').getByText(/You gave/));
        if (!commonsCalls.some(([k, b]) => k === 'gift' && b.place === 'bonfire'))
          throw new Error('no gift to the hearth');
        // A helper at the fire (the lamplighter) is a drill-in of the same drawer too.
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^Bonfire: nobody helps/ })
          .click();
        await waitFor(page.getByRole('dialog').getByRole('option').first());
        if ((await page.getByRole('dialog').count()) !== 1) throw new Error('two layers are up');
        await page
          .getByRole('dialog')
          .getByRole('option')
          .filter({ hasText: /Sproutle/ })
          .first()
          .click();
        await waitFor(page.getByRole('dialog').getByRole('button', { name: /helping/ }));
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        await page.waitForTimeout(300);
        await shot('commons-bonfire-lamplighter');
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
      commonsScene();
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
    "valley systems on: the Market's project is built with the board (Acorns and scrap only)",
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
        const board = page.locator('section[aria-label="Market project"]');
        await waitFor(board);
        await page.waitForTimeout(300);
        await shot('market-building');
        await board.scrollIntoViewIfNeeded();
        await expectTopmost(board, 'the Market board');
        await waitFor(board.getByText(/Still needed: .*Acorns, .*scrap/));
        if ((await board.getByText(/shards/i).count()) > 0)
          throw new Error('the Market board asks for shards');
        if ((await page.getByRole('button', { name: /^Broker/ }).count()) > 0)
          throw new Error('a broker seat stands before the Market is built');
        await board.getByRole('button', { name: /^Give/ }).click();
        await waitFor(dialogOf(/Give to the project/));
        await page.waitForTimeout(500);
        await expectTopmost(page.getByRole('dialog').first(), 'the Market give drawer');
        const rows = await page.getByRole('dialog').getByRole('button').allInnerTexts();
        if (rows.some((r) => /shard/i.test(r)))
          throw new Error(`the give list offers shards: ${rows.join(' | ')}`);
        await page.keyboard.press('Escape');
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
        const slot = page.getByRole('button', { name: /^Broker: nobody posted/ });
        await waitFor(slot);
        await slot.scrollIntoViewIfNeeded();
        await expectTopmost(slot, 'the empty broker slot');
        await shot('market-free-seat');
        for (const loc of [page.locator('.sp-seat').first(), page.locator('.vy-tray').first()]) {
          if ((await loc.count()) > 0) await expectTopmost(loc, 'a Market card');
        }
        await slot.click();
        await waitFor(dialogOf(/Who trades at the Market/));
        await page.waitForTimeout(400);
        await expectTopmost(page.getByRole('dialog').first(), 'the broker picker');
        await shot('market-broker-picker');
        await page
          .getByRole('option')
          .filter({ hasText: /Sproutle/ })
          .first()
          .click();
        await waitFor(page.getByRole('button', { name: /^Broker: Sproutle/ }));
        const posted = scoutCalls.filter(([k]) => k === 'seat').at(-1)?.[1];
        if (posted?.seatId !== 'broker-1' || typeof posted.creatureId !== 'string')
          throw new Error(`the broker was ${JSON.stringify(posted)}`);
        await waitFor(
          page.getByText(/Swaps spare shards 12 for 5, with a 10% chance of one extra/),
        );
        await page.waitForTimeout(300);
        await shot('market-broker-posted');
        // What it trades toward: a drawer of choices, one tap.
        const toward = page.getByRole('button', { name: /^Trades toward: What the orders need/ });
        await toward.scrollIntoViewIfNeeded();
        await toward.click();
        await waitFor(dialogOf(/Trade toward/));
        await page.waitForTimeout(500);
        await expectTopmost(page.getByRole('dialog').first(), 'the trade-toward drawer');
        await shot('market-trade-toward');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^Grove shards/ })
          .click();
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        const sent = commonsCalls.find(([k]) => k === 'broker')?.[1];
        if (sent?.seatId !== 'broker-1' || sent.toward !== 'grove')
          throw new Error(`the setting was ${JSON.stringify(sent)}`);
        await waitFor(page.getByRole('button', { name: /^Trades toward: Grove shards/ }));
        // Its rates and the next step.
        await page.getByRole('button', { name: /Show the rates/ }).click();
        await waitFor(dialogOf(/Rates/));
        await page.waitForTimeout(500);
        await expectTopmost(page.getByRole('dialog').first(), 'the rates drawer');
        await shot('market-rates');
        await page.keyboard.press('Escape');
        // The tray says Trading for the creature at the seat.
        await waitFor(page.getByRole('button', { name: /Sproutle.*Trading at the Market/ }));
        await backToValley();
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
        // Before: the wait line says the Market will trade once the valley builds it; there is no exchange tap at the Forge.
        const before = page.getByText(
          /Waiting for Grove shards for 3 h\. The Market will trade for them once the valley builds it\./,
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
        const board = page.locator('section[aria-label="Market project"]');
        await waitFor(board);
        await board.scrollIntoViewIfNeeded();
        await expectTopmost(board, 'the Market board');
        if ((await page.getByRole('button', { name: /Trade shards/ }).count()) > 0)
          throw new Error('the Market offers the exchange before it is built');
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
        const after = page.getByText(/Waiting for Grove shards for 3 h/);
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
        await waitFor(page.getByRole('dialog', { name: /Trade shards/ }));
        await page.waitForTimeout(500);
        const text = await page.getByRole('dialog').innerText();
        if (!/10% chance to get 2/.test(text))
          throw new Error('the exchange does not show the crit chance');
        if (!/Grove shards\s+You get/.test(text))
          throw new Error(`the exchange did not start on Grove: ${text}`);
        await expectTopmost(page.getByRole('dialog').first(), 'the exchange drawer');
        await shot('q64-market-exchange');
        await page.getByRole('button', { name: /^Trade \d/ }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
        const traded = forgeCalls.at(-1);
        if (
          traded?.[0] !== 'exchange' ||
          typeof traded[1].idempotencyKey !== 'string' ||
          traded[1].to !== 'grove'
        )
          throw new Error('the trade was sent without an idempotency key, or not for Grove');
        // The exchange is also one tap away on the Market's own page.
        const tap = page.getByRole('button', { name: /^Trade shards/ });
        await tap.scrollIntoViewIfNeeded();
        await expectTopmost(tap.first(), 'the exchange row');
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
