/**
 * The world the return walk plays in (prototype, dev only): the shared sample world with nothing waiting
 * (no trip home, no job done), so the only bubbles are the walk's own; and the cast, the creatures the
 * story lines name.
 */
import { creatureName } from '../../game';
import { RAID_TEAM_SIZE, initialWorld, type ProtoWorld } from '../world';
import type { Bubble } from '../valley/valley-logic';
import type { CastMember, WalkPlan } from './walk-plan';

/** How many creatures of the roster the story can name (two scouts, two smiths, four that rest). */
export const CAST_SIZE = 8;

/** The sample world as a quiet morning: everyone is home and free, nothing is waiting at a place. */
export function walkWorld(): ProtoWorld {
  const world = initialWorld();
  return {
    ...world,
    trips: [],
    jobs: [],
    creatures: world.creatures.map((c) => ({ ...c, away: false, busy: null })),
  };
}

/** The creatures the lines name, in cast order (`walk-plan.ts`: scouts, smiths, then the ones that rest). */
export function castOf(world: ProtoWorld): CastMember[] {
  return world.creatures.slice(0, CAST_SIZE).map((c) => ({
    name: creatureName(c),
    species: c.species,
    shiny: c.shiny,
  }));
}

/** The world without the cast: while they walk the valley, they are not in the paddock too. */
export function withoutCast(world: ProtoWorld): ProtoWorld {
  const out = new Set(world.creatures.slice(0, CAST_SIZE).map((c) => c.id));
  return { ...world, creatures: world.creatures.filter((c) => !out.has(c.id)) };
}

/** The bubble that stays over the place where the walk's decision waits (the raid's empty slots). */
export function decisionBubbles(plan: WalkPlan): Bubble[] {
  const d = plan.decision;
  if (d === null) return [];
  return [
    {
      place: d.place,
      need: { kind: 'raid', placed: 0, needed: RAID_TEAM_SIZE },
      spoken: d.text,
      time: null,
    },
  ];
}
