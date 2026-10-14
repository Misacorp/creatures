import type { TurnChip } from '../replay';

interface TurnStripProps {
  /** The creatures in the order they act, from `turnChips`. */
  chips: readonly TurnChip[];
  /** What a screen reader calls the strip. */
  label: string;
  /**
   * The dungeon's last chip: the foe, which always acts after the team. Absent in the raid, where
   * the boss's turn is named in the heading above.
   */
  foe?: { text: string; current: boolean };
  /**
   * Fit the strip to its row: the chips shrink and long names end in an ellipsis, instead of the
   * strip scrolling sideways (the dungeon's, which has three chips and the foe on a phone).
   */
  fit?: boolean;
}

/**
 * The strip of who acts in what order: one chip per creature, the one acting now outlined in gold,
 * those that already acted dimmed and a knocked-out creature struck through. With a slot number a
 * chip reads "1 Cindle" (the number is the creature's place in the row, as on the setup screen).
 * Names are drawn as text only.
 */
export function TurnStrip({ chips, label, foe, fit = false }: TurnStripProps) {
  return (
    <ol class={fit ? 'turn-strip fit' : 'turn-strip'} aria-label={label}>
      {chips.map((chip) => {
        const classes = ['turn-chip'];
        if (chip.current) classes.push('current');
        else if (chip.done) classes.push('done');
        if (chip.ko) classes.push('ko');
        return (
          <li
            key={chip.id}
            class={classes.join(' ')}
            aria-current={chip.current ? 'step' : undefined}
          >
            {chip.slot !== undefined && <span class="turn-slot pix">{chip.slot}</span>}
            <span class="turn-name">{chip.label}</span>
            {chip.ko && <span class="visually-hidden">, knocked out</span>}
          </li>
        );
      })}
      {foe !== undefined && (
        <li
          class={`turn-chip turn-foe${foe.current ? ' current' : ''}`}
          aria-current={foe.current ? 'step' : undefined}
        >
          {foe.text}
        </li>
      )}
    </ol>
  );
}
