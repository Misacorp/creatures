/**
 * Replays of dungeon runs (`Dungeon.replay` in `dungeon.ts` calls these): one fight in the replay
 * shape, and the whole replay of a run, open or done. Plain reads over the deps, no transaction of
 * their own: they run inside the caller's (`replay`'s `transactionSync`, or an act's `atomically`).
 */
import {
  buildNames,
  buildRoomInput,
  type DungeonRoomResult,
  type DungeonRunInput,
} from '@creatures/engine';
import { PLAYER, keepsakeViews, parseState } from './dungeon-state';
import type { DungeonReplayRoom, DungeonReplayView, DungeonRunSummary } from './dungeon-types';
import {
  type DungeonDeps,
  type RunRow,
  type StoredFight,
  fightRows,
  rowOf,
  emptyRewards,
  progressOf,
} from './dungeon-rows';
import { summarise } from './dungeon-finish';

export function playerName(sql: SqlStorage, userId: string): string {
  return (
    sql
      .exec<{ display_name: string }>('SELECT display_name FROM players WHERE user_id = ?', userId)
      .toArray()[0]?.display_name ?? 'You'
  );
}

/**
 * One fight in the replay shape. `buildRoomInput` of the stored input and the HP the row came in with
 * gives the foe's HP after its modifier and the names, exactly as the fight was built. The foe keeps
 * its plain name (the client adds "Fierce" for an elite). A map run's room carries the row that
 * fought it (`row`: the row changes at the camp).
 */
export function replayRoom(
  name: string,
  node: string | null,
  stored: StoredFight,
  result: DungeonRoomResult,
): DungeonReplayRoom {
  const { input, hpIn } = stored;
  const spec = input.rooms[0];
  if (spec === undefined) throw new Error('a stored fight has no room');
  const elite = spec.elite === true;
  const fight = buildRoomInput(input, spec, hpIn);
  const names = buildNames(fight, { [PLAYER]: name });
  return {
    index: result.index,
    kind: spec.foe.kind,
    ...(elite ? { elite: true } : {}),
    ...(spec.epic === true ? { epic: true } : {}),
    ...(node === null ? {} : { node, row: rowOf(input.team) }),
    ...(spec.keepsakes === undefined || spec.keepsakes.length === 0
      ? {}
      : { keepsakes: keepsakeViews(spec.keepsakes.map((k) => k.id)) }),
    foe: {
      id: spec.foe.id,
      name: spec.foe.name,
      element: spec.foe.element,
      hpMax: fight.bossHpPool.max,
    },
    modifier: {
      id: spec.modifier.id,
      name: spec.modifier.name,
      description: spec.modifier.description,
    },
    cleared: result.cleared,
    rounds: result.result.rounds,
    hpStart: result.hpStart,
    hpMax: result.hpMax,
    events: result.result.events,
    names,
  };
}

export function pathReplay(deps: DungeonDeps, row: RunRow, name: string): DungeonReplayView | null {
  const st = parseState(row.state_json);
  if (st === null) return null;
  const steps = fightRows(deps.storage.sql, row.id);
  const rooms: DungeonReplayRoom[] = [];
  for (const step of steps) {
    if (step.input_json === null || step.result_json === null) continue;
    rooms.push(
      replayRoom(
        name,
        step.node,
        JSON.parse(step.input_json) as StoredFight,
        JSON.parse(step.result_json) as DungeonRoomResult,
      ),
    );
  }
  // Past the retention period the events are gone: the same answer as for a run that is not there.
  if (steps.length > 0 && rooms.length === 0) return null;
  const summary =
    row.status === 'done'
      ? (JSON.parse(row.summary_json) as DungeonRunSummary)
      : summarise(deps, {
          row,
          st,
          outcome: null,
          newDepth: row.depth,
          streak: progressOf(deps.storage.sql, row.user_id).streak,
          rewards: emptyRewards(),
          found: st.pack,
          kept: st.pack,
        });
  return {
    summary,
    row: rowOf(st.start),
    rooms,
  };
}

/**
 * The replay of a stored run row, or null: a map run (it has a state) replays every fight played so
 * far; an older three-room run replays as it was stored.
 */
export function replayRun(
  deps: DungeonDeps,
  row: RunRow,
  userId: string,
): DungeonReplayView | null {
  const name = playerName(deps.storage.sql, userId);
  if (row.state_json !== null) return pathReplay(deps, row, name);
  if (row.input_json === null || row.result_json === null) return null;
  const input = JSON.parse(row.input_json) as DungeonRunInput;
  const result = JSON.parse(row.result_json) as { rooms: DungeonRoomResult[] };
  const rooms = result.rooms.map((r) => {
    const spec = input.rooms[r.index];
    if (spec === undefined) throw new Error('a stored run has no such room');
    return replayRoom(
      name,
      null,
      { input: { ...input, rooms: [spec] }, hpIn: r.index === 0 ? null : r.hpStart },
      r,
    );
  });
  return {
    summary: JSON.parse(row.summary_json) as DungeonRunSummary,
    row: rowOf(input.team),
    rooms,
  };
}
