import type { RefObject } from 'preact';

/**
 * The "?" pin in the top right corner of the Today board: the same round pushpin
 * badge (`hb-badge`) with the "?" the HUD's help button draws. A button that opens How to play, 44 px at least.
 * `pinRef` is where the focus returns when How to play closes.
 */
export function HowToPin({
  onOpen,
  pinRef,
}: {
  onOpen: () => void;
  pinRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      type="button"
      {...(pinRef === undefined ? {} : { ref: pinRef })}
      class="hb-badge hb-help"
      aria-haspopup="dialog"
      aria-label="How to play"
      onClick={onOpen}
    >
      <span class="hb-badge-disc">
        <span class="hb-help-mark pix" aria-hidden="true">
          ?
        </span>
      </span>
    </button>
  );
}
