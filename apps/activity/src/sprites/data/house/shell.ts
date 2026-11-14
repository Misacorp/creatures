/**
 * The house shell, art batch E1: the building a player's rooms sit in (slab, earth, chimney, door,
 * mailbox, workbench, vent, the sleeping "z"), five roof skins and five wall-frame skins with the
 * parts that cap them, and the ground skins of the outdoor rooms (lawn, deck, pool tile, pool water).
 * Day palette, the valley house's colours (cream walls, red roof, ink outline `k` #0d0a1a); light
 * falls from the upper left like the living room's furniture (`L` light, `M` mid, `D` shade).
 *
 * How a skin stays one skin: every roof is the same shingle layout with its own colours and a small
 * pattern change (thatch strands, scallops, standing seams, moss); every wall frame is one 8 x 8 tile
 * that reads at 4 px wide too (the outer walls are 4 px thick). Skin keys are always `L M D A B`:
 * light, mid, shade, accent (seam, twine, mortar, rivet, moss) and a second accent.
 *
 * Roofs: `tile` 16 x 8 tiles both ways, no outline. `ridge` 16 x 4 caps the top edge of a roof (ink
 * on top) and tiles sideways. `eave` 16 x 4 is the lower hem that overhangs the wall (ink at the
 * bottom) and tiles sideways. The sloped edges of a gable or hip roof are outlined by the scene.
 * Wall frames: `tile` 8 x 8, no outline, tiles both ways; the scene draws the ink around the frame.
 * Ground tiles are 16 x 8 and tile sideways; their top row is the walking surface, so every ground
 * sits on the same line. Pool water is 16 x 8 and wraps sideways without a seam.
 */
import type { SpriteDef } from '../../sprite-data';
import type { HouseArtPack, SkinArt } from '../../../housing/house-art';

const INK = '#0d0a1a';

type Colours = Readonly<Record<string, string>>;

/** A sprite whose palette is the keys its rows use, taken from `colours` (and the ink). */
function draw(rows: readonly string[], colours: Colours): SpriteDef {
  const used = new Set(rows.join(''));
  const palette: Record<string, string> = {};
  for (const key of used) {
    if (key === '.') continue;
    const colour = key === 'k' ? INK : colours[key];
    if (colour === undefined) throw new Error(`No colour for key "${key}" in ${rows[0] ?? ''}`);
    palette[key] = colour;
  }
  return { rows, palette };
}

/** Rows built from a function of the pixel, for the repeating tile patterns. */
function grid(w: number, h: number, at: (x: number, y: number) => string): string[] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => at(x, y)).join(''),
  );
}

// ---------------------------------------------------------------------------------------------
// Roof skins

const SHINGLES = [
  'LLLLLLLDLLLLLLLD',
  'LMMMMMMDLMMMMMMD',
  'MMMMMMMDMMMMMMMD',
  'DDDDDDDDDDDDDDDD',
  'LLLDLLLLLLLDLLLL',
  'MMMDLMMMMMMDLMMM',
  'MMMDMMMMMMMDMMMM',
  'DDDDDDDDDDDDDDDD',
];

/** Set pixels of a row set: `at` is [x, y, key]. */
function touch(rows: readonly string[], edits: readonly (readonly [number, number, string])[]) {
  const out = rows.map((r) => r.split(''));
  for (const [x, y, key] of edits) {
    const row = out[y];
    if (row !== undefined) row[x] = key;
  }
  return out.map((r) => r.join(''));
}

const ROOF_COLOURS: Record<string, Colours> = {
  thatch: { L: '#f0d98a', M: '#d3ab52', D: '#9a7434', A: '#6e4a2a', B: '#e8c868' },
  slate: { L: '#98a0c0', M: '#6c749a', D: '#484e72', A: '#b4bcd8', B: '#7c84a8' },
  'red-tile': { L: '#e8876a', M: '#c8684a', D: '#9a4a3a', A: '#f4a888', B: '#b05a42' },
  'copper-green': { L: '#8ad8b8', M: '#4fa58c', D: '#357466', A: '#d08c5e', B: '#6cc0a4' },
  moss: { L: '#aa8258', M: '#85603f', D: '#5e4129', A: '#5a9a58', B: '#8cb860' },
};

function thatchTile(): string[] {
  return grid(16, 8, (x, y) => {
    if (y === 7) return x % 2 === 0 ? 'A' : 'D';
    const v = (x * 2 + y) % 8;
    if (v === 0) return 'L';
    if (v === 5 || v === 6) return 'D';
    return v === 3 ? 'B' : 'M';
  });
}

const ROOF_TILES: Record<string, string[]> = {
  thatch: thatchTile(),
  slate: touch(SHINGLES, [
    [3, 1, 'A'],
    [11, 5, 'A'],
    [12, 2, 'B'],
    [5, 6, 'B'],
  ]),
  'red-tile': touch(SHINGLES, [
    // the scalloped bottom of each barrel tile: the corners stay dark, the middle lifts
    ...[1, 2, 3, 4, 5, 6].map((x) => [x, 3, 'M'] as const),
    ...[9, 10, 11, 12, 13, 14].map((x) => [x, 3, 'M'] as const),
    ...[5, 6, 7, 8, 9, 10].map((x) => [x, 7, 'M'] as const),
    ...[13, 14, 15, 0, 1, 2].map((x) => [x, 7, 'M'] as const),
    [1, 0, 'A'],
    [9, 0, 'A'],
    [5, 4, 'A'],
    [13, 4, 'A'],
  ]),
  'copper-green': grid(16, 8, (x, y) => {
    if (y === 7) return 'D';
    if (x % 4 === 3) return 'D';
    if (x % 4 === 0) return 'L';
    if (x % 8 === 3 && y === 3) return 'A';
    if (x % 8 === 7 && y === 0) return 'A';
    return y === 0 ? 'B' : 'M';
  }),
  moss: touch(SHINGLES, [
    [9, 3, 'A'],
    [10, 3, 'B'],
    [11, 3, 'A'],
    [10, 2, 'A'],
    [1, 7, 'A'],
    [2, 7, 'B'],
    [3, 7, 'A'],
    [2, 6, 'A'],
  ]),
};

const RIDGE = ['kkkkkkkkkkkkkkkk', 'LLLLLLLDLLLLLLLD', 'MMMMMMMDMMMMMMMD', 'DDDDDDDDDDDDDDDD'];

const ROOF_RIDGES: Record<string, string[]> = {
  thatch: ['kkkkkkkkkkkkkkkk', 'LBLLLBLLLLBLLLBL', 'MMMAMMMMMMMAMMMM', 'DDDADDDDDDDADDDD'],
  slate: RIDGE,
  'red-tile': ['kkkkkkkkkkkkkkkk', 'LLLLLLLDLLLLLLLD', 'MMMMMMMDMMMMMMMD', 'DADDDDDDDADDDDDD'],
  'copper-green': touch(RIDGE, [
    [3, 1, 'A'],
    [11, 1, 'A'],
  ]),
  moss: touch(RIDGE, [
    [2, 1, 'A'],
    [3, 1, 'B'],
    [3, 2, 'A'],
    [10, 1, 'A'],
    [11, 1, 'A'],
    [12, 1, 'B'],
  ]),
};

const EAVE = ['MMMMMMMDMMMMMMMD', 'MMMMMMMDMMMMMMMD', 'DDDDDDDDDDDDDDDD', 'kkkkkkkkkkkkkkkk'];

const ROOF_EAVES: Record<string, string[]> = {
  thatch: ['MMLMMMDMMMLMMMDM', 'MMMDMMMMMDMMMMMM', 'DAADDDADDDADDDAD', 'kk.kkkkk.kkk.kkk'],
  slate: EAVE,
  'red-tile': ['MMMMMMMDMMMMMMMD', 'MMMMMMMDMMMMMMMD', 'DMMMMMMDDMMMMMMD', '.kkkkkk..kkkkkk.'],
  'copper-green': ['LMMDLMMDLMMDLMMD', 'LMMDLMMDLMMDLMMD', 'DDDDDDDDDDDDDDDD', 'kkkkkkkkkkkkkkkk'],
  moss: touch(EAVE, [
    [1, 2, 'A'],
    [2, 2, 'B'],
    [9, 2, 'A'],
    [10, 2, 'A'],
    [10, 1, 'B'],
  ]),
};

// ---------------------------------------------------------------------------------------------
// Wall-frame skins

const WALL_COLOURS: Record<string, Colours> = {
  plaster: { L: '#f2e8d2', M: '#e6d8c0', D: '#c9b8a2', A: '#bfae9e', B: '#d6c6aa' },
  timber: { L: '#d29c68', M: '#b07a4c', D: '#82553a', A: '#5e3a28', B: '#c58c5c' },
  fieldstone: { L: '#c0b9a8', M: '#9a9484', D: '#706b60', A: '#4e4a42', B: '#aaa494' },
  brick: { L: '#d27e5c', M: '#b45c42', D: '#8c4232', A: '#dccdb4', B: '#c46c4c' },
  shingle: { L: '#a8c0cc', M: '#7e9cae', D: '#587488', A: '#3e5468', B: '#92aebc' },
};

const WALL_TILES: Record<string, string[]> = {
  plaster: [
    'MMMMMMMM',
    'MMLMMMBM',
    'MMMMMMMM',
    'BMMMLMDM',
    'MMMMMMMM',
    'MMMBMMMM',
    'MLMMMMMD',
    'MMMMMBMM',
  ],
  timber: [
    'LMMDLMMD',
    'LMMDLMMD',
    'LMADLMMD',
    'LMMDLMMD',
    'LMMDLMAD',
    'LMMDLMMD',
    'LMMDLMMD',
    'LMMDLMMD',
  ],
  fieldstone: [
    'AAAAAAAA',
    'ALLMALLM',
    'AMMMAMBM',
    'ADDDADDD',
    'AAAAAAAA',
    'LLALLLAL',
    'MMAMBMAM',
    'DDADDDAD',
  ],
  brick: [
    'LLLLLLLA',
    'MMMMMMMA',
    'MMBMMMMA',
    'AAAAAAAA',
    'LLLALLLL',
    'MMMAMMMM',
    'MBMAMMMM',
    'AAAAAAAA',
  ],
  shingle: [
    'LLLLLLLL',
    'LMMMLMMM',
    'MMMDMMMD',
    'DMDDDMDD',
    'LLLLLLLL',
    'MMLMMMLM',
    'DMMMDMMM',
    'DDMDDDMD',
  ],
};

// ---------------------------------------------------------------------------------------------
// Ground skins

const GROUND_COLOURS: Record<string, Colours> = {
  lawn: { L: '#9ccc6c', M: '#7cb05c', D: '#5a9a58', A: '#467a4c', B: '#f6e6a0' },
  deck: { L: '#d2c29e', M: '#b4a47e', D: '#8a7c60', A: '#5e5240', B: '#c4b48e' },
  'pool-tile': { L: '#eef8f4', M: '#c4e4e2', D: '#92c0c8', A: '#6a9cac', B: '#fbfdf8' },
  'pool-water': { L: '#bfeaf4', M: '#6fc4dc', D: '#4aa4cc', A: '#3a84b4', B: '#fbfdf8' },
};

const GROUND_TILES: Record<string, string[]> = {
  lawn: [
    'LLLLLLLLLLLLLLLL',
    'MMMMMDMMMMMMMMDM',
    'MMMMMMMMLMMMMMMM',
    'MDMMMMMMMMMMMDMM',
    'MMMMMLMMMMBMMMMM',
    'DMMMMMMMMMMMMMLM',
    'MMMMDMMMMMMDMMMM',
    'MMMMMMMMMMMMMMMM',
  ],
  deck: [
    'LLLLLLLLLLLLLLLL',
    'MMMMMMMMMMMMMMMM',
    'MMMMMMMMMMMMMMMM',
    'DDDDDDDDDDDDDDDD',
    'LLLLLLLLLLLLLLLL',
    'MMMMMMMMMMMMMMMM',
    'MMMMMMMMMMMMMMMM',
    'DDDDDDDDDDDDDDDD',
  ],
  'pool-tile': [
    'LLLLLLLLLLLLLLLL',
    'LBBBBBBALBBBBBBA',
    'LBMMMMMALBMMMMMA',
    'LBMMMMMALBMMMMMA',
    'LBMMMMMALBMMMMMA',
    'LBMMMMDALBMMMMDA',
    'LBDDDDDALBDDDDDA',
    'AAAAAAAAAAAAAAAA',
  ],
  'pool-water': [
    'MMMMMMMMMMMMMMMM',
    'MLLLMMMMMMMLLMMM',
    'MMMMMMMMMMMMMMMM',
    'MMMMMDDDMMMMMMMM',
    'MMMMMMMMMMMMMMMM',
    'LLMMMMMMMMMMMMLL',
    'MMMMMMMMMMBMMMMM',
    'DDMMMMMMMMMMMMMD',
  ],
};

// ---------------------------------------------------------------------------------------------
// Fixtures

const FIXTURE: Colours = {
  // brick and stone
  b: '#d27e5c',
  c: '#b45c42',
  d: '#8c4232',
  m: '#dccdb4',
  s: '#d8cbb4',
  t: '#a89c8e',
  e: '#3a2a48',
  // wood (the valley house's door, the living room's furniture)
  u: '#d9a468',
  v: '#9c6a3c',
  w: '#6a4630',
  f: '#bc8050',
  h: '#915d42',
  a: '#f2ca92',
  // glass, brass, iron, flags
  y: '#9cc8e0',
  g: '#e8f4fa',
  p: '#f6c64e',
  i: '#8a8a9c',
  j: '#c8c8d4',
  r: '#e8502a',
  // earth
  n: '#6a4a38',
  o: '#85603f',
  q: '#4a3428',
  z: '#a8a090',
  x: '#e6def2',
};

const DOOR = [
  '....kkkkkkkk....',
  '..kkuuuuuuuukk..',
  '.kuuuvvvvvvuuuk.',
  '.kuvvyyyyyyvvuk.',
  '.kuvyyggyyyyvuk.',
  '.kuvyyggyyyyvuk.',
  '.kuvyyyyyyyyvuk.',
  '.kuuvvvvvvvvuuk.',
  '.kuvvvvvvvvvvuk.',
  '.kuvwwwwwwwwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwwwwwwwwvuk.',
  '.kuvvvvvvvvvvuk.',
  '.kuvwwwwwwwwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwvvvvvpwvuk.',
  '.kuvwvvvvvvwvuk.',
  '.kuvwwwwwwwwvuk.',
  '.kuvvvvvvvvvvuk.',
  '.kuuuuuuuuuuuuk.',
  'kkkkkkkkkkkkkkkk',
  'ksssssssssssssst',
  'kttttttttttttttt',
  '.kkkkkkkkkkkkkk.',
];

const VENT = [
  'kkkkkkkkkkkk',
  'kttttttttttk',
  'kteeeeeeeett',
  'kteiiiiiieet',
  'kteeeeeeeett',
  'kteiiiiiieet',
  'kteeeeeeeett',
  'kssssssssstk',
  'kkkkkkkkkkkk',
];

const Z = ['.kkkkk.', 'kxxxxxk', 'kkkkxxk', '..kxxk.', '.kxxkk.', 'kxxxxxk', '.kkkkk.'];

/** Shapes painted as filled rectangles `[x, y, w, h, key]`, then wrapped in the ink outline. */
function paint(
  w: number,
  h: number,
  shapes: readonly (readonly [number, number, number, number, string])[],
  options: { open?: 'bottom' } = {},
): string[] {
  const g = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  for (const [x, y, rw, rh, key] of shapes) {
    for (let j = y; j < y + rh; j++) {
      for (let i = x; i < x + rw; i++) {
        const row = g[j];
        if (row !== undefined && i >= 0 && i < w) row[i] = key;
      }
    }
  }
  const solid = (x: number, y: number): boolean => {
    if (x < 0 || x >= w) return false;
    if (y >= h) return options.open === 'bottom';
    return y >= 0 && g[y]?.[x] !== '.';
  };
  const out = g.map((row) => [...row]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y]?.[x] !== '.') continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        const row = out[y];
        if (row !== undefined) row[x] = 'k';
      }
    }
  }
  return out.map((row) => row.join(''));
}

// A chimney: a stone cap on a brick stack in running bond, 14 x 28. Its foot is open (no ink): the
// scene sinks it into the roof.
const CHIMNEY = paint(
  14,
  28,
  [
    [0, 1, 14, 2, 's'],
    [0, 3, 14, 1, 't'],
    [2, 4, 10, 24, 'b'],
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) => {
      const y = 4 + c * 3;
      const joints = c % 2 === 0 ? [7] : [4, 9];
      return [
        [2, y + 2, 10, 1, 'm'],
        ...joints.map((x) => [x, y, 1, 2, 'm'] as const),
        [11, y, 1, 2, 'd'],
        [3, y + 1, 3, 1, 'c'],
        [8, y + 1, 3, 1, 'c'],
      ] as const;
    }),
  ],
  { open: 'bottom' },
);

// The mailbox: a rounded iron box on a wooden post, flag up, 14 x 21.
const MAILBOX = paint(14, 21, [
  [11, 1, 2, 3, 'r'],
  [11, 4, 1, 5, 'j'],
  [3, 3, 8, 1, 'j'],
  [2, 4, 10, 5, 'j'],
  [10, 4, 2, 5, 'i'],
  [3, 8, 8, 1, 'i'],
  [4, 6, 5, 1, 'i'],
  [6, 9, 2, 10, 'f'],
  [7, 9, 1, 10, 'h'],
  [4, 19, 6, 1, 'z'],
]);

// The mailbox with its flag down (nothing waits): the same box, the flag drooping along the right end.
const MAILBOX_EMPTY = paint(14, 21, [
  [12, 4, 1, 1, 'j'],
  [12, 5, 2, 3, 'r'],
  [3, 3, 8, 1, 'j'],
  [2, 4, 10, 5, 'j'],
  [10, 4, 2, 5, 'i'],
  [3, 8, 8, 1, 'i'],
  [4, 6, 5, 1, 'i'],
  [6, 9, 2, 10, 'f'],
  [7, 9, 1, 10, 'h'],
  [4, 19, 6, 1, 'z'],
]);

// The workbench: a plank top on trestle legs with a shelf, a vise at one end, a hammer and planks.
const WORKBENCH = paint(32, 22, [
  [1, 9, 30, 1, 'a'],
  [1, 10, 30, 2, 'f'],
  [1, 12, 30, 1, 'h'],
  [3, 13, 26, 2, 'h'],
  [3, 15, 3, 6, 'f'],
  [4, 15, 2, 6, 'h'],
  [26, 15, 3, 6, 'f'],
  [27, 15, 2, 6, 'h'],
  [6, 17, 20, 1, 'a'],
  [6, 18, 20, 1, 'h'],
  [1, 2, 8, 1, 'j'],
  [4, 3, 2, 3, 'i'],
  [2, 6, 6, 3, 'j'],
  [6, 6, 2, 3, 'i'],
  [14, 2, 6, 3, 'j'],
  [18, 2, 2, 3, 'i'],
  [16, 5, 2, 4, 'f'],
  [17, 5, 1, 4, 'h'],
  [23, 6, 7, 1, 'a'],
  [23, 7, 7, 1, 'f'],
  [23, 8, 7, 1, 'h'],
  [24, 4, 5, 1, 'a'],
  [24, 5, 5, 1, 'f'],
  [11, 8, 1, 1, 'a'],
  [13, 8, 2, 1, 'a'],
  [20, 8, 1, 1, 'a'],
]);

// ---------------------------------------------------------------------------------------------
// The pack

const skins: Record<string, SkinArt> = {};
for (const id of Object.keys(ROOF_COLOURS)) {
  const colours = ROOF_COLOURS[id];
  const tile = ROOF_TILES[id];
  const ridge = ROOF_RIDGES[id];
  const eave = ROOF_EAVES[id];
  if (colours === undefined || tile === undefined || ridge === undefined || eave === undefined)
    throw new Error(`Roof skin ${id} is incomplete.`);
  skins[id] = { tile: draw(tile, colours), ridge: draw(ridge, colours), eave: draw(eave, colours) };
}
for (const id of Object.keys(WALL_COLOURS)) {
  const colours = WALL_COLOURS[id];
  const tile = WALL_TILES[id];
  if (colours === undefined || tile === undefined)
    throw new Error(`Wall skin ${id} is incomplete.`);
  skins[id] = { tile: draw(tile, colours) };
}
for (const id of Object.keys(GROUND_COLOURS)) {
  const colours = GROUND_COLOURS[id];
  const tile = GROUND_TILES[id];
  if (colours === undefined || tile === undefined)
    throw new Error(`Ground skin ${id} is incomplete.`);
  skins[id] = { tile: draw(tile, colours) };
}

const SLAB = ['hhhhhhhhhhhhhhhh', 'ffffffwfffffffwf', 'hhhhhhhhhhhhhhhh', 'kkkkkkkkkkkkkkkk'];
const EARTH = grid(16, 16, (x, y) => {
  const h = (x * 7 + y * 13 + ((x * y) % 5)) % 17;
  if (h === 0) return 'z';
  if (h === 3 || h === 11) return 'o';
  if (h === 6) return 'q';
  return 'n';
});

export const HOUSE_ART: HouseArtPack = {
  skins,
  shell: {
    slab: draw(SLAB, FIXTURE),
    earth: draw(EARTH, FIXTURE),
    chimney: draw(CHIMNEY, FIXTURE),
    door: draw(DOOR, FIXTURE),
    mailbox: draw(MAILBOX, FIXTURE),
    'mailbox-empty': draw(MAILBOX_EMPTY, FIXTURE),
    workbench: draw(WORKBENCH, FIXTURE),
    vent: draw(VENT, FIXTURE),
    z: draw(Z, FIXTURE),
  },
};
