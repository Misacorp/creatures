/**
 * What the buttons of gear and the Workshop do. Each action asks the server (which decides), then
 * hands back both fresh views. Spends carry an idempotency key from the runner: the key stays the
 * same while the outcome is unknown (a retry then cannot spend twice) and is dropped after a definite
 * answer (see `actions.ts`). The screen never changes a balance itself.
 */
import { ActionIds, type JobStart } from './actions';
import type { ActionRunner } from './action-runner';
import type { GameState } from './api';
import * as api from './gear-api';
import type { GearAction } from './gear-api';
import type { GearState, JobResult } from './gear-types';

/** What `Game` gives the actions: how to run a guarded action, and where the answer goes. */
export interface GearDeps {
  /** Runs one guarded action: one at a time, errors shown, state reloaded after a definite "no". */
  run: ActionRunner['run'];
  /** The same for an action with an idempotency key. */
  runKeyed: ActionRunner['runKeyed'];
  /** Replaces the collection and the gear view with the fresh ones of a response. */
  apply: (views: { gear: GearState; state: GameState }) => void;
  /** The server calls, replaceable in tests. */
  server?: Pick<
    typeof api,
    'equipGear' | 'upgradeGear' | 'dismantleGear' | 'startJob' | 'claimJob'
  >;
}

export function createGearActions(deps: GearDeps) {
  const server = deps.server ?? api;

  /** Applies the answer of a guarded call, and hands back its result. */
  async function applied<R>(pending: Promise<GearAction<R> | undefined>): Promise<R | undefined> {
    const done = await pending;
    if (done === undefined) return undefined;
    deps.apply(done);
    return done.result;
  }

  return {
    /** Wear an item (or take it off with `null`). */
    equip: (gearId: string, creatureId: string | null) =>
      applied(deps.run(() => server.equipGear(gearId, creatureId))),
    /** Costs Essence and scrap, so a refusal for money says Essence. */
    upgrade: (gearId: string) =>
      applied(
        deps.runKeyed(ActionIds.upgrade(gearId), (key) => server.upgradeGear(gearId, key), {
          currency: 'Essence',
        }),
      ),
    dismantle: (gearId: string) =>
      applied(
        deps.runKeyed(ActionIds.dismantle(gearId), (key) => server.dismantleGear(gearId, key)),
      ),
    startJob: (request: JobStart) =>
      applied(
        deps.runKeyed(ActionIds.job(request), (key) =>
          server.startJob({ ...request, idempotencyKey: key }),
        ),
      ),
    claimJob: (jobId: string): Promise<JobResult | undefined> =>
      applied(deps.runKeyed(ActionIds.claimJob(jobId), (key) => server.claimJob(jobId, key))),
  };
}

export type GearActions = ReturnType<typeof createGearActions>;
