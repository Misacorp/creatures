import { describe, expect, it } from 'vitest';
import { CELL_H } from './forge-canvas';
import {
  BACK_SPOTS,
  CROP_B,
  ESSENTIAL_H,
  ROOM,
  ROOM_AT,
  ROOM_H,
  interiorLayout,
  interiorScale,
  interiorSceneDraw,
  type Box,
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
  [1440, 720],
];

const apart = (a: Box, b: Box): boolean =>
  a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

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
      door: [20, 32],
      'door-mat': [20, 4],
      'plans-board': [24, 24],
      'finished-crate': [20, 16],
      'barrel-stack': [24, 24],
      sacks: [18, 13],
      'gear-rack': [22, 26],
      rug: [48, 16],
      woodpile: [28, 19],
      cat: [12, 8],
      bucket: [10, 10],
      'window-2': [12, 31],
      'lantern-hanging': [24, 40],
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
  it('keeps the scale whole, the working height and the room in the window; B is one step larger at most', () => {
    for (const [w, h] of SIZES) {
      for (const fill of ['A', 'B'] as const) {
        const s = interiorScale(w, h, fill);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(fill === 'A' ? 4 : 5);
        if (s > 1) {
          expect(ROOM.w * s).toBeLessThanOrEqual(w);
          expect((ESSENTIAL_H - (fill === 'B' ? CROP_B : 0)) * s).toBeLessThanOrEqual(h);
        }
      }
      expect(interiorScale(w, h, 'B')).toBeGreaterThanOrEqual(interiorScale(w, h, 'A'));
    }
    expect(interiorScale(390, 520, 'A')).toBe(3);
    expect(interiorScale(1100, 700, 'A')).toBe(4);
    expect(interiorScale(1440, 830, 'B')).toBe(5);
  });

  it('takes the window alone: the number of anvils cannot change the size of a scene in use', () => {
    // `interiorScale(width, height, fill)` has no anvil count, so buying an anvil cannot rescale the room.
    expect(interiorScale.length).toBeLessThanOrEqual(3);
  });

  it('stands every cell, prop and back spot inside the room, nothing overlapping', () => {
    for (const [w, h] of SIZES) {
      for (const fill of ['A', 'B'] as const) {
        const g = sceneGeometry(w, h, interiorScale(w, h, fill));
        for (const slots of [1, 2, 3, 4]) {
          const lay = interiorLayout(g, slots, fill);
          expect(lay.ox).toBe(g.cx - 64);
          expect(lay.oy).toBe(fill === 'A' ? 0 : -CROP_B);
          expect(lay.cells).toHaveLength(slots);
          const roomEnd = lay.oy + ROOM_H;
          for (const c of lay.cells) expect(c.y + CELL_H).toBeLessThanOrEqual(roomEnd);
          // Every clickable box is inside the room and none overlaps another.
          const boxes: Box[] = [
            lay.furnace,
            lay.door,
            lay.plans,
            lay.chest,
            lay.crate,
            ...lay.cells,
          ];
          for (const b of boxes) {
            expect(b.x).toBeGreaterThanOrEqual(lay.ox);
            expect(b.x + b.w).toBeLessThanOrEqual(lay.ox + ROOM.w);
            expect(b.y + b.h).toBeLessThanOrEqual(roomEnd);
          }
          for (let i = 0; i < boxes.length; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) {
              const name = `${String(i)}-${String(j)}`;
              expect(`${name} ${String(apart(boxes[i] as Box, boxes[j] as Box))}`).toBe(
                `${name} true`,
              );
            }
          }
          expect(lay.door.h).toBe(PIECE_SIZE.door.h + PIECE_SIZE['door-mat'].h);
          // The background smiths stand behind the benches, four spots.
          expect(lay.backSpots).toHaveLength(BACK_SPOTS);
          for (const [i, spot] of lay.backSpots.entries()) {
            const bench = lay.benches[i < 2 ? 0 : 1];
            expect(spot.x).toBeGreaterThanOrEqual(bench.x);
            expect(spot.x).toBeLessThanOrEqual(bench.x + 32);
            expect(spot.y).toBeGreaterThan(bench.y);
            expect(spot.y).toBeLessThan(bench.y + 20);
          }
        }
      }
    }
  });

  it("places the pieces as the Art session's room preview has them (anchors are top-lefts in room pixels)", () => {
    expect(ROOM_AT.furnace).toEqual({ x: 2, y: 11 });
    expect(ROOM_AT['furnace-glow']).toEqual({ x: 0, y: 56 });
    expect(ROOM_AT['window-2']).toEqual({ x: 46, y: 9 });
    expect(ROOM_AT['lantern-hanging']).toEqual({ x: 79, y: 6 });
    expect(ROOM_AT['hanging-tools']).toEqual({ x: 98, y: 6 });
    expect(ROOM_AT.door).toEqual({ x: 98, y: 26 });
    expect(ROOM_AT['door-mat']).toEqual({ x: 98, y: 58 });
    expect(ROOM_AT.workbench).toEqual({ x: 60, y: 52 });
    expect(ROOM_AT.chest).toEqual({ x: 6, y: 110 });
    expect(ROOM_AT['plans-board']).toEqual({ x: 36, y: 106 });
    expect(ROOM_AT['finished-crate']).toEqual({ x: 74, y: 112 });
    // The mat lies in front of the door: the door's base row is the floor line it starts at.
    expect(ROOM_AT['door-mat'].y).toBe(ROOM_AT.door.y + PIECE_SIZE.door.h);
    // The glow's pool centre (25, 6) is the furnace mouth: furnace x + 23, the furnace's base line.
    expect(ROOM_AT['furnace-glow'].x + 25).toBe(ROOM_AT.furnace.x + 23);
    expect(ROOM_AT['furnace-glow'].y + 6).toBe(ROOM_AT.furnace.y + PIECE_SIZE.furnace.h - 1);
  });

  it('draws the wall and the floor to every edge, the glow over the floor, the rug under it, the door and the crate', () => {
    for (const [w, h] of SIZES) {
      const g = sceneGeometry(w, h, interiorScale(w, h, 'A'));
      const placed = interiorSceneDraw(2, 3, true, 'A')(g);
      const walls = placed.filter((p) => p.sprite === interiorSprite('back-wall', true));
      expect(walls.length).toBeGreaterThanOrEqual(Math.ceil(g.W / 128));
      expect(Math.min(...walls.map((p) => p.x))).toBeLessThanOrEqual(0);
      expect(Math.max(...walls.map((p) => p.x)) + 128).toBeGreaterThanOrEqual(g.W);
      const floor = placed.filter((p) => p.sprite === interiorSprite('floor', true));
      expect(Math.max(...floor.map((p) => p.y)) + 16).toBeGreaterThanOrEqual(g.H);
      const at = (piece: Parameters<typeof interiorSprite>[0]): number =>
        placed.findIndex((p) => p.sprite === interiorSprite(piece, true));
      const lastFloor = Math.max(
        ...placed.flatMap((p, i) => (p.sprite === interiorSprite('floor', true) ? [i] : [])),
      );
      expect(at('rug')).toBeGreaterThan(lastFloor);
      expect(at('furnace-glow')).toBeGreaterThan(at('rug'));
      expect(at('furnace')).toBeGreaterThan(at('furnace-glow'));
      expect(at('door')).toBeGreaterThan(-1);
      expect(at('finished-crate')).toBeGreaterThan(-1);
    }
  });

  it('fills a wide window with dressed edges and keeps the clickable cluster in the middle', () => {
    const g = sceneGeometry(1440, 720, interiorScale(1440, 720, 'A'));
    const placed = interiorSceneDraw(2, 3, true, 'A')(g);
    const lay = interiorLayout(g, 3, 'A');
    // Pieces left of the room and right of it: narrow windows, barrels and sacks on both sides; the rack on the left, a lantern on the right.
    const xsOf = (piece: Parameters<typeof interiorSprite>[0]): number[] =>
      placed.filter((p) => p.sprite === interiorSprite(piece, true)).map((p) => p.x);
    for (const piece of ['window-2', 'barrel', 'sacks'] as const) {
      expect(Math.min(...xsOf(piece)), piece).toBeLessThan(lay.ox);
      expect(Math.max(...xsOf(piece)), piece).toBeGreaterThan(lay.ox + ROOM.w - 1);
    }
    expect(Math.min(...xsOf('tool-rack'))).toBeLessThan(lay.ox);
    expect(Math.max(...xsOf('lantern-hanging'))).toBeGreaterThan(lay.ox + ROOM.w - 1);
    // The cluster is centred: the room's middle is the scene's middle.
    expect(lay.ox + ROOM.w / 2).toBe(g.cx);
    // A phone shows the room and no more: an edge of a pixel or two.
    const phone = sceneGeometry(390, 640, interiorScale(390, 640, 'A'));
    expect(interiorLayout(phone, 2, 'A').ox).toBeLessThanOrEqual(2);
  });

  it('draws the day palette by day', () => {
    const g = sceneGeometry(390, 520, 3);
    const night = interiorSceneDraw(1, 2, true, 'A')(g);
    const day = interiorSceneDraw(1, 2, false, 'A')(g);
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
