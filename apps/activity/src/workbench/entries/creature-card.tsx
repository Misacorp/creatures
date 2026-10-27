import { useState } from 'preact/hooks';
import { Collection } from '../../Collection';
import { CreatureCard } from '../../CreatureCard';
import { CreatureFinder } from '../../CreatureFinder';
import { LoungeSwap } from '../../LoungeSwap';
import type { CardActions } from '../../CreaturePage';
import {
  GEAR_STATE,
  SAMPLE_GEAR,
  SAMPLE_KINDS,
  SAMPLE_STATE,
  sampleCreature,
  sampleRoster,
  hardCaseRoster,
  loungeSample,
  type SampleKind,
} from '../../creature-card-sample';
import { NO_FILTERS, applyFilters, type Filters } from '../../creature-find';
import { needyIds } from '../../creature-needs';
import { creatureName } from '../../game';
import type { GearActions } from '../../gear-actions';
import { XP_SIZES, type XpSize } from '../../ui/XpTrack';
import { Workshop } from '../../Workshop';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const actions: CardActions = {
  onEquip: () => Promise.resolve(true),
  onRibbon: () => undefined,
  onEvolve: () => undefined,
  onRename: () => undefined,
  onNote: () => undefined,
  onLounge: () => undefined,
  onSlotTalent: () => undefined,
};

const catchActions = { chooseMany: () => Promise.resolve(true) };

function kindOf(value: string): SampleKind {
  return SAMPLE_KINDS.find((k) => k === value) ?? 'growing';
}

/** The Creatures screen of Misa's phone screenshot (2026-10-19): find and filter, and five hard cases. */
function RosterScreen() {
  const roster = hardCaseRoster();
  // Lanternfin lounges (34 of the day's 60 XP); Mistnewt had its 60 today and is Rested.
  const lounge = loungeSample();
  const state = {
    ...SAMPLE_STATE,
    creatures: roster,
    pending: [],
    loungerId: lounge.loungerId,
    loungeXp: lounge.loungeXp,
  };
  return (
    <div>
      <Collection
        state={state}
        gear={SAMPLE_GEAR}
        busy={false}
        catchActions={catchActions}
        {...actions}
      />
    </div>
  );
}

function xpSizeOf(value: string): XpSize | undefined {
  return XP_SIZES.find((s) => s === value);
}

function CardDemo({ p }: { p: Props }) {
  if (bool(p, 'screen')) return <RosterScreen />;
  const creature = sampleCreature(kindOf(str(p, 'state')));
  const waiting = bool(p, 'waitingCatch');
  const state = {
    ...SAMPLE_STATE,
    creatures: [creature],
    // The sample's waiting duplicates all offer the creature, so the card has a catch to answer.
    pending: waiting
      ? SAMPLE_STATE.pending.slice(0, 1).map((card) => ({
          ...card,
          offered: { ...card.offered, teach: [creature.id], fuse: [creature.id] },
        }))
      : [],
    loungerId: bool(p, 'lounging') ? creature.id : null,
    loungeXp: { [creature.id]: num(p, 'loungeXp') },
  };
  return (
    <ul class="cards creature-cards">
      <CreatureCard
        creature={creature}
        state={state}
        gear={bool(p, 'gearLoaded') ? SAMPLE_GEAR : null}
        busy={bool(p, 'busy')}
        found={bool(p, 'found')}
        actions={actions}
        onAnswerCatch={() => undefined}
        onOpen={() => undefined}
        xpSize={xpSizeOf(str(p, 'xpSize'))}
      />
    </ul>
  );
}

const creatureCard: Entry = {
  name: 'CreatureCard',
  file: 'apps/activity/src/CreatureCard.tsx',
  group: 'Creatures & game pieces',
  description:
    'One creature on the Creatures tab, small (variant E): the sprite at the top left, the name on one line with its tags in words under it (species of a nickname, element, role, Festival, Shiny, First on server, Away, On a job, Lounging), the slim experience bar across the card with the level at its left, the gear slots on the left and the talents on the right (one to a row) and, only when something is ready, one gold button. The whole card opens the creature page (hover and press light it up); the gear icons and the talents open the page on their part.',
  controls: {
    state: { kind: 'select', options: SAMPLE_KINDS },
    waitingCatch: { kind: 'toggle' },
    gearLoaded: { kind: 'toggle' },
    lounging: { kind: 'toggle' },
    loungeXp: { kind: 'number', min: 0, max: 60 },
    found: { kind: 'toggle' },
    busy: { kind: 'toggle' },
    screen: { kind: 'toggle' },
    xpSize: { kind: 'select', options: ['default', ...XP_SIZES] },
  },
  defaults: {
    state: 'ribbon ready',
    waitingCatch: false,
    gearLoaded: true,
    lounging: false,
    loungeXp: 0,
    found: false,
    busy: false,
    screen: false,
    xpSize: 'default',
  },
  presets: [
    { name: 'Ribbon ready (the gold button)', props: {} },
    { name: 'Ribbon, short of parts', props: { state: 'ribbon short' } },
    { name: 'Ready to evolve', props: { state: 'evolve ready' } },
    { name: 'Evolution level, short of Essence', props: { state: 'evolve short' } },
    { name: 'A talent slot to fill', props: { state: 'talent to fill' } },
    { name: 'A waiting catch to answer', props: { state: 'growing', waitingCatch: true } },
    { name: 'Growing, nothing to do', props: { state: 'growing' } },
    { name: 'Top level', props: { state: 'top level' } },
    { name: 'Nickname, shiny and away', props: { state: 'nickname and badges' } },
    { name: 'Marked by the finder', props: { found: true } },
    { name: 'Lounging', props: { state: 'growing', lounging: true, loungeXp: 34 } },
    { name: 'Lounging, Rested', props: { state: 'growing', lounging: true, loungeXp: 60 } },
    { name: 'Rested, not lounging', props: { state: 'growing', loungeXp: 60 } },
    {
      name: 'XP bar look: shrunk (tag shrunk to the bar)',
      props: { state: 'evolve ready', xpSize: 'shrunk' },
    },
    { name: 'XP bar look: snug (narrower tag)', props: { state: 'evolve ready', xpSize: 'snug' } },
    {
      name: 'XP bar look: flat (tag drawn like the bar)',
      props: { state: 'evolve ready', xpSize: 'flat' },
    },
    {
      name: 'XP bar look: grown (bar enlarged to the tag)',
      props: { state: 'evolve ready', xpSize: 'grown' },
    },
    {
      name: "Five hard cases (Misa's 360 px screenshot): new, Festival, long nickname, full kit, evolve",
      props: { screen: true },
    },
  ],
  render: (p) => <CardDemo p={p} />,
};

/** The Workshop's buttons do nothing here; the odds and refunds stay on "Loading". */
const gearActions: GearActions = {
  equip: () => Promise.resolve(undefined),
  equipBest: () => Promise.resolve(undefined),
  mark: () => Promise.resolve(undefined),
  dismantlePile: () => Promise.resolve(undefined),
  dismissNotice: () => Promise.resolve(undefined),
  startJob: () => Promise.resolve(undefined),
  previewCraft: () => new Promise(() => undefined),
  previewDismantle: () => new Promise(() => undefined),
  claimJob: () => Promise.resolve(undefined),
};

function WorkshopDemo({ p }: { p: Props }) {
  return (
    <Workshop
      state={GEAR_STATE}
      gear={bool(p, 'loaded') ? SAMPLE_GEAR : null}
      failed={false}
      offset={0}
      busy={bool(p, 'busy')}
      reveal={null}
      actions={gearActions}
      onRetry={() => undefined}
      onClaimed={() => undefined}
      onDismissReveal={() => undefined}
    />
  );
}

const workshop: Entry = {
  name: 'Workshop',
  file: 'apps/activity/src/Workshop.tsx',
  group: 'Creatures & game pieces',
  description:
    'The Workshop tab with sample gear: parts, job slots, the bag (tap an item: its details open in a bottom drawer), blueprints and supplies. The buttons do nothing here and the craft odds stay on "Loading".',
  controls: { loaded: { kind: 'toggle' }, busy: { kind: 'toggle' } },
  defaults: { loaded: true, busy: false },
  presets: [
    { name: 'Sample gear', props: {} },
    { name: 'Still opening', props: { loaded: false } },
  ],
  render: (p) => <WorkshopDemo p={p} />,
};

function FinderDemo({ p }: { p: Props }) {
  const roster = sampleRoster(num(p, 'creatures'));
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [picked, setPicked] = useState<string | null>(null);
  const state = { ...SAMPLE_STATE, creatures: roster, pending: [] };
  const needy = needyIds(roster, state);
  return (
    <div>
      <CreatureFinder
        creatures={roster}
        needyCount={needy.size}
        filters={filters}
        shown={applyFilters(roster, filters, needy).length}
        onFilters={setFilters}
        onPick={(creature) => {
          setPicked(creatureName(creature));
        }}
      />
      <p class="muted" role="status">
        {picked === null
          ? 'Nothing chosen yet.'
          : `Chosen: ${picked} (the page would scroll to it).`}
      </p>
    </div>
  );
}

const creatureFinder: Entry = {
  name: 'CreatureFinder',
  file: 'apps/activity/src/CreatureFinder.tsx',
  group: 'Controls',
  description:
    'Find and filter at the top of the Creatures tab: a search field that suggests creatures as you type (name, nickname or species; Arrow keys and Enter work), and filter chips for "Needs you", the elements and the roles. Choosing a suggestion would scroll to that card; the chips combine.',
  controls: { creatures: { kind: 'number', min: 1, max: 14 } },
  defaults: { creatures: 12 },
  presets: [
    { name: 'Twelve creatures', props: {} },
    { name: 'A few', props: { creatures: 4 } },
  ],
  render: (p) => <FinderDemo p={p} />,
};

function TabDemo({ p }: { p: Props }) {
  const roster = sampleRoster(num(p, 'creatures'));
  const waiting = bool(p, 'waitingCatches');
  const state = {
    ...SAMPLE_STATE,
    creatures: roster,
    pending: waiting
      ? SAMPLE_STATE.pending.slice(0, 2).map((card) => ({
          ...card,
          offered: { ...card.offered, teach: ['sample-1'], fuse: ['sample-1'] },
        }))
      : [],
  };
  return (
    <Collection
      state={state}
      gear={SAMPLE_GEAR}
      busy={bool(p, 'busy')}
      catchActions={catchActions}
      {...actions}
    />
  );
}

const creaturesTab: Entry = {
  name: 'Collection',
  file: 'apps/activity/src/Collection.tsx',
  group: 'Creatures & game pieces',
  description:
    'The whole Creatures tab with sample creatures: the waiting catches (when there are any), find and filter, and one small card per creature. A short roster (fewer than four) has no finder. Try the search and the chips, then tap a card: its page replaces the list, and Back returns to the same place.',
  controls: {
    creatures: { kind: 'number', min: 1, max: 14 },
    waitingCatches: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: { creatures: 12, waitingCatches: false, busy: false },
  presets: [
    { name: 'Twelve creatures', props: {} },
    { name: 'With waiting catches', props: { waitingCatches: true } },
    { name: 'Two creatures (no finder)', props: { creatures: 2 } },
  ],
  render: (p) => <TabDemo p={p} />,
};

const loungeSwap: Entry = {
  name: 'LoungeSwap',
  file: 'apps/activity/src/LoungeSwap.tsx',
  group: 'Creatures & game pieces',
  description:
    'Who lounges: the sheet that "Swap" opens from your own creature in the living room. Every creature with its experience bar (as on the card) and a Rested tag when it had all of today\'s lounging XP. Free creatures that still earn come first, lowest level first; then the Rested ones (they can still lounge); the lounger and the busy ones are listed but cannot be picked.',
  controls: {},
  defaults: {},
  presets: [{ name: 'Five creatures, one Rested, one away', props: {} }],
  render: () => (
    <LoungeSwap state={loungeSample()} onPick={() => undefined} onClose={() => undefined} />
  ),
};

export const creatureCardEntries: readonly Entry[] = [
  creatureCard,
  loungeSwap,
  creatureFinder,
  creaturesTab,
  workshop,
];
