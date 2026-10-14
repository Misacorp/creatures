import { useMemo, useRef, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { useElementWidth } from '../../hooks';
import { SLOT_FALLBACK_PX, SLOT_LAYOUT, layoutVars, zoneLayout } from '../../zone-layout';
import { dropOutcome, type DropStatus, type DropTarget, type Selection } from '../../slot-outcome';
import { useDragDrop } from '../../use-drag-drop';
import { CreatureTray } from '../../ui/CreatureTray';
import { DragGhost } from '../../ui/DragGhost';
import { SlotButton, SlotRow, type SlotGroup, type SlotModel } from '../../ui/SlotRow';
import { useSlotAnnouncer, useSlotKeyboard } from '../../ui/use-slot-keyboard';
import { LiveRegion } from '../../ui/LiveRegion';
import { SPECIES_IDS, speciesLabel } from '../data';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const ZONE_NAMES = ['Front', 'Middle', 'Back'] as const;

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
  const creatures = useMemo<DemoCreature[]>(
    () =>
      Array.from({ length: num(p, 'creatures') }, (_, i) => {
        const species = SPECIES_IDS[(i * 3) % SPECIES_IDS.length] ?? 'splashet';
        return { id: `demo-${String(i)}`, species, name: speciesLabel(species), level: 3 + i * 2 };
      }),
    [num(p, 'creatures')],
  );
  const [row, setRow] = useState<(string | null)[]>(() =>
    Array.from({ length: slotCount }, (_, i) =>
      i < num(p, 'placed') ? (creatures[i]?.id ?? null) : null,
    ),
  );
  const [selected, setSelected] = useState<Selection>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const stripWidth = useElementWidth(stripRef, SLOT_FALLBACK_PX);
  const trayRef = useRef<HTMLUListElement>(null);
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
              ...(bool(p, 'owners') ? { owner: { colour: index % 8, line: 'You' } } : {}),
            },
    };
  };
  const all = Array.from({ length: slotCount }, (_, i) => model(i));
  const zoned = bool(p, 'zones');
  const groups: SlotGroup[] = zoned
    ? ZONE_NAMES.map((label, z) => {
        const size = Math.ceil(slotCount / 3);
        const slots = all.slice(z * size, (z + 1) * size);
        const layout = zoneLayout(slots.length, stripWidth, SLOT_LAYOUT);
        return {
          key: label,
          scale: layout.tier.scale,
          slots,
          zone: { label, vars: cssVars(layoutVars(layout, SLOT_LAYOUT)) },
        };
      }).filter((g) => g.slots.length > 0)
    : [{ key: 'row', scale: 3, slots: all }];
  const statuses = dragging === null ? null : new Map(all.map((s) => [s.index, 'valid' as const]));
  const draggedCreature = dragging === null ? undefined : creatures.find((c) => c.id === dragging);
  const placed = new Set(row.filter((id): id is string => id !== null));

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
        {...(zoned ? {} : { class: 'dungeon-strip' })}
        label={{ 'aria-label': 'Demo row' }}
        emptyLabel={str(p, 'emptyLabel')}
        disabled={disabled}
        selected={selected}
        drag={dragDrop}
        statuses={statuses}
        onTap={tapSlot}
      />
      <DragGhost ghostRef={dragDrop.ghostRef} creature={draggedCreature} />
      <LiveRegion>{announcement}</LiveRegion>
    </div>
  );
}

const DEMO_CONTROLS = {
  slots: { kind: 'number', min: 1, max: 12 },
  creatures: { kind: 'number', min: 0, max: 6 },
  placed: { kind: 'number', min: 0, max: 6 },
  zones: { kind: 'toggle' },
  owners: { kind: 'toggle' },
  disabled: { kind: 'toggle' },
  emptyLabel: { kind: 'text', maxLength: 12 },
} as const;

const DEMO_DEFAULTS = {
  slots: 3,
  creatures: 4,
  placed: 1,
  zones: false,
  owners: false,
  disabled: false,
  emptyLabel: 'empty',
} as const;

const DEMO_PRESETS = [
  { name: 'Dungeon team (3 slots)', props: {} },
  {
    name: 'Raid party (12, three zones)',
    props: { slots: 12, zones: true, owners: true, creatures: 6, placed: 3 },
  },
  { name: 'Empty row', props: { placed: 0 } },
  { name: 'Locked', props: { disabled: true } },
  { name: 'No creatures', props: { creatures: 0, placed: 0 } },
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
        key={`${String(num(p, 'slots'))}-${String(num(p, 'creatures'))}-${String(num(p, 'placed'))}-${String(bool(p, 'zones'))}`}
        p={p}
      />
    ),
  };
}

const slotRow = demoEntry(
  'SlotRow',
  'apps/activity/src/ui/SlotRow.tsx',
  "The row of slots where a team stands: the raid's party in three zones, the dungeon's team in one row of three. Working demo with the tray: tap, drag or use the keyboard.",
);

const creatureTray = demoEntry(
  'CreatureTray',
  'apps/activity/src/ui/CreatureTray.tsx',
  'The chips of the creatures you can pick up, above the slot row on the raid and dungeon team screens; dropping a creature back on it takes it out of the row.',
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
    'One slot of the row: its number, the creature standing in it (picture, name, level, owner) or the empty label, and what dropping a creature here would do.',
  controls: {
    species: { kind: 'select', options: ['none', ...SPECIES_IDS] },
    level: { kind: 'number', min: 1, max: 30 },
    owner: { kind: 'toggle' },
    ownerColour: { kind: 'number', min: 0, max: 7 },
    selected: { kind: 'toggle' },
    target: { kind: 'select', options: ['none', 'valid', 'invalid'] },
    compact: { kind: 'toggle' },
    disabled: { kind: 'toggle' },
    emptyLabel: { kind: 'text', maxLength: 12 },
  },
  defaults: {
    species: 'cindle',
    level: 5,
    owner: false,
    ownerColour: 0,
    selected: false,
    target: 'none',
    compact: false,
    disabled: false,
    emptyLabel: 'empty',
  },
  presets: [
    { name: 'Occupied', props: {} },
    { name: 'Empty', props: { species: 'none' } },
    { name: 'Selected', props: { selected: true } },
    { name: 'Raid (owner shown)', props: { owner: true, ownerColour: 2 } },
    { name: 'Drop is valid', props: { species: 'none', target: 'valid' } },
    { name: 'Drop is refused', props: { species: 'none', target: 'invalid' } },
  ],
  render: (p) => {
    const species = str(p, 'species');
    const own = species === 'none' ? null : 'demo';
    const status = str(p, 'target');
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
                    ? { owner: { colour: num(p, 'ownerColour'), line: 'You' } }
                    : {}),
                },
        }}
        scale={bool(p, 'compact') ? 2 : 3}
        emptyLabel={str(p, 'emptyLabel')}
        disabled={bool(p, 'disabled')}
        selected={bool(p, 'selected') ? own : null}
        adjacent={false}
        hasSelection={status !== 'none'}
        status={status === 'valid' || status === 'invalid' ? status : null}
        over={false}
        shaking={false}
        dragging={null}
        onPointerDown={() => undefined}
        onTap={() => undefined}
      />
    );
  },
};

export const slotEntries: readonly Entry[] = [slotRow, slotButton, creatureTray, dragGhost];
