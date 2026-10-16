import type {
  ExpeditionLength,
  FamiliarityRecord,
  GearRarity,
  JobKind,
  PartKind,
} from '@creatures/game';
import { PART_KINDS } from '@creatures/game';
import type { ArchetypeId } from './archetypes';
import type { OwnedCreature, SimItem } from './data';
import { LEGACY_PROFILES, type PlayerProfile } from './profiles';

/** A trip that has been sent and not yet claimed. */
export interface PendingExpedition {
  explorerId: string;
  length: ExpeditionLength;
  destination: string;
  /** Supplies carried (content ids). */
  kit: string[];
  /** Catch rolls, with the map scrap's and the twist's extra ones. */
  rolls: number;
  /** The weekly twist that applies (content id), if the trip went to the special place that week. */
  twist: string | null;
  /** Absolute simulated hours (since the start of the sim) it was sent at and ends at. */
  startHour: number;
  endsAtHour: number;
  /** The push-on offer rolled when the trip ended (an empty list: none); undefined until then. */
  offer?: string[];
  /** The chosen goal and the hour it ends. */
  push?: { goalId: string; endsAtHour: number };
}

/** Counters of everything a player did with expeditions, for the reports and the targets. */
export interface TripStats {
  trips_finished: number;
  trips_failed: number;
  species_found: number;
  places_visited: number;
  journal_pages: number;
  journal_sets: number;
  reactions_seen: number;
  pushons_taken: number;
  pushons_won: number;
  supplies_used: number;
  supplies_bought: number;
  supplies_found: number;
  supplies_crafted: number;
  shinies_found: number;
  offers: number;
  trip_hours: number;
  /** Catch rolls rolled on trips. */
  catch_rolls: number;
}

export const TRIP_STAT_KEYS: readonly (keyof TripStats)[] = [
  'trips_finished',
  'trips_failed',
  'species_found',
  'places_visited',
  'journal_pages',
  'journal_sets',
  'reactions_seen',
  'pushons_taken',
  'pushons_won',
  'supplies_used',
  'supplies_bought',
  'supplies_found',
  'supplies_crafted',
  'shinies_found',
  'offers',
  'trip_hours',
  'catch_rolls',
];

export function emptyTripStats(): TripStats {
  return Object.fromEntries(TRIP_STAT_KEYS.map((k) => [k, 0])) as unknown as TripStats;
}

/** Counters reset at the start of every week. */
export interface WeekCounters {
  baitEarned: number;
  baitConverted: number;
  baitSpentExpeditions: number;
  baitSpentTraining: number;
  essenceEarned: number;
  trainings: number;
  evolutions: number;
  signedUp: boolean;
  /** Essence spent on gear upgrades. */
  essenceSpentGear: number;
  /** Upgrade levels bought. */
  gearUpgrades: number;
  /** Crafts claimed. */
  gearCrafts: number;
  /** Items that dropped or were crafted. */
  gearItems: number;
  /** Items dismantled. */
  gearDismantled: number;
  /** Daily dungeon: runs made, runs cleared, and what they paid (Bait, Essence, scrap, gear items). */
  dungeonRuns: number;
  dungeonClears: number;
  dungeonBait: number;
  dungeonEssence: number;
  dungeonScrap: number;
  dungeonItems: number;
}

export function emptyWeek(): WeekCounters {
  return {
    baitEarned: 0,
    baitConverted: 0,
    baitSpentExpeditions: 0,
    baitSpentTraining: 0,
    essenceEarned: 0,
    trainings: 0,
    evolutions: 0,
    signedUp: false,
    essenceSpentGear: 0,
    gearUpgrades: 0,
    gearCrafts: 0,
    gearItems: 0,
    gearDismantled: 0,
    dungeonRuns: 0,
    dungeonClears: 0,
    dungeonBait: 0,
    dungeonEssence: 0,
    dungeonScrap: 0,
    dungeonItems: 0,
  };
}

/** A player's daily dungeon progress (the worker's `dungeon_progress`). Days are indices since the sim start. */
export interface DungeonState {
  /** The depth the next run fights at. */
  depth: number;
  streak: number;
  lastDay: number | null;
  firstDay: number | null;
  runs: number;
  clears: number;
}

export function emptyDungeonState(): DungeonState {
  return { depth: 1, streak: 0, lastDay: null, firstDay: null, runs: 0, clears: 0 };
}

/** A workshop job that has been started and not yet claimed. */
export interface SimJob {
  kind: JobKind;
  creatureId: string;
  /** The nominal rarity: the blueprint's for a craft, the item's otherwise (decides the XP). */
  rarity: GearRarity;
  /** Absolute simulated hour (since the start of the sim) at which the job is done. */
  endsAtHour: number;
  /** Craft: the base crafted. */
  baseId?: string;
  /** Supply: the supply crafted. */
  supplyId?: string;
  /** Improve and enchant: the item's uid (the item may be in the bag or worn). */
  itemUid?: number;
  secondaryIndex?: number;
  enchantId?: string;
}

/** Everything gear related a player has. */
export interface GearState {
  /** Items not worn. */
  bag: SimItem[];
  parts: Record<PartKind, number>;
  /** Base ids of the blueprints learned. */
  blueprints: string[];
  jobs: SimJob[];
  /** Crafting XP per creature id. */
  skillXp: Record<string, number>;
  nextUid: number;
  /** Day index (since the sim start) the player joined; null before. */
  joinDay: number | null;
  /** Days after joining until the first craft was claimed; null if none yet. */
  firstCraftAfterDays: number | null;
  /** Highest Crafting level on any creature 30 days after joining; null before that. */
  bestSkillDay30: number | null;
  crafted: number;
}

export function emptyGearState(): GearState {
  return {
    bag: [],
    parts: Object.fromEntries(PART_KINDS.map((k) => [k, 0])) as Record<PartKind, number>,
    blueprints: [],
    jobs: [],
    skillXp: {},
    nextUid: 1,
    joinDay: null,
    firstCraftAfterDays: null,
    bestSkillDay30: null,
    crafted: 0,
  };
}

function cloneItem(item: SimItem): SimItem {
  return {
    ...item,
    rolls: { primary: item.rolls.primary, secondary: item.rolls.secondary.map((s) => ({ ...s })) },
  };
}

export interface SimPlayer {
  id: string;
  label: string;
  /**
   * Today's archetype, or for a journey player the closest one (a label for the reports only: every
   * habit and decision comes from `profile`).
   */
  archetype: ArchetypeId;
  /** The dials this player plays by (`profiles.ts`). */
  profile: PlayerProfile;
  joinWeek: number;
  joined: boolean;
  bait: number;
  essence: number;
  creatures: OwnedCreature[];
  dupeStreak: number;
  firstExpeditionDone: boolean;
  /** Raids taken part in without a jackpot (the pity counter). */
  pity: number;
  /** Highest value the pity counter reached. */
  maxPity: number;
  jackpots: number;
  raids: number;
  expeditions: PendingExpedition[];
  /**
   * What the player likes to explore, as a weight per element (set once when they join): players do not
   * all chase the same species, so collections (and raid teams) differ between players.
   */
  taste: Record<string, number>;
  /** Explorer XP per creature id. */
  explorerXp: Record<string, number>;
  /** Familiarity per `<creature id>|<destination id>`. */
  familiarity: Record<string, FamiliarityRecord>;
  /** Supplies in stock: supply id to amount. */
  supplies: Record<string, number>;
  /** Journal pages found (content ids). */
  journal: string[];
  /** Destinations a trip has finished at. */
  visited: string[];
  stats: TripStats;
  /** The day (since the start of the sim) each of slots 2 to 5 opened; null while closed. */
  slotDays: (number | null)[];
  /** Trips finished by length. */
  tripsByLength: Record<ExpeditionLength, number>;
  gear: GearState;
  dungeon: DungeonState;
  /** This week's leet days, Monday = 0. */
  leetDays: boolean[];
  week: WeekCounters;
}

export function createPlayer(
  id: string,
  label: string,
  archetype: ArchetypeId,
  joinWeek: number,
  profile: PlayerProfile = LEGACY_PROFILES[archetype],
): SimPlayer {
  return {
    id,
    label,
    archetype,
    profile,
    joinWeek,
    joined: false,
    bait: 0,
    essence: 0,
    creatures: [],
    dupeStreak: 0,
    firstExpeditionDone: false,
    pity: 0,
    maxPity: 0,
    jackpots: 0,
    raids: 0,
    expeditions: [],
    taste: { tide: 1, ember: 1, grove: 1, spark: 1 },
    explorerXp: {},
    familiarity: {},
    supplies: {},
    journal: [],
    visited: [],
    stats: emptyTripStats(),
    slotDays: [null, null, null, null],
    tripsByLength: { short: 0, medium: 0, long: 0, day: 0 },
    gear: emptyGearState(),
    dungeon: emptyDungeonState(),
    leetDays: [false, false, false, false, false, false, false],
    week: emptyWeek(),
  };
}

export function clonePlayer(p: SimPlayer): SimPlayer {
  return {
    ...p,
    creatures: p.creatures.map((c) => ({
      ...c,
      ...(c.item === undefined || c.item === null ? {} : { item: cloneItem(c.item) }),
    })),
    expeditions: p.expeditions.map((e) => ({
      ...e,
      kit: [...e.kit],
      ...(e.offer === undefined ? {} : { offer: [...e.offer] }),
      ...(e.push === undefined ? {} : { push: { ...e.push } }),
    })),
    taste: { ...p.taste },
    explorerXp: { ...p.explorerXp },
    familiarity: Object.fromEntries(
      Object.entries(p.familiarity).map(([k, f]) => [k, { ...f, found: [...f.found] }]),
    ),
    supplies: { ...p.supplies },
    journal: [...p.journal],
    visited: [...p.visited],
    stats: { ...p.stats },
    slotDays: [...p.slotDays],
    tripsByLength: { ...p.tripsByLength },
    gear: {
      ...p.gear,
      bag: p.gear.bag.map(cloneItem),
      parts: { ...p.gear.parts },
      blueprints: [...p.gear.blueprints],
      jobs: p.gear.jobs.map((j) => ({ ...j })),
      skillXp: { ...p.gear.skillXp },
    },
    dungeon: { ...p.dungeon },
    leetDays: [...p.leetDays],
    week: { ...p.week },
  };
}
