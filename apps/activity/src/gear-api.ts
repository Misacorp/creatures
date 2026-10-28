/**
 * The requests of gear and the Workshop. Every spend (starting a job, claiming
 * one) carries the caller's idempotency key; the same key is sent again on a retry, so a repeat can
 * never spend twice. Every action answers `{ result, gear, state }` and both views are returned
 * fresh so the screen can replace what it holds.
 */
import { apiFetch, jsonRequest, parseGameState, type GameState } from './api';
import { isRecord } from './parse-core';
import {
  parseCraftPreview,
  parseDismantlePreview,
  parseDismissResult,
  parseEquipBestResult,
  parseEquipResult,
  parseGearState,
  parseDismantleResult,
  parseJobResult,
  parseDismantleCheck,
  parseStartJobResult,
} from './gear-parse';
import type {
  CraftPreview,
  DismantlePreview,
  DismissResult,
  EquipBestResult,
  EquipResult,
  GearState,
  JobResult,
  DismantleCheck,
  StartJobRequest,
  StartJobResult,
} from './gear-types';

/** An action's result with the gear view and the collection, both fresh. */
export interface GearAction<R> {
  result: R;
  gear: GearState;
  state: GameState;
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
    await apiFetch(
      `/api/gear/${encodeURIComponent(gearId)}/equip`,
      jsonRequest('POST', { creatureId }),
    ),
    parseEquipResult,
  );
}

/**
 * "Equip best" for one creature or a team (at most 24): the server picks the best item each slot may
 * wear from the bag and from what these creatures wear now, and says what changed. Instant, so no key.
 */
export async function equipBestGear(
  creatureIds: readonly string[],
): Promise<GearAction<EquipBestResult>> {
  return action(
    await apiFetch('/api/gear/equip-best', jsonRequest('POST', { creatureIds })),
    parseEquipBestResult,
  );
}

/** Dismisses the one-time card about the switch to gear v2. */
export async function dismissGearNotice(): Promise<GearAction<DismissResult>> {
  return action(
    await apiFetch('/api/gear/conversion/dismiss', jsonRequest('POST', {})),
    parseDismissResult,
  );
}

/**
 * What a craft of a blueprint would give with a creature: the exact odds, parts, Essence, time and XP of
 * every way to start it. Changes nothing, so it needs no key.
 */
export async function previewCraft(creatureId: string, blueprintId: string): Promise<CraftPreview> {
  const data = await apiFetch(
    '/api/workshop/preview',
    jsonRequest('POST', { kind: 'craft', creatureId, blueprintId }),
  );
  return parseCraftPreview(isRecord(data) ? data['result'] : undefined);
}

/** What taking these items apart would give with a creature: the refund range, time and blueprint chance. */
export async function previewDismantle(
  creatureId: string,
  itemIds: readonly string[],
): Promise<DismantlePreview> {
  const data = await apiFetch(
    '/api/workshop/preview',
    jsonRequest('POST', { kind: 'dismantle', creatureId, itemIds }),
  );
  return parseDismantlePreview(isRecord(data) ? data['result'] : undefined);
}

/**
 * Which of these items cannot be dismantled right now (worn by a creature that is away or on a job whose claim
 * reads the item). Changes nothing, so it needs no key.
 */
export async function checkDismantle(itemIds: readonly string[]): Promise<DismantleCheck> {
  const data = await apiFetch('/api/gear/dismantle-check', jsonRequest('POST', { itemIds }));
  return parseDismantleCheck(isRecord(data) ? data['result'] : undefined);
}

/**
 * Dismantles the named items with one free creature (worn ones come off their wearer). The request names the
 * exact items the confirmation showed. Carries a key.
 */
export async function dismantlePile(
  creatureId: string,
  itemIds: readonly string[],
  idempotencyKey: string,
): Promise<GearAction<Extract<JobResult, { kind: 'dismantle' }>>> {
  return action(
    await apiFetch(
      '/api/gear/dismantle',
      jsonRequest('POST', { creatureId, itemIds, idempotencyKey }),
    ),
    parseDismantleResult,
  );
}

export async function startJob(request: StartJobRequest): Promise<GearAction<StartJobResult>> {
  return action(
    await apiFetch('/api/workshop/jobs', jsonRequest('POST', request)),
    parseStartJobResult,
  );
}

export async function claimJob(
  jobId: string,
  idempotencyKey: string,
): Promise<GearAction<JobResult>> {
  return action(
    await apiFetch(
      `/api/workshop/jobs/${encodeURIComponent(jobId)}/claim`,
      jsonRequest('POST', { idempotencyKey }),
    ),
    parseJobResult,
  );
}
