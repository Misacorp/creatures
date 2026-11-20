/**
 * The Route drawer's rows: the rooms the run has been through, in order, each as a short plain line (`docs/design/dungeon-canvas.md`).
 * It reads the run's own history, so while a fight plays it is the history before that room (`hold.ts`): nothing of the fight shows
 * early. A choice still waiting shows as pending. Names are the content's; every line is drawn as text.
 */
import {
  chestLine,
  descendLine,
  doorLine,
  fightResultWord,
  pickedLine,
  roundsLine,
} from '../dungeon-history';
import { foeDisplayName, roomPlate } from '../dungeon-map';
import type { DungeonMapNode, DungeonStepLog } from '../dungeon-types';

export interface RouteRow {
  /** Unique within the list. */
  key: string;
  /** The room, as its plate says it ("Drift Wisp", "Camp"). */
  title: string;
  /** What happened there. */
  text: string;
}

function lineOf(entry: DungeonStepLog): string {
  switch (entry.result) {
    case 'fight':
      return `${fightResultWord(entry)}. ${roundsLine(entry)}`;
    case 'cache':
      return 'Took the cache.';
    case 'event':
      return `${pickedLine(entry.option)} ${entry.outcome}`;
    case 'camp':
      return entry.detail;
    case 'door':
      return doorLine(entry);
    case 'chest':
      return chestLine(entry);
    case 'descend':
    case 'home':
      return descendLine(entry);
    case 'pending':
      return entry.kind === 'camp'
        ? 'A choice is waiting here.'
        : entry.kind === 'descend'
          ? 'The way down is waiting.'
          : 'A choice is waiting here.';
  }
}

/** The rows for `history`, with the rooms of the map (and its Undercroft levels) to name them. */
export function routeRows(
  history: readonly DungeonStepLog[] | undefined,
  nodes: readonly DungeonMapNode[],
): RouteRow[] {
  return (history ?? []).map((entry, i) => {
    const node = nodes.find((n) => n.id === entry.node);
    return {
      key: `${String(i)}:${entry.node}`,
      title:
        node === undefined
          ? entry.node
          : node.foe === undefined
            ? roomPlate(node)
            : foeDisplayName(node),
      text: lineOf(entry),
    };
  });
}
