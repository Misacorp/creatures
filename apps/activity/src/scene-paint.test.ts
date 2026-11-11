import { afterEach, describe, expect, it, vi } from 'vitest';
import { bitmapOf, hexRgb, stamp } from './scene-paint';
import type { SpriteDef } from './sprites/sprite-data';

/** A canvas that records what is put on it and drawn from it. */
function fakeCanvas() {
  const puts: { data: Uint8ClampedArray; width: number; height: number }[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image: { data: Uint8ClampedArray }) => {
        puts.push({ data: image.data, width: canvas.width, height: canvas.height });
      },
    }),
  };
  return { canvas, puts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hexRgb', () => {
  it('reads short and long hex colours', () => {
    expect(hexRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexRgb('#0d0a1a')).toEqual([13, 10, 26]);
    expect(hexRgb('#c30')).toEqual([204, 51, 0]);
  });
});

describe('bitmapOf', () => {
  it('has no canvas without a document, and says so once', () => {
    vi.stubGlobal('document', undefined);
    const sprite: SpriteDef = { rows: ['a'], palette: { a: '#fff' } };
    expect(bitmapOf(sprite)).toBeNull();
  });

  it('renders a sprite of any size once, opaque where it is drawn, and keeps it', () => {
    const made = fakeCanvas();
    const create = vi.fn(() => made.canvas);
    vi.stubGlobal('document', { createElement: create });
    // 200 px wide: past the 128 of authored art, which painting does not limit
    const sprite: SpriteDef = {
      rows: ['a' + '.'.repeat(198) + 'b', 'a' + '.'.repeat(199)],
      palette: { a: '#ff0000', b: '#00f' },
    };
    const bitmap = bitmapOf(sprite);
    expect(bitmap).toBe(made.canvas);
    expect(made.canvas.width).toBe(200);
    expect(made.canvas.height).toBe(2);
    const data = made.puts[0]?.data;
    expect([...(data?.slice(0, 4) ?? [])]).toEqual([255, 0, 0, 255]);
    expect([...(data?.slice(4, 8) ?? [])]).toEqual([0, 0, 0, 0]);
    expect([...(data?.slice(199 * 4, 199 * 4 + 4) ?? [])]).toEqual([0, 0, 255, 255]);
    expect(bitmapOf(sprite)).toBe(made.canvas);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('stamp', () => {
  it('draws each sprite at its place and whole scale, in order, with hard edges', () => {
    const made = fakeCanvas();
    vi.stubGlobal('document', { createElement: () => made.canvas });
    const a: SpriteDef = { rows: ['aa', 'aa'], palette: { a: '#fff' } };
    const calls: unknown[][] = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => {
        calls.push(args);
      },
    };
    stamp(ctx as unknown as CanvasRenderingContext2D, [{ sprite: a, x: 3, y: 4 }], 3, 10, 1);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(calls).toEqual([[made.canvas, 0, 0, 2, 2, 19, 13, 6, 6]]);
  });

  it('crops to the top left corner and treats a scale below one as one', () => {
    const made = fakeCanvas();
    vi.stubGlobal('document', { createElement: () => made.canvas });
    const a: SpriteDef = { rows: ['aaaa', 'aaaa'], palette: { a: '#fff' } };
    const calls: unknown[][] = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => calls.push(args),
    };
    stamp(ctx as unknown as CanvasRenderingContext2D, [{ sprite: a, x: 0, y: 0, w: 3, h: 1 }], 0.4);
    expect(calls).toEqual([[made.canvas, 0, 0, 3, 1, 0, 0, 3, 1]]);
  });
});
