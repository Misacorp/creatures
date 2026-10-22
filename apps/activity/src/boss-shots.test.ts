import { describe, expect, it } from 'vitest';
import type { BossStrike } from './stage';
import { shotsOf } from './stage/BossShots';

const strike = (over: Partial<BossStrike>): BossStrike => ({
  action: 'attack',
  gimmick: null,
  targets: ['a'],
  zone: 'front',
  blocked: [],
  guarded: null,
  ...over,
});

describe('what flies for a boss action', () => {
  it('sends one crescent at the target of a plain attack, from the boss', () => {
    expect(shotsOf(strike({}))).toEqual([{ kind: 'arc', from: null, to: 'a', side: 1, lag: 0 }]);
  });

  it('sweeps a wave across each row of a zone hit, a sweep and the enrage round', () => {
    expect(shotsOf(strike({ action: 'hit_zone', targets: ['a', 'b'], zone: 'middle' }))).toEqual([
      { kind: 'wave', from: null, to: 'middle', row: true, side: 1, lag: 0 },
    ]);
    const sweep = shotsOf(strike({ action: 'sweep', rows: ['front', 'back'], targets: ['a', 'b'] }));
    expect(sweep.map((s) => [s.kind, s.to])).toEqual([
      ['wave', 'front'],
      ['wave', 'back'],
    ]);
  });

  it('jumps a chain from each creature to the next', () => {
    const chain = shotsOf(strike({ action: 'strike_highest_atk', targets: ['a', 'b', 'c'] }));
    expect(chain.map((s) => [s.from, s.to])).toEqual([
      [null, 'a'],
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });

  it('rains a barrage and a charge on its marks, spears a lane, closes a pincer, hexes a silence', () => {
    expect(shotsOf(strike({ action: 'barrage', targets: ['a', 'b'] })).map((s) => s.kind)).toEqual([
      'rain',
      'rain',
    ]);
    expect(
      shotsOf(strike({ action: 'charge', charged: true, targets: ['a'] })).map((s) => s.kind),
    ).toEqual(['rain']);
    expect(shotsOf(strike({ action: 'lance', targets: ['a', 'b', 'c'] }))).toEqual([
      { kind: 'spear', from: null, to: 'c', side: 1, lag: 0 },
    ]);
    expect(shotsOf(strike({ action: 'pincer', targets: ['a', 'b'] })).map((s) => s.side)).toEqual([
      -1, 1,
    ]);
    expect(shotsOf(strike({ action: 'silence_ends', targets: ['a', 'b'] }))[0]?.kind).toBe('hex');
  });

  it('staggers several shots a little, never past the middle of the flight', () => {
    const many = shotsOf(strike({ action: 'barrage', targets: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }));
    expect(many.every((s) => s.lag >= 0 && s.lag <= 0.6)).toBe(true);
    expect(many[1]?.lag).toBeGreaterThan(many[0]?.lag ?? 0);
  });

  it('sends nothing for the trap being armed', () => {
    expect(shotsOf(strike({ action: 'reflect_armed', targets: [] }))).toEqual([]);
  });
});
