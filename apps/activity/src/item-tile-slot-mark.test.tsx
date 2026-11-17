import { afterEach, describe, expect, it } from 'vitest';
import { ItemTile } from './ItemTile';
import tileCss from './styles/components/item-tile.css?raw';
import { byClass, createPage, visibleText, type Page } from './test-dom';

/** The slot icon sits beside the level on one dark strip along the tile's bottom (Misa, 2026-11-16). */
let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

describe('item tile bottom strip', () => {
  it('draws the slot icon and the level on the tile', () => {
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

  it('puts both in the bottom strip, for every tile', () => {
    expect(tileCss).toContain('button.item-tile::before');
    expect(tileCss).toMatch(
      /button\.item-tile canvas\.sprite\.item-slot \{\s*top: auto;\s*bottom:/,
    );
    expect(tileCss).toMatch(/button\.item-tile \.item-lv \{\s*right: [^;]+;\s*bottom:/);
    expect(tileCss).not.toContain('slot-a');
    expect(tileCss).not.toContain('slot-c');
  });
});
