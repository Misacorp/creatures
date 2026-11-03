/**
 * Combat v2's icons (docs/design/combat/icons.md): the 8x8 glyphs the new board and cards need that the shipped
 * glyph set (`src/glyphs.ts`) does not have. Drawn like the shipped ones: flat colour, no outline, one to four colours, a
 * shape of their own (colour is never the only cue). Boss attack shapes are red like the shipped gimmick glyphs; a
 * helpful state is gold or green; the rest are the neutral haze. Concept art: nothing in the game imports it.
 */
import type { ConceptSet } from './index';

const BAD = '#ff5f6d';
const BONE = '#f4eedc';
const GOLD = '#ffd25a';
const HAZE = '#a69fc8';
const GOOD = '#6fdc8c';
const STEEL = '#9a98ae';
const STEEL_LIGHT = '#c9c7d8';
const STEEL_DARK = '#6b6396';
const BAD_FAINT = '#8a3a52';

const SHAPES = 'Attack shapes (the move label)';
const BOARD = 'Board states and counters';
const STORES = 'Store meters (the head of the meter)';
const ALREADY = 'Elements and roles, already there';

/**
 * The one container every Store meter shares (Misa, 2026-11-01: "a box, chest, safe, vault, or basket that contains
 * something"): the box's pixels are the same for all three; only the content in it and above it differs.
 * The amount is text beside the icon ("x2"), never drawn into it.
 */
const BOX_PALETTE = { h: STEEL_LIGHT, g: STEEL, d: STEEL_DARK };
const BOX_ROWS = [
  '........',
  '........',
  '........',
  'g......g',
  'g......g',
  'hhhhhhhh',
  'gggddggg',
  'dddddddd',
];
/** The box over its content (the content's five rows, drawn first; the box's pixels win). */
const stored = (content: readonly string[]): string[] =>
  BOX_ROWS.map((box, y) =>
    [...box].map((ch, x) => (ch === '.' ? ((content[y] ?? '')[x] ?? '.') : ch)).join(''),
  );

export const COMBAT_ICONS_CONCEPTS: ConceptSet = {
  id: 'combat-icons',
  title: 'Combat v2 icons: attack shapes, board states, store meters',
  requested:
    '2026-10-31, Misa: "icons for keywords and attack shapes" (roadmap phase 3, combat v2).',
  status: 'draft',
  notes: [
    'The audit is docs/design/combat/icons.md: which icons are new, which shipped glyphs are used as they are, and which words stay text.',
    'Misa\'s review, 2026-11-01. Liked as drawn: Quake, Cross, Checker, One-shot ("really like"), Barrage ("three marks is enough"), Sweep, Crit. Redrawn in round 2 (each replaces the shipped glyph for combat v2, which v1 keeps using): Slam, Strike, Lance, Pincer, Leap, Plain attack, Boost, and the three Store meters.',
    'Round 2 feedback: Slam "the target, then the adjacent creatures: like the cross, but the centre square bigger, one square left and right". Strike "the right shape, but inside a circle: remove the circle". Lance "should point downwards: the boss attacks from top to bottom". Pincer "a very subtle crab-pincer; the white dot is unnecessary" (both options shown). Leap "like Barrage, but squares, with a faint line between them, a zigzag". Plain attack "should look different from a move: something like a sword". Boost "a star does not look good". Store meters "a box, chest, safe, vault or basket that contains something: one container for all, each holding its own thing; the amount as text beside it (x3), never in the icon".',
    'Round 2 answers (Misa, 2026-11-01): liked as drawn: Slam, Strike ("different from Cross, good enough"), Lance, Pincer (claws: "looking pretty good"; the plain alternative is removed), the plain attack sword, the three Stores ("nice"). Leap: "it looks like a fork right now; move the bottom square right a pixel or two, so it reads as a chain": done in round 3, awaiting his look. Still draft (not commented on): Boost, Escalating, armour, cracked armour, silence ward, Determination.',
    'Moved into `glyphs.ts` (2026-11-03, the v2 raid tab used them first): Quake, Cross, Checker, One-shot, Slam, Strike, Lance, Pincer and the plain attack, under the ids they had here. They stand in the sheet as shipped glyphs now. Leap and the six unreviewed ones stay here: a screen draws their drafts (`combat-glyphs.ts`) until Misa answers, then they move too.',
    'Needs before use: Misa approves the look; each icon gets a glyph id in glyphs.ts, a glossary entry and (shapes) a place in moveLabel; the dungeon modifier "extra crits" then switches from the reticle to the Crit icon.',
    'Cut order if Misa wants fewer icons: the three Store meter heads (name the resource in text), then the silence ward, then the cracked armour (a crack drawn over the armour icon), then One-shot (it shares the Strike crosshairs).',
  ],
  shipped: [
    { group: SHAPES, id: 'shape-quake', marks: 'Quake' },
    { group: SHAPES, id: 'shape-cross', marks: 'Cross' },
    { group: SHAPES, id: 'shape-checker', marks: 'Checker' },
    { group: SHAPES, id: 'shape-one-shot', marks: 'One-shot' },
    { group: SHAPES, id: 'shape-slam', marks: 'Slam' },
    { group: SHAPES, id: 'shape-strike', marks: 'Strike' },
    { group: SHAPES, id: 'shape-lance', marks: 'Lance' },
    { group: SHAPES, id: 'shape-pincer', marks: 'Pincer' },
    { group: BOARD, id: 'attack', marks: 'Plain attack' },
    { group: SHAPES, id: 'sweep', marks: 'Sweep' },
    { group: SHAPES, id: 'barrage', marks: 'Barrage' },
    { group: SHAPES, id: 'silence_ends', marks: 'Hush' },
    { group: BOARD, id: 'mark', marks: 'Mark' },
    { group: BOARD, id: 'lock', marks: 'Seal' },
    { group: BOARD, id: 'charge', marks: 'Wind-up' },
    { group: BOARD, id: 'silence_ends', marks: 'Silenced' },
    { group: BOARD, id: 'mired', marks: 'Mired' },
    { group: BOARD, id: 'skull', marks: 'Knocked out' },
    { group: ALREADY, id: 'tide', marks: 'Tide' },
    { group: ALREADY, id: 'ember', marks: 'Ember' },
    { group: ALREADY, id: 'grove', marks: 'Grove' },
    { group: ALREADY, id: 'spark', marks: 'Spark' },
    { group: ALREADY, id: 'mire', marks: 'Mire' },
    { group: ALREADY, id: 'mark', marks: 'Setter' },
    { group: ALREADY, id: 'sparkle', marks: 'Payoff' },
    { group: ALREADY, id: 'shield', marks: 'Guard' },
    { group: ALREADY, id: 'ability', marks: 'Support' },
  ],
  sprites: {
    'shape-leap': {
      kind: 'glyph',
      group: SHAPES,
      role: 'Leap',
      note: 'Leap (was Leaping Strike; redrawn, round 3): the strongest, then the next, softer. Like Barrage but three squares, joined by a faint zigzag line (a bolt, without the bolt that Spark already is). Misa, 2026-11-01: "it looks like a fork right now; move the bottom square right a pixel or two, so it reads as a chain". The bottom square moved 2 pixels right (1 pixel still read as a ">" arrow); the line still joins it.',
      sprite: {
        palette: { r: BAD, f: BAD_FAINT },
        rows: [
          'rr......',
          'rrff....',
          '....ff..',
          '......rr',
          '......rr',
          '....ff..',
          '..rrf...',
          '..rr....',
        ],
      },
    },
    crit: {
      status: 'liked',
      kind: 'glyph',
      group: BOARD,
      role: 'Crit, Sure Crit',
      note: 'A lucky hit that deals double. A gold burst; a Sure Crit counter is this burst with its count ("x2"), never a meter of its own.',
      sprite: {
        palette: { g: GOLD, w: BONE },
        rows: [
          '...gg...',
          'g..gg..g',
          '.gggggg.',
          'ggwwwwgg',
          'ggwwwwgg',
          '.gggggg.',
          'g..gg..g',
          '...gg...',
        ],
      },
    },
    armour: {
      kind: 'glyph',
      group: BOARD,
      role: 'Armour, Blocked',
      note: "Armour on the boss card (with its number) and the shield of a Blocked hit (with 0). A steel breastplate, so it is not the Guard's shield.",
      sprite: {
        palette: { g: STEEL, h: STEEL_LIGHT, d: STEEL_DARK },
        rows: [
          'gg....gg',
          'ggg..ggg',
          'ghgggggg',
          'ghgggggg',
          'gggggggd',
          '.gggggd.',
          '..gggd..',
          '..dddd..',
        ],
      },
    },
    'armour-cracked': {
      kind: 'glyph',
      group: BOARD,
      role: 'Will be Blocked',
      note: "On a creature whose plain hit would be Blocked by the boss's armour: the breastplate with a red crack through it.",
      sprite: {
        palette: { g: STEEL, h: STEEL_LIGHT, d: STEEL_DARK, r: BAD },
        rows: [
          'gg....gg',
          'ggg..ggg',
          'ghggrggg',
          'ghgrrggg',
          'gggrgggd',
          '.ggrrgd.',
          '..ggrd..',
          '..ddrd..',
        ],
      },
    },
    escalating: {
      kind: 'glyph',
      group: BOARD,
      role: 'Escalating',
      note: 'The boss grows as the weekend goes on, a step at a time. Rising steps, the top one lit.',
      sprite: {
        palette: { r: BAD, w: BONE },
        rows: [
          '......ww',
          '......rr',
          '....rrrr',
          '....rrrr',
          '..rrrrrr',
          '..rrrrrr',
          'rrrrrrrr',
          'rrrrrrrr',
        ],
      },
    },
    'silence-ward': {
      kind: 'glyph',
      group: BOARD,
      role: 'Silence ward',
      note: 'A warded creature cannot be silenced. The Silenced speaker with sound waves instead of a cross.',
      sprite: {
        palette: { h: HAZE, g: GOOD },
        rows: [
          '...h....',
          '..hh.g..',
          'hhhh..g.',
          'hhhh..g.',
          'hhhh..g.',
          '..hh.g..',
          '...h....',
          '........',
        ],
      },
    },
    determination: {
      kind: 'glyph',
      group: BOARD,
      role: 'Determination',
      note: 'More damage and healing for each failed weekend on the same boss. A gold arrow rising from a base: more each failed try, up to five.',
      sprite: {
        palette: { g: GOLD },
        rows: [
          '...gg...',
          '..gggg..',
          '.gggggg.',
          'gg.gg.gg',
          '...gg...',
          '...gg...',
          '........',
          'gggggggg',
        ],
      },
    },
    boost: {
      kind: 'glyph',
      group: BOARD,
      role: 'Boost',
      note: "A Support's bonus on a creature's next hit (round 2): two upward chevrons, a rank going up. No star, and no filled arrow with a base, so it is not Determination's rising arrow.",
      sprite: {
        palette: { g: GOOD },
        rows: [
          '...gg...',
          '..gggg..',
          '.gg..gg.',
          '........',
          '...gg...',
          '..gggg..',
          '.gg..gg.',
          '........',
        ],
      },
    },
    'store-heat': {
      status: 'liked',
      kind: 'glyph',
      group: STORES,
      role: 'Heat',
      note: 'The Heat store (Boiling Point): the shared box with heat rising from it in waves. The count is text beside it ("x3"). Misa, 2026-11-01: "nice".',
      sprite: {
        palette: { ...BOX_PALETTE, o: '#ffa83a' },
        rows: stored(['...o.o..', '..o...o.', '...o.o..', '..o...o.', '...o.o..']),
      },
    },
    'store-calm': {
      status: 'liked',
      kind: 'glyph',
      group: STORES,
      role: 'Calm',
      note: 'The Calm store (Eye of the Storm): the shared box with a lotus in it. The count is text beside it ("x2"). Misa, 2026-11-01: "nice".',
      sprite: {
        palette: { ...BOX_PALETTE, c: '#7fc4f5' },
        rows: stored(['........', '...cc...', '.c.cc.c.', '.cccccc.', '..cccc..']),
      },
    },
    'store-static': {
      status: 'liked',
      kind: 'glyph',
      group: STORES,
      role: 'Static',
      note: 'The Static store (a dodge fills it): the shared box with a small crackle in it. The count is text beside it ("x1"). Misa, 2026-11-01: "nice".',
      sprite: {
        palette: { ...BOX_PALETTE, y: '#f2d43d' },
        rows: stored(['....yy..', '...yy...', '..yyyy..', '....yy..', '...yy...']),
      },
    },
  },
};
