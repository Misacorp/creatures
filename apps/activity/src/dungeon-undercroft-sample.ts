/**
 * Run states and summaries of the Undercroft for the workbench and the tests, made from the REAL captured
 * answers (`fixtures/dungeon-act-door|descend-pending|descend|keeper.json`) by cutting the captured run
 * at an earlier step or changing one thing (a cracked keeper, a second level, an epic room, a quiet
 * room). Fixture data only: never imported by the game.
 */
import actDescend from './fixtures/dungeon-act-descend.json';
import actDescendPending from './fixtures/dungeon-act-descend-pending.json';
import actDoor from './fixtures/dungeon-act-door.json';
import actKeeper from './fixtures/dungeon-act-keeper.json';
import { parseDungeonAct } from './dungeon-parse';
import type {
  DungeonMapView,
  DungeonRunState,
  DungeonRunSummary,
  DungeonStepLog,
} from './dungeon-types';

/** The ways a run can stand in or before the Undercroft. */
export const UNDERCROFT_STAGES = [
  'locked',
  'door-ahead',
  'door-walked',
  'quiet-room',
  'descent',
  'entrance',
  'midway',
  'epic',
  'keeper',
  'cracked',
  'cracked-deeper',
  'done',
] as const;
export type UndercroftStage = (typeof UNDERCROFT_STAGES)[number];

const actState = (answer: unknown): DungeonRunState => parseDungeonAct(answer).state;

/** The history of the captured finished run up to (and including) a room of the path, in order. */
function historyUpTo(
  history: readonly DungeonStepLog[],
  path: readonly string[],
): DungeonStepLog[] {
  const last = path[path.length - 1];
  const end = history.map((e) => e.node).lastIndexOf(last ?? '');
  return history.slice(0, end + 1);
}

/**
 * A level's rooms as the server draws them, one floor shorter than the first level: the entrance floor, one
 * room of the middle (the first level's elite room), and the keeper.
 */
function secondLevel(first: DungeonMapView): DungeonMapView {
  const keeper = first.nodes.find((n) => n.kind === 'boss');
  const entrance = first.nodes.filter((n) => n.floor === 0);
  const middle = first.nodes.find((n) => n.id === 'u1f2l1');
  if (keeper === undefined || middle === undefined) throw new Error('the capture has a keeper');
  const id = (n: { id: string }): string => n.id.replace(/^u1/, 'u2');
  return {
    floors: 3,
    level: 2,
    label: 'Undercroft II · foes are fiercer still',
    nodes: [
      ...entrance.map((n) => ({ ...n, id: id(n), next: ['u2f1l1'] })),
      { ...middle, id: 'u2f1l1', floor: 1, lane: 1, next: ['u2f2l1'] },
      { ...keeper, id: 'u2f2l1', floor: 2, lane: 1, next: [] },
    ],
  };
}

/** Everything a stage needs: the run's state and, for a finished one, nothing more (the map is in the state). */
export function undercroftState(stage: UndercroftStage): DungeonRunState {
  const door = actState(actDoor);
  const pending = actState(actDescendPending);
  const down = actState(actDescend);
  const keeper = actState(actKeeper);
  const full = keeper.undercroft?.maps[0];
  if (full === undefined) throw new Error('the capture went down');
  const open = (over: Partial<DungeonRunState>): DungeonRunState => ({
    ...keeper,
    status: 'active',
    outcome: null,
    pending: null,
    ...over,
  });
  switch (stage) {
    case 'locked':
      // Standing on the floor before the boss: the quiet band above it says the Undercroft waits.
      return {
        ...door,
        at: 'f4l1',
        path: door.path.slice(0, -1),
        history: (door.history ?? []).slice(0, -1),
        reachable: ['f5l1', 'f5l2'],
        undercroft: null,
        step: door.step - 1,
      };
    case 'door-ahead':
      return {
        ...door,
        at: 'f4l1',
        path: door.path.slice(0, -1),
        history: (door.history ?? []).slice(0, -1),
        reachable: ['f5l1'],
        undercroft: null,
        step: door.step - 1,
      };
    case 'door-walked':
      return door;
    case 'quiet-room': {
      // A depth below 8: the carved door is a mystery room named "Quiet room", and the run is about to step in.
      const nodes = door.map.nodes.map((n) =>
        n.kind === 'door'
          ? {
              id: n.id,
              floor: n.floor,
              lane: n.lane,
              kind: 'mystery' as const,
              next: n.next,
              event: { id: 'quiet-room', name: 'Quiet room' },
            }
          : n,
      );
      return {
        ...door,
        depth: 5,
        map: { ...door.map, nodes },
        at: 'f4l1',
        path: door.path.slice(0, -1),
        history: (door.history ?? []).slice(0, -1),
        reachable: ['f5l1'],
        undercroft: null,
        step: door.step - 1,
      };
    }
    case 'descent':
      return pending;
    case 'entrance':
      return down;
    case 'midway':
      return open({
        step: 13,
        level: 1,
        at: 'u1f1l0',
        path: [...down.path, 'u1f0l0', 'u1f1l0'],
        reachable: ['u1f2l1'],
        history: historyUpTo(keeper.history ?? [], [...down.path, 'u1f0l0', 'u1f1l0']),
        pack: { bait: 4, essence: 3, scrap: 5 },
      });
    case 'epic': {
      // The first level's middle room is an epic fight, not an elite.
      const maps = [
        {
          ...full,
          nodes: full.nodes.map((n) => (n.id === 'u1f2l1' ? { ...n, kind: 'epic' as const } : n)),
        },
      ];
      return open({
        undercroft: { maps, marks: 1 },
        step: 13,
        at: 'u1f1l0',
        path: [...down.path, 'u1f0l0', 'u1f1l0'],
        reachable: ['u1f2l1'],
        history: historyUpTo(keeper.history ?? [], [...down.path, 'u1f0l0', 'u1f1l0']),
      });
    }
    case 'keeper': {
      const path = [...down.path, 'u1f0l0', 'u1f1l0', 'u1f2l1'];
      return open({
        step: 14,
        at: 'u1f2l1',
        path,
        reachable: ['u1f3l1'],
        history: historyUpTo(keeper.history ?? [], path),
      });
    }
    case 'cracked': {
      // The keeper stands on a cracked floor and has not been fought yet.
      const path = [...down.path, 'u1f0l0', 'u1f1l0', 'u1f2l1'];
      return open({
        undercroft: { maps: [{ ...full, crack: true }], marks: 1 },
        step: 14,
        at: 'u1f2l1',
        path,
        reachable: ['u1f3l1'],
        history: historyUpTo(keeper.history ?? [], path),
      });
    }
    case 'cracked-deeper': {
      // The cracked keeper fell and the run went down again: a second level, its entrance next.
      const path = [...keeper.path];
      return open({
        level: 2,
        undercroft: { maps: [{ ...full, crack: true }, secondLevel(full)], marks: 1 },
        step: 16,
        at: null,
        path,
        reachable: ['u2f0l0', 'u2f0l2'],
        history: keeper.history ?? [],
      });
    }
    case 'done':
      return keeper;
  }
}

/** The summary of the captured run that cleared an Undercroft level (with its route and its levels). */
export function undercroftSummary(): DungeonRunSummary {
  const summary = parseDungeonAct(actKeeper).summary;
  if (summary === undefined) throw new Error('the capture has a summary');
  return summary;
}

/** The same run lost in the Undercroft: the keeper won, so the last fight was lost instead, and half the pack came home. */
export function undercroftLostSummary(): DungeonRunSummary {
  const base = undercroftSummary();
  const route = base.route;
  if (route === undefined) throw new Error('the capture has a route');
  const last = route.history.filter((e) => e.result === 'fight').pop();
  const history = route.history
    .filter((e) => !(e.node === last?.node && e.result === 'chest'))
    .map((e) =>
      e === last && e.result === 'fight'
        ? {
            ...e,
            cleared: false,
            foeHpEnd: Math.round(e.foeHpMax * 0.35),
            loot: { bait: 0, essence: 0, scrap: 0 },
          }
        : e,
    );
  const rooms = base.rooms.map((r, i) =>
    i === base.rooms.length - 1 ? { ...r, cleared: false, foeHpEnd: 300 } : r,
  );
  return {
    ...base,
    outcome: 'defeat',
    deepest: 0,
    roomsCleared: base.roomsCleared - 1,
    rooms,
    pack: { found: { bait: 6, essence: 3, scrap: 5 }, kept: { bait: 3, essence: 2, scrap: 3 } },
    route: { ...route, history },
  };
}
