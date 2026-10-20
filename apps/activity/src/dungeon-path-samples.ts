/**
 * Hand-written samples of the dungeon-path answers (`docs/design/dungeon-paths.md`), for tests and
 * the workbench. They are NOT captured from the server: the Worker's captured fixtures replace them
 * in the contract test once the server ships. The map follows the spec's rules (7 floors; the camp on
 * floor 3 and the floor boss on floor 6, both in lane 1; edges to a lane at most one away, never
 * crossing; every node reachable; an elite on floors 2, 4 or 5; one cache; one to three mysteries; no
 * foe twice on a floor; at least three elements), with real content ids. The fight inside `sampleRoom`
 * is the real one of `fixtures/dungeon-replay.json`, so its events are valid for the stage.
 */
import type { Creature } from './api';
import { sampleRoster } from './creature-card-sample';
import { sampleHistory } from './dungeon-map-sample';
import replayFixture from './fixtures/dungeon-replay.json';
import todayFixture from './fixtures/dungeon-today.json';
import type {
  DungeonActResponse,
  DungeonEventView,
  DungeonKeepsakeView,
  DungeonMapNode,
  DungeonNodeKind,
  DungeonMapView,
  DungeonPack,
  DungeonReplayRoom,
  DungeonRunCreature,
  DungeonRunState,
  DungeonRunSummary,
  DungeonToday,
} from './dungeon-types';
import { runItem } from './dungeon-map-sample';

const MODIFIERS = {
  flooded: { id: 'flooded', name: 'Flooded', description: 'Tide creatures hit 20% harder.' },
  scorched: { id: 'scorched', name: 'Scorched', description: 'Ember creatures hit 20% harder.' },
  overgrown: { id: 'overgrown', name: 'Overgrown', description: 'Grove creatures hit 20% harder.' },
  stormy: { id: 'stormy', name: 'Stormy', description: 'Spark creatures hit 20% harder.' },
  dark: { id: 'dark', name: 'Dark', description: 'Your creatures crit 5 points more often.' },
  thorns: {
    id: 'thorns',
    name: 'Thorns',
    description: 'The foe turns the first reaction of each round back on your team.',
  },
  brittle: {
    id: 'brittle',
    name: 'Brittle',
    description: 'The foe has 20% less HP but hits 25% harder.',
  },
  echoing: { id: 'echoing', name: 'Echoing', description: 'Guards and supports hit 50% harder.' },
} as const;

const FOES = {
  'puddle-imp': { name: 'Puddle Imp', element: 'tide', hpMax: 252 },
  'drift-wisp': { name: 'Drift Wisp', element: 'tide', hpMax: 288 },
  'ember-mite': { name: 'Ember Mite', element: 'ember', hpMax: 270 },
  'ash-sprite': { name: 'Ash Sprite', element: 'ember', hpMax: 261 },
  'bramble-hound': { name: 'Bramble Hound', element: 'grove', hpMax: 317 },
  'moss-lurker': { name: 'Moss Lurker', element: 'grove', hpMax: 300 },
  'static-bat': { name: 'Static Bat', element: 'spark', hpMax: 279 },
  'flicker-swarm': { name: 'Flicker Swarm', element: 'spark', hpMax: 306 },
} as const;

type FoeId = keyof typeof FOES;
type ModifierId = keyof typeof MODIFIERS;

function fight(
  id: string,
  next: string[],
  foe: FoeId,
  modifier: ModifierId,
  elite = false,
): DungeonMapNode {
  const floor = Number(id[1]);
  const lane = Number(id[3]);
  const f = FOES[foe];
  return {
    id,
    floor,
    lane,
    kind: elite ? 'elite' : 'fight',
    next,
    foe: {
      id: foe,
      name: f.name,
      element: f.element,
      kind: 'foe',
      // An elite's HP includes its boost (+40%).
      hpMax: elite ? Math.round(f.hpMax * 1.4) : f.hpMax,
      elite,
    },
    modifier: { ...MODIFIERS[modifier] },
  };
}

function plain(id: string, kind: 'cache' | 'camp', next: string[]): DungeonMapNode {
  return { id, floor: Number(id[1]), lane: Number(id[3]), kind, next };
}

function mystery(id: string, next: string[], event: { id: string; name: string }): DungeonMapNode {
  return { id, floor: Number(id[1]), lane: Number(id[3]), kind: 'mystery', next, event };
}

/** A whole day's map: floors 0 to 6, the camp on 3. */
export function sampleMap(): DungeonMapView {
  const boss: DungeonMapNode = {
    id: 'f6l1',
    floor: 6,
    lane: 1,
    kind: 'boss',
    next: [],
    foe: {
      id: 'drowned-warden',
      name: 'Drowned Warden',
      element: 'tide',
      kind: 'boss',
      hpMax: 640,
      elite: false,
    },
    modifier: { ...MODIFIERS.thorns },
  };
  return {
    floors: 7,
    nodes: [
      fight('f0l0', ['f1l0', 'f1l1'], 'puddle-imp', 'flooded'),
      fight('f0l1', ['f1l1'], 'ember-mite', 'dark'),
      fight('f0l2', ['f1l2'], 'moss-lurker', 'overgrown'),
      fight('f1l0', ['f2l0'], 'drift-wisp', 'brittle'),
      mystery('f1l1', ['f2l0', 'f2l1'], { id: 'glowing-pool', name: 'Glowing Pool' }),
      fight('f1l2', ['f2l2'], 'static-bat', 'stormy'),
      fight('f2l0', ['f3l1'], 'bramble-hound', 'echoing'),
      fight('f2l1', ['f3l1'], 'flicker-swarm', 'scorched', true),
      mystery('f2l2', ['f3l1'], { id: 'sleeping-beetle', name: 'Sleeping Beetle' }),
      plain('f3l1', 'camp', ['f4l0', 'f4l1', 'f4l2']),
      fight('f4l0', ['f5l0'], 'puddle-imp', 'dark'),
      plain('f4l1', 'cache', ['f5l0', 'f5l1']),
      fight('f4l2', ['f5l1'], 'ash-sprite', 'thorns', true),
      fight('f5l0', ['f6l1'], 'moss-lurker', 'flooded'),
      fight('f5l1', ['f6l1'], 'bramble-hound', 'brittle'),
      boss,
    ],
  };
}

/** The three creatures of the replay fixture, at full health, in the row's order. */
export function sampleRunCreatures(): DungeonRunCreature[] {
  return replayFixture.summary.team.map((m, i) => ({
    id: m.id,
    name: m.name,
    speciesId: m.speciesId,
    element: m.element as DungeonRunCreature['element'],
    role: m.role as DungeonRunCreature['role'],
    level: m.level,
    hp: m.hpMax,
    hpMax: m.hpMax,
    treat: i === 0,
    // The first carries a hat and a scarf (what its popover lists, locked, during the run).
    gear:
      i === 0
        ? [
            runItem('brine-hood', 'rare', 8, [{ id: 'aimed-ward', tier: 1 }]),
            runItem('patch-scarf', 'common', 5, []),
          ]
        : [],
  }));
}

export const SAMPLE_KEEPSAKES: readonly DungeonKeepsakeView[] = [
  {
    id: 'wayfarer-charm',
    name: "Wayfarer's Charm",
    description: 'Every creature gets 12% more Attack and 12% more HP.',
  },
  {
    id: 'lantern-moth',
    name: 'Lantern Moth',
    description: 'Your creatures crit 5 points more often.',
  },
  { id: 'chalk-mark', name: 'Chalk Mark', description: 'Foes have 10% less HP.' },
];

export const SAMPLE_EVENT: DungeonEventView = {
  id: 'sleeping-beetle',
  name: 'Sleeping Beetle',
  text: 'A round beetle snores on a small pile of coins. One of its legs twitches in a dream.',
  options: [
    { label: 'Take one coin', description: 'You gain 1 scrap.' },
    { label: 'Take the pile', description: '50%: 3 scrap. 50%: every creature loses 20% HP.' },
  ],
};

/** A run that has just started: standing before floor 0, the entrance fights open. */
export function sampleState(over: Partial<DungeonRunState> = {}): DungeonRunState {
  return {
    id: 'run-sample-1',
    day: '2027-01-12',
    attempt: 1,
    depth: 3,
    landmark: false,
    status: 'active',
    outcome: null,
    step: 0,
    map: sampleMap(),
    level: 0,
    undercroft: null,
    at: null,
    path: [],
    reachable: ['f0l0', 'f0l1', 'f0l2'],
    pending: null,
    team: sampleRunCreatures(),
    keepsakes: [],
    pack: { bait: 0, essence: 0, scrap: 0 },
    roomsCleared: 0,
    supply: false,
    lastEvent: null,
    ...over,
  };
}

/** Mid-run: two fights cleared, a hurt creature, a keepsake and a pack. */
export function sampleStateMid(over: Partial<DungeonRunState> = {}): DungeonRunState {
  const team = sampleRunCreatures().map((c, i) =>
    i === 0 ? { ...c, hp: Math.round(c.hpMax * 0.3) } : i === 2 ? { ...c, hp: 0 } : c,
  );
  return sampleState({
    step: 2,
    at: 'f1l2',
    path: ['f0l2', 'f1l2'],
    reachable: ['f2l2'],
    team,
    keepsakes: [SAMPLE_KEEPSAKES[1] as DungeonKeepsakeView],
    pack: { bait: 2, essence: 0, scrap: 1 },
    roomsCleared: 2,
    supply: true,
    lastEvent: {
      name: 'Glowing Pool',
      option: 'Drink',
      outcome: 'Every creature healed 25% of its max HP.',
    },
    ...over,
  });
}

/** Standing at an open mystery room. */
export function sampleStateEvent(): DungeonRunState {
  return sampleStateMid({
    at: 'f2l2',
    path: ['f0l2', 'f1l2', 'f2l2'],
    step: 3,
    reachable: [],
    pending: { kind: 'event', event: SAMPLE_EVENT },
    lastEvent: null,
  });
}

/**
 * The player's creatures at the camp: the camp's own row of three first (the same ids, species and levels,
 * so the swap picker leaves them out as the game does), then extras up to `count`. With `count` at 3 nobody
 * is left to swap in.
 */
export function sampleCampCreatures(count: number): Creature[] {
  const team = sampleStateCamp().team;
  return sampleRoster(count).map((creature, i) => {
    const member = team[i];
    return member === undefined
      ? creature
      : { ...creature, id: member.id, species: member.speciesId, level: member.level };
  });
}

/** Standing at the camp. */
export function sampleStateCamp(): DungeonRunState {
  return sampleStateMid({
    at: 'f3l1',
    path: ['f0l2', 'f1l2', 'f2l2', 'f3l1'],
    step: 4,
    reachable: [],
    pending: {
      kind: 'camp',
      restBp: 4000,
      offers: [
        SAMPLE_KEEPSAKES[0] as DungeonKeepsakeView,
        SAMPLE_KEEPSAKES[2] as DungeonKeepsakeView,
      ],
    },
    lastEvent: null,
  });
}

/** The fight a move just played: the first room of the replay fixture, as a path room. */
export function sampleRoom(over: Partial<DungeonReplayRoom> = {}): DungeonReplayRoom {
  const room = replayFixture.rooms[0] as unknown as DungeonReplayRoom;
  return { ...room, index: 0, node: 'f0l2', keepsakes: [], ...over };
}

/** The answer of a move into a fight that was cleared. */
export function sampleActFight(): DungeonActResponse {
  return {
    state: sampleStateMid({ step: 1, at: 'f0l2', path: ['f0l2'], roomsCleared: 1 }),
    room: sampleRoom(),
  };
}

export const EMPTY_PACK: DungeonPack = { bait: 0, essence: 0, scrap: 0 };

/** The summary of a finished path run, with the real rewards of the cleared fixture. */
export function sampleSummary(
  outcome: 'cleared' | 'home' | 'defeat',
  over: Partial<DungeonRunSummary> = {},
): DungeonRunSummary {
  const base = replayFixture.summary as unknown as DungeonRunSummary;
  const [first, second, boss] = base.rooms as [
    DungeonRunSummary['rooms'][number],
    DungeonRunSummary['rooms'][number],
    DungeonRunSummary['rooms'][number],
  ];
  const lost = outcome === 'defeat';
  const rooms: DungeonRunSummary['rooms'] = [
    { ...first, index: 0, elite: false, played: true, cleared: true },
    {
      ...second,
      index: 1,
      elite: true,
      played: true,
      cleared: !lost,
      foeHpEnd: lost ? 120 : 0,
    },
    ...(outcome === 'cleared'
      ? [
          { ...first, index: 2, elite: false, played: true, cleared: true },
          { ...boss, index: 3, played: true, cleared: true },
        ]
      : []),
  ];
  const paths: Record<typeof outcome, DungeonNodeKind[]> = {
    cleared: ['fight', 'mystery', 'elite', 'camp', 'cache', 'fight', 'boss'],
    home: ['fight', 'mystery', 'elite', 'camp'],
    defeat: ['fight', 'elite'],
  };
  const kinds = paths[outcome];
  return {
    ...base,
    id: 'run-sample-1',
    cleared: outcome === 'cleared',
    outcome,
    depth: 3,
    newDepth: outcome === 'cleared' ? 4 : 3,
    roomsCleared: rooms.filter((r) => r.cleared).length,
    rooms,
    path: kinds,
    pack: lost
      ? { found: { bait: 3, essence: 0, scrap: 3 }, kept: { bait: 2, essence: 0, scrap: 2 } }
      : { found: { bait: 3, essence: 1, scrap: 2 }, kept: { bait: 3, essence: 1, scrap: 2 } },
    keepsakes: [SAMPLE_KEEPSAKES[1] as DungeonKeepsakeView],
    route: sampleRoute(outcome),
    ...over,
  };
}

/** The rooms each outcome walked on `sampleMap()`: a defeat ends in the elite, home at the camp, a clear at the boss. */
const ROUTES = {
  cleared: ['f0l1', 'f1l1', 'f2l1', 'f3l1', 'f4l1', 'f5l0', 'f6l1'],
  home: ['f0l1', 'f1l1', 'f2l1', 'f3l1'],
  defeat: ['f0l1', 'f1l1', 'f2l1'],
} as const;

/** The route of a finished sample run: its map, the rooms walked and what each did. */
export function sampleRoute(
  outcome: 'cleared' | 'home' | 'defeat',
): NonNullable<DungeonRunSummary['route']> {
  const map = sampleMap();
  const path = [...ROUTES[outcome]];
  return { map, path, history: sampleHistory(map, path, { lostLast: outcome === 'defeat' }) };
}

/** Today with the map and, when asked, an open run. */
export function sampleToday(over: Partial<DungeonToday> = {}): DungeonToday {
  return {
    ...(todayFixture as unknown as DungeonToday),
    map: sampleMap(),
    active: null,
    ...over,
  };
}

/** A copy of an object without one key (for an answer from an older server that lacks a field). */
export function omitKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== key)) as Omit<T, K>;
}
