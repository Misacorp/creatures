/**
 * What the buttons of gear and the Workshop do. Each action asks the server (which decides), then
 * hands back both fresh views. Spends carry an idempotency key from the key store: the key stays the
 * same while the outcome is unknown (a retry then cannot spend twice) and is dropped after a definite
 * answer (see `actions.ts`). The screen never changes a balance itself.
 */
import type { GameState } from './api';
import * as api from './gear-api';
import type { GearAction } from './gear-api';
import type { GearState, JobResult, StartJobRequest } from './gear-types';

/** What `Game` gives the actions: how to run a guarded action, and which key an action has. */
export interface GearDeps {
  /** Runs one guarded action: one at a time, errors shown, state reloaded after a definite "no". */
  run: <T>(action: string, task: () => Promise<T>, currency?: string) => Promise<T | undefined>;
  keyFor: (action: string) => string;
  /** Replaces the collection and the gear view with the fresh ones of a response. */
  apply: (views: { gear: GearState; state: GameState }) => void;
  /** The server calls, replaceable in tests. */
  server?: Pick<
    typeof api,
    'equipGear' | 'upgradeGear' | 'dismantleGear' | 'startJob' | 'claimJob'
  >;
}

/** The key store's name for a job start: the same job on the same creature is the same action. */
export type JobStart = StartJobRequest extends infer R
  ? R extends StartJobRequest
    ? Omit<R, 'idempotencyKey'>
    : never
  : never;

export function startActionId(request: JobStart): string {
  switch (request.kind) {
    case 'craft':
      return `job:craft:${request.creatureId}:${request.blueprintId}`;
    case 'improve':
      return `job:improve:${request.creatureId}:${request.gearId}:${String(request.secondaryIndex)}`;
    case 'enchant':
      return `job:enchant:${request.creatureId}:${request.gearId}:${request.enchantId}`;
  }
}

export function createGearActions(deps: GearDeps) {
  const server = deps.server ?? api;

  async function guarded<R>(
    action: string,
    task: () => Promise<GearAction<R>>,
    currency?: string,
  ): Promise<R | undefined> {
    const done = await deps.run(action, task, currency);
    if (done === undefined) return undefined;
    deps.apply(done);
    return done.result;
  }

  return {
    /** Wear an item (or take it off with `null`). */
    equip: (gearId: string, creatureId: string | null) =>
      guarded(`equip:${gearId}:${creatureId ?? 'none'}`, () =>
        server.equipGear(gearId, creatureId),
      ),
    /** Costs Essence and scrap, so a refusal for money says Essence. */
    upgrade: (gearId: string) => {
      const action = `upgrade:${gearId}`;
      return guarded(action, () => server.upgradeGear(gearId, deps.keyFor(action)), 'Essence');
    },
    dismantle: (gearId: string) => {
      const action = `dismantle:${gearId}`;
      return guarded(action, () => server.dismantleGear(gearId, deps.keyFor(action)));
    },
    startJob: (request: JobStart) => {
      const action = startActionId(request);
      return guarded(action, () =>
        server.startJob({ ...request, idempotencyKey: deps.keyFor(action) }),
      );
    },
    claimJob: (jobId: string): Promise<JobResult | undefined> => {
      const action = `claim-job:${jobId}`;
      return guarded(action, () => server.claimJob(jobId, deps.keyFor(action)));
    },
  };
}

export type GearActions = ReturnType<typeof createGearActions>;
