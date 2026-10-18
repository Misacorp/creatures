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
      fromPct: 100,
      hasGain: false,
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

  it('marks the part just gained: the fill before it ends where the gain starts', () => {
    // 120 of 200 held, 30 of it just earned: the old part is 90 of the 120 filled.
    expect(xpBarView(120, 200, undefined, 30)).toMatchObject({ hasGain: true, fromPct: 75 });
    // Everything in the bar is new (a level was reached): the old part is empty.
    expect(xpBarView(40, 200, undefined, 40)).toMatchObject({ hasGain: true, fromPct: 0 });
    // A gain bigger than the bar, or none, or a broken one, stays inside it.
    expect(xpBarView(40, 200, undefined, 500)).toMatchObject({ hasGain: true, fromPct: 0 });
    expect(xpBarView(40, 200, undefined, 0)).toMatchObject({ hasGain: false, fromPct: 100 });
    expect(xpBarView(40, 200, undefined, Number.NaN)).toMatchObject({ hasGain: false });
  });

  it('takes custom text (for the top rank)', () => {
    expect(xpBarView(10, 10, 'Top rank').text).toBe('Top rank');
  });
});
