import { content } from '@creatures/game';
import { useMemo, useState } from 'preact/hooks';
import { DungeonSetup } from '../../DungeonSetup';
import { DungeonTeam } from '../../DungeonTeam';
import stateFixture from '../../fixtures/collection-state.json';
import todayFixture from '../../fixtures/dungeon-today.json';
import { parseGameState, type Creature } from '../../api';
import { parseDungeonToday } from '../../dungeon-parse';
import { isComplete, type Slots } from '../../dungeon-team';
import type { PickerCreature } from '../../roster-picker';
import { CueRail } from '../../ui/CueRail';
import { PlacedCount } from '../../ui/PlacedCount';
import { SlotButton } from '../../ui/SlotButton';
import type { SlotCue } from '../../ui/slot-cue';
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

/** What you own in the demo: the lineup first, then other species; levels spread out, power follows the level. */
function ownedCreatures(count: number, lineup: readonly string[] | undefined): PickerCreature[] {
  return Array.from({ length: lineup?.length ?? count }, (_, i) => {
    const species = lineup?.[i] ?? SPECIES_IDS[(i * 3) % SPECIES_IDS.length] ?? 'splashet';
    const level = 3 + i * 2;
    return {
      id: `demo-${String(i)}`,
      species,
      nickname: null,
      level,
      power: level * 3,
      caughtAt: 1_000 + i,
    };
  });
}

/** The dungeon team wired to a plain state: the same screen, with no server behind it. */
function TeamDemo({ p }: { p: Props }) {
  const lineup = LINEUPS[str(p, 'lineup')];
  const owned = useMemo(() => ownedCreatures(num(p, 'owned'), lineup), [num(p, 'owned'), lineup]);
  const [slots, setSlots] = useState<Slots>(() => {
    const at = (i: number): string | null => (i < num(p, 'placed') ? (owned[i]?.id ?? null) : null);
    return [at(0), at(1), at(2)];
  });
  return (
    <div class="raid-section">
      <DungeonTeam
        creatures={owned}
        slots={slots}
        disabled={bool(p, 'disabled')}
        onChange={setSlots}
      >
        <button type="button" class="primary" disabled={!isComplete(slots)}>
          Enter the dungeon
        </button>
      </DungeonTeam>
    </div>
  );
}

const DEMO_CONTROLS = {
  owned: { kind: 'number', min: 0, max: 8 },
  placed: { kind: 'number', min: 0, max: 3 },
  lineup: { kind: 'select', options: ['mixed', ...Object.keys(LINEUPS)] },
  disabled: { kind: 'toggle' },
} as const;

const DEMO_DEFAULTS = {
  owned: 6,
  placed: 3,
  lineup: 'mixed',
  disabled: false,
} as const;

const DEMO_PRESETS = [
  { name: '3 / 3 placed (green check)', props: {} },
  { name: '1 / 3 placed (tap an empty slot for the picker)', props: { placed: 1 } },
  { name: 'Empty row', props: { placed: 0 } },
  { name: 'Locked (the run is being sent)', props: { disabled: true } },
  { name: 'Exactly three creatures', props: { owned: 3 } },
  {
    name: 'Reaction cue (hover or tap Cindle)',
    props: { lineup: 'reacting', placed: 3 },
  },
  { name: 'No reaction mark', props: { lineup: 'silent', placed: 3 } },
  {
    name: 'Influence: a Support buffs its neighbours (hover or tap Ashmole)',
    props: { lineup: 'support', placed: 3 },
  },
  {
    name: 'Influence: a Guard covers its neighbours (hover or tap Sproutle)',
    props: { lineup: 'guard', placed: 3 },
  },
];

function demoEntry(name: string, description: string): Entry {
  return {
    name,
    file:
      name === 'DungeonTeam'
        ? 'apps/activity/src/DungeonTeam.tsx'
        : `apps/activity/src/ui/${name}.tsx`,
    group: 'Slots',
    description,
    controls: DEMO_CONTROLS,
    defaults: DEMO_DEFAULTS,
    presets: DEMO_PRESETS,
    render: (p) => (
      <TeamDemo
        key={`${String(num(p, 'owned'))}-${String(num(p, 'placed'))}-${str(p, 'lineup')}`}
        p={p}
      />
    ),
  };
}

const dungeonTeam = demoEntry(
  'DungeonTeam',
  "The team at the end of the daily dungeon card: the Raid Roster's board in one centred row of three places, left to right, then the order line, the count (a green check at 3 / 3 placed) and, here, a stand-in Enter button. Tap an empty slot for the creature picker (it ends with the Recommended tag and an In this slot line in the dungeon's order), tap a creature for its popover with Remove from team, drag one onto another to swap them.",
);

/** The whole pre-run card (title, streak, rooms, depth, team, Enter) on a stand-in for the server. */
function SetupDemo({ p }: { p: Props }) {
  // The creatures of a real server answer (fixture), repeated with other species and levels.
  const creatures = useMemo<Creature[]>(() => {
    const base = parseGameState(stateFixture).creatures;
    return Array.from({ length: num(p, 'owned') }, (_, i) => {
      const from = base[i % base.length] as Creature;
      const species =
        i < base.length
          ? from.species
          : (SPECIES_IDS[(i * 3) % SPECIES_IDS.length] ?? from.species);
      return { ...from, id: `demo-${String(i)}`, species, level: 3 + i * 2, caughtAt: 1_000 + i };
    });
  }, [num(p, 'owned')]);
  const today = parseDungeonToday({
    ...todayFixture,
    streak: num(p, 'streak'),
    depth: num(p, 'depth'),
    lastTeam: creatures.slice(0, num(p, 'placed')).map((c) => c.id),
  });
  return (
    <DungeonSetup
      today={today}
      creatures={creatures}
      busy={bool(p, 'busy')}
      error={null}
      onEnter={() => undefined}
      onSeeLast={() => undefined}
    />
  );
}

const dungeonSetup: Entry = {
  name: 'DungeonSetup',
  file: 'apps/activity/src/DungeonSetup.tsx',
  group: 'Slots',
  description:
    'The whole pre-run dungeon card: the big Daily Dungeon title with its question mark and the streak (under the title on a phone), the three rooms, the depth track, then the team board centred, the order line, the count and the Enter button, all in one card. The team starts as the last team.',
  controls: {
    owned: { kind: 'number', min: 3, max: 8 },
    placed: { kind: 'number', min: 1, max: 3 },
    streak: { kind: 'number', min: 0, max: 30 },
    depth: { kind: 'number', min: 1, max: 40 },
    busy: { kind: 'toggle' },
  },
  defaults: { owned: 6, placed: 3, streak: 3, depth: 1, busy: false },
  presets: [
    { name: '3 / 3 placed, streak at day 3', props: {} },
    { name: '2 / 3 placed (Enter is off, with the reason)', props: { placed: 2 } },
    { name: 'No streak yet', props: { streak: 0 } },
    { name: 'Streak at day 7', props: { streak: 7 } },
    { name: 'The run is being sent', props: { busy: true } },
  ],
  render: (p) => (
    <SetupDemo
      key={`${String(num(p, 'owned'))}-${String(num(p, 'placed'))}-${String(num(p, 'streak'))}-${String(num(p, 'depth'))}`}
      p={p}
    />
  ),
};

const dragGhost = demoEntry(
  'DragGhost',
  'The small copy of a creature that follows your finger or pointer while you drag it. Press and drag a creature in the demo to see it.',
);

const slotButton: Entry = {
  name: 'SlotButton',
  file: 'apps/activity/src/ui/SlotButton.tsx',
  group: 'Slots',
  description:
    'One slot of a board: its number, the creature standing in it (picture, name, level; in the raid the owner initial and the element ring) or the empty label, and what dropping a creature here would do.',
  controls: {
    species: { kind: 'select', options: ['none', ...SPECIES_IDS] },
    level: { kind: 'number', min: 1, max: 30 },
    owner: { kind: 'toggle' },
    ownerColour: { kind: 'number', min: 0, max: 7 },
    element: { kind: 'select', options: ['none', 'tide', 'ember', 'grove', 'spark'] },
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

const placedCount: Entry = {
  name: 'PlacedCount',
  file: 'apps/activity/src/ui/PlacedCount.tsx',
  group: 'Slots',
  description:
    'The count line above the raid board and the dungeon team: how many of your creatures are placed, out of three, with a green check at 3 / 3. The raid adds the board total on the same line.',
  controls: { placed: { kind: 'number', min: 0, max: 3 }, extra: { kind: 'text', maxLength: 40 } },
  defaults: { placed: 1, extra: '' },
  presets: [
    { name: '1 / 3 placed', props: {} },
    { name: '3 / 3 placed (green check)', props: { placed: 3 } },
    {
      name: 'With the raid board total',
      props: { placed: 2, extra: ' · 7 / 18 team slots filled' },
    },
  ],
  render: (p) => (
    <div class="placement">
      <PlacedCount placed={num(p, 'placed')}>{str(p, 'extra') || null}</PlacedCount>
    </div>
  ),
};

export const slotEntries: readonly Entry[] = [
  dungeonSetup,
  dungeonTeam,
  slotButton,
  placedCount,
  dragGhost,
  cueRail,
];
