import { describe, expect, it } from 'vitest';
import {
  fightRowShape,
  laneCount,
  laneOfIndex,
  simulateFight,
  sparseBoard,
  zoneIndices,
  zoneNeighbours,
  zoneOfIndex,
  zoneSizes,
} from '../src/index';
import { createSeededRng } from '@creatures/game';
import { TEST_PACK, input, slot } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf } from './pattern-helpers';

/**
 * A board of 9 (rows of 3: slots 0-2, 3-5, 6-8) with six creatures: s0 and s1 in Front lanes 1 and
 * 2, s2 and s3 in Middle lanes 0 and 1, s4 and s5 in Back lanes 0 and 1. Squeezed left, the same
 * six would be two per row (s0 s1 | s2 s3 | s4 s5), which puts s1 in Front lane 1.
 */
const GAPPED = { length: 9, slots: [1, 2, 3, 4, 6, 7] };

describe('board positions', () => {
  it('zone, lane and beside come from the board slots, not the order in the row', () => {
    expect(zoneSizes(GAPPED)).toEqual({ front: 3, middle: 3, back: 3 });
    expect(laneCount(GAPPED)).toBe(3);
    expect([0, 1, 2, 3, 4, 5].map((i) => zoneOfIndex(i, GAPPED))).toEqual([
      'front',
      'front',
      'middle',
      'middle',
      'back',
      'back',
    ]);
    expect([0, 1, 2, 3, 4, 5].map((i) => laneOfIndex(i, GAPPED))).toEqual([1, 2, 0, 1, 0, 1]);
    expect(zoneIndices('middle', GAPPED)).toEqual([2, 3]);
  });

  it('a plain length is the dense row: slot i is index i', () => {
    expect(zoneSizes(13)).toEqual({ front: 4, middle: 5, back: 4 });
    expect(zoneIndices('back', 13)).toEqual([9, 10, 11, 12]);
    expect(zoneOfIndex(4, 13)).toBe('middle');
    expect(laneOfIndex(4, 13)).toBe(0);
    expect(zoneNeighbours(4, 13)).toEqual([5]);
    expect(zoneNeighbours(5, 13)).toEqual([4, 6]);
  });

  it('two creatures with a gap between them are not beside each other', () => {
    // Board of 9, Front slots 0-2: a at 0, b at 2 (gap at 1), c at 4 (Middle).
    const board = { length: 9, slots: [0, 2, 4] };
    expect(zoneNeighbours(0, board)).toEqual([]);
    expect(zoneNeighbours(1, board)).toEqual([]);
    // Without the gap they are beside, and the zone edge still breaks it (slot 2 and 3).
    const packed = { length: 9, slots: [1, 2, 3] };
    expect(zoneNeighbours(0, packed)).toEqual([1]);
    expect(zoneNeighbours(1, packed)).toEqual([0]);
    expect(zoneNeighbours(2, packed)).toEqual([]);
  });

  it('a lance goes down the board column even with a gap before it', () => {
    const lance = everyRound({ op: 'lance', lane: 'strongest', power: 10_000, falloffBp: 10_000 });
    const row = rowOf(6, { 3: { atk: 50 } });
    // The strongest, s3, is in lane 1 of the Middle row: Front lane 1 is s0, Back lane 1 is s5.
    const onBoard = fightWith(row, [lance], { extra: { board: GAPPED } });
    expect(gimmickHits(onBoard).map((h) => h[1])).toEqual(['s0', 's3', 's5']);
    // Squeezed left it would be the dense row's lane 1: s1, s3, s5.
    const dense = fightWith(row, [lance]);
    expect(gimmickHits(dense).map((h) => h[1])).toEqual(['s1', 's3', 's5']);
  });

  it('a pincer of rows hits the ends of the board rows', () => {
    const g = everyRound({ op: 'pincer', scope: 'rows', power: 10_000 });
    // 13 creatures on a board of 15 (rows of 5), gaps at the end of the middle and back rows.
    const board = { length: 15, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13] };
    const onBoard = fightWith(rowOf(13), [g], { extra: { board } });
    expect(gimmickHits(onBoard).map((h) => h[1])).toEqual(['s0', 's4', 's5', 's8', 's9', 's12']);
    const dense = fightWith(rowOf(13), [g]);
    expect(gimmickHits(dense).map((h) => h[1])).toEqual(['s0', 's3', 's4', 's8', 's9', 's12']);
  });

  it('an input without a board replays exactly as the dense row written out', () => {
    const g = everyRound({ op: 'lance', lane: 'random', power: 10_000, falloffBp: 8_000 });
    for (const n of [1, 2, 7, 9, 13]) {
      const dense = { length: n, slots: Array.from({ length: n }, (_, i) => i) };
      const without = fightWith(rowOf(n), [g], { rounds: 4 });
      const withIt = fightWith(rowOf(n), [g], { rounds: 4, extra: { board: dense } });
      expect(withIt).toEqual(without);
    }
  });

  it('sparseBoard reads the board off a row with empty slots', () => {
    const a = slot('a');
    expect(sparseBoard([null, a, null, a, a])).toEqual({ length: 5, slots: [1, 3, 4] });
    expect(sparseBoard([])).toEqual({ length: 0, slots: [] });
  });

  it('rejects a board that does not fit the row', () => {
    const run = (board: { length: number; slots: number[] }) =>
      simulateFight({ ...input(rowOf(3)), board }, createSeededRng('x'), { pack: TEST_PACK });
    expect(() => run({ length: 9, slots: [0, 1] })).toThrow(RangeError);
    expect(() => run({ length: 9, slots: [0, 1, 2, 3] })).toThrow(RangeError);
    expect(() => run({ length: 9, slots: [0, 2, 2] })).toThrow(RangeError);
    expect(() => run({ length: 9, slots: [0, 3, 2] })).toThrow(RangeError);
    expect(() => run({ length: 9, slots: [0, 1, 9] })).toThrow(RangeError);
    expect(() => run({ length: 9, slots: [-1, 1, 2] })).toThrow(RangeError);
    expect(() => run({ length: 9, slots: [0, 1.5, 2] })).toThrow(RangeError);
    expect(() => run({ length: 2.5, slots: [0, 1, 2] })).toThrow(RangeError);
    expect(() => fightRowShape({ row: rowOf(3), board: { length: 2, slots: [0, 1, 2] } })).toThrow(
      RangeError,
    );
    expect(fightRowShape({ row: rowOf(3) })).toEqual({ length: 3, slots: [0, 1, 2] });
  });
});
