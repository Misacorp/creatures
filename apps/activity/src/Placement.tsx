import { GLOSSARY_IDS } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import { TOUCH_HOLD_MS } from './dnd-core';
import type { Creature } from './api';
import { CreatureConfigurator, type ConfiguratorParts } from './CreatureConfigurator';
import { creatureInfoOf } from './creature-info';
import { creatureName } from './game';
import { GlossaryTag } from './Glossary';
import { usePopoverHost } from './PopoverHost';
import { resolveDrop, slotStatuses } from './raid-dnd';
import type { RaidView } from './raid-api';
import {
  askedSlots,
  boardCreatureInfoV2,
  boardCuesV2,
  boardSlotV2,
  creaturesBySlot,
  gridRowsV2,
  outgoingText,
  placeTextV2,
  rowNameV2,
  type LitMove,
} from './raid-board-v2';
import type { RaidV2View } from './raid-v2-api';
import {
  ROW_NAMES,
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
  baseOption,
  boardTotalLine,
  pickerOptions,
  pickerTitle,
  placedCount,
  placedLine,
  rosterNote,
  seatsWord,
  ON_BOARD_NOTE,
  type PickerCreature,
  type PickerOption,
} from './roster-picker';
import { DragGhost } from './ui/DragGhost';
import { LiveRegion } from './ui/LiveRegion';
import { PlacedCount } from './ui/PlacedCount';
import { RaidBoard, type BoardRowModel } from './ui/RaidBoard';
import { RosterPicker } from './ui/RosterPicker';
import { useSlotKeyboard } from './ui/use-slot-keyboard';
import { useDragDrop } from './use-drag-drop';
import type { TeamConfigure } from './TeamCreaturePage';

type Party = NonNullable<RaidView['party']>;

/** What a combat v2 week adds to the board (`rules: 2`): the grid and its extras, the boss move tapped on the card, and asking to swap. */
export interface PlacementV2 {
  view: RaidV2View;
  /** The boss move tapped on the card: its slots light in the boss-target look (null: none tapped). */
  lit: LitMove | null;
  /** Asks the owner of the creature in `theirSlot` to swap it for your creature in `mySlot`. */
  onAskSwap: (mySlot: number, theirSlot: number) => void;
}

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
  /** What a move comes to: the screen sends it to the server, which decides. */
  onIntent: (intent: Intent) => void;
  /**
   * Getting your creatures ready: a tap on one of yours on the board shows its configurator under the board
   * (another tap hides it), with Creature page (`onOpenPage`) and, while the board can change, Remove from
   * board. Absent: its popover with Remove from board.
   */
  configure?: TeamConfigure | undefined;
  /** Everything the player owns, in full (the configurator reads its creature from here). */
  owned?: readonly Creature[];
  /** Opens one of your board's creatures' own page in the tab's place. */
  onOpenPage?: (creatureId: string) => void;
  /** A combat v2 week: its grid, preview and swap requests. Absent on a v1 week, which looks and behaves as it always did. */
  v2?: PlacementV2 | undefined;
}

/** What a raid asks of a creature while the board can change: who it is, how it grows, what it fights with. */
const RAID_PARTS: ConfiguratorParts = {
  experience: true,
  stats: true,
  knack: true,
  gear: true,
  talents: true,
};

/** Once the board is locked for the finale the fight is frozen: what it wears, nothing to change. */
const LOCKED_PARTS: ConfiguratorParts = {
  experience: true,
  stats: true,
  knack: true,
  knackLocked: true,
  gear: true,
  gearLocked: true,
};

/**
 * The Raid Roster: the party board, where the player places up to three creatures beside everyone
 * else's. Placing the first one joins them to the week's raid; they bring exactly what they place.
 * Tapping an empty slot (or pressing Enter on it) opens the creature picker; tapping a
 * creature opens its popover (yours, with `configure`, shows its configurator under the board instead:
 * gear, talents, its page and Remove from board); your own creatures are dragged to move
 * them (a finger needs a short press and hold, so a swipe still scrolls the board).
 */
export function Placement(props: Props) {
  const { party, canEdit, busy, rosterNames } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const popovers = usePopoverHost();
  /** The slot under the mouse or the keyboard focus. */
  const [hovered, setHovered] = useState<number | null>(null);
  /** The empty slot the picker is open for. */
  const [picking, setPicking] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, announce] = useState('');
  /** Your creature whose configurator is shown under the board. */
  const [selected, setSelected] = useState<string | null>(null);
  /** The slot to focus again once the request that follows a pick or a remove is answered. */
  const refocus = useRef<number | null>(null);
  /** Combat v2: the other player's slot whose creature you are choosing one of yours to swap for. */
  const [swapFor, setSwapFor] = useState<number | null>(null);

  const v2 = props.v2;
  const grid = v2 === undefined ? null : { rows: v2.view.rows, cols: v2.view.cols };
  const placeAt = (slot: number): string =>
    grid === null ? placeText(slot, party.rowLength) : placeTextV2(slot, grid);
  const rows = grid === null ? boardRows(party.rowLength) : gridRowsV2(grid);
  const bySlot = new Map(party.row.map((slot) => [slot.slot, slot]));
  const ctx = {
    locked: !canEdit,
    row: party.row,
    ...(grid === null ? {} : { place: placeAt }),
  };
  const placed = placedCount(party.row);
  // How many creatures a player brings: a combat v2 boss's piece seats (2 to 4), three on a v1 week.
  const seats = v2 === undefined ? MAX_ON_BOARD : v2.view.seats;
  const note = rosterNote(placed, canEdit, seats);

  const nameOf = (creatureId: string): string =>
    party.row.find((s) => s.creature?.creatureId === creatureId)?.creature?.name ?? 'Creature';

  // The picker closes by itself when the board locks under it.
  useEffect(() => {
    if (!canEdit) setPicking(null);
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

  const statuses = dragging === null ? null : slotStatuses(ctx, dragging, nameOf(dragging));
  const dragged =
    dragging === null
      ? undefined
      : party.row.find((s) => s.creature?.creatureId === dragging)?.creature;

  // The cues: the creature in focus (carried, or under the pointer) and the row as it would stand.
  // A creature whose popover is open counts as in focus too.
  // The creature whose configurator is shown counts as inspected while no popover is open.
  const selectedSlot =
    selected === null
      ? undefined
      : party.row.find((s) => s.creature?.creatureId === selected)?.slot;
  const inspectedSlot =
    popovers?.anchor?.closest<HTMLElement>('[data-slot]')?.dataset.slot ??
    (selectedSlot === undefined ? undefined : String(selectedSlot));
  const cueArgs = {
    row: party.row,
    length: party.rowLength,
    tray: [],
    turnOrder: props.turnOrder,
  };
  // A v1 board lights reaction pairs and influence; a v2 board lights the boss move tapped on the card and marks the plain attack's target.
  const { cues, noneRow, effect } =
    v2 === undefined
      ? boardCues({
          ...cueArgs,
          carried: dragging,
          pointer: drag?.over?.slot ?? hovered,
          inspected: inspectedSlot === undefined ? null : Number(inspectedSlot),
        })
      : {
          cues: { slots: boardCuesV2(v2.view.preview, v2.lit), none: false },
          noneRow: null,
          effect: null,
        };
  const v2Context =
    v2 === undefined || grid === null
      ? null
      : {
          grid,
          creatures: creaturesBySlot(v2.view.creatures),
          asked: askedSlots(v2.view.swaps.outgoing, party.row),
        };

  const boardModels: BoardRowModel[] = rows.map((row, rowIndex) => ({
    zone: row.zone,
    name: v2Context === null ? ROW_NAMES[row.zone] : rowNameV2(rowIndex),
    // A v1 row is a zone with a glossary entry; a v2 row is a numbered row, the boss takes a turn after each.
    label:
      v2Context === null ? (
        <GlossaryTag entry={GLOSSARY_IDS.zone(row.zone)}>{ROW_NAMES[row.zone]}</GlossaryTag>
      ) : (
        rowNameV2(rowIndex)
      ),
    slots: row.slots.flatMap((n) => {
      const slot = bySlot.get(n);
      if (slot === undefined) return [];
      const model =
        v2Context === null
          ? boardSlot(slot, party.rowLength, rosterNames, canEdit)
          : boardSlotV2(slot, v2Context, rosterNames, canEdit);
      return [
        selected !== null && slot.creature?.creatureId === selected
          ? { ...model, selected: true }
          : model,
      ];
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
    const id = occupant.creatureId;
    // Yours, with the configurator: a tap shows it under the board (another tap hides it), no popover.
    if (props.configure !== undefined && occupant.mine && id !== undefined) {
      setHint(null);
      setSelected(selected === id ? null : id);
      return;
    }
    const info = v2 === undefined ? boardCreatureInfo(occupant) : boardCreatureInfoV2(occupant);
    if (info === null || popovers === null) return;
    const line =
      v2 === undefined
        ? boardCues({ ...cueArgs, carried: null, pointer: null, inspected: slot }).effect
        : null;
    const shown = line === null ? info : { ...info, effect: line };
    const key = `raid-slot:${String(slot)}`;
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
    // Another player's creature on a v2 board: ask its owner to swap it for one of yours.
    const mine = party.row.filter((s) => s.creature?.mine === true).length;
    popovers.openCreature(
      key,
      shown,
      button,
      v2 !== undefined && canEdit && !occupant.mine && mine > 0
        ? {
            label: 'Ask to swap',
            onAct: () => {
              setHint(null);
              setSwapFor(slot);
            },
          }
        : undefined,
    );
  }

  function pick(creatureId: string): void {
    if (picking === null) return;
    const slot = picking;
    const chosen = props.creatures.find((c) => c.id === creatureId);
    refocus.current = slot;
    setPicking(null);
    setHint(null);
    announce(
      `${chosen === undefined ? 'Creature' : creatureName(chosen)} placed in ${placeAt(slot)}.`,
    );
    props.onIntent({ type: 'place', creatureId, slot });
  }

  /** The sheet's title when asking to swap: "Swap with Mira's Lanternfin". */
  function swapTitle(theirSlot: number): string {
    const theirs = bySlot.get(theirSlot)?.creature ?? null;
    return theirs === null ? 'Ask to swap' : `Swap with ${theirs.ownerName}'s ${theirs.name}`;
  }

  /** The creatures of yours on the board: the ones that can be offered in a swap. */
  function swapOptions(): PickerOption[] {
    return party.row.flatMap((s) =>
      s.creature?.mine === true && s.creature.creatureId !== undefined
        ? [
            {
              ...baseOption({
                id: s.creature.creatureId,
                species: s.creature.species,
                nickname: s.creature.name,
                level: s.creature.level,
              }),
              note: placeAt(s.slot),
            },
          ]
        : [],
    );
  }

  /** One of your creatures was chosen to offer: the request goes to the server, which finds the player to ask. */
  function pickSwap(creatureId: string): void {
    const theirs = swapFor;
    const mine = party.row.find((s) => s.creature?.creatureId === creatureId)?.slot;
    setSwapFor(null);
    if (theirs === null || mine === undefined || v2 === undefined) return;
    announce('Swap asked.');
    v2.onAskSwap(mine, theirs);
  }

  // The selected creature, while it is still one of yours on the board.
  const shown =
    selectedSlot === undefined ? undefined : props.owned?.find((c) => c.id === selected);

  return (
    <div id="raid-placement" onKeyDown={onKeyDown}>
      <section class="raid-section placement pix-panel" aria-labelledby="raid-place-heading">
        <h3 id="raid-place-heading">Raid Roster</h3>
        <p class="muted small roster-help prose">
          Place up to {seatsWord(seats)} creatures on the board beside everyone else's. Placing your
          first one joins you to this week's raid, and you bring only what you place.
          {props.turnOrder === 'serpentine' &&
            ' The board shows the order of round 1; the rows flip direction each round.'}
        </p>
        <PlacedCount placed={placed} max={seats}>
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
          {...(v2 === undefined ? { rail: { none: cues.none, effect } } : {})}
          noneRow={noneRow}
          onTap={tapSlot}
          v2={v2 !== undefined}
        />
        {v2 !== undefined && grid !== null && v2.view.swaps.outgoing.length > 0 && (
          <ul class="swap-waiting muted small">
            {v2.view.swaps.outgoing.map((request) => (
              <li key={request.id}>{outgoingText(request, grid)}</li>
            ))}
          </ul>
        )}
        {props.configure !== undefined && shown !== undefined && (
          <CreatureConfigurator
            key={shown.id}
            creature={shown}
            state={props.configure.state}
            gear={props.configure.gear}
            busy={props.configure.busy}
            parts={canEdit ? RAID_PARTS : LOCKED_PARTS}
            actions={props.configure.actions}
            buttons={[
              ...(props.onOpenPage === undefined
                ? []
                : [
                    {
                      label: 'Creature page',
                      withCreature: true,
                      onAct: () => {
                        props.onOpenPage?.(shown.id);
                      },
                    },
                  ]),
              ...(canEdit
                ? [
                    {
                      label: 'Remove from board',
                      danger: true,
                      withCreature: true,
                      onAct: () => {
                        setSelected(null);
                        announce(`${creatureName(shown)} removed from the board.`);
                        props.onIntent({ type: 'unplace', creatureId: shown.id });
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
        {hint !== null && (
          <p class="muted" role="status">
            {hint}
          </p>
        )}
        {party.guests && (
          <p class="muted roster-note">
            Guest creatures fill the row while fewer than 3 players are in.
          </p>
        )}
      </section>

      <LiveRegion>{announcement}</LiveRegion>
      <DragGhost ghostRef={dragDrop.ghostRef} creature={dragged ?? undefined} />
      {picking !== null && (
        <RosterPicker
          title={pickerTitle(placeAt(picking))}
          status={placedLine(placed, seats)}
          options={pickerOptions({
            creatures: props.creatures,
            row: party.row,
            length: party.rowLength,
            slot: picking,
            turnOrder: props.turnOrder,
            // A v2 board has no reaction pairs or influence to preview; its picker greys the creatures knocked out this weekend.
            showEffects: v2 === undefined && SHOW_PICKER_EFFECTS,
            max: seats,
            ...(v2 === undefined
              ? {}
              : { out: new Set(v2.view.out.filter((o) => o.mine).map((o) => o.creatureId)) }),
          })}
          showEffects={v2 === undefined && SHOW_PICKER_EFFECTS}
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
      {swapFor !== null && v2 !== undefined && (
        <RosterPicker
          title={swapTitle(swapFor)}
          options={swapOptions()}
          showEffects={false}
          placedNote=""
          anchor={() =>
            stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(swapFor)}"]`) ?? null
          }
          onPick={pickSwap}
          onClose={() => {
            setSwapFor(null);
          }}
        />
      )}
    </div>
  );
}
