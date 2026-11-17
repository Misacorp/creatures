/**
 * The sealed crate's pictures (`crate-art.ts`, the Art session's set `valley-forge-crate`): sizes, that the open crate stands on the sealed
 * crate's base row, the glow alts for rare and epic by night and by day, and that every burst keeps its centre
 * clear for the item.
 */
import { describe, expect, it } from 'vitest';
import { parseSprite, type SpriteDef } from '../sprites/sprite-data';
import { BURST, CRATE_OPEN, CRATE_SEALED, burstSprite, crateSprite } from './crate-art';
import { RATTLE } from './crate-view';

const size = (def: SpriteDef) => ({ w: def.rows[0]?.length ?? 0, h: def.rows.length });
const NIGHT = { night: true } as const;

describe('the crate art', () => {
  it('has the sealed crate and its shakes at one size, and the open crate 9 rows taller on the same base', () => {
    for (const frame of ['sealed', 'shake-1', 'shake-2', 'shake-3'] as const) {
      expect(size(crateSprite(frame, { ...NIGHT, best: 'rare' }))).toEqual({
        w: CRATE_SEALED.w,
        h: CRATE_SEALED.h,
      });
    }
    expect(size(crateSprite('open', { ...NIGHT, best: 'rare' }))).toEqual({
      w: CRATE_OPEN.w,
      h: CRATE_OPEN.h,
    });
    // The base rows line up: the taller picture's base row is the sealed base row, shifted by the extra rows.
    expect(CRATE_OPEN.base - CRATE_SEALED.base).toBe(CRATE_OPEN.h - CRATE_SEALED.h);
  });

  it('plays the rattle from frames that all exist', () => {
    for (const frame of RATTLE) {
      expect(() => parseSprite(crateSprite(frame, { ...NIGHT, best: 'epic' }))).not.toThrow();
    }
  });

  it('glows blue for a rare best and pink-violet for an epic one, deeper by day', () => {
    const glow = (best: 'rare' | 'epic', night: boolean) =>
      crateSprite('sealed', { best, night }).palette['G'];
    expect(glow('rare', true)).toBe('#4da3ff');
    expect(glow('epic', true)).toBe('#ff6fbf');
    expect(glow('rare', false)).not.toBe(glow('rare', true));
    expect(glow('epic', false)).not.toBe(glow('epic', true));
    expect(glow('epic', false)).not.toBe(glow('rare', false));
  });

  it('draws each rarity burst at 48 x 48 with the centre left clear for the item', () => {
    for (const rarity of ['common', 'rare', 'epic'] as const) {
      const burst = burstSprite(rarity);
      expect(size(burst)).toEqual({ w: BURST.size, h: BURST.size });
      for (let y = BURST.centre; y < BURST.centre + BURST.centreSize; y += 1) {
        const row = burst.rows[y] ?? '';
        expect(
          row.slice(BURST.centre, BURST.centre + BURST.centreSize),
          `${rarity} row ${String(y)}`,
        ).toBe('.'.repeat(BURST.centreSize));
      }
    }
  });
});
