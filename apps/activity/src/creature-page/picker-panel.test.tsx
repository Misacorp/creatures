import { afterEach, describe, expect, it } from 'vitest';
import { pageScene } from './sample';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { ItemPickerDrawer } from './ItemPicker';

/**
 * The item picker's drawer (2026-10-18): no Prev / Next row, the pixel font set once on the detail panel (so the
 * "Needs Lv 12" reason is in it too), and the count of items in the bag always in the heading.
 */

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function draw(picked: string): Page {
  page = createPage();
  const { creature, state, gear } = pageScene('level 15');
  page.draw(
    <ItemPickerDrawer
      open
      onClose={() => undefined}
      slot="hat"
      creature={creature}
      creatures={state.creatures}
      items={gear.items}
      onEquip={() => undefined}
      onTakeOff={() => undefined}
      initialPicked={picked}
      initialCompare={false}
    />,
  );
  return page;
}

describe('the item picker drawer', () => {
  it('has no Prev / Next row and no swipe area, only the grid and the count', () => {
    const p = draw('bag-hat-02');
    expect(byClass(p.root, 'flip-nav')).toHaveLength(0);
    expect(byName(p.root, 'button', /Prev|Next/)).toHaveLength(0);
    expect(byClass(p.root, 'flip-area')).toHaveLength(0);
    expect(visibleText(first(byClass(p.root, 'drawer-head')))).toMatch(/\d+ in the bag/);
  });

  it('sets the pixel font once on the detail panel, which holds the card and the action row', () => {
    const p = draw('bag-hat-02');
    const detail = first(byClass(p.root, 'ip-detail'));
    expect(detail.getAttribute('class')).toContain('pix-panel');
    expect(byClass(detail, 'idc')).toHaveLength(1);
    expect(byClass(detail, 'ip-actions')).toHaveLength(1);
  });

  it('shows the reason an item cannot be worn inside that panel, in the same place as Equip', () => {
    // The Thundercap is item level 16: the level 15 sample cannot wear it.
    const p = draw('bag-hat-16');
    const detail = first(byClass(p.root, 'ip-detail'));
    const reason = first(byClass(detail, 'ip-reason'));
    expect(visibleText(reason)).toBe('Needs Lv 16');
    expect(byName(detail, 'button', 'Equip')).toHaveLength(0);
    expect(first(byClass(detail, 'ip-actions')).childNodes).toContain(reason);
  });

  it('keeps its scroll box padded so the item frame border at the edge is not clipped', () => {
    const p = draw('bag-hat-02');
    expect(byClass(first(byClass(p.root, 'ip-detail')), 'ip-detail-scroll')).toHaveLength(1);
  });

  it("has a close button for the details at the card's top right, named for screen readers", () => {
    const p = draw('bag-hat-02');
    const aside = first(byClass(first(byClass(p.root, 'ip-detail')), 'idc-aside'));
    const close = first(byName(aside, 'button', 'Close details'));
    expect(close.getAttribute('class')).toBe('ip-close');
    // It is the pixel X of the drawer's own glyph.
    expect(byClass(close, 'drawer-x')).toHaveLength(1);
    // The drawer itself still shows no X (its close button is for the keyboard).
    expect(byName(p.root, 'button', 'Close')).toHaveLength(1);
  });

  it('closes only the details: the tile stays marked, the drawer stays, and the focus goes to the tile', () => {
    const p = draw('bag-hat-02');
    const tile = first(
      byClass(p.root, 'item-tile').filter((t) => t.getAttribute('aria-pressed') === 'true'),
    );
    p.click(first(byName(p.root, 'button', 'Close details')));
    expect(byClass(p.root, 'ip-detail')).toHaveLength(0);
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    expect(tile.getAttribute('aria-pressed')).toBe('false');
    expect(tile.getAttribute('class')).toContain('selected');
    expect(tile.focused).toBeGreaterThan(0);
    // A tap on any tile opens the details again.
    p.click(tile);
    expect(byClass(p.root, 'ip-detail')).toHaveLength(1);
  });
});
