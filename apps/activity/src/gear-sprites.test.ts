import { GEAR_RARITIES, PART_KINDS, baseElement, gearContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_ITEM_SPRITES,
  BUNDLED_PART_ICONS,
  BUNDLED_SET_SPRITES,
  GEAR_SLOT_IDS,
  ITEM_SIZE,
  PART_SIZE,
  itemArt,
  partIcon,
  setTintPalette,
  tintPalette,
} from './gear-sprites';
import { glyph } from './glyphs';
import { elementIcon } from './sprites/element-icons';
import { expandRows, swapPalette, validateSprite } from './sprites/sprite-data';

const shape = (rows: readonly string[]): string => rows.join('/');

describe('item sprites', () => {
  it('has a well-formed 12x12 sprite for each slot of the content', () => {
    const slots = new Set(gearContent.bases.map((b) => b.slot));
    expect([...slots].sort()).toEqual([...GEAR_SLOT_IDS].sort());
    for (const slot of GEAR_SLOT_IDS) {
      const def = BUNDLED_ITEM_SPRITES[slot];
      expect(() => {
        validateSprite(def, ITEM_SIZE);
      }, slot).not.toThrow();
      expect(expandRows(def).join('').replaceAll('.', '').length, slot).toBeGreaterThan(30);
    }
  });

  it('gives each slot its own shape', () => {
    const shapes = GEAR_SLOT_IDS.map((slot) => shape(expandRows(BUNDLED_ITEM_SPRITES[slot])));
    expect(new Set(shapes).size).toBe(GEAR_SLOT_IDS.length);
  });

  it('draws every plain base of the content, tinted by its element and grey when it has none', () => {
    for (const base of gearContent.bases.filter((b) => b.set === undefined)) {
      const art = itemArt(base.id);
      expect(art.sprite, base.id).toBe(BUNDLED_ITEM_SPRITES[base.slot]);
      const element = baseElement(base);
      if (element === null) {
        expect(art.palette, base.id).toBeUndefined();
      } else {
        expect(art.palette, base.id).toBe(tintPalette(element));
        expect(art.palette, base.id).toBeDefined();
      }
    }
  });

  it('draws a gear set piece with its own trimmed sprite, tinted by its set tag', () => {
    for (const slot of GEAR_SLOT_IDS) {
      const def = BUNDLED_SET_SPRITES[slot];
      expect(() => {
        validateSprite(def, ITEM_SIZE);
      }, slot).not.toThrow();
      // A set piece is never the plain sprite of its slot, so a set is known at a glance.
      expect(shape(expandRows(def)), slot).not.toBe(shape(expandRows(BUNDLED_ITEM_SPRITES[slot])));
      // It has gold trim that no tint changes.
      expect(def.palette['g'], slot).toBeDefined();
    }
    const shapes = GEAR_SLOT_IDS.map((slot) => shape(expandRows(BUNDLED_SET_SPRITES[slot])));
    expect(new Set(shapes).size).toBe(GEAR_SLOT_IDS.length);
    for (const set of gearContent.sets) {
      for (const base of gearContent.bases.filter((b) => b.set === set.id)) {
        const art = itemArt(base.id);
        expect(art.sprite, base.id).toBe(BUNDLED_SET_SPRITES[base.slot]);
        expect(art.palette, base.id).toBe(setTintPalette(set.tag));
        expect(art.palette, base.id).toBeDefined();
      }
    }
  });

  it('gives every gear set its own colour: no two sets share one, and none is plain grey', () => {
    const colours = gearContent.sets.map((set) => setTintPalette(set.tag)?.['t']);
    expect(colours.every((c) => c !== undefined)).toBe(true);
    expect(new Set(colours).size).toBe(gearContent.sets.length);
    for (const set of gearContent.sets) {
      const swapped = swapPalette(BUNDLED_SET_SPRITES.hat, setTintPalette(set.tag) ?? {});
      expect(() => {
        validateSprite(swapped, ITEM_SIZE);
      }, set.id).not.toThrow();
    }
    expect(setTintPalette('neutral')).toBeUndefined();
  });

  it('tints produce valid sprites that differ from each other and from neutral', () => {
    const colours = new Set<string>();
    for (const tint of ['tide', 'ember', 'grove', 'spark']) {
      const palette = tintPalette(tint);
      expect(palette, tint).toBeDefined();
      if (palette === undefined) continue;
      const swapped = swapPalette(BUNDLED_ITEM_SPRITES.hat, palette);
      expect(() => {
        validateSprite(swapped, ITEM_SIZE);
      }).not.toThrow();
      colours.add(palette['t'] ?? '');
    }
    colours.add(BUNDLED_ITEM_SPRITES.hat.palette['t'] ?? '');
    expect(colours.size).toBe(5);
  });

  it('knows a tint for every element of the content, and none for neutral or unknown', () => {
    for (const base of gearContent.bases) {
      const element = baseElement(base);
      if (element !== null) expect(elementIcon(element), element).toBeDefined();
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
    expect(GEAR_RARITIES).toEqual(['common', 'rare', 'epic']);
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
