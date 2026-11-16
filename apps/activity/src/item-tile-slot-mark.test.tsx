import { afterEach, describe, expect, it } from 'vitest';
import { ItemTile, SLOT_MARK_PLACEMENT, slotMarkClass, type SlotMarkPlacement } from './ItemTile';
import tileCss from './styles/components/item-tile.css?raw';
import { byClass, createPage, visibleText, type Page } from './test-dom';

/** The slot mark's placement options (2026-11-16): the shipped look is the default until Misa picks. */
let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const VARIANTS: readonly SlotMarkPlacement[] = ['current', 'a', 'b', 'c'];

describe('slot mark placement', () => {
  it('defaults to the shipped look', () => {
    expect(SLOT_MARK_PLACEMENT).toBe('current');
    expect(slotMarkClass('current')).toBeNull();
  });

  it('draws the slot mark and the level on a tile', () => {
    page = createPage();
    page.draw(
      <ul>
        <ItemTile
          item={{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 16 }}
          label="Kelp Cap"
          selected={false}
          onSelect={() => undefined}
        />
      </ul>,
    );
    expect(byClass(page.root, 'item-slot')).toHaveLength(1);
    expect(byClass(page.root, 'item-lv')).toHaveLength(1);
    expect(visibleText(page.root)).toContain('Lv 16');
  });

  it('gives every other variant its own class and styles for the slot mark', () => {
    for (const variant of VARIANTS) {
      const cls = slotMarkClass(variant);
      if (cls === null) continue;
      expect(cls).toBe(`slot-${variant}`);
      expect(tileCss).toContain(`button.item-tile.${cls} canvas.sprite.item-slot`);
    }
  });
});
