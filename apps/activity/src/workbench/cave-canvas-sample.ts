/**
 * The Cave canvas on fixture data (the workbench page `CaveCanvas` and its tests): every state of the daily dungeon as a place, built
 * from the dungeon's own samples (the map, the run states, the Undercroft, a summary) and a real combat v2 room played by the engine.
 * Nothing is written by hand that the server would send: only the choice of moment.
 */
import type { Creature } from '../api';
import type { CaveView } from '../cave-canvas/hold';
import type { LeftPanel, RightPanel } from '../cave-canvas/taps';
import { SAMPLE_MAP, sampleState as mapSampleState } from '../dungeon-map-sample';
import {
  sampleCampCreatures,
  sampleStateCamp,
  sampleSummary,
  sampleToday,
} from '../dungeon-path-samples';
import { roomInput } from '../dungeon-playback';
import { undercroftState } from '../dungeon-undercroft-sample';
import type { DungeonRunState, DungeonToday } from '../dungeon-types';
import { canvasSample } from './raid-canvas-sample';
import { mapV2, sampleRoomV2 } from './dungeon-v2-sample';
import type { TeamConfigure } from '../TeamCreaturePage';

export const CAVE_STATES = [
  'before a run',
  'blocked',
  'retry',
  'picking a path',
  'mystery room',
  'a fight',
  'camp',
  'pack drawer',
  'way down',
  'undercroft',
  'result',
] as const;
export type CaveState = (typeof CAVE_STATES)[number];

export const CAVE_DEPTH = 6;
export const CAVE_NOW = 1_700_000_000_000;

export interface CaveSample {
  today: DungeonToday;
  view: CaveView;
  creatures: Creature[];
  configure: TeamConfigure;
  draft: readonly [string | null, string | null, string | null] | null;
  start?: { right?: RightPanel; left?: LeftPanel };
}

const v2 = (s: DungeonRunState): DungeonRunState => ({
  ...s,
  rules: 2 as const,
  map: mapV2(s.map, CAVE_DEPTH),
  undercroft:
    s.undercroft == null
      ? s.undercroft
      : { ...s.undercroft, maps: s.undercroft.maps.map((m) => mapV2(m, CAVE_DEPTH)) },
});

/** The pending mystery room of a run, as the server sends it. */
function eventRun(): DungeonRunState {
  const base = v2(mapSampleState('midway') as DungeonRunState);
  return {
    ...base,
    pending: {
      kind: 'event',
      event: {
        id: 'whispering-well',
        name: 'Whispering Well',
        text: 'A well hums in the dark. Something at the bottom answers when you speak.',
        options: [
          { label: 'Drink', description: 'Your team recovers 20% HP.' },
          { label: 'Toss a coin', description: 'Lose 1 Bait. A keepsake or nothing, 50/50.' },
        ],
      },
    },
  };
}

/**
 * Your creatures for the reaction-partner presets: the first place on the mouth is Sproutle (a Guard that marks nothing), the second
 * Mossback (a Grove Setter), and in the tray Cindle (an Ember Payoff with Leave a Trail: it cashes Grove and Mire and sets Ember),
 * Pyrelynx (an Ember Payoff) and Coralynx (a Tide Payoff that cashes Cindle's Ember). So a touched creature has partners on the mouth and
 * in the tray.
 */
export const PARTNER_SPECIES = [
  'sproutle',
  'mossback',
  'cindle',
  'pyrelynx',
  'coralynx',
  'thornbuck',
];

export function withPartnerKits(owned: readonly Creature[]): Creature[] {
  return owned.map((c, i) => {
    const species = PARTNER_SPECIES[i];
    return species === undefined
      ? c
      : { ...c, species, ...(species === 'cindle' ? { knack: 'leave-a-trail' } : {}) };
  });
}

export function caveSample(state: CaveState, partners = false): CaveSample {
  const roster = canvasSample('placing');
  const owned = partners ? withPartnerKits(sampleCampCreatures(6)) : sampleCampCreatures(6);
  const base = sampleToday({
    rules: 2,
    depth: CAVE_DEPTH,
    canRun: true,
    blocked: null,
    streak: 3,
    attemptsToday: 0,
    attemptsAllowed: 1,
    last: null,
    active: null,
    map: mapV2(SAMPLE_MAP, CAVE_DEPTH),
    draftTeam: [owned[0]?.id ?? null, owned[1]?.id ?? null, owned[2]?.id ?? null],
  });
  const common = { creatures: owned, configure: roster.configure };
  const open = (run: DungeonRunState): DungeonToday => ({ ...base, active: run, canRun: false });
  switch (state) {
    case 'before a run':
      return {
        ...common,
        today: base,
        view: { kind: 'setup' },
        draft: [owned[0]?.id ?? null, owned[1]?.id ?? null, null],
      };
    case 'blocked':
      return {
        ...common,
        today: { ...base, canRun: false, blocked: 'already_run' },
        view: { kind: 'setup' },
        draft: null,
      };
    case 'retry': {
      const last = sampleSummary('defeat');
      return {
        ...common,
        today: { ...base, attemptsToday: 1, attemptsAllowed: 2, last },
        view: { kind: 'setup' },
        draft: null,
      };
    }
    case 'picking a path': {
      const run = v2(mapSampleState('midway') as DungeonRunState);
      return {
        ...common,
        today: open(run),
        view: { kind: 'run', state: run },
        draft: null,
        start: { right: { kind: 'room', id: 'f2l1' } },
      };
    }
    case 'mystery room': {
      const run = eventRun();
      return { ...common, today: open(run), view: { kind: 'run', state: run }, draft: null };
    }
    case 'a fight': {
      const before = v2(mapSampleState('midway') as DungeonRunState);
      const { room } = sampleRoomV2({
        foe: 'puddle-imp',
        depth: CAVE_DEPTH,
        level: 14,
        seed: 'cave-canvas',
        node: 'f2l1',
        carried: [1, 1, 1],
      });
      const after: DungeonRunState = {
        ...before,
        step: before.step + 1,
        at: 'f2l1',
        pack: { ...before.pack, bait: before.pack.bait + 4 },
        team: before.team.map((c) => ({ ...c, hp: Math.max(1, c.hp - 30) })),
      };
      return {
        ...common,
        today: open(before),
        view: {
          kind: 'fight',
          input: roomInput(before.team, room, false, before.map.floors),
          before,
          after,
          summary: null,
        },
        draft: null,
      };
    }
    case 'camp': {
      const run = v2(sampleStateCamp());
      return {
        ...common,
        today: open(run),
        view: { kind: 'run', state: run },
        draft: null,
      };
    }
    case 'pack drawer': {
      const run = v2(mapSampleState('midway') as DungeonRunState);
      return {
        ...common,
        today: open(run),
        view: { kind: 'run', state: run },
        draft: null,
        start: { left: 'pack' },
      };
    }
    case 'way down': {
      const run = { ...undercroftState('descent'), rules: 2 as const };
      return { ...common, today: open(run), view: { kind: 'run', state: run }, draft: null };
    }
    case 'undercroft': {
      const run = { ...undercroftState('keeper'), rules: 2 as const };
      return {
        ...common,
        today: open(run),
        view: { kind: 'run', state: run },
        draft: null,
        start: {},
      };
    }
    case 'result': {
      const run = sampleSummary('cleared', { rules: 2 });
      return {
        ...common,
        today: { ...base, canRun: false, blocked: 'already_run', last: run },
        view: { kind: 'results', run },
        draft: null,
      };
    }
  }
}
