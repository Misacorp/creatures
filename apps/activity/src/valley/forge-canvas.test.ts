import { describe, expect, it } from 'vitest';
import { sampleAnvil, shardWait } from './forge-sample';
import { anvilGlyph, anvilWorking, floorTotal } from './forge-canvas';

describe('the Forge’s anvils', () => {
  it('says what a smith does with a bubble glyph, and nothing at rest or paused', () => {
    expect(anvilGlyph(sampleAnvil('a1', null, []))).toBeNull();
    expect(
      anvilGlyph(sampleAnvil('a1', 'c1', [], { paused: { sinceHours: 1 } as never })),
    ).toBeNull();
    expect(anvilGlyph(sampleAnvil('a1', 'c1', []))).toBe('info');
    expect(anvilGlyph(shardWait('a1', 'c1', 'kelp-cap', 2))).toBe('warning');
  });

  it('hammers only while a piece is in hand and the smith is not tinkering or paused', () => {
    expect(anvilWorking(sampleAnvil('a1', 'c1', [{ id: 'o1' } as never]))).toBe(true);
    expect(anvilWorking(sampleAnvil('a1', 'c1', []))).toBe(false);
    expect(anvilWorking(sampleAnvil('a1', null, []))).toBe(false);
    expect(anvilWorking(shardWait('a1', 'c1', 'kelp-cap', 2))).toBe(false);
  });

  it('counts the pieces waiting on every floor', () => {
    expect(floorTotal([sampleAnvil('a1', 'c1', []), sampleAnvil('a2', 'c2', [])])).toBe(4);
  });
});
