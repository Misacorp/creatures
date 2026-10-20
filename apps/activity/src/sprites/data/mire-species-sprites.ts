/**
 * Pixel sprites (16x16) for the four Mire species, in the chibi style of `species-sprites.ts`: a
 * front-facing round body, ink outline, one highlight, one shade, and the shared face (eyes on rows
 * 8-9 at x 4-5 and 10-11, blush on row 10). Mire is patience: peat brown, ochre and tar black with an
 * oily sheen. Palette keys: `k` ink, `e` eye highlight, `q` blush, `b` base, `h` highlight, `s` shade,
 * `p` belly patch; the other letters are feature colours of that species. Rows marked `mirror` store
 * the left half only.
 *
 * They are spread into `SPECIES_SPRITE_DATA` (`species-sprites.ts`), the shiny palettes are in `art.ts`,
 * and the species are in `creatures.json`; the content tests require a sprite for every species.
 */
import type { SpriteDef } from '../sprite-data';

export const MIRE_SPECIES_SPRITE_DATA: Readonly<Record<string, SpriteDef>> = {
  // Guard, stage 1: a squat lump of peat with three mud bumps on top and ochre flecks.
  mudlump: {
    mirror: true,
    palette: {
      k: '#0d0a1a',
      e: '#fbf8ec',
      q: '#ff8fab',
      b: '#8a6238',
      h: '#b8864a',
      s: '#4f3822',
      p: '#d9bd7e',
      o: '#d9a02e',
      n: '#4d9c8f',
    },
    rows: [
      '........',
      '......kk',
      '....kkhh',
      '..kkkhhn',
      '.khhbbbb',
      '.kbbbbbb',
      '.kbhobbb',
      '.kbbbbob',
      '.kbbekbb',
      '.kbbkkbb',
      '.kbqbbbk',
      '.kbbpppp',
      '.kbbpppp',
      '.kssbppp',
      '..kssspp',
      '...kkkkk',
    ],
  },
  // Guard, stage 2: a broad bog-warden with a tar helm, cattails growing from its shoulders and heavy
  // tar plates on its arms.
  bogwarden: {
    mirror: true,
    palette: {
      k: '#0d0a1a',
      e: '#fbf8ec',
      q: '#ff8fab',
      b: '#8a6238',
      h: '#b8864a',
      s: '#4f3822',
      p: '#d9bd7e',
      t: '#2a2230',
      n: '#4d9c8f',
      r: '#6b3f22',
      g: '#7d8a3c',
    },
    rows: [
      '..r.....',
      '..r.kkkk',
      '..g.kttt',
      '..gkttnt',
      '..kkttbb',
      '.kbbbbbb',
      '.kbhbbbb',
      '.kbbbbbb',
      '.kbbekbb',
      '.kbbkkbb',
      '.kbqbbbk',
      'kkbbpppp',
      'kttbpppp',
      'kttsbppp',
      '.kssbbpp',
      '..kkkkkk',
    ],
  },
  // Support, stage 1: a small ochre frog with brow bumps, tar spots and a wide mouth.
  squelch: {
    mirror: true,
    palette: {
      k: '#0d0a1a',
      e: '#fbf8ec',
      q: '#ff8fab',
      b: '#c8962e',
      h: '#e8c068',
      s: '#8a5e1e',
      p: '#f0dba0',
      t: '#2a2230',
    },
    rows: [
      '........',
      '........',
      '...kkkk.',
      '..khhbbk',
      '.kbhbbbk',
      '.kbbbbbb',
      '.kbbbbtb',
      '.kbbbbbb',
      '.kbbekbb',
      '.kbbkkbb',
      '.kbqkkkk',
      '.kbbpppp',
      '.kbbpppp',
      '..kssppp',
      '...ksspp',
      '....kkkk',
    ],
  },
  // Support, stage 2: a big frog with tall brow domes, a lily pad on its head, a puffed throat and
  // webbed feet.
  croakmire: {
    mirror: true,
    palette: {
      k: '#0d0a1a',
      e: '#fbf8ec',
      q: '#ff8fab',
      b: '#c8962e',
      h: '#e8c068',
      s: '#8a5e1e',
      p: '#f0dba0',
      t: '#2a2230',
      g: '#7d8a3c',
      o: '#d9a02e',
    },
    rows: [
      '...kkkk.',
      '..khhbbk',
      '.khhbbbk',
      '.kbbbbgg',
      '.kbbbbbb',
      '.kbbbbbb',
      '.kbhbtbb',
      '.kbbbbbb',
      '.kbbekbb',
      '.kbbkkbb',
      '.kbqkkkk',
      'kkbbpppp',
      'kkbppppp',
      'kssbpppp',
      'kookksps',
      '.kkkkkkk',
    ],
  },
};
