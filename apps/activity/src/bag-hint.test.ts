import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BAG_HINT_KEY,
  BAG_HINT_POINTER,
  BAG_HINT_TOUCH,
  bagHintRetired,
  bagHintText,
  hasMousePointer,
  resetBagHintSession,
  retireBagHint,
} from './bag-hint';

/** The one-time hint about selecting several items (2026-10-27): once only, on this device, whatever storage does. */

function memory(): {
  getStorage: () => Pick<Storage, 'getItem' | 'setItem'>;
  saved: Map<string, string>;
} {
  const saved = new Map<string, string>();
  return {
    saved,
    getStorage: () => ({
      getItem: (k) => saved.get(k) ?? null,
      setItem: (k, v) => {
        saved.set(k, v);
      },
    }),
  };
}

const broken = (): never => {
  throw new Error('storage is blocked');
};

beforeEach(() => {
  resetBagHintSession();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the hint flag', () => {
  it('is not retired on a fresh device, and retired once it is set', () => {
    const { getStorage, saved } = memory();
    expect(bagHintRetired(getStorage)).toBe(false);
    retireBagHint(getStorage);
    expect(saved.get(BAG_HINT_KEY)).toBe('1');
    expect(bagHintRetired(getStorage)).toBe(true);
  });

  it('stays retired for a later visit (a new session reads the saved flag)', () => {
    const { getStorage } = memory();
    retireBagHint(getStorage);
    resetBagHintSession();
    expect(bagHintRetired(getStorage)).toBe(true);
  });

  it('shows the hint, without throwing, when storage cannot be read', () => {
    expect(bagHintRetired(broken)).toBe(false);
    expect(
      bagHintRetired(() => ({
        getItem: broken,
        setItem: broken,
      })),
    ).toBe(false);
  });

  it('stays retired for the session when storage cannot be written, and never throws', () => {
    expect(() => {
      retireBagHint(broken);
    }).not.toThrow();
    expect(bagHintRetired(broken)).toBe(true);
    resetBagHintSession();
    expect(bagHintRetired(broken)).toBe(false);
  });

  it('reads the real flag key of the browser through window.localStorage, and survives it throwing', () => {
    vi.stubGlobal('window', {
      get localStorage(): never {
        throw new Error('blocked');
      },
    });
    expect(bagHintRetired()).toBe(false);
    expect(() => {
      retireBagHint();
    }).not.toThrow();
    expect(bagHintRetired()).toBe(true);
  });
});

describe('the wording by device', () => {
  it('names the circle for a mouse and the press and hold for a finger', () => {
    expect(bagHintText(true)).toBe('Click the circle on an item to select several');
    expect(bagHintText(false)).toBe('Press and hold an item to select several');
    expect(BAG_HINT_POINTER).toBe(bagHintText(true));
    expect(BAG_HINT_TOUCH).toBe(bagHintText(false));
  });

  it('asks the media query for a hovering, precise pointer', () => {
    const asked: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      asked.push(query);
      return { matches: true };
    });
    expect(hasMousePointer()).toBe(true);
    expect(asked).toEqual(['(hover: hover) and (pointer: fine)']);
    expect(bagHintText()).toBe(BAG_HINT_POINTER);
  });

  it('is a touch device where the query says no, is missing or throws', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(hasMousePointer()).toBe(false);
    vi.stubGlobal('matchMedia', undefined);
    expect(hasMousePointer()).toBe(false);
    vi.stubGlobal('matchMedia', broken);
    expect(hasMousePointer()).toBe(false);
    expect(bagHintText()).toBe(BAG_HINT_TOUCH);
  });
});
