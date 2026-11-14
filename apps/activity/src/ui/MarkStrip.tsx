import { elementClass } from '../art';
import { elementName } from '../game';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { elementIcon } from '../sprites/element-icons';

/** One mark on the boss: its element, how many counts it holds and whether it is Sealed. */
export interface MarkChipModel {
  element: string;
  stacks: number;
  sealed: boolean;
  /** The boss sheds it on its coming turn: it blinks (a still outline under reduced motion). */
  expiring?: boolean;
  /** A Payoff cashed it in the step on show: it flashes. */
  cashed?: boolean;
}

/**
 * The marks on the boss, in one strip under it, oldest first (docs/design/combat/proposals/001-combat-v2.md, "On the board: Marks"): the
 * element's icon and its count ("x2"), a lock on a Sealed mark, and a blink on the marks that will be shed before the boss's next turn.
 * Debuffs (Bogged Down) never sit here. The strip keeps one line of height when it is empty, so the boss does not move when the first mark
 * lands. Every chip says its element, count and state to a screen reader; the icon's shape is the element's cue, colour is never the only one.
 */
export function MarkStrip({ marks }: { marks: readonly MarkChipModel[] }) {
  return (
    <ul class="mark-strip" aria-label="Marks on the boss, oldest first">
      {marks.map((mark) => {
        const icon = elementIcon(mark.element);
        const classes = ['mark-chip', elementClass(mark.element)];
        if (mark.expiring === true) classes.push('expiring');
        if (mark.cashed === true) classes.push('cashed');
        return (
          <li key={mark.element} class={classes.filter((c) => c !== '').join(' ')}>
            {icon !== undefined && <Sprite sprite={icon} scale={2} />}
            <span class="mark-count" aria-hidden="true">
              {`x${String(mark.stacks)}`}
            </span>
            {mark.sealed && (
              <span class="mark-lock" aria-hidden="true">
                <Sprite sprite={glyphOrUnknown('lock')} scale={1} />
              </span>
            )}
            <span class="visually-hidden">
              {`${elementName(mark.element)} mark, ${String(mark.stacks)}${mark.sealed ? ', sealed' : ''}${mark.expiring === true ? ', about to be shed' : ''}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
