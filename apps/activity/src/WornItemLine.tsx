import { ItemFrame, ItemSprite } from './GearArt';
import { gearName, slotName, wornInOrder, type WornItem } from './gear-view';

/** The worn item's 12x12 sprite in its rarity frame. */
export function WornItemFrame({ worn }: { worn: WornItem }) {
  return (
    <ItemFrame rarity={worn.rarity}>
      <ItemSprite baseId={worn.baseId} scale={3} />
    </ItemFrame>
  );
}

/**
 * The read-only list of what a creature wears, one line per item: the framed sprite and the words
 * (name, slot, item level and, when known, the text of its lines). The living room's popover uses it.
 */
export function WornItemLines({ worn }: { worn: readonly WornItem[] }) {
  return (
    <ul class="worn-items" aria-label="Worn gear">
      {wornInOrder(worn).map((item) => (
        <li key={item.slot} class="gear-line worn-item-line">
          <WornItemFrame worn={item} />
          <p class="gear-text">
            <span class="pix">{gearName(item.baseId)}</span>{' '}
            <span class="muted">
              {slotName(item.slot)}, item level {item.itemLevel}
            </span>
            {item.lines !== undefined && item.lines.length > 0 && (
              <span class="muted gear-main"> · {item.lines.join(', ')}</span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
