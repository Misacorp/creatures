/**
 * What the spot picker and the skin picker list, as plain data: "Empty" first, then the pieces that fit the spot (free
 * copies first, then the ones every copy of which is placed), then the blueprints known but not made yet; for a bed, the
 * creatures that can sleep in it with their reasons. Pure.
 */
import {
  BARE_LAYERS,
  canPlace,
  HOUSING_RULES,
  ownsSkin,
  parseLook,
  type HousemateView,
  type HouseView,
  type OwnHouseView,
  type RoomView,
} from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import type { Creature } from '../api';
import type { SkinBody } from './housing-api';
import { creatureName } from '../game';
import { baseOption, type PickerOption } from '../roster-picker';
import { pieceOf, setName, SPOT_NAMES } from './house-names';
import { drawnLook } from './interior-art';
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

export type SkinKind =
  'wall' | 'floor' | 'trim' | 'ceiling' | 'roof' | 'walls' | 'frame' | 'ground';

/** The id of the "None" choice: a trim taken off. */
export const BARE_CHOICE = '__bare';

export interface SkinChoice {
  /** A skin id, or `BARE_CHOICE`. */
  id: string;
  /** `owned`: it can be used now; `blueprint`: known, not made yet; `bare`: no trim (nothing chosen). */
  kind: 'owned' | 'blueprint' | 'bare';
  name: string;
  set: string | null;
  here: boolean;
  label: string;
  /** The colours a generated pattern comes in (housing C5); empty for a drawn skin. */
  colours: readonly string[];
  /** The colour worn now, when this pattern is the one in use. */
  colour: string | null;
}

/**
 * What the skin picker lists for a kind: "None" first for a trim, then the skins the player has (the one in use first; a starter is
 * had by rule), then the ones known but not made. A generated pattern is one choice for all its colours. `current` is the look in use
 * (`paper-damask:rose`), or null for a bare layer: a ceiling or frame left as built is its starter (`drawnLook`), shown as that.
 */
export function skinChoices(
  kind: SkinKind,
  current: string | null,
  own: OwnHouseView,
): SkinChoice[] {
  const known = knownIds(own);
  const drawn = drawnLook(kind, current);
  const worn = drawn === null ? null : parseLook(drawn);
  const have = (s: (typeof housing.skins)[number]) =>
    ownsSkin(s, own.items.skins.includes(s.id)) || s.id === worn?.skin;
  // Ground skins: the varieties of one outdoor room (`orchard-apple`, `orchard-plum`), told by the id they share before the dash.
  const family = `${(current ?? '').split('-')[0] ?? ''}-`;
  const ofKind = housing.skins.filter(
    (s) => s.kind === kind && (kind !== 'ground' || s.id.startsWith(family)),
  );
  const choice = (s: (typeof housing.skins)[number], owned: boolean): SkinChoice => {
    const here = s.id === worn?.skin;
    return {
      id: s.id,
      kind: owned ? 'owned' : 'blueprint',
      name: s.name,
      set: setName(s.set),
      here,
      label: owned ? (here ? `${s.name}, in use` : s.name) : `${s.name}, not made yet`,
      colours: s.gen?.colours ?? [],
      colour: here ? (worn?.colour ?? null) : null,
    };
  };
  const owned = ofKind.filter(have).map((s) => choice(s, true));
  owned.sort((a, b) => Number(b.here) - Number(a.here));
  const blueprints = ofKind.filter((s) => !have(s) && known.has(s.id)).map((s) => choice(s, false));
  // Only a trim can be left off: a ceiling or frame left as built is drawn as its starter, listed as that.
  const bare: SkinChoice[] =
    BARE_LAYERS.has(kind) && drawnLook(kind, null) === null
      ? [
          {
            id: BARE_CHOICE,
            kind: 'bare',
            name: 'None',
            set: null,
            here: current === null,
            label: current === null ? 'None, in use' : 'None',
            colours: [],
            colour: null,
          },
        ]
      : [];
  return [...bare, ...owned, ...blueprints];
}

/**
 * The look a skin picker opens on: a room's wallpaper, floor (an outdoor room's ground), trim or ceiling, or the house's roof, walls
 * or frame. Null is a bare layer; undefined: the room is gone.
 */
export function currentLook(
  house: HouseView,
  room: RoomView | undefined,
  kind: SkinKind,
): string | null | undefined {
  switch (kind) {
    case 'roof':
    case 'walls':
    case 'frame':
      return house.exterior[kind];
    case 'ground':
      return room?.floor;
    case 'wall':
    case 'floor':
    case 'trim':
    case 'ceiling':
      return room === undefined ? undefined : room[kind];
  }
}

/** The request that puts a look on a layer (null: a bare trim, ceiling or frame); null when it needs a room and has none. */
export function skinBody(
  kind: SkinKind,
  roomId: string | null,
  value: string | null,
): SkinBody | null {
  switch (kind) {
    case 'roof':
      return value === null ? null : { target: 'exterior', roof: value };
    case 'walls':
      return value === null ? null : { target: 'exterior', walls: value };
    case 'frame':
      return { target: 'exterior', frame: value };
    case 'ground':
    case 'floor':
      return roomId === null || value === null ? null : { target: 'room', roomId, floor: value };
    case 'wall':
      return roomId === null || value === null ? null : { target: 'room', roomId, wall: value };
    case 'trim':
      return roomId === null ? null : { target: 'room', roomId, trim: value };
    case 'ceiling':
      return roomId === null ? null : { target: 'room', roomId, ceiling: value };
  }
}
