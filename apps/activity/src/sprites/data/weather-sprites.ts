/**
 * Pixel art of the valley's sky: the wall calendar of the living room (one page of it, 12x13) in four
 * pictures, and three small 8x8 icons for the compact line on the raid and dungeon cards. Same data
 * format as the other sprites (rows of characters plus a palette, `.` transparent). The calendar is a
 * paper page with a red top (two rings) and a weather picture, drawn on its own canvas over the room (it
 * pops out of the wall on hover, see `living-room.css`), so it does not belong to the room's three
 * lights. The meaning never depends on colour alone: a sun, a cloud and a storm have their own shapes.
 */
import type { SpriteDef } from '../sprite-data';

export const CALENDAR_SIZE = { width: 12, height: 13 } as const;

const PALETTE: Readonly<Record<string, string>> = {
  k: '#1d1530',
  R: '#d9553f',
  r: '#f0836a',
  p: '#f3ead2',
  P: '#dccfae',
  n: '#6c5a86',
  y: '#f6c445',
  Y: '#ffe58a',
  c: '#dfe6f2',
  C: '#9aa8c4',
  b: '#ffd23f',
};

/** The picture on the page: 8 wide and 6 tall. */
const ICONS = {
  blank: ['........', '........', '........', '........', '........', '........'],
  sun: ['..yYYy..', '.yYYYYy.', 'yYYYYYYy', 'yYYYYYYy', '.yYYYYy.', '..yyyy..'],
  cloud: ['.....yy.', '..cc.yy.', '.cCCcc..', 'cCCCCCc.', 'cCCCCCCc', '.cccccc.'],
  storm: ['..cccc..', '.cCCCCc.', 'cCCCCCCc', '.cccccc.', '...bb...', '..bb....'],
} as const;

export type SkyPicture = keyof typeof ICONS;

/** One page of the wall calendar with this picture on it. */
export function calendarSprite(picture: SkyPicture): SpriteDef {
  const icon = ICONS[picture];
  return {
    palette: PALETTE,
    rows: [
      '.kkkkkkkkkk.',
      'kRRRRRRRRRRk',
      'kRrRRRRRRrRk',
      'kkkkkkkkkkkk',
      'kppppppppppk',
      ...icon.map((row) => `kp${row}pk`),
      'kppnnnnnnppk',
      '.kkkkkkkkkk.',
    ],
  };
}

/** The pictures, in a fixed order (for the workbench and the tests). */
export const SKY_PICTURES = Object.keys(ICONS) as SkyPicture[];

/** A small 8x8 icon of the sky for a line of text. */
export const SKY_GLYPHS: Readonly<Record<Exclude<SkyPicture, 'blank'>, SpriteDef>> = {
  sun: {
    palette: PALETTE,
    rows: [
      '...yy...',
      '.y.yy.y.',
      '..yYYy..',
      'yyYYYYyy',
      'yyYYYYyy',
      '..yYYy..',
      '.y.yy.y.',
      '...yy...',
    ],
  },
  cloud: {
    palette: PALETTE,
    rows: [
      '........',
      '...cc...',
      '..cCCc..',
      '.cCCCCcc',
      'cCCCCCCc',
      'cCCCCCCc',
      '.cccccc.',
      '........',
    ],
  },
  storm: {
    palette: PALETTE,
    rows: [
      '..cccc..',
      '.cCCCCc.',
      'cCCCCCCc',
      '.cccccc.',
      '..bb....',
      '...bb...',
      '..bb....',
      '...b....',
    ],
  },
};
