import { describe, expect, it } from 'vitest';
import { PLACES, VALLEY_SIZE } from './valley-art';
import { cameraScroll, fitValley, scrollToPlace } from './valley-logic';

describe('the camera of a zoomed valley', () => {
  const view = { width: 1440, height: 780 };
  const fit = fitValley(view.width, view.height, 4);

  it('pans both ways when the valley is bigger than the window at a bigger scale', () => {
    expect(fit.pans).toBe(true);
    const arena = cameraScroll('arena', view, 4, fit.top);
    const signpost = cameraScroll('signpost', view, 4, fit.top);
    expect(arena.left).toBe(scrollToPlace('arena', view.width, 4));
    expect(signpost.top).toBeGreaterThan(arena.top);
  });

  it('frames a place: its middle is in the window for every place', () => {
    for (const place of PLACES) {
      const to = cameraScroll(place.id, view, 4, fit.top);
      const middleX = (place.rect.x + place.rect.width / 2) * 4;
      const middleY = (place.rect.y + place.rect.height / 2) * 4 + fit.top;
      expect(middleX).toBeGreaterThanOrEqual(to.left);
      expect(middleX).toBeLessThanOrEqual(to.left + view.width);
      expect(middleY).toBeGreaterThanOrEqual(to.top);
      expect(middleY).toBeLessThanOrEqual(to.top + view.height);
    }
  });

  it('never scrolls past the valley', () => {
    for (const place of PLACES) {
      const to = cameraScroll(place.id, view, 4, fit.top);
      expect(to.top).toBeGreaterThanOrEqual(0);
      expect(to.top).toBeLessThanOrEqual(VALLEY_SIZE.height * 4 + fit.top - view.height);
    }
  });

  it('does not scroll up or down at the usual scale (a phone sees the full height)', () => {
    expect(cameraScroll('arena', { width: 390, height: 600 }, 2, -32).top).toBe(0);
  });
});
