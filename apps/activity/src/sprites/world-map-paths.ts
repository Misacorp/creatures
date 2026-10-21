/**
 * Routing of the world map's paths (pure, no I/O): a shortest route over a coarse grid of 2x2 map pixels
 * that goes around anything blocked (landmarks, logos, the sea), preferring straight runs. Used by
 * `world-map-art.ts`, which says what is blocked and which places are joined.
 */

export interface GridPoint {
  /** Cell column and row; a cell covers `PATH_CELL` x `PATH_CELL` map pixels. */
  cx: number;
  cy: number;
}

export const PATH_CELL = 2;

const MOVES: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const STRAIGHT = 10;
const DIAGONAL = 14;
const TURN = 4;
const NO_DIRECTION = 8;

/** A binary min-heap of [priority, value] pairs; ties go to the lower value, so routes are repeatable. */
class Heap {
  private readonly items: [number, number][] = [];
  get size(): number {
    return this.items.length;
  }
  private less(a: [number, number], b: [number, number]): boolean {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  }
  push(item: [number, number]): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const p = a[parent];
      const c = a[i];
      if (p === undefined || c === undefined || !this.less(c, p)) break;
      a[parent] = c;
      a[i] = p;
      i = parent;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (top === undefined || last === undefined) return undefined;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        const cur = a[m];
        const lc = a[l];
        if (lc !== undefined && cur !== undefined && this.less(lc, cur)) m = l;
        const rc = a[r];
        const mc = a[m];
        if (rc !== undefined && mc !== undefined && this.less(rc, mc)) m = r;
        if (m === i) break;
        const a1 = a[i];
        const a2 = a[m];
        if (a1 === undefined || a2 === undefined) break;
        a[i] = a2;
        a[m] = a1;
        i = m;
      }
    }
    return top;
  }
}

/**
 * The cells of the shortest route from one cell to another over a `cols` x `rows` grid, moving in eight
 * directions and never into a blocked cell (the first and last cell are always allowed). A turn costs a
 * little, so routes run straight where they can. Null when there is no route.
 */
export function routeCells(
  from: GridPoint,
  to: GridPoint,
  cols: number,
  rows: number,
  blocked: (cx: number, cy: number) => boolean,
): GridPoint[] | null {
  const key = (cx: number, cy: number, dir: number): number => (cy * cols + cx) * 9 + dir;
  const free = (cx: number, cy: number): boolean =>
    cx >= 0 &&
    cy >= 0 &&
    cx < cols &&
    cy < rows &&
    ((cx === to.cx && cy === to.cy) || (cx === from.cx && cy === from.cy) || !blocked(cx, cy));
  const heuristic = (cx: number, cy: number): number => {
    const dx = Math.abs(cx - to.cx);
    const dy = Math.abs(cy - to.cy);
    return STRAIGHT * (dx + dy) + (DIAGONAL - 2 * STRAIGHT) * Math.min(dx, dy);
  };
  const cost = new Map<number, number>();
  const parent = new Map<number, number>();
  const heap = new Heap();
  const start = key(from.cx, from.cy, NO_DIRECTION);
  cost.set(start, 0);
  heap.push([heuristic(from.cx, from.cy), start]);
  while (heap.size > 0) {
    const popped = heap.pop();
    if (popped === undefined) break;
    const [, state] = popped;
    const dir = state % 9;
    const cell = (state - dir) / 9;
    const cx = cell % cols;
    const cy = (cell - cx) / cols;
    const g = cost.get(state) ?? 0;
    if (cx === to.cx && cy === to.cy) {
      const out: GridPoint[] = [];
      for (let s: number | undefined = state; s !== undefined; s = parent.get(s)) {
        const d = s % 9;
        const c = (s - d) / 9;
        out.push({ cx: c % cols, cy: Math.floor(c / cols) });
      }
      return out.reverse();
    }
    for (const [d, [mx, my]] of MOVES.entries()) {
      const nx = cx + mx;
      const ny = cy + my;
      if (!free(nx, ny)) continue;
      const diagonal = mx !== 0 && my !== 0;
      // No cutting a corner of something blocked.
      if (diagonal && (!free(cx + mx, cy) || !free(cx, cy + my))) continue;
      const step =
        (diagonal ? DIAGONAL : STRAIGHT) + (dir !== NO_DIRECTION && dir !== d ? TURN : 0);
      const next = key(nx, ny, d);
      const total = g + step;
      if (total < (cost.get(next) ?? Infinity)) {
        cost.set(next, total);
        parent.set(next, state);
        heap.push([total + heuristic(nx, ny), next]);
      }
    }
  }
  return null;
}
