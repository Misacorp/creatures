import { partBadge } from './count-items';
import { CountBadge } from './ui/CountBadge';
import { GameIcon } from './ui/GameIcon';
import { Tag } from './ui/Tag';
import { GLOSSARY_IDS, PART_KINDS, gearBase, tagElement, type PartKind } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { GlossaryTag } from './Glossary';
import { itemArt } from './gear-sprites';
import { isFestivalBase, itemSet, partName, partsEntries, rarityName, slotName } from './gear-view';
import { glyphOrUnknown } from './glyphs';
import { capitalize, elementName } from './game';
import type { GearRarity, GearSlot, PartsBundle } from './gear-types';
import { Sprite } from './sprites/Sprite';

/** An item's pixel sprite (12x12), tinted by its element. Decorative unless `alt` is given. */
export function ItemSprite({
  baseId,
  scale = 3,
  alt,
  class: extra,
}: {
  baseId: string;
  scale?: number;
  alt?: string;
  class?: string;
}) {
  const art = itemArt(baseId);
  return (
    <Sprite
      sprite={art.sprite}
      scale={scale}
      {...(art.palette === undefined ? {} : { palette: art.palette })}
      {...(alt === undefined ? {} : { alt })}
      {...(extra === undefined ? {} : { class: extra })}
    />
  );
}

/**
 * An item's level, the one way it is shown everywhere: a small pixel "Lv 15" in the bottom-right corner of the
 * item's image (outlined so it reads on any item colour). The creature's level keeps its own yellow badge, so
 * the two never look alike. The printed label is hidden from assistive technology: whatever holds the image
 * says the item level in its own spoken label or after the item's name.
 */
export function ItemLevel({ level }: { level: number }) {
  return (
    <span class="item-lv pix" aria-hidden="true">
      Lv {level}
    </span>
  );
}

/**
 * The two corners of an item's image, the one way they are drawn everywhere an item level shows: the slot's
 * icon at the top left (`SlotIcon`) and the item level at the bottom right (`ItemLevel`). The slot comes from
 * the item's base; an unknown base shows only the level. Put it inside the positioned box that holds the
 * sprite (an `ItemFrame` does this itself, a picker cell or a creature page slot places it by hand).
 */
export function ItemCorners({ level, baseId }: { level: number; baseId: string }) {
  const slot = gearBase(baseId)?.slot;
  return (
    <>
      {slot !== undefined && <SlotIcon slot={slot} class="item-slot" />}
      <ItemLevel level={level} />
    </>
  );
}

/**
 * The frame around an item sprite: one single border in the rarity colour and, when the level is known, the
 * item's corners (`ItemCorners`: the slot's icon at the top left, the item level at the bottom right). Rarity is the border colour (and a rarity badge where there is
 * room), never pips. A Festival piece (it is a base, not a rarity: pass its `baseId`) also gets a
 * lantern-gold dashed outline.
 */
export function ItemFrame({
  rarity,
  baseId,
  level,
  children,
  class: extra,
}: {
  rarity: GearRarity;
  baseId?: string;
  /** The item's level; leave out when the item does not exist yet (a blueprint) or the level is not known. */
  level?: number;
  children: ComponentChildren;
  class?: string;
}) {
  const festival = baseId !== undefined && isFestivalBase(baseId);
  return (
    <span
      class={`item-frame rarity-${rarity}${festival ? ' festival' : ''}${extra === undefined ? '' : ` ${extra}`}`}
    >
      {children}
      {level !== undefined &&
        (baseId === undefined ? (
          <ItemLevel level={level} />
        ) : (
          <ItemCorners level={level} baseId={baseId} />
        ))}
    </span>
  );
}

/**
 * The square picture of an item: its sprite in the rarity frame with the item level in the corner. The one
 * way a piece is drawn small (a row, a grid of items to take apart, a worn slot, the item card's head).
 * `itemLevel` is left out for a piece stored before items had levels.
 */
export function ItemThumb({
  item,
  scale,
  class: extra,
}: {
  item: { baseId: string; rarity: GearRarity; itemLevel?: number | undefined };
  scale: number;
  class?: string;
}) {
  return (
    <ItemFrame
      rarity={item.rarity}
      baseId={item.baseId}
      {...(item.itemLevel === undefined ? {} : { level: item.itemLevel })}
      {...(extra === undefined ? {} : { class: extra })}
    >
      <ItemSprite baseId={item.baseId} scale={scale} />
    </ItemFrame>
  );
}

/** A gear slot's silhouette (a cap, a scarf, a charm). Decoration: the slot is also said in words. */
export function SlotIcon({ slot, class: extra }: { slot: GearSlot; class?: string }) {
  return (
    <Sprite
      sprite={glyphOrUnknown(`slot-${slot}`)}
      scale={2}
      {...(extra === undefined ? {} : { class: extra })}
    />
  );
}

/** The slot as a badge next to the rarity: its icon and name ("Hat"). Tapping it explains the slot. */
export function SlotTag({ slot, plain = false }: { slot: GearSlot; plain?: boolean }) {
  return (
    <Tag {...(plain ? {} : { entry: GLOSSARY_IDS.gearSlot(slot) })} class="item-badge slot-tag pix">
      <SlotIcon slot={slot} />
      {slotName(slot)}
    </Tag>
  );
}

/**
 * An item's tag as a badge: its element (the element's icon and name, "Ember"), its role ("Guard", a role
 * Charm) or "Explorer" (the Compass). Tapping it says what the tag means on an item (its lines lean that
 * way, who can wear it), not what an element means for a creature. A neutral base has no badge.
 */
export function GearTagBadge({ baseId, plain = false }: { baseId: string; plain?: boolean }) {
  const tag = gearBase(baseId)?.tag;
  if (tag === undefined || tag === 'neutral') return null;
  const element = tagElement(tag);
  return (
    <Tag
      {...(plain ? {} : { entry: GLOSSARY_IDS.gearTag(tag) })}
      class="item-badge gear-tag-badge pix"
    >
      {element !== null && <GameIcon icon={{ kind: 'element', element }} scale={2} />}
      {element !== null ? elementName(element) : capitalize(tag)}
    </Tag>
  );
}

/**
 * A gear set piece's set as a badge ("Tidepool Finery"). Tapping it explains the set: what two and three pieces
 * give. A base in no set has none.
 */
export function SetTag({ baseId, plain = false }: { baseId: string; plain?: boolean }) {
  const set = itemSet(baseId);
  if (set === undefined) return null;
  return (
    <Tag {...(plain ? {} : { entry: GLOSSARY_IDS.gearSet(set.id) })} class="item-badge set-tag pix">
      {set.name}
    </Tag>
  );
}

/** "Festival", for a Festival piece: it explains what makes the piece special (and that it is not stronger). */
export function FestivalTag() {
  return (
    <Tag entry="gear-festival" class="festival-tag">
      Festival
    </Tag>
  );
}

/**
 * The rarity as a small badge in the pixel font and the rarity's colour ("Rare"). Tappable (it opens the
 * rarity's explanation) unless `plain`, which a badge inside a dialog or a button should be.
 */
export function RarityTag({ rarity, plain = false }: { rarity: GearRarity; plain?: boolean }) {
  return (
    <Tag
      {...(plain ? {} : { entry: GLOSSARY_IDS.gearRarity(rarity) })}
      class={`item-badge rarity-tag pix rarity-${rarity}`}
    >
      {rarityName(rarity)}
    </Tag>
  );
}

/** A part icon with its number. The name is spoken; the icon never carries the meaning alone. */
export function PartCount({
  kind,
  amount,
  tag = true,
  bare = false,
}: {
  kind: PartKind;
  amount: number;
  /** False inside a button, where a tag cannot sit. */
  tag?: boolean;
  /** Still tappable for its help, with no "?" after it (a found part). */
  bare?: boolean;
}) {
  const { entry, ...badge } = partBadge(kind, amount);
  return <CountBadge {...badge} {...(tag && entry !== undefined ? { entry, bare } : {})} />;
}

/** All the parts a player holds, as icons with numbers (zero counts included, so the row never jumps). */
export function PartsRow({ parts }: { parts: Readonly<Record<PartKind, number>> }) {
  return (
    <ul class="parts-row" aria-label="Parts">
      {PART_KINDS.map((kind) => (
        <li key={kind} class={parts[kind] === 0 ? 'none' : undefined}>
          <PartCount kind={kind} amount={parts[kind]} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A price: each part with the amount needed, and a note in words when the player has too little
 * (the colour is only a second cue).
 */
export function CostList({
  cost,
  have,
  essence,
  essenceHave,
}: {
  cost: PartsBundle;
  have: Readonly<Record<PartKind, number>>;
  /** Essence the action also costs; leave out when it costs none. */
  essence?: number;
  essenceHave?: number;
}) {
  const short = (need: number, held: number): boolean => held < need;
  return (
    <ul class="cost-list" aria-label="Cost">
      {essence !== undefined && (
        <li class={short(essence, essenceHave ?? 0) ? 'short' : undefined}>
          <GlossaryTag entry="essence">{String(essence)} Essence</GlossaryTag>
          {short(essence, essenceHave ?? 0) && <span class="visually-hidden"> (not enough)</span>}
        </li>
      )}
      {partsEntries(cost).map(({ kind, amount }) => {
        const lacking = short(amount, have[kind]);
        return (
          <li key={kind} class={lacking ? 'short' : undefined}>
            <PartCount kind={kind} amount={amount} tag={false} />
            <span class="cost-name">{partName(kind)}</span>
            {lacking && <span class="visually-hidden"> (not enough)</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Parts as icons with their names and amounts (what a dismantle returns), with no price styling. */
export function PartsList({ parts }: { parts: PartsBundle }) {
  return (
    <ul class="cost-list" aria-label="Parts">
      {partsEntries(parts).map(({ kind, amount }) => (
        <li key={kind}>
          <PartCount kind={kind} amount={amount} tag={false} />
          <span class="cost-name">{partName(kind)}</span>
        </li>
      ))}
    </ul>
  );
}
