import type { ComponentChildren } from 'preact';
import { FestivalTag, ItemThumb, RarityTag } from './GearArt';
import type { GearRarity, LootPiece } from './gear-types';
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
      <ItemThumb
        item={{ baseId, rarity, itemLevel: level }}
        scale={scale}
        {...(motion ? { class: 'pop-in' } : {})}
      />
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

/**
 * A list of gear pieces as compact rows (`ItemRow`, the image popping in when motion is allowed), named for
 * assistive technology. A piece that has an `id` is keyed by it; one without (a chest's gear) by its place.
 */
export function GearRows({
  pieces,
  label,
}: {
  pieces: readonly (LootPiece & { id?: string })[];
  label: string;
}) {
  return (
    <ul class="loot-items" aria-label={label}>
      {pieces.map((g, i) => (
        <ItemRow key={g.id ?? i} baseId={g.baseId} rarity={g.rarity} level={g.itemLevel} motion />
      ))}
    </ul>
  );
}
