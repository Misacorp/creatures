/**
 * Expected value of a finished expedition, exact (no sampling): what a trip of each length brings with a
 * kit of 0, 1 or 2 supplies, in things and in Bait, from the shipped rules (2026-10-20, B-025).
 *
 * The math lives in the game package (`expectedTrip`, one implementation shared with the send screen's
 * boost brackets, 2026-10-21); this file fixes the reference trip: rank 3 explorer (found supplies are
 * basic), no stars, no twist, the default rarity odds, the deeper area of the Ember Caves (one epic
 * species, `deepFindBp`, and its rarity push) and a player who already owns `OWNED_SHARE` of what a roll
 * can bring. A test (`economy-ev.test.ts`) checks the numbers against the real roll functions on a fixed
 * seed. Worth is in Bait, never shown to players.
 */
import {
  PART_WORTH,
  WORTH_GROUPS,
  destinationDef,
  expectedTrip,
  kitOf,
  type DestinationDef,
  type ExpeditionLength,
  type PartKind,
  type PartsSpec,
  type SupplyDef,
  type TripEv,
  type WorthGroup,
} from '@creatures/game';
import { TRIP_POLICY } from './trips';

export { PART_WORTH, WORTH_GROUPS };
export type { TripEv, WorthGroup };

/** The reference place's deeper area (`deep.rarityUpBp`, one epic species). */
const REFERENCE_PLACE = 'ember-caves';

/** The share of what a creature roll can bring that the reference player owns already. */
export const OWNED_SHARE = 0.5;

/**
 * What finding a species the player does not own yet is worth on top of the creature, in Bait. The
 * simulator's own number (`TRIP_POLICY.newSpeciesWorth`): a new species is the point of collecting, and
 * the lure's whole job.
 */
export const NEW_SPECIES_WORTH = TRIP_POLICY.newSpeciesWorth;

/** Modifiers a trip can carry besides the kit (basis points on top of the parts chances). */
export interface TripMods {
  /** The explorer is a Guard (`RULES.expeditions.roles.guardPartsBp`). */
  guard?: boolean;
  /** A Keen nose line on the explorer's gear (basis points). */
  keenNoseBp?: number;
  /** The day's Boon on parts (basis points). */
  weatherPartsBp?: number;
}

export const NO_MODS: TripMods = {};

export function referencePlace(): DestinationDef {
  const dest = destinationDef(REFERENCE_PLACE);
  if (dest === undefined) throw new Error(`no destination "${REFERENCE_PLACE}"`);
  // The default odds, so the study does not depend on one place's own table.
  const { odds: _own, ...rest } = dest;
  void _own;
  return rest;
}

/**
 * The exact expected haul of a finished trip. `kitIds` are supply ids (0 to `maxSupplies`, one of each kind
 * is not checked here: the caller builds legal kits).
 */
export function tripEv(
  length: ExpeditionLength,
  kitIds: readonly string[],
  mods: TripMods = NO_MODS,
): TripEv {
  return expectedTrip({
    length,
    kit: kitOf(kitIds),
    place: referencePlace(),
    role: mods.guard === true ? 'guard' : 'payoff',
    stars: 0,
    twist: null,
    milestonePartsBp: 0,
    milestoneRarityBp: 0,
    gearPartsBp: mods.keenNoseBp ?? 0,
    weatherPartsBp: mods.weatherPartsBp ?? 0,
    ownedShare: OWNED_SHARE,
    newSpeciesWorth: NEW_SPECIES_WORTH,
  });
}

/** What crafting a supply costs in Bait: its parts at the usual worth and its Bait (Workshop hours not priced). */
export function supplyCost(def: SupplyDef): number {
  const parts: PartsSpec = def.blueprint.parts;
  let cost = def.blueprint.bait ?? 0;
  for (const [kind, amount] of Object.entries(parts) as [PartKind, number | undefined][]) {
    cost += (amount ?? 0) * PART_WORTH[kind];
  }
  return cost;
}

/** The Workshop hours of a kit's blueprints (not priced, reported). */
export function kitHours(kitIds: readonly string[]): number {
  return kitOf(kitIds).reduce((sum, s) => sum + s.blueprint.hours, 0);
}

/** The cost of a kit in Bait. */
export function kitCost(kitIds: readonly string[]): number {
  return kitOf(kitIds).reduce((sum, s) => sum + supplyCost(s), 0);
}

/**
 * The return on investment of adding `added` to a kit that already holds `base`: the extra expected worth
 * of the trip over the cost of the added supplies. `base` empty is the supply's own ROI.
 */
export function roi(
  length: ExpeditionLength,
  base: readonly string[],
  added: string,
  mods: TripMods = NO_MODS,
): number {
  const gain = tripEv(length, [...base, added], mods).total - tripEv(length, base, mods).total;
  return gain / kitCost([added]);
}

/** The absolute gain, in Bait, of adding a supply to a kit. */
export function gainOf(
  length: ExpeditionLength,
  base: readonly string[],
  added: string,
  mods: TripMods = NO_MODS,
): number {
  return tripEv(length, [...base, added], mods).total - tripEv(length, base, mods).total;
}
