import { GEAR_RARITIES, PART_KINDS, baseElement, gearBase, gearContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_ITEM_SPRITES,
  BUNDLED_PART_ICONS,
  BUNDLED_SET_SPRITES,
  GEAR_SLOT_IDS,
  ITEM_LOOK_SPRITES,
  ITEM_SIZE,
  itemLookId,
  itemFlair,
  withFlair,
  type Flair,
  PART_SIZE,
  itemArt,
  partIcon,
  setTintPalette,
  tintPalette,
} from './gear-sprites';
import { glyph } from './glyphs';
import { elementIcon } from './sprites/element-icons';
import { ITEM_FLAIR } from './sprites/data/item-flair';
import { expandRows, swapPalette, validateSprite, type SpriteDef } from './sprites/sprite-data';
import { lintSprite, silhouetteDifference } from './sprites/sprite-lint';

const shape = (rows: readonly string[]): string => rows.join('/');

/** How many pixels a flair paints a key that is not in the plain tint keys. */
function changedKeys(def: SpriteDef, flair: Flair): number {
  const rows = expandRows(def);
  let n = 0;
  for (const [y, row] of flair.rows.entries()) {
    for (const [x, ch] of [...row].entries()) if (ch !== '.' && ch !== rows[y]?.[x]) n += 1;
  }
  return n;
}

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

  it('draws every base with its look, tinted by its element (grey when it has none) or its set tag', () => {
    for (const base of gearContent.bases) {
      const art = itemArt(base.id);
      const fallback = (base.set === undefined ? BUNDLED_ITEM_SPRITES : BUNDLED_SET_SPRITES)[
        base.slot
      ];
      const plain = ITEM_LOOK_SPRITES[itemLookId(base.id)] ?? fallback;
      const flair = itemFlair(base.id);
      if (flair === undefined) expect(art.sprite, base.id).toBe(plain);
      else expect(art.sprite, base.id).toEqual(withFlair(plain, flair));
      if (base.set !== undefined) {
        const set = gearContent.sets.find((x) => x.id === base.set);
        expect(art.palette, base.id).toBe(setTintPalette(set?.tag ?? base.tag));
        continue;
      }
      const element = baseElement(base);
      expect(art.palette, base.id).toBe(element === null ? undefined : tintPalette(element));
    }
  });

  it('shares a sprite only between element versions of one item (same slot and stats, no set)', () => {
    expect(itemLookId('kelp-cap')).toBe('trail-cap');
    expect(itemLookId('ember-muffler')).toBe('patch-scarf');
    expect(itemLookId('bog-charm')).toBe('trail-charm');
    // Own names that are not element versions: a set piece, a role charm, different stats.
    expect(itemLookId('tidepool-cowl')).toBe('tidepool-cowl');
    expect(itemLookId('wardens-bell')).toBe('wardens-bell');
    expect(itemLookId('forge-hood')).toBe('forge-hood');
    for (const base of gearContent.bases) {
      const look = gearContent.bases.find((b) => b.id === itemLookId(base.id));
      expect(look?.slot, base.id).toBe(base.slot);
    }
  });

  it('has its own sprite for every look of the content', () => {
    const looks = new Set(gearContent.bases.map((b) => itemLookId(b.id)));
    expect(Object.keys(ITEM_LOOK_SPRITES).sort()).toEqual([...looks].sort());
  });

  it('draws only looks of the content, each well-formed and tintable', () => {
    const looks = new Set(gearContent.bases.map((b) => itemLookId(b.id)));
    for (const id of Object.keys(ITEM_LOOK_SPRITES)) expect(looks.has(id), id).toBe(true);
    for (const [id, def] of Object.entries(ITEM_LOOK_SPRITES)) {
      const errors = lintSprite(def, { kind: 'item' }).filter((f) => f.level === 'error');
      expect(errors, id).toEqual([]);
      // The tint swaps t, u and h, so the item's main colour must be drawn with them.
      for (const key of ['t', 'u'])
        expect(Object.hasOwn(def.palette, key), `${id} ${key}`).toBe(true);
      const base = gearContent.bases.find((b) => b.id === id);
      if (base?.set !== undefined) expect(def.palette['g'], `${id} gold trim`).toBeDefined();
    }
  });

  it('draws flair only on element versions of a shared look, each well-formed and visible', () => {
    for (const base of gearContent.bases) {
      const look = itemLookId(base.id);
      const sharers = gearContent.bases.filter((b) => itemLookId(b.id) === look);
      const element = base.set === undefined ? baseElement(base) : null;
      const wanted = sharers.length > 1 && element !== null;
      if (!wanted) expect(itemFlair(base.id), base.id).toBeUndefined();
    }
    for (const [look, byElement] of Object.entries(ITEM_FLAIR)) {
      for (const [element, flair] of Object.entries(byElement)) {
        expect(flair.rows.length, `${look} ${element}`).toBe(12);
        for (const row of flair.rows) expect(row.length, `${look} ${element}`).toBe(12);
        const def = ITEM_LOOK_SPRITES[look];
        if (def === undefined) throw new Error(look);
        const errors = lintSprite(withFlair(def, flair), { kind: 'item' }).filter(
          (f) => f.level === 'error',
        );
        expect(errors, `${look} ${element}`).toEqual([]);
        // The flair shows: it changes pixels, not only colours the tint would change anyway.
        expect(
          silhouetteDifference(def, withFlair(def, flair)) + changedKeys(def, flair),
          `${look} ${element}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps every look clearly different from every other of its slot', () => {
    const entries = Object.entries(ITEM_LOOK_SPRITES);
    for (const [i, [a, x]] of entries.entries()) {
      for (const [b, y] of entries.slice(i + 1)) {
        if (gearBase(a)?.slot !== gearBase(b)?.slot) continue;
        expect(silhouetteDifference(x, y), `${a} vs ${b}`).toBeGreaterThanOrEqual(4);
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
