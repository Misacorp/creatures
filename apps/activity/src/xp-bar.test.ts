import { describe, expect, it } from 'vitest';
import { xpBarView } from './xp-bar';

describe('xpBarView', () => {
  it('writes "0 / 200 XP" at the start, with nothing filled', () => {
    expect(xpBarView(0, 200)).toEqual({
      pct: 0,
      now: 0,
      max: 200,
      text: '0 / 200 XP',
      filled: false,
    });
  });

  it('fills half and all of the bar', () => {
    expect(xpBarView(100, 200)).toMatchObject({ pct: 50, text: '100 / 200 XP', filled: true });
    expect(xpBarView(200, 200)).toMatchObject({ pct: 100, now: 200, filled: true });
  });

  it('clamps over-full, negative and broken values', () => {
    expect(xpBarView(250, 200)).toMatchObject({ pct: 100, now: 200, text: '200 / 200 XP' });
    expect(xpBarView(-5, 200)).toMatchObject({ pct: 0, now: 0 });
    expect(xpBarView(Number.NaN, 200)).toMatchObject({ pct: 0, now: 0 });
    expect(xpBarView(5, 0)).toMatchObject({ pct: 0, max: 0, now: 0, text: '0 / 0 XP' });
  });

  it('rounds the fill down to one decimal so it never shows more than there is', () => {
    expect(xpBarView(1, 3).pct).toBe(33.3);
    expect(xpBarView(199, 200).pct).toBe(99.5);
  });

  it('takes custom text (for the top rank)', () => {
    expect(xpBarView(10, 10, 'Top rank').text).toBe('Top rank');
  });
});
