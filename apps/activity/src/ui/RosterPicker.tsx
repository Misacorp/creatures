import { useEffect, useRef } from 'preact/hooks';
import type { PickerOption } from '../roster-picker';
import { RosterList } from './RosterList';

interface RosterPickerProps {
  /** The dialog's name, which also heads it ("Choose a creature for Middle, lane 3"). */
  title: string;
  /** One line under the title ("2 / 3 placed"). Without one, no line is drawn. */
  status?: string;
  options: readonly PickerOption[];
  /** What an option says for a creature that is placed already ("On the board · moves here"). */
  placedNote: string;
  /** Show each option's line about what it would do in the slot (the effect preview). */
  showEffects: boolean;
  /** Put each option's reason ("Away", "On a job") at the right of its row (see `RosterList`). */
  reasonSide?: boolean;
  /** The slot that opened it: focus goes back there when it closes. */
  anchor: () => HTMLElement | null;
  onPick: (creatureId: string) => void;
  onClose: () => void;
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
 * The creature picker of the Raid Roster and the dungeon team: a bottom sheet over a page with a listbox of
 * the player's creatures (`RosterList`, which says what each option shows). Escape (or the Close button, or a
 * tap outside) closes, Tab stays in the sheet, and focus goes back to the slot when it closes. Opened from a
 * page only: inside a drawer a choice is a view of the drawer itself (never a sheet over a drawer, 2026-10-18).
 */
export function RosterPicker(props: RosterPickerProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;

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
      if (now === null || now === document.body || sheetRef.current?.contains(now) === true) {
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
        class="sheet roster-picker pix-panel"
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
        <RosterList
          options={props.options}
          placedNote={props.placedNote}
          showEffects={props.showEffects}
          onPick={props.onPick}
          {...(props.reasonSide === true ? { reasonSide: true } : {})}
        />
      </div>
    </div>
  );
}
