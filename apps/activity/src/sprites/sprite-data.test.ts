import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import {
  BOSS_SIZE,
  BUNDLED_BOSS_SPRITES,
  BUNDLED_CREATURE_SPRITES,
  CREATURE_SIZE,
  FALLBACK_SILHOUETTE,
  bossSprite,
  creatureSprite,
  creatureSpriteOrFallback,
} from './creature-sprites';
import { BUNDLED_ELEMENT_ICONS, ICON_SIZE, elementIcon } from './element-icons';
import {
  SpriteError,
  expandRows,
  parseSprite,
  spriteSize,
  swapPalette,
  validateSprite,
  type SpriteDef,
} from './sprite-data';

const small: SpriteDef = {
  palette: { a: '#ff0000', b: '#00f' },
  rows: ['a.b', '.ab'],
};

describe('parseSprite', () => {
  it('reads a grid into coloured cells and skips transparent pixels', () => {
    const parsed = parseSprite(small);
    expect(parsed.width).toBe(3);
    expect(parsed.height).toBe(2);
    expect(parsed.cells).toEqual([
      { x: 0, y: 0, colour: '#ff0000' },
      { x: 2, y: 0, colour: '#00f' },
      { x: 1, y: 1, colour: '#ff0000' },
      { x: 2, y: 1, colour: '#00f' },
    ]);
  });

  it('mirrors a left half into a full row', () => {
    const half: SpriteDef = {
      palette: { a: '#fff', b: '#000' },
      rows: ['ab.', '..a'],
      mirror: true,
    };
    expect(expandRows(half)).toEqual(['ab..ba', '..aa..']);
    expect(spriteSize(half)).toEqual({ width: 6, height: 2 });
    const parsed = parseSprite(half);
    expect(parsed.width).toBe(6);
    // Mirror image: the cell at x maps to width - 1 - x.
    const row0 = parsed.cells.filter((c) => c.y === 0).map((c) => c.x);
    expect(row0).toEqual([0, 1, 4, 5]);
  });

  it('does not change the rows of a sprite without mirror', () => {
    expect(expandRows(small)).toEqual(['a.b', '.ab']);
  });

  it('checks the size when one is given', () => {
    expect(() => parseSprite(small, { width: 3, height: 2 })).not.toThrow();
    expect(() => parseSprite(small, { width: 4, height: 2 })).toThrow(SpriteError);
    expect(() => parseSprite(small, { width: 3, height: 3 })).toThrow(/expected 3x3/);
  });
});

describe('validateSprite', () => {
  it('rejects empty sprites and ragged rows', () => {
    expect(() => validateSprite({ palette: {}, rows: [] })).toThrow(/no rows/);
    expect(() => validateSprite({ palette: {}, rows: [''] })).toThrow(/empty/);
    expect(() => validateSprite({ palette: { a: '#fff' }, rows: ['aa', 'a'] })).toThrow(/Row 1/);
  });

  it('rejects pixels that are not in the palette', () => {
    expect(() => validateSprite({ palette: { a: '#fff' }, rows: ['ab'] })).toThrow(/"b"/);
  });

  it('rejects bad palette keys and colours', () => {
    expect(() => validateSprite({ palette: { ab: '#fff' }, rows: ['.'] })).toThrow(/one character/);
    expect(() => validateSprite({ palette: { '.': '#fff' }, rows: ['.'] })).toThrow(
      /one character/,
    );
    expect(() => validateSprite({ palette: { a: 'red' }, rows: ['a'] })).toThrow(/hex colour/);
    expect(() => validateSprite({ palette: { a: 'url(x)' }, rows: ['a'] })).toThrow(/hex colour/);
  });

  it('does not let prototype names count as palette keys', () => {
    expect(() => validateSprite({ palette: {}, rows: ['c'] })).toThrow(/not in the palette/);
  });

  it('rejects very large sprites', () => {
    expect(() => validateSprite({ palette: {}, rows: ['.'.repeat(65)] })).toThrow(/wider/);
    expect(() =>
      validateSprite({ palette: {}, rows: Array.from({ length: 65 }, () => '.') }),
    ).toThrow(/taller/);
    expect(() => validateSprite({ palette: {}, rows: ['.'.repeat(33)], mirror: true })).toThrow(
      /wider/,
    );
  });
});

describe('swapPalette', () => {
  it('replaces used colours and leaves the original alone', () => {
    const swapped = swapPalette(small, { a: '#00ff00' });
    expect(swapped.palette).toEqual({ a: '#00ff00', b: '#00f' });
    expect(small.palette.a).toBe('#ff0000');
    expect(swapped.rows).toBe(small.rows);
  });

  it('ignores keys the sprite does not have', () => {
    expect(swapPalette(small, { z: '#123456' }).palette).toEqual(small.palette);
  });

  it('still validates the result', () => {
    expect(() => parseSprite(swapPalette(small, { a: 'nope' }))).toThrow(/hex colour/);
  });
});

describe('bundled sprites', () => {
  it('has every sprite at the right size', () => {
    for (const [id, def] of Object.entries(BUNDLED_CREATURE_SPRITES)) {
      expect(() => parseSprite(def, CREATURE_SIZE), id).not.toThrow();
    }
    for (const [id, def] of Object.entries(BUNDLED_BOSS_SPRITES)) {
      expect(() => parseSprite(def, BOSS_SIZE), id).not.toThrow();
    }
  });

  it('only has sprites for species and bosses that exist', () => {
    const species = new Set(content.creatures.map((c) => c.id));
    for (const id of Object.keys(BUNDLED_CREATURE_SPRITES)) expect(species.has(id), id).toBe(true);
    const bosses = new Set(content.bosses.map((b) => b.id));
    for (const id of Object.keys(BUNDLED_BOSS_SPRITES)) expect(bosses.has(id), id).toBe(true);
  });

  it('falls back to a silhouette for ids without a sprite', () => {
    expect(() => parseSprite(FALLBACK_SILHOUETTE, CREATURE_SIZE)).not.toThrow();
    expect(creatureSprite('not-a-species')).toBeUndefined();
    expect(creatureSpriteOrFallback('not-a-species')).toBe(FALLBACK_SILHOUETTE);
    expect(creatureSpriteOrFallback('cindle')).toBe(BUNDLED_CREATURE_SPRITES.cindle);
    expect(creatureSprite('constructor')).toBeUndefined();
    expect(bossSprite('nope')).toBeUndefined();
    expect(bossSprite('constructor')).toBeUndefined();
    expect(bossSprite('cinder-wyrm')).toBeDefined();
  });

  it('has an 8x8 icon for every element', () => {
    for (const element of content.elements) {
      const icon = elementIcon(element.id);
      expect(icon, element.id).toBeDefined();
    }
    for (const [id, def] of Object.entries(BUNDLED_ELEMENT_ICONS)) {
      expect(() => parseSprite(def, ICON_SIZE), id).not.toThrow();
    }
    expect(elementIcon('toString')).toBeUndefined();
  });

  it('draws each element icon differently', () => {
    const shapes = Object.values(BUNDLED_ELEMENT_ICONS).map((d) =>
      d.rows.map((r) => r.replace(/[^.]/g, '#')).join('/'),
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
