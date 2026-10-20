/**
 * What the How to play page draws, worked out from the content and the rules so the pictures can
 * never disagree with the game: example creatures, the raid week and the
 * expedition trips and the rooms of the dungeon. Pure functions; `HowToPlayArt.tsx` draws them.
 */
import {
  RULES,
  content,
  dungeonContent,
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
