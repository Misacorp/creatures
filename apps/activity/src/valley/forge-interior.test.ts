import { describe, expect, it } from 'vitest';
import { CELL_H, PROP } from './forge-canvas';
import {
  BACK_SPOTS,
  ROOM,
  ROOM_AT,
  interiorLayout,
  interiorScale,
  interiorSceneDraw,
} from './forge-interior';
import { INTERIOR_PIECES, PIECE_SIZE, interiorSprite } from './forge-interior-art';
import { AMBIENT, ambientCount } from './ForgeScenes';
import { sceneGeometry } from './SceneFrame';
import { parseSprite } from '../sprites/sprite-data';

const SIZES: [number, number][] = [
  [390, 520],
  [390, 700],
  [1100, 620],
  [700, 560],
  [332, 560],
];

describe('the Forge interior: art by name', () => {
  it('has every piece at the size the Art session was given, in both palettes', () => {
    const want: Record<string, [number, number]> = {
      'back-wall': [128, 56],
      furnace: [48, 56],
      shelf: [32, 16],
      'tool-rack': [32, 24],
      workbench: [32, 20],
      floor: [16, 16],
      barrel: [12, 16],
      'quench-trough': [24, 12],
      'hanging-tools': [24, 16],
      'coal-heap': [16, 10],
    };
    for (const [name, [w, h]] of Object.entries(want)) {
      expect(PIECE_SIZE[name as keyof typeof PIECE_SIZE], name).toEqual({ w, h });
    }
    for (const piece of INTERIOR_PIECES) {
      for (const night of [true, false]) {
        const sprite = interiorSprite(piece, night);
        const parsed = parseSprite(sprite);
        expect(`${piece} ${String(parsed.width)}x${String(parsed.height)}`).toBe(
          `${piece} ${String(PIECE_SIZE[piece].w)}x${String(PIECE_SIZE[piece].h)}`,
        );
      }
      // Day is a recolour of night: the same drawing, other colours.
      expect(interiorSprite(piece, false).rows).toEqual(interiorSprite(piece, true).rows);
    }
    expect(interiorSprite('back-wall', true).palette).not.toEqual(
      interiorSprite('back-wall', false).palette,
    );
  });
});

describe('the Forge interior layout', () => {
  it('keeps the scale whole, at most 4, and the room inside the window', () => {
    for (const [w, h] of SIZES) {
      const s = interiorScale(w, h);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(4);
      expect(ROOM.w * s).toBeLessThanOrEqual(w);
      expect(ROOM.h * s).toBeLessThanOrEqual(h);
    }
    expect(interiorScale(390, 520)).toBe(3);
    expect(interiorScale(1100, 620)).toBe(4);
  });

  it('stands every cell, prop and back spot inside the room, nothing overlapping', () => {
    for (const [w, h] of SIZES) {
      const g = sceneGeometry(w, h, interiorScale(w, h));
      for (const slots of [1, 2, 3, 4]) {
        const lay = interiorLayout(g, slots);
        expect(lay.ox).toBe(g.cx - 64);
        expect(lay.cells).toHaveLength(slots);
        for (const c of lay.cells) {
          expect(c.x).toBeGreaterThanOrEqual(lay.ox);
          expect(c.x + c.w).toBeLessThanOrEqual(lay.ox + 106);
          expect(c.y + CELL_H).toBeLessThanOrEqual(lay.oy + ROOM.h);
        }
        for (let i = 1; i < lay.cells.length; i += 1) {
          const prev = lay.cells[i - 1];
          const cell = lay.cells[i];
          expect((prev?.x ?? 0) + (prev?.w ?? 0)).toBeLessThanOrEqual(cell?.x ?? 0);
        }
        const props = [lay.plans, lay.chest, lay.crate];
        for (const p of props) {
          expect(p.x).toBeGreaterThanOrEqual(lay.ox + 106);
          expect(p.x + PROP).toBeLessThanOrEqual(lay.ox + ROOM.w);
          expect(p.y + PROP).toBeLessThanOrEqual(lay.oy + ROOM.h);
        }
        // The props stand one above the next without touching the cells.
        expect(lay.chest.y).toBeGreaterThanOrEqual(lay.plans.y + PROP);
        expect(lay.crate.y).toBeGreaterThanOrEqual(lay.chest.y + PROP);
        // The door is on the wall above the props, the furnace on the left, and neither is over a cell.
        expect(lay.door.y + lay.door.h).toBeLessThanOrEqual(lay.plans.y);
        expect(lay.furnace.y + lay.furnace.h).toBeLessThanOrEqual(lay.cells[0]?.y ?? 0);
        // The background smiths stand behind the benches, four spots.
        expect(lay.backSpots).toHaveLength(BACK_SPOTS);
        for (const spot of lay.backSpots) {
          const onBench = lay.benches.some((b) => spot.x >= b.x && spot.x <= b.x + 32);
          expect(onBench).toBe(true);
          expect(spot.y).toBeLessThan(lay.benches[0].y + 20);
        }
      }
    }
  });

  it('places the pieces as the Art session was told (anchors are top-lefts in room pixels)', () => {
    expect(ROOM_AT.furnace).toEqual({ x: 2, y: 4 });
    expect(ROOM_AT['hanging-tools']).toEqual({ x: 74, y: 0 });
    expect(ROOM_AT.shelf).toEqual({ x: 50, y: 20 });
    expect(ROOM_AT['tool-rack']).toEqual({ x: 82, y: 16 });
    expect(ROOM_AT.workbench).toEqual({ x: 50, y: 36 });
    expect(ROOM_AT.door).toEqual({ x: 114, y: 24 });
  });

  it('draws the wall and the floor to every edge, an anvil for each one owned and the props', () => {
    for (const [w, h] of SIZES) {
      const g = sceneGeometry(w, h, interiorScale(w, h));
      const placed = interiorSceneDraw(2, 3, true)(g);
      const walls = placed.filter((p) => p.sprite === interiorSprite('back-wall', true));
      // The wall tiles sideways over the whole width.
      expect(walls.length).toBeGreaterThanOrEqual(Math.ceil(g.W / 128));
      expect(Math.min(...walls.map((p) => p.x))).toBeLessThanOrEqual(0);
      expect(Math.max(...walls.map((p) => p.x)) + 128).toBeGreaterThanOrEqual(g.W);
      const floor = placed.filter((p) => p.sprite === interiorSprite('floor', true));
      expect(Math.max(...floor.map((p) => p.y)) + 16).toBeGreaterThanOrEqual(g.H);
      // Two anvils owned of three cells: two anvil sprites (the third cell is the dashed outline).
      const anvils = placed.filter(
        (p) => p.sprite.rows.length === 16 && p.sprite.rows[0]?.length === 16,
      );
      expect(anvils.length).toBeGreaterThanOrEqual(2 + 3);
    }
  });

  it('draws the day palette by day', () => {
    const g = sceneGeometry(390, 520, 3);
    const night = interiorSceneDraw(1, 2, true)(g);
    const day = interiorSceneDraw(1, 2, false)(g);
    expect(day).toHaveLength(night.length);
    expect(day[0]?.sprite).not.toBe(night[0]?.sprite);
  });
});

describe('the background workers', () => {
  it('shows ambient workers only to make two in all, never more than there are of them', () => {
    expect(ambientCount(0)).toBe(2);
    expect(ambientCount(1)).toBe(1);
    expect(ambientCount(2)).toBe(0);
    expect(ambientCount(4)).toBe(0);
    expect(AMBIENT).toHaveLength(2);
  });
});
