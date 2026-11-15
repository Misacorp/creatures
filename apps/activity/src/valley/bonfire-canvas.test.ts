import { describe, expect, it } from 'vitest';
import { CLUSTER_HALF, bonfireSceneDraw, edgeDressing, fireTarget } from './bonfire-canvas';
import { placeArtBox, placeScale } from './place-scene';
import { sceneGeometry } from './SceneFrame';
import { GRAND_BOX, FIRE_BOX } from './bonfire-cast';

const SIZES: [number, number][] = [
  [390, 700],
  [700, 600],
  [1100, 700],
  [1440, 800],
  [1920, 1000],
];

const geometry = (width: number, height: number, art: 'bonfire' | 'bonfire-grand') =>
  sceneGeometry(width, height, placeScale(width, height, art));

describe('the Bonfire canvas: the edges of the scene', () => {
  it('dresses only past the cluster, never over the fire and its seats', () => {
    for (const [w, h] of SIZES) {
      for (const art of ['bonfire', 'bonfire-grand'] as const) {
        const g = geometry(w, h, art);
        const box = placeArtBox(g, art);
        const middle = box.x + box.width / 2;
        for (const p of edgeDressing(g, box)) {
          const width = p.sprite.rows[0]?.length ?? 0;
          const near = Math.min(Math.abs(p.x - middle), Math.abs(p.x + width - middle));
          const inside = p.x < middle + CLUSTER_HALF && p.x + width > middle - CLUSTER_HALF;
          expect(inside, `${String(w)}x${String(h)} ${art}: a piece at ${String(p.x)}`).toBe(false);
          expect(near).toBeGreaterThanOrEqual(CLUSTER_HALF - 1);
        }
      }
    }
  });

  it('puts nothing below the scene, keeps every piece at least partly in view, and is the same every time', () => {
    for (const [w, h] of SIZES) {
      const g = geometry(w, h, 'bonfire');
      const box = placeArtBox(g, 'bonfire');
      const one = edgeDressing(g, box);
      expect(edgeDressing(g, box)).toEqual(one);
      for (const p of one) {
        const width = p.sprite.rows[0]?.length ?? 0;
        expect(p.x + width).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(g.W);
        expect(p.y + p.sprite.rows.length).toBeLessThanOrEqual(g.H);
      }
    }
  });

  it('fills more of a wide window than of a phone, and draws back to front', () => {
    const phone = geometry(390, 700, 'bonfire');
    const wide = geometry(1920, 1000, 'bonfire');
    const count = (g: typeof phone) => edgeDressing(g, placeArtBox(g, 'bonfire')).length;
    expect(count(wide)).toBeGreaterThan(count(phone));
    const g = wide;
    const list = edgeDressing(g, placeArtBox(g, 'bonfire'));
    const feet = list.map((p) => p.y + p.sprite.rows.length);
    expect(feet).toEqual([...feet].sort((a, b) => a - b));
  });

  it('draws the ground to every edge, the fire in the middle, and the scaffolding over it while the project fills', () => {
    const g = geometry(1100, 700, 'bonfire-grand');
    const plain = bonfireSceneDraw('bonfire-grand', 0)(g);
    const built = bonfireSceneDraw('bonfire-grand', 2)(g);
    expect(built.length).toBe(plain.length + 1);
    const box = placeArtBox(g, 'bonfire-grand');
    const last = built[built.length - 1];
    expect(last).toMatchObject({ x: box.x, y: box.y });
    const grass = plain.filter((p) => p.sprite.rows.length === 16 && p.y >= 0);
    expect(Math.max(...grass.map((p) => p.x))).toBeGreaterThanOrEqual(g.W - 16);
    expect(Math.max(...grass.map((p) => p.y))).toBeGreaterThanOrEqual(g.H - 16);
  });

  it('the fire target is inside the art, clear of the seats round it', () => {
    for (const [grand, size] of [
      [false, FIRE_BOX],
      [true, GRAND_BOX],
    ] as const) {
      const t = fireTarget(grand);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(size.width);
      expect(t.y + t.h).toBeLessThanOrEqual(size.height);
    }
  });
});
