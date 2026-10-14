import { describe, expect, it } from 'vitest';
import { placePopover, popoverCoords, type Box } from './popover-place';

describe('placePopover', () => {
  const bounds: Box = { left: 0, top: 0, width: 280, height: 600 };
  const size = { width: 200, height: 110 };
  const anchor = (left: number, top: number): Box => ({ left, top, width: 40, height: 60 });

  it('goes above the creature, centred on it, when there is room', () => {
    const at = placePopover(anchor(120, 300), bounds, size);
    expect(at.placement).toBe('above');
    expect(at.y).toBe(-(size.height + 6));
    // The anchor's centre is 140, so the popover starts 100 to the left of it, and the arrow points at it.
    expect(at.x + 120).toBe(140 - 100);
    expect(at.arrowX).toBe(100);
  });

  it('flips below when there is no room above', () => {
    const at = placePopover(anchor(100, 40), bounds, size);
    expect(at.placement).toBe('below');
    expect(at.y).toBe(60 + 6);
  });

  it('stays inside the bounds at both sides, with a margin, and keeps the arrow on the creature', () => {
    const left = placePopover(anchor(0, 300), bounds, size);
    expect(left.x).toBe(4);
    expect(left.arrowX).toBe(20 - 4);
    const right = placePopover(anchor(240, 300), bounds, size);
    expect(right.x + 240 + size.width).toBe(280 - 4);
    expect(right.arrowX).toBeLessThanOrEqual(size.width - 10);
    expect(right.arrowX).toBeGreaterThanOrEqual(10);
  });

  it('keeps the arrow inside the popover when the anchor is at the very edge', () => {
    const at = placePopover({ left: 276, top: 300, width: 4, height: 20 }, bounds, size);
    expect(at.arrowX).toBe(size.width - 10);
  });

  it('starts at the bounds edge when the popover is wider than the bounds', () => {
    const narrow: Box = { left: 10, top: 0, width: 150, height: 600 };
    const at = placePopover(anchor(60, 300), narrow, size);
    expect(60 + at.x).toBe(10);
  });

  it('is clamped into the bounds when neither side has room', () => {
    const small: Box = { left: 0, top: 0, width: 280, height: 160 };
    const at = placePopover(anchor(100, 50), small, size);
    expect(50 + at.y).toBeGreaterThanOrEqual(0);
    expect(50 + at.y + size.height).toBeLessThanOrEqual(160);
    // More room below the anchor (50 above, 50 below is a tie, so below).
    expect(at.placement).toBe('below');
    const low = placePopover(anchor(100, 100), small, size);
    expect(low.placement).toBe('above');
  });

  it('works in any coordinate space (the bounds need not start at zero)', () => {
    const shifted: Box = { left: 500, top: 300, width: 280, height: 600 };
    const at = placePopover(anchor(520, 520), shifted, size);
    expect(520 + at.x).toBeGreaterThanOrEqual(500);
    expect(520 + at.x + size.width).toBeLessThanOrEqual(780);
    expect(at.placement).toBe('above');
  });
});

describe('popoverCoords', () => {
  const size = { width: 200, height: 110 };

  it('measures from the container, not from the viewport', () => {
    // A container 500 px from the left and 300 from the top, an anchor 40 px into it.
    const container: Box = { left: 500, top: 300, width: 280, height: 600 };
    const anchor: Box = { left: 540, top: 520, width: 40, height: 60 };
    const at = popoverCoords(anchor, container, size);
    expect(at.placement).toBe('above');
    // Centred on the anchor (centre 560 in the viewport, 60 in the container), so 100 to its left,
    // which is outside the container: slid to the 4 px margin.
    expect(at.x).toBe(4);
    expect(at.y).toBe(520 - 6 - 110 - 300);
    expect(at.arrow).toBe(60 - 4);
  });

  it('rounds to whole pixels', () => {
    const container: Box = { left: 0, top: 0, width: 280, height: 600 };
    const at = popoverCoords({ left: 100.4, top: 300.2, width: 40.3, height: 60 }, container, size);
    expect(Number.isInteger(at.x)).toBe(true);
    expect(Number.isInteger(at.y)).toBe(true);
    expect(Number.isInteger(at.arrow)).toBe(true);
  });

  it('keeps a popover at the right and bottom edge of a 360 px window on screen', () => {
    const window360: Box = { left: 0, top: 0, width: 360, height: 640 };
    const corner: Box = { left: 330, top: 600, width: 28, height: 28 };
    const at = popoverCoords(corner, window360, { width: 272, height: 200 });
    expect(at.x + 272).toBeLessThanOrEqual(360 - 4);
    expect(at.x).toBeGreaterThanOrEqual(4);
    expect(at.y).toBeGreaterThanOrEqual(0);
    expect(at.y + 200).toBeLessThanOrEqual(640);
    expect(at.placement).toBe('above');
  });

  it('flips below an anchor at the top of the window', () => {
    const window360: Box = { left: 0, top: 0, width: 360, height: 640 };
    const at = popoverCoords({ left: 10, top: 8, width: 28, height: 28 }, window360, {
      width: 272,
      height: 200,
    });
    expect(at.placement).toBe('below');
    expect(at.y).toBe(8 + 28 + 6);
    expect(at.x).toBe(4);
  });
});
