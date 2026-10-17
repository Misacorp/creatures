/**
 * The requests of expeditions v2. Sending a trip is free (supplies come from stock) and carries the
 * caller's idempotency key, which stays the same on a retry. Claiming and pushing on spend nothing and
 * are safe to repeat (the server stores the result), so they carry no key. Every trip answer brings the
 * fresh collection, so the screen replaces what it holds and never changes a number itself.
 */
import { apiFetch, jsonRequest, parseGameState, stateFrom, type GameState } from './api';
import { isTripResult, parseDestinations, parseProfile, parseTripAnswer } from './expedition-parse';
import type {
  DestinationsView,
  Profile,
  SendBody,
  SupplyPick,
  Trip,
  TripResult,
} from './expedition-types';

/** What the player chose for one trip (the idempotency key is added by the caller's key store). */
export interface SendRequest {
  creatureId: string;
  destination: string;
  duration: SendBody['duration'];
  supplies: SupplyPick[];
  /** Pack a treat for the explorer (Bait); absent: none. */
  treat?: boolean;
}

/** The body of POST /api/expeditions: exactly the keys the Worker's strict schema takes. */
export function sendBody(request: SendRequest, idempotencyKey: string): SendBody {
  return {
    creatureId: request.creatureId,
    destination: request.destination,
    duration: request.duration,
    supplies: request.supplies.map((pick) => ({ id: pick.id, source: pick.source })),
    // Only sent when asked for: a request without a treat is the body the server always took.
    ...(request.treat === true ? { treat: true } : {}),
    idempotencyKey,
  };
}

/** A trip answer: the trip and the fresh collection. */
interface TripAnswer {
  expedition: Trip;
  state: GameState;
}

/** Sends a creature. The supplies are taken from stock in the same transaction as the start (all or nothing). */
export async function sendExpedition(
  request: SendRequest,
  idempotencyKey: string,
): Promise<TripAnswer> {
  const answer = parseTripAnswer(
    await apiFetch('/api/expeditions', jsonRequest('POST', sendBody(request, idempotencyKey))),
  );
  return { expedition: answer.expedition, state: parseGameState(answer.state) };
}

/** Chooses one of the goals a finished trip offered; its extra hours count from the end of the trip. */
export async function pushOn(expeditionId: string, goalId: string): Promise<TripAnswer> {
  const answer = parseTripAnswer(
    await apiFetch(
      `/api/expeditions/${encodeURIComponent(expeditionId)}/push-on`,
      jsonRequest('POST', { goalId }),
    ),
  );
  return { expedition: answer.expedition, state: parseGameState(answer.state) };
}

/** Checks the answer of a claim: the result (loot, XP, stars, journal pages) and the fresh collection. */
export function parseClaimResponse(data: unknown): { result: TripResult; state: GameState } {
  const result =
    typeof data === 'object' && data !== null ? (data as { result?: unknown }).result : undefined;
  if (!isTripResult(result)) throw new Error('the server returned an unexpected claim result');
  return { result, state: stateFrom(data) };
}

/**
 * Claims a trip: home with everything, or (before it ends) a recall with what was caught so far.
 * Claiming is idempotent on the server (a trip is claimed once), so it needs no key.
 */
export async function claimExpedition(
  expeditionId: string,
): Promise<{ result: TripResult; state: GameState }> {
  return parseClaimResponse(
    await apiFetch(
      `/api/expeditions/${encodeURIComponent(expeditionId)}/claim`,
      jsonRequest('POST', {}),
    ),
  );
}

/** The places, who may go and what is closed, with the familiarity of every creature of the player. */
export async function fetchDestinations(): Promise<DestinationsView> {
  return parseDestinations(await apiFetch('/api/destinations'));
}

/** Account stats, milestones, the journal's progress and every creature's explorer rank. */
export async function fetchProfile(): Promise<Profile> {
  return parseProfile(await apiFetch('/api/profile'));
}
