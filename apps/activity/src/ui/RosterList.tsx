import { useEffect, useRef, useState } from 'preact/hooks';
import { EFFECT_PREFIX, RECOMMENDED_TAG, type PickerOption } from '../roster-picker';
import { ElementChip } from '../sprites/ElementChip';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';

export interface RosterListProps {
  options: readonly PickerOption[];
  /** What an option says for a creature that is placed already ("On the board · moves here"). */
  placedNote: string;
  /** Show each option's line about what it would do in the slot (the effect preview). */
  showEffects: boolean;
  onPick: (creatureId: string) => void;
  /** Names the listbox for assistive technology. */
  label?: string;
  /**
   * Put each option's note ("Wears it now") or reason ("Needs level 12", "On a job") at the right of its row,
   * right-aligned and centred vertically, instead of under its name. A narrow row wraps it in its own column.
   */
  reasonSide?: boolean;
  /** Extra classes of the list (`flat`: no gutter, for a list that sits in a scrolling drawer body). */
  class?: string;
}

/** The index of the option to focus first: the first one that can be picked, else the first. */
function firstEnabled(options: readonly PickerOption[]): number {
  const at = options.findIndex((o) => o.disabled === null);
  return at < 0 ? 0 : at;
}

/**
 * The list of creature options of the creature picker, as a listbox: each option shows the sprite, name,
 * level, a small "Recommended" tag on the three strongest, element and role, what it would do in the slot (when
 * `showEffects`: a line led by a bold "In this slot:"), and either `placedNote` ("On the board · moves here")
 * or why it cannot be picked. Options that cannot be picked stay in the list, so the reason can be read (under the name, or with `reasonSide` at the right of the row). Up,
 * Down, Home and End move through the list, Enter or Space (or a tap) picks. The focus goes to the first
 * option that can be picked when the list is drawn. It is the part the sheet of `RosterPicker` (opened from a
 * page) and the "Equip on" view of the Workshop item drawer (a drill-in view inside the drawer) share.
 */
export function RosterList(props: RosterListProps) {
  const { options } = props;
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(() => firstEnabled(options));

  function focusOption(index: number): void {
    setActive(index);
    listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus();
  }

  useEffect(() => {
    focusOption(active);
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

  return (
    <ul
      ref={listRef}
      class={`roster-list${props.class === undefined ? '' : ` ${props.class}`}`}
      role="listbox"
      aria-label={props.label ?? 'Your creatures'}
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
          {o.action !== true && <Sprite sprite={creatureSpriteOrFallback(o.species)} scale={2} />}
          <span class="ro-text">
            <span class="ro-line">
              <span class="ro-name">{o.name}</span>
              {o.action !== true && <span class="ro-level">Lv {o.level}</span>}
              {o.recommended && <span class="ro-recommended">{RECOMMENDED_TAG}</span>}
            </span>
            {o.action !== true && (
              <span class="tags ro-tags">
                <ElementChip as="plain" element={o.element} role={o.role} />
              </span>
            )}
            {props.showEffects && o.effect !== null && (
              <span class="ro-effect prose">
                <strong>{EFFECT_PREFIX}</strong> {o.effect}
              </span>
            )}
            {props.reasonSide !== true && o.onBoard && (
              <span class="ro-note">{props.placedNote}</span>
            )}
            {props.reasonSide !== true && o.disabled !== null && (
              <span class="ro-note ro-reason">{o.disabled}</span>
            )}
          </span>
          {props.reasonSide === true && o.disabled !== null && (
            <span class="ro-note ro-reason ro-side">{o.disabled}</span>
          )}
          {props.reasonSide === true && o.disabled === null && o.onBoard && (
            <span class="ro-note ro-side">{props.placedNote}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
