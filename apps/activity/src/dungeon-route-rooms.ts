/**
 * The Rooms view of the results: every room a run went through, in the order it went (fights, elites, the
 * floor boss, mystery rooms, caches, camps, doors and the Undercroft's rooms), each as one panel with a
 * "Cleared" or "Defeated" banner and, for a room that is not a fight, a short line of what happened there.
 * Built from the run's route: its log (`DungeonStepLog`, the same one the map's drawer for a visited room
 * reads), its maps (for the names) and the fights of the summary (for the foes). Pure functions; names and
 * lines come from the server and are rendered as text only.
 */
import { QUIET_ROOM } from '@creatures/game';
import { doorLine, stepsAt } from './dungeon-history';
import { nodeLevel } from './dungeon-map';
import { ROOM_BANNER, roomStrip, type StripRoom } from './dungeon-playback';
import { isPackEmpty, nodeFloor, packText, undercroftName } from './dungeon-text';
import type {
  DungeonMapNode,
  DungeonNodeKind,
  DungeonRunSummary,
  DungeonStepLog,
} from './dungeon-types';

/** How a room reads: passed through ("Cleared") or the room the run fell in ("Defeated"). */
export type RoomLogState = 'cleared' | 'defeat';

/** One panel of the Rooms view, in the order the run visited its rooms. */
export interface RoomLogRow {
  /** The room's map node id. */
  node: string;
  kind: DungeonNodeKind;
  /** The Undercroft floor the room was on (0: the day's map). */
  level: number;
  state: RoomLogState;
  banner: string;
  /** "Room 4", "Room 4 · Elite", "Undercroft floor 1 · Room 2 · Epic". */
  title: string;
  elite: boolean;
  epic: boolean;
  /** A fight: the foe's content id (for its sprite), whether it is a floor boss, its HP left when it won, and its room's twist. Null for any other room. */
  foe: { id: string; boss: boolean; hpLeft: string | null; modifierName: string } | null;
  /** The glyph of a room that is not a fight (`map-camp`); null for a fight, which shows the foe. */
  glyph: string | null;
  /** The foe's name ("Fierce ..." for an elite), or what the room is ("Camp", "Cache"; a mystery room says its own name). */
  name: string;
  /** What happened in a room that is not a fight ("Rested", "2 Bait · 1 Scrap"), or null. */
  note: string | null;
  /** The panel in sentences for a screen reader. */
  spoken: string;
}

const ROOM_NAMES: Readonly<Record<DungeonNodeKind, string>> = {
  fight: 'Fight',
  elite: 'Elite fight',
  mystery: 'Mystery room',
  cache: 'Cache',
  camp: 'Camp',
  boss: 'Floor boss',
  door: 'Carved door',
  epic: 'Epic fight',
};

const KIND_SUFFIX: Readonly<Partial<Record<DungeonNodeKind, string>>> = {
  elite: 'Elite',
  epic: 'Epic',
  boss: 'Floor boss',
};

type CampLog = Extract<DungeonStepLog, { result: 'camp' }>;

/** What the camp's pick came to, in a few words: "Rested", "Swapped a creature", "Took Lucky Coin", "Headed home". */
export function campNote(entry: Pick<CampLog, 'choice' | 'keepsake'>): string {
  switch (entry.choice) {
    case 'rest':
      return 'Rested';
    case 'swap':
      return 'Swapped a creature';
    case 'keepsake':
      return entry.keepsake === undefined ? 'Took a keepsake' : `Took ${entry.keepsake.name}`;
    case 'home':
      return 'Headed home';
  }
}

/** A sentence's end: the text with a full stop when it has no mark of its own. */
function sentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** The title of a room: where it was, then what kind of fight when it was a special one. */
function titleOf(node: string, kind: DungeonNodeKind): string {
  const floor = nodeFloor(node);
  const level = nodeLevel(node);
  const place = floor === null ? 'Room' : `Room ${String(floor + 1)}`;
  const where = level > 0 ? `${undercroftName(level)} · ${place}` : place;
  const suffix = KIND_SUFFIX[kind];
  return suffix === undefined ? where : `${where} · ${suffix}`;
}

/** What a room that is not a fight says about itself: its name and the short line of what happened. */
function plainRoom(
  kind: DungeonNodeKind,
  node: DungeonMapNode | undefined,
  entry: DungeonStepLog | undefined,
): { name: string; note: string | null } {
  switch (entry?.result) {
    case 'camp':
      return { name: ROOM_NAMES.camp, note: campNote(entry) };
    case 'event': {
      const quiet = node?.event?.id === QUIET_ROOM.id;
      return {
        name: node?.event?.name ?? ROOM_NAMES.mystery,
        note: quiet ? 'Nothing stirred' : sentence(entry.outcome),
      };
    }
    case 'cache':
      return {
        name: ROOM_NAMES.cache,
        note: isPackEmpty(entry.loot) ? null : packText(entry.loot),
      };
    case 'door':
      return { name: ROOM_NAMES.door, note: doorLine(entry) };
    default:
      return { name: ROOM_NAMES[kind], note: null };
  }
}

/**
 * Every room the run went through, in order, or null when the route cannot say (an older run with no
 * route, a log that does not match the fights of the summary): the screen then shows the plain strip of
 * fights. A room the run only reached (a camp or a mystery room whose choice was still open) reads as
 * cleared; only the fight the team lost is "Defeated".
 */
export function roomLog(
  run: Pick<DungeonRunSummary, 'rooms'> & Partial<Pick<DungeonRunSummary, 'outcome' | 'route'>>,
): RoomLogRow[] | null {
  const route = run.route;
  if (route === undefined || route.history.length === 0) return null;
  const nodes = new Map<string, DungeonMapNode>();
  for (const map of [route.map, ...(route.undercroft ?? [])]) {
    for (const n of map.nodes) nodes.set(n.id, n);
  }
  // The visited rooms in order, once each (a floor boss has its fight, its chest and its descent).
  const visited = [...new Set(route.history.map((e) => e.node))];
  const fights: StripRoom[] = roomStrip(run);
  const fightNodes = visited.filter((id) =>
    stepsAt(route.history, id).some((e) => e.result === 'fight'),
  );
  if (fightNodes.length !== fights.length) return null;
  const rows: RoomLogRow[] = [];
  let next = 0;
  for (const id of visited) {
    const entries = stepsAt(route.history, id);
    const fightEntry = entries.find((e) => e.result === 'fight');
    const node = nodes.get(id);
    const kind: DungeonNodeKind = node?.kind ?? 'fight';
    const level = nodeLevel(id);
    if (fightEntry !== undefined) {
      const fight = fights[next++];
      if (fight === undefined) return null;
      const state: RoomLogState = fight.state === 'defeat' ? 'defeat' : 'cleared';
      const title = titleOf(id, kind);
      rows.push({
        node: id,
        kind,
        level,
        state,
        banner: ROOM_BANNER[state],
        title,
        elite: fight.elite,
        epic: fight.epic,
        foe: {
          id: fight.foeId,
          boss: fight.kind === 'boss',
          hpLeft: fight.foeHp,
          modifierName: fight.modifierName,
        },
        glyph: null,
        name: fight.foeName,
        note: null,
        spoken: `${title}: ${fight.foeName}, ${fight.modifierName}. ${state === 'defeat' ? 'Defeated' : 'Cleared'}.`,
      });
      continue;
    }
    const entry = entries.find((e) => e.result !== 'pending') ?? entries[0];
    const { name, note } = plainRoom(kind, node, entry);
    const title = titleOf(id, kind);
    rows.push({
      node: id,
      kind,
      level,
      state: 'cleared',
      banner: ROOM_BANNER.cleared,
      title,
      elite: false,
      epic: false,
      foe: null,
      glyph: `map-${kind}`,
      name,
      note,
      spoken: `${title}: ${name}.${note === null ? '' : ` ${sentence(note)}`} Cleared.`,
    });
  }
  return rows;
}
