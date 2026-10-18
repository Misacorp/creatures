import { describe, expect, it } from 'vitest';
import { handleFlipKey } from './flip-keys';
import {
  FLIP_DISTANCE_PX,
  RUBBER_MAX_PX,
  canStep,
  classifyMove,
  dragOffset,
  flipAnnouncement,
  flipKeyStep,
  flipLabel,
  flipOver,
  startsOnBlocked,
  stepOfSwipe,
  swipeAllowed,
  swipeOutcome,
  takesSideways,
} from './flip-logic';

/** A stand-in for a DOM node: the properties the checks read. */
function node(
  localName: string,
  attributes: Record<string, string> = {},
  parentNode: unknown = null,
) {
  return {
    localName,
    parentNode,
    getAttribute: (name: string) => attributes[name] ?? null,
    hasAttribute: (name: string) => name in attributes,
  };
}

describe('classifyMove', () => {
  it('leaves a short move undecided, so a tap stays a tap', () => {
    expect(classifyMove(0, 0)).toBe('undecided');
    expect(classifyMove(9, 0)).toBe('undecided');
    expect(classifyMove(0, -9)).toBe('undecided');
    expect(classifyMove(9, 9)).toBe('undecided');
  });

  it('calls a clearly sideways move horizontal, in both directions', () => {
    expect(classifyMove(12, 0)).toBe('horizontal');
    expect(classifyMove(-40, 8)).toBe('horizontal');
    expect(classifyMove(34, 20)).toBe('horizontal');
  });

  it('calls a vertical or steep move a scroll, which is never a swipe', () => {
    expect(classifyMove(0, 12)).toBe('vertical');
    expect(classifyMove(-5, -30)).toBe('vertical');
    // About 45 degrees: not clearly sideways.
    expect(classifyMove(30, 30)).toBe('vertical');
    // Just under the 1.7 ratio.
    expect(classifyMove(33, 20)).toBe('vertical');
  });

  it('waits when a sideways move is not yet far enough to tell from a slight slope', () => {
    expect(classifyMove(10, 7)).toBe('undecided');
  });
});

describe('swipeOutcome', () => {
  it('a long swipe left shows the next thing, right the previous one', () => {
    expect(swipeOutcome(-80, 4, 400, 390)).toBe(1);
    expect(swipeOutcome(80, -4, 400, 390)).toBe(-1);
    expect(stepOfSwipe(-1)).toBe(1);
    expect(stepOfSwipe(1)).toBe(-1);
  });

  it('a slow, short drag does nothing', () => {
    expect(swipeOutcome(-30, 0, 600, 390)).toBe(0);
    expect(swipeOutcome(-(FLIP_DISTANCE_PX - 1), 0, 900, 390)).toBe(0);
    expect(swipeOutcome(-FLIP_DISTANCE_PX, 0, 900, 390)).toBe(1);
  });

  it('a quick flick flips from a short distance', () => {
    expect(swipeOutcome(-30, 0, 40, 390)).toBe(1);
    expect(swipeOutcome(30, 0, 40, 390)).toBe(-1);
    // Too short even for a flick.
    expect(swipeOutcome(-15, 0, 10, 390)).toBe(0);
  });

  it('a narrow area flips from a third of its width', () => {
    expect(swipeOutcome(-40, 0, 900, 120)).toBe(1);
    expect(swipeOutcome(-30, 0, 900, 120)).toBe(0);
  });

  it('a vertical scroll never flips, however far it goes sideways on the way', () => {
    expect(swipeOutcome(-80, 70, 300, 390)).toBe(0);
    expect(swipeOutcome(-20, 150, 300, 390)).toBe(0);
    expect(swipeOutcome(0, 200, 100, 390)).toBe(0);
  });
});

describe('canStep', () => {
  it('has no previous at the first and no next at the last (no wrap-around)', () => {
    expect(canStep(-1, 0, 5)).toBe(false);
    expect(canStep(1, 0, 5)).toBe(true);
    expect(canStep(1, 4, 5)).toBe(false);
    expect(canStep(-1, 4, 5)).toBe(true);
  });

  it('has nowhere to go with one thing or none', () => {
    expect(canStep(1, 0, 1)).toBe(false);
    expect(canStep(-1, 0, 1)).toBe(false);
    expect(canStep(1, 0, 0)).toBe(false);
  });
});

describe('dragOffset', () => {
  it('follows the finger where there is a neighbour, within 60% of the width', () => {
    expect(dragOffset(-50, true, 390)).toBe(-50);
    expect(dragOffset(500, true, 390)).toBe(234);
    expect(dragOffset(-500, true, 390)).toBe(-234);
  });

  it('gives only a little at an end, and never more than the cap (a rubber band)', () => {
    expect(dragOffset(30, false, 390)).toBeCloseTo(9);
    expect(dragOffset(-30, false, 390)).toBeCloseTo(-9);
    expect(dragOffset(400, false, 390)).toBe(RUBBER_MAX_PX);
    expect(dragOffset(-400, false, 390)).toBe(-RUBBER_MAX_PX);
  });
});

describe('swipeAllowed', () => {
  it('lets a finger and a pen swipe, and the mouse only when the area says so', () => {
    expect(swipeAllowed('touch', 'touch')).toBe(true);
    expect(swipeAllowed('pen', 'touch')).toBe(true);
    expect(swipeAllowed('mouse', 'touch')).toBe(false);
    expect(swipeAllowed('mouse', 'any')).toBe(true);
  });
});

describe('gestures that start on a control that uses the sideways move', () => {
  const root = node('div');

  it('ignores a text field, a text area, a list, an editable part and a slider', () => {
    expect(takesSideways(node('input', { type: 'text' }))).toBe(true);
    expect(takesSideways(node('input'))).toBe(true);
    expect(takesSideways(node('input', { type: 'range' }))).toBe(true);
    expect(takesSideways(node('textarea'))).toBe(true);
    expect(takesSideways(node('select'))).toBe(true);
    expect(takesSideways(node('div', { contenteditable: 'true' }))).toBe(true);
    expect(takesSideways(node('div', { role: 'slider' }))).toBe(true);
  });

  it('does not ignore buttons, links, checkboxes or plain text', () => {
    expect(takesSideways(node('button'))).toBe(false);
    expect(takesSideways(node('a', { href: '#' }))).toBe(false);
    expect(takesSideways(node('input', { type: 'checkbox' }))).toBe(false);
    expect(takesSideways(node('input', { type: 'submit' }))).toBe(false);
    expect(takesSideways(node('p'))).toBe(false);
    expect(takesSideways(node('div', { contenteditable: 'false' }))).toBe(false);
    expect(takesSideways(null)).toBe(false);
  });

  it('looks up from the target to the area: a field inside a form blocks, a button does not', () => {
    const form = node('form', {}, root);
    const field = node('input', { type: 'text' }, form);
    const button = node('button', {}, form);
    const label = node('span', {}, button);
    expect(startsOnBlocked(field, root)).toBe(true);
    expect(startsOnBlocked(button, root)).toBe(false);
    expect(startsOnBlocked(label, root)).toBe(false);
  });

  it('blocks a part marked data-no-flip and everything inside it', () => {
    const marked = node('div', { 'data-no-flip': '' }, root);
    const inside = node('span', {}, marked);
    expect(startsOnBlocked(inside, root)).toBe(true);
    expect(startsOnBlocked(node('span', {}, root), root)).toBe(false);
  });

  it('does not look above the area itself', () => {
    const outer = node('input', { type: 'text' });
    const area = node('div', {}, outer);
    expect(startsOnBlocked(node('p', {}, area), area)).toBe(false);
  });
});

describe('keys', () => {
  const plain = node('div');

  it('Left is previous and Right is next', () => {
    expect(flipKeyStep({ key: 'ArrowLeft', target: plain })).toBe(-1);
    expect(flipKeyStep({ key: 'ArrowRight', target: plain })).toBe(1);
  });

  it('ignores other keys and keys with a modifier', () => {
    expect(flipKeyStep({ key: 'ArrowUp', target: plain })).toBeNull();
    expect(flipKeyStep({ key: 'a', target: plain })).toBeNull();
    expect(flipKeyStep({ key: 'ArrowLeft', altKey: true, target: plain })).toBeNull();
    expect(flipKeyStep({ key: 'ArrowRight', ctrlKey: true, target: plain })).toBeNull();
    expect(flipKeyStep({ key: 'ArrowRight', metaKey: true, target: plain })).toBeNull();
    expect(flipKeyStep({ key: 'ArrowRight', shiftKey: true, target: plain })).toBeNull();
  });

  it('leaves the arrows to a text field (Rename) and to a key someone already handled', () => {
    expect(flipKeyStep({ key: 'ArrowLeft', target: node('input', { type: 'text' }) })).toBeNull();
    expect(flipKeyStep({ key: 'ArrowLeft', target: node('textarea') })).toBeNull();
    expect(flipKeyStep({ key: 'ArrowRight', target: node('select') })).toBeNull();
    expect(flipKeyStep({ key: 'ArrowRight', defaultPrevented: true, target: plain })).toBeNull();
  });

  it('still flips from a button', () => {
    expect(flipKeyStep({ key: 'ArrowRight', target: node('button') })).toBe(1);
  });
});

describe('handleFlipKey', () => {
  function keyEvent(key: string, target: unknown = node('div')) {
    const event = {
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      defaultPrevented: false,
      target,
      preventDefault() {
        event.defaultPrevented = true;
      },
    };
    return event;
  }

  const flips: [number, string][] = [];
  const things = ['a', 'b', 'c'];
  function flipAt(at: number) {
    flips.length = 0;
    const flip = flipOver({
      list: things,
      at,
      noun: 'thing',
      nameOf: (t) => t,
      pick: (_t, step, via) => flips.push([step, via]),
    });
    if (flip === undefined) throw new Error('no flip');
    return flip;
  }

  it('flips with the key and says so', () => {
    const event = keyEvent('ArrowRight');
    expect(handleFlipKey(event, flipAt(1))).toBe(true);
    expect(flips).toEqual([[1, 'key']]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing at the ends, and leaves the key alone', () => {
    const left = keyEvent('ArrowLeft');
    expect(handleFlipKey(left, flipAt(0))).toBe(false);
    expect(handleFlipKey(keyEvent('ArrowRight'), flipAt(2))).toBe(false);
    expect(flips).toEqual([]);
    expect(left.defaultPrevented).toBe(false);
  });

  it('does nothing without a flip, or typing in a field', () => {
    expect(handleFlipKey(keyEvent('ArrowRight'), undefined)).toBe(false);
    expect(handleFlipKey(keyEvent('ArrowRight', node('input', { type: 'text' })), flipAt(1))).toBe(
      false,
    );
    expect(flips).toEqual([]);
  });
});

describe('flipOver', () => {
  const list = ['Cindle', 'Fox', 'Pebble'];

  it('names the neighbours for the buttons and the shown thing for the announcement', () => {
    const flip = flipOver({
      list,
      at: 1,
      noun: 'creature',
      nameOf: (t) => t,
      pick: () => undefined,
    });
    expect(flip).toMatchObject({
      index: 1,
      count: 3,
      noun: 'creature',
      name: 'Fox',
      prevName: 'Cindle',
      nextName: 'Pebble',
    });
  });

  it('has no neighbour name at an end', () => {
    const first = flipOver({ list, at: 0, noun: 'x', nameOf: (t) => t, pick: () => undefined });
    expect(first?.prevName).toBeUndefined();
    expect(first?.nextName).toBe('Fox');
  });

  it('is undefined with one thing, or when the shown thing is not in the list', () => {
    const none = { noun: 'x', nameOf: (t: string) => t, pick: () => undefined };
    expect(flipOver({ ...none, list: ['one'], at: 0 })).toBeUndefined();
    expect(flipOver({ ...none, list, at: -1 })).toBeUndefined();
  });

  it('hands the neighbour the flip leads to to pick, and never walks off the list', () => {
    const picked: string[] = [];
    const flip = flipOver({
      list,
      at: 2,
      noun: 'x',
      nameOf: (t) => t,
      pick: (t) => picked.push(t),
    });
    flip?.onFlip(-1, 'button');
    flip?.onFlip(1, 'button');
    expect(picked).toEqual(['Fox']);
  });

  it('passes the pointer mode, the entry direction and the focus request on', () => {
    const flip = flipOver({
      list,
      at: 1,
      noun: 'x',
      nameOf: (t) => t,
      pick: () => undefined,
      extra: { pointers: 'any', enter: 1, focusButton: -1 },
    });
    expect(flip).toMatchObject({ pointers: 'any', enter: 1, focusButton: -1 });
  });
});

describe('what is said', () => {
  it('labels the buttons with where they lead', () => {
    expect(flipLabel(-1, 'creature', 'Cindle')).toBe('Previous creature: Cindle');
    expect(flipLabel(1, 'item', 'Trail Cap')).toBe('Next item: Trail Cap');
    expect(flipLabel(1, 'item', undefined)).toBe('Next item');
    expect(flipLabel(-1, 'item', '')).toBe('Previous item');
  });

  it('announces the name and the place with a slash, never "of"', () => {
    expect(flipAnnouncement('Cindle', 2, 12)).toBe('Cindle, 3 / 12');
  });
});
