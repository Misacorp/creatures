/**
 * Void, concept art (not in the game; no names or stats yet). Void is the dark between the stars,
 * drawn so it never melts into the night-sky UI: a dusk-purple body (Misa's pick, 2026-10-30) with a
 * light lilac rim and belly, and somewhere on it a
 * **window**, a patch of starry night with one warm star, as if the creature had a piece of the sky
 * inside. Keys: `k` ink, `e` eye highlight, `q` blush, `b` base, `h` highlight, `s` shade, `p` belly,
 * `w` the window, `t` a star, `g` the glint (one cool accent). The look is in
 * `docs/compendium/world.md`, "Void".
 */
import type { ConceptSet } from './index';

const VOID = {
  k: '#0d0a1a',
  e: '#fbf8ec',
  q: '#ff8fab',
  b: '#6f62b8',
  h: '#9d92dc',
  s: '#463c86',
  p: '#a99fe0',
  w: '#100c22',
  t: '#fff1b8',
} as const;

/** The first colour direction, for comparison: a pale moon-lilac body. */
const PALE = { b: '#c4bde3', h: '#ece8fb', s: '#8a82b4', p: '#ddd7f2' } as const;

export const VOID_CONCEPTS: ConceptSet = {
  id: 'void',
  title: 'Void, four roles',
  element: 'void',
  sprites: {
    'void-guard': {
      kind: 'creature',
      role: 'guard',
      note: 'An eclipse hood: a wide dark crescent of night sky over a sturdy body, like a shield.',
      sprite: {
        mirror: true,
        palette: { ...VOID, g: '#9fe8ff' },
        rows: [
          '..kkkkkk',
          '.khhhhhh',
          'khwwwwgw',
          'khwtwwww',
          'khwwkkkk',
          'kbkkhhhh',
          'kbkhbbbb',
          'kbkbbbbb',
          'kbkbekbb',
          '.kkbkkbb',
          '.kbqbbbk',
          'kkbbpppp',
          'kbbbpppp',
          'kssbbppp',
          '.kssssss',
          '..kkkkkk',
        ],
      },
      alts: { 'pale (first)': PALE },
    },
    'void-setter': {
      kind: 'creature',
      role: 'setter',
      note: 'A floating wisp with a feeler that ends in a star: it points at the boss and marks it.',
      sprite: {
        palette: { ...VOID, g: '#9fe8ff' },
        rows: [
          '............t...',
          '...........tgt..',
          '............t...',
          '.....kkkkkk.g...',
          '...kkhhhhhhkg...',
          '..khhhwwwhbbkk..',
          '.khbhwwtwwhbbbk.',
          '.khbbhwwwhbbbbk.',
          '.kbbekbbbbkebbk.',
          '.kbbkkbbbbkkbbk.',
          '.kbqbbbkkbbbqbk.',
          '.ksbbppppbbbbsk.',
          '..ksbbppbbbbsk..',
          '...kssbbbbbsk...',
          '....kksssssk....',
          '.......kkkk.....',
        ],
      },
      alts: { 'pale (first)': PALE },
    },
    'void-support': {
      kind: 'creature',
      role: 'support',
      note: 'A small planet with a ring for a halo and two moons in orbit: it lifts its neighbours.',
      sprite: {
        mirror: true,
        palette: { ...VOID, g: '#9fe8ff' },
        rows: [
          '........',
          '...ggggg',
          'ttg.....',
          'tt.g.kkk',
          '...kkhhh',
          '..khhbhw',
          '.khbbhwt',
          '.kbbbbhw',
          '.kbbekbb',
          '.kbbkkbb',
          '.kbqbbbk',
          '.kbbbbpp',
          '..ksbppp',
          '..kssbpp',
          '...kksss',
          '.....kkk',
        ],
      },
      alts: { 'pale (first)': PALE },
    },
    'void-payoff': {
      kind: 'creature',
      role: 'payoff',
      note: 'A lynx of the night: tall ears that are windows full of stars, a star-tipped crest.',
      sprite: {
        mirror: true,
        palette: { ...VOID },
        rows: [
          '.k......',
          '.kk.....',
          '.khk....',
          '.khhk..t',
          '.khwhkkk',
          '.khwthhh',
          '.khwwbbb',
          '.khbbbbb',
          '.kbbekbb',
          '.kbbkkbb',
          '.kbqbbbk',
          '.kbbbppp',
          '..kbbppp',
          '..ksbbpp',
          '...ksssb',
          '....kkkk',
        ],
      },
      alts: { 'pale (first)': PALE },
    },
  },
};
