import type { ComponentChildren } from 'preact';
import { useContext, useRef } from 'preact/hooks';
import { gearBase } from '@creatures/game';
import { FestivalTag, ItemThumb, RarityTag, SlotTag } from '../GearArt';
import type { GearRarity, LootPiece } from '../gear-types';
import { GearItemsContext } from '../gear-items-context';
import { gearName, isFestivalBase, itemLabel, rarityName } from '../gear-view';
import { ItemCard } from '../ItemCard';
import { usePopoverTrigger } from '../PopoverHost';
import { FindList, FindRow } from './FindRow';
import { Tag } from './Tag';

/** A mouse or pen that can hover (a finger cannot, and taps instead). */
const canHover = (event: PointerEvent): boolean =>
  event.pointerType !== 'touch' &&
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * A gear piece that was found or gained, as one compact row (`FindRow`): its image with the rarity border
 * and the item level in the corner, its name in the rarity's colour, a small rarity badge, the slot's badge
 * ("Hat": what the piece is for) and "Festival" for a Festival piece. No stats: the full details are
 * `ItemCard`. `level` is left out for a grant stored before items had levels. `children` is an extra word or
 * two after the badges. A creature's worn gear is `GearList` (the same rows, no slot badge: the row is the slot).
 */
export function FindItem({
  id,
  baseId,
  rarity,
  level,
  motion = false,
  scale = 4,
  children,
}: {
  /**
   * The inventory item's id. With it, and the item in the loaded gear view (`GearItemsContext`), the row is
   * one button: a tap opens the full `ItemCard` in a popover, and so does hovering with a mouse. Without it
   * (a piece with no id of its own: a chest's banked gear) or before the gear view has loaded, the row is
   * plain.
   */
  id?: string | undefined;
  baseId: string;
  rarity: GearRarity;
  level?: number | undefined;
  /** The image pops in when motion is allowed (loot reveals). */
  motion?: boolean;
  scale?: number;
  children?: ComponentChildren;
}) {
  const slot = gearBase(baseId)?.slot;
  const items = useContext(GearItemsContext);
  const item = id === undefined ? undefined : items.find((i) => i.id === id);
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  // Opened by hovering: leaving closes it. A tap or Enter while it is open keeps it open (pinned).
  const hovered = useRef(false);
  const button =
    item === undefined || host === null
      ? undefined
      : {
          label: `${itemLabel(item.baseId, item.itemLevel)}, ${rarityName(item.rarity)}. Details`,
          expanded: open,
          ref,
          onClick: () => {
            if (ref.current === null) return;
            if (hovered.current && open) {
              hovered.current = false;
              return;
            }
            hovered.current = false;
            host.openCustom(`find-item:${item.id}`, ref.current, {
              label: gearName(item.baseId),
              body: <ItemCard item={item} plainRarity />,
            });
          },
          onPointerEnter: (event: PointerEvent) => {
            if (ref.current === null || !canHover(event) || host.anchor !== null) return;
            hovered.current = true;
            host.openCustom(`find-item:${item.id}`, ref.current, {
              label: gearName(item.baseId),
              body: <ItemCard item={item} plainRarity />,
            });
          },
          onPointerLeave: (event: PointerEvent) => {
            if (event.pointerType === 'touch' || !hovered.current) return;
            hovered.current = false;
            host.close();
          },
        };
  const plain = button !== undefined;
  return (
    <FindRow
      button={button}
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
          <RarityTag rarity={rarity} plain={plain} />
          {slot !== undefined && <SlotTag slot={slot} plain={plain} />}
          {isFestivalBase(baseId) &&
            (plain ? <Tag class="festival-tag">Festival</Tag> : <FestivalTag />)}
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
        <FindItem
          key={g.id ?? i}
          id={g.id}
          baseId={g.baseId}
          rarity={g.rarity}
          level={g.itemLevel}
          motion
        />
      ))}
    </FindList>
  );
}
