import type { Ref } from 'preact';
import { PRESET_LEVEL } from './gear-view';

/**
 * The tools of the bag's selection mode (2026-10-27, "select many"): "Dismantle items" starts it and reads
 * "Done" while it is on; while it is on, the presets mark what matches (they only mark, the player can still
 * toggle single items) and "Clear" unmarks everything. Each preset is greyed when it would mark nothing. Used by
 * the Workshop's Gear section.
 */
export function SelectTools({
  selecting,
  onToggle,
  commons,
  below,
  marked,
  onCommons,
  onBelow,
  onClear,
}: {
  selecting: boolean;
  onToggle: () => void;
  /** How many Commons the "All Common" preset would mark, how many items "Below level N" would, and how many are marked now. */
  commons: number;
  below: number;
  marked: number;
  onCommons: () => void;
  onBelow: () => void;
  onClear: () => void;
}) {
  return (
    <div class="select-tools">
      <button type="button" class="ws-select" aria-pressed={selecting} onClick={onToggle}>
        {selecting ? 'Done' : 'Dismantle items'}
      </button>
      {selecting && (
        <>
          <button type="button" disabled={commons === 0} onClick={onCommons}>
            All Common
          </button>
          <button type="button" disabled={below === 0} onClick={onBelow}>
            Below level {PRESET_LEVEL}
          </button>
          <button type="button" disabled={marked === 0} onClick={onClear}>
            Clear
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The bar under the bag's grid in selection mode: how many are marked, a short reason after a refused tap (a worn
 * item), and the gold "Dismantle", which goes on to who does it and the confirmation. It sticks to the bottom
 * of the window while the grid scrolls (above the dock on a phone) and ends where the Gear section ends: a part
 * of the section, not a bar of the frame.
 */
export function SelectBar({
  count,
  hint,
  disabled,
  buttonRef,
  onDismantle,
}: {
  count: number;
  hint: string | null;
  disabled: boolean;
  buttonRef?: Ref<HTMLButtonElement> | undefined;
  onDismantle: () => void;
}) {
  return (
    <div class="select-bar pix-panel">
      <p class="select-count" role="status">
        <strong>{count} marked</strong>
        {hint !== null && <span class="select-hint muted"> {hint}</span>}
      </p>
      <button
        type="button"
        class="primary"
        {...(buttonRef === undefined ? {} : { ref: buttonRef })}
        disabled={disabled || count === 0}
        onClick={onDismantle}
      >
        Dismantle
      </button>
    </div>
  );
}
