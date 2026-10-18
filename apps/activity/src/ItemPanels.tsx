import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { CreaturePicker } from './CreaturePicker';
import { creatureName } from './game';
import { ItemFrame, ItemSprite } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { DismantlePreview, GearItem, GearState } from './gear-types';
import {
  defaultPick,
  dismantleDurationFor,
  dismantleLines,
  gearName,
  oddsPercent,
  pickerOptions,
} from './gear-view';
import { formatDuration } from './time-format';

type PreviewState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; preview: DismantlePreview };

/**
 * The in-page confirmation of a dismantle job (never `window.confirm`): which creature does it, what the
 * items can break into (a range, the same for every creature), how long it takes that creature, and the
 * chance to learn a blueprint. The items go into the Workshop when the job starts and the parts come when
 * it is claimed. Focus starts on "Keep it", the safe choice, and Escape keeps the items. Every number is
 * the server's (`previewDismantle`).
 */
export function DismantlePanel({
  items,
  wearers,
  gear,
  creatures,
  busy,
  loadPreview,
  onConfirm,
  onCancel,
}: {
  /** The items to take apart: a bundle of up to 5 Commons, or one piece of anything else. */
  items: readonly GearItem[];
  /** The creatures that wear any of them (they come off first). */
  wearers: readonly Creature[];
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  loadPreview: (creatureId: string, itemIds: readonly string[]) => Promise<DismantlePreview>;
  onConfirm: (creatureId: string) => void;
  onCancel: () => void;
}) {
  const first = items[0];
  const rarity = first?.rarity ?? 'common';
  const options = pickerOptions(creatures, gear.skills, (level) =>
    dismantleDurationFor(rarity, level),
  );
  const [picked, setPicked] = useState<string | null>(null);
  const valid = options.find((o) => o.creature.id === picked && o.busy === null);
  const creatureId = valid === undefined ? defaultPick(options) : picked;
  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  const key = items.map((i) => i.id).join(',');
  useEffect(() => {
    if (creatureId === null) return;
    let current = true;
    loadPreview(
      creatureId,
      items.map((i) => i.id),
    ).then(
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
  }, [creatureId, key]);

  if (first === undefined) return null;
  const preview = state.status === 'ready' ? state.preview : null;
  const title =
    items.length === 1
      ? `Dismantle ${gearName(first.baseId)}?`
      : `Dismantle ${String(items.length)} ${rarity} items?`;
  const noCreature = creatureId === null;
  return (
    <section
      class="confirm"
      role="group"
      aria-labelledby={`dismantle-${first.id}-q`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <h4 id={`dismantle-${first.id}-q`} class="pix">
        {title} <GlossaryTag entry="job-dismantle" look="help" />
      </h4>
      <ul class="dismantle-items" aria-label="Items to take apart">
        {items.map((item) => (
          <li key={item.id}>
            <ItemFrame rarity={item.rarity} baseId={item.baseId} level={item.itemLevel}>
              <ItemSprite baseId={item.baseId} scale={4} />
            </ItemFrame>
          </li>
        ))}
      </ul>
      <CreaturePicker
        name={`dismantle-${first.id}-who`}
        options={options}
        value={creatureId}
        onChange={(next) => {
          setPicked(next);
          setState({ status: 'loading' });
        }}
      />
      {state.status === 'loading' && !noCreature && (
        <p class="muted" role="status">
          Loading...
        </p>
      )}
      {state.status === 'failed' && (
        <p class="error" role="alert">
          Could not load the refund. Pick again to retry.
        </p>
      )}
      {preview !== null && (
        <>
          <p>
            Gives <strong>{dismantleLines(preview.range).join(', ') || 'nothing'}</strong> in{' '}
            {formatDuration(preview.durationMs)}.
          </p>
          {preview.learnBp !== null && (
            <p class="muted">
              {oddsPercent(preview.learnBp)} per piece to teach its blueprint or add a well-thumbed
              mark.
            </p>
          )}
        </>
      )}
      <p class="reason">Cannot be undone.</p>
      {wearers.length > 0 && (
        <p class="muted">Comes off {wearers.map((w) => creatureName(w)).join(' and ')} first.</p>
      )}
      <p class="actions">
        <button
          type="button"
          class="danger"
          disabled={busy || noCreature || preview === null}
          onClick={() => {
            if (creatureId !== null) onConfirm(creatureId);
          }}
        >
          Start dismantling
        </button>
        <button type="button" ref={keep} onClick={onCancel}>
          Keep {items.length === 1 ? 'it' : 'them'}
        </button>
      </p>
    </section>
  );
}
