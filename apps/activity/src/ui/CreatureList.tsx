import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { EFFECT_PREFIX, RECOMMENDED_TAG, type PickerOption } from '../roster-picker';
import { ElementChip } from '../sprites/ElementChip';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { gearName, rarityName } from '../gear-view';
import { getSpecies } from '../game';
import { ItemThumb } from '../GearArt';
import { FoldRow } from './FoldRow';
import { Tag } from './Tag';
import { XpTrack } from './XpTrack';

/** How the list is chosen from; see `CreatureList`. */
export type Selection =
  | {
      /** Pick and close: a listbox, one tap or Enter picks and the view closes (the sheet, the Equip on drill-in). */
      mode: 'pick';
      onPick: (creatureId: string) => void;
      /** Names the listbox for assistive technology. */
      label?: string;
    }
  | {
      /** A choice that stays: native radios in a fieldset (a page-level decision, kept until the player acts). */
      mode: 'choose';
      /** Names the radio group; unique on the page. */
      name: string;
      /** The chosen creature, or null. */
      value: string | null;
      onChange: (creatureId: string) => void;
      /** The fieldset's legend (it may be visually hidden by the screen's CSS). */
      legend: ComponentChildren;
    };

export interface CreatureListProps<T extends PickerOption = PickerOption> {
  options: readonly T[];
  selection: Selection;
  /** What an option says for a creature that is placed already ("On the board · moves here"). Default: nothing. */
  placedNote?: string;
  /** Show each option's line about what it would do in the slot (the effect preview). Default off. */
  showEffects?: boolean;
  /** Show each creature's level ("Lv 8") after its name. Default on; the Valley Games picker turns it off (level does not matter there). */
  level?: boolean;
  /** Show the element and role chips under the name. Default on. */
  chips?: boolean;
  /**
   * Put each option's note ("Wears it now") or reason ("Needs level 12", "On a job") at the right of its row,
   * right-aligned and centred vertically, instead of under its name. A narrow row wraps it in its own column.
   */
  reasonSide?: boolean;
  /**
   * Right-end detail of a row that can be picked (a job's clock badge): drawn where `reasonSide` puts a reason,
   * so a row has either one or the other. Return nothing for no detail.
   */
  side?: (option: T) => ComponentChildren;
  /** An extra block under the name and chips (the explorer's rank, XP bar and familiarity). */
  more?: (option: T) => ComponentChildren;
  /** A small mark on the name's line, after the level (the Games' event badge). Return nothing for none. */
  beside?: (option: T) => ComponentChildren;
  /** Extra classes of the list (`flat`: no gutter, for a list that sits in a scrolling drawer body). */
  class?: string;
  /** Extra classes of the fieldset in `choose` mode. */
  fieldClass?: string;
  /**
   * Rows folded behind a quiet `FoldRow` after the list (`choose` mode only; the job wizards fold the creatures
   * under the level). They are the same radio group in the same fieldset: when open they are listed greyed, like
   * any row that cannot be chosen.
   */
  fold?: {
    options: readonly T[];
    /** The fold's label ("4 more creatures need Crafting level 3"). */
    label: ComponentChildren;
    open: boolean;
    onToggle: () => void;
    /** The id of the folded rows (for `aria-controls`); unique on the page. */
    id: string;
  };
}

/**
 * The reason of a row that cannot be picked: a busy creature wears the card's status badge ("On a job", "Away"; the
 * rest of the trip wording is kept for assistive technology), any other reason is plain text.
 */
function Reason({ option, side }: { option: PickerOption; side: boolean }) {
  const className = `ro-note ro-reason${side ? ' ro-side' : ''}`;
  if (option.busy === undefined) return <span class={className}>{option.disabled}</span>;
  return (
    <span class={className}>
      {option.busy === 'job' ? (
        <Tag kind="badge" tone="busy" class="ro-busy">
          On a job
        </Tag>
      ) : (
        <Tag kind="badge" tone="away" class="ro-busy">
          Away<span class="visually-hidden"> on a trip</span>
        </Tag>
      )}
    </span>
  );
}

/** The index of the option to focus first: the first one that can be picked, else the first. */
function firstEnabled(options: readonly PickerOption[]): number {
  const at = options.findIndex((o) => o.disabled === null);
  return at < 0 ? 0 : at;
}

/** The parts of a row that are the same in both selection modes (everything but the radio or the listbox role). */
function RowContent<T extends PickerOption>({ o, props }: { o: T; props: CreatureListProps<T> }) {
  const side = props.reasonSide === true;
  const chips = props.chips !== false;
  const placedNote = props.placedNote ?? '';
  const more = props.more?.(o);
  const beside = props.beside?.(o);
  // The name is in its species' rarity colour, as on the creature card (an action row has no species).
  const rarity = o.action === true ? undefined : getSpecies(o.species)?.rarity;
  const detail = o.disabled === null ? props.side?.(o) : undefined;
  return (
    <>
      {o.action !== true && <Sprite sprite={creatureSpriteOrFallback(o.species)} scale={2} />}
      <span class="ro-text">
        <span class="ro-line">
          <span class={rarity === undefined ? 'ro-name' : `ro-name rarity-name rarity-${rarity}`}>
            {o.name}
            {rarity !== undefined && <span class="visually-hidden">, {rarity}</span>}
          </span>
          {o.action !== true && o.xpBar === undefined && props.level !== false && (
            <span class="ro-level">Lv {o.level}</span>
          )}
          {beside !== undefined && beside !== null && <span class="ro-beside">{beside}</span>}
          {o.recommended && <span class="ro-recommended">{RECOMMENDED_TAG}</span>}
          {o.rested === true && <span class="badge rested ro-rested">Rested</span>}
        </span>
        {o.xpBar !== undefined && (
          <XpTrack
            level={o.level}
            value={o.xpBar.value}
            max={o.xpBar.max}
            top={o.xpBar.top}
            label={o.xpBar.label}
            text={o.xpBar.text}
          />
        )}
        {chips && o.action !== true && (
          <span class="tags ro-tags">
            <ElementChip as="plain" element={o.element} role={o.role} />
          </span>
        )}
        {o.note !== undefined && <span class="ro-note ro-quiet">{o.note}</span>}
        {more !== undefined && more !== null && <span class="ro-more">{more}</span>}
        {props.showEffects === true && o.effect !== null && (
          <span class="ro-effect prose">
            <strong>{EFFECT_PREFIX}</strong> {o.effect}
          </span>
        )}
        {!side && o.onBoard && <span class="ro-note">{placedNote}</span>}
        {!side && o.disabled !== null && <Reason option={o} side={false} />}
      </span>
      {side && o.disabled !== null && <Reason option={o} side />}
      {side && o.disabled === null && o.onBoard && (
        <span class="ro-note ro-side">{placedNote}</span>
      )}
      {detail !== undefined && detail !== null && <span class="ro-detail">{detail}</span>}
      {o.worn !== undefined && (
        <span
          class="ro-worn"
          role="img"
          aria-label={`Wearing ${gearName(o.worn.baseId)}, item level ${String(o.worn.itemLevel)}, ${rarityName(o.worn.rarity)}`}
          title={`Wearing ${gearName(o.worn.baseId)}`}
        >
          <ItemThumb item={o.worn} scale={2} />
        </span>
      )}
    </>
  );
}

/**
 * The one list of creatures to choose from, wherever the player picks one creature (raid board, dungeon team and
 * camp, Equip on, the lounge swap, a job's worker, an expedition's explorer). The row is fixed: sprite, name and
 * level on the left, in the pixel font (the list is a `pix-panel`), then only what the caller asks for:
 *
 * - the element and role chips (`chips`, on by default), an XP track (`xpBar` on the option), a "Recommended"
 *   tag, "Rested" and a worn item tile (`worn`, the item in the slot being asked about);
 * - a quiet line (`note`), and the effect preview (`showEffects`);
 * - why a row cannot be picked (`disabled`; with `busy` it is the card's "On a job" / "Away" badge), under the
 *   name or, with `reasonSide`, at the right of the row; rows that cannot be picked stay in the list;
 * - three small slots for what only one screen has: `side` (right-end detail of a row that can be picked, such
 *   as a job's clock badge), `more` (a block under the name, such as the explorer's XP bar and familiarity) and
 *   `beside` (a small mark on the name's line, such as the Games' event badge).
 *
 * `selection.mode` says how it is chosen from. `pick`: a listbox; Up, Down, Home and End move through the rows
 * (roving tabindex), Enter, Space or a tap picks, and the focus starts on the first row that can be picked. It is
 * for pick-and-close views: the sheet of `RosterPicker` and the "Equip on" drill-in. `choose`: native radios in a
 * fieldset, so the arrow keys and screen readers work as for any radio group; the choice stays, and a row that
 * cannot be chosen is a disabled radio. It is for a page-level decision (the job starter, "Who goes").
 */
export function CreatureList<T extends PickerOption = PickerOption>(props: CreatureListProps<T>) {
  const { selection } = props;
  if (selection.mode === 'choose') return <ChooseList {...props} selection={selection} />;
  return <PickList {...props} selection={selection} />;
}

function rowClass(o: PickerOption, selected = false): string {
  return `roster-option${o.onBoard ? ' on-board' : ''}${o.disabled === null ? '' : ' disabled'}${selected ? ' on' : ''}`;
}

function listClass(props: { class?: string | undefined }): string {
  return `roster-list pix-panel${props.class === undefined ? '' : ` ${props.class}`}`;
}

type Chosen = Extract<Selection, { mode: 'choose' }>;
type Picking = Extract<Selection, { mode: 'pick' }>;

function ChooseList<T extends PickerOption>(props: CreatureListProps<T> & { selection: Chosen }) {
  const { selection, fold } = props;
  const rows = (options: readonly T[]) =>
    options.map((o) => {
      const selected = selection.value === o.id;
      return (
        <label key={o.id} class={rowClass(o, selected)}>
          <input
            type="radio"
            name={selection.name}
            value={o.id}
            checked={selected}
            disabled={o.disabled !== null}
            onChange={() => {
              selection.onChange(o.id);
            }}
          />
          <RowContent o={o} props={props} />
        </label>
      );
    });
  return (
    <fieldset class={`picker${props.fieldClass === undefined ? '' : ` ${props.fieldClass}`}`}>
      <legend>{selection.legend}</legend>
      <div class={listClass(props)}>{rows(props.options)}</div>
      {fold !== undefined && (
        <>
          <FoldRow open={fold.open} controls={fold.id} onToggle={fold.onToggle}>
            {fold.label}
          </FoldRow>
          {fold.open && (
            <div id={fold.id} class={listClass(props)}>
              {rows(fold.options)}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

function PickList<T extends PickerOption>(props: CreatureListProps<T> & { selection: Picking }) {
  const { options, selection } = props;
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
      if (option !== undefined && option.disabled === null) selection.onPick(option.id);
    }
  }

  return (
    <ul
      ref={listRef}
      class={listClass(props)}
      role="listbox"
      aria-label={selection.label ?? 'Your creatures'}
      onKeyDown={onListKey}
    >
      {options.map((o, index) => (
        <li
          key={o.id}
          role="option"
          aria-selected={false}
          aria-disabled={o.disabled !== null}
          tabIndex={index === active ? 0 : -1}
          class={rowClass(o)}
          onClick={() => {
            if (o.disabled === null) selection.onPick(o.id);
            else focusOption(index);
          }}
        >
          <RowContent o={o} props={props} />
        </li>
      ))}
    </ul>
  );
}
