/**
 * What the item picker says, as plain functions: the short reason an item cannot be worn, the rows of an
 * item's base stats, and which item the grid selects first. Pure; the picker components only draw it. The
 * wear rule itself is the game's (`wearReason`); nothing here decides what a creature may wear.
 */
import type { Creature } from '../api';
import type { GearItem, GearStat } from '../gear-types';
import { equipChoices, wearReason, type EquipChoice } from '../gear-view';

/** The reason in as few words as fit under a cell: "Needs Lv 16", "Guards only". */
export function compactReason(
  item: Pick<GearItem, 'slot' | 'tag' | 'itemLevel' | 'needs'>,
  creature: Pick<Creature, 'level' | 'species'>,
): string | null {
  const reason = wearReason(item, creature);
  if (reason === null) return null;
  // The game's own sentences: "Guards only.", "Needs creature level 16.", "Scarfs open at level 7."
  if (reason.endsWith(' only.')) return reason.slice(0, -1);
  return `Needs Lv ${String(item.needs.level)}`;
}

/** One row of an item's base stats: "Attack", the base number, and the bonus its local lines add. */
export interface StatRow {
  stat: GearStat['stat'];
  /** The stat's name ("Attack", "HP", "Crit chance"). */
  label: string;
  /** The base type's number as the server wrote it ("26"; a crit stat "4.4 pt"). */
  base: string;
  /** What the item's local lines add on top ("+15"); null when they add nothing. */
  bonus: string | null;
}

/**
 * The base-stat rows of an item: the server's own text is cut at its number ("Attack 41" is the name
 * "Attack" and the total 41), and for Attack and HP the total is shown as the base number and the local
 * bonus after it ("Attack 26 +15", "HP 32"). A stat whose numbers are not plain integers (the crit stats,
 * in points) keeps the server's whole text, with no split.
 */
export function statRows(stats: readonly GearStat[]): StatRow[] {
  return stats.map((s) => {
    const cut = /^(.*?)\s+(-?\d+)$/.exec(s.text);
    const label = cut?.[1];
    if ((s.stat === 'atk' || s.stat === 'hp') && label !== undefined) {
      const extra = s.value - s.base;
      return {
        stat: s.stat,
        label,
        base: String(s.base),
        bonus: extra > 0 ? `+${String(extra)}` : null,
      };
    }
    const words = /^(.*?)\s+(\S+(?:\s+pt)?)$/.exec(s.text);
    return { stat: s.stat, label: words?.[1] ?? s.text, base: words?.[2] ?? '', bonus: null };
  });
}

/** The picker's choices for a slot: the bag's items (not the worn one) with who wears them and why not. */
export function pickerChoices(
  items: readonly GearItem[],
  creature: Pick<Creature, 'id' | 'level' | 'species'>,
  creatures: readonly Creature[],
  slot: GearItem['slot'],
): EquipChoice[] {
  return equipChoices(items, creature, creatures, slot);
}

/** The item to select first in the grid: the best one this creature can wear (the first), else the first. */
export function firstPick(choices: readonly EquipChoice[]): string | null {
  return (choices.find((c) => c.blocked === null) ?? choices[0])?.item.id ?? null;
}
