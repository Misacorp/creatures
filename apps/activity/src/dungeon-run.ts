/**
 * What the screens of an open run need, as pure functions: the pack as count badges, the state of a
 * creature's tile, the camp's row order and the acts it builds, and the options of the swap picker.
 * Nothing here touches the DOM or the network; the server checks every act again.
 */
import type { Creature } from './api';
import type { DungeonAct, DungeonPack, DungeonRunCreature } from './dungeon-types';
import { creatureName, getSpecies } from './game';
import type { IconRef } from './icon-ref';
import type { CountItem } from './ui/CountBadge';
import type { PickerOption } from './roster-picker';

/** The pack as count badges (icon, number, name), without the empty kinds. */
export function packItems(pack: DungeonPack): CountItem[] {
  const items: CountItem[] = [];
  if (pack.bait > 0) {
    items.push({
      key: 'bait',
      icon: { kind: 'glyph', id: 'bait' },
      amount: pack.bait,
      label: 'Bait',
      name: 'Bait',
    });
  }
  if (pack.essence > 0) {
    items.push({
      key: 'essence',
      icon: { kind: 'glyph', id: 'gem' },
      amount: pack.essence,
      label: 'Essence',
      name: 'Essence',
    });
  }
  if (pack.scrap > 0) {
    items.push({
      key: 'scrap',
      icon: { kind: 'part', part: 'scrap' },
      amount: pack.scrap,
      label: 'Scrap',
      name: 'Scrap',
    });
  }
  return items;
}

/** The pack as icons with numbers only (no names), without the empty kinds: for a line that must stay short. */
export function packBadges(pack: DungeonPack): CountItem[] {
  return packKinds(pack, pack).map(({ key, icon, label, found }) => ({
    key,
    icon,
    amount: found,
    label,
  }));
}

/** One kind of the pack with what was found and what came home. */
export interface PackKind {
  key: 'bait' | 'essence' | 'scrap';
  icon: IconRef;
  label: string;
  found: number;
  kept: number;
}

const PACK_ICON: Readonly<Record<PackKind['key'], { icon: IconRef; label: string }>> = {
  bait: { icon: { kind: 'glyph', id: 'bait' }, label: 'Bait' },
  essence: { icon: { kind: 'glyph', id: 'gem' }, label: 'Essence' },
  scrap: { icon: { kind: 'part', part: 'scrap' }, label: 'Scrap' },
};

/** The kinds the pack held (what was found), with what of each was kept. Empty when nothing was found. */
export function packKinds(found: DungeonPack, kept: DungeonPack): PackKind[] {
  return (['bait', 'essence', 'scrap'] as const)
    .filter((key) => found[key] > 0)
    .map((key) => ({ key, ...PACK_ICON[key], found: found[key], kept: kept[key] }));
}

/** How a creature's tile reads: knocked out, hurt (under a third of its HP) or fine. */
export function tileState(creature: Pick<DungeonRunCreature, 'hp' | 'hpMax'>): 'ko' | 'low' | 'ok' {
  if (creature.hp <= 0) return 'ko';
  return creature.hp * 3 < creature.hpMax ? 'low' : 'ok';
}

/** The spoken name of a tile: "Sproutle, level 12: 240 / 281 HP." or "..., knocked out." */
export function tileLabel(creature: DungeonRunCreature): string {
  const base = `${creature.name}, level ${String(creature.level)}`;
  return creature.hp <= 0
    ? `${base}: knocked out.`
    : `${base}: ${String(creature.hp)} / ${String(creature.hpMax)} HP.`;
}

// --- The camp: the row's order ---

/** The ids of the row, left to right. */
export function rowIds(team: readonly { id: string }[]): string[] {
  return team.map((c) => c.id);
}

/** The order with `id` moved one place to the left (-1) or the right (1); the same order at an end. */
export function moveInOrder(order: readonly string[], id: string, step: -1 | 1): string[] {
  const from = order.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  next[from] = order[to] as string;
  next[to] = id;
  return next;
}

/** Whether two orders are the same. */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** The order as the act wants it (exactly three ids), or undefined for anything else. */
export function asOrder(order: readonly string[]): [string, string, string] | undefined {
  const [a, b, c] = order;
  return order.length === 3 && a !== undefined && b !== undefined && c !== undefined
    ? [a, b, c]
    : undefined;
}

type CampAct = Extract<DungeonAct, { type: 'camp' }>;

/** The camp act for Rest, with the row's order (always sent: the server takes a permutation of the row). */
export function restAct(order: readonly string[]): CampAct {
  const sent = asOrder(order);
  return { type: 'camp', choice: 'rest', ...(sent === undefined ? {} : { order: sent }) };
}

/** The camp act for taking one of the two keepsakes. */
export function keepsakeAct(order: readonly string[], keepsake: string): CampAct {
  const sent = asOrder(order);
  return {
    type: 'camp',
    choice: 'keepsake',
    keepsake,
    ...(sent === undefined ? {} : { order: sent }),
  };
}

/** The camp act for a swap: `out` leaves the row, `incoming` (one of the player's own) takes its place. */
export function swapAct(order: readonly string[], out: string, incoming: string): CampAct {
  const sent = asOrder(order);
  return {
    type: 'camp',
    choice: 'swap',
    out,
    in: incoming,
    ...(sent === undefined ? {} : { order: sent }),
  };
}

// --- The camp: the swap picker ---

/** Why a creature cannot be brought in. */
export const AWAY_REASON = 'Away on an expedition';

/**
 * The options of the picker for who comes in: every creature the player owns that is not in the row,
 * highest level first (then by name). One that is away on an expedition stays in the list with its
 * reason; the server decides in the end.
 */
export function swapOptions(
  creatures: readonly Creature[],
  inRow: readonly string[],
): PickerOption[] {
  return creatures
    .filter((c) => !inRow.includes(c.id))
    .map((c): PickerOption => {
      const species = getSpecies(c.species);
      return {
        id: c.id,
        name: creatureName(c),
        species: c.species,
        level: c.level,
        element: species?.element ?? 'unknown',
        role: species?.role ?? '',
        onBoard: false,
        disabled: c.away ? AWAY_REASON : null,
        effect: null,
        recommended: false,
      };
    })
    .sort(
      (a, b) =>
        (a.disabled === null ? 0 : 1) - (b.disabled === null ? 0 : 1) ||
        b.level - a.level ||
        a.name.localeCompare(b.name) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/** Whether the player has anyone to bring in (a creature outside the row that is not away). */
export function canSwapIn(creatures: readonly Creature[], inRow: readonly string[]): boolean {
  return swapOptions(creatures, inRow).some((o) => o.disabled === null);
}
