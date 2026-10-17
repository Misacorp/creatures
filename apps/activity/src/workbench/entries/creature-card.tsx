import { useState } from 'preact/hooks';
import { Collection } from '../../Collection';
import { CreatureCard } from '../../CreatureCard';
import { CreatureFinder } from '../../CreatureFinder';
import { CreaturePage, type CardActions } from '../../CreaturePage';
import {
  GEAR_STATE,
  SAMPLE_GEAR,
  SAMPLE_KINDS,
  SAMPLE_STATE,
  sampleCreature,
  sampleRoster,
  type SampleKind,
} from '../../creature-card-sample';
import { NO_FILTERS, applyFilters, type Filters } from '../../creature-find';
import { needyIds } from '../../creature-needs';
import type { PageFocus } from '../../creature-card-view';
import { creatureName } from '../../game';
import type { GearActions } from '../../gear-actions';
import { Workshop } from '../../Workshop';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const actions: CardActions = {
  onEquip: () => Promise.resolve(true),
  onEquipBest: () => Promise.resolve(undefined),
  onRibbon: () => undefined,
  onEvolve: () => undefined,
  onRename: () => undefined,
  onLounge: () => undefined,
  onSlotTalent: () => undefined,
};

const catchActions = { choose: () => undefined, chooseAll: () => undefined };

function kindOf(value: string): SampleKind {
  return SAMPLE_KINDS.find((k) => k === value) ?? 'growing';
}

function CardDemo({ p }: { p: Props }) {
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
      />
    </ul>
  );
}

const creatureCard: Entry = {
  name: 'CreatureCard',
  file: 'apps/activity/src/CreatureCard.tsx',
  group: 'Creatures & game pieces',
  description:
    'One creature on the Creatures tab, small: sprite, name, element, level, the experience bar with what comes next, the three gear slots as icons, the talents as chips and, only when something is ready, one gold button. The whole card opens the creature page (hover and press light it up; the arrow at the right edge says so); the gear icons and the talent chips open the page on their part.',
  controls: {
    state: { kind: 'select', options: SAMPLE_KINDS },
    waitingCatch: { kind: 'toggle' },
    gearLoaded: { kind: 'toggle' },
    lounging: { kind: 'toggle' },
    found: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: {
    state: 'ribbon ready',
    waitingCatch: false,
    gearLoaded: true,
    lounging: false,
    found: false,
    busy: false,
  },
  presets: [
    { name: 'Ribbon ready (the gold button)', props: {} },
    { name: 'Ribbon, short of parts', props: { state: 'ribbon short' } },
    { name: 'Ready to evolve', props: { state: 'evolve ready' } },
    { name: 'A talent slot to fill', props: { state: 'talent to fill' } },
    { name: 'A waiting catch to answer', props: { state: 'growing', waitingCatch: true } },
    { name: 'Growing, nothing to do', props: { state: 'growing' } },
    { name: 'Top level', props: { state: 'top level' } },
    { name: 'Nickname, shiny and away', props: { state: 'nickname and badges' } },
    { name: 'Marked by the finder', props: { found: true } },
  ],
  render: (p) => <CardDemo p={p} />,
};

const PAGE_FOCUS = ['top', 'Hat picker', 'Scarf picker', 'talents'] as const;

function pageFocus(value: string): PageFocus {
  switch (value) {
    case 'Hat picker':
      return { part: 'gear', slot: 'hat' };
    case 'Scarf picker':
      return { part: 'gear', slot: 'scarf' };
    case 'talents':
      return { part: 'talents' };
    default:
      return null;
  }
}

function PageDemo({ p }: { p: Props }) {
  const creature = sampleCreature(kindOf(str(p, 'state')));
  const state = {
    ...SAMPLE_STATE,
    creatures: [creature],
    pending: bool(p, 'waitingCatch')
      ? SAMPLE_STATE.pending.slice(0, 1).map((card) => ({
          ...card,
          offered: { ...card.offered, teach: [creature.id], fuse: [creature.id] },
        }))
      : [],
    loungerId: bool(p, 'lounging') ? creature.id : null,
  };
  return (
    <CreaturePage
      key={`${str(p, 'state')}-${str(p, 'opensOn')}`}
      creature={creature}
      state={state}
      gear={bool(p, 'gearLoaded') ? SAMPLE_GEAR : null}
      busy={bool(p, 'busy')}
      actions={actions}
      focus={pageFocus(str(p, 'opensOn'))}
      onBack={() => undefined}
      onAnswerCatch={() => undefined}
    />
  );
}

const creaturePage: Entry = {
  name: 'CreaturePage',
  file: 'apps/activity/src/CreaturePage.tsx',
  group: 'Creatures & game pieces',
  description:
    'A creature\'s page, opened from its card in the list\'s place: back at the top left (Escape works too), then who it is, growth (ribbon and evolution buttons), stats, gear per slot with the picker and Equip best, talents with the Talent Book, the finale ability, About, fusion, ribbons, explorer facts, Lounge and Rename. "Opens on" shows where it lands when a gear icon or the talent chips were tapped. The back button does nothing here.',
  controls: {
    state: { kind: 'select', options: SAMPLE_KINDS },
    opensOn: { kind: 'select', options: PAGE_FOCUS },
    waitingCatch: { kind: 'toggle' },
    gearLoaded: { kind: 'toggle' },
    lounging: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: {
    state: 'ribbon ready',
    opensOn: 'top',
    waitingCatch: false,
    gearLoaded: true,
    lounging: false,
    busy: false,
  },
  presets: [
    { name: 'Ribbon ready', props: {} },
    { name: 'Ribbon, short of parts', props: { state: 'ribbon short' } },
    { name: 'Ready to evolve', props: { state: 'evolve ready' } },
    { name: 'A talent slot to fill', props: { state: 'talent to fill', opensOn: 'talents' } },
    { name: 'A waiting catch', props: { state: 'growing', waitingCatch: true } },
    { name: 'Opened on the Scarf picker', props: { opensOn: 'Scarf picker' } },
    { name: 'Gear still loading', props: { gearLoaded: false, opensOn: 'Hat picker' } },
    { name: 'Nickname, shiny and away', props: { state: 'nickname and badges' } },
  ],
  render: (p) => <PageDemo p={p} />,
};

/** The Workshop's buttons do nothing here; the odds and refunds stay on "Loading". */
const gearActions: GearActions = {
  equip: () => Promise.resolve(undefined),
  equipBest: () => Promise.resolve(undefined),
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
    'The Workshop tab with sample gear: parts, job slots, the bag with an item\'s details, blueprints and supplies. The buttons do nothing here and the craft odds stay on "Loading".',
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

export const creatureCardEntries: readonly Entry[] = [
  creatureCard,
  creaturePage,
  creatureFinder,
  creaturesTab,
  workshop,
];
