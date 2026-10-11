import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_MS,
  FIGHT_FLASH_MS,
  countdownClasses,
  countdownView,
  nextCountdownChange,
  spokenCountdown,
  tierOf,
  type CountdownView,
} from './countdown';

const count = (n: number): CountdownView => countdownView(n * 1000 - 1);

describe('countdownView', () => {
  it('shows nothing before the last 30 seconds, and the lobby stays as it is', () => {
    expect(countdownView(COUNTDOWN_MS + 1)).toBeNull();
    expect(countdownView(5 * 60_000)).toBeNull();
    expect(countdownView(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('starts at 30 and rounds up, so 1 shows until the very start', () => {
    expect(countdownView(COUNTDOWN_MS)).toEqual({ phase: 'count', n: 30, tier: 'calm' });
    expect(countdownView(29_001)).toEqual({ phase: 'count', n: 30, tier: 'calm' });
    expect(countdownView(29_000)).toEqual({ phase: 'count', n: 29, tier: 'calm' });
    expect(countdownView(1_001)).toEqual({ phase: 'count', n: 2, tier: 'final' });
    expect(countdownView(1)).toEqual({ phase: 'count', n: 1, tier: 'final' });
  });

  it('says FIGHT! at 0 for a moment, then hands over to the stage', () => {
    expect(countdownView(0)).toEqual({ phase: 'fight' });
    expect(countdownView(-FIGHT_FLASH_MS + 1)).toEqual({ phase: 'fight' });
    expect(countdownView(-FIGHT_FLASH_MS)).toBeNull();
    expect(countdownView(-60_000)).toBeNull();
  });

  it('counts every number from 30 to 1 once, in order', () => {
    const seen: number[] = [];
    for (let ms = COUNTDOWN_MS; ms > 0; ms -= 250) {
      const view = countdownView(ms);
      if (view?.phase === 'count' && seen.at(-1) !== view.n) seen.push(view.n);
    }
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => 30 - i));
  });
});

describe('the tiers', () => {
  it('is calm from 30 to 11, fast from 10 to 6 and final from 5 to 1', () => {
    for (let n = 30; n >= 11; n--) expect(tierOf(n), String(n)).toBe('calm');
    for (let n = 10; n >= 6; n--) expect(tierOf(n), String(n)).toBe('fast');
    for (let n = 5; n >= 1; n--) expect(tierOf(n), String(n)).toBe('final');
  });

  it('gives the fast and final seconds a class of their own, which the stylesheet colours and sizes', () => {
    const classes = (n: number) => countdownClasses(count(n) as Exclude<CountdownView, null>);
    expect(classes(30)).toBe('cd-count cd-calm');
    expect(classes(11)).toBe('cd-count cd-calm');
    expect(classes(10)).toBe('cd-count cd-fast cd-n10');
    expect(classes(6)).toBe('cd-count cd-fast cd-n6');
    expect(classes(5)).toBe('cd-count cd-final cd-n5');
    expect(classes(1)).toBe('cd-count cd-final cd-n1');
    expect(countdownClasses({ phase: 'fight' })).toBe('cd-fight');
  });
});

describe('nextCountdownChange', () => {
  it('waits for the last 30 seconds to begin', () => {
    expect(nextCountdownChange(5 * 60_000)).toBe(5 * 60_000 - COUNTDOWN_MS);
    expect(nextCountdownChange(COUNTDOWN_MS + 1)).toBe(1);
  });

  it('wakes at the next whole second, never later than a second away', () => {
    expect(nextCountdownChange(COUNTDOWN_MS)).toBe(1000);
    expect(nextCountdownChange(29_400)).toBe(400);
    expect(nextCountdownChange(1_000)).toBe(1000);
    expect(nextCountdownChange(1)).toBe(1);
  });

  it('shows FIGHT! until its time is up, and then never changes again', () => {
    expect(nextCountdownChange(0)).toBe(FIGHT_FLASH_MS);
    expect(nextCountdownChange(-200)).toBe(FIGHT_FLASH_MS - 200);
    expect(nextCountdownChange(-FIGHT_FLASH_MS)).toBeNull();
  });

  it('changes what is shown at the moment it says (the view differs just after each wake-up)', () => {
    for (const remaining of [30_000, 17_250, 10_001, 5_500, 1_999, 1]) {
      const wait = nextCountdownChange(remaining) as number;
      expect(countdownView(remaining - wait - 1), String(remaining)).not.toEqual(
        countdownView(remaining),
      );
    }
  });
});

describe('spokenCountdown', () => {
  it('speaks at 30, 20, 10 and 5 seconds and at the start, and is quiet in between', () => {
    expect(spokenCountdown(null)).toBe('');
    const said = new Set<string>();
    let changes = 0;
    let last = '';
    for (let n = 30; n >= 1; n--) {
      const text = spokenCountdown(count(n));
      said.add(text);
      if (text !== last) changes++;
      last = text;
    }
    expect(said).toEqual(
      new Set([
        'The fight starts in 30 seconds',
        'The fight starts in 20 seconds',
        'The fight starts in 10 seconds',
        'The fight starts in 5 seconds',
      ]),
    );
    expect(changes).toBe(4);
    expect(spokenCountdown({ phase: 'fight' })).toBe('The fight starts now');
  });
});
