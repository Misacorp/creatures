import { describe, expect, it } from 'vitest';
import type { SpriteDef } from '../sprite-data';
import {
  CLOSE,
  averageColour,
  closePairs,
  colourDistance,
  fillShare,
  readability,
  silhouetteOverlap,
  speckShare,
  tones,
} from './report';

const def = (rows: string[], palette: Record<string, string>): SpriteDef => ({ rows, palette });
const INK = '#0d0a1a';

/** A 6x4 block: ink edge round a two-tone inside. */
const block = (a: string, b: string): SpriteDef =>
  def(['kkkkkk', 'kaaaak', 'kbbbbk', 'kkkkkk'], { k: INK, a, b });

describe('the review report', () => {
  it('measures outline overlap from the bottom left', () => {
    const full = def(['aa', 'aa'], { a: '#ffffff' });
    const half = def(['..', 'aa'], { a: '#ffffff' });
    expect(silhouetteOverlap(full, full)).toBe(1);
    expect(silhouetteOverlap(full, half)).toBe(0.5);
    expect(silhouetteOverlap(def(['a.'], { a: '#fff' }), def(['.a'], { a: '#fff' }))).toBe(0);
  });

  it('measures colour distance by pixels, ignoring the ink', () => {
    expect(colourDistance(block('#ff0000', '#00ff00'), block('#ff0000', '#00ff00'))).toBe(0);
    const near = colourDistance(block('#ff0000', '#00ff00'), block('#f00000', '#00f000'));
    const far = colourDistance(block('#ff0000', '#00ff00'), block('#0000ff', '#ffffff'));
    expect(near).toBeLessThan(0.05);
    expect(far).toBeGreaterThan(0.3);
    expect([...tones(block('#ff0000', '#00ff00')).keys()]).toEqual(['#ff0000', '#00ff00']);
  });

  it('flags a same-form pair with the same outline in nearly the same paint, not other forms or other paint', () => {
    const mine = [{ id: 'a-bed', form: 'bed', sprite: block('#ff0000', '#00ff00') }];
    const others = [
      { id: 'b-bed', form: 'bed', sprite: block('#fa0000', '#00fa00') },
      { id: 'c-bed', form: 'bed', sprite: block('#0000ff', '#ffffff') },
      { id: 'b-rug', form: 'rug', sprite: block('#ff0000', '#00ff00') },
    ];
    const pairs = closePairs(mine, others);
    expect(pairs.map((p) => p.b)).toEqual(['b-bed']);
    expect(pairs[0]?.overlap).toBeGreaterThanOrEqual(CLOSE.overlap);
  });

  it('finds lone specks, the fill and the average colour', () => {
    expect(speckShare(def(['aab', 'aaa'], { a: '#111111', b: '#222222' }))).toBeCloseTo(1 / 6);
    expect(speckShare(block('#ff0000', '#00ff00'))).toBe(0);
    expect(fillShare(def(['a.', '..'], { a: '#111111' }))).toBe(0.25);
    expect(averageColour(def(['ab'], { a: '#000000', b: '#ffffff' }))).toBe('#808080');
  });

  it('says why a piece is hard to read at 1x, and nothing for one that reads', () => {
    const good = readability(
      def(['kkkkkk', 'kaaaak', 'kbbbbk', 'kcccck', 'kkkkkk'], {
        k: INK,
        a: '#f0e0c0',
        b: '#c8a878',
        c: '#a08060',
      }),
      '#3a3050',
    );
    expect(good.flags).toEqual([]);
    const flat = readability(def(['kkk', 'kak', 'kkk'], { k: INK, a: '#3a3050' }), '#3a3050');
    expect(flat.flags.join('; ')).toMatch(/only 1 tones/);
    expect(flat.flags.join('; ')).toMatch(/inside contrast/);
    const thin = readability(
      def(['k........', '.........', '.........', '........k'], { k: INK }),
      '#ffffff',
    );
    expect(thin.flags.join('; ')).toMatch(/fills 6%/);
  });
});
