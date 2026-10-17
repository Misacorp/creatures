import { RULES } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from './api';
import type { GearActions } from './gear-actions';
import type { GearRarity, GearState } from './gear-types';
import { bulkPick, rarityName } from './gear-view';
import { GlossaryTag } from './Glossary';
import { DismantlePanel } from './ItemPanels';

const RARITIES: readonly GearRarity[] = ['common', 'rare', 'epic'];

/**
 * Dismantle by rarity and item level: pick a rarity and the highest item level to take, and the Workshop
 * takes the lowest ones first. The job rules are the same as for one item: up to 5 Commons share a
 * job, anything else goes alone, and a creature does the work. What does not fit in this job waits for
 * the next one. Worn items are never picked.
 */
export function BulkDismantle({
  gear,
  creatures,
  busy,
  actions,
  onStarted,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  actions: GearActions;
  onStarted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rarity, setRarity] = useState<GearRarity>('common');
  const [maxLevel, setMaxLevel] = useState<number>(RULES.gear.maxItemLevel);
  const [confirming, setConfirming] = useState(false);
  const picked = bulkPick(gear.items, rarity, maxLevel);
  const items = picked.ids.flatMap((id) => gear.items.filter((i) => i.id === id));
  const levels = Array.from({ length: RULES.gear.maxItemLevel }, (_, i) => i + 1);
  const perJob = rarity === 'common' ? RULES.gear.dismantle.bundleMax : 1;

  if (!open) {
    return (
      <p class="actions">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Dismantle several
        </button>
      </p>
    );
  }
  return (
    <section class="confirm bulk-dismantle" aria-labelledby="bulk-dismantle-title">
      <h4 id="bulk-dismantle-title" class="pix">
        Dismantle several <GlossaryTag entry="job-dismantle" look="help" />
      </h4>
      <p class="row">
        <label>
          Rarity{' '}
          <select
            value={rarity}
            onChange={(event) => {
              setRarity(event.currentTarget.value as GearRarity);
              setConfirming(false);
            }}
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {rarityName(r)}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Up to item level{' '}
          <select
            value={String(maxLevel)}
            onChange={(event) => {
              setMaxLevel(Number(event.currentTarget.value));
              setConfirming(false);
            }}
          >
            {levels.map((l) => (
              <option key={l} value={String(l)}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </p>
      <p role="status">
        {picked.matching === 0
          ? 'Nothing matches.'
          : `${String(picked.matching)} match · ${String(items.length)} in this job${
              picked.matching > perJob ? ' (lowest levels first)' : ''
            }`}
      </p>
      {confirming && items.length > 0 ? (
        <DismantlePanel
          items={items}
          wearers={[]}
          gear={gear}
          creatures={creatures}
          busy={busy}
          loadPreview={actions.previewDismantle}
          onConfirm={(creatureId) => {
            void actions
              .startJob({ kind: 'dismantle', creatureId, itemIds: items.map((i) => i.id) })
              .then((result) => {
                if (result !== undefined) {
                  setConfirming(false);
                  onStarted();
                }
              });
          }}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      ) : (
        <p class="actions">
          <button
            type="button"
            class="danger"
            disabled={busy || items.length === 0}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Pick {items.length === 0 ? 'none' : String(items.length)}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setConfirming(false);
            }}
          >
            Close
          </button>
        </p>
      )}
    </section>
  );
}
