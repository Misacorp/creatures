import { describe, expect, it } from 'vitest';
import gearState from './fixtures/gear-state.json';
import { parseGearState } from './gear-parse';
import { originText, PRIZE_STALL } from './gear-view';
import { describeEntry } from './ledger-text';

/**
 * The Valley Games' Prize Stall grants gear with `origin: { kind: 'games' }` and records its grants
 * with `source: 'games'` (`apps/worker/src/games-stall.ts`); the bag reads both and names them.
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('Prize Stall prizes in the bag', () => {
  it('reads an item from the stall and a stall grant, and names where they came from', () => {
    const raw = clone(gearState) as {
      items: Record<string, unknown>[];
      grants: Record<string, unknown>[];
    };
    const item = raw.items[0] as Record<string, unknown>;
    item['origin'] = { kind: 'games' };
    item['source'] = 'games';
    (raw.grants[0] as Record<string, unknown>)['source'] = 'games';
    const state = parseGearState(raw);
    expect(state.items[0]?.origin).toEqual({ kind: 'games' });
    expect(state.grants).toHaveLength(raw.grants.length);
    expect(state.grants[0]?.source).toBe('games');
    expect(originText({ kind: 'games' }, 'games')).toBe(PRIZE_STALL);
    expect(originText(null, 'games')).toBe(PRIZE_STALL);
  });

  it('still drops a grant from a source it does not know', () => {
    const raw = clone(gearState) as { grants: Record<string, unknown>[] };
    (raw.grants[0] as Record<string, unknown>)['source'] = 'lottery';
    expect(parseGearState(raw).grants).toHaveLength(raw.grants.length - 1);
  });

  it('names Bait from the stall in the ledger', () => {
    expect(
      describeEntry({
        id: 1,
        currency: 'bait',
        amount: 30,
        source: 'games',
        createdAt: 0,
        meta: { offer: 'bait-sack' },
      }),
    ).toBe('+30 Bait · Prize Stall');
  });
});
