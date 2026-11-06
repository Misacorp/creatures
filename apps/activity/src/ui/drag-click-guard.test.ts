import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUARD_MS, swallowNextClick } from './drag-click-guard';

afterEach(() => {
  vi.useRealTimers();
});

const click = (): Event => new Event('click', { cancelable: true });

describe('swallowNextClick', () => {
  it('stops the click that follows a drag, and only that one', () => {
    vi.useFakeTimers();
    const win = new EventTarget();
    swallowNextClick(win);
    const first = click();
    win.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    const second = click();
    win.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it('lets go when no click comes, so the next tap opens', () => {
    vi.useFakeTimers();
    const win = new EventTarget();
    swallowNextClick(win);
    vi.advanceTimersByTime(GUARD_MS + 1);
    const tap = click();
    win.dispatchEvent(tap);
    expect(tap.defaultPrevented).toBe(false);
  });

  it('a click without a drag is untouched', () => {
    const win = new EventTarget();
    const tap = click();
    win.dispatchEvent(tap);
    expect(tap.defaultPrevented).toBe(false);
  });
});
