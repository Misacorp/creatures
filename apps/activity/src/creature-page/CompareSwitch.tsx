/**
 * The Compare switch of the item picker: a small pixel-style switch with its label. A real button with
 * `role="switch"` and `aria-checked`, so a screen reader says "Compare, switch, on"; the state is also in
 * the look (the knob at the right and lit when on).
 */
export function CompareSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      class={on ? 'ip-switch on' : 'ip-switch'}
      onClick={() => {
        onChange(!on);
      }}
    >
      <span class="ip-switch-track" aria-hidden="true">
        <span class="ip-switch-knob" />
      </span>
      <span class="ip-switch-label">Compare</span>
    </button>
  );
}
