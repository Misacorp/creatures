import type { ComponentChildren, Ref } from 'preact';
import type { CardDiff } from './creature-page/compare-diff';
import { statRows } from './creature-page/picker-view';
import { FestivalTag, GearTagBadge, ItemThumb, RarityTag, SetTag, SlotTag } from './GearArt';
import type { GearItem } from './gear-types';
import { gearName, isFestivalBase, itemSet, setBonusRows, setCountText } from './gear-view';
import { DeltaMark, ItemLines } from './ItemLines';

/** What the card needs of an item: the part of a `GearItem` that is drawn. */
export type ItemCardItem = Pick<
  GearItem,
  'baseId' | 'slot' | 'rarity' | 'itemLevel' | 'stats' | 'lines'
>;

/**
 * An item's full details, the one layout wherever they show (the Workshop's item card, the picker's
 * detail panel): the item's image at the top left (rarity border, item level in its corner), to its right the
 * name (in its rarity's colour), small badges for the slot, rarity and tag (element, role or explorer), and the base stats, one row each in the same size ("Attack 14", "HP 24", the
 * bonus its own lines add after it: "Attack 41 +22"); then a full-width divider and the modifiers with their
 * values and tier pips. Everything is in the pixel font, set once on the card (`.pix-panel`). A Charm has no stats, so it is name, badge, divider,
 * modifiers. `aside` is a spot at the top right (a button), `note` a line under the badge.
 */
export function ItemCard({
  item,
  nameId,
  nameRef,
  heading = false,
  plainRarity = false,
  spriteScale = 5,
  aside,
  note,
  wornInSet = 0,
  diff,
  class: extra,
}: {
  item: ItemCardItem;
  /** The id of the name, for a section that is labelled by it. */
  nameId?: string;
  /** With `heading`: focus goes to the name when another item is chosen. */
  nameRef?: Ref<HTMLHeadingElement>;
  /** The name is a heading (h3) that can take focus; otherwise it is a plain line. */
  heading?: boolean;
  /** The badges cannot be tapped (inside a dialog). */
  plainRarity?: boolean;
  spriteScale?: number;
  aside?: ComponentChildren;
  note?: ComponentChildren;
  /** How many pieces of the item's set its wearer has (with this one on, if it is not worn yet); 0 when nobody wears it. */
  wornInSet?: number;
  /** The picker's compare: this item against the one worn in its slot, shown inline (stat rows and lines). */
  diff?: CardDiff;
  class?: string;
}) {
  const rows = statRows(item.stats);
  const name = gearName(item.baseId);
  const set = itemSet(item.baseId);
  const nameClass = `idc-name rarity-name rarity-${item.rarity}`;
  return (
    <div class={`idc pix-panel${extra === undefined ? '' : ` ${extra}`}`}>
      <div class="idc-head">
        <ItemThumb item={item} scale={spriteScale} class="big" />
        <div class="idc-info">
          {heading ? (
            <h3
              class={nameClass}
              {...(nameId === undefined ? {} : { id: nameId })}
              tabIndex={-1}
              {...(nameRef === undefined ? {} : { ref: nameRef })}
            >
              {name}
              <span class="visually-hidden">, item level {item.itemLevel}</span>
            </h3>
          ) : (
            <p class={nameClass} {...(nameId === undefined ? {} : { id: nameId })}>
              {name}
              <span class="visually-hidden">, item level {item.itemLevel}</span>
            </p>
          )}
          <p class="idc-badge">
            <SlotTag slot={item.slot} plain={plainRarity} />
            <RarityTag rarity={item.rarity} plain={plainRarity} />
            <GearTagBadge baseId={item.baseId} plain={plainRarity} />
            <SetTag baseId={item.baseId} plain={plainRarity} />
            {isFestivalBase(item.baseId) && <FestivalTag />}
          </p>
          {note}
          {(rows.length > 0 || (diff?.goneStats.length ?? 0) > 0) && (
            <ul class="idc-stats" aria-label="Base stats">
              {rows.map((row) => (
                <li key={row.stat}>
                  <span class="idc-stat-label">{row.label}</span> <span>{row.base}</span>
                  {row.bonus !== null && (
                    <>
                      {' '}
                      <span
                        class="idc-stat-bonus"
                        aria-label={`plus ${row.bonus.slice(1)} from its lines`}
                      >
                        {row.bonus}
                      </span>
                    </>
                  )}
                  {(() => {
                    const mark = diff?.stats.get(row.stat);
                    return mark === undefined ? null : (
                      <>
                        {' '}
                        <DeltaMark mark={mark} />
                      </>
                    );
                  })()}
                </li>
              ))}
              {diff?.goneStats.map((gone) => (
                <li key={`gone-${gone.stat}`} class="cmp-gone">
                  <span aria-hidden="true">{gone.text}</span>
                  <span class="visually-hidden">{gone.spoken}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {aside !== undefined && <div class="idc-aside">{aside}</div>}
      </div>
      {(item.lines.length > 0 || (diff?.goneLines.length ?? 0) > 0) && (
        <>
          <hr class="idc-divider" />
          <ItemLines lines={item.lines} {...(diff === undefined ? {} : { diff })} />
        </>
      )}
      {set !== undefined && (
        <section class="idc-set" aria-label={`${set.name} set`}>
          <p class="idc-set-head">
            <span class="idc-set-name">{set.name}</span>{' '}
            <span class="idc-set-count" aria-label={`${String(wornInSet)} pieces worn`}>
              {setCountText(wornInSet)}
            </span>
          </p>
          <ul class="idc-set-list">
            {setBonusRows(set, wornInSet).map((row) => (
              <li key={row.pieces} class={row.active ? 'on' : 'off'}>
                <span class="idc-set-pieces">{row.pieces} pieces</span> {row.text}
                {row.active && <span class="visually-hidden"> (active)</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
