import { content } from '@creatures/game';
import { useMemo, useState } from 'preact/hooks';
import { DungeonSetup } from '../../DungeonSetup';
import { TreatTimesContext } from '../../TreatBox';
import { DungeonTeam } from '../../DungeonTeam';
import { CreatureConfigurator } from '../../CreatureConfigurator';
import type { CardActions } from '../../CreaturePage';
import { teamSample } from '../../creature-page/team-sample';
import { sampleSaveKnack, withV2 } from '../../creature-page/v2-sample';
import stateFixture from '../../fixtures/collection-state.json';
import todayFixture from '../../fixtures/dungeon-today-map.json';
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
  "The team at the end of the daily dungeon card: the Raid Roster's board in one centred row of three places, left to right, then the count right under the tiles (a green check at 3 / 3 placed), the order line and, here, a stand-in Enter button. Tap an empty slot for the creature picker (it ends with the Recommended tag and an In this slot line in the dungeon's order), tap a creature for its popover with Remove from team, drag one onto another to swap them.",
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
    // Without the map the card falls back to the old three-room strip.
    ...(bool(p, 'map') ? {} : { map: null }),
  });
  return (
    <TreatTimesContext.Provider value={num(p, 'treatTimes')}>
      <DungeonSetup
        today={today}
        creatures={creatures}
        bait={num(p, 'bait')}
        busy={bool(p, 'busy')}
        error={null}
        draft={null}
        onDraftChange={() => undefined}
        onEnter={() => undefined}
        onSeeLast={() => undefined}
      />
    </TreatTimesContext.Provider>
  );
}

const dungeonSetup: Entry = {
  name: 'DungeonSetup',
  file: 'apps/activity/src/DungeonSetup.tsx',
  group: 'Slots',
  description:
    "The whole pre-run dungeon card: the big Daily Dungeon title with its question mark and the streak (under the title on a phone), today's map as a preview (the one a real server sent; tap a room to see what is there), the depth track, then the team board centred, the count right under the tiles, the order line and the Enter button, all in one card. The team starts as the last team. Configure: the team of three geared samples, ready to configure: tap a creature for its configurator under the board (another tap hides it); its Creature page opens the creature's own page in the card's place (the arrows flip through the team, Back returns).",
  controls: {
    owned: { kind: 'number', min: 3, max: 8 },
    placed: { kind: 'number', min: 1, max: 3 },
    streak: { kind: 'number', min: 0, max: 30 },
    depth: { kind: 'number', min: 1, max: 40 },
    bait: { kind: 'number', min: 0, max: 100 },
    treatTimes: { kind: 'number', min: 2, max: 4 },
    busy: { kind: 'toggle' },
    map: { kind: 'toggle' },
    configure: { kind: 'toggle' },
  },
  defaults: {
    owned: 6,
    placed: 3,
    streak: 3,
    depth: 1,
    bait: 40,
    treatTimes: 2,
    busy: false,
    map: true,
    configure: false,
  },
  presets: [
    { name: '3 / 3 placed, streak at day 3', props: {} },
    { name: '2 / 3 placed (Enter is off, with the reason)', props: { placed: 2 } },
    { name: 'No streak yet', props: { streak: 0 } },
    { name: 'Streak at day 7', props: { streak: 7 } },
    { name: 'The run is being sent', props: { busy: true } },
    { name: 'No Bait for treats', props: { bait: 0 } },
    { name: '12 Bait: one treat fits, the others say Not enough Bait', props: { bait: 12 } },
    { name: 'Hearty Breakfast: treats give 3x today', props: { treatTimes: 3 } },
    { name: 'A server with no map (the old three-room strip)', props: { map: false } },
    {
      name: 'Getting the team ready (tap a creature for its configurator)',
      props: { configure: true },
    },
  ],
  render: (p) =>
    bool(p, 'configure') ? (
      <ConfigureSetupDemo />
    ) : (
      <SetupDemo
        key={`${String(num(p, 'owned'))}-${String(num(p, 'placed'))}-${String(num(p, 'streak'))}-${String(num(p, 'depth'))}-${String(bool(p, 'map'))}`}
        p={p}
      />
    ),
};

const noop = (): undefined => undefined;

/** The card and page actions, with nothing behind them (the workbench has no server). */
const NO_ACTIONS: CardActions = {
  onEquip: () => Promise.resolve(false),
  onRibbon: noop,
  onEvolve: noop,
  onRename: noop,
  onNote: noop,
  onLounge: noop,
  onSlotTalent: noop,
};

const PART_NAMES = [
  'gearLocked',
  'experience',
  'explorer',
  'crafting',
  'stats',
  'ability',
  'knack',
  'knackLocked',
  'gear',
  'talents',
] as const;

function ConfiguratorDemo({ p }: { p: Props }) {
  const scene = useMemo(teamSample, []);
  const plain = scene.team[num(p, 'creature')] ?? scene.team[0];
  // Combat v2 (the server's flag on): the creature carries its Knack and v2 talents; a Knack pick is kept here.
  const [knack, setKnack] = useState<string | null | undefined>(undefined);
  if (plain === undefined) return null;
  const v2 = bool(p, 'combatV2');
  const withV2Fields = v2 ? withV2(plain, { knack: 0, learned: [0, 1], golden: [1] }) : plain;
  const creature = v2 && knack !== undefined ? sampleSaveKnack(withV2Fields, knack) : withV2Fields;
  const parts = Object.fromEntries(PART_NAMES.map((part) => [part, bool(p, part)]));
  return (
    <CreatureConfigurator
      creature={creature}
      state={scene.state}
      gear={scene.gear}
      busy={false}
      parts={parts}
      actions={{
        ...NO_ACTIONS,
        onKnack: (_creature, picked) => {
          setKnack(picked);
          return Promise.resolve('saved');
        },
      }}
      buttons={
        bool(p, 'buttons')
          ? [
              { label: 'Creature page', onAct: noop },
              { label: 'Remove from team', onAct: noop },
            ]
          : []
      }
    />
  );
}

const DUNGEON_DEFAULTS = {
  creature: 1,
  experience: true,
  explorer: false,
  crafting: false,
  stats: true,
  ability: false,
  knack: false,
  knackLocked: false,
  combatV2: false,
  gear: true,
  gearLocked: false,
  talents: true,
  buttons: true,
};

const creatureConfigurator: Entry = {
  name: 'CreatureConfigurator',
  file: 'apps/activity/src/CreatureConfigurator.tsx',
  group: 'Creatures & game pieces',
  description:
    "A creature, small, to see what it is and get it ready for a task: the card's top, then the parts the screen asks for (experience, explorer rank, Crafting level, stats, finale ability, gear, talents), then the screen's buttons. A gear slot opens the item picker, a talent slot the Talent Book. The dungeon card shows it under the board for the tapped creature. With combat v2 on (the `combatV2` switch: the creature carries the server's v2 fields) the Knack part takes the ability's place, the Stats table has Armour and crit and the talents are the line's book; the raid board's configurator asks for the Knack.",
  controls: {
    creature: { kind: 'number', min: 0, max: 2 },
    ...Object.fromEntries(PART_NAMES.map((part) => [part, { kind: 'toggle' as const }])),
    combatV2: { kind: 'toggle' },
    buttons: { kind: 'toggle' },
  },
  defaults: DUNGEON_DEFAULTS,
  presets: [
    { name: 'For a dungeon run (experience, stats, gear, talents)', props: {} },
    {
      name: 'Everything (explorer rank, Crafting level and the finale ability too)',
      props: { creature: 0, explorer: true, crafting: true, ability: true },
    },
    {
      name: 'For a crafting job (Crafting level and talents only)',
      props: { experience: false, crafting: true, stats: false, gear: false, buttons: false },
    },
    { name: 'An empty Charm slot and a set bonus (Mossback)', props: { creature: 0 } },
    { name: 'Every slot filled (Cindle)', props: { creature: 2 } },
    { name: 'Gear locked: what is worn, no taps', props: { gearLocked: true } },
    {
      name: 'Combat v2, the raid board: the Knack part (tap it for the picker), v2 stats and talents',
      props: { creature: 0, combatV2: true, knack: true, ability: false },
    },
    {
      name: 'Combat v2, the board locked: the Knack is shown, not tappable',
      props: { creature: 0, combatV2: true, knack: true, knackLocked: true, gearLocked: true },
    },
  ],
  render: (p) => <ConfiguratorDemo p={p} />,
};

/** The pre-run card with the team's configurator: tap a creature of the board. */
function ConfigureSetupDemo() {
  const scene = useMemo(teamSample, []);
  const today = parseDungeonToday({
    ...todayFixture,
    streak: 3,
    depth: 6,
    lastTeam: scene.team.map((c) => c.id),
  });
  return (
    <DungeonSetup
      today={today}
      creatures={scene.creatures}
      bait={40}
      busy={false}
      error={null}
      draft={null}
      onDraftChange={noop}
      onEnter={noop}
      onSeeLast={noop}
      configure={{
        state: scene.state,
        gear: scene.gear,
        busy: false,
        actions: NO_ACTIONS,
        onAnswerCatch: noop,
      }}
    />
  );
}

const dragGhost = demoEntry(
  'DragGhost',
  'The small copy of a creature that follows your finger or pointer while you drag it. Press and drag a creature in the demo to see it.',
);

const slotButton: Entry = {
  name: 'SlotButton',
  file: 'apps/activity/src/ui/SlotButton.tsx',
  group: 'Slots',
  description:
    "One slot of a board: its number, the creature standing in it (picture, name, level; in the raid the owner initial and the element ring) or the empty label, and what dropping a creature here would do. On a combat v2 board the tile also has the creature's role icon, its Knack as a small chip, the HP it carries between stages as a tiny bar, an Asked strip when you asked its owner to swap, the red target look with the move's picture when a boss move would hit it, and the plain attack's sword when the boss's plain attack is aimed at it.",
  controls: {
    species: { kind: 'select', options: ['none', ...SPECIES_IDS] },
    level: { kind: 'number', min: 1, max: 30 },
    owner: { kind: 'toggle' },
    ownerColour: { kind: 'number', min: 0, max: 7 },
    element: { kind: 'select', options: ['none', 'tide', 'ember', 'grove', 'spark', 'mire'] },
    target: { kind: 'select', options: ['none', 'valid', 'invalid'] },
    reaction: { kind: 'select', options: ['none', ...REACTION_IDS] },
    influence: { kind: 'select', options: ['none', 'buff', 'cover'] },
    reactionRole: { kind: 'select', options: ['payoff', 'marker'] },
    compact: { kind: 'toggle' },
    disabled: { kind: 'toggle' },
    emptyLabel: { kind: 'text', maxLength: 12 },
    v2: { kind: 'toggle' },
    role: { kind: 'select', options: ['setter', 'payoff', 'guard', 'support'] },
    knack: { kind: 'text', maxLength: 24 },
    carriedHp: { kind: 'number', min: -1, max: 100 },
    hitBy: {
      kind: 'select',
      options: ['none', 'shape-slam', 'shape-lance', 'sweep', 'shape-quake'],
    },
    plainTarget: { kind: 'toggle' },
    badge: { kind: 'text', maxLength: 8 },
  },
  defaults: {
    v2: false,
    role: 'guard',
    knack: 'Shield Wall',
    carriedHp: -1,
    hitBy: 'none',
    plainTarget: false,
    badge: '',
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
      name: 'Combat v2 tile: role, Knack and carried HP',
      props: { v2: true, compact: true, element: 'tide', carriedHp: 55 },
    },
    {
      name: 'Combat v2: a boss move would hit it',
      props: { v2: true, compact: true, element: 'ember', hitBy: 'shape-lance' },
    },
    {
      name: "Combat v2: the plain attack's target",
      props: { v2: true, compact: true, element: 'grove', plainTarget: true },
    },
    {
      name: 'Combat v2: you asked its owner to swap',
      props: { v2: true, compact: true, badge: 'Asked' },
    },
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
    const hitBy = str(p, 'hitBy');
    const cue: SlotCue | undefined =
      def === undefined && influence === 'none' && hitBy === 'none' && !bool(p, 'plainTarget')
        ? undefined
        : {
            ...(hitBy === 'none' ? {} : { hit: { glyph: hitBy } }),
            ...(bool(p, 'plainTarget') ? { plain: true as const } : {}),
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
    const tile = (
      <SlotButton
        slot={{
          index: 0,
          ariaLabel: 'Slot 1',
          ...(str(p, 'badge') === '' ? {} : { badge: str(p, 'badge') }),
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
                  ...(bool(p, 'v2')
                    ? {
                        v2: {
                          role: str(p, 'role'),
                          knack: str(p, 'knack') === '' ? null : str(p, 'knack'),
                          carried:
                            num(p, 'carriedHp') < 0 ? null : { hp: num(p, 'carriedHp'), max: 100 },
                        },
                      }
                    : {}),
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
    // A combat v2 tile sits in the board's row, which sizes it (the v2 board's tiles are a little taller).
    return bool(p, 'v2') && bool(p, 'compact') ? (
      <div class="raid-board v2">
        <div class="board-row">{tile}</div>
      </div>
    ) : (
      tile
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
  creatureConfigurator,
  dungeonTeam,
  slotButton,
  placedCount,
  dragGhost,
  cueRail,
];
