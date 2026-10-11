/**
 * The ability badges on the fight stage and the popover that opens from them. Pure: it decides what
 * a badge says and where a popover goes; `Stage.tsx` draws it. The badge of one of the player's own
 * creatures follows the server's snapshot (auto fire on or off, pressed) and the events the stage has
 * shown so far (used), so it never jumps ahead of the animation. The state never rests on colour
 * alone: every state has its own glyph or text.
 */
import type { LiveAbility } from './live-api';
import type { AbilityUse } from './stage';

/**
 * auto: fires by itself at its default round (Auto fire on); manual: Auto fire is off, it waits for
 * its owner; pressed: Fire was pressed and it has not fired yet; used: done.
 */
export type BadgeKind = 'auto' | 'manual' | 'pressed' | 'used';

export interface Badge {
  kind: BadgeKind;
  /** auto: its default round; pressed: the round it fires in; used: the round it fired in. */
  round: number | null;
  /** Auto fire is on and the player can still act: the badge pulses (unless motion is reduced). */
  pulse: boolean;
  /** For screen readers: "Ready", "Held", "Fires in round 6", "Used in round 5". */
  label: string;
}

/** The text of a badge for assistive technology and tooltips. */
export function badgeLabel(kind: BadgeKind, round: number | null): string {
  switch (kind) {
    case 'auto':
      return round === null ? 'Auto fire on' : `Auto fire on, round ${String(round)}`;
    case 'manual':
      return 'Auto fire off';
    case 'pressed':
      return round === null ? 'Fires next round' : `Fires in round ${String(round)}`;
    case 'used':
      return round === null ? 'Used' : `Used in round ${String(round)}`;
  }
}

/** The badge of an ability that has taken effect in the part of the fight the stage has shown. */
export function usedBadge(round: number): Badge {
  return { kind: 'used', round, pulse: false, label: badgeLabel('used', round) };
}

/**
 * The badge of one of the player's own abilities. `shown` is the use the stage has already played
 * (from the events), if any; the server may be ahead of the stage by a beat, in which case the
 * ability counts as pressed until its beat plays. `canAct` is true while Fire is still on offer.
 */
export function badgeFor(
  ability: Pick<LiveAbility, 'mode' | 'fired' | 'firedAtRound' | 'fireAtRound' | 'defaultRound'>,
  shown: AbilityUse | null,
  canAct: boolean,
): Badge {
  if (shown !== null) return usedBadge(shown.round);
  if (ability.fired) {
    const round = ability.firedAtRound;
    return { kind: 'pressed', round, pulse: false, label: badgeLabel('pressed', round) };
  }
  if (ability.mode === 'fired') {
    const round = ability.fireAtRound;
    return { kind: 'pressed', round, pulse: false, label: badgeLabel('pressed', round) };
  }
  if (ability.mode === 'held') {
    return { kind: 'manual', round: null, pulse: false, label: badgeLabel('manual', null) };
  }
  const round = ability.defaultRound > 0 ? ability.defaultRound : null;
  return { kind: 'auto', round, pulse: canAct, label: badgeLabel('auto', round) };
}

/** A rectangle in any one coordinate space (the viewport, usually). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PopoverPlacement {
  /** Where the popover's top-left corner goes, relative to the anchor's top-left corner. */
  x: number;
  y: number;
  placement: 'below' | 'above';
  /** Where the arrow points at, from the popover's left edge (the anchor's centre, kept inside). */
  arrowX: number;
}

const ARROW_MARGIN = 10;

/**
 * Puts a popover of `size` next to `anchor`, inside `bounds`: below the anchor if it fits there,
 * else above, else wherever it overlaps least (clamped into the bounds). It is centred on the
 * anchor and slid sideways to stay in the bounds, and the arrow still points at the anchor.
 */
export function placePopover(
  anchor: Box,
  bounds: Box,
  size: { width: number; height: number },
  gap = 6,
): PopoverPlacement {
  const centre = anchor.left + anchor.width / 2;
  const maxLeft = bounds.left + bounds.width - size.width;
  const left = Math.max(bounds.left, Math.min(maxLeft, centre - size.width / 2));

  const belowTop = anchor.top + anchor.height + gap;
  const aboveTop = anchor.top - gap - size.height;
  const boundsBottom = bounds.top + bounds.height;
  const fitsBelow = belowTop + size.height <= boundsBottom;
  const fitsAbove = aboveTop >= bounds.top;

  let placement: 'below' | 'above' = 'below';
  let top = belowTop;
  if (!fitsBelow && fitsAbove) {
    placement = 'above';
    top = aboveTop;
  } else if (!fitsBelow) {
    // Neither side has room: keep it inside the bounds, over the anchor if it has to.
    top = Math.max(bounds.top, Math.min(boundsBottom - size.height, belowTop));
  }
  const arrowX = Math.max(ARROW_MARGIN, Math.min(size.width - ARROW_MARGIN, centre - left));
  return { x: left - anchor.left, y: top - anchor.top, placement, arrowX };
}
