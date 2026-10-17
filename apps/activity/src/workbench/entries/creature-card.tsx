import { useState } from 'preact/hooks';
import { Collection } from '../../Collection';
import { CreatureCard } from '../../CreatureCard';
import { CreatureFinder } from '../../CreatureFinder';
import type { CardActions } from '../../CreatureSheet';
import {
  SAMPLE_GEAR,
  SAMPLE_KINDS,
  SAMPLE_STATE,
  sampleCreature,
  sampleRoster,
  type SampleKind,
} from '../../creature-card-sample';
import { NO_FILTERS, applyFilters, type Filters } from '../../creature-find';
import { needyIds } from '../../creature-needs';
import { creatureName } from '../../game';
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
        key={`${str(p, 'state')}-${String(bool(p, 'open'))}`}
        creature={creature}
        state={state}
        gear={bool(p, 'gearLoaded') ? SAMPLE_GEAR : null}
        busy={bool(p, 'busy')}
        found={bool(p, 'found')}
        actions={actions}
        onAnswerCatch={() => undefined}
        initiallyOpen={bool(p, 'open')}
      />
    </ul>
  );
}

const creatureCard: Entry = {
  name: 'CreatureCard',
  file: 'apps/activity/src/CreatureCard.tsx',
  group: 'Creatures & game pieces',
  description:
    'One creature on the Creatures tab, small: sprite, name, element, level, the experience bar with what comes next, the three gear slots as icons, the talents as chips and, only when something is ready, one gold button. "More" opens the sheet under it with everything else (gear, talents, stats, ability, fusion, explorer rank, Lounge, Rename).',
  controls: {
    state: { kind: 'select', options: SAMPLE_KINDS },
    open: { kind: 'toggle' },
    waitingCatch: { kind: 'toggle' },
    gearLoaded: { kind: 'toggle' },
    lounging: { kind: 'toggle' },
    found: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: {
    state: 'ribbon ready',
    open: false,
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
    { name: 'More open', props: { open: true } },
  ],
  covers: ['CreatureSheet'],
  render: (p) => <CardDemo p={p} />,
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
    'The whole Creatures tab with sample creatures: the waiting catches (when there are any), find and filter, and one small card per creature. A short roster (fewer than four) has no finder. Try the search, the chips and "More".',
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

export const creatureCardEntries: readonly Entry[] = [creatureCard, creatureFinder, creaturesTab];
