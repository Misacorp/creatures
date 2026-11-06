/**
 * The parts the Signpost's and the Forge's pages share (phase 5 steps 2 and 3): both are cards of posts under the creature tray, so
 * they find the card under a dragged creature the same way, draw the two small lines of a slot the same way, and confirm a spend of
 * Acorns the same way (one cost, one button, the reason it cannot be pressed).
 */
import type { ComponentChildren } from 'preact';
import type { Price, ShortOf } from '../resource-count';
import { Alert } from '../ui/Alert';
import { ActionButton } from '../ui/ActionButton';
import { CountBadge, ShortOfLine } from '../ui/CountBadge';
import type { DataRow } from '../ui/DataTable';
import type { SeatRow } from './signpost-view';

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
export function SlotText({ name, sub }: { name: ComponentChildren; sub?: string }) {
  return (
    <span class="sp-slot">
      <strong class="pix sp-slot-name">{name}</strong>
      {sub !== undefined && <span class="sp-slot-sub">{sub}</span>}
    </span>
  );
}

/**
 * One cost and the one button that spends it, with the reason it cannot be pressed. `reason` is the short-of-money line (null: the
 * player can pay); `price` is what the button shows (the amount as badges, or "free").
 */
export function SpendConfirm({
  text,
  label,
  price,
  reason,
  busy,
  onConfirm,
}: {
  text: ComponentChildren;
  label: string;
  price: Price;
  reason: ShortOf | string | null;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <div class="dr-stack">
      <p class="prose">{text}</p>
      {reason !== null && (
        <Alert level="info">
          {typeof reason === 'string' ? reason : <ShortOfLine short={reason} />}
        </Alert>
      )}
      <ActionButton
        label={label}
        detail={price.text}
        cost={price.items}
        wide
        large
        disabled={busy || reason !== null}
        onClick={onConfirm}
      />
    </div>
  );
}

/** The rows of a seat's table for `DataTable`: a resource's row shows its icon in the label, never its name. */
export function seatDataRows(rows: readonly SeatRow[]): DataRow[] {
  return rows.map((row) => ({
    label: row.mark === undefined ? row.label : <CountBadge {...row.mark} size="inline" />,
    value: row.value,
  }));
}
