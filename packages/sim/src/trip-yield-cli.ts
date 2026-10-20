/**
 * Trip yield study (run with packages/sim/scripts/_load.mjs `runCli('/src/trip-yield-cli.ts')`): what one
 * finished trip brings back in the tick model (2026-10-20), by length and supply, from the shipped rules.
 * Per trip, no stars, no twist, no weather, rank 3, a Payoff explorer at the Ember Caves. The last
 * columns value the trip in Bait with `RULES.expeditions.worth` (a new species is worth
 * `TRIP_POLICY.newSpeciesWorth` on top, a found supply 15) and compare what a supply adds with what it costs to
 * craft (its parts and Bait at the same worth); the starting values aim at about 1.1 on a 2 hour trip, 2
 * on a 12 hour one and 3.2 on a 24 hour one.
 */
import { TRIP_POLICY } from './trips';
import {
  RULES,
  content,
  createSeededRng,
  destinationDef,
  kitOf,
  lengthRules,
  rollMapTicks,
  rollTripCatches,
  rollTripLoot,
  tripTicks,
  type ExpeditionLength,
  type SupplyBlueprint,
} from '@creatures/game';

declare const console: { log(text: string): void };

const LENGTHS: ExpeditionLength[] = ['short', 'medium', 'long', 'day'];
const KITS: string[][] = [
  [],
  ['lure-basic'],
  ['lure-good'],
  ['lure-great'],
  ['map-scrap-basic'],
  ['map-scrap-good'],
  ['map-scrap-great'],
  ['satchel-basic'],
  ['satchel-good'],
  ['satchel-great'],
  ['lantern-basic'],
  ['lantern-good'],
  ['lantern-great'],
  ['lure-great', 'map-scrap-great'],
];

interface Yield {
  ticks: number;
  creatures: number;
  fresh: number;
  scrap: number;
  shards: number;
  glimmer: number;
  gear: number;
  blueprints: number;
  supplies: number;
  xp: number;
  /** Creatures from the deeper area. */
  deep: number;
  /** The trip's worth in Bait. */
  worth: number;
}

/** What `n` finished trips bring back on average. */
export function study(length: ExpeditionLength, kitIds: readonly string[], n: number): Yield {
  const dest = destinationDef('ember-caves');
  if (dest === undefined) throw new Error('no ember caves');
  const kit = kitOf(kitIds);
  const rng = createSeededRng(`yield:${length}:${kitIds.join('+')}`);
  const w = RULES.expeditions.worth;
  const owned = new Set<string>(['zipmouse', 'cindle']);
  const total: Yield = {
    ticks: 0,
    creatures: 0,
    fresh: 0,
    scrap: 0,
    shards: 0,
    glimmer: 0,
    gear: 0,
    blueprints: 0,
    supplies: 0,
    xp: 0,
    deep: 0,
    worth: 0,
  };
  const gearWorth =
    (RULES.expeditions.tick.gearOdds.common * w.gear.common +
      RULES.expeditions.tick.gearOdds.rare * w.gear.rare +
      RULES.expeditions.tick.gearOdds.epic * w.gear.epic) /
    10_000;
  const supplyWorth = 15;
  for (let i = 0; i < n; i++) {
    const ticks = tripTicks(length, null) + rollMapTicks(rng, length, kit);
    const c = rollTripCatches(
      rng,
      ticks,
      {
        content,
        destination: dest,
        length,
        explorer: { element: 'ember', role: 'payoff' },
        kit,
        stars: 0,
        milestoneRarityBp: 0,
        twist: null,
        ownedLines: owned,
        dupeStreak: 0,
        firstExpedition: false,
      },
      true,
    );
    const loot = rollTripLoot(rng, {
      ticks,
      fixedParts: true,
      place: { element: 'ember', crossroads: false },
      role: 'payoff',
      kit,
      stars: 0,
      milestonePartsBp: 0,
      twist: null,
      rank: 3,
    });
    const scrap = loot.parts.scrap ?? 0;
    const shards = loot.parts['ember-shard'] ?? 0;
    const glimmer = loot.parts.glimmer ?? 0;
    total.ticks += ticks;
    total.creatures += c.results.length;
    total.fresh += c.results.filter((r) => !r.duplicate).length;
    total.deep += c.results.filter((r) => r.deep).length;
    total.scrap += scrap;
    total.shards += shards;
    total.glimmer += glimmer;
    total.gear += loot.gear.length;
    total.blueprints += loot.blueprints.length;
    total.supplies += loot.supplies.length;
    total.xp += ticks * RULES.expeditions.tick.xp;
    for (const r of c.results) {
      total.worth += w.roll[r.species.rarity] + (r.duplicate ? 0 : TRIP_POLICY.newSpeciesWorth);
    }
    total.worth +=
      scrap * w.scrap +
      shards * w.shard +
      glimmer * w.glimmer +
      loot.gear.length * gearWorth +
      loot.blueprints.length * w.blueprint +
      loot.supplies.length * supplyWorth +
      (ticks * RULES.expeditions.tick.xp * w.xpPer10) / 10;
  }
  for (const key of Object.keys(total) as (keyof Yield)[]) total[key] /= n;
  return total;
}

/** What crafting a supply costs in Bait: its parts at the usual worth and its Bait. */
function craftCost(blueprint: SupplyBlueprint): number {
  const w = RULES.expeditions.worth;
  const parts = blueprint.parts;
  const shards =
    (parts['tide-shard'] ?? 0) +
    (parts['ember-shard'] ?? 0) +
    (parts['grove-shard'] ?? 0) +
    (parts['spark-shard'] ?? 0) +
    (parts['mire-shard'] ?? 0);
  return (
    (parts.scrap ?? 0) * w.scrap +
    shards * w.shard +
    (parts.glimmer ?? 0) * w.glimmer +
    (blueprint.bait ?? 0)
  );
}

export function main(argv: string[]): number {
  const n = Number(argv[0] ?? 20000);
  const rows: string[] = [];
  rows.push(
    '| Length | Kit | Ticks | Creatures | New | Deep | Scrap | Shards | Glimmer | Gear | Blueprint | Supply | XP | Worth | Gain / cost |',
  );
  rows.push('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const length of LENGTHS) {
    const plain = study(length, [], n);
    for (const ids of KITS) {
      const y = ids.length === 0 ? plain : study(length, ids, n);
      const cost = kitOf(ids).reduce((sum, s) => sum + craftCost(s.blueprint), 0);
      const gain = cost === 0 ? '' : ((y.worth - plain.worth) / cost).toFixed(2);
      const f = (x: number) => x.toFixed(2);
      rows.push(
        `| ${length} (${String(lengthRules(length).ticks)} ticks) | ${ids.join(' + ') || 'none'} | ${f(y.ticks)} | ${f(y.creatures)} | ${f(y.fresh)} | ${f(y.deep)} | ${f(y.scrap)} | ${f(y.shards)} | ${f(y.glimmer)} | ${f(y.gear)} | ${f(y.blueprints)} | ${f(y.supplies)} | ${f(y.xp)} | ${f(y.worth)} | ${gain} |`,
      );
    }
  }
  console.log(rows.join('\n'));
  return 0;
}
