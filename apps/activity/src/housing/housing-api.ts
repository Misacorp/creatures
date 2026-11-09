/**
 * The housing requests (`docs/design/housing.md` 3.4; the routes are `apps/worker/src/housing-routes.ts`). Every answer is parsed
 * with the strict schema of `housing/view.ts` in the game package (the worker's tests parse the same ones), so a shape change
 * fails both sides; an answer of the wrong shape is a failed request. Spending requests (build, craft, collect, gift) carry the
 * caller's idempotency key, so a retry never pays twice. The caller's own house is under `/api/house`, other houses under
 * `/api/houses`.
 */
import {
  BuildAnswerSchema,
  CatalogueViewSchema,
  CollectAnswerSchema,
  CraftAnswerSchema,
  GiftAnswerSchema,
  HouseAnswerSchema,
  HouseListViewSchema,
  HousemateAnswerSchema,
  PlaceAnswerSchema,
  SeenAnswerSchema,
  SkinAnswerSchema,
  StampAnswerSchema,
  VisitAnswerSchema,
  parseHouseAnswer,
  type CatalogueView,
  type HousePay,
  type HouseListView,
} from '@creatures/game';
import { apiFetch, jsonRequest } from '../api';

/** A schema of `housing/view.ts` (valibot's own type is not a dependency of the activity). */
type Schema = Parameters<typeof parseHouseAnswer>[0];
/** What parsing with the schema gives. */
type Out<S extends Schema> = NonNullable<ReturnType<typeof parseHouseAnswer<S>>>;

export type HouseAnswer = Out<typeof HouseAnswerSchema>;
export type VisitAnswer = Out<typeof VisitAnswerSchema>;
export type BuildAnswer = Out<typeof BuildAnswerSchema>;
export type CraftAnswer = Out<typeof CraftAnswerSchema>;
export type PlaceAnswer = Out<typeof PlaceAnswerSchema>;
export type SkinAnswer = Out<typeof SkinAnswerSchema>;
export type HousemateAnswer = Out<typeof HousemateAnswerSchema>;
export type GiftAnswer = Out<typeof GiftAnswerSchema>;
export type StampAnswer = Out<typeof StampAnswerSchema>;
export type CollectAnswer = Out<typeof CollectAnswerSchema>;

/** What `PUT /api/house/skin` takes: a room's wallpaper and floor, or the exterior's roof and walls. */
export type SkinBody =
  | { target: 'room'; roomId: string; wall?: string; floor?: string }
  | { target: 'exterior'; roof?: string; walls?: string };

/** The answer in its schema's shape, or an error the screen shows as a failed load. */
function parsed<S extends Schema>(schema: S, data: unknown, what: string): Out<S> {
  const answer = parseHouseAnswer(schema, data);
  if (answer === undefined) throw new Error(`the server returned an unexpected ${what}`);
  return answer as Out<S>;
}

/** A path piece made safe for a URL (ids are plain, this is belt and braces). */
const enc = encodeURIComponent;

export async function fetchOwnHouse(): Promise<HouseAnswer> {
  return parsed(HouseAnswerSchema, await apiFetch('/api/house'), 'house');
}

export async function fetchHouse(userId: string): Promise<VisitAnswer> {
  return parsed(VisitAnswerSchema, await apiFetch(`/api/houses/${enc(userId)}`), 'house');
}

export async function fetchHouses(): Promise<HouseListView> {
  return parsed(HouseListViewSchema, await apiFetch('/api/houses'), 'house list');
}

export async function fetchCatalogue(): Promise<CatalogueView> {
  return parsed(CatalogueViewSchema, await apiFetch('/api/house/catalogue'), 'catalogue');
}

export async function buildPart(partId: string, pay: HousePay, key: string): Promise<BuildAnswer> {
  return parsed(
    BuildAnswerSchema,
    await apiFetch('/api/house/build', jsonRequest('POST', { partId, pay, idempotencyKey: key })),
    'build answer',
  );
}

export async function craftItem(itemId: string, key: string): Promise<CraftAnswer> {
  return parsed(
    CraftAnswerSchema,
    await apiFetch('/api/house/craft', jsonRequest('POST', { itemId, idempotencyKey: key })),
    'craft answer',
  );
}

export async function placePiece(
  roomId: string,
  spotId: string,
  pieceId: string | null,
): Promise<PlaceAnswer> {
  return parsed(
    PlaceAnswerSchema,
    await apiFetch('/api/house/place', jsonRequest('PUT', { roomId, spotId, pieceId })),
    'place answer',
  );
}

export async function setSkin(body: SkinBody): Promise<SkinAnswer> {
  return parsed(
    SkinAnswerSchema,
    await apiFetch('/api/house/skin', jsonRequest('PUT', body)),
    'skin answer',
  );
}

export async function setHousemate(
  roomId: string,
  spotId: string,
  creatureId: string | null,
): Promise<HousemateAnswer> {
  return parsed(
    HousemateAnswerSchema,
    await apiFetch('/api/house/housemate', jsonRequest('PUT', { roomId, spotId, creatureId })),
    'housemate answer',
  );
}

export async function giftHouse(userId: string, key: string): Promise<GiftAnswer> {
  return parsed(
    GiftAnswerSchema,
    await apiFetch(`/api/houses/${enc(userId)}/gift`, jsonRequest('POST', { idempotencyKey: key })),
    'gift answer',
  );
}

export async function stampHouse(userId: string, stampId: string): Promise<StampAnswer> {
  return parsed(
    StampAnswerSchema,
    await apiFetch(`/api/houses/${enc(userId)}/stamp`, jsonRequest('POST', { stampId })),
    'stamp answer',
  );
}

export async function collectMail(key: string): Promise<CollectAnswer> {
  return parsed(
    CollectAnswerSchema,
    await apiFetch('/api/house/mail/collect', jsonRequest('POST', { idempotencyKey: key })),
    'mail answer',
  );
}

/** Tells the server the player has seen the new materials (clears their "+N"). */
export async function markSeen(): Promise<void> {
  parsed(SeenAnswerSchema, await apiFetch('/api/house/seen', jsonRequest('POST', {})), 'answer');
}

/** The words for the refusals the house routes give (a code the table lacks gets the game's generic line). */
export const HOUSE_ERRORS: Readonly<Record<string, string>> = {
  already_built: 'That part is already built.',
  part_locked: 'Build the part before it first.',
  nothing_to_pay: 'There is nothing to pay in.',
  insufficient_funds: 'Not enough Acorns.',
  insufficient_parts: 'Not enough scrap or shards.',
  insufficient_materials: 'Not enough materials.',
  not_known: 'You do not know how to make that yet.',
  already_owned: 'You already have that.',
  spot_mismatch: 'That does not fit there.',
  none_free: 'Every copy is already placed.',
  not_owned: 'You do not have that.',
  skin_mismatch: 'That does not fit there.',
  creature_not_found: 'That creature is not yours.',
  not_a_bed: 'Only a bed has a housemate.',
  housemate_cap: 'The house has all the housemates it can hold.',
  already_housemate: 'That creature sleeps elsewhere.',
  own_house: 'That is your own house.',
  gift_used_today: 'You gave a gift today.',
  gift_cap_reached: 'They have had enough gifts today.',
  stamp_used_today: 'You stamped here today.',
  stamp_not_owned: 'You do not have that stamp.',
  nothing_to_collect: 'Nothing in the mailbox.',
  no_house: 'That house is gone.',
  not_found: 'That is gone.',
  key_conflict: 'That did not go through. Try again.',
};
