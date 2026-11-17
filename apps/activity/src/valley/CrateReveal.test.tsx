/**
 * The sealed crate's reveal (`CrateReveal`): one piece at a time worst first and best last; the Next button, a tap on the stage outside the
 * piece, Enter or Space go on; a tap or hover on the piece shows its item card (a second tap or Escape closes it) and the summary's pieces
 * do the same; Skip and Escape show the summary, the last piece waits for the player, the summary says when the bag was full, and a player
 * who asks for less motion gets just the cards. Drawn in the fake DOM (no layout, no CSS: the look is the valley e2e's and the screenshots').
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CratePiece } from '../api';
import { SAMPLE_GEAR } from '../creature-card-sample';
import type { GearRarity } from '../gear-types';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
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

function draw(answer: CrateOpened = THREE, extra: { onDone?: () => void } = {}): Page {
  const p = createPage();
  page = p;
  p.draw(
    <CrateReveal
      g={g}
      best="epic"
      night
      answer={answer}
      nameOf={(id) => names[id]}
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
const piece_ = (p: Page): FakeElement => {
  const found = byClass(p.root, 'cr-piece')[0];
  if (found === undefined) throw new Error('no piece');
  return found;
};
const nextBtn = (p: Page): FakeElement =>
  byName(p.root, 'button', /^(Next|Show everything)$/)[0] as FakeElement;
const pop = (p: Page): FakeElement | undefined => byClass(p.root, 'cr-pop')[0];
const stage = (p: Page): FakeElement => byClass(p.root, 'cr-stage')[0] as FakeElement;
const counter = (p: Page): string => byClass(p.root, 'cr-count')[0]?.textContent.trim() ?? '';
const summary = (p: Page): FakeElement | undefined => byClass(p.root, 'cr-summary')[0];

describe('the crate reveal: one piece at a time, worst first, best last', () => {
  it('is a modal dialog with the focus on the first card, which is the worst piece', () => {
    const p = draw();
    expect(dialog(p).getAttribute('role')).toBe('dialog');
    expect(dialog(p).getAttribute('aria-modal')).toBe('true');
    expect(counter(p)).toBe('1 / 3');
    const first = piece_(p);
    expect(first.getAttribute('aria-label')).toMatch(/^Rare .*item level 3/);
    expect(p.document.activeElement).toBe(first);
    // The burst of its rarity is drawn, with the item in the middle.
    expect(byClass(first, 'cr-ring')).toHaveLength(1);
    expect(byClass(first, 'cr-item')).toHaveLength(1);
  });

  it('Next goes on piece by piece; the best, with its rarity, is last, then the summary', () => {
    const p = draw();
    p.click(nextBtn(p));
    expect(counter(p)).toBe('2 / 3');
    // A creature put this one on: the card says who.
    expect(visibleText(p.root)).toMatch(/Pip puts it on/);
    p.click(nextBtn(p));
    expect(counter(p)).toBe('3 / 3');
    expect(piece_(p).getAttribute('aria-label')).toMatch(/^Epic /);
    expect(nextBtn(p).textContent).toMatch(/Show everything/);
    expect(summary(p)).toBeUndefined();
    p.click(nextBtn(p));
    expect(card(p)).toBeUndefined();
    expect(summary(p)).toBeDefined();
  });

  it('a tap on the stage outside the piece goes on too, once', () => {
    const p = draw();
    p.click(stage(p));
    expect(counter(p)).toBe('2 / 3');
    p.click(byClass(p.root, 'cr-name')[0] as FakeElement);
    expect(counter(p)).toBe('3 / 3');
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

  it('is the full-screen look: a dark stage with the open crate big at the bottom', () => {
    const p = draw();
    expect(byClass(p.root, 'cr-crate')).toHaveLength(1);
    expect(byClass(p.root, 'cr-dim')).toHaveLength(1);
  });
});

describe('the item card of a piece', () => {
  it("a tap on the piece shows the bag's item card without going on; a second tap closes it", () => {
    const p = draw();
    expect(pop(p)).toBeUndefined();
    p.click(piece_(p));
    expect(counter(p)).toBe('1 / 3');
    expect(pop(p)).toBeDefined();
    expect(byClass(pop(p) as FakeElement, 'idc')).toHaveLength(1);
    expect(piece_(p).getAttribute('aria-expanded')).toBe('true');
    p.click(piece_(p));
    expect(pop(p)).toBeUndefined();
    expect(counter(p)).toBe('1 / 3');
  });

  it('a tap on the card closes it, Escape closes it before it skips', () => {
    const p = draw();
    p.click(piece_(p));
    p.click(pop(p) as FakeElement);
    expect(pop(p)).toBeUndefined();
    p.click(piece_(p));
    p.key(dialog(p), 'Escape');
    expect(pop(p)).toBeUndefined();
    expect(summary(p)).toBeUndefined();
    p.key(dialog(p), 'Escape');
    expect(summary(p)).toBeDefined();
  });

  it('a mouse hovering the piece shows it and leaving hides it; a finger does not hover', () => {
    const p = draw();
    p.pointer(piece_(p), 'pointerenter', { x: 0, y: 0, kind: 'touch' });
    expect(pop(p)).toBeUndefined();
    p.pointer(piece_(p), 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(pop(p)).toBeDefined();
    p.pointer(piece_(p), 'pointerleave', { x: 0, y: 0, kind: 'mouse' });
    expect(pop(p)).toBeUndefined();
  });

  it('going on closes the card, and a stage tap with the card open goes on', () => {
    const p = draw();
    p.click(piece_(p));
    p.click(stage(p));
    expect(counter(p)).toBe('2 / 3');
    expect(pop(p)).toBeUndefined();
  });

  it('shows the card of the piece it belongs to', () => {
    const p = draw();
    p.click(nextBtn(p));
    p.click(piece_(p));
    expect(pop(p)?.getAttribute('aria-label')).toMatch(/item card$/);
    expect(visibleText(pop(p) as FakeElement)).toMatch(/Rare/);
  });

  it('the summary lists every piece as a button that shows its card the same way', () => {
    const p = draw();
    p.key(dialog(p), 'Escape');
    const thumbs = byClass(p.root, 'cr-thumb');
    expect(thumbs).toHaveLength(3);
    p.click(thumbs[0] as FakeElement);
    expect(pop(p)).toBeDefined();
    expect(visibleText(pop(p) as FakeElement)).toMatch(/Epic/);
    p.click(thumbs[0] as FakeElement);
    expect(pop(p)).toBeUndefined();
    p.pointer(thumbs[1] as FakeElement, 'pointerenter', { x: 0, y: 0, kind: 'mouse' });
    expect(pop(p)).toBeDefined();
    p.pointer(thumbs[1] as FakeElement, 'pointerleave', { x: 0, y: 0, kind: 'mouse' });
    expect(pop(p)).toBeUndefined();
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

  it('does not move on by itself while a card is shown', () => {
    stubMotion(false);
    const p = draw();
    p.click(piece_(p));
    p.update(() => {
      vi.advanceTimersByTime(CARD_AUTO_MS * 3);
    });
    expect(counter(p)).toBe('1 / 3');
    p.click(piece_(p));
    p.update(() => {
      vi.advanceTimersByTime(CARD_AUTO_MS + 10);
    });
    expect(counter(p)).toBe('2 / 3');
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
