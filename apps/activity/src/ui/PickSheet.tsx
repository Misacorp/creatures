import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { keyboardHasFocus } from './focus-return';

interface PickSheetProps {
  /** The dialog's name, which also heads it ("Choose a creature for Middle, lane 3"). */
  title: string;
  /** One line under the title ("2 / 3 placed"). Without one, no line is drawn. */
  status?: string;
  /** Extra class on the sheet (the look of one list: `roster-picker`). */
  class?: string;
  /** The control that opened it: focus goes back there when it closes. */
  anchor: () => HTMLElement | null;
  onClose: () => void;
  /** The listbox. Its option with `tabindex="0"` is the one Tab stop besides Close. */
  children: ComponentChildren;
}

/** The option of the list that can take Tab: the one with `tabindex="0"`. */
function tabStopOf(sheet: HTMLElement): HTMLElement | null {
  return (
    Array.from(sheet.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (el) => el.getAttribute('tabindex') === '0',
    ) ?? null
  );
}

/**
 * The bottom sheet every "pick one from a list" opens from a page (the creature picker of the raid and dungeon
 * team, the dungeon's depth picker): a dialog with a title, a Close button and the list. Escape (or Close, or a tap
 * outside) closes, Tab stays in the sheet, and focus goes back to what opened it. Opened from a page only: inside a
 * drawer a choice is a view of the drawer itself (never a sheet over a drawer, 2026-10-18).
 */
export function PickSheet(props: PickSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  // Asked while the sheet draws for the first time, before it moves the focus: only a keyboard user gets the
  // focus back on the slot at the end (no ring left after a tap).
  const byKeyboard = useRef<boolean | null>(null);
  byKeyboard.current ??= keyboardHasFocus();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        latest.current.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Back to the slot that opened the sheet. After a pick the slot is switched off for a moment
      // (the request is in flight); the Roster focuses it again once it is back.
      const now = document.activeElement;
      if (
        byKeyboard.current === true &&
        (now === null || now === document.body || sheetRef.current?.contains(now) === true)
      ) {
        latest.current.anchor()?.focus();
      }
    };
  }, []);

  /** Escape closes the sheet, and Tab walks between the Close button and the list and never leaves it. */
  function onSheetKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    const sheet = sheetRef.current;
    if (sheet === null) return;
    const stops = [sheet.querySelector<HTMLElement>('.sheet-close'), tabStopOf(sheet)].filter(
      (el): el is HTMLElement => el !== null,
    );
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const to = event.shiftKey ? at - 1 : at + 1;
    event.preventDefault();
    stops[(to + stops.length) % stops.length]?.focus();
  }

  return (
    <div class="sheet-layer">
      <div
        class="sheet-backdrop"
        onPointerDown={() => {
          props.onClose();
        }}
      />
      <div
        ref={sheetRef}
        class={['sheet', props.class, 'pix-panel'].filter((c) => c !== undefined).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onKeyDown={onSheetKey}
      >
        <div class="sheet-head">
          <h4 class="sheet-title">{props.title}</h4>
          <button type="button" class="sheet-close" onClick={props.onClose}>
            Close
          </button>
        </div>
        {props.status !== undefined && <p class="muted small sheet-status">{props.status}</p>}
        {props.children}
      </div>
    </div>
  );
}
