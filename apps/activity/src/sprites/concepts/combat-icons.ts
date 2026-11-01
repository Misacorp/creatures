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

const SHAPES = 'Attack shapes (the move label)';
const BOARD = 'Board states and counters';
const STORES = 'Store meters (the head of the meter)';
const ALREADY = 'Elements and roles, already there';

export const COMBAT_ICONS_CONCEPTS: ConceptSet = {
  id: 'combat-icons',
  title: 'Combat v2 icons: attack shapes, board states, store meters',
  requested:
    '2026-10-31, Misa: "icons for keywords and attack shapes" (roadmap phase 3, combat v2).',
  status: 'draft',
  notes: [
    'The audit is docs/design/combat/icons.md: which icons are new, which shipped glyphs are used as they are, and which words stay text.',
    'Needs before use: Misa approves the look; each icon gets a glyph id in glyphs.ts, a glossary entry and (shapes) a place in moveLabel; the dungeon modifier "extra crits" then switches from the reticle to the Crit icon.',
    'Cut order if Misa wants fewer icons: the three Store meter heads (name the resource in text), then the silence ward, then the cracked armour (a crack drawn over the armour icon), then One-shot (it shares the Strike crosshairs).',
  ],
  shipped: [
    { group: SHAPES, id: 'slam', marks: 'Slam' },
    { group: SHAPES, id: 'lance', marks: 'Lance' },
    { group: SHAPES, id: 'sweep', marks: 'Sweep' },
    { group: SHAPES, id: 'barrage', marks: 'Barrage' },
    { group: SHAPES, id: 'reticle', marks: 'Strike' },
    { group: SHAPES, id: 'silence_ends', marks: 'Hush' },
    { group: SHAPES, id: 'pincer', marks: 'Pincer' },
    { group: SHAPES, id: 'chain', marks: 'Leaping Strike' },
    { group: BOARD, id: 'mark', marks: 'Mark' },
    { group: BOARD, id: 'lock', marks: 'Seal' },
    { group: BOARD, id: 'charge', marks: 'Wind-up' },
    { group: BOARD, id: 'silence_ends', marks: 'Silenced' },
    { group: BOARD, id: 'mired', marks: 'Mired' },
    { group: BOARD, id: 'ability', marks: 'Boost' },
    { group: BOARD, id: 'reticle', marks: 'Plain attack' },
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
    crit: {
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
    'store-heat': {
      kind: 'glyph',
      group: STORES,
      role: 'Heat',
      note: 'The Heat store (Boiling Point). Heat haze: wavy lines rising from a hot base, not the Ember flame.',
      sprite: {
        palette: { o: '#ffa83a', r: '#ef6a3a' },
        rows: [
          '.o..o...',
          'o..o..o.',
          '.o..o..o',
          'o..o..o.',
          '.o..o...',
          '........',
          'rrrrrrrr',
          'rrrrrrrr',
        ],
      },
    },
    'store-calm': {
      kind: 'glyph',
      group: STORES,
      role: 'Calm',
      note: 'The Calm store (Eye of the Storm). A lotus floating on still water.',
      sprite: {
        palette: { c: '#7fc4f5', b: '#4f8fe6' },
        rows: [
          '...cc...',
          '..cccc..',
          'c.cccc.c',
          'cc.cc.cc',
          '.cccccc.',
          '..cccc..',
          '........',
          'bbbbbbbb',
        ],
      },
    },
    'store-static': {
      kind: 'glyph',
      group: STORES,
      role: 'Static',
      note: 'The Static store (a dodge fills it). Three tiny crackles, not the Spark bolt.',
      sprite: {
        palette: { y: '#f2d43d' },
        rows: [
          '........',
          '....y...',
          '...y....',
          'yyy.y.yy',
          'yy.y.yyy',
          '....y...',
          '...y....',
          '........',
        ],
      },
    },
  },
};
