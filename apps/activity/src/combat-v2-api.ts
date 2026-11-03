/**
 * The requests of combat v2 on a creature (apps/worker/src/collection-routes.ts): saving its Knack, learning a talent
 * from its line's Talent Book (costs Bait, with an idempotency key) and slotting a learned talent (free). They answer
 * 404 unless the server's `COMBAT_V2` flag is on. Each answer returns the fresh collection.
 */
import { apiFetch, jsonRequest, parseGameState, type GameState } from './api';
import { isRecord, isStr } from './parse-core';

/** Which screen a Knack was saved from (the server counts it, nothing else). */
export type KnackWhere = 'page' | 'raid';

export interface KnackAnswer {
  /** The Knack now saved (an id), or null for none. */
  knack: string | null;
  state: GameState;
}

/** Saves a creature's Knack (`null`: none). Free, and saving the same one again changes nothing. */
export async function saveKnack(
  creatureId: string,
  knack: string | null,
  where: KnackWhere,
): Promise<KnackAnswer> {
  const data = await apiFetch(
    `/api/creatures/${encodeURIComponent(creatureId)}/knack`,
    jsonRequest('PUT', { knack, where }),
  );
  if (!isRecord(data) || !(data['knack'] === null || isStr(data['knack']))) {
    throw new Error('the server returned an unexpected Knack answer');
  }
  return { knack: data['knack'], state: parseGameState(data['state']) };
}

export interface TalentAnswerV2 {
  creatureId: string;
  talentId: string;
  /** The slot it is in now; null when it was taken out of its slot (or only learned). */
  slot: number | null;
  state: GameState;
}

/** A creature learns a talent from its line's book for Bait, once. It is learned, not slotted. */
export async function learnTalentV2(
  creatureId: string,
  talentId: string,
  idempotencyKey: string,
): Promise<TalentAnswerV2> {
  const data = await apiFetch(
    `/api/creatures/${encodeURIComponent(creatureId)}/talents-v2/learn`,
    jsonRequest('POST', { talentId, idempotencyKey }),
  );
  if (!isRecord(data) || !isRecord(data['result']) || !isStr(data['result']['talentId'])) {
    throw new Error('the server returned an unexpected talent learning');
  }
  return {
    creatureId,
    talentId: data['result']['talentId'],
    slot: null,
    state: parseGameState(data['state']),
  };
}

/** Puts a learned talent into one of the creature's open slots, or (`slot` null) takes it out. Free. */
export async function slotTalentV2(
  creatureId: string,
  talentId: string,
  slot: number | null,
): Promise<TalentAnswerV2> {
  const data = await apiFetch(
    `/api/creatures/${encodeURIComponent(creatureId)}/talents-v2/slot`,
    jsonRequest('PUT', { talentId, slot }),
  );
  if (
    !isRecord(data) ||
    !isRecord(data['result']) ||
    !isStr(data['result']['talentId']) ||
    !(data['result']['slot'] === null || typeof data['result']['slot'] === 'number')
  ) {
    throw new Error('the server returned an unexpected talent slotting');
  }
  return {
    creatureId,
    talentId: data['result']['talentId'],
    slot: data['result']['slot'],
    state: parseGameState(data['state']),
  };
}
