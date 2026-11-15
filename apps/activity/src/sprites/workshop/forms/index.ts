/** The forms of a furniture set, by id (`docs/design/housing-workshop.md`). */
import type { FormId } from '../style';
import { BED } from './bed';
import { CUPBOARD } from './cupboard';
import type { FormDef } from './kit';
import { SHELF } from './shelf';
import { LAMP, RUG, STOOL } from './small';
import { TABLE } from './table';
import { CURTAINS, FRAME } from './wall';

export type { FormDef } from './kit';
export { part } from './kit';

export const FORMS: Readonly<Record<FormId, FormDef>> = {
  bed: BED,
  cupboard: CUPBOARD,
  table: TABLE,
  shelf: SHELF,
  stool: STOOL,
  lamp: LAMP,
  rug: RUG,
  frame: FRAME,
  curtains: CURTAINS,
};
