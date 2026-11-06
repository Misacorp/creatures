import * as v from 'valibot';
import { hearthMultiplier } from './formulas';
import type { ValleyRules } from './rules';

/**
 * The commons, the pure half (phase 5 step 6, docs/design/valley/systems/commons.md): project sizes, what a project is made of, the
 * guided start, the fire's warmth and the collection boards. The lab (`packages/econ/src/commons.ts`) models the same rules; every
 * number is read from the rules, none is written here. Nothing here reads a clock or draws a number.
 */

type CommonsRules = Pick<ValleyRules, 'commons'>;
type FireRules = Pick<ValleyRules, 'fire'>;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** The parts a project is made of (Q33): Acorns, scrap and shards. */
export const PROJECT_PARTS = ['acorns', 'scrap', 'shards'] as const;
export type ProjectPart = (typeof PROJECT_PARTS)[number];

/** The currencies a gift can be (Essence goes to creatures, not buildings: round 14). */
export const GIFT_CURRENCIES = PROJECT_PARTS;

/**
 * V-COM-5: a player's weight in sizing projects. `visitDays` is how many of the last seven days the player visited, `observedDays`
 * how many days they have been in the valley (at most 7 count). A new player counts fully; a weekly player about 0.4.
 */
export function activeWeightOf(
  rules: CommonsRules,
  visitDays: number,
  observedDays: number,
): number {
  const observed = Math.min(7, Math.max(0, Math.floor(observedDays)));
  if (observed <= 0) return 1;
  const perWeek = (Math.max(0, visitDays) * 7) / observed;
  if (perWeek <= 0) return 0;
  const { oneDay, fullAtDays } = rules.commons.weight;
  return oneDay + (1 - oneDay) * clamp((perWeek - 1) / (fullAtDays - 1), 0, 1);
}

/** The visit mask is seven bits, bit 0 the day `maskDay` and bit n the day n days before it; shifted forward to `day` it drops the old days. */
export function shiftMask(mask: number, maskDay: number, day: number): number {
  const gap = Math.max(0, day - maskDay);
  return gap >= 7 ? 0 : (mask << gap) & 0x7f;
}

/** The days of the last seven set in a mask. */
export const maskDays = (mask: number): number => {
  let n = 0;
  for (let m = mask & 0x7f; m > 0; m >>= 1) n += m & 1;
  return n;
};

/** V-COM-5, V-COM-11: the size of the project that raises a place from `level` (cosmetic after the max), in Acorns' worth. */
export function projectSize(
  rules: CommonsRules,
  level: number,
  weight: number,
  place?: string,
): number {
  const c = rules.commons;
  // A one-shot place (the Market) has its own size (a share of the base), whatever its own level is.
  const own = place === undefined ? undefined : c.oneShot[place]?.sizeFactor;
  const factor =
    own ??
    (level >= c.maxLevel
      ? c.cosmeticFactor
      : (c.levelFactor[level - 1] ?? c.levelFactor.at(-1) ?? 1));
  return c.baseSize * factor * Math.pow(Math.max(weight, 1) / c.referenceWeight, c.sizeExponent);
}

/** What one unit of each part is worth toward a project, in Acorns' worth. */
export const partValue = (rules: CommonsRules, part: ProjectPart): number =>
  rules.commons.giftValue[part];

/**
 * V-COM-15, Q48 (Misa, 2026-11-06): the value of one shard of any element toward a place's project, or `undefined` when the place takes
 * shards only in its own split (the common rule, element-tied). The Market takes shards of any element, one value for all, with no cap:
 * they may fill the whole project, so the surplus piling up at the Forge builds the Market.
 */
export const anyShardValue = (rules: CommonsRules, place?: string): number | undefined =>
  place === undefined ? undefined : rules.commons.oneShot[place]?.shardValue;

/** What one unit of a part is worth toward this place's project (a shard of the Market counts at the Market's own value). */
const unitValue = (rules: CommonsRules, part: ProjectPart, place?: string): number =>
  (part === 'shards' ? anyShardValue(rules, place) : undefined) ?? partValue(rules, part);

/** The share of a project's value each part makes: the place's own split when it has one (the Market's, V-FORGE-11), else the common one (Q33). */
const splitOf = (rules: CommonsRules, place?: string) =>
  (place === undefined ? undefined : rules.commons.oneShot[place]?.costSplit) ??
  rules.commons.costSplit;

/** A place built once and then never again (V-FORGE-11: the Market). */
export const isOneShot = (rules: CommonsRules, place: string): boolean =>
  rules.commons.oneShot[place] !== undefined;

/** The units of each part a project of `size` needs: its cost split by value (Q33). */
export function partNeeds(
  rules: CommonsRules,
  size: number,
  place?: string,
): Record<ProjectPart, number> {
  const split = splitOf(rules, place);
  const any = anyShardValue(rules, place);
  return {
    acorns: (size * split.acorns) / partValue(rules, 'acorns'),
    scrap: (size * split.scrap) / partValue(rules, 'scrap'),
    // Shards of any element may stand in for the whole project (the Market): the shard "part" is as big as the project.
    shards: any === undefined ? (size * split.shards) / partValue(rules, 'shards') : size / any,
  };
}

/** What has been given toward a project, in units of each part. */
export type ProjectHave = Record<ProjectPart, number>;

/** How much of a project is filled in Acorns' worth: each part counts up to what it needs. */
export function projectProgress(
  rules: CommonsRules,
  size: number,
  have: ProjectHave,
  place?: string,
): number {
  const need = partNeeds(rules, size, place);
  const filled = PROJECT_PARTS.reduce(
    (sum, part) => sum + Math.min(have[part], need[part]) * unitValue(rules, part, place),
    0,
  );
  // Where shards may fill the whole project, the parts together never count past it.
  return anyShardValue(rules, place) === undefined ? filled : Math.min(size, filled);
}

/** Whether every part is full (the level is raised; a hair of tolerance for the communal trickle's fractions). */
export function projectDone(
  rules: CommonsRules,
  size: number,
  have: ProjectHave,
  place?: string,
): boolean {
  if (anyShardValue(rules, place) !== undefined)
    return projectProgress(rules, size, have, place) >= size - 1e-9;
  const need = partNeeds(rules, size, place);
  return PROJECT_PARTS.every((part) => have[part] >= need[part] - 1e-9);
}

/** The units of `part` a project still takes. */
export function partRoom(
  rules: CommonsRules,
  size: number,
  have: ProjectHave,
  part: ProjectPart,
  place?: string,
): number {
  const own = Math.max(0, partNeeds(rules, size, place)[part] - have[part]);
  if (anyShardValue(rules, place) === undefined) return own;
  // Where shards may stand in for any part, no part takes more than what the project still lacks.
  const left = Math.max(0, size - projectProgress(rules, size, have, place));
  return Math.min(own, left / unitValue(rules, part, place));
}

/**
 * The units a gift of shards of an element gives a place's project: the place's own element in full, any other at the exchange's rate
 * (`rate` for 1), so one scarce element never holds a project back. A place that takes shards of any element (the Market, `anyElement`)
 * counts every shard in full.
 */
export function shardUnits(amount: number, own: boolean, rate: number, anyElement = false): number {
  return own || anyElement ? amount : Math.floor(amount / rate);
}

/** V-COM-14: the value in Acorns' worth `hours` of a communal seat's work adds to its project (the caller caps it at what is left). */
export const communalValue = (rules: CommonsRules, hours: number): number =>
  hours * rules.commons.communalPerHour;

/** The units of each part a value in Acorns' worth fills, in the project's own proportions (the haulers fill every part). */
export function valueToUnits(rules: CommonsRules, value: number, place?: string): ProjectHave {
  const split = splitOf(rules, place);
  return {
    acorns: (value * split.acorns) / partValue(rules, 'acorns'),
    scrap: (value * split.scrap) / partValue(rules, 'scrap'),
    shards: (value * split.shards) / unitValue(rules, 'shards', place),
  };
}

/**
 * V-COM-15: the guided start (Q48). The projects named in `guided` open one after the other, each once the one before it has levelled
 * (the Market counts as levelled when it is built); the rest of the places open once every guided one has. The hearth's project is
 * first, the Market's second (small, paid in Acorns and scrap, so a server can trade for shards as the first anvils wait), the Forge's third.
 */
export function mayOpenProject(
  rules: CommonsRules,
  place: string,
  levelOf: (place: string) => number,
): boolean {
  const { guided, places } = rules.commons;
  // A place built once (the Market) never opens another project after it is built.
  if (isOneShot(rules, place) && levelOf(place) >= 2) return false;
  if (!places.includes(place)) return false;
  const at = guided.indexOf(place);
  const before = at < 0 ? guided : guided.slice(0, at);
  return before.every((id) => levelOf(id) >= 2);
}

/** V-BON-7: the hearth's growth multiplier in basis points at a bonfire level. */
export const hearthBp = (rules: Pick<ValleyRules, 'bonfire'>, level: number): number =>
  Math.round(hearthMultiplier(rules, level) * 10_000);

// --- The fire (V-COM-13, V-GEAR-8, V-GEAR-10) ---

/** What warms the fire. */
export const WARMTH_SOURCES = [
  'place',
  'forge',
  'collection',
  'cosmetic',
  'boss',
  'master',
] as const;
export type WarmthSource = (typeof WARMTH_SOURCES)[number];

/** The warmth a source adds, in thousandths of a level (integers, so the fire's total never drifts). */
export function warmthMilli(rules: FireRules, source: WarmthSource): number {
  const w = rules.fire.warmth;
  const levels =
    source === 'place'
      ? w.placeLevel
      : source === 'forge'
        ? w.forgeLevel
        : source === 'collection'
          ? w.collection
          : source === 'cosmetic'
            ? w.cosmetic
            : source === 'boss'
              ? w.bossKill
              : 1;
  return Math.round(levels * 1000);
}

/** The fire's total in thousandths of a level when nothing has warmed it yet. */
export const fireStartMilli = (rules: FireRules): number => rules.fire.start * 1000;

/** The item level cap the fire makes: the whole levels of its total (it never falls). */
export const fireLevelOf = (totalMilli: number): number => Math.floor(totalMilli / 1000 + 1e-9);

/** The next modifier threshold above the fire's level (V-GEAR-8; null past the last). */
export function nextThreshold(rules: FireRules, level: number): number | null {
  return rules.fire.thresholds.find((t) => t > level) ?? null;
}

// --- Collections (V-COM-12) ---

/** The five finds a place's board wants (empty for a place with no board). */
export const boardOf = (
  rules: Pick<ValleyRules, 'collections'>,
  place: string,
): readonly string[] => rules.collections.boards[place] ?? [];

/**
 * Where a find sets itself: the first open socket of its kind on any board, in the order of `places` (a find whose sockets are all
 * filled is a spare, `null`: the caller melts it into Essence). `filled` is the set of "place:socket" keys already set.
 */
export function socketFor(
  rules: Pick<ValleyRules, 'collections'>,
  places: readonly string[],
  filled: ReadonlySet<string>,
  source: string,
): { place: string; socket: number } | null {
  for (const place of places) {
    const socket = boardOf(rules, place).findIndex(
      (kind, k) => kind === source && !filled.has(`${place}:${String(k)}`),
    );
    if (socket >= 0) return { place, socket };
  }
  return null;
}

/** How many resident tokens and journal pages the School's and the Paddock's boards ask for (the lab's draws pick one of them uniformly). */
export const RESIDENT_TOKENS = 4;
export const PAGE_TOKENS = 4;

// --- The view (strict, small) ---

const int = v.pipe(v.number(), v.integer(), v.minValue(0));
const amount = v.pipe(v.number(), v.finite(), v.minValue(0));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

/** One place of the valley and its open project (V-COM-1 to 5, 10, 11). */
export const ValleyCommonsPlaceSchema = v.strictObject({
  id,
  /** The place's level (1 to the max); a place at the max builds cosmetic projects. */
  level: int,
  max: int,
  /** Cosmetic projects built after the max. */
  cosmetic: int,
  /**
   * `open`: a project is open for gifts; `building`: the last one is done and the place builds for its three days; `waiting`: the
   * guided start has not reached this place yet (V-COM-15); `done`: a place built once (the Market) has been built, no project follows.
   */
  state: v.picklist(['open', 'building', 'waiting', 'done']),
  /** The open project (null unless `state` is `open`): its size and what is filled, in Acorns' worth, and what each part still takes. */
  project: v.nullable(
    v.strictObject({
      size: amount,
      progress: amount,
      needs: v.strictObject({ acorns: amount, scrap: amount, shards: amount }),
      /** The shards the place's own element counts in full. */
      shardElement: v.string(),
      /** The value in Acorns' worth of one shard of any element, for a place that takes them all (the Market); null: only its own element counts in full. */
      anyShard: v.nullable(amount),
      cosmetic: v.boolean(),
    }),
  ),
  /** Whole days of building left (0: none; 1 to 3 while `building`). */
  buildDaysLeft: int,
  /** What this player gave to the open project, in Acorns' worth, and their share in basis points (private: only the caller sees it). */
  mine: v.strictObject({ given: int, shareBp: int }),
  /** The plaque of the last finished level: everyone who helped build it, in no order that counts (never amounts). */
  plaque: v.pipe(v.array(v.pipe(v.string(), v.maxLength(40))), v.maxLength(32)),
  /** The keepsakes this player holds for this place (one per project they helped build). */
  keepsakes: int,
});

/** A collection board (V-COM-12): five sockets, each a find's source and whether it is set, with its finder. */
export const ValleyCollectionViewSchema = v.strictObject({
  place: id,
  sockets: v.pipe(
    v.array(
      v.strictObject({
        source: v.pipe(v.string(), v.maxLength(40)),
        set: v.boolean(),
        finder: v.nullable(v.pipe(v.string(), v.maxLength(40))),
      }),
    ),
    v.maxLength(8),
  ),
  done: v.boolean(),
});

/** The Forge's fire (V-COM-13): its level, the next modifier threshold, and the last things that warmed it. */
export const ValleyFireViewSchema = v.strictObject({
  level: int,
  /** The total in thousandths of a level. */
  milli: int,
  next: v.nullable(int),
  recent: v.pipe(
    v.array(v.strictObject({ source: v.picklist(WARMTH_SOURCES), place: v.nullable(id), at: int })),
    v.maxLength(5),
  ),
});

/** A communal seat (V-POST-13, V-COM-14): one per player per place; its creature's work fills the open project as a trickle. */
export const ValleyCommunalViewSchema = v.strictObject({
  place: id,
  /** The seat's id once it has been opened (null: not yet). */
  seatId: v.nullable(id),
  creatureId: v.nullable(id),
  /** Hours of work waiting to be credited at the next visit. */
  storeHours: amount,
  /** The value in Acorns' worth a full day of its work adds (at the full away share). */
  perDay: amount,
});

/** The commons block of the `valley` view. */
export const ValleyCommonsViewSchema = v.strictObject({
  places: v.pipe(v.array(ValleyCommonsPlaceSchema), v.maxLength(16)),
  collections: v.pipe(v.array(ValleyCollectionViewSchema), v.maxLength(16)),
  fire: ValleyFireViewSchema,
  /** The hearth's growth multiplier in basis points now (V-BON-7). */
  hearthBp: int,
  /** V-SCOUT-9: keystones found by the server, and the clocks' mean in days. */
  keystones: v.strictObject({ found: int, meanDays: amount }),
  communal: v.pipe(v.array(ValleyCommunalViewSchema), v.maxLength(16)),
});

export type ValleyCommonsPlace = v.InferOutput<typeof ValleyCommonsPlaceSchema>;
export type ValleyCommonsView = v.InferOutput<typeof ValleyCommonsViewSchema>;
