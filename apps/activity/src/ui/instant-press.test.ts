import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instantPress } from './instant-press';

/** A pointer down of this kind, as the button's handler receives it. */
function down(pointerType: string, button = 0): PointerEvent {
  return { pointerType, button } as unknown as PointerEvent;
}

/** A click that reaches the window first (capture), then the button if nothing stopped it. */
function clickThrough(target: EventTarget, onClick: () => void): void {
  const event = new Event('click', { cancelable: true });
  let stopped = false;
  event.stopPropagation = () => {
    stopped = true;
  };
  target.dispatchEvent(event);
  if (!stopped) onClick();
}

describe('instantPress', () => {
  let win: EventTarget & { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };

  beforeEach(() => {
    vi.useFakeTimers();
    win = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
    vi.stubGlobal('window', win);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('acts on a touch press at once and swallows the click that follows it', () => {
    const action = vi.fn();
    const press = instantPress(action);
    press.onPointerDown(down('touch'));
    expect(action).toHaveBeenCalledTimes(1);
    clickThrough(win, press.onClick);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('acts when no click ever comes (a tap that only stopped a glide)', () => {
    const action = vi.fn();
    instantPress(action).onPointerDown(down('touch'));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('lets a later, real click through: the guard ends at the next press or after a moment', () => {
    const action = vi.fn();
    const press = instantPress(action);
    press.onPointerDown(down('touch'));
    win.dispatchEvent(new Event('pointerdown'));
    clickThrough(win, press.onClick);
    expect(action).toHaveBeenCalledTimes(2);

    press.onPointerDown(down('pen'));
    vi.advanceTimersByTime(1000);
    clickThrough(win, press.onClick);
    expect(action).toHaveBeenCalledTimes(4);
  });

  it('leaves a mouse, a side button and the keyboard to the click', () => {
    const action = vi.fn();
    const press = instantPress(action);
    press.onPointerDown(down('mouse'));
    press.onPointerDown(down('pen', 2));
    expect(action).not.toHaveBeenCalled();
    clickThrough(win, press.onClick);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
