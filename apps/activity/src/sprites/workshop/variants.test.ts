import { describe, expect, it } from 'vitest';
import type { PieceArt } from '../../housing/house-art';
import { RUG_SHAPES, SHADE_KINDS, type GlowKind, type RugBorder } from '../draw/parts';
import { expandRows, spriteSize, validateSprite, type SpriteDef } from '../sprite-data';
import { lintSprite } from '../sprite-lint';
import { FORMS } from './forms/index';
import { generatePiece } from './pack';
import { silhouetteOverlap } from './report';
import { BLACKTHORN } from './sample/blackthorn';
import { PLAIN_PINE } from './sample/plain-pine';
import { SUGARPLUM } from './sample/sugarplum';
import { SAMPLE_STYLES, SHIPPED_SETS } from './sets';
import { type FormId, SET_FORMS, type Style } from './style';
import { VARIANTS } from './variants';

const STYLES: Style[] = [
  ...Object.values(SAMPLE_STYLES),
  ...Object.values(SHIPPED_SETS).map((s) => s.style),
];

/** The share of a sprite's outer pixels (drawn, with a transparent or off-canvas 4-neighbour) that are ink. */
function inkEdge(def: SpriteDef): number {
  const rows = expandRows(def);
  const ink = Object.entries(def.palette).find(([, c]) => c === '#0d0a1a')?.[0];
  let edge = 0;
  let inked = 0;
  for (const [y, row] of rows.entries()) {
    for (const [x, ch] of [...row].entries()) {
      if (ch === '.') continue;
      const out = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx = 0, ny = 0]) => (rows[ny]?.[nx] ?? '.') === '.');
      if (!out) continue;
      edge++;
      if (ch === ink) inked++;
    }
  }
  return edge === 0 ? 1 : inked / edge;
}

/** Every piece a variant draws: each value of each axis of each form, and every lamp, glow, rug shape and border. */
function variantPieces(style: Style): { where: string; form: FormId; art: PieceArt }[] {
  const out: { where: string; form: FormId; art: PieceArt }[] = [];
  for (const [form, axes] of Object.entries(VARIANTS) as [
    FormId,
    Record<string, readonly string[]>,
  ][]) {
    for (const [axis, values] of Object.entries(axes)) {
      for (const value of values) {
        const own = style.shapes?.[form as keyof NonNullable<Style['shapes']>] ?? {};
        const shaped: Style = {
          ...style,
          shapes: { ...style.shapes, [form]: { ...own, [axis]: value } },
        };
        out.push({
          where: `${style.id} ${form} ${axis}=${value}`,
          form,
          art: generatePiece(form, shaped),
        });
      }
    }
  }
  for (const lamp of SHADE_KINDS) {
    for (const kind of ['ring', 'dither', 'stipple'] as GlowKind[]) {
      const shaped: Style = { ...style, lamp, glow: { ...style.glow, kind } };
      out.push({
        where: `${style.id} lamp ${lamp} ${kind}`,
        form: 'lamp',
        art: generatePiece('lamp', shaped),
      });
    }
  }
  for (const shape of RUG_SHAPES) {
    for (const border of ['band', 'stripe', 'dots', 'none'] as RugBorder[]) {
      const shaped: Style = { ...style, rug: { ...style.rug, shape, border, motifs: 'row' } };
      out.push({
        where: `${style.id} rug ${shape} ${border}`,
        form: 'rug',
        art: generatePiece('rug', shaped),
      });
    }
  }
  return out;
}

describe('form variants', () => {
  it('lists, per form, axes whose first value is the plain drawing', () => {
    for (const style of [PLAIN_PINE]) {
      const plain: Style = { ...style, shapes: {} };
      for (const form of SET_FORMS) {
        expect(generatePiece(form, { ...plain, shapes: { [form]: {} } }), form).toEqual(
          generatePiece(form, plain),
        );
      }
    }
    expect(Object.keys(VARIANTS).every((f) => f in FORMS)).toBe(true);
  });

  it('draws every variant in every style at its form box, with an ink outline and no lint error', () => {
    for (const style of STYLES) {
      for (const { where, form, art } of variantPieces(style)) {
        validateSprite(art.sprite, { width: FORMS[form].box.w, height: FORMS[form].box.h });
        if (art.front !== undefined) validateSprite(art.front, spriteSize(art.sprite));
        if (art.glow !== undefined)
          expect(spriteSize(art.glow).width, where).toBe(FORMS[form].box.w);
        for (const def of [art.sprite, art.front, art.glow]) {
          for (const [key, colour] of Object.entries(def?.palette ?? {}))
            expect(style.palette[key], `${where} ${key}`).toBe(colour);
        }
        expect(inkEdge(art.sprite), `${where}: outline`).toBeGreaterThanOrEqual(0.85);
        const errors = lintSprite(art.sprite, { kind: 'free' }).filter((f) => f.level === 'error');
        expect(
          errors.map((e) => e.message),
          where,
        ).toEqual([]);
        // a floor piece stands on its bottom row; a lamp hangs from its top row
        const rows = expandRows(art.sprite);
        if (['bed', 'cupboard', 'table', 'stool', 'rug'].includes(form))
          expect((rows.at(-1) ?? '').replaceAll('.', '').length, where).toBeGreaterThan(0);
        if (form === 'lamp')
          expect((rows[0] ?? '').replaceAll('.', '').length, where).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the bed sleeper and its front layer for every headboard', () => {
    for (const head of VARIANTS.bed.head) {
      const bed = generatePiece('bed', { ...PLAIN_PINE, shapes: { bed: { head } } });
      expect(bed.front, head).toBeDefined();
      expect(bed.sleep, head).toEqual({ x: 10, y: 0 });
    }
  });

  it('gives the three demo styles different outlines, not one set recoloured', () => {
    const demos = [PLAIN_PINE, BLACKTHORN, SUGARPLUM];
    for (const [i, a] of demos.entries()) {
      for (const b of demos.slice(i + 1)) {
        const differ = SET_FORMS.filter(
          (form) =>
            silhouetteOverlap(generatePiece(form, a).sprite, generatePiece(form, b).sprite) < 0.85,
        );
        expect(differ.length, `${a.id} and ${b.id}: ${differ.join(', ')}`).toBeGreaterThanOrEqual(
          6,
        );
      }
    }
  });
});
