/**
 * What a kit of supplies adds to a trip, as a bracket and never a count (2026-10-21): per category the
 * relative boost over the same trip with no supplies, worked out exactly from `expectedTrip` (the same
 * math the economy study uses), then put into one of four words. The send screen shows the words for the
 * trip being sent; no player text carries a number.
 */
import type {
  DestinationDef,
  ExpeditionLength,
  SupplyDef,
  TwistEffect,
} from '../content/expedition-schema';
import type { Role } from '../content/schema';
import { destinationDef } from '../content';
import { RULES } from './config';
import { expectedTrip, type TripEv, type TripEvInput } from './trip-ev';

/** The categories a supply can raise. `parts` is scrap, shards and glimmer together, by worth. */
export const BOOST_CATEGORIES = [
  'creatures',
  'newSpecies',
  'deepCreatures',
  'parts',
  'gear',
  'xp',
] as const;
export type BoostCategory = (typeof BOOST_CATEGORIES)[number];

/** A boost below this (basis points of the plain haul) shows nothing. */
export const BOOST_FLOOR_BP = 300;

/** The brackets, lowest first: a boost from `fromBp` (basis points of the plain haul) up to the next one's. */
export const BOOST_BRACKETS = [
  { level: 1, fromBp: BOOST_FLOOR_BP, words: 'slightly more' },
  { level: 2, fromBp: 2_500, words: 'more' },
  { level: 3, fromBp: 6_000, words: 'a lot more' },
  { level: 4, fromBp: 10_000, words: 'at least double' },
] as const;

/**
 * From this boost (basis points of the plain haul) a blurb may say "triple" instead of "double"
 * (bracket 4 only: "double" is +100% to under +200%).
 */
export const TRIPLE_FROM_BP = 20_000;

/** 0 for no visible boost, else 1 to 4 (the index into `BOOST_BRACKETS` plus one). */
export type BoostLevel = 0 | 1 | 2 | 3 | 4;

/** The bracket of a relative boost (0.5 is +50%). Infinity (from nothing) is the top one. */
export function boostLevel(relative: number): BoostLevel {
  const bp = relative * 10_000;
  let level: BoostLevel = 0;
  for (const b of BOOST_BRACKETS) {
    if (bp >= b.fromBp) level = b.level;
  }
  return level;
}

/** The words of a bracket ("more"); empty for level 0. */
export function boostWords(level: BoostLevel): string {
  return BOOST_BRACKETS.find((b) => b.level === level)?.words ?? '';
}

/** The trip a boost is worked out for. */
export interface TripBoostInput {
  length: ExpeditionLength;
  kit: readonly SupplyDef[];
  place: DestinationDef;
  role: Role;
  /** The explorer's stars at this place. */
  stars: number;
  /** The weekly twist if the trip goes to the special place. */
  twist: TwistEffect | null;
  /** The day's Boon on parts (basis points); absent: none. */
  weatherPartsBp?: number;
}

/** The share of what a creature roll can bring that a player is assumed to own already (new species). */
export const BOOST_OWNED_SHARE = 0.5;

function evOf(input: TripBoostInput, kit: readonly SupplyDef[]): TripEv {
  const full: TripEvInput = {
    length: input.length,
    kit,
    place: input.place,
    role: input.role,
    stars: input.stars,
    twist: input.twist,
    milestonePartsBp: 0,
    milestoneRarityBp: 0,
    gearPartsBp: 0,
    weatherPartsBp: input.weatherPartsBp ?? 0,
    ownedShare: BOOST_OWNED_SHARE,
    newSpeciesWorth: 0,
  };
  return expectedTrip(full);
}

/** The parts of a trip by worth: scrap, shards and glimmer in the worth table's proportions. */
function partsOf(ev: TripEv): number {
  const w = RULES.expeditions.worth;
  return ev.scrap * w.scrap + ev.shards * w.shard + ev.glimmer * w.glimmer;
}

const ratio = (with_: number, without: number): number =>
  without > 0 ? with_ / without - 1 : with_ > 0 ? Infinity : 0;

/**
 * The relative boost of a kit per category over the same trip with no supplies (0.5 is +50%; exact
 * expected values, no randomness). Deep creatures a trip would not bring at all without the kit (no
 * star at the place yet) are measured against the plain trip's creatures, so a lantern's chance of one
 * deeper creature reads as a share of the usual haul.
 */
export function tripBoost(input: TripBoostInput): Record<BoostCategory, number> {
  const plain = evOf(input, []);
  const kitted = evOf(input, input.kit);
  const deep =
    plain.deepCreatures > 0
      ? ratio(kitted.deepCreatures, plain.deepCreatures)
      : plain.creatures > 0
        ? (kitted.deepCreatures - plain.deepCreatures) / plain.creatures
        : 0;
  return {
    creatures: ratio(kitted.creatures, plain.creatures),
    newSpecies: ratio(kitted.newSpecies, plain.newSpecies),
    deepCreatures: deep,
    parts: ratio(partsOf(kitted), partsOf(plain)),
    gear: ratio(kitted.gearTotal, plain.gearTotal),
    xp: ratio(kitted.xp, plain.xp),
  };
}

/** The brackets of a kit per category: `tripBoost` through `boostLevel`. */
export function tripBoostLevels(input: TripBoostInput): Record<BoostCategory, BoostLevel> {
  const boost = tripBoost(input);
  return Object.fromEntries(BOOST_CATEGORIES.map((c) => [c, boostLevel(boost[c])])) as Record<
    BoostCategory,
    BoostLevel
  >;
}

/**
 * The trip every supply blurb is anchored to (2026-10-21): 12 hours at the economy study's reference
 * place, a payoff explorer with no stars and no twist. A blurb's strength word is the bracket of the
 * supply's main category on this trip, so tuning cannot make the words lie (a test holds them to it).
 */
export const REFERENCE_TRIP = {
  length: 'long',
  placeId: 'ember-caves',
  role: 'payoff',
  stars: 0,
} as const satisfies { length: ExpeditionLength; placeId: string; role: Role; stars: number };

/** The category a kind of supply is described by in its blurb (a map raises every table alike). */
export const BLURB_CATEGORY: Readonly<Record<SupplyDef['kind'], BoostCategory>> = {
  lure: 'creatures',
  'map-scrap': 'creatures',
  lantern: 'deepCreatures',
  satchel: 'parts',
};

/** The relative boost of one supply's main category on the reference trip. */
export function referenceBoost(supply: SupplyDef): number {
  const place = destinationDef(REFERENCE_TRIP.placeId);
  if (place === undefined) throw new Error(`no reference place ${REFERENCE_TRIP.placeId}`);
  const boost = tripBoost({
    length: REFERENCE_TRIP.length,
    kit: [supply],
    place,
    role: REFERENCE_TRIP.role,
    stars: REFERENCE_TRIP.stars,
    twist: null,
  });
  return boost[BLURB_CATEGORY[supply.kind]];
}
