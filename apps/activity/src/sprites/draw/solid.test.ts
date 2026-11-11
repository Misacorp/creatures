import { describe, expect, it } from 'vitest';
import { canvas, rowsOf } from './canvas';
import { SHADE_KINDS, SHELF_ITEMS, lamp, shelfItem, shelfItemWidth } from './parts';
import { inArch, inEllipse, inPoint, inRect, minus, recess, shrink, solid, union } from './solid';

const WOOD = { light: 'a', mid: 'b', dark: 'c' };
const M = {
  wood: WOOD,
  cloth: WOOD,
  linen: WOOD,
  metal: WOOD,
  glass: WOOD,
  accent: WOOD,
};

describe('solid shapes', () => {
  it('draws a shape with its outer pixels in ink and the inside shaded from the top left', () => {
    const c = canvas(5, 5);
    solid(c, { x: 0, y: 0, w: 5, h: 5 }, inRect(0, 0, 5, 5), WOOD);
    expect(rowsOf(c)).toEqual(['kkkkk', 'kaack', 'kabck', 'kccck', 'kkkkk']);
  });

  it('makes arches and points that are symmetric and fill their straight sides', () => {
    for (const shape of [inArch(0, 0, 10, 15, 5), inPoint(0, 0, 10, 15, 5)]) {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 10; x++) expect(shape(x, y), `${x},${y}`).toBe(shape(9 - x, y));
      }
      for (let y = 6; y < 16; y++) expect(shape(0, y)).toBe(true);
      expect(shape(0, 0)).toBe(false);
    }
    expect(inPoint(0, 0, 10, 15, 5)(4, 0)).toBe(true);
  });

  it('combines and shrinks shapes, and sinks a recess inside one', () => {
    const ring = minus(inEllipse(0, 0, 9, 9), inEllipse(3, 3, 3, 3));
    expect(ring(4, 4)).toBe(false);
    expect(ring(1, 4)).toBe(true);
    expect(union(inRect(0, 0, 1, 1), inRect(5, 5, 1, 1))(5, 5)).toBe(true);
    const inner = shrink(inRect(0, 0, 5, 5), 1);
    expect(inner(0, 0)).toBe(false);
    expect(inner(1, 1)).toBe(true);
    const c = canvas(6, 6);
    recess(c, { x: 0, y: 0, w: 6, h: 6 }, inRect(0, 0, 6, 6), WOOD, 1);
    expect(rowsOf(c)[1]).toBe('.cccc.');
    expect(rowsOf(c)[4]).toBe('.caaa.');
  });

  it('hangs every lamp kind from the top row inside its box, and stands every shelf thing on its base', () => {
    for (const kind of SHADE_KINDS) {
      const c = canvas(20, 16);
      const bottom = lamp(c, 10, 16, kind, WOOD, WOOD, WOOD, 3);
      expect(bottom, kind).toBeLessThan(16);
      expect(rowsOf(c)[0]?.includes('k'), kind).toBe(true);
    }
    for (const item of SHELF_ITEMS) {
      const c = canvas(16, 12);
      expect(shelfItem(c, 1, 11, item, M), item).toBe(shelfItemWidth(item));
      expect(rowsOf(c)[10]?.replaceAll('.', '').length, item).toBeGreaterThan(0);
      expect(rowsOf(c)[11], item).toBe('.'.repeat(16));
    }
  });
});
