import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { BUNDLED_BOSS_SPRITES, BUNDLED_CREATURE_SPRITES } from './creature-sprites';
import { CONCEPT_SETS } from './concepts';
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
  it('parses at its kind size, so the studio can always draw it', () => {
    for (const set of CONCEPT_SETS) {
      expect(Object.keys(set.sprites).length, `${set.id} has no sprites`).toBeGreaterThan(0);
      for (const [id, concept] of Object.entries(set.sprites)) {
        const findings = lintSprite(concept.sprite, { kind: concept.kind });
        expect(
          findings.filter((f) => f.rule === 'grid'),
          `${set.id}/${id}`,
        ).toEqual([]);
        expect(Object.keys(KIND_SIZE), id).toContain(concept.kind);
      }
    }
  });
});
