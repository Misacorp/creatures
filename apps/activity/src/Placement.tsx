import { GLOSSARY_IDS } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import { TOUCH_HOLD_MS } from './dnd-core';
import { creatureInfoOf } from './creature-info';
import { creatureName } from './game';
import { GlossaryTag } from './Glossary';
import { usePopoverHost } from './PopoverHost';
import { resolveDrop, roomHint, slotStatuses } from './raid-dnd';
import type { RaidView } from './raid-api';
import {
  ROW_NAMES,
  awayNotes,
  boardCreatureInfo,
  boardCues,
  boardKeyTarget,
  boardRows,
  boardSlot,
  placeText,
} from './raid-board';
import type { Intent } from './raid-slots';
import {
  SHOW_PICKER_EFFECTS,
  MAX_ON_BOARD,
  awayPickerOptions,
  boardTotalLine,
  pickerOptions,
  pickerTitle,
  placedCount,
  rosterNote,
  ON_BOARD_NOTE,
  type PickerCreature,
} from './roster-picker';
import { DragGhost } from './ui/DragGhost';
import { LiveRegion } from './ui/LiveRegion';
import { PlacedCount } from './ui/PlacedCount';
import { RaidBoard, type BoardRowModel } from './ui/RaidBoard';
import { RosterPicker } from './ui/RosterPicker';
import { useSlotKeyboard } from './ui/use-slot-keyboard';
import { useDragDrop } from './use-drag-drop';

type Party = NonNullable<RaidView['party']>;

interface Props {
  party: Party;
  /** Everything the player owns: the picker offers these. */
  creatures: readonly PickerCreature[];
  /** False once the board is locked: it is then read-only (no picker, no drag, no remove button). */
  canEdit: boolean;
  /** A request is in flight: the tiles are switched off until it is answered. */
  busy: boolean;
  rosterNames: readonly string[];
  /** How the boss's turn order reads (`left_to_right`, `right_to_left`, `speed` or `serpentine`): the order reactions are set off in. */
  turnOrder: string;
  /** The week's next event: when the creatures still missing from the board join by themselves. */
  next: RaidView['next'];
  /** What a move comes to: the screen sends it to the server, which decides. */
  onIntent: (intent: Intent) => void;
}

/**
 * The Raid Roster: the party board, where the player places up to three creatures beside everyone
 * else's. Tapping an empty slot (or pressing Enter on it) opens the creature picker; tapping a
 * creature opens its popover (yours has "Remove from board"); your own creatures are dragged to move
 * them (a finger needs a short press and hold, so a swipe still scrolls the board). When the board
 * locks, the player's strongest creatures fill the places still empty, by the server.
 */
export function Placement(props: Props) {
  const { party, canEdit, busy, rosterNames } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const popovers = usePopoverHost();
  /** The slot under the mouse or the keyboard focus. */
  const [hovered, setHovered] = useState<number | null>(null);
  /** The empty slot the picker is open for. */
  const [picking, setPicking] = useState<number | null>(null);
  /** The tile of an away teammate's creature the swap picker is open for. */
  const [swapping, setSwapping] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, announce] = useState('');
  /** The slot to focus again once the request that follows a pick or a remove is answered. */
  const refocus = useRef<number | null>(null);

  const rows = boardRows(party.rowLength);
  const bySlot = new Map(party.row.map((slot) => [slot.slot, slot]));
  const ctx = { locked: !canEdit, row: party.row };
  const placed = placedCount(party.row);
  const note = rosterNote(placed, props.next, canEdit);

  const nameOf = (creatureId: string): string =>
    party.row.find((s) => s.creature?.creatureId === creatureId)?.creature?.name ?? 'Creature';

  // The picker closes by itself when the board locks under it.
  useEffect(() => {
    if (!canEdit) {
      setPicking(null);
      setSwapping(null);
    }
  }, [canEdit]);

  // After a pick or a remove the tiles are off while the request runs; focus goes back to the slot.
  useEffect(() => {
    if (busy || refocus.current === null) return;
    const slot = refocus.current;
    refocus.current = null;
    stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(slot)}"]`)?.focus();
  }, [busy]);

  const dragDrop = useDragDrop({
    disabled: busy || !canEdit,
    stripRef,
    touchHoldMs: TOUCH_HOLD_MS,
    onDrop: (creatureId, target) => {
      const outcome = resolveDrop(ctx, creatureId, nameOf(creatureId), target);
      setHint(outcome.hint);
      announce(outcome.announce);
      if (outcome.intent !== null) props.onIntent(outcome.intent);
      return outcome;
    },
  });
  const { drag, consumeClick } = dragDrop;

  const onKeyDown = useSlotKeyboard({
    stripRef,
    keyTarget: (current, key) => boardKeyTarget(rows, current, key),
  });

  const dragging = drag?.creatureId ?? null;

  // A drag starting (after the hold, for a finger) closes any open popover at once, the one of the
  // creature being carried included, so it cannot sit over the board while a creature is moved.
  useEffect(() => {
    if (dragging !== null) popovers?.close();
  }, [dragging === null]);

  // Over an auto tile of someone else: it will make room (it moves to a free place).
  const overSlot = drag?.over?.slot;
  const overHint =
    dragging === null || overSlot === undefined ? null : roomHint(ctx, dragging, overSlot);
  const statuses = dragging === null ? null : slotStatuses(ctx, dragging, nameOf(dragging));
  const dragged =
    dragging === null
      ? undefined
      : party.row.find((s) => s.creature?.creatureId === dragging)?.creature;

  // The cues: the creature in focus (carried, or under the pointer) and the row as it would stand.
  // A creature whose popover is open counts as in focus too.
  const inspectedSlot = popovers?.anchor?.closest<HTMLElement>('[data-slot]')?.dataset.slot;
  const cueArgs = {
    row: party.row,
    length: party.rowLength,
    tray: [],
    turnOrder: props.turnOrder,
  };
  const { cues, noneRow, effect } = boardCues({
    ...cueArgs,
    carried: dragging,
    pointer: drag?.over?.slot ?? hovered,
    inspected: inspectedSlot === undefined ? null : Number(inspectedSlot),
  });

  const boardModels: BoardRowModel[] = rows.map((row) => ({
    zone: row.zone,
    name: ROW_NAMES[row.zone],
    label: <GlossaryTag entry={GLOSSARY_IDS.zone(row.zone)}>{ROW_NAMES[row.zone]}</GlossaryTag>,
    slots: row.slots.flatMap((n) => {
      const slot = bySlot.get(n);
      return slot === undefined ? [] : [boardSlot(slot, party.rowLength, rosterNames, canEdit)];
    }),
  }));

  /**
   * A tap on a tile. An empty one opens the picker; a creature opens its popover: yours with a
   * "Remove from board" button (while the board can still change), someone else's with the owner.
   */
  function tapSlot(slot: number, button: HTMLElement): void {
    if (consumeClick()) return;
    const occupant = bySlot.get(slot)?.creature ?? null;
    if (occupant === null) {
      if (!canEdit) {
        setHint('The board is locked.');
        return;
      }
      setHint(null);
      setPicking(slot);
      return;
    }
    const info = boardCreatureInfo(occupant);
    if (info === null || popovers === null) return;
    const line = boardCues({ ...cueArgs, carried: null, pointer: null, inspected: slot }).effect;
    const shown = line === null ? info : { ...info, effect: line };
    const key = `raid-slot:${String(slot)}`;
    const id = occupant.creatureId;
    if (occupant.mine && occupant.auto && id !== undefined) {
      // Joins by itself: tapping it makes the place a real placement, so it stays where it is.
      const own = {
        ...creatureInfoOf(shown),
        ...(shown.effect === undefined ? {} : { effect: shown.effect }),
      };
      popovers.openCreature(
        key,
        own,
        button,
        canEdit
          ? {
              label: 'Place here',
              onAct: () => {
                refocus.current = slot;
                setHint(null);
                announce(`${occupant.name} placed in ${placeText(slot, party.rowLength)}.`);
                props.onIntent({ type: 'place', creatureId: id, slot });
              },
            }
          : undefined,
      );
      return;
    }
    if (occupant.movable && canEdit && id !== undefined) {
      // An away teammate's: it can be dragged, or swapped for another creature they own.
      popovers.openCreature(key, shown, button, {
        label: 'Swap for another',
        onAct: () => {
          setHint(null);
          setSwapping(slot);
        },
      });
      return;
    }
    if (occupant.mine && id !== undefined) {
      // Your own: no owner line, and a way off the board while that is still allowed.
      const own = {
        ...creatureInfoOf(shown),
        ...(shown.effect === undefined ? {} : { effect: shown.effect }),
      };
      popovers.openCreature(
        key,
        own,
        button,
        canEdit
          ? {
              label: 'Remove from board',
              onAct: () => {
                refocus.current = slot;
                setHint(null);
                announce(`${occupant.name} removed from the board.`);
                props.onIntent({ type: 'unplace', creatureId: id });
              },
            }
          : undefined,
      );
      return;
    }
    popovers.openCreature(key, shown, button);
  }

  function pick(creatureId: string): void {
    if (picking === null) return;
    const slot = picking;
    const chosen = props.creatures.find((c) => c.id === creatureId);
    refocus.current = slot;
    setPicking(null);
    setHint(null);
    announce(
      `${chosen === undefined ? 'Creature' : creatureName(chosen)} placed in ${placeText(slot, party.rowLength)}.`,
    );
    props.onIntent({ type: 'place', creatureId, slot });
  }

  const swapTile = swapping === null ? undefined : bySlot.get(swapping)?.creature;
  const swapOwner =
    swapTile === undefined || swapTile === null
      ? undefined
      : party.away.find((a) => a.ownerName === swapTile.ownerName);
  const notes = awayNotes(party.away, party.row);

  function swap(creatureId: string): void {
    if (swapping === null) return;
    const slot = swapping;
    const chosen = swapOwner?.creatures.find((c) => c.creatureId === creatureId);
    refocus.current = slot;
    setSwapping(null);
    setHint(null);
    announce(`${chosen?.name ?? 'Creature'} swapped in at ${placeText(slot, party.rowLength)}.`);
    props.onIntent({ type: 'place', creatureId, slot });
  }

  return (
    <div id="raid-placement" onKeyDown={onKeyDown}>
      <section class="raid-section placement" aria-labelledby="raid-place-heading">
        <h3 id="raid-place-heading">Raid Roster</h3>
        <p class="muted small roster-help">
          Pick your creatures and place them on the board alongside everyone else.
          {props.turnOrder === 'serpentine' &&
            ' The board shows the order of round 1; the rows flip direction each round.'}
        </p>
        <PlacedCount placed={placed}>
          <span class="roster-total">
            <span class="roster-sep" aria-hidden="true">
              {' · '}
            </span>
            <span class="visually-hidden">, </span>
            {boardTotalLine(party.row, party.rowLength)}
          </span>
        </PlacedCount>
        {note !== null && <p class="muted small roster-when">{note}</p>}
        <RaidBoard
          rows={boardModels}
          stripRef={stripRef}
          emptyLabel={canEdit ? 'Add' : 'empty'}
          disabled={busy}
          drag={dragDrop}
          statuses={statuses}
          cues={cues.slots}
          onHoverSlot={setHovered}
          rail={{ none: cues.none, effect }}
          noneRow={noneRow}
          onTap={tapSlot}
        />
        {(overHint ?? hint) !== null && (
          <p class="muted" role="status">
            {overHint ?? hint}
          </p>
        )}
        {notes.away.map((line) => (
          <p key={line} class="muted small roster-away">
            {line}
          </p>
        ))}
        {notes.moved.map((line) => (
          <p key={line} class="muted small roster-moved">
            {line}
          </p>
        ))}
        {party.guests && (
          <p class="muted roster-note">
            Guest creatures fill the row while fewer than 3 players are in.
          </p>
        )}
      </section>

      <LiveRegion>{announcement}</LiveRegion>
      <DragGhost ghostRef={dragDrop.ghostRef} creature={dragged ?? undefined} />
      {swapping !== null && swapOwner !== undefined && swapTile != null && (
        <RosterPicker
          title={`Swap ${swapTile.name} for another of ${swapOwner.ownerName}'s`}
          status={`${swapOwner.ownerName} is away`}
          options={awayPickerOptions(swapOwner.creatures)}
          showEffects={false}
          placedNote=""
          anchor={() =>
            stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(swapping)}"]`) ??
            null
          }
          onPick={swap}
          onClose={() => {
            setSwapping(null);
          }}
        />
      )}
      {picking !== null && (
        <RosterPicker
          title={pickerTitle(placeText(picking, party.rowLength))}
          status={`${String(placed)} / ${String(MAX_ON_BOARD)} placed`}
          options={pickerOptions({
            creatures: props.creatures,
            row: party.row,
            length: party.rowLength,
            slot: picking,
            turnOrder: props.turnOrder,
            showEffects: SHOW_PICKER_EFFECTS,
          })}
          showEffects={SHOW_PICKER_EFFECTS}
          placedNote={ON_BOARD_NOTE}
          anchor={() =>
            stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(picking)}"]`) ?? null
          }
          onPick={pick}
          onClose={() => {
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
