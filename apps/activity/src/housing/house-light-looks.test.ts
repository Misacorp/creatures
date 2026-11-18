import { afterEach, describe, expect, it } from 'vitest';
import { shade, type Material } from './house-light';
import { TWILIGHT_LOOKS, applyTwilightLook, twilightLookOf } from './house-light-looks';

const SAMPLES: readonly (readonly [number, number, number])[] = [
  [217, 190, 160],
  [120, 140, 200],
  [200, 90, 110],
  [60, 120, 70],
];
const MATERIALS: readonly Material[] = ['wall', 'floor', 'exterior', 'auto'];

function colours(phase: 'day' | 'twilight' | 'night'): string {
  return JSON.stringify(
    MATERIALS.flatMap((m) => SAMPLES.map((c) => [0, 3].map((l) => shade(c, m, phase, l as 0 | 3)))),
  );
}

describe('twilight look options (dev only)', () => {
  const shipped = { twilight: colours('twilight'), day: colours('day'), night: colours('night') };
  afterEach(() => {
    applyTwilightLook('A0');
  });

  it('A0 is exactly what ships', () => {
    applyTwilightLook('A0');
    expect(colours('twilight')).toBe(shipped.twilight);
  });

  it('A1 to A3 change twilight and leave day and night pixel-identical', () => {
    for (const look of TWILIGHT_LOOKS.filter((l) => l !== 'A0')) {
      applyTwilightLook(look);
      expect(colours('twilight'), look).not.toBe(shipped.twilight);
      expect(colours('day'), look).toBe(shipped.day);
      expect(colours('night'), look).toBe(shipped.night);
    }
  });

  it('A1 has less saturation than A0 on a wall', () => {
    const sat = ([r, g, b]: readonly number[]): number =>
      (Math.max(r ?? 0, g ?? 0, b ?? 0) - Math.min(r ?? 0, g ?? 0, b ?? 0)) /
      Math.max(1, Math.max(r ?? 0, g ?? 0, b ?? 0));
    const wall = SAMPLES[0] ?? [0, 0, 0];
    const a0 = sat(shade(wall, 'wall', 'twilight', 0));
    applyTwilightLook('A1');
    expect(sat(shade(wall, 'wall', 'twilight', 0))).toBeLessThan(a0);
  });

  it('reads only a known look name', () => {
    expect(twilightLookOf('A2')).toBe('A2');
    expect(twilightLookOf('A9')).toBeNull();
    expect(twilightLookOf(undefined)).toBeNull();
  });
});
