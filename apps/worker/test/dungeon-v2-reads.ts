// A dungeon day on combat v2 for the read checks (`read-budget-v2.test.ts`, `query-plan-audit.test.ts`,
// `read-day.test.ts`): start, the rooms to the camp, the camp's rest, the rooms on to the end, and the replay,
// through the real routes of the seeded month-old guild (`read-world.ts`) with the flag on. Foes are made easy so
// the run reaches its camp whatever the seeded levels (the reads of a fight do not depend on its length).
import { combatV2 } from '@creatures/game/combat-v2';
import type { DungeonActResponse, DungeonStartResponse } from '../src/dungeon';
import type { DungeonRunState } from '../src/dungeon-types';
import { routeThrough } from './dungeon-helpers';

/** How strong the v2 foes are (the pack's scale, basis points of their content numbers); returns what puts it back. */
export function scaleV2Foes(hpBp: number, atkBp: number): () => void {
  const scales = [combatV2.foeScale, combatV2.foeUndercroft.scale];
  const before = scales.map((s) => ({ ...s }));
  for (const s of scales) {
    s.hpBp = hpBp;
    s.atkBp = atkBp;
  }
  return () => {
    scales.forEach((s, i) => {
      s.hpBp = before[i]?.hpBp ?? s.hpBp;
      s.atkBp = before[i]?.atkBp ?? s.atkBp;
    });
  };
}

/** One request to the guild as a player: the parsed body (as `callAs` answers). */
export type Api = (method: string, path: string, body?: unknown) => Promise<unknown>;

/** Wraps one named step of the day, so a test can measure it. The default just runs it. */
export type Step = <T>(label: string, run: () => Promise<T>) => Promise<T>;

export interface V2DayResult {
  runId: string;
  /** The acts played, by label. */
  acts: string[];
  ended: boolean;
}

/**
 * Plays a v2 dungeon day for the player behind `api`: `team` is the row. Steps are labelled `start`, `room` (the
 * first fight), `camp` (the rest), `act` (every other act) and `replay`. Stops when the run ends or after 14 acts.
 */
export async function playV2Day(
  api: Api,
  team: readonly string[],
  key: string,
  step: Step = (_label, run) => run(),
): Promise<V2DayResult> {
  const started = (await step('start', () =>
    api('POST', '/api/dungeon/start', { team, idempotencyKey: `${key}-start` }),
  )) as DungeonStartResponse & { error?: string };
  if (started.state === undefined)
    throw new Error(`the run did not start: ${JSON.stringify(started)}`);
  let state: DungeonRunState = started.state;
  const route = routeThrough(state.map, (n) => n.kind === 'camp') as string[];
  const acts: string[] = [];
  let fights = 0;
  for (let n = 0; n < 14 && state.status === 'active'; n++) {
    let act: unknown;
    let label = 'act';
    if (state.pending?.kind === 'camp') {
      act = { type: 'camp', choice: 'rest' };
      label = 'camp';
    } else if (state.pending?.kind === 'event') {
      act = { type: 'event', option: state.pending.event.id === 'sealed-vault' ? 1 : 0 };
    } else if (state.pending?.kind === 'descend') {
      act = { type: 'home' };
    } else {
      const to = route[state.path.length] ?? state.reachable[0];
      act = { type: 'move', node: to };
      const kind = state.map.nodes.find((m) => m.id === to)?.kind;
      if (kind === 'fight' || kind === 'elite' || kind === 'boss') {
        fights++;
        if (fights === 1) label = 'room';
      }
    }
    const answer = (await step(label, () =>
      api('POST', '/api/dungeon/act', {
        runId: state.id,
        step: state.step,
        idempotencyKey: `${key}-act-${String(n)}`,
        act,
      }),
    )) as DungeonActResponse & { error?: string };
    if (answer.state === undefined) throw new Error(`an act failed: ${JSON.stringify(answer)}`);
    acts.push(label);
    state = answer.state;
  }
  await step('replay', () => api('GET', `/api/dungeon/run/${state.id}`));
  return { runId: state.id, acts, ended: state.status === 'done' };
}
