import { describe, expect, it } from 'vitest';
import type { Creature } from './api';
import {
  AWAY_REASON,
  asOrder,
  canSwapIn,
  keepsakeAct,
  moveInOrder,
  packItems,
  restAct,
  rowIds,
  sameOrder,
  swapAct,
  swapOptions,
  tileLabel,
  tileState,
} from './dungeon-run';
import { sampleRunCreatures } from './dungeon-path-samples';
import { sampleRoster } from './creature-card-sample';

describe('the pack as count badges', () => {
  it('is one badge for each kind in the pack, none for the empty ones', () => {
    const items = packItems({ bait: 2, essence: 0, scrap: 1 });
    expect(items.map((i) => [i.key, i.amount, i.name])).toEqual([
      ['bait', 2, 'Bait'],
      ['scrap', 1, 'Scrap'],
    ]);
    expect(packItems({ bait: 0, essence: 0, scrap: 0 })).toEqual([]);
    expect(packItems({ bait: 1, essence: 3, scrap: 2 }).map((i) => i.key)).toEqual([
      'bait',
      'essence',
      'scrap',
    ]);
  });

  it('names each badge for assistive technology, with an icon that is more than a name', () => {
    for (const item of packItems({ bait: 1, essence: 1, scrap: 1 })) {
      expect(item.label).toBe(item.name);
      expect(item.icon.kind).toMatch(/glyph|part/);
    }
  });
});

describe('a creature tile', () => {
  const [first] = sampleRunCreatures();
  const c = first as NonNullable<typeof first>;

  it('is fine, hurt (under a third of the HP) or knocked out', () => {
    expect(tileState({ hp: c.hpMax, hpMax: c.hpMax })).toBe('ok');
    expect(tileState({ hp: 100, hpMax: 300 })).toBe('ok');
    expect(tileState({ hp: 99, hpMax: 300 })).toBe('low');
    expect(tileState({ hp: 0, hpMax: 300 })).toBe('ko');
  });

  it('says the HP, or knocked out, for a screen reader', () => {
    expect(tileLabel({ ...c, hp: 240, hpMax: 281 })).toBe('Sproutle, level 12: 240 / 281 HP.');
    expect(tileLabel({ ...c, hp: 0 })).toBe('Sproutle, level 12: knocked out.');
  });
});

describe('the row order at the camp', () => {
  it('moves a creature one place and stops at the ends', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'z', 1)).toEqual(['a', 'b', 'c']);
  });

  it('never changes the order it was given', () => {
    const order = ['a', 'b', 'c'];
    moveInOrder(order, 'a', 1);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('compares orders and reads the ids of a row', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
    expect(rowIds([{ id: 'x' }, { id: 'y' }])).toEqual(['x', 'y']);
  });

  it('only sends an order of exactly three ids', () => {
    expect(asOrder(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(asOrder(['a', 'b'])).toBeUndefined();
    expect(asOrder(['a', 'b', 'c', 'd'])).toBeUndefined();
  });
});

describe('the camp acts', () => {
  const order = ['b', 'a', 'c'];

  it('rest, keepsake and swap carry the order of the row', () => {
    expect(restAct(order)).toEqual({ type: 'camp', choice: 'rest', order: ['b', 'a', 'c'] });
    expect(keepsakeAct(order, 'chalk-mark')).toEqual({
      type: 'camp',
      choice: 'keepsake',
      keepsake: 'chalk-mark',
      order: ['b', 'a', 'c'],
    });
    expect(swapAct(order, 'c', 'd')).toEqual({
      type: 'camp',
      choice: 'swap',
      out: 'c',
      in: 'd',
      order: ['b', 'a', 'c'],
    });
  });

  it('leave the order out rather than send one that is not a row of three', () => {
    expect(restAct(['a'])).toEqual({ type: 'camp', choice: 'rest' });
  });
});

describe('who can be brought in', () => {
  const owned: Creature[] = sampleRoster(5);
  const inRow = owned.slice(0, 3).map((c) => c.id);

  it('is every creature that is not in the row, the strongest first', () => {
    const options = swapOptions(owned, inRow);
    expect(options.map((o) => o.id).sort()).toEqual(
      owned
        .slice(3)
        .map((c) => c.id)
        .sort(),
    );
    const levels = options.map((o) => o.level);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(options.every((o) => !o.onBoard && o.disabled === null && o.effect === null)).toBe(true);
  });

  it('keeps one that is away on an expedition last, with the reason', () => {
    const away = owned.map((c, i) => (i === 3 ? { ...c, away: true, level: 99 } : c));
    const options = swapOptions(away, inRow);
    expect(options.at(-1)?.disabled).toBe(AWAY_REASON);
    expect(options.slice(0, -1).every((o) => o.disabled === null)).toBe(true);
  });

  it('says whether anyone can come in at all', () => {
    expect(canSwapIn(owned, inRow)).toBe(true);
    expect(canSwapIn(owned.slice(0, 3), inRow)).toBe(false);
    expect(
      canSwapIn(
        owned.slice(0, 4).map((c) => ({ ...c, away: true })),
        inRow,
      ),
    ).toBe(false);
  });
});
