import { describe, expect, it } from 'vitest';
import { BUNDLED_CREATURE_SPRITES } from '../../sprites/creature-sprites';
import { parseSprite } from '../../sprites/sprite-data';
import {
  BELL_FRAMES,
  SEAT_FEET,
  SEAT_ORDER,
  YARD_AT,
  YARD_SIZE,
  bellFrame,
  bellRings,
  bellSprite,
  bellTopLeft,
  lecternSprite,
  lecternStands,
  lecternTopLeft,
  seatOfStudent,
  seatTopLeft,
  teacherSprite,
  teacherTopLeft,
  yardSprite,
} from './school-yard';

const WEEK = [1, 2, 3, 4, 5, 6, 7];

describe("the School's yard placements", () => {
  it("puts a creature's top-left at the seat's x minus 8 and row minus 15 in the yard", () => {
    expect(seatTopLeft(0)).toEqual({ x: YARD_AT.x + 1, y: YARD_AT.y - 3 });
    expect(seatTopLeft(3)).toEqual({ x: YARD_AT.x + 40, y: YARD_AT.y - 3 });
    expect(seatTopLeft(4)).toBeNull();
    for (const [i, feet] of SEAT_FEET.entries()) {
      expect(seatTopLeft(i)?.x).toBe(YARD_AT.x + feet.x - 8);
    }
  });

  it('puts the lectern foot at yard (68, 14) and the teacher at top-left (54, -1)', () => {
    expect(lecternTopLeft()).toEqual({ x: YARD_AT.x + 58, y: YARD_AT.y - 1 });
    expect(teacherTopLeft()).toEqual({ x: YARD_AT.x + 54, y: YARD_AT.y - 1 });
  });

  it('keeps the teacher and every seat inside the yard and the lectern', () => {
    const inside = (p: { x: number; y: number } | null, w: number): boolean =>
      p !== null && p.x >= YARD_AT.x && p.x + w <= YARD_AT.x + YARD_SIZE.width;
    expect(inside(lecternTopLeft(), 22)).toBe(true);
    expect(inside(teacherTopLeft(), 16)).toBe(true);
    for (let i = 0; i < SEAT_FEET.length; i += 1) expect(inside(seatTopLeft(i), 16)).toBe(true);
  });

  it('fills the seat by the teacher first and leaves a gap between two students', () => {
    expect(seatOfStudent(0)).toBe(3);
    expect(seatOfStudent(1)).toBe(1);
    expect(seatOfStudent(4)).toBeNull();
    expect([...SEAT_ORDER].sort()).toEqual([0, 1, 2, 3]);
  });

  it('places the bell at (27, 7) on the School, which sits at (2, 0) in the art', () => {
    expect(bellTopLeft()).toEqual({ x: 29, y: 7 });
  });

  it('plays rest, left, rest, right while ringing and rests otherwise', () => {
    expect([0, 1, 2, 3, 4, 5].map((t) => bellFrame(t, true))).toEqual([
      'rest',
      'left',
      'rest',
      'right',
      'rest',
      'left',
    ]);
    expect(BELL_FRAMES).toHaveLength(4);
    expect(bellFrame(1, false)).toBe('rest');
  });

  it('rings the weekend before and on arrival, stands the lectern until Wednesday', () => {
    expect(WEEK.map(bellRings)).toEqual([true, false, false, false, false, true, true]);
    expect(WEEK.map(lecternStands)).toEqual([true, true, true, false, false, true, true]);
  });
});

describe("the School's yard sprites", () => {
  it('has the sizes the art notes give, in day and night', () => {
    for (const time of ['day', 'night'] as const) {
      expect(parseSprite(yardSprite(time)).width).toBe(YARD_SIZE.width);
      expect(parseSprite(yardSprite(time)).height).toBe(YARD_SIZE.height);
      expect(parseSprite(lecternSprite(time)).width).toBe(22);
      expect(parseSprite(lecternSprite(time)).height).toBe(17);
      for (const frame of BELL_FRAMES) {
        expect(parseSprite(bellSprite(frame, time)).width).toBe(6);
        expect(parseSprite(bellSprite(frame, time)).height).toBe(6);
      }
    }
    expect(yardSprite('day')).not.toBe(yardSprite('night'));
    expect(bellSprite('left', 'night')).not.toBe(bellSprite('right', 'night'));
  });

  it('puts the cap on every species a teacher can be', () => {
    for (const species of ['stormray', 'mossback', 'coralynx', 'lanternfin']) {
      const worn = teacherSprite(species);
      expect(worn, species).not.toBeNull();
      expect(worn?.rows).not.toEqual(BUNDLED_CREATURE_SPRITES[species]?.rows);
      expect(worn?.rows).toHaveLength(16);
    }
    expect(teacherSprite('no-such-species')).toBeNull();
  });
});
