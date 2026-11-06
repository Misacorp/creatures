import { VALLEY_ELEMENTS, type KitName, type ValleyDestination, type ValleyRules } from './rules';
import { kitTilt, type ScoutKit } from './scouts';

/**
 * The player policies (phase 5 step 10): the choices a lab player and a staging bot make at a visit, as pure functions of plain numbers. The
 * lab (`@creatures/econ`, `policy.ts` and `commons.ts`) builds the inputs from its model of a player; the worker's bots (`valley-bots.ts`)
 * build them from the player's real state, then send the picked intents through the same code paths players use. One module, so a bot of
 * a kind plays the way the lab's player of that kind does.
 *
 * What is shared: which seat or kit to buy (`choosePurchase`), where scouts go and which kit they carry (`defaultDestination`, `needsOf`,
 * `retiltPlan`, `anvilKitFor`), who takes a free seat (`pickFreeCreature`), the evolution order (`evolutionOrder`) and how much of the income
 * goes to the projects (`giftBudgetAfterIncome`, `giftAmount`, `isHoarding`, `isDumping`, `keepOf`).
 *
 * What only one side has: the lab models the dungeon's and the raid's gear, honours' boxes, tempering and the idol; the server has none of
 * them in the bots (their fights are stand-ins that pay the lab's inputs). The server has the Paddock gate, the School's seats, the visitor's
 * stall and keyed spends, which the bots drive and the lab only prices.
 */

const ELEMENT_COUNT = VALLEY_ELEMENTS.length;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

export type PlayerPolicy = 'setAndForget' | 'optimiser';

// ---------- what to buy: seats first, kit with Acorns to spare (V-POST-2, V-POST-11) ----------

/** What the player's next seat of one kind costs (null in the list: none left to buy). */
export interface SeatOffer {
  readonly kind: 'scout' | 'anvil';
  readonly acorns: number;
  readonly scrap: number;
}

export interface PurchaseInput {
  readonly acorns: number;
  readonly scrap: number;
  /** The next scout seat and the next anvil, in this order (a kind with none left is left out). */
  readonly offers: readonly SeatOffer[];
  /** The kit the policy would buy next (`nextKit`), null when it buys none. */
  readonly kit: KitName | null;
  readonly kitPrice: number;
}

export type Purchase =
  | { readonly kind: 'seat'; readonly offer: SeatOffer }
  | { readonly kind: 'kit'; readonly kit: KitName }
  | null;

/** The kit a player of this policy buys next: the buy order, a set-and-forget player stopping after a few. */
export function nextKit(
  rules: Pick<ValleyRules, 'kit'>,
  owned: readonly KitName[],
  policy: PlayerPolicy,
): KitName | null {
  const have = rules.kit.buyOrder.filter((k) => owned.includes(k)).length;
  const limit = policy === 'optimiser' ? rules.kit.buyOrder.length : rules.kit.setAndForgetBuys;
  if (have >= limit) return null;
  return rules.kit.buyOrder.find((k) => !owned.includes(k)) ?? null;
}

/**
 * The next purchase: the cheapest seat the player can afford, else the next kit when there are Acorns to spare after the cheapest seat's
 * price. Called again after each purchase until it answers null.
 */
export function choosePurchase(input: PurchaseInput): Purchase {
  const cheapest = [...input.offers].sort((a, b) => a.acorns - b.acorns)[0];
  if (cheapest && input.acorns >= cheapest.acorns && input.scrap >= cheapest.scrap) {
    return { kind: 'seat', offer: cheapest };
  }
  if (input.kit === null) return null;
  const spare = input.acorns - input.kitPrice - (cheapest?.acorns ?? 0);
  return spare < 0 ? null : { kind: 'kit', kit: input.kit };
}

// ---------- where scouts go (the optimiser re-tilts, V-POST-11) ----------

/**
 * Where a new seat's scout starts: the place of the element of the player's best creatures, one element per seat in turn. `rankedElements`
 * is the element index of each creature, best first. A set-and-forget player keeps it.
 */
export function defaultDestination(
  rules: Pick<ValleyRules, 'scouts'>,
  rankedElements: readonly number[],
  seatsOwned: number,
): number {
  const { destinations } = rules.scouts;
  const elements = [...new Set(rankedElements)];
  const element = elements[seatsOwned % Math.max(1, elements.length)];
  const found = destinations.findIndex(
    (d) => d.element !== null && VALLEY_ELEMENTS.indexOf(d.element) === element,
  );
  return found >= 0 ? found : seatsOwned % destinations.length;
}

const needFactor = (stock: number, target: number): number => clamp(1.6 - stock / target, 0.2, 1.6);

export interface Needs {
  scrap: number;
  shard: number[];
  creature: number;
}

export interface NeedsInput {
  readonly scrap: number;
  /** Shards held, by element index. */
  readonly shards: readonly number[];
  /** Creatures owned, by element index. */
  readonly elementCounts: readonly number[];
  readonly creatures: number;
  /** Kinds (lines) owned, and the kinds the scouts can find now. */
  readonly kindsOwned: number;
  readonly kindsAvailable: number;
}

/** What the player needs now: scrap, shards of the elements their creatures wear, and newcomers while kinds are missing. */
export function needsOf(input: NeedsInput): Needs {
  const n = Math.max(1, input.creatures);
  return {
    scrap: needFactor(input.scrap, 150),
    shard: VALLEY_ELEMENTS.map((_, e) => {
      const share = (input.elementCounts[e] ?? 0) / n;
      return needFactor(input.shards[e] ?? 0, 8) * (0.4 + 2 * share);
    }),
    creature: input.kindsOwned < input.kindsAvailable * 0.9 ? 1.3 : 0.3,
  };
}

function seatScore(
  rules: Pick<ValleyRules, 'scouts' | 'kit'>,
  d: ValleyDestination,
  second: boolean,
  needs: Needs,
  kit: KitName | null,
): number {
  const r = rules.scouts.perHour;
  const rich = (f: ValleyDestination['rich']): number =>
    d.rich === f ? rules.scouts.richMultiplier : 1;
  const tilt = kitTilt(rules, kit as ScoutKit | null);
  const e = d.element === null ? -1 : VALLEY_ELEMENTS.indexOf(d.element);
  const shardNeed = e >= 0 ? (needs.shard[e] ?? 1) : sum(needs.shard.slice(0, 4)) / 4;
  const rare = rich('rare') * tilt.rare;
  return (
    r.scrap * rich('scrap') * tilt.scrap * needs.scrap +
    r.shards * rich('shards') * tilt.shards * shardNeed * 2 +
    r.creatures *
      rich('creatures') *
      tilt.creatures *
      (second ? rules.scouts.secondScoutCreatures : 1) *
      needs.creature *
      20 +
    rare * (r.gear * 6 + r.blueprints * 8 + r.rareFinds * 60 + r.pages * 2)
  );
}

/**
 * An optimiser's re-tilt: the destination of every scout seat (an index into `rules.scouts.destinations`) and the scout kit that together
 * serve the needs best. `kitsOwned` are the scout kits the player owns. Null when there are no seats.
 */
export function retiltPlan(
  rules: Pick<ValleyRules, 'scouts' | 'kit'>,
  needs: Needs,
  seats: number,
  kitsOwned: readonly KitName[],
): { kit: KitName | null; dests: number[] } | null {
  const kits: (KitName | null)[] = [
    null,
    ...(['lure', 'lantern', 'satchel'] as const).filter((k) => kitsOwned.includes(k)),
  ];
  let best: { kit: KitName | null; dests: number[]; total: number } | null = null;
  for (const kit of kits) {
    const dests: number[] = [];
    let total = 0;
    for (let i = 0; i < seats; i++) {
      let pick = 0;
      let top = -Infinity;
      rules.scouts.destinations.forEach((d, di) => {
        const s = seatScore(rules, d, dests.includes(di), needs, kit);
        if (s > top) {
          top = s;
          pick = di;
        }
      });
      dests.push(pick);
      total += top;
    }
    if (!best || total > best.total) best = { kit, dests, total };
  }
  return best ? { kit: best.kit, dests: best.dests } : null;
}

/** The kit an optimiser's anvils carry: the loupe once there is Essence for its Reach, else the tongs, else the loupe if that is all. */
export function anvilKitFor(
  owned: { readonly loupe: boolean; readonly tongs: boolean },
  essence: number,
  loupeEssence = 130,
): 'loupe' | 'tongs' | null {
  if (owned.loupe && essence >= loupeEssence) return 'loupe';
  if (owned.tongs) return 'tongs';
  return owned.loupe ? 'loupe' : null;
}

// ---------- who stands at a free seat, and who evolves ----------

export interface SeatCandidate {
  readonly hours: number;
  readonly level: number;
}

/** Which creature takes a free seat: the one with the fewest hours of work, then the highest level. Returns its index, -1 for none. */
export function pickFreeCreature(candidates: readonly SeatCandidate[]): number {
  let best = -1;
  candidates.forEach((c, i) => {
    const b = best >= 0 ? candidates[best] : undefined;
    if (!b || c.hours < b.hours || (c.hours === b.hours && c.level > b.level)) best = i;
  });
  return best;
}

/** Creatures waiting at the evolve level take the Essence best first: highest level first (a stable sort keeps the roster order). */
export function evolutionOrder<T extends { readonly level: number }>(waiting: readonly T[]): T[] {
  return [...waiting].sort((a, b) => b.level - a.level);
}

// ---------- gifts to the projects (V-COM-5: "about a third of income") ----------

/** The gift budget of one resource after an income: a share of everything earned is set aside. */
export const giftBudgetAfterIncome = (budget: number, income: number, giveShare: number): number =>
  budget + Math.max(0, income) * giveShare;

/** A hoarder saves for `hoardWeeks` weeks (`week` is 1-based) and gives nothing. */
export const isHoarding = (hoardWeeks: number, week: number): boolean =>
  hoardWeeks > 0 && week <= hoardWeeks;

/** After the saving weeks a hoarder gives everything for two weeks. */
export const isDumping = (hoardWeeks: number, week: number): boolean =>
  hoardWeeks > 0 && week <= hoardWeeks + 2;

/** How much of a resource a visit gives: the spare, or the budget when it is smaller (a dumping hoarder gives all the spare). */
export const giftAmount = (budget: number, spare: number, dumping: boolean): number =>
  dumping ? spare : Math.min(budget, spare);

/** What a player keeps of one element's shards for their next orders (never under the reserve): `orders` is how many pieces they still want. */
export function keepOf(reserve: number, orders: number, shardsPerPiece: number): number {
  return Math.max(reserve, Math.max(0, orders) * shardsPerPiece);
}

/** The count of elements the policies work over (shared so a caller sizes its arrays the same). */
export const POLICY_ELEMENTS = ELEMENT_COUNT;

/** How many kinds (lines) scouts can find at an hour: today's pool, plus each content drop that has happened. */
export function speciesAvailableAt(rules: Pick<ValleyRules, 'scouts'>, hour: number): number {
  const { start, dropFromWeek, dropEveryWeeks, dropCount } = rules.scouts.species;
  const week = Math.floor(hour / 168) + 1;
  if (week < dropFromWeek) return start;
  return start + dropCount * (Math.floor((week - dropFromWeek) / dropEveryWeeks) + 1);
}
