/**
 * The Sealed Vault's mark (docs/design/dungeon-paths.md, "The Sealed Vault"): which fight rooms a broken
 * seal marks, and the generic room mark the map shows (`RoomMark`). Pure functions of the map.
 */
import { dungeonEvents } from '../content/dungeon';
import type { DungeonEventDef, EventEffect } from '../content/dungeon-schema';
import { mapNode, type DungeonMap, type MapNode } from './dungeon-map';

/**
 * A small badge a room of the map wears: `text` is a short glyph or word for the badge ("x2"), `label` the
 * spoken line (and the drawer's explanation). Data, so a future effect can mark a room the same way.
 */
export interface RoomMark {
  /** What put it there (`sealed-vault`). */
  kind: string;
  text: string;
  label: string;
}

/** The mark of a room a broken seal marked. */
export const SEALED_MARK: RoomMark = {
  kind: 'sealed-vault',
  text: 'x2',
  label: 'Sealed Vault: epic fight, double rewards',
};

/** A room a seal can mark: a plain fight or an elite. An epic fight is epic already, a floor boss is its own thing. */
const markable = (node: MapNode): boolean => node.kind === 'fight' || node.kind === 'elite';

/** A room where a path ends for a seal's search: nothing past it is "the next fight". */
const terminal = (node: MapNode): boolean => node.kind === 'boss' || node.kind === 'epic';

/**
 * The fight rooms a seal broken in room `fromId` marks. The fights (and elites) among the rooms that
 * room leads to; if none of them is one, the nearest fight on each path (through caches, camps, doors and
 * mystery rooms), where a path ends at a floor boss or an epic fight. Ids in map order, no repeats.
 */
export function sealTargets(map: DungeonMap, fromId: string): string[] {
  const from = mapNode(map, fromId);
  if (from === undefined) return [];
  const next = from.next.flatMap((id) => {
    const node = mapNode(map, id);
    return node === undefined ? [] : [node];
  });
  const direct = next.filter(markable);
  const found = new Set<string>(direct.map((n) => n.id));
  if (direct.length === 0) {
    const seen = new Set<string>();
    const walk = (node: MapNode): void => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      if (markable(node)) {
        found.add(node.id);
        return;
      }
      if (terminal(node)) return;
      for (const id of node.next) {
        const n = mapNode(map, id);
        if (n !== undefined) walk(n);
      }
    };
    for (const node of next) walk(node);
  }
  return map.nodes.filter((n) => found.has(n.id)).map((n) => n.id);
}

const sealsIn = (effects: readonly EventEffect[]): boolean =>
  effects.some((e) => e.op === 'seal' || (e.op === 'gamble' && sealsIn([...e.win, ...e.lose])));

/** True when an option of the event marks the fights ahead (it has a `seal` effect). */
export function eventSeals(event: DungeonEventDef): boolean {
  return event.options.some((o) => sealsIn(o.effects));
}

/**
 * The events a mystery room in `fromId` may turn into by chance (`rollRareEvent`'s list): all of them, except
 * that an event that marks fights is left out when no fight lies ahead on any path (it would do nothing).
 */
export function rareEventsAt(map: DungeonMap, fromId: string): readonly DungeonEventDef[] {
  return sealTargets(map, fromId).length > 0
    ? dungeonEvents
    : dungeonEvents.filter((e) => !eventSeals(e));
}
