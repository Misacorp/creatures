/**
 * Void, concept art (not in the game; no names or stats yet). Void is the dark between the stars,
 * drawn so it never melts into the night-sky UI: a pale moon-lilac body, and somewhere on it a
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
  b: '#c4bde3',
  h: '#ece8fb',
  s: '#8a82b4',
  w: '#1c1638',
  t: '#ffe9a3',
} as const;

/** The other colour direction: a dusk-violet body (darker, closer to Spark's violet). */
const DUSK_BODY = { b: '#6f62b8', h: '#9d92dc', s: '#463c86' } as const;

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
        palette: { ...VOID, p: '#ddd7f2' },
        rows: [
          '..kkkkkk',
          '.khhhhhh',
          'khwwwwww',
          'khwtwwww',
          'kbwwkkkk',
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
      alts: { 'dusk body': DUSK_BODY },
    },
    'void-setter': {
      kind: 'creature',
      role: 'setter',
      note: 'A floating wisp with a feeler that ends in a star: it points at the boss and marks it.',
      sprite: {
        palette: { ...VOID, p: '#ddd7f2', g: '#9fe8ff' },
        rows: [
          '............t...',
          '...........tgt..',
          '............t...',
          '.....kkkkkk.g...',
          '...kkhhhhhbkg...',
          '..khhhwwwhbbkk..',
          '.khbbwwtwwbbbbk.',
          '.khbbbwwwbbbbbk.',
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
      alts: { 'dusk body': DUSK_BODY },
    },
    'void-support': {
      kind: 'creature',
      role: 'support',
      note: 'A small planet with a ring for a halo and two moons in orbit: it lifts its neighbours.',
      sprite: {
        mirror: true,
        palette: { ...VOID, p: '#ddd7f2', g: '#9fe8ff' },
        rows: [
          '........',
          '...ggggg',
          'ttg.....',
          'tt.g.kkk',
          '...kkhhh',
          '..khhbbw',
          '.khbbbwt',
          '.kbbbbbw',
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
      alts: { 'dusk body': DUSK_BODY },
    },
    'void-payoff': {
      kind: 'creature',
      role: 'payoff',
      note: 'A lynx of the night: tall ears that are windows full of stars, a star-tipped crest.',
      sprite: {
        mirror: true,
        palette: { ...VOID, p: '#ddd7f2' },
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
      alts: { 'dusk body': DUSK_BODY },
    },
  },
};
