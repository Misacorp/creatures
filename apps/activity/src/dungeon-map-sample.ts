/**
 * A hand-written, valid 7-floor dungeon map (the rules of `docs/design/dungeon-paths.md`: floors 0, 1,
 * 2, 4 and 5 with two or three rooms, the camp at f3l1, the boss at f6l1, paths that change lane by at
 * most one and never cross) and run states on it, for the workbench page and the tests. Fixture data
 * only: never imported by the game.
 */
import type {
  DungeonMapNode,
  DungeonMapView,
  DungeonRunState,
  DungeonRunCreature,
  Element,
} from './dungeon-types';

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
    case 'finished':
      return state(['f0l1', 'f1l2', 'f2l1', 'f3l1', 'f4l1', 'f5l1', 'f6l1'], [], {
        status: 'done',
        outcome: 'cleared',
        roomsCleared: 6,
        pack: { bait: 6, essence: 1, scrap: 2 },
      });
  }
}
