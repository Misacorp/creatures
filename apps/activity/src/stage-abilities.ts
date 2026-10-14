/**
 * The ability badges on the fight stage and the popover that opens from them. Pure: it decides what
 * a badge says; `Stage.tsx` draws it (and `ui/popover-place.ts` puts the popover). The badge of one of the player's own
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
type BadgeKind = 'auto' | 'manual' | 'pressed' | 'used';

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

/**
 * What a tap on a creature of the stage does. The player's own creatures are always buttons: one with
 * an ability in this fight opens its ability popover, and one without (below the unlock level, or a
 * species with no ability) opens a short note saying why, so a tap never does nothing. Other
 * players' creatures and guests are not interactive.
 */
type UnitTap = 'ability' | 'note' | 'none';

export function unitTap(mine: boolean, hasAbility: boolean): UnitTap {
  if (!mine) return 'none';
  return hasAbility ? 'ability' : 'note';
}

/**
 * The one short state line of an ability popover: "Auto fire · round 7", "Auto fire off · last
 * round", "Fires next round" or "Used in round 5". Words as well as shape, like the badge.
 */
export function popoverStateLine(badge: Pick<Badge, 'kind' | 'round' | 'label'>): string {
  switch (badge.kind) {
    case 'auto':
      return badge.round === null ? 'Auto fire' : `Auto fire \u00b7 round ${String(badge.round)}`;
    case 'manual':
      return 'Auto fire off \u00b7 last round';
    case 'pressed':
    case 'used':
      return badge.label;
  }
}
