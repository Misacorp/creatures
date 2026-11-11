/**
 * A furniture set's style (`docs/design/housing-workshop.md`): the palette, a ramp per material, and the choices that
 * make a set's pieces its own (the leg, the foot, the trim, the top's silhouette, the motif, the cloth, the lamp, the
 * rug and the picture). A form (`forms/`) plus a style draws a piece; `parts` swaps one named part of one form for
 * the set's own drawing.
 */
import type { Canvas } from '../draw/canvas';
import type {
  ClothPattern,
  CrestKind,
  FootKind,
  GlowKind,
  LegKind,
  Materials,
  MotifKind,
  PictureKind,
  RugBorder,
  RugShape,
  ShadeKind,
  ShelfItem,
  TrimKind,
} from '../draw/parts';
import type { Ramp } from '../draw/shapes';
import type { FormShapes } from './variants';

/** The nine indoor forms every set has (`packages/game/src/content/data/housing/forms.json`). */
export const SET_FORMS = [
  'bed',
  'cupboard',
  'table',
  'shelf',
  'stool',
  'lamp',
  'rug',
  'frame',
  'curtains',
] as const;

export type FormId = (typeof SET_FORMS)[number];

/** A box on a piece's canvas. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a part's drawing gets: the canvas, the style and the area the form gives the part. */
export interface PartContext {
  c: Canvas;
  style: Style;
  at: Area;
}

/** A set's own drawing of one named part (see each form's `parts`). */
export type PartDraw = (ctx: PartContext) => void;

export interface Style extends Materials {
  /** The set id; pieces are `<id>-<form>`. */
  id: string;
  name: string;
  /** Palette keys to colours. `k` is the shared ink (`#0d0a1a`). Every ramp key must be here. */
  palette: Readonly<Record<string, string>>;
  leg: LegKind;
  foot: FootKind;
  /** The band under table tops, along cupboard crowns and the bed's rails. */
  trim: TrimKind;
  /** The silhouette above the tall pieces (headboard, cupboard, frame, window). */
  top: CrestKind;
  /** The set's small ornament, set on doors, headboards, the lamp and the frame. */
  motif: MotifKind;
  /** The blanket's, cushion's and curtains' weave. */
  weave: ClothPattern;
  lamp: ShadeKind;
  /** What the lamp's shade is made of. */
  lampMaterial: 'wood' | 'cloth' | 'linen' | 'metal';
  /** The lamp's night glow: its kind and the two keys (`inner` the brighter). */
  glow: { kind: GlowKind; inner: string; outer: string };
  rug: {
    shape: RugShape;
    weave: ClothPattern;
    /** The band round the field (default `band`). */
    border?: RugBorder;
    /** The style's motif on the field: once in the middle or in a row (default none). */
    motifs?: 'none' | 'centre' | 'row';
  };
  picture: PictureKind;
  /** What stands on the wall shelf, left to right. */
  shelf: readonly ShelfItem[];
  /** The silhouette variant of each form (`variants.ts`); a form left out is drawn plain. */
  shapes?: FormShapes;
  /** Named parts drawn the set's own way, by form. */
  parts?: Partial<Record<FormId, Readonly<Record<string, PartDraw>>>>;
}

const RAMPS = ['wood', 'cloth', 'linen', 'metal', 'glass', 'accent'] as const;

function rampKeys(ramp: Ramp): string[] {
  return [ramp.hi, ramp.light, ramp.mid, ramp.dark, ramp.deep].filter(
    (k): k is string => k !== undefined,
  );
}

/** The problems with a style (empty when it is sound): unknown keys, a missing ink, bad colours. */
export function styleProblems(style: Style): string[] {
  const problems: string[] = [];
  if (style.palette.k !== '#0d0a1a') problems.push('the ink `k` must be #0d0a1a');
  for (const [key, colour] of Object.entries(style.palette)) {
    if ([...key].length !== 1 || key === '.')
      problems.push(`palette key "${key}" is not one character`);
    if (!/^#[0-9a-f]{6}$/i.test(colour)) problems.push(`palette "${key}" is not #rrggbb`);
  }
  for (const name of RAMPS) {
    for (const key of rampKeys(style[name])) {
      if (!Object.hasOwn(style.palette, key))
        problems.push(`${name} uses "${key}", not in the palette`);
    }
  }
  for (const key of [style.glow.inner, style.glow.outer]) {
    if (!Object.hasOwn(style.palette, key)) problems.push(`glow uses "${key}", not in the palette`);
  }
  if (style.shelf.length === 0) problems.push('the shelf needs at least one thing');
  return problems;
}
