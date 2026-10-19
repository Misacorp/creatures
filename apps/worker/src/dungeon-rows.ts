/**
 * What the dungeon's replay and finish modules share with `Dungeon` (`dungeon.ts`): its deps, the
 * stored rows and their JSON shapes, and the plain reads of the player's progress and a run's fights.
 * Types and reads only; nothing here opens a transaction.
 */
import { type Rng } from '@creatures/game';
import { type DungeonRunInput, type FightSlot } from '@creatures/engine';
import type { Analytics } from './analytics';
import { type DevFlags } from './dev-state';
import { type LedgerStorage } from './ledger';
import type {
  DungeonOutcome,
  DungeonRewards,
  DungeonRunState,
  DungeonStepLog,
  ReplayRowEntry,
} from './dungeon-types';
import type { Weather } from './weather';

export interface DungeonDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for the day's seed and every die of a run (fight seeds, events, camp offers). Crypto in production. */
  rng: Rng;
  /** Live randomness for the gear and shard rolls. Crypto in production. */
  gearRng: Rng;
  /** The guild's timezone (an IANA name). Read once per request and passed down. */
  timezone: () => string;
  analytics?: Analytics | undefined;
  /** The dev tools' force flags (staging only): the day's modifiers can be picked. Absent in production. */
  dev?: DevFlags | undefined;
  /** The valley's weather: every run is fought under the day's Boon and Omen. Absent: none. */
  weather?: Weather | undefined;
}

// --- Storage ---

export type RunRow = {
  id: string;
  user_id: string;
  day: string;
  attempt: number;
  idempotency_key: string;
  fingerprint: string;
  depth: number;
  seed: string;
  cleared: number;
  rooms_cleared: number;
  input_json: string | null;
  result_json: string | null;
  summary_json: string;
  rewards_json: string;
  created_at: number;
  status: 'active' | 'done';
  state_json: string | null;
  outcome: DungeonOutcome | null;
};

export type StepRow = {
  run_id: string;
  step: number;
  idempotency_key: string;
  act_json: string;
  node: string | null;
  seed: string | null;
  input_json: string | null;
  result_json: string | null;
};

/** What a fight's step stores in `input_json`: the run's input with the room, and the HP the row came in with. */
export interface StoredFight {
  input: DungeonRunInput;
  hpIn: Record<string, number> | null;
}

/** What `act_json` keeps: the act (for telling a retry from another request), the state it left (without the map) and whether it ended the run. */
export interface StoredAct {
  act: unknown;
  /** Emptied (missing) once the answer is past `ACT_ANSWER_RETENTION_MS`. `history` is missing in answers stored before the room log. */
  state?: Omit<DungeonRunState, 'map' | 'history'> & { history?: DungeonStepLog[] };
  ended: boolean;
}

export type ProgressRow = {
  depth: number;
  streak: number;
  last_day: string | null;
  first_day: string | null;
  runs: number;
  clears: number;
};

export const FRESH_PROGRESS: ProgressRow = {
  depth: 1,
  streak: 0,
  last_day: null,
  first_day: null,
  runs: 0,
  clears: 0,
};

/** A row of slots as the replay shows it, left to right. */
export const rowOf = (
  team: readonly Pick<FightSlot, 'id' | 'name' | 'speciesId' | 'element' | 'role' | 'level'>[],
): ReplayRowEntry[] =>
  team.map((s, position) => ({
    position,
    id: s.id,
    name: s.name,
    species: s.speciesId,
    element: s.element,
    role: s.role,
    level: s.level,
  }));

export const emptyRewards = (): DungeonRewards => ({
  bait: 0,
  essence: 0,
  parts: {},
  gear: [],
  converted: [],
  supplies: [],
  landmark: false,
  streak: null,
});

/** The player's dungeon progress (a fresh row for a player who never ran). */
export function progressOf(sql: SqlStorage, userId: string): ProgressRow {
  return (
    sql
      .exec<ProgressRow>(
        'SELECT depth, streak, last_day, first_day, runs, clears FROM dungeon_progress WHERE user_id = ?',
        userId,
      )
      .toArray()[0] ?? { ...FRESH_PROGRESS }
  );
}

/** The fights a run has played (the steps that have a node), in order. */
export function fightRows(sql: SqlStorage, runId: string): StepRow[] {
  return sql
    .exec<StepRow>(
      'SELECT * FROM dungeon_steps WHERE run_id = ? AND node IS NOT NULL ORDER BY step',
      runId,
    )
    .toArray();
}
