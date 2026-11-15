import { describe, expect, it } from 'vitest';
import { SCALE_MAX, SCALE_MIN } from './bonfire-canvas';
import { CORNER, TABLE_BOX } from './builders-corner';
import {
  BROKER_AT,
  FRONT_FEET,
  STALL_BOX,
  STALL_H,
  STALL_W,
  marketLayout,
  marketScale,
  marketSceneDraw,
  modeFor,
} from './market-canvas';
import { PLATE_ROW_PX } from './place-plates';
import { sceneGeometry } from './SceneFrame';

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
  sceneGeometry(width, height, marketScale(width, height, corner));

const each = (check: (w: number, h: number, corner: boolean) => void): void => {
  for (const [w, h] of SIZES) for (const corner of [false, true]) check(w, h, corner);
};

describe('the Market canvas: the scale', () => {
  it('is a whole number from the phone’s to the biggest, and a taller window never gets a smaller one', () => {
    each((w, h, corner) => {
      const s = marketScale(w, h, corner);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(s).toBeLessThanOrEqual(SCALE_MAX);
      expect(marketScale(w, h + 300, corner)).toBeGreaterThanOrEqual(s);
    });
  });

  it('fills a laptop with the stall, a corner beside it still bigger than a phone’s', () => {
    expect(marketScale(1440, 800, false)).toBe(8);
    expect(marketScale(1100, 780, true)).toBeGreaterThanOrEqual(6);
    expect(marketScale(390, 780, true)).toBe(4);
  });

  it('puts the corner beside the stall on a wide window and under it on a phone', () => {
    expect(modeFor(98, true)).toBe('below');
    expect(modeFor(260, true)).toBe('beside');
    expect(modeFor(98, false)).toBe('none');
    expect(modeFor(500, false)).toBe('none');
  });
});

describe('the Market canvas: the layout', () => {
  it('keeps the stall, its broker and the corner inside the scene, and the corner clear of the stall', () => {
    each((w, h, corner) => {
      const g = geometry(w, h, corner);
      const lay = marketLayout(g, corner);
      const name = `${String(w)}x${String(h)} ${corner ? 'corner' : 'no corner'}`;
      expect(lay.box.y, name).toBeGreaterThanOrEqual(0);
      expect(lay.box.x, name).toBeGreaterThanOrEqual(0);
      expect(lay.box.x + STALL_W, name).toBeLessThanOrEqual(g.W);
      // The broker's feet and the plate under them are whole in the scene.
      expect(lay.box.y + FRONT_FEET + Math.ceil(PLATE_ROW_PX / g.s), name).toBeLessThanOrEqual(g.H);
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
        expect(lay.corner.y, name).toBeGreaterThanOrEqual(
          lay.box.y + FRONT_FEET + Math.ceil(PLATE_ROW_PX / g.s),
        );
      } else {
        expect(lay.corner.x, name).toBeGreaterThan(lay.box.x + STALL_W);
        // Beside: the corner's feet are level with the broker's.
        expect(lay.corner.y + CORNER.feet, name).toBe(lay.box.y + FRONT_FEET);
      }
    });
  });

  it('centres the working area sideways', () => {
    const g = geometry(1440, 800, true);
    const lay = marketLayout(g, true);
    const left = lay.extent.left;
    const right = g.W - lay.extent.right;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  });

  it('is the same for the same window every time', () => {
    const g = geometry(1100, 780, true);
    expect(marketLayout(g, true)).toEqual(marketLayout(g, true));
  });

  it('the stall’s target and the broker’s seat are inside the stall’s art and do not overlap', () => {
    expect(STALL_BOX.x + STALL_BOX.w).toBeLessThanOrEqual(STALL_W);
    expect(STALL_BOX.y + STALL_BOX.h).toBeLessThanOrEqual(STALL_H);
    // The broker stands in front of the counter: the stall's box ends where its box begins.
    expect(STALL_BOX.y + STALL_BOX.h).toBeLessThanOrEqual(BROKER_AT.y);
    expect(TABLE_BOX.x + TABLE_BOX.w).toBeLessThanOrEqual(CORNER.w);
  });
});

describe('the Market canvas: the scene', () => {
  it('draws the same placements for the same size, grows with the scaffolding and the corner, and fills every edge', () => {
    const g = geometry(1100, 780, true);
    const plain = marketSceneDraw(0, null, true)(g);
    const again = marketSceneDraw(0, null, true)(g);
    expect(again).toEqual(plain);
    const scaffolded = marketSceneDraw(6, null, true)(g);
    expect(scaffolded.length).toBe(plain.length + 1);
    const withCorner = marketSceneDraw(0, { material: 'timber', size: 's' }, true)(g);
    expect(withCorner.length).toBeGreaterThan(plain.length);
    // Grass reaches every edge.
    const maxX = Math.max(...plain.map((p) => p.x + (p.sprite.rows[0]?.length ?? 0)));
    const maxY = Math.max(...plain.map((p) => p.y + p.sprite.rows.length));
    expect(maxX).toBeGreaterThanOrEqual(g.W);
    expect(maxY).toBeGreaterThanOrEqual(g.H);
  });

  it('before it is built the stall’s place is the market-building prop, with no scaffolding over it; once built, the stall', () => {
    const g = geometry(1100, 780, false);
    const lay = marketLayout(g, false);
    const at = (list: ReturnType<ReturnType<typeof marketSceneDraw>>) =>
      list.filter((p) => p.x === lay.box.x && p.y === lay.box.y);
    const site = at(marketSceneDraw(6, null, false)(g));
    const stall = at(marketSceneDraw(6, null, true)(g));
    // The site is one sprite (the stall's size, the same ground rows); the built stall has its scaffold over it while it grows.
    expect(site).toHaveLength(1);
    expect(stall).toHaveLength(2);
    expect(site[0]?.sprite).not.toBe(stall[0]?.sprite);
    expect(site[0]?.sprite.rows).toHaveLength(STALL_H);
    expect(site[0]?.sprite.rows[0]).toHaveLength(STALL_W);
  });
});
