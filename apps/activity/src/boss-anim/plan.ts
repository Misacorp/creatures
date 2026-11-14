/**
 * What a boss move's animation does, from the move's shape and the creatures it hit: pure, in grid terms (rows and columns, no pixels).
 * `aimOf` reads the beat's events (the move's id and each creature it was aimed at); `planOf` turns that into the cells to mark and
 * the strikes to fly. `frame.ts` puts a plan on screen.
 *
 * Every shape of the engine (`Pattern['shape']`) has a motion, so a move with no look of its own still plays its shape's generic one:
 *
 * | shape                          | weapon form | what flies                                                |
 * | ------------------------------ | ----------- | --------------------------------------------------------- |
 * | `columns`, `column`            | `spear`     | down through each column hit                              |
 * | `row`, `rows`, `randomRow`     | `wave`      | across each row hit, from alternating sides               |
 * | `line3`                        | `wave`      | across the span of the creatures hit                      |
 * | `rowEnds`                      | `wave`      | in from both sides to the two end cells of each row       |
 * | `single`, `scatter`, `cross`, `checker` | `orb` | down onto each creature aimed at (the first few)         |
 * | `chain`                        | `chain`     | down onto the first creature, then hopping to the others  |
 * | `all`                          | `nova`      | one big strike down the middle, a burst on every creature |
 */
import type { FightEvent } from '@creatures/engine/v2';
import type { BeatV2, FoldCreature } from '../fight-v2';

/** A cell of the boss's grid: the row and the column (lane) of a creature's place. */
export interface Cell {
  row: number;
  col: number;
}

export const SHAPES = [
  'single',
  'line3',
  'row',
  'column',
  'rowEnds',
  'randomRow',
  'all',
  'scatter',
  'chain',
  'columns',
  'rows',
  'cross',
  'checker',
] as const;

export type Shape = (typeof SHAPES)[number];

/** The generic weapon shapes; a boss look may draw any of them its own way. */
export const FORMS = ['spear', 'wave', 'orb', 'chain', 'nova'] as const;
export type Form = (typeof FORMS)[number];

/** Which weapon form a shape throws when nothing says otherwise. */
export const FORM_OF: Readonly<Record<Shape, Form>> = {
  single: 'orb',
  scatter: 'orb',
  cross: 'orb',
  checker: 'orb',
  column: 'spear',
  columns: 'spear',
  row: 'wave',
  rows: 'wave',
  randomRow: 'wave',
  line3: 'wave',
  rowEnds: 'wave',
  chain: 'chain',
  all: 'nova',
};

/** One thing that flies through the strike phase. */
export type StrikeSpec =
  /** Down through a whole column, top to bottom. */
  | { kind: 'column'; col: number }
  /** Across a whole row from one side to the other. */
  | { kind: 'row'; row: number; from: 'left' | 'right' }
  /** Along a row over the columns `fromCol..toCol`, coming in from the left. */
  | { kind: 'span'; row: number; fromCol: number; toCol: number }
  /** In from a side of a row to one cell (a row end). */
  | { kind: 'end'; row: number; col: number; from: 'left' | 'right' }
  /** Down from above onto one cell. */
  | { kind: 'drop'; cell: Cell }
  /** Down onto the first cell, then on from cell to cell. */
  | { kind: 'hops'; cells: readonly Cell[] }
  /** One big strike down the middle of the board. */
  | { kind: 'all' };

export interface AnimPlan {
  shape: Shape;
  /** The move's id (`plain` for the plain attack): a boss look may dress one move. */
  moveId: string;
  form: Form;
  /** Cells outlined while the move is aimed: everything the move covers. */
  marks: readonly Cell[];
  /** The weapons that fly, one after the other copy in the same phase. */
  strikes: readonly StrikeSpec[];
  /** The creatures it hit: where the impact bursts. */
  impacts: readonly Cell[];
  /** A bigger version: a move that covers the whole board. */
  big: boolean;
}

/** The most weapons that fly at once; further targets still get their burst. */
export const MAX_STRIKES = 4;

/** The boss move of a beat, as the stage's boss card names its moves. */
export interface MoveInfo {
  id: string;
  name: string;
  shape: string;
}

export interface AimContext {
  moves: readonly MoveInfo[];
  /** The shape of the plain attack. */
  plainShape: string;
  creatures: readonly Pick<FoldCreature, 'key' | 'row' | 'col'>[];
}

/** What the boss aimed at in one boss beat. */
export interface BossAim {
  moveId: string;
  shape: Shape;
  /** The creatures it was aimed at, in the order the engine hit them. */
  cells: readonly Cell[];
}

const isShape = (s: string): s is Shape => (SHAPES as readonly string[]).includes(s);

/** The id a `target` event names: "<creature> (row 1, slot 2) <- thunderclap". */
const targetMove = (text: string): string | null => {
  const at = text.lastIndexOf('<- ');
  return at < 0 ? null : text.slice(at + 3).trim();
};

/**
 * The first boss move (or the plain attack, when there is no move) that hit someone in a boss beat, with the cells it hit. A beat
 * that holds several moves animates the first; a move that hit nobody (Fizzle) has no animation. Reads the board's hit events and the
 * engine's `target` events only for the id of the move they belong to.
 */
export function bossAimOf(
  events: readonly FightEvent[],
  beat: Pick<BeatV2, 'from' | 'to' | 'kind'>,
  context: AimContext,
): BossAim | null {
  if (beat.kind !== 'boss') return null;
  const place = new Map(context.creatures.map((c) => [c.key, { row: c.row, col: c.col }]));
  const groups = new Map<string, Cell[]>();
  let current = 'plain';
  for (let i = beat.from; i < beat.to; i++) {
    const e = events[i];
    if (e === undefined) continue;
    if (e.kind === 'target') current = targetMove(e.text) ?? current;
    const b = e.board;
    const to =
      b?.type === 'hit' && b.from === null && b.to !== null
        ? b.to
        : b?.type === 'silence'
          ? b.who
          : null;
    if (to === null) continue;
    const cell = place.get(to);
    if (cell === undefined) continue;
    const list = groups.get(current) ?? [];
    if (!list.some((c) => c.row === cell.row && c.col === cell.col)) list.push(cell);
    groups.set(current, list);
  }
  const first = [...groups.entries()].find(([id]) => id !== 'plain') ?? [...groups.entries()][0];
  if (first === undefined) return null;
  const [moveId, cells] = first;
  const shape =
    moveId === 'plain'
      ? context.plainShape
      : (context.moves.find((m) => m.id === moveId)?.shape ?? 'single');
  return { moveId, shape: isShape(shape) ? shape : 'single', cells };
}

const distinct = (values: readonly number[]): number[] =>
  [...new Set(values)].sort((a, b) => a - b);

const column = (col: number, rows: number): Cell[] =>
  Array.from({ length: rows }, (_, row) => ({ row, col }));
const row = (at: number, cols: number): Cell[] =>
  Array.from({ length: cols }, (_, col) => ({ row: at, col }));

/** The plan of a move that hit `aim.cells` on a grid of `rows` by `cols`. */
export function planOf(aim: BossAim, grid: { rows: number; cols: number }): AnimPlan {
  const { shape, cells } = aim;
  const base = { shape, moveId: aim.moveId, form: FORM_OF[shape], impacts: cells, big: false };
  const cap = <T>(list: readonly T[], n: number): T[] => list.slice(0, n);
  switch (shape) {
    case 'column':
    case 'columns': {
      const cols = distinct(cells.map((c) => c.col));
      return {
        ...base,
        marks: cols.flatMap((c) => column(c, grid.rows)),
        strikes: cap(
          cols.map((col): StrikeSpec => ({ kind: 'column', col })),
          MAX_STRIKES,
        ),
      };
    }
    case 'row':
    case 'rows':
    case 'randomRow': {
      const rowsHit = distinct(cells.map((c) => c.row));
      return {
        ...base,
        marks: rowsHit.flatMap((r) => row(r, grid.cols)),
        strikes: cap(
          rowsHit.map((r, k): StrikeSpec => ({
            kind: 'row',
            row: r,
            from: k % 2 === 0 ? 'left' : 'right',
          })),
          MAX_STRIKES,
        ),
      };
    }
    case 'line3': {
      const r = cells[0]?.row ?? 0;
      const inRow = cells.filter((c) => c.row === r);
      const cols = inRow.map((c) => c.col);
      const fromCol = Math.min(...cols);
      const toCol = Math.max(...cols);
      return {
        ...base,
        marks: cells,
        strikes: [{ kind: 'span', row: r, fromCol, toCol }],
      };
    }
    case 'rowEnds': {
      const half = grid.cols / 2;
      return {
        ...base,
        marks: cells,
        strikes: cap(
          cells.map((c): StrikeSpec => ({
            kind: 'end',
            row: c.row,
            col: c.col,
            from: c.col < half ? 'left' : 'right',
          })),
          MAX_STRIKES,
        ),
      };
    }
    case 'chain':
      return {
        ...base,
        marks: cells,
        strikes: cells.length === 0 ? [] : [{ kind: 'hops', cells }],
      };
    case 'all':
      return { ...base, big: true, marks: cells, strikes: [{ kind: 'all' }] };
    case 'checker':
      return {
        ...base,
        marks: cells,
        strikes: cap(
          cells.map((cell): StrikeSpec => ({ kind: 'drop', cell })),
          MAX_STRIKES,
        ),
      };
    default:
      // single, scatter, cross: a weapon onto each creature aimed at (a cross's first is the anchor, the rest get the burst).
      return {
        ...base,
        marks: cells,
        strikes: cap(
          (shape === 'cross' ? cells.slice(0, 1) : cells).map((cell): StrikeSpec => ({
            kind: 'drop',
            cell,
          })),
          MAX_STRIKES,
        ),
      };
  }
}
