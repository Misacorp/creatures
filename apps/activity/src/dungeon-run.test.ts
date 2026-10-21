import { describe, expect, it } from 'vitest';
import type { Creature } from './api';
import {
  AWAY_REASON,
  asOrder,
  canSwapIn,
  keepsakeAct,
  packBadges,
  packItems,
  packKinds,
  restAct,
  rowIds,
  sameOrder,
  swapAct,
  swapPlaces,
  orderAfterSwap,
  campHp,
  campSlotLabel,
  swapOptions,
  tileLabel,
  tileState,
} from './dungeon-run';
import { sampleCampCreatures, sampleRunCreatures, sampleStateCamp } from './dungeon-path-samples';
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

describe('the pack as one line of icons', () => {
  const found = { bait: 3, essence: 0, scrap: 3 };

  it('has icons and numbers only (no names), without the empty kinds', () => {
    const badges = packBadges({ bait: 2, essence: 1, scrap: 0 });
    expect(badges.map((b) => [b.key, b.amount, b.label])).toEqual([
      ['bait', 2, 'Bait'],
      ['essence', 1, 'Essence'],
    ]);
    expect(badges.every((b) => b.name === undefined)).toBe(true);
    expect(packBadges({ bait: 0, essence: 0, scrap: 0 })).toEqual([]);
  });

  it('lists the kinds that were found with what of each was kept', () => {
    expect(
      packKinds(found, { bait: 2, essence: 0, scrap: 2 }).map((k) => [k.key, k.found, k.kept]),
    ).toEqual([
      ['bait', 3, 2],
      ['scrap', 3, 2],
    ]);
    expect(packKinds({ bait: 0, essence: 0, scrap: 0 }, { bait: 0, essence: 0, scrap: 0 })).toEqual(
      [],
    );
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
  it('swaps two creatures of the row and leaves anything else alone', () => {
    expect(swapPlaces(['a', 'b', 'c'], 'a', 'c')).toEqual(['c', 'b', 'a']);
    expect(swapPlaces(['a', 'b', 'c'], 'b', 'a')).toEqual(['b', 'a', 'c']);
    expect(swapPlaces(['a', 'b', 'c'], 'a', 'a')).toEqual(['a', 'b', 'c']);
    expect(swapPlaces(['a', 'b', 'c'], 'a', 'z')).toEqual(['a', 'b', 'c']);
  });

  it('never changes the order it was given', () => {
    const order = ['a', 'b', 'c'];
    swapPlaces(order, 'a', 'b');
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('puts the creature that comes in where the one that leaves stood', () => {
    expect(orderAfterSwap(['a', 'b', 'c'], 'b', 'd')).toEqual(['a', 'd', 'c']);
    expect(orderAfterSwap(['a', 'b', 'c'], 'z', 'd')).toEqual(['a', 'b', 'c']);
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
    // A swap's order is the row after it: it holds the creature that comes in, not the one that leaves.
    expect(swapAct(['b', 'a', 'd'], 'c', 'd')).toEqual({
      type: 'camp',
      choice: 'swap',
      out: 'c',
      in: 'd',
      order: ['b', 'a', 'd'],
    });
  });

  it('leave the order out rather than send one that is not a row of three', () => {
    expect(restAct(['a'])).toEqual({ type: 'camp', choice: 'rest' });
  });
});

describe('the HP under a creature at the camp', () => {
  it('says the HP in words, red when low or down, and full for a new arrival', () => {
    expect(campHp({ now: 140, max: 203 })).toMatchObject({ state: 'ok', text: '140 / 203 HP' });
    expect(campHp({ now: 60, max: 203 })).toMatchObject({ state: 'low', text: '60 / 203 HP' });
    expect(campHp({ now: 0, max: 215 })).toEqual({ ratio: 0, state: 'ko', text: '0 / 215 HP' });
    expect(campHp(null)).toEqual({ ratio: 1, state: 'ok', text: 'Full HP' });
    expect(campHp({ now: 5, max: 0 }).ratio).toBe(0);
  });

  it('names the place, the HP and what a tap shows for a screen reader', () => {
    const c = {
      id: 'a',
      name: 'Sproutle',
      species: 'sproutle',
      level: 12,
      element: 'grove',
      role: 'guard',
      gear: [],
    };
    expect(campSlotLabel({ ...c, hp: { now: 240, max: 281 } }, 0)).toBe(
      'Left: Sproutle, level 12, 240 / 281 HP. Shows its role and element.',
    );
    expect(campSlotLabel({ ...c, hp: { now: 0, max: 281 } }, 1)).toContain('knocked out');
    const worn = {
      baseId: 'trail-cap',
      slot: 'hat' as const,
      rarity: 'common' as const,
      itemLevel: 3,
      lines: [],
    };
    expect(campSlotLabel({ ...c, hp: null, gear: [worn] }, 2)).toBe(
      'Right: Sproutle, level 12, full HP. Shows its role, element and gear.',
    );
  });
});

describe('the sample creatures of the camp page', () => {
  const inRow = sampleStateCamp().team.map((c) => c.id);

  it('hold the row itself, so three creatures leave nobody to swap in and six leave three', () => {
    const three = sampleCampCreatures(3);
    expect(three.map((c) => c.id)).toEqual(inRow);
    expect(canSwapIn(three, inRow)).toBe(false);
    expect(swapOptions(sampleCampCreatures(6), inRow)).toHaveLength(3);
    expect(canSwapIn(sampleCampCreatures(6), inRow)).toBe(true);
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
    // The same words as everywhere else a busy creature is named.
    expect(AWAY_REASON).toBe('Away on a trip');
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
