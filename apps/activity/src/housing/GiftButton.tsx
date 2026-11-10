import { HOUSING_RULES, type VisitToday } from '@creatures/game';
import { PinnedAct } from '../valley/PinnedAct';
import { cut } from './house-names';

export interface GiftButtonProps {
  /** What the visitor did at this house today. */
  today: VisitToday;
  /** The visitor's one gift a day (in all) is still unused. */
  giftLeft: boolean;
  /** A request is running: a second press does nothing. */
  busy: boolean;
  /** The owner's name: the button says who the gift is for. */
  owner: string;
  /** "Gift" was pressed. */
  onGift: () => void;
}

/** Why the gift cannot be sent, or null when it can: given at this house today, or the day's one gift went elsewhere. */
export function giftReason(today: VisitToday, giftLeft: boolean): string | null {
  if (today.gifted) return 'Given today';
  if (!giftLeft) return 'Given elsewhere today';
  return null;
}

/** What the gift button says it gives: "+5 for Anna" (the Acorns the rules' gift holds, the owner's name cut short). */
export function giftDetail(owner: string): string {
  return `+${String(HOUSING_RULES.gift.acorns)} for ${cut(owner, 16)}`;
}

/**
 * The visitor's gift, pinned like a place's one action (`valley/PinnedAct`): the gold "Gift" button, with what it gives in
 * its detail. The gift costs the giver nothing, so no price is drawn. When the day's gift is used the button is not shown off:
 * it gives way to a calm line ("Gift given today"). Data in, callbacks out: it fetches nothing.
 */
export function GiftButton({ today, giftLeft, busy, owner, onGift }: GiftButtonProps) {
  const reason = giftReason(today, giftLeft);
  if (reason === null) {
    return (
      <PinnedAct
        label="Gift"
        detail={giftDetail(owner)}
        onClick={() => {
          if (!busy) onGift();
        }}
      />
    );
  }
  return today.gifted ? (
    <PinnedAct calm="Gift given today" mark />
  ) : (
    <PinnedAct calm="Gift given elsewhere today" />
  );
}
