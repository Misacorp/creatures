/**
 * What the How to play page draws, worked out from the content and the rules so the pictures can
 * never disagree with the game: the reaction loop, example creatures, the raid week and the
 * expedition trips. Pure functions; `HowToPlayArt.tsx` draws them.
 */
import { RULES, content, type ContentPack, type CreatureSpecies, type Role } from '@creatures/game';
import { eventTitle } from './raid-time';
import type { RaidEventId } from './raid-api';

/** One arrow of the reaction loop: a mark's element, the reaction, and who cashes it in. */
export interface LoopStep {
  /** The element whose hits leave the mark. */
  from: string;
  markId: string;
  markName: string;
  reactionId: string;
  reactionName: string;
  /** The element whose hit sets the reaction off (the next node of the loop). */
  to: string;
}

/**
 * The reactions as a loop of elements, starting at Tide (or the first mark's element): each step
 * goes from an element to the element that cashes its mark in. With the shipped content it is
 * Tide, Spark, Grove, Ember and back to Tide. Stops if the content does not close into a loop.
 */
export function reactionLoop(reactions: ContentPack['reactions'] = content.reactions): LoopStep[] {
  const start = reactions.some((r) => r.markElement === 'tide')
    ? 'tide'
    : reactions[0]?.markElement;
  if (start === undefined) return [];
  const steps: LoopStep[] = [];
  let current = start;
  for (let n = 0; n < reactions.length; n++) {
    const r = reactions.find((x) => x.markElement === current);
    if (r === undefined) break;
    steps.push({
      from: current,
      markId: r.markId,
      markName: r.markName,
      reactionId: r.id,
      reactionName: r.name,
      to: r.triggerElement,
    });
    current = r.triggerElement;
    if (current === start) break;
  }
  return steps;
}

/** The species that shows a role: the first catchable stage-1 species of that role in the content. */
export function exampleSpecies(
  role: Role,
  creatures: readonly CreatureSpecies[] = content.creatures,
): CreatureSpecies | undefined {
  return creatures.find((c) => c.role === role && c.stage === 1 && !c.festival);
}

/** The starters a new player picks from. */
export function starterSpecies(
  creatures: readonly CreatureSpecies[] = content.creatures,
): CreatureSpecies[] {
  return creatures.filter((c) => c.starter);
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface WeekStep {
  event: RaidEventId;
  title: string;
  /** "Mon", "Fri", "Sat" or "Sun". */
  day: string;
}

/** The four steps of the raid week with their weekdays, from `RULES.raid.schedule`. */
export function weekStrip(
  schedule: Readonly<Record<RaidEventId, { readonly weekday: number }>> = RULES.raid.schedule,
): WeekStep[] {
  const events: RaidEventId[] = ['weekStart', 'phase1', 'phase2', 'finale'];
  return events.map((event) => ({
    event,
    title: eventTitle(event),
    day: DAYS[schedule[event].weekday - 1] ?? '',
  }));
}

export interface Trip {
  hours: number;
  catches: number;
}

/** The expedition trips: hours away and catch rolls, from the rules. */
export function expeditionTrips(
  durations: typeof RULES.expedition.durations = RULES.expedition.durations,
): Trip[] {
  return Object.values(durations).map((d) => ({ hours: d.ms / 3_600_000, catches: d.rolls }));
}

/** A creature that evolves, for the Rewards picture: both forms and the Essence it costs. */
export function evolutionExample(
  creatures: readonly CreatureSpecies[] = content.creatures,
): { from: string; to: string; essence: number } | undefined {
  const source = creatures.find((c) => c.evolvesTo !== undefined && c.starter);
  if (source?.evolvesTo === undefined) return undefined;
  return { from: source.id, to: source.evolvesTo.species, essence: source.evolvesTo.essence };
}

/** The five pips of the season picture: the 2nd week is lit, the last is the Festival. */
export function exampleSeason(): {
  week: number;
  festival: boolean;
  state: 'done' | 'now' | 'ahead';
}[] {
  const weeks = RULES.progression.seasonWeeks;
  return Array.from({ length: weeks }, (_, i) => ({
    week: i + 1,
    festival: i + 1 === weeks,
    state: i + 1 < 2 ? 'done' : i + 1 === 2 ? 'now' : 'ahead',
  }));
}
