/**
 * The combat v2 raid board as plain data (docs/design/combat/integration.md, section 9): the boss's rows by the party's columns, a
 * slot's place in words, each tile's extras (role, Knack, carried HP, a swap mark), the cues of the boss move tapped on the
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
  /** Slots whose creature is in an open swap request of yours (the circling swap mark). */
  swaps: ReadonlyMap<number, SwapMark>;
}

/** The board's creatures by slot. */
export function creaturesBySlot(
  creatures: readonly BoardCreatureV2[],
): ReadonlyMap<number, BoardCreatureV2> {
  return new Map(creatures.map((c) => [c.slot, c]));
}

/** The open swap requests that involve a creature of the board: the ones asked of its owner (`incoming`) and the ones you made (`outgoing`). */
export interface SwapMark {
  incoming: readonly SwapV2[];
  outgoing: readonly SwapV2[];
}

/**
 * The creatures that carry the circling swap mark: every creature named in one of your open requests, asked or asking. A request names two
 * slots (two creatures, or one creature and an empty slot), so the slots that hold a creature are marked, each with its requests.
 */
export function swapMarks(
  swaps: Pick<SwapsV2, 'incoming' | 'outgoing'>,
  row: readonly RowSlotView[],
): ReadonlyMap<number, SwapMark> {
  const filled = new Set(row.flatMap((s) => (s.creature === null ? [] : [s.slot])));
  const marks = new Map<number, { incoming: SwapV2[]; outgoing: SwapV2[] }>();
  for (const [kind, list] of [
    ['incoming', swaps.incoming],
    ['outgoing', swaps.outgoing],
  ] as const) {
    for (const request of list) {
      for (const slot of new Set([request.slotA, request.slotB])) {
        if (!filled.has(slot)) continue;
        const mark = marks.get(slot) ?? { incoming: [], outgoing: [] };
        mark[kind].push(request);
        marks.set(slot, mark);
      }
    }
  }
  return marks;
}

/**
 * What a marked creature's popover says: each request in words (who asks, what, and the two seats), the asked player's requests first.
 * Yours reads "Waiting for Mira: ...", theirs "Mira asks to swap ...".
 */
export function swapMarkText(mark: SwapMark, grid: GridV2): string {
  const seats = (r: SwapV2): string =>
    r.creatureB === null
      ? ''
      : ` Seats: ${placeTextV2(r.slotA, grid)} and ${placeTextV2(r.slotB, grid)}.`;
  return [
    ...mark.incoming.map((r) => `${incomingText(r, grid)}${seats(r)}`),
    ...mark.outgoing.map((r) => `${outgoingText(r, grid)}${seats(r)}`),
  ].join(' ');
}

/** One slot of the party board as the v2 board draws it: the v1 tile plus the role, the Knack, the carried HP and the swap mark. */
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
  const swapMark = ctx.swaps.get(s.slot);
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
    ...(swapMark === undefined
      ? []
      : [swapMark.incoming.length > 0 ? 'a swap is asked of its owner' : 'you asked to swap']),
  ].join(', ');
  return {
    ...base,
    ariaLabel: said,
    ...(swapMark === undefined ? {} : { swap: true }),
    occupant: {
      species: c.species,
      name: c.name,
      level: c.level,
      ownId: editable && c.mine && c.creatureId !== undefined ? c.creatureId : null,
      mine: c.mine,
      ...(c.shiny === true ? { shiny: true } : {}),
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
    ...(c.shiny === true ? { shiny: true } : {}),
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

/** One action of a marked creature's popover: answering a request asked of you, or withdrawing one you made. */
export interface SwapActionSpec {
  id: string;
  kind: 'accept' | 'decline' | 'cancel';
  label: string;
}

/**
 * The actions a marked creature's popover offers, in order: Accept and Decline for each request asked of its owner, then Cancel request
 * for each request you made (only the asker can withdraw it). With several requests the label names the other player.
 */
export function swapActionSpecs(mark: SwapMark): SwapActionSpec[] {
  const several = mark.incoming.length > 1;
  const answers = mark.incoming.flatMap((request) =>
    (['accept', 'decline'] as const).map((kind) => ({
      id: request.id,
      kind,
      label: `${kind === 'accept' ? 'Accept' : 'Decline'}${several ? ` ${request.from}` : ''}`,
    })),
  );
  const manyOut = mark.outgoing.length > 1;
  const cancels = mark.outgoing.map((request) => ({
    id: request.id,
    kind: 'cancel' as const,
    label: `Cancel request${manyOut ? ` to ${request.to}` : ''}`,
  }));
  return [...answers, ...cancels];
}

/** The player's swap requests as one list for a count (incoming and outgoing). */
export const swapCount = (swaps: SwapsV2): number => swaps.incoming.length + swaps.outgoing.length;
