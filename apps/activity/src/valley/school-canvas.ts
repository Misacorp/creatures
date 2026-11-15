/**
 * The School's scene as a canvas (`SchoolCanvas.tsx`; the rule is "A place is a canvas" in `ux-patterns.md`): the School with its yard,
 * the lectern and the visiting teacher at it, the bench's two student seats, and, while the School has a project being built, the
 * builders' corner (`builders-corner.ts`) clearly apart from it. The scene fills the window at the largest whole pixel scale that
 * shows the working area; the new edges of a wide window are dressed with quiet pieces (`edgeDressing`) with no plate and no tap. Pure:
 * the scene's size goes in, scale, placements and boxes come out. The ground is the place scene's (`place-scene.ts`).
 *
 * The working area, in art pixels from the School's top-left (the yard's 80 pixels are at x -2 to 78, its bottom row is 62): the School,
 * its yard and the plates under the seats, and the corner, which stands
 * (the graduation stage stands under the yard, so the working area reaches its bottom row and the plate under it)
 * - beside the yard at the right on a window wide enough for both (`mode: 'beside'`: the corner's feet level with the seats' feet), else
 * - under the yard (`'below'`, a phone), else
 * - nowhere (`'none'`: no project, the School's area uses the whole height).
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { SCALE_MAX, SCALE_MIN, edgeDressing, type CornerMode } from './bonfire-canvas';
import { CORNER, cornerPlacements, type Pile } from './builders-corner';
import { PLATE_ROW_PX } from './place-plates';
import { propArt, propSize } from './place-prop-art';
import { artSize, grassTo, skyBackdrop, treesAround, type ArtBox } from './place-scene';
import type { SceneGeometry } from './SceneFrame';
import {
  BELL_AT,
  CREATURE,
  SEAT_FEET,
  YARD_FROM_SCHOOL,
  YARD_SIZE,
  bellSprite,
  lecternSprite,
  lecternTopLeft,
  studentSpot,
  teacherSprite,
  teacherTopLeft,
  yardSprite,
} from './school-yard';
import { glowSprite } from './valley-places';
import type { Placement } from './valley-art';

/** Scene pixels from the clear zone's top to the School's art. */
export const ART_Y = 10;
/** The yard's left edge and right edge from the School's left (the yard is 80 wide at x -2), and the row it ends on. */
export const YARD_LEFT = YARD_FROM_SCHOOL.x;
export const YARD_RIGHT = YARD_FROM_SCHOOL.x + YARD_SIZE.width;
export const YARD_BOTTOM = YARD_FROM_SCHOOL.y + YARD_SIZE.height;
/** The row the seats' feet stand on (the last row of a student's sprite), from the School's top. */
export const SEATS_FEET = YARD_FROM_SCHOOL.y + (SEAT_FEET[0]?.y ?? 12);
/** Scene pixels the corner stands from the yard, beside it, and under it, below it. */
const GAP_BESIDE = 10;
const GAP_BELOW = 2;
/** Scene pixels the working area keeps from each side edge. */
const EDGE = 6;

/** The School's own art box (its picture, 60 by 50). */
export const schoolArt = (): { width: number; height: number } => artSize('school');

/**
 * The graduation stage (the art library's `graduation-stage`, Misa's pick B, the banner arch: 48x24, base row 22) stands in front of the
 * yard, centred on it, in the grass below the yard's last row: clear of the house, the bench seats, the teacher and the builders' corner.
 * Its whole box is the Graduation target, the plate under it. In art pixels from the School's top-left.
 */
export const STAGE_SIZE = propSize('graduationStage');
export const STAGE_AT = {
  x: YARD_LEFT + Math.floor((YARD_RIGHT - YARD_LEFT - STAGE_SIZE.width) / 2),
  y: YARD_BOTTOM + 1,
};
/** The row (from the School's top) the stage's art ends on. */
export const STAGE_BOTTOM = STAGE_AT.y + STAGE_SIZE.height;

/** The width the yard and the corner side by side need. */
function besideWidth(): number {
  return YARD_RIGHT - YARD_LEFT + GAP_BESIDE + CORNER.w + 2 * EDGE;
}

/** Where the corner stands in a scene `width` scene pixels wide. */
export function modeFor(width: number, corner: boolean): CornerMode {
  if (!corner) return 'none';
  return width >= besideWidth() ? 'beside' : 'below';
}

/** The width and the height the working area needs, in scene pixels. */
function needed(mode: CornerMode, s: number): { w: number; h: number } {
  const yardW = YARD_RIGHT - YARD_LEFT + 2 * EDGE;
  const groupH = ART_Y + STAGE_BOTTOM + Math.ceil(PLATE_ROW_PX / s) + 2;
  if (mode === 'beside') return { w: besideWidth(), h: groupH };
  if (mode === 'none') return { w: yardW, h: groupH };
  return {
    w: Math.max(yardW, CORNER.w + 2 * EDGE),
    h: groupH + GAP_BELOW + CORNER.feet + Math.ceil(PLATE_ROW_PX / s) + 2,
  };
}

/**
 * The scene's one pixel scale, as the Bonfire's and the Forge's: the largest whole number from `SCALE_MIN` to `SCALE_MAX` at which
 * the working area fits both ways. It depends on the window and on whether there is a corner, never on who sits at the School, so the
 * scene keeps its size while you are in it.
 */
export function schoolScale(width: number, height: number, corner: boolean): number {
  for (let s = SCALE_MAX; s > SCALE_MIN; s -= 1) {
    const w = Math.ceil(width / s);
    const h = Math.ceil(height / s);
    const need = needed(modeFor(w, corner), s);
    if (w >= need.w && h >= need.h) return s;
  }
  return SCALE_MIN;
}

export interface SchoolLayout {
  mode: CornerMode;
  /** The School's art box in scene pixels (the yard hangs below and 2 px left of it). */
  box: ArtBox;
  /** The corner's top-left in scene pixels (null with no corner). */
  corner: { x: number; y: number } | null;
  /** The working area's left and right edges in scene pixels, corner included. */
  extent: { left: number; right: number };
}

/**
 * Where everything stands in a scene of `g`'s size: the working area is centred sideways. Under the yard the corner stands at the bottom
 * of the screen and the School centred in the room above it; otherwise the spare height goes a little above the working area.
 */
export function schoolLayout(
  g: Pick<SceneGeometry, 'W' | 'H' | 'cx' | 's'>,
  corner: boolean,
): SchoolLayout {
  const art = schoolArt();
  const mode = modeFor(g.W, corner);
  const need = needed(mode, g.s);
  const groupW = YARD_RIGHT - YARD_LEFT;
  const cornerY = g.H - (CORNER.feet + Math.ceil(PLATE_ROW_PX / g.s) + 2) - 2;
  const used = STAGE_BOTTOM + Math.ceil(PLATE_ROW_PX / g.s);
  const y =
    mode === 'below'
      ? ART_Y + Math.floor(Math.max(0, cornerY - GAP_BELOW - ART_Y - used) / 2)
      : ART_Y + Math.floor(Math.max(0, g.H - need.h) * 0.4);
  const x =
    mode === 'beside'
      ? g.cx - Math.floor((groupW + GAP_BESIDE + CORNER.w) / 2) - YARD_LEFT
      : g.cx - Math.floor(groupW / 2) - YARD_LEFT;
  let at: { x: number; y: number } | null = null;
  if (mode === 'beside') {
    at = { x: x + YARD_RIGHT + GAP_BESIDE, y: y + SEATS_FEET - CORNER.feet };
  } else if (mode === 'below') {
    at = { x: g.cx - Math.floor(CORNER.w / 2), y: Math.max(cornerY, y + used + GAP_BELOW) };
  }
  return {
    mode,
    box: { x, y, ...art },
    corner: at,
    extent: {
      left: Math.min(x + YARD_LEFT, at?.x ?? Number.POSITIVE_INFINITY),
      right: Math.max(x + YARD_RIGHT, at === null ? Number.NEGATIVE_INFINITY : at.x + CORNER.w),
    },
  };
}

/** What the visit puts in the yard (the picture's own, from the teacher's phase). */
export interface YardVisit {
  /** The lectern stands (a teacher is here or announced). */
  lectern: boolean;
  /** The bell hangs tilted (announced). */
  bell: boolean;
  /** The teacher's species at the lectern (here), or null. */
  teacher: string | null;
}

/**
 * The scene: grass and sky to every edge, the edges dressed, the trees round the place, the builders' corner while there is one, the
 * yard under the School, the graduation stage in front of it, the School, and the visit's pieces (the bell, the lectern, the teacher at it).
 */
export function schoolSceneDraw(visit: YardVisit, corner: Pile | null) {
  return (g: SceneGeometry): Placement[] => {
    const lay = schoolLayout(g, corner !== null);
    const { box } = lay;
    const teacher: SpriteDef | null = visit.teacher === null ? null : teacherSprite(visit.teacher);
    const yard = { x: box.x + YARD_FROM_SCHOOL.x, y: box.y + YARD_FROM_SCHOOL.y };
    return [
      ...grassTo(g),
      ...skyBackdrop(g, box.y - g.top),
      ...edgeDressing(g, { ...box, height: STAGE_BOTTOM }, lay.extent),
      ...treesAround(box.x, box.y, box),
      ...(lay.corner === null
        ? []
        : cornerPlacements(
            lay.corner.x,
            lay.corner.y,
            corner ?? { material: 'timber', size: 's' },
          )),
      { sprite: yardSprite(), x: yard.x, y: yard.y },
      { sprite: propArt('graduationStage'), x: box.x + STAGE_AT.x, y: box.y + STAGE_AT.y },
      { sprite: glowSprite('school'), x: box.x, y: box.y },
      ...(visit.bell ? [{ sprite: bellSprite(), x: box.x + BELL_AT.x, y: box.y + BELL_AT.y }] : []),
      ...(visit.lectern
        ? [
            {
              sprite: lecternSprite(),
              x: box.x + lecternTopLeft().x,
              y: box.y + lecternTopLeft().y,
            },
          ]
        : []),
      ...(teacher === null
        ? []
        : [{ sprite: teacher, x: box.x + teacherTopLeft().x, y: box.y + teacherTopLeft().y }]),
    ];
  };
}

/** A tap target's box in art pixels from the School's top-left. */
export interface TargetBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The student seats a lesson offers (the first two of the bench), by the server's seat index: where the creature's top-left stands. */
export function seatBox(index: number): TargetBox | null {
  const spot = studentSpot(index);
  return spot === null ? null : { x: spot.x, y: spot.y, w: CREATURE, h: CREATURE };
}

/**
 * The lectern and the teacher at it, one target. The first seat stands by the teacher (its right edge reaches the teacher's left by a
 * pixel or two): the seat keeps those pixels, so the two targets never overlap.
 */
export function lecternBox(): TargetBox {
  const lectern = lecternTopLeft();
  const teacher = teacherTopLeft();
  const seat = seatBox(0);
  const x = Math.max(Math.min(lectern.x, teacher.x), seat === null ? 0 : seat.x + seat.w);
  const y = Math.min(lectern.y, teacher.y);
  const right = Math.max(lectern.x + 22, teacher.x + CREATURE);
  const bottom = Math.max(lectern.y + 17, teacher.y + CREATURE);
  return { x, y, w: right - x, h: bottom - y };
}

/** The graduation stage: the way into the graduation (the ceremony is held at the School). The prop's whole box, in front of the yard. */
export const STAGE_BOX: TargetBox = {
  ...STAGE_AT,
  w: STAGE_SIZE.width,
  h: STAGE_SIZE.height,
};
