import { describe, expect, it } from 'vitest';
import { PLATE_ROW_PX } from './place-plates';
import { sceneGeometry } from './SceneFrame';
import {
  BLUEPRINT_BOX,
  SCALE_MAX,
  SCALE_MIN,
  SIGN_BOX,
  STALL,
  VISITOR_BOX,
  visitorBox,
  visitorScale,
  visitorSceneDraw,
} from './visitor-canvas';

const SIZES: [number, number][] = [
  [360, 520],
  [390, 600],
  [390, 700],
  [700, 600],
  [1100, 600],
  [1100, 780],
  [1440, 800],
  [1920, 1000],
];

const geometry = (width: number, height: number) =>
  sceneGeometry(width, height, visitorScale(width, height));

describe('the visitor canvas: the scale', () => {
  it('is a whole number from the phone’s to the biggest, and a taller window never gets a smaller one', () => {
    for (const [w, h] of SIZES) {
      const s = visitorScale(w, h);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(s).toBeLessThanOrEqual(SCALE_MAX);
      expect(visitorScale(w, h + 300)).toBeGreaterThanOrEqual(s);
    }
  });

  it('fills the window: one more would not fit the stall and its plates', () => {
    for (const [w, h] of SIZES) {
      const s = visitorScale(w, h);
      if (s === SCALE_MAX || s === SCALE_MIN) continue;
      const next = s + 1;
      const fitsWidth = Math.ceil(w / next) >= STALL.width + 12;
      const fitsHeight =
        Math.ceil(h / next) >=
        Math.ceil(16 / next) + 20 + STALL.height + Math.ceil(PLATE_ROW_PX / next) + 3;
      expect(fitsWidth && fitsHeight).toBe(false);
    }
  });
});

describe('the visitor canvas: the layout', () => {
  it('keeps the stall and the plates under it in view, centred sideways, at every size', () => {
    for (const [w, h] of SIZES) {
      const g = geometry(w, h);
      const box = visitorBox(g);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(g.W);
      expect(box.y).toBeGreaterThanOrEqual(g.top);
      // The plates are under the stall's feet.
      expect((box.y + box.height) * g.s + PLATE_ROW_PX).toBeLessThanOrEqual(h + g.s);
      expect(Math.abs(box.x + box.width / 2 - g.cx)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the scale for the visit: the open and the shuttered stall are the same size and place', () => {
    const g = geometry(1100, 700);
    expect(visitorSceneDraw(true, false)(g)).toHaveLength(visitorSceneDraw(false, false)(g).length);
  });

  it('draws the stall over the ground and the dressing, and the two looks differ in that sprite only', () => {
    const g = geometry(1100, 700);
    const here = visitorSceneDraw(true, false)(g);
    const away = visitorSceneDraw(false, false)(g);
    const differing = here.filter((p, i) => p.sprite !== away[i]?.sprite);
    expect(differing).toHaveLength(1);
    expect(here.at(-1)).toBe(differing[0]);
    const box = visitorBox(g);
    expect(here.at(-1)).toMatchObject({ x: box.x, y: box.y });
  });

  it('the blueprint lies on the counter (bottom row on stall row 46) while it is for sale, drawn after the stall', () => {
    const g = geometry(1100, 700);
    const box = visitorBox(g);
    const forSale = visitorSceneDraw(true, true)(g);
    const without = visitorSceneDraw(true, false)(g);
    expect(forSale).toHaveLength(without.length + 1);
    const bp = forSale.at(-1);
    expect(bp).toMatchObject({ x: box.x + 33, y: box.y + 37 });
    expect(bp?.sprite.rows).toHaveLength(10);
    expect(BLUEPRINT_BOX).toEqual({ x: 33, y: 37, w: 16, h: 10 });
    // Bottom row 46: 37 + 10 - 1.
    expect(BLUEPRINT_BOX.y + BLUEPRINT_BOX.h - 1).toBe(46);
  });

  it('while he is away there is no blueprint, whatever the flag says', () => {
    const g = geometry(1100, 700);
    expect(visitorSceneDraw(false, true)(g)).toHaveLength(visitorSceneDraw(false, false)(g).length);
  });
});

describe('the visitor canvas: the targets', () => {
  const inside = (t: { x: number; y: number; w: number; h: number }): boolean =>
    t.x >= 0 && t.y >= 0 && t.x + t.w <= STALL.width && t.y + t.h <= STALL.height;

  it('every target is inside the stall’s art', () => {
    for (const t of [VISITOR_BOX, BLUEPRINT_BOX, SIGN_BOX]) expect(inside(t)).toBe(true);
  });

  it('the visitor and the blueprint do not overlap', () => {
    const apart =
      VISITOR_BOX.x + VISITOR_BOX.w <= BLUEPRINT_BOX.x ||
      BLUEPRINT_BOX.x + BLUEPRINT_BOX.w <= VISITOR_BOX.x;
    expect(apart).toBe(true);
  });
});
