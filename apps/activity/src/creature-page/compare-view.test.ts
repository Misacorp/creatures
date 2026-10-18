import {
  activeTalents,
  applyGear,
  effectiveStats,
  itemStat,
  type GearItem as RulesItem,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { Creature } from '../api';
import { getSpecies } from '../game';
import type { GearItem } from '../gear-types';
import { allBagItems, wornFromBag, type WornRows } from './bag-sample';
import { compareItem, rulesItemOf, setChangeLine, statChangeLine } from './compare-view';
import { PAGE_SAMPLE_ID, pageScene, type SceneKind } from './sample';

/**
 * The compare block's words and wiring: the numbers are the game's own fold (`compareGear`), so these tests
 * check that the client feeds it what the server would (stats, worn items with their lines, talents) and words
 * the result with real signs. The rules themselves are tested in `packages/game/test/gear-compare.test.ts`.
 */

const MINUS = '−';

function scene(kind: SceneKind, worn?: WornRows) {
  const base = pageScene(kind);
  if (worn === undefined) return base;
  const items = allBagItems(PAGE_SAMPLE_ID, worn);
  const creature: Creature = { ...base.creature, gear: wornFromBag(items, PAGE_SAMPLE_ID) };
  return { ...base, creature, gear: { ...base.gear, items } };
}

function bagItem(items: readonly GearItem[], baseId: string, itemLevel?: number): GearItem {
  const item = items.find(
    (i) => i.baseId === baseId && (itemLevel === undefined || i.itemLevel === itemLevel),
  );
  if (item === undefined) throw new Error(`no ${baseId} in the bag`);
  return item;
}

const texts = (lines: readonly { text: string }[]): string[] => lines.map((l) => l.text);

describe('rulesItemOf', () => {
  it('gives the rules an item whose own stats are the ones the server listed, local lines included', () => {
    const { gear } = scene('level 15');
    for (const item of gear.items) {
      const rules = rulesItemOf(item);
      expect(rules, item.baseId).not.toBeNull();
      for (const stat of item.stats) {
        expect(itemStat(rules as RulesItem, stat.stat)?.value, `${item.baseId} ${stat.stat}`).toBe(
          stat.value,
        );
      }
    }
  });

  it('is null for a base the content does not have', () => {
    const { gear } = scene('level 15');
    const item = gear.items[0] as GearItem;
    expect(rulesItemOf({ ...item, baseId: 'no-such-base' })).toBeNull();
  });
});

describe('statChangeLine and setChangeLine', () => {
  it('writes the sign into the words, with a real minus, and says plus and minus aloud', () => {
    expect(statChangeLine({ stat: 'atk', delta: 12 })).toEqual({
      key: 'atk',
      text: 'Attack +12',
      spoken: 'Attack plus 12',
      kind: 'up',
    });
    expect(statChangeLine({ stat: 'hp', delta: -30 })).toEqual({
      key: 'hp',
      text: `HP ${MINUS}30`,
      spoken: 'HP minus 30',
      kind: 'down',
    });
    expect(statChangeLine({ stat: 'spd', delta: 2 }).text).toBe('Speed +2');
  });

  it('writes crit in points', () => {
    expect(statChangeLine({ stat: 'critChance', delta: 220 }).text).toBe('Crit chance +2.2 pt');
    expect(statChangeLine({ stat: 'critDamage', delta: -2000 }).text).toBe(
      `Crit damage ${MINUS}20 pt`,
    );
  });

  it('words a set that gains, completes or loses a bonus', () => {
    expect(setChangeLine('forge-warm-kit', 'Forge-Warm Kit', 2, 3)).toMatchObject({
      text: 'Forge-Warm Kit 3 / 3: both bonuses',
      kind: 'up',
    });
    expect(setChangeLine('hollow-weave', 'Hollow Weave', 1, 2)).toMatchObject({
      text: 'Hollow Weave 2 / 3: 2 piece bonus',
      kind: 'up',
    });
    expect(setChangeLine('hollow-weave', 'Hollow Weave', 2, 1)).toMatchObject({
      text: 'Loses Hollow Weave 2 / 3',
      spoken: 'Loses Hollow Weave 2 / 3',
      kind: 'down',
    });
  });
});

describe('compareItem', () => {
  it('shows only gains for a better item, with the numbers of the shared fold', () => {
    const { creature, gear } = scene('level 15', { hat: 13, scarf: 0 });
    const crown = bagItem(gear.items, 'emberkeepers-crown');
    const result = compareItem(creature, crown, gear.items);
    expect(result).not.toBeNull();
    const lines = [...(result?.stats ?? [])];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.kind === 'up' && l.text.includes('+'))).toBe(true);
    // The same numbers as folding both sets of worn items here, with the creature's own talents.
    const species = getSpecies(creature.species);
    if (species === undefined) throw new Error('species');
    const stats = effectiveStats(species, creature.level, creature.fusionCount);
    const wearer = { role: species.role, element: species.element };
    const talents = activeTalents(
      species.line,
      species.rarity,
      creature.level,
      creature.talents.book.map((t) => ({ talentId: t.id, golden: t.golden, slot: t.slot })),
    );
    const rules = (id: string) => rulesItemOf(bagItem(gear.items, id)) as RulesItem;
    const kelp = rules('kelp-cap');
    const wool = rulesItemOf(
      gear.items.find(
        (i) => i.id === creature.gear.find((g) => g.slot === 'scarf')?.id,
      ) as GearItem,
    ) as RulesItem;
    const before = applyGear(stats, species.crit, wearer, [kelp, wool], talents).stats;
    const after = applyGear(
      stats,
      species.crit,
      wearer,
      [rules('emberkeepers-crown'), wool],
      talents,
    ).stats;
    expect(texts(lines)).toContain(`HP +${String(after.hp - before.hp)}`);
    expect(texts(lines)).toContain(`Attack +${String(after.atk - before.atk)}`);
  });

  it('shows minus signs for a worse item', () => {
    const { creature, gear } = scene('level 15');
    const kelp = bagItem(gear.items, 'kelp-cap');
    const result = compareItem(creature, kelp, gear.items);
    const stats = result?.stats ?? [];
    expect(stats.length).toBeGreaterThan(1);
    expect(stats.every((l) => l.kind === 'down' && l.text.includes(MINUS))).toBe(true);
    expect(stats.every((l) => l.spoken.includes('minus'))).toBe(true);
    expect(texts(stats)[0]).toMatch(new RegExp(`^HP ${MINUS}\\d+$`));
  });

  it('shows only the stats that change, in the order HP, Attack, Speed, crit', () => {
    const { creature, gear } = scene('level 15');
    const result = compareItem(creature, bagItem(gear.items, 'kelp-cap'), gear.items);
    const order = ['hp', 'atk', 'spd', 'critChance', 'critDamage'];
    const keys = (result?.stats ?? []).map((l) => l.key);
    expect(keys).toEqual([...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has only gains when the slot is empty', () => {
    const { creature, gear } = scene('level 8');
    expect(creature.gear).toEqual([]);
    const result = compareItem(creature, bagItem(gear.items, 'felt-hat'), gear.items);
    expect(result?.stats.length).toBeGreaterThan(0);
    expect(result?.stats.every((l) => l.kind === 'up')).toBe(true);
    expect(result?.sets).toEqual([]);
  });

  it('says a swap completes a set', () => {
    const { creature, gear } = scene('set: two pieces');
    const token = bagItem(gear.items, 'forge-warm-token');
    expect(texts(compareItem(creature, token, gear.items)?.sets ?? [])).toEqual([
      'Forge-Warm Kit 3 / 3: both bonuses',
    ]);
  });

  it('says a swap breaks a set, and what a swap that only weakens it loses', () => {
    const two = scene('set: two pieces');
    const hat = bagItem(two.gear.items, 'felt-hat');
    const broken = compareItem(two.creature, hat, two.gear.items);
    expect(texts(broken?.sets ?? [])).toEqual(['Loses Forge-Warm Kit 2 / 3']);
    expect(broken?.sets[0]?.kind).toBe('down');
    const three = scene('set: three pieces');
    const charm = bagItem(three.gear.items, 'trail-charm');
    expect(texts(compareItem(three.creature, charm, three.gear.items)?.sets ?? [])).toEqual([
      'Loses Forge-Warm Kit 3 / 3',
    ]);
  });

  it('has no set line when no set bonus changes', () => {
    const { creature, gear } = scene('level 15');
    const result = compareItem(creature, bagItem(gear.items, 'coal-warm-cap'), gear.items);
    expect(result?.sets).toEqual([]);
  });

  it('says nothing for an item the creature cannot wear, or that it already wears', () => {
    const { creature, gear } = scene('level 15');
    const thundercap = bagItem(gear.items, 'thundercap');
    expect(compareItem(creature, thundercap, gear.items)).toBeNull();
    const worn = gear.items.find((i) => i.id === creature.gear[0]?.id) as GearItem;
    expect(compareItem(creature, worn, gear.items)).toBeNull();
    // A slot that is still locked.
    const young = scene('level 2');
    expect(
      compareItem(young.creature, bagItem(young.gear.items, 'trail-charm'), young.gear.items),
    ).toBeNull();
  });

  it('says nothing when a worn item is missing from the bag (the numbers cannot be worked out)', () => {
    const { creature, gear } = scene('level 15');
    const kelp = bagItem(gear.items, 'kelp-cap');
    const wornIds = new Set(creature.gear.map((g) => g.id));
    const bag = gear.items.filter((i) => !wornIds.has(i.id));
    expect(compareItem(creature, kelp, bag)).toBeNull();
  });
});
