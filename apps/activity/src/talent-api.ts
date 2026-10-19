/**
 * The requests of the duplicate choice and the Talent Book. Every answer carries the caller's idempotency
 * key (the same key is sent again on a retry, so a repeat can never do it twice) and returns the fresh
 * collection, which is where the waiting cards and the creatures' talents are.
 */
import { apiFetch, jsonRequest, parseGameState, type GameState } from './api';
import { isRecord } from './parse-core';
import { isChoiceResult, isSlotResult } from './talent-parse';
import type { ChoiceRequest, ChoiceResult, SlotResult } from './talent-types';

/** What an answer gives back: what happened, and the collection as it is now. */
export interface ChoiceAnswer {
  result: ChoiceResult;
  state: GameState;
}

export interface SlotAnswer {
  result: SlotResult;
  state: GameState;
}

/** Answers one waiting duplicate (`recommended` does what the card marks Recommended). */
export async function chooseCatch(
  pendingId: string,
  request: ChoiceRequest,
  idempotencyKey: string,
): Promise<ChoiceAnswer> {
  const data = await apiFetch(
    `/api/catches/${encodeURIComponent(pendingId)}/choose`,
    jsonRequest('POST', { ...request, idempotencyKey }),
  );
  if (!isRecord(data) || !isChoiceResult(data['result'])) {
    throw new Error('the server returned an unexpected catch choice');
  }
  return { result: data['result'], state: parseGameState(data['state']) };
}

/** Puts a talent from a creature's Talent Book into one of its open slots (costs Bait). */
export async function slotTalent(
  creatureId: string,
  talent: { talentId: string; golden: boolean; slot: number },
  idempotencyKey: string,
): Promise<SlotAnswer> {
  const data = await apiFetch(
    `/api/creatures/${encodeURIComponent(creatureId)}/talents/slot`,
    jsonRequest('POST', { ...talent, idempotencyKey }),
  );
  if (!isRecord(data) || !isSlotResult(data['result'])) {
    throw new Error('the server returned an unexpected talent slotting');
  }
  return { result: data['result'], state: parseGameState(data['state']) };
}
