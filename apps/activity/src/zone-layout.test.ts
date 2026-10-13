import { RULES } from '@creatures/game';
import { zoneSizes } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import {
  MIN_VIEWPORT_PX,
  ROW_LAYOUT,
  SLOT_FALLBACK_PX,
  SLOT_LAYOUT,
  STAGE_FALLBACK_PX,
  STAGE_LAYOUT,
  layoutVars,
  perLineOf,
  unitsAreaPx,
  zoneLayout,
  type LayoutConfig,
} from './zone-layout';

/** The biggest row the game can have, and every row length from one player's guests up to it. */
const MAX_ROW = RULES.raid.maxPartySize * RULES.raid.teamSize;
const ROW_LENGTHS = Array.from({ length: MAX_ROW }, (_, i) => i + 1);

/** The widest the room is when the zones must still fit: a 360 px phone. */
const CASES: [string, LayoutConfig, number][] = [
  ['stage', STAGE_LAYOUT, STAGE_FALLBACK_PX],
  ['slots', SLOT_LAYOUT, SLOT_FALLBACK_PX],
];

describe('zone layout', () => {
  it('has a biggest row of 45 creatures, 15 to a zone', () => {
    expect(MAX_ROW).toBe(45);
    expect(zoneSizes(MAX_ROW)).toEqual({ front: 15, middle: 15, back: 15 });
  });

  it('keeps the fallback widths inside a 360 px phone', () => {
    // main.card: 100% - 1.25rem, 1rem padding; .raid-section: 0.75rem padding; the stage: 3px
    // margin and 0.5rem padding.
    const card = MIN_VIEWPORT_PX - 20 - 32;
    expect(SLOT_FALLBACK_PX).toBeLessThanOrEqual(card - 24);
    expect(STAGE_FALLBACK_PX).toBeLessThanOrEqual(card - 24 - 6 - 16);
  });

  for (const [name, config, width] of CASES) {
    describe(name, () => {
      it('has tiers from big to small, and at least one unit fits in a line', () => {
        const widths = config.tiers.map((t) => t.unitPx);
        expect([...widths].sort((a, b) => b - a)).toEqual(widths);
        expect(unitsAreaPx(width, config)).toBeGreaterThanOrEqual(widths.at(-1) as number);
      });

      it('never lets a line be wider than the room, for any zone of any row', () => {
        for (const length of ROW_LENGTHS) {
          const sizes = zoneSizes(length);
          for (const count of [sizes.front, sizes.middle, sizes.back]) {
            if (count === 0) continue;
            const layout = zoneLayout(count, width, config);
            const used = Math.min(count, layout.perLine);
            const line = used * layout.tier.unitPx + (used - 1) * config.gapPx;
            expect(line, `${String(length)} slots, ${String(count)} in a zone`).toBeLessThanOrEqual(
              unitsAreaPx(width, config),
            );
          }
        }
      });

      it('takes at most four lines for the biggest zone at 360 px', () => {
        const layout = zoneLayout(15, width, config);
        expect(layout.lines).toBeLessThanOrEqual(4);
        expect(layout.tier).toBe(config.tiers.at(-1));
      });

      it('shrinks the sprites as the zone grows, and never grows them again', () => {
        let scale = Infinity;
        for (let count = 1; count <= 15; count++) {
          const next = zoneLayout(count, width, config).tier.scale;
          expect(next).toBeLessThanOrEqual(scale);
          scale = next;
        }
      });

      it('uses the biggest sprites for a small zone and a wide room', () => {
        expect(zoneLayout(3, width, config).tier).toBe(config.tiers[0]);
        expect(zoneLayout(3, width, config).lines).toBe(1);
        // A desktop-sized room fits a whole big zone on one line.
        expect(zoneLayout(15, 2000, config).tier).toBe(config.tiers[0]);
        expect(zoneLayout(15, 2000, config).lines).toBe(1);
      });

      it('still puts one unit on a line in a room that is too narrow', () => {
        const layout = zoneLayout(5, 10, config);
        expect(layout.perLine).toBe(1);
        expect(layout.lines).toBe(5);
      });
    });
  }

  it('fits the zones of a 9-slot row (3 players, or guests) in one line each at 360 px', () => {
    for (const [, config, width] of CASES) {
      const layout = zoneLayout(3, width, config);
      expect(layout.lines).toBe(1);
      expect(layout.tier.scale).toBe(3);
    }
  });

  it('counts how many units fit side by side', () => {
    expect(perLineOf(100, { scale: 2, unitPx: 40 }, 4)).toBe(2);
    expect(perLineOf(104, { scale: 2, unitPx: 40 }, 4)).toBe(2);
    expect(perLineOf(10, { scale: 2, unitPx: 40 }, 4)).toBe(1);
  });

  it('writes its numbers as custom properties for the stylesheet', () => {
    const layout = zoneLayout(15, STAGE_FALLBACK_PX, STAGE_LAYOUT);
    expect(layoutVars(layout, STAGE_LAYOUT)).toEqual({
      '--unit-w': `${String(layout.tier.unitPx)}px`,
      '--unit-gap': '2px',
      '--zone-label-w': '44px',
      '--zone-label-gap': '4px',
    });
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
