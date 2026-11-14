/**
 * The shared materials of the five building levels (docs/design/art-levels.md), concept art (not in the
 * game). Every building drawn at a level takes its colours from `TIERS`, so the shingles of a level 2 forge
 * and a level 2 school are the same red. Each material has a night colour (the valley-glow main palettes,
 * `valley-glow.ts`) and its day version (the glow sprites' `alts.day`). `tierPalette` builds a sprite palette
 * and its day alt from `{ key: 'material' }` choices; the building adds its own keys (fire, glass, cloth,
 * the ink `k`, the light spill `1 2 3`, the cast shadow `x`). The set also draws one motif sample per level.
 */
import type { SpriteDef } from '../sprite-data';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import type { ConceptSet } from './index';

/** A material colour by night and by day (hex). */
export interface Shade {
  readonly night: string;
  readonly day: string;
}

export type TierLevel = 1 | 2 | 3 | 4 | 5;

const m = (night: string, day: string): Shade => ({ night, day });

/** The shared ink of every sprite. */
export const INK = '#0d0a1a';

export const TIERS = {
  1: {
    name: 'Humble',
    // raw logs, rope, straw, packed earth, loose fieldstones (the bonfire's logs and stones)
    log: m('#8a5240', '#9c6a3c'),
    logShade: m('#3a2a48', '#6a4630'),
    rope: m('#c0a468', '#d8bc80'),
    straw: m('#d09a3c', '#e6c262'),
    earth: m('#6a5238', '#a8945a'),
    fieldstone: m('#5a6290', '#a5a2ae'),
  },
  2: {
    name: 'Settled',
    // sawn planks, wooden shingles (the school's roof; lit, body and shaded), iron nails
    plank: m('#b0764a', '#d4a266'),
    plankShade: m('#6e4636', '#9c6a3c'),
    // lit side, body, shaded side: one light from the upper left, like the walls
    shingleLight: m('#a05a8c', '#e08a66'),
    shingle: m('#7a4070', '#c8684a'),
    shingleShade: m('#3a2650', '#a04a3a'),
    nail: m('#2a2e52', '#4a4a58'),
  },
  3: {
    name: 'Stone',
    // Misa 2026-11-11: warm sandstone blocks (ochre-cream, warm shade, light edge) and terracotta barrel
    // tiles (an orange-red unlike level 2's shingles), black iron. The names stay `stone` and `slate` so every
    // building picks the new colours up; `sandstone` and `terracotta` are aliases of the same colours.
    stone: m('#a8845c', '#dcb97c'),
    stoneShade: m('#7a5a50', '#b08a56'),
    stoneLight: m('#d8bc8c', '#f2e0ae'),
    slate: m('#c0623a', '#e4743a'),
    slateShade: m('#7c3a3c', '#b04a22'),
    slateLight: m('#e08a58', '#f89c58'),
    sandstone: m('#a8845c', '#dcb97c'),
    sandstoneShade: m('#7a5a50', '#b08a56'),
    sandstoneLight: m('#d8bc8c', '#f2e0ae'),
    terracotta: m('#c0623a', '#e4743a'),
    terracottaShade: m('#7c3a3c', '#b04a22'),
    terracottaLight: m('#e08a58', '#f89c58'),
    iron: m('#1c1a2c', '#2e2c3a'),
  },
  4: {
    name: 'Valley',
    // the valley's teal and cream (the market's awning), brass, wrought iron
    teal: m('#2f8a78', '#2a8a8a'),
    tealShade: m('#1f5a5a', '#1f6a6a'),
    cream: m('#e8d8b0', '#f4ecd0'),
    brass: m('#d0a040', '#f0b830'),
    brassShade: m('#8a6a28', '#b08820'),
    wrought: m('#8a88b8', '#6a6878'),
  },
  5: {
    name: 'Crystal',
    // the market's teal shard glows by day too; gold trim
    crystal: m('#2fd0b8', '#2fd0b8'),
    crystalLight: m('#d8fff4', '#e8fff8'),
    crystalShade: m('#2f8a78', '#28b0a0'),
    gold: m('#e8c040', '#f0c848'),
    goldShade: m('#9a7428', '#b88a24'),
  },
} as const satisfies Record<TierLevel, { readonly name: string } & Record<string, string | Shade>>;

/** The material names of a level (not its `name`). */
export type MaterialOf<L extends TierLevel> = Exclude<keyof (typeof TIERS)[L], 'name'>;

/**
 * A sprite palette (night) and its `alts.day` from `{ key: 'material' }` choices of one level:
 * `const { palette, day } = tierPalette(2, { p: 'plank', P: 'plankShade', s: 'shingle' })`.
 * Merge your own keys over both (`{ ...palette, k: INK }`, `{ ...day, x: '#2f5a38' }`).
 */
export function tierPalette<L extends TierLevel>(
  level: L,
  keys: Readonly<Record<string, MaterialOf<L>>>,
): { palette: Record<string, string>; day: Record<string, string> } {
  const materials = TIERS[level] as unknown as Readonly<Record<string, string | Shade>>;
  const palette: Record<string, string> = {};
  const day: Record<string, string> = {};
  for (const [key, material] of Object.entries(keys)) {
    // Own properties only, so a name such as "toString" never finds an inherited value.
    const colour = Object.hasOwn(materials, material) ? materials[material as string] : undefined;
    if (colour === undefined || typeof colour === 'string') {
      throw new Error(`tierPalette: level ${level} has no material "${String(material)}"`);
    }
    palette[key] = colour.night;
    day[key] = colour.day;
  }
  return { palette, day };
}

type Parts = { palette: Record<string, string>; day: Record<string, string> };

/** A sample: material palettes merged with the shared ink, the shadow and the sample's own keys. */
function sample(
  rows: string[],
  parts: readonly Parts[],
  own: Readonly<Record<string, Shade>> = {},
): { sprite: SpriteDef; day: Record<string, string> } {
  const night: Record<string, string> = { k: INK, x: '#112430' };
  const daily: Record<string, string> = { x: '#2f5a38' };
  for (const part of parts) {
    Object.assign(night, part.palette);
    Object.assign(daily, part.day);
  }
  for (const [key, shade] of Object.entries(own)) {
    night[key] = shade.night;
    daily[key] = shade.day;
  }
  return { sprite: { palette: night, rows }, day: daily };
}

const TIER_1 = sample(
  [
    '........................................',
    '........................................',
    '................kkkkkk..................',
    '...............kLLllLLk.................',
    '...............kllllLLk.................',
    '...............kllllLLk.................',
    '...............kllllLLk.................',
    '......k.......krrrrrrrrk................',
    '.....klk......kLrLrLrLrk................',
    '......klkkkkkkkllllLLkkkkkkkk...........',
    '.......klllllllllllllllllllllk...k......',
    '.......kLLLLLLLLLLLLLLLLLLLLLk..kSk.....',
    '........kkkkkkkrrrrrrrrkkkSkkLk.kSk.....',
    '..............krLrLrLrLrkkSkksLkSk.k....',
    '..............kllllLLkkrskSkkskkSkksk...',
    '..............kllllLLk.kskkSkskkSkskk...',
    '..............kllllLLk.kkskSkskkSkskSk..',
    '......kkkkk...krrrrrrrkSkskSkskSkskSk...',
    '.....kFFFffk..kllllLLk.kSksSkskSksSk....',
    '.....kFFFffkkkkllllLLkekSkskSskSsSk.....',
    '.....kfffffFffkllllLLkeekSssSsSssSke....',
    '...eeekfffffffkkkkkkkeeeekSsSsSsSskeee..',
    '.....eekkkkkkkeeeexeeeeeeekkkkkkkkee....',
    '........................................',
  ],
  [tierPalette(1, { l: 'log', L: 'logShade', r: 'rope', s: 'straw', e: 'earth', f: 'fieldstone' })],
  { S: m('#a07428', '#c8a040'), F: m('#7a82b0', '#c8c4d0') },
);

/** Roof of one light: left of `split` is the lit plane (light shingle, body accents), right the shaded plane. */
function lightRoof(rows: string[], from: number, to: number, split: number): string[] {
  return rows.map((row, y) =>
    y < from || y > to
      ? row
      : [...row]
          .map((ch, x) => (x < split ? (ch === 's' ? 'h' : ch === 'S' ? 's' : ch) : ch))
          .join(''),
  );
}

const TIER_2 = sample(
  lightRoof(
    [
      '........................................',
      '........................................',
      '..........kkkkkkkkkkkkkkkkkkkkk.........',
      '.........ksssssssssssssssssssssk........',
      '........ksSSssSSssSSssSSssSSssSSk.......',
      '.......kSSssSSssSSssSSssSSssSSssSk......',
      '......kSssSSssSSssSSssSSssSSssSSssk.....',
      '.....kssSSssSSssSSssSSssSSssSSssSSsk....',
      '....ksSSssSSssSSssSSssSSssSSssSSssSSk...',
      '...kSSssSSssSSssSSssSSssSSssSSssSSssSk..',
      '..kSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSk.',
      '...kkkkkkpppPppPppPppPpPPPSPPSPPkkkkkk..',
      '....kk..kpppPppPppPppPpPPPSPPSPPk.......',
      '..kkPPkkkpppPppPppPppPpPPPSPPSPPk.......',
      '.kppppppkpnpPnpPnpPnpPpPPPSPPSPPk.......',
      '.kpnppnpkpppPppPppPppPpPPPSPPSPPk.......',
      '.kppppppkpppPppPppPppPpPPPSPPSPPk.......',
      '.kPPPPPPkpppPppPppPppPpPPPSPPSPPk.......',
      '..kkkkkkkpppPppPppPppPpPPPSPPSPPk.......',
      '........kpnpPnpPnpPnpPpPPPSPPSPPk.......',
      '........kpppPppPppPppPpPPPSPPSPPk.......',
      '........kpppPppPppPppPpPPPSPPSPPk.......',
      '...xxxxxxkkkkkkkkkkkkkkkkkkkkkkkxxxxxx..',
      '......xxxxxxxxxxxxxxxxxxxxxxxxxxxxx.....',
    ],
    2,
    10,
    21,
  ),
  [
    tierPalette(2, {
      p: 'plank',
      P: 'plankShade',
      h: 'shingleLight',
      s: 'shingle',
      S: 'shingleShade',
      n: 'nail',
    }),
  ],
);

const STONE = {
  t: 'stone',
  T: 'stoneShade',
  L: 'stoneLight',
} as const;

/**
 * Terracotta barrel tiles on a roof drawn with `a` (fill) and `A` (eave shade): rounded ribs, each course
 * three rows (a light rib, a body, a shaded gap; the rib's rounded end is the dark row), courses offset by
 * two pixels. The lit edge is the top row.
 */
function barrelTiles(rows: string[], from: number, to: number): string[] {
  const rib = ['r', 'a', 'a', 'A'];
  return rows.map((row, y) =>
    y < from || y > to
      ? row
      : [...row]
          .map((ch, x) => {
            if (ch !== 'a') return ch;
            if (y === from) return 'r';
            const course = Math.floor((y - from - 1) / 3);
            const inCourse = (y - from - 1) % 3;
            if (inCourse === 2) return (x + course * 2) % 4 < 2 ? 'A' : 'a';
            return rib[(x + course * 2) % 4];
          })
          .join(''),
  );
}

const TIER_3 = sample(
  barrelTiles(
    [
      '........................................',
      '........................................',
      '.....kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk....',
      '....kaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaak...',
      '....kAaaaAAAaaaAAAaaaAAAaaaAAAaaaAAAk...',
      '....kaAAAaaaAAAaaaAAAaaaAAAaaaAAAaaak...',
      '....kAaaaAAAaaaAAAaaaAAAaaaAAAaaaAAAk...',
      '....kaAAAaaaAAAaaaAAAaaaAAAaaaAAAaaak...',
      '....kAaaaAAAaaaAAAaaaAAAaaaAAAaaaAAAk...',
      '...kAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAk..',
      '....kkkkttttttttTTLLLLLLuuuuuuUuukkkk...',
      '.......kttttttttTTLLLLLLuuuuuuUuuk......',
      '.......kTTTiiTTTTTTTTTTTUUUUUUUUUk......',
      '.......ktttibiiiiiiiiiiiiiiibiuuuk......',
      '.......ktttiitttttttTLLLuiuUuuuuuk......',
      '.......kTTTiiiTTTTTTTTTTUbUUUUUUUk......',
      '.......ktttiititTTLLLLLLuiuuuuUuuk......',
      '.......ktttttttiTTLLLLLLiiiuuuUuuk......',
      '.......kTTTTTTTTiTTTTTTTUUUUUUUUUk......',
      '.......kttttTttttTLLLLLLuuuUUuuuuk......',
      '.......kttttTttttTLLLLLLuuuUUuuuuk......',
      '.......kTTTTTTTTTTTTTTTTUUUUUUUUUk......',
      '...xxxxxkkkkkkkkkkkkkkkkkkkkkkkkkxxxxx..',
      '......xxxxxxxxxxxxxxxxxxxxxxxxxxxxx.....',
    ],
    3,
    8,
  ),
  [
    tierPalette(3, {
      ...STONE,
      u: 'stone',
      U: 'stoneShade',
      a: 'slate',
      r: 'slateLight',
      A: 'slateShade',
      i: 'iron',
      b: 'stoneLight',
    }),
  ],
);

/** A grid of 40x24 painted with runs: `put(x, y, 'text')` writes a run, `.` leaves what is there. */
function paint(
  size: { w: number; h: number },
  runs: readonly [number, number, string][],
): string[] {
  const grid = Array.from({ length: size.h }, () => Array.from({ length: size.w }, () => '.'));
  for (const [x, y, text] of runs) {
    [...text].forEach((ch, i) => {
      if (ch !== '.') grid[y]![x + i] = ch;
    });
  }
  return grid.map((row) => row.join(''));
}

// Level 4: a cream post with a teal banner hanging from a brass crossbar (swallowtail bottom, cream diamond,
// cream band; lit on the left, shaded on the right like the walls) and a brass lamp hanging from an ornate
// wrought-iron arm (W): a curl at the end, an S-scroll brace and a brass boss on the post.
const TIER_4 = sample(
  paint({ w: 40, h: 24 }, [
    // post, finial and collar
    [18, 3, 'kk'],
    [17, 4, 'kbbk'],
    [17, 5, 'kBBk'],
    [16, 6, 'kbbbbk'],
    ...Array.from({ length: 11 }, (_, i): [number, number, string] => [16, 7 + i, 'kccCCk']),
    [13, 18, 'kkkkccCCkkkk'],
    [12, 19, 'kbbbbbbbbbbbbk'],
    [12, 20, 'kcccccccccccck'],
    [12, 21, 'kCCCCCCCCCCCCk'],
    [13, 22, 'kkkkkkkkkkkk'],
    // crossbar and banner
    [22, 7, 'kkkkkkkkkkkkkkkk'],
    [22, 8, 'bbbbbbbbbbbbbbbb'],
    [22, 9, 'BBBBBBBBBBBBBBBB'],
    [26, 10, 'kkkkkkkkkkkk'],
    ...Array.from({ length: 7 }, (_, i): [number, number, string] => [26, 11 + i, 'ktttttttTTTk']),
    [26, 16, 'kcccccccCCCk'],
    [31, 11, 'cc'],
    [30, 12, 'cccc'],
    [29, 13, 'ccccc' + 'C'],
    [30, 14, 'ccc' + 'C'],
    [31, 15, 'cc'],
    [26, 17, 'ktttttttTTTk'],
    [26, 18, 'kttttkkTTTTk'],
    [26, 19, 'ktttk..kTTTk'],
    [26, 20, 'kttk....kTTk'],
    [27, 21, 'kk'],
    [35, 21, 'kk'],
    // wrought-iron arm: end curl, arm, brass boss, S-scroll brace, chain
    [7, 6, 'WW'],
    [6, 7, 'W..W'],
    [6, 8, 'WWWWWWWWWW'],
    [16 - 2, 8, 'WW'],
    [15, 8, 'b'],
    [15, 7, 'B'],
    [15, 9, 'B'],
    [13, 9, 'W'],
    [14, 10, 'W'],
    [15, 11, 'W'],
    [15, 12, 'W'],
    [14, 13, 'W'],
    [14, 14, 'W'],
    [15, 14, 'W'],
    [9, 9, 'W'],
    // lamp
    [8, 10, 'kbk'],
    [6, 11, 'kBBBBBk'],
    [6, 12, 'kbgggbk'],
    [6, 13, 'kbghgbk'],
    [6, 14, 'kbghgbk'],
    [6, 15, 'kbgggbk'],
    [6, 16, 'kBBBBBk'],
    [7, 17, 'kkkkk'],
    // light on the ground and the cast shadow
    [7, 21, '1.2.1'],
    [4, 22, 'x1xx212xx'],
    [25, 22, 'xxxxxxxxxxxx'],
    [8, 23, 'xxxxxxxxxxxxxxxxxxxxxxxxx'],
  ]),
  [
    tierPalette(4, {
      c: 'cream',
      t: 'teal',
      T: 'tealShade',
      b: 'brass',
      B: 'brassShade',
      W: 'wrought',
    }),
  ],
  {
    C: m('#b8a888', '#d8ccae'),
    g: m('#ffd966', '#c4d6e0'),
    h: m('#fff6c8', '#e8f4fa'),
    '1': m('#8a6a28', '#467a4c'),
    '2': m('#d09a3c', '#467a4c'),
  },
);

const TIER_5 = sample(
  [
    '...................kk...................',
    '..................kzzk..................',
    '.................kZzzzk.................',
    '................kZZZzzyk...W............',
    '...............kZZWZzzyyk...............',
    '............W..kZZZZzzyyk...............',
    '..............kZWWZZzzyyyk..............',
    '..............kZZWZZzzyyyk..............',
    '..............kZZZZZzzyyyk..W...........',
    '...........W...kZZZZzzyyk...............',
    '...............kZZZzzzyyk...............',
    '...............kkZZzzzykk...............',
    '..............kHGGGGGGGGHk..............',
    '........kkkkkkGGGGGGGGGGGGkkkkkk........',
    '.......kGGGGGGGGGGGGGGGGGGGGGGGGk.......',
    '.......kHHHHHHHHHHHHHHHHHHHHHHHHk.......',
    '........kLLLLLLLLLLLLLLLLLLLLLLk........',
    '........kttttttttttttttttttttttk........',
    '........ktttttTtttttTttuuuuuuuuk........',
    '........kttGttTGtttGTttGuuuGuuuk........',
    '........ktttttTtttttTttuuuuuuuuk........',
    '........kuuuuuuuuuuuuuuuuuuuuuuk........',
    '...xxxxxxkkkkkkkkkkkkkkkkkkkkkkxxxxxxx..',
    '......xxxxxx1xxx1xxxxxxx1xxx1xxxxxx.....',
  ],
  [
    tierPalette(3, { ...STONE, u: 'stoneShade' }),
    tierPalette(5, {
      G: 'gold',
      H: 'goldShade',
      Z: 'crystalLight',
      z: 'crystal',
      y: 'crystalShade',
      W: 'crystalLight',
    }),
  ],
  { '1': m('#2f5a4a', '#467a4c') },
);

export const VALLEY_TIERS_CONCEPTS: ConceptSet = {
  id: 'valley-tiers',
  title: 'Valley building levels: the shared materials',
  requested:
    '2026-11-09 (Misa): buildings get better level by level and may change material; the same level shares a motif across buildings, like a new town hall look.',
  status: 'draft',
  notes: [
    'The material board is `TIERS` in `valley-tiers.ts` (night and day colour per material); `tierPalette(level, { key: "material" })` builds a sprite palette and its day alt. Spec: docs/design/art-levels.md.',
    'Level 1, Humble: raw logs, rope lashings, straw, packed earth and loose fieldstones; small, home-made, a little crooked.',
    'Level 2, Settled: sawn planks with nails and the red-brown shingle roof (one light from the upper left: lit shingles on the left, shaded on the right, like the walls).',
    'Level 3, Stone (redone 2026-11-11): warm sandstone blocks with a light edge, terracotta barrel-tile roof and black iron bands and brackets. The material names stay `stone` and `slate` (aliases `sandstone`, `terracotta`).',
    'Level 4, Valley (redone 2026-11-11): cream plaster and brass; a teal banner with a cream diamond hanging from a crossbar, and a brass lamp hanging from an ornate wrought-iron arm (curl, S-scroll brace, brass boss); lit glass at night, plain glass by day.',
    "Level 5, Crystal: the Market's teal shard as a glowing finial (it glows by day too) and gold trim, on a stone cap.",
    '2026-11-11 (Misa): level 1 Humble liked, level 5 Crystal liked. Level 2: "The shade on the building\'s body changes as if to indicate it\'s 3D whereas the roof doesn\'t do the same. Is this intentional?" (redone: one light for walls and roof). Level 3: "The gray stone is quite boring. Can we use brick, terracotta or sandstone for inspiration?" (redone: sandstone and terracotta). Level 4: "I\'m not sure what the teal and cream thing is supposed to be. A flag? The arm holding the lamp could be more elaborate." (redone: hanging banner, wrought-iron arm).',
    "The samples are 40x24 motif references on the valley-glow ground: night is the main palette, `alts.day` recolours the same pixels. Buildings copy their level's materials and signature from them.",
  ],
  ...(VALLEY_GLOW_CONCEPTS.backdrop === undefined
    ? {}
    : { backdrop: VALLEY_GLOW_CONCEPTS.backdrop }),
  sprites: {
    'tier-1': {
      kind: 'free',
      status: 'liked',
      note: 'Level 1, Humble: a rope-lashed log post with a crooked cross branch, a straw tuft and fieldstones on packed earth.',
      sprite: TIER_1.sprite,
      alts: { day: TIER_1.day },
    },
    'tier-2': {
      kind: 'free',
      status: 'draft',
      note: 'Level 2, Settled: a plank wall corner with nailed boards and a plank sign under a red-brown shingle eave.',
      sprite: TIER_2.sprite,
      alts: { day: TIER_2.day },
    },
    'tier-3': {
      kind: 'free',
      status: 'draft',
      note: 'Level 3, Stone: a sandstone corner with light edge stones, a black iron bracket and a terracotta barrel-tile roof.',
      sprite: TIER_3.sprite,
      alts: { day: TIER_3.day },
    },
    'tier-4': {
      kind: 'free',
      status: 'draft',
      note: 'Level 4, Valley: a cream post with a hanging teal banner (cream diamond, swallowtail) and a brass lamp on an ornate wrought-iron arm; the lamp glows at night, plain glass by day.',
      sprite: TIER_4.sprite,
      alts: { day: TIER_4.day },
    },
    'tier-5': {
      kind: 'free',
      status: 'liked',
      note: 'Level 5, Crystal: a glowing teal crystal finial in a gold collar on a stone cap with gold trim; the crystal glows by day too.',
      sprite: TIER_5.sprite,
      alts: { day: TIER_5.day },
    },
  },
};
