/**
 * The sealed crate's reveal (`CrateReveal`): one piece at a time worst first and best last, a tap, Enter or Space goes on, Skip and Escape show
 * the summary, the last piece waits for the player, the summary says when the bag was full, and a player who asks for less motion gets just
 * the cards. Drawn in the fake DOM (no layout, no CSS: the look is the valley e2e's and the screenshots').
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CratePiece } from '../api';
import { SAMPLE_GEAR } from '../creature-card-sample';
import type { GearRarity } from '../gear-types';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import type { RevealVariant } from './art-variants';
import { CrateReveal } from './CrateReveal';
import { CARD_AUTO_MS, type CrateOpened } from './crate-view';
import { sceneGeometry } from './SceneFrame';

const BASE = SAMPLE_GEAR.items[0];
if (BASE === undefined) throw new Error('fixture');

const piece = (
  id: string,
  rarity: GearRarity,
  itemLevel: number,
  wornBy: string | null = null,
): CratePiece => ({ item: { ...BASE, id, rarity, itemLevel }, wornBy, madeBy: 'c-1' });

const THREE: CrateOpened = {
  pieces: [piece('a', 'rare', 3), piece('b', 'rare', 9, 'c-2'), piece('c', 'epic', 4)],
  sealed: 0,
  bagFull: false,
};

const names: Record<string, string> = { 'c-1': 'Sprig', 'c-2': 'Pip' };
const g = sceneGeometry(390, 700, 3);
const crate = { x: 102, y: 105, w: 20, h: 18 };

let page: Page | null = null;
/** Whether the player asks for less motion (the fake DOM has no `matchMedia`: this gives it one for the reduced-motion query only). */
function stubMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
beforeEach(() => {
  vi.useFakeTimers();
  stubMotion(true);
});
afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function draw(
  answer: CrateOpened = THREE,
  extra: { variant?: RevealVariant; onDone?: () => void } = {},
): Page {
  const p = createPage();
  page = p;
  p.draw(
    <CrateReveal
      g={g}
      crate={crate}
      best="epic"
      night
      answer={answer}
      variant={extra.variant ?? 'B'}
      look="A"
      nameOf={(id) => names[id]}
      flyTo={() => ({ x: 10, y: 10 })}
      onDone={extra.onDone ?? (() => undefined)}
    />,
  );
  return p;
}

const dialog = (p: Page): FakeElement => {
  const found = byClass(p.root, 'cr-reveal')[0];
  if (found === undefined) throw new Error('no reveal');
  return found;
};
const card = (p: Page): FakeElement | undefined => byClass(p.root, 'cr-card')[0];
const counter = (p: Page): string => byClass(p.root, 'cr-count')[0]?.textContent.trim() ?? '';
const summary = (p: Page): FakeElement | undefined => byClass(p.root, 'cr-summary')[0];

describe('the crate reveal: one piece at a time, worst first, best last', () => {
  it('is a modal dialog with the focus on the first card, which is the worst piece', () => {
    const p = draw();
    expect(dialog(p).getAttribute('role')).toBe('dialog');
    expect(dialog(p).getAttribute('aria-modal')).toBe('true');
    expect(counter(p)).toBe('1 / 3');
    const first = card(p) as FakeElement;
    expect(first.getAttribute('aria-label')).toMatch(/^Rare .*item level 3/);
    expect(p.document.activeElement).toBe(first);
    // The burst of its rarity is drawn, with the item in the middle.
    expect(byClass(first, 'cr-ring')).toHaveLength(1);
    expect(byClass(first, 'cr-item')).toHaveLength(1);
  });

  it('a tap goes on piece by piece; the best, with its rarity, is last, then the summary', () => {
    const p = draw();
    p.click(card(p) as FakeElement);
    expect(counter(p)).toBe('2 / 3');
    // A creature put this one on: the card says who.
    expect(visibleText(p.root)).toMatch(/Pip puts it on/);
    p.click(card(p) as FakeElement);
    expect(counter(p)).toBe('3 / 3');
    expect((card(p) as FakeElement).getAttribute('aria-label')).toMatch(/^Epic .*Show everything$/);
    expect(summary(p)).toBeUndefined();
    p.click(card(p) as FakeElement);
    expect(card(p)).toBeUndefined();
    expect(summary(p)).toBeDefined();
  });

  it('Enter and Space on the dialog go on too', () => {
    const p = draw();
    p.key(dialog(p), 'Enter');
    expect(counter(p)).toBe('2 / 3');
    p.key(dialog(p), ' ');
    expect(counter(p)).toBe('3 / 3');
  });

  it('Skip shows the summary at once, with everything the crate held', () => {
    const p = draw();
    const skip = byName(p.root, 'button', 'Skip')[0] as FakeElement;
    p.click(skip);
    const sum = summary(p) as FakeElement;
    expect(sum.textContent).toMatch(/The crate held 3 pieces/);
    expect(sum.textContent).toMatch(/1 epic, 2 rare/);
    expect(sum.textContent).toMatch(/1 was put on at once/);
    expect(byClass(sum, 'item-frame')).toHaveLength(3);
    // No Skip once there is nothing to skip.
    expect(byName(p.root, 'button', 'Skip')).toHaveLength(0);
  });

  it('Escape skips; on the summary it closes', () => {
    const done = vi.fn();
    const p = draw(THREE, { onDone: done });
    p.key(dialog(p), 'Escape');
    expect(summary(p)).toBeDefined();
    expect(done).not.toHaveBeenCalled();
    p.key(dialog(p), 'Escape');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('the Done button closes the summary', () => {
    const done = vi.fn();
    const p = draw(THREE, { onDone: done });
    p.key(dialog(p), 'Escape');
    p.click(byName(p.root, 'button', 'Done')[0] as FakeElement);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('says so when the bag is full and some pieces stay sealed', () => {
    const p = draw({ pieces: [piece('a', 'rare', 3)], sealed: 2, bagFull: true });
    p.key(dialog(p), 'Escape');
    expect(summary(p)?.textContent).toMatch(/The bag is full, 2 stay sealed\./);
  });

  it('an empty answer goes straight to a summary of nothing', () => {
    const p = draw({ pieces: [], sealed: 0, bagFull: false });
    expect(card(p)).toBeUndefined();
    expect(summary(p)?.textContent).toMatch(/The crate held 0 pieces/);
  });

  it('shows the same cards in every variant (in the scene, full screen, with flight)', () => {
    for (const variant of ['A', 'B', 'C', 'D'] as const) {
      const p = draw(THREE, { variant });
      expect(counter(p)).toBe('1 / 3');
      expect(byClass(p.root, 'cr-reveal')[0]?.getAttribute('class')).toMatch(
        variant === 'B' || variant === 'D' ? /cr-full/ : /cr-v-[AC]/,
      );
      p.unmount();
    }
    page = null;
  });
});

describe('the pause', () => {
  it('moves a card on by itself, but never the last, which is the best', () => {
    stubMotion(false);
    const p = draw();
    p.update(() => {
      vi.advanceTimersByTime(CARD_AUTO_MS + 10);
    });
    expect(counter(p)).toBe('2 / 3');
    p.update(() => {
      vi.advanceTimersByTime(CARD_AUTO_MS + 10);
    });
    expect(counter(p)).toBe('3 / 3');
    p.update(() => {
      vi.advanceTimersByTime(CARD_AUTO_MS * 3);
    });
    expect(counter(p)).toBe('3 / 3');
    expect(summary(p)).toBeUndefined();
  });

  it('does not move on by itself for a player who asks for less motion', () => {
    stubMotion(true);
    const p = draw();
    p.update(() => {
      vi.advanceTimersByTime(CARD_AUTO_MS * 3);
    });
    expect(counter(p)).toBe('1 / 3');
  });
});
