/**
 * The tour both prototypes tell (a Saturday morning check-in), so they compare. Steps are numbered from 1
 * in the address (`prototype.html#valley?step=3`); the list below is in that order.
 *
 * What each step shows: the moment of that step. `worldAtStep(n)` (`world.ts`) is the world as the step
 * begins, with every earlier step's action applied; the step's own action is applied by the prototype
 * when the player does it (the helpers in `world.ts`, with the canned choices in `TOUR`).
 */
export interface TourStep {
  /** Stable id, also the file-name part of a screenshot. */
  id: string;
  /** What the flow sheet calls it ("Arrive"). */
  title: string;
  /** One line on what the player does. */
  about: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'arrive',
    title: 'Arrive',
    about:
      'See at a glance what needs you: a trip home, a job ready, the raid, the dungeon, an evolution.',
  },
  {
    id: 'claim-trip',
    title: 'Claim the trip',
    about: 'The explorer comes home; open the haul (gear, a blueprint, Bait).',
  },
  {
    id: 'send-trip',
    title: 'Send a trip',
    about: 'Pick a destination, pick the creature, pack a supply, go.',
  },
  {
    id: 'workshop',
    title: 'Workshop',
    about: 'Claim the finished craft, start a new job with a free creature.',
  },
  {
    id: 'raid',
    title: 'Raid placement',
    about: 'See this week’s boss and place three creatures.',
  },
  {
    id: 'evolve',
    title: 'Evolve',
    about: 'Evolve the creature that is ready: a moment of delight.',
  },
  { id: 'peek', title: 'Peek', about: 'Optional: look in on the Games or the dungeon entrance.' },
] as const;

/** The number of the last step. */
export const LAST_STEP = TOUR_STEPS.length;

/** A step number made valid: a whole number from 1 to `LAST_STEP`, else 1. */
export function clampStep(value: number): number {
  if (!Number.isInteger(value)) return 1;
  return Math.min(Math.max(value, 1), LAST_STEP);
}

/** The step with this number (1 based). */
export function stepOf(n: number): TourStep {
  const found = TOUR_STEPS[clampStep(n) - 1];
  if (found === undefined) throw new Error('the tour has no steps');
  return found;
}
