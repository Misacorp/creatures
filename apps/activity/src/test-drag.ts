import { act } from 'preact/test-utils';
import { FakeElement, type Page } from './test-dom';

type Listener = (event: unknown) => void;

/** Where a slot tile sits in the fake layout: 100 px apart, 90 px square, in one row. */
const SLOT = 100;
const SIZE = 90;

/**
 * A fake layout and window for dragging a creature tile onto another (`use-drag-drop`): each
 * `[data-slot]` tile gets a box by its slot, the window takes the move and release listeners, and
 * animation frames never run. Call `restore` when done (`onTestFinished`): it puts back what was there.
 */
export function installDrag(): {
  drag: (page: Page, from: FakeElement, to: FakeElement) => void;
  restore: () => void;
} {
  const listeners = new Map<string, Set<Listener>>();
  const fakeWindow = {
    innerHeight: 800,
    addEventListener: (type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    getSelection: () => null,
    scrollBy: () => undefined,
  };
  // What was there before (a test file's own stubs), put back by `restore`.
  const saved = [
    [globalThis, 'window'],
    [globalThis, 'requestAnimationFrame'],
    [globalThis, 'cancelAnimationFrame'],
    [FakeElement.prototype, 'getBoundingClientRect'],
    [FakeElement.prototype, 'querySelectorAll'],
  ].map(([target, key]) => ({
    target: target as object,
    key: key as string,
    had: Object.getOwnPropertyDescriptor(target as object, key as string),
  }));
  const tilesUnder = (el: FakeElement): FakeElement[] =>
    el.childNodes.flatMap((child) =>
      child instanceof FakeElement
        ? [...(child.getAttribute('data-slot') === null ? [] : [child]), ...tilesUnder(child)]
        : [],
    );
  Reflect.set(globalThis, 'window', fakeWindow);
  Reflect.set(globalThis, 'requestAnimationFrame', () => 0);
  Reflect.set(globalThis, 'cancelAnimationFrame', () => undefined);
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', function (this: FakeElement) {
    const slot = this.getAttribute('data-slot');
    const left = slot === null ? 0 : Number(slot) * SLOT;
    const width = slot === null ? 3 * SLOT : SIZE;
    return { left, right: left + width, top: 0, bottom: SIZE, width, height: SIZE };
  });

  // The drop finds the tiles under the strip (a file may have stubbed this away).
  Reflect.set(FakeElement.prototype, 'querySelectorAll', function (this: FakeElement) {
    return tilesUnder(this);
  });

  const centre = (el: FakeElement): { x: number; y: number } => ({
    x: Number(el.getAttribute('data-slot')) * SLOT + SIZE / 2,
    y: SIZE / 2,
  });
  const send = (type: string, at: { x: number; y: number }): void => {
    void act(() => {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener({ pointerId: 1, clientX: at.x, clientY: at.y, cancelable: false });
      }
    });
  };

  return {
    drag(page, from, to) {
      // A pen: no hold (that is for a finger) and no mouse button to check.
      page.pointer(from, 'pointerdown', { ...centre(from), kind: 'pen' });
      const start = centre(from);
      send('pointermove', { x: start.x + 20, y: start.y });
      send('pointermove', centre(to));
      send('pointerup', centre(to));
    },
    restore() {
      for (const { target, key, had } of saved) {
        if (had === undefined) Reflect.deleteProperty(target, key);
        else Reflect.defineProperty(target, key, had);
      }
    },
  };
}
