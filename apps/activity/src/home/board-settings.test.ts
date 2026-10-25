import { describe, expect, it } from 'vitest';
import { DEFAULT_BOARD_SETTINGS } from './board';
import {
  BOARD_SETTINGS_KEY,
  browserSettingsStorage,
  loadBoardSettings,
  saveBoardSettings,
  type SettingsStorage,
} from './board-settings';

function memory(
  initial: Record<string, string> = {},
): SettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const broken: SettingsStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('the board settings on the device', () => {
  it('starts from the defaults when nothing is saved', () => {
    expect(loadBoardSettings(memory())).toEqual(DEFAULT_BOARD_SETTINGS);
  });

  it('keeps what was saved, and reads it back', () => {
    const storage = memory();
    expect(saveBoardSettings(storage, { tilt: 'still', idle: 'show' })).toBe(true);
    expect(loadBoardSettings(storage)).toEqual({ tilt: 'still', idle: 'show' });
  });

  it('reads an old saved sway as still (the player liked a lean)', () => {
    const old = memory({ [BOARD_SETTINGS_KEY]: JSON.stringify({ tilt: 'sway', idle: 'show' }) });
    expect(loadBoardSettings(old)).toEqual({ tilt: 'still', idle: 'show' });
  });

  it('falls back to the defaults field by field for anything unknown', () => {
    const odd = (value: unknown) => memory({ [BOARD_SETTINGS_KEY]: JSON.stringify(value) });
    expect(loadBoardSettings(odd({ tilt: 'spin', idle: 'show' }))).toEqual({
      tilt: DEFAULT_BOARD_SETTINGS.tilt,
      idle: 'show',
    });
    expect(loadBoardSettings(odd({ tilt: 7 }))).toEqual(DEFAULT_BOARD_SETTINGS);
    expect(loadBoardSettings(odd(null))).toEqual(DEFAULT_BOARD_SETTINGS);
    expect(loadBoardSettings(odd('text'))).toEqual(DEFAULT_BOARD_SETTINGS);
    expect(loadBoardSettings(memory({ [BOARD_SETTINGS_KEY]: '{not json' }))).toEqual(
      DEFAULT_BOARD_SETTINGS,
    );
  });

  it('survives storage that throws or is missing, on both read and write', () => {
    expect(loadBoardSettings(broken)).toEqual(DEFAULT_BOARD_SETTINGS);
    expect(saveBoardSettings(broken, { tilt: 'none', idle: 'show' })).toBe(false);
    expect(loadBoardSettings(null)).toEqual(DEFAULT_BOARD_SETTINGS);
    expect(saveBoardSettings(null, DEFAULT_BOARD_SETTINGS)).toBe(false);
  });

  it('stores only the two known fields', () => {
    const storage = memory();
    saveBoardSettings(storage, { tilt: 'still', idle: 'hide' });
    expect(JSON.parse(storage.data[BOARD_SETTINGS_KEY] ?? '')).toEqual({
      tilt: 'still',
      idle: 'hide',
    });
  });

  it('finds no browser storage where reading it throws', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    try {
      expect(browserSettingsStorage()).toBeNull();
    } finally {
      if (real === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
      else Object.defineProperty(globalThis, 'localStorage', real);
    }
  });
});
