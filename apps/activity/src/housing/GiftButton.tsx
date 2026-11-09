import type { VisitToday } from '@creatures/game';
import { ActionButton } from '../ui/ActionButton';

export interface GiftButtonProps {
  /** What the visitor did at this house today. */
  today: VisitToday;
  /** The visitor's one gift a day (in all) is still unused. */
  giftLeft: boolean;
  /** A request is running: the button waits. */
  busy: boolean;
  /** "Gift" was pressed. */
  onGift: () => void;
}

/** Why the gift cannot be sent, or null when it can: given at this house today, or the day's one gift went elsewhere. */
export function giftReason(today: VisitToday, giftLeft: boolean): string | null {
  if (today.gifted) return 'Given today';
  if (!giftLeft) return 'Given elsewhere today';
  return null;
}

/**
 * The visitor's gift: one button. It is off with the reason beside it ("Given today", "Given elsewhere today") when the
 * day's gift is used, and while a request runs. The gift costs the giver nothing, so no price is drawn. Data in,
 * callbacks out: it fetches nothing.
 */
export function GiftButton({ today, giftLeft, busy, onGift }: GiftButtonProps) {
  const reason = giftReason(today, giftLeft);
  return (
    <ActionButton
      wide
      label="Gift"
      detail={reason ?? undefined}
      disabled={busy || reason !== null}
      onClick={onGift}
    />
  );
}
