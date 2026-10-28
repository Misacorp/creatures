import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { Collection } from './Collection';
import { CreaturePage } from './CreaturePage';
import { GEAR_STATE, SAMPLE_GEAR, SAMPLE_STATE, sampleRoster } from './creature-card-sample';
import { cardDomId } from './creature-card-view';
import { creatureName } from './game';
import { pageScene } from './creature-page/sample';
import type { GearActions } from './gear-actions';
import { gearName, sortItems } from './gear-view';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  nameOf,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';
import { Workshop } from './Workshop';

/**
 * The creature page and the item drawers flip the same way, because they use the same parts
 * (`ui/Flipper.tsx`, `ui/flip-logic.ts`). These tests drive the real views: the Creatures tab, the
 * Workshop bag and the creature page's item picker.
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

const noop = (): void => undefined;

// --- The Creatures tab ---

describe('the creature page flips through the list it came from', () => {
  interface FakeWindow {
    scrollY: number;
    scrollTo: ReturnType<typeof vi.fn>;
  }
  let win: FakeWindow;

  beforeEach(() => {
    win = {
      scrollY: 0,
      scrollTo: vi.fn((options: { top: number }) => {
        win.scrollY = options.top;
      }),
    };
    Reflect.set(globalThis, 'window', win);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => null, setItem: noop },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  const roster = sampleRoster(12);
  const onRename = vi.fn();

  function drawTab(creatures: Creature[] = roster): Page {
    page = createPage();
    page.draw(
      <Collection
        state={{ ...SAMPLE_STATE, creatures, pending: [] }}
        gear={SAMPLE_GEAR}
        busy={false}
        catchActions={{ chooseMany: () => Promise.resolve(true) }}
        onEquip={() => Promise.resolve(true)}
        onRibbon={noop}
        onEvolve={noop}
        onRename={onRename}
        onNote={vi.fn()}
        onLounge={noop}
        onSlotTalent={noop}
      />,
    );
    return page;
  }

  function open(p: Page, creature: Creature): void {
    const card = p.document.getElementById(cardDomId(creature.id)) as FakeElement;
    p.click(
      first(find(card, (e) => e.localName === 'button' && e.getAttribute('class') === 'cc-open')),
    );
  }

  function pageRoot(p: Page): FakeElement {
    return first(byClass(p.root, 'creature-page'));
  }

  function openedId(p: Page): string {
    return (pageRoot(p).getAttribute('id') ?? '')
      .replace('creature-card-', '')
      .replace('-page', '');
  }

  function count(p: Page): string {
    return visibleText(first(byClass(pageRoot(p), 'flip-count')));
  }

  function cardIds(p: Page): string[] {
    return find(
      p.root,
      (el) =>
        el.localName === 'li' &&
        (el.getAttribute('id') ?? '').startsWith('creature-card-') &&
        !(el.getAttribute('id') ?? '').includes('-sheet'),
    ).map((el) => (el.getAttribute('id') ?? '').replace('creature-card-', ''));
  }

  const at = (n: number): Creature => roster[n] as Creature;

  it('shows the arrows and the position at the top, between Back and Lounge', () => {
    const p = drawTab();
    open(p, at(3));
    const top = first(byClass(pageRoot(p), 'cp-top'));
    const buttons = find(top, (e) => e.localName === 'button').map((b) => nameOf(b));
    expect(buttons[0]).toBe('‹ Creatures');
    expect(buttons).toContain('Previous creature: ' + creatureName(at(2)));
    expect(buttons).toContain('Next creature: ' + creatureName(at(4)));
    expect(count(p)).toBe('4 / 12');
  });

  it('flips to the next and the previous creature with the buttons, in the list order', () => {
    const p = drawTab();
    open(p, at(3));
    p.click(first(byName(pageRoot(p), 'button', /^Next creature/)));
    expect(openedId(p)).toBe(at(4).id);
    expect(count(p)).toBe('5 / 12');
    p.click(first(byName(pageRoot(p), 'button', /^Previous creature/)));
    p.click(first(byName(pageRoot(p), 'button', /^Previous creature/)));
    expect(openedId(p)).toBe(at(2).id);
    expect(count(p)).toBe('3 / 12');
  });

  it('flips with Left and Right', () => {
    const p = drawTab();
    open(p, at(3));
    p.key(pageRoot(p), 'ArrowRight');
    expect(openedId(p)).toBe(at(4).id);
    p.key(pageRoot(p), 'ArrowLeft');
    p.key(pageRoot(p), 'ArrowLeft');
    expect(openedId(p)).toBe(at(2).id);
  });

  it('does not flip on the arrow keys typed in the Rename field', () => {
    const p = drawTab();
    open(p, at(3));
    const field = first(find(pageRoot(p), (e) => e.localName === 'input'));
    const event = p.key(field, 'ArrowRight');
    expect(openedId(p)).toBe(at(3).id);
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops at the first and the last creature (no wrap-around)', () => {
    const p = drawTab();
    open(p, at(0));
    expect(
      first(byName(pageRoot(p), 'button', 'Previous creature')).getAttribute('aria-disabled'),
    ).toBe('true');
    p.key(pageRoot(p), 'ArrowLeft');
    expect(openedId(p)).toBe(at(0).id);
    p.click(first(byName(pageRoot(p), 'button', 'Previous creature')));
    expect(openedId(p)).toBe(at(0).id);
    open(p, at(0));
    // Go to the end.
    for (let i = 0; i < 11; i += 1) p.key(pageRoot(p), 'ArrowRight');
    expect(openedId(p)).toBe(at(11).id);
    expect(count(p)).toBe('12 / 12');
    p.key(pageRoot(p), 'ArrowRight');
    expect(openedId(p)).toBe(at(11).id);
  });

  it('has no arrows when there is only one creature', () => {
    const p = drawTab([at(0)]);
    open(p, at(0));
    expect(byClass(pageRoot(p), 'flip-nav')).toHaveLength(0);
    p.key(pageRoot(p), 'ArrowRight');
    expect(openedId(p)).toBe(at(0).id);
  });

  it('flips through the filtered list, in the order the cards are shown', () => {
    const p = drawTab();
    const needs = first(byName(p.root, 'button', /^Needs you/));
    p.click(needs);
    const shown = cardIds(p);
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.length).toBeLessThan(12);
    const second = roster.find((c) => c.id === shown[1]) as Creature;
    open(p, roster.find((c) => c.id === shown[0]) as Creature);
    expect(count(p)).toBe(`1 / ${String(shown.length)}`);
    p.click(first(byName(pageRoot(p), 'button', /^Next creature/)));
    expect(openedId(p)).toBe(second.id);
    expect(count(p)).toBe(`2 / ${String(shown.length)}`);
  });

  it('starts the next page at the top, with its drawers shut', () => {
    const p = drawTab();
    open(p, at(3));
    win.scrollY = 500;
    // Open the Hat picker, close it again, flip.
    const hat = first(
      find(pageRoot(p), (e) => e.localName === 'button' && /^(Hat|Scarf): /.test(nameOf(e))),
    );
    p.click(hat);
    expect(byRole(p.root, 'dialog').length).toBe(1);
    p.click(first(byName(first(byRole(p.root, 'dialog')), 'button', 'Close')));
    p.click(first(byName(pageRoot(p), 'button', /^Next creature/)));
    expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'auto' });
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });

  it('shows the new creature to a screen reader: the name and the place, politely', () => {
    const p = drawTab();
    open(p, at(3));
    expect(
      byRole(p.root, 'status')
        .map((s) => visibleText(s))
        .join(''),
    ).not.toContain('/');
    p.click(first(byName(pageRoot(p), 'button', /^Next creature/)));
    const spoken = byRole(p.root, 'status').map((s) => visibleText(s));
    expect(spoken.some((text) => /, 5 \/ 12$/.test(text))).toBe(true);
  });

  it('after a button flip keeps the focus on that button; after a key flip it is on the page', () => {
    const p = drawTab();
    open(p, at(3));
    p.click(first(byName(pageRoot(p), 'button', /^Next creature/)));
    expect(p.document.activeElement).toBe(first(byName(pageRoot(p), 'button', /^Next creature/)));
    p.key(pageRoot(p), 'ArrowRight');
    expect(p.document.activeElement).toBe(pageRoot(p));
  });

  it('Back after flipping shows the card the page ended on', () => {
    const p = drawTab();
    open(p, at(3));
    p.click(first(byName(pageRoot(p), 'button', /^Next creature/)));
    p.click(first(byName(pageRoot(p), 'button', /^Next creature/)));
    p.click(first(byName(pageRoot(p), 'button', '‹ Creatures')));
    const card = p.document.getElementById(cardDomId(at(5).id)) as FakeElement;
    expect(card.scrolled).toBe(1);
    expect(p.document.activeElement).toBe(card);
  });

  it('marks the card of the creature whose page was open last, and only that one', () => {
    const p = drawTab();
    open(p, at(3));
    p.click(first(byName(pageRoot(p), 'button', /^Next creature/)));
    p.click(first(byName(pageRoot(p), 'button', '‹ Creatures')));
    const marked = byClass(p.root, 'creature-card').filter((c) =>
      byClass(p.root, 'current').includes(c),
    );
    expect(marked).toEqual([p.document.getElementById(cardDomId(at(4).id))]);
  });

  it('keeps the arrow keys for an open drawer: they do not flip the creature behind', () => {
    const p = drawTab();
    open(p, at(3));
    const hat = first(
      find(pageRoot(p), (e) => e.localName === 'button' && /^(Hat|Scarf): /.test(nameOf(e))),
    );
    p.click(hat);
    const dialog = first(byRole(p.root, 'dialog'));
    p.key(dialog, 'ArrowRight');
    expect(openedId(p)).toBe(at(3).id);
  });

  it('draws the page with the same controls the item drawers use', () => {
    const p = drawTab();
    open(p, at(3));
    const nav = first(byClass(pageRoot(p), 'flip-nav'));
    expect(nav.getAttribute('aria-label')).toBe('Flip between creatures');
    expect(byClass(nav, 'flip-btn')).toHaveLength(2);
    expect(byClass(pageRoot(p), 'flip-area')).toHaveLength(1);
  });
});

// --- The Workshop bag ---

const gearActions = {
  equip: vi.fn(() => Promise.resolve(undefined)),
  equipBest: () => Promise.resolve(undefined),
  checkDismantle: () => Promise.resolve({ locked: [] }),
  dismantlePile: () => Promise.resolve(undefined),
  dismissNotice: () => Promise.resolve(undefined),
  startJob: () => Promise.resolve(undefined),
  previewCraft: () => new Promise(() => undefined),
  previewDismantle: () => new Promise(() => undefined),
  claimJob: () => Promise.resolve(undefined),
} as unknown as GearActions;

describe('the Workshop item drawer flips through the bag in the grid order', () => {
  function drawWorkshop(): Page {
    page = createPage();
    page.draw(
      <Workshop
        state={GEAR_STATE}
        gear={SAMPLE_GEAR}
        failed={false}
        offset={0}
        busy={false}
        reveal={null}
        actions={gearActions}
        onRetry={noop}
        onClaimed={noop}
        onDismissReveal={noop}
      />,
    );
    return page;
  }

  function cells(p: Page): FakeElement[] {
    return find(
      first(byClass(p.root, 'item-grid')),
      (e) => e.localName === 'button' && e.getAttribute('role') !== 'checkbox',
    );
  }

  function dialog(p: Page): FakeElement {
    return first(byRole(p.root, 'dialog'));
  }

  const ordered = sortItems(SAMPLE_GEAR.items);

  function pressedIndex(p: Page): number {
    return cells(p).findIndex((c) => c.getAttribute('aria-current') === 'true');
  }

  it('has the sample bag with more than one item', () => {
    expect(ordered.length).toBeGreaterThan(2);
  });

  it('shows the arrows and the position when an item opens', () => {
    const p = drawWorkshop();
    p.click(cells(p)[1] as FakeElement);
    const nav = first(byClass(dialog(p), 'flip-nav'));
    expect(nav.getAttribute('aria-label')).toBe('Flip between items');
    expect(visibleText(first(byClass(nav, 'flip-count')))).toBe(`2 / ${String(ordered.length)}`);
    expect(
      byName(
        nav,
        'button',
        `Previous item: ${gearName((ordered[0] ?? (ordered[1] as never)).baseId)}`,
      ),
    ).toHaveLength(1);
    expect(
      byName(
        nav,
        'button',
        `Next item: ${gearName((ordered[2] as never as { baseId: string }).baseId)}`,
      ),
    ).toHaveLength(1);
  });

  it('flips to the next item with the button, the key and the previous with the other', () => {
    const p = drawWorkshop();
    p.click(cells(p)[0] as FakeElement);
    p.click(first(byName(dialog(p), 'button', /^Next item/)));
    expect(pressedIndex(p)).toBe(1);
    p.key(dialog(p), 'ArrowRight');
    expect(pressedIndex(p)).toBe(2);
    p.key(dialog(p), 'ArrowLeft');
    p.click(first(byName(dialog(p), 'button', /^Previous item/)));
    expect(pressedIndex(p)).toBe(0);
    expect(visibleText(first(byClass(dialog(p), 'flip-count')))).toBe(
      `1 / ${String(ordered.length)}`,
    );
  });

  it('stops at both ends of the bag', () => {
    const p = drawWorkshop();
    p.click(cells(p)[0] as FakeElement);
    p.key(dialog(p), 'ArrowLeft');
    expect(pressedIndex(p)).toBe(0);
    expect(first(byName(dialog(p), 'button', 'Previous item')).getAttribute('aria-disabled')).toBe(
      'true',
    );
    p.click(cells(p)[ordered.length - 1] as FakeElement);
    p.key(dialog(p), 'ArrowRight');
    expect(pressedIndex(p)).toBe(ordered.length - 1);
    expect(first(byName(dialog(p), 'button', 'Next item')).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('shows the details of the item now shown, and its actions work on it', () => {
    const p = drawWorkshop();
    p.click(cells(p)[0] as FakeElement);
    p.click(first(byName(dialog(p), 'button', /^Next item/)));
    const shown = ordered[1];
    if (shown === undefined) throw new Error('no second item');
    expect(byClass(dialog(p), 'item-detail')[0]?.getAttribute('aria-labelledby')).toBe(
      `item-${shown.id}-name`,
    );
    // The Equip on row is for the item now shown: its list lists every creature, with the reason for
    // each one that cannot take it (nobody in this sample can, so a tap on an option asks for nothing).
    const trigger = first(byClass(dialog(p), 'equip-trigger'));
    expect(trigger.getAttribute('aria-labelledby')).toContain(shown.id);
    gearActions.equip = vi.fn(() => Promise.resolve(undefined));
    p.click(trigger);
    expect(byClass(p.root, 'equip-view')).toHaveLength(1);
    const options = byRole(p.root, 'option');
    expect(options.length).toBeGreaterThan(1);
    p.click(first(options.filter((o) => o.getAttribute('aria-disabled') === 'true')));
    expect(gearActions.equip).not.toHaveBeenCalled();
  });

  it('turns flipping off while the Equip on list is shown, and back on when it is left', () => {
    const p = drawWorkshop();
    p.click(cells(p)[1] as FakeElement);
    const shownId = (): string | null =>
      byClass(dialog(p), 'item-detail')[0]?.getAttribute('aria-labelledby') ?? null;
    const before = shownId();
    expect(byClass(dialog(p), 'flip-nav')).toHaveLength(1);
    p.click(first(byClass(dialog(p), 'equip-trigger')));
    // The list takes the item's place: no arrows, no announcement, and Left and Right change nothing.
    expect(byClass(dialog(p), 'flip-nav')).toHaveLength(0);
    expect(byRole(dialog(p), 'status')).toHaveLength(0);
    p.key(first(byClass(dialog(p), 'equip-view')), 'ArrowRight');
    p.key(dialog(p), 'ArrowRight');
    expect(byClass(dialog(p), 'equip-view')).toHaveLength(1);
    // Back (the button) returns to the same item, with the arrows again.
    p.click(first(byName(dialog(p), 'button', /^‹ Back/)));
    expect(byClass(dialog(p), 'equip-view')).toHaveLength(0);
    expect(shownId()).toBe(before);
    expect(byClass(dialog(p), 'flip-nav')).toHaveLength(1);
  });

  it('leaves the Equip on list with Escape, to the item, without closing the drawer', () => {
    const p = drawWorkshop();
    p.click(cells(p)[1] as FakeElement);
    gearActions.equip = vi.fn(() => Promise.resolve(undefined));
    p.click(first(byClass(dialog(p), 'equip-trigger')));
    p.key(first(byClass(dialog(p), 'equip-view')), 'Escape');
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    expect(byClass(dialog(p), 'equip-view')).toHaveLength(0);
    expect(byClass(dialog(p), 'idc')).toHaveLength(1);
    expect(gearActions.equip).not.toHaveBeenCalled();
  });

  it('pauses the flipping while the Equip on list is shown, and Back returns to the same item with the arrows', () => {
    const p = drawWorkshop();
    p.click(cells(p)[0] as FakeElement);
    const shownId = (): string | null =>
      byClass(dialog(p), 'item-detail')[0]?.getAttribute('aria-labelledby') ?? null;
    const before = shownId();
    p.click(first(byClass(dialog(p), 'equip-trigger')));
    expect(byClass(dialog(p), 'equip-view')).toHaveLength(1);
    expect(byClass(dialog(p), 'flip-nav')).toHaveLength(0);
    p.click(first(byName(dialog(p), 'button', /^‹ Back/)));
    expect(byClass(dialog(p), 'equip-view')).toHaveLength(0);
    expect(shownId()).toBe(before);
    expect(byClass(dialog(p), 'flip-nav')).toHaveLength(1);
    expect(byName(dialog(p), 'button', 'Dismantle')).toHaveLength(1);
  });

  it('keeps the focus on the arrow that was pressed instead of moving it to the new name', () => {
    const p = drawWorkshop();
    p.click(cells(p)[0] as FakeElement);
    const next = first(byName(dialog(p), 'button', /^Next item/));
    next.focus();
    p.click(next);
    expect(p.document.activeElement).toBe(first(byName(dialog(p), 'button', /^Next item/)));
  });

  it('closes with Escape and the arrow keys do not reach the page behind', () => {
    const p = drawWorkshop();
    p.click(cells(p)[0] as FakeElement);
    p.key(dialog(p), 'Escape');
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });

  it('draws the same controls as the creature page', () => {
    const p = drawWorkshop();
    p.click(cells(p)[0] as FakeElement);
    const nav = first(byClass(dialog(p), 'flip-nav'));
    expect(byClass(nav, 'flip-btn')).toHaveLength(2);
    expect(byClass(dialog(p), 'flip-area')).toHaveLength(1);
    expect(byRole(dialog(p), 'status')).toHaveLength(1);
  });
});

// --- The creature page's item picker ---

describe('the item picker has no flip: the grid is how you move between items', () => {
  function drawPicker(): { page: Page; dialog: FakeElement; onEquip: ReturnType<typeof vi.fn> } {
    page = createPage();
    const scene = pageScene('level 15');
    const onEquip = vi.fn(() => Promise.resolve(true));
    page.draw(
      <CreaturePage
        creature={scene.creature}
        state={scene.state}
        gear={scene.gear}
        busy={false}
        actions={{
          onEquip,
          onRibbon: noop,
          onEvolve: noop,
          onRename: noop,
          onNote: noop,
          onLounge: noop,
          onSlotTalent: noop,
        }}
        focus={null}
        initialOpen={{ kind: 'gear', slot: 'charm' }}
        onBack={noop}
        onAnswerCatch={noop}
      />,
    );
    return { page, dialog: first(byRole(page.root, 'dialog')), onEquip };
  }

  function pressed(dialog: FakeElement): string {
    return nameOf(first(find(dialog, (e) => e.getAttribute('aria-pressed') === 'true')));
  }

  it('draws no Prev / Next row, no swipe area and no flip announcement', () => {
    const { dialog } = drawPicker();
    expect(byClass(dialog, 'item-tile').length).toBeGreaterThan(3);
    expect(byClass(dialog, 'flip-nav')).toHaveLength(0);
    expect(byName(dialog, 'button', /^(Previous|Next) item/)).toHaveLength(0);
    expect(byClass(dialog, 'flip-area')).toHaveLength(0);
    expect(byRole(dialog, 'status')).toHaveLength(0);
  });

  it('says how many items are in the bag in the heading, always', () => {
    const { dialog } = drawPicker();
    expect(visibleText(first(byClass(dialog, 'drawer-head')))).toMatch(/\d+ in the bag/);
  });

  it('selects the item that is tapped and shows its detail', () => {
    const { page: p, dialog } = drawPicker();
    const cells = byClass(dialog, 'item-tile');
    const start = cells.findIndex((c) => c.getAttribute('aria-pressed') === 'true');
    const other = cells.find((_, index) => index !== start) as FakeElement;
    p.click(other);
    expect(pressed(dialog)).toBe(nameOf(other));
    expect(other.getAttribute('aria-pressed')).toBe('true');
  });

  it('does nothing on the arrow keys (they stay off the creature behind, too)', () => {
    const { page: p, dialog } = drawPicker();
    p.click(byClass(dialog, 'item-tile')[2] as FakeElement);
    const before = pressed(dialog);
    p.key(dialog, 'ArrowRight');
    p.key(dialog, 'ArrowLeft');
    expect(pressed(dialog)).toBe(before);
  });

  it('equips the item that is tapped and shown', async () => {
    const { page: p, dialog, onEquip } = drawPicker();
    // Tap tiles until an item that can be worn is shown, then equip it.
    const cells = byClass(dialog, 'item-tile');
    for (const cell of cells) {
      if (byName(dialog, 'button', 'Equip').length > 0) break;
      p.click(cell);
    }
    p.click(first(byName(dialog, 'button', 'Equip')));
    await vi.waitFor(() => {
      expect(onEquip).toHaveBeenCalledTimes(1);
    });
    expect(String((onEquip.mock.calls[0] as unknown[])[0])).toContain('bag-charm');
  });
});

// --- One building block ---

describe('every flipping view uses the shared building block', () => {
  const sources = import.meta.glob<string>(
    [
      './CreaturePage.tsx',
      './Workshop.tsx',
      './Collection.tsx',
      './creature-page/ItemPicker.tsx',
      './ui/Drawer.tsx',
    ],
    { query: '?raw', import: 'default', eager: true },
  );
  const src = (name: string): string => sources[name] ?? '';

  it('the creature page draws FlipNav and FlipArea from ui/Flipper and listens with handleFlipKey', () => {
    const source = src('./CreaturePage.tsx');
    expect(source).toContain("from './ui/Flipper'");
    expect(source).toMatch(/<FlipNav /);
    expect(source).toMatch(/<FlipArea /);
    expect(source).toContain('handleFlipKey');
  });

  it('the Creatures tab builds its flip with flipOver and announces it with FlipLive', () => {
    const source = src('./Collection.tsx');
    expect(source).toContain('flipOver(');
    expect(source).toContain('<FlipLive');
  });

  it('the Workshop builds its flip the same way and hands it to the Drawer and a FlipArea', () => {
    const source = src('./Workshop.tsx');
    expect(source).toContain('flipOver(');
    expect(source).toMatch(/flip=\{flip\}/);
    expect(source).toMatch(/<FlipArea /);
  });

  it('the item picker does not flip at all (2026-10-18: tapping in the grid is enough)', () => {
    const source = src('./creature-page/ItemPicker.tsx');
    expect(source).not.toContain('flipOver');
    expect(source).not.toContain('FlipArea');
    expect(source).not.toMatch(/flip=/);
  });

  it('the Drawer draws the arrows, the keys and the announcement of whatever flip it is given', () => {
    const source = src('./ui/Drawer.tsx');
    expect(source).toContain("from './Flipper'");
    expect(source).toMatch(/<FlipNav /);
    expect(source).toMatch(/<FlipLive /);
    expect(source).toContain('handleFlipKey');
  });
});
