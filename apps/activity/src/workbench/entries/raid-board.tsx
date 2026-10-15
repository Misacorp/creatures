import { zoneIndices } from '@creatures/engine';
import { useMemo, useState } from 'preact/hooks';
import { Placement } from '../../Placement';
import type { RaidView, RowSlotView } from '../../raid-api';
import type { Intent } from '../../raid-slots';
import {
  BOARD_FULL_REASON,
  MAX_ON_BOARD,
  pickerOptions,
  pickerTitle,
  placedCount,
  type PickerCreature,
} from '../../roster-picker';
import { RosterPicker } from '../../ui/RosterPicker';
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

const ZONES = ['front', 'middle', 'back'] as const;

/** A creature of someone else on the demo's board. */
interface Other {
  owner: number;
  species: string;
  level: number;
}

/** What the demo's board holds: other players' creatures by slot, and your own creature ids by slot. */
interface Board {
  others: (Other | null)[];
  mine: (string | null)[];
}

/** Slots in a party's row: nine with fewer than three players (guests fill the rest), else three each. */
const rowLength = (players: number): number => (players < 3 ? 9 : players * 3);

/** Everything you own in the demo: distinct species from the shipped content, levels spread out. */
function ownedCreatures(count: number): PickerCreature[] {
  return Array.from({ length: count }, (_, i) => {
    const species = SPECIES_IDS[(i * 5 + 2) % SPECIES_IDS.length] ?? 'splashet';
    return { id: `mine-${String(i)}`, species, nickname: null, level: 4 + ((i * 7) % 17) };
  });
}

/**
 * A party of `players` players: everyone else stands in one lane of three (one creature in every
 * row) and `placed` of your creatures stand in your lane, one per row from the front.
 */
function startBoard(players: number, yourLane: number, placed: number, empty: number): Board {
  const length = rowLength(players);
  const lanes = length / 3;
  const others: (Other | null)[] = Array.from({ length }, () => null);
  const mine: (string | null)[] = Array.from({ length }, () => null);
  const own = Math.min(yourLane, lanes - 1);
  let owner = 1;
  for (let lane = 0; lane < lanes && owner < players; lane++) {
    if (lane === own) continue;
    // Lanes at the end are left empty (nobody placed there yet).
    if (lane >= lanes - empty) continue;
    ZONES.forEach((zone, z) => {
      const slot = zoneIndices(zone, length)[lane];
      if (slot === undefined) return;
      others[slot] = {
        owner,
        species: SPECIES_IDS[(owner * 3 + z * 5) % SPECIES_IDS.length] ?? 'splashet',
        level: 3 + ((owner * 7 + z * 4) % 18),
      };
    });
    owner++;
  }
  ZONES.slice(0, placed).forEach((zone, z) => {
    const slot = zoneIndices(zone, length)[own];
    if (slot !== undefined) mine[slot] = `mine-${String(z)}`;
  });
  return { others, mine };
}

/**
 * The server's rules for a placement, as far as the demo needs them: an own creature that is not on
 * the board needs a free place among three, an empty slot takes it, an own creature swaps, someone
 * else's slot refuses. Returns the new board, or the reason it was refused.
 */
function applyIntent(board: Board, intent: Intent): Board | string {
  const mine = [...board.mine];
  const from = mine.indexOf(intent.creatureId);
  if (intent.type === 'unplace') {
    if (from >= 0) mine[from] = null;
    return { ...board, mine };
  }
  if (board.others[intent.slot] !== null) return 'That slot belongs to someone else.';
  if (from < 0 && mine.filter((id) => id !== null).length >= MAX_ON_BOARD) return BOARD_FULL_REASON;
  const there = mine[intent.slot] ?? null;
  if (from >= 0) mine[from] = there;
  mine[intent.slot] = intent.creatureId;
  return { ...board, mine };
}

/** The party view the Placement draws, from the demo's board. */
function partyView(board: Board, owned: readonly PickerCreature[]): NonNullable<RaidView['party']> {
  const length = board.mine.length;
  const row: RowSlotView[] = board.mine.map((id, slot) => {
    const zone = ZONES.find((z) => zoneIndices(z, length).includes(slot)) ?? 'middle';
    const other = board.others[slot] ?? null;
    const own = owned.find((c) => c.id === id);
    if (own !== undefined) {
      return {
        slot,
        zone,
        creature: {
          ownerName: NAMES[0],
          species: own.species,
          name: speciesLabel(own.species),
          level: own.level,
          mine: true,
          creatureId: own.id,
        },
      };
    }
    return {
      slot,
      zone,
      creature:
        other === null
          ? null
          : {
              ownerName: NAMES[other.owner] ?? 'Someone',
              species: other.species,
              name: speciesLabel(other.species),
              level: other.level,
              mine: false,
            },
    };
  });
  return {
    party: 1,
    rowLength: length,
    row,
    guests: length === 9,
    bossHp: null,
    adaptation: null,
    results: [],
    readiness: null,
  };
}

/** The whole Raid Roster, wired to a stand-in for the server (the same rules, no network). */
function RosterDemo({ p }: { p: Props }) {
  const players = num(p, 'players');
  const owned = useMemo(() => ownedCreatures(num(p, 'owned')), [num(p, 'owned')]);
  const [board, setBoard] = useState(() =>
    startBoard(players, num(p, 'yourLane') - 1, num(p, 'placed'), num(p, 'empty')),
  );
  const [refused, setRefused] = useState<string | null>(null);
  const locked = bool(p, 'locked');

  function onIntent(intent: Intent): void {
    const next = applyIntent(board, intent);
    if (typeof next === 'string') {
      setRefused(next);
      return;
    }
    setRefused(null);
    setBoard(next);
  }

  const party = partyView(board, owned);
  return (
    <>
      <Placement
        party={party}
        creatures={owned}
        canEdit={!locked}
        busy={false}
        rosterNames={NAMES.slice(0, players)}
        turnOrder={str(p, 'turnOrder')}
        next={{ event: 'phase1', at: 0 }}
        onIntent={onIntent}
      />
      {refused !== null && (
        <p class="muted" role="status">
          The server would say no: {refused}
        </p>
      )}
    </>
  );
}

const raidBoard: Entry = {
  name: 'RaidBoard',
  file: 'apps/activity/src/ui/RaidBoard.tsx',
  group: 'Slots',
  description:
    "The raid's Raid Roster on the Raid tab: the party as a grid (Front, Middle and Back are three lines, each lane a column, scrolling sideways together) under two count lines: how many of your creatures are placed (with a green check at 3 / 3), and how many creatures of everyone are on the board out of all its slots. Tap an empty slot for the creature picker, tap a creature for its popover (yours has Remove from board), drag your own to move them.",
  controls: {
    players: { kind: 'number', min: 1, max: 15 },
    yourLane: { kind: 'number', min: 1, max: 15 },
    placed: { kind: 'number', min: 0, max: 3 },
    empty: { kind: 'number', min: 0, max: 14 },
    owned: { kind: 'number', min: 1, max: 12 },
    turnOrder: { kind: 'select', options: ['left_to_right', 'right_to_left', 'speed'] },
    locked: { kind: 'toggle' },
  },
  defaults: {
    players: 11,
    yourLane: 7,
    placed: 1,
    empty: 3,
    owned: 7,
    turnOrder: 'left_to_right',
    locked: false,
  },
  presets: [
    { name: 'Eleven players, one of yours placed', props: {} },
    { name: 'Nothing placed yet', props: { placed: 0 } },
    { name: '3 / 3 placed (green check, picker disables new ones)', props: { placed: 3 } },
    {
      name: 'Just you (9 slots, guests fill the rest)',
      props: { players: 1, yourLane: 1, empty: 0 },
    },
    { name: 'Four players', props: { players: 4, yourLane: 2, empty: 1 } },
    { name: 'Full server (45 slots)', props: { players: 15, yourLane: 12, empty: 4 } },
    { name: 'Locked (read-only, no remove button)', props: { locked: true, placed: 2 } },
  ],
  render: (p) => (
    <RosterDemo
      key={`${String(num(p, 'players'))}-${String(num(p, 'yourLane'))}-${String(num(p, 'placed'))}-${String(num(p, 'empty'))}-${String(num(p, 'owned'))}-${str(p, 'turnOrder')}-${String(bool(p, 'locked'))}`}
      p={p}
    />
  ),
};

/** The picker over a row where a Support and a Guard of yours are among the options. */
function PickerDemo({ p }: { p: Props }) {
  const [open, setOpen] = useState(bool(p, 'open'));
  const owned = useMemo(() => ownedCreatures(num(p, 'owned')), [num(p, 'owned')]);
  const board = useMemo(() => startBoard(5, 2, num(p, 'placed'), 1), [num(p, 'placed')]);
  const party = partyView(board, owned);
  // The first empty slot of the Middle row is the one being filled.
  const slot = party.row.find((s) => s.zone === 'middle' && s.creature === null)?.slot ?? 0;
  const options = pickerOptions({
    creatures: owned,
    row: party.row,
    length: party.rowLength,
    slot,
    turnOrder: str(p, 'turnOrder'),
    showEffects: bool(p, 'effects'),
  });
  return (
    <>
      <p class="muted small">
        The picker is a sheet over the page. Close it with Escape or the Close button, and open it
        again here.
      </p>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open the picker
      </button>
      {open && (
        <RosterPicker
          title={pickerTitle('Middle')}
          status={`${String(placedCount(party.row))} / ${String(MAX_ON_BOARD)} on the board`}
          options={options}
          showEffects={bool(p, 'effects')}
          anchor={() => null}
          onPick={() => {
            setOpen(false);
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

const rosterPicker: Entry = {
  name: 'RosterPicker',
  file: 'apps/activity/src/ui/RosterPicker.tsx',
  group: 'Slots',
  description:
    'The creature picker of the Raid Roster: a bottom sheet listing everything you own with its level, element, role and, optionally, one quiet line led by a bold "In this slot:" about what it would do there. Creatures already on the board say they move here; at 3 / 3 the new ones are disabled with the reason.',
  controls: {
    effects: { kind: 'toggle' },
    placed: { kind: 'number', min: 0, max: 3 },
    owned: { kind: 'number', min: 1, max: 12 },
    turnOrder: { kind: 'select', options: ['left_to_right', 'right_to_left', 'speed'] },
    open: { kind: 'toggle' },
  },
  defaults: { effects: true, placed: 1, owned: 7, turnOrder: 'left_to_right', open: true },
  presets: [
    { name: 'Effects on ("In this slot:" line under each creature)', props: { effects: true } },
    { name: 'Effects off (names and tags only)', props: { effects: false } },
    { name: '3 / 3 on the board (new ones disabled)', props: { placed: 3 } },
    { name: 'Nothing on the board yet', props: { placed: 0 } },
    { name: 'Few creatures (two)', props: { owned: 2 } },
  ],
  render: (p) => (
    <PickerDemo
      key={`${String(bool(p, 'effects'))}-${String(num(p, 'placed'))}-${String(num(p, 'owned'))}-${str(p, 'turnOrder')}-${String(bool(p, 'open'))}`}
      p={p}
    />
  ),
};

export const raidBoardEntries: readonly Entry[] = [raidBoard, rosterPicker];
