import type { TurnChip } from '../replay';

interface TurnStripProps {
  /** The creatures in the order they act, from `turnChips`. */
  chips: readonly TurnChip[];
  /** What a screen reader calls the strip. */
  label: string;
}

/**
 * The strip of who acts in what order: one chip per creature, the one acting now outlined in gold,
 * those that already acted dimmed and a knocked-out creature struck through. No screen uses it now:
 * the raid replay used to show it, and now (like the dungeon) writes the acting order under each
 * creature on the stage instead. It is kept, with its workbench page, in case a screen wants it
 * back. Names are drawn as text only.
 */
export function TurnStrip({ chips, label }: TurnStripProps) {
  return (
    <ol class="turn-strip" aria-label={label}>
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
            <span class="turn-name">{chip.label}</span>
            {chip.ko && <span class="visually-hidden">, knocked out</span>}
          </li>
        );
      })}
    </ol>
  );
}
