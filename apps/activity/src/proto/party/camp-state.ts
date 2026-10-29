/**
 * What each creature in the camp carries on itself: one bubble over its head (the highest-priority state),
 * up to two foot marks (where else it is placed), a 4-pip timer for a job or a trip, and the sentence a
 * screen reader says. Pure (the world in, plain data out), so the rules are tested once here.
 */
import type { Creature } from '../../api';
import { creatureName } from '../../game';
import { destinationName } from '../../trip-view';
import { raidTeamIds, tripsHome, type ProtoWorld } from '../world';

/** The bubble kinds, highest priority first (spec section 3). */
export type Bubble =
  | 'loot' // home from a trip with loot
  | 'needs' // something to answer: a finished job to collect
  | 'evolve' // can evolve now
  | 'job' // working at the forge
  | 'trip' // away on a trip
  | 'free' // free: "z z"
  | 'rested'; // free and rested (the lounge cap reached)

export const BUBBLE_ORDER: readonly Bubble[] = [
  'loot',
  'needs',
  'evolve',
  'job',
  'trip',
  'free',
  'rested',
];

/** A foot mark: in the house, in the raid, in today's cave team. */
export type FootMark = 'couch' | 'blade' | 'door';

export interface CreatureBadge {
  bubble: Bubble;
  /** At most two. */
  marks: FootMark[];
  /** Time left on a job or a trip as lit pips of 4 (null when it has no timer). */
  pips: number | null;
  /** A trip's destination id (its glyph goes in the bubble). */
  destination: string | null;
  /** The whole state in words: "Sproutle, level 7. Home from Verdant Hollow with loot." */
  label: string;
}

export const TIMER_PIPS = 4;

/** Lit pips for the time left (rounded up, so a running timer always shows at least one). */
export function pipsLeft(
  startedAt: number,
  endsAt: number,
  now: number,
  count = TIMER_PIPS,
): number {
  const total = endsAt - startedAt;
  if (total <= 0 || now >= endsAt) return 0;
  const left = Math.min(total, endsAt - now);
  return Math.min(count, Math.ceil((left / total) * count));
}

/** The badge of one creature in the world (the lounger and the cave team are the party's own). */
export function creatureBadge(
  world: ProtoWorld,
  creature: Creature,
  lounger: string | null,
  caveTeam: readonly string[],
): CreatureBadge {
  const name = creatureName(creature);
  const head = `${name}, level ${String(creature.level)}.`;
  const marks: FootMark[] = [];
  if (lounger === creature.id) marks.push('couch');
  if (raidTeamIds(world).includes(creature.id)) marks.push('blade');
  if (caveTeam.includes(creature.id) && marks.length < 2) marks.push('door');
  const markWords = marks.map(
    (m) => ({ couch: 'In the house.', blade: 'In the raid.', door: 'In the cave team.' })[m],
  );
  const say = (state: string): string => [head, state, ...markWords].join(' ');

  const busy = creature.busy;
  if (busy?.kind === 'expedition') {
    const trip = world.trips.find((t) => t.id === busy.id);
    const place = trip === undefined ? null : trip.destination;
    if (trip !== undefined && tripsHome(world).some((t) => t.id === trip.id)) {
      return {
        bubble: 'loot',
        marks,
        pips: null,
        destination: place,
        label: say(`Home from ${destinationName(trip.destination)} with loot.`),
      };
    }
    return {
      bubble: 'trip',
      marks,
      pips: trip === undefined ? null : pipsLeft(trip.startedAt, trip.endsAt, world.now),
      destination: place,
      label: say(place === null ? 'Away on a trip.' : `Away at ${destinationName(place)}.`),
    };
  }
  if (busy?.kind === 'job') {
    const job = world.jobs.find((j) => j.id === busy.id);
    if (job?.status === 'ready') {
      return {
        bubble: 'needs',
        marks,
        pips: 0,
        destination: null,
        label: say('Finished at the forge: collect it.'),
      };
    }
    return {
      bubble: 'job',
      marks,
      pips: job === undefined ? null : pipsLeft(job.startedAt, job.endsAt, world.now),
      destination: null,
      label: say('Working at the forge.'),
    };
  }
  if (creature.evolution?.available === true) {
    return { bubble: 'evolve', marks, pips: null, destination: null, label: say('Can evolve.') };
  }
  if (creature.waiting) {
    return {
      bubble: 'rested',
      marks,
      pips: null,
      destination: null,
      label: say('Free. Its experience is waiting.'),
    };
  }
  return { bubble: 'free', marks, pips: null, destination: null, label: say('Free.') };
}

/** The camp's group of a bubble: needs you, free, lounging, working, away. */
function group(badge: CreatureBadge): number {
  if (badge.bubble === 'loot' || badge.bubble === 'needs' || badge.bubble === 'evolve') return 0;
  if (badge.bubble === 'job') return 3;
  if (badge.bubble === 'trip') return 4;
  return badge.marks.includes('couch') ? 2 : 1;
}

/**
 * The camp's order, worked out once on arrival: the ones that need you first, then the free ones, the
 * lounger, those working, those away; within a group the highest level first, then by id (stable).
 */
export function campOrder(
  world: ProtoWorld,
  lounger: string | null,
  caveTeam: readonly string[],
): string[] {
  return world.creatures
    .map((c) => ({ c, g: group(creatureBadge(world, c, lounger, caveTeam)) }))
    .sort((a, b) => a.g - b.g || b.c.level - a.c.level || a.c.id.localeCompare(b.c.id))
    .map(({ c }) => c.id);
}

/** The creatures in the camp's fixed order; any not in it (new arrivals) at the end. */
export function inOrder(world: ProtoWorld, order: readonly string[]): Creature[] {
  const known = order.flatMap((id) => world.creatures.filter((c) => c.id === id));
  const rest = world.creatures.filter((c) => !order.includes(c.id));
  return [...known, ...rest];
}
