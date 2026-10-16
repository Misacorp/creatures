import { useEffect, useRef } from 'preact/hooks';
import type { Creature } from './api';
import { creatureName } from './game';
import { PartsList } from './GearArt';
import type { GearItem } from './gear-types';
import { gearName, partsText } from './gear-view';

/**
 * The in-page confirmation of a dismantle (never `window.confirm`): what the item breaks into, a
 * warning that it cannot be undone, and a note when it is worn. Focus starts on "Keep it", the safe
 * choice, and Escape keeps the item.
 */
export function DismantleConfirm({
  item,
  wearer,
  busy,
  onConfirm,
  onCancel,
}: {
  item: GearItem;
  wearer: Creature | undefined;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <section
      class="confirm"
      role="group"
      aria-labelledby={`dismantle-${item.id}-q`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <h4 id={`dismantle-${item.id}-q`} class="pix">
        Dismantle {gearName(item.baseId)} (item level {item.itemLevel})?
      </h4>
      <p>
        It breaks into: <strong>{partsText(item.dismantle)}</strong>.
      </p>
      <p class="reason">This cannot be undone.</p>
      {wearer !== undefined && (
        <p class="muted">{creatureName(wearer)} is wearing it. It comes off first.</p>
      )}
      <PartsList parts={item.dismantle} />
      <p class="actions">
        <button type="button" class="danger" disabled={busy} onClick={onConfirm}>
          Yes, dismantle it
        </button>
        <button type="button" ref={keep} onClick={onCancel}>
          Keep it
        </button>
      </p>
    </section>
  );
}
