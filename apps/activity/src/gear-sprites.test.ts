import { GEAR_RARITIES, PART_KINDS, gearContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_ITEM_SPRITES,
  BUNDLED_PART_ICONS,
  GEAR_KIND_IDS,
  ITEM_SIZE,
  PART_SIZE,
  itemArt,
  partIcon,
  tintPalette,
} from './gear-sprites';
import { glyph } from './glyphs';
import { elementIcon } from './sprites/element-icons';
import { expandRows, swapPalette, validateSprite } from './sprites/sprite-data';

const shape = (rows: readonly string[]): string => rows.join('/');

describe('item sprites', () => {
  it('has a well-formed 12x12 sprite for each kind of item in the content', () => {
    const kinds = new Set(gearContent.bases.map((b) => b.kind));
    expect([...kinds].sort()).toEqual([...GEAR_KIND_IDS].sort());
    for (const kind of GEAR_KIND_IDS) {
      const def = BUNDLED_ITEM_SPRITES[kind];
      expect(() => {
        validateSprite(def, ITEM_SIZE);
      }, kind).not.toThrow();
      expect(expandRows(def).join('').replaceAll('.', '').length, kind).toBeGreaterThan(30);
    }
  });

  it('gives each kind its own shape', () => {
    const shapes = GEAR_KIND_IDS.map((kind) => shape(expandRows(BUNDLED_ITEM_SPRITES[kind])));
    expect(new Set(shapes).size).toBe(GEAR_KIND_IDS.length);
  });

  it('draws every base of the content, tinted by its element and grey when it has none', () => {
    for (const base of gearContent.bases) {
      const art = itemArt(base.id);
      expect(art.sprite, base.id).toBe(BUNDLED_ITEM_SPRITES[base.kind]);
      if (base.tint === null) {
        expect(art.palette, base.id).toBeUndefined();
      } else {
        expect(art.palette, base.id).toBe(tintPalette(base.tint));
        expect(art.palette, base.id).toBeDefined();
      }
    }
  });

  it('tints produce valid sprites that differ from each other and from neutral', () => {
    const colours = new Set<string>();
    for (const tint of ['tide', 'ember', 'grove', 'spark']) {
      const palette = tintPalette(tint);
      expect(palette, tint).toBeDefined();
      if (palette === undefined) continue;
      const swapped = swapPalette(BUNDLED_ITEM_SPRITES.band, palette);
      expect(() => {
        validateSprite(swapped, ITEM_SIZE);
      }).not.toThrow();
      colours.add(palette['t'] ?? '');
    }
    colours.add(BUNDLED_ITEM_SPRITES.band.palette['t'] ?? '');
    expect(colours.size).toBe(5);
  });

  it('knows a tint for every element of the content, and none for neutral or unknown', () => {
    for (const base of gearContent.bases) {
      if (base.tint !== null) expect(elementIcon(base.tint), base.tint).toBeDefined();
    }
    expect(tintPalette(null)).toBeUndefined();
    expect(tintPalette('void')).toBeUndefined();
  });

  it('shows a plain sprite for a base it does not know', () => {
    const art = itemArt('does-not-exist');
    expect(() => {
      validateSprite(art.sprite, ITEM_SIZE);
    }).not.toThrow();
    expect(art.palette).toBeUndefined();
  });

  it('has a rarity list the gear content agrees with', () => {
    expect(GEAR_RARITIES).toEqual(['common', 'rare', 'epic', 'festival']);
  });
});

describe('part icons', () => {
  it('has a well-formed 8x8 icon for every part kind', () => {
    for (const kind of PART_KINDS) {
      const def = BUNDLED_PART_ICONS[kind];
      expect(() => {
        validateSprite(def, PART_SIZE);
      }, kind).not.toThrow();
      expect(expandRows(def).join('').replaceAll('.', '').length, kind).toBeGreaterThan(14);
      expect(partIcon(kind)).toBe(def);
    }
    expect(Object.keys(BUNDLED_PART_ICONS).sort()).toEqual([...PART_KINDS].sort());
  });

  it('gives every part its own silhouette, so colour is never the only cue', () => {
    const silhouettes = PART_KINDS.map((kind) =>
      expandRows(BUNDLED_PART_ICONS[kind])
        .map((row) => row.replace(/[^.]/g, '#'))
        .join('/'),
    );
    expect(new Set(silhouettes).size).toBe(PART_KINDS.length);
  });

  it('falls back to the scrap icon for an unknown kind', () => {
    expect(partIcon('moon-dust')).toBe(BUNDLED_PART_ICONS.scrap);
  });
});

describe('the Workshop glyph', () => {
  it('is an 8x8 anvil with a shape of its own', () => {
    const anvil = glyph('anvil');
    expect(anvil).toBeDefined();
    if (anvil === undefined) return;
    expect(() => {
      validateSprite(anvil, PART_SIZE);
    }).not.toThrow();
  });
});
