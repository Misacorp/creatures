import type { ComponentChildren } from 'preact';

/**
 * A small pixel switch with its label ("Compare"). A real button with `role="switch"` and `aria-checked`, so a
 * screen reader says "Compare, switch, on"; the state is also in the look (the knob at the right and lit when
 * on). The knob sits the same distance from the track's edge in both states (see `switch.css`). `disabled`
 * dims it and turns it off. `spoken` replaces the spoken name when the row says more than the label (a
 * cost); `children` sit after the label inside the same button, so the whole row is one tap target.
 */
export function Switch({
  on,
  onChange,
  label,
  disabled = false,
  spoken,
  class: cls,
  children,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
  spoken?: string;
  class?: string;
  children?: ComponentChildren;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      class={['switch', on ? 'on' : '', cls ?? ''].filter((c) => c !== '').join(' ')}
      {...(spoken === undefined ? {} : { 'aria-label': spoken })}
      onClick={() => {
        onChange(!on);
      }}
    >
      <span class="switch-track" aria-hidden="true">
        <span class="switch-knob" />
      </span>
      <span class="switch-label">{label}</span>
      {children}
    </button>
  );
}
