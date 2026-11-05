/**
 * What the dungeon's screens read of a run on combat v2 beyond the v1 views (docs/design/combat/integration.md, sections 6 and 9):
 * each foe on the map with its v2 card (its armour, plain attack and move tiles, from the same builder the raid's boss card uses), and a
 * stored room's arena and the Knack names of its row. Pure functions of the foe, the depth and the stored fight; nothing here reads the
 * database. A v1 run's views never pass through here, so every v1 payload is what it was.
 */
import { undercroftDepth, type DungeonMap } from '@creatures/game';
import { mapView as gameMapView, type RoomMark } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { foeAt, type FightInputV2 } from '@creatures/engine/v2';
import { SHIPPED } from './fighter-v2';
import { bossCardView, type BossCardV2View } from './raid-v2-card';
import type { DungeonMapView } from './dungeon-types';

/** The card of a dungeon foe at the depth its room fights at (an Undercroft keeper always has its signature move). */
export function foeCardV2(
  foeId: string,
  depth: number,
  keeper: boolean,
  undercroft = false,
): BossCardV2View | undefined {
  try {
    return bossCardView(
      foeAt(combatV2, SHIPPED, foeId, depth, {
        ...(keeper ? { signature: true } : {}),
        ...(undercroft ? { undercroft: true } : {}),
      }),
      null,
    );
  } catch {
    // A foe the pack does not know (content changed under an old run) shows no tiles.
    return undefined;
  }
}

/**
 * The map as a player at `depth` sees it on a run of combat v2: `mapView` with each foe's card. The depth a room's foe is built at is
 * the room's own (`undercroftDepth` below ground); a boss node at a landmark holds the landmark boss, which `mapView` already names.
 */
export function mapViewV2(
  map: DungeonMap,
  depth: number,
  marksOf?: (nodeId: string) => readonly RoomMark[],
): DungeonMapView {
  const view = gameMapView(map, depth, marksOf);
  const level = map.level ?? 0;
  const at = undercroftDepth(depth, level);
  return {
    ...view,
    nodes: view.nodes.map((node) => {
      if (node.foe === undefined) return node;
      const card = foeCardV2(node.foe.id, at, level > 0 && node.kind === 'boss', level > 0);
      return card === undefined ? node : { ...node, foe: { ...node.foe, card } };
    }),
  };
}

/** The arena a stored room was fought in: the foe's rows by columns (one row in the dungeon) and its round limit. */
export function arenaOf(input: FightInputV2): { rows: number; cols: number; rounds: number } {
  return { rows: input.boss.rows, cols: input.boss.cols, rounds: input.boss.rounds };
}

/** The Knack of each creature that fought a room, by name (a creature with none, or one the pack no longer knows, is left out). */
export function knackNamesOf(input: FightInputV2): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of input.fighters) {
    const id = f.knack;
    const knack =
      id === undefined || !Object.hasOwn(combatV2.knacks, id) ? undefined : combatV2.knacks[id];
    if (knack !== undefined) out[f.key ?? f.uid] = knack.name;
  }
  return out;
}
