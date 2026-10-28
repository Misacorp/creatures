import type { ComponentChildren } from 'preact';
import { useContext, useRef } from 'preact/hooks';
import { EquipContext } from '../equip-from-card';
import { gearBase } from '@creatures/game';
import { FestivalTag, ItemThumb, RarityTag, SlotTag } from '../GearArt';
import type { GearItem, GearRarity, LootPiece } from '../gear-types';
import { GearItemsContext } from '../gear-items-context';
import { gearName, isFestivalBase, itemLabel, rarityName } from '../gear-view';
import { ItemCard } from '../ItemCard';
import { usePopoverTrigger } from '../PopoverHost';
import { FindList, FindRow } from './FindRow';
import { Tag } from './Tag';

/** How long a hover-opened popover stays after the mouse leaves, so the mouse can reach its button. */
const HOVER_CLOSE_MS = 200;

/**
 * The row whose popover is open because the mouse is on it (not pinned by a tap), across all rows: hovering
 * another row moves the popover there, and a row's late close never closes another row's popover.
 */
let hoverOpen: HTMLElement | null = null;

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
  card,
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
  /**
   * The full card handed over directly, for a piece the player does not own yet (a rare room's treasure:
   * the server's own card of the rolled piece). The row opens it like an owned one, but with no Equip button.
   * The rule: Equip appears only for a piece found by `id` in the player's own gear; a `card` is never
   * equippable. When both are given, `card` wins (and so no Equip).
   */
  card?: GearItem | undefined;
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
  const owned = id === undefined ? undefined : items.find((i) => i.id === id);
  const item = card ?? owned;
  const canEquip = card === undefined;
  const equip = useContext(EquipContext);
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  // Opened by hovering: leaving closes it. A tap or Enter while it is open keeps it open (pinned).
  const hovered = useRef(false);
  // Leaving the row (or the popover) closes a hover-opened popover after a moment, so the mouse can cross to
  // the popover's Equip button; entering either cancels it.
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLeave = (): void => {
    if (leaving.current !== null) clearTimeout(leaving.current);
    leaving.current = null;
  };
  const leaveSoon = (): void => {
    cancelLeave();
    leaving.current = setTimeout(() => {
      leaving.current = null;
      if (!hovered.current) return;
      hovered.current = false;
      if (hoverOpen === null || hoverOpen !== ref.current) return;
      hoverOpen = null;
      host?.close();
    }, HOVER_CLOSE_MS);
  };
  const popover = (shown: GearItem) => ({
    label: gearName(shown.baseId),
    body: (
      <div
        class="find-item-pop pop-stack"
        onPointerEnter={(event: PointerEvent) => {
          if (event.pointerType !== 'touch') cancelLeave();
        }}
        // A press inside (a line's help tag) pins it: the popover may change face and stay open.
        onPointerDown={() => {
          cancelLeave();
          hovered.current = false;
          if (hoverOpen === ref.current) hoverOpen = null;
        }}
        onPointerLeave={(event: PointerEvent) => {
          if (event.pointerType !== 'touch' && hovered.current) leaveSoon();
        }}
      >
        <ItemCard item={shown} plainRarity />
        {equip !== null && canEquip && (
          <div class="pop-actions">
            <button
              type="button"
              class="pop-action"
              onClick={() => {
                const from = ref.current;
                cancelLeave();
                hovered.current = false;
                hoverOpen = null;
                host?.close();
                equip.open(shown, from);
              }}
            >
              Equip
            </button>
          </div>
        )}
      </div>
    ),
  });
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
              hoverOpen = null;
              return;
            }
            hovered.current = false;
            if (hoverOpen === ref.current) hoverOpen = null;
            cancelLeave();
            host.openCustom(`find-item:${item.id}`, ref.current, popover(item));
          },
          onPointerEnter: (event: PointerEvent) => {
            if (ref.current === null || !canHover(event)) return;
            // Another popover that is open by a tap stays; one open by hovering moves here.
            if (host.anchor !== null && host.anchor !== hoverOpen) return;
            if (host.anchor === ref.current) {
              cancelLeave();
              return;
            }
            hovered.current = true;
            hoverOpen = ref.current;
            cancelLeave();
            host.openCustom(`find-item:${item.id}`, ref.current, popover(item));
          },
          onPointerLeave: (event: PointerEvent) => {
            if (event.pointerType === 'touch' || !hovered.current) return;
            leaveSoon();
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
