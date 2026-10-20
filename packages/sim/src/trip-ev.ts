/**
 * Expected value of a finished expedition, exact (no sampling): what a trip of each length brings with a
 * kit of 0, 1 or 2 supplies, in things and in Bait, from the shipped rules (2026-10-20, B-025).
 *
 * The math follows the scalars the server rolls with: `tickChances`, `mapTicksBp`, `lureEffect`,
 * `satchelBonus`, `kitDeepBp`, `kitDeepBonusBp` and the `RULES.expeditions.worth` table. Every per-tick
 * table is linear in the ticks, so its expectation is the expected ticks (the nominal ones plus the maps'
 * share) times the chance; only the chance of at least one creature or gear piece is not, and that one is
 * computed over the maps' whole-tick mixture. A test (`economy-ev.test.ts`) checks the numbers against the
 * real roll functions on a fixed seed.
 *
 * The reference trip: rank 3 explorer (found supplies are basic), no stars, no twist, the default rarity
 * odds, the deeper area of the Ember Caves (one epic species, `deepFindBp`, and its rarity push) and a
 * player who already owns `OWNED_SHARE` of what a roll can bring. Worth is in Bait, never shown to players.
 */
import {
  RULES,
  averageSupplyWorth,
  catchChanceBp,
  content,
  destinationDef,
  kitDeepBonusBp,
  kitDeepBp,
  kitOf,
  lengthRules,
  lureEffect,
  mapTicksBp,
  rollOdds,
  rollWorth,
  satchelBonus,
  tickChances,
  type DestinationDef,
  type ExpeditionLength,
  type GearRarity,
  type PartKind,
  type PartsSpec,
  type Rarity,
  type SupplyDef,
} from '@creatures/game';
import { TRIP_POLICY } from './trips';

const BP = 10_000;

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

/** The worth in Bait of one of each part kind: the table every kind must appear in (a new kind fails to compile). */
export const PART_WORTH: Readonly<Record<PartKind, number>> = {
  scrap: RULES.expeditions.worth.scrap,
  'tide-shard': RULES.expeditions.worth.shard,
  'ember-shard': RULES.expeditions.worth.shard,
  'grove-shard': RULES.expeditions.worth.shard,
  'spark-shard': RULES.expeditions.worth.shard,
  'mire-shard': RULES.expeditions.worth.shard,
  glimmer: RULES.expeditions.worth.glimmer,
};

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

/** What a finished trip brings on average, in things. */
export interface TripEv {
  /** Expected ticks (the nominal ones plus the maps' share). */
  ticks: number;
  creatures: number;
  /** Creatures from the deeper area (a lantern's). */
  deepCreatures: number;
  /** Creatures of a species the player does not own yet. */
  newSpecies: number;
  scrap: number;
  shards: number;
  glimmer: number;
  /** Gear pieces by rarity. */
  gear: Readonly<Record<GearRarity, number>>;
  gearTotal: number;
  /** The chance (0 to 1) of at least one gear piece. */
  gearAtLeastOne: number;
  blueprints: number;
  /** Supplies found. */
  supplies: number;
  xp: number;
  journal: number;
  /** The worth of each group and the sum, in Bait. */
  worth: Readonly<Record<WorthGroup, number>>;
  total: number;
}

export const WORTH_GROUPS = [
  'creatures',
  'newSpecies',
  'scrap',
  'shards',
  'glimmer',
  'gear',
  'blueprints',
  'supplies',
  'xp',
  'journal',
] as const;
export type WorthGroup = (typeof WORTH_GROUPS)[number];

export function referencePlace(): DestinationDef {
  const dest = destinationDef(REFERENCE_PLACE);
  if (dest === undefined) throw new Error(`no destination "${REFERENCE_PLACE}"`);
  // The default odds, so the study does not depend on one place's own table.
  const { odds: _own, ...rest } = dest;
  void _own;
  return rest;
}

/** The ticks of a trip as a mixture: whole ticks, and one more with the chance of the map's fraction. */
function tickMixture(
  length: ExpeditionLength,
  kit: readonly SupplyDef[],
): { ticks: number; at: { ticks: number; p: number }[] } {
  const mapBp = mapTicksBp(length, kit);
  const base = lengthRules(length).ticks + Math.floor(mapBp / BP);
  const frac = (mapBp % BP) / BP;
  const at =
    frac === 0
      ? [{ ticks: base, p: 1 }]
      : [
          { ticks: base, p: 1 - frac },
          { ticks: base + 1, p: frac },
        ];
  return { ticks: base + frac, at };
}

/** `1 - (1 - perTick)^ticks`, averaged over the ticks' mixture. */
function atLeastOne(perTick: number, at: readonly { ticks: number; p: number }[]): number {
  return at.reduce((sum, t) => sum + t.p * (1 - Math.pow(1 - perTick, t.ticks)), 0);
}

function gearOddsShare(r: GearRarity): number {
  return RULES.expeditions.tick.gearOdds[r] / BP;
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
  const kit = kitOf(kitIds);
  const w = RULES.expeditions.worth;
  const place = referencePlace();
  const mix = tickMixture(length, kit);
  const ticks = mix.ticks;

  const odds = tickChances({
    role: mods.guard === true ? 'guard' : 'payoff',
    kit,
    stars: 0,
    milestonePartsBp: 0,
    twist: null,
    gearPartsBp: mods.keenNoseBp ?? 0,
    weatherPartsBp: mods.weatherPartsBp ?? 0,
  });
  const satchel = satchelBonus(kit);
  const lure = lureEffect(kit);

  // Creatures: a chance per tick (lures add to it) and the lure's bonus roll, which surely brings one.
  const p = catchChanceBp(kit) / BP;
  const bonus = lure.bonusBp / BP;
  // A lantern's bonus roll (the reference place's deeper area is open with a lantern) surely brings a
  // creature from the deeper area.
  const lantern = kit.some((s) => s.kind === 'lantern');
  const deepBonus = lantern ? kitDeepBonusBp(kit) / BP : 0;
  const creatures = ticks * p + bonus + deepBonus;

  // Each creature's worth: the rarity odds of the length, and the deeper area when a lantern is carried.
  const normalOdds = rollOdds({
    destination: place,
    length,
    stars: 0,
    milestoneRarityBp: 0,
    deep: false,
  });
  const deepOdds = rollOdds({
    destination: place,
    length,
    stars: 0,
    milestoneRarityBp: 0,
    deep: true,
  });
  const normalWorth = rollWorth(normalOdds);
  const native = place.deep.species;
  const nativeWorth = native.length === 0 ? 0 : nativeSpeciesWorth(place);
  const deepWorth =
    native.length === 0
      ? rollWorth(deepOdds)
      : (RULES.expeditions.familiarity.deepFindBp / BP) * nativeWorth +
        (1 - RULES.expeditions.familiarity.deepFindBp / BP) * rollWorth(deepOdds);
  const deep = lantern ? Math.min(1, kitDeepBp(kit) / BP) : 0;
  // The bonus creature is always from the deeper area; every other one by the per-creature chance.
  const rolled = creatures - deepBonus;
  const creatureWorth =
    rolled * ((1 - deep) * normalWorth + deep * deepWorth) + deepBonus * deepWorth;

  // New species: a lure's own chance, else the share the player lacks.
  const newPer = lure.newBp / BP + (1 - lure.newBp / BP) * (1 - OWNED_SHARE);
  const newSpecies = creatures * newPer;

  const scrap = ticks * (odds.scrapBp / BP) + satchel.scrap;
  const shards = ticks * (odds.shardBp / BP) + satchel.shardBp / BP;
  const glimmer = ticks * (odds.glimmerBp / BP) + satchel.glimmerBp / BP;

  const gearTotal = ticks * (odds.gearBp / BP);
  const gear: Record<GearRarity, number> = {
    common: gearTotal * gearOddsShare('common'),
    rare: gearTotal * gearOddsShare('rare'),
    epic: gearTotal * gearOddsShare('epic'),
  };
  const blueprints = ticks * (odds.blueprintBp / BP);
  const supplies = ticks * (odds.supplyBp / BP);
  const xp = ticks * RULES.expeditions.tick.xp;
  const journal = ticks * (RULES.expeditions.tick.journalBp / BP);

  const worth: Record<WorthGroup, number> = {
    creatures: creatureWorth,
    newSpecies: newSpecies * NEW_SPECIES_WORTH,
    scrap: scrap * PART_WORTH.scrap,
    shards: shards * w.shard,
    glimmer: glimmer * PART_WORTH.glimmer,
    gear: gear.common * w.gear.common + gear.rare * w.gear.rare + gear.epic * w.gear.epic,
    blueprints: blueprints * w.blueprint,
    supplies: supplies * averageSupplyWorth(),
    xp: (xp * w.xpPer10) / 10,
    journal: journal * w.journal,
  };
  const total = WORTH_GROUPS.reduce((sum, g) => sum + worth[g], 0);
  return {
    ticks,
    creatures,
    deepCreatures: rolled * deep + deepBonus,
    newSpecies,
    scrap,
    shards,
    glimmer,
    gear,
    gearTotal,
    gearAtLeastOne: atLeastOne(odds.gearBp / BP, mix.at),
    blueprints,
    supplies,
    xp,
    journal,
    worth,
    total,
  };
}

/** The mean worth of the reference place's own deeper species (by rarity). */
function nativeSpeciesWorth(place: DestinationDef): number {
  const w = RULES.expeditions.worth.roll;
  const rarities = place.deep.species.map((id) => speciesRarity(id));
  return rarities.reduce((sum, r) => sum + w[r], 0) / rarities.length;
}

function speciesRarity(id: string): Rarity {
  const found = content.creatures.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no species "${id}"`);
  return found.rarity;
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
