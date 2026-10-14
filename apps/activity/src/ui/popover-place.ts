/**
 * Where a popover goes. Pure (no DOM): `Popover.tsx` measures the anchor and its container and
 * writes what comes out here as CSS custom properties.
 */

/** A rectangle in any one coordinate space (the viewport, usually). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PopoverPlacement {
  /** Where the popover's top-left corner goes, relative to the anchor's top-left corner. */
  x: number;
  y: number;
  placement: 'below' | 'above';
  /** Where the arrow points at, from the popover's left edge (the anchor's centre, kept inside). */
  arrowX: number;
}

const ARROW_MARGIN = 10;
const EDGE_MARGIN = 4;

/**
 * Puts a popover of `size` next to `anchor`, inside `bounds`: above the anchor if it fits there,
 * else below, else on the side with more room (clamped into the bounds, over the anchor if it has
 * to). It is centred on the anchor and slid sideways to stay `margin` inside the bounds, and the
 * arrow still points at the anchor.
 */
export function placePopover(
  anchor: Box,
  bounds: Box,
  size: { width: number; height: number },
  gap = 6,
  margin = EDGE_MARGIN,
): PopoverPlacement {
  const centre = anchor.left + anchor.width / 2;
  const minLeft = bounds.left + margin;
  const maxLeft = bounds.left + bounds.width - margin - size.width;
  // A popover wider than the bounds starts at the bounds' edge.
  const left =
    maxLeft < minLeft ? bounds.left : Math.max(minLeft, Math.min(maxLeft, centre - size.width / 2));

  const aboveTop = anchor.top - gap - size.height;
  const belowTop = anchor.top + anchor.height + gap;
  const boundsBottom = bounds.top + bounds.height;
  const fitsAbove = aboveTop >= bounds.top;
  const fitsBelow = belowTop + size.height <= boundsBottom;

  let placement: 'below' | 'above' = 'above';
  let top = aboveTop;
  if (!fitsAbove && fitsBelow) {
    placement = 'below';
    top = belowTop;
  } else if (!fitsAbove) {
    // Neither side has room: take the roomier side and keep the popover inside the bounds.
    const roomAbove = anchor.top - bounds.top;
    const roomBelow = boundsBottom - (anchor.top + anchor.height);
    placement = roomBelow >= roomAbove ? 'below' : 'above';
    const wanted = placement === 'below' ? belowTop : aboveTop;
    top = Math.max(bounds.top, Math.min(boundsBottom - size.height, wanted));
  }
  const arrowX = Math.max(ARROW_MARGIN, Math.min(size.width - ARROW_MARGIN, centre - left));
  return { x: left - anchor.left, y: top - anchor.top, placement, arrowX };
}

/** What the popover's CSS needs, in whole pixels measured from the container's top-left corner. */
export interface PopoverCoords {
  x: number;
  y: number;
  /** Where the arrow points at, from the popover's left edge. */
  arrow: number;
  placement: 'below' | 'above';
}

/**
 * `placePopover` for a popover that is absolutely positioned inside `container` (the container's
 * padding box: its left and top are where the popover's `left: 0; top: 0` is). All three boxes are
 * in the same coordinate space, the viewport's usually.
 */
export function popoverCoords(
  anchor: Box,
  container: Box,
  size: { width: number; height: number },
): PopoverCoords {
  const at = placePopover(anchor, container, size);
  return {
    x: Math.round(anchor.left + at.x - container.left),
    y: Math.round(anchor.top + at.y - container.top),
    arrow: Math.round(at.arrowX),
    placement: at.placement,
  };
}
