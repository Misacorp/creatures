import {
  GEAR_SLOTS,
  RULES,
  addParts,
  craftCost,
  craftItemLevel,
  craftable,
  dismantleYield,
  expeditionContent,
  gearBase,
  itemOf,
  itemScore,
  jobDuration,
  jobXp,
  partsOfSpec,
  planEquipBest,
  rollCraft,
  rollFestivalItem,
  rollFinaleReward,
  rollWelcomeKit,
  skillLevel,
  supplyDef,
  supplyJobMs,
  supplyJobXp,
  type BestCandidate,
  type Element,
  type GearItem,
  type GearSlot,
  type JobKind,
  type PartKind,
  type PartsBundle,
  type RaidStage,
  type Rng,
  type SupplyDef,
} from '@creatures/game';
import {
  basePower,
  byPowerDesc,
  creaturePower,
  creatureStats,
  foldedCreature,
  wearerOfCreature,
  wornOf,
  type OwnedCreature,
  type SimItem,
} from './data';
import type { SimJob, SimPlayer } from './state';

/**
 * Gear and crafting in the simulator. Every formula comes from `@creatures/game` (rolls, folding,
 * the wear rule, "Equip best", costs, yields, durations, the skill and the drop tables); this file
 * only holds what a player does with them. The policy, at each check-in and after the claims:
 *
 * 1. Claim finished jobs (a craft rolls its rarity, item level and lines now, with the crafter's skill).
 * 2. Equip best: the game's own `planEquipBest` over the player's 3 strongest creatures (by power
 *    without gear), the bag and what they wear, under the wear rule (slot unlock, item level at most
 *    the creature's level, role-locked Charms).
 * 3. Dismantle: every item that is not worn, except the `spares` best spares (by what they would add
 *    to the pool creature they suit best, whether or not that creature can wear them yet).
 * 4. Start jobs in free workshop slots on creatures that are not exploring: make a supply when fewer
 *    than `supplyStock` are in stock (a new player's first craft comes before any supply), else craft
 *    the blueprint whose plain item would add most to a team creature. The creature with the most
 *    Crafting XP goes first. The gear's Busy paws and Apprentice lines count, as in the worker.
 *
 * Drops follow the worker: scrap for cleared phases, one reward slot per participant of a won finale
 * (plus the Festival piece in a Festival week), expedition loot and the welcome kit at the start.
 */
export const GEAR_POLICY = {
  /** Best unworn items kept; the rest are dismantled. */
  spares: 3,
  /** The workshop makes supplies while fewer than this many are in stock (and in open jobs). */
  supplyStock: 4,
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

/** Basis points off a number (rounded down), like the worker's `minusBp`. */
function minusBp(value: number, bp: number): number {
  return Math.floor((value * Math.max(0, 10_000 - bp)) / 10_000);
}

// --- Items and parts ---

/** Items owned: the bag and everything worn. */
export function allItems(player: SimPlayer): SimItem[] {
  return [...player.gear.bag, ...player.creatures.flatMap((c) => wornOf(c))];
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

function newItem(player: SimPlayer, item: GearItem): SimItem {
  return { ...item, lines: item.lines.map((l) => ({ ...l })), uid: player.gear.nextUid++ };
}

/** A dropped item goes in the bag; with the bag full it turns into its dismantle yield (like the worker). */
export function grantItem(player: SimPlayer, item: GearItem): void {
  player.week.gearItems += 1;
  if (inventoryUsed(player) >= RULES.gear.inventoryCap) {
    creditParts(player, dismantleYield(item));
    return;
  }
  player.gear.bag.push(newItem(player, item));
}

/**
 * What a daily dungeon run drops: its parts, and its gear through the bag rules (a full bag turns an
 * item into its dismantle yield, as in the worker).
 */
export function grantDungeonLoot(
  player: SimPlayer,
  parts: PartsBundle,
  gear: readonly GearItem[],
): void {
  creditParts(player, parts);
  for (const item of gear) grantItem(player, item);
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

/** The welcome kit: a common Hat, a blueprint and scrap. Once, when the player joins. */
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

/**
 * A won finale: the reward slot of every participant at the server's rank, as the worker grants it
 * (`rollFinaleReward`): one gear piece of the boss's element or a blueprint the player does not know
 * yet. And the Festival piece in a Festival week.
 */
export function grantFinaleLoot(
  players: readonly SimPlayer[],
  rank: number,
  bossElement: Element,
  festivalElement: Element | null,
  rng: Rng,
): void {
  for (const p of players) {
    const reward = rollFinaleReward(rng, rank, bossElement, new Set(p.gear.blueprints));
    if (reward.kind === 'blueprint') learnBlueprint(p, reward.baseId);
    else grantItem(p, reward.item);
    if (festivalElement !== null) grantItem(p, rollFestivalItem(rng, festivalElement, rank));
  }
}

// --- Scoring ---

/** The facts "Equip best" scores a creature by. */
function bestCreatureOf(c: OwnedCreature): {
  id: string;
  level: number;
  role: ReturnType<typeof wearerOfCreature>['role'];
  element: Element;
  stats: { atk: number; hp: number };
  worn: Partial<Record<GearSlot, string>>;
} {
  const wearer = wearerOfCreature(c);
  const stats = creatureStats(c);
  const worn: Partial<Record<GearSlot, string>> = {};
  for (const slot of GEAR_SLOTS) {
    const item = c.items?.[slot];
    if (item !== undefined) worn[slot] = idOf(item.uid);
  }
  return {
    id: c.id,
    level: c.level,
    role: wearer.role,
    element: wearer.element,
    stats: { atk: stats.atk, hp: stats.hp },
    worn,
  };
}

/** Ids sort like the uids (the plan breaks ties by id). */
function idOf(uid: number): string {
  return String(uid).padStart(8, '0');
}

/** What an item adds to a creature, in hundredths of power (`itemScore`), for choosing gear. */
export function scoreFor(item: GearItem, creature: OwnedCreature): number {
  const w = wearerOfCreature(creature);
  const stats = creatureStats(creature);
  return itemScore(item, { ...w, stats: { atk: stats.atk, hp: stats.hp } });
}

/** Power a creature's gear adds, as the game folds it (floored), for the report. */
export function gearPowerOf(creature: OwnedCreature): number {
  return creature.items === undefined ? 0 : creaturePower(creature) - basePower(creature);
}

/** The sum of the item levels a creature wears. */
export function wornItemLevels(creature: OwnedCreature): number {
  return wornOf(creature).reduce((n, i) => n + i.itemLevel, 0);
}

// --- Jobs ---

function openJobOf(player: SimPlayer, creatureId: string): SimJob | undefined {
  return player.gear.jobs.find((j) => j.creatureId === creatureId);
}

/** True while the creature has an unclaimed job. */
export function onJob(player: SimPlayer, creatureId: string): boolean {
  return openJobOf(player, creatureId) !== undefined;
}

function claimOne(player: SimPlayer, job: SimJob, ctx: GearContext): void {
  const level = skillLevel(player.gear.skillXp[job.creatureId] ?? 0);
  const crafter = player.creatures.find((c) => c.id === job.creatureId);
  const apprenticeBp = crafter === undefined ? 0 : foldedCreature(crafter).rules.apprenticeBp;
  let xp = 0;
  if (job.kind === 'craft' && job.baseId !== undefined) {
    const base = gearBase(job.baseId);
    if (base !== undefined) {
      player.gear.bag.push(newItem(player, rollCraft(ctx.rng, base.id, level)));
      player.gear.crafted += 1;
      player.week.gearCrafts += 1;
      player.week.gearItems += 1;
      if (player.gear.firstCraftAfterDays === null && player.gear.joinDay !== null) {
        player.gear.firstCraftAfterDays = ctx.hour / 24 - player.gear.joinDay;
      }
    }
    xp = jobXp();
  } else if (job.kind === 'supply') {
    const def = job.supplyId === undefined ? undefined : supplyDef(job.supplyId);
    if (def !== undefined) {
      player.supplies[def.id] = (player.supplies[def.id] ?? 0) + def.blueprint.yield;
      player.stats.supplies_crafted += def.blueprint.yield;
      if (def.tier === 'good') player.stats.supplies_crafted_good += def.blueprint.yield;
      if (def.tier === 'great') player.stats.supplies_crafted_great += def.blueprint.yield;
      xp = supplyJobXp(def);
    }
  }
  player.gear.skillXp[job.creatureId] =
    (player.gear.skillXp[job.creatureId] ?? 0) +
    Math.floor((xp * (10_000 + apprenticeBp)) / 10_000);
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

// --- Equipping and dismantling ---

/** The team creatures the gear goes to: the 3 strongest by power without gear. */
function gearPool(player: SimPlayer): OwnedCreature[] {
  return [...player.creatures]
    .sort((a, b) => basePower(b) - basePower(a) || (a.line < b.line ? -1 : a.line > b.line ? 1 : 0))
    .slice(0, 3);
}

/** The game's "Equip best" for the pool: the bag and what the pool wears, best pair first. */
function equipBest(player: SimPlayer): void {
  const pool = gearPool(player);
  if (pool.length === 0) return;
  const items = allItems(player).filter(
    (i) => player.gear.bag.includes(i) || pool.some((c) => wornOf(c).includes(i)),
  );
  if (items.length === 0) return;
  const byId = new Map(items.map((i) => [idOf(i.uid), i]));
  const candidates: BestCandidate[] = items.map((item) => ({ id: idOf(item.uid), item }));
  const moves = planEquipBest(pool.map(bestCreatureOf), candidates);
  if (moves.length === 0) return;
  // Apply the moves: an item leaves its old holder when it is handed on.
  for (const move of moves) {
    const creature = pool.find((c) => c.id === move.creatureId);
    const item = move.itemId === null ? undefined : byId.get(move.itemId);
    if (creature === undefined || item === undefined) continue;
    for (const c of pool) {
      for (const slot of GEAR_SLOTS) {
        if (c.items?.[slot] === item) delete c.items[slot];
      }
    }
    creature.items = { ...creature.items, [item.slot]: item };
  }
  const worn = new Set(pool.flatMap((c) => wornOf(c)));
  player.gear.bag = items.filter((i) => !worn.has(i));
}

/** Dismantles the unworn items, keeping the best spares. */
function dismantleExtras(player: SimPlayer): void {
  const pool = gearPool(player);
  const candidates = player.gear.bag
    .map((item) => ({
      item,
      score: Math.max(0, ...pool.map((c) => scoreFor(item, c))),
    }))
    .sort((a, b) => b.score - a.score || a.item.uid - b.item.uid);
  const drop = candidates.slice(GEAR_POLICY.spares);
  if (drop.length === 0) return;
  const gone = new Set(drop.map((d) => d.item.uid));
  for (const d of drop) creditParts(player, dismantleYield(d.item));
  player.week.gearDismantled += drop.length;
  player.gear.bag = player.gear.bag.filter((i) => !gone.has(i.uid));
}

/** Equip best, then dismantle (see `GEAR_POLICY`). Every player wears and sorts what they have. */
export function manageGear(player: SimPlayer): void {
  equipBest(player);
  dismantleExtras(player);
}

// --- Starting jobs ---

interface JobPlan {
  job: Omit<SimJob, 'creatureId' | 'endsAtHour'>;
  cost: PartsBundle;
}

/** Supplies in stock and in the workshop's open jobs, all kinds and tiers together. */
function supplyStock(player: SimPlayer): number {
  const made = player.gear.jobs.reduce(
    (n, j) => n + (j.kind === 'supply' ? (supplyDef(j.supplyId ?? '')?.blueprint.yield ?? 0) : 0),
    0,
  );
  return Object.values(player.supplies).reduce((n, x) => n + x, 0) + made;
}

const TIER_ORDER = { basic: 0, good: 1, great: 2 } as const;

/**
 * Supplies the workshop makes when the stock is low (fewer than `GEAR_POLICY.supplyStock` in stock and
 * in open jobs): of the supplies the creature's Crafting level allows and the parts pay for, the best
 * tier, and of that tier the kind the player has the fewest of (ties in content order). Supplies cannot
 * be bought, so this is the only way to pick a kind.
 */
function planSupply(player: SimPlayer, level: number): JobPlan | null {
  if (supplyStock(player) >= GEAR_POLICY.supplyStock) return null;
  let best: { def: SupplyDef; plan: JobPlan } | null = null;
  for (const def of expeditionContent.supplies) {
    if (level < def.blueprint.craftingLevel) continue;
    const cost = partsOfSpec(def.blueprint.parts);
    if (!canPay(player, cost)) continue;
    const better =
      best === null ||
      TIER_ORDER[def.tier] > TIER_ORDER[best.def.tier] ||
      (def.tier === best.def.tier &&
        (player.supplies[def.id] ?? 0) < (player.supplies[best.def.id] ?? 0));
    if (better) best = { def, plan: { job: { kind: 'supply', supplyId: def.id }, cost } };
  }
  return best === null ? null : best.plan;
}

/** True until the player has made, or is making, their first piece of gear: that comes before any supply. */
function firstCraftPending(player: SimPlayer): boolean {
  return player.gear.crafted === 0 && !player.gear.jobs.some((j) => j.kind === 'craft');
}

/**
 * The blueprint to craft: the base whose plain item (Common, at the item level this crafter makes)
 * adds most to one of the team creatures, among those the parts pay for. Ties go to the base id.
 */
function planCraft(player: SimPlayer, level: number): JobPlan | null {
  if (inventoryUsed(player) >= RULES.gear.inventoryCap) return null;
  const pool = gearPool(player);
  let best: { plan: JobPlan; score: number; id: string } | null = null;
  for (const baseId of player.gear.blueprints) {
    const base = gearBase(baseId);
    if (base === undefined || !craftable(base)) continue;
    const cost = craftCost(baseId);
    if (!canPay(player, cost)) continue;
    const plain = itemOf(baseId, 'common', craftItemLevel(level), []);
    const score = Math.max(0, ...pool.map((c) => scoreFor(plain, c)));
    const better =
      best === null || score > best.score || (score === best.score && baseId < best.id);
    if (better) best = { plan: { job: { kind: 'craft', baseId }, cost }, score, id: baseId };
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
    const plan = firstCraftPending(player)
      ? (planCraft(player, level) ?? planSupply(player, level))
      : (planSupply(player, level) ?? planCraft(player, level));
    if (plan === null) return;
    pay(player, plan.cost);
    const kind: JobKind = plan.job.kind;
    const busyBp = foldedCreature(creature).rules.busyPawsBp;
    const supply = plan.job.supplyId === undefined ? undefined : supplyDef(plan.job.supplyId);
    const ms =
      kind === 'supply'
        ? supply === undefined
          ? 0
          : minusBp(supplyJobMs(supply, level), busyBp)
        : jobDuration(level, busyBp);
    player.gear.jobs.push({
      ...plan.job,
      creatureId: creature.id,
      endsAtHour: ctx.hour + ms / HOUR_MS,
    });
  }
}
