import { describe, expect, it } from 'vitest';
import { MIN_VISIBLE_PX, arriveScroll, shouldFocusCard, shouldScrollToCard } from './reveal-arrive';

describe('scrolling to a reveal card', () => {
  const height = 800;

  it('scrolls when the card is above the screen', () => {
    expect(shouldScrollToCard(-1, height)).toBe(true);
    expect(shouldScrollToCard(-2000, height)).toBe(true);
  });

  it('scrolls when the card is below the screen, or only its very edge shows', () => {
    expect(shouldScrollToCard(height, height)).toBe(true);
    expect(shouldScrollToCard(height + 500, height)).toBe(true);
    expect(shouldScrollToCard(height - MIN_VISIBLE_PX + 1, height)).toBe(true);
  });

  it('leaves the page alone when the top of the card is already on screen', () => {
    expect(shouldScrollToCard(0, height)).toBe(false);
    expect(shouldScrollToCard(120, height)).toBe(false);
    expect(shouldScrollToCard(height - MIN_VISIBLE_PX, height)).toBe(false);
  });

  it('goes smoothly with the top of the card at the top, or at once with reduced motion', () => {
    expect(arriveScroll(false)).toEqual({ behavior: 'smooth', block: 'start' });
    expect(arriveScroll(true)).toEqual({ behavior: 'auto', block: 'start' });
  });
});

describe('focusing a reveal card', () => {
  const page = {};

  it('takes focus when nothing has it, or what had it left the page', () => {
    expect(shouldFocusCard(null, page)).toBe(true);
    expect(shouldFocusCard(page as { isConnected: boolean }, page)).toBe(true);
    expect(shouldFocusCard({ isConnected: false }, page)).toBe(true);
  });

  it('leaves focus on an element that is still on the page (the tab that was just used)', () => {
    expect(shouldFocusCard({ isConnected: true }, page)).toBe(false);
  });
});
