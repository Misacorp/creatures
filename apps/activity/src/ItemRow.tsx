import type { ComponentChildren } from 'preact';
import { FestivalTag, ItemFrame, ItemSprite, RarityTag } from './GearArt';
import type { GearRarity } from './gear-types';
import { gearName, isFestivalBase } from './gear-view';

/**
 * One item in a compact list (loot, rewards, grants, what a creature wears): its image on the left with the
 * rarity border and the item level in the corner, and on the right its name and a small rarity badge on one or two
 * lines. No stats: the full details are `ItemCard`. `level` is left out for a grant stored before items had levels.
 * `children` is an extra word or two after the badge (a slot name).
 */
export function ItemRow({
  baseId,
  rarity,
  level,
  motion = false,
  scale = 4,
  children,
}: {
  baseId: string;
  rarity: GearRarity;
  level?: number | undefined;
  /** The image pops in when motion is allowed (loot reveals). */
  motion?: boolean;
  scale?: number;
  children?: ComponentChildren;
}) {
  return (
    <li class="item-row">
      <ItemFrame
        rarity={rarity}
        baseId={baseId}
        {...(level === undefined ? {} : { level })}
        {...(motion ? { class: 'pop-in' } : {})}
      >
        <ItemSprite baseId={baseId} scale={scale} />
      </ItemFrame>
      <span class="item-row-text">
        <span class={`item-row-name pix rarity-name rarity-${rarity}`}>
          {gearName(baseId)}
          {level !== undefined && <span class="visually-hidden">, item level {level}</span>}
        </span>
        <span class="item-row-tags">
          <RarityTag rarity={rarity} />
          {isFestivalBase(baseId) && <FestivalTag />}
          {children}
        </span>
      </span>
    </li>
  );
}
