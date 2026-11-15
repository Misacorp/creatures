import { describe, expect, it } from 'vitest';
import { fullPackCount } from './signpost-canvas';
import { sampleSeat } from './signpost-sample';

describe('the Signpost map’s packs button', () => {
  it('counts the seats that have a scout and a full pack', () => {
    expect(
      fullPackCount([
        sampleSeat('a', 'x', 'c1', 80),
        sampleSeat('b', 'x', null, 80),
        sampleSeat('c', 'x', 'c2', 5),
      ]),
    ).toBe(1);
  });
});
