/**
 * Position lines and the gifts a row makes (docs/design/gear-and-creatures-v2.md, 6.1 and 6.2): lines that
 * depend on where a creature stands, worked out when a fight input is built. A creature's neighbours and its
 * row are known only then, so its gear is folded again with a `Placement` (`applyGear`); the engine still
 * sees only numbers on `FightSlot.stats` and `FightSlot.mods`, and a stored fight replays exactly.
 *
 * "Its row" is a zone in the raid (Front, Middle, Back; the neighbours it has stop at the zone's edge, as
 * on the board), and the whole line in the dungeon and in the simulator's reference fights, where each of
 * the three zones is one slot. The caller says which with a `RowLayout` (the engine's `rowLayout` builds
 * both). Pure, deterministic, no randomness.
 */
import type { CritBonus, Element, Stats, Zone } from '../content/schema';
import { gearLine, gearSet } from '../content/gear';
import {
  applyGear,
  itemLines,
  setCounts,
  type FoldTalent,
  type GearItem,
  type GearMods,
  type GearRules,
  type Placement,
  type Wearer,
} from './gear-items';

/**
 * What one creature's fold needs, kept so it can be run again once its place is known: its effective
 * stats and crit bonus (level and fusion, before gear), who it is, and what it wears and holds.
 */
export interface FoldKit {
  stats: Stats;
  crit: CritBonus | undefined;
  wearer: Wearer;
  items: readonly GearItem[];
  talents: readonly FoldTalent[];
}

/** One slot of a row: its element, and its kit unless it is a guest (a guest is a neighbour, never changed). */
export interface RowMember {
  element: Element;
  kit?: FoldKit | undefined;
}

/**
 * How a row of `length` slots is cut. `rows` lists the slot indices of each row left to right (the raid's
 * zones, or one single line); `zones` is each slot's zone (Front, Middle, Back).
 */
export interface RowLayout {
  rows: readonly (readonly number[])[];
  zones: readonly Zone[];
}

/** A creature's numbers after its place is known. */
export interface PlacedFold {
  stats: Stats;
  crit: CritBonus | undefined;
  mods: GearMods | undefined;
  rules: GearRules;
}

/** The HP a creature's Lantern bearer lines give each creature beside it (basis points, added up). */
export function lanternGift(items: readonly GearItem[]): number {
  let total = 0;
  for (const item of items) {
    for (const line of itemLines(item)) {
      const def = gearLine(line.id);
      if (def?.effect.kind === 'position' && def.effect.rule === 'lantern') total += line.value;
    }
  }
  return total;
}

/** True when the items complete a set whose full bonus is a Shield Wall gift to the row (Lantern Night). */
export function giftsShieldWall(items: readonly GearItem[]): boolean {
  for (const [id, count] of setCounts(items)) {
    if (count >= 3 && gearSet(id)?.three.effect === 'rowShieldWall') return true;
  }
  return false;
}

/** True when a creature's own position lines or a gift from its row can change its fold. */
function matters(kit: FoldKit, placement: Placement): boolean {
  if (placement.lanternHpBp > 0) return true;
  if (placement.rowShieldWall > 0 && kit.wearer.role === 'guard') return true;
  return kit.items.some((item) =>
    item.lines.some((l) => {
      const kind = gearLine(l.id)?.effect.kind;
      return kind === 'position';
    }),
  );
}

/** The placement of slot `index` in a row: who stands beside it, what its row holds and what it is given. */
function placementOf(
  index: number,
  members: readonly RowMember[],
  layout: RowLayout,
): Placement | undefined {
  // Only slots that exist (a layout cut for a longer row never reaches a slot that is not there).
  const row = layout.rows.find((r) => r.includes(index))?.filter((i) => members[i] !== undefined);
  const zone = layout.zones[index];
  if (row === undefined || zone === undefined) return undefined;
  const at = row.indexOf(index);
  const sides = [row[at - 1], row[at + 1]].filter((i): i is number => i !== undefined);
  let lantern = 0;
  for (const i of sides) lantern += lanternGift(members[i]?.kit?.items ?? []);
  const wall = row.some((i) => giftsShieldWall(members[i]?.kit?.items ?? []));
  return {
    index: at,
    length: row.length,
    zone,
    beside: sides.map((i) => (members[i] as RowMember).element),
    rowElements: row.map((i) => (members[i] as RowMember).element),
    lanternHpBp: lantern,
    rowShieldWall: wall ? 1 : 0,
  };
}

/**
 * Folds every creature of a row again with its place, where that can change anything: a creature with a
 * position line, one beside a Lantern bearer, a Guard in a row that has Lantern Night. Every other entry is
 * undefined (keep the numbers the creature already has), so a row without position gear is untouched.
 * `members[i]` is slot `i` of the row the fight is built with.
 */
export function placeRow(
  members: readonly RowMember[],
  layout: RowLayout,
): (PlacedFold | undefined)[] {
  return members.map((member, i) => {
    const kit = member.kit;
    if (kit === undefined) return undefined;
    const placement = placementOf(i, members, layout);
    if (placement === undefined || !matters(kit, placement)) return undefined;
    return applyGear(kit.stats, kit.crit, { ...kit.wearer, placement }, kit.items, kit.talents);
  });
}
