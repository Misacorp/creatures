import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyStoredLook,
  chooseLook,
  chooseRoom,
  LOOK_KEY,
  ROOM_KEY,
  storedLook,
  storedRoom,
  type PrefStorage,
} from './look-prefs';

function fake(initial: Record<string, string> = {}): PrefStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const dataset: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(dataset)) delete dataset[k];
  const el = {
    dataset,
    removeAttribute: (name: string) => {
      delete dataset[name.replace('data-', '')];
    },
  };
  (globalThis as { document?: unknown }).document = { documentElement: el };
});

describe('look prefs', () => {
  it('defaults to current and every', () => {
    expect(storedLook(fake())).toBe('current');
    expect(storedRoom(fake())).toBe('every');
  });

  it('ignores unknown stored values', () => {
    const s = fake({ [LOOK_KEY]: 'nope', [ROOM_KEY]: 'nope' });
    expect(storedLook(s)).toBe('current');
    expect(storedRoom(s)).toBe('every');
  });

  it('applies and remembers choices, and restores them at start-up', () => {
    const s = fake();
    chooseLook('quest', s);
    chooseRoom('home', s);
    expect(dataset['look']).toBe('quest');
    expect(dataset['room']).toBe('home');
    for (const k of Object.keys(dataset)) delete dataset[k];
    applyStoredLook(s);
    expect(dataset['look']).toBe('quest');
    expect(dataset['room']).toBe('home');
    chooseLook('current', s);
    chooseRoom('every', s);
    expect(dataset['look']).toBeUndefined();
    expect(dataset['room']).toBeUndefined();
  });

  it('survives a storage that throws', () => {
    const bad: PrefStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(storedLook(bad)).toBe('current');
    expect(() => {
      chooseLook('arcade', bad);
    }).not.toThrow();
  });
});
