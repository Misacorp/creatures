/**
 * The "pile" of a reward screen as a pure list: one icon for each KIND of reward earned, however
 * much of it there is. It is deliberately plain and open to growth: a new kind of reward (supplies,
 * a new currency) is one more `if` in `rewardPileItems` and one more icon case in `RewardPile`.
 * Nothing here touches the DOM.
 */
import { PART_KINDS, supplyDef, type PartKind } from '@creatures/game';
import type { PartsBundle } from './gear-types';

/** The icon of one pile item: a bundled glyph, a part, or a gear item's art. */
export type PileIcon =
  | { kind: 'glyph'; id: string }
  | { kind: 'part'; part: PartKind }
  | { kind: 'gear'; baseId: string };

interface PileItem {
  /** Unique within a pile: the kind of reward ("scrap", "essence", "gear"). */
  key: string;
  icon: PileIcon;
}

/** What the pile is built from. Every field is optional; zero and absent mean "none of it". */
export interface PileSource {
  /** Gear items earned: one icon for all of them, drawn from the first. */
  gear?: readonly { baseId: string }[];
  parts?: PartsBundle;
  /** Supply ids earned (expedition supplies): one icon for each KIND of supply, whatever the tier or amount. */
  supplies?: readonly string[];
  essence?: number;
  bait?: number;
}

/**
 * The kinds of reward in a source, in a fixed order: gear, then parts in the order of the part kinds
 * (Scrap first), then supplies, then Essence, then Bait. A kind appears once, however many were earned, and only
 * if at least one was. Supplies come after the parts, one icon for each kind of supply (a Lure, a Map
 * scrap, a Lantern, a Satchel).
 */
export function rewardPileItems(source: PileSource): PileItem[] {
  const items: PileItem[] = [];
  const seen = new Set<string>();
  const add = (item: PileItem): void => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    items.push(item);
  };
  const firstGear = source.gear?.[0];
  if (firstGear !== undefined) {
    add({ key: 'gear', icon: { kind: 'gear', baseId: firstGear.baseId } });
  }
  for (const part of PART_KINDS) {
    if ((source.parts?.[part] ?? 0) > 0) add({ key: part, icon: { kind: 'part', part } });
  }
  for (const id of source.supplies ?? []) {
    const kind = supplyDef(id)?.kind;
    if (kind !== undefined) add({ key: `supply-${kind}`, icon: { kind: 'glyph', id: kind } });
  }
  if ((source.essence ?? 0) > 0) add({ key: 'essence', icon: { kind: 'glyph', id: 'gem' } });
  if ((source.bait ?? 0) > 0) add({ key: 'bait', icon: { kind: 'glyph', id: 'bait' } });
  return items;
}
