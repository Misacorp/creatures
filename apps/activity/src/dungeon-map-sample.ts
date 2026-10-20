/**
 * A hand-written, valid 7-floor dungeon map (the rules of `docs/design/dungeon-paths.md`: floors 0, 1,
 * 2, 4 and 5 with two or three rooms, the camp at f3l1, the boss at f6l1, paths that change lane by at
 * most one and never cross) and run states on it, for the workbench page and the tests. Fixture data
 * only: never imported by the game.
 */
import type {
  DungeonMapNode,
  DungeonMapView,
  DungeonPack,
  DungeonRunState,
  DungeonRunCreature,
  DungeonStepLog,
  Element,
  DungeonRunGear,
} from './dungeon-types';
import type { GearRarity } from './gear-types';
import { sampleItem } from './creature-page/bag-sample';
import type { ItemLine } from '@creatures/game';

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
  echoing: {
    id: 'echoing',
    name: 'Echoing',
    description: 'Guards and supports hit 50% harder.',
  },
} as const;

type ModifierId = keyof typeof MODIFIERS;

function foe(
  id: string,
  name: string,
  element: Element,
  hpMax: number,
  opts: { elite?: boolean; boss?: boolean } = {},
): NonNullable<DungeonMapNode['foe']> {
  return {
    id,
    name,
    element,
    kind: opts.boss === true ? 'boss' : 'foe',
    hpMax,
    elite: opts.elite === true,
  };
}

function room(
  floor: number,
  lane: number,
  kind: DungeonMapNode['kind'],
  next: string[],
  extra: Pick<DungeonMapNode, 'foe' | 'event'> & { modifier?: ModifierId } = {},
): DungeonMapNode {
  const { modifier, ...rest } = extra;
  return {
    id: `f${String(floor)}l${String(lane)}`,
    floor,
    lane,
    kind,
    next,
    ...rest,
    ...(modifier === undefined ? {} : { modifier: MODIFIERS[modifier] }),
  };
}

export const SAMPLE_MAP: DungeonMapView = {
  floors: 7,
  nodes: [
    room(0, 0, 'fight', ['f1l0', 'f1l1'], {
      foe: foe('puddle-imp', 'Puddle Imp', 'tide', 310),
      modifier: 'flooded',
    }),
    room(0, 1, 'fight', ['f1l1', 'f1l2'], {
      foe: foe('ash-sprite', 'Ash Sprite', 'ember', 330),
      modifier: 'dark',
    }),
    room(0, 2, 'fight', ['f1l2'], {
      foe: foe('bramble-hound', 'Bramble Hound', 'grove', 340),
      modifier: 'overgrown',
    }),
    room(1, 0, 'fight', ['f2l0'], {
      foe: foe('static-bat', 'Static Bat', 'spark', 350),
      modifier: 'stormy',
    }),
    room(1, 1, 'mystery', ['f2l0', 'f2l1'], {
      event: { id: 'singing-well', name: 'The Singing Well' },
    }),
    room(1, 2, 'fight', ['f2l1', 'f2l2'], {
      foe: foe('ember-mite', 'Ember Mite', 'ember', 360),
      modifier: 'brittle',
    }),
    room(2, 0, 'elite', ['f3l1'], {
      foe: foe('moss-lurker', 'Moss Lurker', 'grove', 640, { elite: true }),
      modifier: 'thorns',
    }),
    room(2, 1, 'fight', ['f3l1'], {
      foe: foe('drift-wisp', 'Drift Wisp', 'tide', 380),
      modifier: 'echoing',
    }),
    room(2, 2, 'cache', ['f3l1']),
    room(3, 1, 'camp', ['f4l0', 'f4l1']),
    room(4, 0, 'fight', ['f5l0', 'f5l1'], {
      foe: foe('flicker-swarm', 'Flicker Swarm', 'spark', 410),
      modifier: 'stormy',
    }),
    room(4, 1, 'elite', ['f5l1', 'f5l2'], {
      foe: foe('static-bat', 'Static Bat', 'spark', 700, { elite: true }),
      modifier: 'dark',
    }),
    room(5, 0, 'mystery', ['f6l1'], { event: { id: 'locked-door', name: 'A Locked Door' } }),
    room(5, 1, 'fight', ['f6l1'], {
      foe: foe('puddle-imp', 'Puddle Imp', 'tide', 430),
      modifier: 'flooded',
    }),
    room(5, 2, 'fight', ['f6l1'], {
      foe: foe('ember-mite', 'Ember Mite', 'ember', 440),
      modifier: 'scorched',
    }),
    room(6, 1, 'boss', [], {
      foe: foe('coil-baron', 'Coil Baron', 'spark', 1280, { boss: true }),
      modifier: 'stormy',
    }),
  ],
};

/** An item a run's creature wears, with the game's own lines (fixture data). */
export function runItem(
  baseId: string,
  rarity: GearRarity,
  itemLevel: number,
  rolled: readonly ItemLine[],
): DungeonRunGear {
  const item = sampleItem('run', baseId, rarity, itemLevel, rolled);
  return { baseId, slot: item.slot, rarity, itemLevel, lines: item.lines.map((l) => l.text) };
}

const TEAM: DungeonRunCreature[] = [
  {
    id: 'c1',
    name: 'Pip',
    speciesId: 'splashet',
    element: 'tide',
    role: 'setter',
    level: 8,
    hp: 120,
    hpMax: 120,
    treat: false,
    gear: [
      runItem('brine-hood', 'rare', 8, [{ id: 'aimed-ward', tier: 1 }]),
      runItem('patch-scarf', 'common', 5, []),
    ],
  },
  {
    id: 'c2',
    name: 'Ember',
    speciesId: 'cindle',
    element: 'ember',
    role: 'payoff',
    level: 7,
    hp: 80,
    hpMax: 110,
    treat: false,
    gear: [],
  },
  {
    id: 'c3',
    name: 'Sprout',
    speciesId: 'sproutle',
    element: 'grove',
    role: 'guard',
    level: 9,
    hp: 140,
    hpMax: 140,
    treat: false,
    gear: [],
  },
];

/** The ways a run can stand on the sample map. */
export const SAMPLE_STAGES = [
  'preview',
  'entrance',
  'midway',
  'camp',
  'after-elite',
  'past-camp',
  'finished',
  'defeated',
  'detour-mystery',
  'detour-cache',
] as const;
export type SampleStage = (typeof SAMPLE_STAGES)[number];

function state(
  path: string[],
  reachable: string[],
  extra: Partial<DungeonRunState> = {},
): DungeonRunState {
  return {
    id: 'run-sample',
    day: '2026-10-18',
    attempt: 1,
    depth: 5,
    landmark: false,
    status: 'active',
    outcome: null,
    step: path.length,
    map: SAMPLE_MAP,
    level: 0,
    undercroft: null,
    at: path.length === 0 ? null : (path[path.length - 1] ?? null),
    path,
    reachable,
    pending: null,
    team: TEAM,
    keepsakes: [],
    pack: { bait: 0, essence: 0, scrap: 0 },
    roomsCleared: 0,
    supply: false,
    lastEvent: null,
    history: sampleHistory(SAMPLE_MAP, path, {
      pendingLast: extra.pending !== undefined && extra.pending !== null,
    }),
    ...extra,
  };
}

/** The run state of a stage on `SAMPLE_MAP`; null for the preview (no run). */
export function sampleState(stage: SampleStage): DungeonRunState | null {
  switch (stage) {
    case 'preview':
      return null;
    case 'entrance':
      return state([], ['f0l0', 'f0l1', 'f0l2']);
    case 'midway':
      return state(['f0l1', 'f1l2'], ['f2l1', 'f2l2'], {
        roomsCleared: 2,
        pack: { bait: 2, essence: 0, scrap: 0 },
      });
    case 'camp':
      return state(['f0l1', 'f1l2', 'f2l1', 'f3l1'], [], {
        roomsCleared: 3,
        pack: { bait: 3, essence: 0, scrap: 0 },
        pending: {
          kind: 'camp',
          restBp: 4000,
          offers: [
            {
              id: 'sharp-claws',
              name: 'Sharp Claws',
              description: 'All creatures hit 12% harder.',
            },
            { id: 'thick-fur', name: 'Thick Fur', description: 'All creatures have 12% more HP.' },
          ],
        },
      });
    case 'after-elite':
      return state(['f0l0', 'f1l0', 'f2l0'], ['f3l1'], {
        roomsCleared: 3,
        pack: { bait: 3, essence: 0, scrap: 1 },
        keepsakes: [
          { id: 'sharp-claws', name: 'Sharp Claws', description: 'All creatures hit 12% harder.' },
        ],
      });
    case 'past-camp':
      return state(['f0l1', 'f1l2', 'f2l1', 'f3l1'], ['f4l0', 'f4l1'], {
        roomsCleared: 3,
        pack: { bait: 3, essence: 0, scrap: 0 },
      });
    case 'defeated':
      return state(['f0l1', 'f1l2', 'f2l1'], [], {
        status: 'done',
        outcome: 'defeat',
        roomsCleared: 2,
        pack: { bait: 2, essence: 0, scrap: 0 },
        history: sampleHistory(SAMPLE_MAP, ['f0l1', 'f1l2', 'f2l1'], { lostLast: true }),
      });
    case 'detour-mystery':
      return state(['f0l1', 'f1l1', 'f2l1', 'f3l1'], ['f4l0', 'f4l1'], {
        roomsCleared: 3,
        pack: { bait: 2, essence: 0, scrap: 1 },
      });
    case 'detour-cache':
      return state(['f0l1', 'f1l2', 'f2l2', 'f3l1'], ['f4l0', 'f4l1'], {
        roomsCleared: 3,
        pack: { bait: 2, essence: 0, scrap: 1 },
      });
    case 'finished':
      return state(['f0l1', 'f1l2', 'f2l1', 'f3l1', 'f4l1', 'f5l1', 'f6l1'], [], {
        status: 'done',
        outcome: 'cleared',
        roomsCleared: 6,
        pack: { bait: 6, essence: 1, scrap: 2 },
      });
  }
}

/**
 * A plausible history for a path on a map: what each room visited did, in order (`DungeonStepLog`). Fights
 * are cleared (the last one is lost with `lostLast`), the first one earns the supply, an elite gives a
 * keepsake, a mystery room was a small pick, a cache gave loot, the camp rested; with `pendingLast` the
 * last room (a mystery room or the camp) is still waiting. Fixture data only.
 */
export function sampleHistory(
  map: DungeonMapView,
  path: readonly string[],
  opts: { lostLast?: boolean; pendingLast?: boolean } = {},
): DungeonStepLog[] {
  const none: DungeonPack = { bait: 0, essence: 0, scrap: 0 };
  const keepsake = {
    id: 'lantern-moth',
    name: 'Lantern Moth',
    description: 'Your creatures crit 5 points more often.',
  };
  const log: DungeonStepLog[] = [];
  path.forEach((id, i) => {
    const node = map.nodes.find((n) => n.id === id);
    if (node === undefined) return;
    const last = i === path.length - 1;
    switch (node.kind) {
      case 'fight':
      case 'elite':
      case 'boss': {
        const cleared = !(opts.lostLast === true && last);
        const hpMax = node.foe?.hpMax ?? 300;
        log.push({
          node: id,
          kind: node.kind,
          result: 'fight',
          cleared,
          rounds: 4 + i,
          foeHpEnd: cleared ? 0 : Math.round(hpMax * 0.3),
          foeHpMax: hpMax,
          loot: cleared
            ? {
                bait: node.kind === 'boss' ? 0 : 1,
                essence: 0,
                scrap: node.kind === 'elite' ? 1 : 0,
              }
            : none,
          ...(cleared && node.kind === 'elite' ? { keepsake } : {}),
          ...(cleared && log.every((e) => e.result !== 'fight' || !e.cleared)
            ? { supply: true }
            : {}),
        });
        break;
      }
      case 'mystery':
        log.push(
          opts.pendingLast === true && last
            ? { node: id, kind: 'mystery', result: 'pending', event: node.event?.id ?? 'unknown' }
            : {
                node: id,
                kind: 'mystery',
                result: 'event',
                event: node.event?.id ?? 'unknown',
                option: 'Take one coin',
                outcome: 'You gain 1 scrap.',
                loot: { bait: 0, essence: 0, scrap: 1 },
              },
        );
        break;
      case 'cache':
        log.push({
          node: id,
          kind: 'cache',
          result: 'cache',
          loot: { bait: 1, essence: 0, scrap: 1 },
        });
        break;
      case 'camp':
        log.push(
          opts.pendingLast === true && last
            ? { node: id, kind: 'camp', result: 'pending' }
            : {
                node: id,
                kind: 'camp',
                result: 'camp',
                choice: 'rest',
                detail: 'Rested: standing creatures recovered 40% HP.',
              },
        );
        break;
    }
  });
  return log;
}
