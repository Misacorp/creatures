import { afterEach, describe, expect, it } from 'vitest';
import { pageScene } from './sample';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
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
});
