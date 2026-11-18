import { describe, expect, it } from 'vitest';
import { nextBossMoves, type NextMoveInput } from './next-boss-move';
import type { BossMoveV2 } from './raid-v2-api';

const move = (id: string, o: Partial<BossMoveV2>): BossMoveV2 => ({
  id,
  name: id,
  label: id,
  shape: 'row',
  silences: false,
  oneShot: false,
  fizzles: false,
  every: 2,
  turn: 2,
  windUp: false,
  later: false,
  ...o,
});
const input = (o: Partial<NextMoveInput>): NextMoveInput => ({
  card: { moves: [move('spear', { every: 2, turn: 2 })] },
  rows: 3,
  round: 1,
  step: null,
  phase: null,
  ...o,
});
const ids = (m: BossMoveV2[] | null): string[] | null => (m === null ? null : m.map((x) => x.id));

describe('nextBossMoves', () => {
  it('names the move on the round and turn it comes', () => {
    expect(ids(nextBossMoves(input({ round: 2, step: { kind: 'row', row: 2 } })))).toEqual([
      'spear',
    ]);
    expect(ids(nextBossMoves(input({ round: 2, step: { kind: 'boss', row: 1 } })))).toEqual([
      'spear',
    ]);
  });
  it('is the plain attack alone on a turn with no move due', () => {
    expect(ids(nextBossMoves(input({ round: 1, step: null })))).toEqual([]);
    expect(ids(nextBossMoves(input({ round: 2, step: null })))).toEqual([]);
  });
  it('rolls over to the next round after the last turn', () => {
    const card = { moves: [move('early', { every: 2, turn: 0 })] };
    const last = { kind: 'boss', row: 2 } as const;
    expect(ids(nextBossMoves(input({ card, round: 1, step: last })))).toEqual(['early']);
    expect(ids(nextBossMoves(input({ card, round: 2, step: last })))).toEqual([]);
  });
  it('reads round 0 as the first turn of round 1', () => {
    const card = { moves: [move('first', { every: 1, turn: 0 })] };
    expect(ids(nextBossMoves(input({ card, round: 0 })))).toEqual(['first']);
  });
  it('lists every move due on one turn, in card order', () => {
    const card = { moves: [move('a', { every: 1 }), move('b', { every: 2 })] };
    expect(ids(nextBossMoves(input({ card, round: 2, step: { kind: 'row', row: 2 } })))).toEqual([
      'a',
      'b',
    ]);
  });
  it('cannot say when a later move is due and the change of pattern has not begun', () => {
    const card = { moves: [move('late', { every: 1, turn: 2, later: true })] };
    const at = { round: 1, step: { kind: 'row', row: 2 } as const, card };
    expect(nextBossMoves(input({ ...at, phase: false }))).toBeNull();
    expect(ids(nextBossMoves(input({ ...at, phase: true })))).toEqual(['late']);
    expect(ids(nextBossMoves(input({ ...at, step: null, phase: false })))).toEqual([]);
  });
});
