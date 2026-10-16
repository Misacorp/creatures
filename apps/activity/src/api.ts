import {
  isCancelledTrip,
  isExplorerView,
  isSlots,
  isSupplyStock,
  isTrip,
} from './expedition-parse';
import type {
  CancelledTrip,
  ExplorerView,
  Slots,
  Trip,
  TripCatch,
  TripResult,
} from './expedition-types';
import { isWornGear } from './gear-parse';
import { isCreatureTalents, isPendingCatch } from './talent-parse';
import type { CreatureTalents, PendingCatch } from './talent-types';
import type { CreatureGearFields, WornGear } from './gear-types';
import { isArrayOf, isInt, isNullableInt, isRecord, isStr } from './parse-core';
import { createReauth, type Reauth } from './reauth';
import { ROOM_SPOTS } from './sprites/room-art';

export interface AppConfig {
  discordClientId: string;
  environment: string;
  version: string;
  /** The deployed branch (shown in the footer, so Misa can see what is on staging); null when unknown. */
  branch: string | null;
  /** "mock" while leet points are simulated; anything else means a real leet source. */
  leetSource: string;
  /** True only on staging, where the server has the dev tools on (the debug panel loads). */
  devTools: boolean;
}

interface Health {
  ok: boolean;
}

export interface SessionUser {
  id: string;
  displayName: string;
}

interface SessionResult {
  /** Kept in memory by this module only; callers never need to touch it. */
  accessToken: string;
  user: SessionUser;
  guildId: string;
}

export interface Balances {
  bait: number;
  essence: number;
}

/** How healthy the server's leet sync is. `lastError` is an error kind, never a message. */
export interface LeetSyncStatus {
  source: 'http' | 'mock' | 'disabled';
  lastAttemptAt: number | null;
  lastSyncedAt: number | null;
  lastError: string | null;
  lastDays: number | null;
}

/** The daily Bait allowance the server paid on this request; it tells the player once (see allowance.ts in the worker). */
export interface Allowance {
  /** The game day it is for, as YYYY-MM-DD. */
  day: string;
  /** Whole Bait, more than zero. */
  amount: number;
}

export interface Me {
  user: SessionUser;
  guildId: string;
  balances: Balances;
  /** The allowance this request paid, or null when there is nothing new to tell. */
  allowance: Allowance | null;
  leetSync: LeetSyncStatus;
  /** True only on staging, where the server has the dev tools on. */
  devTools: boolean;
}

export interface LedgerEntry {
  id: number;
  currency: string;
  amount: number;
  source: string;
  createdAt: number;
  meta: Record<string, unknown> | null;
}

/** An API error carrying the server's machine-readable code (for example `guild_required`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    /** Extra detail some errors carry, for example why a nickname was refused. */
    readonly reason: string | null = null,
  ) {
    super(code === null ? `request failed (${String(status)})` : `request failed (${code})`);
    this.name = 'ApiError';
  }
}

// The session token lives only in this module variable: never localStorage, sessionStorage,
// cookies or the URL.
let sessionToken: string | null = null;

function isSessionUser(value: unknown): value is SessionUser {
  return (
    isRecord(value) && typeof value['id'] === 'string' && typeof value['displayName'] === 'string'
  );
}

/**
 * The init of a request that carries a JSON body (a POST unless the route wants another method).
 * Every client request with a body is built here, so the headers and the encoding are the same everywhere.
 */
export function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// Relative URLs on purpose: inside Discord they go through its proxy to the same origin.
async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const res = await fetch(path, { ...init, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body: fall through with null.
  }
  if (!res.ok) {
    const code = isRecord(body) && typeof body['error'] === 'string' ? body['error'] : null;
    const reason = isRecord(body) && typeof body['reason'] === 'string' ? body['reason'] : null;
    throw new ApiError(res.status, code, reason);
  }
  return body;
}

let reauth: Reauth | null = null;

/** Installs the silent sign-in used when the session expires (for example during a long expedition). */
export function setReauthenticator(reauthenticate: () => Promise<void>): void {
  reauth = createReauth({
    reauthenticate,
    isSessionExpired: (err) =>
      err instanceof ApiError && err.status === 401 && err.code === 'invalid_session',
  });
}

function authedRequest(path: string, init: RequestInit): Promise<unknown> {
  if (sessionToken === null) {
    return Promise.reject(new Error('Not signed in'));
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${sessionToken}`);
  return request(path, { ...init, headers });
}

/**
 * Like `fetch` for the API, but sends the session token as a bearer token. If the session has
 * expired it signs in again silently and retries once with the same request (same body, so the
 * same idempotency key).
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const attempt = () => authedRequest(path, init);
  return reauth === null ? attempt() : reauth.run(attempt);
}

export async function fetchConfig(): Promise<AppConfig> {
  const data = await request('/api/config');
  if (
    !isRecord(data) ||
    typeof data['discordClientId'] !== 'string' ||
    typeof data['environment'] !== 'string' ||
    typeof data['version'] !== 'string' ||
    typeof data['leetSource'] !== 'string'
  ) {
    throw new Error('/api/config returned an unexpected shape');
  }
  return {
    discordClientId: data['discordClientId'],
    environment: data['environment'],
    version: data['version'],
    branch: typeof data['branch'] === 'string' ? data['branch'] : null,
    leetSource: data['leetSource'],
    devTools: data['devTools'] === true,
  };
}

export async function fetchHealth(): Promise<Health> {
  const data = await request('/api/health');
  if (!isRecord(data) || typeof data['ok'] !== 'boolean') {
    throw new Error('/api/health returned an unexpected shape');
  }
  return { ok: data['ok'] };
}

/** Exchanges the Discord OAuth code for a session. Stores the session token in memory. */
export async function createSession(code: string, instanceId: string): Promise<SessionResult> {
  const data = await request('/api/auth/session', jsonRequest('POST', { code, instanceId }));
  if (
    !isRecord(data) ||
    typeof data['sessionToken'] !== 'string' ||
    typeof data['accessToken'] !== 'string' ||
    typeof data['guildId'] !== 'string' ||
    !isSessionUser(data['user'])
  ) {
    throw new Error('/api/auth/session returned an unexpected shape');
  }
  sessionToken = data['sessionToken'];
  return { accessToken: data['accessToken'], user: data['user'], guildId: data['guildId'] };
}

function isBalances(value: unknown): value is Balances {
  return (
    isRecord(value) &&
    typeof value['bait'] === 'number' &&
    Number.isInteger(value['bait']) &&
    typeof value['essence'] === 'number' &&
    Number.isInteger(value['essence'])
  );
}

function isLeetSyncStatus(value: unknown): value is LeetSyncStatus {
  return (
    isRecord(value) &&
    (value['source'] === 'http' || value['source'] === 'mock' || value['source'] === 'disabled') &&
    isNullableInt(value['lastAttemptAt']) &&
    isNullableInt(value['lastSyncedAt']) &&
    (value['lastError'] === null || typeof value['lastError'] === 'string') &&
    isNullableInt(value['lastDays'])
  );
}

/** A well-formed allowance from `/api/me`, or null (absent or malformed: nothing is shown). */
export function parseAllowance(value: unknown): Allowance | null {
  if (!isRecord(value)) return null;
  const { day, amount } = value;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) return null;
  return { day, amount };
}

export async function fetchMe(): Promise<Me> {
  const data = await apiFetch('/api/me');
  if (
    !isRecord(data) ||
    typeof data['guildId'] !== 'string' ||
    !isSessionUser(data['user']) ||
    !isBalances(data['balances']) ||
    !isLeetSyncStatus(data['leetSync'])
  ) {
    throw new Error('/api/me returned an unexpected shape');
  }
  return {
    user: data['user'],
    guildId: data['guildId'],
    balances: data['balances'],
    allowance: parseAllowance(data['allowance']),
    leetSync: data['leetSync'],
    devTools: data['devTools'] === true,
  };
}

function isLedgerEntry(value: unknown): value is LedgerEntry {
  return (
    isRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['currency'] === 'string' &&
    typeof value['amount'] === 'number' &&
    typeof value['source'] === 'string' &&
    typeof value['createdAt'] === 'number' &&
    (value['meta'] === null || isRecord(value['meta']))
  );
}

/** The signed-in player's most recent ledger entries, newest first. */
export async function fetchLedger(limit: number): Promise<LedgerEntry[]> {
  const data = await apiFetch(`/api/ledger?limit=${String(limit)}`);
  if (!isRecord(data) || !Array.isArray(data['entries']) || !data['entries'].every(isLedgerEntry)) {
    throw new Error('/api/ledger returned an unexpected shape');
  }
  return data['entries'];
}

// --- Game state ---

export interface Creature extends CreatureGearFields {
  id: string;
  species: string;
  line: string;
  level: number;
  levelCap: number;
  fusionCount: number;
  shiny: boolean;
  nickname: string | null;
  away: boolean;
  /** When it was caught (epoch ms): the older of two equally strong creatures ranks first. */
  caughtAt: number;
  /** Id of the creature's cosmetic personality quirk (text is in the shared lore data); null if unknown. */
  quirk: string | null;
  stats: { hp: number; atk: number; spd: number };
  /** Bait for the next level with the discount applied; null at the level cap. */
  trainCost: number | null;
  evolution?: { toSpecies: string; level: number; essence: number; available: boolean };
  /** The creature's finale ability; null for a species without one. */
  ability: CreatureAbility | null;
  /** What it has earned as an explorer (rank, XP and trips). */
  explorer: ExplorerView;
  /** 1, or 2 for a second creature Kept of a line with two branches. */
  lineSlot: number;
  /** Its talent slots, signature (epic species) and Talent Book. */
  talents: CreatureTalents;
}

/** A creature's finale ability. `nextId` is the stronger one of its evolved form. */
interface CreatureAbility {
  id: string;
  unlocked: boolean;
  unlockLevel: number;
  nextId?: string;
}

export type CatchResult = TripCatch;

/** What a claimed trip brought home (loot, XP, stars, journal pages, a push-on outcome). */
export type ClaimResult = TripResult;

/** One trip, as GET /api/state lists it (running ones and the recent claimed ones). */
export type Expedition = Trip;

export interface ServerFirst {
  /** `festival` is the first win of a Festival creature (the species is that creature). */
  kind: 'catch' | 'evolve' | 'festival';
  species: string;
  at: number;
  mine: boolean;
  holders: string[];
}

export interface GameState {
  serverNow: number;
  balances: Balances;
  starterChosen: boolean;
  starterOptions: string[];
  creatures: Creature[];
  expeditions: Expedition[];
  /** Trips called home when the slots were reset (expeditions v2). */
  cancelled: CancelledTrip[];
  slots: Slots;
  /** Supplies in stock: supply id to amount. */
  supplies: Record<string, number>;
  trainingMedianLevel: number | null;
  serverFirsts: ServerFirst[];
  /** Present on GET /api/state only; action responses leave it out. */
  leetSync: LeetSyncStatus | null;
  /** The guild's IANA timezone; present on GET /api/state only (null in action responses). */
  timezone: string | null;
  /** Duplicates waiting for a choice (Teach, Fuse, Release or Keep), oldest first; at most 10. */
  pending: PendingCatch[];
  /** What slotting a talent from a creature's Talent Book costs (Bait). */
  bookSlotBait: number;
  /** The creature that lounges in the living room; null when every creature is busy. */
  loungerId: string | null;
  /** The spot of the living room the player chose for their lounger; null: the room decides. */
  loungeSpot: LoungeSpot | null;
  /** What needs the player (the pips on the tabs); present on GET /api/state only, null otherwise or when unknown. */
  attention: Attention | null;
}

/**
 * What needs the player, as the server works it out: a dungeon run can start now, raid team
 * creatures are still to be placed this week, and when either could change by itself (server epoch
 * ms; null: no such time).
 */
export interface Attention {
  dungeon: boolean;
  raid: boolean;
  recheckAt: number | null;
}

/** Checks the attention block: absent or null means unknown (null); any other shape is refused. */
export function parseAttention(value: unknown): Attention | null {
  if (value === undefined || value === null) return null;
  if (
    !isRecord(value) ||
    typeof value['dungeon'] !== 'boolean' ||
    typeof value['raid'] !== 'boolean' ||
    !(value['recheckAt'] === undefined || value['recheckAt'] === null || isInt(value['recheckAt']))
  ) {
    throw new Error('the server returned an unexpected attention block');
  }
  return {
    dungeon: value['dungeon'],
    raid: value['raid'],
    recheckAt: value['recheckAt'] ?? null,
  };
}

/** A spot of the living room a player chose (`id` is a `ROOM_SPOTS` id) and the server time it was chosen. */
export interface LoungeSpot {
  id: string;
  at: number;
}

/**
 * Checks a chosen spot: null or `{ id, at }`. A well-formed spot whose id the room art does not have
 * (the spot was removed from the art) counts as no choice, so one stale spot never breaks a response.
 * A missing field (an older answer) also means no choice; any other shape is refused.
 */
export function parseLoungeSpot(value: unknown): LoungeSpot | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !isStr(value['id']) || !isInt(value['at'])) {
    throw new Error('the server returned an unexpected lounge spot');
  }
  const id = value['id'];
  return ROOM_SPOTS.some((spot) => spot.id === id) ? { id, at: value['at'] } : null;
}

function isStats(value: unknown): value is Creature['stats'] {
  return isRecord(value) && isInt(value['hp']) && isInt(value['atk']) && isInt(value['spd']);
}

function isCreatureAbility(value: unknown): value is CreatureAbility {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    typeof value['unlocked'] === 'boolean' &&
    isInt(value['unlockLevel']) &&
    (value['nextId'] === undefined || isStr(value['nextId']))
  );
}

function isCreatureGear(value: unknown): value is CreatureGearFields['gear'] {
  return isArrayOf(value, isWornGear);
}

function isBusy(value: unknown): value is CreatureGearFields['busy'] {
  return (
    value === null ||
    (isRecord(value) &&
      (value['kind'] === 'expedition' || value['kind'] === 'job') &&
      isStr(value['id']))
  );
}

function isCreature(value: unknown): value is Creature {
  if (!isRecord(value)) return false;
  const evolution = value['evolution'];
  return (
    isStats(value['statsWithGear']) &&
    isCreatureGear(value['gear']) &&
    isBusy(value['busy']) &&
    isStr(value['id']) &&
    isStr(value['species']) &&
    isStr(value['line']) &&
    isInt(value['level']) &&
    isInt(value['levelCap']) &&
    isInt(value['fusionCount']) &&
    isInt(value['caughtAt']) &&
    typeof value['shiny'] === 'boolean' &&
    (value['nickname'] === null || isStr(value['nickname'])) &&
    typeof value['away'] === 'boolean' &&
    (value['quirk'] === null || isStr(value['quirk'])) &&
    isStats(value['stats']) &&
    (value['trainCost'] === null || isInt(value['trainCost'])) &&
    (value['ability'] === null || isCreatureAbility(value['ability'])) &&
    isExplorerView(value['explorer']) &&
    isInt(value['lineSlot']) &&
    isCreatureTalents(value['talents']) &&
    (evolution === undefined ||
      (isRecord(evolution) &&
        isStr(evolution['toSpecies']) &&
        isInt(evolution['level']) &&
        isInt(evolution['essence']) &&
        typeof evolution['available'] === 'boolean'))
  );
}

function isServerFirst(value: unknown): value is ServerFirst {
  return (
    isRecord(value) &&
    (value['kind'] === 'catch' || value['kind'] === 'evolve' || value['kind'] === 'festival') &&
    isStr(value['species']) &&
    isInt(value['at']) &&
    typeof value['mine'] === 'boolean' &&
    Array.isArray(value['holders']) &&
    value['holders'].every(isStr)
  );
}

/** Checks the server's state payload and fills in `starterOptions` (absent once a starter is chosen). */
export function parseGameState(data: unknown): GameState {
  if (
    !isRecord(data) ||
    !isInt(data['serverNow']) ||
    !isBalances(data['balances']) ||
    typeof data['starterChosen'] !== 'boolean' ||
    !Array.isArray(data['creatures']) ||
    !data['creatures'].every(isCreature) ||
    !Array.isArray(data['expeditions']) ||
    !data['expeditions'].every(isTrip) ||
    !Array.isArray(data['cancelled']) ||
    !data['cancelled'].every(isCancelledTrip) ||
    !isSlots(data['slots']) ||
    !isSupplyStock(data['supplies']) ||
    !(data['trainingMedianLevel'] === null || typeof data['trainingMedianLevel'] === 'number') ||
    !Array.isArray(data['serverFirsts']) ||
    !data['serverFirsts'].every(isServerFirst) ||
    !Array.isArray(data['pending']) ||
    !data['pending'].every(isPendingCatch) ||
    !isInt(data['bookSlotBait']) ||
    !(data['leetSync'] === undefined || isLeetSyncStatus(data['leetSync'])) ||
    !(data['timezone'] === undefined || isStr(data['timezone'])) ||
    !(data['loungerId'] === null || isStr(data['loungerId'])) ||
    !(
      data['starterOptions'] === undefined ||
      (Array.isArray(data['starterOptions']) && data['starterOptions'].every(isStr))
    )
  ) {
    throw new Error('the server returned an unexpected game state');
  }
  return {
    serverNow: data['serverNow'],
    balances: data['balances'],
    starterChosen: data['starterChosen'],
    starterOptions: data['starterOptions'] ?? [],
    creatures: data['creatures'],
    expeditions: data['expeditions'],
    cancelled: data['cancelled'],
    slots: data['slots'],
    supplies: data['supplies'],
    trainingMedianLevel: data['trainingMedianLevel'],
    serverFirsts: data['serverFirsts'],
    pending: data['pending'],
    bookSlotBait: data['bookSlotBait'],
    leetSync: data['leetSync'] ?? null,
    timezone: data['timezone'] ?? null,
    loungerId: data['loungerId'],
    loungeSpot: parseLoungeSpot(data['loungeSpot']),
    attention: parseAttention(data['attention']),
  };
}

export function stateFrom(data: unknown): GameState {
  return parseGameState(isRecord(data) ? data['state'] : undefined);
}

export async function fetchState(): Promise<GameState> {
  return parseGameState(await apiFetch('/api/state'));
}

export async function chooseStarter(species: string, idempotencyKey: string): Promise<GameState> {
  return stateFrom(
    await apiFetch('/api/starter', jsonRequest('POST', { species, idempotencyKey })),
  );
}

export async function trainCreature(
  creatureId: string,
  idempotencyKey: string,
): Promise<GameState> {
  return stateFrom(
    await apiFetch(`/api/creatures/${creatureId}/train`, jsonRequest('POST', { idempotencyKey })),
  );
}

export async function renameCreature(
  creatureId: string,
  nickname: string | null,
): Promise<GameState> {
  return stateFrom(
    await apiFetch(`/api/creatures/${creatureId}`, jsonRequest('PATCH', { nickname })),
  );
}

export interface EvolveResult {
  /** The species the creature evolved into. */
  species: string;
  firstOnServer: boolean;
  state: GameState;
}

/** Evolves a creature for Essence. The idempotency key makes a retry return the same result. */
export async function evolveCreature(
  creatureId: string,
  idempotencyKey: string,
): Promise<EvolveResult> {
  const data = await apiFetch(
    `/api/creatures/${creatureId}/evolve`,
    jsonRequest('POST', { idempotencyKey }),
  );
  if (!isRecord(data) || !isStr(data['species']) || typeof data['firstOnServer'] !== 'boolean') {
    throw new Error('the server returned an unexpected evolve result');
  }
  return { species: data['species'], firstOnServer: data['firstOnServer'], state: stateFrom(data) };
}

/** Makes this creature the one that lounges in the living room. Answers the new lounger's id. */
export async function setLounger(creatureId: string): Promise<string> {
  const data = await apiFetch('/api/lounger', jsonRequest('PUT', { creatureId }));
  if (!isRecord(data) || !isStr(data['loungerId'])) {
    throw new Error('the server returned an unexpected lounger answer');
  }
  return data['loungerId'];
}

/** Chooses where the lounger sits in the living room (`null` clears the choice). Answers the stored choice. */
export async function setLoungeSpot(spotId: string | null): Promise<LoungeSpot | null> {
  const data = await apiFetch('/api/lounge-spot', jsonRequest('PUT', { spotId }));
  if (!isRecord(data) || data['spot'] === undefined) {
    throw new Error('the server returned an unexpected lounge spot answer');
  }
  return parseLoungeSpot(data['spot']);
}

/** One creature of a resident of the living room, as the room and its popover show it. */
export interface RoomCreature {
  id: string;
  species: string;
  shiny: boolean;
  level: number;
  nickname: string | null;
  quirk: string | null;
  craftingLevel: number;
  explorerRank: number;
  /** The items it wears (like `Creature.gear`), each with the text of its lines. */
  gear: RoomGear[];
}

/** A worn item in the living room: the state view's item fields plus the text of its lines ("Attack +6%"). */
export type RoomGear = WornGear & { lines: string[] };

/** A player in the living room: the name, the lounger (null when all their creatures are busy) and the spot they chose. */
export interface RoomResident {
  userId: string;
  name: string;
  creature: RoomCreature | null;
  /** The spot the player chose, if any; the room seats these first. */
  spot: LoungeSpot | null;
}

function isRoomGear(value: unknown): value is RoomGear {
  return isWornGear(value) && isArrayOf((value as { lines?: unknown }).lines, isStr);
}

function isRoomCreature(value: unknown): value is RoomCreature {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['species']) &&
    typeof value['shiny'] === 'boolean' &&
    isInt(value['level']) &&
    (value['nickname'] === null || isStr(value['nickname'])) &&
    (value['quirk'] === null || isStr(value['quirk'])) &&
    isInt(value['craftingLevel']) &&
    isInt(value['explorerRank']) &&
    isArrayOf(value['gear'], isRoomGear)
  );
}

function isRoomResident(value: unknown): value is Omit<RoomResident, 'spot'> & { spot?: unknown } {
  return (
    isRecord(value) &&
    isStr(value['userId']) &&
    isStr(value['name']) &&
    (value['creature'] === null || isRoomCreature(value['creature']))
  );
}

/** Checks the answer of POST /api/room. */
export function parseRoom(data: unknown): RoomResident[] {
  if (
    !isRecord(data) ||
    !Array.isArray(data['residents']) ||
    !data['residents'].every(isRoomResident)
  ) {
    throw new Error('/api/room returned an unexpected shape');
  }
  return data['residents'].map((resident) => ({
    userId: resident.userId,
    name: resident.name,
    creature: resident.creature,
    spot: parseLoungeSpot(resident.spot),
  }));
}

/** The loungers of these players (1 to 25 ids); players that are not in this guild are left out. */
export async function fetchRoom(userIds: readonly string[]): Promise<RoomResident[]> {
  return parseRoom(await apiFetch('/api/room', jsonRequest('POST', { userIds })));
}
