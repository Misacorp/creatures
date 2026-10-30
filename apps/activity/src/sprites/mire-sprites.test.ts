import { describe, expect, it } from 'vitest';
import { markPalette, shinyPalette } from '../art';
import { BUNDLED_GLYPHS, GLYPH_SIZE } from '../glyphs';
import {
  BANNER_SIZE,
  BOSS_SIZE,
  BUNDLED_BANNER_SPRITES,
  BUNDLED_BOSS_SPRITES,
  BUNDLED_CREATURE_SPRITES,
  BUNDLED_DUNGEON_BOSS_SPRITES,
  BUNDLED_DUNGEON_FOE_SPRITES,
  CREATURE_SIZE,
} from './creature-sprites';
import { MIRE_BANNER_SPRITE_DATA } from './data/mire-banner-sprites';
import {
  MIRE_BOSS_SPRITE_DATA,
  MIRE_DUNGEON_BOSS_SPRITE_DATA,
  MIRE_FOE_SPRITE_DATA,
} from './data/mire-boss-sprites';
import { MIRE_SPECIES_SPRITE_DATA } from './data/mire-species-sprites';
import { BUNDLED_ELEMENT_ICONS, ICON_SIZE, elementIcon } from './element-icons';
import { expandRows, parseSprite, swapPalette, type SpriteDef } from './sprite-data';
import { hsl, silhouetteDifference } from './sprite-lint';

// The Mire art was drawn ahead of its content. Everything is registered now (the bundled maps spread
// the Mire maps in), and these tests keep the art honest: size, ink, palette, edge, silhouette.

const INK = '#0d0a1a';

function silhouette(def: SpriteDef): string {
  return expandRows(def)
    .map((row) => row.replace(/[^.]/g, '#'))
    .join('/');
}

function bounds(def: SpriteDef): { width: number; height: number } {
  const { cells } = parseSprite(def);
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

/** Mire's colour family: peat brown and ochre, between a warm orange and a yellow. */
const MIRE_HUES = [20, 50] as const;

function hasMireColour(def: SpriteDef): boolean {
  return Object.values(def.palette).some((colour) => {
    const { hue, sat } = hsl(colour);
    return sat >= 0.5 && hue >= MIRE_HUES[0] && hue <= MIRE_HUES[1];
  });
}

function unusedKeys(def: SpriteDef): string[] {
  const used = new Set(expandRows(def).join(''));
  return Object.keys(def.palette).filter((key) => !used.has(key));
}

describe('the Mire species sprites', () => {
  const ids = ['mudlump', 'bogwarden', 'squelch', 'croakmire'];
  const entries = ids.map((id) => ({ id, def: MIRE_SPECIES_SPRITE_DATA[id] }));

  it('has the four species of the two lines, and no other', () => {
    expect(Object.keys(MIRE_SPECIES_SPRITE_DATA).sort()).toEqual([...ids].sort());
  });

  it('has the right size, no unused palette keys, the shared ink and a small palette', () => {
    for (const { id, def } of entries) {
      if (def === undefined) throw new Error(id);
      expect(() => parseSprite(def, CREATURE_SIZE), id).not.toThrow();
      expect(unusedKeys(def), id).toEqual([]);
      expect(def.palette.k, id).toBe(INK);
      expect(Object.keys(def.palette).length, id).toBeLessThanOrEqual(11);
    }
  });

  it('never cuts a body colour off at the canvas edge', () => {
    const bodyKeys = ['b', 'h', 's', 'p'];
    for (const { id, def } of entries) {
      if (def === undefined) throw new Error(id);
      const rows = expandRows(def);
      for (const [y, row] of rows.entries()) {
        for (const [x, ch] of [...row].entries()) {
          if (x === 0 || y === 0 || x === row.length - 1 || y === rows.length - 1)
            expect(bodyKeys, `${id} ${String(x)},${String(y)}`).not.toContain(ch);
        }
      }
    }
  });

  it('draws the same chibi face as every creature, in the same place', () => {
    for (const { id, def } of entries) {
      if (def === undefined) throw new Error(id);
      const rows = expandRows(def);
      const at = (y: number, x: number): string => rows[y]?.[x] ?? '?';
      expect([at(8, 4), at(8, 5), at(9, 4), at(9, 5)].join(''), id).toBe('ekkk');
      expect([at(8, 10), at(8, 11), at(9, 10), at(9, 11)].join(''), id).toBe('kekk');
      expect([at(10, 3), at(10, 12)].join(''), id).toBe('qq');
      expect([at(10, 7), at(10, 8)].join(''), id).toBe('kk');
      expect(def.palette.e, id).toBe('#fbf8ec');
      expect(def.palette.q, id).toBe('#ff8fab');
    }
  });

  it('is coloured peat and ochre (a saturated colour in the Mire hues)', () => {
    for (const { id, def } of entries) {
      if (def === undefined) throw new Error(id);
      expect(hasMireColour(def), id).toBe(true);
    }
  });

  it('is clearly different from every other creature and from each other', () => {
    // The four Mire species are in the bundled map now: compare each with every other creature but itself.
    const others = Object.entries(BUNDLED_CREATURE_SPRITES).filter(
      ([id]) => !(id in MIRE_SPECIES_SPRITE_DATA),
    );
    for (const { id, def } of entries) {
      if (def === undefined) throw new Error(id);
      for (const [otherId, other] of others) {
        expect(silhouetteDifference(def, other), `${id} vs ${otherId}`).toBeGreaterThanOrEqual(12);
      }
      for (const mine of entries) {
        if (mine.id === id || mine.def === undefined) continue;
        expect(silhouetteDifference(def, mine.def), `${id} vs ${mine.id}`).toBeGreaterThanOrEqual(
          12,
        );
      }
    }
  });

  it('grows a stage 2 form at least as big as its stage 1 form', () => {
    for (const [from, to] of [
      ['mudlump', 'bogwarden'],
      ['squelch', 'croakmire'],
    ] as const) {
      const a = MIRE_SPECIES_SPRITE_DATA[from];
      const b = MIRE_SPECIES_SPRITE_DATA[to];
      if (a === undefined || b === undefined) throw new Error(from);
      const small = bounds(a);
      const big = bounds(b);
      expect(big.width * big.height, `${to} vs ${from}`).toBeGreaterThanOrEqual(
        small.width * small.height,
      );
    }
  });

  it('has a shiny palette swap that changes the look but not the outline or the shape', () => {
    for (const { id, def } of entries) {
      if (def === undefined) throw new Error(id);
      const shiny = shinyPalette(id);
      expect(shiny, id).toBeDefined();
      if (shiny === undefined) continue;
      for (const [key, colour] of Object.entries(shiny)) {
        expect(Object.hasOwn(def.palette, key), `${id} key ${key}`).toBe(true);
        expect(['k', 'e'], `${id} key ${key}`).not.toContain(key);
        expect(colour, id).toMatch(/^#[0-9a-f]{6}$/);
        expect(colour, `${id} ${key}`).not.toBe(def.palette[key]);
      }
      const swapped = swapPalette(def, shiny);
      expect(() => parseSprite(swapped, CREATURE_SIZE), id).not.toThrow();
      expect(swapped.palette.k).toBe(INK);
      expect(silhouette(swapped)).toBe(silhouette(def));
    }
  });
});

describe('the Mire bosses and foes', () => {
  const boss = MIRE_BOSS_SPRITE_DATA['old-bogback'];
  const bog = MIRE_FOE_SPRITE_DATA['bog-toad'];
  const leech = MIRE_FOE_SPRITE_DATA['tar-leech'];
  const lurker = MIRE_DUNGEON_BOSS_SPRITE_DATA['fen-lurker'];

  it('is registered in the bundled maps, which the portrait script and the stage read', () => {
    expect(BUNDLED_BOSS_SPRITES['old-bogback']).toBe(boss);
    expect(BUNDLED_DUNGEON_FOE_SPRITES['bog-toad']).toBe(bog);
    expect(BUNDLED_DUNGEON_FOE_SPRITES['tar-leech']).toBe(leech);
    expect(BUNDLED_DUNGEON_BOSS_SPRITES['fen-lurker']).toBe(lurker);
    expect(BUNDLED_BANNER_SPRITES['sunken-fen']).toBe(MIRE_BANNER_SPRITE_DATA['sunken-fen']);
  });

  it('has Old Bogback, two foes and a floor boss, and no other', () => {
    expect(Object.keys(MIRE_BOSS_SPRITE_DATA)).toEqual(['old-bogback']);
    expect(Object.keys(MIRE_FOE_SPRITE_DATA).sort()).toEqual(['bog-toad', 'tar-leech']);
    expect(Object.keys(MIRE_DUNGEON_BOSS_SPRITE_DATA)).toEqual(['fen-lurker']);
  });

  it('draws bosses at 24x24 and foes at 16x16, with the shared ink and no unused keys', () => {
    for (const [id, def, size] of [
      ['old-bogback', boss, BOSS_SIZE],
      ['fen-lurker', lurker, BOSS_SIZE],
      ['bog-toad', bog, CREATURE_SIZE],
      ['tar-leech', leech, CREATURE_SIZE],
    ] as const) {
      if (def === undefined) throw new Error(id);
      expect(() => parseSprite(def, size), id).not.toThrow();
      expect(unusedKeys(def), id).toEqual([]);
      expect(def.palette.k, id).toBe(INK);
      expect(Object.keys(def.palette).length, id).toBeLessThanOrEqual(11);
      expect(hasMireColour(def), id).toBe(true);
    }
  });

  it('keeps a boss to ink on the canvas edge, and a foe to no body colour there', () => {
    for (const [id, def, isBoss] of [
      ['old-bogback', boss, true],
      ['fen-lurker', lurker, true],
      ['bog-toad', bog, false],
      ['tar-leech', leech, false],
    ] as const) {
      if (def === undefined) throw new Error(id);
      const rows = expandRows(def);
      for (const [y, row] of rows.entries()) {
        for (const [x, ch] of [...row].entries()) {
          if (x !== 0 && y !== 0 && x !== row.length - 1 && y !== rows.length - 1) continue;
          const where = `${id} ${String(x)},${String(y)}`;
          if (isBoss) expect(['.', 'k'], where).toContain(ch);
          else expect(['b', 'h', 's'], where).not.toContain(ch);
        }
      }
    }
  });

  it('fills a sensible part of its canvas', () => {
    for (const [id, def, min] of [
      ['old-bogback', boss, 16],
      ['fen-lurker', lurker, 16],
      ['bog-toad', bog, 10],
      ['tar-leech', leech, 10],
    ] as const) {
      if (def === undefined) throw new Error(id);
      const { width, height } = bounds(def);
      expect(width, `${id} width`).toBeGreaterThanOrEqual(min);
      expect(height, `${id} height`).toBeGreaterThanOrEqual(min);
    }
  });

  it('is drawn bigger than any creature (Old Bogback) and any foe (the floor boss)', () => {
    if (boss === undefined || lurker === undefined || bog === undefined || leech === undefined)
      throw new Error('missing sprite');
    const count = (def: SpriteDef): number => parseSprite(def).cells.length;
    const biggestCreature = Math.max(
      ...Object.values(BUNDLED_CREATURE_SPRITES).map(count),
      ...Object.values(MIRE_SPECIES_SPRITE_DATA).map(count),
    );
    expect(count(boss)).toBeGreaterThan(biggestCreature);
    const biggestFoe = Math.max(
      ...Object.values(BUNDLED_DUNGEON_FOE_SPRITES).map(count),
      count(bog),
      count(leech),
    );
    expect(count(lurker)).toBeGreaterThan(biggestFoe);
  });

  it('has a different silhouette from every other sprite of the same size', () => {
    // (The Mire sprites are in the bundled maps.)
    const big = [
      ...Object.entries(BUNDLED_BOSS_SPRITES),
      ...Object.entries(BUNDLED_DUNGEON_BOSS_SPRITES),
    ];
    const small = [
      ...Object.entries(BUNDLED_CREATURE_SPRITES),
      ...Object.entries(BUNDLED_DUNGEON_FOE_SPRITES),
    ];
    for (const group of [big, small]) {
      const seen = new Map<string, string>();
      for (const [id, def] of group) {
        const shape = silhouette(def);
        expect(seen.get(shape), `${id} repeats ${seen.get(shape) ?? ''}`).toBeUndefined();
        seen.set(shape, id);
      }
    }
  });
});

describe('the Sunken Fen banner', () => {
  const banner = MIRE_BANNER_SPRITE_DATA['sunken-fen'];

  it('is a well-formed 64x24 strip with real depth and no unused colour', () => {
    if (banner === undefined) throw new Error('no banner');
    expect(() => parseSprite(banner, BANNER_SIZE)).not.toThrow();
    const used = new Set(expandRows(banner).join(''));
    used.delete('.');
    expect(used.size).toBeGreaterThanOrEqual(8);
    expect(unusedKeys(banner)).toEqual([]);
  });

  it('is drawn from its four brief colours, each used', () => {
    if (banner === undefined) throw new Error('no banner');
    const used = new Set(expandRows(banner).join(''));
    for (const hex of ['#5b4630', '#1f1a26', '#c49a3c', '#b9b49a']) {
      const key = Object.entries(banner.palette).find(([, c]) => c === hex)?.[0];
      expect(key, hex).toBeDefined();
      expect(used.has(key ?? '?'), hex).toBe(true);
    }
  });

  it('is plain at the bottom, so the walker stands out', () => {
    if (banner === undefined) throw new Error('no banner');
    const luminance = (hex: string): number => {
      const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.3 * r + 0.59 * g + 0.11 * b;
    };
    const all = expandRows(banner).slice(-6).join('');
    let bright = 0;
    for (const ch of all) {
      const hex = banner.palette[ch];
      if (hex !== undefined && luminance(hex) > 200) bright += 1;
    }
    expect(bright / all.length).toBeLessThan(0.2);
  });

  it('is not the picture of any existing banner', () => {
    if (banner === undefined) throw new Error('no banner');
    const picture = (def: SpriteDef): string =>
      parseSprite(def)
        .cells.map((c) => `${String(c.x)},${String(c.y)},${c.colour}`)
        .join('/');
    const mine = picture(banner);
    for (const [id, def] of Object.entries(BUNDLED_BANNER_SPRITES)) {
      if (id === 'sunken-fen') continue;
      expect(picture(def) === mine, id).toBe(false);
    }
  });
});

describe('the Mire icons', () => {
  it('has an 8x8 element icon, drawn differently from the other four', () => {
    const icon = elementIcon('mire');
    expect(icon).toBeDefined();
    if (icon === undefined) return;
    expect(() => parseSprite(icon, ICON_SIZE)).not.toThrow();
    const shapes = Object.entries(BUNDLED_ELEMENT_ICONS).filter(([id]) => id !== 'mire');
    for (const [id, other] of shapes)
      expect(silhouette(other) === silhouette(icon), id).toBe(false);
  });

  it('has a status glyph for Mired and a room glyph for Mud, both 8x8 and their own shape', () => {
    for (const id of ['mired', 'mud']) {
      const def = BUNDLED_GLYPHS[id];
      expect(def, id).toBeDefined();
      if (def === undefined) continue;
      expect(() => parseSprite(def, GLYPH_SIZE), id).not.toThrow();
      expect(unusedKeys(def), id).toEqual([]);
    }
  });

  it('turns the mark glyph into the Muddied colour with the Mire element colour', () => {
    expect(markPalette('mire')).toEqual({ m: '#b8864a' });
  });
});
