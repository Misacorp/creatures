/**
 * The School's yard and the visit's props (prototype, dev only): where the yard, the bench seats, the lectern, the
 * teacher and the bell stand, in the scene's art pixels. The art is `valley-school.ts` (`school-yard` 80x24,
 * `school-lectern` 22x17, `school-bell` 6x6, `teacher-cap` 16x8); every number here is from its notes.
 *
 * The School's art rect is the whole composition (the yard is wider than the School): 80 wide, the School
 * itself at `SCHOOL_AT` inside it and the yard under it at `YARD_AT` (the yard's top-left is the School's top-left
 * plus (-2, 38), so the yard's columns 31 and 32 are under the door). Points here are in that rect's pixels.
 */
import { BUNDLED_CREATURE_SPRITES } from '../../sprites/creature-sprites';
import { VALLEY_SCHOOL_CONCEPTS, withCap } from '../../sprites/concepts/valley-school';
import { swapPalette, type SpriteDef } from '../../sprites/sprite-data';
import type { Time } from './valley-places';

interface Point {
  x: number;
  y: number;
}

/** The School sprite's top-left in the art rect, and the yard's. */
export const SCHOOL_AT: Point = { x: 2, y: 0 };
export const YARD_AT: Point = { x: 0, y: 38 };
export const YARD_SIZE = { width: 80, height: 24 } as const;

/** A creature sprite is 16x16; its feet are the last row, the middle of the row. */
export const CREATURE = 16;

/** The four bench seats' feet points in the yard's pixels. */
export const SEAT_FEET: readonly Point[] = [
  { x: 9, y: 12 },
  { x: 22, y: 12 },
  { x: 35, y: 12 },
  { x: 48, y: 12 },
];

/** The seats a lesson's students take, first to last: the one by the teacher, then one with a gap, then the rest. */
export const SEAT_ORDER: readonly number[] = [3, 1, 2, 0];

/** The lectern's foot (its own pixels) and where it stands, and the teacher's feet, in the yard's pixels. */
export const LECTERN_FOOT: Point = { x: 10, y: 15 };
export const LECTERN_AT: Point = { x: 68, y: 14 };
export const TEACHER_FEET: Point = { x: 62, y: 14 };

/** A point of the yard in the art rect. */
const inYard = (p: Point): Point => ({ x: YARD_AT.x + p.x, y: YARD_AT.y + p.y });

/** The top-left of a creature standing with its feet at `feet`: its last row (15) is on the feet's row. */
function standing(feet: Point): Point {
  return { x: feet.x - CREATURE / 2, y: feet.y - (CREATURE - 1) };
}

/** The art-rect top-left of the creature on bench seat `seat` (0 to 3), or null for a seat that does not exist. */
export function seatTopLeft(seat: number): Point | null {
  const feet = SEAT_FEET[seat];
  return feet === undefined ? null : inYard(standing(feet));
}

/** The seat of the `n`th student (0 first), or null when the bench has no more. */
export function seatOfStudent(n: number): number | null {
  return SEAT_ORDER[n] ?? null;
}

/** The art-rect top-left of the lectern. */
export function lecternTopLeft(): Point {
  return inYard({ x: LECTERN_AT.x - LECTERN_FOOT.x, y: LECTERN_AT.y - LECTERN_FOOT.y });
}

/** The art-rect top-left of the teacher standing at the lectern. */
export function teacherTopLeft(): Point {
  return inYard(standing(TEACHER_FEET));
}

/** The art-rect top-left of the bell's 6x6 overlay: (27, 7) on the School sprite. */
export function bellTopLeft(): Point {
  return { x: SCHOOL_AT.x + 27, y: SCHOOL_AT.y + 7 };
}

/** The bell's frames in order while it rings. */
export const BELL_FRAMES = ['rest', 'left', 'rest', 'right'] as const;
export type BellFrame = (typeof BELL_FRAMES)[number];

/** The frame at a tick: always rest while it is not ringing. */
export function bellFrame(tick: number, ringing: boolean): BellFrame {
  if (!ringing) return 'rest';
  return BELL_FRAMES[((Math.floor(tick) % 4) + 4) % 4] ?? 'rest';
}

/** Whether the bell rings on an ISO weekday: the weekend before the visit and the day it arrives. */
export function bellRings(weekday: number): boolean {
  return weekday >= 6 || weekday === 1;
}

/** Whether the lectern stands in the yard: from the weekend before the visit to its last day. */
export function lecternStands(weekday: number): boolean {
  return weekday >= 6 || weekday <= 3;
}

// --- The sprites ---

function concept(id: string) {
  const found = VALLEY_SCHOOL_CONCEPTS.sprites[id];
  if (found === undefined) throw new Error(`valley-school has no ${id}`);
  return found;
}

const cache = new Map<string, SpriteDef | null>();

function lit(id: string, time: Time, variant?: 'left' | 'right'): SpriteDef {
  const key = `${id}|${time}|${variant ?? ''}`;
  let hit = cache.get(key);
  if (hit === undefined || hit === null) {
    const c = concept(id);
    const base = variant === undefined ? c.sprite : (c.variants?.[variant] ?? c.sprite);
    const day = c.alts?.['day'];
    hit = time === 'day' && day !== undefined ? swapPalette(base, day) : base;
    cache.set(key, hit);
  }
  return hit;
}

/** The yard in the light of the valley (80x24). */
export const yardSprite = (time: Time): SpriteDef => lit('school-yard', time);
/** The lectern in the light of the valley (22x17). */
export const lecternSprite = (time: Time): SpriteDef => lit('school-lectern', time);
/** The bell at a frame in the light of the valley (6x6). */
export const bellSprite = (frame: BellFrame, time: Time): SpriteDef =>
  lit('school-bell', time, frame === 'rest' ? undefined : frame);

/**
 * The teacher's species wearing the mortarboard instead of a hat (fixed colour, its tassel on the left when
 * shown mirrored). A species whose colour keys clash with the cap's, or an unknown one, gives null (shown bare).
 */
export function teacherSprite(species: string): SpriteDef | null {
  const key = `teacher|${species}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const base = BUNDLED_CREATURE_SPRITES[species];
  let made: SpriteDef | null = null;
  if (base !== undefined) {
    try {
      made = withCap(base);
    } catch {
      made = null;
    }
  }
  cache.set(key, made);
  return made;
}
