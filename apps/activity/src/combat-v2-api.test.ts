import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_STATE } from './creature-card-sample';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { fetchConfig } from './api';
import { learnTalentV2, saveKnack, slotTalentV2 } from './combat-v2-api';

beforeEach(() => {
  apiFetch.mockReset();
});

const lastRequest = () => {
  const [path, init] = apiFetch.mock.calls.at(-1) as [string, RequestInit];
  return { path, method: init.method, body: JSON.parse(init.body as string) as unknown };
};

describe('the combat v2 requests', () => {
  it('saves a Knack with PUT to the creature’s path, and none as null', async () => {
    apiFetch.mockResolvedValue({ knack: 'steady-mark', state: SAMPLE_STATE });
    const saved = await saveKnack('c 1', 'steady-mark', 'page');
    expect(saved.knack).toBe('steady-mark');
    expect(lastRequest()).toEqual({
      path: '/api/creatures/c%201/knack',
      method: 'PUT',
      body: { knack: 'steady-mark', where: 'page' },
    });
    apiFetch.mockResolvedValue({ knack: null, state: SAMPLE_STATE });
    expect((await saveKnack('c1', null, 'raid')).knack).toBeNull();
    expect(lastRequest().body).toEqual({ knack: null, where: 'raid' });
  });

  it('learns with POST and the idempotency key', async () => {
    apiFetch.mockResolvedValue({
      result: { creatureId: 'c1', talentId: 'hardy' },
      state: SAMPLE_STATE,
    });
    const learned = await learnTalentV2('c1', 'hardy', 'key-9');
    expect(learned).toMatchObject({ creatureId: 'c1', talentId: 'hardy', slot: null });
    expect(lastRequest()).toEqual({
      path: '/api/creatures/c1/talents-v2/learn',
      method: 'POST',
      body: { talentId: 'hardy', idempotencyKey: 'key-9' },
    });
  });

  it('slots with PUT, a number or null', async () => {
    apiFetch.mockResolvedValue({
      result: { creatureId: 'c1', talentId: 'hardy', slot: 2 },
      state: SAMPLE_STATE,
    });
    expect((await slotTalentV2('c1', 'hardy', 2)).slot).toBe(2);
    expect(lastRequest()).toEqual({
      path: '/api/creatures/c1/talents-v2/slot',
      method: 'PUT',
      body: { talentId: 'hardy', slot: 2 },
    });
    apiFetch.mockResolvedValue({
      result: { creatureId: 'c1', talentId: 'hardy', slot: null },
      state: SAMPLE_STATE,
    });
    expect((await slotTalentV2('c1', 'hardy', null)).slot).toBeNull();
  });

  it('refuses answers of the wrong shape', async () => {
    apiFetch.mockResolvedValue({ knack: 3, state: SAMPLE_STATE });
    await expect(saveKnack('c1', null, 'page')).rejects.toThrow();
    apiFetch.mockResolvedValue({ result: { creatureId: 'c1' }, state: SAMPLE_STATE });
    await expect(learnTalentV2('c1', 'hardy', 'k')).rejects.toThrow();
    apiFetch.mockResolvedValue({ result: { talentId: 'hardy', slot: 'two' }, state: SAMPLE_STATE });
    await expect(slotTalentV2('c1', 'hardy', 2)).rejects.toThrow();
  });
});

describe('the combat v2 flag of /api/config', () => {
  it('is on only for an explicit true', async () => {
    const base = { discordClientId: '1', environment: 'local', version: 'dev', leetSource: 'mock' };
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, combatV2: true })));
    expect((await fetchConfig()).combatV2).toBe(true);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(base)));
    expect((await fetchConfig()).combatV2).toBe(false);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, combatV2: 'on' })));
    expect((await fetchConfig()).combatV2).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('the valley flag of /api/config', () => {
  it('is on only for an explicit true', async () => {
    const base = { discordClientId: '1', environment: 'local', version: 'dev', leetSource: 'mock' };
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, valley: true })));
    expect((await fetchConfig()).valley).toBe(true);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(base)));
    expect((await fetchConfig()).valley).toBe(false);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, valley: 'on' })));
    expect((await fetchConfig()).valley).toBe(false);
    vi.unstubAllGlobals();
  });
});
