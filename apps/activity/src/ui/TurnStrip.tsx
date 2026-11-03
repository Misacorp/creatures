import { combatGlyph } from '../combat-glyphs';
import { glyphOrUnknown } from '../glyphs';
import type { TurnChip } from '../replay';
import { Sprite } from '../sprites/Sprite';

/** A move's picture on a boss step, with how often it is due (every this many rounds) and its name for a screen reader. */
export interface StepMove {
  glyph: string;
  every: number;
  label: string;
}

/** One step of the strip: a creature (or a row of the board) and, for a boss step, the moves due on it. */
export interface TurnStripChip extends TurnChip {
  /** A step of the boss: it takes a turn after each row, and these moves land on it (empty: only its plain attack). */
  boss?: { moves: readonly StepMove[] };
}

interface TurnStripProps {
  /** The steps in the order they happen, from `turnChips` (the replay) or `boardTurnSteps` (a week's board). */
  chips: readonly TurnStripChip[];
  /** What a screen reader calls the strip. */
  label: string;
}

/**
 * The strip of who acts in what order: one chip per step, the one acting now outlined in gold, those that
 * already acted dimmed and a knocked-out creature struck through. On a combat v2 raid board it reads one round:
 * row 1, boss, row 2, boss, row 3, boss (the boss takes a turn after every row), and a boss step carries the
 * pictures of the moves due on it, each with its rhythm ("3": every third round). Names are drawn as text only.
 */
export function TurnStrip({ chips, label }: TurnStripProps) {
  return (
    <ol class="turn-strip" aria-label={label}>
      {chips.map((chip) => {
        const classes = ['turn-chip'];
        if (chip.current) classes.push('current');
        else if (chip.done) classes.push('done');
        if (chip.ko) classes.push('ko');
        if (chip.boss !== undefined) classes.push('boss-step');
        return (
          <li
            key={chip.id}
            class={classes.join(' ')}
            aria-current={chip.current ? 'step' : undefined}
          >
            <span class="turn-name">{chip.label}</span>
            {chip.boss?.moves.map((move) => (
              <span key={move.label} class="turn-move" title={move.label}>
                <Sprite sprite={combatGlyph(move.glyph) ?? glyphOrUnknown('unknown')} scale={1} />
                <span class="turn-every" aria-hidden="true">
                  {move.every}
                </span>
                <span class="visually-hidden">
                  {`, ${move.label}, every ${String(move.every)} rounds`}
                </span>
              </span>
            ))}
            {chip.ko && <span class="visually-hidden">, knocked out</span>}
          </li>
        );
      })}
    </ol>
  );
}
