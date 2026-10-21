import { describe, expect, it } from 'vitest';
import type { GearStat } from '../gear-types';
import { allBagItems } from './bag-sample';
import { compactReason, pickerChoices, statRows } from './picker-view';
import { PAGE_SAMPLE_ID, pageScene } from './sample';

describe('the item picker rules', () => {
  const scene = pageScene('level 15');
  const choices = pickerChoices(scene.gear.items, scene.creature, scene.state.creatures, 'hat');

  it('lists wearable items first and gives a compact reason for the rest', () => {
    const firstBlocked = choices.findIndex((c) => c.blocked !== null);
    expect(firstBlocked).toBeGreaterThan(0);
    expect(choices.slice(firstBlocked).every((c) => c.blocked !== null)).toBe(true);
    const thundercap = choices.find((c) => c.item.baseId === 'thundercap');
    expect(thundercap).toBeDefined();
    expect(compactReason((thundercap as (typeof choices)[number]).item, scene.creature)).toBe(
      'Needs Lv 16',
    );
  });

  it('says who wears an item, lists those after the free ones, and leaves the worn item out', () => {
    const taken = choices.filter((c) => c.wornBy === 'Pebble');
    expect(taken.length).toBeGreaterThan(0);
    expect(taken.every((c) => c.wornBySpecies !== null)).toBe(true);
    const firstTaken = choices.findIndex((c) => c.wornBy !== null && c.blocked === null);
    const free = choices.filter((c) => c.wornBy === null && c.blocked === null);
    expect(choices.slice(0, firstTaken)).toEqual(free);
    expect(choices.some((c) => c.item.equippedOn === PAGE_SAMPLE_ID)).toBe(false);
  });

  it('has a bag of thirteen to twenty-five items for each slot', () => {
    const items = allBagItems(PAGE_SAMPLE_ID, {});
    for (const slot of ['hat', 'scarf', 'charm'] as const) {
      const n = items.filter((i) => i.slot === slot).length;
      expect(n).toBeGreaterThanOrEqual(13);
      expect(n).toBeLessThanOrEqual(25);
    }
  });
});

describe('statRows', () => {
  const atk = (base: number, value: number): GearStat => ({
    stat: 'atk',
    base,
    value,
    text: `Attack ${String(value)}`,
  });

  it('shows the base number and the bonus its local lines add after it', () => {
    expect(statRows([atk(26, 41)])).toEqual([
      { stat: 'atk', label: 'Attack', base: '26', bonus: '+15' },
    ]);
  });

  it('shows a stat with no local bonus as its base alone', () => {
    expect(statRows([{ stat: 'hp', base: 32, value: 32, text: 'HP 32' }])).toEqual([
      { stat: 'hp', label: 'HP', base: '32', bonus: null },
    ]);
  });

  it('keeps the server text of a stat in points, with no split', () => {
    expect(
      statRows([{ stat: 'critChance', base: 440, value: 440, text: 'Crit chance 4.4 pt' }]),
    ).toEqual([{ stat: 'critChance', label: 'Crit chance', base: '4.4 pt', bonus: null }]);
  });

  it('has no rows for a Charm', () => {
    expect(statRows([])).toEqual([]);
  });
});
