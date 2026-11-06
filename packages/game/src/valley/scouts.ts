import type { TwistEffect } from '../content/expedition-schema';
import type { Rng } from '../rng';
import { masteryBonus } from './formulas';
import type { FindFamily, KitName, ValleyElement, ValleyRules } from './rules';
import { VALLEY_ELEMENTS } from './rules';

/**
 * Scouts, the pure half (phase 5 step 2, docs/design/valley/systems/scouts.md and posts.md): the place profiles, fit, mastery, kit,
 * the week's twist and opening hours folded into one hourly rate per find, the seat price ladder, and the weighted pick of a new
 * creature. The lab (`packages/econ/src/scouts.ts`) models the same rules hour by hour; every number is read from the rules, none is
 * written here. The live draws (how many creatures, which one) take an injected `Rng`: production passes `crypto`, tests a seeded one.
 */

/** The kit a scout seat can hold (V-SCOUT-5). Tongs and loupe belong to the Forge's anvils (step 3). */
export const SCOUT_KITS = ['lure', 'lantern', 'satchel'] as const;
export type ScoutKit = (typeof SCOUT_KITS)[number];
export const isScoutKit = (kit: KitName): kit is ScoutKit =>
  (SCOUT_KITS as readonly string[]).includes(kit);

/** A destination as a scout sees it: its element, what it is rich in, and when it is open. */
export interface PlaceProfile {
  readonly id: string;
  readonly element: ValleyElement | null;
  readonly rich: FindFamily | 'none';
  /** Open only in festival weeks (V-SCOUT-8). */
  readonly festival: boolean;
  /** Gives more at night (the Moonlit Reef, V-SCOUT-8). */
  readonly night: boolean;
}

type PlaceRules = Pick<ValleyRules, 'scouts'>;

/** The profile of a destination id, from the lab's six and the two extra shipped places; undefined for an id that is neither. */
export function placeProfile(rules: PlaceRules, id: string): PlaceProfile | undefined {
  const lab = rules.scouts.destinations.find((d) => d.id === id);
  if (lab !== undefined) {
    return { id, element: lab.element, rich: lab.rich, festival: false, night: false };
  }
  const extra = rules.scouts.extraPlaces.find((d) => d.id === id);
  if (extra === undefined) return undefined;
  return {
    id,
    element: extra.element,
    rich: extra.rich,
    festival: extra.opens === 'festival',
    night: extra.id === 'moonlit-reef',
  };
}

/** Every destination id a seat may be posted to, in the order the Signpost lists them. */
export const placeIds = (rules: PlaceRules): string[] => [
  ...rules.scouts.destinations.map((d) => d.id),
  ...rules.scouts.extraPlaces.map((d) => d.id),
];

/** V-SCOUT-11: the week's twist at its destination, as multipliers (absent: no twist at that place now). */
export interface ScoutSpecial {
  readonly destination: string;
  /** Scrap and shards x(1 + partsBp / 10000). */
  readonly partsBp: number;
  /** Extra hours of finds a trip would give: every find rate grows by `twistRollsPerExtra` each. */
  readonly rollsExtra: number;
  /** Journal pages x(1 + pagesBp / 10000). */
  readonly pagesBp: number;
  /** Mastery hours count x(1 + masteryBp / 10000). */
  readonly masteryBp: number;
  /** The first resident of this rarity turns up `weight` times as often (picked in `pickSpecies`). */
  readonly featured: {
    readonly rarity: 'common' | 'rare' | 'epic';
    readonly weight: number;
  } | null;
}

/** The part of the world a stretch of time sees: day or night, festival week or not, and the week's twist. */
export interface ScoutWorld {
  readonly night: boolean;
  readonly festival: boolean;
  readonly special: ScoutSpecial | null;
}

export const QUIET_WORLD: ScoutWorld = { night: false, festival: false, special: null };

/** Turns the content's weekly twist into the scouts' multipliers. */
export function specialOf(destination: string, effect: TwistEffect): ScoutSpecial {
  return {
    destination,
    partsBp: effect.kind === 'parts' ? effect.bp : 0,
    rollsExtra: effect.kind === 'rolls' ? effect.extra : 0,
    pagesBp: effect.kind === 'journal' ? effect.bp : 0,
    masteryBp: effect.kind === 'xp' ? effect.bp : 0,
    featured: effect.kind === 'featured' ? { rarity: effect.rarity, weight: effect.weight } : null,
  };
}

/** Whether a place is open in a world (V-SCOUT-8): the Festival Grounds only in festival weeks. */
export const placeOpen = (place: PlaceProfile, world: ScoutWorld): boolean =>
  !place.festival || world.festival;

/** V-SCOUT-5: what the kit on a scout seat multiplies. */
export function kitTilt(
  rules: Pick<ValleyRules, 'kit'>,
  kit: ScoutKit | null,
): Record<FindFamily, number> {
  const t: Record<FindFamily, number> = { scrap: 1, shards: 1, creatures: 1, rare: 1 };
  if (kit === 'lure') t.creatures = rules.kit.lure.creatures;
  if (kit === 'lantern') t.rare = rules.kit.lantern.rare;
  if (kit === 'satchel') {
    t.scrap = rules.kit.satchel.scrap;
    t.shards = rules.kit.satchel.shards;
  }
  return t;
}

/** The per effective hour rate of every find at one seat (a count, or scrap), with fit, mastery, kit, place, night and twist in. */
export interface SeatRates {
  readonly scrap: number;
  readonly shards: number;
  readonly creatures: number;
  readonly gear: number;
  readonly blueprints: number;
  readonly pages: number;
  /** The "everyday" rare find that fills a collection socket (V-COM-12). */
  readonly rareFinds: number;
}

export interface SeatRateInput {
  readonly place: PlaceProfile;
  /** V-POST-4: the creature's element is the place's element. */
  readonly fit: boolean;
  /** The creature's scouting hours (V-POST-12). */
  readonly masteryHours: number;
  readonly kit: ScoutKit | null;
  /** V-SCOUT-10: not the player's first scout at this place. */
  readonly second: boolean;
  readonly world: ScoutWorld;
  /** V-SCOUT-6: the scout is in the destination's deeper area (absent: not). The kit does not work there. */
  readonly deep?: boolean;
}

/** A tolerance so mastery reached "exactly" at a boundary counts as reached (splits agree). */
const EPSILON = 1e-9;

export const NO_RATES: SeatRates = {
  scrap: 0,
  shards: 0,
  creatures: 0,
  gear: 0,
  blueprints: 0,
  pages: 0,
  rareFinds: 0,
};

/** V-SCOUT-2, 5, 7, 8, 10, 11 and V-POST-4: the rates of one seat. The lab's `collectSeat` is this, with the average fit. */
export function seatRates(rules: ValleyRules, input: SeatRateInput): SeatRates {
  const { place, world } = input;
  const rate = rules.scouts.perHour;
  const rich = (family: PlaceProfile['rich']): number =>
    place.rich === family ? rules.scouts.richMultiplier : 1;
  const deep = input.deep === true;
  // V-SCOUT-6: deep, the kit does not work, scrap and shards are fewer and rare finds more.
  const tilt = kitTilt(rules, deep ? null : input.kit);
  const deepParts = deep ? rules.scouts.pushOn.partsMultiplier : 1;
  const deepRare = deep ? rules.scouts.pushOn.rareMultiplier : 1;
  const fit = input.fit ? 1 + rules.posts.fitBonus : 1;
  const mult = fit * (1 + masteryBonus(rules, input.masteryHours + EPSILON));
  const special =
    world.special !== null && world.special.destination === place.id ? world.special : null;
  const parts = special === null ? 1 : 1 + special.partsBp / 10_000;
  const rolls = special === null ? 1 : 1 + special.rollsExtra * rules.scouts.twistRollsPerExtra;
  const pages = special === null ? 1 : 1 + special.pagesBp / 10_000;
  const night = place.night && world.night ? rules.scouts.nightMultiplier : 1;
  const all = rolls * night;
  const rare = rich('rare') * mult * tilt.rare * all * deepRare;
  return {
    scrap: rate.scrap * rich('scrap') * mult * tilt.scrap * parts * all * deepParts,
    shards: rate.shards * rich('shards') * mult * tilt.shards * parts * all * deepParts,
    creatures:
      rate.creatures *
      rich('creatures') *
      mult *
      tilt.creatures *
      (input.second ? rules.scouts.secondScoutCreatures : 1) *
      all,
    gear: rate.gear * rare,
    blueprints: rate.blueprints * rare,
    pages: rate.pages * rare * pages,
    rareFinds: rate.rareFinds * rare,
  };
}

/** V-POST-12 with the week's twist: the mastery hours a stretch of effective work counts for at this place. */
export function masteryHoursOf(hours: number, place: PlaceProfile, world: ScoutWorld): number {
  const special = world.special;
  return special !== null && special.destination === place.id
    ? hours * (1 + special.masteryBp / 10_000)
    : hours;
}

// --- Seats (V-POST-2) ---

/** The most scout seats a Signpost of this level allows (the level counts from 1). */
export const seatLimit = (rules: Pick<ValleyRules, 'seats'>, level: number): number =>
  rules.seats.scoutByLevel[Math.min(Math.max(1, level), rules.seats.scoutByLevel.length) - 1] ?? 0;

/**
 * What the next scout seat costs in Acorns for a player who owns `owned` of them (rising, and dearer at a higher place level), or
 * null when the place's level allows no more.
 */
export function seatPrice(
  rules: Pick<ValleyRules, 'seats'>,
  owned: number,
  level: number,
): number | null {
  const base = rules.seats.scoutPrices[owned];
  if (owned >= seatLimit(rules, level) || base === undefined) return null;
  return Math.ceil(base * (1 + rules.seats.levelSurcharge * (Math.max(1, level) - 1)));
}

// --- What arrives (V-SCOUT-3, 12) ---

/** A species a scout can find: the first stage of a catchable line, with its element and rarity (0 common, 1 rare, 2 epic). */
export interface FindableSpecies {
  readonly id: string;
  readonly element: ValleyElement;
  readonly rarity: 0 | 1 | 2;
  /** The player already owns this species. */
  readonly owned: boolean;
  /** Lives at the place being scouted (the week's featured twist favours the first of its rarity). */
  readonly resident: boolean;
  /** A further multiplier on its weight (absent: 1). A scout in the deeper area weighs its residents and the rarer species more (V-SCOUT-6). */
  readonly weight?: number;
}

const TWO_32 = 0x1_0000_0000;
const uniform = (rng: Rng): number => rng.nextU32() / TWO_32;
const RARITY_NAMES = ['common', 'rare', 'epic'] as const;

/**
 * Which species arrives (the lab's `pickSpecies`): a place leans toward its element, rarer species come less often (Q38), a lure
 * halves the weight of species already owned, and a featured twist multiplies the first resident of its rarity. `needNew` (the
 * starter's first scout) only draws among species not owned yet when there are any.
 */
export function pickSpecies(
  rng: Rng,
  rules: ValleyRules,
  species: readonly FindableSpecies[],
  place: PlaceProfile,
  options: { lure: boolean; special: ScoutSpecial | null; needNew?: boolean },
): number {
  if (species.length === 0) throw new RangeError('no species to find');
  const featured =
    options.special !== null && options.special.destination === place.id
      ? options.special.featured
      : null;
  const featuredIndex =
    featured === null
      ? -1
      : species.findIndex((s) => s.resident && RARITY_NAMES[s.rarity] === featured.rarity);
  const useNew = options.needNew === true && species.some((s) => !s.owned);
  const weights = species.map((s, i) => {
    if (useNew && s.owned) return 0;
    let w = place.element !== null && s.element === place.element ? rules.scouts.placeAffinity : 1;
    w *= rules.scouts.rarity.weights[s.rarity] ?? 1;
    if (options.lure && s.owned) w *= rules.scouts.lureOwnedWeight;
    if (featured !== null && i === featuredIndex) w *= featured.weight;
    w *= s.weight ?? 1;
    return w;
  });
  let sum = 0;
  for (const w of weights) sum += w;
  let point = uniform(rng) * sum;
  for (let i = 0; i < weights.length; i++) {
    point -= weights[i] ?? 0;
    if (point < 0) return i;
  }
  // Rounding left a hair of the last weight: the last species with weight.
  for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] ?? 0) > 0) return i;
  return weights.length - 1;
}

/** A Poisson draw by inversion (small means only: a stretch of a pass has a mean below about 10). */
export function poissonDraw(rng: Rng, mean: number): number {
  if (!(mean > 0)) return 0;
  let total = 0;
  let left = mean;
  while (left > 0) {
    const part = Math.min(left, 8);
    left -= part;
    const limit = Math.exp(-part);
    let product = uniform(rng);
    let k = 0;
    while (product > limit) {
      k += 1;
      product *= uniform(rng);
    }
    total += k;
  }
  return total;
}

/** The element a seat's shards come as: the place's, or a draw among all five for a mixed place (V-SCOUT-2). */
export function shardElement(rng: Rng, place: PlaceProfile): ValleyElement {
  if (place.element !== null) return place.element;
  return VALLEY_ELEMENTS[
    Math.min(VALLEY_ELEMENTS.length - 1, Math.floor(uniform(rng) * VALLEY_ELEMENTS.length))
  ] as ValleyElement;
}
