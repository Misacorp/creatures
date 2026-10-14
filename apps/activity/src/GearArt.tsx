import { Tag } from './ui/Tag';
import { GLOSSARY_IDS, PART_KINDS, type PartKind } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { GlossaryTag } from './Glossary';
import { itemArt, partIcon } from './gear-sprites';
import { partName, partsEntries, rarityName } from './gear-view';
import type { GearRarity, PartsBundle } from './gear-types';
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

/** The marks that tell the rarities apart without colour: one pip to three, and a star for Festival. */
const RARITY_MARK: Readonly<Record<GearRarity, string>> = {
  common: '●',
  rare: '●●',
  epic: '●●●',
  festival: '★',
};

/** The frame around an item sprite: each rarity has its own edge style and its own pips. */
export function ItemFrame({
  rarity,
  children,
  class: extra,
}: {
  rarity: GearRarity;
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <span class={`item-frame rarity-${rarity}${extra === undefined ? '' : ` ${extra}`}`}>
      {children}
      <span class="rarity-mark" aria-hidden="true">
        {RARITY_MARK[rarity]}
      </span>
    </span>
  );
}

/** The rarity as a tappable tag ("Rare"), with its explanation. */
export function RarityTag({ rarity }: { rarity: GearRarity }) {
  return (
    <Tag entry={GLOSSARY_IDS.gearRarity(rarity)} class={`rarity-tag rarity-${rarity}`}>
      {rarityName(rarity)}
    </Tag>
  );
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
  const body = (
    <>
      <Sprite sprite={partIcon(kind)} scale={2} />
      <span class="part-amount pix">{amount}</span>
    </>
  );
  return tag ? (
    <GlossaryTag
      entry={GLOSSARY_IDS.part(kind)}
      look="chip"
      class="part-count"
      label={`${partName(kind)}: ${String(amount)}`}
    >
      {body}
    </GlossaryTag>
  ) : (
    <span class="part-count" role="img" aria-label={`${partName(kind)}: ${String(amount)}`}>
      {body}
    </span>
  );
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
