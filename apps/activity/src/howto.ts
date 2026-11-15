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
  unlockLadder,
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

/**
 * The Boss Rank picture: the first two bosses of the track (the first beaten, the second this week's) and two still
 * hidden ones, which the server announces a week ahead. It names no later boss, so it cannot disagree with the track.
 */
export function rankPicture(): { boss: string | null; state: 'beaten' | 'current' | 'later' }[] {
  return [
    { boss: 'tidal-colossus', state: 'beaten' },
    { boss: 'cinder-wyrm', state: 'current' },
    { boss: null, state: 'later' },
    { boss: null, state: 'later' },
  ];
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

/** One step of the growth picture: a level and what it brings. */
export interface GrowthStep {
  level: number;
  names: string[];
}

/**
 * What a creature's level brings, in order, for the starter that evolves, grouped by level ("Lv 20: Silver honour,
 * Second talent"). From the rules, so it moves with them. Three pictures:
 * - the shipped game (`combatV2` off): gear slots, ribbons, the finale ability, evolution and talent slots;
 * - combat v2: no ribbons and no finale ability (Knacks replace it): a Knack and the first talent from level 1,
 *   the gear slots, evolution and the later talent slots;
 * - combat v2 with the valley's base systems (`allSlotsOpen`): every gear slot is open from level 1 (V-GEAR-3), and the
 *   ribbons are honours (Bronze, Silver, Gold; no stats, no gates).
 */
export function growthSteps(
  options: { combatV2?: boolean; allSlotsOpen?: boolean } = {},
  creatures: readonly CreatureSpecies[] = content.creatures,
): GrowthStep[] {
  const combatV2 = options.combatV2 === true;
  const allSlotsOpen = combatV2 && options.allSlotsOpen === true;
  const starter = creatures.find((c) => c.starter && c.evolvesTo !== undefined);
  const ladder = unlockLadder(starter?.rarity ?? 'common', starter?.evolvesTo?.level, allSlotsOpen);
  const named: { level: number; name: string }[] = [];
  if (combatV2) {
    named.push({ level: 1, name: 'Knack' });
    named.push({ level: RULES.talents.slotLevels[0] ?? 1, name: 'First talent' });
    if (allSlotsOpen) named.push({ level: 1, name: 'Hat, Scarf and Charm' });
  }
  const ability = { level: RULES.abilities.unlockLevel, name: 'Finale ability' };
  for (const step of ladder) {
    if (combatV2 && step.name === 'Ability') continue;
    if (combatV2 && step.name.endsWith('Ribbon')) {
      if (allSlotsOpen)
        named.push({ level: step.level, name: step.name.replace('Ribbon', 'honour') });
      continue;
    }
    named.push(step.name === 'Ability' ? ability : step);
  }
  // The ladder leaves out the finale ability when a ribbon shares its level; the shipped picture names it.
  if (!combatV2 && !ladder.some((step) => step.name === 'Ability')) named.push(ability);
  const steps: GrowthStep[] = [];
  for (const step of named.sort((a, b) => a.level - b.level)) {
    const last = steps.at(-1);
    if (last?.level === step.level) last.names.push(step.name);
    else steps.push({ level: step.level, names: [step.name] });
  }
  return steps;
}
