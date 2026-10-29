/**
 * The party prototype's own state on top of the shared sample world (`../world.ts`): which creature is held,
 * which station is open, the moment on screen (a haul, a craft, an evolution), the lounger and today's cave
 * team (the shared world has neither), and the camp's order. Pure: every change returns a new state.
 *
 * `partyAtStep(n)` is the fixed moment each tour step shows (the screenshots): the world as the step begins
 * (`worldAtStep`) plus what is on screen at the step's main beat (step 2: the sack open with the haul).
 */
import type { ExpeditionLength } from '../../expedition-types';
import { creatureName } from '../../game';
import {
  TOUR,
  claimJob,
  claimTrip,
  creatureOf,
  placeRaid,
  tripsHome,
  worldAtStep,
  type ProtoWorld,
} from '../world';
import { campOrder } from './camp-state';

export type StationId =
  'road' | 'forge' | 'arena' | 'cave' | 'house' | 'chest' | 'lectern' | 'fair';

/** What is on screen beyond the clearing: a short scene the player is in the middle of. */
export type Moment =
  /** The sack is open and the haul lies on the grass (step 2). */
  | { kind: 'haul'; creatureId: string }
  /** A craft just came off the anvil (step 4). */
  | { kind: 'crafted'; jobId: string }
  /** The creature stands alone, its two branches beside it (step 6). */
  | { kind: 'evolve'; creatureId: string }
  /** The flash: `to` is the species it becomes. */
  | { kind: 'evolving'; creatureId: string; to: string }
  /** Done: the new form, for a short beat. */
  | { kind: 'evolved'; creatureId: string };

/** The send-a-trip choices made on the road (destination, then length and a supply). */
export interface RoadDraft {
  destination: string | null;
  length: ExpeditionLength;
  supply: string | null;
}

/** An empty spot inside a station view that asks the camp for a creature (target first). */
export type SlotAsk = 'arena' | 'cave' | 'forge' | 'road' | 'fair' | null;

export interface PartyState {
  world: ProtoWorld;
  /** The creature in the house, on the cushion. */
  lounger: string | null;
  /** Today's cave team (up to three). */
  caveTeam: string[];
  /** The picked-up creature. */
  held: string | null;
  /** The station whose view is open (in the clearing's place). */
  open: StationId | null;
  moment: Moment | null;
  road: RoadDraft;
  /** The blueprint chosen on the free anvil. */
  forgeBase: string | null;
  /** A station view's empty spot is asking the camp for a creature. */
  ask: SlotAsk;
  /** The camp's order, fixed on arrival (a creature never moves while you look). */
  order: string[];
  /** A find went into the chest since you last looked in it. */
  chestNew: boolean;
  /** The fairground: the event picked, and who is entered in which event (local only). */
  fair: { event: string | null; entries: Record<string, string[]> };
  /** The new Journal page was read. */
  readJournal: boolean;
  /** The last thing that happened, for the live region. */
  said: string;
}

/** The cave team's size. */
export const CAVE_TEAM_SIZE = 3;

/** The lounger at the start of the morning (the living room's "You" creature is a Splashet; so is ours). */
const FIRST_LOUNGER = 'sample-0';

function base(world: ProtoWorld): PartyState {
  return {
    world,
    lounger: FIRST_LOUNGER,
    caveTeam: [],
    held: null,
    open: null,
    moment: null,
    road: { destination: null, length: 'medium', supply: null },
    forgeBase: null,
    ask: null,
    order: campOrder(world, FIRST_LOUNGER, []),
    chestNew: false,
    readJournal: false,
    fair: { event: null, entries: {} },
    said: '',
  };
}

/** The state as the tour's step `step` (1 to 7) is shown: the step's main moment. */
export function partyAtStep(step: number): PartyState {
  const start = base(worldAtStep(step));
  switch (step) {
    case 2: {
      // The sack is open: the trip is claimed, its haul on the grass, the explorer held.
      const trip = tripsHome(start.world).find((t) => t.id === TOUR.claimTripId);
      const creatureId = trip?.creatureId ?? '';
      return {
        ...start,
        world: claimTrip(start.world, TOUR.claimTripId),
        held: creatureId,
        moment: { kind: 'haul', creatureId },
        chestNew: true,
      };
    }
    case 3:
      // On the road: the explorer held, a place picked, packing.
      return {
        ...start,
        held: TOUR.send.creatureId,
        open: 'road',
        road: {
          destination: TOUR.send.destination,
          length: TOUR.send.length,
          supply: TOUR.send.supply,
        },
      };
    case 4:
      // At the forge: the Kelp Cap just came off the left anvil; the next worker is held over the free one.
      return {
        ...start,
        world: claimJob(start.world, TOUR.claimJobId),
        open: 'forge',
        held: TOUR.job.creatureId,
        forgeBase: TOUR.job.baseId,
        moment: { kind: 'crafted', jobId: TOUR.claimJobId },
        chestNew: true,
      };
    case 5: {
      // In the arena: two placed, the third on its way.
      const [first, second, third] = TOUR.raidCreatureIds;
      let world = start.world;
      for (const id of [first, second]) if (id !== undefined) world = placeRaid(world, id);
      return { ...start, world, open: 'arena', held: third ?? null };
    }
    case 6:
      return {
        ...start,
        held: TOUR.evolveId,
        moment: { kind: 'evolve', creatureId: TOUR.evolveId },
      };
    case 7:
      // The cave mouth: today's run, one in the team, the empty spots asking the camp.
      return { ...start, open: 'cave', caveTeam: [TOUR.evolveId], ask: 'cave' };
    default:
      return start;
  }
}

/** The creature's name, from the world (for the live region). */
export function nameOf(state: PartyState, id: string): string {
  return creatureName(creatureOf(state.world, id));
}
