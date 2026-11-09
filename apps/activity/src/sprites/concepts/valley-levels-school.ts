/**
 * The School grown level by level, concept art (not in the game), in the "valley glow" style (`valley-glow.ts`,
 * where level 1 is `school`). Every level is the level below plus one clear addition, drawn as patches over the
 * level 1 pixels so the door, the sign and the bell cupola (rows 7-12, x 27-32) never move: the yard and the
 * `school-bell` overlay of the visiting-teacher scene keep fitting. Same keys and palettes as `school`; the main
 * palette is night, `alts.day` is the same pixels with plain glass.
 *
 * 2: a flagpole with a pennant on the right and a flower box under each window.
 * 3: a side wing on the right with a third lit window.
 * 4: a garden fence with flowers in front and a chalkboard sign by the wing.
 * 5: a gold finial and band on the cupola roof, lanterns by the door and bunting along the eaves.
 */
import type { SpriteDef } from '../sprite-data';
import { expandRows } from '../sprite-data';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import type { ConceptSet } from './index';

const BASE = VALLEY_GLOW_CONCEPTS.sprites['school'];
if (BASE === undefined) throw new Error('valley-glow has no school sprite');
const SCHOOL = BASE.sprite;
const SCHOOL_DAY = BASE.alts?.['day'] ?? {};

type Patch = readonly [x: number, y: number, text: string];

/** Draws the patches over rows; a `.` in a patch leaves the pixel below as it is. */
function patched(rows: readonly string[], patches: readonly Patch[]): string[] {
  const grid = rows.map((r) => [...r]);
  for (const [x, y, text] of patches) {
    [...text].forEach((ch, i) => {
      const row = grid[y];
      if (row === undefined || x + i >= row.length)
        throw new Error(`patch off the canvas at ${x + i},${y}`);
      if (ch !== '.') row[x + i] = ch;
    });
  }
  return grid.map((r) => r.join(''));
}

const BASE_ROWS = expandRows(SCHOOL);

/** Level 2: a flagpole with a pennant flying left, and a flower box under each window. */
const L2_PATCHES: readonly Patch[] = [
  // flagpole on the right (x 57-59): a ball on top, a stone foot, the pennant flying left
  [58, 12, 'k'],
  [57, 13, 'kuk'],
  ...Array.from({ length: 24 }, (_, i): Patch => [57, 14 + i, 'kwk']),
  [57, 38, 'kmk'],
  [57, 39, 'kkk'],
  [52, 14, 'kkkkk'],
  [52, 15, 'kuulu'],
  [53, 16, 'kuuu'],
  [54, 17, 'kuu'],
  [55, 18, 'kk'],
  // flower boxes: flowers on the sill row, the box below
  [16, 35, '1q1c1q1u'],
  [16, 36, 'kvvvvvvk'],
  [16, 37, 'kkkkkkkk'],
  [37, 35, 'u1q1c1q1'],
  [37, 36, 'kvvvvvvk'],
  [37, 37, 'kkkkkkkk'],
];

/** Level 3: a small side wing on the right with a third lit window. */
const L3_PATCHES: readonly Patch[] = [
  [47, 29, 'kkkkk'],
  [47, 30, 'kqRqqRk'],
  [47, 31, 'kRqRRqRk'],
  [47, 32, 'kqRqqRqRk'],
  [47, 33, 'kkkkkkkkkk'],
  [47, 34, 'aaaaaaaak'],
  [47, 35, 'mmuuuummk'],
  [47, 36, 'mmucyummk'],
  [47, 37, 'mmuyyummk'],
  [47, 38, 'aauuuuaak'],
  [47, 39, 'kkkkkkkkkk'],
];

/** Level 4: a garden fence with flowers in front, and a chalkboard sign by the wing. */
const FENCE = ['k.k.k.k.k', 'klklklklk', 'kuuuuuuuk', 'klklklklk', 'k.k.k.k.k'];
const L4_PATCHES: readonly Patch[] = [
  ...FENCE.map((row, i): Patch => [14, 43 + i, row]),
  ...FENCE.map((row, i): Patch => [37, 43 + i, row]),
  [15, 42, 'q..u..c'],
  [38, 42, 'u..q..c'],
  [48, 41, 'kkkkkkk'],
  [48, 42, 'ktcttck'],
  [48, 43, 'kttcttk'],
  [48, 44, 'kctcttk'],
  [48, 45, 'kvvvvvk'],
  [49, 46, 'k...k'],
];

/** Bunting under the eaves: a pennant every second pixel, two rows tall except over the door arch. */
const BUNTING: Patch[] = [];
for (let i = 0; i < 14; i += 1) {
  const x = 16 + i * 2;
  const colour = 'uqc'[i % 3] ?? 'u';
  BUNTING.push([x, 26, colour]);
  if (x < 26 || x > 33) BUNTING.push([x, 27, colour]);
}

/** Level 5: a gold finial and band on the cupola roof, lanterns by the door, bunting along the eaves. */
const L5_PATCHES: readonly Patch[] = [
  [29, 0, 'kk'],
  [28, 1, 'kuuk'],
  [26, 5, 'uuuuuuuu'],
  ...[23, 34].flatMap((x): Patch[] => [
    [x, 29, 'kkk'],
    [x, 30, 'kyk'],
    [x, 31, 'kck'],
    [x, 32, 'kyk'],
    [x, 33, 'kkk'],
  ]),
  ...BUNTING,
];

function level(patches: readonly Patch[]): SpriteDef {
  return { palette: SCHOOL.palette, rows: patched(BASE_ROWS, patches) };
}

const L3 = [...L2_PATCHES, ...L3_PATCHES];
const L4 = [...L3, ...L4_PATCHES];
const L5 = [...L4, ...L5_PATCHES];

export const VALLEY_LEVELS_SCHOOL_CONCEPTS: ConceptSet = {
  id: 'valley-levels-school',
  title: 'The School, level by level',
  requested:
    '2026-11-09 (Misa, via the valley session): each valley building visibly grows level by level, 1 to 5, by day and night.',
  status: 'draft',
  notes: [
    'Level 1 is `valley-glow/school`; each level keeps everything of the one below. The door, the sign and the bell cupola (rows 7-12, x 27-32) never change, so the visiting-teacher yard and bell overlay keep fitting.',
    'Level 2 flagpole and flower boxes; 3 side wing with a third window; 4 garden fence and chalkboard; 5 gold finial, door lanterns and bunting.',
    'Needs the School building levels (V-COM-1) before this art is used.',
  ],
  backdrop: VALLEY_GLOW_CONCEPTS.backdrop,
  levels: {
    school: [
      'valley-glow/school',
      'valley-levels-school/school-2',
      'valley-levels-school/school-3',
      'valley-levels-school/school-4',
      'valley-levels-school/school-5',
    ],
  },
  sprites: {
    'school-2': {
      kind: 'free',
      note: 'The School at level 2: a flagpole with an orange pennant on the right and a flower box under each window.',
      sprite: level(L2_PATCHES),
      alts: { day: SCHOOL_DAY },
    },
    'school-3': {
      kind: 'free',
      note: 'Level 3: a side wing on the right with a third lit window (plain glass by day).',
      sprite: level(L3),
      alts: { day: SCHOOL_DAY },
    },
    'school-4': {
      kind: 'free',
      note: 'Level 4: a garden fence with flowers in front of the school and a chalkboard sign by the wing.',
      sprite: level(L4),
      alts: { day: SCHOOL_DAY },
    },
    'school-5': {
      kind: 'free',
      note: 'Level 5: a gold finial and band on the cupola roof, a lantern each side of the door and bunting along the eaves.',
      sprite: level(L5),
      alts: { day: SCHOOL_DAY },
    },
  },
};
