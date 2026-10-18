/**
 * A small pixel switch with its label ("Compare"). A real button with `role="switch"` and `aria-checked`, so a
 * screen reader says "Compare, switch, on"; the state is also in the look (the knob at the right and lit when
 * on). The knob sits the same distance from the track's edge in both states (see `switch.css`). `disabled`
 * dims it and turns it off.
 */
export function Switch({
  on,
  onChange,
  label,
  disabled = false,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      class={on ? 'switch on' : 'switch'}
      onClick={() => {
        onChange(!on);
      }}
    >
      <span class="switch-track" aria-hidden="true">
        <span class="switch-knob" />
      </span>
      <span class="switch-label">{label}</span>
    </button>
  );
}
