import type { DurationId, GearRarity, JobKind, PartKind, SuppliesId } from '@creatures/game';
import { PART_KINDS } from '@creatures/game';
import type { ArchetypeId } from './archetypes';
import type { OwnedCreature, SimItem } from './data';

export interface PendingExpedition {
  explorerId: string;
  duration: DurationId;
  supplies: SuppliesId;
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
  archetype: ArchetypeId;
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
): SimPlayer {
  return {
    id,
    label,
    archetype,
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
    expeditions: p.expeditions.map((e) => ({ ...e })),
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
