import type { Cell, Shape } from './plan';

/**
 * Cells a move of this shape would typically hit on a grid, for trying a shape in the workbench without a fight: what the engine's own
 * shapes cover around an anchor near the middle (`targetsOf` in the engine's `board.ts`).
 */
export function sampleCells(shape: Shape, grid: { rows: number; cols: number }): Cell[] {
  const mid = { row: Math.min(1, grid.rows - 1), col: Math.min(1, grid.cols - 1) };
  const inGrid = (c: Cell): boolean =>
    c.row >= 0 && c.col >= 0 && c.row < grid.rows && c.col < grid.cols;
  const all = Array.from({ length: grid.rows * grid.cols }, (_, k) => ({
    row: k % grid.rows,
    col: Math.floor(k / grid.rows),
  }));
  switch (shape) {
    case 'single':
      return [mid];
    case 'scatter':
      return [
        { row: 0, col: 0 },
        { row: grid.rows - 1, col: Math.min(2, grid.cols - 1) },
        { row: mid.row, col: grid.cols - 1 },
      ].filter((c, k, list) => list.findIndex((o) => o.row === c.row && o.col === c.col) === k);
    case 'line3':
      return [mid, { row: mid.row, col: mid.col - 1 }, { row: mid.row, col: mid.col + 1 }].filter(
        inGrid,
      );
    case 'row':
    case 'randomRow':
      return all.filter((c) => c.row === mid.row);
    case 'rows':
      return all.filter((c) => c.row === mid.row || c.row === mid.row + 1);
    case 'column':
      return all.filter((c) => c.col === mid.col);
    case 'columns':
      return all.filter((c) => c.col === mid.col || c.col === mid.col + 1);
    case 'rowEnds':
      return all.filter((c) => c.col === 0 || c.col === grid.cols - 1);
    case 'chain':
      return [
        mid,
        { row: mid.row, col: mid.col + 1 },
        { row: Math.min(grid.rows - 1, mid.row + 1), col: mid.col + 1 },
      ].filter((c, k, list) => list.findIndex((o) => o.row === c.row && o.col === c.col) === k);
    case 'cross':
      return [
        mid,
        { row: mid.row, col: mid.col - 1 },
        { row: mid.row, col: mid.col + 1 },
        { row: mid.row - 1, col: mid.col },
        { row: mid.row + 1, col: mid.col },
      ].filter(inGrid);
    case 'checker':
      return all.filter((c) => (c.row + c.col) % 2 === (mid.row + mid.col) % 2);
    case 'all':
      return all;
  }
}

/** Parses "row:col row:col" (0-based) into cells; null when the text is not a list of cells. */
export function parseCells(text: string, grid: { rows: number; cols: number }): Cell[] | null {
  const parts = text
    .trim()
    .split(/\s+/)
    .filter((p) => p !== '');
  if (parts.length === 0) return null;
  const cells: Cell[] = [];
  for (const part of parts) {
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(part);
    if (m === null) return null;
    const cell = { row: Number(m[1]), col: Number(m[2]) };
    if (cell.row >= grid.rows || cell.col >= grid.cols) return null;
    cells.push(cell);
  }
  return cells;
}
