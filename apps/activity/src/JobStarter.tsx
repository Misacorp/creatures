import { GLOSSARY_IDS, type GearJobKind } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { CreaturePicker } from './CreaturePicker';
import { CostList } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { GearItem, GearRarity, GearState, JobKind, PartsBundle } from './gear-types';
import { defaultPick, durationFor, pickerOptions, startBlocker } from './gear-view';

export interface JobStarterProps {
  /** Unique on the page: names the radio group and the heading. */
  id: string;
  kind: JobKind;
  /** What is being worked on: "Craft Wave Band". */
  title: string;
  /** The rarity that sets the length (the blueprint's for a craft, the item's otherwise). */
  rarity: GearRarity;
  cost: PartsBundle;
  /** The item an improve or an enchant works on (it cannot be in another job). */
  item?: Pick<GearItem, 'jobId'>;
  gear: GearState;
  creatures: readonly Creature[];
  /** Another reason it cannot start (for example the same enchant again), shown like the others. */
  extraBlocker?: string | null;
  /** True while any action runs. */
  busy: boolean;
  startLabel: string;
  /** A supply craft's length at a Crafting level (a supply has its own hours); required for `supply`. */
  durationAtLevel?: (level: number) => number;
  /** The Crafting level a creature needs for this job (a supply's blueprint); lower ones cannot be picked. */
  minLevel?: number;
  /** Extra controls above the creature list (which extra stat, which enchant). */
  children?: preact.ComponentChildren;
  onStart: (creatureId: string) => void;
  onCancel: () => void;
}

/**
 * The panel that starts a job: what it costs, who does it (a free creature), how long it takes with
 * that creature, and a Start button that says why it is disabled when it is. Moves focus to its
 * heading when it opens, and Escape closes it.
 */
export function JobStarter(props: JobStarterProps) {
  const { gear, creatures, kind, rarity, cost } = props;
  const durationAt =
    props.durationAtLevel ?? ((level: number) => durationFor(kind as GearJobKind, rarity, level));
  const options = pickerOptions(creatures, gear.skills, durationAt).map((o) =>
    props.minLevel !== undefined && o.busy === null && o.level < props.minLevel
      ? { ...o, busy: `Needs Crafting level ${String(props.minLevel)}` }
      : o,
  );
  const [picked, setPicked] = useState<string | null>(null);
  // The pick follows the list: a creature that became busy is no longer picked.
  const valid = options.find((o) => o.creature.id === picked && o.busy === null);
  const value = valid === undefined ? defaultPick(options) : picked;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const blocker =
    startBlocker(gear, creatures, {
      kind,
      cost,
      ...(props.item === undefined ? {} : { item: props.item }),
    }) ??
    props.extraBlocker ??
    null;
  const disabled = props.busy || blocker !== null || value === null;
  return (
    <section
      class="job-starter"
      aria-labelledby={`${props.id}-title`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') props.onCancel();
      }}
    >
      <h4 id={`${props.id}-title`} class="pix" tabIndex={-1} ref={heading}>
        {props.title} <GlossaryTag entry={GLOSSARY_IDS.job(kind)} look="help" />
      </h4>
      {props.children}
      <p class="label">Cost</p>
      <CostList cost={cost} have={gear.parts} />
      <CreaturePicker
        name={`${props.id}-who`}
        options={options}
        value={value}
        onChange={setPicked}
      />
      {blocker !== null && (
        <p class="reason" role="status">
          {blocker}
        </p>
      )}
      <p class="actions">
        <button
          type="button"
          class="primary"
          disabled={disabled}
          onClick={() => {
            if (value !== null) props.onStart(value);
          }}
        >
          {props.startLabel}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </p>
    </section>
  );
}
