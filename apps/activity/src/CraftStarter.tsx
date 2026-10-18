import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { CreaturePicker } from './CreaturePicker';
import { CostList } from './GearArt';
import { creatureName } from './game';
import { GlossaryTag } from './Glossary';
import { TreatBox } from './TreatBox';
import type { CraftOption, CraftPreview, GearState, ReachId } from './gear-types';
import {
  defaultPick,
  durationFor,
  qualityText,
  oddsPercent,
  oddsText,
  pickerOptions,
  reachName,
  startBlocker,
} from './gear-view';
import { formatDuration } from './time-format';
import { Accordion } from './ui/Accordion';

type PreviewState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; preview: CraftPreview };

/**
 * The panel that starts a craft: who does it, then the ways to start it (a plain craft, Reach for Rare,
 * Reach for Epic), each with its exact odds, its cost and its time. Every number is the server's: this
 * screen asks `previewCraft` for the picked creature and writes down what comes back. The item level and
 * the blueprint quality is one tap away under "Details".
 */
export function CraftStarter({
  id,
  name,
  baseId,
  gear,
  creatures,
  busy,
  loadPreview,
  onStart,
  onCancel,
}: {
  /** Unique on the page: names the radio groups and the heading. */
  id: string;
  /** The item's name: "Craft Kelp Cap". */
  name: string;
  baseId: string;
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  loadPreview: (creatureId: string, blueprintId: string) => Promise<CraftPreview>;
  /** Starts the craft; `treat` is true when the player packed a treat for the crafter. */
  onStart: (creatureId: string, reach: ReachId, treat: boolean) => void;
  onCancel: () => void;
}) {
  const options = pickerOptions(creatures, gear.skills, durationFor);
  const [picked, setPicked] = useState<string | null>(null);
  const valid = options.find((o) => o.creature.id === picked && o.busy === null);
  const creatureId = valid === undefined ? defaultPick(options) : picked;
  const [reach, setReach] = useState<ReachId>('none');
  const [treat, setTreat] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // The numbers follow the creature (its Crafting level) and what the player holds.
  useEffect(() => {
    if (creatureId === null) return;
    let current = true;
    loadPreview(creatureId, baseId).then(
      (preview) => {
        if (current) setState({ status: 'ready', preview });
      },
      () => {
        if (current) setState({ status: 'failed' });
      },
    );
    return () => {
      current = false;
    };
  }, [creatureId, baseId, gear.serverNow]);

  const crafter = options.find((o) => o.creature.id === creatureId)?.creature;
  const packing = treat && crafter !== undefined && gear.balances.bait >= crafter.treatCost;
  const preview = state.status === 'ready' ? state.preview : null;
  const chosen: CraftOption | undefined =
    preview?.options.find((o) => o.reach === reach && o.unlocked) ??
    preview?.options.find((o) => o.reach === 'none');
  const blocker =
    chosen === undefined
      ? null
      : startBlocker(gear, creatures, {
          kind: 'craft',
          cost: chosen.parts,
          essence: chosen.essence,
        });
  const baseLocked = preview?.locked === true;
  const disabled =
    busy ||
    creatureId === null ||
    chosen === undefined ||
    blocker !== null ||
    preview === null ||
    baseLocked;

  return (
    <section
      class="job-starter craft-starter"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <h4 id={`${id}-title`} class="pix" tabIndex={-1} ref={heading}>
        Craft {name} <GlossaryTag entry="job-craft" look="help" />
      </h4>
      <CreaturePicker
        name={`${id}-who`}
        options={options}
        value={creatureId}
        onChange={(next) => {
          setPicked(next);
          setState({ status: 'loading' });
        }}
      />
      {crafter !== undefined && (
        <TreatBox
          cost={crafter.treatCost}
          bait={gear.balances.bait}
          checked={packing}
          disabled={busy}
          who={creatureName(crafter)}
          onChange={setTreat}
        />
      )}
      {state.status === 'loading' && creatureId !== null && (
        <p class="muted" role="status">
          Loading the odds...
        </p>
      )}
      {state.status === 'failed' && (
        <p class="error" role="alert">
          Could not load the odds. Pick again to retry.
        </p>
      )}
      {preview !== null && (
        <fieldset class="picker reach-options">
          <legend>
            How hard do you reach? <GlossaryTag entry="reach" look="help" />
          </legend>
          {preview.options.map((o) => {
            const on = chosen?.reach === o.reach;
            return (
              <label
                key={o.reach}
                class={`pick reach${o.unlocked ? '' : ' busy'}${on ? ' on' : ''}`}
              >
                <input
                  type="radio"
                  name={`${id}-reach`}
                  value={o.reach}
                  checked={on}
                  disabled={!o.unlocked}
                  onChange={() => {
                    setReach(o.reach);
                  }}
                />
                <span class="pick-text">
                  <span class="pick-name pix">{reachName(o.reach)}</span>
                  <span class="reach-odds">{oddsText(o.oddsBp)}</span>
                  {o.unlocked ? (
                    <>
                      <span class="pick-meta">{formatDuration(o.durationMs)}</span>
                      <CostList
                        cost={o.parts}
                        have={gear.parts}
                        {...(o.essence > 0
                          ? { essence: o.essence, essenceHave: gear.balances.essence }
                          : {})}
                      />
                    </>
                  ) : (
                    <span class="pick-meta">Needs Crafting level {o.minLevel}</span>
                  )}
                </span>
              </label>
            );
          })}
          <Accordion title="Details" variant="compact" class="reach-details">
            <p class="muted">
              Item level {preview.itemLevel} (2 × Crafting level {preview.craftingLevel})
            </p>
            <p class="muted">
              Step-up chance {oddsPercent(preview.stepUpBp)}: 1% per Crafting level above 1 and per
              point of blueprint quality ({qualityText(preview.marks)})
            </p>
          </Accordion>
        </fieldset>
      )}
      {baseLocked && preview !== null && (
        <p class="reason" role="status">
          {name} needs Crafting level {preview.needsCraftingLevel}.
        </p>
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
            if (creatureId !== null && chosen !== undefined)
              onStart(creatureId, chosen.reach, packing);
          }}
        >
          {chosen === undefined || chosen.reach === 'none'
            ? 'Start crafting'
            : `Start: ${reachName(chosen.reach)}`}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </p>
    </section>
  );
}
