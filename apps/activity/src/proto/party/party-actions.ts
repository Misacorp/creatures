/**
 * Everything the player can do in the party prototype, as pure steps on `PartyState`: pick a creature up,
 * put it down, tap a station (with or without a creature held), and finish what a station view started.
 * The world changes only through the shared helpers of `../world.ts` (canned outcomes, no randomness).
 */
import { content } from '@creatures/game';
import { destinationName } from '../../trip-view';
import {
  TOUR,
  claimJob,
  claimTrip,
  creatureOf,
  evolve,
  jobsReady,
  placeRaid,
  sendTrip,
  startJob,
  tripsHome,
} from '../world';
import { CAVE_TEAM_SIZE, nameOf, type PartyState, type StationId } from './party-state';
import { placesFor, stationDef, stationVerdict } from './stations';

/** Picks a creature up (or puts it down when it is the one held). */
export function pick(state: PartyState, id: string): PartyState {
  if (state.held === id) return putDown(state);
  // A station view asked the camp for a creature: the tap answers it.
  if (state.ask !== null && state.open !== null) {
    const verdict = stationVerdict(state.open, id, state);
    if (verdict.ok && state.ask === 'road') {
      return { ...state, held: id, ask: null, said: `${nameOf(state, id)} will go.` };
    }
    if (verdict.ok && state.ask === 'fair') return enterGames({ ...state, held: id });
    if (verdict.ok) return useStation({ ...state, held: id }, state.open);
    return { ...state, said: `${nameOf(state, id)} cannot: ${verdictWord(state, id)}.` };
  }
  const places = placesFor(id, state);
  return {
    ...state,
    held: id,
    moment: null,
    said: `${nameOf(state, id)} picked up. ${String(places)} ${places === 1 ? 'place' : 'places'} can take it.`,
  };
}

function verdictWord(state: PartyState, id: string): string {
  if (state.open === null) return '';
  const v = stationVerdict(state.open, id, state);
  return v.ok ? v.does : (v.word ?? 'no').toLowerCase();
}

export function putDown(state: PartyState): PartyState {
  if (state.held === null) return state;
  return { ...state, held: null, said: `${nameOf(state, state.held)} put down.` };
}

/** Closes the open station view (and whatever moment), back to the clearing. */
export function closeView(state: PartyState): PartyState {
  return { ...state, open: null, ask: null, moment: null, forgeBase: null };
}

/** A tap on a station: with a creature held, the station takes it (when it can); else its view opens. */
export function tapStation(state: PartyState, station: StationId): PartyState {
  if (state.held !== null) {
    const verdict = stationVerdict(station, state.held, state);
    if (verdict.ok) return useStation(state, station);
    if (!stationDef(station).takes) return tapStation(putDown(state), station);
    return { ...state, said: `${stationDef(station).name}: ${(verdict.word ?? '').toLowerCase()}.` };
  }
  return {
    ...state,
    open: station,
    moment: null,
    ask: null,
    chestNew: station === 'chest' ? false : state.chestNew,
    readJournal: station === 'lectern' ? true : state.readJournal,
    said: `${stationDef(station).name} open.`,
  };
}

/** The held creature goes to the station (the caller checked the verdict). */
export function useStation(state: PartyState, station: StationId): PartyState {
  const id = state.held;
  if (id === null) return state;
  const name = nameOf(state, id);
  switch (station) {
    case 'road': {
      const home = tripsHome(state.world).find((t) => t.creatureId === id);
      if (home !== undefined) return openHaul(state, id);
      return {
        ...state,
        open: 'road',
        ask: null,
        moment: null,
        road: { destination: null, length: 'medium', supply: null },
        said: `${name} at the road. Pick a place.`,
      };
    }
    case 'forge': {
      const ready = jobsReady(state.world).find((j) => j.creatureId === id);
      if (ready !== undefined) return collectCraft(state, ready.id);
      return {
        ...state,
        open: 'forge',
        ask: null,
        moment: null,
        forgeBase: null,
        said: `${name} at the free anvil. Pick a blueprint.`,
      };
    }
    case 'arena': {
      const world = placeRaid(state.world, id);
      return { ...state, world, held: null, open: 'arena', ask: null, said: `${name} placed.` };
    }
    case 'cave': {
      const caveTeam = [...state.caveTeam, id].slice(0, CAVE_TEAM_SIZE);
      return {
        ...state,
        caveTeam,
        held: null,
        open: 'cave',
        ask: caveTeam.length < CAVE_TEAM_SIZE ? state.ask : null,
        said: `${name} joins today’s run.`,
      };
    }
    case 'house':
      return {
        ...state,
        lounger: id,
        held: null,
        ask: null,
        said: `${name} lounges in the house.`,
      };
    case 'chest':
      return { ...state, open: 'chest', ask: null, chestNew: false, said: `Equip ${name}.` };
    case 'fair':
      if (state.open === 'fair' && state.fair.event !== null) return enterGames(state);
      return { ...state, open: 'fair', ask: null, said: `${name} at the fairground. Pick an event.` };
    case 'lectern':
      return state;
  }
}

/** Opens the explorer's sack: the trip is claimed and the haul lies on the grass. */
export function openHaul(state: PartyState, creatureId: string): PartyState {
  const trip = tripsHome(state.world).find((t) => t.creatureId === creatureId);
  if (trip === undefined) return state;
  return {
    ...state,
    world: claimTrip(state.world, trip.id),
    held: creatureId,
    open: null,
    moment: { kind: 'haul', creatureId },
    chestNew: true,
    said: `${nameOf(state, creatureId)} opened the sack.`,
  };
}

/** Takes the finished craft off the anvil. */
export function collectCraft(state: PartyState, jobId: string): PartyState {
  return {
    ...state,
    world: claimJob(state.world, jobId),
    held: null,
    open: 'forge',
    moment: { kind: 'crafted', jobId },
    chestNew: true,
    said: 'The craft is done and in the chest.',
  };
}

/** The road's Go: the held creature leaves on the chosen trip. */
export function goOnTrip(state: PartyState): PartyState {
  const { destination, length, supply } = state.road;
  if (state.held === null || destination === null) return state;
  const world = sendTrip(state.world, { creatureId: state.held, destination, length, supply });
  return {
    ...state,
    world,
    held: null,
    open: null,
    road: { destination: null, length: 'medium', supply: null },
    said: `${nameOf(state, state.held)} left for ${destinationName(destination)}.`,
  };
}

/** The forge's Start: the held creature crafts the chosen blueprint on the free anvil. */
export function startCraft(state: PartyState): PartyState {
  if (state.held === null || state.forgeBase === null) return state;
  const world = startJob(state.world, {
    creatureId: state.held,
    baseId: state.forgeBase,
    reach: TOUR.job.reach,
  });
  return {
    ...state,
    world,
    held: null,
    forgeBase: null,
    moment: null,
    said: `${nameOf(state, state.held)} started a craft.`,
  };
}

/** Evolves a creature to `to` (its main form or its other branch); the flash plays first (`moment`). */
export function evolveTo(state: PartyState, creatureId: string, to: string): PartyState {
  const before = creatureOf(state.world, creatureId);
  let world = evolve(state.world, creatureId);
  if (before.evolution !== undefined && to !== before.evolution.toSpecies) {
    // The other branch: the shared helper evolves to the main form; set the branch's species instead.
    const target = content.creatures.find((c) => c.id === to);
    if (target !== undefined) {
      world = {
        ...world,
        creatures: world.creatures.map((c) =>
          c.id === creatureId
            ? { ...c, species: target.id, line: target.line, levelCap: target.levelCap }
            : c,
        ),
      };
    }
  }
  return { ...state, world, moment: { kind: 'evolved', creatureId }, said: 'Evolved!' };
}

/** Enters the held creature in the picked Games event (local only: the prototype keeps no Games entries). */
export function enterGames(state: PartyState): PartyState {
  const { event } = state.fair;
  if (state.held === null || event === null) return state;
  const current = (state.fair.entries[event] ?? []).filter((id) => id !== state.held);
  const lineup = state.world.games.next.lineup.find((e) => e.id === event);
  const size = lineup?.team ?? 1;
  const entries = { ...state.fair.entries, [event]: [...current, state.held].slice(-size) };
  return {
    ...state,
    held: null,
    ask: null,
    fair: { ...state.fair, entries },
    said: `${nameOf(state, state.held)} entered ${lineup?.name ?? 'the event'}.`,
  };
}
