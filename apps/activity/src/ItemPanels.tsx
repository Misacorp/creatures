import { GLOSSARY_IDS, improveCost } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { creatureName } from './game';
import { PartsList } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { GearItem, GearState } from './gear-types';
import { enchantChoices, gearName, partsText, statText, type EnchantChoice } from './gear-view';
import { JobStarter } from './JobStarter';

interface PanelProps {
  item: GearItem;
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  onCancel: () => void;
  /** Starts the job; resolves true when it started. */
  onStart: (creatureId: string, detail: JobDetail) => Promise<boolean>;
}

export type JobDetail = { secondaryIndex: number } | { enchantId: string };

/** Why an improve is not possible on this item at all; null when it is. */
export function improveBlocker(item: Pick<GearItem, 'rarity' | 'secondaries'>): string | null {
  if (item.secondaries.length === 0 || improveCost(item.rarity) === null) {
    return 'Common gear has no extra stat to re-roll. Improve works on Rare gear and better.';
  }
  return null;
}

/** Improve: pick which extra stat to re-roll, then who works on it. */
export function ImprovePanel({ item, gear, creatures, busy, onCancel, onStart }: PanelProps) {
  const [index, setIndex] = useState(0);
  const cost = improveCost(item.rarity);
  if (cost === null) return null;
  return (
    <JobStarter
      id={`improve-${item.id}`}
      kind="improve"
      title={`Improve ${gearName(item.baseId)}`}
      rarity={item.rarity}
      cost={cost}
      item={item}
      gear={gear}
      creatures={creatures}
      busy={busy}
      startLabel="Start improving"
      onStart={(creatureId) => {
        void onStart(creatureId, { secondaryIndex: index });
      }}
      onCancel={onCancel}
    >
      <p class="muted">Re-rolls one extra stat. The new one can be better or worse.</p>
      <fieldset class="picker">
        <legend>Which extra stat?</legend>
        {item.secondaries.map((s, i) => (
          <label key={i} class={i === index ? 'pick on' : 'pick'}>
            <input
              type="radio"
              name={`improve-${item.id}-stat`}
              checked={i === index}
              onChange={() => {
                setIndex(i);
              }}
            />
            <span class="pick-text">
              <span class="pick-name pix">{statText(s.stat, s.bp)}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </JobStarter>
  );
}

/** Enchant: pick the enchant (its effect, who it works for and its price), then who works on it. */
export function EnchantPanel({ item, gear, creatures, busy, onCancel, onStart }: PanelProps) {
  const choices = enchantChoices();
  const [enchantId, setEnchantId] = useState<string>(choices[0]?.id ?? '');
  const choice: EnchantChoice | undefined = choices.find((c) => c.id === enchantId);
  if (choice === undefined) return null;
  const same = item.enchantId === choice.id;
  const selectId = `enchant-${item.id}-pick`;
  return (
    <JobStarter
      id={`enchant-${item.id}`}
      kind="enchant"
      title={`Enchant ${gearName(item.baseId)}`}
      rarity={item.rarity}
      cost={choice.cost}
      item={item}
      extraBlocker={same ? 'This item already has that enchant.' : null}
      gear={gear}
      creatures={creatures}
      busy={busy}
      startLabel="Start enchanting"
      onStart={(creatureId) => {
        void onStart(creatureId, { enchantId: choice.id });
      }}
      onCancel={onCancel}
    >
      <label for={selectId}>Enchant</label>
      <select
        id={selectId}
        value={choice.id}
        onChange={(event) => {
          setEnchantId(event.currentTarget.value);
        }}
      >
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <p>
        <GlossaryTag entry={GLOSSARY_IDS.enchant(choice.id)} look="text">
          {choice.effect}
        </GlossaryTag>
      </p>
      <p class="muted">
        {choice.when} An item has one enchant slot: a new enchant replaces the old one.
      </p>
    </JobStarter>
  );
}

/**
 * The in-page confirmation of a dismantle (never `window.confirm`): what the item breaks into, a
 * warning that it cannot be undone, and a note when it is worn. Focus starts on "Keep it", the safe
 * choice, and Escape keeps the item.
 */
export function DismantleConfirm({
  item,
  wearer,
  busy,
  onConfirm,
  onCancel,
}: {
  item: GearItem;
  wearer: Creature | undefined;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <section
      class="confirm"
      role="group"
      aria-labelledby={`dismantle-${item.id}-q`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <h4 id={`dismantle-${item.id}-q`} class="pix">
        Dismantle {gearName(item.baseId)} +{item.level}?
      </h4>
      <p>
        It breaks into: <strong>{partsText(item.dismantle)}</strong>.
      </p>
      <p class="reason">This cannot be undone.</p>
      {wearer !== undefined && (
        <p class="muted">{creatureName(wearer)} is wearing it. It comes off first.</p>
      )}
      <PartsList parts={item.dismantle} />
      <p class="actions">
        <button type="button" class="danger" disabled={busy} onClick={onConfirm}>
          Yes, dismantle it
        </button>
        <button type="button" ref={keep} onClick={onCancel}>
          Keep it
        </button>
      </p>
    </section>
  );
}
