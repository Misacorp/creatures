import { talentContent, talentDef, talentText } from '@creatures/game';
import { parseGameState, type Creature } from '../../api';
import { CreatureTalents } from '../../CreatureTalents';
import { DuplicateCard } from '../../DuplicateCard';
import { LurePicker } from '../../LurePicker';
import { PendingCatches } from '../../PendingCatches';
import { TalentChip } from '../../TalentChip';
import creaturesState from '../../fixtures/creatures-state.json';
import stateAfter from '../../fixtures/creatures-state-after.json';
import type { SupplyPick } from '../../expedition-types';
import type { DuplicateChoice, PendingCatch, TalentView } from '../../talent-types';
import { NONE } from '../data';
import { bool, num, str } from '../props';
import type { Entry } from '../types';

/** Real server output (the duplicate-choice scenario), parsed the way the app parses it. */
const WAITING = parseGameState(creaturesState);
const AFTER = parseGameState(stateAfter);

const TALENT_IDS: readonly string[] = [...talentContent.byId.keys()];
const CHOICES: readonly DuplicateChoice[] = ['teach', 'fuse', 'release', 'keep'];

const noActions = {
  choose: () => undefined,
  chooseAll: () => undefined,
};

function viewOf(id: string, golden: boolean, idle: boolean): TalentView {
  const def = talentDef(id) ?? talentDef('playful');
  if (def === undefined) throw new Error('the workbench needs the playful talent');
  const text = talentText(def, golden);
  return { id: def.id, name: def.name, golden, text: text.text, about: text.about, idle };
}

const talentChip: Entry = {
  name: 'TalentChip',
  file: 'apps/activity/src/TalentChip.tsx',
  group: 'Tags & chips',
  description:
    'One talent as text: its name, its effect in a short phrase, and optionally a sentence about it; a golden talent has a gold frame and says Golden, and a talent that does nothing for its creature says so.',
  controls: {
    talent: { kind: 'select', options: TALENT_IDS },
    golden: { kind: 'toggle' },
    idle: { kind: 'toggle' },
    about: { kind: 'toggle' },
  },
  defaults: { talent: 'splashes-first', golden: false, idle: false, about: false },
  presets: [
    { name: 'Plain', props: {} },
    { name: 'Golden', props: { golden: true, about: true } },
    { name: 'Does nothing here', props: { talent: 'hides-friends-in-mist', idle: true } },
  ],
  render: (p) => (
    <TalentChip
      talent={viewOf(str(p, 'talent'), bool(p, 'golden'), bool(p, 'idle'))}
      about={bool(p, 'about')}
    />
  ),
};

function cardWith(p: Parameters<Entry['render']>[0]): PendingCatch {
  const base = WAITING.pending[0];
  if (base === undefined) throw new Error('the fixture has no waiting catch');
  const recommended = str(p, 'recommended') as DuplicateChoice;
  const target = base.offered.fuse[0];
  return {
    ...base,
    shiny: bool(p, 'shiny'),
    talent: viewOf('wet-footprints', bool(p, 'golden'), false),
    offered: { ...base.offered, keep: bool(p, 'keep') },
    recommended:
      recommended === 'teach' && target !== undefined
        ? { choice: 'teach', creatureId: target, slot: 1 }
        : recommended === 'fuse' && target !== undefined
          ? { choice: 'fuse', creatureId: target }
          : { choice: recommended },
  };
}

const duplicateCard: Entry = {
  name: 'DuplicateCard',
  file: 'apps/activity/src/DuplicateCard.tsx',
  group: 'Creatures & game pieces',
  description:
    'A duplicate waiting for an answer, on the Collection tab and in the claim reveal: the creature and the talent it rolled (a gold frame when golden), and the Teach, Fuse, Release and Keep buttons with the recommended one marked. Keep only shows for a line with a second branch.',
  controls: {
    recommended: { kind: 'select', options: CHOICES },
    golden: { kind: 'toggle' },
    shiny: { kind: 'toggle' },
    keep: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: { recommended: 'teach', golden: false, shiny: false, keep: false, busy: false },
  presets: [
    { name: 'Teach is best', props: {} },
    { name: 'Golden talent', props: { golden: true, shiny: true } },
    { name: 'Fuse is best', props: { recommended: 'fuse' } },
    { name: 'Release is best', props: { recommended: 'release' } },
    { name: 'A second branch to keep', props: { keep: true, recommended: 'keep' } },
  ],
  render: (p) => (
    <ul class="dup-list">
      <DuplicateCard
        card={cardWith(p)}
        creatures={WAITING.creatures}
        busy={bool(p, 'busy')}
        actions={noActions}
      />
    </ul>
  ),
};

const pendingCatches: Entry = {
  name: 'PendingCatches',
  file: 'apps/activity/src/PendingCatches.tsx',
  group: 'Creatures & game pieces',
  description:
    'The duplicates waiting for an answer, at the top of the Collection tab: one card each and a button that applies Recommended to all of them. Nothing shows when none wait.',
  controls: { cards: { kind: 'number', min: 0, max: 4 }, busy: { kind: 'toggle' } },
  defaults: { cards: 3, busy: false },
  presets: [
    { name: 'Three waiting', props: {} },
    { name: 'One waiting', props: { cards: 1 } },
    { name: 'None', props: { cards: 0 } },
  ],
  render: (p) => (
    <PendingCatches
      cards={WAITING.pending.slice(0, num(p, 'cards'))}
      creatures={WAITING.creatures}
      busy={bool(p, 'busy')}
      actions={noActions}
    />
  ),
};

function creatureOf(species: string): Creature {
  const found = AFTER.creatures.find((c) => c.species === species);
  if (found === undefined) throw new Error(`the fixture has no ${species}`);
  return found;
}

const creatureTalents: Entry = {
  name: 'CreatureTalents',
  file: 'apps/activity/src/CreatureTalents.tsx',
  group: 'Creatures & game pieces',
  description:
    'The talents on a creature card: its slots (closed ones say at which level they open), the signature talent of an epic, and the Talent Book with a button to put a talent in a slot for Bait.',
  controls: { bait: { kind: 'number', min: 0, max: 500 }, busy: { kind: 'toggle' } },
  defaults: { bait: 100, busy: false },
  presets: [
    { name: 'Enough Bait', props: {} },
    { name: 'No Bait', props: { bait: 0 } },
  ],
  render: (p) => (
    <div class="card-item">
      <CreatureTalents
        creature={creatureOf('splashet')}
        bookSlotBait={AFTER.bookSlotBait}
        bait={num(p, 'bait')}
        busy={bool(p, 'busy')}
        onSlot={() => undefined}
      />
    </div>
  ),
};

const LURE_PICKS: Record<string, SupplyPick[]> = {
  [NONE]: [],
  'lure-basic': [{ id: 'lure-basic', source: 'owned' }],
  'lure-good': [{ id: 'lure-good', source: 'owned' }],
  'lure-great': [{ id: 'lure-great', source: 'owned' }],
};

const lurePicker: Entry = {
  name: 'LurePicker',
  file: 'apps/activity/src/LurePicker.tsx',
  group: 'Creatures & game pieces',
  description:
    'The lure row of the send screen: three tiers as toggle buttons with how many you have, what the chosen one does, and where to make lures (the Workshop, from Bait) when you have none.',
  controls: {
    basic: { kind: 'number', min: 0, max: 9 },
    good: { kind: 'number', min: 0, max: 9 },
    great: { kind: 'number', min: 0, max: 9 },
    taken: { kind: 'select', options: Object.keys(LURE_PICKS) },
  },
  defaults: { basic: 2, good: 1, great: 0, taken: NONE },
  presets: [
    { name: 'Some lures', props: {} },
    { name: 'None in stock', props: { basic: 0, good: 0, great: 0 } },
    { name: 'A Golden Lure taken', props: { great: 1, taken: 'lure-great' } },
  ],
  render: (p) => (
    <LurePicker
      picks={LURE_PICKS[str(p, 'taken')] ?? []}
      stock={{
        'lure-basic': num(p, 'basic'),
        'lure-good': num(p, 'good'),
        'lure-great': num(p, 'great'),
      }}
      onChange={() => undefined}
      onOpenWorkshop={() => undefined}
    />
  ),
};

export const talentEntries: readonly Entry[] = [
  talentChip,
  duplicateCard,
  pendingCatches,
  creatureTalents,
  lurePicker,
];
