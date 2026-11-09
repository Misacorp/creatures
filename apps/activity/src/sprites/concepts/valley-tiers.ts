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
    // sawn planks, wooden shingles (the school's roof), iron nails
    plank: m('#b0764a', '#d4a266'),
    plankShade: m('#6e4636', '#9c6a3c'),
    shingle: m('#7a4070', '#c8684a'),
    shingleShade: m('#3a2650', '#a04a3a'),
    nail: m('#2a2e52', '#4a4a58'),
  },
  3: {
    name: 'Stone',
    // cut grey stone (the bonfire's stones, lightened), slate roof, black iron
    stone: m('#7e86aa', '#a5a2ae'),
    stoneShade: m('#566088', '#7a7684'),
    stoneLight: m('#aeb6d6', '#d4d0d8'),
    slate: m('#5a5690', '#6a7084'),
    slateShade: m('#3c3a6c', '#4a5064'),
    iron: m('#1c1a2c', '#2e2c3a'),
  },
  4: {
    name: 'Valley',
    // the valley's teal and cream (the market's awning), brass
    teal: m('#2f8a78', '#2a8a8a'),
    tealShade: m('#1f5a5a', '#1f6a6a'),
    cream: m('#e8d8b0', '#f4ecd0'),
    brass: m('#d0a040', '#f0b830'),
    brassShade: m('#8a6a28', '#b08820'),
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

const TIER_2 = sample(
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
  [tierPalette(2, { p: 'plank', P: 'plankShade', s: 'shingle', S: 'shingleShade', n: 'nail' })],
);

const STONE = {
  t: 'stone',
  T: 'stoneShade',
  L: 'stoneLight',
} as const;

const TIER_3 = sample(
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
  [
    tierPalette(3, {
      ...STONE,
      u: 'stone',
      U: 'stoneShade',
      a: 'slate',
      A: 'slateShade',
      i: 'iron',
      b: 'stoneLight',
    }),
  ],
);

const TIER_4 = sample(
  [
    '........................................',
    '........................................',
    '........................................',
    '..................kk....................',
    '.................kbbk...................',
    '................kbbbbkkkk...............',
    '................kBbbBttttkkkk...........',
    '.........kkkkkkkkccCCttttttttkkkk.......',
    '........kbbbbbbbbccCCttttttttttttk......',
    '.......kkbkkkkkkkccCCTTTTTTTTTTTTk......',
    '......kBBBBBk...kccCCcccccccccccck......',
    '......kbgggbk...kccCCcccccccccccck......',
    '......kbghgbk...kccCCcccccccckkkk.......',
    '......kbghgbk...kbbbbcccckkkk...........',
    '......kbgggbk...kccCCkkkk...............',
    '......kBBBBBk...kccCCk..................',
    '.......kkkkk....kccCCk..................',
    '................kccCCk..................',
    '.............kkkkccCCkkkk...............',
    '............kbbbbbbbbbbbbk..............',
    '............kcccccccccccck..............',
    '.......1.2.1kCCCCCCCCCCCCk..............',
    '....x1xx212xxkkkkkkkkkkkkxxxxxxxxxxxx...',
    '........xxxxxxxxxxxxxxxxxxxxxxxxx.......',
  ],
  [tierPalette(4, { c: 'cream', t: 'teal', T: 'tealShade', b: 'brass', B: 'brassShade' })],
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
    'Level 2, Settled: sawn planks with nails, the red-brown shingle roof and a plank sign.',
    'Level 3, Stone: grey cut stone with lighter corner stones, a slate edge and black iron bands and brackets.',
    "Level 4, Valley: cream plaster and teal trim, the valley's teal-and-cream pennant and a brass lamp with lit glass (plain glass by day).",
    "Level 5, Crystal: the Market's teal shard as a glowing finial (it glows by day too) and gold trim, on a stone cap.",
    "The samples are 40x24 motif references on the valley-glow ground: night is the main palette, `alts.day` recolours the same pixels. Buildings copy their level's materials and signature from them.",
  ],
  ...(VALLEY_GLOW_CONCEPTS.backdrop === undefined
    ? {}
    : { backdrop: VALLEY_GLOW_CONCEPTS.backdrop }),
  sprites: {
    'tier-1': {
      kind: 'free',
      note: 'Level 1, Humble: a rope-lashed log post with a crooked cross branch, a straw tuft and fieldstones on packed earth.',
      sprite: TIER_1.sprite,
      alts: { day: TIER_1.day },
    },
    'tier-2': {
      kind: 'free',
      note: 'Level 2, Settled: a plank wall corner with nailed boards and a plank sign under a red-brown shingle eave.',
      sprite: TIER_2.sprite,
      alts: { day: TIER_2.day },
    },
    'tier-3': {
      kind: 'free',
      note: 'Level 3, Stone: a cut-stone corner with lighter corner stones, a black iron bracket and a slate edge.',
      sprite: TIER_3.sprite,
      alts: { day: TIER_3.day },
    },
    'tier-4': {
      kind: 'free',
      note: 'Level 4, Valley: a cream post with a teal-and-cream pennant and a brass lamp; the lamp glows at night, plain glass by day.',
      sprite: TIER_4.sprite,
      alts: { day: TIER_4.day },
    },
    'tier-5': {
      kind: 'free',
      note: 'Level 5, Crystal: a glowing teal crystal finial in a gold collar on a stone cap with gold trim; the crystal glows by day too.',
      sprite: TIER_5.sprite,
      alts: { day: TIER_5.day },
    },
  },
};
