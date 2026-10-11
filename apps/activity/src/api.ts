import { createReauth, type Reauth } from './reauth';

export interface AppConfig {
  discordClientId: string;
  environment: string;
  version: string;
  /** "mock" while leet points are simulated; anything else means a real leet source. */
  leetSource: string;
}

export interface Health {
  ok: boolean;
}

export interface SessionUser {
  id: string;
  displayName: string;
}

export interface SessionResult {
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

export interface Me {
  user: SessionUser;
  guildId: string;
  balances: Balances;
  leetSync: LeetSyncStatus;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSessionUser(value: unknown): value is SessionUser {
  return (
    isRecord(value) && typeof value['id'] === 'string' && typeof value['displayName'] === 'string'
  );
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
    leetSource: data['leetSource'],
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
  const data = await request('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, instanceId }),
  });
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

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);
const isNullableInt = (value: unknown): value is number | null => value === null || isInt(value);

export function isLeetSyncStatus(value: unknown): value is LeetSyncStatus {
  return (
    isRecord(value) &&
    (value['source'] === 'http' || value['source'] === 'mock' || value['source'] === 'disabled') &&
    isNullableInt(value['lastAttemptAt']) &&
    isNullableInt(value['lastSyncedAt']) &&
    (value['lastError'] === null || typeof value['lastError'] === 'string') &&
    isNullableInt(value['lastDays'])
  );
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
    leetSync: data['leetSync'],
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

export type DurationId = 'short' | 'medium' | 'long';
export type SuppliesId = 'basic' | 'good' | 'great';

export interface Creature {
  id: string;
  species: string;
  line: string;
  level: number;
  levelCap: number;
  fusionCount: number;
  shiny: boolean;
  nickname: string | null;
  away: boolean;
  /** Id of the creature's cosmetic personality quirk (text is in the shared lore data); null if unknown. */
  quirk: string | null;
  stats: { hp: number; atk: number; spd: number };
  /** Bait for the next level with the discount applied; null at the level cap. */
  trainCost: number | null;
  evolution?: { toSpecies: string; level: number; essence: number; available: boolean };
  /** The creature's finale ability; null for a species without one. */
  ability: CreatureAbility | null;
}

/** A creature's finale ability. `nextId` is the stronger one of its evolved form. */
export interface CreatureAbility {
  id: string;
  unlocked: boolean;
  unlockLevel: number;
  nextId?: string;
}

export interface CatchResult {
  species: string;
  shiny: boolean;
  outcome: 'new' | 'fused' | 'converted';
  fusionCount?: number;
  bait?: number;
  firstOnServer: boolean;
}

export interface ClaimResult {
  recalled: boolean;
  catches: CatchResult[];
}

export interface Expedition {
  id: string;
  creatureId: string;
  duration: DurationId;
  supplies: SuppliesId;
  rolls: number;
  cost: number;
  startedAt: number;
  endsAt: number;
  status: 'active' | 'claimed';
  claimedAt: number | null;
  result: ClaimResult | null;
}

export interface ServerFirst {
  /**
   * `jackpot` is the shared finale jackpot record (species `jackpot`); it is not a creature.
   * `festival` is the first win of a Festival creature (the species is that creature).
   */
  kind: 'catch' | 'evolve' | 'jackpot' | 'festival';
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
  slots: { total: number; used: number };
  trainingMedianLevel: number | null;
  serverFirsts: ServerFirst[];
  /** Present on GET /api/state only; action responses leave it out. */
  leetSync: LeetSyncStatus | null;
}

const isStr = (value: unknown): value is string => typeof value === 'string';
const isDuration = (value: unknown): value is DurationId =>
  value === 'short' || value === 'medium' || value === 'long';
const isSupplies = (value: unknown): value is SuppliesId =>
  value === 'basic' || value === 'good' || value === 'great';

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

function isCreature(value: unknown): value is Creature {
  if (!isRecord(value)) return false;
  const evolution = value['evolution'];
  return (
    isStr(value['id']) &&
    isStr(value['species']) &&
    isStr(value['line']) &&
    isInt(value['level']) &&
    isInt(value['levelCap']) &&
    isInt(value['fusionCount']) &&
    typeof value['shiny'] === 'boolean' &&
    (value['nickname'] === null || isStr(value['nickname'])) &&
    typeof value['away'] === 'boolean' &&
    (value['quirk'] === null || isStr(value['quirk'])) &&
    isStats(value['stats']) &&
    (value['trainCost'] === null || isInt(value['trainCost'])) &&
    (value['ability'] === null || isCreatureAbility(value['ability'])) &&
    (evolution === undefined ||
      (isRecord(evolution) &&
        isStr(evolution['toSpecies']) &&
        isInt(evolution['level']) &&
        isInt(evolution['essence']) &&
        typeof evolution['available'] === 'boolean'))
  );
}

function isCatch(value: unknown): value is CatchResult {
  return (
    isRecord(value) &&
    isStr(value['species']) &&
    typeof value['shiny'] === 'boolean' &&
    (value['outcome'] === 'new' ||
      value['outcome'] === 'fused' ||
      value['outcome'] === 'converted') &&
    (value['fusionCount'] === undefined || isInt(value['fusionCount'])) &&
    (value['bait'] === undefined || isInt(value['bait'])) &&
    typeof value['firstOnServer'] === 'boolean'
  );
}

function isClaimResult(value: unknown): value is ClaimResult {
  return (
    isRecord(value) &&
    typeof value['recalled'] === 'boolean' &&
    Array.isArray(value['catches']) &&
    value['catches'].every(isCatch)
  );
}

function isExpedition(value: unknown): value is Expedition {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['creatureId']) &&
    isDuration(value['duration']) &&
    isSupplies(value['supplies']) &&
    isInt(value['rolls']) &&
    isInt(value['cost']) &&
    isInt(value['startedAt']) &&
    isInt(value['endsAt']) &&
    (value['status'] === 'active' || value['status'] === 'claimed') &&
    (value['claimedAt'] === null || isInt(value['claimedAt'])) &&
    (value['result'] === null || isClaimResult(value['result']))
  );
}

function isServerFirst(value: unknown): value is ServerFirst {
  return (
    isRecord(value) &&
    (value['kind'] === 'catch' ||
      value['kind'] === 'evolve' ||
      value['kind'] === 'jackpot' ||
      value['kind'] === 'festival') &&
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
    !data['expeditions'].every(isExpedition) ||
    !isRecord(data['slots']) ||
    !isInt(data['slots']['total']) ||
    !isInt(data['slots']['used']) ||
    !(data['trainingMedianLevel'] === null || typeof data['trainingMedianLevel'] === 'number') ||
    !Array.isArray(data['serverFirsts']) ||
    !data['serverFirsts'].every(isServerFirst) ||
    !(data['leetSync'] === undefined || isLeetSyncStatus(data['leetSync'])) ||
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
    slots: { total: data['slots']['total'], used: data['slots']['used'] },
    trainingMedianLevel: data['trainingMedianLevel'],
    serverFirsts: data['serverFirsts'],
    leetSync: data['leetSync'] ?? null,
  };
}

function postJson(path: string, method: string, body: unknown): Promise<unknown> {
  return apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function stateFrom(data: unknown): GameState {
  return parseGameState(isRecord(data) ? data['state'] : undefined);
}

export async function fetchState(): Promise<GameState> {
  return parseGameState(await apiFetch('/api/state'));
}

export async function chooseStarter(species: string, idempotencyKey: string): Promise<GameState> {
  return stateFrom(await postJson('/api/starter', 'POST', { species, idempotencyKey }));
}

export async function startExpedition(input: {
  creatureId: string;
  duration: DurationId;
  supplies: SuppliesId;
  idempotencyKey: string;
}): Promise<GameState> {
  return stateFrom(await postJson('/api/expeditions', 'POST', input));
}

export async function claimExpedition(
  expeditionId: string,
): Promise<{ result: ClaimResult; state: GameState }> {
  // Claiming is idempotent on the server (an expedition is claimed once), so it needs no key.
  const data = await postJson(`/api/expeditions/${expeditionId}/claim`, 'POST', {});
  if (!isRecord(data) || !isClaimResult(data['result'])) {
    throw new Error('the server returned an unexpected claim result');
  }
  return { result: data['result'], state: stateFrom(data) };
}

export async function trainCreature(
  creatureId: string,
  idempotencyKey: string,
): Promise<GameState> {
  return stateFrom(
    await postJson(`/api/creatures/${creatureId}/train`, 'POST', { idempotencyKey }),
  );
}

export async function renameCreature(
  creatureId: string,
  nickname: string | null,
): Promise<GameState> {
  return stateFrom(await postJson(`/api/creatures/${creatureId}`, 'PATCH', { nickname }));
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
  const data = await postJson(`/api/creatures/${creatureId}/evolve`, 'POST', { idempotencyKey });
  if (!isRecord(data) || !isStr(data['species']) || typeof data['firstOnServer'] !== 'boolean') {
    throw new Error('the server returned an unexpected evolve result');
  }
  return { species: data['species'], firstOnServer: data['firstOnServer'], state: stateFrom(data) };
}
