import { gearBase } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { TAKE_OFF_ID, WEARS_IT_NOTE, equipOptions } from './equip-picker';
import { creatureName } from './game';
import type { GearActions } from './gear-actions';
import type { GearItem, GearState } from './gear-types';
import { detailLines, setPiecesWith } from './gear-view';
import { ItemCard } from './ItemCard';
import { DismantlePanel } from './ItemPanels';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Accordion } from './ui/Accordion';
import { RosterPicker } from './ui/RosterPicker';

/**
 * The "Equip on" row: a trigger that looks and acts like a dropdown, showing who wears the item (their
 * sprite and name) or "Choose a creature". It opens the creature picker sheet; the pick equips right away.
 */
function EquipOn({
  item,
  wearer,
  busy,
  open,
  triggerRef,
  onOpen,
}: {
  item: GearItem;
  wearer: Creature | undefined;
  busy: boolean;
  open: boolean;
  triggerRef: { current: HTMLButtonElement | null };
  onOpen: () => void;
}) {
  const labelId = `equip-on-${item.id}`;
  const valueId = `equip-on-${item.id}-value`;
  return (
    <div class="equip-on">
      <span id={labelId} class="equip-on-label">
        Equip on
      </span>
      <button
        ref={triggerRef}
        type="button"
        class="equip-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        disabled={busy}
        onClick={onOpen}
      >
        {wearer !== undefined && (
          <Sprite sprite={creatureSpriteOrFallback(wearer.species)} scale={2} />
        )}
        <span id={valueId} class={wearer === undefined ? 'equip-name equip-empty' : 'equip-name'}>
          {wearer === undefined ? 'Choose a creature' : creatureName(wearer)}
        </span>
        <svg
          class="equip-chevron"
          viewBox="0 0 7 4"
          aria-hidden="true"
          shape-rendering="crispEdges"
        >
          <rect x="0" y="0" width="7" height="1" />
          <rect x="1" y="1" width="5" height="1" />
          <rect x="2" y="2" width="3" height="1" />
          <rect x="3" y="3" width="1" height="1" />
        </svg>
      </button>
    </div>
  );
}

/**
 * One item of the bag: its card (image with its level, name, rarity, base stats, modifiers with their tiers),
 * then the "Equip on" row (who wears it, or "Choose a creature": the creature picker sheet equips right away,
 * and offers "Take off" first for a worn item), Dismantle, and where it came from and who made it one tap away
 * under "Details". The font is set once on the section (`.pix-panel`); only the Details text is body text.
 */
export function ItemDetail({
  item,
  gear,
  creatures,
  busy,
  actions,
  focusName = true,
  onGone,
  initialDismantle = false,
  initialPicking = false,
}: {
  item: GearItem;
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  actions: GearActions;
  /** Move the focus to the item's name when it is shown (not after a flip, which keeps the arrows' focus). */
  focusName?: boolean;
  /** The item no longer exists (it went into a dismantle job): the screen drops the selection. */
  onGone: () => void;
  /** The workbench shows the dismantle panel open. */
  initialDismantle?: boolean;
  /** The workbench shows the creature picker open. */
  initialPicking?: boolean;
}) {
  const [dismantle, setDismantle] = useState(initialDismantle);
  const [picking, setPicking] = useState(initialPicking);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const shown = useRef(false);
  // Choosing another item starts clean and moves focus to its name.
  useEffect(() => {
    if (shown.current) {
      setDismantle(false);
      setPicking(false);
    }
    shown.current = true;
    if (focusName) heading.current?.focus({ preventScroll: true });
  }, [item.id]);

  const base = gearBase(item.baseId);
  const wearer = creatures.find((c) => c.id === item.equippedOn);

  return (
    <section class="item-detail pix-panel" aria-labelledby={`item-${item.id}-name`}>
      <ItemCard
        item={item}
        heading
        nameId={`item-${item.id}-name`}
        nameRef={heading}
        spriteScale={6}
        wornInSet={wearer === undefined ? 0 : setPiecesWith(item, wearer.gear)}
      />
      <EquipOn
        item={item}
        wearer={wearer}
        busy={busy}
        open={picking}
        triggerRef={trigger}
        onOpen={() => {
          setPicking(true);
        }}
      />
      {picking && (
        <RosterPicker
          title="Equip on"
          options={equipOptions(item, creatures)}
          placedNote={WEARS_IT_NOTE}
          showEffects={false}
          anchor={() => trigger.current}
          onPick={(id) => {
            setPicking(false);
            // The creature that wears it already: nothing to ask the server.
            if (id === item.equippedOn) return;
            void actions.equip(item.id, id === TAKE_OFF_ID ? null : id);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}

      <div class="item-actions">
        <p class="actions">
          <button
            type="button"
            class="danger"
            disabled={busy}
            aria-expanded={dismantle}
            onClick={() => {
              setDismantle(true);
            }}
          >
            Dismantle
          </button>
        </p>
        {dismantle && (
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
                  else setDismantle(false);
                });
            }}
            onCancel={() => {
              setDismantle(false);
            }}
          />
        )}
      </div>

      <Accordion title="Details" variant="compact" class="item-details prose">
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
