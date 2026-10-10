export interface AppConfig {
  discordClientId: string;
  environment: string;
  version: string;
}

export interface Health {
  ok: boolean;
}

// Relative URLs on purpose: inside Discord they go through its proxy to the same origin.
async function getJson(path: string): Promise<unknown> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`${path} responded ${res.status}`);
  }
  return res.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function fetchConfig(): Promise<AppConfig> {
  const data = await getJson('/api/config');
  if (
    !isRecord(data) ||
    typeof data['discordClientId'] !== 'string' ||
    typeof data['environment'] !== 'string' ||
    typeof data['version'] !== 'string'
  ) {
    throw new Error('/api/config returned an unexpected shape');
  }
  return {
    discordClientId: data['discordClientId'],
    environment: data['environment'],
    version: data['version'],
  };
}

export async function fetchHealth(): Promise<Health> {
  const data = await getJson('/api/health');
  if (!isRecord(data) || typeof data['ok'] !== 'boolean') {
    throw new Error('/api/health returned an unexpected shape');
  }
  return { ok: data['ok'] };
}
