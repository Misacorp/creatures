import { afterEach, describe, expect, it } from 'vitest';
import { allBagItems } from './creature-page/bag-sample';
import { PAGE_SAMPLE_ID } from './creature-page/sample';
import type { GrantLoot } from './gear-types';
import { LootList } from './GearLoot';
import { InventoryGrid } from './InventoryGrid';
import { ItemCard } from './ItemCard';
import { byClass, createPage, find, visibleText, type FakeElement, type Page } from './test-dom';
import { WornItemLines } from './WornItemLine';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx', '!./workbench/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const bag = allBagItems(PAGE_SAMPLE_ID, {});
const hat = bag.find((i) => i.baseId === 'emberkeepers-crown');
const charm = bag.find((i) => i.slot === 'charm' && i.stats.length === 0);

describe('one item-level indicator everywhere', () => {
  it('has no rarity pips and no second item-level label anywhere in the game', () => {
    const found = Object.entries(sources)
      .filter(([, source]) =>
        /rarity-mark|RARITY_MARK|ip-cell-level|class="item-level/.test(source),
      )
      .map(([file]) => file);
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(found).toEqual([]);
  });

  it('puts "Lv N" in the corner of every bag image and nowhere else in the cell', () => {
    page = createPage();
    page.draw(
      <InventoryGrid
        items={bag.slice(0, 6)}
        creatures={[]}
        selectedId={null}
        onSelect={() => undefined}
      />,
    );
    const cells = find(page.root, (e) => e.localName === 'button');
    expect(cells).toHaveLength(6);
    cells.forEach((cell, i) => {
      const labels = byClass(cell, 'item-lv');
      expect(labels).toHaveLength(1);
      expect(visibleText(first(labels))).toBe(`Lv ${String(bag[i]?.itemLevel)}`);
      // The label is inside the item's frame (its bottom-right corner), and the rarity pips are gone.
      expect(byClass(first(byClass(cell, 'item-frame')), 'item-lv')).toHaveLength(1);
      expect(byClass(cell, 'rarity-mark')).toHaveLength(0);
    });
  });
});

describe('the item card', () => {
  it('has the image first, then name, rarity badge and stat rows, then a divider and the modifiers', () => {
    if (hat === undefined) throw new Error('the sample bag has no crown');
    page = createPage();
    page.draw(<ItemCard item={hat} />);
    const head = first(byClass(page.root, 'idc-head'));
    expect(first(head.childNodes as FakeElement[]).getAttribute('class')).toContain('item-frame');
    expect(visibleText(first(byClass(head, 'item-lv')))).toBe('Lv 15');
    expect(visibleText(first(byClass(head, 'rarity-tag')))).toBe('Epic');
    const rows = find(first(byClass(head, 'idc-stats')), (e) => e.localName === 'li');
    expect(rows.map((r) => visibleText(r))).toEqual(['Attack 41 +22', 'HP 32']);
    expect(byClass(page.root, 'idc-divider')).toHaveLength(1);
    expect(first(byClass(page.root, 'idc-divider')).localName).toBe('hr');
    expect(byClass(page.root, 'pips').length).toBeGreaterThan(0);
  });

  it('shows a Charm as name, badge, divider and modifiers, with no stat rows', () => {
    if (charm === undefined) throw new Error('the sample bag has no stat-less charm');
    page = createPage();
    page.draw(<ItemCard item={charm} />);
    expect(byClass(page.root, 'idc-stats')).toHaveLength(0);
    expect(byClass(page.root, 'rarity-tag')).toHaveLength(1);
    expect(byClass(page.root, 'idc-divider')).toHaveLength(1);
    expect(byClass(page.root, 'line-list')).toHaveLength(1);
  });
});

describe('compact item rows', () => {
  const loot: GrantLoot = {
    gear: [
      { id: 'a', baseId: 'emberkeepers-crown', rarity: 'epic', itemLevel: 15 },
      { id: 'b', baseId: 'forge-scarf', rarity: 'rare', itemLevel: 14 },
      { id: 'c', baseId: 'trail-charm', rarity: 'common', itemLevel: 8 },
      // A grant stored before items had levels has no label (nothing to show).
      { id: 'd', baseId: 'kelp-cap', rarity: 'common' },
    ],
    converted: [],
    parts: {},
    blueprints: [],
  };

  it('lists loot as image, name and rarity badge, with the level only in the image corner', () => {
    page = createPage();
    page.draw(<LootList loot={loot} label="Loot" />);
    const rows = byClass(page.root, 'item-row');
    expect(rows).toHaveLength(4);
    expect(rows.slice(0, 3).map((r) => visibleText(first(byClass(r, 'item-lv'))))).toEqual([
      'Lv 15',
      'Lv 14',
      'Lv 8',
    ]);
    expect(byClass(rows[3] as FakeElement, 'item-lv')).toHaveLength(0);
    expect(rows.map((r) => visibleText(first(byClass(r, 'rarity-tag'))))).toEqual([
      'Epic',
      'Rare',
      'Common',
      'Common',
    ]);
    // The first child is the image; no stats, no stat rows, no level text beside it.
    expect(
      first((rows[0] as FakeElement).childNodes as FakeElement[]).getAttribute('class'),
    ).toContain('item-frame');
    expect(byClass(page.root, 'idc-stats')).toHaveLength(0);
    expect(byClass(page.root, 'item-stats')).toHaveLength(0);
    expect(visibleText(first(byClass(rows[0] as FakeElement, 'item-row-name')))).toBe(
      "Emberkeeper's Crown, item level 15",
    );
    expect(
      byClass(first(byClass(rows[0] as FakeElement, 'item-row-name')), 'visually-hidden'),
    ).toHaveLength(1);
  });

  it('lists what a creature wears the same way, with the slot and no lines of text', () => {
    page = createPage();
    page.draw(
      <WornItemLines
        worn={[
          {
            baseId: 'trail-charm',
            slot: 'charm',
            rarity: 'common',
            itemLevel: 8,
            lines: ['Attack +4%'],
          },
          { baseId: 'emberkeepers-crown', slot: 'hat', rarity: 'epic', itemLevel: 15 },
        ]}
      />,
    );
    const rows = byClass(page.root, 'item-row');
    // In slot order: the hat first.
    expect(visibleText(first(byClass(rows[0] as FakeElement, 'item-lv')))).toBe('Lv 15');
    expect(visibleText(first(byClass(rows[0] as FakeElement, 'item-row-slot')))).toBe('Hat');
    expect(visibleText(page.root)).not.toContain('Attack +4%');
  });
});
