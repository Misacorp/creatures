import { GlossaryTag } from '../Glossary';
import type { IconRef } from '../icon-ref';
import { GameIcon } from './GameIcon';

export interface CountBadgeProps {
  icon: IconRef;
  /** A number, or a short text for a range ("3–4") or a time ("51 min"). */
  amount: number | string;
  /** What assistive technology says for a text amount instead of the text itself ("3 to 4"); a number is spoken as it is. */
  spokenAmount?: string;
  /** What assistive technology says with the amount ("Scrap: 3"); the icon never carries the meaning alone. */
  label?: string;
  /** The glossary entry it opens when tapped. Without one it is not a button (it can sit inside one). */
  entry?: string;
  /** A visible name after the number, for a badge that is not explained anywhere else. */
  name?: string;
}

/** One entry of a row of count badges: the props of a badge and a key for the list. */
export type CountItem = CountBadgeProps & { key: string };

/**
 * An icon with a number (and, when asked for, its name): the one count badge of parts, Bait,
 * Essence and supplies on every reward and cost line.
 */
export function CountBadge({ icon, amount, spokenAmount, label, entry, name }: CountBadgeProps) {
  const body = (
    <>
      <GameIcon icon={icon} scale={2} />
      <span class="part-amount pix">{amount}</span>
      {name !== undefined && <span class="cost-name">{name}</span>}
    </>
  );
  const spoken = label === undefined ? undefined : `${label}: ${spokenAmount ?? String(amount)}`;
  if (entry !== undefined) {
    return (
      <GlossaryTag
        entry={entry}
        look="chip"
        class="part-count"
        {...(spoken === undefined ? {} : { label: spoken })}
      >
        {body}
      </GlossaryTag>
    );
  }
  return spoken === undefined ? (
    <span class="part-count">{body}</span>
  ) : (
    <span class="part-count" role="img" aria-label={spoken}>
      {body}
    </span>
  );
}
