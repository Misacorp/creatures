import { afterEach, describe, expect, it } from 'vitest';
import { allBagItems } from './creature-page/bag-sample';
import { PAGE_SAMPLE_ID } from './creature-page/sample';
import { GEAR_STATE, SAMPLE_GEAR } from './creature-card-sample';
import type { GearActions } from './gear-actions';
import { InventoryGrid, type BagSelection } from './InventoryGrid';
import { ItemCard } from './ItemCard';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';
import { Workshop } from './Workshop';

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

const actions: GearActions = {
  equip: () => Promise.resolve(undefined),
  equipBest: () => Promise.resolve(undefined),
  checkDismantle: () => Promise.resolve({ locked: [] }),
  dismantlePile: () => Promise.resolve(undefined),
  dismissNotice: () => Promise.resolve(undefined),
  startJob: () => Promise.resolve(undefined),
  previewCraft: () => new Promise(() => undefined),
  previewDismantle: () => new Promise(() => undefined),
  claimJob: () => Promise.resolve(undefined),
};

function drawWorkshop(): Page {
  const p = createPage();
  p.draw(
    <Workshop
      state={GEAR_STATE}
      gear={SAMPLE_GEAR}
      failed={false}
      offset={0}
      busy={false}
      reveal={null}
      actions={actions}
      onRetry={() => undefined}
      onClaimed={() => undefined}
      onDismissReveal={() => undefined}
    />,
  );
  return p;
}

function bagCells(p: Page): FakeElement[] {
  return find(first(byClass(p.root, 'item-grid')), (e) => e.localName === 'button');
}

describe('the Workshop bag', () => {
  it('shows the bag count on the Gear heading line and no Equip best, no Dismantle several and no Dismantle items button above the grid', () => {
    page = drawWorkshop();
    const head = first(byClass(page.root, 'ws-head'));
    expect(visibleText(head)).toContain('Gear');
    expect(visibleText(head)).toContain('Bag:');
    expect(page.root.textContent).not.toContain('Equip best');
    expect(page.root.textContent).not.toContain('Dismantle several');
    expect(byName(page.root, 'button', 'Dismantle items')).toHaveLength(0);
    expect(byName(page.root, 'button', 'Done')).toHaveLength(0);
  });

  it('opens a tapped item in a bottom drawer that closes by the backdrop', () => {
    page = drawWorkshop();
    expect(byRole(page.root, 'dialog')).toHaveLength(0);
    const p = page;
    p.click(first(bagCells(p)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(byClass(dialog, 'item-detail')).toHaveLength(1);
    expect(byName(dialog, 'button', 'Dismantle')).toHaveLength(1);
    p.click(first(byClass(p.root, 'drawer-backdrop')));
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });

  it('closes the drawer by its close button too, and opens another item afterwards', () => {
    page = drawWorkshop();
    const p = page;
    const [a, b] = bagCells(p);
    if (a === undefined || b === undefined) throw new Error('the sample bag needs two items');
    p.click(a);
    p.click(first(byName(p.root, 'button', 'Close')));
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    p.click(b);
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
  });
});

/** A selection with nothing selected, for a grid drawn only to be read. */
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
const crown = bag.find((i) => i.baseId === 'emberkeepers-crown');

describe('slot and element on items', () => {
  it('puts the slot icon in the top-left corner of every bag image', () => {
    page = createPage();
    page.draw(
      <InventoryGrid
        items={bag.slice(0, 5)}
        creatures={[]}
        openId={null}
        onOpen={() => undefined}
        selection={NO_PICK}
      />,
    );
    for (const cell of find(page.root, (e) => e.localName === 'button')) {
      expect(byClass(cell, 'item-slot')).toHaveLength(1);
    }
  });

  it('colours the name by rarity and shows slot, rarity and element as one kind of badge', () => {
    if (crown === undefined) throw new Error('the sample bag has no crown');
    page = createPage();
    page.draw(<ItemCard item={crown} />);
    const name = first(byClass(page.root, 'idc-name'));
    expect(name.getAttribute('class')).toContain('rarity-name');
    expect(name.getAttribute('class')).toContain('rarity-epic');
    const badges = byClass(first(byClass(page.root, 'idc-badge')), 'item-badge');
    expect(badges.map((b) => visibleText(b))).toEqual(['Hat', 'Epic', 'Ember']);
  });
});
