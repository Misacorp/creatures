/**
 * A furniture set's art pack from its style (`docs/design/housing-workshop.md`): every form is drawn from the style
 * unless the set overrides it. An override keeps hand pixels (the whole piece or some of its layers) or
 * post-processes the generated piece, and always says why. A set's pack file in `sprites/data/house/` calls
 * `setPack`; the game reads the result like any other pack.
 */
import type { HouseArtPack, PieceArt } from '../../housing/house-art';
import { FORMS } from './forms/index';
import { type FormId, SET_FORMS, type Style, styleProblems } from './style';

export type PieceLayer = 'sprite' | 'front' | 'glow' | 'sleep';

export type PieceOverride =
  /** The hand-drawn piece of the set's `hand` pack, whole. */
  | { use: 'hand'; why: string }
  /** Some layers from the hand-drawn piece, the rest generated. */
  | { use: 'layers'; layers: readonly PieceLayer[]; why: string }
  /** A piece given here, whole. */
  | { use: 'art'; art: PieceArt; why: string }
  /** The generated piece, changed by a function (recolour a pixel, add a detail). */
  | { use: 'post'; post: (art: PieceArt, style: Style) => PieceArt; why: string };

export interface SetSource {
  style: Style;
  /** The set's hand-drawn art: pieces by id (`<set>-<form>`), and the skins and keepsake, which pass through. */
  hand?: HouseArtPack;
  /** Per form, how its piece is made; a form not listed is generated from the style. */
  pieces?: Partial<Record<FormId, PieceOverride>>;
}

/** The piece a form draws from a style, with no override. */
export function generatePiece(form: FormId, style: Style): PieceArt {
  return FORMS[form].draw(style);
}

/** The piece id of a set's form. */
export function pieceId(style: Style, form: FormId): string {
  return `${style.id}-${form}`;
}

function handPiece(source: SetSource, form: FormId): PieceArt {
  const id = pieceId(source.style, form);
  const art = source.hand?.pieces?.[id];
  if (art === undefined) throw new Error(`${id}: the override uses hand art, but the hand pack has none.`);
  return art;
}

/** The finished piece of one form: generated, or as its override says. */
export function makePiece(source: SetSource, form: FormId): PieceArt {
  const o = source.pieces?.[form];
  if (o === undefined) return generatePiece(form, source.style);
  switch (o.use) {
    case 'hand':
      return handPiece(source, form);
    case 'art':
      return o.art;
    case 'post':
      return o.post(generatePiece(form, source.style), source.style);
    case 'layers': {
      const hand = handPiece(source, form);
      const made = generatePiece(form, source.style);
      const out: Record<string, unknown> = { ...made };
      for (const layer of o.layers) {
        if (hand[layer] === undefined) delete out[layer];
        else out[layer] = hand[layer];
      }
      return out as unknown as PieceArt;
    }
  }
}

/** How each form of a set is made: `generated`, or the override's kind and reason. */
export function setReport(source: SetSource): { form: FormId; made: string; why: string }[] {
  return SET_FORMS.map((form) => {
    const o = source.pieces?.[form];
    return o === undefined
      ? { form, made: 'generated', why: '' }
      : { form, made: o.use, why: o.why };
  });
}

/** The art pack of a set: its nine pieces, and the hand pack's skins, keepsakes and any other pieces. */
export function setPack(source: SetSource): HouseArtPack {
  const problems = styleProblems(source.style);
  if (problems.length > 0) throw new Error(`Style ${source.style.id}: ${problems.join('; ')}`);
  const pieces: Record<string, PieceArt> = { ...(source.hand?.pieces ?? {}) };
  for (const form of SET_FORMS) pieces[pieceId(source.style, form)] = makePiece(source, form);
  return { ...source.hand, pieces };
}
