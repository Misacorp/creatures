/**
 * What the screens of an open run need, as pure functions: the pack as count badges, the state of a
 * creature's tile, the camp's row order and the acts it builds, and the options of the swap picker.
 * Nothing here touches the DOM or the network; the server checks every act again.
 */
import type { PartKind } from '@creatures/game';
import type { Creature } from './api';
import { BAIT_ICON, ESSENCE_ICON } from './count-items';
import { ON_A_TRIP_REASON, partName } from './gear-view';
import { packShardEntries } from './dungeon-text';
import type { DungeonAct, DungeonPack, DungeonRunCreature } from './dungeon-types';
import { creatureName, getSpecies } from './game';
import type { IconRef } from './icon-ref';
import type { CountItem } from './ui/CountBadge';
import type { PickerOption } from './roster-picker';
import type { SlotHp } from './ui/SlotButton';

/** The pack as count badges (icon, number, name), without the empty kinds. */
export function packItems(pack: DungeonPack): CountItem[] {
  return packKinds(pack, pack).map(({ key, icon, label, found }) => ({
    key,
    icon,
    amount: found,
    label,
    name: label,
  }));
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
  key: 'bait' | 'essence' | 'scrap' | PartKind;
  icon: IconRef;
  label: string;
  found: number;
  kept: number;
}

const PACK_ICON: Readonly<Record<'bait' | 'essence' | 'scrap', { icon: IconRef; label: string }>> =
  {
    bait: { icon: BAIT_ICON, label: 'Bait' },
    essence: { icon: ESSENCE_ICON, label: 'Essence' },
    scrap: { icon: { kind: 'part', part: 'scrap' }, label: 'Scrap' },
  };

/** The kinds the pack held (what was found), with what of each was kept. Empty when nothing was found. */
export function packKinds(found: DungeonPack, kept: DungeonPack): PackKind[] {
  const plain = (['bait', 'essence', 'scrap'] as const)
    .filter((key) => found[key] > 0)
    .map((key): PackKind => ({ key, ...PACK_ICON[key], found: found[key], kept: kept[key] }));
  const shards = packShardEntries(found).map(([key, n]): PackKind => ({
    key,
    icon: { kind: 'part', part: key },
    label: partName(key),
    found: n,
    kept: kept.shards?.[key] ?? 0,
  }));
  return [...plain, ...shards];
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

/** A creature of the camp's row, as its tile needs it. `hp` is null for one that has just come in (full HP, not known to the screen yet). */
export interface CampRowCreature {
  id: string;
  name: string;
  species: string;
  level: number;
  element: string;
  hp: { now: number; max: number } | null;
}

/** The creature of an open run's row as the camp's tile reads it. */
export function campCreatureOf(creature: DungeonRunCreature): CampRowCreature {
  return {
    id: creature.id,
    name: creature.name,
    species: creature.speciesId,
    level: creature.level,
    element: creature.element,
    hp: { now: creature.hp, max: creature.hpMax },
  };
}

/** The HP line of a tile: "140 / 203 HP", red under a third and when down ("0 / 215 HP"); "Full HP" for a new arrival. */
export function campHp(hp: CampRowCreature['hp']): SlotHp {
  if (hp === null) return { ratio: 1, state: 'ok', text: 'Full HP' };
  const state = tileState({ hp: hp.now, hpMax: hp.max });
  return {
    ratio: hp.max > 0 ? Math.min(1, Math.max(0, hp.now / hp.max)) : 0,
    state,
    text: `${String(Math.max(0, hp.now))} / ${String(hp.max)} HP`,
  };
}

/** What a screen reader says for a tile of the camp's row: "Left: Sproutle, level 12, 240 / 281 HP." */
export function campSlotLabel(creature: CampRowCreature, index: number, picked: boolean): string {
  const place = ['Left', 'Middle', 'Right'][index] ?? `Place ${String(index + 1)}`;
  const health =
    creature.hp === null
      ? 'full HP'
      : creature.hp.now <= 0
        ? `knocked out, 0 / ${String(creature.hp.max)} HP`
        : `${String(creature.hp.now)} / ${String(creature.hp.max)} HP`;
  const base = `${place}: ${creature.name}, level ${String(creature.level)}, ${health}.`;
  return picked ? `${base} Picked up. Tap another creature to swap places.` : base;
}

/** The ids of the row, left to right. */
export function rowIds(team: readonly { id: string }[]): string[] {
  return team.map((c) => c.id);
}

/** The order with `a` and `b` standing in each other's place; the same order when either is not in it. */
export function swapPlaces(order: readonly string[], a: string, b: string): string[] {
  const from = order.indexOf(a);
  const to = order.indexOf(b);
  const next = [...order];
  if (from < 0 || to < 0 || from === to) return next;
  next[from] = b;
  next[to] = a;
  return next;
}

/**
 * What a tap on a creature of the row does (the camp's tap-to-swap). With nobody picked up it picks
 * that creature up; tapping the picked-up one puts it down again; tapping another swaps the two and
 * puts both down.
 */
export function tapToSwap(
  order: readonly string[],
  selected: string | null,
  tapped: string,
): { order: string[]; selected: string | null } {
  if (selected === null) return { order: [...order], selected: tapped };
  if (selected === tapped) return { order: [...order], selected: null };
  return { order: swapPlaces(order, selected, tapped), selected: null };
}

/**
 * The row once `incoming` has taken the place of `out`, in the same order: this is the row a Swap
 * leaves, and the one its `order` is a permutation of (the server applies the order after the swap).
 */
export function orderAfterSwap(order: readonly string[], out: string, incoming: string): string[] {
  return order.map((id) => (id === out ? incoming : id));
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

/**
 * The camp act for Rest, with the row's order (always sent: the server takes a permutation of the row,
 * which for Rest and a keepsake is the row as it stands).
 */
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

/**
 * The camp act for a swap: `out` leaves the row, `incoming` (one of the player's own) comes in. The
 * `order` is the row AFTER the swap (it holds `incoming`, not `out`), so the new creature can be
 * stood anywhere in the same act.
 */
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
export const AWAY_REASON = ON_A_TRIP_REASON;

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
