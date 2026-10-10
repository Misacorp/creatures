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

export interface Me {
  user: SessionUser;
  guildId: string;
  balances: Balances;
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
    throw new ApiError(res.status, code);
  }
  return body;
}

/** Like `fetch` for the API, but sends the session token as a bearer token. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  if (sessionToken === null) {
    return Promise.reject(new Error('Not signed in'));
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${sessionToken}`);
  return request(path, { ...init, headers });
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

export async function fetchMe(): Promise<Me> {
  const data = await apiFetch('/api/me');
  if (
    !isRecord(data) ||
    typeof data['guildId'] !== 'string' ||
    !isSessionUser(data['user']) ||
    !isBalances(data['balances'])
  ) {
    throw new Error('/api/me returned an unexpected shape');
  }
  return { user: data['user'], guildId: data['guildId'], balances: data['balances'] };
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
