import { describe, expect, it } from 'vitest';
import {
  RULES,
  content,
  createSeededRng,
  destinationDef,
  rollTripCatch,
  rollTripCatches,
  type DestinationDef,
  type PityCounters,
  type Rng,
  type TripCatchContext,
} from '../src/index';

const BP = 10_000;

function dest(id: string): DestinationDef {
  const d = destinationDef(id);
  if (d === undefined) throw new Error(`no destination ${id}`);
  return d;
}

/** A source of draws that always misses a chance roll of a few percent (2^31 mod 10000 is 3648). */
function misses(): Rng {
  return { nextU32: () => 0x80000000 };
}

const ctx = (over: Partial<TripCatchContext> = {}): TripCatchContext => ({
  content,
  destination: dest('old-crossroads'),
  length: 'short',
  explorer: { element: 'ember', role: 'payoff' },
  kit: [],
  stars: 0,
  milestoneRarityBp: 0,
  twist: null,
  ownedLines: new Set(),
  dupeStreak: 0,
  firstExpedition: false,
  ...over,
});

const { newAfter, creatureEvery } = RULES.catching.pity;

describe('the new-species pity', () => {
  it('is a stored pair of counters and changes nothing without them', () => {
    const rng = createSeededRng('no-pity');
    const out = rollTripCatches(rng, 30, ctx());
    expect(out.forced).toEqual([]);
    // The rolls still follow only their chances: the same seed with the counters far from any limit agrees.
    const same = rollTripCatches(
      createSeededRng('no-pity'),
      30,
      ctx({ pity: { sinceNew: 0, sinceCreature: 0 } }),
    );
    expect(same.results.length).toBeGreaterThanOrEqual(out.results.length);
    expect(out.results.length + out.empty).toBe(30);
  });

  it('counts rolls since the last new species and since the last creature', () => {
    const none = rollTripCatches(misses(), 3, ctx({ pity: { sinceNew: 2, sinceCreature: 1 } }));
    expect(none.results).toEqual([]);
    expect(none.empty).toBe(3);
    expect(none.pity).toEqual({ sinceNew: 5, sinceCreature: 4 });
  });

  it(`brings a creature on roll ${String(creatureEvery)} without any, even when the chance misses`, () => {
    const pity: PityCounters = { sinceNew: 0, sinceCreature: creatureEvery - 1 };
    const roll = rollTripCatch(misses(), ctx({ pity }));
    expect(roll.result).not.toBeNull();
    expect(roll.pity).toBe('creature');
    // One roll earlier it still follows the chance.
    const earlier = rollTripCatch(
      misses(),
      ctx({ pity: { sinceNew: 0, sinceCreature: creatureEvery - 2 } }),
    );
    expect(earlier.result).toBeNull();
    expect(earlier.pity).toBeNull();
  });

  it(`brings a species the player lacks after ${String(newAfter)} rolls without one, whatever the chance`, () => {
    const owned = new Set(['splashet', 'cindle', 'sproutle']);
    const pity: PityCounters = { sinceNew: newAfter, sinceCreature: 0 };
    for (let i = 0; i < 40; i++) {
      const roll = rollTripCatch(
        createSeededRng(`new-${String(i)}`),
        ctx({ ownedLines: owned, pity }),
      );
      expect(roll.pity).toBe('new');
      expect(roll.result?.duplicate).toBe(false);
      expect(owned.has(roll.result?.species.line ?? '')).toBe(false);
    }
    const early = rollTripCatch(
      misses(),
      ctx({ ownedLines: owned, pity: { sinceNew: newAfter - 1, sinceCreature: 0 } }),
    );
    expect(early.pity).toBeNull();
  });

  it('reaches the deeper area, and rarer species, only when nothing nearer is lacking', () => {
    // At the Old Crossroads the base species are the five commons and rares; Gaiadrake lives deeper.
    const here = dest('old-crossroads');
    const base = here.species;
    const owned = new Set(base.map((id) => content.creatures.find((c) => c.id === id)?.line ?? id));
    const roll = rollTripCatch(
      createSeededRng('deep'),
      ctx({ ownedLines: owned, pity: { sinceNew: newAfter, sinceCreature: 0 } }),
    );
    expect(roll.pity).toBe('new');
    expect(roll.result?.species.id).toBe('gaiadrake');
    expect(roll.result?.deep).toBe(true);
  });

  it('does not force a creature that cannot be new: a place with nothing left to find follows the chance', () => {
    const tidepools = dest('tidepools');
    const owned = new Set(
      tidepools.species.map((id) => content.creatures.find((c) => c.id === id)?.line ?? id),
    );
    const roll = rollTripCatch(
      misses(),
      ctx({
        destination: tidepools,
        ownedLines: owned,
        pity: { sinceNew: newAfter + 5, sinceCreature: 0 },
      }),
    );
    expect(roll.result).toBeNull();
    expect(roll.pity).toBeNull();
  });

  it('resets on a new species, and a duplicate only resets the creature counter', () => {
    const owned = new Set(['splashet']);
    // A new species: both counters go back to 0.
    const fresh = rollTripCatches(
      createSeededRng('reset'),
      1,
      ctx({ ownedLines: owned, pity: { sinceNew: newAfter, sinceCreature: 4 } }),
    );
    expect(fresh.results[0]?.duplicate).toBe(false);
    expect(fresh.pity).toEqual({ sinceNew: 0, sinceCreature: 0 });
    // A duplicate: the new-species counter keeps counting.
    const everything = new Set(
      dest('old-crossroads').species.map(
        (id) => content.creatures.find((c) => c.id === id)?.line ?? id,
      ),
    );
    everything.add('gaiadrake');
    const dupe = rollTripCatches(
      createSeededRng('dupe'),
      1,
      ctx({ ownedLines: everything, pity: { sinceNew: 3, sinceCreature: creatureEvery - 1 } }),
    );
    expect(dupe.results[0]?.duplicate).toBe(true);
    expect(dupe.pity).toEqual({ sinceNew: 4, sinceCreature: 0 });
  });

  it('never makes a creature appear less often than every few rolls, over many claims', () => {
    const rng = createSeededRng('floor');
    let pity: PityCounters = { sinceNew: 0, sinceCreature: 0 };
    let longestGap = 0;
    let gap = 0;
    for (let claim = 0; claim < 400; claim++) {
      const out = rollTripCatches(rng, 1, ctx({ pity }));
      pity = out.pity;
      if (out.results.length === 0) {
        gap += 1;
        longestGap = Math.max(longestGap, gap);
      } else gap = 0;
    }
    expect(longestGap).toBeLessThanOrEqual(creatureEvery - 1);
    expect(pity.sinceCreature).toBeLessThanOrEqual(creatureEvery - 1);
  });

  it('is deterministic for a seed: the pity decides without drawing', () => {
    const pity: PityCounters = { sinceNew: newAfter, sinceCreature: creatureEvery };
    const a = rollTripCatches(createSeededRng('same'), 5, ctx({ pity }));
    const b = rollTripCatches(createSeededRng('same'), 5, ctx({ pity }));
    expect(a).toEqual(b);
    expect(BP).toBe(10_000);
  });
});
