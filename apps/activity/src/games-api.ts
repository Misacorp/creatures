/**
 * The Valley Games requests (`apps/worker/src/games-routes.ts`). The tab's view is a plain read; an
 * entry is a set (a repeat is harmless, so it carries no key); a stall purchase spends
 * medal points and carries the caller's idempotency key, so a retry never pays twice.
 */
import { apiFetch, jsonRequest } from './api';
import {
  parseCreatureGames,
  parseEntryAnswer,
  parseGamesView,
  parseStallPurchase,
} from './games-parse';
import type { CreatureGames, GamesNext, GamesView, StallPurchase } from './games-types';

/** The whole Games tab. Up to a few hundred KB while a show is stored: fetch it only when needed. */
export async function fetchGames(): Promise<GamesView> {
  return parseGamesView(await apiFetch('/api/games'));
}

/** Sets the player's creatures in one event of a show day (an empty list clears it). */
export async function setGamesEntry(
  day: string,
  eventId: string,
  creatureIds: readonly string[],
): Promise<GamesNext> {
  return parseEntryAnswer(
    await apiFetch(
      '/api/games/entry',
      jsonRequest('PUT', { day, eventId, creatureIds: [...creatureIds] }),
    ),
  );
}

/** Buys one offer of the Prize Stall. */
export async function buyStallOffer(
  offerId: string,
  idempotencyKey: string,
): Promise<StallPurchase> {
  return parseStallPurchase(
    await apiFetch('/api/games/stall/buy', jsonRequest('POST', { offerId, idempotencyKey })),
  );
}

/** A creature's medals, event badges and best scores. */
export async function fetchCreatureGames(creatureId: string): Promise<CreatureGames> {
  return parseCreatureGames(
    await apiFetch(`/api/games/creature/${encodeURIComponent(creatureId)}`),
  );
}
