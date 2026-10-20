/**
 * Trip yield study (run with packages/sim/scripts/_load.mjs `runCli('/src/trip-yield-cli.ts')`): what one trip brings back, by length and supply, from the shipped rules.
 * Per trip and per 12 hours of explorer time. No pity, no stars, no twist, no weather, rank 3, a
 * Striker explorer at the Ember Caves.
 */
import {
  RULES,
  content,
  createSeededRng,
  destinationDef,
  kitOf,
  lengthRules,
  rollTripCatches,
  rollTripLoot,
  supplyDef,
  tripRolls,
  type ExpeditionLength,
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
  ['lantern-great'],
  ['lure-great', 'map-scrap-great'],
];

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

/** The proposal: more rolls and flat scrap on long trips, shards that follow the hours. */
function applyProposal(): void {
  const L = (RULES as unknown as Mutable<typeof RULES>).expeditions.lengths;
  Object.assign(L.short, { rolls: 1, catchBp: 300, findScrap: 0 });
  Object.assign(L.short.loot, { scrap: 1, shardBp: 500 });
  Object.assign(L.medium, { rolls: 2, catchBp: 500, findScrap: 1 });
  Object.assign(L.medium.loot, { scrap: 3, shardBp: 2_000 });
  Object.assign(L.long, { rolls: 3, catchBp: 1_000, findScrap: 1 });
  Object.assign(L.long.loot, { scrap: 9, shardBp: 6_000 });
  Object.assign(L.day, { rolls: 6, catchBp: 1_100, findScrap: 1 });
  Object.assign(L.day.loot, { scrap: 20, shardBp: 15_000 });
  const maps: Record<string, number> = {
    'map-scrap-basic': 3_500,
    'map-scrap-good': 6_700,
    'map-scrap-great': 10_000,
  };
  for (const [id, bp] of Object.entries(maps)) {
    const def = supplyDef(id) as { rollsBp: number } | undefined;
    if (def !== undefined) def.rollsBp = bp;
  }
}

export function main(argv: string[]): number {
  const n = Number(argv[0] ?? 20000);
  const trips = 30;
  if (argv.includes('--proposal')) applyProposal();
  const dest = destinationDef('ember-caves');
  if (dest === undefined) throw new Error('no dest');
  const owned = new Set<string>(['zipmouse', 'cindle']);
  const rows: string[] = [];
  rows.push(
    '| Length | Kit | Rolls | Creatures | New | Scrap | Shards | Glimmer | Blueprint | Supply | XP |',
  );
  rows.push('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const length of LENGTHS) {
    for (const ids of KITS) {
      const kit = kitOf(ids);
      const rng = createSeededRng(`yield:${length}:${ids.join('+')}`);
      let creatures = 0;
      let fresh = 0;
      let scrap = 0;
      let shards = 0;
      let glimmer = 0;
      let bps = 0;
      let supplies = 0;
      const rolls = tripRolls(length, kit, null);
      let pity = { sinceNew: 0, sinceCreature: 0 };
      for (let i = 0; i < n; i++) {
        if (i % trips === 0) pity = { sinceNew: 0, sinceCreature: 0 };
        const c = rollTripCatches(rng, rolls, {
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
          ...(argv.includes('--pity') ? { pity } : {}),
        });
        pity = c.pity;
        creatures += c.results.length;
        fresh += c.results.filter((r) => !r.duplicate).length;
        const loot = rollTripLoot(
          rng,
          {
            length,
            shardElement: 'ember',
            role: 'payoff',
            kit,
            stars: 0,
            milestonePartsBp: 0,
            twist: null,
            rank: 3,
            emptyRolls: c.empty,
          },
          { completed: true, caught: c.results.length, rolls },
        );
        scrap += loot.parts.scrap ?? 0;
        shards += loot.parts['ember-shard'] ?? 0;
        glimmer += loot.parts.glimmer ?? 0;
        bps += loot.blueprint === null ? 0 : 1;
        supplies += loot.supplies.length;
      }
      const f = (x: number) => (x / n).toFixed(2);
      rows.push(
        `| ${length} | ${ids.join(' + ') || 'none'} | ${rolls} | ${f(creatures)} | ${f(fresh)} | ${f(scrap)} | ${f(shards)} | ${f(glimmer)} | ${f(bps)} | ${f(supplies)} | ${lengthRules(length).xp} |`,
      );
    }
  }
  console.log(rows.join('\n'));
  return 0;
}
