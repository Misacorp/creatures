/**
 * What the Raid Roster says and offers, as plain data: how many creatures a player has on the board,
 * the line about when the rest join, and the options of the creature picker (who can be placed in a
 * slot, who is already on the board, what the board refuses). Pure: `ui/RosterPicker.tsx` draws the
 * picker and `Placement.tsx` wires it to the game. The server still decides every placement.
 */
import { affects, type AffectMode } from '@creatures/engine';
import { RULES, content, creaturePower, strongest } from '@creatures/game';
import type { Creature } from './api';
import { creatureName, getSpecies, speciesName } from './game';
import type { AwayView, RaidEventId, RowSlotView } from './raid-api';
import { boardAffectRow, boardKeys, parseTurnOrder } from './raid-board';
import { phaseName } from './raid-text';

/**
 * Whether each picker option has a line saying what the creature would do in the slot being filled
 * ("Steam with Splashet", "Buffs 2 neighbours"). Misa wants to try it and may remove it if it crowds
 * the picker (2026-10-14): this is the one place that decides. The workbench shows both settings.
 */
export const SHOW_PICKER_EFFECTS: boolean = true;

/** The bold lead of a picker option's effect line: "In this slot: Steam with Hearthshell". Only shown with an effect. */
export const EFFECT_PREFIX = 'In this slot:';

/** The most creatures one player has on the board. */
export const MAX_ON_BOARD: number = RULES.raid.teamSize;

/** What an option says for a creature that is on the board already (picking it moves it). */
export const ON_BOARD_NOTE = 'On the board · moves here';

/** The same for the dungeon team. */
export const IN_TEAM_NOTE = 'In the team · moves here';

/** The word on the small tag of a recommended creature. It gives no reason, on purpose (Misa, 2026-10-15). */
export const RECOMMENDED_TAG = 'Recommended';

/** How many creatures are recommended: the strongest few, as many as a team holds. */
export const RECOMMENDED_COUNT: number = RULES.raid.teamSize;

/** Why a new creature cannot be picked when the board holds the most already. */
export const BOARD_FULL_REASON = `${String(MAX_ON_BOARD)} / ${String(MAX_ON_BOARD)} placed, remove one first`;

/** The creature fields the picker needs (a `Creature` of the collection has them). */
export interface PickerCreature {
  id: string;
  species: string;
  nickname: string | null;
  level: number;
  /** `creaturePower` of the stats a fight uses (gear included): how strong it is. */
  power: number;
  /** When it was caught (epoch ms): of two equally strong creatures the older ranks first. */
  caughtAt: number;
}

/** A creature of the collection as the picker sees it. Its power counts the item it wears, as the server's does. */
export function toPickerCreature(c: Creature): PickerCreature {
  return {
    id: c.id,
    species: c.species,
    nickname: c.nickname,
    level: c.level,
    power: creaturePower(c.statsWithGear, c.dodgeBp),
    caughtAt: c.caughtAt,
  };
}

/**
 * The ids of the player's three strongest creatures: the same ranking as the server's automatic team
 * (`strongest` of `@creatures/game`, which `autoTeam` uses). It ignores slot rules: it is the same
 * three whatever slot is being filled.
 */
export function recommendedIds(creatures: readonly PickerCreature[]): ReadonlySet<string> {
  return new Set(strongest(creatures, RECOMMENDED_COUNT).map((c) => c.id));
}

/** One line of the picker. */
export interface PickerOption {
  id: string;
  name: string;
  species: string;
  level: number;
  element: string;
  role: string;
  /** Already on the board: picking it moves it to this slot. */
  onBoard: boolean;
  /** Why it cannot be picked, or null when it can. */
  disabled: string | null;
  /** What it would do in this slot (the effect preview), or null for nothing or when the preview is off. */
  effect: string | null;
  /** One of the player's three strongest: the picker shows a small "Recommended" tag. */
  recommended: boolean;
  /** A plain action, not a creature (the Workshop's "Take off"): its name is the whole option. */
  action?: boolean;
}

/** How many of the player's creatures are on the board. */
export function placedCount(row: readonly RowSlotView[]): number {
  return row.filter((s) => s.creature?.mine === true && !s.creature.auto).length;
}

/**
 * "7 / 18 team slots filled": every creature on the party board (anyone's, guests included) out of
 * all its slots. `length` is the party's row length, which is the total number of slots.
 */
export function boardTotalLine(row: readonly RowSlotView[], length: number): string {
  const filled = row.filter((s) => s.creature !== null).length;
  return `${String(filled)} / ${String(length)} team slots filled`;
}

/** True when the player has all of their creatures on the board (the line shows a check mark). */
export function allPlaced(placed: number): boolean {
  return placed >= MAX_ON_BOARD;
}

/** The count at the start of the Raid Roster's count line: "1 / 3 placed". */
export function placedLine(placed: number): string {
  return `${String(placed)} / ${String(MAX_ON_BOARD)} placed`;
}

/**
 * The quiet line under the count, or null when there is nothing to add: "The rest join
 * automatically when Phase 1 locks." while fewer than three are placed (`next` is the view's next
 * event, its lock), "The board is locked." once edits are closed, nothing when all three are placed.
 */
export function rosterNote(
  placed: number,
  next: { event: RaidEventId } | null,
  canEdit: boolean,
): string | null {
  if (!canEdit) return 'The board is locked.';
  if (allPlaced(placed)) return null;
  const when = next === null || next.event === 'weekStart' ? 'the board' : phaseName(next.event);
  return `The rest join automatically when ${when} locks.`;
}

/** The slot's place as the picker's title says it: "Middle, lane 3". */
export function pickerTitle(place: string): string {
  return `Choose a creature for ${place}`;
}

/**
 * One compact line about what `slot` would do with the creature `id` standing in it, from the
 * engine's `affects`: the reaction it takes part in first ("Steam with Splashet"), then what it does
 * for the others in the row ("Buffs 2 neighbours", "Covers its row"). Null when it does nothing.
 * `keys` is the row as it would stand (each creature by its key), `known` what each key is.
 */
export function effectPreview(args: {
  keys: readonly (string | null)[];
  known: ReadonlyMap<string, { species: string; level: number }>;
  slot: number;
  mode: AffectMode;
}): string | null {
  const { keys, known, slot, mode } = args;
  const list = affects(boardAffectRow(keys, known), slot, mode);
  const occupied = (at: number): boolean => keys[at] !== null && keys[at] !== undefined;
  const parts: string[] = [];

  const reactions = list.flatMap((a) => (a.kind === 'reaction' ? [a] : []));
  const first = reactions[0];
  const def =
    first === undefined ? undefined : content.reactions.find((r) => r.id === first.reaction);
  if (first !== undefined && def !== undefined) {
    const key = keys[first.slot];
    const who = key === null || key === undefined ? undefined : known.get(key);
    const more = reactions.length > 1 ? ` +${String(reactions.length - 1)}` : '';
    parts.push(
      `${def.name} with ${who === undefined ? 'a creature' : speciesName(who.species)}${more}`,
    );
  }
  const buffed = list.filter((a) => a.kind === 'buff' && occupied(a.slot)).length;
  if (list.some((a) => a.kind === 'buff')) {
    parts.push(
      buffed === 0
        ? 'Buffs its neighbours'
        : `Buffs ${String(buffed)} neighbour${buffed === 1 ? '' : 's'}`,
    );
  }
  if (list.some((a) => a.kind === 'cover')) {
    parts.push(mode.row === 'dungeon' ? 'Covers its neighbours' : 'Covers its row');
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/** Why an away teammate's joining creature is not offered as a swap-in. */
export const ALREADY_JOINING = 'Already joining the fight';

/**
 * The options of the swap picker for an away teammate's creature: everything they own. The ones that
 * are not in the fight come first (picking one takes the tile's place); the ones already joining stay
 * listed but cannot be picked. Highest level first. No effect preview, no recommendation.
 */
export function awayPickerOptions(creatures: AwayView['creatures']): PickerOption[] {
  const options = creatures.map((c): PickerOption => {
    const species = getSpecies(c.species);
    return {
      id: c.creatureId,
      name: c.name,
      species: c.species,
      level: c.level,
      element: species?.element ?? 'unknown',
      role: species?.role ?? '',
      onBoard: false,
      disabled: c.joining ? ALREADY_JOINING : null,
      effect: null,
      recommended: false,
    };
  });
  const rank = (o: PickerOption): number => (o.disabled === null ? 0 : 1);
  return options.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.level - a.level ||
      a.name.localeCompare(b.name) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * The options for filling the empty `slot` of the raid board: every creature the player owns. Those
 * that are free come first, then those already on the board (picking moves them), then, when the
 * board is full, the ones that cannot be added (with the reason); each group from the highest level
 * down. With `showEffects`, each option carries what it would do in that slot.
 */
export function pickerOptions(args: {
  creatures: readonly PickerCreature[];
  row: readonly RowSlotView[];
  length: number;
  slot: number;
  turnOrder: string;
  showEffects: boolean;
}): PickerOption[] {
  const { row, length } = args;
  const onBoard = new Set(
    row.flatMap((s) =>
      s.creature?.mine === true && !s.creature.auto && s.creature.creatureId !== undefined
        ? [s.creature.creatureId]
        : [],
    ),
  );
  const known = new Map<string, { species: string; level: number }>();
  for (const s of row) {
    if (s.creature !== null) {
      known.set(s.creature.creatureId ?? `other:${String(s.slot)}`, s.creature);
    }
  }
  return optionsFor({
    creatures: args.creatures,
    baseKeys: boardKeys(row, length),
    known,
    onBoard,
    slot: args.slot,
    mode: { row: 'raid', turnOrder: parseTurnOrder(args.turnOrder) },
    showEffects: args.showEffects,
  });
}

/**
 * The same for the dungeon team's row of three: `slots` holds the creature in each place, left to
 * right (null: empty). The effect line judges the creature in the dungeon's left-to-right order.
 */
export function dungeonPickerOptions(args: {
  creatures: readonly PickerCreature[];
  slots: readonly (string | null)[];
  slot: number;
  showEffects: boolean;
}): PickerOption[] {
  return optionsFor({
    creatures: args.creatures,
    baseKeys: args.slots,
    known: new Map(),
    onBoard: new Set(args.slots.filter((id): id is string => id !== null)),
    slot: args.slot,
    mode: { row: 'dungeon' },
    showEffects: args.showEffects,
  });
}

/** The options of a picker for any row. `baseKeys` is the row as it stands, `onBoard` the player's creatures in it. */
function optionsFor(args: {
  creatures: readonly PickerCreature[];
  baseKeys: readonly (string | null)[];
  known: Map<string, { species: string; level: number }>;
  onBoard: ReadonlySet<string>;
  slot: number;
  mode: AffectMode;
  showEffects: boolean;
}): PickerOption[] {
  const { creatures, baseKeys, known, onBoard, slot } = args;
  const full = onBoard.size >= MAX_ON_BOARD;
  const recommended = recommendedIds(creatures);
  for (const c of creatures) known.set(c.id, c);

  const options = creatures.map((c): PickerOption => {
    const species = getSpecies(c.species);
    const placed = onBoard.has(c.id);
    let effect: string | null = null;
    if (args.showEffects) {
      // The creature in this slot; if it was on the board, its old slot is free.
      const keys = baseKeys.map((k) => (k === c.id ? null : k));
      keys[slot] = c.id;
      effect = effectPreview({ keys, known, slot, mode: args.mode });
    }
    return {
      id: c.id,
      name: creatureName(c),
      species: c.species,
      level: c.level,
      element: species?.element ?? 'unknown',
      role: species?.role ?? '',
      onBoard: placed,
      disabled: full && !placed ? BOARD_FULL_REASON : null,
      effect,
      recommended: recommended.has(c.id),
    };
  });
  const rank = (o: PickerOption): number => (o.disabled !== null ? 2 : o.onBoard ? 1 : 0);
  return options.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.level - a.level ||
      a.name.localeCompare(b.name) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
