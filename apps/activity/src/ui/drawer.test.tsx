import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  type FakeElement,
  type Page,
} from '../test-dom';
import { Drawer } from './Drawer';
import { dragOutcome, focusablesIn, trapTarget } from './drawer-logic';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page ??= createPage();
  page.draw(vnode);
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function sheet(onClose = vi.fn(), open = true, extra: { returnFocusTo?: FakeElement } = {}) {
  return (
    <div>
      <button type="button" id="opener">
        Opener
      </button>
      <Drawer
        open={open}
        onClose={onClose}
        title="Hat"
        meta="3 items"
        toolbar={<input type="text" aria-label="Find" />}
        footer={<button type="button">Pinned</button>}
        {...(extra.returnFocusTo === undefined
          ? {}
          : { returnFocusTo: extra.returnFocusTo as unknown as HTMLElement })}
      >
        <button type="button">One</button>
        <button type="button">Two</button>
      </Drawer>
    </div>
  );
}

describe('Drawer', () => {
  it('draws nothing while closed and a labelled modal dialog when open', () => {
    const p = draw(sheet(vi.fn(), false));
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    p.draw(sheet(vi.fn(), true));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = find(
      p.root,
      (el) => el.getAttribute('id') === dialog.getAttribute('aria-labelledby'),
    );
    expect(title[0]?.textContent).toBe('Hat');
    expect(p.root.textContent).toContain('3 items');
    expect(p.root.textContent).toContain('Pinned');
  });

  it('moves the focus into the sheet when it opens', () => {
    const p = draw(sheet(vi.fn(), false));
    p.draw(sheet(vi.fn(), true));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(p.document.activeElement).toBe(dialog);
  });

  it('closes by the backdrop, the handle, the close button and Escape', () => {
    const onClose = vi.fn();
    const p = draw(sheet(onClose));
    p.click(first(byClass(p.root, 'drawer-backdrop')));
    expect(onClose).toHaveBeenCalledTimes(1);
    p.click(first(byClass(p.root, 'drawer-handle')));
    expect(onClose).toHaveBeenCalledTimes(2);
    p.click(first(byName(p.root, 'button', 'Close')));
    expect(onClose).toHaveBeenCalledTimes(3);
    const event = p.key(first(byName(p.root, 'button', 'One')), 'Escape');
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps a pull on the handle to the page: its touch moves are marked handled, a tap is left alone', () => {
    const p = draw(sheet());
    const handle = first(byClass(p.root, 'drawer-handle'));
    // No pull under way: a touch move is the browser's.
    expect(p.event(handle, 'touchmove', { cancelable: true }).defaultPrevented).toBe(false);
    p.pointer(handle, 'pointerdown', { x: 0, y: 10 });
    expect(p.event(handle, 'touchmove', { cancelable: true }).defaultPrevented).toBe(true);
    // A move the browser says cannot be cancelled is not (that would only log a warning).
    expect(p.event(handle, 'touchmove', { cancelable: false }).defaultPrevented).toBe(false);
    p.pointer(handle, 'pointerup', { x: 0, y: 12 });
    expect(p.event(handle, 'touchmove', { cancelable: true }).defaultPrevented).toBe(false);
  });

  it('keeps Escape to itself: the page around it never hears it', () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    const p = draw(
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') onBack();
        }}
      >
        {sheet(onClose)}
      </div>,
    );
    p.key(first(byName(p.root, 'button', 'Two')), 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('keeps Tab inside: from the last control to the first, and in from outside', () => {
    const p = draw(sheet());
    const handle = first(byClass(p.root, 'drawer-handle'));
    const close = first(byName(p.root, 'button', 'Close'));
    const pinned = first(byName(p.root, 'button', 'Pinned'));
    // The handle is out of the tab order; the first stop is the close button.
    expect(focusablesIn(first(byRole(p.root, 'dialog')))[0]).toBe(close);
    expect(focusablesIn(first(byRole(p.root, 'dialog')))).not.toContain(handle);
    pinned.focus();
    const event = p.key(pinned, 'Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(p.document.activeElement).toBe(close);
    // Focus that got out (the page behind) is pulled back to the first control.
    first(byName(p.root, 'button', 'Opener')).focus();
    p.key(first(byRole(p.root, 'dialog')), 'Tab');
    expect(p.document.activeElement).toBe(close);
    // A Tab in the middle is left to the browser.
    const one = first(byName(p.root, 'button', 'One'));
    one.focus();
    expect(p.key(one, 'Tab').defaultPrevented).toBe(false);
  });

  it('gives the focus back to the control that opened it', () => {
    const p = draw(sheet(vi.fn(), false));
    const opener = first(byName(p.root, 'button', 'Opener'));
    opener.focus();
    p.draw(sheet(vi.fn(), true));
    expect(p.document.activeElement).not.toBe(opener);
    p.draw(sheet(vi.fn(), false));
    expect(p.document.activeElement).toBe(opener);
  });

  it('prefers the control it is told to return to', () => {
    const p = draw(sheet(vi.fn(), false));
    const opener = first(byName(p.root, 'button', 'Opener'));
    p.draw(sheet(vi.fn(), true, { returnFocusTo: opener }));
    p.draw(sheet(vi.fn(), false, { returnFocusTo: opener }));
    expect(p.document.activeElement).toBe(opener);
  });
});

describe('dragOutcome', () => {
  it('is a tap for a movement under a few pixels', () => {
    expect(dragOutcome(2, 50, 600)).toBe('tap');
    expect(dragOutcome(-3, 50, 600)).toBe('tap');
  });

  it('closes on a long pull, or a short quick flick, and snaps back otherwise', () => {
    expect(dragOutcome(130, 900, 600)).toBe('close');
    // A short sheet closes at a third of its height.
    expect(dragOutcome(70, 900, 200)).toBe('close');
    expect(dragOutcome(50, 60, 600)).toBe('close');
    expect(dragOutcome(50, 600, 600)).toBe('snap-back');
    expect(dragOutcome(-80, 100, 600)).toBe('snap-back');
  });
});

describe('trapTarget', () => {
  const inside = (el: string): boolean => ['a', 'b', 'c'].includes(el);
  it('wraps at the ends and pulls stray focus in', () => {
    expect(trapTarget(['a', 'b', 'c'], 'c', false, inside)).toBe('a');
    expect(trapTarget(['a', 'b', 'c'], 'a', true, inside)).toBe('c');
    expect(trapTarget(['a', 'b', 'c'], 'b', false, inside)).toBeNull();
    expect(trapTarget(['a', 'b', 'c'], 'z', false, inside)).toBe('a');
    expect(trapTarget(['a', 'b', 'c'], null, true, inside)).toBe('c');
    expect(trapTarget([], null, false, inside)).toBeNull();
  });
});
