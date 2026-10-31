import { gearContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { itemLookId } from '../gear-sprites';
import { wornLook } from '../worn-gear';
import {
  CHARM_CLASSES,
  HAT_CLASSES,
  LOOK_CLASS,
  SCARF_CLASSES,
  classSlot,
  type WornClass,
} from './data/worn-sprites';
import { SPECIES_SPRITE_DATA } from './data/species-sprites';
import { expandRows, swapPalette, validateSprite, type SpriteDef } from './sprite-data';
import { isFace, wearing, type WornLook } from './wearing';

const ALL_CLASSES: readonly WornClass[] = [...HAT_CLASSES, ...SCARF_CLASSES, ...CHARM_CLASSES];
const COLOURS = { t: '#aa0000', u: '#00aa00', h: '#0000aa' };

function look(cls: WornClass, set = false, colours = COLOURS): WornLook {
  return { cls, set, colours };
}

function species(id: string): SpriteDef {
  const sprite = SPECIES_SPRITE_DATA[id];
  if (sprite === undefined) throw new Error(`no sprite for ${id}`);
  return sprite;
}

/** One of each slot, to wear everything at once. */
const OUTFIT: readonly WornLook[] = [look('crown', true), look('mantle'), look('pendant', true)];

describe('every item look has a worn class', () => {
  const looks = new Set(gearContent.bases.map((b) => itemLookId(b.id)));

  it('maps every look of the content, and nothing else', () => {
    expect([...looks].filter((id) => LOOK_CLASS[id] === undefined)).toEqual([]);
    expect(Object.keys(LOOK_CLASS).filter((id) => !looks.has(id))).toEqual([]);
    expect(looks.size).toBe(60);
  });

  it('gives each look a class of its own slot', () => {
    for (const base of gearContent.bases) {
      const cls = LOOK_CLASS[itemLookId(base.id)];
      expect(cls === undefined ? undefined : classSlot(cls)).toBe(base.slot);
    }
  });

  it('uses every class at least once', () => {
    const used = new Set(Object.values(LOOK_CLASS));
    expect(ALL_CLASSES.filter((c) => !used.has(c))).toEqual([]);
  });

  it('resolves a look for every base, with its tint', () => {
    for (const base of gearContent.bases) expect(wornLook(base.id)).not.toBeNull();
  });
});

describe('wearing', () => {
  for (const [id, sprite] of Object.entries(SPECIES_SPRITE_DATA)) {
    describe(id, () => {
      const bare = expandRows(sprite);

      it('keeps the face and the grid for every class, alone and together', () => {
        const outfits: (readonly WornLook[])[] = [
          ...ALL_CLASSES.flatMap((cls) => [[look(cls)], [look(cls, true)]]),
          OUTFIT,
        ];
        for (const outfit of outfits) {
          const worn = wearing(sprite, outfit);
          validateSprite(worn, { width: 16, height: 16 });
          const rows = expandRows(worn);
          expect(rows).toHaveLength(16);
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
              if (isFace(x, y)) expect(rows[y]?.[x]).toBe(bare[y]?.[x]);
            }
          }
        }
      });

      it('changes the sprite for each class and leaves its own palette keys alone', () => {
        for (const cls of ALL_CLASSES) {
          const worn = wearing(sprite, [look(cls)]);
          expect(expandRows(worn)).not.toEqual(bare);
          for (const [key, colour] of Object.entries(sprite.palette)) {
            expect(worn.palette[key]).toBe(colour);
          }
        }
      });

      it('is deterministic', () => {
        expect(wearing(sprite, OUTFIT)).toEqual(wearing(sprite, OUTFIT));
      });
    });
  }

  it('never clashes with a species palette key', () => {
    for (const sprite of Object.values(SPECIES_SPRITE_DATA)) {
      expect(Object.keys(sprite.palette).filter((k) => /^[1-9KGWC]$/.test(k))).toEqual([]);
    }
  });

  it('tints each slot with its own colours', () => {
    const sprite = species('splashet');
    const worn = wearing(sprite, [
      look('cap', false, { t: '#111111', u: '#222222', h: '#333333' }),
      look('scarf', false, { t: '#444444', u: '#555555', h: '#666666' }),
      look('token', false, { t: '#777777', u: '#888888', h: '#999999' }),
    ]);
    expect(worn.palette['1']).toBe('#111111');
    expect(worn.palette['2']).toBe('#222222');
    expect(worn.palette['4']).toBe('#444444');
    expect(worn.palette['6']).toBe('#666666');
    expect(worn.palette['7']).toBe('#777777');
    expect(worn.palette['9']).toBe('#999999');
    const body = expandRows(worn).join('');
    expect(body).toContain('1');
    expect(body).toContain('4');
    expect(body).toMatch(/[789]/);
    // Only the slots that are worn add keys.
    const hatOnly = wearing(sprite, [look('cap')]);
    expect(hatOnly.palette['4']).toBeUndefined();
    expect(hatOnly.palette['7']).toBeUndefined();
  });

  it('draws the gold trim of a set piece and the shade of a plain one', () => {
    const sprite = species('splashet');
    const plain = expandRows(wearing(sprite, [look('crown')])).join('');
    const set = expandRows(wearing(sprite, [look('crown', true)])).join('');
    expect(plain).not.toContain('G');
    expect(set).toContain('G');
  });

  it('keeps the shiny body palette and the worn colours apart', () => {
    const worn = wearing(species('splashet'), OUTFIT);
    const shiny = swapPalette(worn, { b: '#ffd700' });
    expect(shiny.palette['b']).toBe('#ffd700');
    expect(shiny.palette['1']).toBe(COLOURS.t);
    expect(Object.keys(shiny.palette).sort()).toEqual(Object.keys(worn.palette).sort());
  });

  it('puts a hat on the head top, inside the grid and centred, on ears and tall heads too', () => {
    for (const id of ['zipmouse', 'thornbuck', 'mossback', 'sunfawn', 'pyrelynx']) {
      const sprite = species(id);
      const rows = expandRows(wearing(sprite, [look('pointed')]));
      const bare = expandRows(sprite);
      const painted = rows.flatMap((row, y) =>
        [...row].flatMap((ch, x) => (ch !== bare[y]?.[x] ? [{ x, y }] : [])),
      );
      expect(painted.length).toBeGreaterThan(0);
      expect(Math.min(...painted.map((c) => c.y))).toBeGreaterThanOrEqual(0);
      expect(Math.max(...painted.map((c) => c.y))).toBeLessThanOrEqual(7);
      expect(Math.min(...painted.map((c) => c.x)) + Math.max(...painted.map((c) => c.x))).toBe(15);
    }
  });

  it('keeps the scarf and the charm on the body, under the mouth', () => {
    for (const sprite of Object.values(SPECIES_SPRITE_DATA)) {
      const bare = expandRows(sprite);
      const rows = expandRows(wearing(sprite, [look('mantle'), look('bell')]));
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (rows[y]?.[x] === bare[y]?.[x]) continue;
          expect(y).toBeGreaterThanOrEqual(11);
          expect(bare[y]?.[x]).not.toBe('.');
        }
      }
    }
  });

  it('wears nothing when nothing is worn, and one piece per slot', () => {
    const sprite = species('splashet');
    expect(wearing(sprite, [])).toBe(sprite);
    expect(wearing(sprite, [look('cap'), look('hood')])).toEqual(wearing(sprite, [look('hood')]));
  });

  it('takes the last piece given of a slot, and any order across slots', () => {
    const sprite = species('splashet');
    expect(wearing(sprite, [look('hood'), look('cap')])).toEqual(wearing(sprite, [look('cap')]));
    expect(wearing(sprite, [look('hood'), look('cap')])).not.toEqual(
      wearing(sprite, [look('hood')]),
    );
    const [hat, scarf, charm] = OUTFIT;
    if (hat === undefined || scarf === undefined || charm === undefined) throw new Error('outfit');
    expect(wearing(sprite, [charm, hat, scarf])).toEqual(wearing(sprite, [hat, scarf, charm]));
  });
});
