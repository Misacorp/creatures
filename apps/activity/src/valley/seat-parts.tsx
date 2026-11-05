/**
 * The parts the Signpost's and the Forge's pages share (phase 5 steps 2 and 3): both are cards of posts under the creature tray, so
 * they find the card under a dragged creature the same way, draw the two small lines of a slot the same way, and confirm a spend of
 * Acorns the same way (one cost, one button, the reason it cannot be pressed).
 */
import { Alert } from '../ui/Alert';
import { ActionButton } from '../ui/ActionButton';

/** The seat card under a point (a card carries `data-seat`): where a hand's drop lands. */
export function seatAt(x: number, y: number): string | null {
  if (typeof document === 'undefined') return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const card = el.closest<HTMLElement>('[data-seat]');
    if (card !== null) return card.dataset['seat'] ?? null;
  }
  return null;
}

/** The slot's two small lines: a name, and under it what matters. Text only. */
export function SlotText({ name, sub }: { name: string; sub?: string }) {
  return (
    <span class="sp-slot">
      <strong class="pix sp-slot-name">{name}</strong>
      {sub !== undefined && <span class="sp-slot-sub">{sub}</span>}
    </span>
  );
}

/**
 * One cost and the one button that spends it, with the reason it cannot be pressed. `reason` is the short-of-money line (null: the
 * player can pay); `price` is the words on the button ("875 Acorns").
 */
export function SpendConfirm({
  text,
  label,
  price,
  reason,
  busy,
  onConfirm,
}: {
  text: string;
  label: string;
  price: string;
  reason: string | null;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <div class="dr-stack">
      <p class="prose">{text}</p>
      {reason !== null && <Alert level="info">{reason}</Alert>}
      <ActionButton
        label={label}
        detail={price}
        wide
        large
        disabled={busy || reason !== null}
        onClick={onConfirm}
      />
    </div>
  );
}
