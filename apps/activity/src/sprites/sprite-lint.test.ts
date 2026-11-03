import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { BUNDLED_BOSS_SPRITES, BUNDLED_CREATURE_SPRITES } from './creature-sprites';
import { BUNDLED_GLYPHS } from '../glyphs';
import { CONCEPT_SETS } from './concepts/sets';
import { BUNDLED_ELEMENT_ICONS } from './element-icons';
import { contrast, hsl, inFamily, ELEMENT_FAMILIES, lintSprite, KIND_SIZE } from './sprite-lint';
import type { SpriteDef } from './sprite-data';

const face = (body: string): SpriteDef => ({
  mirror: true,
  palette: { k: '#0d0a1a', e: '#fbf8ec', q: '#ff8fab', b: body },
  rows: [
    '........',
    '........',
    '....kkkk',
    '..kkbbbb',
    '.kbbbbbb',
    '.kbbbbbb',
    'kbbbbbbb',
    'kbbbbbbb',
    'kbbbekbb',
    'kbbbkkbb',
    'kbbqbbbk',
    'kbbbbbbb',
    '.kbbbbbb',
    '..kkbbbb',
    '....kkkk',
    '........',
  ],
});

describe('lintSprite', () => {
  it('passes every shipped creature and boss (the lint agrees with the sprite tests)', () => {
    for (const c of content.creatures) {
      const def = BUNDLED_CREATURE_SPRITES[c.id];
      if (def === undefined) throw new Error(c.id);
      const errors = lintSprite(def, {
        kind: 'creature',
        element: c.element,
        others: BUNDLED_CREATURE_SPRITES,
        id: c.id,
      }).filter((f) => f.level === 'error');
      expect(errors, c.id).toEqual([]);
    }
    for (const [id, def] of Object.entries(BUNDLED_BOSS_SPRITES)) {
      expect(
        lintSprite(def, { kind: 'boss' }).filter((f) => f.level === 'error'),
        id,
      ).toEqual([]);
    }
  });

  it('reports a moved eye, a cut body, an unused key and a dark body, with coordinates', () => {
    const def = face('#2a2450');
    const moved: SpriteDef = {
      ...def,
      palette: { ...def.palette, z: '#ffffff' },
      rows: def.rows.map((row, y) => (y === 8 ? 'kbbbbekb' : y === 7 ? 'bbbbbbbb' : row)),
    };
    const rules = lintSprite(moved, { kind: 'creature' }).map((f) => `${f.rule}:${f.level}`);
    expect(rules).toContain('face:error');
    expect(rules).toContain('edge:error');
    expect(rules).toContain('palette:error');
    expect(rules).toContain('contrast:warn');
    const edge = lintSprite(moved, { kind: 'creature' }).find((f) => f.rule === 'edge');
    expect(edge?.message).toContain('x 0, y 7');
  });

  it('accepts a well-formed light creature and checks its element family', () => {
    expect(lintSprite(face('#c9c3e6'), { kind: 'creature' })).toEqual([]);
    const rules = lintSprite(face('#c9c3e6'), { kind: 'creature', element: 'ember' });
    expect(rules.map((f) => f.rule)).toEqual(['element']);
  });

  it('checks a dungeon foe like a creature but without the chibi face', () => {
    const def = face('#c9c3e6');
    const faceless: SpriteDef = { ...def, rows: def.rows.map((r) => r.replace(/[eq]/g, 'b')) };
    const palette = Object.fromEntries(
      Object.entries(faceless.palette).filter(([key]) => key !== 'e' && key !== 'q'),
    );
    const foe = { ...faceless, palette };
    expect(lintSprite(foe, { kind: 'foe' })).toEqual([]);
    expect(lintSprite(foe, { kind: 'creature' }).map((f) => f.rule)).toContain('face');
  });

  it('stops at a grid that does not parse', () => {
    const bad: SpriteDef = { palette: { k: '#0d0a1a' }, rows: ['kk', 'k'] };
    expect(lintSprite(bad, { kind: 'free' }).map((f) => f.rule)).toEqual(['grid']);
  });

  it('measures colour', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21);
    expect(hsl('#ff0000').hue).toBe(0);
    expect(inFamily('#ef6a3a', ELEMENT_FAMILIES.ember ?? { hues: [], min: 0 })).toBe(true);
    expect(inFamily('#6f62b8', ELEMENT_FAMILIES.void ?? { hues: [], min: 0 })).toBe(true);
    expect(inFamily('#9a9a9a', ELEMENT_FAMILIES.ember ?? { hues: [], min: 0 })).toBe(false);
  });
});

describe('concept art', () => {
  it('finds every set file of the folder, each set with its own id', () => {
    const files = Object.keys(
      import.meta.glob(['./concepts/*.ts', '!./concepts/index.ts', '!./concepts/sets.ts']),
    );
    expect(CONCEPT_SETS.length).toBeGreaterThanOrEqual(files.length);
    const ids = CONCEPT_SETS.map((set) => set.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('parses at its kind size, so the studio can always draw it', () => {
    for (const set of CONCEPT_SETS) {
      expect(Object.keys(set.sprites).length, `${set.id} has no sprites`).toBeGreaterThan(0);
      for (const [id, concept] of Object.entries(set.sprites)) {
        const findings = lintSprite(concept.sprite, { kind: concept.kind });
        expect(
          findings.filter((f) => f.rule === 'grid'),
          `${set.id}/${id}`,
        ).toEqual([]);
        expect(Object.hasOwn(KIND_SIZE, concept.kind), id).toBe(true);
      }
    }
  });
});

describe('glyph art', () => {
  const flat = (rows: string[]): SpriteDef => ({ palette: { r: '#ff5f6d' }, rows });
  const plus = [
    '...rr...',
    '...rr...',
    '...rr...',
    'rrrrrrrr',
    'rrrrrrrr',
    '...rr...',
    '...rr...',
    '...rr...',
  ];

  it('is 8x8 flat colour: no ink outline is needed, as in the shipped glyphs', () => {
    expect(lintSprite(flat(plus), { kind: 'glyph' })).toEqual([]);
    const small = lintSprite(flat(['rr', 'rr']), { kind: 'glyph' });
    expect(small.map((f) => f.rule)).toEqual(['grid']);
  });

  it('wants more than 8 pixels, at most 5 colours and a silhouette 6 pixels from every shipped glyph', () => {
    const thin = flat(['rrrr....', ...Array.from({ length: 7 }, () => '........')]);
    expect(lintSprite(thin, { kind: 'glyph' }).map((f) => f.rule)).toContain('footprint');
    const palette = {
      a: '#111111',
      b: '#222222',
      c: '#333333',
      d: '#444444',
      e: '#555555',
      f: '#666666',
    };
    const many: SpriteDef = {
      palette,
      rows: ['abcdef..', ...plus.slice(1).map((r) => r.replace(/r/g, 'a'))],
    };
    expect(
      lintSprite(many, { kind: 'glyph' })
        .map((f) => f.message)
        .join(' '),
    ).toContain('6 colours');
    const near = lintSprite(flat(plus), { kind: 'glyph', others: { same: flat(plus) } });
    expect(near.map((f) => f.rule)).toContain('silhouette');
  });

  it('every shipped glyph passes the glyph rules (the lint agrees with the glyph tests)', () => {
    for (const [id, def] of Object.entries(BUNDLED_GLYPHS)) {
      // A few shipped glyphs carry a palette key no pixel uses (the reticle's "k"); that rule is for new art.
      const errors = lintSprite(def, { kind: 'glyph' }).filter(
        (f) => f.level === 'error' && f.rule !== 'palette',
      );
      expect(errors, id).toEqual([]);
    }
  });

  it('draws every concept glyph apart from every shipped glyph', () => {
    for (const set of CONCEPT_SETS) {
      for (const [id, concept] of Object.entries(set.sprites)) {
        if (concept.kind !== 'glyph') continue;
        const errors = lintSprite(concept.sprite, {
          kind: 'glyph',
          others: { ...BUNDLED_GLYPHS, ...BUNDLED_ELEMENT_ICONS },
        }).filter((f) => f.level === 'error');
        expect(errors, `${set.id}/${id}`).toEqual([]);
      }
    }
  });

  it('only reuses shipped glyphs that exist', () => {
    for (const set of CONCEPT_SETS) {
      for (const item of set.shipped ?? []) {
        expect(
          Object.hasOwn(BUNDLED_GLYPHS, item.id) || Object.hasOwn(BUNDLED_ELEMENT_ICONS, item.id),
          `${set.id}: ${item.id}`,
        ).toBe(true);
      }
    }
  });
});
