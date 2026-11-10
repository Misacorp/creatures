/**
 * What the spot picker and the skin picker list, as plain data: "Empty" first, then the pieces that fit the spot (free
 * copies first, then the ones every copy of which is placed), then the blueprints known but not made yet; for a bed, the
 * creatures that can sleep in it with their reasons. Pure.
 */
import {
  canPlace,
  HOUSING_RULES,
  type HousemateView,
  type OwnHouseView,
  type RoomView,
} from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import type { Creature } from '../api';
import { creatureName } from '../game';
import { baseOption, type PickerOption } from '../roster-picker';
import { pieceOf, setName, SPOT_NAMES } from './house-names';
import { knownIds } from './workbench-view';

/** The id of the "Empty" choice. */
export const EMPTY_CHOICE = '__empty';

export type SpotChoiceKind = 'empty' | 'free' | 'placed' | 'blueprint';

export interface SpotChoice {
  /** A piece id, or `EMPTY_CHOICE`. */
  id: string;
  kind: SpotChoiceKind;
  name: string;
  /** The set's name, or null for a piece in no set. */
  set: string | null;
  /** The set's id, or null: what the picker groups its tiles by. */
  setId: string | null;
  /** Copies owned and copies not placed (0 for empty and blueprints). */
  owned: number;
  free: number;
  /** This is what the spot holds now. */
  here: boolean;
  /** The spoken name of the tile. */
  label: string;
}

/** A run of tiles that share a set (and are all owned, or all still to make): the picker draws the set's name above it. */
export interface ChoiceGroup {
  /** The set's name, or null for pieces in no set (and the Empty tile). */
  label: string | null;
  choices: SpotChoice[];
}

export interface SpotView {
  /** The spot's name ("Small floor") and its type. */
  name: string;
  type: string;
  /** The piece the spot holds, or null. */
  current: string | null;
  /** Every tile in a fixed order: Empty, the pieces owned, then the blueprints; each by set (no set first), then the content's order. */
  choices: SpotChoice[];
  /** The same tiles in runs by set, for the labels. */
  groups: ChoiceGroup[];
  /** The spot's piece is a bed: a housemate can sleep in it. */
  bed: boolean;
}

/** The spot's definition in its room kind, or undefined for a spot the content does not know. */
export function spotDef(room: Pick<RoomView, 'kind'>, spotId: string) {
  return housing.rooms.find((k) => k.id === room.kind)?.spots.find((s) => s.id === spotId);
}

/** The spot's name: its type's name ("Window"), the display's own for a display. */
export function spotName(room: Pick<RoomView, 'kind'>, spotId: string): string {
  const def = spotDef(room, spotId);
  return def === undefined ? spotId : SPOT_NAMES[def.type];
}

export function isBed(pieceId: string | null): boolean {
  if (pieceId === null) return false;
  const piece = pieceOf(pieceId);
  return piece !== undefined && housing.forms.find((f) => f.id === piece.form)?.bed === true;
}

/** Everything the spot picker lists for a spot of a room. */
export function spotView(room: RoomView, spotId: string, own: OwnHouseView): SpotView {
  const def = spotDef(room, spotId);
  const current = room.spots[spotId] ?? null;
  const name = spotName(room, spotId);
  const fits = (id: string) => def !== undefined && canPlace(housing, room.kind, spotId, id);
  const empty: SpotChoice = {
    id: EMPTY_CHOICE,
    kind: 'empty',
    name: 'Empty',
    set: null,
    setId: null,
    owned: 0,
    free: 0,
    here: current === null,
    label: `Empty${current === null ? ', the spot is empty now' : ''}`,
  };
  const owned = housing.pieces.filter((p) => (own.items.pieces[p.id] ?? 0) > 0 && fits(p.id));
  const free: SpotChoice[] = [];
  const placed: SpotChoice[] = [];
  for (const piece of owned) {
    const count = own.items.pieces[piece.id] ?? 0;
    const spare = own.free[piece.id] ?? 0;
    const here = piece.id === current;
    const choice: SpotChoice = {
      id: piece.id,
      kind: spare > 0 || here ? 'free' : 'placed',
      name: piece.name,
      set: setName(piece.set),
      setId: piece.set,
      owned: count,
      free: spare,
      here,
      label: here
        ? `${piece.name}, in this spot now`
        : spare > 0
          ? `${piece.name}, ${String(spare)} free`
          : `${piece.name}, placed elsewhere, moves here`,
    };
    (choice.kind === 'free' ? free : placed).push(choice);
  }
  const known = knownIds(own);
  const blueprints: SpotChoice[] = housing.pieces
    .filter((p) => known.has(p.id) && (own.items.pieces[p.id] ?? 0) === 0 && fits(p.id))
    .map((p) => ({
      id: p.id,
      kind: 'blueprint' as const,
      name: p.name,
      set: setName(p.set),
      setId: p.set,
      owned: 0,
      free: 0,
      here: false,
      label: `${p.name}, not made yet`,
    }));
  // A fixed order, so a tile never jumps when it is chosen or placed: the owned pieces (free or placed elsewhere alike), then the
  // blueprints; each by set (pieces in no set first), then the content's own order.
  const setIndex = (id: string | null): number =>
    id === null ? -1 : housing.sets.findIndex((k) => k.id === id);
  const pieceIndex = new Map(housing.pieces.map((p, i) => [p.id, i]));
  const byContent = (a: SpotChoice, b: SpotChoice): number =>
    setIndex(a.setId) - setIndex(b.setId) ||
    (pieceIndex.get(a.id) ?? 0) - (pieceIndex.get(b.id) ?? 0);
  const owned_ = [...free, ...placed].sort(byContent);
  blueprints.sort(byContent);
  const choices = [empty, ...owned_, ...blueprints];
  const groups: ChoiceGroup[] = [];
  const split = owned_.length + 1;
  let lastKey = '';
  choices.forEach((choice, i) => {
    const key = `${i < split ? 'own' : 'make'}:${choice.setId ?? ''}`;
    const last = groups[groups.length - 1];
    if (last !== undefined && key === lastKey) last.choices.push(choice);
    else groups.push({ label: choice.set, choices: [choice] });
    lastKey = key;
  });
  return { name, type: def?.type ?? '', current, choices, groups, bed: isBed(current) };
}

/** The creature sleeping in this bed, if any. */
export function sleeperAt(
  housemates: readonly HousemateView[],
  roomId: string,
  spotId: string,
): HousemateView | undefined {
  return housemates.find((h) => h.roomId === roomId && h.spotId === spotId);
}

/** The id of the "nobody" action of the creature list. */
export const NOBODY = '__nobody';

/**
 * The rows of "Who sleeps here": every creature, the ones that can take the bed first. A creature away on a trip or
 * on a job shows that as its reason; one already in another bed moves here; with every bed taken only the sleepers
 * can be swapped. "Nobody" (an action row) first when someone sleeps here now.
 */
export function sleeperOptions(
  creatures: readonly Creature[],
  housemates: readonly HousemateView[],
  roomId: string,
  spotId: string,
): PickerOption[] {
  const here = sleeperAt(housemates, roomId, spotId);
  const full = housemates.length >= HOUSING_RULES.housemates.max && here === undefined;
  const sleeping = new Map(housemates.map((h) => [h.creature.id, h]));
  const rows = creatures.map((c): PickerOption => {
    const base = { ...baseOption(c), name: creatureName(c) };
    const elsewhere = sleeping.get(c.id);
    if (here?.creature.id === c.id) return { ...base, disabled: 'Sleeping here' };
    if (c.away) return { ...base, disabled: 'Away', busy: 'away' };
    if (c.busy?.kind === 'job') return { ...base, disabled: 'On a job', busy: 'job' };
    if (full && elsewhere === undefined) return { ...base, disabled: 'All beds taken' };
    return elsewhere === undefined ? base : { ...base, onBoard: true };
  });
  rows.sort((a, b) => Number(a.disabled !== null) - Number(b.disabled !== null));
  if (here === undefined) return rows;
  const nobody: PickerOption = {
    id: NOBODY,
    name: 'Nobody sleeps here',
    species: '',
    level: 0,
    element: '',
    role: '',
    onBoard: false,
    disabled: null,
    effect: null,
    recommended: false,
    action: true,
  };
  return [nobody, ...rows];
}

export type SkinKind = 'wall' | 'floor' | 'roof' | 'walls';

export interface SkinChoice {
  id: string;
  /** `owned`: it can be used now; `blueprint`: known, not made yet. */
  kind: 'owned' | 'blueprint';
  name: string;
  set: string | null;
  here: boolean;
  label: string;
}

/** What the skin picker lists for a kind: the skins the player has (the one in use first), then the ones known but not made. */
export function skinChoices(kind: SkinKind, current: string, own: OwnHouseView): SkinChoice[] {
  const known = knownIds(own);
  const have = (s: (typeof housing.skins)[number]) =>
    s.unlock.kind === 'starter' || own.items.skins.includes(s.id) || s.id === current;
  const ofKind = housing.skins.filter((s) => s.kind === kind);
  const owned = ofKind.filter(have).map((s): SkinChoice => ({
    id: s.id,
    kind: 'owned',
    name: s.name,
    set: setName(s.set),
    here: s.id === current,
    label: s.id === current ? `${s.name}, in use` : s.name,
  }));
  owned.sort((a, b) => Number(b.here) - Number(a.here));
  const blueprints = ofKind
    .filter((s) => !have(s) && known.has(s.id))
    .map((s): SkinChoice => ({
      id: s.id,
      kind: 'blueprint',
      name: s.name,
      set: setName(s.set),
      here: false,
      label: `${s.name}, not made yet`,
    }));
  return [...owned, ...blueprints];
}
