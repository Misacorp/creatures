import { describe, expect, it } from 'vitest';
import {
  fightRowShape,
  simulateFight,
  zoneIndices,
  zoneNeighbours,
  zoneOfIndex,
  zoneSizes,
} from '../src/index';
import { createSeededRng } from '@creatures/game';
import { TEST_PACK, input } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf } from './pattern-helpers';

/** 13 creatures: the length formula gives 4/5/4, the board's shape here is 5/4/4. */
const SHAPE = { front: 5, middle: 4, back: 4 };

describe('row shape', () => {
  it('zone helpers take explicit sizes as well as a length', () => {
    expect(zoneSizes(SHAPE)).toEqual(SHAPE);
    expect(zoneSizes(13)).toEqual({ front: 4, middle: 5, back: 4 });
    expect(zoneIndices('front', SHAPE)).toEqual([0, 1, 2, 3, 4]);
    expect(zoneIndices('back', SHAPE)).toEqual([9, 10, 11, 12]);
    expect(zoneOfIndex(4, SHAPE)).toBe('front');
    expect(zoneOfIndex(4, 13)).toBe('middle');
    expect(zoneNeighbours(4, SHAPE)).toEqual([3]);
    expect(zoneNeighbours(5, SHAPE)).toEqual([6]);
  });

  it('a pincer of rows hits the ends of the board rows when the input carries them', () => {
    const g = everyRound({ op: 'pincer', scope: 'rows', power: 10_000 });
    const withShape = fightWith(rowOf(13), [g], { extra: { zones: SHAPE } });
    expect(gimmickHits(withShape).map((h) => h[1])).toEqual(['s0', 's4', 's5', 's8', 's9', 's12']);
    const byFormula = fightWith(rowOf(13), [g]);
    expect(gimmickHits(byFormula).map((h) => h[1])).toEqual(['s0', 's3', 's4', 's8', 's9', 's12']);
  });

  it('a sweep of one row hits the board row, and the default is unchanged without a shape', () => {
    const g = everyRound({ op: 'sweep', rows: ['front'], power: 10_000 });
    const withShape = fightWith(rowOf(13), [g], { extra: { zones: SHAPE } });
    expect(gimmickHits(withShape).map((h) => h[1])).toEqual(['s0', 's1', 's2', 's3', 's4']);
    const byFormula = fightWith(rowOf(13), [g]);
    expect(gimmickHits(byFormula).map((h) => h[1])).toEqual(['s0', 's1', 's2', 's3']);
    // The formula's own sizes written out are the same fight as no shape at all.
    const explicit = fightWith(rowOf(13), [g], { extra: { zones: zoneSizes(13) } });
    expect(explicit).toEqual(byFormula);
  });

  it('rejects zones that are not integers >= 0 adding up to the row', () => {
    const run = (zones: { front: number; middle: number; back: number }) =>
      simulateFight({ ...input(rowOf(9)), zones }, createSeededRng('x'), { pack: TEST_PACK });
    expect(() => run({ front: 3, middle: 3, back: 2 })).toThrow(RangeError);
    expect(() => run({ front: 4, middle: 3, back: 3 })).toThrow(RangeError);
    expect(() => run({ front: -1, middle: 5, back: 5 })).toThrow(RangeError);
    expect(() => run({ front: 1.5, middle: 3.5, back: 4 })).toThrow(RangeError);
    expect(() => fightRowShape({ row: rowOf(9), zones: { front: 3, middle: 3, back: 2 } })).toThrow(
      RangeError,
    );
    expect(fightRowShape({ row: rowOf(9) })).toEqual({ front: 3, middle: 3, back: 3 });
  });
});
