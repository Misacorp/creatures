/**
 * The eight stations of the clearing and what each says about a held creature: `ok` with what it would
 * do, or not, with one word ("Away", "Busy", "Full", "Done") that the dimmed station shows. Pure.
 */
import type { Creature } from '../../api';
import {
  RAID_TEAM_SIZE,
  creatureOf,
  isFree,
  jobsReady,
  raidTeamIds,
  tripsHome,
  type ProtoWorld,
} from '../world';
import { CAVE_TEAM_SIZE, type PartyState, type StationId } from './party-state';

export interface StationDef {
  id: StationId;
  /** The one-word pixel label under its art. */
  name: string;
  /** Takes a creature at all (the Lectern does not). */
  takes: boolean;
}

/** Top-left to bottom-right on the phone (2 wide); the creature-taking ones in the top six. */
export const STATIONS: readonly StationDef[] = [
  { id: 'road', name: 'Road', takes: true },
  { id: 'forge', name: 'Forge', takes: true },
  { id: 'arena', name: 'Arena', takes: true },
  { id: 'cave', name: 'Cave', takes: true },
  { id: 'house', name: 'House', takes: true },
  { id: 'chest', name: 'Chest', takes: true },
  { id: 'lectern', name: 'Lectern', takes: false },
  { id: 'fair', name: 'Fair', takes: true },
];

export function stationDef(id: StationId): StationDef {
  const found = STATIONS.find((s) => s.id === id);
  if (found === undefined) throw new Error(`no station ${id}`);
  return found;
}

export type Verdict =
  | { ok: true; /** "send on a trip" */ does: string }
  | {
      ok: false;
      /** The one word on the dimmed station; null: it takes no creature. */ word: string | null;
    };

const no = (word: string | null): Verdict => ({ ok: false, word });
const yes = (does: string): Verdict => ({ ok: true, does });

/** Why a creature cannot take a new task: away, working, or in the raid; null when it is free. */
function busyWord(world: ProtoWorld, creature: Creature): string | null {
  if (creature.away) return 'Away';
  if (creature.busy !== null) return 'Busy';
  if (raidTeamIds(world).includes(creature.id)) return 'Raid';
  return isFree(world, creature) ? null : 'Busy';
}

/** What `station` says to the held creature `creatureId`. */
export function stationVerdict(
  station: StationId,
  creatureId: string,
  state: Pick<PartyState, 'world' | 'lounger' | 'caveTeam'>,
): Verdict {
  const { world } = state;
  const creature = creatureOf(world, creatureId);
  const busy = busyWord(world, creature);
  switch (station) {
    case 'road': {
      // The explorer home with loot: the road takes it to open the haul.
      const home = tripsHome(world).find((t) => t.creatureId === creatureId);
      if (home !== undefined) return yes('open the haul');
      if (busy !== null) return no(busy);
      if (world.slots.used >= world.slots.total) return no('Full');
      return yes('send on a trip');
    }
    case 'forge': {
      const ready = jobsReady(world).find((j) => j.creatureId === creatureId);
      if (ready !== undefined) return yes('collect the craft');
      if (busy !== null) return no(busy);
      if (world.jobSlots.used >= world.jobSlots.total) return no('Full');
      return yes('start a job');
    }
    case 'arena': {
      if (world.raid.party === null || !world.raid.you.canEdit) return no('Locked');
      const team = raidTeamIds(world);
      if (team.includes(creatureId)) return no('Placed');
      if (team.length >= RAID_TEAM_SIZE) return no('Full');
      if (busy !== null) return no(busy);
      return yes('place in the raid');
    }
    case 'cave': {
      if (!world.dungeon.canRun) return no('Done');
      if (state.caveTeam.includes(creatureId)) return no('In team');
      if (state.caveTeam.length >= CAVE_TEAM_SIZE) return no('Full');
      if (creature.away) return no('Away');
      return yes('join today’s run');
    }
    case 'house':
      if (state.lounger === creatureId) return no('Here');
      if (creature.away) return no('Away');
      return yes('lounge');
    case 'chest':
      if (creature.away) return no('Away');
      return yes('equip');
    case 'fair':
      if (!world.games.next.open) return no('Closed');
      if (creature.away) return no('Away');
      return yes('enter the Games');
    case 'lectern':
      return no(null);
  }
}

/** How many stations take the creature (for "Cindle picked up. 4 places can take it."). */
export function placesFor(
  creatureId: string,
  state: Pick<PartyState, 'world' | 'lounger' | 'caveTeam'>,
): number {
  return STATIONS.filter((s) => stationVerdict(s.id, creatureId, state).ok).length;
}
