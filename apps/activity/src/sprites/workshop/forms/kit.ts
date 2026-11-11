/** What every form shares: its definition's shape, and the call that lets a style swap one named part. */
import type { PieceArt } from '../../../housing/house-art';
import type { Canvas } from '../../draw/canvas';
import type { Area, FormId, PartDraw, Style } from '../style';

export interface FormDef {
  id: FormId;
  /** The form box of `forms.json` (a test keeps them equal). The piece is drawn at exactly this size. */
  box: { w: number; h: number };
  /** The named parts, in the order they are drawn (back to front); a style's `parts` can replace any of them. */
  parts: readonly string[];
  /** One line on what the form is and where its parts sit. */
  note: string;
  draw(style: Style): PieceArt;
}

/** Draws a named part: the style's own drawing when it has one for this form, else the form's. */
export function part(
  c: Canvas,
  style: Style,
  form: FormId,
  name: string,
  at: Area,
  draw: PartDraw,
): void {
  const own = style.parts?.[form]?.[name];
  (own ?? draw)({ c, style, at });
}
