/**
 * The Auto fire toggle: a pressed button reading "Auto fire on" or "Auto fire off". On, the ability
 * fires by itself in its round; off, it waits for its owner and still fires in the last round. Used in
 * the ability popovers on the stage and on the Raid tab's "Your finale abilities" card.
 */
export function AutoFireToggle({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  /** What the toggle belongs to, for assistive technology ("Cindle's Flare Strike"). */
  label?: string;
  /** Called with the new setting. */
  onToggle: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      class={on ? 'toggle on ab-auto-toggle' : 'toggle ab-auto-toggle'}
      aria-pressed={on}
      aria-label={label === undefined ? undefined : `Auto fire for ${label}`}
      disabled={disabled}
      onClick={() => {
        onToggle(!on);
      }}
    >
      <span>Auto fire</span>
      <small>{on ? 'on' : 'off'}</small>
    </button>
  );
}
