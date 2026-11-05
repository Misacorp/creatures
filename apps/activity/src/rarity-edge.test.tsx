import { afterEach, describe, expect, it } from 'vitest';
import { CreatureCard } from './CreatureCard';
import type { CardActions } from './CreaturePage';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleCreature } from './creature-card-sample';
import { allBagItems } from './creature-page/bag-sample';
import { PAGE_SAMPLE_ID } from './creature-page/sample';
import { ItemFrame, ItemSprite, ItemThumb } from './GearArt';
import frameCss from './styles/components/item-frame.css?raw';
import type { GearRarity } from './gear-types';
import { InventoryGrid } from './InventoryGrid';
import { byClass, createPage, type FakeElement, type Page } from './test-dom';
import { FindItem } from './ui/FindItem';
import { FindBlueprint } from './ui/FindBlueprint';
import type { MultiSelect } from './ui/multi-select';

/**
 * Rarity is never shown by colour alone (accessibility review, 2026-11-05): the border of every real item's picture
 * has its rarity's shape as well as its colour (`rarity-edge`: plain for Common, bevelled corners for Rare, bevelled
 * corners and a point in the middle of each side for Epic), and every item's spoken label says its rarity.
 */

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const RARITIES: readonly GearRarity[] = ['common', 'rare', 'epic'];
const RARITY_WORD: Readonly<Record<GearRarity, string>> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
};

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx', '!./workbench/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const NO_PICK: MultiSelect = {
  active: false,
  ids: new Set(),
  has: () => false,
  toggle: () => undefined,
  add: () => undefined,
  range: () => undefined,
  clear: () => undefined,
};

const classesOf = (el: FakeElement | undefined): string[] =>
  (el?.getAttribute('class') ?? '').split(/\s+/);

/** The rarity whose shaped border an element draws, or null when its border is not shaped. */
function edgeOf(el: FakeElement | undefined): string | null {
  const classes = classesOf(el);
  if (!classes.includes('rarity-edge')) return null;
  return RARITIES.find((r) => classes.includes(`rarity-${r}`)) ?? null;
}

/** The body of the last rule for a selector in item-frame.css (the one that draws its pieces). */
function ruleFor(selector: string): string {
  const at = frameCss.lastIndexOf(`${selector} {`);
  if (at < 0) return '';
  return frameCss.slice(at, frameCss.indexOf('}', at));
}

describe('the rarity edge', () => {
  it('gives Rare and Epic borders shapes of their own, and leaves Common the plain line', () => {
    const rare = ruleFor('.rarity-edge.rarity-rare::after');
    const epic = ruleFor('.rarity-edge.rarity-epic::after');
    expect(rare).toContain('background-image');
    expect(epic).toContain('background-image');
    expect(rare).not.toEqual(epic);
    // Epic is Rare's corners plus a point on each side: more pieces, never the same picture.
    const pieces = (rule: string): number => (rule.match(/var\(--c\)/g) ?? []).length;
    expect(pieces(epic)).toBeGreaterThan(pieces(rare));
    expect(frameCss).not.toContain('.rarity-edge.rarity-common::after');
  });

  it('is on every item frame, in its rarity', () => {
    for (const rarity of RARITIES) {
      page = createPage();
      page.draw(
        <ItemFrame rarity={rarity} baseId="kelp-cap" level={4}>
          <ItemSprite baseId="kelp-cap" />
        </ItemFrame>,
      );
      const [frame] = byClass(page.root, 'item-frame');
      expect(edgeOf(frame)).toBe(rarity);
      page.unmount();
      page = null;
    }
  });

  it('is on a piece stored before items had levels', () => {
    page = createPage();
    page.draw(<ItemThumb item={{ baseId: 'kelp-cap', rarity: 'epic' }} scale={4} />);
    expect(edgeOf(byClass(page.root, 'item-frame')[0])).toBe('epic');
  });

  it('is not on a picture that is not an item (a blueprint)', () => {
    page = createPage();
    page.draw(
      <ul>
        <FindBlueprint baseId="kelp-cap" />
      </ul>,
    );
    const frames = byClass(page.root, 'item-frame');
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.map(edgeOf)).toEqual(frames.map(() => null));
  });

  it('is on every tile of the bag, in its rarity, and the tile says the rarity', () => {
    const bag = allBagItems(PAGE_SAMPLE_ID, {}).slice(0, 8);
    expect(new Set(bag.map((i) => i.rarity)).size).toBeGreaterThan(1);
    page = createPage();
    page.draw(
      <InventoryGrid
        items={bag}
        creatures={[]}
        openId={null}
        onOpen={() => undefined}
        selection={NO_PICK}
      />,
    );
    const tiles = byClass(page.root, 'item-tile');
    expect(tiles).toHaveLength(bag.length);
    for (const tile of tiles) {
      const rarity = edgeOf(tile) as GearRarity | null;
      expect(rarity).not.toBeNull();
      expect(tile.getAttribute('aria-label')).toContain(RARITY_WORD[rarity ?? 'common']);
    }
  });

  it('is put on only by the shared item frame and grid tile, never by hand on a screen', () => {
    const drawers = Object.entries(sources)
      .filter(([, source]) => source.includes('rarity-edge'))
      .map(([file]) => file)
      .sort();
    expect(drawers).toEqual(['./GearArt.tsx', './ItemTile.tsx']);
  });
});

describe('the spoken name of an item says its rarity', () => {
  it('on a found item that opens its card', () => {
    for (const rarity of RARITIES) {
      page = createPage();
      page.draw(
        <ul>
          <FindItem baseId="kelp-cap" rarity={rarity} level={4} />
        </ul>,
      );
      // A plain find (no id) says the rarity in its badge's words, next to the name.
      expect(byClass(page.root, 'rarity-tag').map((t) => t.textContent)).toEqual([
        RARITY_WORD[rarity],
      ]);
      page.unmount();
      page = null;
    }
  });

  it('on a creature card’s worn gear', () => {
    const creature = sampleCreature('growing');
    expect(creature.gear.length).toBeGreaterThan(0);
    page = createPage();
    const actions = new Proxy({}, { get: () => () => undefined }) as CardActions;
    page.draw(
      <ul>
        <CreatureCard
          creature={creature}
          state={{ ...SAMPLE_STATE, creatures: [creature], pending: [] }}
          gear={SAMPLE_GEAR}
          busy={false}
          found={false}
          actions={actions}
          onAnswerCatch={() => undefined}
          onOpen={() => undefined}
        />
      </ul>,
    );
    const slots = byClass(page.root, 'cc-slot').filter((s) => byClass(s, 'item-frame').length > 0);
    expect(slots).toHaveLength(creature.gear.length);
    for (const slot of slots) {
      const rarity = edgeOf(byClass(slot, 'item-frame')[0]) as GearRarity | null;
      expect(rarity).not.toBeNull();
      expect(slot.getAttribute('aria-label')).toContain(`, ${RARITY_WORD[rarity ?? 'common']}`);
    }
  });

  it('on a picture that stands alone (items to take apart)', () => {
    page = createPage();
    page.draw(
      <ItemThumb item={{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 7 }} scale={4} spoken />,
    );
    const [frame] = byClass(page.root, 'item-frame');
    expect(frame?.getAttribute('role')).toBe('img');
    expect(frame?.getAttribute('aria-label')).toBe('Kelp Cap, item level 7, Rare');
  });
});
