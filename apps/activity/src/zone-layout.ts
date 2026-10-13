/**
 * How the zones of the row are laid out, on the fight stage and in the Placement strip. Each zone is
 * a horizontal row with its label at the left, its creatures centred and wrapping onto more lines
 * when they do not fit, so nothing ever scrolls sideways. When a zone is long the sprites shrink
 * (a smaller tier) instead. Pure: the components measure their width and ask which tier to use. The
 * numbers here are written to the stylesheet as CSS custom properties, so they cannot drift apart.
 */

/** One size of creature: the sprite scale and the width of one unit (sprite, name and padding). */
export interface Tier {
  /** Whole screen pixels per sprite pixel. */
  scale: number;
  /** Width of one unit, in CSS pixels. */
  unitPx: number;
}

export interface LayoutConfig {
  /** The sizes, biggest first. */
  tiers: readonly Tier[];
  /** Space between units, in CSS pixels. */
  gapPx: number;
  /** Width of the zone label column. */
  labelPx: number;
  /** Space between the label and the units. */
  labelGapPx: number;
  /** Padding of the zone (both sides together). */
  padPx: number;
}

/** The fight stage: 16x16 sprites at scale 3 or 2, with the name under each. */
export const STAGE_LAYOUT: LayoutConfig = {
  tiers: [
    { scale: 3, unitPx: 52 },
    { scale: 2, unitPx: 38 },
  ],
  gapPx: 2,
  labelPx: 44,
  labelGapPx: 4,
  padPx: 8,
};

/**
 * The dungeon's single row: the three creatures side by side, bigger than in the zone rows because
 * nothing else shares the line (no label column). The tier is picked for the whole row, so all three
 * share one size and it only changes if the window does, never between rooms or rounds.
 */
export const ROW_LAYOUT: LayoutConfig = {
  tiers: [
    { scale: 6, unitPx: 104 },
    { scale: 5, unitPx: 88 },
    { scale: 4, unitPx: 72 },
    { scale: 3, unitPx: 56 },
    { scale: 2, unitPx: 40 },
  ],
  gapPx: 4,
  labelPx: 0,
  labelGapPx: 0,
  padPx: 8,
};

/** The Placement strip: slot buttons with the sprite, species, level and owner. */
export const SLOT_LAYOUT: LayoutConfig = {
  tiers: [
    { scale: 3, unitPx: 72 },
    { scale: 2, unitPx: 56 },
  ],
  gapPx: 4,
  labelPx: 44,
  labelGapPx: 4,
  padPx: 0,
};

/** The narrowest phone the Activity supports (Discord's viewport is at least this wide). */
export const MIN_VIEWPORT_PX = 360;

/** The width the zone rows have at that phone width; used until the real width has been measured. */
export const STAGE_FALLBACK_PX = 262;
export const SLOT_FALLBACK_PX = 284;

export interface ZoneLayout {
  tier: Tier;
  /** How many units fit on one line. */
  perLine: number;
  /** How many lines the zone takes. */
  lines: number;
}

/** The width left for the units of a zone, given the width of the whole row of zones. */
export function unitsAreaPx(containerPx: number, config: LayoutConfig): number {
  return Math.max(0, containerPx - config.padPx - config.labelPx - config.labelGapPx);
}

/** How many units of this tier fit side by side in `areaPx` (at least one). */
export function perLineOf(areaPx: number, tier: Tier, gapPx: number): number {
  return Math.max(1, Math.floor((areaPx + gapPx) / (tier.unitPx + gapPx)));
}

/**
 * The tier for a zone with `count` units in a row of zones `containerPx` wide: the biggest tier that
 * keeps the zone on one line, otherwise the smallest one (which wraps onto as few lines as it can).
 */
export function zoneLayout(count: number, containerPx: number, config: LayoutConfig): ZoneLayout {
  const area = unitsAreaPx(containerPx, config);
  const n = Math.max(0, Math.trunc(count));
  const measured = config.tiers.map((tier) => {
    const perLine = perLineOf(area, tier, config.gapPx);
    return { tier, perLine, lines: Math.max(1, Math.ceil(n / perLine)) };
  });
  const fits = measured.find((m) => m.lines <= 1);
  return fits ?? (measured.at(-1) as ZoneLayout);
}

/** The custom properties a zone container needs (see `cssVars`), shared by both layouts. */
export function layoutVars(layout: ZoneLayout, config: LayoutConfig): Record<string, string> {
  return {
    '--unit-w': `${String(layout.tier.unitPx)}px`,
    '--unit-gap': `${String(config.gapPx)}px`,
    '--zone-label-w': `${String(config.labelPx)}px`,
    '--zone-label-gap': `${String(config.labelGapPx)}px`,
  };
}
