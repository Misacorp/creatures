/**
 * The School's yard and the visit's props in the School's scene (phase 5 step 9b, `systems/school.md` V-SCH-11): where the yard, the bench
 * seats, the lectern, the teacher and the bell stand, in the School sprite's own pixels, from the art's notes (`valley-school.ts`:
 * `school-yard` 80x24, `school-lectern` 22x17, `school-bell` 6x6, `teacher-cap` 16x8). The yard is wider than the School (the School is
 * 60 wide at x 2 of an 80 wide composition), and its top rows are under the School's steps, so it is drawn first. Pure; day light only.
 */
import { BUNDLED_CREATURE_SPRITES } from '../sprites/creature-sprites';
import { VALLEY_SCHOOL_CONCEPTS, withCap } from '../sprites/concepts/valley-school';
import { swapPalette, type SpriteDef } from '../sprites/sprite-data';

interface Point {
  x: number;
  y: number;
}

/** A creature sprite is 16x16; its feet are the last row, the middle of the row. */
export const CREATURE = 16;

/** The School sprite is 60 wide; the yard composition is 80, with the School at x 2 inside it. */
export const SCHOOL_WIDTH = 60;
export const YARD_SIZE = { width: 80, height: 24 } as const;
/** The yard's top-left from the School's top-left (its columns 31 and 32 are under the door). */
export const YARD_FROM_SCHOOL: Point = { x: -2, y: 38 };

/**
 * Scene pixels the School's art is moved left of centre so the 80-wide composition (yard included) is the centred thing: `bandArtBox`
 * moves the art left by half of this, and the yard hangs 2 px left of the art and 18 px past its right edge.
 */
export const YARD_ASIDE = 16;

/** The four bench seats' feet points, in the yard's pixels. */
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

/** The bell's 6x6 overlay on the School sprite's cupola opening. */
export const BELL_AT: Point = { x: 27, y: 7 };

/** The top-left of a creature standing with its feet at `feet`: its last row (15) is on the feet's row. */
const standing = (feet: Point): Point => ({ x: feet.x - CREATURE / 2, y: feet.y - (CREATURE - 1) });

/** A point of the yard, in the School sprite's pixels (the art's top-left is the School's). */
const inSchool = (p: Point): Point => ({
  x: YARD_FROM_SCHOOL.x + p.x,
  y: YARD_FROM_SCHOOL.y + p.y,
});

/** The School-pixel top-left of a student on bench seat `seat` (0 to 3), or null for a seat that does not exist. */
export function seatTopLeft(seat: number): Point | null {
  const feet = SEAT_FEET[seat];
  return feet === undefined ? null : inSchool(standing(feet));
}

/** The School-pixel top-left of the `n`th student (0 first), or null when the bench has no more. */
export function studentSpot(n: number): Point | null {
  const seat = SEAT_ORDER[n];
  return seat === undefined ? null : seatTopLeft(seat);
}

/** The School-pixel top-left of the lectern. */
export const lecternTopLeft = (): Point =>
  inSchool({ x: LECTERN_AT.x - LECTERN_FOOT.x, y: LECTERN_AT.y - LECTERN_FOOT.y });

/** The School-pixel top-left of the teacher standing at the lectern. */
export const teacherTopLeft = (): Point => inSchool(standing(TEACHER_FEET));

/** The School-pixel top-left of the yard. */
export const yardTopLeft = (): Point => ({ ...YARD_FROM_SCHOOL });

// --- The sprites, in the valley's day light ---

function concept(id: string) {
  const found = VALLEY_SCHOOL_CONCEPTS.sprites[id];
  if (found === undefined) throw new Error(`valley-school has no ${id}`);
  return found;
}

const cache = new Map<string, SpriteDef | null>();

function day(id: string, variant?: 'left' | 'right'): SpriteDef {
  const key = `${id}|${variant ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined && hit !== null) return hit;
  const c = concept(id);
  const base = variant === undefined ? c.sprite : (c.variants?.[variant] ?? c.sprite);
  const alt = c.alts?.['day'];
  const made = alt === undefined ? base : swapPalette(base, alt);
  cache.set(key, made);
  return made;
}

/** The yard in the day light (80x24). */
export const yardSprite = (): SpriteDef => day('school-yard');
/** The lectern in the day light (22x17). */
export const lecternSprite = (): SpriteDef => day('school-lectern');
/** The bell tilted one way (6x6): drawn over the cupola while the teacher is announced. */
export const bellSprite = (): SpriteDef => day('school-bell', 'left');

/** The teachers' species and the places they come from (the compendium: far places send them); never one the player owns. */
const TEACHERS: readonly string[] = ['stormray', 'mossback', 'coralynx', 'lanternfin'];

/** A small steady number from a text (the same talent always draws the same teacher). */
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 1_000_003;
  return h;
}

/** The visiting teacher's species: by the talent it brings, skipping the species the player owns (so it is never mistaken for a creature of theirs). */
export function teacherSpecies(talentId: string, owned: ReadonlySet<string>): string {
  const free = TEACHERS.filter((s) => !owned.has(s) && BUNDLED_CREATURE_SPRITES[s] !== undefined);
  const list = free.length > 0 ? free : TEACHERS;
  return list[hash(talentId) % list.length] ?? 'stormray';
}

/** The teacher's species wearing the mortarboard (fixed colour); the bare species when the cap clashes with its colours. */
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
      made = base;
    }
  }
  cache.set(key, made);
  return made;
}
