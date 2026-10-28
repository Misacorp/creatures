import { gearContent } from '@creatures/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleCreature } from '../creature-card-sample';
import { EquipHost } from '../equip-from-card';
import { GearItemsContext } from '../gear-items-context';
import { PopoverHost } from '../PopoverHost';
import {
  byClass,
  byRole,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { sampleGearItem } from '../workbench/gear-sample';
import { FindItem, FindItems } from './FindItem';
import { FindList } from './FindRow';

/**
 * A found item opens its full item card in a popover (decisions.md, 2026-10-21): on a tap or Enter, and on
 * hover with a mouse. Without an inventory id (or before the gear view loaded) the row stays plain.
 */

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const base = gearContent.bases.find((b) => b.tag === 'ember' && b.set === undefined);
if (base === undefined) throw new Error('the content lacks an Ember base');
const piece = { id: 'item-1', baseId: base.id, rarity: 'rare', itemLevel: 6 } as const;

const creatures = [
  { ...sampleCreature('growing'), id: 'c-low', nickname: 'Lowly', level: 7 },
  { ...sampleCreature('growing'), id: 'c-high', nickname: 'Highly', level: 9 },
];

function draw(
  vnode: preact.ComponentChild,
  loaded = true,
  equip: {
    creatures: typeof creatures;
    onEquip: (id: string, to: string | null) => void;
  } | null = null,
): Page {
  if (!('window' in globalThis)) stubHover(false);
  page = createPage();
  page.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <GearItemsContext.Provider value={loaded ? [sampleGearItem(piece)] : []}>
        {equip === null ? (
          vnode
        ) : (
          <EquipHost creatures={equip.creatures} onEquip={equip.onEquip}>
            {vnode}
          </EquipHost>
        )}
      </GearItemsContext.Provider>
    </PopoverHost>,
  );
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const rowButton = (p: Page): FakeElement => first(byClass(p.root, 'find-row-button'));
const dialogs = (p: Page): FakeElement[] => byRole(p.root, 'dialog');

/** A browser with a mouse (`hover`) or without. */
function stubHover(hover: boolean): void {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({ matches: hover && query.includes('hover: hover') }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
}

const item = (
  <FindList label="Found">
    <FindItem id={piece.id} baseId={piece.baseId} rarity={piece.rarity} level={piece.itemLevel} />
  </FindList>
);

describe('an inspectable found item', () => {
  it('is one button named for the item, with plain badges inside', () => {
    const p = draw(item);
    const button = rowButton(p);
    expect(button.getAttribute('aria-label')).toContain(base.name);
    expect(button.getAttribute('aria-label')).toContain('Details');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // Only the row's own button: the badges inside are plain.
    expect(find(button, (e) => e.localName === 'button')).toHaveLength(1);
  });

  it('opens the full item card on a tap, and closes on a second tap', () => {
    const p = draw(item);
    p.click(rowButton(p));
    expect(dialogs(p)).toHaveLength(1);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
    expect(rowButton(p).getAttribute('aria-expanded')).toBe('true');
    p.click(rowButton(p));
    expect(dialogs(p)).toHaveLength(0);
  });

  it('opens on hover with a fine pointer and closes when the mouse leaves', () => {
    vi.useFakeTimers();
    stubHover(true);
    const p = draw(item);
    p.pointer(rowButton(p), 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(byClass(p.root, 'idc')).toHaveLength(1);
    p.pointer(rowButton(p), 'pointerleave', { x: 0, y: 0, kind: 'mouse' });
    p.update(() => vi.advanceTimersByTime(300));
    expect(dialogs(p)).toHaveLength(0);
  });

  it('stays open when a hover is followed by a click: the click pins it', () => {
    stubHover(true);
    const p = draw(item);
    p.pointer(rowButton(p), 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    p.click(rowButton(p));
    expect(dialogs(p)).toHaveLength(1);
    p.pointer(rowButton(p), 'pointerleave', { x: 0, y: 0, kind: 'mouse' });
    expect(dialogs(p)).toHaveLength(1);
  });

  it('moves to the next item when the mouse goes straight from one to the other', () => {
    vi.useFakeTimers();
    stubHover(true);
    const other = { id: 'item-2', baseId: piece.baseId, rarity: 'epic', itemLevel: 8 } as const;
    page = createPage();
    const p = page;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <GearItemsContext.Provider value={[sampleGearItem(piece), sampleGearItem(other)]}>
          <FindItems label="Found" pieces={[piece, other]} />
        </GearItemsContext.Provider>
      </PopoverHost>,
    );
    const [one, two] = byClass(p.root, 'find-row-button');
    if (one === undefined || two === undefined) throw new Error('two rows expected');
    p.pointer(one, 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(one.getAttribute('aria-expanded')).toBe('true');
    p.pointer(one, 'pointerleave', { x: 0, y: 0, kind: 'mouse' });
    p.pointer(two, 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(two.getAttribute('aria-expanded')).toBe('true');
    expect(one.getAttribute('aria-expanded')).toBe('false');
    // The first row's late close does not close the second row's popover.
    p.update(() => vi.advanceTimersByTime(300));
    expect(dialogs(p)).toHaveLength(1);
    expect(two.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps a popover pinned by a tap when the mouse crosses another item', () => {
    stubHover(true);
    const other = { id: 'item-2', baseId: piece.baseId, rarity: 'epic', itemLevel: 8 } as const;
    page = createPage();
    const p = page;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <GearItemsContext.Provider value={[sampleGearItem(piece), sampleGearItem(other)]}>
          <FindItems label="Found" pieces={[piece, other]} />
        </GearItemsContext.Provider>
      </PopoverHost>,
    );
    const [one, two] = byClass(p.root, 'find-row-button');
    if (one === undefined || two === undefined) throw new Error('two rows expected');
    p.click(one);
    p.pointer(two, 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(one.getAttribute('aria-expanded')).toBe('true');
  });

  it('explains a modifier line inside the popover, with a way back to the card', () => {
    const p = draw(item);
    p.click(rowButton(p));
    const line = first(byClass(first(dialogs(p)), 'line-text'));
    p.click(line);
    // Still the one popover, on the line's explanation, still pointing at the row.
    expect(dialogs(p)).toHaveLength(1);
    expect(byClass(p.root, 'idc')).toHaveLength(0);
    expect(rowButton(p).getAttribute('aria-expanded')).toBe('true');
    const back = first(byClass(p.root, 'pop-back'));
    expect(back.getAttribute('aria-label')).toBe(`Back to ${base.name}`);
    p.click(back);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
  });

  it('does not open on hover for a finger or a device that cannot hover', () => {
    stubHover(true);
    let p = draw(item);
    p.pointer(rowButton(p), 'pointerenter', { x: 0, y: 0, kind: 'touch' });
    expect(dialogs(p)).toHaveLength(0);
    p.unmount();
    stubHover(false);
    p = draw(item);
    p.pointer(rowButton(p), 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(dialogs(p)).toHaveLength(0);
  });
});

describe('a found item that cannot be inspected', () => {
  it("is plain without an id (a chest's banked gear)", () => {
    const p = draw(
      <FindItems label="Items" pieces={[{ baseId: piece.baseId, rarity: 'rare', itemLevel: 6 }]} />,
    );
    expect(byClass(p.root, 'find-row-button')).toHaveLength(0);
    expect(visibleText(first(byClass(p.root, 'find-row-name')))).toContain(base.name);
  });

  it('is plain before the gear view has loaded, with tappable badges as before', () => {
    const p = draw(item, false);
    expect(byClass(p.root, 'find-row-button')).toHaveLength(0);
    expect(find(p.root, (e) => e.localName === 'button').length).toBeGreaterThan(0);
  });
});

describe('the Equip button of a found item popover', () => {
  const equipButton = (p: Page): FakeElement[] =>
    byClass(p.root, 'pop-action').filter((b) => visibleText(b) === 'Equip');

  function drawEquip(onEquip = vi.fn(), list = creatures): Page {
    return draw(item, true, { creatures: list, onEquip });
  }

  it('shows under the card, centred and no wider than its label', () => {
    const p = drawEquip();
    p.click(rowButton(p));
    expect(equipButton(p)).toHaveLength(1);
    expect(first(byClass(p.root, 'pop-actions')).getAttribute('class')).toContain(
      'pop-actions-center',
    );
  });

  it('closes the popover and opens the creature sheet with the Equip on rows', () => {
    const p = drawEquip();
    p.click(rowButton(p));
    p.click(first(equipButton(p)));
    expect(byClass(p.root, 'idc')).toHaveLength(0);
    const sheet = first(byClass(p.root, 'roster-picker'));
    expect(sheet.getAttribute('aria-label')).toBe('Equip on');
    const names = byRole(sheet, 'option').map((o) => visibleText(o));
    expect(names).toHaveLength(2);
    // The one that can wear it best (higher level) first.
    expect(names[0]).toContain('Highly');
    expect(names[1]).toContain('Lowly');
  });

  it('equips the item on the picked creature and closes the sheet', () => {
    const onEquip = vi.fn();
    const p = drawEquip(onEquip);
    p.click(rowButton(p));
    p.click(first(equipButton(p)));
    const row = byRole(p.root, 'option').find((o) => visibleText(o).includes('Lowly'));
    p.click(first([row as FakeElement]));
    expect(onEquip).toHaveBeenCalledWith(piece.id, 'c-low');
    expect(byClass(p.root, 'roster-picker')).toHaveLength(0);
  });

  it('closes the sheet without asking when closed', () => {
    const onEquip = vi.fn();
    const p = drawEquip(onEquip);
    p.click(rowButton(p));
    p.click(first(equipButton(p)));
    p.click(first(byClass(p.root, 'sheet-close')));
    expect(byClass(p.root, 'roster-picker')).toHaveLength(0);
    expect(onEquip).not.toHaveBeenCalled();
  });

  it('is hidden without creatures, or outside a host', () => {
    let p = drawEquip(vi.fn(), []);
    p.click(rowButton(p));
    expect(equipButton(p)).toHaveLength(0);
    p.unmount();
    p = draw(item);
    p.click(rowButton(p));
    expect(equipButton(p)).toHaveLength(0);
  });

  it('can be reached from a hover-opened popover: the mouse may cross to it', () => {
    vi.useFakeTimers();
    stubHover(true);
    const p = drawEquip();
    p.pointer(rowButton(p), 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    p.pointer(rowButton(p), 'pointerleave', { x: 0, y: 0, kind: 'mouse' });
    const body = first(byClass(p.root, 'find-item-pop'));
    p.pointer(body, 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    p.update(() => vi.advanceTimersByTime(300));
    expect(equipButton(p)).toHaveLength(1);
    p.click(first(equipButton(p)));
    expect(byClass(p.root, 'roster-picker')).toHaveLength(1);
  });

  it('still closes a hover-opened popover when the mouse leaves and never comes back', () => {
    vi.useFakeTimers();
    stubHover(true);
    const p = drawEquip();
    p.pointer(rowButton(p), 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    p.pointer(rowButton(p), 'pointerleave', { x: 0, y: 0, kind: 'mouse' });
    p.update(() => vi.advanceTimersByTime(300));
    expect(dialogs(p)).toHaveLength(0);
  });
});

describe('a found item given its card directly', () => {
  const card = { ...sampleGearItem(piece), id: 'preview' };
  const given = (
    <FindList label="Treasure">
      <FindItem card={card} baseId={piece.baseId} rarity={piece.rarity} level={piece.itemLevel} />
    </FindList>
  );

  it('opens that card on a tap with no inventory id and nothing loaded, and has no Equip', () => {
    const p = draw(given, false, { creatures, onEquip: vi.fn() });
    p.click(rowButton(p));
    expect(byClass(p.root, 'idc')).toHaveLength(1);
    expect(byClass(p.root, 'pop-action')).toHaveLength(0);
  });

  it('opens on hover with a mouse, also without Equip', () => {
    vi.useFakeTimers();
    stubHover(true);
    const p = draw(given, false, { creatures, onEquip: vi.fn() });
    p.pointer(rowButton(p), 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(byClass(p.root, 'idc')).toHaveLength(1);
    expect(byClass(p.root, 'pop-action')).toHaveLength(0);
  });
});
