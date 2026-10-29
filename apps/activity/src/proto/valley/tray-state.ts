/**
 * The creature tray's rules (round 2, the hybrid; the idea is the party prototype's camp, adapted): what each
 * creature carries on itself, where it can go now, and which creatures a place's tray shows. Pure: the world in,
 * plain data out. A free creature carries no mark at all (it just idles); only the exceptions get one, one shape
 * each, so there are few codes to learn.
 */
import type { Creature } from '../../api';
import { creatureName } from '../../game';
import { destinationName } from '../../trip-view';
import { RAID_TEAM_SIZE, isFree, raidTeamIds, tripsHome, type ProtoWorld } from '../world';
import type { PlaceId } from './valley-art';

/** One state per creature, the most pressing first. `free` has no mark. */
export type TrayState = 'loot' | 'ready' | 'evolve' | 'job' | 'trip' | 'raid' | 'free';

export interface TrayBadge {
  state: TrayState;
  /** The destination of a trip (out or home), for its element mark. */
  destination: string | null;
  /** Everything in words, for the button's spoken name. */
  label: string;
}

export function trayBadge(world: ProtoWorld, c: Creature): TrayBadge {
  const name = creatureName(c);
  const say = (state: string): string => `${name}, level ${String(c.level)}. ${state}`;
  const busy = c.busy;
  if (busy?.kind === 'expedition') {
    const trip = world.trips.find((t) => t.id === busy.id);
    const where = trip === undefined ? null : trip.destination;
    if (trip !== undefined && tripsHome(world).some((t) => t.id === trip.id)) {
      return {
        state: 'loot',
        destination: where,
        label: say(`Home from ${destinationName(trip.destination)} with loot.`),
      };
    }
    return {
      state: 'trip',
      destination: where,
      label: say(where === null ? 'Away on a trip.' : `Away at ${destinationName(where)}.`),
    };
  }
  if (busy?.kind === 'job') {
    const job = world.jobs.find((j) => j.id === busy.id);
    return job?.status === 'ready'
      ? { state: 'ready', destination: null, label: say('Done at the forge: collect it.') }
      : { state: 'job', destination: null, label: say('Working at the forge.') };
  }
  if (raidTeamIds(world).includes(c.id)) {
    return { state: 'raid', destination: null, label: say("In this week's raid.") };
  }
  if (c.evolution?.available === true) {
    return { state: 'evolve', destination: null, label: say('Can evolve.') };
  }
  return { state: 'free', destination: null, label: say('Free.') };
}

/** Where a creature can go now: true, or the one word for why not. */
export type Verdict = { ok: true } | { ok: false; word: string };

const OK: Verdict = { ok: true };
const no = (word: string): Verdict => ({ ok: false, word });

/** The places a creature can be taken to now (tap it, and these light up in the valley). */
export function placesFor(world: ProtoWorld, c: Creature): Record<PlaceId, Verdict> {
  const badge = trayBadge(world, c);
  const free = isFree(world, c);
  const busyWord =
    badge.state === 'trip'
      ? 'Away'
      : badge.state === 'job' || badge.state === 'ready'
        ? 'Working'
        : badge.state === 'raid'
          ? 'In raid'
          : badge.state === 'loot'
            ? 'Home'
            : 'Busy';
  const ifFree = (v: Verdict = OK): Verdict => (free ? v : no(busyWord));
  return {
    cave: ifFree(world.dungeon.canRun ? OK : no('Done')),
    fair: ifFree(world.games.next.open ? OK : no('Closed')),
    house: badge.state === 'evolve' ? OK : ifFree(),
    paddock: OK,
    forge:
      badge.state === 'ready' || badge.state === 'job'
        ? OK
        : ifFree(world.jobSlots.used < world.jobSlots.total ? OK : no('Full')),
    arena:
      badge.state === 'raid'
        ? OK
        : ifFree(raidTeamIds(world).length < RAID_TEAM_SIZE ? OK : no('Full')),
    signpost:
      badge.state === 'loot' ? OK : ifFree(world.slots.used < world.slots.total ? OK : no('Full')),
  };
}

const ORDER: readonly TrayState[] = ['loot', 'ready', 'evolve', 'free', 'raid', 'job', 'trip'];

/**
 * The tray's creatures for where the player is: the whole roster in the valley (needs first, then the free
 * ones, then the busy ones; within a group the highest level first); inside a place only the creatures that
 * place is about (the free ones, and the ones already working, placed or waiting there).
 */
export function trayFor(world: ProtoWorld, scene: 'valley' | PlaceId): Creature[] {
  const rank = (c: Creature): number => ORDER.indexOf(trayBadge(world, c).state);
  const sorted = [...world.creatures].sort(
    (a, b) => rank(a) - rank(b) || b.level - a.level || a.id.localeCompare(b.id),
  );
  if (scene === 'valley' || scene === 'paddock') return sorted;
  const keep: Readonly<Record<PlaceId, readonly TrayState[]>> = {
    cave: ['free'],
    fair: ['free'],
    house: ['evolve', 'free'],
    paddock: ORDER,
    forge: ['ready', 'job', 'free', 'evolve'],
    arena: ['raid', 'free', 'evolve'],
    signpost: ['loot', 'free', 'evolve', 'trip'],
  };
  return sorted.filter((c) => keep[scene].includes(trayBadge(world, c).state));
}
