/**
 * The creature tray's rules: what each creature carries on itself, and the order of the roster. Pure: the
 * creatures and what today's pages already load (the trips and the Workshop's jobs) in, plain data out. A free
 * creature carries no mark at all (it just idles); only the exceptions get one, one shape each, so there are
 * few codes to learn (with the valley's systems on a creature without a post rests at the fire: that is its state and carries a small "z"). The raid's placement is not read here (it loads on the Raid page only); a creature in
 * this week's raid shows as free until the scenes of a later step read it.
 */
import type { Creature, Expedition } from '../api';
import { creatureName } from '../game';
import type { Job } from '../gear-types';
import { destinationName } from '../trip-view';

/** One state per creature, the most pressing first. `free` has no mark. */
export type TrayState = 'loot' | 'ready' | 'evolve' | 'resting' | 'job' | 'trip' | 'free';

export interface TrayBadge {
  state: TrayState;
  /** The destination of a trip (out or home), for its element mark. */
  destination: string | null;
  /** Everything in words, for the button's spoken name. */
  label: string;
}

/** What the tray reads besides the creatures: the trips, the jobs (null before the Workshop loaded) and the server's now. */
export interface TrayInput {
  trips: readonly Expedition[];
  jobs: readonly Job[] | null;
  now: number;
  /** The creatures the server says are resting at the Bonfire (`VALLEY_SYSTEMS` on); absent with the flag off. */
  resting?: ReadonlySet<string>;
}

export function trayBadge(c: Creature, input: TrayInput): TrayBadge {
  const name = creatureName(c);
  const say = (state: string): string => `${name}, level ${String(c.level)}. ${state}`;
  const busy = c.busy;
  if (busy?.kind === 'expedition') {
    const trip = input.trips.find((t) => t.id === busy.id);
    const where = trip === undefined ? null : trip.destination;
    if (trip !== undefined && trip.status === 'active' && trip.endsAt <= input.now) {
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
    const job = input.jobs?.find((j) => j.id === busy.id);
    return job !== undefined && (job.status === 'ready' || job.endsAt <= input.now)
      ? { state: 'ready', destination: null, label: say('Done at the forge: collect it.') }
      : { state: 'job', destination: null, label: say('Working at the forge.') };
  }
  if (c.evolution?.available === true) {
    return { state: 'evolve', destination: null, label: say('Can evolve.') };
  }
  if (input.resting?.has(c.id) === true) {
    return { state: 'resting', destination: null, label: say('Resting at the fire.') };
  }
  return { state: 'free', destination: null, label: say('Free.') };
}

const ORDER: readonly TrayState[] = ['loot', 'ready', 'evolve', 'resting', 'free', 'job', 'trip'];

/** The whole roster: needs first, then the free ones, then the busy ones; within a group the highest level first. */
export function trayFor(creatures: readonly Creature[], input: TrayInput): Creature[] {
  const rank = (c: Creature): number => ORDER.indexOf(trayBadge(c, input).state);
  return [...creatures].sort(
    (a, b) => rank(a) - rank(b) || b.level - a.level || a.id.localeCompare(b.id),
  );
}

/** Whether a creature wanders the paddock on the map: it is at home and not at work. */
export function isAtHome(c: Creature): boolean {
  return !c.away && c.busy === null;
}
