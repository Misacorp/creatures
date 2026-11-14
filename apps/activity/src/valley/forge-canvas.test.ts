import { describe, expect, it } from 'vitest';
import { sampleAnvil, shardWait } from './forge-sample';
import {
  anvilGlyph,
  anvilWorking,
  floorTotal,
  forgeScale,
  outsideLayout,
  outsideSceneDraw,
} from './forge-canvas';
import { sceneGeometry } from './SceneFrame';

describe('the Forge outside: tall scenes', () => {
  it('never paints a sprite taller than 64 rows, whatever the scene height, and carries the sky to the top edge', () => {
    for (const [w, h] of [
      [390, 640],
      [390, 1100],
      [1100, 1400],
      [1100, 300],
    ] as const) {
      const g = sceneGeometry(w, h, forgeScale(w, h));
      const placed = outsideSceneDraw(2)(g);
      for (const p of placed) expect(p.sprite.rows.length).toBeLessThanOrEqual(64);
      const lay = outsideLayout(g);
      // The sky strip stands at the same row everywhere; the rows above it are covered from row 0 without a gap.
      const sky = placed.filter(
        (p) => p.sprite.rows.length === 40 && p.sprite.rows[0]?.length === 128,
      );
      const stripY = Math.min(...sky.map((p) => p.y));
      const above = placed
        .filter((p) => p.y < stripY && p.sprite.rows[0]?.length === 128)
        .sort((a, b) => a.y - b.y);
      let next = 0;
      for (const p of above.filter((a) => a.x === above[0]?.x)) {
        expect(p.y).toBe(next);
        next += p.sprite.rows.length;
      }
      expect(next).toBe(stripY);
      expect(lay.art.y).toBeGreaterThanOrEqual(g.top);
    }
  });
});

describe('the Forge outside', () => {
  it('stands the building and the board inside the scene, at a phone and at a wide window', () => {
    for (const [w, h] of [
      [390, 640],
      [1100, 600],
      [700, 560],
    ] as const) {
      const g = sceneGeometry(w, h, forgeScale(w, h));
      const lay = outsideLayout(g);
      expect(lay.art.x).toBeGreaterThanOrEqual(0);
      expect(lay.art.x + lay.art.width).toBeLessThanOrEqual(g.W);
      expect(lay.art.y).toBeGreaterThanOrEqual(g.top);
      expect(lay.art.y + lay.art.height).toBeLessThanOrEqual(g.H);
      expect(lay.board.x + 16).toBeLessThanOrEqual(g.W);
      // The board stands at the building's right foot, not over its door.
      expect(lay.board.x).toBeGreaterThanOrEqual(lay.art.x + lay.art.width);
      // Sprites: grass, sky, trees, the building and the board, and the scaffolding on top when there is some.
      const plain = outsideSceneDraw(0)(g);
      const built = outsideSceneDraw(3)(g);
      expect(built.length).toBe(plain.length + 1);
    }
  });

  it('keeps the pixel scale whole and steps it down only while the group does not fit', () => {
    expect(forgeScale(390, 800)).toBe(3);
    expect(forgeScale(1100, 900)).toBe(4);
    expect(forgeScale(1100, 300)).toBeLessThan(4);
    expect(forgeScale(1100, 300)).toBeGreaterThanOrEqual(2);
  });

  it('says what a smith does with a bubble glyph, and nothing at rest or paused', () => {
    expect(anvilGlyph(sampleAnvil('a1', null, []))).toBeNull();
    expect(
      anvilGlyph(sampleAnvil('a1', 'c1', [], { paused: { sinceHours: 1 } as never })),
    ).toBeNull();
    expect(anvilGlyph(sampleAnvil('a1', 'c1', []))).toBe('info');
    expect(anvilGlyph(shardWait('a1', 'c1', 'kelp-cap', 2))).toBe('warning');
  });

  it('hammers only while a piece is in hand and the smith is not tinkering or paused', () => {
    expect(anvilWorking(sampleAnvil('a1', 'c1', [{ id: 'o1' } as never]))).toBe(true);
    expect(anvilWorking(sampleAnvil('a1', 'c1', []))).toBe(false);
    expect(anvilWorking(sampleAnvil('a1', null, []))).toBe(false);
    expect(anvilWorking(shardWait('a1', 'c1', 'kelp-cap', 2))).toBe(false);
  });

  it('counts the pieces waiting on every floor', () => {
    expect(floorTotal([sampleAnvil('a1', 'c1', []), sampleAnvil('a2', 'c2', [])])).toBe(4);
  });
});
