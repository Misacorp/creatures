import { useEffect, useRef, useState } from 'preact/hooks';
import { EFFECT_PREFIX, RECOMMENDED_TAG, type PickerOption } from '../roster-picker';
import { ElementChip } from '../sprites/ElementChip';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';

interface RosterPickerProps {
  /** The dialog's name, which also heads it ("Choose a creature for Middle, lane 3"). */
  title: string;
  /** One line under the title ("2 / 3 placed"). */
  status: string;
  options: readonly PickerOption[];
  /** What an option says for a creature that is placed already ("On the board · moves here"). */
  placedNote: string;
  /** Show each option's line about what it would do in the slot (the effect preview). */
  showEffects: boolean;
  /** The slot that opened it: focus goes back there when it closes. */
  anchor: () => HTMLElement | null;
  onPick: (creatureId: string) => void;
  onClose: () => void;
}

/** The index of the option to focus first: the first one that can be picked, else the first. */
function firstEnabled(options: readonly PickerOption[]): number {
  const at = options.findIndex((o) => o.disabled === null);
  return at < 0 ? 0 : at;
}

/**
 * The creature picker of the Raid Roster and the dungeon team: a bottom sheet with a listbox of the
 * player's creatures. Each option shows the sprite, name, level, a small "Recommended" tag on the
 * three strongest, element and role, what it would do in the slot (when `showEffects`: a line led by
 * a bold "In this slot:"), and either `placedNote` ("On the board · moves here") or why it cannot be picked. Options that
 * cannot be picked stay in the list, so the reason can be read. Up, Down, Home and End move through
 * the list, Enter or Space picks, Escape (or the Close button, or a tap outside) closes, Tab stays in
 * the sheet, and focus goes back to the slot when it closes.
 */
export function RosterPicker(props: RosterPickerProps) {
  const { options } = props;
  const sheetRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(() => firstEnabled(options));
  const latest = useRef(props);
  latest.current = props;

  function focusOption(index: number): void {
    setActive(index);
    listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus();
  }

  useEffect(() => {
    focusOption(active);
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

  function onListKey(event: KeyboardEvent): void {
    const last = options.length - 1;
    const keys: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    };
    const to = keys[event.key];
    if (to !== undefined) {
      event.preventDefault();
      focusOption(to);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[active];
      if (option !== undefined && option.disabled === null) props.onPick(option.id);
    }
  }

  /** Tab walks between the Close button and the list and never leaves the sheet. */
  function onSheetKey(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const sheet = sheetRef.current;
    if (sheet === null) return;
    const stops = [
      sheet.querySelector<HTMLElement>('.sheet-close'),
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[active] ?? null,
    ].filter((el): el is HTMLElement => el !== null);
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
        class="sheet roster-picker"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onKeyDown={onSheetKey}
      >
        <div class="sheet-head">
          <h4 class="sheet-title pix">{props.title}</h4>
          <button type="button" class="sheet-close" onClick={props.onClose}>
            Close
          </button>
        </div>
        <p class="muted small sheet-status">{props.status}</p>
        <ul
          ref={listRef}
          class="roster-list"
          role="listbox"
          aria-label="Your creatures"
          onKeyDown={onListKey}
        >
          {options.map((o, index) => (
            <li
              key={o.id}
              role="option"
              aria-selected={false}
              aria-disabled={o.disabled !== null}
              tabIndex={index === active ? 0 : -1}
              class={`roster-option${o.onBoard ? ' on-board' : ''}${o.disabled === null ? '' : ' disabled'}`}
              onClick={() => {
                if (o.disabled === null) props.onPick(o.id);
                else focusOption(index);
              }}
            >
              <Sprite sprite={creatureSpriteOrFallback(o.species)} scale={2} />
              <span class="ro-text">
                <span class="ro-line">
                  <span class="ro-name pix">{o.name}</span>
                  <span class="ro-level">Lv {o.level}</span>
                  {o.recommended && <span class="ro-recommended">{RECOMMENDED_TAG}</span>}
                </span>
                <span class="tags ro-tags">
                  <ElementChip as="plain" element={o.element} role={o.role} />
                </span>
                {props.showEffects && o.effect !== null && (
                  <span class="ro-effect">
                    <strong>{EFFECT_PREFIX}</strong> {o.effect}
                  </span>
                )}
                {o.onBoard && <span class="ro-note">{props.placedNote}</span>}
                {o.disabled !== null && <span class="ro-note ro-reason">{o.disabled}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
