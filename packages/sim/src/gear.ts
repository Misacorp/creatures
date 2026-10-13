import {
  RULES,
  addParts,
  cappedBonus,
  craftCost,
  craftRarity,
  dismantleYield,
  enchantActive,
  enchantCost,
  gearBase,
  gearBonus,
  gearContent,
  improveCost,
  jobDuration,
  jobXp,
  rerollSecondary,
  supplyDef,
  supplyJobMs,
  supplyJobXp,
  expeditionContent,
  partsOfSpec,
  rollFestivalDrop,
  rollFinaleDrop,
  rollGear,
  rollWelcomeKit,
  skillLevel,
  upgradeCost,
  type Element,
  type GearItem,
  type GearRarity,
  type GearRolls,
  type JobKind,
  type PartKind,
  type PartsBundle,
  type RaidStage,
  type Rng,
  type Role,
} from '@creatures/game';
import {
  basePower,
  byPowerDesc,
  creaturePower,
  creatureStats,
  speciesOf,
  type OwnedCreature,
  type SimItem,
} from './data';
import type { SimJob, SimPlayer } from './state';

/**
 * Gear and crafting in the simulator. Every formula comes from `@creatures/game` (rolls, folding,
 * costs, yields, durations, the skill and the drop tables); this file only holds what a player
 * does with them. The policy, at each check-in and after the claims:
 *
 * 1. Claim finished jobs (a craft rolls its rarity and numbers now, with the crafter's skill).
 * 2. Equip: the items are matched to the player's 3 strongest creatures (by power without gear),
 *    best pair first, scoring an item by the Attack and HP it adds in power, weighted by what the
 *    creature's role needs (`ROLE_WEIGHTS`: payoffs want Attack, guards HP).
 * 3. Dismantle: every item that is not worn and not in a job, except the 2 best spares.
 * 4. Upgrade: worn items, whichever adds the most power per Essence, as long as the Essence left
 *    still covers the cheapest evolution the player is close to.
 * 5. Start jobs in free workshop slots on creatures that are not exploring: enchant a worn item,
 *    then improve a worn item's weak secondary (twice at most per item), then craft the best
 *    blueprint the parts pay for. The creature with the most Crafting XP goes first.
 *
 * Drops follow the worker: scrap for cleared phases, one roll per participant of a won finale (plus
 * the Festival piece in a Festival week), expedition loot and the welcome kit at the start.
 */
export const GEAR_POLICY = {
  /** Best unworn items kept; the rest are dismantled. */
  spares: 2,
  /** Improve jobs per item. */
  maxImproves: 2,
  /** Levels below the evolution level from which Essence is held back for that evolution. */
  evolutionLookahead: 3,
} as const;

/** What a check-in needs to know about time and randomness for gear. */
export interface GearContext {
  rng: Rng;
  /** Absolute simulated hour (since the start of the sim). */
  hour: number;
  /** Day index since the start of the sim. */
  day: number;
}

const HOUR_MS = 3_600_000;

// --- Items and parts ---

/** Items owned: the bag and everything worn. */
export function allItems(player: SimPlayer): SimItem[] {
  const worn = player.creatures.flatMap((c) =>
    c.item === undefined || c.item === null ? [] : [c.item],
  );
  return [...player.gear.bag, ...worn];
}

function inventoryUsed(player: SimPlayer): number {
  const crafts = player.gear.jobs.filter((j) => j.kind === 'craft').length;
  return allItems(player).length + crafts;
}

export function creditParts(player: SimPlayer, bundle: PartsBundle): void {
  const parts = player.gear.parts;
  const sum = addParts({}, bundle);
  for (const [kind, amount] of Object.entries(sum) as [PartKind, number][]) {
    parts[kind] += amount;
  }
}

function canPay(player: SimPlayer, cost: PartsBundle): boolean {
  return (Object.entries(cost) as [PartKind, number][]).every(
    ([kind, amount]) => player.gear.parts[kind] >= amount,
  );
}

function pay(player: SimPlayer, cost: PartsBundle): void {
  for (const [kind, amount] of Object.entries(cost) as [PartKind, number][]) {
    player.gear.parts[kind] -= amount;
  }
}

function newItem(
  player: SimPlayer,
  drop: { baseId: string; rarity: GearRarity; rolls: GearRolls },
): SimItem {
  return {
    uid: player.gear.nextUid++,
    baseId: drop.baseId,
    rarity: drop.rarity,
    level: 0,
    rolls: drop.rolls,
    enchantId: null,
    improves: 0,
  };
}

/** A dropped item goes in the bag; with the bag full it turns into its dismantle yield (like the worker). */
export function grantItem(
  player: SimPlayer,
  drop: { baseId: string; rarity: GearRarity; rolls: GearRolls },
): void {
  player.week.gearItems += 1;
  if (inventoryUsed(player) >= RULES.gear.inventoryCap) {
    creditParts(player, dismantleYield({ baseId: drop.baseId, rarity: drop.rarity, level: 0 }));
    return;
  }
  player.gear.bag.push(newItem(player, drop));
}

/** A blueprint already known turns into scrap. */
export function learnBlueprint(player: SimPlayer, baseId: string): void {
  if (player.gear.blueprints.includes(baseId)) {
    creditParts(player, { scrap: RULES.gear.drops.duplicateBlueprintScrap });
  } else {
    player.gear.blueprints.push(baseId);
  }
}

// --- Drops ---

/** The welcome kit: a common item, a common blueprint and scrap. Once, when the player joins. */
export function grantWelcomeKit(player: SimPlayer, rng: Rng, day: number): void {
  player.gear.joinDay = day;
  const kit = rollWelcomeKit(rng);
  grantItem(player, kit.item);
  learnBlueprint(player, kit.blueprint);
  creditParts(player, { scrap: RULES.gear.drops.welcomeScrap });
}

/** Scrap for every participant of a cleared phase 1 or 2. */
export function grantPhaseScrap(players: readonly SimPlayer[], stage: RaidStage): void {
  if (stage === 'finale') return;
  for (const p of players) creditParts(p, { scrap: RULES.gear.drops.phaseScrap[stage] });
}

/** A won finale: one gear roll per participant at the server's rank, and the Festival piece in a Festival week. */
export function grantFinaleLoot(
  players: readonly SimPlayer[],
  rank: number,
  festivalElement: Element | null,
  rng: Rng,
): void {
  for (const p of players) {
    grantItem(p, rollFinaleDrop(rng, rank));
    if (festivalElement !== null) grantItem(p, rollFestivalDrop(rng, festivalElement));
  }
}

// --- Scoring ---

/**
 * How much a role cares about Attack and HP when a player picks gear, in percent of a stat's power
 * (Attack and a tenth of HP): attackers want Attack, a guard wants HP, a support is in between.
 */
export const ROLE_WEIGHTS: Readonly<Record<Role, { atk: number; hp: number }>> = {
  payoff: { atk: 100, hp: 25 },
  setter: { atk: 100, hp: 50 },
  support: { atk: 70, hp: 100 },
  guard: { atk: 30, hp: 150 },
};

/**
 * What an item adds to a creature, for choosing gear: the Attack and HP it adds in power (Attack plus
 * a tenth of HP), weighted by what the creature's role needs (`ROLE_WEIGHTS`), unfloored so that
 * small steps still show (the fold floors every stat). Speed and crit add a token amount so that two
 * items that give the same power are told apart. Decisions only; the real power comes from `applyGear`.
 */
export function itemScore(item: GearItem, creature: OwnedCreature): number {
  const species = speciesOf(creature.speciesId);
  const capped = cappedBonus(gearBonus(item, species.role, species.element));
  const stats = creatureStats(creature);
  const w = ROLE_WEIGHTS[species.role];
  const power =
    (stats.atk * capped.atk * w.atk) / 1_000_000 + (stats.hp * capped.hp * w.hp) / 10_000_000;
  return power + (capped.spd + capped.critChance * 2 + capped.critDamage / 2) / 100_000;
}

/** Power an item adds to a creature as the game folds it (floored), for the report. */
export function gearPowerOf(creature: OwnedCreature): number {
  return creature.item === undefined || creature.item === null
    ? 0
    : creaturePower(creature) - basePower(creature);
}

// --- Jobs ---

function openJobOf(player: SimPlayer, creatureId: string): SimJob | undefined {
  return player.gear.jobs.find((j) => j.creatureId === creatureId);
}

/** True while the creature has an unclaimed job. */
export function onJob(player: SimPlayer, creatureId: string): boolean {
  return openJobOf(player, creatureId) !== undefined;
}

function findItem(player: SimPlayer, uid: number): SimItem | undefined {
  return allItems(player).find((i) => i.uid === uid);
}

function claimOne(player: SimPlayer, job: SimJob, ctx: GearContext): void {
  const level = skillLevel(player.gear.skillXp[job.creatureId] ?? 0);
  if (job.kind === 'craft' && job.baseId !== undefined) {
    const base = gearBase(job.baseId);
    if (base !== undefined) {
      const rarity = craftRarity(ctx.rng, base.blueprint, level);
      const item = newItem(player, {
        baseId: base.id,
        rarity,
        rolls: rollGear(ctx.rng, base.id, rarity),
      });
      player.gear.bag.push(item);
      player.gear.crafted += 1;
      player.week.gearCrafts += 1;
      player.week.gearItems += 1;
      if (player.gear.firstCraftAfterDays === null && player.gear.joinDay !== null) {
        player.gear.firstCraftAfterDays = ctx.hour / 24 - player.gear.joinDay;
      }
    }
  } else if (
    job.kind === 'improve' &&
    job.itemUid !== undefined &&
    job.secondaryIndex !== undefined
  ) {
    const item = findItem(player, job.itemUid);
    if (item !== undefined) {
      item.rolls = rerollSecondary(ctx.rng, item.baseId, item.rolls, job.secondaryIndex);
      item.improves += 1;
    }
  } else if (job.kind === 'enchant' && job.itemUid !== undefined && job.enchantId !== undefined) {
    const item = findItem(player, job.itemUid);
    if (item !== undefined) item.enchantId = job.enchantId;
  }
  let xp: number;
  if (job.kind === 'supply') {
    const def = job.supplyId === undefined ? undefined : supplyDef(job.supplyId);
    if (def !== undefined) {
      player.supplies[def.id] = (player.supplies[def.id] ?? 0) + def.blueprint.yield;
      player.stats.supplies_crafted += def.blueprint.yield;
      xp = supplyJobXp(def);
    } else {
      xp = 0;
    }
  } else {
    xp = jobXp(job.kind, job.rarity);
  }
  player.gear.skillXp[job.creatureId] = (player.gear.skillXp[job.creatureId] ?? 0) + xp;
}

/** Claims every job that is done by `ctx.hour`. */
export function claimJobs(player: SimPlayer, ctx: GearContext): void {
  const open: SimJob[] = [];
  for (const job of player.gear.jobs) {
    if (job.endsAtHour <= ctx.hour) claimOne(player, job, ctx);
    else open.push(job);
  }
  player.gear.jobs = open;
}

/** The highest Crafting level on any of the player's creatures. */
export function bestSkillLevel(player: SimPlayer): number {
  let best = 1;
  for (const xp of Object.values(player.gear.skillXp)) best = Math.max(best, skillLevel(xp));
  return best;
}

// --- Equipping, dismantling and upgrading ---

/** The team creatures the gear goes to: the 3 strongest by power without gear. */
function gearPool(player: SimPlayer): OwnedCreature[] {
  return [...player.creatures]
    .sort((a, b) => basePower(b) - basePower(a) || (a.line < b.line ? -1 : a.line > b.line ? 1 : 0))
    .slice(0, 3);
}

/** Best pair first: matches every item and pool creature by the power the item adds. */
function equipBest(player: SimPlayer): void {
  const pool = gearPool(player);
  const items = allItems(player);
  if (pool.length === 0 || items.length === 0) return;
  const pairs: { item: SimItem; creature: OwnedCreature; score: number }[] = [];
  for (const item of items) {
    for (const creature of pool) pairs.push({ item, creature, score: itemScore(item, creature) });
  }
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.uid - b.item.uid ||
      (a.creature.id < b.creature.id ? -1 : a.creature.id > b.creature.id ? 1 : 0),
  );
  const usedItems = new Set<number>();
  const usedCreatures = new Set<string>();
  const assign = new Map<string, SimItem>();
  for (const p of pairs) {
    if (usedItems.has(p.item.uid) || usedCreatures.has(p.creature.id)) continue;
    usedItems.add(p.item.uid);
    usedCreatures.add(p.creature.id);
    assign.set(p.creature.id, p.item);
  }
  for (const c of player.creatures) c.item = assign.get(c.id) ?? null;
  player.gear.bag = items.filter((i) => !usedItems.has(i.uid));
}

/** Dismantles the unworn items that no job holds, keeping the best spares. */
function dismantleExtras(player: SimPlayer): void {
  const pool = gearPool(player);
  const held = new Set(
    player.gear.jobs.flatMap((j) => (j.itemUid === undefined ? [] : [j.itemUid])),
  );
  const candidates = player.gear.bag
    .filter((i) => !held.has(i.uid))
    .map((item) => ({
      item,
      score: Math.max(0, ...pool.map((c) => itemScore(item, c))),
    }))
    .sort((a, b) => b.score - a.score || a.item.uid - b.item.uid);
  const drop = candidates.slice(GEAR_POLICY.spares);
  if (drop.length === 0) return;
  const gone = new Set(drop.map((d) => d.item.uid));
  for (const d of drop) creditParts(player, dismantleYield(d.item));
  player.week.gearDismantled += drop.length;
  player.gear.bag = player.gear.bag.filter((i) => !gone.has(i.uid));
}

/** Essence held back for the cheapest evolution a creature is about to reach. */
function evolutionReserve(player: SimPlayer): number {
  let reserve = 0;
  for (const c of player.creatures) {
    const evo = speciesOf(c.speciesId).evolvesTo;
    if (evo === undefined || c.level < evo.level - GEAR_POLICY.evolutionLookahead) continue;
    reserve = reserve === 0 ? evo.essence : Math.min(reserve, evo.essence);
  }
  return reserve;
}

function upgradeAll(player: SimPlayer): void {
  const reserve = evolutionReserve(player);
  for (let guard = 0; guard < 60; guard++) {
    let best: { creature: OwnedCreature; value: number } | null = null;
    for (const creature of player.creatures) {
      const item = creature.item;
      if (item === undefined || item === null) continue;
      const cost = upgradeCost(item);
      if (cost === null) continue;
      if (player.essence - cost.essence < reserve || player.gear.parts.scrap < cost.scrap) continue;
      const gain =
        itemScore({ ...item, level: item.level + 1 }, creature) - itemScore(item, creature);
      if (gain <= 0) continue;
      const value = gain / cost.essence;
      if (best === null || value > best.value) best = { creature, value };
    }
    if (best === null) return;
    const item = best.creature.item as SimItem;
    const cost = upgradeCost(item);
    if (cost === null) return;
    player.essence -= cost.essence;
    player.gear.parts.scrap -= cost.scrap;
    player.week.essenceSpentGear += cost.essence;
    player.week.gearUpgrades += 1;
    item.level += 1;
  }
}

/** Equip, dismantle and upgrade, in that order (see `GEAR_POLICY`). */
export function manageGear(player: SimPlayer): void {
  equipBest(player);
  dismantleExtras(player);
  upgradeAll(player);
}

// --- Starting jobs ---

interface JobPlan {
  job: Omit<SimJob, 'creatureId' | 'endsAtHour'>;
  cost: PartsBundle;
}

function planEnchant(player: SimPlayer): JobPlan | null {
  const held = new Set(
    player.gear.jobs.flatMap((j) => (j.itemUid === undefined ? [] : [j.itemUid])),
  );
  let best: { plan: JobPlan; gain: number } | null = null;
  for (const creature of player.creatures) {
    const item = creature.item;
    if (item === undefined || item === null || item.enchantId !== null || held.has(item.uid))
      continue;
    const species = speciesOf(creature.speciesId);
    for (const enchant of gearContent.enchants) {
      if (!enchantActive(enchant, species.role, species.element)) continue;
      const cost = enchantCost(enchant.id);
      if (cost === null || !canPay(player, cost)) continue;
      const gain =
        itemScore({ ...item, enchantId: enchant.id }, creature) - itemScore(item, creature);
      if (gain <= 0) continue;
      if (best === null || gain > best.gain) {
        best = {
          gain,
          plan: {
            job: { kind: 'enchant', rarity: item.rarity, itemUid: item.uid, enchantId: enchant.id },
            cost,
          },
        };
      }
    }
  }
  return best === null ? null : best.plan;
}

function planImprove(player: SimPlayer): JobPlan | null {
  const held = new Set(
    player.gear.jobs.flatMap((j) => (j.itemUid === undefined ? [] : [j.itemUid])),
  );
  for (const creature of player.creatures) {
    const item = creature.item;
    if (item === undefined || item === null || held.has(item.uid)) continue;
    if (item.improves >= GEAR_POLICY.maxImproves) continue;
    const cost = improveCost(item.rarity);
    if (cost === null || !canPay(player, cost)) continue;
    // Re-roll a secondary that adds no power (speed or crit).
    const index = item.rolls.secondary.findIndex((s) => s.stat !== 'atk' && s.stat !== 'hp');
    if (index < 0) continue;
    return {
      job: { kind: 'improve', rarity: item.rarity, itemUid: item.uid, secondaryIndex: index },
      cost,
    };
  }
  return null;
}

/** The gear rarity a supply tier is sized as (its job's XP and length come from the supply itself). */
const SUPPLY_RARITY = { basic: 'common', good: 'rare', great: 'epic' } as const;

/**
 * Supplies the workshop makes when no gear job is wanted: the best supply (by its estimated worth per
 * unit of parts) the creature's Crafting level allows, the parts pay for and fewer than 2 are in stock.
 */
function planSupply(player: SimPlayer, level: number): JobPlan | null {
  let best: { plan: JobPlan; score: number } | null = null;
  const stock = Object.values(player.supplies).reduce((n, x) => n + x, 0);
  if (stock >= SUPPLY_STOCK_TARGET) return null;
  for (const def of expeditionContent.supplies) {
    if (level < def.blueprint.craftingLevel) continue;
    const cost = partsOfSpec(def.blueprint.parts);
    // Scrap the upgrades want is left alone: supplies are made from what is spare.
    if (!canPay(player, { ...cost, scrap: (cost.scrap ?? 0) + SUPPLY_SCRAP_RESERVE })) continue;
    // Better tiers first (they cost more but are worth more per trip), then by price.
    const score = def.price;
    if (best === null || score > best.score) {
      best = {
        score,
        plan: {
          job: { kind: 'supply', rarity: SUPPLY_RARITY[def.tier], supplyId: def.id },
          cost,
        },
      };
    }
  }
  return best === null ? null : best.plan;
}

/** The workshop stops making a supply once the player holds this many of it. */
const SUPPLY_STOCK_TARGET = 2;
/** Scrap that stays untouched when a supply is made. */
const SUPPLY_SCRAP_RESERVE = 8;

const RARITY_ORDER: Record<GearRarity, number> = { common: 0, rare: 1, epic: 2, festival: 3 };

function planCraft(player: SimPlayer): JobPlan | null {
  if (inventoryUsed(player) >= RULES.gear.inventoryCap) return null;
  let best: { plan: JobPlan; key: readonly [number, number] } | null = null;
  for (const baseId of player.gear.blueprints) {
    const base = gearBase(baseId);
    if (base === undefined) continue;
    const cost = craftCost(baseId);
    if (!canPay(player, cost)) continue;
    const key = [
      RARITY_ORDER[base.blueprint],
      base.primary === 'atk' || base.primary === 'hp' ? 1 : 0,
    ] as const;
    const better =
      best === null || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1]);
    if (better) {
      best = { plan: { job: { kind: 'craft', rarity: base.blueprint, baseId }, cost }, key };
    }
  }
  return best === null ? null : best.plan;
}

/**
 * Starts jobs in the free workshop slots, on creatures that are neither exploring (`exploring`) nor
 * already on a job. Creatures with the most Crafting XP go first.
 */
export function startJobs(
  player: SimPlayer,
  ctx: GearContext,
  exploring: ReadonlySet<string>,
): void {
  const crafters = byPowerDesc(player.creatures)
    .filter((c) => !exploring.has(c.id) && !onJob(player, c.id))
    .sort(
      (a, b) =>
        (player.gear.skillXp[b.id] ?? 0) - (player.gear.skillXp[a.id] ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  for (const creature of crafters) {
    if (player.gear.jobs.length >= RULES.gear.workshopSlots) return;
    const level = skillLevel(player.gear.skillXp[creature.id] ?? 0);
    const plan =
      planEnchant(player) ?? planImprove(player) ?? planCraft(player) ?? planSupply(player, level);
    if (plan === null) return;
    pay(player, plan.cost);
    const kind: JobKind = plan.job.kind;
    const supply = plan.job.supplyId === undefined ? undefined : supplyDef(plan.job.supplyId);
    const ms =
      kind === 'supply'
        ? supply === undefined
          ? 0
          : supplyJobMs(supply, level)
        : jobDuration(kind, plan.job.rarity, level);
    player.gear.jobs.push({
      ...plan.job,
      creatureId: creature.id,
      endsAtHour: ctx.hour + ms / HOUR_MS,
    });
  }
}
