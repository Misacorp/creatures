import { afterEach, describe, expect, it } from 'vitest';
import {
  MIN_OVERFLOW,
  MOVED_PX,
  edgesWithMore,
  forgetAll,
  isLearned,
  markLearned,
  playerScrolled,
} from './pan-hint-logic';

afterEach(forgetAll);

describe('edgesWithMore', () => {
  it('shows nothing where the map fits, padding slop included', () => {
    expect(edgesWithMore(0, 736, 736)).toEqual({ left: false, right: false });
    expect(edgesWithMore(0, 736, 742)).toEqual({ left: false, right: false });
    expect(edgesWithMore(0, 100, 100 + MIN_OVERFLOW)).toEqual({ left: false, right: true });
  });
  it('shows the edge that has more', () => {
    expect(edgesWithMore(0, 390, 864)).toEqual({ left: false, right: true });
    expect(edgesWithMore(200, 390, 864)).toEqual({ left: true, right: true });
    expect(edgesWithMore(474, 390, 864)).toEqual({ left: true, right: false });
  });
});

describe('playerScrolled', () => {
  it('needs recent input and real movement', () => {
    expect(playerScrolled(1000, null, 0, 300)).toBe(false);
    expect(playerScrolled(5000, 1000, 0, 300)).toBe(false);
    expect(playerScrolled(1200, 1000, 0, MOVED_PX - 1)).toBe(false);
    expect(playerScrolled(1200, 1000, 100, 100 + MOVED_PX)).toBe(true);
    expect(playerScrolled(1200, 1000, 300, 0)).toBe(true);
  });
});

describe('learned maps', () => {
  it('remembers a map once it was scrolled, and only that map', () => {
    expect(isLearned('world-map')).toBe(false);
    markLearned('world-map');
    expect(isLearned('world-map')).toBe(true);
    expect(isLearned('valley')).toBe(false);
  });
});
