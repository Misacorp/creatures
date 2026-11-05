import { describe, expect, it } from 'vitest';
import { SLOT_NUMBERS, type SlotTable } from '../src/track';
import { EASE_FLOOR, journeyPass, journeyPassSummary, probeJourney } from '../src/trackJourney';

describe('the track journey pass', () => {
  it('counts stuck servers per slot and one-weekend kills', () => {
    const p = probeJourney(SLOT_NUMBERS, 'expected', 3);
    expect(p.servers).toBe(3);
    expect(Object.values(p.stuckAt).reduce((n, c) => n + c, 0)).toBe(p.stuck);
    expect(p.reached[1]).toBe(3);
  });

  it('only eases slots in range, never below the floor, and leaves a track that meets the aim alone', () => {
    // A boss nobody kills on slot 1 is eased, but only slot 1, and only down to the floor.
    const hard: SlotTable = { ...SLOT_NUMBERS, 1: { ...SLOT_NUMBERS[1], hp: 400_000 } };
    const r = journeyPass(hard, { first: 1, last: 1, quick: true, servers: 2 });
    expect(r.table[2]).toEqual(hard[2]);
    const hp = hard[1]?.hp ?? 0;
    expect(r.table[1]?.hp).toBeGreaterThanOrEqual(Math.round((hp * EASE_FLOOR) / 100) * 100);
    expect(r.table[1]?.hp).toBeLessThan(hp);
    expect(r.reached).toBe(false);
    expect(r.atFloor).toContain(1);
    expect(journeyPassSummary(r, 1, 1).join('\n')).toContain('**Not reached.**');
    const calm = journeyPass(SLOT_NUMBERS, { first: 9, last: 9, quick: true, servers: 2 });
    expect(calm.table).toEqual(SLOT_NUMBERS);
  });
});
