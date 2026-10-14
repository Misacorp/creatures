import { ItemFrame, ItemSprite } from './GearArt';
import { enchantName, formatBonus, gearName, statLabel, type WornItem } from './gear-view';

/** The worn item's 12x12 sprite in its rarity frame. */
export function WornItemFrame({ worn }: { worn: WornItem }) {
  return (
    <ItemFrame rarity={worn.rarity}>
      <ItemSprite baseId={worn.baseId} scale={3} />
    </ItemFrame>
  );
}

/** The worn item in words: its name, level, main stat bonus and enchant. Shared by the card and the popover. */
export function WornItemText({ worn }: { worn: WornItem }) {
  return (
    <p class="gear-text">
      <span class="pix">{gearName(worn.baseId)}</span> <span class="lvl">+{worn.level}</span>
      {worn.primary !== undefined && (
        <span class="muted gear-main">
          {' '}
          {formatBonus(worn.primary.stat, worn.primary.bp)} {statLabel(worn.primary.stat)}
        </span>
      )}
      {worn.enchantId !== null && (
        <span class="muted gear-main"> · {enchantName(worn.enchantId)}</span>
      )}
    </p>
  );
}

/**
 * A read-only worn-item line: the framed sprite and the words, as on a creature card (whose slot
 * button wraps the same two parts). The living room's popover uses it for the creature's item.
 */
export function WornItemLine({ worn }: { worn: WornItem }) {
  return (
    <div class="gear-line worn-item-line">
      <WornItemFrame worn={worn} />
      <WornItemText worn={worn} />
    </div>
  );
}
