import type { ComponentChildren } from 'preact';
import { FestivalTag, ItemThumb, RarityTag } from '../GearArt';
import type { GearRarity, LootPiece } from '../gear-types';
import { gearName, isFestivalBase } from '../gear-view';
import { FindList, FindRow } from './FindRow';

/**
 * A gear piece that was found or gained, as one compact row (`FindRow`): its image with the rarity border
 * and the item level in the corner, its name in the rarity's colour and a small rarity badge (and "Festival"
 * for a Festival piece). No stats: the full details are `ItemCard`. `level` is left out for a grant stored
 * before items had levels. `children` is an extra word or two after the badge. A worn item uses the same row.
 */
export function FindItem({
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
    <FindRow
      image={
        <ItemThumb
          item={{ baseId, rarity, itemLevel: level }}
          scale={scale}
          {...(motion ? { class: 'pop-in' } : {})}
        />
      }
      name={
        <>
          {gearName(baseId)}
          {level !== undefined && <span class="visually-hidden">, item level {level}</span>}
        </>
      }
      nameClass={`rarity-name rarity-${rarity}`}
      tags={
        <>
          <RarityTag rarity={rarity} />
          {isFestivalBase(baseId) && <FestivalTag />}
        </>
      }
    >
      {children}
    </FindRow>
  );
}

/**
 * Gear pieces as a list of `FindItem`s (the image popping in when motion is allowed), named for assistive
 * technology. A piece that has an `id` is keyed by it; one without (a chest's gear) by its place.
 */
export function FindItems({
  pieces,
  label,
}: {
  pieces: readonly (LootPiece & { id?: string })[];
  label: string;
}) {
  return (
    <FindList label={label}>
      {pieces.map((g, i) => (
        <FindItem key={g.id ?? i} baseId={g.baseId} rarity={g.rarity} level={g.itemLevel} motion />
      ))}
    </FindList>
  );
}
