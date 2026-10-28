import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasMousePointer,
  resetSelectHintSession,
  retireSelectHint,
  selectHintRetired,
  selectHintText,
  type SelectHint,
} from './select-hint';

/** The one-time hint about selecting several things (2026-10-27): once only, on this device, whatever storage does. */

const HINT: SelectHint = {
  key: 'lc.test-select-hint.v1',
  touch: 'Press and hold a thing to select several',
  mouse: 'Click the box on a thing to select several',
};
const OTHER: SelectHint = { ...HINT, key: 'lc.other-select-hint.v1' };

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
  resetSelectHintSession();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the hint flag', () => {
  it('is not retired on a fresh device, and retired once it is set', () => {
    const { getStorage, saved } = memory();
    expect(selectHintRetired(HINT, getStorage)).toBe(false);
    retireSelectHint(HINT, getStorage);
    expect(saved.get(HINT.key)).toBe('1');
    expect(selectHintRetired(HINT, getStorage)).toBe(true);
  });

  it('stays retired for a later visit (a new session reads the saved flag)', () => {
    const { getStorage } = memory();
    retireSelectHint(HINT, getStorage);
    resetSelectHintSession();
    expect(selectHintRetired(HINT, getStorage)).toBe(true);
  });

  it('shows the hint, without throwing, when storage cannot be read', () => {
    expect(selectHintRetired(HINT, broken)).toBe(false);
    expect(
      selectHintRetired(HINT, () => ({
        getItem: broken,
        setItem: broken,
      })),
    ).toBe(false);
  });

  it('stays retired for the session when storage cannot be written, and never throws', () => {
    expect(() => {
      retireSelectHint(HINT, broken);
    }).not.toThrow();
    expect(selectHintRetired(HINT, broken)).toBe(true);
    resetSelectHintSession();
    expect(selectHintRetired(HINT, broken)).toBe(false);
  });

  it('reads the real flag key of the browser through window.localStorage, and survives it throwing', () => {
    vi.stubGlobal('window', {
      get localStorage(): never {
        throw new Error('blocked');
      },
    });
    expect(selectHintRetired(HINT)).toBe(false);
    expect(() => {
      retireSelectHint(HINT);
    }).not.toThrow();
    expect(selectHintRetired(HINT)).toBe(true);
  });
});

describe('one flag per list', () => {
  it("retiring one list's hint leaves another list's alone", () => {
    const { getStorage } = memory();
    retireSelectHint(HINT, getStorage);
    expect(selectHintRetired(HINT, getStorage)).toBe(true);
    expect(selectHintRetired(OTHER, getStorage)).toBe(false);
  });
});

describe('the wording by device', () => {
  it('names the box for a mouse and the press and hold for a finger', () => {
    expect(HINT.mouse).toBe(selectHintText(HINT, true));
    expect(HINT.touch).toBe(selectHintText(HINT, false));
  });

  it('asks the media query for a hovering, precise pointer', () => {
    const asked: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      asked.push(query);
      return { matches: true };
    });
    expect(hasMousePointer()).toBe(true);
    expect(asked).toEqual(['(hover: hover) and (pointer: fine)']);
    expect(selectHintText(HINT)).toBe(HINT.mouse);
  });

  it('is a touch device where the query says no, is missing or throws', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(hasMousePointer()).toBe(false);
    vi.stubGlobal('matchMedia', undefined);
    expect(hasMousePointer()).toBe(false);
    vi.stubGlobal('matchMedia', broken);
    expect(hasMousePointer()).toBe(false);
    expect(selectHintText(HINT)).toBe(HINT.touch);
  });
});
