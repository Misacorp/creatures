/**
 * The Bonfire, level by level. Levels 3 to 5 of the hearth, each drawn from the pixels of the level below (the first two
 * levels are `valley-glow/bonfire` and `valley-glow/bonfire-grand`), so the five read as one hearth growing.
 *
 * The three sprites are built from the grand hearth's rows by small named steps, so what each level adds is the list
 * of steps, and everything below it stays untouched. The result is plain pixel data like any other sprite.
 */

import type { SpriteDef } from '../sprite-data';
import type { ConceptSet } from './index';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';

const W = 64;
const H = 50;

/** The grand hearth (`valley-glow/bonfire-grand`) rows, the starting point of every level here. */
const GRAND_ROWS: readonly string[] = [
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '................................................................',
  '......................................y.........................',
  '................................................................',
  '.............................o....o.o...........................',
  '.................................oo.............................',
  '...........................o....oyo.............................',
  '...........................o....oyo.............................',
  '...........................oy...oyo..o..........................',
  '....k.......................oy..oyo.oy.....................k....',
  '...kuk......................oyo.oyo.oyo...................kuk...',
  '.kkkukkk..................y.oyooycyooyo.................kkkukkk.',
  'kuuuuuuuk....................oyyycyyyo.................kuuuuuuuk',
  '.kGGGGGk......................oycyyo.......y............kGGGGGk.',
  '..GHHHG.............o..........oycyo.....................GHHHG..',
  '..GHHHG...............o........oycyo...s.o...............GHHHG..',
  '..GHHHG...............oy.......oycyo...syo...............GHHHG..',
  '..GGGGG................oyo...kkoycyokksoyo...............GGGGG..',
  '..GGGGG................oyok.kssoycyosssoyokk.............GGGGG..',
  '.kwwwwwk...........kk.koyotkssroycyorssoyotsk...........kwwwwwk.',
  '..kkwkk...........kstksoyoSSttroycyorttoyotssk...........kkwkk..',
  '...kwk...........ksttSsoyoSSsroycccyortoyottsskkk.........kwk...',
  '...kwk.........kkssttSSocoSssroycccyortocottSSttsk........kwk...',
  '...kwk....kkkkkstssttSSocostroycccccyorocostSSttskkkkkk...kwk...',
  '...kwk..kkvvvvvuutsttSsycytroyycccccyyoycyssSSttuuvvvvvkk.kwk...',
  '...kwk.kwwwvvvvuuuuSssyycyrooooyycyyooyycyyoSSuuuuvvvvwwwkkwk...',
  '...kwkkwwwwvvvvvuuuustyyryyooooryyyyooryyyytouuuuvvvvvwwwwkwk...',
  '...kwkwwwwwvvvvvuuuuutryroyrrrowyrrywryroyrtuuuuuvvvvvwwwwwwk...',
  '...kwkkwwwwvvvvvuuuvstttryowrrrywryrowrrytttrvuuuvvvvvwwwwkwk...',
  '...kwk.kwwwwvvvvuuuSSsttttsssssssssssssttttssSuuuvvvvwwwwkkwk...',
  '...kwk..kkwwvvvvvttSSssstttttssssssstttttssSStttvvvvvwwkk.kwk...',
  '.11kwk11.1kkkkkkssttStSSssstttttttttttssssSSttsssskkkkk111kwk1.1',
  '111kwk111111112kssttSttSSsSSSsssssssssSSStSSttsskk22111111kwk111',
  '222kwk2221111122kkksstttSttSSSssSSSSsSStttsttssk2222211222kwk222',
  '222kwk2222211122222kssttttttttSttttttStttsskssk22222222222kwk222',
  '23ukwk33222111222222ksskksssttkttttssktsssk3kk222222222233kwk332',
  '33kvwvku3222111222222kk33ksssk3kssssk3kkkk322222222222233kvwvk33',
  '3u3kkk33322211122222222233kkkkkkkkkkk333322222222221222333kkku33',
  '33u333u33222111122222222kkkkuuuuuuuuukkkk22222222111222333u33u33',
  '233u3333222111111222222kuuuuuuuuuuuuuuuuuk22222111111222333u3332',
  '2222222222211111112222kvvvvvvvvvvvvvvvvvvvk211111111122222222222',
  '222222222111.11111111kvvvvvvvvvvvvvvvvvvvvvk111111.1111222222222',
  '11112111111.1.1.111111kvvvvvvvvvvvvvvvvvvvk1111.1...1.1111121111',
  '.1111111.1.....1.111111kwwwwwwwwwwwwwwwwwk.1.1.........1.11111.1',
  '..................1.1.11kkkkwwwwwwwwwkkkk.1.....................',
  '.....................1.1.1.1kkkkkkkkk1..........................',
];

const NIGHT_PALETTE: Readonly<Record<string, string>> = {
  '1': '#55703f',
  '2': '#8a8a40',
  '3': '#d09a3c',
  o: '#ff9a2e',
  k: '#0d0a1a',
  u: '#e0954a',
  r: '#e8502a',
  y: '#ffd966',
  c: '#fff6c8',
  s: '#2a2e52',
  w: '#3a2a48',
  t: '#5a6290',
  S: '#b8a8b8',
  v: '#8a5240',
  G: '#ffd966',
  H: '#fff6c8',
  T: '#3fb6a8',
};

/** Same pixels by day: the fire stays lit, the lamp glass is unlit (as in `bonfire-grand`). */
const DAY_PALETTE: Readonly<Record<string, string>> = {
  '1': '#467a4c',
  '2': '#8e7e4c',
  '3': '#5e4a3a',
  o: '#ee8a2a',
  u: '#c99a58',
  r: '#c8441e',
  y: '#f6c64e',
  c: '#fff0b4',
  s: '#7a7684',
  w: '#6a4630',
  t: '#a5a2ae',
  S: '#d4d0d8',
  v: '#9c6a3c',
  G: '#8fa8b8',
  H: '#c4d6e0',
  T: '#2f9a94',
};

type Grid = string[][];

function grid(rows: readonly string[]): Grid {
  return rows.map((row) => [...row]);
}

function at(g: Grid, x: number, y: number): string {
  return g[y]?.[x] ?? '';
}

/** Paint one pixel, only over the given keys (so nothing already drawn is overwritten by mistake). */
function put(g: Grid, x: number, y: number, ch: string, over: string): void {
  const row = g[y];
  if (row !== undefined && x >= 0 && x < W && over.includes(at(g, x, y))) row[x] = ch;
}

/** The ground's own pixels (grass, light spill): what a paving stone may replace. */
const GROUND = '123';
const AIR = '.';

/**
 * Level 3: the paved ring. Every bit of grass round the hearth, inside an oval, becomes flagstones laid in
 * a brick pattern (body `t`, joints `s`, a pale top-left corner `S`), so the hearth sits on a stone floor.
 */
function pave(g: Grid): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - 31.5) / 31.5;
      const dy = (y - 38) / 12.2;
      if (dx * dx + dy * dy > 1) continue;
      const band = Math.floor((y - 26) / 3);
      const slab = (x + (band % 2 === 0 ? 0 : 3)) % 6;
      const inRow = (y - 26) % 3;
      let ch = 't';
      if (inRow === 2 || slab === 5) ch = 's';
      else if (inRow === 0 && slab === 0) ch = 'S';
      put(g, x, y, ch, GROUND);
    }
  }
  // the outer ring of light spill left on the grass joins the one inside it (one colour fewer; sprites keep to 16)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(g, x, y, '2', '3');
}

/**
 * Level 4: bunting. A rope with a sag from lamp to lamp (it passes behind the flames, painted on open air only) and
 * pennants in red, gold and teal hanging from it.
 */
function bunting(g: Grid): void {
  const left = 7;
  const right = 56;
  const mid = (left + right) / 2;
  const half = (right - left) / 2;
  const sag = 8;
  const ropeY = (x: number): number => 15 + Math.round(sag * (1 - ((x - mid) / half) ** 2));
  for (let x = left; x <= right; x++) put(g, x, ropeY(x), 'k', AIR);
  const colours = ['r', 'y', 'T'];
  let n = 0;
  for (let x = left + 2; x <= right - 2; x += 4) {
    const y = ropeY(x);
    const c = colours[n % colours.length] ?? 'r';
    n++;
    put(g, x - 1, y + 1, c, AIR);
    put(g, x, y + 1, c, AIR);
    put(g, x + 1, y + 1, c, AIR);
    put(g, x - 1, y + 2, c, AIR);
    put(g, x, y + 2, c, AIR);
    put(g, x, y + 3, c, AIR);
  }
}

/**
 * Level 5: crowned posts. Each lamp post carries a tall flagpole above its lantern, with a gold ball and a
 * swallow-tailed red banner with a gold stripe flying inwards; gold bands are carved into the post below and a few
 * gold-lit stones are set in the paving.
 */
function crown(g: Grid): void {
  for (const side of [1, -1]) {
    const px = side === 1 ? 4 : 59;
    for (let y = 3; y <= 12; y++) put(g, px, y, 'k', AIR);
    put(g, px, 0, 'y', AIR);
    put(g, px - 1, 1, 'y', AIR);
    put(g, px, 1, 'c', AIR);
    put(g, px + 1, 1, 'y', AIR);
    put(g, px, 2, 'y', AIR);
    for (let i = 1; i <= 9; i++) {
      const x = px + side * i;
      const bottom = 9 - (i > 6 ? i - 6 : 0);
      for (let y = 4; y <= bottom; y++) put(g, x, y, y === 6 ? 'y' : 'r', AIR);
    }
    for (const y of [26, 29, 32]) put(g, px, y, 'y', 'w');
  }
  const stones: readonly (readonly [number, number])[] = [
    [10, 42],
    [14, 45],
    [19, 47],
    [44, 47],
    [49, 45],
    [53, 42],
    [6, 38],
    [57, 38],
  ];
  for (const [x, y] of stones) {
    put(g, x, y, 'u', 'tsS');
    put(g, x + 1, y, 'y', 'tsS');
  }
}

function build(steps: readonly ((g: Grid) => void)[]): {
  sprite: SpriteDef;
  day: Record<string, string>;
} {
  const g = grid(GRAND_ROWS);
  for (const step of steps) step(g);
  const rows = g.map((r) => r.join(''));
  const used = new Set(rows.join(''));
  const palette: Record<string, string> = {};
  const day: Record<string, string> = {};
  for (const [key, colour] of Object.entries(NIGHT_PALETTE)) {
    if (!used.has(key)) continue;
    palette[key] = colour;
    const d = DAY_PALETTE[key];
    if (d !== undefined) day[key] = d;
  }
  return { sprite: { palette, rows }, day };
}

const L3 = build([pave]);
const L4 = build([pave, bunting]);
const L5 = build([pave, bunting, crown]);

export const VALLEY_LEVELS_BONFIRE_CONCEPTS: ConceptSet = {
  id: 'valley-levels-bonfire',
  title: 'The Bonfire, level by level',
  requested:
    '2026-11-09 (Misa, via the valley session): each valley building visibly grows level by level, 1 to 5, by day and night.',
  status: 'draft',
  notes: [
    'Levels 1 and 2 are `valley-glow/bonfire` and `valley-glow/bonfire-grand`; levels 3 to 5 here are 64x50 like the grand hearth, drawn from its pixels, so the map spot and the scene need no change. Each level keeps everything of the one below.',
    'Level 3 (bonfire-3): a paved ring. The grass round the hearth becomes flagstones in a brick pattern, so the hearth stands on a stone floor.',
    'Level 4 (bonfire-4): bunting. A rope with a sag from lamp to lamp, behind the flames, with red, gold and teal pennants.',
    'Level 5 (bonfire-5): the crowned hearth. Tall flagpoles over both lamp posts with a gold ball and a red swallow-tailed banner each, gold bands carved into the posts, and gold-lit stones in the paving.',
    'Seats: the same as bonfire-grand (`GRAND_SEATS`); the paving and the bunting are ground and sky, the logs and the front bench are untouched, and the posts stay in `GRAND_LAMPS` boxes.',
  ],
  ...(VALLEY_GLOW_CONCEPTS.backdrop === undefined
    ? {}
    : { backdrop: VALLEY_GLOW_CONCEPTS.backdrop }),
  levels: {
    bonfire: [
      'valley-glow/bonfire',
      'valley-glow/bonfire-grand',
      'valley-levels-bonfire/bonfire-3',
      'valley-levels-bonfire/bonfire-4',
      'valley-levels-bonfire/bonfire-5',
    ],
  },
  sprites: {
    'bonfire-3': {
      kind: 'free',
      note: 'Level 3: the grand hearth on a paved ring of flagstones.',
      sprite: L3.sprite,
      alts: { day: L3.day },
    },
    'bonfire-4': {
      kind: 'free',
      note: 'Level 4: the paved hearth with bunting strung between the lamp posts.',
      sprite: L4.sprite,
      alts: { day: L4.day },
    },
    'bonfire-5': {
      kind: 'free',
      note: 'Level 5: crowned posts with flagpoles, banners and gold, over the bunting and the paving.',
      sprite: L5.sprite,
      alts: { day: L5.day },
    },
  },
};
