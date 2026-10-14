import { zoneIndices } from '@creatures/engine';
import { useMemo, useRef, useState } from 'preact/hooks';
import { usePopoverHost } from '../../PopoverHost';
import type { RowSlotView } from '../../raid-api';
import {
  ROW_NAMES,
  boardCreatureInfo,
  boardCues,
  boardKeyTarget,
  boardRows,
  boardSlot,
} from '../../raid-board';
import { dropOutcome, type DropTarget, type Selection } from '../../slot-outcome';
import { useDragDrop } from '../../use-drag-drop';
import { LiveRegion } from '../../ui/LiveRegion';
import { RaidBoard, type BoardRowModel } from '../../ui/RaidBoard';
import { useSlotAnnouncer, useSlotKeyboard } from '../../ui/use-slot-keyboard';
import { SPECIES_IDS, speciesLabel } from '../data';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

/** Names for the demo's players, in the order they join; the first is you. */
const NAMES = [
  'Misa',
  'Jun',
  'Ann',
  'Bo',
  'Cy',
  'Dee',
  'Eli',
  'Fay',
  'Gus',
  'Hal',
  'Ivy',
  'Joy',
  'Kai',
  'Lou',
  'Max',
] as const;

/** The slots (from 1) the cue presets pin: one that sets off a reaction, one that sets off nothing. */
const PIN_REACTION = 3;
const PIN_NONE = 4;
/** A Support (it buffs the tiles beside it) and a Guard (it covers its row). */
const PIN_BUFF = 7;
const PIN_COVER = 5;

const ZONES = ['front', 'middle', 'back'] as const;

interface DemoCreature {
  id: string;
  owner: number;
  species: string;
  level: number;
}

/** A party of `players` players, each with one creature in every row. Yours stands in `yourLane`. */
function startRow(players: number, yourLane: number, empty: number): (DemoCreature | null)[] {
  const length = players * 3;
  const mine = Math.min(yourLane, players - 1);
  const row: (DemoCreature | null)[] = Array.from({ length }, () => null);
  let next = 1;
  for (let lane = 0; lane < players; lane++) {
    // Lanes at the end are left empty (nobody placed there yet), but yours is always filled.
    if (lane !== mine && lane >= players - empty) continue;
    const owner = lane === mine ? 0 : next++;
    ZONES.forEach((zone, z) => {
      const slot = zoneIndices(zone, length)[lane];
      if (slot === undefined) return;
      row[slot] = {
        id: `demo-${String(owner)}-${String(z)}`,
        owner,
        species: SPECIES_IDS[(owner * 3 + z * 5) % SPECIES_IDS.length] ?? 'splashet',
        level: 3 + ((owner * 7 + z * 4) % 18),
      };
    });
  }
  return row;
}

/** The board wired like the game's Placement: tap, drag, the keyboard and the popover of others' creatures. */
function BoardDemo({ p }: { p: Props }) {
  const players = num(p, 'players');
  const length = players * 3;
  const [row, setRow] = useState(() => startRow(players, num(p, 'yourLane') - 1, num(p, 'empty')));
  const [selected, setSelected] = useState<Selection>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLUListElement>(null);
  const popovers = usePopoverHost();
  const disabled = bool(p, 'disabled');
  const rosterNames = useMemo(() => [...NAMES.slice(0, players)], [players]);

  const slots: RowSlotView[] = row.map((c, slot) => ({
    slot,
    zone: ZONES.find((z) => zoneIndices(z, length).includes(slot)) ?? 'middle',
    creature:
      c === null
        ? null
        : {
            ownerName: NAMES[c.owner] ?? 'Someone',
            species: c.species,
            name: speciesLabel(c.species),
            level: c.level,
            mine: c.owner === 0,
            ...(c.owner === 0 ? { creatureId: c.id } : {}),
          },
  }));
  const rows = boardRows(length);
  const nameOf = (id: string): string => row.find((c) => c?.id === id)?.species ?? 'Creature';
  const [announcement, announce] = useSlotAnnouncer(selected, nameOf);

  /** Moves or swaps one of your creatures onto a slot (the server's rule: empty or yours). */
  function place(id: string, slot: number): boolean {
    const target = row[slot] ?? null;
    if (target !== null && target.owner !== 0) return false;
    const next = [...row];
    const from = next.findIndex((c) => c?.id === id);
    if (from < 0) return false;
    next[from] = target;
    next[slot] = row[from] ?? null;
    setRow(next);
    return true;
  }

  const dragDrop = useDragDrop({
    disabled,
    stripRef,
    trayRef,
    onDrop: (id, target: DropTarget | null) => {
      setSelected(null);
      if (target === null || target.kind === 'tray') return dropOutcome('none', null, null, '');
      const ok = place(id, target.slot);
      announce(ok ? 'Placed.' : 'That slot belongs to someone else.');
      return dropOutcome(ok ? 'valid' : 'invalid', null, null, '');
    },
  });
  const dragging = dragDrop.drag?.creatureId ?? null;
  const statuses =
    dragging === null
      ? null
      : new Map(
          slots.map((s) => [
            s.slot,
            s.creature === null || s.creature.mine ? ('valid' as const) : ('invalid' as const),
          ]),
        );

  const onKeyDown = useSlotKeyboard({
    stripRef,
    selected,
    busy: false,
    vertical: true,
    keyTarget: (current, key) => boardKeyTarget(rows, current, key),
    onCancel: () => {
      setSelected(null);
      announce('Cancelled.');
    },
  });

  function tapSlot(slot: number, button: HTMLElement): void {
    if (dragDrop.consumeClick()) return;
    const here = slots[slot]?.creature ?? null;
    if (selected !== null) {
      place(selected, slot);
      setSelected(null);
    } else if (here !== null && here.mine && here.creatureId !== undefined) {
      setSelected(here.creatureId);
    } else if (here !== null) {
      const info = boardCreatureInfo(here);
      if (info !== null) {
        const line = boardCues({
          ...cueArgs,
          carried: null,
          pointer: null,
          inspected: slot,
        }).effect;
        popovers?.openCreature(
          `demo-slot:${String(slot)}`,
          line === null ? info : { ...info, effect: line },
          button,
        );
      }
    }
  }

  // The cues, as the game's Placement draws them: the creature in focus is carried, under the
  // pointer, or pinned by the page's "Pinned slot" control (a slot number from 1; 0 for none).
  const carried = dragging ?? selected;
  const over = dragDrop.drag?.over?.kind === 'slot' ? dragDrop.drag.over.slot : hovered;
  const pin = num(p, 'pin') > 0 ? num(p, 'pin') - 1 : null;
  const inspectedSlot = popovers?.anchor?.closest<HTMLElement>('[data-slot]')?.dataset.slot;
  const cueArgs = { row: slots, length, tray: [], turnOrder: str(p, 'turnOrder') };
  const { cues, noneRow, effect } = boardCues({
    ...cueArgs,
    carried,
    pointer: over ?? (carried === null ? pin : null),
    inspected: inspectedSlot === undefined ? null : Number(inspectedSlot),
  });

  const models: BoardRowModel[] = rows.map((r) => ({
    zone: r.zone,
    name: ROW_NAMES[r.zone],
    label: ROW_NAMES[r.zone],
    slots: r.slots.flatMap((n) => {
      const s = slots[n];
      return s === undefined ? [] : [boardSlot(s, length, rosterNames)];
    }),
  }));

  return (
    <div onKeyDown={onKeyDown}>
      <p class="muted small">
        Tap or drag one of your creatures (the tinted tiles), or use Enter and the arrow keys. Tap
        someone else&apos;s creature to see whose it is.
      </p>
      <RaidBoard
        rows={models}
        stripRef={stripRef}
        emptyLabel="empty"
        disabled={disabled}
        selected={selected}
        drag={dragDrop}
        statuses={statuses}
        cues={cues.slots}
        onHoverSlot={setHovered}
        rail={{ none: cues.none, effect }}
        noneRow={noneRow}
        onTap={tapSlot}
      />
      <LiveRegion>{announcement}</LiveRegion>
    </div>
  );
}

const raidBoard: Entry = {
  name: 'RaidBoard',
  file: 'apps/activity/src/ui/RaidBoard.tsx',
  group: 'Slots',
  description:
    "The raid's party as a grid on the Raid tab: Front, Middle and Back are three lines, each lane is a column, and the lines scroll sideways together. A strip of pips above jumps to a lane.",
  controls: {
    players: { kind: 'number', min: 1, max: 15 },
    yourLane: { kind: 'number', min: 1, max: 15 },
    empty: { kind: 'number', min: 0, max: 14 },
    turnOrder: { kind: 'select', options: ['left_to_right', 'right_to_left', 'speed'] },
    pin: { kind: 'number', min: 0, max: 45 },
    disabled: { kind: 'toggle' },
  },
  defaults: {
    players: 11,
    yourLane: 7,
    empty: 0,
    turnOrder: 'left_to_right',
    pin: 0,
    disabled: false,
  },
  presets: [
    { name: 'Eleven players (33 slots)', props: {} },
    { name: 'Just you (3 slots)', props: { players: 1, yourLane: 1 } },
    { name: 'Four players', props: { players: 4, yourLane: 2 } },
    { name: 'Full server (45 slots)', props: { players: 15, yourLane: 12 } },
    { name: 'Late lanes empty', props: { empty: 4 } },
    { name: 'Locked', props: { disabled: true } },
    { name: 'Reaction cue (slot pinned)', props: { players: 4, yourLane: 2, pin: PIN_REACTION } },
    { name: 'No reaction mark (slot pinned)', props: { players: 4, yourLane: 2, pin: PIN_NONE } },
    {
      name: 'Influence: a Support (slot pinned)',
      props: { players: 4, yourLane: 2, pin: PIN_BUFF },
    },
    {
      name: 'Influence: a Guard (slot pinned)',
      props: { players: 4, yourLane: 2, pin: PIN_COVER },
    },
  ],
  render: (p) => (
    <BoardDemo
      key={`${String(num(p, 'players'))}-${String(num(p, 'yourLane'))}-${String(num(p, 'empty'))}-${String(num(p, 'pin'))}-${str(p, 'turnOrder')}`}
      p={p}
    />
  ),
};

export const raidBoardEntries: readonly Entry[] = [raidBoard];
