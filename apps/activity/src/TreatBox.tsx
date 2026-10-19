import { useRef } from 'preact/hooks';
import { baitCount } from './count-items';
import { GlossaryTag } from './Glossary';
import { CountBadge } from './ui/CountBadge';

let boxCounter = 0;

/**
 * "Pack a treat": the one compact line where a creature is sent on a trip, put in the dungeon team or
 * given a Workshop job. A treat costs Bait (the server's price, `Creature.treatCost`, paid when the
 * activity starts) and doubles the experience that activity gives this creature. Nothing is stored or
 * stocked; the box only says what the player wants for this one start. It cannot be ticked without the
 * Bait (the server checks again and refuses a short purse).
 */
export function TreatBox({
  cost,
  bait,
  checked,
  disabled = false,
  onChange,
  who,
}: {
  /** What the treat costs for this creature, in Bait. */
  cost: number;
  /** The player's Bait now. */
  bait: number;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** The creature's name, said in the label (several boxes can be on one screen). */
  who?: string;
}) {
  // One id for the life of the box (a label needs it); a new box gets the next number.
  const idRef = useRef<string | null>(null);
  idRef.current ??= `treat-${String(++boxCounter)}`;
  const id = idRef.current;
  const short = bait < cost;
  return (
    <p class="treat-box">
      <label for={id}>
        <input
          id={id}
          type="checkbox"
          aria-label={`Pack a treat${who === undefined ? '' : ` for ${who}`} (${String(cost)} Bait)`}
          checked={checked}
          disabled={disabled || (short && !checked)}
          onChange={(event) => {
            onChange(event.currentTarget.checked);
          }}
        />{' '}
        <span>Pack a treat{who === undefined ? '' : ` for ${who}`}</span>{' '}
        <CountBadge {...baitCount(cost)} />
      </label>
      <GlossaryTag entry="treat" look="help" class="treat-help" />
      {short && !checked && <span class="muted"> Not enough Bait.</span>}
    </p>
  );
}
