import { content } from '@creatures/game';
import type { Rules } from './rules';
import type { Player } from './types';

/**
 * Forms: a line is found as its stage 1 and a creature that evolves becomes the line's second form. A form is "held" only while a creature
 * is it: an evolved creature no longer holds the stage 1 (the lab has one creature a line, a duplicate melts into scrap).
 */

const FIRST = content.creatures.filter((c) => c.stage === 1 && c.catchable);

/** The id of a form of a line: the content's species ids for the launch lines, `line-N` and `line-N-2` for dropped ones. */
export function formId(line: number, evolved: boolean): string {
  const first = FIRST[line];
  if (first) {
    if (!evolved) return first.id;
    const later = content.creatures.find((c) => c.line === first.line && c.stage === 2);
    return later?.id ?? `${first.id}-evolved`;
  }
  return evolved ? `line-${line + 1}-evolved` : `line-${line + 1}`;
}

/** The forms the player's creatures are right now, as numbers (line * 2, plus 1 when evolved). */
export const heldForms = (p: Player): number[] =>
  p.creatures.map((c) => c.species * 2 + (c.evolved ? 1 : 0));

/** The name of a held form (see `heldForms`). */
export const formName = (held: number): string => formId(Math.floor(held / 2), held % 2 === 1);

/** Whether a line has a second form to evolve into (a form held as `line * 2 + 1` is only possible then). */
export const hasSecondForm = (rules: Rules, line: number): boolean =>
  (rules.scouts.lines.first[line]?.forms ?? rules.scouts.lines.forms[0] ?? 1) > 1;
