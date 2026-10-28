import { gearBase } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { TAKE_OFF_ID, WEARS_IT_NOTE, equipOptions } from './equip-picker';
import { creatureName } from './game';
import type { GearActions } from './gear-actions';
import type { GearItem } from './gear-types';
import { detailLines, setPiecesWith } from './gear-view';
import { ItemCard } from './ItemCard';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Accordion } from './ui/Accordion';
import { DrillHead } from './ui/DrillHead';
import { CreatureList } from './ui/CreatureList';

/**
 * The "Equip on" row: a trigger that looks and acts like a dropdown, showing who wears the item (their
 * sprite and name) or "Choose a creature". It opens the creature list, a view of the same drawer; the pick equips right away.
 */
function EquipOn({
  item,
  wearer,
  busy,
  triggerRef,
  onOpen,
}: {
  item: GearItem;
  wearer: Creature | undefined;
  busy: boolean;
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
 * The "Equip on" view: a drill-in of the item drawer, in the place of the item (never a sheet over the drawer).
 * "‹ Back" at the top left (or Escape) returns to the item with nothing changed; a pick asks the server and
 * returns too. The list is the creature picker's (`CreatureList`): Take off first for a worn item, who can wear it
 * first, a short reason on the rest. Left and Right do not flip the item behind it, and a swipe is ignored.
 */
function EquipView({
  item,
  creatures,
  onPick,
  onBack,
}: {
  item: GearItem;
  creatures: readonly Creature[];
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <section
      class="item-detail equip-view dr-stack pix-panel"
      aria-label="Equip on"
      data-no-flip=""
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // Back to the item, not out of the drawer.
          event.preventDefault();
          event.stopPropagation();
          onBack();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.stopPropagation();
        }
      }}
    >
      {/* The view starts at its top, whatever the item view had been scrolled to. */}
      <DrillHead title="Equip on" backLabel="to the item" scroll onBack={onBack} />
      <CreatureList
        options={equipOptions(item, creatures)}
        selection={{ mode: 'pick', onPick }}
        placedNote={WEARS_IT_NOTE}
        reasonSide
        class="flat"
      />
    </section>
  );
}

/**
 * One item of the bag: its card (image with its level, name, rarity, base stats, modifiers with their tiers),
 * then the "Equip on" row (who wears it, or "Choose a creature": it opens the creature list as a view of this
 * same drawer, which equips right away and offers "Take off" first for a worn item), where it came from and who
 * made it one tap away under "Details", and last, centred and apart, the red "Dismantle" (the destructive action
 * comes last). It runs the same flow as dismantling from the bag for this one item, in the same frame
 * (a warning first when the item is worn, then who, then the confirmation). The card only has the button: the flow is
 * the bag's own `DismantleDrawer`, which the screen puts in this drawer's place (`onDismantle`). The font is set
 * once on the section (`.pix-panel`); only the Details text is body text.
 */
export function ItemDetail({
  item,
  creatures,
  busy,
  actions,
  focusName = true,
  initialPicking = false,
  onDrill,
  onDismantle,
  focusDismantle = false,
}: {
  item: GearItem;
  creatures: readonly Creature[];
  busy: boolean;
  actions: GearActions;
  /** Move the focus to the item's name when it is shown (not after a flip, which keeps the arrows' focus). */
  focusName?: boolean;
  /** The workbench shows the creature list ("Equip on") open. */
  initialPicking?: boolean;
  /** Told when the creature list opens and closes: the drawer turns its flipping off while it is shown. */
  onDrill?: (open: boolean) => void;
  /** Shows the red Dismantle button, and what it does (the screen opens the dismantle flow for this item). Absent: no button. */
  onDismantle?: () => void;
  /** Move the focus to the Dismantle button when shown (back from the flow). */
  focusDismantle?: boolean;
}) {
  const [picking, setPicking] = useState(initialPicking);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const dismantleButton = useRef<HTMLButtonElement | null>(null);
  const shown = useRef(false);
  // Choosing another item starts clean and moves focus to its name.
  useEffect(() => {
    const again = shown.current;
    if (again) setPicking(false);
    shown.current = true;
    if (focusDismantle && !again) dismantleButton.current?.focus({ preventScroll: true });
    else if (focusName) heading.current?.focus({ preventScroll: true });
  }, [item.id]);
  // The drawer is told while a drill-in is shown (and when this goes away), and the button that opened it gets
  // the focus back.
  const was = useRef(false);
  useEffect(() => {
    onDrill?.(picking);
    if (!picking && was.current) trigger.current?.focus();
    was.current = picking;
  }, [picking]);
  useEffect(
    () => () => {
      onDrill?.(false);
    },
    [],
  );

  const base = gearBase(item.baseId);
  const wearer = creatures.find((c) => c.id === item.equippedOn);

  if (picking) {
    return (
      <EquipView
        item={item}
        creatures={creatures}
        onBack={() => {
          setPicking(false);
        }}
        onPick={(id) => {
          setPicking(false);
          // The creature that wears it already: nothing to ask the server.
          if (id === item.equippedOn) return;
          void actions.equip(item.id, id === TAKE_OFF_ID ? null : id);
        }}
      />
    );
  }

  return (
    <section class="item-detail dr-stack pix-panel" aria-labelledby={`item-${item.id}-name`}>
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
        triggerRef={trigger}
        onOpen={() => {
          setPicking(true);
        }}
      />

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

      {onDismantle !== undefined && (
        <div class="item-actions dr-stack dr-section">
          <p class="actions">
            <button
              ref={dismantleButton}
              type="button"
              class="danger"
              disabled={busy}
              onClick={onDismantle}
            >
              Dismantle
            </button>
          </p>
        </div>
      )}
    </section>
  );
}
