import { GLOSSARY_IDS } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { CreaturePicker } from './CreaturePicker';
import { CostList } from './GearArt';
import { GlossaryTag } from './Glossary';
import { TreatBox } from './TreatBox';
import type { GearState, JobKind, PartsBundle } from './gear-types';
import { creatureName } from './game';
import { durationFor, pickerOptions, startBlocker } from './gear-view';
import { usePickedCreature } from './use-job-preview';

interface JobStarterProps {
  /** Unique on the page: names the radio group and the heading. */
  id: string;
  kind: JobKind;
  /** What is being worked on: "Craft Wave Band". */
  title: string;
  cost: PartsBundle;
  /** The Bait it costs besides the parts (a lure); absent: none. */
  bait?: number;
  gear: GearState;
  creatures: readonly Creature[];
  /** Another reason it cannot start (the Crafting level a supply needs), shown like the others. */
  extraBlocker?: string | null;
  /** True while any action runs. */
  busy: boolean;
  startLabel: string;
  /** A supply craft's length at a Crafting level (a supply has its own hours); required for `supply`. */
  durationAtLevel?: (level: number) => number;
  /** The Crafting level a creature needs for this job (a supply's blueprint); lower ones cannot be picked. */
  minLevel?: number;
  /** Starts the job with the picked creature; `treat` is true when the player packed a treat for it. */
  onStart: (creatureId: string, treat: boolean) => void;
  onCancel: () => void;
}

/**
 * The panel that starts a job: what it costs, who does it (a free creature), how long it takes with
 * that creature, and a Start button that says why it is disabled when it is. Moves focus to its
 * heading when it opens, and Escape closes it.
 */
export function JobStarter(props: JobStarterProps) {
  const { gear, creatures, kind, cost } = props;
  const durationAt = props.durationAtLevel ?? durationFor;
  const options = pickerOptions(creatures, gear.skills, durationAt).map((o) =>
    props.minLevel !== undefined && o.busy === null && o.level < props.minLevel
      ? { ...o, busy: `Needs Crafting level ${String(props.minLevel)}` }
      : o,
  );
  // The pick follows the list: a creature that became busy is no longer picked.
  const [value, setPicked] = usePickedCreature(options);
  const [treat, setTreat] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const bait = props.bait ?? 0;
  const worker = options.find((o) => o.creature.id === value)?.creature;
  // The treat is paid on top of a lure's own Bait; one that cannot be paid is not packed.
  const treatBait = gear.balances.bait - bait;
  const packing = treat && worker !== undefined && treatBait >= worker.treatCost;
  const blocker = startBlocker(gear, creatures, { kind, cost, bait }) ?? props.extraBlocker ?? null;
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
      <p class="label">Cost</p>
      <CostList cost={cost} have={gear.parts} />
      {bait > 0 && (
        <p class={gear.balances.bait >= bait ? 'bait-cost' : 'bait-cost short'}>
          {bait} Bait <span class="muted">(you have {gear.balances.bait})</span>
        </p>
      )}
      <CreaturePicker
        name={`${props.id}-who`}
        options={options}
        value={value}
        onChange={setPicked}
      />
      {worker !== undefined && (
        <TreatBox
          cost={worker.treatCost}
          bait={treatBait}
          checked={packing}
          disabled={props.busy}
          who={creatureName(worker)}
          onChange={setTreat}
        />
      )}
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
            if (value !== null) props.onStart(value, packing);
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
