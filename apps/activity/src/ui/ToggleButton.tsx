import type { ComponentChildren } from 'preact';

interface ToggleButtonProps {
  pressed: boolean;
  onToggle: () => void;
  children: ComponentChildren;
  /**
   * The id of the region this button shows and hides. With it the button says `aria-expanded` and
   * `aria-controls`; without it, `aria-pressed`.
   */
  controls?: string;
  /** A hover hint (the tooltip of a desktop pointer). It never carries what a player must know. */
  title?: string;
}

/** A button that is on or off (the gold look when on). The state is spoken, never colour alone. */
export function ToggleButton({ pressed, onToggle, children, controls, title }: ToggleButtonProps) {
  const state =
    controls === undefined
      ? { 'aria-pressed': pressed }
      : { 'aria-expanded': pressed, 'aria-controls': controls };
  return (
    <button
      type="button"
      class={pressed ? 'toggle on' : 'toggle'}
      {...(title === undefined ? {} : { title })}
      {...state}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}
