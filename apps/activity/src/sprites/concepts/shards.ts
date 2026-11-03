/**
 * Element shard part icons (8x8), redrawn so each element is told apart by outline alone, not by colour
 * (accessibility review: Ember and Grove are a deuteranope confusion pair). Colours are the shipped ones.
 * Concept art: nothing in the game imports it. The `-now` sprites are copied unchanged from `gear-sprites.ts`
 * (copied, not imported: that module pulls in the game package, which the studio's loader cannot read).
 */
import type { SpriteDef } from '../sprite-data';
import type { Concept, ConceptSet } from './index';

const INK = '#0d0a1a';

const TIDE = { k: INK, b: '#4f8fe6', h: '#a6d0ff', w: '#e6f6ff' } as const;
const EMBER = { k: INK, b: '#ef6a3a', h: '#ffc08a', y: '#ffe680' } as const;
const GROVE = { k: INK, b: '#5cbf5a', h: '#b8f08a', m: '#2f7a3a' } as const;
const SPARK = { k: INK, b: '#f2d43d', h: '#fff6b0' } as const;
const MIRE = { k: INK, b: '#b8864a', h: '#e8c068', m: '#6b4a2a' } as const;

/** Each colour as a deuteranope sees it (Machado 2009, severity 1.0, applied in linear RGB). */
// The ink stays as it is: simulated it is #060c1a, which the shared-ink lint would reject for no visible gain.
const D_TIDE = { b: '#5287e4', h: '#b4c8fe', w: '#eef2ff' };
const D_EMBER = { b: '#b09e36', h: '#e2d28b', y: '#ffea84' };
const D_GROVE = { b: '#b5a761', h: '#f0de90', m: '#72693f' };
const D_SPARK = { b: '#f1d947', h: '#fff6b3' };
const D_MIRE = { b: '#a3944b', h: '#dcc96b', m: '#5c542a' };

const draw = (
  note: string,
  sprite: SpriteDef,
  deuteranope: Readonly<Record<string, string>>,
): Concept => ({ kind: 'part', note, sprite, alts: { deuteranope } });

/** The shipped icons, copied unchanged from `gear-sprites.ts`. */
const SHIPPED: Readonly<Record<'tide' | 'ember' | 'grove' | 'spark' | 'mire', SpriteDef>> = {
  tide: {
    mirror: true,
    palette: TIDE,
    rows: ['...k', '..kb', '.kbh', 'kbwh', 'kbbh', '.kbb', '..kb', '...k'],
  },
  ember: {
    mirror: true,
    palette: EMBER,
    rows: ['.k.k', '.kbk', 'kbhb', 'kbhh', 'kbyh', '.kbb', '..kb', '...k'],
  },
  grove: {
    mirror: true,
    palette: GROVE,
    rows: ['....', 'kkkk', 'kbhh', 'kbhh', 'kbbh', 'kmbb', '.kmb', '..kk'],
  },
  spark: {
    palette: SPARK,
    rows: [
      '....kkk.',
      '...kbhk.',
      '..kbhk..',
      '.kbhhbk.',
      '.kkkbhk.',
      '...kbk..',
      '..kbk...',
      '..kk....',
    ],
  },
  mire: {
    mirror: true,
    palette: MIRE,
    rows: ['.kkk', 'kbhh', 'kbhb', 'kbbb', 'kmbb', 'kmmb', '.kmm', '..kk'],
  },
};

const now = (kind: keyof typeof SHIPPED, deuteranope: Readonly<Record<string, string>>): Concept =>
  draw(`The shipped ${kind} shard, unchanged, for comparison.`, SHIPPED[kind], deuteranope);

export const SHARDS_CONCEPTS: ConceptSet = {
  id: 'shards',
  title: 'Element shards, told apart by shape',
  requested:
    '2026-11-03: the element shard icons must differ by shape, not only colour (accessibility review from the valley session; Misa asked to provide what the valley needs).',
  status: 'draft',
  notes: [
    'Why: Ember (#ef6a3a) and Grove (#5cbf5a) are a classic deuteranope confusion pair and the shipped shards differ only in the top two rows. The Forge and Market loop is about which shard you need, so each element is a different outline. Colours are unchanged.',
    'Every sprite has a `deuteranope` alt (Machado 2009, severity 1.0). Its row in the set sheet is the test: five different shapes per variant column.',
    'Silhouettes: Tide a drop (a) or a curling wave (b); Ember a tall flame with a side tongue (a) or a crown of three flames (b); Grove a leaf on a stem (a) or a two-leaf sprout (b); Spark a bolt (a) or a zigzag (b); Mire a blob with one drip (a) or two drips (b).',
    'Needs before use: Misa picks a or b per element; the pick replaces its sprite in `gear-sprites.ts` (BUNDLED_PART_ICONS keeps its ids) and this concept is deleted. scrap and glimmer are untouched.',
  ],
  sprites: {
    'tide-now': now('tide', D_TIDE),
    'tide-a': draw(
      'A drop: pointed top, round flat base.',
      {
        mirror: true,
        palette: TIDE,
        rows: ['...k', '..kb', '..kb', '.kbh', 'kbhw', 'kbbh', 'kbbb', '.kkk'],
      },
      D_TIDE,
    ),
    'tide-b': draw(
      'A wave crystal: a crest curling over to the right.',
      {
        palette: TIDE,
        rows: [
          '....kkk.',
          '..kkbhhk',
          '.kbhbbbk',
          'kbhwbkbk',
          'kbbbbkkk',
          'kbbbbbbk',
          '.kbbbbk.',
          '..kkkk..',
        ],
      },
      D_TIDE,
    ),
    'ember-now': now('ember', D_EMBER),
    'ember-a': draw(
      'A tall flame: a main tongue with a smaller one at its side.',
      {
        palette: EMBER,
        rows: [
          '...k....',
          '..kbk.k.',
          '..kbbkbk',
          '.kbhbbbk',
          '.kbhybbk',
          '.kbhyybk',
          '..kbbbk.',
          '...kkk..',
        ],
      },
      D_EMBER,
    ),
    'ember-b': draw(
      'A crown of three flames on a short crystal.',
      {
        mirror: true,
        palette: EMBER,
        rows: ['.k.k', 'kbkb', 'kbbb', 'kbhb', 'kbyh', '.kbh', '.kbb', '..kk'],
      },
      D_EMBER,
    ),
    'grove-now': now('grove', D_GROVE),
    'grove-a': draw(
      'A leaf, tilted, with a vein and a stem at its foot.',
      {
        palette: GROVE,
        rows: [
          '.....kkk',
          '...kkbhk',
          '..kbhhbk',
          '.kbhmbbk',
          '.kbmbbk.',
          'kbmbbk..',
          'kkbbk...',
          'k.kk....',
        ],
      },
      D_GROVE,
    ),
    'grove-b': draw(
      'A sprout: two leaves on a stem, in a crystal base.',
      {
        mirror: true,
        palette: GROVE,
        rows: ['kk..', 'kbk.', 'kbhk', '.kmk', '..km', '..kb', '.kbb', '.kkk'],
      },
      D_GROVE,
    ),
    'spark-now': now('spark', D_SPARK),
    'spark-a': draw(
      'A fat bolt: a broad head stepping down to a thin tail.',
      {
        palette: SPARK,
        rows: [
          '....kkkk',
          '...kbhhk',
          '..kbhbk.',
          '.kbhbkkk',
          '.kkkhbbk',
          '...kbhk.',
          '..kbbk..',
          '..kkk...',
        ],
      },
      D_SPARK,
    ),
    'spark-b': draw(
      'A thin zigzag bolt, two sharp turns.',
      {
        palette: SPARK,
        rows: [
          '.kkkkk..',
          '.kbhhk..',
          '..kbhk..',
          '.kkbbkkk',
          'kbbhhbbk',
          'kkkkbhk.',
          '....kbk.',
          '....kk..',
        ],
      },
      D_SPARK,
    ),
    'mire-now': now('mire', D_MIRE),
    'mire-a': draw(
      'A lump with a single drip hanging from its belly.',
      {
        palette: MIRE,
        rows: [
          '........',
          '..kkkk..',
          '.kbhhbk.',
          'kbhbbbbk',
          'kbbbbmbk',
          'kmbbmmbk',
          '.kbkkkk.',
          '.kmk....',
        ],
      },
      D_MIRE,
    ),
    'mire-b': draw(
      'A slumped blob with two drips, one longer.',
      {
        palette: MIRE,
        rows: [
          '........',
          '.kkkk...',
          'kbhhbkk.',
          'kbhbbbbk',
          'kbbbbmbk',
          '.kbbkbbk',
          '.kbk.kbk',
          '..k...k.',
        ],
      },
      D_MIRE,
    ),
  },
};
