import { Tag } from './ui/Tag';
import type { PickerOption } from './gear-view';
import { durationCountItem } from './gear-view';
import { CountBadge } from './ui/CountBadge';
import { creatureName } from './game';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/**
 * One creature of a pick list: a radio row with its sprite, name, Crafting level and (at the right) the time
 * the job would take, or the reason it cannot be picked (the radio is then disabled and the row greyed).
 */
export function PickRow({
  name,
  option: { creature, level, busy, durationMs },
  selected,
  onChange,
}: {
  /** Names the radio group; unique on the page. */
  name: string;
  option: PickerOption;
  selected: boolean;
  onChange: (creatureId: string) => void;
}) {
  return (
    <label class={`pick${busy === null ? '' : ' busy'}${selected ? ' on' : ''}`}>
      <input
        type="radio"
        name={name}
        value={creature.id}
        checked={selected}
        disabled={busy !== null}
        onChange={() => {
          onChange(creature.id);
        }}
      />
      <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={2} />
      <span class="pick-text">
        <span class="pick-name pix">{creatureName(creature)}</span>
        <span class="pick-meta">Crafting level {level}</span>
      </span>
      {busy === null ? (
        <span class="pick-side">
          <CountBadge {...durationCountItem(durationMs)} />
        </span>
      ) : (
        <span class="pick-meta pick-side pick-reason">{busy}</span>
      )}
    </label>
  );
}

/**
 * Who does the work: a radio list of creatures with each one's Crafting level and how long the job
 * would take with it (a clock badge). A creature that is busy is listed but cannot be picked, and the row
 * says why at its right, like `ui/RosterList`. Native radios, so the arrow keys and screen readers work as usual.
 */
export function CreaturePicker({
  name,
  options,
  value,
  onChange,
}: {
  /** Names the radio group; unique on the page. */
  name: string;
  options: readonly PickerOption[];
  value: string | null;
  onChange: (creatureId: string) => void;
}) {
  return (
    <fieldset class="picker">
      <legend>
        Who does the work? <Tag entry="skill-crafting">Crafting skill</Tag>
      </legend>
      {options.map((option) => (
        <PickRow
          key={option.creature.id}
          name={name}
          option={option}
          selected={value === option.creature.id}
          onChange={onChange}
        />
      ))}
    </fieldset>
  );
}
