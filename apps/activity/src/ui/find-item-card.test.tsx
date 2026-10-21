import { gearContent } from '@creatures/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  vi.unstubAllGlobals();
});

const base = gearContent.bases.find((b) => b.tag === 'ember' && b.set === undefined);
if (base === undefined) throw new Error('the content lacks an Ember base');
const piece = { id: 'item-1', baseId: base.id, rarity: 'rare', itemLevel: 6 } as const;

function draw(vnode: preact.ComponentChild, loaded = true): Page {
  if (!('window' in globalThis)) stubHover(false);
  page = createPage();
  page.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <GearItemsContext.Provider value={loaded ? [sampleGearItem(piece)] : []}>
        {vnode}
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
    stubHover(true);
    const p = draw(item);
    p.pointer(rowButton(p), 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(byClass(p.root, 'idc')).toHaveLength(1);
    p.pointer(rowButton(p), 'pointerleave', { x: 0, y: 0, kind: 'mouse' });
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
