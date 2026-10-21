/**
 * The title logo of each place on the world map: the place's name in a 5x7 pixel font (`world-map-font.ts`),
 * two-tone letters (a light top and a darker bottom), a one pixel dark outline and a drop shadow, with a
 * small ornament of its own (ember sparks, a bolt, a wave crest, a crescent moon, a sprout, a drip, bunting
 * ...). Each logo is built as an ordinary `SpriteDef` (rows of characters and a palette), so it is drawn
 * and validated like every other sprite. Multi-word names go on two lines. The names come from the content,
 * so the logo never disagrees with the place's real name.
 */
import { expeditionContent } from '@creatures/game';
import { GLYPH_HEIGHT, LETTER_ADVANCE, glyph, textWidth } from './world-map-font';
import type { SpriteDef } from './sprite-data';

const EMPTY = '.';

class Grid {
  readonly cells: string[][];
  readonly palette: Record<string, string> = {};
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => EMPTY));
  }
  colour(key: string, hex: string): string {
    this.palette[key] = hex;
    return key;
  }
  get(x: number, y: number): string {
    return this.cells[y]?.[x] ?? EMPTY;
  }
  put(x: number, y: number, key: string): void {
    const row = this.cells[y];
    if (row !== undefined && x >= 0 && x < this.width) row[x] = key;
  }
  /** Draws rows of characters: `.` is skipped, any other character is looked up in `colours`. */
  stamp(x: number, y: number, rows: readonly string[], colours: Readonly<Record<string, string>>) {
    for (const [dy, row] of rows.entries()) {
      for (const [dx, ch] of [...row].entries()) {
        const hex = colours[ch];
        if (ch !== EMPTY && hex !== undefined) this.put(x + dx, y + dy, this.colour(ch, hex));
      }
    }
  }
  /** One pixel ring of `key` around everything drawn, where the grid is still empty. */
  ring(key: string, only?: (x: number, y: number) => boolean): void {
    const add: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== EMPTY || (only !== undefined && !only(x, y))) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const c = this.get(x + dx, y + dy);
            if (c !== EMPTY && c !== key) near = true;
          }
        }
        if (near) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.put(x, y, key);
  }
}

/** Where the text sits in the grid (top-left of the letters of the first line) and how big it is. */
interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LogoStyle {
  /** Letter colours, one pair (light top, darker bottom) per letter, repeating. */
  fills: readonly (readonly [string, string])[];
  outline: string;
  /** The drop shadow (one pixel down and right); null for none. */
  shadow: string | null;
  /** Vertical offset per letter (a letter sagging), repeating. */
  sag?: readonly number[];
  /** Free pixels around the text for the ornament. */
  margin: { top: number; right: number; bottom: number; left: number };
  /** Draws the ornament; called after the letters. */
  decorate: (grid: Grid, box: TextBox) => void;
  /** Wooden plank behind the letters instead of an outline and a shadow. */
  plank?: { wood: string; grain: string; edge: string; nail: string };
}

const LINE_GAP = 2;

function lines(name: string): string[] {
  return name.toUpperCase().split(' ');
}

const BOLT = ['..ww.', '.wyy.', 'wyy..', 'yyyyy', '..yy.', '.yy..', 'yy...', 'y....'];
const CRESCENT = ['..yyy..', '.yyh...', 'yyh....', 'yyh....', 'yyh....', '.yyh...', '..yyy..'];
const SPROUT = ['ll..ll.', 'lll.lll', '.ll.ll.', '..lgl..', '...g...', '...g...'];

const STYLES: Readonly<Record<string, LogoStyle>> = {
  tidepools: {
    fills: [['#c4f5ee', '#2ab8b0']],
    outline: '#134a55',
    shadow: '#1f7d85',
    margin: { top: 0, right: 0, bottom: 4, left: 0 },
    decorate(g, box) {
      // A wave crest under the letters: a scalloped top, a body and a darker underside.
      const y = box.y + box.height + 2;
      const f = g.colour('f', '#e8f4f2');
      const w = g.colour('w', '#2a9d9a');
      const v = g.colour('v', '#1f7d85');
      for (let x = box.x - 1; x < box.x + box.width + 1; x++) {
        if ((x - box.x) % 6 < 2) g.put(x, y, f);
        g.put(x, y + 1, (x - box.x) % 6 === 2 ? f : w);
        if ((x - box.x) % 6 !== 5) g.put(x, y + 2, v);
      }
    },
  },
  'ember-caves': {
    fills: [['#ffe28a', '#ef7a2a']],
    outline: '#4a1410',
    shadow: '#a8481c',
    margin: { top: 4, right: 0, bottom: 0, left: 0 },
    decorate(g, box) {
      const y = g.colour('y', '#ffd25a');
      const o = g.colour('o', '#ff8a3a');
      const w = g.colour('w', '#fff0b0');
      for (const [dx, dy, key] of [
        [3, -2, y],
        [9, -4, o],
        [14, -3, w],
        [20, -2, y],
        [26, -4, o],
        [31, -2, w],
      ] as const) {
        if (dx < box.width) g.put(box.x + dx, box.y + dy, key);
      }
    },
  },
  'verdant-hollow': {
    fills: [['#b6f07a', '#3f9a3c']],
    outline: '#12301a',
    shadow: '#2f5a35',
    margin: { top: 7, right: 0, bottom: 0, left: 0 },
    decorate(g, box) {
      g.stamp(box.x + box.width - 6, box.y - 8, SPROUT, { l: '#7fd04a', g: '#2f7a30' });
    },
  },
  'storm-ridge': {
    fills: [['#e4efff', '#7fa6d8']],
    outline: '#1c2440',
    shadow: '#4b3f72',
    margin: { top: 0, right: 8, bottom: 0, left: 0 },
    decorate(g, box) {
      const x = box.x + box.width + 2;
      const y = box.y + Math.floor((box.height - BOLT.length) / 2);
      g.stamp(x, y, BOLT, { y: '#f6e05e', w: '#fffbd0' });
      g.ring(g.colour('k', '#2a2140'), (px, py) => px >= x - 1 && py >= y - 1);
    },
  },
  'sunken-fen': {
    fills: [['#cdb972', '#7a6a2c']],
    outline: '#2a2312',
    shadow: '#4a3a18',
    sag: [0, 1, 1, 2, 1, 0],
    margin: { top: 0, right: 0, bottom: 6, left: 0 },
    decorate(g, box) {
      const x = box.x + Math.round(box.width * 0.62);
      const y = box.y + box.height + 3;
      const mud = g.colour('p', '#6b5530');
      const wet = g.colour('n', '#4d9c8f');
      g.put(x, y, mud);
      g.put(x, y + 1, mud);
      g.put(x - 1, y + 3, mud);
      g.put(x, y + 3, wet);
      g.put(x + 1, y + 3, mud);
      g.put(x, y + 4, mud);
    },
  },
  'old-crossroads': {
    fills: [['#4a2c14', '#2a1608']],
    outline: '#2a1a10',
    shadow: null,
    margin: { top: 3, right: 1, bottom: 3, left: 1 },
    plank: { wood: '#9a7448', grain: '#7c5a36', edge: '#2a1a10', nail: '#e0d6a8' },
    decorate() {
      // The plank is drawn before the letters.
    },
  },
  'moonlit-reef': {
    fills: [['#f4f0ff', '#b5a3e0']],
    outline: '#16103a',
    shadow: '#4a3a7a',
    margin: { top: 0, right: 0, bottom: 0, left: 10 },
    decorate(g, box) {
      const y = box.y + Math.floor((box.height - CRESCENT.length) / 2);
      g.stamp(box.x - 9, y, CRESCENT, { y: '#fff6c8', h: '#d9c98a' });
      g.ring(g.colour('k', '#16103a'), (px, py) => px < box.x - 1 && py >= y - 1);
      g.put(box.x - 2, y - 1, g.colour('y', '#fff6c8'));
    },
  },
  'festival-grounds': {
    fills: [
      ['#ffa0a0', '#e03a3a'],
      ['#ffe9a0', '#f2b320'],
      ['#a8f5ea', '#20b8a8'],
      ['#ffbcee', '#e84cc0'],
    ],
    outline: '#241638',
    shadow: '#4a3a7a',
    margin: { top: 6, right: 0, bottom: 0, left: 0 },
    decorate(g, box) {
      // Bunting: a rope across the top with a flag every four pixels.
      const rope = g.colour('r', '#6b4a30');
      const flags = ['#ff5a5a', '#ffd25a', '#5ae0d0', '#ff8ad8'];
      const y = box.y - 5;
      for (let x = box.x - 1; x < box.x + box.width + 1; x++) g.put(x, y, rope);
      for (let x = box.x; x + 2 < box.x + box.width + 1; x += 4) {
        const key = g.colour(
          String(((x - box.x) / 4) % 4),
          flags[((x - box.x) / 4) % 4] ?? '#ff5a5a',
        );
        g.put(x, y + 1, key);
        g.put(x + 1, y + 1, key);
        g.put(x + 2, y + 1, key);
        g.put(x + 1, y + 2, key);
      }
    },
  },
};

/** The letters of one logo as a map from "x,y" to the pixel's fill colours and whether it is a top row. */
function letterPixels(
  names: readonly string[],
  box: TextBox,
  style: LogoStyle,
): Map<string, { fill: number; top: boolean }> {
  const out = new Map<string, { fill: number; top: boolean }>();
  let index = 0;
  for (const [row, line] of names.entries()) {
    const lineX = box.x + Math.floor((box.width - textWidth(line)) / 2);
    const lineY = box.y + row * (GLYPH_HEIGHT + LINE_GAP);
    for (const [i, letter] of [...line].entries()) {
      const sag = style.sag?.[index % style.sag.length] ?? 0;
      index++;
      for (const [gy, gr] of glyph(letter).entries()) {
        for (const [gx, ch] of [...gr].entries()) {
          if (ch !== '#') continue;
          out.set(`${String(lineX + i * LETTER_ADVANCE + gx)},${String(lineY + gy + sag)}`, {
            fill: (index - 1) % style.fills.length,
            top: gy < 4,
          });
        }
      }
    }
  }
  return out;
}

/** The logo of a place by its destination id (undefined for an id the map has no style for). */
export function buildLogo(id: string, name: string): SpriteDef | undefined {
  const style = STYLES[id];
  if (style === undefined) return undefined;
  const parts = lines(name);
  const textW = Math.max(...parts.map((p) => textWidth(p)));
  const textH = parts.length * GLYPH_HEIGHT + (parts.length - 1) * LINE_GAP;
  const sagMax = Math.max(0, ...(style.sag ?? [0]));
  const m = style.margin;
  const width = textW + 3 + m.left + m.right;
  const height = textH + 3 + m.top + m.bottom + sagMax;
  const grid = new Grid(width, height);
  const box: TextBox = { x: 1 + m.left, y: 1 + m.top, width: textW, height: textH + sagMax };
  const pixels = letterPixels(parts, box, style);
  const key = (fill: number, top: boolean): string =>
    String.fromCharCode(97 + fill * 2 + (top ? 0 : 1));
  const plank = style.plank;
  if (plank !== undefined) {
    const wood = grid.colour('w', plank.wood);
    const grain = grid.colour('g', plank.grain);
    const edge = grid.colour('e', plank.edge);
    const nail = grid.colour('n', plank.nail);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        const corner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
        if (corner) continue;
        grid.put(x, y, border ? edge : (x * 7 + y * 3) % 11 === 0 && y % 2 === 0 ? grain : wood);
      }
    }
    for (const [x, y] of [
      [2, 2],
      [width - 3, 2],
      [2, height - 3],
      [width - 3, height - 3],
    ] as const)
      grid.put(x, y, nail);
  } else if (style.shadow !== null) {
    const shadow = grid.colour('s', style.shadow);
    for (const k of pixels.keys()) {
      const [x, y] = k.split(',').map(Number);
      if (x !== undefined && y !== undefined && !pixels.has(`${String(x + 1)},${String(y + 1)}`)) {
        grid.put(x + 1, y + 1, shadow);
      }
    }
  }
  for (const [k, p] of pixels) {
    const [x, y] = k.split(',').map(Number);
    const pair = style.fills[p.fill];
    if (x === undefined || y === undefined || pair === undefined) continue;
    const c = grid.colour(key(p.fill, p.top), p.top ? pair[0] : pair[1]);
    grid.put(x, y, c);
  }
  if (plank === undefined) grid.ring(grid.colour('x', style.outline));
  style.decorate(grid, box);
  return { palette: grid.palette, rows: grid.cells.map((r) => r.join('')) };
}

/** The destinations that have a logo, by id: the content's names, drawn once. */
const cache = new Map<string, SpriteDef>();

export function logoOf(id: string): SpriteDef | undefined {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const name = expeditionContent.destinations.find((d) => d.id === id)?.name;
  if (name === undefined) return undefined;
  const logo = buildLogo(id, name);
  if (logo !== undefined) cache.set(id, logo);
  return logo;
}

export const LOGO_IDS: readonly string[] = Object.keys(STYLES);
