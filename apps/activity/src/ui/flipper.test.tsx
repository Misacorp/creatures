import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { Drawer } from './Drawer';
import { flipOver, type FlipVia, type SwipePointers } from './flip-logic';
import { FlipArea, FlipLive, FlipNav } from './Flipper';

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

const NAMES = ['Ash', 'Bram', 'Cindle', 'Dune', 'Elm'];

interface Probe {
  flips: [step: number, via: FlipVia][];
  pressed: number;
}

/** A small owner of five things: arrows, a swipe area with a button and a field in it, and the live region. */
function Owner({
  probe,
  start = 1,
  names = NAMES,
  pointers = 'touch',
}: {
  probe: Probe;
  start?: number;
  names?: string[];
  pointers?: SwipePointers;
}) {
  const [index, setIndex] = useState(start);
  const flip = flipOver({
    list: names,
    at: index,
    noun: 'creature',
    nameOf: (n) => n,
    extra: { pointers },
    pick: (_n, step, via) => {
      probe.flips.push([step, via]);
      setIndex((i) => i + step);
    },
  });
  return (
    <div>
      {flip !== undefined && <FlipNav flip={flip} />}
      <FlipArea flip={flip} class="demo-area">
        <p class="demo-name">{names[index]}</p>
        <button
          type="button"
          class="demo-button"
          onClick={() => {
            probe.pressed += 1;
          }}
        >
          Press
        </button>
        <input type="text" class="demo-field" aria-label="Nickname" />
        <div data-no-flip="" class="demo-marked">
          <span class="demo-inside">marked</span>
        </div>
      </FlipArea>
      {flip !== undefined && <FlipLive flip={flip} />}
    </div>
  );
}

function draw(options: Parameters<typeof Owner>[0]): { page: Page; area: FakeElement } {
  page = createPage();
  page.draw(<Owner {...options} />);
  // A single thing has no swipe area: the stand-in is the root.
  return { page, area: byClass(page.root, 'flip-area')[0] ?? page.root };
}

function shown(p: Page): string {
  return visibleText(first(byClass(p.root, 'demo-name')));
}

function count(p: Page): string {
  return visibleText(first(byClass(p.root, 'flip-count')));
}

/** A drag with one finger: down, one move to `to`, up. `ms` is how long it took. */
function swipe(
  p: Page,
  on: FakeElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { ms?: number; kind?: string; id?: number } = {},
): void {
  const kind = options.kind ?? 'touch';
  const id = options.id ?? 1;
  p.pointer(on, 'pointerdown', { ...from, at: 0, kind, id });
  p.pointer(on, 'pointermove', { ...to, at: (options.ms ?? 200) / 2, kind, id });
  p.pointer(on, 'pointerup', { ...to, at: options.ms ?? 200, kind, id });
}

describe('FlipNav', () => {
  it('has a previous and a next button that say where they lead, and the position with a slash', () => {
    const { page: p } = draw({ probe: { flips: [], pressed: 0 } });
    const group = first(byRole(p.root, 'group'));
    expect(group.getAttribute('aria-label')).toBe('Flip between creatures');
    expect(byName(group, 'button', 'Previous creature: Ash')).toHaveLength(1);
    expect(byName(group, 'button', 'Next creature: Cindle')).toHaveLength(1);
    expect(count(p)).toBe('2 / 5');
    expect(p.root.textContent).not.toMatch(/\d\s+of\s+\d/);
  });

  it('flips with the buttons and keeps the position and the labels up to date', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p } = draw({ probe });
    p.click(first(byName(p.root, 'button', /^Next creature/)));
    expect(shown(p)).toBe('Cindle');
    expect(count(p)).toBe('3 / 5');
    expect(byName(p.root, 'button', 'Previous creature: Bram')).toHaveLength(1);
    p.click(first(byName(p.root, 'button', /^Previous creature/)));
    expect(shown(p)).toBe('Bram');
    expect(probe.flips).toEqual([
      [1, 'button'],
      [-1, 'button'],
    ]);
  });

  it('stops at the first thing: the previous button says so and does nothing', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p } = draw({ probe, start: 0 });
    const previous = first(byName(p.root, 'button', 'Previous creature'));
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    // Not `disabled`: a keyboard user at the end keeps the focus where it was.
    expect(previous.hasAttribute('disabled')).toBe(false);
    p.click(previous);
    expect(shown(p)).toBe('Ash');
    expect(probe.flips).toEqual([]);
    expect(first(byName(p.root, 'button', /^Next creature/)).hasAttribute('aria-disabled')).toBe(
      false,
    );
  });

  it('stops at the last thing too (no wrap-around)', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p } = draw({ probe, start: 4 });
    const next = first(byName(p.root, 'button', 'Next creature'));
    expect(next.getAttribute('aria-disabled')).toBe('true');
    p.click(next);
    expect(shown(p)).toBe('Elm');
    expect(count(p)).toBe('5 / 5');
    expect(probe.flips).toEqual([]);
  });

  it('keeps the focus on the button that was pressed', () => {
    const { page: p } = draw({ probe: { flips: [], pressed: 0 }, start: 3 });
    const next = first(byName(p.root, 'button', /^Next creature/));
    next.focus();
    p.click(next);
    // Now at the last thing: the same button is still there and still has the focus.
    expect(p.document.activeElement).toBe(first(byName(p.root, 'button', 'Next creature')));
  });

  it('draws nothing for a single thing', () => {
    const { page: p } = draw({ probe: { flips: [], pressed: 0 }, start: 0, names: ['Only'] });
    expect(byClass(p.root, 'flip-nav')).toHaveLength(0);
    expect(byClass(p.root, 'flip-area')).toHaveLength(0);
    expect(shown(p)).toBe('Only');
  });

  it('can take the focus back after a flip that drew it anew', () => {
    page = createPage();
    const flip = flipOver({
      list: NAMES,
      at: 2,
      noun: 'item',
      nameOf: (n) => n,
      pick: () => undefined,
      extra: { focusButton: 1 },
    });
    if (flip === undefined) throw new Error('no flip');
    page.draw(<FlipNav flip={flip} />);
    expect(page.document.activeElement).toBe(first(byName(page.root, 'button', /^Next item/)));
  });

  it('sits in a drawer as a full-width row under the heading, not in the heading', () => {
    page = createPage();
    const flip = flipOver({
      list: NAMES,
      at: 0,
      noun: 'item',
      nameOf: (n) => n,
      pick: () => undefined,
    });
    if (flip === undefined) throw new Error('no flip');
    page.draw(
      <Drawer open title="Hat" flip={flip} onClose={() => undefined}>
        <p>Body</p>
      </Drawer>,
    );
    const row = byClass(page.root, 'drawer-flip');
    expect(row).toHaveLength(1);
    expect(byClass(first(row), 'flip-nav')).toHaveLength(1);
    expect(byClass(first(byClass(page.root, 'drawer-head')), 'flip-nav')).toHaveLength(0);
  });
});

describe('FlipArea: a swipe', () => {
  it('a swipe left shows the next thing', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe });
    swipe(p, area, { x: 300, y: 200 }, { x: 180, y: 206 });
    expect(shown(p)).toBe('Cindle');
    expect(probe.flips).toEqual([[1, 'swipe']]);
  });

  it('a swipe right shows the previous thing', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe });
    swipe(p, area, { x: 100, y: 200 }, { x: 230, y: 194 });
    expect(shown(p)).toBe('Ash');
    expect(probe.flips).toEqual([[-1, 'swipe']]);
  });

  it('a quick flick flips and a slow short drag does not', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe });
    swipe(p, area, { x: 300, y: 200 }, { x: 270, y: 200 }, { ms: 800 });
    expect(shown(p)).toBe('Bram');
    swipe(p, area, { x: 300, y: 200 }, { x: 270, y: 200 }, { ms: 40 });
    expect(shown(p)).toBe('Cindle');
  });

  it('a vertical scroll does not flip, and does not start one when it turns sideways', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe });
    swipe(p, area, { x: 200, y: 400 }, { x: 190, y: 250 });
    expect(shown(p)).toBe('Bram');
    // Starts as a scroll, then wanders far sideways: still a scroll.
    p.pointer(area, 'pointerdown', { x: 300, y: 400, at: 0 });
    p.pointer(area, 'pointermove', { x: 296, y: 370, at: 50 });
    p.pointer(area, 'pointermove', { x: 120, y: 360, at: 100 });
    p.pointer(area, 'pointerup', { x: 120, y: 360, at: 120 });
    expect(shown(p)).toBe('Bram');
    expect(probe.flips).toEqual([]);
  });

  it('a diagonal drag steeper than 30 degrees does not flip', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe });
    swipe(p, area, { x: 300, y: 200 }, { x: 220, y: 280 });
    expect(shown(p)).toBe('Bram');
  });

  it('a tap with no move is left to the button', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p } = draw({ probe });
    const button = first(byClass(p.root, 'demo-button'));
    p.pointer(button, 'pointerdown', { x: 50, y: 50, at: 0 });
    p.pointer(button, 'pointerup', { x: 51, y: 50, at: 80 });
    p.click(button);
    expect(probe.pressed).toBe(1);
    expect(probe.flips).toEqual([]);
  });

  it('a swipe that starts on a button flips and does not press it', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p } = draw({ probe });
    const button = first(byClass(p.root, 'demo-button'));
    swipe(p, button, { x: 300, y: 200 }, { x: 160, y: 200 });
    expect(shown(p)).toBe('Cindle');
    // The thing was drawn anew; the click that follows the swipe, wherever it lands, is swallowed.
    const drawnAnew = first(byClass(p.root, 'demo-button'));
    p.click(drawnAnew);
    expect(probe.pressed).toBe(0);
    // The next tap is a normal one.
    p.pointer(drawnAnew, 'pointerdown', { x: 50, y: 50, at: 500 });
    p.pointer(drawnAnew, 'pointerup', { x: 50, y: 50, at: 560 });
    p.click(drawnAnew);
    expect(probe.pressed).toBe(1);
  });

  it('a swipe that goes nowhere (at the end) does not press the button it started on either', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p } = draw({ probe, start: 0 });
    const button = first(byClass(p.root, 'demo-button'));
    swipe(p, button, { x: 100, y: 200 }, { x: 260, y: 200 });
    expect(shown(p)).toBe('Ash');
    p.click(button);
    expect(probe.pressed).toBe(0);
  });

  it('a gesture that starts in a text field, or on a part marked data-no-flip, is left alone', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p } = draw({ probe });
    swipe(p, first(byClass(p.root, 'demo-field')), { x: 300, y: 200 }, { x: 100, y: 200 });
    swipe(p, first(byClass(p.root, 'demo-inside')), { x: 300, y: 200 }, { x: 100, y: 200 });
    expect(shown(p)).toBe('Bram');
    expect(probe.flips).toEqual([]);
  });

  it('does nothing at the ends, where the content only gives a little and settles back', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe, start: 0 });
    const slide = first(byClass(area, 'flip-slide'));
    p.pointer(area, 'pointerdown', { x: 100, y: 200, at: 0 });
    p.pointer(area, 'pointermove', { x: 200, y: 200, at: 100 });
    expect(slide.getAttribute('class')).toContain('flipping');
    p.pointer(area, 'pointerup', { x: 200, y: 200, at: 200 });
    expect(slide.getAttribute('class')).not.toContain('flipping');
    expect(shown(p)).toBe('Ash');
    expect(probe.flips).toEqual([]);
  });

  it('takes the pointer while swiping so the finger keeps steering', () => {
    const { page: p, area } = draw({ probe: { flips: [], pressed: 0 } });
    swipe(p, area, { x: 300, y: 200 }, { x: 180, y: 200 });
    expect(area.captured).toEqual([1]);
  });

  it('a cancelled gesture (the browser took it as a scroll) flips nothing', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe });
    p.pointer(area, 'pointerdown', { x: 300, y: 200, at: 0 });
    p.pointer(area, 'pointermove', { x: 200, y: 200, at: 50 });
    p.pointer(area, 'pointercancel', { x: 200, y: 200, at: 60 });
    p.pointer(area, 'pointerup', { x: 100, y: 200, at: 80 });
    expect(probe.flips).toEqual([]);
    expect(shown(p)).toBe('Bram');
  });

  it('ignores a second finger', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe });
    p.pointer(area, 'pointerdown', { x: 300, y: 200, at: 0, id: 2, primary: false });
    p.pointer(area, 'pointermove', { x: 100, y: 200, at: 50, id: 2, primary: false });
    p.pointer(area, 'pointerup', { x: 100, y: 200, at: 80, id: 2, primary: false });
    expect(probe.flips).toEqual([]);
  });

  it('ignores the mouse unless the area allows it', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe });
    swipe(p, area, { x: 300, y: 200 }, { x: 100, y: 200 }, { kind: 'mouse' });
    expect(probe.flips).toEqual([]);
    expect(shown(p)).toBe('Bram');
    swipe(p, area, { x: 300, y: 200 }, { x: 100, y: 200 }, { kind: 'pen' });
    expect(shown(p)).toBe('Cindle');
  });

  it('takes a mouse drag when the area says "any"', () => {
    const probe: Probe = { flips: [], pressed: 0 };
    const { page: p, area } = draw({ probe, pointers: 'any' });
    swipe(p, area, { x: 300, y: 200 }, { x: 100, y: 200 }, { kind: 'mouse' });
    expect(shown(p)).toBe('Cindle');
  });

  it('slides the new thing in from the side it was flipped to', () => {
    const { page: p, area } = draw({ probe: { flips: [], pressed: 0 } });
    expect(first(byClass(area, 'flip-slide')).hasAttribute('data-enter')).toBe(false);
    p.click(first(byName(p.root, 'button', /^Next creature/)));
    expect(first(byClass(area, 'flip-slide')).getAttribute('data-enter')).toBe('next');
    p.click(first(byName(p.root, 'button', /^Previous creature/)));
    expect(first(byClass(area, 'flip-slide')).getAttribute('data-enter')).toBe('prev');
  });
});

describe('FlipLive', () => {
  it('says nothing when it first appears and the new name and place after a flip', () => {
    const { page: p } = draw({ probe: { flips: [], pressed: 0 } });
    const status = first(byRole(p.root, 'status'));
    expect(visibleText(status)).toBe('');
    expect(status.getAttribute('aria-live')).toBe('polite');
    p.click(first(byName(p.root, 'button', /^Next creature/)));
    expect(visibleText(first(byRole(p.root, 'status')))).toBe('Cindle, 3 / 5');
    p.click(first(byName(p.root, 'button', /^Previous creature/)));
    expect(visibleText(first(byRole(p.root, 'status')))).toBe('Bram, 2 / 5');
  });
});

describe('Drawer with flip', () => {
  interface Seen {
    flips: [number, FlipVia][];
    closed: number;
    outer: string[];
  }

  function Sheet({ seen, start = 1 }: { seen: Seen; start?: number }) {
    const [index, setIndex] = useState(start);
    const flip = flipOver({
      list: NAMES,
      at: index,
      noun: 'item',
      nameOf: (n) => n,
      pick: (_n, step, via) => {
        seen.flips.push([step, via]);
        setIndex((i) => i + step);
      },
    });
    return (
      <div
        onKeyDown={(event) => {
          seen.outer.push(event.key);
        }}
      >
        <Drawer
          open
          title={NAMES[index] ?? ''}
          titleHidden
          flip={flip}
          onClose={() => {
            seen.closed += 1;
          }}
        >
          <FlipArea flip={flip}>
            <p class="sheet-name">{NAMES[index]}</p>
            <input type="text" class="sheet-field" aria-label="Note" />
          </FlipArea>
        </Drawer>
      </div>
    );
  }

  function drawSheet(start = 1): { page: Page; seen: Seen; panel: FakeElement } {
    page = createPage();
    const seen: Seen = { flips: [], closed: 0, outer: [] };
    page.draw(<Sheet seen={seen} start={start} />);
    return { page, seen, panel: first(byRole(page.root, 'dialog')) };
  }

  it('puts the arrows with the position in their own row under the heading', () => {
    const { panel } = drawSheet();
    const row = first(byClass(panel, 'drawer-flip'));
    expect(byClass(row, 'flip-nav')).toHaveLength(1);
    expect(visibleText(first(byClass(row, 'flip-count')))).toBe('2 / 5');
    expect(byName(first(byClass(panel, 'drawer-head')), 'button', 'Close')).toHaveLength(1);
  });

  it('flips with the arrows', () => {
    const { page: p, panel, seen } = drawSheet();
    p.click(first(byName(panel, 'button', /^Next item/)));
    expect(visibleText(first(byClass(panel, 'sheet-name')))).toBe('Cindle');
    expect(seen.flips).toEqual([[1, 'button']]);
  });

  it('flips with Left and Right, and the page behind does not hear the keys', () => {
    const { page: p, panel, seen } = drawSheet();
    p.key(panel, 'ArrowRight');
    expect(visibleText(first(byClass(panel, 'sheet-name')))).toBe('Cindle');
    p.key(panel, 'ArrowLeft');
    p.key(panel, 'ArrowLeft');
    expect(visibleText(first(byClass(panel, 'sheet-name')))).toBe('Ash');
    expect(seen.flips.map(([step]) => step)).toEqual([1, -1, -1]);
    expect(seen.flips.every(([, via]) => via === 'key')).toBe(true);
    // The first thing has no previous: another Left does nothing, and is still not passed on.
    p.key(panel, 'ArrowLeft');
    expect(seen.flips).toHaveLength(3);
    expect(seen.outer).toEqual([]);
  });

  it('leaves the arrow keys to a text field inside it', () => {
    const { page: p, panel, seen } = drawSheet();
    const field = first(byClass(panel, 'sheet-field'));
    const event = p.key(field, 'ArrowRight');
    expect(seen.flips).toEqual([]);
    // The field's own behaviour (moving the caret) is not prevented.
    expect(event.defaultPrevented).toBe(false);
  });

  it('still closes with Escape, and passes other keys on', () => {
    const { page: p, panel, seen } = drawSheet();
    p.key(panel, 'Escape');
    expect(seen.closed).toBe(1);
    p.key(panel, 'a');
    expect(seen.outer).toEqual(['a']);
  });

  it('announces the new thing in a live region that stays', () => {
    const { page: p, panel } = drawSheet();
    expect(visibleText(first(byRole(panel, 'status')))).toBe('');
    p.key(panel, 'ArrowRight');
    expect(visibleText(first(byRole(panel, 'status')))).toBe('Cindle, 3 / 5');
  });

  it('takes the focus when the control that had it went with the old thing', () => {
    const { page: p, panel } = drawSheet();
    const field = first(byClass(panel, 'sheet-field'));
    field.focus();
    p.click(first(byName(panel, 'button', /^Next item/)));
    // The field was drawn anew (it sits inside the flipped area): focus is not lost to the page.
    expect(find(panel, (e) => e === p.document.activeElement).length).toBeGreaterThan(0);
  });

  it('without a flip it draws no arrows and passes the arrow keys on to nobody', () => {
    page = createPage();
    const outer: string[] = [];
    page.draw(
      <div
        onKeyDown={(event) => {
          outer.push(event.key);
        }}
      >
        <Drawer open title="Plain" onClose={vi.fn()}>
          <p>Body</p>
        </Drawer>
      </div>,
    );
    expect(byClass(page.root, 'flip-nav')).toHaveLength(0);
    page.key(first(byRole(page.root, 'dialog')), 'ArrowRight');
    expect(outer).toEqual([]);
  });
});
