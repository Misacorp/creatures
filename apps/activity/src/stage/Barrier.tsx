import type { BarrierLook } from '../move-fx';
import type { BarrierState } from '../replay';

/**
 * A see-through pixel shield over the foe's picture while a lasting move is armed (Backdraft, Molten
 * Shell, the Thorns room: `BARRIER_OPS`). One component for all of them; `look` gives its colours
 * and pattern (`barrierLookOf`). It forms at the start of the round and shatters when the first
 * reaction meets it; a barrier nothing broke fades with the round. Decoration only (the move track
 * and the move's popover say what it does), so it is hidden from assistive technology. The stage keys
 * it by round and state, so it forms again each round and the shatter plays when it breaks.
 */
export function Barrier({ barrier, look }: { barrier: BarrierState; look: BarrierLook }) {
  const broken = barrier.broken !== null;
  return (
    <span
      class={`barrier th-${look.theme} pat-${look.pattern}${broken ? ' broken' : ''}`}
      aria-hidden="true"
    >
      <span class="barrier-shine" />
    </span>
  );
}
