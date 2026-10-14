import { beforeEach, describe, expect, it, vi } from 'vitest';
import raidAutofire from './fixtures/raid-autofire.json';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { buildRunRequest } from './dungeon-team';
import { placeCreature, unplaceCreature } from './raid-api';
import { resolveDrop } from './raid-dnd';
import { reduceTap, unplaceIntent, type Intent, type TapContext } from './raid-slots';

/**
 * What a placement sends to the server, byte for byte. The slot row refactor must not change a
 * single character of these bodies: the Worker's strict schemas read them.
 */
describe('the placement requests', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(raidAutofire);
  });

  function sent(): { path: string; method: string; body: string } {
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    return { path, method: init.method ?? 'GET', body: init.body as string };
  }

  it('a placement is PUT with the creature id then the slot', async () => {
    await placeCreature('creature-1', 4);
    expect(sent()).toEqual({
      path: '/api/raid/placement',
      method: 'PUT',
      body: '{"creatureId":"creature-1","slot":4}',
    });
  });

  it('taking a creature out is DELETE with the creature id only', async () => {
    await unplaceCreature('creature-1');
    expect(sent()).toEqual({
      path: '/api/raid/placement',
      method: 'DELETE',
      body: '{"creatureId":"creature-1"}',
    });
  });

  // The intents the three ways to place (tap, drop, the Unplace button) hand to those two calls.
  const ctx: TapContext = {
    locked: false,
    teamIds: ['a', 'b'],
    row: [
      {
        slot: 0,
        zone: 'front',
        creature: {
          ownerName: 'Me',
          species: 'cindle',
          name: 'A',
          level: 3,
          mine: true,
          creatureId: 'a',
        },
      },
      { slot: 1, zone: 'front', creature: null },
    ],
  };
  const wire = (intent: Intent | null): string[] =>
    intent === null
      ? []
      : intent.type === 'place'
        ? ['PUT', JSON.stringify({ creatureId: intent.creatureId, slot: intent.slot })]
        : ['DELETE', JSON.stringify({ creatureId: intent.creatureId })];

  it('a tap, a drop and the Unplace button build the same intents', () => {
    const tapped = reduceTap(ctx, 'a', { kind: 'slot', slot: 1 }).intent;
    const dropped = resolveDrop(ctx, 'a', 'A', { kind: 'slot', slot: 1 }).intent;
    expect(tapped).toEqual({ type: 'place', creatureId: 'a', slot: 1 });
    expect(dropped).toEqual(tapped);
    expect(wire(tapped)).toEqual(['PUT', '{"creatureId":"a","slot":1}']);

    const button = unplaceIntent(ctx.row, 'a').intent;
    const onTray = resolveDrop(ctx, 'a', 'A', { kind: 'tray' }).intent;
    expect(button).toEqual({ type: 'unplace', creatureId: 'a' });
    expect(onTray).toEqual(button);
    expect(wire(button)).toEqual(['DELETE', '{"creatureId":"a"}']);
  });
});

describe('the dungeon run request', () => {
  it('is the team in slot order, then the key, as exact JSON', () => {
    const request = buildRunRequest(['c', 'a', 'b'], 'key-00001');
    expect(JSON.stringify(request)).toBe('{"team":["c","a","b"],"idempotencyKey":"key-00001"}');
  });
});
