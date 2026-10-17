import { CountBadge, type CountBadgeProps, type CountItem } from './ui/CountBadge';
import { GameIcon } from './ui/GameIcon';
import { Tag } from './ui/Tag';
import { GLOSSARY_IDS, PART_KINDS, type PartKind } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { GlossaryTag } from './Glossary';
import { itemArt } from './gear-sprites';
import { isFestivalBase, partName, partsEntries, rarityName, slotName } from './gear-view';
import { glyphOrUnknown } from './glyphs';
import { elementName } from './game';
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
 * The frame around an item sprite: one single border in the rarity colour and, when the level is known, the
 * item level in the corner (`ItemLevel`). Rarity is the border colour (and a rarity badge where there is
 * room), never pips. A Festival piece (it is a base, not a rarity: pass its `baseId`) also gets a
 * lantern-gold dashed outline.
 */
export function ItemFrame({
  rarity,
  baseId,
  level,
  slot,
  children,
  class: extra,
}: {
  rarity: GearRarity;
  baseId?: string;
  /** The item's level; leave out when the item does not exist yet (a blueprint) or the level is not known. */
  level?: number;
  /** The item's slot, as a small icon in the top-left corner: where a list mixes slots (the bag). */
  slot?: GearSlot;
  children: ComponentChildren;
  class?: string;
}) {
  const festival = baseId !== undefined && isFestivalBase(baseId);
  return (
    <span
      class={`item-frame rarity-${rarity}${festival ? ' festival' : ''}${extra === undefined ? '' : ` ${extra}`}`}
    >
      {children}
      {slot !== undefined && <SlotIcon slot={slot} class="item-slot" />}
      {level !== undefined && <ItemLevel level={level} />}
    </span>
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
 * An item's element tag as a badge (the element's icon and name, "Ember"). Tapping it says what the
 * element means on an item (its lines lean that way), not what it means for a creature.
 */
export function GearElementTag({ element, plain = false }: { element: string; plain?: boolean }) {
  return (
    <Tag
      {...(plain ? {} : { entry: GLOSSARY_IDS.gearElement(element) })}
      class="item-badge element-tag pix"
    >
      <GameIcon icon={{ kind: 'element', element }} scale={2} />
      {elementName(element)}
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

/** The count badge of one kind of part, with the part's name spoken. */
function partBadge(kind: PartKind, amount: number): CountBadgeProps {
  return {
    icon: { kind: 'part', part: kind },
    amount,
    label: partName(kind),
    entry: GLOSSARY_IDS.part(kind),
  };
}

/** The count badges of a bundle of parts, in the order of the part kinds, without the empty ones. */
export function partCountItems(parts: PartsBundle): CountItem[] {
  return partsEntries(parts).map(({ kind, amount }) => ({ key: kind, ...partBadge(kind, amount) }));
}

/** A part icon with its number. The name is spoken; the icon never carries the meaning alone. */
export function PartCount({
  kind,
  amount,
  tag = true,
}: {
  kind: PartKind;
  amount: number;
  /** False inside a button, where a tag cannot sit. */
  tag?: boolean;
}) {
  const { entry, ...badge } = partBadge(kind, amount);
  return <CountBadge {...badge} {...(tag && entry !== undefined ? { entry } : {})} />;
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
