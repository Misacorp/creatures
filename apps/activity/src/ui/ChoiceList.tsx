import type { ComponentChildren, Ref } from 'preact';

/**
 * A short list of big choice buttons that each say what they do (a mystery room's two options, the camp's
 * moves, its keepsakes). Put `ChoiceButton`s inside; `label` names the list for assistive technology.
 */
export function ChoiceList({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <ul class="choice-list" aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * One choice: its name in the pixel font and, under it, a line saying exactly what it does. `class` adds a
 * state to the button (the camp's knocked-out creature). The words are content or the player's own: text.
 */
export function ChoiceButton({
  label,
  line,
  disabled,
  onClick,
  class: extra,
  buttonRef,
}: {
  label: string;
  line: string;
  disabled: boolean;
  onClick: () => void;
  class?: string;
  /** For the one choice a picker anchors to. */
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <li>
      <button
        type="button"
        {...(buttonRef === undefined ? {} : { ref: buttonRef })}
        class={extra === undefined ? 'choice' : `choice ${extra}`}
        disabled={disabled}
        onClick={onClick}
      >
        <strong class="pix">{label}</strong> <span>{line}</span>
      </button>
    </li>
  );
}
