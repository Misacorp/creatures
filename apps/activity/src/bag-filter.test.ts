import { describe, expect, it } from 'vitest';
import {
  NO_FILTER,
  elementChoiceName,
  isFiltered,
  selectableIds,
  shownItems,
  type BagFilter,
} from './bag-filter';
import type { GearItem } from './gear-types';
import { PILE_MAX } from './gear-view';
import { sampleGearItem } from './workbench/gear-sample';

const ELEMENTS = ['tide', 'ember', 'grove', 'spark', 'mire'];
const item = (
  id: string,
  baseId: string,
  rarity: GearItem['rarity'],
  itemLevel: number,
  createdAt: number,
  extra: Partial<GearItem> = {},
): GearItem => ({ ...sampleGearItem({ id, baseId, rarity, itemLevel }), createdAt, ...extra });

const bag: GearItem[] = [
  item('a', 'kelp-cap', 'common', 9, 100, { slot: 'hat', tag: 'tide' }),
  item('b', 'kelp-cap', 'rare', 3, 300, { slot: 'hat', tag: 'ember' }),
  item('c', 'kelp-cap', 'epic', 2, 200, { slot: 'scarf', tag: 'neutral' }),
  item('d', 'kelp-cap', 'rare', 6, 400, { slot: 'charm', tag: 'tide' }),
];
const ids = (filter: BagFilter): string[] => shownItems(bag, filter, ELEMENTS).map((i) => i.id);

describe('the bag filter and sort', () => {
  it('shows everything best first by default (rarity, then item level)', () => {
    expect(ids(NO_FILTER)).toEqual(['c', 'd', 'b', 'a']);
    expect(isFiltered(NO_FILTER)).toBe(false);
  });

  it('filters by slot, rarity and element, alone or together', () => {
    expect(ids({ ...NO_FILTER, slot: 'hat' })).toEqual(['b', 'a']);
    expect(ids({ ...NO_FILTER, rarity: 'rare' })).toEqual(['d', 'b']);
    expect(ids({ ...NO_FILTER, element: 'tide' })).toEqual(['d', 'a']);
    expect(ids({ ...NO_FILTER, element: 'tide', rarity: 'rare' })).toEqual(['d']);
    expect(ids({ ...NO_FILTER, element: 'none' })).toEqual(['c']);
    expect(isFiltered({ ...NO_FILTER, slot: 'hat' })).toBe(true);
    expect(ids({ ...NO_FILTER, slot: 'charm', rarity: 'common' })).toEqual([]);
  });

  it('sorts by item level or by newest', () => {
    expect(ids({ ...NO_FILTER, sort: 'level' })).toEqual(['a', 'd', 'b', 'c']);
    expect(ids({ ...NO_FILTER, sort: 'newest' })).toEqual(['d', 'b', 'c', 'a']);
    expect(isFiltered({ ...NO_FILTER, sort: 'newest' })).toBe(false);
  });

  it('"Select all" takes what is shown, at most one pile', () => {
    const many = Array.from({ length: PILE_MAX + 5 }, (_, n) =>
      item(`x${String(n)}`, 'kelp-cap', 'common', 1, n),
    );
    expect(selectableIds(many)).toHaveLength(PILE_MAX);
    expect(selectableIds(shownItems(bag, { ...NO_FILTER, slot: 'hat' }, ELEMENTS))).toEqual([
      'b',
      'a',
    ]);
  });

  it('names its element choices', () => {
    expect(elementChoiceName('all')).toBe('Any');
    expect(elementChoiceName('none')).toBe('None');
    expect(elementChoiceName('tide')).toBe('Tide');
  });
});
