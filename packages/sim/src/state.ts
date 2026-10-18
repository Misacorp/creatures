import type {
  DismantleItem,
  ExpWeather,
  ReachId,
  ExpeditionLength,
  FamiliarityRecord,
  GearSlot,
  JobKind,
  PartKind,
  TripWeather,
  WorkshopMods,
} from '@creatures/game';
import { GEAR_SLOTS, PART_KINDS } from '@creatures/game';
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
  /** A treat was packed (Bait paid when it was sent): the explorer's experience for the trip doubles. */
  treat?: boolean;
  /** Absolute simulated hours (since the start of the sim) it was sent at and ends at. */
  startHour: number;
  endsAtHour: number;
  /** The push-on offer rolled when the trip ended (an empty list: none); undefined until then. */
  offer?: string[];
  /** The chosen goal and the hour it ends. */
  push?: { goalId: string; endsAtHour: number };
  /** What the day's weather did to the trip when it was sent (absent: nothing); the claim reads this. */
  weather?: TripWeather;
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
  /** Supplies that came from the daily dungeon, and from one-time explorer rank gifts. */
  supplies_dungeon: number;
  supplies_gift: number;
  supplies_found: number;
  supplies_crafted: number;
  /** Of the crafted ones, those of the good and the great tier (they need shards and Crafting level 3 and 5). */
  supplies_crafted_good: number;
  supplies_crafted_great: number;
  shinies_found: number;
  offers: number;
  trip_hours: number;
  /** Catch rolls rolled on trips. */
  catch_rolls: number;
  /** Catch rolls that brought no creature (a small find of scrap instead). */
  empty_rolls: number;
  /** Creatures the trips and the Festival brought: new species and duplicates. */
  catches: number;
  /** Of those, the duplicates, and what each was answered with (the sim takes Recommended). */
  dupes: number;
  dupes_taught: number;
  dupes_fused: number;
  dupes_released: number;
  /** Golden talents rolled (a new creature's first, or a duplicate's). */
  golden_talents: number;
  /** Talents put into a slot from the Talent Book for Bait. */
  talent_slots: number;
  /** Lures carried on a trip, lures crafted, and the Bait they cost. */
  lures_used: number;
  lures_crafted: number;
  lure_bait: number;
  /** Creature experience earned, by where it came from (a treat's doubling included). */
  exp_trip: number;
  exp_dungeon: number;
  exp_raid: number;
  exp_job: number;
  /** Treats packed, and the ribbons bought. */
  treats: number;
  ribbons: number;
  /** Catch rolls the pity forced: a species the player lacked, or a creature of any kind. */
  pity_new: number;
  pity_creature: number;
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
  'supplies_dungeon',
  'supplies_gift',
  'supplies_found',
  'supplies_crafted',
  'supplies_crafted_good',
  'supplies_crafted_great',
  'shinies_found',
  'offers',
  'trip_hours',
  'catch_rolls',
  'empty_rolls',
  'catches',
  'dupes',
  'dupes_taught',
  'dupes_fused',
  'dupes_released',
  'golden_talents',
  'talent_slots',
  'lures_used',
  'lures_crafted',
  'lure_bait',
  'exp_trip',
  'exp_dungeon',
  'exp_raid',
  'exp_job',
  'treats',
  'ribbons',
  'pity_new',
  'pity_creature',
];

export function emptyTripStats(): TripStats {
  return Object.fromEntries(TRIP_STAT_KEYS.map((k) => [k, 0])) as unknown as TripStats;
}

/** Counters reset at the start of every week. */
export interface WeekCounters {
  baitEarned: number;
  /** Bait spent crafting lures, and putting talents into slots from the Talent Book. */
  baitLures: number;
  baitSlots: number;
  /** Bait spent on treats. */
  baitTreats: number;
  essenceEarned: number;
  /** Levels gained this week, from experience. */
  levelUps: number;
  evolutions: number;
  signedUp: boolean;
  /** Crafts claimed. */
  gearCrafts: number;
  /** Items that dropped or were crafted. */
  gearItems: number;
  /** Items taken apart in dismantle jobs (counted when the job is claimed). */
  gearDismantled: number;
  /** Crafts claimed that were a Reach for a Rare or an Epic, and the Essence dismantle jobs gave back. */
  gearReaches: number;
  gearReachEpics: number;
  dismantleEssence: number;
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
    baitLures: 0,
    baitSlots: 0,
    baitTreats: 0,
    essenceEarned: 0,
    levelUps: 0,
    evolutions: 0,
    signedUp: false,
    gearCrafts: 0,
    gearItems: 0,
    gearDismantled: 0,
    gearReaches: 0,
    gearReachEpics: 0,
    dismantleEssence: 0,
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
  /**
   * The depth the player's last run was lost (a defeat) at, or null after any other run: a player plays the
   * next run at that depth warily (they head home from the camp sooner). The sim's memory of the depth wall.
   */
  lostAt: number | null;
}

export function emptyDungeonState(): DungeonState {
  return { depth: 1, streak: 0, lastDay: null, firstDay: null, runs: 0, clears: 0, lostAt: null };
}

/** A workshop job that has been started and not yet claimed. */
export interface SimJob {
  kind: JobKind;
  creatureId: string;
  /** Absolute simulated hour (since the start of the sim) at which the job is done. */
  endsAtHour: number;
  /** Craft: the base crafted, what it is aimed at and the blueprint's marks when it started. */
  baseId?: string;
  reach?: ReachId;
  marks?: number;
  /** Dismantle: the items taken apart (they left the bag when the job started). */
  items?: DismantleItem[];
  /** Supply: the supply crafted. */
  supplyId?: string;
  /** A treat was packed (Bait paid when the job started): the worker's experience for it doubles. */
  treat?: boolean;
  /** The day's Market Day boost on a craft or a dismantle (`WorkshopMods`), fixed when it started. */
  mods?: WorkshopMods;
  /** What the day's weather did to the job's experience when it started (absent: nothing). */
  xp?: ExpWeather;
}

/** Everything gear related a player has. */
export interface GearState {
  /** Items not worn. */
  bag: SimItem[];
  parts: Record<PartKind, number>;
  /** Base ids of the blueprints learned. */
  blueprints: string[];
  /** Well-thumbed marks per blueprint base id (0 to the most). */
  marks: Record<string, number>;
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
  /**
   * The Workshop jobs the player started on one game day, by kind: Market Day boosts only the first craft and
   * the first 2 dismantle jobs of a day, and every job counts, boosted or not.
   */
  startedToday: { day: number; craft: number; dismantle: number };
}

export function emptyGearState(): GearState {
  return {
    bag: [],
    parts: Object.fromEntries(PART_KINDS.map((k) => [k, 0])) as Record<PartKind, number>,
    blueprints: [],
    marks: {},
    jobs: [],
    skillXp: {},
    nextUid: 1,
    joinDay: null,
    firstCraftAfterDays: null,
    bestSkillDay30: null,
    crafted: 0,
    startedToday: { day: -1, craft: 0, dismantle: 0 },
  };
}

function cloneItem(item: SimItem): SimItem {
  return { ...item, lines: item.lines.map((l) => ({ ...l })) };
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
  /** The catch pity's counters (`RULES.catching.pity`): rolls since a new species, and since any creature. */
  catchPity: { sinceNew: number; sinceCreature: number };
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
    catchPity: { sinceNew: 0, sinceCreature: 0 },
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
    catchPity: { ...p.catchPity },
    creatures: p.creatures.map((c) => {
      const { items, talents, ...rest } = c;
      const own =
        talents === undefined ? {} : { talents: { book: talents.book.map((b) => ({ ...b })) } };
      if (items === undefined) return { ...rest, ...own };
      const worn: Partial<Record<GearSlot, SimItem>> = {};
      for (const slot of GEAR_SLOTS) {
        const item = items[slot];
        if (item !== undefined) worn[slot] = cloneItem(item);
      }
      return { ...rest, ...own, items: worn };
    }),
    expeditions: p.expeditions.map((e) => ({
      ...e,
      kit: [...e.kit],
      ...(e.offer === undefined ? {} : { offer: [...e.offer] }),
      ...(e.push === undefined ? {} : { push: { ...e.push } }),
      ...(e.weather === undefined ? {} : { weather: { ...e.weather } }),
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
      marks: { ...p.gear.marks },
      startedToday: { ...p.gear.startedToday },
      jobs: p.gear.jobs.map((j) => ({
        ...j,
        ...(j.items === undefined ? {} : { items: [...j.items] }),
        ...(j.mods === undefined ? {} : { mods: { ...j.mods } }),
        ...(j.xp === undefined ? {} : { xp: { ...j.xp } }),
      })),
      skillXp: { ...p.gear.skillXp },
    },
    dungeon: { ...p.dungeon },
    leetDays: [...p.leetDays],
    week: { ...p.week },
  };
}
