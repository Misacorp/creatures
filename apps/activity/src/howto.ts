/**
 * What the How to play page draws, worked out from the content and the rules so the pictures can
 * never disagree with the game: example creatures, the raid week and the
 * expedition trips and the rooms of the dungeon. Pure functions; `HowToPlayArt.tsx` draws them.
 */
import {
  RULES,
  content,
  dungeonContent,
  howToPlay,
  type CreatureSpecies,
  type DungeonFoeDef,
  type Role,
} from '@creatures/game';
import { eventTitle } from './raid-time';
import type { RaidEventId } from './raid-api';

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

/** One step of the combat v2 weekend: its schedule event, its name and the short weekday. */
export interface WeekendStep {
  event: 'phase1' | 'phase2' | 'finale';
  title: string;
  day: string;
}

/**
 * The three parts of a combat v2 weekend with their weekdays, from `RULES.raid.scheduleV2`: stage 1, stage 2 and the
 * live finale (the schedule's events keep their old names, `phase1` is stage 1).
 */
export function weekendStrip(
  schedule: Readonly<Record<'phase1' | 'phase2' | 'finale', { readonly weekday: number }>> = RULES
    .raid.scheduleV2,
): WeekendStep[] {
  const steps: readonly { event: WeekendStep['event']; title: string }[] = [
    { event: 'phase1', title: 'Stage 1' },
    { event: 'phase2', title: 'Stage 2' },
    { event: 'finale', title: 'Live finale' },
  ];
  return steps.map((step) => ({ ...step, day: DAYS[schedule[step.event].weekday - 1] ?? '' }));
}

/** The move the board picture lights, as its label says it: a target word and a shape word (`grammar.md`). */
export const BOARD_EXAMPLE_MOVE = { target: 'Nemesis', shape: 'Lance' } as const;

/**
 * The Marks picture: the worked example's Setter, the mark it leaves (twice, so the count shows) and the creature of
 * the element that cashes it, plus a second, older mark of another element. From the content, so the elements
 * are the game's. Undefined when the content has no such reaction.
 */
export function markExample(
  creatures: readonly CreatureSpecies[] = content.creatures,
): { setter: string; payoff: string; marks: { element: string; count: number }[] } | undefined {
  const { setter, payoff } = howToPlay.example;
  const setterSpecies = creatures.find((c) => c.id === setter);
  const reaction = content.reactions.find((r) => r.markElement === setterSpecies?.element);
  if (setterSpecies === undefined || reaction === undefined) return undefined;
  const other = content.reactions.find((r) => r.markElement !== setterSpecies.element);
  return {
    setter,
    payoff,
    marks: [
      { element: reaction.markElement, count: 2 },
      ...(other === undefined ? [] : [{ element: other.markElement, count: 1 }]),
    ],
  };
}

/** The Boss Rank picture: how many bosses of the track to show, which are beaten and which one is next. */
export function rankTrack(count: number): { state: 'beaten' | 'current' | 'later' }[] {
  const current = Math.min(2, count - 1);
  return Array.from({ length: count }, (_, i) => ({
    state:
      i < current ? ('beaten' as const) : i === current ? ('current' as const) : ('later' as const),
  }));
}

interface WeekStep {
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
  /** 1 to 3: how much more a longer trip brings (rewards grow faster than the hours). */
  size: number;
}

/**
 * The expedition trips anyone can send: their hours, from the rules, and how much each brings compared
 * with the others (the picture shows it as a growing pile). The 24 hour trip needs explorer rank and is
 * left to the text.
 */
export function expeditionTrips(
  lengths: Readonly<Record<string, { ms: number; minRank: number }>> = RULES.expeditions.lengths,
): Trip[] {
  return Object.values(lengths)
    .filter((l) => l.minRank <= 1)
    .map((l, i) => ({ hours: l.ms / 3_600_000, size: i + 1 }));
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

/** One room of the dungeon picture: the foe that stands in it. */
interface DungeonRoom {
  id: string;
  name: string;
  element: string;
  boss: boolean;
}

/**
 * The rooms of a dungeon run for the How to play picture, from the rules and the content: the
 * normal rooms hold foes of different elements (the first of each element in the content), and the
 * last holds the first floor boss.
 */
export function dungeonRooms(
  rooms: number = RULES.dungeon.rooms,
  foes: readonly DungeonFoeDef[] = dungeonContent.foes,
): DungeonRoom[] {
  const seen = new Set<string>();
  const picked: DungeonFoeDef[] = [];
  for (const foe of foes) {
    if (picked.length >= rooms - 1) break;
    if (foe.kind !== 'foe' || seen.has(foe.element)) continue;
    seen.add(foe.element);
    picked.push(foe);
  }
  const boss = foes.find((f) => f.kind === 'boss');
  if (boss !== undefined) picked.push(boss);
  return picked.map((f) => ({
    id: f.id,
    name: f.name,
    element: f.element,
    boss: f.kind === 'boss',
  }));
}
