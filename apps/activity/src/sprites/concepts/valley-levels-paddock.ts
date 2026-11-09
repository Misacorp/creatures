/**
 * The Paddock at levels 2 to 5, concept art (not in the game). Level 1 is `valley-glow-camp/paddock`; each
 * level here keeps every pixel of the one below and adds something, all outside the roam rectangle
 * (x 8..41, y 9..26 of the sprite, `PADDOCK_ROAM_OFFSET` in `valley/valley-art.ts`). The roof, wall and
 * gate pieces are stamped onto level 1's rows by small shapes below, then kept as the rows they produce.
 *
 * Palette: level 1's, with the three pebble pixels turned into the ground flowers `j` so `p` is free
 * for the barn red (roof, pennant, flower heads). Night is the main palette, `alts.day` recolours it.
 */
import type { SpriteDef } from '../sprite-data';
import { VALLEY_GLOW_CAMP_CONCEPTS } from './valley-glow-camp';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import type { ConceptSet } from './index';

const BASE = VALLEY_GLOW_CAMP_CONCEPTS.sprites['paddock'];
if (!BASE) throw new Error('valley-glow-camp has no paddock');
const BASE_ROWS: readonly string[] = BASE.sprite.rows;
const BASE_DAY: Readonly<Record<string, string>> = BASE.alts?.['day'] ?? {};

type Grid = string[][];

const cloneGrid = (rows: readonly string[]): Grid => rows.map((r) => r.split(''));
const toRows = (g: Grid): string[] => g.map((r) => r.join(''));

/** Stamp a piece with its top-left at (x, y); a space leaves the pixel as it is. */
function stamp(g: Grid, x: number, y: number, piece: readonly string[]): void {
  piece.forEach((line, dy) => {
    [...line].forEach((ch, dx) => {
      if (ch !== ' ') (g[y + dy] as string[])[x + dx] = ch;
    });
  });
}

/** Fill a run of one key on a row from x0 to x1 inclusive. */
function run(g: Grid, y: number, x0: number, x1: number, ch: string): void {
  for (let x = x0; x <= x1; x++) (g[y] as string[])[x] = ch;
}

/** Level 1 with its three pebbles turned to ground flowers, so the key `p` is free. */
function level1(): Grid {
  return cloneGrid(BASE_ROWS.map((r) => r.replaceAll('p', 'j')));
}

/** Level 2: a gate swung open on the left front post, and a water bucket in the gap. */
function addLevel2(g: Grid): void {
  // The gate leaf: two rails (ink, light, dark, ink) that step down one row every 4 columns,
  // so the leaf reads as swung toward the viewer, and a stile at its free end.
  for (const top of [28, 32]) {
    for (let x = 20; x <= 30; x++) {
      const y = top + Math.floor((x - 20) / 4);
      (g[y] as string[])[x] = 'k';
      (g[y + 1] as string[])[x] = 'u';
      (g[y + 2] as string[])[x] = 'v';
      (g[y + 3] as string[])[x] = 'k';
    }
  }
  // The free end: a short post of the same wood, so the leaf reads as one panel.
  stamp(g, 31, 29, ['k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k']);
  run(g, 39, 21, 32, 'x');
  // A hay bale in front of the gate and a water bucket beside it.
  stamp(g, 22, 40, ['kkkkkkkk', 'kihihihk', 'khhhhhhk', 'kkkkkkkk']);
  stamp(g, 35, 34, ['k    k', 'kzZZzk', 'kuuuvk', 'kvvvvk', ' kkkk ']);
  run(g, 39, 35, 40, 'x');
}

/** Level 3: a lean-to roof on the back posts at the right, over the trough side. */
function addLevel3(g: Grid): void {
  roofSpan(g, 27, 57);
}

/** A roof band, rows 2 to 5, from x0 to x1 with stepped ends (a trapezoid, ink all round). */
function roofSpan(g: Grid, x0: number, x1: number): void {
  run(g, 2, x0 + 4, x1 - 4, 'k');
  for (let i = 0; i < 3; i++) {
    const y = 3 + i;
    const a = x0 + 3 - i;
    const b = x1 - 3 + i;
    run(g, y, a, b, 'p');
    (g[y] as string[])[a] = 'k';
    (g[y] as string[])[b] = 'k';
    // shingles: a darker tick every third pixel, shifted a pixel each row
    for (let x = a + 1 + ((i * 2) % 3); x < b; x += 3) (g[y] as string[])[x] = i === 1 ? 'v' : 'p';
    if (i === 0)
      for (let x = a + 1; x < b; x++)
        if ((g[y] as string[])[x] === 'p') (g[y] as string[])[x] = 'u';
  }
}

/** Level 4: the roof carries on over the left half, with a gable and a lit hay hatch in the wall under it. */
function addLevel4(g: Grid): void {
  roofSpan(g, 3, 57); // one roof over the whole back
  // Plank wall instead of the back rail's top rows (rows 6 to 8 lie above the roam area).
  for (let x = 12; x <= 28; x++) {
    const post = (x - 12) % 4 === 3;
    (g[6] as string[])[x] = 'k';
    (g[7] as string[])[x] = post ? 'k' : 'u';
    (g[8] as string[])[x] = post ? 'k' : 'v';
  }
  // The lit hatch.
  stamp(g, 17, 7, ['kGHHHGk', 'kGGGGGk']);
  // A gable over the hatch, one row up and a cap.
  stamp(g, 18, 1, ['kkkkk', 'kpppk']);
}

/** Level 5: a weathervane on the gable, flower boxes in front, a pennant on a pole at the right. */
function addLevel5(g: Grid): void {
  stamp(g, 18, 0, ['kjjjjk']);
  // Flower boxes.
  stamp(g, 3, 38, ['1p1j1p1j1p', 'kuuuuuuuuk', 'kvvvvvvvvk', 'kkkkkkkkkk']);
  stamp(g, 58, 38, ['1p1j1', 'kuuuk', 'kvvvk', 'kkkkk']);
  // The pennant pole stands on the right rail's top corner; the pennant flies out to the right.
  for (let y = 2; y <= 12; y++) stamp(g, 58, y, ['kuk']);
  stamp(g, 58, 13, ['kkk']);
  stamp(g, 61, 2, ['kkk', 'ppk', 'pk ', 'k  ']);
}

const L1 = level1();
const L2 = cloneGrid(toRows(L1));
addLevel2(L2);
const L3 = cloneGrid(toRows(L2));
addLevel3(L3);
const L4 = cloneGrid(toRows(L3));
addLevel4(L4);
const L5 = cloneGrid(toRows(L4));
addLevel5(L5);

const PALETTE: Readonly<Record<string, string>> = { ...BASE.sprite.palette, p: '#b8504a' };
const DAY: Readonly<Record<string, string>> = { ...BASE_DAY, p: '#c8584c' };

/** A level's sprite and its day palette, without the keys that level does not use. */
function level(g: Grid): { sprite: SpriteDef; alts: { day: Record<string, string> } } {
  const rows = toRows(g);
  const used = new Set(rows.join(''));
  const keep = (m: Readonly<Record<string, string>>): Record<string, string> =>
    Object.fromEntries(Object.entries(m).filter(([k]) => used.has(k)));
  return { sprite: { palette: keep(PALETTE), rows }, alts: { day: keep(DAY) } };
}

export const VALLEY_LEVELS_PADDOCK_CONCEPTS: ConceptSet = {
  id: 'valley-levels-paddock',
  title: 'The Paddock, level by level',
  requested:
    '2026-11-09 (Misa, via the valley session): each valley building visibly grows level by level, 1 to 5, by day and night.',
  status: 'draft',
  notes: [
    "Levels 2 to 5 of the Paddock (level 1 is `valley-glow-camp/paddock`). Each keeps everything of the level below and adds one thing; all are 64x51 and start from level 1's pixels. The three pebble pixels of level 1 become ground flowers so the key `p` is free for the barn red.",
    'Level 2: a gate swung open on the left front post and a hay bale and a water bucket in front of it.',
    'Level 3: a lean-to roof on the back posts over the trough side.',
    'Level 4: the roof carries on over the whole back, with a gable, a plank wall and a lit hatch: a small barn front.',
    'Level 5: a weathervane on the gable, flower boxes in front of the fence and a pennant on a pole at the right.',
    'The roam rectangle (x 8..41, y 9..26) holds exactly the pixels of level 1 at every level: nothing is added in it (a test checks). Level 1 itself already has the back rail, the hay pile and the left end of the trough inside that rectangle; creatures walk in front of them.',
    'The back rail below the roam top (rows 9 to 13) is unchanged; the plank wall of level 4 replaces only the rail rows above the rectangle (6 to 8) under the left part of the roof.',
  ],
  ...(VALLEY_GLOW_CONCEPTS.backdrop === undefined
    ? {}
    : { backdrop: VALLEY_GLOW_CONCEPTS.backdrop }),
  levels: {
    paddock: [
      'valley-glow-camp/paddock',
      'valley-levels-paddock/paddock-2',
      'valley-levels-paddock/paddock-3',
      'valley-levels-paddock/paddock-4',
      'valley-levels-paddock/paddock-5',
    ],
  },
  sprites: {
    'paddock-2': {
      kind: 'free',
      note: 'Level 2: the front gap gets a gate swung open on the left post with a hay bale and a water bucket in front.',
      ...level(L2),
    },
    'paddock-3': {
      kind: 'free',
      note: 'Level 3: a lean-to roof of red shingles over the back posts at the right, above the trough.',
      ...level(L3),
    },
    'paddock-4': {
      kind: 'free',
      note: 'Level 4: the roof runs over the whole back with a gable, a plank wall and a lit hatch (lamp glow by night, pale glass by day).',
      ...level(L4),
    },
    'paddock-5': {
      kind: 'free',
      note: 'Level 5: a weathervane on the gable, flower boxes before the front rails and a red pennant on a pole.',
      ...level(L5),
    },
  },
};
