import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { blinkSprite, EYE_PIXELS, twinkleSpots, twinkleSprite } from './creature-life';
import { creatureSprite } from './creature-sprites';
import { BLINK_MS, blinkRhythm, fnv1a, lifeAt, twinkleRhythm } from './life-clock';
import { expandRows, parseSprite, spriteSize, type SpriteDef } from './sprite-data';

const species = content.creatures.flatMap((c) => {
  const def = creatureSprite(c.id);
  return def === undefined ? [] : [{ id: c.id, def }];
});

/** The colour of each pixel, `x,y` to colour (transparent pixels are absent). */
function colours(def: SpriteDef): Map<string, string> {
  const map = new Map<string, string>();
  for (const cell of parseSprite(def).cells) {
    map.set(`${String(cell.x)},${String(cell.y)}`, cell.colour);
  }
  return map;
}

describe('blinkSprite', () => {
  it('has sprites to test', () => {
    expect(species.length).toBeGreaterThan(10);
  });

  it('changes only eye pixels, keeps the size and draws an ink line on row 9', () => {
    const eyes = new Set(EYE_PIXELS.map(([x, y]) => `${String(x)},${String(y)}`));
    for (const { id, def } of species) {
      const shut = blinkSprite(def);
      expect(spriteSize(shut), id).toEqual(spriteSize(def));
      const before = colours(def);
      const after = colours(shut);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const key = `${String(x)},${String(y)}`;
          if (!eyes.has(key)) expect(after.get(key), `${id} ${key}`).toBe(before.get(key));
        }
      }
      const ink = before.get('4,9');
      for (const x of [4, 5, 10, 11]) {
        expect(after.get(`${String(x)},9`), id).toBe(ink);
        // Row 8 is the body colour just outside the eye, not the highlight.
        expect(after.get(`${String(x)},8`), id).toBe(before.get(x < 8 ? '3,8' : '12,8'));
      }
      expect(after.get('4,8'), id).not.toBe(def.palette['e']);
    }
  });

  it('leaves a sprite without the shared face alone', () => {
    const small: SpriteDef = { palette: { k: '#000' }, rows: ['kk', 'kk'] };
    expect(blinkSprite(small)).toBe(small);
    expect(expandRows(blinkSprite((species[0] as { def: SpriteDef }).def))).toHaveLength(16);
  });
});

describe('twinkle', () => {
  it('finds empty spots just outside every species, with room for the plus', () => {
    for (const { id, def } of species) {
      const spots = twinkleSpots(def);
      expect(spots.length, id).toBeGreaterThan(0);
      const before = colours(def);
      for (const spot of spots) {
        expect(before.has(`${String(spot.x)},${String(spot.y)}`), id).toBe(false);
        const frame = twinkleSprite(def, spot, 2);
        expect(colours(frame).size, id).toBeGreaterThan(before.size);
        expect(colours(frame).size, id).toBeLessThanOrEqual(before.size + 5);
        expect(spriteSize(frame), id).toEqual(spriteSize(def));
      }
    }
  });

  it('draws a dot, a plus and a dot, and nothing at frame 0', () => {
    const { def } = species[0] as { def: SpriteDef };
    const spot = twinkleSpots(def)[0] as { x: number; y: number };
    const base = colours(def).size;
    expect(twinkleSprite(def, spot, 0)).toBe(def);
    const sizes = ([1, 2, 3] as const).map((f) => colours(twinkleSprite(def, spot, f)).size - base);
    expect(sizes).toEqual([1, 5, 1]);
  });
});

describe('life clock', () => {
  it('blinks for 150 ms every 3 to 7 seconds', () => {
    for (const seed of ['a', 'b', 'cindle', 'creature-42', 'x'.repeat(30)]) {
      const { period, phase } = blinkRhythm(seed);
      expect(period).toBeGreaterThanOrEqual(3000);
      expect(period).toBeLessThanOrEqual(7000);
      expect(phase).toBeLessThan(period);
      let samples = 0;
      for (let ms = 0; ms < 60_000; ms += 10) if (lifeAt(seed, false, ms).blink) samples++;
      // One 150 ms run (15 samples at 10 ms) per period.
      const runs = samples / (BLINK_MS / 10);
      expect(runs).toBeGreaterThanOrEqual(Math.floor(60_000 / period) - 1);
      expect(runs).toBeLessThanOrEqual(Math.ceil(60_000 / period));
    }
  });

  it('is deterministic, and two creatures are out of step', () => {
    expect(lifeAt('a', true, 12_345)).toEqual(lifeAt('a', true, 12_345));
    const seeds = Array.from({ length: 12 }, (_, i) => `creature-${String(i)}`);
    const rhythms = new Set(seeds.map((s) => JSON.stringify(blinkRhythm(s))));
    expect(rhythms.size).toBe(seeds.length);
    let together = 0;
    for (let ms = 0; ms < 120_000; ms += 50) {
      if (lifeAt('a', false, ms).blink && lifeAt('b', false, ms).blink) together++;
    }
    expect(together).toBeLessThan(10);
  });

  it('twinkles only for shiny, as dot, plus, dot, every 4 to 8 seconds', () => {
    expect(fnv1a('x')).toBe(fnv1a('x'));
    const { period } = twinkleRhythm('s');
    expect(period).toBeGreaterThanOrEqual(4000);
    expect(period).toBeLessThanOrEqual(8000);
    const frames: number[] = [];
    for (let ms = 0; ms < period * 2; ms += 50) {
      const f = lifeAt('s', true, ms).twinkle;
      if (frames[frames.length - 1] !== f) frames.push(f);
      expect(lifeAt('s', false, ms).twinkle).toBe(0);
    }
    expect(frames.join('')).toContain('0123');
  });
});
