import { expToNext } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceView, XpBoost } from '../experience';
import { ExperienceGainRow } from '../ExperienceGainRow';
import { PopoverHost } from '../PopoverHost';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  FakeElement,
  type Page,
} from '../test-dom';
import { experienceGain, explorerGain } from '../xp-gain';
import { countEnd, countSteps } from '../xp-count';
import { XpGain, XpList } from './XpGain';

/**
 * The shared "XP gained" row (decisions.md 2026-10-19, "Count-up"): the bar counts up from the old value to
 * the new one, a level crossed fills the old bar and starts the new one, reduced motion shows the end at once,
 * and the multiplier is a chip and the melon slice that open the breakdown. Never a sentence about it.
 */

let page: Page | null = null;

function motion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const TREAT: XpBoost = { parts: [{ source: 'treat', name: 'Treat', times: 2 }], totalBp: 20_000 };
const HEARTY: XpBoost = {
  parts: [{ source: 'day', name: 'Hearty Breakfast', bp: 2500 }],
  totalBp: 12_500,
};
const SEVERAL: XpBoost = {
  parts: [
    { source: 'treat', name: 'Treat', times: 3 },
    { source: 'day', name: 'Hearty Breakfast', bp: 2500 },
    { source: 'day', name: 'Cold Snap', bp: -2000 },
  ],
  totalBp: 31_500,
};

/** Zipmouse's dismantle: +16 at level 7 (174 / 273), or +60 over level 7 into level 8 (37 / 328). */
function paid(over: Partial<ExperienceView> = {}): ExperienceView {
  return {
    creatureId: 'z',
    gained: 16,
    treat: false,
    levelBefore: 7,
    level: 7,
    exp: 174,
    needed: expToNext(7),
    waiting: false,
    gold: false,
    ...over,
  };
}

const LEVEL_UP = paid({ gained: 60, levelBefore: 7, level: 8, exp: 37, needed: expToNext(8) });

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function draw(view: ExperienceView, host = false): Page {
  page = createPage();
  const row = (
    <XpList label="Progress">
      <ExperienceGainRow gain={experienceGain(view, 'Zipmouse')} />
    </XpList>
  );
  page.draw(host ? <PopoverHost onOpenHowTo={() => undefined}>{row}</PopoverHost> : row);
  return page;
}

/** The breakdown's lines, each as "name value". */
const breakdown = (dialog: FakeElement): string[] =>
  byClass(dialog, 'xp-boost-line').map((line) =>
    find(line, (el) => el.localName === 'dt' || el.localName === 'dd')
      .map(visibleText)
      .join(' '),
  );

const barText = (p: Page): string => visibleText(first(byClass(p.root, 'xp-text')));
const levelTag = (p: Page): string => visibleText(first(byClass(p.root, 'xp-lv')));
const levelUpShown = (p: Page): boolean =>
  byClass(p.root, 'up').some((el) => (el.getAttribute('class') ?? '').includes('shown'));

describe('the count-up', () => {
  it('shows the end at once when the player prefers reduced motion', () => {
    motion(true);
    const p = draw(paid());
    expect(barText(p)).toBe('174 / 273');
    expect(levelTag(p)).toBe('Lv 7');
    expect(visibleText(first(byClass(p.root, 'xp-plus')))).toBe('+16');
    expect(first(byClass(p.root, 'xp-plus')).getAttribute('class')).toContain('done');
    // The bar says where it is now to a screen reader, whatever the count shows.
    const bar = first(byRole(p.root, 'progressbar'));
    expect(bar.getAttribute('aria-valuenow')).toBe('174');
    expect(bar.getAttribute('aria-valuetext')).toBe('174 / 273, +16');
  });

  it('starts at the old value and counts up to the new one', () => {
    motion(false);
    vi.useFakeTimers();
    const p = draw(paid());
    expect(barText(p)).toBe('158 / 273');
    p.update(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(barText(p)).toBe('174 / 273');
  });

  it('fills the old level, then the new level takes the rest, and Level up! shows then', () => {
    motion(false);
    vi.useFakeTimers();
    const p = draw(LEVEL_UP);
    // 60 gained: 23 to finish level 7 (250 to 273), 37 into level 8.
    expect(levelTag(p)).toBe('Lv 7');
    expect(barText(p)).toBe(`${String(expToNext(7) - 23)} / ${String(expToNext(7))}`);
    expect(levelUpShown(p)).toBe(false);
    p.update(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(levelTag(p)).toBe('Lv 8');
    expect(barText(p)).toBe(`37 / ${String(expToNext(8))}`);
    expect(levelUpShown(p)).toBe(true);
    expect(visibleText(p.root)).toContain('Lv 7 → 8');
  });

  it('plays the old bar to its top, a flash, then the new bar, and ends where the server says', () => {
    const change = experienceGain(LEVEL_UP, 'Zipmouse');
    const steps = countSteps(change);
    const flash = steps.findIndex((s) => s.state.flash);
    expect(steps[flash]?.state).toEqual({ leg: 0, value: expToNext(7), flash: true });
    expect(steps.slice(flash + 1).every((s) => s.state.leg === 1)).toBe(true);
    expect(steps.at(-1)?.state).toEqual(countEnd(change));
    expect(countEnd(change)).toEqual({ leg: 1, value: 37, flash: false });
    // Every step is later than the one before.
    expect(steps.every((s, i) => i === 0 || s.at > (steps[i - 1]?.at ?? 0))).toBe(true);
  });

  it('says Rank up! for the explorer rank', () => {
    motion(true);
    page = createPage();
    page.draw(
      <XpList>
        <XpGain
          change={explorerGain({
            gained: 300,
            rank: 4,
            rankBefore: 3,
            value: 60,
            max: 1500,
            name: 'S',
          })}
          what="Explorer XP"
          label="Explorer"
        />
      </XpList>,
    );
    expect(visibleText(page.root)).toContain('Rank 3 → 4');
    expect(visibleText(page.root)).toContain('Rank up!');
    expect(levelTag(page)).toBe('Rank 4');
  });
});

describe('the multiplier', () => {
  beforeEach(() => {
    // The little the fake DOM leaves out that the popover asks a browser for (its place on the page).
    vi.stubGlobal('window', {
      innerHeight: 800,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({
      top: 0,
      left: 0,
      width: 10,
      height: 10,
    }));
  });

  afterEach(() => {
    Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
  });

  it('shows nothing when nothing changed the gain', () => {
    motion(true);
    const p = draw(paid());
    expect(byClass(p.root, 'xp-boost')).toHaveLength(0);
  });

  it('a treat: the ×2 chip and the melon slice, no number on the melon', () => {
    motion(true);
    const p = draw(paid({ treat: true, boost: TREAT }), true);
    const button = first(byClass(p.root, 'xp-boost'));
    expect(button.localName).toBe('button');
    expect(visibleText(first(byClass(button, 'xp-times')))).toBe('×2');
    expect(byClass(button, 'xp-treat')).toHaveLength(1);
    expect(button.getAttribute('aria-label')).toBe('Experience ×2: Treat ×2. What changed it?');
  });

  it('a day without a treat: the chip alone', () => {
    motion(true);
    const p = draw(paid({ boost: HEARTY }), true);
    const button = first(byClass(p.root, 'xp-boost'));
    expect(visibleText(first(byClass(button, 'xp-times')))).toBe('×1.25');
    expect(byClass(button, 'xp-treat')).toHaveLength(0);
  });

  it('opens the breakdown: each part, then the total', () => {
    motion(true);
    const p = draw(paid({ treat: true, boost: SEVERAL }), true);
    p.click(first(byClass(p.root, 'xp-boost')));
    const dialog = first(byRole(p.root.parentNode ?? p.root, 'dialog'));
    expect(breakdown(dialog)).toEqual([
      'Treat ×3',
      'Hearty Breakfast +25%',
      'Cold Snap -20%',
      'Total ×3.15',
    ]);
    expect(dialog.getAttribute('aria-label')).toBe('What changed the experience');
    expect(first(byClass(p.root, 'xp-boost')).getAttribute('aria-expanded')).toBe('true');
  });

  it('never writes a sentence about what changed it, also for a run from before the breakdown', () => {
    motion(true);
    const p = draw(
      paid({ treat: true, treatTimes: 2, dayEffects: [{ name: 'Cold Snap', bp: -2000 }] }),
      true,
    );
    const text = visibleText(p.root);
    expect(text).not.toMatch(/gave|Treat|experience\s*$/);
    expect(find(p.root, (el) => el.localName === 'p')).toHaveLength(0);
    // The old fields still reach the breakdown.
    p.click(first(byName(p.root, 'button', /What changed it/)));
    const dialog = first(byRole(p.root.parentNode ?? p.root, 'dialog'));
    expect(breakdown(dialog)).toEqual(['Treat ×2', 'Cold Snap -20%', 'Total ×1.6']);
  });
});
