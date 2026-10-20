import type { ComponentProps } from 'preact';
import { ChoiceMark, Stars } from '../../ExpeditionIcons';
import { GlossaryTag } from '../../Glossary';
import { RarityTag } from '../../GearArt';
import { ElementChip, RoleChip } from '../../sprites/ElementChip';
import { baitCount, essenceCount, partCountItems, supplyCounts } from '../../count-items';
import { CountBadge, CountBadgeList } from '../../ui/CountBadge';
import { OutcomeBadge } from '../../ui/RevealShell';
import { LandmarkChip, Tag } from '../../ui/Tag';
import type { GearRarity } from '../../gear-types';
import {
  ELEMENT_IDS,
  GLOSSARY_SAMPLE,
  ICON_NAMES,
  NONE,
  RARITIES,
  ROLE_IDS,
  iconOf,
} from '../data';
import { bool, num, str } from '../props';
import type { Entry } from '../types';

const TONES = [
  NONE,
  'rank',
  'shiny',
  'first',
  'away',
  'busy',
  'festival',
  'good',
  'bad',
  'free',
  'role-chip',
  't-tide',
  't-ember',
  't-grove',
  't-spark',
  't-mire',
] as const;

type TagKind = 'tag' | 'badge' | 'chip';

function kindOf(value: string): TagKind {
  return value === 'badge' || value === 'chip' ? value : 'tag';
}

function tagTone(value: string): ComponentProps<typeof Tag>['tone'] {
  const found = TONES.find((t) => t === value);
  if (found === undefined || found === NONE) return undefined;
  return found;
}

const tag: Entry = {
  name: 'Tag',
  file: 'apps/activity/src/ui/Tag.tsx',
  group: 'Tags & chips',
  description:
    'The one small pill of the game (a tag, a badge or a chip); tapping it opens a glossary popover when it has an entry. It labels creatures, rewards and statuses everywhere.',
  controls: {
    kind: { kind: 'select', options: ['tag', 'badge', 'chip'] },
    tone: { kind: 'select', options: TONES },
    entry: { kind: 'select', options: GLOSSARY_SAMPLE },
    icon: { kind: 'select', options: [NONE, ...ICON_NAMES] },
    text: { kind: 'text', maxLength: 30 },
  },
  defaults: { kind: 'tag', tone: 'rank', entry: 'boss-rank', icon: NONE, text: 'Rank 7' },
  presets: [
    { name: 'Plain tag', props: { tone: NONE, entry: NONE, text: 'Tag' } },
    { name: 'Rank (opens glossary)', props: { tone: 'rank', entry: 'boss-rank', text: 'Rank 7' } },
    { name: 'Festival', props: { tone: 'festival', entry: 'festival', text: 'Festival' } },
    {
      name: 'Chip with icon',
      props: { kind: 'chip', tone: 't-tide', entry: NONE, icon: 'element: tide', text: 'Tide' },
    },
    { name: 'Good badge', props: { kind: 'badge', tone: 'good', entry: NONE, text: 'Cleared' } },
  ],
  render: (p) => {
    const entry = str(p, 'entry');
    const icon = str(p, 'icon');
    const tone = tagTone(str(p, 'tone'));
    return (
      <Tag
        kind={kindOf(str(p, 'kind'))}
        {...(tone === undefined ? {} : { tone })}
        {...(entry === NONE ? {} : { entry })}
        {...(icon === NONE ? {} : { icon: iconOf(icon) })}
      >
        {str(p, 'text')}
      </Tag>
    );
  },
};

const landmarkChip: Entry = {
  name: 'LandmarkChip',
  file: 'apps/activity/src/ui/Tag.tsx',
  group: 'Tags & chips',
  description:
    'The flag chip that marks a landmark day of the daily dungeon; tapping it opens the Landmark entry.',
  controls: {},
  defaults: {},
  presets: [],
  render: () => <LandmarkChip />,
};

const countBadge: Entry = {
  name: 'CountBadge',
  file: 'apps/activity/src/ui/CountBadge.tsx',
  group: 'Tags & chips',
  description:
    'An icon with a number (and optionally its name): how many parts, Bait, Essence or supplies, on every reward and cost line.',
  controls: {
    icon: { kind: 'select', options: ICON_NAMES },
    amount: { kind: 'number', min: 0, max: 9999 },
    label: { kind: 'text', maxLength: 30 },
    entry: { kind: 'select', options: GLOSSARY_SAMPLE },
    name: { kind: 'text', maxLength: 30 },
  },
  defaults: { icon: 'part: scrap', amount: 3, label: 'Scrap', entry: NONE, name: '' },
  presets: [
    { name: 'Scrap x3', props: { icon: 'part: scrap', amount: 3, label: 'Scrap' } },
    {
      name: 'Bait (opens glossary)',
      props: { icon: 'glyph: bait', amount: 120, label: 'Bait', entry: 'bait' },
    },
    {
      name: 'With a name',
      props: { icon: 'part: glimmer', amount: 2, label: 'Glimmer', name: 'Glimmer' },
    },
    { name: 'Four digits', props: { amount: 9999 } },
  ],
  render: (p) => {
    const label = str(p, 'label');
    const entry = str(p, 'entry');
    const name = str(p, 'name');
    return (
      <CountBadge
        icon={iconOf(str(p, 'icon'))}
        amount={num(p, 'amount')}
        {...(label === '' ? {} : { label })}
        {...(entry === NONE ? {} : { entry })}
        {...(name === '' ? {} : { name })}
      />
    );
  },
};

const countBadgeList: Entry = {
  name: 'CountBadgeList',
  file: 'apps/activity/src/ui/CountBadge.tsx',
  group: 'Tags & chips',
  description:
    'A list of count badges, one per kind earned or spent, named for screen readers: the rewards of a run, a trip or a dismantle, and the pack of the dungeon. The empty kinds are left out by whoever builds the list.',
  controls: {
    bait: { kind: 'number', min: 0, max: 999 },
    essence: { kind: 'number', min: 0, max: 999 },
    scrap: { kind: 'number', min: 0, max: 999 },
    supplies: { kind: 'number', min: 0, max: 9 },
    names: { kind: 'toggle' },
  },
  defaults: { bait: 3, essence: 12, scrap: 4, supplies: 0, names: false },
  presets: [
    { name: 'Bait, Essence and Scrap', props: {} },
    { name: 'With names (the dungeon pack)', props: { names: true } },
    { name: 'And two supplies', props: { supplies: 2 } },
    { name: 'Nothing earned', props: { bait: 0, essence: 0, scrap: 0 } },
  ],
  render: (p) => {
    const named = bool(p, 'names');
    const supplies = num(p, 'supplies');
    const items = [
      ...(num(p, 'bait') > 0 ? [baitCount(num(p, 'bait'), { entry: !named, name: named })] : []),
      ...(num(p, 'essence') > 0
        ? [essenceCount(num(p, 'essence'), { entry: !named, name: named })]
        : []),
      ...partCountItems(num(p, 'scrap') > 0 ? { scrap: num(p, 'scrap') } : {}),
      ...supplyCounts(
        [
          { id: 'lure-basic', name: 'Basic Lure', amount: 1 },
          { id: 'satchel-good', name: 'Sturdy Satchel', amount: 1 },
        ].slice(0, supplies),
      ),
    ];
    return <CountBadgeList items={items} label="Rewards" class="reward-badges" />;
  },
};

const elementChip: Entry = {
  name: 'ElementChip',
  file: 'apps/activity/src/sprites/ElementChip.tsx',
  group: 'Tags & chips',
  description:
    "An element as a coloured chip with its icon, plus a creature's role as a second chip; each opens its glossary entry. The context says whose element it is, and so what a tap explains: a creature's (cards, popovers), a boss's (boss card, stage, foe popover), a place's (expedition places) or an item's (blueprints).",
  controls: {
    element: { kind: 'select', options: ELEMENT_IDS },
    context: { kind: 'select', options: ['creature', 'boss', 'place', 'gear'] },
    role: { kind: 'select', options: [NONE, ...ROLE_IDS] },
    as: { kind: 'select', options: ['tag', 'button'] },
  },
  defaults: { element: 'tide', context: 'creature', role: 'setter', as: 'tag' },
  presets: [
    ...ELEMENT_IDS.map((element) => ({ name: element, props: { element } })),
    { name: 'Ember boss', props: { element: 'ember', context: 'boss', role: NONE } },
    { name: 'Ember place', props: { element: 'ember', context: 'place', role: NONE } },
    { name: 'Ember gear', props: { element: 'ember', context: 'gear', role: NONE } },
  ],
  render: (p) => {
    const role = str(p, 'role');
    const context = str(p, 'context');
    return (
      <ElementChip
        element={str(p, 'element')}
        context={
          context === 'boss' || context === 'place' || context === 'gear' ? context : 'creature'
        }
        {...(role === NONE ? {} : { role })}
        as={str(p, 'as') === 'button' ? 'button' : 'tag'}
      />
    );
  },
};

const roleChip: Entry = {
  name: 'RoleChip',
  file: 'apps/activity/src/sprites/ElementChip.tsx',
  group: 'Tags & chips',
  description:
    "A creature's role (Setter, Payoff, Support or Guard) as a chip that opens the role's glossary entry; it is next to the element chip and in the Raid coach hint.",
  controls: { role: { kind: 'select', options: ROLE_IDS } },
  defaults: { role: 'setter' },
  presets: ROLE_IDS.map((role) => ({ name: role, props: { role } })),
  render: (p) => <RoleChip role={str(p, 'role')} />,
};

const glossaryTag: Entry = {
  name: 'GlossaryTag',
  file: 'apps/activity/src/Glossary.tsx',
  group: 'Tags & chips',
  description:
    'Any word or chip that explains itself: tap it and a popover with a short text opens. Text words get a dotted underline, chips a small "?".',
  controls: {
    entry: { kind: 'select', options: GLOSSARY_SAMPLE.filter((e) => e !== NONE) },
    look: { kind: 'select', options: ['text', 'chip', 'help'] },
    bare: { kind: 'toggle' },
    text: { kind: 'text', maxLength: 30 },
  },
  defaults: { entry: 'essence', look: 'text', bare: false, text: 'Essence' },
  presets: [
    { name: 'Underlined word', props: { look: 'text', entry: 'essence', text: 'Essence' } },
    { name: 'Chip with "?"', props: { look: 'chip', entry: 'festival', text: 'Festival' } },
    { name: 'Bare chip', props: { look: 'chip', bare: true, entry: 'streak', text: 'Streak' } },
    { name: 'Help button', props: { look: 'help', entry: 'push-on' } },
  ],
  render: (p) => {
    const look = str(p, 'look');
    return (
      <GlossaryTag
        entry={str(p, 'entry')}
        look={look === 'chip' || look === 'help' ? look : 'text'}
        bare={bool(p, 'bare')}
        {...(look === 'chip' ? { class: 'chip' } : {})}
      >
        {str(p, 'text')}
      </GlossaryTag>
    );
  },
};

const rarityTag: Entry = {
  name: 'RarityTag',
  file: 'apps/activity/src/GearArt.tsx',
  group: 'Tags & chips',
  description:
    'The rarity of a gear item (Common, Rare or Epic) as a tag with its own colour; it is on item cards and in loot lists. A Festival piece also carries its own Festival tag.',
  controls: { rarity: { kind: 'select', options: RARITIES } },
  defaults: { rarity: 'rare' },
  presets: RARITIES.map((rarity) => ({ name: rarity, props: { rarity } })),
  render: (p) => {
    const rarity: GearRarity = RARITIES.find((r) => r === str(p, 'rarity')) ?? 'common';
    return <RarityTag rarity={rarity} />;
  },
};

const outcomeBadge: Entry = {
  name: 'OutcomeBadge',
  file: 'apps/activity/src/ui/RevealShell.tsx',
  group: 'Tags & chips',
  description: '"Cleared" or "Not cleared" as a green or red badge, on a finale or dungeon result.',
  controls: { cleared: { kind: 'toggle' } },
  defaults: { cleared: true },
  presets: [
    { name: 'Cleared', props: { cleared: true } },
    { name: 'Not cleared', props: { cleared: false } },
  ],
  render: (p) => <OutcomeBadge cleared={bool(p, 'cleared')} />,
};

const stars: Entry = {
  name: 'Stars',
  file: 'apps/activity/src/ExpeditionIcons.tsx',
  group: 'Tags & chips',
  description:
    'Familiarity stars, three places: a filled star for each earned; they show how well an explorer knows a destination.',
  controls: { stars: { kind: 'number', min: 0, max: 3 } },
  defaults: { stars: 2 },
  presets: [0, 1, 2, 3].map((n) => ({ name: `${String(n)} stars`, props: { stars: n } })),
  render: (p) => <Stars stars={num(p, 'stars')} />,
};

const choiceMark: Entry = {
  name: 'ChoiceMark',
  file: 'apps/activity/src/ExpeditionIcons.tsx',
  group: 'Tags & chips',
  description:
    'A mark under a supply that says the end-of-trip "push on" choice is likely or certain.',
  controls: { choice: { kind: 'select', options: ['guaranteed', 'likely'] } },
  defaults: { choice: 'likely' },
  presets: [
    { name: 'Likely', props: { choice: 'likely' } },
    { name: 'Guaranteed', props: { choice: 'guaranteed' } },
  ],
  render: (p) => (
    <ChoiceMark choice={str(p, 'choice') === 'guaranteed' ? 'guaranteed' : 'likely'} />
  ),
};

export const tagEntries: readonly Entry[] = [
  tag,
  landmarkChip,
  countBadge,
  countBadgeList,
  elementChip,
  roleChip,
  glossaryTag,
  rarityTag,
  outcomeBadge,
  stars,
  choiceMark,
];
