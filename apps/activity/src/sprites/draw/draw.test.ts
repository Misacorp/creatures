import { describe, expect, it } from 'vitest';
import {
  blit,
  canvas,
  flipX,
  fromRows,
  get,
  isEmpty,
  mirrorLeft,
  put,
  recolour,
  rowsOf,
  toSprite,
  under,
} from './canvas';
import {
  crest,
  crestHeight,
  foot,
  glow,
  lamp,
  leg,
  motif,
  motifSize,
  shelfItem,
  shelfItemWidth,
  stencil,
  trim,
  trimHeight,
  type Materials,
} from './parts';
import {
  INK,
  box,
  dither,
  ditherAt,
  ellipsePixels,
  fill,
  flat,
  line,
  outline,
  rect,
  shadeRuns,
  tile,
} from './shapes';

const WOOD = { hi: 'w', light: 'a', mid: 'b', dark: 'c' };
const ACCENT = { light: 'r', mid: 'q', dark: 'p' };
const M: Materials = {
  wood: WOOD,
  cloth: { light: 'e', mid: 'f', dark: 'g' },
  linen: { hi: 'h', light: 'i', mid: 'i', dark: 'j' },
  metal: { light: 'm', mid: 'n', dark: 'o' },
  glass: { hi: 't', light: 't', mid: 's', dark: 'u' },
  accent: ACCENT,
};

describe('canvas', () => {
  it('starts transparent, clips drawing to its edges and reads `.` outside', () => {
    const c = canvas(3, 2);
    expect(isEmpty(c)).toBe(true);
    put(c, 1, 1, 'a');
    put(c, -1, 0, 'a');
    put(c, 3, 0, 'a');
    put(c, 0, 2, 'a');
    expect(rowsOf(c)).toEqual(['...', '.a.']);
    expect(get(c, 9, 9)).toBe('.');
    expect(() => put(c, 0, 0, 'ab')).toThrow(RangeError);
    expect(() => canvas(0, 4)).toThrow(RangeError);
  });

  it('draws under what is there, blits without its transparent pixels, flips and mirrors', () => {
    const c = fromRows(['a..', '...']);
    under(c, 0, 0, 'b');
    under(c, 1, 0, 'b');
    expect(rowsOf(c)).toEqual(['ab.', '...']);
    blit(c, ['.k', 'kk'], 1, 0);
    expect(rowsOf(c)).toEqual(['abk', '.kk']);
    expect(rowsOf(flipX(c))).toEqual(['kba', 'kk.']);
    const m = fromRows(['ab...']);
    mirrorLeft(m);
    expect(rowsOf(m)).toEqual(['ab.ba']);
    recolour(m, 'a', 'z');
    expect(rowsOf(m)).toEqual(['zb.bz']);
  });

  it('makes a sprite with only the palette keys it uses, and refuses a key the palette lacks', () => {
    const c = fromRows(['ka', 'a.']);
    expect(toSprite(c, { k: '#0d0a1a', a: '#ffffff', b: '#000000' })).toEqual({
      rows: ['ka', 'a.'],
      palette: { k: '#0d0a1a', a: '#ffffff' },
    });
    expect(() => toSprite(c, { k: '#0d0a1a' })).toThrow(/"a"/);
  });
});

describe('shapes', () => {
  it('fills, outlines a box and draws a line end to end', () => {
    const c = canvas(5, 4);
    rect(c, 0, 0, 5, 4, 'k');
    fill(c, 1, 1, 3, 2, 'a');
    expect(rowsOf(c)).toEqual(['kkkkk', 'kaaak', 'kaaak', 'kkkkk']);
    const d = canvas(4, 4);
    line(d, 0, 0, 3, 3, 'x');
    expect(rowsOf(d)).toEqual(['x...', '.x..', '..x.', '...x']);
  });

  it('shades a box from the top left: light top and left, dark right and bottom, ink border', () => {
    const c = canvas(5, 5);
    box(c, 0, 0, 5, 5, WOOD);
    expect(rowsOf(c)).toEqual(['kkkkk', 'kaack', 'kabck', 'kccck', 'kkkkk']);
    const r = canvas(5, 4);
    box(r, 0, 0, 5, 4, WOOD, { shade: 'rows', round: 1 });
    expect(rowsOf(r)).toEqual(['.kkk.', 'kaaak', 'kccck', '.kkk.']);
    const flatBox = canvas(3, 3);
    box(flatBox, 0, 0, 3, 3, 'z', { ink: false });
    expect(rowsOf(flatBox)).toEqual(['zzz', 'zzz', 'zzz']);
  });

  it('draws ellipses that are symmetric, and a ring of only the edge', () => {
    const fillCells = ellipsePixels(0, 0, 9, 5);
    const ring = ellipsePixels(0, 0, 9, 5, 'ring');
    const key = (p: { x: number; y: number }): string => `${String(p.x)},${String(p.y)}`;
    const set = new Set(fillCells.map(key));
    for (const p of fillCells) expect(set.has(`${String(8 - p.x)},${String(4 - p.y)}`)).toBe(true);
    expect(ring.length).toBeLessThan(fillCells.length);
    expect(set.has('4,2')).toBe(true);
    expect(ring.map(key)).not.toContain('4,2');
  });

  it('dithers in canvas coordinates and repeats tiles from an offset', () => {
    expect(ditherAt('checker', 0, 0)).toBe(true);
    expect(ditherAt('checker', 1, 0)).toBe(false);
    const c = canvas(4, 2);
    dither(c, 0, 0, 4, 2, 'a', 'b');
    expect(rowsOf(c)).toEqual(['baba', 'abab']);
    const t = canvas(5, 1);
    tile(t, 0, 0, 5, 1, ['xy.'], 1);
    expect(rowsOf(t)).toEqual(['y.xy.']);
  });

  it('adds the ink outline round what is drawn, not round ink', () => {
    const c = fromRows(['.....', '..a..', '.....']);
    outline(c);
    expect(rowsOf(c)).toEqual(['..k..', '.kak.', '..k..']);
    outline(c);
    expect(rowsOf(c)).toEqual(['..k..', '.kak.', '..k..']);
    const d = fromRows(['...', '.a.', '...']);
    outline(d, INK, true);
    expect(rowsOf(d)).toEqual(['kkk', 'kak', 'kkk']);
  });

  it('shades runs of one key by a ramp', () => {
    const c = fromRows(['xxxx']);
    shadeRuns(c, 'x', flat('m'));
    expect(rowsOf(c)).toEqual(['mmmm']);
    const d = fromRows(['xxxx']);
    shadeRuns(d, 'x', WOOD);
    expect(rowsOf(d)).toEqual(['abbc']);
  });
});

describe('furniture parts', () => {
  it('draws each leg kind inside its rows with an ink cap', () => {
    for (const kind of ['straight', 'turned', 'tapered', 'splayed'] as const) {
      const c = canvas(14, 6);
      leg(c, 4, 0, 6, kind, WOOD, { side: 'left' });
      const rows = rowsOf(c);
      expect(rows[5], kind).toMatch(/^\.*k+\.*$/);
      for (const row of rows.slice(0, 5)) expect(row, kind).toMatch(/^\.*k[^k.]+k\.*$/);
    }
  });

  it('splays a left leg left and a right leg right; tapers towards the middle', () => {
    const l = canvas(12, 6);
    leg(l, 6, 0, 6, 'splayed', WOOD, { side: 'left' });
    const r = canvas(12, 6);
    leg(r, 1, 0, 6, 'splayed', WOOD, { side: 'right' });
    expect(rowsOf(l)[4]?.indexOf('k')).toBeLessThan(rowsOf(l)[0]?.indexOf('k') ?? 0);
    expect(rowsOf(r)[4]?.indexOf('k')).toBeGreaterThan(rowsOf(r)[0]?.indexOf('k') ?? 0);
    const t = canvas(8, 8);
    leg(t, 0, 0, 8, 'tapered', WOOD, { w: 6, side: 'left' });
    expect(rowsOf(t)[0]?.lastIndexOf('k')).toBeGreaterThan(rowsOf(t)[6]?.lastIndexOf('k') ?? 9);
    expect(rowsOf(t)[6]?.indexOf('k')).toBe(0);
  });

  it('gives feet their rows', () => {
    const c = canvas(8, 3);
    expect(foot(c, 0, 0, 8, 'block', WOOD)).toBe(3);
    expect(rowsOf(c)).toEqual(['kaaaaaak', 'kcccccck', '.kkkkkk.']);
    expect(foot(canvas(8, 3), 0, 0, 8, 'none', WOOD)).toBe(0);
  });

  it('draws trims and crests in the rows they say they take', () => {
    for (const kind of [
      'plain',
      'bead',
      'rivets',
      'zigzag',
      'dentil',
      'scallop',
      'reed',
      'rope',
      'leaf',
    ] as const) {
      const c = canvas(12, 4);
      expect(trim(c, 0, 0, 12, kind, WOOD, ACCENT)).toBe(trimHeight(kind));
      const used = rowsOf(c).filter((row) => row !== '............').length;
      expect(used, kind).toBe(trimHeight(kind));
    }
    for (const kind of [
      'square',
      'rounded',
      'scallop',
      'arched',
      'stepped',
      'peaked',
      'curl',
      'spikes',
    ] as const) {
      const c = canvas(24, 10);
      const h = crest(c, 0, 8, 24, kind, WOOD, ACCENT);
      expect(h, kind).toBe(crestHeight(kind, 24));
      const rows = rowsOf(c);
      for (let y = 0; y < 8 - h; y++)
        expect(rows[y], `${kind} row ${String(y)}`).toBe('.'.repeat(24));
    }
  });

  it('stands every shelf thing on the row above the shelf, as wide as it says', () => {
    for (const kind of [
      'books',
      'jar',
      'plant',
      'shell',
      'candle',
      'bottle',
      'bowl',
      'crystal',
    ] as const) {
      const c = canvas(16, 12);
      expect(shelfItem(c, 1, 11, kind, M)).toBe(shelfItemWidth(kind));
      const rows = rowsOf(c);
      expect(rows[10], kind).not.toBe('.'.repeat(16));
      expect(rows[11], kind).toBe('.'.repeat(16));
      for (const row of rows) expect(row.slice(1 + shelfItemWidth(kind)), kind).toMatch(/^\.*$/);
    }
  });

  it('maps stencil digits to the two ramps and ink', () => {
    const c = canvas(8, 1);
    stencil(c, 0, 0, ['k0123456'], WOOD, ACCENT);
    expect(rowsOf(c)).toEqual(['kwabcrqp']);
  });

  it('draws the shipped two-ring halo at 20 wide, and a dithered one over the whole box', () => {
    expect(rowsOf(glow(20, 16, 'ring', 'y', 'z'))).toEqual([
      '......zzzzzzzz......',
      '...zzz........zzz...',
      '.zz..............zz.',
      'zz...yyyyyyyyyy...zz',
      'z..yy..........yy..z',
      'z..yy..........yy..z',
      'zz...yyyyyyyyyy...zz',
      '.zz..............zz.',
      '...zzz........zzz...',
      '......zzzzzzzz......',
    ]);
    const d = glow(20, 16, 'dither', 'h', 'g');
    expect(d.h).toBe(16);
    const keys = new Set(d.px);
    expect([...keys].sort()).toEqual(['.', 'g', 'h']);
  });

  it('hangs every lamp from the top row inside a 20x16 box', () => {
    for (const kind of ['dome', 'cone', 'lantern', 'bell', 'cage'] as const) {
      const c = canvas(20, 16);
      const bottom = lamp(c, 10, 16, kind, WOOD, M.metal, M.glass, 3);
      expect(bottom, kind).toBeLessThan(16);
      expect(rowsOf(c)[0], kind).not.toBe('.'.repeat(20));
    }
  });

  it('knows each motif size and draws it in the accent', () => {
    expect(motifSize('none')).toEqual({ w: 0, h: 0 });
    const s = motifSize('shell');
    const c = canvas(s.w, s.h);
    motif(c, 0, 0, 'shell', ACCENT);
    expect(new Set(c.px.filter((k) => k !== '.'))).toEqual(new Set(['k', 'r', 'q', 'p']));
  });
});
