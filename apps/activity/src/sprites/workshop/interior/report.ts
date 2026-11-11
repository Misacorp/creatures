/**
 * The collision analysis of the ways through (`docs/design/housing-interior.md`): for every room kind, which furniture
 * spots a doorway or a stair would meet at each option's reach, from the real room data. Pure text.
 */
import { collisions, edgeZone, type RoomLike } from './ways';

export interface RoomData {
  id: string;
  cells: { w: number };
  spots: { id: string; type: string; x: number; w: number }[];
}

/** The reach of each doorway option into a room from the post, in pixels. */
export const DOOR_REACH = { straddle: 10, leftRoom: 18, notch: 2 } as const;
/** The width a stair takes from the room's right edge (its sprite plus a step of clearance). */
export const STAIR_REACH = { straight: 46, ladder: 12, spiral: 26 } as const;

const fmt = (c: { wall: string[]; floor: string[] }): string =>
  [...c.wall.map((s) => `${s} (wall)`), ...c.floor.map((s) => `${s} (floor)`)].join(', ') || 'none';

/** A markdown table of the indoor rooms against the options. */
export function collisionTable(rooms: readonly RoomData[]): string {
  const rows: string[] = [
    '| Room | Doorway A straddle, left edge | A, right edge | B (18 px), right edge | Straight stair | Ladder | Spiral |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rooms) {
    const like: RoomLike = { id: r.id, cells: r.cells.w, spots: r.spots };
    if (
      r.spots.every(
        (s) =>
          !['window', 'wall-large', 'wall-small', 'floor-large', 'floor-small'].includes(s.type),
      )
    )
      continue;
    const [l0, l1] = edgeZone(like, 'left', DOOR_REACH.straddle);
    const [r0, r1] = edgeZone(like, 'right', DOOR_REACH.straddle);
    const [b0, b1] = edgeZone(like, 'right', DOOR_REACH.leftRoom);
    const stairs = (reach: number): string => {
      const [s0, s1] = edgeZone(like, 'right', reach);
      return fmt(collisions(like, s0, s1));
    };
    rows.push(
      `| ${r.id} | ${fmt(collisions(like, l0, l1))} | ${fmt(collisions(like, r0, r1))} | ${fmt(collisions(like, b0, b1))} | ${stairs(STAIR_REACH.straight)} | ${stairs(STAIR_REACH.ladder)} | ${stairs(STAIR_REACH.spiral)} |`,
    );
  }
  return rows.join('\n');
}
