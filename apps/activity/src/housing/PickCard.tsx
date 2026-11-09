import type { ComponentChildren } from 'preact';
import { ActionButton } from '../ui/ActionButton';
import { CountBadge } from '../ui/CountBadge';
import { Tag } from '../ui/Tag';

/**
 * The card under a picture grid for the chosen thing (`SupplyCrafting`'s pattern): its picture, name and set, how many
 * copies are free, and one main button with its reason. The spot picker and the skin picker both end in it.
 */
export function PickCard({
  picture,
  name,
  set,
  free,
  iconId,
  action,
}: {
  picture: ComponentChildren;
  name: string;
  set: string | null;
  /** Copies not placed, shown as a badge; absent for empty and for a skin. */
  free?: number | undefined;
  /** The item id of the badge's picture. */
  iconId?: string | undefined;
  action: { label: string; detail?: string | undefined; disabled: boolean; onClick: () => void };
}) {
  return (
    <div class="hp-pick-card" aria-live="polite">
      <div class="hp-pick-head">
        <span class="hp-pick-picture" aria-hidden="true">
          {picture}
        </span>
        <span class="hp-pick-text">
          <span class="hp-pick-name pix">{name}</span>
          {set !== null && <Tag>{set}</Tag>}
          {free !== undefined && iconId !== undefined && (
            <CountBadge
              icon={{ kind: 'house', id: iconId }}
              amount={free}
              label="Free copies"
              spokenAmount={`${String(free)} free`}
            />
          )}
        </span>
      </div>
      <ActionButton
        wide
        label={action.label}
        detail={action.detail}
        disabled={action.disabled}
        onClick={action.onClick}
      />
    </div>
  );
}
