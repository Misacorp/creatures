import { content } from '@creatures/game';
import { useMemo, useRef, useState } from 'preact/hooks';
import { getSpecies } from '../../game';
import { dropOutcome, type DropStatus, type DropTarget, type Selection } from '../../slot-outcome';
import { useDragDrop } from '../../use-drag-drop';
import { CreatureTray } from '../../ui/CreatureTray';
import { DragGhost } from '../../ui/DragGhost';
import { CueRail } from '../../ui/CueRail';
import { SlotButton, SlotRow, type SlotGroup, type SlotModel } from '../../ui/SlotRow';
import { affectSlotOf, cuesFor, effectLine, sceneOf, type SlotCue } from '../../ui/slot-cue';
import { useSlotAnnouncer, useSlotKeyboard } from '../../ui/use-slot-keyboard';
import { LiveRegion } from '../../ui/LiveRegion';
import { SPECIES_IDS, speciesLabel } from '../data';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

/** Fixed lineups for the cue presets: the first three stand in the row, the rest wait in the tray. */
const LINEUPS: Readonly<Record<string, readonly string[]>> = {
  // Cindle marks Scorched and Splashet sets off Steam.
  reacting: ['cindle', 'splashet', 'sproutle', 'ashmole'],
  // Tide, Grove, Ember in this order: nobody can set anything off.
  silent: ['splashet', 'sproutle', 'cindle', 'ashmole'],
  // Ashmole (Support) between two hitters.
  support: ['cindle', 'ashmole', 'splashet', 'sproutle'],
  // Sproutle (Guard) in the middle.
  guard: ['cindle', 'sproutle', 'splashet', 'ashmole'],
};

const REACTION_IDS: readonly string[] = content.reactions.map((r) => r.id);

interface DemoCreature {
  id: string;
  species: string;
  name: string;
  level: number;
}

/** Moves `id` to `target` in the row (a swap when the slot is taken); the tray takes it out. */
function moved(row: readonly (string | null)[], id: string, target: DropTarget | null) {
  if (target === null) return row;
  const next = [...row];
  const from = next.indexOf(id);
  if (target.kind === 'tray') {
    if (from >= 0) next[from] = null;
    return next;
  }
  const other = next[target.slot] ?? null;
  if (from >= 0) next[from] = other;
  next[target.slot] = id;
  return next;
}

/**
 * The tray and the slot row wired together with the game's own drag and drop hook, so a tap, a key
 * or a drag moves creatures. The rules here are a simple stand-in (any slot takes any creature).
 */
function PlacementDemo({ p }: { p: Props }) {
  const slotCount = num(p, 'slots');
  const lineup = LINEUPS[str(p, 'lineup')];
  const creatures = useMemo<DemoCreature[]>(
    () =>
      Array.from({ length: lineup?.length ?? num(p, 'creatures') }, (_, i) => {
        const species = lineup?.[i] ?? SPECIES_IDS[(i * 3) % SPECIES_IDS.length] ?? 'splashet';
        return { id: `demo-${String(i)}`, species, name: speciesLabel(species), level: 3 + i * 2 };
      }),
    [num(p, 'creatures'), str(p, 'lineup')],
  );
  const [row, setRow] = useState<(string | null)[]>(() =>
    Array.from({ length: slotCount }, (_, i) =>
      i < num(p, 'placed') ? (creatures[i]?.id ?? null) : null,
    ),
  );
  const [selected, setSelected] = useState<Selection>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLUListElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const disabled = bool(p, 'disabled');
  const nameOf = (id: string): string => creatures.find((c) => c.id === id)?.name ?? 'Creature';
  const [announcement, announce] = useSlotAnnouncer(selected, nameOf);

  const dragDrop = useDragDrop({
    disabled,
    stripRef,
    trayRef,
    onDrop: (id, target) => {
      setRow((r) => [...moved(r, id, target)]);
      setSelected(null);
      const status: DropStatus = target === null ? 'none' : 'valid';
      announce(target === null ? 'Dropped outside, nothing changed.' : 'Placed.');
      return dropOutcome(status, null, null, '');
    },
  });
  const { drag, consumeClick } = dragDrop;
  const dragging = drag?.creatureId ?? null;

  const onKeyDown = useSlotKeyboard({
    stripRef,
    selected,
    busy: false,
    vertical: true,
    onCancel: () => {
      setSelected(null);
      announce('Cancelled.');
    },
  });

  function tapCreature(id: string): void {
    if (consumeClick()) return;
    setSelected((s) => (s === id ? null : id));
  }
  function tapSlot(slot: number): void {
    if (consumeClick()) return;
    const here = row[slot] ?? null;
    if (selected !== null) {
      setRow((r) => [...moved(r, selected, { kind: 'slot', slot })]);
      setSelected(null);
    } else if (here !== null) {
      setSelected(here);
    }
  }

  const model = (index: number): SlotModel => {
    const id = row[index] ?? null;
    const c = id === null ? undefined : creatures.find((x) => x.id === id);
    return {
      index,
      ariaLabel:
        c === undefined
          ? `Slot ${String(index + 1)}, empty`
          : `Slot ${String(index + 1)}, ${c.name}`,
      occupant:
        c === undefined
          ? null
          : {
              species: c.species,
              name: c.name,
              level: c.level,
              ownId: c.id,
              mine: true,
            },
    };
  };
  const all = Array.from({ length: slotCount }, (_, i) => model(i));
  const groups: SlotGroup[] = [{ key: 'row', scale: 3, slots: all }];
  const statuses = dragging === null ? null : new Map(all.map((s) => [s.index, 'valid' as const]));
  const draggedCreature = dragging === null ? undefined : creatures.find((c) => c.id === dragging);
  const placed = new Set(row.filter((id): id is string => id !== null));

  // The cues, as the dungeon team draws them: the creature in focus (carried, or under the pointer,
  // or pinned by the page's "Pinned slot" control) and the row as it would stand.
  const carried = dragging ?? selected;
  const over = drag?.over?.kind === 'slot' ? drag.over.slot : hovered;
  const pinned = num(p, 'pin') > 0 ? num(p, 'pin') - 1 : null;
  const scene = sceneOf({
    keys: row,
    carried,
    pointer: over ?? (carried === null ? pinned : null),
  });
  const affectRow = scene.keys.map((id) => {
    const c = id === null ? undefined : creatures.find((x) => x.id === id);
    return c === undefined ? null : affectSlotOf(getSpecies(c.species));
  });
  const cues = cuesFor({
    row: affectRow,
    mode: { row: 'dungeon' },
    focus: scene.focus,
    scope: 'row',
  });
  const effect =
    scene.focus === null
      ? null
      : effectLine({
          row: affectRow,
          mode: { row: 'dungeon' },
          focus: scene.focus,
          nameOf: (slot) => nameOf(scene.keys[slot] ?? ''),
        });

  return (
    <div onKeyDown={onKeyDown}>
      <p class="muted small">
        Tap a creature and then a slot, press and drag, or use Enter and the arrow keys.
      </p>
      <CreatureTray
        items={creatures.map((c) => ({
          id: c.id,
          species: c.species,
          name: c.name,
          detail: <>Lv {c.level}</>,
          placed: placed.has(c.id),
        }))}
        trayRef={trayRef}
        disabled={disabled}
        selected={selected}
        drag={dragDrop}
        accepts={dragging !== null && placed.has(dragging)}
        onTap={tapCreature}
      >
        {creatures.length === 0 && <li class="muted">No creatures</li>}
      </CreatureTray>
      <SlotRow
        groups={groups}
        stripRef={stripRef}
        class="dungeon-strip"
        label={{ 'aria-label': 'Demo row' }}
        emptyLabel={str(p, 'emptyLabel')}
        disabled={disabled}
        selected={selected}
        drag={dragDrop}
        statuses={statuses}
        cues={cues.slots}
        onHoverSlot={setHovered}
        onTap={tapSlot}
      />
      <CueRail none={cues.none} effect={effect} />
      <DragGhost ghostRef={dragDrop.ghostRef} creature={draggedCreature} />
      <LiveRegion>{announcement}</LiveRegion>
    </div>
  );
}

const DEMO_CONTROLS = {
  slots: { kind: 'number', min: 1, max: 6 },
  creatures: { kind: 'number', min: 0, max: 6 },
  placed: { kind: 'number', min: 0, max: 6 },
  lineup: { kind: 'select', options: ['mixed', ...Object.keys(LINEUPS)] },
  pin: { kind: 'number', min: 0, max: 6 },
  disabled: { kind: 'toggle' },
  emptyLabel: { kind: 'text', maxLength: 12 },
} as const;

const DEMO_DEFAULTS = {
  slots: 3,
  creatures: 4,
  placed: 1,
  lineup: 'mixed',
  pin: 0,
  disabled: false,
  emptyLabel: 'empty',
} as const;

const DEMO_PRESETS = [
  { name: 'Dungeon team (3 slots)', props: {} },
  { name: 'Empty row', props: { placed: 0 } },
  { name: 'Locked', props: { disabled: true } },
  { name: 'No creatures', props: { creatures: 0, placed: 0 } },
  {
    name: 'Reaction cue (hover or tap Cindle)',
    props: { lineup: 'reacting', placed: 3, pin: 1 },
  },
  { name: 'No reaction mark', props: { lineup: 'silent', placed: 3, pin: 1 } },
  {
    name: 'Influence: a Support buffs its neighbours',
    props: { lineup: 'support', placed: 3, pin: 2 },
  },
  {
    name: 'Influence: a Guard covers its neighbours',
    props: { lineup: 'guard', placed: 3, pin: 2 },
  },
];

function demoEntry(
  name: string,
  file: string,
  description: string,
  covers?: readonly string[],
): Entry {
  return {
    name,
    file,
    group: 'Slots',
    description,
    ...(covers === undefined ? {} : { covers }),
    controls: DEMO_CONTROLS,
    defaults: DEMO_DEFAULTS,
    presets: DEMO_PRESETS,
    render: (p) => (
      <PlacementDemo
        key={`${String(num(p, 'slots'))}-${String(num(p, 'creatures'))}-${String(num(p, 'placed'))}-${str(p, 'lineup')}-${String(num(p, 'pin'))}`}
        p={p}
      />
    ),
  };
}

const slotRow = demoEntry(
  'SlotRow',
  'apps/activity/src/ui/SlotRow.tsx',
  "The row of slots where a team stands: the dungeon's team in one row of three (the raid's party is the RaidBoard). Working demo with the tray: tap, drag or use the keyboard.",
);

const creatureTray = demoEntry(
  'CreatureTray',
  'apps/activity/src/ui/CreatureTray.tsx',
  'The chips of the creatures you can pick up, above the slot row or board on the raid and dungeon team screens; dropping a creature back on it takes it out of the row.',
);

const dragGhost = demoEntry(
  'DragGhost',
  'apps/activity/src/ui/DragGhost.tsx',
  'The small copy of a creature that follows your finger or pointer while you drag it. Press and drag a creature in the demo to see it.',
);

const slotButton: Entry = {
  name: 'SlotButton',
  file: 'apps/activity/src/ui/SlotRow.tsx',
  group: 'Slots',
  description:
    'One slot of the row: its number, the creature standing in it (picture, name, level; in the raid the owner initial and the element ring) or the empty label, and what dropping a creature here would do.',
  controls: {
    species: { kind: 'select', options: ['none', ...SPECIES_IDS] },
    level: { kind: 'number', min: 1, max: 30 },
    owner: { kind: 'toggle' },
    ownerColour: { kind: 'number', min: 0, max: 7 },
    element: { kind: 'select', options: ['none', 'tide', 'ember', 'grove', 'spark'] },
    selected: { kind: 'toggle' },
    target: { kind: 'select', options: ['none', 'valid', 'invalid'] },
    reaction: { kind: 'select', options: ['none', ...REACTION_IDS] },
    influence: { kind: 'select', options: ['none', 'buff', 'cover'] },
    reactionRole: { kind: 'select', options: ['payoff', 'marker'] },
    compact: { kind: 'toggle' },
    disabled: { kind: 'toggle' },
    emptyLabel: { kind: 'text', maxLength: 12 },
  },
  defaults: {
    species: 'cindle',
    level: 5,
    owner: false,
    ownerColour: 0,
    element: 'none',
    selected: false,
    target: 'none',
    reaction: 'none',
    influence: 'none',
    reactionRole: 'payoff',
    compact: false,
    disabled: false,
    emptyLabel: 'empty',
  },
  presets: [
    { name: 'Occupied', props: {} },
    { name: 'Reaction: sets it off', props: { reaction: 'steam', reactionRole: 'payoff' } },
    { name: 'Influence: buffed by a Support', props: { influence: 'buff' } },
    { name: 'Influence: covered by a Guard', props: { influence: 'cover' } },
    {
      name: 'Reaction: marks (raid tile)',
      props: {
        reaction: 'steam',
        reactionRole: 'marker',
        owner: true,
        element: 'ember',
        compact: true,
      },
    },
    { name: 'Empty', props: { species: 'none' } },
    { name: 'Selected', props: { selected: true } },
    {
      name: 'Raid tile (owner and element)',
      props: { owner: true, ownerColour: 2, element: 'tide', compact: true },
    },
    { name: 'Drop is valid', props: { species: 'none', target: 'valid' } },
    { name: 'Drop is refused', props: { species: 'none', target: 'invalid' } },
  ],
  render: (p) => {
    const species = str(p, 'species');
    const own = species === 'none' ? null : 'demo';
    const status = str(p, 'target');
    const def = content.reactions.find((r) => r.id === str(p, 'reaction'));
    const marker = str(p, 'reactionRole') === 'marker';
    const influence = str(p, 'influence');
    const cue: SlotCue | undefined =
      def === undefined && influence === 'none'
        ? undefined
        : {
            ...(influence === 'buff' ? { buff: true as const } : {}),
            ...(influence === 'cover' ? { cover: true as const } : {}),
            ...(def === undefined
              ? {}
              : {
                  reaction: {
                    id: def.id,
                    name: def.name,
                    role: marker ? ('marker' as const) : ('payoff' as const),
                    element: marker ? def.markElement : def.triggerElement,
                  },
                }),
          };
    return (
      <SlotButton
        slot={{
          index: 0,
          ariaLabel: 'Slot 1',
          occupant:
            species === 'none'
              ? null
              : {
                  species,
                  name: speciesLabel(species),
                  level: num(p, 'level'),
                  ownId: own,
                  mine: true,
                  ...(bool(p, 'owner')
                    ? { owner: { colour: num(p, 'ownerColour'), initial: 'Y' } }
                    : {}),
                  ...(str(p, 'element') === 'none' ? {} : { element: str(p, 'element') }),
                },
        }}
        scale={bool(p, 'compact') ? 2 : 3}
        emptyLabel={str(p, 'emptyLabel')}
        disabled={bool(p, 'disabled')}
        selected={bool(p, 'selected') ? own : null}
        hasSelection={status !== 'none'}
        status={status === 'valid' || status === 'invalid' ? status : null}
        over={false}
        shaking={false}
        dragging={null}
        cue={cue}
        onHover={undefined}
        onPointerDown={() => undefined}
        onTap={() => undefined}
      />
    );
  },
};

const cueRail: Entry = {
  name: 'CueRail',
  file: 'apps/activity/src/ui/CueRail.tsx',
  group: 'Slots',
  description:
    'The strip under the dungeon team and the raid board. It shows a small "no reaction" mark when the order of the creatures cannot set off a reaction, one line about what the creature in focus does, and keeps its height when empty.',
  covers: ['NoReactionMark'],
  controls: { none: { kind: 'toggle' }, effect: { kind: 'text', maxLength: 120 } },
  defaults: { none: true, effect: '' },
  presets: [
    { name: 'No reaction', props: {} },
    { name: 'Nothing to say', props: { none: false } },
    {
      name: 'What a creature does',
      props: { none: false, effect: "Boosts its neighbours' next hit by 15%." },
    },
  ],
  render: (p) => <CueRail none={bool(p, 'none')} effect={str(p, 'effect') || null} />,
};

export const slotEntries: readonly Entry[] = [
  slotRow,
  slotButton,
  creatureTray,
  dragGhost,
  cueRail,
];
