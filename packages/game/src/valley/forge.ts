import { patchworkBlueprint, patchworkMaxRarity } from '../content/patchwork';
import { RULES as GAME } from '../rules';
import type { ReachId } from '../rules/gear';
import type { Rng } from '../rng';
import { masteryBonus } from './formulas';
import type { ValleyRules } from './rules';
import { VALLEY_ELEMENTS } from './rules';

/**
 * The Forge loop, the pure half (phase 5 step 3, docs/design/valley/systems/forge.md V-FORGE-1 to 10 and gear.md V-GEAR-6): the anvil
 * seat ladder, kit, the odds of a piece, the queue of orders, tinkering when an order cannot run, the shelf the inputs come from and the
 * floor the pieces collect on. The lab (`packages/econ/src/forge.ts`) models the same rules hour by hour; every number is read from
 * the rules. The lazy pass (`settle.ts`) calls the three step functions below: `forgeInstants` (what happens at a moment: a finished
 * piece goes to the floor, an idle anvil starts one or says what it waits on), `forgeBoundary` (the next moment the rates change by
 * themselves) and `forgeAdvance` (a stretch of effective hours). The only randomness is the rarity of a piece, drawn from an injected
 * `Rng` when a piece starts: production passes `crypto`, tests a seeded one.
 */

/** The kit an anvil can hold (V-FORGE-8, V-POST-11). Lure, lantern and satchel belong to scouts' seats. */
export const ANVIL_KITS = ['tongs', 'loupe'] as const;
export type AnvilKit = (typeof ANVIL_KITS)[number];
export const isAnvilKit = (kit: string): kit is AnvilKit =>
  (ANVIL_KITS as readonly string[]).includes(kit);

/** The five kit names the valley knows (every kit is bought once, for the same price). */
export const KIT_NAMES = ['lure', 'lantern', 'satchel', 'tongs', 'loupe'] as const;

/** A tolerance so progress "exactly" at a boundary counts as reached (splits agree). */
const EPSILON = 1e-6;
const HOUR_MS = 3_600_000;

// --- Seats (V-POST-2, V-FORGE-6) ---

/** The most anvils a Forge of this level allows (the level counts from 1). */
export const anvilLimit = (rules: Pick<ValleyRules, 'seats'>, level: number): number =>
  rules.seats.anvilByLevel[Math.min(Math.max(1, level), rules.seats.anvilByLevel.length) - 1] ?? 0;

/** What an anvil costs: Acorns and scrap ("unlocked with their own Acorns and scrap", V-FORGE-6). */
export interface AnvilPrice {
  readonly acorns: number;
  readonly scrap: number;
}

/**
 * What the next anvil costs for a player who owns `owned` of them (rising, dearer at a higher place level), or null when the Forge's
 * level allows no more.
 */
export function anvilPrice(
  rules: Pick<ValleyRules, 'seats'>,
  owned: number,
  level: number,
): AnvilPrice | null {
  const acorns = rules.seats.anvilPrices[owned];
  const scrap = rules.seats.anvilScrap[owned];
  if (owned >= anvilLimit(rules, level) || acorns === undefined || scrap === undefined) return null;
  const surcharge = 1 + rules.seats.levelSurcharge * (Math.max(1, level) - 1);
  return { acorns: Math.ceil(acorns * surcharge), scrap: Math.ceil(scrap * surcharge) };
}

// --- Odds of a piece (V-FORGE-8, V-FORGE-9) ---

export type RarityIndex = 0 | 1 | 2;
export type Odds = readonly [number, number, number];

/** V-FORGE-9: the one-step-up chance a blueprint's well-thumbed marks give (0 up to 1). */
export const marksStepUp = (marks: number): number =>
  (Math.min(Math.max(0, Math.trunc(marks)), GAME.gear.craft.marks.max) *
    GAME.gear.craft.marks.upBp) /
  10_000;

/**
 * The odds [common, rare, epic] of a piece: a plain order's `baseOdds` or its Reach's; a loupe lifts the rare and epic share
 * (V-FORGE-8); the blueprint's marks then give each step a chance to rise one rarity (V-FORGE-9, as shipped crafting does).
 */
export function pieceOdds(
  rules: Pick<ValleyRules, 'forge' | 'kit'>,
  reach: ReachId,
  loupe: boolean,
  stepUp: number,
): Odds {
  const base = (reach === 'none'
    ? rules.forge.baseOdds
    : rules.forge.reach[reach].odds) as unknown as Odds;
  let common: number = base[0];
  let rare: number = base[1];
  let epic: number = base[2];
  if (loupe) {
    const lift = rules.kit.loupe.rarityOdds;
    rare *= lift;
    epic *= lift;
    common = Math.max(0, 1 - rare - epic);
  }
  const up = Math.min(1, Math.max(0, stepUp));
  return [common * (1 - up), rare * (1 - up) + common * up, epic + rare * up];
}

const TWO_32 = 0x1_0000_0000;

/** The rarity (0 common, 1 rare, 2 epic) from odds [common, rare, epic] and one uniform draw. */
export function rollRarity(rng: Rng, odds: Odds): RarityIndex {
  const point = (rng.nextU32() / TWO_32) * (odds[0] + odds[1] + odds[2]);
  if (point < odds[0]) return 0;
  return point < odds[0] + odds[1] ? 1 : 2;
}

/** How fast an anvil works relative to the plain pace: mastery, tongs (common pieces only) and the loupe (V-FORGE-7, 8). */
export function anvilSpeed(
  rules: Pick<ValleyRules, 'posts' | 'kit'>,
  smithHours: number,
  kit: AnvilKit | null,
  rarity: RarityIndex,
): number {
  let speed = 1 + masteryBonus(rules, smithHours + 1e-9);
  if (kit === 'tongs' && rarity === 0) speed *= rules.kit.tongs.speed;
  if (kit === 'loupe') speed *= rules.kit.loupe.speed;
  return speed;
}

/** The hours a piece takes at the plain pace: the order's Reach or the plain 16. */
export const pieceHours = (rules: Pick<ValleyRules, 'forge'>, reach: ReachId): number =>
  reach === 'none' ? rules.forge.pieceHours : rules.forge.reach[reach].hours;

/** The Essence a piece's Reach takes when it starts (0 for a plain one). */
export const reachEssence = (rules: Pick<ValleyRules, 'forge'>, reach: ReachId): number =>
  reach === 'none' ? 0 : rules.forge.reach[reach].essence;

/** The item level below which a slot is "weaker" than the fire allows (V-FORGE-1: empty counts as 0, so it is always weak at the start). */
export const weakLimit = (rules: Pick<ValleyRules, 'forge'>, fire: number): number =>
  Math.max(1, fire - rules.forge.weakMargin);

// --- The queue, the shelf and the floor (V-FORGE-1 to 5) ---

/** Why an anvil tinkers instead of making a piece (V-FORGE-2, V-FORGE-4, F-1). */
export type AnvilWait = 'idle' | 'scrap' | 'shard' | 'essence' | 'floor';

/** One order of an anvil's queue. Pieces are counted when they reach the floor (`made`). */
export interface SettleOrder {
  readonly id: string;
  /** The blueprint's base; null for "for my team". */
  readonly blueprint: string | null;
  /** The element index of the shard a piece takes (0 to 4 in `VALLEY_ELEMENTS`), -1: any pile (a neutral base) or, for a team order, chosen per piece. */
  readonly element: number;
  /** Pieces asked for; ignored (0) for a team order, which goes on until the team is dressed. */
  readonly count: number;
  readonly made: number;
  readonly reach: ReachId;
  readonly forTeam: boolean;
  /** The blueprint's marks as a one-step-up chance (`marksStepUp`; V-FORGE-9). */
  readonly stepUp: number;
}

/** A piece on the anvil: in progress, or finished and held because the floor is full (progress at `need`). */
export interface SettlePiece {
  readonly order: string | null;
  readonly blueprint: string | null;
  readonly forTeam: boolean;
  readonly element: number;
  readonly rarity: RarityIndex;
  readonly reach: ReachId;
  readonly need: number;
  readonly progress: number;
}

export interface SettleAnvil {
  readonly id: string;
  /** The index in `creatures` of the smith; -1: no smith, the anvil does nothing. */
  readonly creature: number;
  readonly kit: AnvilKit | null;
  readonly orders: readonly SettleOrder[];
  readonly piece: SettlePiece | null;
  /** Pieces on this anvil's floor (V-FORGE-5). */
  readonly floor: number;
  /** Output: why the anvil tinkers now (null: working, or no smith). */
  readonly wait?: AnvilWait | null;
  /** Output: the element index a `shard` wait is for (-1: none, or any). */
  readonly waitElement?: number;
  /** The moment the current wait began (ms; null: not waiting). */
  readonly waitSince?: number | null;
}

/** The player's stockpile an order takes its inputs from (V-FORGE-3): whole scrap, shards by element, Essence. */
export interface SettleShelf {
  readonly scrap: number;
  readonly shards: readonly number[];
  readonly essence: number;
}

export interface SettleForge {
  readonly anvils: readonly SettleAnvil[];
  readonly shelf: SettleShelf;
  /** Tinkering scrap not yet whole (0 up to 1). */
  readonly scrapCarry: number;
  /** "For my team": weak slots by element, as the pass starts (`weakLimit`). */
  readonly weak: readonly number[];
  /** Team pieces already on their way (in progress, held or on the floor) by element. */
  readonly pending: readonly number[];
  /** The Forge's fire: the item level of every piece that comes out (V-FORGE-7). */
  readonly fireLevel: number;
}

/** A finished piece that reached a floor (output of the pass; the worker stores it and rolls the item when it comes home). */
export interface MadePiece {
  readonly anvil: string;
  readonly at: number;
  readonly order: string | null;
  readonly blueprint: string | null;
  readonly forTeam: boolean;
  readonly element: number;
  readonly rarity: RarityIndex;
  readonly itemLevel: number;
}

/** Effective anvil hours by what the anvils were doing (T-4: the share spent tinkering, and why). */
export interface ForgeHours {
  work: number;
  scrap: number;
  shard: number;
  essence: number;
  floor: number;
  idle: number;
}

export const NO_FORGE_HOURS: ForgeHours = {
  work: 0,
  scrap: 0,
  shard: 0,
  essence: 0,
  floor: 0,
  idle: 0,
};

/** The anvil's current order: the first that is not done (a team order never is). */
export const currentOrder = (orders: readonly SettleOrder[]): SettleOrder | undefined =>
  orders.find((o) => o.forTeam || o.made < o.count);

/**
 * Which element the next "for my team" piece is for: among the elements the team needs and the shelf has, the fullest pile; with no
 * pile ready, the fullest of the wanted (the anvil then waits for it). -1: the team needs nothing.
 */
export function chooseTeamElement(
  rules: Pick<ValleyRules, 'forge'>,
  weak: readonly number[],
  pending: readonly number[],
  shards: readonly number[],
): number {
  const wanted: number[] = [];
  for (let e = 0; e < VALLEY_ELEMENTS.length; e++) {
    if ((weak[e] ?? 0) - (pending[e] ?? 0) > 0) wanted.push(e);
  }
  if (wanted.length === 0) return -1;
  const stocked = wanted.filter((e) => (shards[e] ?? 0) >= rules.forge.shard);
  const pool = stocked.length > 0 ? stocked : wanted;
  return pool.reduce(
    (best, e) => ((shards[e] ?? 0) > (shards[best] ?? 0) ? e : best),
    pool[0] as number,
  );
}

/** The element of the fullest pile (the lowest index on a tie). */
export function fullestPile(shards: readonly number[]): number {
  let best = 0;
  for (let e = 1; e < VALLEY_ELEMENTS.length; e++) {
    if ((shards[e] ?? 0) > (shards[best] ?? 0)) best = e;
  }
  return best;
}

/** What an order asks of the shelf for its next piece (the element is the team's current one for a team order, when `weak` is given). */
export interface OrderNeeds {
  readonly scrap: number;
  /** The element index of the shard (-1: any pile). */
  readonly element: number;
  readonly shard: number;
  readonly essence: number;
}

/**
 * What one piece of an order takes of scrap and shards: the Forge's plain price, or a patchwork blueprint's own (V-FORGE-12, content data).
 * The shard is of one element: the order's, or for an order that names none, the pile held most when the piece starts.
 */
export function pieceCost(
  rules: Pick<ValleyRules, 'forge'>,
  blueprint: string | null,
): { scrap: number; shard: number } {
  const patch = blueprint === null ? undefined : patchworkBlueprint(blueprint);
  return patch === undefined
    ? { scrap: rules.forge.scrap, shard: rules.forge.shard }
    : { scrap: patch.scrap, shard: patch.shards };
}

/** Whether an order is for a patchwork blueprint (it takes shards of any element and never reaches for rarity). */
export const isPatchworkOrder = (order: Pick<SettleOrder, 'blueprint'>): boolean =>
  order.blueprint !== null && patchworkBlueprint(order.blueprint) !== undefined;

/** The Reach an order really has: a patchwork piece is always a plain one (V-FORGE-12: Common or Rare only). */
export const orderReach = (order: Pick<SettleOrder, 'blueprint' | 'reach'>): ReachId =>
  isPatchworkOrder(order) ? 'none' : order.reach;

export function orderNeeds(
  rules: Pick<ValleyRules, 'forge'>,
  order: SettleOrder,
  teamElement: number,
): OrderNeeds {
  const cost = pieceCost(rules, order.blueprint);
  return {
    scrap: cost.scrap,
    element: order.forTeam ? teamElement : order.element,
    shard: cost.shard,
    essence: reachEssence(rules, orderReach(order)),
  };
}

// --- The working copy the pass steps ---

interface WorkAnvil {
  id: string;
  creature: number;
  kit: AnvilKit | null;
  orders: SettleOrder[];
  piece: SettlePiece | null;
  floor: number;
  wait: AnvilWait | null;
  waitElement: number;
  waitSince: number | null;
  /** What it does in the stretch about to be advanced. */
  mode: 'work' | AnvilWait | 'none';
}

export interface ForgeWork {
  anvils: WorkAnvil[];
  scrap: number;
  scrapCarry: number;
  shards: number[];
  essence: number;
  pending: number[];
  readonly weak: readonly number[];
  readonly fireLevel: number;
  made: MadePiece[];
  finished: string[];
  hours: ForgeHours;
  /** The broker's change in shards owed to its house (0 up to 1; V-FORGE-11) and what it traded in this pass. */
  brokerCredit: number;
  brokered: BrokerTally;
}

export function startForge(forge: SettleForge, brokerCredit = 0): ForgeWork {
  return {
    anvils: forge.anvils.map((a) => ({
      id: a.id,
      creature: a.creature,
      kit: a.kit,
      orders: [...a.orders],
      piece: a.piece,
      floor: a.floor,
      wait: a.wait ?? null,
      waitElement: a.waitElement ?? -1,
      waitSince: a.waitSince ?? null,
      mode: 'none',
    })),
    scrap: forge.shelf.scrap,
    scrapCarry: forge.scrapCarry,
    shards: [...forge.shelf.shards],
    essence: forge.shelf.essence,
    pending: [...forge.pending],
    weak: forge.weak,
    fireLevel: forge.fireLevel,
    made: [],
    finished: [],
    hours: { ...NO_FORGE_HOURS },
    brokerCredit,
    brokered: { trades: 0, paid: 0, got: 0, crits: 0 },
  };
}

export function finishForge(work: ForgeWork, previous: SettleForge): SettleForge {
  return {
    anvils: work.anvils.map((a) => ({
      id: a.id,
      creature: a.creature,
      kit: a.kit,
      orders: a.orders,
      piece: a.piece,
      floor: a.floor,
      wait: a.creature < 0 ? null : a.wait,
      waitElement: a.waitElement,
      waitSince: a.creature < 0 || a.wait === null ? null : a.waitSince,
    })),
    shelf: { scrap: work.scrap, shards: work.shards, essence: work.essence },
    scrapCarry: work.scrapCarry,
    weak: previous.weak,
    pending: work.pending,
    fireLevel: previous.fireLevel,
  };
}

/** What the forge step needs of a creature. */
export interface ForgeSmith {
  readonly smithHours: number;
  readonly joinedAt?: number | undefined;
}

const pieceDone = (piece: SettlePiece): boolean => piece.progress >= piece.need - EPSILON;

function active(a: WorkAnvil, smiths: readonly ForgeSmith[], at: number): boolean {
  const smith = smiths[a.creature];
  return smith !== undefined && !(smith.joinedAt !== undefined && smith.joinedAt > at);
}

/** Starts a piece on an idle anvil if it has an order and the inputs; otherwise sets what it waits on. */
function tryStart(rules: ValleyRules, work: ForgeWork, a: WorkAnvil, rng: Rng): boolean {
  const order = currentOrder(a.orders);
  a.waitElement = -1;
  if (order === undefined) {
    a.wait = 'idle';
    return false;
  }
  let element = order.element;
  if (order.forTeam) {
    element = chooseTeamElement(rules, work.weak, work.pending, work.shards);
    if (element < 0) {
      a.wait = 'idle';
      return false;
    }
  }
  const cost = pieceCost(rules, order.blueprint);
  const patchwork = isPatchworkOrder(order);
  const reach = orderReach(order);
  if (work.scrap < cost.scrap) {
    a.wait = 'scrap';
    return false;
  }
  // An order that names no element (a neutral base, or patchwork left on "most held") takes the biggest pile as it stands now.
  const pile = element >= 0 ? element : fullestPile(work.shards);
  if ((work.shards[pile] ?? 0) < cost.shard) {
    a.wait = 'shard';
    a.waitElement = pile;
    return false;
  }
  const essence = reachEssence(rules, reach);
  if (work.essence < essence) {
    a.wait = 'essence';
    return false;
  }
  work.scrap -= cost.scrap;
  work.shards[pile] = (work.shards[pile] ?? 0) - cost.shard;
  work.essence -= essence;
  const drawn = rollRarity(rng, pieceOdds(rules, reach, a.kit === 'loupe', order.stepUp));
  // V-FORGE-12: a patchwork piece is never better than the blueprint's cap (an Epic draw becomes a Rare one).
  const rarity = (patchwork ? Math.min(drawn, patchworkMaxRarity()) : drawn) as RarityIndex;
  a.piece = {
    order: order.id,
    blueprint: order.blueprint,
    forTeam: order.forTeam,
    element: order.forTeam ? element : patchwork ? pile : order.element,
    rarity,
    reach,
    need: pieceHours(rules, reach),
    progress: 0,
  };
  if (order.forTeam) work.pending[element] = (work.pending[element] ?? 0) + 1;
  a.wait = null;
  return true;
}

/**
 * What happens at the moment `at`, for each anvil with a smith in turn (so a piece started on one is seen by the next): a finished
 * piece goes to its floor, or is held when the floor is full (the anvil pauses and tinkers, F-1); an idle anvil starts a piece or says
 * what it waits on. Sets each anvil's mode for the stretch that follows. Idempotent: running it twice at one moment changes nothing.
 */
export function forgeInstants(
  rules: ValleyRules,
  work: ForgeWork,
  smiths: readonly ForgeSmith[],
  at: number,
  rng: Rng,
  broker: BrokerTerms | null = null,
): void {
  const instant = (a: WorkAnvil): void => {
    const waitWas = a.wait;
    anvilInstant(rules, work, a, at, rng);
    // The wait began when the reason first held (the start of the stretch that found it), and ends when work starts.
    if (a.wait === null) a.waitSince = null;
    else if (a.wait !== waitWas || a.waitSince === null) a.waitSince = at;
  };
  for (const a of work.anvils) {
    a.mode = 'none';
    if (!active(a, smiths, at)) continue;
    instant(a);
  }
  if (broker === null) return;
  // V-FORGE-11: the broker tops up what the orders wait on from the spare piles, then the anvils that waited try again, until nothing
  // more can be traded: a fixed point, so settling again at the same moment (or at a split point) changes nothing.
  for (;;) {
    if (!brokerTrade(rules, work, smiths, at, broker, rng)) break;
    for (const a of work.anvils) {
      if (a.mode === 'shard') instant(a);
    }
  }
}

function anvilInstant(
  rules: ValleyRules,
  work: ForgeWork,
  a: WorkAnvil,
  at: number,
  rng: Rng,
): void {
  {
    if (a.piece !== null && pieceDone(a.piece)) {
      if (a.floor >= rules.forge.floorPiecesPerAnvil) {
        a.wait = 'floor';
        a.waitElement = -1;
        a.mode = 'floor';
        return;
      }
      const piece = a.piece;
      a.floor += 1;
      a.piece = null;
      work.made.push({
        anvil: a.id,
        at,
        order: piece.order,
        blueprint: piece.blueprint,
        forTeam: piece.forTeam,
        element: piece.element,
        rarity: piece.rarity,
        itemLevel: work.fireLevel,
      });
      const index = a.orders.findIndex((o) => o.id === piece.order);
      const order = a.orders[index];
      if (order !== undefined) {
        const made = order.made + 1;
        if (!order.forTeam && made >= order.count) {
          a.orders = a.orders.filter((o) => o.id !== order.id);
          work.finished.push(order.id);
        } else a.orders[index] = { ...order, made };
      }
    }
    if (a.piece === null) {
      if (!tryStart(rules, work, a, rng)) {
        a.mode = a.wait ?? 'idle';
        return;
      }
    }
    a.wait = null;
    a.mode = 'work';
  }
}

function anvilRate(rules: ValleyRules, a: WorkAnvil, smith: ForgeSmith): number {
  const piece = a.piece;
  return piece === null ? 0 : anvilSpeed(rules, smith.smithHours, a.kit, piece.rarity);
}

/**
 * The next moment (ms after `cursor`) the anvils' rates change by themselves: a piece finishes, a smith's mastery steps up, or the
 * tinkering scrap makes a waiting order affordable. Infinity when none does.
 */
export function forgeBoundary(
  rules: ValleyRules,
  work: ForgeWork,
  smiths: readonly ForgeSmith[],
  share: number,
  cursor: number,
): number {
  let next = Number.POSITIVE_INFINITY;
  if (share <= 0) return next;
  let tinkering = 0;
  // The scrap the cheapest waiting order lacks of its price (a patchwork piece costs its own, V-FORGE-12): none waits: Infinity.
  let cheapestScrap = Number.POSITIVE_INFINITY;
  const waitsOnScrap = (): boolean => cheapestScrap < Number.POSITIVE_INFINITY;
  for (const a of work.anvils) {
    if (a.mode === 'none') continue;
    const smith = smiths[a.creature] as ForgeSmith;
    const step = rules.posts.mastery.find((m) => m.hours > smith.smithHours + EPSILON);
    if (step !== undefined) {
      next = Math.min(
        next,
        cursor + Math.ceil(((step.hours - smith.smithHours) / share) * HOUR_MS),
      );
    }
    if (a.mode === 'work' && a.piece !== null) {
      const left = a.piece.need - a.piece.progress;
      const rate = share * anvilRate(rules, a, smith);
      if (left > EPSILON && rate > 0)
        next = Math.min(next, cursor + Math.ceil((left / rate) * HOUR_MS));
    } else {
      tinkering += 1;
      if (a.mode === 'scrap') {
        const waiting = currentOrder(a.orders);
        cheapestScrap = Math.min(cheapestScrap, pieceCost(rules, waiting?.blueprint ?? null).scrap);
      }
    }
  }
  if (waitsOnScrap() && tinkering > 0) {
    const missing = cheapestScrap - (work.scrap + work.scrapCarry);
    const perHour = (tinkering * share) / rules.forge.tinkerScrapEveryHours;
    if (missing > 1e-9) next = Math.min(next, cursor + Math.ceil((missing / perHour) * HOUR_MS));
  }
  return next;
}

/**
 * Advances every anvil by `effective` hours (the away share times the stretch): a working anvil's piece progresses, a tinkering one
 * pays scrap into the shelf (V-FORGE-2), and every smith's smithing hours grow (V-POST-12). Returns the hours each smith gained,
 * by creature index. The stretch must not cross a `forgeBoundary`.
 */
export function forgeAdvance(
  rules: ValleyRules,
  work: ForgeWork,
  smiths: readonly ForgeSmith[],
  effective: number,
): Map<number, number> {
  const grown = new Map<number, number>();
  if (effective <= 0) return grown;
  let tinkering = 0;
  for (const a of work.anvils) {
    if (a.mode === 'none') continue;
    const smith = smiths[a.creature] as ForgeSmith;
    grown.set(a.creature, (grown.get(a.creature) ?? 0) + effective);
    if (a.mode === 'work' && a.piece !== null) {
      const progress = a.piece.progress + effective * anvilRate(rules, a, smith);
      a.piece = {
        ...a.piece,
        progress: progress >= a.piece.need - EPSILON ? a.piece.need : progress,
      };
      work.hours.work += effective;
    } else {
      tinkering += 1;
      work.hours[a.mode === 'work' ? 'idle' : a.mode] += effective;
    }
  }
  if (tinkering > 0) {
    const total = work.scrapCarry + (tinkering * effective) / rules.forge.tinkerScrapEveryHours;
    const whole = Math.floor(total + 1e-9);
    work.scrap += whole;
    work.scrapCarry = Math.max(0, total - whole);
  }
  return grown;
}

// --- The shard exchange (V-FORGE-10) ---

/** One trade at the exchange: 3 shards of another element for 1 of the one an order needs, with a small chance of a crit (2). */
export interface ExchangeTrade {
  /** The element index paid. */
  readonly from: number;
  readonly to: number;
  readonly paid: number;
  readonly got: number;
  readonly crit: boolean;
}

/**
 * Trades `times` times for `to` from the shelf's piles: a trade takes `rate` shards of `from` (or, with `from` null, of the biggest other
 * pile that can pay) and gives 1 shard of `to`, or `critYield` with `critChance`. Stops when no pile can pay. The shelf is not changed;
 * the caller applies the trades.
 */
export function exchangeShards(
  rules: Pick<ValleyRules, 'forge'>,
  rng: Rng,
  shards: readonly number[],
  to: number,
  from: number | null,
  times: number,
): ExchangeTrade[] {
  const { rate, critChance, critYield } = rules.forge.exchange;
  const left = [...shards];
  const trades: ExchangeTrade[] = [];
  for (let i = 0; i < times; i++) {
    let donor = from;
    if (donor === null) {
      let best = rate - 1e-9;
      for (let e = 0; e < VALLEY_ELEMENTS.length; e++) {
        if (e !== to && (left[e] ?? 0) > best) {
          best = left[e] ?? 0;
          donor = e;
        }
      }
    }
    if (donor === null || donor === to || (left[donor] ?? 0) < rate - 1e-9) break;
    left[donor] = (left[donor] ?? 0) - rate;
    const crit = rng.nextU32() / TWO_32 < critChance;
    trades.push({ from: donor, to, paid: rate, got: crit ? critYield : 1, crit });
  }
  return trades;
}

// --- The broker (V-FORGE-11) ---

/** What the broker trades at, at the moment (from its creature's trading mastery) and what it keeps stocked besides the orders' needs. */
export interface BrokerTerms {
  /** Shards of another element for 1 (not a whole number: a trade pays the next whole number and the change is kept in `credit`). */
  readonly rate: number;
  readonly critChance: number;
  /** The element index it keeps a small stock of whatever the orders need (-1: only what the orders wait on). */
  readonly toward: number;
}

/** What the broker traded in a pass: trades made, shards paid and received, and how many were crits. */
export interface BrokerTally {
  trades: number;
  paid: number;
  got: number;
  crits: number;
}

/** The rate and crit chance of the broker at `tradeHours` of trading (V-POST-12's steps: none, Skilled, Expert, Master). */
export function brokerTermsAt(
  rules: Pick<ValleyRules, 'broker' | 'posts'>,
  tradeHours: number,
): { rate: number; critChance: number } {
  const step = rules.posts.mastery.filter((m) => tradeHours + 1e-9 >= m.hours).length;
  const tiers = rules.broker.tiers;
  const tier = tiers[Math.min(step, tiers.length - 1)] ?? tiers[0];
  return { rate: tier?.rate ?? 3, critChance: tier?.critChance ?? 0 };
}

/** How many pieces ahead of an anvil's current one the broker keeps shards for (the lab: up to 3 orders an anvil). */
const BROKER_AHEAD = 3;

/** The shards of each element the broker wants on the shelf now: the orders' next pieces (and the team's weak slots), and its `toward`. */
function brokerWants(
  rules: ValleyRules,
  work: ForgeWork,
  smiths: readonly ForgeSmith[],
  at: number,
  toward: number,
): number[] {
  const want = new Array<number>(VALLEY_ELEMENTS.length).fill(0);
  let teamAnvils = 0;
  for (const a of work.anvils) {
    if (!active(a, smiths, at)) continue;
    const order = currentOrder(a.orders);
    if (order === undefined) continue;
    if (order.forTeam) {
      teamAnvils += 1;
      continue;
    }
    if (order.element < 0) continue;
    const inHand = a.piece !== null && a.piece.order === order.id ? 1 : 0;
    const left = Math.min(BROKER_AHEAD, Math.max(0, order.count - order.made - inHand));
    want[order.element] =
      (want[order.element] ?? 0) + left * pieceCost(rules, order.blueprint).shard;
  }
  if (teamAnvils > 0) {
    for (let e = 0; e < want.length; e++) {
      const pieces = Math.min(
        (work.weak[e] ?? 0) - (work.pending[e] ?? 0),
        teamAnvils * BROKER_AHEAD,
      );
      if (pieces > 0) want[e] = (want[e] ?? 0) + pieces * rules.forge.shard;
    }
  }
  if (toward >= 0 && toward < want.length) {
    want[toward] = Math.max(want[toward] ?? 0, BROKER_AHEAD * rules.forge.shard);
  }
  return want;
}

/**
 * One round of the broker's trades at a moment: for each element short of what is wanted (the biggest want first), it pays the
 * biggest spare pile (above the shards the player keeps, `forge.giveReserveShards`) the next whole number of shards for 1, with the
 * crit chance of `critYield`, until the element is stocked or no pile can pay. Returns whether anything was traded.
 */
function brokerTrade(
  rules: ValleyRules,
  work: ForgeWork,
  smiths: readonly ForgeSmith[],
  at: number,
  broker: BrokerTerms,
  rng: Rng,
): boolean {
  const want = brokerWants(rules, work, smiths, at, broker.toward);
  const keep = rules.forge.giveReserveShards;
  const order = want
    .map((w, e) => ({ w, e }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || a.e - b.e);
  let traded = false;
  for (const { w, e } of order) {
    while ((work.shards[e] ?? 0) < w) {
      const pay = Math.max(1, Math.ceil(broker.rate - work.brokerCredit - 1e-9));
      let donor = -1;
      let best = pay - 1;
      for (let d = 0; d < work.shards.length; d++) {
        const spare = (work.shards[d] ?? 0) - keep;
        if (d !== e && spare > best) {
          best = spare;
          donor = d;
        }
      }
      if (donor < 0) break;
      work.shards[donor] = (work.shards[donor] ?? 0) - pay;
      work.brokerCredit = Math.max(0, work.brokerCredit + pay - broker.rate);
      const crit = rng.nextU32() / TWO_32 < broker.critChance;
      const got = crit ? rules.forge.exchange.critYield : 1;
      work.shards[e] = (work.shards[e] ?? 0) + got;
      work.brokered.trades += 1;
      work.brokered.paid += pay;
      work.brokered.got += got;
      if (crit) work.brokered.crits += 1;
      traded = true;
    }
  }
  return traded;
}
