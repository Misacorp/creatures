import {
  GEAR_SLOTS,
  RULES,
  addParts,
  chance,
  craftCost,
  craftCostFor,
  craftHours,
  craftItemLevel,
  craftable,
  dismantleHours,
  dismantleLearnBp,
  dismantleXp,
  dismantleYield,
  expeditionContent,
  gearBase,
  itemOf,
  itemScore,
  jobDuration,
  jobXp,
  partsOfSpec,
  planEquipBest,
  reachMinLevel,
  rollCraftItem,
  rollDismantle,
  rollFestivalItem,
  rollFinaleReward,
  rollWelcomeKit,
  skillLevel,
  supplyDef,
  supplyJobMs,
  supplyJobXp,
  type BestCandidate,
  type DismantleItem,
  type Element,
  type GearItem,
  type GearSlot,
  type JobKind,
  type PartKind,
  type PartsBundle,
  type RaidStage,
  type ReachId,
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
 * 3. Mark what to dismantle: every item that is not worn, except the `spares` best spares (by what they
 *    would add to the pool creature they suit best, whether or not that creature can wear them yet).
 *    Dismantling is a Workshop job now (15 minutes to 2 hours, the items leave the bag when it starts),
 *    so these wait in the bag until a free slot takes them.
 * 4. Start jobs in free workshop slots on creatures that are not exploring: the first job of a check-in
 *    makes a supply when fewer than `supplyStock` are in stock (a new player's first craft comes before
 *    any supply), else crafts the blueprint whose plain item would add most to a team creature, aimed
 *    with the biggest Reach the parts and the Essence above `essenceKeep` pay for (and the creature's
 *    Crafting level allows). The second job takes apart what is marked (a bundle of up to 5 Commons, or
 *    the best Epic, Festival or Rare piece alone, Essence first) once `dismantleAt` pieces wait or any
 *    Rare or better does, else it crafts too. The creature with the most Crafting XP goes first. The
 *    gear's Busy paws and Apprentice lines count, as in the worker.
 *
 * Drops follow the worker: scrap for cleared phases, one reward slot per participant of a won finale
 * (plus the Festival piece in a Festival week), expedition loot and the welcome kit at the start.
 */
export const GEAR_POLICY = {
  /** Best unworn items kept; the rest are dismantled. */
  spares: 3,
  /** The workshop makes supplies while fewer than this many are in stock (and in open jobs). */
  supplyStock: 4,
  /** Essence a Reach never touches: the least kept back for evolutions. */
  essenceKeep: 40,
  /** Commons waiting in the bag before a dismantle job is worth a slot (a Rare or better always is). */
  dismantleAt: 3,
  /**
   * Lures cost Bait as well as parts. A player spends Bait on levels first (training runs before the
   * workshop at a check-in), and the lures may take at most this share (basis points) of the Bait the
   * player earned this week, so a lure never starves the training that the raid needs.
   */
  lureBaitShareBp: 2_500,
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

/** Adds a well-thumbed mark to a known blueprint, up to the most. Returns whether one was added. */
function addMark(player: SimPlayer, baseId: string): boolean {
  const marks = player.gear.marks[baseId] ?? 0;
  if (marks >= RULES.gear.craft.marks.max) return false;
  player.gear.marks[baseId] = marks + 1;
  return true;
}

/**
 * A blueprint find (a trip, the finale, the welcome kit): a new one is learned; one already known adds
 * a well-thumbed mark, and turns into scrap only at the most marks (like the worker's grants).
 */
export function learnBlueprint(player: SimPlayer, baseId: string): void {
  if (!player.gear.blueprints.includes(baseId)) {
    player.gear.blueprints.push(baseId);
    player.gear.marks[baseId] = 0;
  } else if (!addMark(player, baseId)) {
    creditParts(player, { scrap: RULES.gear.drops.duplicateBlueprintScrap });
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
    const reach = job.reach ?? 'none';
    if (base !== undefined) {
      const made = rollCraftItem(ctx.rng, base.id, level, { reach, marks: job.marks ?? 0 });
      player.gear.bag.push(newItem(player, made.item));
      player.gear.crafted += 1;
      player.week.gearCrafts += 1;
      player.week.gearItems += 1;
      if (reach !== 'none') player.week.gearReaches += 1;
      if (reach === 'epic') player.week.gearReachEpics += 1;
      if (player.gear.firstCraftAfterDays === null && player.gear.joinDay !== null) {
        player.gear.firstCraftAfterDays = ctx.hour / 24 - player.gear.joinDay;
      }
    }
    xp = jobXp(0, craftHours(reach));
  } else if (job.kind === 'supply') {
    const def = job.supplyId === undefined ? undefined : supplyDef(job.supplyId);
    if (def !== undefined) {
      player.supplies[def.id] = (player.supplies[def.id] ?? 0) + def.blueprint.yield;
      player.stats.supplies_crafted += def.blueprint.yield;
      if (def.kind === 'lure') player.stats.lures_crafted += def.blueprint.yield;
      if (def.tier === 'good') player.stats.supplies_crafted_good += def.blueprint.yield;
      if (def.tier === 'great') player.stats.supplies_crafted_great += def.blueprint.yield;
      xp = supplyJobXp(def);
    }
  } else if (job.kind === 'dismantle' && job.items !== undefined && job.items.length > 0) {
    // The refund is rolled now, inside the items' ranges (no Crafting level in it); each item that can
    // teach a blueprint has the worker's chance to teach it or add a mark.
    const rolled = rollDismantle(ctx.rng, job.items);
    creditParts(player, rolled.parts);
    player.essence += rolled.essence;
    player.week.dismantleEssence += rolled.essence;
    player.week.gearDismantled += job.items.length;
    const learnBp = dismantleLearnBp(level);
    for (const item of job.items) {
      const base = gearBase(item.baseId);
      if (base === undefined || !craftable(base) || !chance(ctx.rng, learnBp, 10_000)) continue;
      if (!player.gear.blueprints.includes(base.id)) {
        player.gear.blueprints.push(base.id);
        player.gear.marks[base.id] = 0;
      } else {
        addMark(player, base.id);
      }
    }
    xp = dismantleXp((job.items[0] as DismantleItem).rarity);
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

/** The unworn items beyond the best spares, in the order the dismantle jobs should take them (lowest score first). */
function extras(player: SimPlayer): SimItem[] {
  const pool = gearPool(player);
  const ranked = player.gear.bag
    .map((item) => ({
      item,
      score: Math.max(0, ...pool.map((c) => scoreFor(item, c))),
    }))
    .sort((a, b) => b.score - a.score || a.item.uid - b.item.uid);
  return ranked
    .slice(GEAR_POLICY.spares)
    .map((r) => r.item)
    .reverse();
}

/** Equip best (see `GEAR_POLICY`): what is left over waits for a dismantle job. Every player wears what they have. */
export function manageGear(player: SimPlayer): void {
  equipBest(player);
}

// --- Starting jobs ---

interface JobPlan {
  job: Omit<SimJob, 'creatureId' | 'endsAtHour'>;
  cost: PartsBundle;
  /** Essence a Reach pays (taken from the player's Essence). */
  essence?: number;
  /** The Bait it costs besides the parts (a lure). */
  bait?: number;
}

/** Bait the lures may still take this week: their share of the Bait earned this week, less what they cost so far. */
function lureBudget(player: SimPlayer): number {
  const earned = player.week.baitEarned + player.week.dungeonBait;
  return Math.floor((earned * GEAR_POLICY.lureBaitShareBp) / 10_000) - player.week.baitLures;
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
    // A lure also costs Bait: held, and within the share the lures may take.
    const bait = def.blueprint.bait ?? 0;
    if (bait > 0 && (player.bait < bait || lureBudget(player) < bait)) continue;
    const better =
      best === null ||
      TIER_ORDER[def.tier] > TIER_ORDER[best.def.tier] ||
      (def.tier === best.def.tier &&
        (player.supplies[def.id] ?? 0) < (player.supplies[best.def.id] ?? 0));
    if (better) {
      best = {
        def,
        plan: { job: { kind: 'supply', supplyId: def.id }, cost, ...(bait > 0 ? { bait } : {}) },
      };
    }
  }
  return best === null ? null : best.plan;
}

/** True until the player has made, or is making, their first piece of gear: that comes before any supply. */
function firstCraftPending(player: SimPlayer): boolean {
  return player.gear.crafted === 0 && !player.gear.jobs.some((j) => j.kind === 'craft');
}

/**
 * The blueprint to craft: the base whose plain item (Common, at the item level this crafter makes)
 * adds most to one of the team creatures, among those the parts pay for. Ties go to the base id. It
 * is aimed with the biggest Reach the crafter's level, the parts and the Essence above
 * `GEAR_POLICY.essenceKeep` allow (Reach for Epic, else for Rare, else a plain craft).
 */
function planCraft(player: SimPlayer, level: number): JobPlan | null {
  if (inventoryUsed(player) >= RULES.gear.inventoryCap) return null;
  const pool = gearPool(player);
  let best: { baseId: string; score: number } | null = null;
  for (const baseId of player.gear.blueprints) {
    const base = gearBase(baseId);
    if (base === undefined || !craftable(base)) continue;
    if (!canPay(player, craftCost(baseId, craftItemLevel(level)))) continue;
    const plain = itemOf(baseId, 'common', craftItemLevel(level), []);
    const score = Math.max(0, ...pool.map((c) => scoreFor(plain, c)));
    const better =
      best === null || score > best.score || (score === best.score && baseId < best.baseId);
    if (better) best = { baseId, score };
  }
  if (best === null) return null;
  const marks = player.gear.marks[best.baseId] ?? 0;
  const reaches: readonly ReachId[] = ['epic', 'rare', 'none'];
  for (const reach of reaches) {
    if (level < reachMinLevel(reach)) continue;
    const { parts, essence } = craftCostFor(
      best.baseId,
      reach,
      player.gear.parts,
      craftItemLevel(level),
    );
    if (!canPay(player, parts)) continue;
    if (essence > 0 && player.essence - essence < GEAR_POLICY.essenceKeep) continue;
    return { job: { kind: 'craft', baseId: best.baseId, reach, marks }, cost: parts, essence };
  }
  return null;
}

/**
 * What to take apart next, if it is worth a slot: the best Epic or Festival piece alone, else a Rare
 * (they pay Essence), else a bundle of up to 5 Commons once `GEAR_POLICY.dismantleAt` wait. Only items
 * beyond the best spares are ever taken.
 */
function planDismantle(player: SimPlayer): SimItem[] | null {
  const waiting = extras(player);
  const rank = (i: SimItem): number => (i.rarity === 'common' ? 0 : i.rarity === 'rare' ? 1 : 2);
  const top = [...waiting].sort((a, b) => rank(b) - rank(a) || a.uid - b.uid)[0];
  if (top !== undefined && rank(top) > 0) return [top];
  const commons = waiting.filter((i) => i.rarity === 'common');
  if (commons.length < GEAR_POLICY.dismantleAt) return null;
  return commons.slice(0, RULES.gear.dismantle.bundleMax);
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
    const busyBp = foldedCreature(creature).rules.busyPawsBp;
    const craftPlan = (): JobPlan | null =>
      firstCraftPending(player)
        ? (planCraft(player, level) ?? planSupply(player, level))
        : (planSupply(player, level) ?? planCraft(player, level));
    // The first job of a check-in crafts; the second takes apart what waits (a slot goes to one
    // dismantle at a time), and either falls back to the other when it has nothing to do.
    const dismantleOpen = player.gear.jobs.some((j) => j.kind === 'dismantle');
    const tryDismantle = (): SimItem[] | null => (dismantleOpen ? null : planDismantle(player));
    let plan: JobPlan | null = null;
    let items: SimItem[] | null = null;
    if (player.gear.jobs.length === 0) {
      plan = craftPlan();
      if (plan === null) items = tryDismantle();
    } else {
      items = tryDismantle();
      if (items === null) plan = craftPlan();
    }
    if (items !== null) {
      const rarity = (items[0] as SimItem).rarity;
      const gone = new Set(items.map((i) => i.uid));
      player.gear.bag = player.gear.bag.filter((i) => !gone.has(i.uid));
      player.gear.jobs.push({
        kind: 'dismantle',
        creatureId: creature.id,
        items: items.map((i) => ({ baseId: i.baseId, rarity: i.rarity, itemLevel: i.itemLevel })),
        endsAtHour: ctx.hour + jobDuration(level, busyBp, dismantleHours(rarity)) / HOUR_MS,
      });
      continue;
    }
    if (plan === null) return;
    pay(player, plan.cost);
    player.essence -= plan.essence ?? 0;
    if (plan.bait !== undefined) {
      player.bait -= plan.bait;
      player.week.baitLures += plan.bait;
      player.stats.lure_bait += plan.bait;
    }
    const kind: JobKind = plan.job.kind;
    const supply = plan.job.supplyId === undefined ? undefined : supplyDef(plan.job.supplyId);
    const ms =
      kind === 'supply'
        ? supply === undefined
          ? 0
          : minusBp(supplyJobMs(supply, level), busyBp)
        : jobDuration(level, busyBp, craftHours(plan.job.reach ?? 'none'));
    player.gear.jobs.push({
      ...plan.job,
      creatureId: creature.id,
      endsAtHour: ctx.hour + ms / HOUR_MS,
    });
  }
}
