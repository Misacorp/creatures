import { describe, expect, it } from 'vitest';
import { sampleAnvil, shardWait } from './forge-sample';
import {
  CELL_H,
  CONTENT_H,
  PROP,
  anvilGlyph,
  floorTotal,
  forgeScale,
  yardLayout,
} from './forge-canvas';
import { sceneGeometry } from './SceneFrame';

describe('the Forge canvas layout', () => {
  it('stands every cell and prop inside the scene, nothing overlapping, at a phone and at a wide window', () => {
    for (const [w, h] of [
      [390, 640],
      [1100, 600],
      [700, 560],
    ] as const) {
      const g = sceneGeometry(w, h, forgeScale(w, h));
      for (const slots of [1, 2, 3, 4]) {
        const lay = yardLayout(g, slots);
        expect(lay.cells).toHaveLength(slots);
        for (const c of lay.cells) {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x + c.w).toBeLessThanOrEqual(g.W);
          expect(c.y + CELL_H).toBeLessThanOrEqual(g.H);
        }
        for (let i = 1; i < lay.cells.length; i += 1) {
          const prev = lay.cells[i - 1];
          const cell = lay.cells[i];
          expect((prev?.x ?? 0) + (prev?.w ?? 0)).toBeLessThanOrEqual(cell?.x ?? 0);
        }
        for (const p of [lay.plans, lay.chest, lay.crate]) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x + PROP).toBeLessThanOrEqual(g.W);
          expect(p.y + PROP).toBeLessThanOrEqual(g.H);
        }
        // The props stand under the anvils.
        expect(lay.chest.y).toBeGreaterThan((lay.cells[0]?.y ?? 0) + CELL_H - 1);
      }
    }
  });

  it('keeps the pixel scale whole and steps it down only while the group does not fit', () => {
    expect(forgeScale(390, 800)).toBe(3);
    expect(forgeScale(1100, 900)).toBe(4);
    expect(forgeScale(1100, 300)).toBeLessThan(4);
    expect(forgeScale(1100, 300)).toBeGreaterThanOrEqual(2);
    expect(CONTENT_H).toBeGreaterThan(0);
  });

  it('says what a smith does with a bubble glyph, and nothing at rest or paused', () => {
    expect(anvilGlyph(sampleAnvil('a1', null, []))).toBeNull();
    expect(
      anvilGlyph(sampleAnvil('a1', 'c1', [], { paused: { sinceHours: 1 } as never })),
    ).toBeNull();
    expect(anvilGlyph(sampleAnvil('a1', 'c1', []))).toBe('info');
    expect(anvilGlyph(shardWait('a1', 'c1', 'kelp-cap', 2))).toBe('warning');
  });

  it('counts the pieces waiting on every floor', () => {
    expect(floorTotal([sampleAnvil('a1', 'c1', []), sampleAnvil('a2', 'c2', [])])).toBe(4);
  });
});
