import { afterEach, describe, expect, it } from 'vitest';
import type { Creature } from './api';
import { SAMPLE_STATE } from './creature-card-sample';
import { allBagItems } from './creature-page/bag-sample';
import { PAGE_SAMPLE_ID } from './creature-page/sample';
import type { GrantLoot } from './gear-types';
import { LootList } from './LootList';
import { InventoryGrid, type BagSelection } from './InventoryGrid';
import { ItemCard } from './ItemCard';
import { byClass, createPage, find, visibleText, type FakeElement, type Page } from './test-dom';
import { GearList } from './GearList';

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

/** A selection with nothing selected, for grids drawn only to be read. */
const NO_PICK: BagSelection = {
  active: false,
  ids: new Set(),
  has: () => false,
  toggle: () => undefined,
  add: () => undefined,
  range: () => undefined,
  clear: () => undefined,
};

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
        openId={null}
        onOpen={() => undefined}
        selection={NO_PICK}
      />,
    );
    const cells = find(
      page.root,
      (e) => e.localName === 'button' && e.getAttribute('role') !== 'checkbox',
    );
    expect(cells).toHaveLength(6);
    cells.forEach((cell, i) => {
      const labels = byClass(cell, 'item-lv');
      expect(labels).toHaveLength(1);
      expect(visibleText(first(labels))).toBe(`Lv ${String(bag[i]?.itemLevel)}`);
      // The label sits in the tile itself (one grid look everywhere: no inner frame), and the rarity pips are gone.
      expect(byClass(cell, 'item-frame')).toHaveLength(0);
      expect(byClass(cell, 'rarity-mark')).toHaveLength(0);
    });
  });

  it("marks an item a creature wears with that creature's picture, not a word", () => {
    const wearer = { ...SAMPLE_STATE.creatures[0], id: 'wearer-1' } as Creature;
    const items = bag
      .slice(0, 2)
      .map((item, i) => ({ ...item, equippedOn: i === 0 ? wearer.id : null }));
    page = createPage();
    page.draw(
      <InventoryGrid
        items={items}
        creatures={[wearer]}
        openId={null}
        onOpen={() => undefined}
        selection={NO_PICK}
      />,
    );
    const cells = find(
      page.root,
      (e) => e.localName === 'button' && e.getAttribute('role') !== 'checkbox',
    );
    const worn = cells.filter((c) => byClass(c, 'item-tile-wearer').length === 1);
    expect(worn).toHaveLength(1);
    expect(byClass(page.root, 'item-tile-flag')).toHaveLength(0);
    expect(worn[0]?.getAttribute('aria-label')).toContain('worn by');
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
    expect(rows.map((r) => visibleText(r))).toEqual([
      'Attack 28 +16',
      'HP 38',
      'Crit damage 20 pt',
    ]);
    expect(byClass(page.root, 'idc-divider')).toHaveLength(1);
    expect(first(byClass(page.root, 'idc-divider')).localName).toBe('hr');
    expect(byClass(page.root, 'tier-pips').length).toBeGreaterThan(0);
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
    const rows = byClass(page.root, 'find-row');
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
    expect(visibleText(first(byClass(rows[0] as FakeElement, 'find-row-name')))).toBe(
      "Emberkeeper's Crown, item level 15",
    );
    expect(
      byClass(first(byClass(rows[0] as FakeElement, 'find-row-name')), 'visually-hidden'),
    ).toHaveLength(1);
  });

  it('lists what a creature wears the same way, with its lines and no slot badge', () => {
    page = createPage();
    page.draw(
      <GearList
        level={20}
        emptySlots={false}
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
    const rows = byClass(page.root, 'find-row');
    // In slot order: the hat first.
    expect(visibleText(first(byClass(rows[0] as FakeElement, 'item-lv')))).toBe('Lv 15');
    expect(byClass(rows[0] as FakeElement, 'slot-tag')).toHaveLength(0);
    // Only what is worn (no Scarf row), each item with its lines once they are known.
    expect(rows).toHaveLength(2);
    expect(visibleText(first(byClass(rows[1] as FakeElement, 'gear-list-lines')))).toBe(
      'Attack +4%',
    );
    expect(byClass(rows[0] as FakeElement, 'gear-list-lines')).toHaveLength(0);
  });
});
