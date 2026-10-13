import { expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { FALLBACK_BANNER, bannerArt, bannerScale, silhouettePalette } from '../art';
import {
  BANNER_SIZE,
  BUNDLED_BANNER_SPRITES,
  bannerSprite,
  creatureSprite,
} from './creature-sprites';
import { expandRows, parseSprite, validateSprite } from './sprite-data';

const destinations = expeditionContent.destinations;

describe('the destination banners', () => {
  it('has a banner for every destination of the content, and no other', () => {
    expect(Object.keys(BUNDLED_BANNER_SPRITES).sort()).toEqual(
      destinations.map((d) => d.id).sort(),
    );
    for (const d of destinations) expect(bannerSprite(d.id), d.id).toBeDefined();
    expect(bannerSprite('no-such-place')).toBeUndefined();
  });

  it('is a well-formed wide, short 64x24 strip', () => {
    expect(BANNER_SIZE).toEqual({ width: 64, height: 24 });
    for (const d of destinations) {
      const def = bannerSprite(d.id);
      if (def === undefined) throw new Error(d.id);
      expect(() => {
        validateSprite(def, BANNER_SIZE);
      }, d.id).not.toThrow();
      expect(BANNER_SIZE.width / BANNER_SIZE.height).toBeGreaterThan(2);
    }
  });

  it('is drawn from the palette of its brief: every brief colour is in the banner and used', () => {
    for (const d of destinations) {
      const def = bannerSprite(d.id);
      if (def === undefined) throw new Error(d.id);
      const used = new Set(expandRows(def).join(''));
      for (const colour of d.banner.palette) {
        const key = Object.entries(def.palette).find(
          ([, hex]) => hex.toLowerCase() === colour.hex.toLowerCase(),
        )?.[0];
        expect(key, `${d.id} ${colour.name}`).toBeDefined();
        expect(used.has(key ?? '?'), `${d.id} ${colour.name} is drawn`).toBe(true);
      }
    }
  });

  it('has real depth: plenty of colours, none unused, and no two banners alike', () => {
    const seen = new Set<string>();
    for (const d of destinations) {
      const def = bannerSprite(d.id);
      if (def === undefined) throw new Error(d.id);
      const used = new Set(expandRows(def).join(''));
      used.delete('.');
      expect(used.size, d.id).toBeGreaterThanOrEqual(8);
      for (const key of Object.keys(def.palette))
        expect(used.has(key), `${d.id} ${key}`).toBe(true);
      const picture = parseSprite(def)
        .cells.map((c) => `${String(c.x)},${String(c.y)},${c.colour}`)
        .join('/');
      expect(seen.has(picture), d.id).toBe(false);
      seen.add(picture);
    }
  });

  it('is plain at the bottom: the lower strip has no lone bright pixels, so the walker stands out', () => {
    // The walker covers the bottom ~10 rows. This is a rough check that the scenery there is not a mess of
    // single bright specks: at most a fifth of the pixels of the last 6 rows are the brightest colour.
    for (const d of destinations) {
      const def = bannerSprite(d.id);
      if (def === undefined) throw new Error(d.id);
      const rows = expandRows(def).slice(-6);
      const luminance = (hex: string): number => {
        const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return 0.3 * r + 0.59 * g + 0.11 * b;
      };
      const all = rows.join('');
      let bright = 0;
      for (const ch of all) {
        const hex = def.palette[ch];
        if (hex !== undefined && luminance(hex) > 200) bright++;
      }
      expect(bright / all.length, d.id).toBeLessThan(0.2);
    }
  });
});

describe('the banner lookups', () => {
  it('gives a destination its own banner, and a flat strip while one has not been drawn', () => {
    expect(bannerArt('tidepools')).toBe(bannerSprite('tidepools'));
    expect(bannerArt('new-place')).toBe(FALLBACK_BANNER);
    expect(() => {
      validateSprite(FALLBACK_BANNER, BANNER_SIZE);
    }).not.toThrow();
  });

  it('draws a banner at a whole number scale that fits: 3 to 6, by the space it has', () => {
    expect(bannerScale(0)).toBe(3);
    expect(bannerScale(190)).toBe(3);
    expect(bannerScale(326)).toBe(5);
    expect(bannerScale(358)).toBe(5);
    expect(bannerScale(384)).toBe(6);
    expect(bannerScale(2000)).toBe(6);
    for (const width of [100, 250, 326, 390, 700]) {
      const scale = bannerScale(width);
      expect(Number.isInteger(scale)).toBe(true);
      // Never wider than the space, except at the smallest size.
      if (width >= BANNER_SIZE.width * 3)
        expect(BANNER_SIZE.width * scale).toBeLessThanOrEqual(width);
    }
  });
});

describe('silhouettes of creatures not found yet', () => {
  it('turns every colour of a sprite into one, and keeps its shape', () => {
    const sprite = creatureSprite('cindle');
    if (sprite === undefined) throw new Error('no cindle');
    const palette = silhouettePalette(sprite);
    expect(new Set(Object.values(palette)).size).toBe(1);
    const keys = new Set(expandRows(sprite).join(''));
    keys.delete('.');
    expect(Object.keys(palette).sort()).toEqual([...keys].sort());
    // Drawing it with that palette swaps every cell to the silhouette colour and keeps every cell.
    const plain = parseSprite(sprite);
    const dark = parseSprite({
      ...sprite,
      palette: { ...sprite.palette, ...palette },
    });
    expect(dark.cells).toHaveLength(plain.cells.length);
    expect(new Set(dark.cells.map((c) => c.colour)).size).toBe(1);
  });
});
