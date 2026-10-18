import { gearBase } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { creatureName } from './game';
import type { GearActions } from './gear-actions';
import type { GearItem, GearState } from './gear-types';
import { detailLines, gearName, needsText, setPiecesWith, wearReason } from './gear-view';
import { ItemCard } from './ItemCard';
import { DismantlePanel } from './ItemPanels';
import { Accordion } from './ui/Accordion';

type Panel = 'dismantle' | 'equip' | null;

/** Equip on a creature (a list to pick from, with the reason when one cannot wear it) or take it off. */
function EquipPanel({
  item,
  creatures,
  busy,
  onEquip,
  onCancel,
}: {
  item: GearItem;
  creatures: readonly Creature[];
  busy: boolean;
  onEquip: (creatureId: string) => void;
  onCancel: () => void;
}) {
  const options = creatures
    .filter((c) => c.id !== item.equippedOn)
    .map((c) => ({ creature: c, blocked: wearReason(item, c) }));
  const usable = options.filter((o) => o.blocked === null);
  const [picked, setPicked] = useState(usable[0]?.creature.id ?? '');
  const target = usable.find((o) => o.creature.id === picked)?.creature ?? usable[0]?.creature;
  const selectId = `equip-${item.id}`;
  const slotWorn = target?.gear.find((g) => g.slot === item.slot);
  return (
    <section class="equip-panel" aria-label="Equip">
      {target === undefined ? (
        <p class="muted">No creature can wear this.</p>
      ) : (
        <>
          <label for={selectId}>Equip on</label>
          <select
            id={selectId}
            value={target.id}
            onChange={(event) => {
              setPicked(event.currentTarget.value);
            }}
          >
            {usable.map(({ creature: c }) => (
              <option key={c.id} value={c.id}>
                {creatureName(c)} (level {c.level})
                {c.gear.some((g) => g.slot === item.slot)
                  ? `, wears ${gearName(c.gear.find((g) => g.slot === item.slot)?.baseId ?? '')}`
                  : ''}
              </option>
            ))}
          </select>
          {slotWorn !== undefined && <p class="muted">Replaces {gearName(slotWorn.baseId)}.</p>}
        </>
      )}
      {options.some((o) => o.blocked !== null) && (
        <Accordion title="Who cannot wear it" variant="compact" class="blocked-note">
          <ul>
            {options
              .filter((o) => o.blocked !== null)
              .map((o) => (
                <li key={o.creature.id}>
                  {creatureName(o.creature)}: {o.blocked}
                </li>
              ))}
          </ul>
        </Accordion>
      )}
      <p class="actions">
        {target !== undefined && (
          <button
            type="button"
            class="primary"
            disabled={busy}
            onClick={() => {
              onEquip(target.id);
            }}
          >
            Equip on {creatureName(target)}
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </p>
    </section>
  );
}

/**
 * One item of the bag: its card (image with its level, name, rarity, base stats, modifiers with their tiers), who wears it and what you
 * can do with it (Equip or Take off, Dismantle). Where it came from and who made it sit one tap away
 * under "Details".
 */
export function ItemDetail({
  item,
  gear,
  creatures,
  busy,
  actions,
  onGone,
}: {
  item: GearItem;
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  actions: GearActions;
  /** The item no longer exists (it went into a dismantle job): the screen drops the selection. */
  onGone: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Choosing another item starts clean and moves focus to its name.
  useEffect(() => {
    setPanel(null);
    heading.current?.focus();
  }, [item.id]);

  const base = gearBase(item.baseId);
  const wearer = creatures.find((c) => c.id === item.equippedOn);

  return (
    <section class="item-detail" aria-labelledby={`item-${item.id}-name`}>
      <ItemCard
        item={item}
        heading
        nameId={`item-${item.id}-name`}
        nameRef={heading}
        spriteScale={6}
        wornInSet={wearer === undefined ? 0 : setPiecesWith(item, wearer.gear)}
      />
      <p>
        {wearer !== undefined && (
          <>
            Worn by <strong>{creatureName(wearer)}</strong>.{' '}
          </>
        )}
        <span class="muted">Needs {needsText(item).toLowerCase()}.</span>
      </p>

      <div class="item-actions">
        <p class="actions">
          {item.equippedOn === null ? (
            <button
              type="button"
              class="primary"
              disabled={busy}
              aria-expanded={panel === 'equip'}
              onClick={() => {
                setPanel(panel === 'equip' ? null : 'equip');
              }}
            >
              Equip
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void actions.equip(item.id, null);
                }}
              >
                Take off
              </button>
              <button
                type="button"
                disabled={busy}
                aria-expanded={panel === 'equip'}
                onClick={() => {
                  setPanel(panel === 'equip' ? null : 'equip');
                }}
              >
                Give to another
              </button>
            </>
          )}
          <button
            type="button"
            class="danger"
            disabled={busy}
            aria-expanded={panel === 'dismantle'}
            onClick={() => {
              setPanel('dismantle');
            }}
          >
            Dismantle
          </button>
        </p>
        {panel === 'equip' && (
          <EquipPanel
            item={item}
            creatures={creatures}
            busy={busy}
            onEquip={(creatureId) => {
              void actions.equip(item.id, creatureId).then((result) => {
                if (result !== undefined) setPanel(null);
              });
            }}
            onCancel={() => {
              setPanel(null);
            }}
          />
        )}
        {panel === 'dismantle' && (
          <DismantlePanel
            items={[item]}
            wearers={wearer === undefined ? [] : [wearer]}
            gear={gear}
            creatures={creatures}
            busy={busy}
            loadPreview={actions.previewDismantle}
            onConfirm={(creatureId) => {
              void actions
                .startJob({ kind: 'dismantle', creatureId, itemIds: [item.id] })
                .then((result) => {
                  if (result !== undefined) onGone();
                  else setPanel(null);
                });
            }}
            onCancel={() => {
              setPanel(null);
            }}
          />
        )}
      </div>

      <Accordion title="Details" variant="compact" class="item-details">
        {base !== undefined && <p class="muted flavor">{base.flavor}</p>}
        <ul class="detail-list">
          {detailLines(item).map((line) => (
            <li key={line} class="muted">
              {line}
            </li>
          ))}
        </ul>
      </Accordion>
    </section>
  );
}
