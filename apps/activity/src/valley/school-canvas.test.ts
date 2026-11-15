import { describe, expect, it } from 'vitest';
import { SCALE_MAX, SCALE_MIN } from './bonfire-canvas';
import { CORNER } from './builders-corner';
import { PLATE_ROW_PX } from './place-plates';
import { sceneGeometry } from './SceneFrame';
import {
  ART_Y,
  STAGE_AT,
  schoolArt,
  STAGE_BOTTOM,
  STAGE_BOX,
  SEATS_FEET,
  YARD_BOTTOM,
  YARD_LEFT,
  YARD_RIGHT,
  lecternBox,
  modeFor,
  schoolLayout,
  schoolScale,
  schoolSceneDraw,
  seatBox,
} from './school-canvas';

const SIZES: [number, number][] = [
  [360, 600],
  [390, 700],
  [390, 780],
  [700, 600],
  [1100, 700],
  [1100, 780],
  [1440, 800],
  [1920, 1000],
];

const geometry = (width: number, height: number, corner: boolean) =>
  sceneGeometry(width, height, schoolScale(width, height, corner));

const each = (check: (w: number, h: number, corner: boolean) => void): void => {
  for (const [w, h] of SIZES) for (const corner of [false, true]) check(w, h, corner);
};

describe('the School canvas: the scale', () => {
  it('is a whole number from the phone’s to the biggest, and a taller window never gets a smaller one', () => {
    each((w, h, corner) => {
      const s = schoolScale(w, h, corner);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(s).toBeLessThanOrEqual(SCALE_MAX);
      expect(schoolScale(w, h + 300, corner)).toBeGreaterThanOrEqual(s);
    });
  });

  it('fills a laptop: bigger than the old band, which was 4 at most', () => {
    expect(schoolScale(1440, 800, false)).toBeGreaterThanOrEqual(6);
    expect(schoolScale(1100, 780, true)).toBeGreaterThanOrEqual(5);
  });

  it('the corner goes beside the yard on a wide window and under it on a phone', () => {
    expect(modeFor(130, true)).toBe('below');
    expect(modeFor(260, true)).toBe('beside');
    expect(modeFor(130, false)).toBe('none');
    expect(modeFor(500, false)).toBe('none');
  });
});

describe('the School canvas: the layout', () => {
  it('keeps the School, its yard and the corner inside the scene, and the corner clear of the yard', () => {
    each((w, h, corner) => {
      const g = geometry(w, h, corner);
      const lay = schoolLayout(g, corner);
      const name = `${String(w)}x${String(h)} ${corner ? 'corner' : 'no corner'}`;
      expect(lay.box.y, name).toBeGreaterThanOrEqual(ART_Y);
      expect(lay.box.x + YARD_LEFT, name).toBeGreaterThanOrEqual(0);
      expect(lay.box.x + YARD_RIGHT, name).toBeLessThanOrEqual(g.W);
      expect(lay.box.y + STAGE_BOTTOM, name).toBeLessThanOrEqual(g.H);
      expect(lay.mode === 'none', name).toBe(!corner);
      if (lay.corner === null) return;
      if (g.s > SCALE_MIN) {
        expect(lay.corner.x, name).toBeGreaterThanOrEqual(0);
        expect(lay.corner.x + CORNER.w, name).toBeLessThanOrEqual(g.W);
        expect(
          lay.corner.y + CORNER.feet + Math.ceil(PLATE_ROW_PX / g.s),
          name,
        ).toBeLessThanOrEqual(g.H);
      }
      if (lay.mode === 'below') {
        expect(lay.corner.y, name).toBeGreaterThanOrEqual(lay.box.y + STAGE_BOTTOM);
      } else {
        expect(lay.corner.x, name).toBeGreaterThan(lay.box.x + YARD_RIGHT);
      }
    });
  });

  it('is the same for the same window every time, and centres the working area', () => {
    const g = geometry(1440, 800, true);
    const one = schoolLayout(g, true);
    expect(schoolLayout(g, true)).toEqual(one);
    const mid = (one.extent.left + one.extent.right) / 2;
    expect(Math.abs(mid - g.cx)).toBeLessThanOrEqual(CORNER.w / 2 + 10);
  });

  it('draws every piece of a visit inside the scene without a size of its own going wrong', () => {
    const g = geometry(1100, 700, true);
    const placements = schoolSceneDraw(
      { lectern: true, bell: true, teacher: 'stormray' },
      { material: 'timber', size: 's' },
    )(g);
    expect(placements.length).toBeGreaterThan(100);
  });
});

describe('the School canvas: the targets', () => {
  it('has two seats on the bench, standing on the yard with their feet on one row, clear of the lectern', () => {
    const first = seatBox(0);
    const second = seatBox(1);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(seatBox(4)).toBeNull();
    if (first === null || second === null) return;
    for (const seat of [first, second]) {
      expect(seat.y + seat.h - 1).toBe(SEATS_FEET);
      expect(seat.x).toBeGreaterThanOrEqual(YARD_LEFT);
      expect(seat.x + seat.w).toBeLessThanOrEqual(lecternBox().x);
    }
    expect(Math.abs(first.x - second.x)).toBeGreaterThanOrEqual(16);
  });

  it('keeps the lectern inside the yard', () => {
    const lectern = lecternBox();
    expect(lectern.x + lectern.w).toBeLessThanOrEqual(YARD_RIGHT);
    expect(lectern.y + lectern.h).toBeLessThanOrEqual(YARD_BOTTOM);
  });

  it('the graduation stage is the prop’s whole box, in front of the yard and clear of the house, seats, lectern and teacher', () => {
    expect(STAGE_BOX).toEqual({ ...STAGE_AT, w: 48, h: 24 });
    // Under the yard's last row, inside its width.
    expect(STAGE_BOX.y).toBeGreaterThan(YARD_BOTTOM - 1);
    expect(STAGE_BOX.x).toBeGreaterThanOrEqual(YARD_LEFT);
    expect(STAGE_BOX.x + STAGE_BOX.w).toBeLessThanOrEqual(YARD_RIGHT);
    // The house (the School's art is 50 high) and every seat and the lectern end above it.
    expect(STAGE_BOX.y).toBeGreaterThanOrEqual(schoolArt().height);
    for (const n of [0, 1, 2, 3]) {
      const seat = seatBox(n);
      expect((seat?.y ?? 0) + (seat?.h ?? 0)).toBeLessThanOrEqual(STAGE_BOX.y);
    }
    const lectern = lecternBox();
    expect(lectern.y + lectern.h).toBeLessThanOrEqual(STAGE_BOX.y);
  });

  it('the stage is drawn in the scene at its place, whatever the visit', () => {
    const g = geometry(1100, 800, true);
    const lay = schoolLayout(g, true);
    const placements = schoolSceneDraw(
      { lectern: false, bell: false, teacher: null },
      { material: 'timber', size: 's' },
    )(g);
    expect(
      placements.some((p) => p.x === lay.box.x + STAGE_AT.x && p.y === lay.box.y + STAGE_AT.y),
    ).toBe(true);
  });
});
