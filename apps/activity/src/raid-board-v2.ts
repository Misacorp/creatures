/**
 * The combat v2 raid board as plain data (docs/design/combat/integration.md, section 9): the boss's rows by the party's columns, a
 * slot's place in words, each tile's extras (role, Knack, carried HP, an "Asked" mark), the cues of the boss move tapped on the
 * card and the words of a swap request. Pure: `Placement.tsx` wires it to `ui/RaidBoard`. The grid is the server's (`rows`, `cols`,
 * a slot is `col * rows + row`); the preview is the server's too, worked out with the engine's own targeting, so nothing here is
 * fight maths: it only picks what to draw.
 */
import type { Zone } from '@creatures/engine';
import type { CreatureInfo } from './creature-info';
import { getSpecies } from './game';
import { moveGlyphId } from './combat-glyphs';
import type { RowSlotView } from './raid-api';
import { initialOf } from './raid-roster';
import { ownerColour } from './raid-slots';
import type { BoardCreatureV2, BossMoveV2, MovePreviewV2, SwapV2, SwapsV2 } from './raid-v2-api';
import type { BoardRow } from './raid-board';
import type { SlotModel } from './ui/SlotButton';
import type { SlotCue } from './ui/slot-cue';

/** The arena of a v2 week: rows of the boss by columns of the party. */
export interface GridV2 {
  rows: number;
  cols: number;
}

/** The name of a board row ("Row 2"); v2 numbers its rows, the boss takes a turn after each. */
export const rowNameV2 = (row: number): string => `Row ${String(row + 1)}`;

/** The zone a row stands in, only for the shared board's types (the first is the front, the last the back). */
export function zoneOfRowV2(row: number, rows: number): Zone {
  return row === 0 ? 'front' : row === rows - 1 ? 'back' : 'middle';
}

/** The slot number of a place on the grid (column-major, so a wider board never renumbers a slot). */
export const slotAtV2 = (row: number, col: number, grid: GridV2): number => col * grid.rows + row;

/** The row and the column (both from 0) of a slot. */
export const placeOfV2 = (slot: number, grid: GridV2): { row: number; col: number } => ({
  row: slot % grid.rows,
  col: Math.floor(slot / grid.rows),
});

/** The rows of the board, front first, each with its slots left to right. */
export function gridRowsV2(grid: GridV2): BoardRow[] {
  return Array.from({ length: grid.rows }, (_, row) => ({
    zone: zoneOfRowV2(row, grid.rows),
    slots: Array.from({ length: grid.cols }, (_, col) => slotAtV2(row, col, grid)),
  }));
}

/** A place in plain words: "Row 2, lane 3". Empty for a slot that is not on the board. */
export function placeTextV2(slot: number, grid: GridV2): string {
  if (!Number.isInteger(slot) || slot < 0 || slot >= grid.rows * grid.cols) return '';
  const { row, col } = placeOfV2(slot, grid);
  return `${rowNameV2(row)}, lane ${String(col + 1)}`;
}

/** What a tile of the v2 board needs beyond the week's board entry. */
export interface BoardContextV2 {
  grid: GridV2;
  /** The week's board creatures by slot (their Knack and carried HP). */
  creatures: ReadonlyMap<number, BoardCreatureV2>;
  /** Slots whose creature you have asked to swap (an "Asked" mark each). */
  asked: ReadonlySet<number>;
}

/** The board's creatures by slot. */
export function creaturesBySlot(
  creatures: readonly BoardCreatureV2[],
): ReadonlyMap<number, BoardCreatureV2> {
  return new Map(creatures.map((c) => [c.slot, c]));
}

/**
 * The slots to mark "Asked": the other players' creatures in your open requests. A request names two slots (yours and theirs, or
 * theirs and an empty one), so the ones that hold a creature that is not yours are marked.
 */
export function askedSlots(
  outgoing: readonly SwapV2[],
  row: readonly RowSlotView[],
): ReadonlySet<number> {
  const theirs = new Set(
    row.flatMap((s) => (s.creature !== null && !s.creature.mine ? [s.slot] : [])),
  );
  return new Set(outgoing.flatMap((r) => [r.slotA, r.slotB].filter((n) => theirs.has(n))));
}

/** One slot of the party board as the v2 board draws it: the v1 tile plus the role, the Knack, the carried HP and "Asked". */
export function boardSlotV2(
  s: RowSlotView,
  ctx: BoardContextV2,
  rosterNames: readonly string[],
  /** The board can still change: your own creatures can be dragged and an empty slot takes a pick. */
  editable: boolean,
): SlotModel {
  const c = s.creature;
  const where = placeTextV2(s.slot, ctx.grid);
  const base = { index: s.slot, hideNumber: true } as const;
  if (c === null) {
    const label = editable ? `${where}, empty. Choose a creature.` : `${where}, empty`;
    return { ...base, ariaLabel: label, occupant: null };
  }
  const entry = ctx.creatures.get(s.slot);
  const species = getSpecies(c.species);
  const owner = c.mine ? 'you' : c.ownerName;
  const asked = ctx.asked.has(s.slot);
  const carried =
    entry?.hp != null && entry.hpMax != null && entry.hpMax > 0
      ? { hp: entry.hp, max: entry.hpMax }
      : null;
  const knack = entry?.knackName ?? null;
  const said = [
    `${where}, ${c.name} level ${String(c.level)}, ${owner}`,
    ...(species === undefined ? [] : [species.role]),
    ...(knack === null ? [] : [knack]),
    ...(carried === null ? [] : [`${String(carried.hp)} / ${String(carried.max)} HP`]),
    ...(asked ? ['you asked to swap'] : []),
  ].join(', ');
  return {
    ...base,
    ariaLabel: said,
    ...(asked ? { badge: 'Asked' } : {}),
    occupant: {
      species: c.species,
      name: c.name,
      level: c.level,
      ownId: editable && c.mine && c.creatureId !== undefined ? c.creatureId : null,
      mine: c.mine,
      element: species?.element ?? 'unknown',
      owner: { colour: ownerColour(c.ownerName, rosterNames), initial: initialOf(c.ownerName) },
      v2: { role: species?.role ?? '', knack, carried },
    },
  };
}

/** What the popover of another player's creature on the board shows: its picture, level, element, role and owner. */
export function boardCreatureInfoV2(c: NonNullable<RowSlotView['creature']>): CreatureInfo | null {
  const species = getSpecies(c.species);
  if (species === undefined) return null;
  return {
    name: c.name,
    species: c.species,
    level: c.level,
    element: species.element,
    role: species.role,
    ownerName: c.ownerName,
  };
}

// --- The boss move tapped on the card ---

/** What a tapped move lights: its slots, or null when it is aimed when it comes (a roll or a Wind-up); the move's picture. */
export interface LitMove {
  slots: readonly number[] | null;
  glyph: string;
}

/** The slots a move would hit now, from the week's preview. A move the preview does not know lights nothing and is "aimed when it comes". */
export function litMove(
  preview: MovePreviewV2 | null,
  move: Pick<BossMoveV2, 'id' | 'shape' | 'silences' | 'oneShot' | 'fizzles'>,
): LitMove {
  const slots = preview?.moves[move.id];
  return { slots: slots ?? null, glyph: moveGlyphId(move) };
}

/** The cues of the v2 board: the lit move's slots in the boss-target look, and the plain attack's one marker. */
export function boardCuesV2(
  preview: MovePreviewV2 | null,
  lit: LitMove | null,
): ReadonlyMap<number, SlotCue> {
  const cues = new Map<number, SlotCue>();
  if (preview?.plain != null) cues.set(preview.plain, { plain: true });
  if (lit?.slots != null) {
    for (const slot of lit.slots) cues.set(slot, { ...cues.get(slot), hit: { glyph: lit.glyph } });
  }
  return cues;
}

/** How often a move comes, short enough for a tile and a strip step: "Every round", "Every 3". */
export const everyShort = (every: number): string =>
  every === 1 ? 'Every round' : `Every ${String(every)}`;

/** The line under the board for a tapped move that has no slots yet. */
export const AIMED_WHEN_IT_COMES = 'Aimed when it comes';

/** The line under the board for a tapped Fizzle: it hits nobody; it turns reactions away. */
export const NO_TARGETS = 'Hits nobody: reactions fail until its next turn';

// --- Swap requests ---

/** One creature of a request, by name (an empty slot reads as "an empty slot"). */
const nameOf = (c: SwapV2['creatureA']): string => c?.name ?? 'an empty slot';

/**
 * An incoming request in a few words: "Mira asks to swap Lanternfin for Emberkit." (the asker's creature, then yours), or, for a request to
 * move your creature into an empty slot, "Mira asks to move Emberkit to Row 2, lane 3."
 */
export function incomingText(request: SwapV2, grid: GridV2): string {
  const { creatureA, creatureB } = request;
  if (creatureB === null) {
    return `${request.from} asks to move ${nameOf(creatureA)} to ${placeTextV2(request.slotB, grid)}.`;
  }
  return `${request.from} asks to swap ${nameOf(creatureA)} for ${nameOf(creatureB)}.`;
}

/** A request you made, as the line under the board says it: "Waiting for Mira: Emberkit for Lanternfin." (yours, then theirs). */
export function outgoingText(request: SwapV2, grid: GridV2): string {
  const { creatureA, creatureB } = request;
  if (creatureB === null) {
    return `Waiting for ${request.to}: ${nameOf(creatureA)} to ${placeTextV2(request.slotB, grid)}.`;
  }
  return `Waiting for ${request.to}: ${nameOf(creatureA)} for ${nameOf(creatureB)}.`;
}

/** Home's notice for incoming requests: the one request in words, or how many there are. Null for none. */
export function swapNoticeText(incoming: readonly SwapV2[], grid: GridV2 | null): string | null {
  const [one] = incoming;
  if (one === undefined) return null;
  if (incoming.length > 1) return `${String(incoming.length)} swap requests`;
  // Without the board's size the place of a move is not named; a swap needs none.
  return grid === null && one.creatureB === null
    ? `${one.from} asks you to move a creature`
    : incomingText(one, grid ?? { rows: 1, cols: 1 }).replace(/\.$/, '');
}

/** The player's swap requests as one list for a count (incoming and outgoing). */
export const swapCount = (swaps: SwapsV2): number => swaps.incoming.length + swaps.outgoing.length;
