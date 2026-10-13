/**
 * The requests of gear and the Workshop. Every spend (upgrade, dismantle, starting a job, claiming
 * one) carries the caller's idempotency key; the same key is sent again on a retry, so a repeat can
 * never spend twice. Every action answers `{ result, gear, state }` and both views are returned
 * fresh so the screen can replace what it holds.
 */
import { apiFetch, parseGameState, type GameState } from './api';
import {
  isRecord,
  parseDismantleResult,
  parseEquipResult,
  parseGearState,
  parseJobResult,
  parseStartJobResult,
  parseUpgradeResult,
} from './gear-parse';
import type {
  DismantleResult,
  EquipResult,
  GearState,
  JobResult,
  StartJobRequest,
  StartJobResult,
  UpgradeResult,
} from './gear-types';

/** An action's result with the gear view and the collection, both fresh. */
export interface GearAction<R> {
  result: R;
  gear: GearState;
  state: GameState;
}

function post(path: string, body: unknown): Promise<unknown> {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function action<R>(data: unknown, parseResult: (value: unknown) => R): GearAction<R> {
  if (!isRecord(data)) throw new Error('the server returned an unexpected gear response');
  return {
    result: parseResult(data['result']),
    gear: parseGearState(data['gear']),
    state: parseGameState(data['state']),
  };
}

/** The inventory, parts, blueprints, jobs and skills. The first call also gives the welcome kit, once. */
export async function fetchGear(): Promise<GearState> {
  return parseGearState(await apiFetch('/api/gear'));
}

/** Puts an item on a creature, or takes it off (`creatureId` null). Instant, so it needs no key. */
export async function equipGear(
  gearId: string,
  creatureId: string | null,
): Promise<GearAction<EquipResult>> {
  return action(
    await post(`/api/gear/${encodeURIComponent(gearId)}/equip`, { creatureId }),
    parseEquipResult,
  );
}

export async function upgradeGear(
  gearId: string,
  idempotencyKey: string,
): Promise<GearAction<UpgradeResult>> {
  return action(
    await post(`/api/gear/${encodeURIComponent(gearId)}/upgrade`, { idempotencyKey }),
    parseUpgradeResult,
  );
}

export async function dismantleGear(
  gearId: string,
  idempotencyKey: string,
): Promise<GearAction<DismantleResult>> {
  return action(
    await post(`/api/gear/${encodeURIComponent(gearId)}/dismantle`, { idempotencyKey }),
    parseDismantleResult,
  );
}

export async function startJob(request: StartJobRequest): Promise<GearAction<StartJobResult>> {
  return action(await post('/api/workshop/jobs', request), parseStartJobResult);
}

export async function claimJob(
  jobId: string,
  idempotencyKey: string,
): Promise<GearAction<JobResult>> {
  return action(
    await post(`/api/workshop/jobs/${encodeURIComponent(jobId)}/claim`, { idempotencyKey }),
    parseJobResult,
  );
}
