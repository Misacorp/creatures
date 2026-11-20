/**
 * The size of the map on the Cave canvas's scene, and where a tall one opens. The map keeps the proportions of its coordinate space and is
 * as big as the scene allows; when that would be too small to read (the Undercroft's many floors) it keeps a readable size and the
 * scene's box is dragged up and down instead, opening on the team (the raid's phone board does the same sideways, opening on your
 * column). Pure; the component measures and calls these.
 */

/** The smallest share of the coordinate space's width a map may be drawn at before it is dragged instead. */
export const READABLE = 0.78;
/** The same for the Undercroft, whose levels stand below the day's: bigger, so the rooms still read. */
export const READABLE_UNDERCROFT = 0.95;
/** A dragged map is drawn at most this much bigger than the coordinate space (so the rooms do not balloon on a wide window). */
export const DRAGGED_MAX = 1.15;
/** Below this share of the coordinate space a plain fight keeps its icon only (its name is in its panel). */
export const DENSE_BELOW = 0.9;

export interface MapSize {
  /** The map's width in CSS px. */
  size: number;
  /** The map is taller than the box: it is dragged up and down. */
  tall: boolean;
  /** Plain fights print no name under them. */
  dense: boolean;
}

/**
 * `box` is the room the scene leaves for the map, `layout` the map's coordinate space (all floors). `deep`: Undercroft levels are drawn.
 */
export function mapSize(
  box: { width: number; height: number },
  layout: { width: number; height: number },
  deep: boolean,
): MapSize {
  const ratio = layout.width / layout.height;
  const fits = Math.min(box.width, box.height * ratio);
  const readable = fits / layout.width >= (deep ? READABLE_UNDERCROFT : READABLE);
  const size = Math.floor(readable ? fits : Math.min(box.width, layout.width * DRAGGED_MAX));
  return { size, tall: !readable, dense: size / layout.width < DENSE_BELOW };
}

/**
 * Where a dragged map opens: the team's room in the middle of the box, never past either end. `roomTop` and `roomHeight` are the room's
 * place in the map (CSS px from its top), `mapHeight` the map's drawn height and `boxHeight` the box's.
 */
export function startOffset(
  roomTop: number,
  roomHeight: number,
  mapHeight: number,
  boxHeight: number,
): number {
  if (mapHeight <= boxHeight) return 0;
  const want = roomTop + roomHeight / 2 - boxHeight / 2;
  return Math.round(Math.min(Math.max(0, want), mapHeight - boxHeight));
}
