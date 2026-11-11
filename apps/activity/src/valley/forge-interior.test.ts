import { describe, expect, it } from 'vitest';
import { CELL_H, PROP } from './forge-canvas';
import {
  BACK_SPOTS,
  ROOM,
  ROOM_AT,
  ROOM_H,
  interiorLayout,
  interiorScale,
  interiorSceneDraw,
} from './forge-interior';
import { INTERIOR_PIECES, PIECE_SIZE, interiorSprite } from './forge-interior-art';
import { AMBIENT, ambientCount, ambientSpots } from './ForgeScenes';
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
  it("has every piece at the size of the Art session's set, in both palettes", () => {
    const want: Record<string, [number, number]> = {
      'back-wall': [128, 56],
      furnace: [48, 52],
      'furnace-glow': [128, 40],
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
        const parsed = parseSprite(interiorSprite(piece, night));
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
      expect(ROOM_H * s).toBeLessThanOrEqual(Math.max(h, ROOM_H));
    }
    expect(interiorScale(390, 520)).toBe(3);
    expect(interiorScale(1100, 700)).toBe(4);
  });

  it('stands every cell, prop and back spot inside the room, nothing overlapping', () => {
    for (const [w, h] of SIZES) {
      const g = sceneGeometry(w, h, interiorScale(w, h));
      for (const slots of [1, 2, 3, 4]) {
        const lay = interiorLayout(g, slots);
        expect(lay.ox).toBe(g.cx - 64);
        expect(lay.cells).toHaveLength(slots);
        const floorEnd = Math.max(lay.oy + ROOM_H, g.H);
        for (const c of lay.cells) {
          expect(c.x).toBeGreaterThanOrEqual(lay.ox + 22);
          expect(c.x + c.w).toBeLessThanOrEqual(lay.ox + 126);
          expect(c.y + CELL_H).toBeLessThanOrEqual(floorEnd);
        }
        for (let i = 1; i < lay.cells.length; i += 1) {
          const prev = lay.cells[i - 1];
          const cell = lay.cells[i];
          expect((prev?.x ?? 0) + (prev?.w ?? 0)).toBeLessThanOrEqual(cell?.x ?? 0);
        }
        // The front strip (the three props and the doormat) stands under the anvils, left to right without touching.
        const props = [lay.plans, lay.chest, lay.crate];
        for (const p of props) {
          expect(p.x).toBeGreaterThanOrEqual(lay.ox);
          expect(p.x + PROP).toBeLessThanOrEqual(lay.ox + ROOM.w);
          expect(p.y + PROP).toBeLessThanOrEqual(floorEnd);
          expect(p.y).toBeGreaterThanOrEqual((lay.cells[0]?.y ?? 0) + CELL_H - 8);
        }
        expect(lay.door.x + lay.door.w).toBeLessThanOrEqual(lay.plans.x);
        expect(lay.plans.x + PROP).toBeLessThanOrEqual(lay.chest.x);
        expect(lay.chest.x + PROP).toBeLessThanOrEqual(lay.crate.x);
        expect(lay.door.y + lay.door.h).toBeLessThanOrEqual(floorEnd);
        // The furnace is on the left against the wall, above the cells.
        expect(lay.furnace.y + lay.furnace.h).toBeLessThanOrEqual(lay.cells[0]?.y ?? 0);
        // The background smiths stand behind the benches, four spots.
        expect(lay.backSpots).toHaveLength(BACK_SPOTS);
        for (const spot of lay.backSpots) {
          const onBench = lay.benches.some((b) => spot.x >= b.x && spot.x <= b.x + 32);
          expect(onBench).toBe(true);
          expect(spot.y).toBeGreaterThan(lay.benches[0].y);
          expect(spot.y).toBeLessThan(lay.benches[0].y + 20);
        }
      }
    }
  });

  it("places the pieces as the Art session's preview has them (anchors are top-lefts in room pixels)", () => {
    expect(ROOM_AT.furnace).toEqual({ x: 2, y: 11 });
    expect(ROOM_AT['furnace-glow']).toEqual({ x: 0, y: 56 });
    expect(ROOM_AT['hanging-tools']).toEqual({ x: 52, y: 6 });
    expect(ROOM_AT['tool-rack']).toEqual({ x: 92, y: 6 });
    expect(ROOM_AT.shelf).toEqual({ x: 92, y: 30 });
    expect(ROOM_AT.workbench).toEqual({ x: 60, y: 52 });
    expect(ROOM_AT.barrel).toEqual({ x: 116, y: 60 });
    expect(ROOM_AT['coal-heap']).toEqual({ x: 6, y: 66 });
    expect(ROOM_AT['quench-trough']).toEqual({ x: 100, y: 78 });
    // The glow's pool centre (25, 6) is the furnace mouth: furnace x + 23, the furnace's base line.
    expect(ROOM_AT['furnace-glow'].x + 25).toBe(ROOM_AT.furnace.x + 23);
    expect(ROOM_AT['furnace-glow'].y + 6).toBe(ROOM_AT.furnace.y + PIECE_SIZE.furnace.h - 1);
  });

  it('draws the wall and the floor to every edge, the glow over the floor, an anvil for each one owned and the props', () => {
    for (const [w, h] of SIZES) {
      const g = sceneGeometry(w, h, interiorScale(w, h));
      const placed = interiorSceneDraw(2, 3, true)(g);
      const walls = placed.filter((p) => p.sprite === interiorSprite('back-wall', true));
      expect(walls.length).toBeGreaterThanOrEqual(Math.ceil(g.W / 128));
      expect(Math.min(...walls.map((p) => p.x))).toBeLessThanOrEqual(0);
      expect(Math.max(...walls.map((p) => p.x)) + 128).toBeGreaterThanOrEqual(g.W);
      const floor = placed.filter((p) => p.sprite === interiorSprite('floor', true));
      expect(Math.max(...floor.map((p) => p.y)) + 16).toBeGreaterThanOrEqual(g.H);
      // The glow is drawn after the floor and before the furnace.
      const at = (sprite: ReturnType<typeof interiorSprite>): number =>
        placed.findIndex((p) => p.sprite === sprite);
      const lastFloor = Math.max(
        ...placed.flatMap((p, i) => (p.sprite === interiorSprite('floor', true) ? [i] : [])),
      );
      expect(at(interiorSprite('furnace-glow', true))).toBeGreaterThan(lastFloor);
      expect(at(interiorSprite('furnace', true))).toBeGreaterThan(
        at(interiorSprite('furnace-glow', true)),
      );
      // Two anvils owned of three cells, and the three props: sixteen-pixel sprites on the floor.
      const small = placed.filter(
        (p) => p.sprite.rows.length === 16 && p.sprite.rows[0]?.length === 16,
      );
      expect(small.length).toBeGreaterThanOrEqual(2 + 3);
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

  it("never stands an ambient worker where another player's smith is", () => {
    expect(ambientSpots(0, 4)).toEqual([3, 0]);
    expect(ambientSpots(1, 4)).toEqual([3]);
    expect(ambientSpots(2, 4)).toEqual([]);
    for (let others = 0; others <= 4; others += 1) {
      for (const spot of ambientSpots(others, 4)) expect(spot).toBeGreaterThanOrEqual(others);
    }
  });
});
