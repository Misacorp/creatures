import { RULES } from '@creatures/game';
import { zoneSizes } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import {
  MIN_VIEWPORT_PX,
  GRID_SCALE,
  ROW_LAYOUT,
  STAGE_FALLBACK_PX,
  layoutVars,
  perLineOf,
  unitsAreaPx,
  zoneLayout,
} from './zone-layout';

/** The biggest row the game can have. */
const MAX_ROW = RULES.raid.maxPartySize * RULES.raid.teamSize;

describe('zone layout', () => {
  it('has a biggest row of 45 creatures, 15 to a zone', () => {
    expect(MAX_ROW).toBe(45);
    expect(zoneSizes(MAX_ROW)).toEqual({ front: 15, middle: 15, back: 15 });
  });

  it('keeps the fallback widths inside a 360 px phone', () => {
    // main.card: 100% - 1.25rem, 1rem padding; .raid-section: 0.75rem padding; the stage: 3px
    // margin and 0.5rem padding.
    const card = MIN_VIEWPORT_PX - 20 - 32;
    expect(STAGE_FALLBACK_PX).toBeLessThanOrEqual(card - 24 - 6 - 16);
  });

  it('counts how many units fit side by side', () => {
    expect(perLineOf(100, { scale: 2, unitPx: 40 }, 4)).toBe(2);
    expect(perLineOf(104, { scale: 2, unitPx: 40 }, 4)).toBe(2);
    expect(perLineOf(10, { scale: 2, unitPx: 40 }, 4)).toBe(1);
  });

  it('writes its numbers as custom properties for the stylesheet', () => {
    const layout = zoneLayout(3, STAGE_FALLBACK_PX, ROW_LAYOUT);
    expect(layoutVars(layout, ROW_LAYOUT)).toEqual({
      '--unit-w': `${String(layout.tier.unitPx)}px`,
      '--unit-gap': '4px',
      '--zone-label-w': '0px',
      '--zone-label-gap': '0px',
    });
  });

  it('draws the raid stage grid with small sprites, like the placement board', () => {
    expect(GRID_SCALE).toBe(2);
  });
});

describe('the dungeon row layout', () => {
  /** The three creatures of a run and the width of the line they stand on. */
  const lay = (width: number) => zoneLayout(3, width, ROW_LAYOUT);
  const lineOf = (width: number) => {
    const { tier } = lay(width);
    return 3 * tier.unitPx + 2 * ROW_LAYOUT.gapPx;
  };

  it('has no label column and tiers from big to small', () => {
    expect(ROW_LAYOUT.labelPx).toBe(0);
    const widths = ROW_LAYOUT.tiers.map((t) => t.unitPx);
    expect([...widths].sort((a, b) => b - a)).toEqual(widths);
  });

  it('keeps all three creatures on one line at every width from a 360 px phone up', () => {
    for (let width = STAGE_FALLBACK_PX; width <= 1200; width += 7) {
      const layout = lay(width);
      expect(layout.lines, `${String(width)} px`).toBe(1);
      expect(lineOf(width), `${String(width)} px`).toBeLessThanOrEqual(
        unitsAreaPx(width, ROW_LAYOUT),
      );
    }
  });

  it('picks the biggest size that fits, so the row grows with the room and never shrinks with it', () => {
    let previous = 0;
    for (let width = STAGE_FALLBACK_PX; width <= 1200; width += 7) {
      const { tier } = lay(width);
      expect(tier.scale).toBeGreaterThanOrEqual(previous);
      previous = tier.scale;
      // A bigger tier would not have fitted.
      const bigger = ROW_LAYOUT.tiers.find((t) => t.scale === tier.scale + 1);
      if (bigger !== undefined) {
        expect(3 * bigger.unitPx + 2 * ROW_LAYOUT.gapPx).toBeGreaterThan(
          unitsAreaPx(width, ROW_LAYOUT),
        );
      }
    }
  });

  it('depends on the width alone: the same for any room, round or creature', () => {
    // The size is a function of the measured width and the count only, which is always 3.
    expect(lay(300)).toEqual(lay(300));
    expect(layoutVars(lay(300), ROW_LAYOUT)['--unit-w']).toBe(`${String(lay(300).tier.unitPx)}px`);
  });
});
