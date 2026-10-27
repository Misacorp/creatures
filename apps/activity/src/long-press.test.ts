import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, HOLD_SLOP_PX, Hold, buzz, type HoldPointer } from './long-press';

/** The long press logic (2026-10-27), without a page: pointer events in, a timer, and what it tells the owner. */

const down: HoldPointer = { x: 100, y: 100, id: 1, kind: 'touch', button: 0, primary: true };
const at = (x: number, y: number, over: Partial<HoldPointer> = {}): HoldPointer => ({
  ...down,
  x,
  y,
  ...over,
});

function setup() {
  const fired: string[] = [];
  const changes: (string | null)[] = [];
  const hold = new Hold({ fire: (k) => fired.push(k), change: (k) => changes.push(k) });
  return { hold, fired, changes };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a long press', () => {
  it('uses about 450 ms and 8 px', () => {
    expect(HOLD_MS).toBe(450);
    expect(HOLD_SLOP_PX).toBe(8);
  });

  it('fires once after the hold time, with the key of the tile, and ends its cue', () => {
    const { hold, fired, changes } = setup();
    hold.down('a', down);
    expect(changes).toEqual(['a']);
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fired).toEqual(['a']);
    expect(changes).toEqual(['a', null]);
    vi.advanceTimersByTime(5000);
    expect(fired).toEqual(['a']);
  });

  it('is cancelled when the pointer drifts more than 8 px, in any direction', () => {
    for (const [x, y] of [
      [109, 100],
      [91, 100],
      [100, 109],
      [100, 91],
      [106, 106],
    ] as const) {
      const { hold, fired, changes } = setup();
      hold.down('a', down);
      hold.move(at(x, y));
      vi.advanceTimersByTime(HOLD_MS * 2);
      expect(fired, `${String(x)},${String(y)}`).toEqual([]);
      expect(changes).toEqual(['a', null]);
    }
  });

  it('survives a drift of 8 px or less', () => {
    const { hold, fired } = setup();
    hold.down('a', down);
    hold.move(at(108, 100));
    hold.move(at(103, 105));
    vi.advanceTimersByTime(HOLD_MS);
    expect(fired).toEqual(['a']);
  });

  it('ignores the moves of another pointer', () => {
    const { hold, fired } = setup();
    hold.down('a', down);
    hold.move(at(300, 300, { id: 2 }));
    vi.advanceTimersByTime(HOLD_MS);
    expect(fired).toEqual(['a']);
  });

  it('is cancelled by the end of the press (up, cancel or a scroll)', () => {
    const { hold, fired, changes } = setup();
    hold.down('a', down);
    vi.advanceTimersByTime(200);
    hold.end();
    vi.advanceTimersByTime(HOLD_MS);
    expect(fired).toEqual([]);
    expect(changes).toEqual(['a', null]);
    // Ending with no press in progress is harmless.
    hold.end();
    expect(changes).toEqual(['a', null]);
  });

  it('starts over on a new press, and ignores a second finger or a button other than the main one', () => {
    const { hold, fired } = setup();
    hold.down('a', down);
    vi.advanceTimersByTime(300);
    hold.down('b', at(50, 50));
    vi.advanceTimersByTime(300);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(fired).toEqual(['b']);
    const other = setup();
    other.hold.down('a', at(1, 1, { primary: false }));
    other.hold.down('a', at(1, 1, { button: 2, kind: 'mouse' }));
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(other.fired).toEqual([]);
    expect(other.changes).toEqual([]);
  });

  it('works for a mouse the same way', () => {
    const { hold, fired } = setup();
    hold.down('a', at(5, 5, { kind: 'mouse' }));
    vi.advanceTimersByTime(HOLD_MS);
    expect(fired).toEqual(['a']);
  });

  it('turns away the click that follows a completed hold, once', () => {
    const { hold } = setup();
    hold.down('a', down);
    vi.advanceTimersByTime(HOLD_MS);
    hold.end();
    expect(hold.takeSwallow()).toBe(true);
    expect(hold.takeSwallow()).toBe(false);
  });

  it('does not turn away the click of a press that was cancelled or short', () => {
    const { hold } = setup();
    hold.down('a', down);
    vi.advanceTimersByTime(200);
    hold.end();
    expect(hold.takeSwallow()).toBe(false);
  });

  it('lets a swallowed click that never came expire, so a later tap is a real one', () => {
    const { hold } = setup();
    hold.down('a', down);
    vi.advanceTimersByTime(HOLD_MS);
    hold.end();
    vi.advanceTimersByTime(1000);
    expect(hold.takeSwallow()).toBe(false);
  });

  it('stops everything when disposed', () => {
    const { hold, fired } = setup();
    hold.down('a', down);
    hold.dispose();
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(fired).toEqual([]);
  });
});

describe('the buzz', () => {
  it('vibrates briefly where the device can', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    buzz();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0]?.[0]).toBeLessThanOrEqual(30);
  });

  it('does nothing without vibration, and never throws', () => {
    vi.stubGlobal('navigator', {});
    expect(() => {
      buzz();
    }).not.toThrow();
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    expect(() => {
      buzz();
    }).not.toThrow();
  });
});
