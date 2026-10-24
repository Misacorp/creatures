import { describe, expect, it } from 'vitest';
import { HOME_STATES, homeInput } from '../workbench/home-sample';
import {
  DEFAULT_BOARD_SETTINGS,
  MAX_TILT,
  MIN_TILT,
  buildBoard,
  noticeIds,
  noticeTilt,
  swayDelay,
  type BoardSettings,
} from './board';

const IDS = [
  'need:games',
  'need:raid',
  'need:expeditions',
  'need:workshop',
  'need:dungeon',
  'need:collection',
  'calm',
  'coming',
  'quiet:expeditions',
  'quiet:workshop',
  'quiet:dungeon',
  'quiet:raid',
  'quiet:games',
  'valley',
];

describe('the board settings', () => {
  it('default to a small lean and no notices for quiet places', () => {
    expect(DEFAULT_BOARD_SETTINGS).toEqual({ tilt: 'still', idle: 'hide' });
  });
});

describe('noticeTilt', () => {
  it('is bounded: never past 1.5 degrees either way, never nearer to flush than 0.5', () => {
    for (const id of IDS) {
      for (let index = 0; index < 8; index += 1) {
        const angle = noticeTilt(id, index);
        expect(Math.abs(angle)).toBeGreaterThanOrEqual(MIN_TILT);
        expect(Math.abs(angle)).toBeLessThanOrEqual(MAX_TILT);
      }
    }
  });

  it('is the same every time for the same notice and place, with no randomness', () => {
    for (const id of IDS) expect(noticeTilt(id, 3)).toBe(noticeTilt(id, 3));
    expect(noticeTilt('need:raid', 1)).toBe(noticeTilt('need:raid', 1));
  });

  it('keeps its size when its side changes: the id decides the size, the place decides the side', () => {
    for (const id of IDS) {
      expect(Math.abs(noticeTilt(id, 0))).toBe(Math.abs(noticeTilt(id, 1)));
      expect(noticeTilt(id, 0)).toBeLessThan(0);
      expect(noticeTilt(id, 1)).toBeGreaterThan(0);
    }
  });

  it('leans neighbours different ways, and does not give every notice the same size', () => {
    const angles = IDS.map((id, index) => noticeTilt(id, index));
    for (let i = 1; i < angles.length; i += 1) {
      expect(Math.sign(angles[i] ?? 0)).not.toBe(Math.sign(angles[i - 1] ?? 0));
    }
    expect(new Set(angles.map(Math.abs)).size).toBeGreaterThan(3);
  });
});

describe('swayDelay', () => {
  it('is stable, within six seconds before the start, and differs between notices', () => {
    const delays = IDS.map(swayDelay);
    expect(delays).toEqual(IDS.map(swayDelay));
    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(0);
      expect(delay).toBeGreaterThanOrEqual(-6);
    }
    expect(new Set(delays).size).toBeGreaterThan(3);
  });
});

const settings = (over: Partial<BoardSettings> = {}): BoardSettings => ({
  ...DEFAULT_BOARD_SETTINGS,
  ...over,
});

describe('the idle option', () => {
  it('hide (the default): quiet places get no notice at all', () => {
    for (const state of HOME_STATES) {
      expect(buildBoard(homeInput(state, true), settings({ idle: 'hide' })).quiet).toEqual([]);
    }
  });

  it('show: quiet places get a calm one-line notice, after the real ones', () => {
    const board = buildBoard(homeInput('nothing going on', true), settings({ idle: 'show' }));
    expect(board.quiet.map((r) => r.place)).toEqual([
      'expeditions',
      'workshop',
      'dungeon',
      'raid',
      'games',
    ]);
    expect(board.quiet.every((r) => r.text.length > 0 && r.text.length < 40)).toBe(true);
    expect(noticeIds(board).filter((id) => id.startsWith('quiet:'))).toHaveLength(5);
    expect(noticeIds(board).at(-1)).toBe('valley');
  });

  it('show: a place that is busy or waiting still gets no quiet notice', () => {
    const board = buildBoard(homeInput('busy', true), settings({ idle: 'show' }));
    expect(board.quiet).toEqual([]);
    const waiting = buildBoard(homeInput('nothing waiting', true), settings({ idle: 'show' }));
    expect(waiting.quiet.map((r) => r.place)).toEqual(['dungeon']);
  });

  it('keeps the calm line when nothing needs the player, with idle hidden or shown', () => {
    for (const idle of ['hide', 'show'] as const) {
      const board = buildBoard(homeInput('nothing going on', true), settings({ idle }));
      expect(board.needs).toEqual([]);
      expect(board.calm).toBe(true);
      expect(noticeIds(board)).toContain('calm');
    }
    expect(buildBoard(homeInput('busy', true), settings()).calm).toBe(false);
  });

  it('with everything quiet and hidden, the board is the calm line and the valley and no more', () => {
    const board = buildBoard(homeInput('nothing going on', true), settings());
    expect(noticeIds(board)).toEqual(['calm', 'valley']);
  });
});

describe('the tilt option', () => {
  it('none: every notice is flush', () => {
    const board = buildBoard(homeInput('busy', true), settings({ tilt: 'none' }));
    expect(Object.values(board.tilts).every((angle) => angle === 0)).toBe(true);
    expect(Object.keys(board.tilts)).toEqual(noticeIds(board));
  });

  it('still and sway: every notice has its own lean, the same on every build', () => {
    for (const tilt of ['still', 'sway'] as const) {
      const first = buildBoard(homeInput('crowded', true), settings({ tilt, idle: 'show' }));
      const again = buildBoard(homeInput('crowded', true), settings({ tilt, idle: 'show' }));
      expect(first.tilts).toEqual(again.tilts);
      expect(Object.keys(first.tilts)).toEqual(noticeIds(first));
      expect(Object.values(first.tilts).every((angle) => angle !== 0)).toBe(true);
    }
    expect(buildBoard(homeInput('busy', true), settings({ tilt: 'still' })).tilts).toEqual(
      buildBoard(homeInput('busy', true), settings({ tilt: 'sway' })).tilts,
    );
  });

  it('does not change what the board says', () => {
    const none = buildBoard(homeInput('busy', true), settings({ tilt: 'none' }));
    const still = buildBoard(homeInput('busy', true), settings({ tilt: 'still' }));
    expect({ ...none, tilts: 0 }).toEqual({ ...still, tilts: 0 });
  });
});

describe('the raid rows of the board', () => {
  it('has the raid phase and finale in "Coming up" with the raid view, and leaves them out without it', () => {
    const board = buildBoard(homeInput('busy', true), settings());
    expect(board.coming.filter((r) => r.place === 'raid').length).toBeGreaterThan(0);
    const without = buildBoard(homeInput('busy', false), settings());
    expect(without.coming.some((r) => r.place === 'raid')).toBe(false);
  });
});
