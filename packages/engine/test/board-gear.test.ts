import { createSeededRng, itemOf, type Element, type FoldKit, type Role } from '@creatures/game';
import type { GearItem } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  compactRow,
  firstOfEachRow,
  placeSlots,
  rowLayout,
  simulateFight,
  skyFightFields,
  sparseBoard,
  zoneTwoAway,
  type FightSlot,
  type SlotMods,
} from '../src/index';
import { TEST_PACK, eventsOf, input, slot } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf, rulesOf } from './pattern-helpers';

/**
 * Where the gear and weather features of 2026-10-18 meet the board (decision "The fight uses the board's
 * rows"): position lines, set reach and Morning Haze read the board's own rows and neighbours when the fight
 * input carries a `board`, so an empty board slot is a gap that breaks "beside", and behave as before without
 * one.
 */

const STATS = { hp: 1_000, atk: 100, spd: 10 };
const hat = (lineId: string): GearItem =>
  itemOf('trail-cap', 'common', 20, [{ id: lineId, tier: 4 }]);
const kitOf = (element: Element, role: Role, items: GearItem[]): FoldKit => ({
  stats: STATS,
  crit: undefined,
  wearer: { element, role },
  items,
  talents: [],
});
const creature = (id: string, element: Element = 'tide', role: Role = 'payoff'): FightSlot =>
  slot(id, { element, role });
const kitsFor = (entries: [string, FoldKit][]): Map<string, FoldKit> => new Map(entries);

describe('position lines next to an empty board slot', () => {
  const shoulder = kitOf('tide', 'payoff', [hat('shoulder-to-shoulder')]);
  const plain = (element: Element = 'tide') => kitOf(element, 'payoff', []);
  const atkOf = (sparse: (FightSlot | null)[], id: string): number | undefined => {
    const kits = kitsFor([
      ['a', plain()],
      ['b', shoulder],
    ]);
    const placed = placeSlots(compactRow(sparse), kits, 'zones', sparseBoard(sparse));
    return placed.find((s) => s.id === id)?.stats?.atk;
  };

  it('a creature beside a gap has no neighbour on that side', () => {
    const a = creature('a');
    const b = creature('b');
    // Board of 9, Front is slots 0-2. Side by side (slots 1 and 2): one Tide neighbour, 100 x 1.05 + 2.
    expect(atkOf([null, a, b, null, null, null, null, null, null], 'b')).toBe(107);
    // The same two with a gap between them (slots 0 and 2): no neighbour, only the cap's 2 Attack.
    expect(atkOf([a, null, b, null, null, null, null, null, null], 'b')).toBe(102);
  });

  it('without a board the dense row is used, as before', () => {
    const a = creature('a');
    const b = creature('b');
    const kits = kitsFor([
      ['a', plain()],
      ['b', shoulder],
    ]);
    const placed = placeSlots([a, b], kits, 'zones');
    expect(placed[1]?.stats?.atk).toBe(107);
    // A dense board (slot i for creature i) is the same row.
    expect(placeSlots([a, b], kits, 'zones', { length: 2, slots: [0, 1] })).toEqual(placed);
  });

  it('a Lantern bearer gives nothing across a gap, and its gift lands when they stand side by side', () => {
    const bearer = kitOf('ember', 'support', [hat('lantern-bearer')]);
    const guard = creature('g', 'tide', 'guard');
    const lamp = creature('l', 'ember', 'support');
    const kits = kitsFor([
      ['g', plain()],
      ['l', bearer],
    ]);
    const hpOf = (sparse: (FightSlot | null)[]) =>
      placeSlots(compactRow(sparse), kits, 'zones', sparseBoard(sparse)).find((s) => s.id === 'g')
        ?.stats?.hp;
    const board9 = (at: Record<number, FightSlot>): (FightSlot | null)[] =>
      Array.from({ length: 9 }, (_, i) => at[i] ?? null);
    // Side by side: +6% of 1000. Across a gap the guard is left exactly as it was built.
    expect(hpOf(board9({ 0: guard, 1: lamp }))).toBe(1_060);
    expect(hpOf(board9({ 0: guard, 2: lamp }))).toBe(guard.stats?.hp);
  });

  it('the ends of a row are its first and last creature, as the boss silence counts them', () => {
    const edge = kitOf('tide', 'payoff', [hat('edge-walker')]);
    const sparse: (FightSlot | null)[] = [null, creature('a'), null, creature('b'), null, null];
    const kits = kitsFor([
      ['a', edge],
      ['b', edge],
    ]);
    // Board of 6: Front is slots 0-1, Middle 2-3, Back 4-5. `a` is alone in Front, `b` alone in Middle.
    const placed = placeSlots(compactRow(sparse), kits, 'zones', sparseBoard(sparse));
    expect(placed.map((s) => s.stats?.atk)).toEqual([112, 112]);
  });

  it('rowLayout lists who is beside whom only for a board', () => {
    expect(rowLayout(9, 'zones').beside).toBeUndefined();
    expect(rowLayout(3, 'line').beside).toBeUndefined();
    const layout = rowLayout({ length: 9, slots: [0, 2, 3, 4] }, 'zones');
    expect(layout.rows).toEqual([
      [0, 1],
      [2, 3],
    ]);
    // Slots 0 and 2 have a gap between them; 3 and 4 are Middle neighbours; 2 (Front) is not beside 3.
    expect(layout.beside).toEqual([[], [], [3], [2]]);
  });
});

describe('Morning Haze on a board', () => {
  // Board of 9, rows of three: Front slots 0-2, Middle 3-5, Back 6-8. Five creatures on slots
  // 1, 2 | 4 | 7, 8. Squeezed left the same five would split 1 | 3 | 1.
  const row = rowOf(5);
  const board = { length: 9, slots: [1, 2, 4, 7, 8] };

  it('names the first creature standing in each board row', () => {
    expect(firstOfEachRow(row, board)).toEqual(['s0', 's2', 's3']);
    // Without a board it is the dense row's rows.
    expect(firstOfEachRow(row)).toEqual(['s0', 's1', 's4']);
    expect(skyFightFields({ rainHealBp: 0, haze: true, brambleBp: 0 }, row, board)).toEqual({
      skipFirstTurn: ['s0', 's2', 's3'],
    });
    expect(skyFightFields({ rainHealBp: 0, haze: true, brambleBp: 0 }, row)).toEqual({
      skipFirstTurn: ['s0', 's1', 's4'],
    });
  });

  it('an empty slot before the first creature does not matter, and an empty row names nobody', () => {
    // Front has nobody (slots 3-8 only): Middle and Back each name theirs.
    const away = rowOf(3);
    expect(firstOfEachRow(away, { length: 9, slots: [4, 5, 8] })).toEqual(['s0', 's2']);
  });

  it('the fight skips exactly those turns in round 1', () => {
    const base = input(row, { board, skipFirstTurn: firstOfEachRow(row, board) });
    const r = simulateFight(base, createSeededRng('haze-board'), { pack: TEST_PACK });
    expect(eventsOf(r, 'skip').map((e) => [e.round, e.creature, e.reason])).toEqual([
      [1, 's0', 'haze'],
      [1, 's2', 'haze'],
      [1, 's3', 'haze'],
    ]);
  });
});

describe('set reach does not cross a gap', () => {
  const withMods = (s: FightSlot, mods: SlotMods): FightSlot => ({ ...s, mods });

  it('zoneTwoAway needs a creature in the slot between and the same zone', () => {
    const packed = { length: 9, slots: [0, 1, 2, 3] };
    expect(zoneTwoAway(0, packed)).toEqual([2]);
    expect(zoneTwoAway(1, packed)).toEqual([]); // slot 3 is Middle
    expect(zoneTwoAway(2, packed)).toEqual([0]);
    // A gap at slot 1: nobody is two places away from slot 0 through it.
    expect(zoneTwoAway(0, { length: 9, slots: [0, 2] })).toEqual([]);
    // A plain length is the dense row.
    expect(zoneTwoAway(0, 9)).toEqual([2]);
    expect(zoneTwoAway(4, 9)).toEqual([]);
    expect(zoneTwoAway(3, 9)).toEqual([5]);
  });

  describe('coverReach', () => {
    const areaHit = everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 });
    const rules = rulesOf({ guardHpBp: 0 });
    const guard = withMods(slot('g', { role: 'guard', atk: 1 }), { coverReach: 1 });
    const damage = (row: FightSlot[], board?: { length: number; slots: number[] }) =>
      Object.fromEntries(
        gimmickHits(
          fightWith(row, [areaHit], {
            rules,
            ...(board === undefined ? {} : { extra: { board } }),
          }),
        ).map(([, t, d]) => [t, d]),
      );

    it('covers two places away when the slot between is filled, not across an empty one', () => {
      const row = [guard, slot('x', { atk: 1 }), slot('y', { atk: 1 })];
      // Side by side on the board: x is beside (cover 40% of 100 leaves 60), y is two away and covered too.
      expect(damage(row, { length: 9, slots: [0, 1, 2] })).toEqual({ g: 100, x: 60, y: 60 });
      // A gap at slot 1: y stands two places from the Guard, but across the gap, so nothing covers it.
      expect(damage([guard, slot('y', { atk: 1 })], { length: 9, slots: [0, 2] })).toEqual({
        g: 100,
        y: 100,
      });
      // Without a board the row is dense (nine slots, rows of three): no gaps.
      expect(damage([guard, ...rowOf(8)])).toEqual({ g: 100, s0: 60, s1: 60 });
    });
  });

  describe('boostReach', () => {
    const buffs = (row: FightSlot[], board?: { length: number; slots: number[] }) =>
      eventsOf(
        fightWith(row, [], { rounds: 1, ...(board === undefined ? {} : { extra: { board } }) }),
        'support_buff',
      ).map((e) => e.target);
    const sup = withMods(slot('sup', { role: 'support', atk: 1 }), { boostReach: 1 });

    it('boosts the creature beyond the neighbour, but not through a gap', () => {
      const row = [sup, slot('x', { atk: 1 }), slot('y', { atk: 1 })];
      expect(buffs(row, { length: 9, slots: [0, 1, 2] })).toEqual(['x', 'y']);
      expect(buffs([sup, slot('y', { atk: 1 })], { length: 9, slots: [0, 2] })).toEqual([]);
      // A gap beyond the neighbour: x is beside, y is three places away.
      expect(buffs(row, { length: 12, slots: [0, 1, 3] })).toEqual(['x']);
      expect(buffs([sup, ...rowOf(8)])).toEqual(['s0', 's1']);
    });
  });
});
