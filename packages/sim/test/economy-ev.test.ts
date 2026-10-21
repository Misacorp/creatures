import { describe, expect, it } from 'vitest';
import {
  content,
  createSeededRng,
  kitOf,
  rollMapTicks,
  rollTripCatches,
  rollTripLoot,
  tripTicks,
  type ExpeditionLength,
} from '@creatures/game';
import { referencePlace, tripEv, type TripMods } from '../src/trip-ev';

/** The mean and the standard error of a sample. */
function stats(values: number[]): { mean: number; se: number } {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(variance / n) };
}

/** Plays `n` finished trips with the real roll functions (the reference trip of `trip-ev.ts`). */
function play(length: ExpeditionLength, kitIds: string[], mods: TripMods, n: number) {
  const kit = kitOf(kitIds);
  const place = referencePlace();
  const rng = createSeededRng(`ev:${length}:${kitIds.join('+')}`);
  const cols: Record<string, number[]> = {};
  const add = (key: string, value: number) => (cols[key] ??= []).push(value);
  for (let i = 0; i < n; i++) {
    const ticks = tripTicks(length, null) + rollMapTicks(rng, length, kit);
    const c = rollTripCatches(
      rng,
      ticks,
      {
        content,
        destination: place,
        length,
        explorer: { element: 'ember', role: 'payoff' },
        kit,
        stars: 0,
        milestoneRarityBp: 0,
        twist: null,
        ownedLines: new Set(),
        dupeStreak: 0,
        firstExpedition: false,
      },
      true,
    );
    const loot = rollTripLoot(rng, {
      ticks,
      fixedParts: true,
      place: { element: 'ember', crossroads: false },
      role: mods.guard === true ? 'guard' : 'payoff',
      kit,
      stars: 0,
      milestonePartsBp: 0,
      twist: null,
      rank: 3,
      gearPartsBp: mods.keenNoseBp ?? 0,
      weatherPartsBp: mods.weatherPartsBp ?? 0,
    });
    add('ticks', ticks);
    add('creatures', c.results.length);
    add('deepCreatures', c.results.filter((r) => r.deep).length);
    add('scrap', loot.parts.scrap ?? 0);
    add('shards', loot.parts['ember-shard'] ?? 0);
    add('glimmer', loot.parts.glimmer ?? 0);
    add('gearTotal', loot.gear.length);
    add('blueprints', loot.blueprints.length);
    add('supplies', loot.supplies.length);
  }
  return Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, stats(v)]));
}

describe('the exact expected value of a trip', () => {
  const cells: { length: ExpeditionLength; kit: string[]; mods?: TripMods }[] = [
    { length: 'long', kit: [] },
    { length: 'short', kit: ['lantern-great'] },
    { length: 'medium', kit: ['satchel-good', 'lantern-good'] },
    { length: 'day', kit: ['lure-good', 'map-scrap-good'] },
    { length: 'long', kit: ['satchel-great'], mods: { guard: true, keenNoseBp: 1_500 } },
  ];

  it.each(cells)('matches the real rolls: $length with $kit', ({ length, kit, mods }) => {
    const ev = tripEv(length, kit, mods ?? {});
    const played = play(length, kit, mods ?? {}, 3_000);
    for (const key of Object.keys(played)) {
      const { mean, se } = played[key] as { mean: number; se: number };
      const exact = (ev as unknown as Record<string, number>)[key] as number;
      // Five standard errors, and a hair for the cells that never vary.
      expect(Math.abs(mean - exact), `${key}: played ${mean}, exact ${exact}`).toBeLessThanOrEqual(
        5 * se + 0.005,
      );
    }
  });
});
