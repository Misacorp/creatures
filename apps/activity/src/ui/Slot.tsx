import type { ComponentChildren, Ref } from 'preact';

/** What a slot holds: `filled` (something is in it), `empty` (open, nothing in it) or `locked` (not open yet). */
export type SlotState = 'filled' | 'empty' | 'locked';

export interface SlotProps {
  /** `gear` is a square that holds an item's icon; `talent` is a wider box that holds a name and a number. */
  kind: 'gear' | 'talent';
  state: SlotState;
  /** What a screen reader says: the slot, what is in it, and (for a tappable slot) that it changes it. */
  label: string;
  /** Empty: the slot's own name, drawn inside ("Scarf", "Talent"). */
  name?: string;
  /** Locked: the level it opens at, drawn inside as "Lv 7". */
  opensAt?: number;
  /** Filled: what it holds (an item's icon, a talent's name and number). Pass text as text. */
  children?: ComponentChildren;
  /** Filled: a tiny mark in the bottom corner (an item's level, "Lv 4"). */
  corner?: string;
  /** Tapping it. A locked slot, or a filled one without this, is not a button. */
  onClick?: (event: MouseEvent) => void;
  /** Whether the drawer it opens is open now (`aria-expanded`). */
  expanded?: boolean;
  /** The slot's button, so a drawer can give the focus back to it. */
  buttonRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
}

/**
 * One slot: the same box for a creature's gear (Hat, Scarf, Charm) and its talents. Filled it shows what
 * it holds, empty it names itself, locked it is muted and says the level it opens at. It is a real button
 * when it can be tapped (it opens a Drawer to fill or change it) and plain content when it cannot. The
 * three states are never told apart by colour alone: the words inside say which one it is.
 */
export function Slot({
  kind,
  state,
  label,
  name,
  opensAt,
  children,
  corner,
  onClick,
  expanded,
  buttonRef,
  disabled = false,
}: SlotProps) {
  const classes = `slot ${kind} ${state}`;
  const inside =
    state === 'locked' ? (
      <span class="slot-lock pix">Lv {opensAt}</span>
    ) : state === 'empty' ? (
      <span class="slot-word pix">{name}</span>
    ) : (
      <>
        <span class="slot-content">{children}</span>
        {corner !== undefined && (
          <span class="slot-corner pix" aria-hidden="true">
            {corner}
          </span>
        )}
      </>
    );
  if (state === 'locked' || onClick === undefined) {
    return (
      <div class={classes} role="img" aria-label={label}>
        {inside}
      </div>
    );
  }
  return (
    <button
      type="button"
      class={classes}
      {...(buttonRef === undefined ? {} : { ref: buttonRef })}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={expanded === true}
      disabled={disabled}
      onClick={onClick}
    >
      {inside}
    </button>
  );
}

/**
 * The row the slots stand in: all of them side by side across the full width, equal widths (two or three
 * at 390 px; more than three wrap into two columns). `label` names the group for screen readers.
 */
export function SlotRow({ label, slots }: { label: string; slots: readonly ComponentChildren[] }) {
  const columns = slots.length >= 1 && slots.length <= 3 ? slots.length : 2;
  return (
    <ul class={`slot-row cols-${String(columns)}`} aria-label={label}>
      {slots.map((slot, index) => (
        <li key={index}>{slot}</li>
      ))}
    </ul>
  );
}
