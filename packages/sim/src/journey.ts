import {
  RULES,
  content,
  creaturePower as statsPower,
  craftCost,
  isLandmark,
  upgradeCost,
  type GearRarity,
  type PartKind,
  type RaidStage,
} from '@creatures/game';
import { creatureStats, foldedCreature, pickTeam, speciesOf, type OwnedCreature } from './data';
import { serverMedianTopLevel, type DayInfo, type EconomyObserver } from './economy';
import { fightPower } from './fight-power';
import { allItems } from './gear';
import { isTrainable, trainCost } from './policy';
import type { RaidWeek } from './raid';
import type { SimPlayer } from './state';
import { slotsOfPlayer } from './trips';

/**
 * The journey log: what one simulated player went through, day by day (docs/design/player-journey-sim.md).
 * A recorder watches the economy (`EconomyObserver`) and reads the live state; it changes nothing and
 * draws no random numbers, so a run with a recorder plays exactly like one without.
 */

// --- What holds a player back ---

/**
 * The limits a player can be held back by. The first group is about growing the raid team (levels and
 * evolution), the second about gear, the third what is left.
 */
export const LIMITS = [
  'bait_to_train',
  'essence_to_evolve',
  'level_cap_waiting_evolution',
  'scrap_for_gear',
  'glimmer_for_craft',
  'shards_for_craft',
  'essence_for_gear',
  'craft_timer',
  'max_fusion',
  'nothing_worth_buying',
  'next_check_in',
  'expedition_slots_full',
] as const;
export type Limit = (typeof LIMITS)[number];

/** Limits that are not waits: the player simply has not got round to it yet, or only exploring is full. */
const NOT_A_WAIT: ReadonlySet<Limit> = new Set(['next_check_in', 'expedition_slots_full']);

export interface LimitState {
  /** The one binding limit (see `bindingLimit`). */
  primary: Limit;
  /** Everything that holds the player back right now, `primary` among it. */
  blocked: Limit[];
  /** The limit of the gear path alone, or null when gear is not pursued or nothing blocks it. */
  gear: Limit | null;
}

/** The gear path's limit: what stops the next upgrade or craft. Null when the player does not work the gear. */
export function gearLimit(player: SimPlayer): Limit | null {
  if (player.profile.craftPercent <= 0) return null;
  const parts = player.gear.parts;
  // The cheapest worn upgrade (by Essence).
  let cheapest: { essence: number; scrap: number } | null = null;
  for (const c of player.creatures) {
    if (c.item === undefined || c.item === null) continue;
    const cost = upgradeCost(c.item);
    if (cost !== null && (cheapest === null || cost.essence < cheapest.essence)) cheapest = cost;
  }
  if (cheapest !== null) {
    if (parts.scrap < cheapest.scrap) return 'scrap_for_gear';
    if (player.essence < cheapest.essence) return 'essence_for_gear';
    return null; // affordable: the next check-in does it
  }
  if (player.gear.jobs.length > 0) return 'craft_timer';
  // The craft the player is closest to: the blueprint with the fewest kinds of parts short.
  let closest: { lacks: PartKind[] } | null = null;
  for (const baseId of player.gear.blueprints) {
    const cost = craftCost(baseId);
    const lacks = (Object.entries(cost) as [PartKind, number][])
      .filter(([kind, need]) => parts[kind] < need)
      .map(([kind]) => kind);
    if (lacks.length === 0) return null;
    if (closest === null || lacks.length < closest.lacks.length) closest = { lacks };
  }
  if (closest === null) return null;
  if (closest.lacks.includes('scrap')) return 'scrap_for_gear';
  if (closest.lacks.includes('glimmer')) return 'glimmer_for_craft';
  return 'shards_for_craft';
}

/**
 * The binding limit of a player at a moment, judged on the raid team (the three strongest creatures:
 * what holds back raid power). In order:
 *
 * 1. A team creature at its evolution level without the Essence for it: `level_cap_waiting_evolution`
 *    when no team creature can be trained at all (the stage cap holds them all), `essence_to_evolve`
 *    when the rest of the team can still be trained.
 * 2. A trainable team creature whose next level costs more Bait than held: `bait_to_train`. (After a
 *    check-in this is almost always true, since a player trains until the Bait runs out; the waits
 *    code therefore counts only days without any training as waiting for Bait.) Affordable but not
 *    yet bought (or an evolution the Essence covers): `next_check_in`.
 * 3. Nothing to train and nothing to evolve (every team creature is at its final level cap): the gear
 *    path's limit if it has one (scrap, glimmer, Essence, a craft timer); otherwise `max_fusion` when
 *    every team creature is fully fused, else `nothing_worth_buying` (growth now comes only from
 *    fusion duplicates, which cannot be bought).
 *
 * `blocked` lists every limit that applies, including the gear path's and full expedition slots.
 */
export function bindingLimit(player: SimPlayer, medianTopLevel: number): LimitState {
  const team = pickTeam(player.creatures);
  const gear = gearLimit(player);
  const blocked: Limit[] = [];
  const evoShort = team.filter((c) => {
    const evo = speciesOf(c.speciesId).evolvesTo;
    return evo !== undefined && c.level >= evo.level && player.essence < evo.essence;
  });
  const evoReady = team.filter((c) => {
    const evo = speciesOf(c.speciesId).evolvesTo;
    return evo !== undefined && c.level >= evo.level && player.essence >= evo.essence;
  });
  const trainable = team.filter(isTrainable);

  let growth: Limit | null = null;
  if (evoShort.length > 0) {
    growth = trainable.length === 0 ? 'level_cap_waiting_evolution' : 'essence_to_evolve';
  } else if (trainable.length > 0) {
    const cheapest = Math.min(...trainable.map((c) => trainCost(c, medianTopLevel)));
    growth = player.bait < cheapest ? 'bait_to_train' : 'next_check_in';
  } else if (evoReady.length > 0) {
    growth = 'next_check_in';
  }
  if (growth !== null) blocked.push(growth);
  if (gear !== null) blocked.push(gear);
  const maxed = team.length > 0 && team.every((c) => c.fusionCount >= RULES.fusion.maxFusions);
  const rest: Limit = maxed ? 'max_fusion' : 'nothing_worth_buying';
  if (growth === null && gear === null) blocked.push(rest);
  const free = slotsOfPlayer(player) - player.expeditions.length;
  if (free <= 0 && player.profile.tripPercent > 0) blocked.push('expedition_slots_full');

  const primary: Limit = growth ?? gear ?? rest;
  return { primary, blocked: [...new Set(blocked)], gear };
}

// --- Power split ---

export interface PowerSplit {
  /** The team's power: the creatures with everything. */
  total: number;
  /** The same creatures at their first stage, level 1, no fusion and no gear. */
  base: number;
  /** What each of the four adds, shared out by Shapley attribution (the average over every order of adding them). */
  levels: number;
  fusion: number;
  evolution: number;
  gear: number;
}

const FIRST_STAGE = new Map<string, string>();
for (const s of content.creatures) {
  const held = FIRST_STAGE.get(s.line);
  if (held === undefined || s.stage < speciesOf(held).stage) FIRST_STAGE.set(s.line, s.id);
}

/** The line's first-stage species id (the species itself when the content has no earlier one). */
export function firstStageOf(creature: OwnedCreature): string {
  return FIRST_STAGE.get(creature.line) ?? creature.speciesId;
}

/** Power of a creature with some of its growth taken away: `with` says which of the four factors stay. */
function powerWith(c: OwnedCreature, keep: number): number {
  const speciesId = (keep & 1) !== 0 ? c.speciesId : firstStageOf(c);
  // A level above the first stage's cap only exists with the evolution.
  const level = (keep & 2) !== 0 ? Math.min(c.level, speciesOf(speciesId).levelCap) : 1;
  const state: OwnedCreature = {
    ...c,
    speciesId,
    level,
    fusionCount: (keep & 4) !== 0 ? c.fusionCount : 0,
    item: (keep & 8) !== 0 ? (c.item ?? null) : null,
  };
  return state.item === undefined || state.item === null
    ? statsPower(creatureStats(state))
    : statsPower(foldedCreature(state).stats);
}

/** Shapley weight of adding a factor to a set of `size` others, out of 4: size! (3 - size)! / 4!. */
const SHAPLEY_WEIGHT = [6 / 24, 2 / 24, 2 / 24, 6 / 24] as const;

/**
 * Splits the raid team's power (the three strongest creatures, gear included) into what levels,
 * fusion, evolution and gear each add, on top of the team at its first stage. The four factors
 * interact (a level is worth more at a higher stage, gear scales with stats), so each factor's share
 * is the Shapley value: its average marginal power over every order the four could be added in. The
 * shares plus `base` add up to `total` exactly. This is the method of the B-009 power study.
 */
export function powerSplit(creatures: readonly OwnedCreature[]): PowerSplit {
  const out: PowerSplit = { total: 0, base: 0, levels: 0, fusion: 0, evolution: 0, gear: 0 };
  for (const c of pickTeam(creatures)) {
    const v: number[] = [];
    for (let keep = 0; keep < 16; keep++) v.push(powerWith(c, keep));
    const share = [0, 0, 0, 0];
    for (let factor = 0; factor < 4; factor++) {
      const bit = 1 << factor;
      for (let keep = 0; keep < 16; keep++) {
        if ((keep & bit) !== 0) continue;
        const size = [keep & 1, keep & 2, keep & 4, keep & 8].filter((x) => x !== 0).length;
        share[factor] =
          (share[factor] as number) +
          (SHAPLEY_WEIGHT[size] as number) * ((v[keep | bit] as number) - (v[keep] as number));
      }
    }
    out.base += v[0] as number;
    out.total += v[15] as number;
    out.evolution += share[0] as number;
    out.levels += share[1] as number;
    out.fusion += share[2] as number;
    out.gear += share[3] as number;
  }
  return out;
}

// --- The log ---

/** One day of a player's journey (day 1 is the day they joined). */
export interface DayRecord {
  day: number;
  /** The week of the sim (1-based). */
  week: number;
  loggedIn: boolean;
  leeted: boolean;
  checkIns: number;
  /** Raid team power at the end of the day and its split (`powerSplit`). */
  power: number;
  /**
   * The raid team's fight-scored power and survival (`fightPower`) at the server's Boss Rank: only
   * on the last day of each week (it plays fights), null on the others. `power` is the older
   * Attack + HP score and stays beside it.
   */
  fightPower: number | null;
  fightSurvivalBp: number | null;
  base: number;
  levels: number;
  fusion: number;
  evolution: number;
  gear: number;
  /** The highest creature level, and the average level of the raid team. */
  topLevel: number;
  teamLevel: number;
  /** Currencies held at the end of the day. */
  bait: number;
  essence: number;
  scrap: number;
  glimmer: number;
  shards: number;
  /** Supplies in stock, and supplies used so far. */
  suppliesOwned: number;
  suppliesUsed: number;
  /** Supplies obtained so far, by source: found on trips, dropped by the dungeon, crafted, rank gifts. */
  suppliesFound: number;
  suppliesDungeon: number;
  suppliesCrafted: number;
  /** Of the crafted ones, the good and the great tier. */
  suppliesCraftedGood: number;
  suppliesCraftedGreat: number;
  suppliesGift: number;
  /** Gear items owned, worn, the worn ones by rarity, and the upgrade levels on the worn ones. */
  itemsOwned: number;
  itemsWorn: number;
  wornRarity: Record<GearRarity, number>;
  gearLevels: number;
  /** What held the player back at the end of the day (`bindingLimit`). */
  limit: Limit;
  blocked: Limit[];
  gearLimit: Limit | null;
}

/** A run of days held back by the same limit. */
export interface Wait {
  cause: Limit;
  /** First day of the wait (days since joining, 1-based) and its length in days. */
  start: number;
  length: number;
  /** `growth`: the raid team's levels and evolution (or what is left); `gear`: the gear path. */
  track: 'growth' | 'gear';
}

export interface PlayerJourney {
  playerId: string;
  /** The id of the profile the player plays by. */
  profile: string;
  label: string;
  /** Day index (since the start of the sim) the player joined. */
  joinDay: number;
  days: DayRecord[];
  /** Days since joining (1-based) at which each milestone was first reached. */
  milestones: Record<string, number>;
  waits: Wait[];
}

/** Milestone ids in the order a report lists them. */
export function milestoneCatalogue(): string[] {
  const caps = [...new Set(content.creatures.map((s) => s.levelCap))].sort((a, b) => a - b);
  const out = ['catch_common', 'catch_rare', 'catch_epic', 'first_evolution'];
  for (let k = 1; k <= RULES.fusion.maxFusions; k++) out.push(`fusion_${String(k)}`);
  for (const level of LEVEL_MILESTONES) out.push(`level_${String(level)}`);
  for (const cap of caps) out.push(`species_cap_${String(cap)}`);
  out.push('gear_rare', 'gear_epic', 'gear_plus5');
  for (const depth of DEPTH_MILESTONES) out.push(`dungeon_depth_${String(depth)}`);
  for (const depth of LANDMARK_DEPTHS) out.push(`dungeon_landmark_${String(depth)}`);
  for (let slot = 2; slot <= 5; slot++) out.push(`expedition_slot_${String(slot)}`);
  out.push('raid_stage_cleared', 'raid_finale_won', 'first_jackpot');
  return out;
}

const LEVEL_MILESTONES = [10, 15, 20, 25, 30] as const;
const DEPTH_MILESTONES = [5, 10, 15, 20, 25, 30] as const;
/** The first landmark depths (every `RULES.dungeon.landmarkEvery`-th depth). */
const LANDMARK_DEPTHS = Array.from({ length: 40 }, (_, i) => i + 1)
  .filter((d) => isLandmark(d))
  .slice(0, 5);

/** Species rarity by line (the first stage's). */
function rarityOfLine(c: OwnedCreature): string {
  return speciesOf(firstStageOf(c)).rarity;
}

/** The milestones a player's state shows right now (the raid ones come from `onRaidStage`). */
export function reachedMilestones(player: SimPlayer): string[] {
  const out: string[] = [];
  const rarities = new Set(player.creatures.map(rarityOfLine));
  for (const r of ['common', 'rare', 'epic']) if (rarities.has(r)) out.push(`catch_${r}`);
  if (player.creatures.some((c) => speciesOf(c.speciesId).stage === 2)) out.push('first_evolution');
  const fusion = Math.max(0, ...player.creatures.map((c) => c.fusionCount));
  for (let k = 1; k <= fusion; k++) out.push(`fusion_${String(k)}`);
  const top = Math.max(0, ...player.creatures.map((c) => c.level));
  for (const level of LEVEL_MILESTONES) if (top >= level) out.push(`level_${String(level)}`);
  for (const c of player.creatures) {
    const cap = speciesOf(c.speciesId).levelCap;
    if (c.level >= cap) out.push(`species_cap_${String(cap)}`);
  }
  const items = allItems(player);
  if (items.some((i) => i.rarity === 'rare')) out.push('gear_rare');
  if (items.some((i) => i.rarity === 'epic')) out.push('gear_epic');
  if (items.some((i) => i.level >= 5)) out.push('gear_plus5');
  const cleared = player.dungeon.depth - 1;
  for (const depth of DEPTH_MILESTONES)
    if (cleared >= depth) out.push(`dungeon_depth_${String(depth)}`);
  for (const depth of LANDMARK_DEPTHS) {
    if (cleared >= depth) out.push(`dungeon_landmark_${String(depth)}`);
  }
  for (const [k, day] of player.slotDays.entries()) {
    if (day !== null) out.push(`expedition_slot_${String(k + 2)}`);
  }
  if (player.jackpots > 0) out.push('first_jackpot');
  return out;
}

function shardsOf(player: SimPlayer): number {
  return (Object.entries(player.gear.parts) as [PartKind, number][])
    .filter(([kind]) => kind.endsWith('-shard'))
    .reduce((n, [, amount]) => n + amount, 0);
}

/** One day's record of a player. `medianTopLevel` is the server's, for training costs. */
export function recordDay(
  player: SimPlayer,
  info: {
    day: number;
    week: number;
    loggedIn: boolean;
    leeted: boolean;
    checkIns: number;
    /** Set: also score the raid team in fights at this Boss Rank (`fightPower`). */
    fightRank?: number;
  },
  medianTopLevel: number,
): DayRecord {
  const split = powerSplit(player.creatures);
  const fights = info.fightRank === undefined ? null : fightPower(player.creatures, info.fightRank);
  const team = pickTeam(player.creatures);
  const items = allItems(player);
  const worn = player.creatures.flatMap((c) =>
    c.item === undefined || c.item === null ? [] : [c.item],
  );
  const wornRarity: Record<GearRarity, number> = { common: 0, rare: 0, epic: 0, festival: 0 };
  for (const item of worn) wornRarity[item.rarity] += 1;
  const limit = bindingLimit(player, medianTopLevel);
  return {
    day: info.day,
    week: info.week,
    loggedIn: info.loggedIn,
    leeted: info.leeted,
    checkIns: info.checkIns,
    power: split.total,
    fightPower: fights === null ? null : fights.power,
    fightSurvivalBp: fights === null ? null : fights.survivalBp,
    base: split.base,
    levels: split.levels,
    fusion: split.fusion,
    evolution: split.evolution,
    gear: split.gear,
    topLevel: Math.max(0, ...player.creatures.map((c) => c.level)),
    teamLevel: team.length === 0 ? 0 : team.reduce((n, c) => n + c.level, 0) / team.length,
    bait: player.bait,
    essence: player.essence,
    scrap: player.gear.parts.scrap,
    glimmer: player.gear.parts.glimmer,
    shards: shardsOf(player),
    suppliesOwned: Object.values(player.supplies).reduce((n, x) => n + x, 0),
    suppliesUsed: player.stats.supplies_used,
    suppliesFound: player.stats.supplies_found,
    suppliesDungeon: player.stats.supplies_dungeon,
    suppliesCrafted: player.stats.supplies_crafted,
    suppliesCraftedGood: player.stats.supplies_crafted_good,
    suppliesCraftedGreat: player.stats.supplies_crafted_great,
    suppliesGift: player.stats.supplies_gift,
    itemsOwned: items.length,
    itemsWorn: worn.length,
    wornRarity,
    gearLevels: worn.reduce((n, i) => n + i.level, 0),
    limit: limit.primary,
    blocked: limit.blocked,
    gearLimit: limit.gear,
  };
}

/**
 * Turns the daily limits of a player into waits. A wait is a run of days with the same primary limit;
 * a day on which the player trained at least once while the limit is Bait is a day of progress, not a
 * wait (a level is bought almost every day, so a Bait wait is the stretch between two trainings). A
 * limit that is not a wait (`next_check_in`, full expedition slots) carries the previous wait on. The
 * gear path has its own waits: runs of the same `gearLimit`, ended by any upgrade or craft.
 */
export class WaitTracker {
  private growth: Wait | null = null;
  private gearRun: Wait | null = null;
  readonly waits: Wait[] = [];

  step(day: number, limit: Limit, gear: Limit | null, trained: boolean, geared: boolean): void {
    if (!NOT_A_WAIT.has(limit)) {
      if (limit === 'bait_to_train' && trained) {
        this.growth = null;
      } else if (this.growth !== null && this.growth.cause === limit) {
        this.growth.length += 1;
      } else {
        this.growth = { cause: limit, start: day, length: 1, track: 'growth' };
        this.waits.push(this.growth);
      }
    } else if (this.growth !== null) {
      this.growth.length += 1;
    }
    if (gear === null || geared) {
      this.gearRun = null;
    } else if (this.gearRun !== null && this.gearRun.cause === gear) {
      this.gearRun.length += 1;
    } else {
      this.gearRun = { cause: gear, start: day, length: 1, track: 'gear' };
      this.waits.push(this.gearRun);
    }
  }
}

// --- The recorder ---

interface Track {
  journey: PlayerJourney;
  waits: WaitTracker;
  /** Counters of the current week as of the previous day, to see what changed today. */
  trainings: number;
  gearActions: number;
}

/** Watches an economy run and writes one `PlayerJourney` per player. */
export class JourneyRecorder implements EconomyObserver {
  private readonly tracks = new Map<string, Track>();
  /** Players who cleared a raid stage or the finale this week, to note the milestones at day's end. */
  private readonly raidMilestones: [string, string][] = [];

  get journeys(): PlayerJourney[] {
    return [...this.tracks.values()].map((t) => t.journey);
  }

  onRaidStage(info: { week: number; day: number; stage: RaidStage; raid: RaidWeek }): void {
    if (info.raid.stages[info.stage]?.cleared !== true) return;
    for (const p of info.raid.players) {
      this.raidMilestones.push([p.id, 'raid_stage_cleared']);
      if (info.stage === 'finale') this.raidMilestones.push([p.id, 'raid_finale_won']);
    }
  }

  onDayEnd(info: DayInfo): void {
    const median = serverMedianTopLevel(info.active);
    for (const p of info.active) {
      let track = this.tracks.get(p.id);
      if (track === undefined) {
        track = {
          journey: {
            playerId: p.id,
            profile: p.profile.id,
            label: p.label,
            joinDay: p.gear.joinDay ?? info.day,
            days: [],
            milestones: {},
            waits: [],
          },
          waits: new WaitTracker(),
          trainings: 0,
          gearActions: 0,
        };
        this.tracks.set(p.id, track);
      }
      const j = track.journey;
      const dayNumber = info.day - j.joinDay + 1;
      if (info.dayOfWeek === 0) {
        track.trainings = 0;
        track.gearActions = 0;
      }
      const record = recordDay(
        p,
        {
          day: dayNumber,
          week: info.week,
          loggedIn: info.loggedIn.has(p.id),
          leeted: info.leeted.has(p.id),
          checkIns: info.checkIns.get(p.id) ?? 0,
          // The week's last day: score the team in fights (it plays 12 of them, so not every day).
          ...(info.dayOfWeek === 6 ? { fightRank: info.rank ?? 1 } : {}),
        },
        median,
      );
      j.days.push(record);
      const gearActions = p.week.gearUpgrades + p.week.gearCrafts;
      track.waits.step(
        dayNumber,
        record.limit,
        record.gearLimit,
        p.week.trainings > track.trainings,
        gearActions > track.gearActions,
      );
      track.trainings = p.week.trainings;
      track.gearActions = gearActions;
      for (const id of reachedMilestones(p)) {
        if (j.milestones[id] === undefined) j.milestones[id] = dayNumber;
      }
    }
    for (const [playerId, id] of this.raidMilestones) {
      const j = this.tracks.get(playerId)?.journey;
      if (j === undefined) continue;
      const dayNumber = info.day - j.joinDay + 1;
      if (j.milestones[id] === undefined) j.milestones[id] = dayNumber;
    }
    this.raidMilestones.length = 0;
    for (const t of this.tracks.values()) t.journey.waits = t.waits.waits;
  }
}
