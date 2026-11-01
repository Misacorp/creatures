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
const BAD_DARK = '#a8434f';
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
    'Needs before use: Misa approves the look; each icon gets a glyph id in glyphs.ts, a glossary entry and (shapes) a place in moveLabel; the dungeon modifier "extra crits" then switches from the reticle to the Crit icon.',
    'Cut order if Misa wants fewer icons: the three Store meter heads (name the resource in text), then the silence ward, then the cracked armour (a crack drawn over the armour icon), then One-shot (it shares the Strike crosshairs).',
  ],
  shipped: [
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
    'shape-quake': {
      status: 'liked',
      kind: 'glyph',
      group: SHAPES,
      role: 'Quake',
      note: 'Quake: every creature. A 3x3 board of slots with every slot lit.',
      sprite: {
        palette: { r: BAD },
        rows: [
          'rr.rr.rr',
          'rr.rr.rr',
          '........',
          'rr.rr.rr',
          'rr.rr.rr',
          '........',
          'rr.rr.rr',
          'rr.rr.rr',
        ],
      },
    },
    'shape-cross': {
      status: 'liked',
      kind: 'glyph',
      group: SHAPES,
      role: 'Cross',
      note: 'Cross: the creature hit and the ones beside, in front of and behind it. The same 3x3 board with a plus lit.',
      sprite: {
        palette: { r: BAD },
        rows: [
          '...rr...',
          '...rr...',
          '........',
          'rr.rr.rr',
          'rr.rr.rr',
          '........',
          '...rr...',
          '...rr...',
        ],
      },
    },
    'shape-checker': {
      status: 'liked',
      kind: 'glyph',
      group: SHAPES,
      role: 'Checker',
      note: 'Checker: every other slot of the arena, like the dark squares of a board. A checkerboard.',
      sprite: {
        palette: { r: BAD },
        rows: [
          'rr..rr..',
          'rr..rr..',
          '..rr..rr',
          '..rr..rr',
          'rr..rr..',
          'rr..rr..',
          '..rr..rr',
          '..rr..rr',
        ],
      },
    },
    'shape-one-shot': {
      status: 'liked',
      kind: 'glyph',
      group: SHAPES,
      role: 'One-shot',
      note: "One-shot (Judgement Bolt): takes a share of the victim's Max HP, not Attack times power. The HP heart split by a bolt.",
      sprite: {
        palette: { r: BAD, g: GOLD },
        rows: [
          '.....gg.',
          '.rr.ggr.',
          'rrrgggrr',
          'rrrrggrr',
          'rrrggrrr',
          '.rggrrr.',
          '..grrr..',
          '...rr...',
        ],
      },
    },
    'shape-slam': {
      kind: 'glyph',
      group: SHAPES,
      role: 'Slam',
      note: 'Slam (redrawn, round 2): the creature hit, then the ones beside it. A row: a big square for the target and a smaller one each side, darker for the share the neighbours take. At 8 pixels the sides are one pixel wide and two tall, because 2 + 1 + 4 + 1 + 2 would need ten.',
      sprite: {
        palette: { r: BAD, d: BAD_DARK },
        rows: [
          '........',
          '........',
          '..rrrr..',
          'd.rrrr.d',
          'd.rrrr.d',
          '..rrrr..',
          '........',
          '........',
        ],
      },
    },
    'shape-strike': {
      kind: 'glyph',
      group: SHAPES,
      role: 'Strike',
      note: 'Strike (redrawn, round 2): one creature. The crosshair that was inside the old circle, without the circle: four short bars round an empty centre.',
      sprite: {
        palette: { r: BAD },
        rows: [
          '...rr...',
          '...rr...',
          '...rr...',
          'rrr..rrr',
          'rrr..rrr',
          '...rr...',
          '...rr...',
          '...rr...',
        ],
      },
    },
    'shape-lance': {
      kind: 'glyph',
      group: SHAPES,
      role: 'Lance',
      note: 'Lance (redrawn, round 2): a column, front to back. The same arrow driven through three rows, flipped so it points down: the boss attacks from the top.',
      sprite: {
        palette: { r: BAD, w: BONE },
        rows: [
          'wwwrrwww',
          '...rr...',
          'wwwrrwww',
          '...rr...',
          'wwwrrwww',
          '...rr...',
          '..rrrr..',
          '...rr...',
        ],
      },
    },
    'shape-pincer': {
      kind: 'glyph',
      group: SHAPES,
      role: 'Pincer',
      note: 'Pincer (redrawn, round 2), claws: the two ends of the row. Each side a small claw: two prongs round a notch, tips facing; the white dot is gone. Compare with the next tile, which only drops the dot.',
      sprite: {
        mirror: true,
        palette: { r: BAD },
        rows: ['r...', 'rr..', 'rrr.', 'rr..', 'rr..', 'rrr.', 'rr..', 'r...'],
      },
    },
    'shape-pincer-plain': {
      kind: 'glyph',
      group: SHAPES,
      role: 'Pincer (no claws)',
      note: 'Pincer, the other option: the shipped two arrows closing on the ends, with the centre dot removed (and the arrowheads a little fuller, so it is not a copy of the shipped glyph).',
      sprite: {
        mirror: true,
        palette: { r: BAD },
        rows: ['r...', 'rr..', 'rrr.', 'rrr.', 'rrr.', 'rrr.', 'rr..', 'r...'],
      },
    },
    'shape-leap': {
      kind: 'glyph',
      group: SHAPES,
      role: 'Leap',
      note: 'Leap (was Leaping Strike; redrawn, round 2): the strongest, then the next, softer. Like Barrage but three squares, joined by a faint zigzag line (a bolt, without the bolt that Spark already is).',
      sprite: {
        palette: { r: BAD, f: BAD_FAINT },
        rows: [
          'rr......',
          'rrff....',
          '....ff..',
          '......rr',
          '......rr',
          '....ff..',
          'rrff....',
          'rr......',
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
    attack: {
      kind: 'glyph',
      group: BOARD,
      role: 'Plain attack',
      note: "A creature's plain attack (round 2): a sword, so the plain attack and the Strike shape (a boss move) no longer share one picture.",
      sprite: {
        palette: { w: BONE, h: STEEL_LIGHT, g: GOLD, d: STEEL_DARK },
        rows: [
          '......ww',
          '.....whw',
          '....whh.',
          '.g.whh..',
          '..ghh...',
          '.dggg...',
          'dd.g....',
          'd.......',
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
      kind: 'glyph',
      group: STORES,
      role: 'Heat',
      note: 'The Heat store (Boiling Point): the shared box with heat rising from it in waves. The count is text beside it ("x3").',
      sprite: {
        palette: { ...BOX_PALETTE, o: '#ffa83a' },
        rows: stored(['...o.o..', '..o...o.', '...o.o..', '..o...o.', '...o.o..']),
      },
    },
    'store-calm': {
      kind: 'glyph',
      group: STORES,
      role: 'Calm',
      note: 'The Calm store (Eye of the Storm): the shared box with a lotus in it. The count is text beside it ("x2").',
      sprite: {
        palette: { ...BOX_PALETTE, c: '#7fc4f5' },
        rows: stored(['........', '...cc...', '.c.cc.c.', '.cccccc.', '..cccc..']),
      },
    },
    'store-static': {
      kind: 'glyph',
      group: STORES,
      role: 'Static',
      note: 'The Static store (a dodge fills it): the shared box with a small crackle in it. The count is text beside it ("x1").',
      sprite: {
        palette: { ...BOX_PALETTE, y: '#f2d43d' },
        rows: stored(['....yy..', '...yy...', '..yyyy..', '....yy..', '...yy...']),
      },
    },
  },
};
