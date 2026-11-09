/**
 * The house as cells (`docs/design/housing.md` 2.4). Pure: the client draws from `houseGrid`, the server validates room ids
 * against it. Columns count from the core's left edge (0); a west wing or terrace sits at negative columns. Floors count
 * from the ground (0); the cellar is floor -1.
 */
import type { HousingContent, PartDef } from './schema';

export interface GridRoom {
  /** `<part>:<key>`, e.g. `hut:hearth`. */
  roomId: string;
  kind: string;
  /** The left cell (negative on the west side). */
  col: number;
  floor: number;
  /** Width in cells. */
  w: number;
  outdoor: boolean;
  part: string;
}

/** Parts not built whose `requires` are all built, in build-list order. */
export function buildable(content: HousingContent, built: ReadonlySet<string>): string[] {
  return content.parts
    .filter((p) => !built.has(p.id) && p.requires.every((r) => built.has(r)))
    .sort((a, b) => a.order - b.order)
    .map((p) => p.id);
}

/**
 * Every built room with its cell position. Core parts and the cellar sit where their data says. A side part's room columns
 * are relative to its block: the wings of one side share one block against the core, and each ground part (terrace,
 * garden, pool) takes the next block further out, in build-list order. So a terrace sits left of a west wing when there is
 * one and left of the core when there is not. Rooms come top floor first, then left to right.
 */
export function houseGrid(content: HousingContent, built: ReadonlySet<string>): GridRoom[] {
  const kinds = new Map(content.rooms.map((r) => [r.id, r]));
  const widthOf = (kind: string): number => {
    const def = kinds.get(kind);
    if (def === undefined) throw new Error(`houseGrid: unknown room kind "${kind}"`);
    return def.cells.w;
  };
  const blockWidth = (parts: PartDef[]): number =>
    Math.max(0, ...parts.flatMap((p) => p.rooms.map((r) => r.col + widthOf(r.kind))));
  const parts = content.parts.filter((p) => built.has(p.id)).sort((a, b) => a.order - b.order);
  const out: GridRoom[] = [];
  const emit = (part: PartDef, origin: (col: number) => number): void => {
    for (const room of part.rooms) {
      const def = kinds.get(room.kind);
      if (def === undefined) throw new Error(`houseGrid: unknown room kind "${room.kind}"`);
      out.push({
        roomId: `${part.id}:${room.key}`,
        kind: room.kind,
        col: origin(room.col),
        floor: room.floor,
        w: def.cells.w,
        outdoor: def.outdoor,
        part: part.id,
      });
    }
  };
  const core = parts.filter((p) => p.side === undefined);
  for (const part of core) emit(part, (col) => col);
  const coreW = blockWidth(core);
  for (const side of ['west', 'east'] as const) {
    const onSide = parts.filter((p) => p.side === side);
    const wings = onSide.filter((p) => p.kind === 'wing');
    const wingW = blockWidth(wings);
    for (const part of wings) {
      emit(part, side === 'west' ? (col) => col - wingW : (col) => coreW + col);
    }
    let used = side === 'west' ? wingW : coreW + wingW;
    for (const part of onSide.filter((p) => p.kind !== 'wing')) {
      const w = blockWidth([part]);
      const start = side === 'west' ? -(used + w) : used;
      emit(part, (col) => start + col);
      used += w;
    }
  }
  return out.sort((a, b) => b.floor - a.floor || a.col - b.col || a.roomId.localeCompare(b.roomId));
}
