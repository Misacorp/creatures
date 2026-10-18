import { describe, expect, it } from 'vitest';
import {
  baseMinLevel,
  compareGear,
  gearBase,
  itemOf,
  itemStat,
  applyGear,
  setPieces,
  type GearItem,
  type Stats,
  type Wearer,
} from '../src/index';

/**
 * The compare block's rules (what swapping a worn item changes): every number is the difference of two
 * `applyGear` folds, and the set changes come from `setCounts`.
 */

const STATS: Stats = { hp: 1_000, atk: 100, spd: 10 };
const WEARER: Wearer = { role: 'payoff', element: 'grove' };

/** One piece of a set at an item level that opens it, with no rolled lines (so only the base and the set speak). */
function piece(setId: string, slot: 'hat' | 'scarf' | 'charm'): GearItem {
  const base = setPieces(setId).find((b) => b.slot === slot);
  if (base === undefined) throw new Error(`no ${slot} in ${setId}`);
  return itemOf(base.id, 'common', Math.max(12, baseMinLevel(base)), []);
}

/** A plain item of a base (no set), at its opening level. */
function plain(baseId: string): GearItem {
  const base = gearBase(baseId);
  if (base === undefined) throw new Error(baseId);
  return itemOf(base.id, 'common', baseMinLevel(base), []);
}

const stat = (item: GearItem, kind: 'hp' | 'atk' | 'critChance' | 'critDamage'): number =>
  itemStat(item, kind)?.value ?? 0;

/** What an item's own stats add, in the compare's order (crit in basis points), without the zeroes. */
function own(item: GearItem | undefined) {
  return (['hp', 'atk', 'critChance', 'critDamage'] as const).map((kind) => ({
    stat: kind,
    value: item === undefined ? 0 : stat(item, kind),
  }));
}

function compare(worn: GearItem[], next: GearItem) {
  return compareGear({ stats: STATS, crit: undefined, wearer: WEARER, worn, next });
}

describe('compareGear: stats', () => {
  it('says the Attack and HP a better hat adds over the worn one, and only the stats that change', () => {
    const worn = plain('kelp-cap');
    const next = plain('emberkeepers-crown');
    const result = compare([worn], next);
    const before = own(worn);
    const expected = own(next)
      .map((n, i) => ({ stat: n.stat, delta: n.value - (before[i]?.value ?? 0) }))
      .filter((c) => c.delta !== 0);
    expect(expected.length).toBeGreaterThan(1);
    expect(result.stats).toEqual(expected);
    expect(result.sets).toEqual([]);
  });

  it('says it with minus signs for a worse hat (the reverse swap negates every number)', () => {
    const a = plain('kelp-cap');
    const b = plain('emberkeepers-crown');
    const up = compare([a], b).stats;
    const down = compare([b], a).stats;
    expect(down).toEqual(up.map((c) => ({ stat: c.stat, delta: -c.delta })));
    expect(down.every((c) => c.delta < 0)).toBe(true);
  });

  it('gains everything the item has when the slot is empty, and leaves the other slots alone', () => {
    const next = plain('emberkeepers-crown');
    const scarf = plain('woolen-wrap');
    const alone = compare([], next);
    expect(alone.stats).toEqual(
      own(next)
        .map((n) => ({ stat: n.stat, delta: n.value }))
        .filter((c) => c.delta !== 0),
    );
    // A worn scarf does not change what the hat adds.
    expect(compare([scarf], next).stats).toEqual(alone.stats);
  });

  it('folds a Charm, which has no stats of its own, through its line only', () => {
    const charm = plain('trail-charm');
    const folded = applyGear(STATS, undefined, WEARER, [charm]).stats;
    const result = compare([], charm);
    expect(result.stats).toEqual(
      [
        { stat: 'hp' as const, delta: folded.hp - STATS.hp },
        { stat: 'atk' as const, delta: folded.atk - STATS.atk },
      ].filter((c) => c.delta !== 0),
    );
    expect(result.sets).toEqual([]);
  });

  it('says nothing for an item that adds what the worn one adds', () => {
    const hat = plain('kelp-cap');
    expect(compare([hat], hat)).toEqual({ stats: [], sets: [] });
  });

  it('folds a set bonus into the stats: the second Hollow Weave piece gives +8% HP on top of its own', () => {
    const hat = piece('hollow-weave', 'hat');
    const scarf = piece('hollow-weave', 'scarf');
    const result = compare([hat], scarf);
    const hp = result.stats.find((c) => c.stat === 'hp');
    // 8% of the creature's 1000 HP, plus the scarf's own HP (the Hat's is already counted before the swap).
    expect(hp?.delta).toBe(80 + stat(scarf, 'hp'));
  });
});

describe('compareGear: sets', () => {
  it('reports a set the swap completes (2 to 3 pieces)', () => {
    const worn = [piece('forge-warm-kit', 'hat'), piece('forge-warm-kit', 'scarf')];
    const result = compare(worn, piece('forge-warm-kit', 'charm'));
    expect(result.sets).toEqual([{ setId: 'forge-warm-kit', before: 2, after: 3 }]);
  });

  it('reports a set the swap breaks (2 to 1 piece) and one it only weakens (3 to 2)', () => {
    const two = [piece('hollow-weave', 'hat'), piece('hollow-weave', 'scarf')];
    // A Charm does not touch a two-piece set of Hat and Scarf.
    expect(compare(two, plain('trail-charm')).sets).toEqual([]);
    expect(compare(two, plain('felt-hat')).sets).toEqual([
      { setId: 'hollow-weave', before: 2, after: 1 },
    ]);
    const three = [...two, piece('hollow-weave', 'charm')];
    expect(compare(three, plain('trail-charm')).sets).toEqual([
      { setId: 'hollow-weave', before: 3, after: 2 },
    ]);
  });

  it('reports a set the swap gains a bonus of (1 to 2 pieces) but not the first piece (0 to 1)', () => {
    expect(compare([], piece('hollow-weave', 'hat')).sets).toEqual([]);
    expect(compare([piece('hollow-weave', 'hat')], piece('hollow-weave', 'scarf')).sets).toEqual([
      { setId: 'hollow-weave', before: 1, after: 2 },
    ]);
  });

  it('says nothing when a piece of a set is swapped for another piece of the same slot and set', () => {
    const worn = [piece('hollow-weave', 'hat'), piece('hollow-weave', 'scarf')];
    expect(compare(worn, piece('hollow-weave', 'scarf')).sets).toEqual([]);
  });

  it('can lose one set and gain another in one swap', () => {
    const worn = [
      piece('hollow-weave', 'hat'),
      piece('hollow-weave', 'scarf'),
      piece('forge-warm-kit', 'charm'),
    ];
    const next = piece('forge-warm-kit', 'hat');
    expect(compare(worn, next).sets).toEqual([
      { setId: 'hollow-weave', before: 2, after: 1 },
      { setId: 'forge-warm-kit', before: 1, after: 2 },
    ]);
  });
});
