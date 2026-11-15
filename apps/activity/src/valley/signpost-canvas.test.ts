import { describe, expect, it } from 'vitest';
import { sceneGeometry } from './SceneFrame';
import {
  CELL_H,
  contentHeight,
  fullPackCount,
  seatLabel,
  signpostLayout,
  signpostScale,
} from './signpost-canvas';
import { sampleSeat } from './signpost-sample';

describe('the Signpost scene layout', () => {
  it('stands the cells in a row under the art, centred, with the props under them and nothing overlapping', () => {
    const g = sceneGeometry(390, 640, signpostScale(390, 640));
    const lay = signpostLayout(g, 3);
    expect(lay.cells).toHaveLength(3);
    const row = lay.cells[0]?.y ?? 0;
    expect(row).toBeGreaterThanOrEqual(lay.art.y + lay.art.height);
    for (const [i, cell] of lay.cells.entries()) {
      expect(cell.y).toBe(row);
      const next = lay.cells[i + 1];
      if (next !== undefined) expect(next.x).toBeGreaterThanOrEqual(cell.x + cell.w);
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.w).toBeLessThanOrEqual(g.W);
    }
    expect(lay.crate.y).toBeGreaterThanOrEqual(row + CELL_H);
    expect(lay.plans.x).toBeGreaterThan(lay.crate.x);
    expect(lay.plans.y + 16).toBeLessThanOrEqual(g.H);
  });

  it('seven slots still fit across a phone', () => {
    const g = sceneGeometry(390, 640, signpostScale(390, 640));
    const lay = signpostLayout(g, 7);
    const last = lay.cells[6];
    expect(last === undefined ? 0 : last.x + last.w).toBeLessThanOrEqual(g.W);
  });

  it('the scale is 3 on a phone, 4 wide, and steps down (never under 2) when the room is short', () => {
    expect(signpostScale(390, 800)).toBe(3);
    expect(signpostScale(1100, 1000)).toBe(4);
    expect(signpostScale(1100, (contentHeight() + 6) * 3 - 1)).toBeLessThan(4);
    expect(signpostScale(1100, 100)).toBe(2);
  });

  it('counts the full packs and names a seat for assistive technology', () => {
    expect(
      fullPackCount([
        sampleSeat('a', 'x', 'c1', 80),
        sampleSeat('b', 'x', null, 80),
        sampleSeat('c', 'x', 'c2', 5),
      ]),
    ).toBe(1);
    expect(seatLabel(2, undefined, '', '')).toBe('Seat 2: nobody posted. Choose a scout');
    expect(seatLabel(1, { name: 'Mossy', level: 4 }, 'Tidepools', 'Pack full')).toBe(
      'Seat 1: Mossy, level 4, scouting Tidepools. Pack full. Open the seat',
    );
  });
});
