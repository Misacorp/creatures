/**
 * Expected value of a finished expedition, exact (no sampling): what a trip brings with a kit of supplies,
 * in things and in Bait. The ONE implementation: the balance simulator (`packages/sim/src/trip-ev.ts`,
 * the economy study) and the send screen's boost brackets (`trip-boost.ts`) both call it (2026-10-21).
 *
 * The math follows the scalars the server rolls with: `tickChances`, `mapTicksBp`, `lureEffect`,
 * `satchelBonus`, `kitDeepBp`, `kitDeepBonusBp` and the `RULES.expeditions.worth` table. Every per-tick
 * table is linear in the ticks, so its expectation is the expected ticks (the nominal ones plus the maps'
 * share) times the chance; only the chance of at least one creature or gear piece is not, and that one is
 * computed over the maps' whole-tick mixture. A test in the simulator (`economy-ev.test.ts`) checks the
 * numbers against the real roll functions on a fixed seed. Worth is in Bait, never shown to players.
 */
import type {
  DestinationDef,
  ExpeditionLength,
  SupplyDef,
  TwistEffect,
} from '../content/expedition-schema';
import { content } from '../content';
import type { GearRarity } from '../content/gear-schema';
import type { Rarity, Role } from '../content/schema';
import { RULES } from './config';
import {
  averageSupplyWorth,
  catchChanceBp,
  deepChanceBp,
  deepOpen,
  kitDeepBonusBp,
  lengthRules,
  lureEffect,
  mapTicksBp,
  rollOdds,
  rollWorth,
  satchelBonus,
  tickChances,
} from './expeditions';
import type { PartKind } from './gear';

const BP = 10_000;

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

/** What a trip is worked out for: everything the server rolls with that the caller knows. */
export interface TripEvInput {
  length: ExpeditionLength;
  kit: readonly SupplyDef[];
  /** The place (its default rarity odds are used when it has no table of its own). */
  place: DestinationDef;
  /** The explorer's role (a Guard finds more parts). */
  role: Role;
  /** The explorer's stars at this place (0 to 3). */
  stars: number;
  /** The weekly twist if the trip goes to the special place, else null. */
  twist: TwistEffect | null;
  /** Account milestones (basis points). */
  milestonePartsBp: number;
  milestoneRarityBp: number;
  /** A Keen nose line on the explorer's gear (basis points). */
  gearPartsBp: number;
  /** The day's Boon on parts (basis points). */
  weatherPartsBp: number;
  /** The share (0 to 1) of what a creature roll can bring that the player owns already. */
  ownedShare: number;
  /** What finding a species the player does not own yet is worth on top of the creature, in Bait. */
  newSpeciesWorth: number;
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

/** The ticks of a trip as a mixture: whole ticks, and one more with the chance of the map's fraction. */
function tickMixture(
  length: ExpeditionLength,
  kit: readonly SupplyDef[],
  twist: TwistEffect | null,
): { ticks: number; at: { ticks: number; p: number }[] } {
  const mapBp = mapTicksBp(length, kit);
  const extra = twist?.kind === 'rolls' ? twist.extra : 0;
  const base = lengthRules(length).ticks + extra + Math.floor(mapBp / BP);
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

function speciesRarity(id: string): Rarity {
  const found = content.creatures.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no species "${id}"`);
  return found.rarity;
}

/** The mean worth of a place's own deeper species (by rarity). */
function nativeSpeciesWorth(place: DestinationDef): number {
  const w = RULES.expeditions.worth.roll;
  const rarities = place.deep.species.map((id) => speciesRarity(id));
  return rarities.reduce((sum, r) => sum + w[r], 0) / rarities.length;
}

/** The exact expected haul of a finished trip. The kit's legality (one of each kind) is the caller's. */
export function expectedTrip(input: TripEvInput): TripEv {
  const { length, kit, place, stars, twist } = input;
  const w = RULES.expeditions.worth;
  const mix = tickMixture(length, kit, twist);
  const ticks = mix.ticks;

  const odds = tickChances({
    role: input.role,
    kit,
    stars,
    milestonePartsBp: input.milestonePartsBp,
    twist,
    gearPartsBp: input.gearPartsBp,
    weatherPartsBp: input.weatherPartsBp,
  });
  const satchel = satchelBonus(kit);
  const lure = lureEffect(kit);

  // Creatures: a chance per tick (lures add to it) and the lure's bonus roll, which surely brings one.
  const p = catchChanceBp(kit) / BP;
  const bonus = lure.bonusBp / BP;
  // A lantern's bonus roll surely brings a creature from the deeper area (where it is open).
  const open = deepOpen(place, stars, kit);
  const deepBonus = open ? kitDeepBonusBp(kit) / BP : 0;
  const creatures = ticks * p + bonus + deepBonus;

  // Each creature's worth: the rarity odds of the length, and the deeper area where it is open.
  const rollArgs = {
    destination: place,
    length,
    stars,
    milestoneRarityBp: input.milestoneRarityBp,
  };
  const normalWorth = rollWorth(rollOdds({ ...rollArgs, deep: false }));
  const deepOddsWorth = rollWorth(rollOdds({ ...rollArgs, deep: true }));
  const native = place.deep.species;
  const nativeWorth = native.length === 0 ? 0 : nativeSpeciesWorth(place);
  const deepFind = RULES.expeditions.familiarity.deepFindBp / BP;
  const deepWorth =
    native.length === 0 ? deepOddsWorth : deepFind * nativeWorth + (1 - deepFind) * deepOddsWorth;
  const deep = deepChanceBp(place, stars, kit) / BP;
  // The bonus creature is always from the deeper area; every other one by the per-creature chance.
  const rolled = creatures - deepBonus;
  const creatureWorth =
    rolled * ((1 - deep) * normalWorth + deep * deepWorth) + deepBonus * deepWorth;

  // New species: a lure's own chance, else the share the player lacks.
  const newPer = lure.newBp / BP + (1 - lure.newBp / BP) * (1 - input.ownedShare);
  const newSpecies = creatures * newPer;

  const scrap = ticks * (odds.scrapBp / BP) + satchel.scrap;
  const shards = ticks * (odds.shardBp / BP) + satchel.shardBp / BP;
  const glimmer = ticks * (odds.glimmerBp / BP) + satchel.glimmerBp / BP;

  const gearTotal = ticks * (odds.gearBp / BP);
  const share = (r: GearRarity): number => RULES.expeditions.tick.gearOdds[r] / BP;
  const gear: Record<GearRarity, number> = {
    common: gearTotal * share('common'),
    rare: gearTotal * share('rare'),
    epic: gearTotal * share('epic'),
  };
  const blueprints = ticks * (odds.blueprintBp / BP);
  const supplies = ticks * (odds.supplyBp / BP);
  const xpTwist = twist?.kind === 'xp' ? twist.bp : 0;
  const journalTwist = twist?.kind === 'journal' ? twist.bp : 0;
  const xp = (ticks * RULES.expeditions.tick.xp * (BP + xpTwist)) / BP;
  const journal = (ticks * (RULES.expeditions.tick.journalBp / BP) * (BP + journalTwist)) / BP;

  const worth: Record<WorthGroup, number> = {
    creatures: creatureWorth,
    newSpecies: newSpecies * input.newSpeciesWorth,
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
