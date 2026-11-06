import { combatV2 } from '@creatures/game/combat-v2';
import type { ComponentProps } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ChoiceMark, Stars } from '../../ExpeditionIcons';
import { GlossaryTag } from '../../Glossary';
import { RarityTag } from '../../GearArt';
import { ElementChip, RoleChip } from '../../sprites/ElementChip';
import { baitCount, essenceCount, partCountItems, supplyCounts } from '../../count-items';
import {
  CostLine,
  CountBadge,
  CountBadgeList,
  PriceLine,
  SayLine,
  ShortOfLine,
} from '../../ui/CountBadge';
import { ActionButton } from '../../ui/ActionButton';
import {
  acornCount,
  anyShardCount,
  anyShardMark,
  priceOf,
  resourceMark,
  scrapCount,
  shardCount,
} from '../../resource-count';
import { OutcomeBadge } from '../../ui/RevealShell';
import { KeywordText } from '../../ui/KeywordText';
import { LandmarkChip, Tag } from '../../ui/Tag';
import { setCombatV2 } from '../../live-flags';
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
    rules: { kind: 'select', options: ['shipped', 'combat v2'] },
  },
  defaults: {
    kind: 'tag',
    tone: 'rank',
    entry: 'boss-rank',
    icon: NONE,
    text: 'Rank 7',
    rules: 'shipped',
  },
  presets: [
    { name: 'Plain tag', props: { tone: NONE, entry: NONE, text: 'Tag' } },
    { name: 'Rank (opens glossary)', props: { tone: 'rank', entry: 'boss-rank', text: 'Rank 7' } },
    { name: 'Festival', props: { tone: 'festival', entry: 'festival', text: 'Festival' } },
    {
      name: 'Chip with icon',
      props: { kind: 'chip', tone: 't-tide', entry: NONE, icon: 'element: tide', text: 'Tide' },
    },
    {
      name: 'Crit under combat v2 (the v2 words)',
      props: { entry: 'crit', text: 'Crit', rules: 'combat v2' },
    },
    {
      name: 'Boss Rank under combat v2',
      props: { entry: 'boss-rank', text: 'Rank 7', rules: 'combat v2' },
    },
    { name: 'Good badge', props: { kind: 'badge', tone: 'good', entry: NONE, text: 'Cleared' } },
  ],
  render: (p) => {
    // The popover reads the server's rules: the page says which ones (the app sets this once at boot).
    setCombatV2(str(p, 'rules') === 'combat v2');
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
    size: { kind: 'select', options: ['chip', 'inline'] },
  },
  defaults: { icon: 'part: scrap', amount: 3, label: 'Scrap', entry: NONE, name: '', size: 'chip' },
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
    {
      name: 'Inline (a cost inside a sentence or a button)',
      props: { icon: 'part: tide-shard', amount: 12, label: 'Tide Shard', size: 'inline' },
    },
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
        size={str(p, 'size') === 'inline' ? 'inline' : 'chip'}
      />
    );
  },
};

const costLine: Entry = {
  name: 'CostLine',
  file: 'apps/activity/src/ui/CountBadge.tsx',
  group: 'Tags & chips',
  description:
    'Costs, needs and holdings inside a line or a button: inline count badges, an icon and a number each, never the resource\'s name. CostLine is a row of them, PriceLine a price (or "free"), ShortOfLine the "You have; this costs" reason, SayLine a sentence with badges in it; the ActionButton takes its cost the same way. Shards use their element\'s icon, "any shard" the neutral one.',
  controls: {
    variant: {
      kind: 'select',
      options: [
        'still needed',
        'a price',
        'free',
        'short of',
        'a sentence',
        'a button cost',
        'any shard rate',
      ],
    },
  },
  defaults: { variant: 'still needed' },
  presets: [
    { name: 'Still needed (a board)', props: { variant: 'still needed' } },
    { name: 'A price', props: { variant: 'a price' } },
    { name: 'Free', props: { variant: 'free' } },
    { name: 'Short of (why not)', props: { variant: 'short of' } },
    { name: 'A sentence with icons', props: { variant: 'a sentence' } },
    { name: 'A button with its cost', props: { variant: 'a button cost' } },
    { name: 'The any-shard rate', props: { variant: 'any shard rate' } },
  ],
  covers: ['PriceLine', 'ShortOfLine', 'SayLine'],
  render: (p) => {
    switch (str(p, 'variant')) {
      case 'a price':
        return (
          <p>
            Buy for <PriceLine price={priceOf([acornCount(875), scrapCount(36)])} />
          </p>
        );
      case 'free':
        return (
          <p>
            Buy for <PriceLine price={priceOf([acornCount(0)])} />
          </p>
        );
      case 'short of':
        return (
          <p>
            <ShortOfLine short={{ have: [acornCount(120)], cost: [acornCount(875)] }} />
          </p>
        );
      case 'a sentence':
        return (
          <p>
            <SayLine say={['Waiting for ', anyShardMark(), ' and ', resourceMark('scrap'), '.']} />
          </p>
        );
      case 'a button cost':
        return (
          <ActionButton
            label="Earn Bronze Ribbon"
            cost={[scrapCount(6), shardCount('ember', 2)]}
            onClick={() => undefined}
          />
        );
      case 'any shard rate':
        return (
          <p>
            <SayLine say={[anyShardCount(4), ' = ', acornCount(1)]} />
          </p>
        );
      default:
        return (
          <p>
            Still needed:{' '}
            <CostLine
              items={[
                acornCount(240),
                scrapCount(520),
                shardCount('grove', 70),
                shardCount('tide', 4),
              ]}
            />
          </p>
        );
    }
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
    { name: 'With glossary taps (the dungeon pack)', props: { names: true } },
    { name: 'And two supplies', props: { supplies: 2 } },
    { name: 'Nothing earned', props: { bait: 0, essence: 0, scrap: 0 } },
  ],
  render: (p) => {
    const named = bool(p, 'names');
    const supplies = num(p, 'supplies');
    const items = [
      ...(num(p, 'bait') > 0 ? [baitCount(num(p, 'bait'), { entry: !named })] : []),
      ...(num(p, 'essence') > 0 ? [essenceCount(num(p, 'essence'), { entry: !named })] : []),
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
    'Any word or chip that explains itself: tap it and a popover with a short text opens. Text words get a dotted underline; chips show no marker and brighten on hover.',
  controls: {
    entry: { kind: 'select', options: GLOSSARY_SAMPLE.filter((e) => e !== NONE) },
    look: { kind: 'select', options: ['text', 'chip', 'help'] },
    text: { kind: 'text', maxLength: 30 },
  },
  defaults: { entry: 'essence', look: 'text', text: 'Essence' },
  presets: [
    { name: 'Underlined word', props: { look: 'text', entry: 'essence', text: 'Essence' } },
    { name: 'Chip', props: { look: 'chip', entry: 'festival', text: 'Festival' } },
    { name: 'Help button', props: { look: 'help', entry: 'push-on' } },
  ],
  render: (p) => {
    const look = str(p, 'look');
    return (
      <GlossaryTag
        entry={str(p, 'entry')}
        look={look === 'chip' || look === 'help' ? look : 'text'}
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

/** The real texts the keyword chips are checked against (a Knack with several keywords, one with none, a talent, a plural). */
const KEYWORD_SAMPLES: Readonly<Record<string, string>> = {
  'A Knack with one keyword': combatV2.knacks['steady-mark']?.text ?? '',
  'A Knack with several keywords': combatV2.knacks['detonate']?.text ?? '',
  'The longest Knack text':
    Object.values(combatV2.knacks).find((k) => k.name === 'Boiling Point')?.text ?? '',
  'A Knack with no keyword': combatV2.knacks['lead-the-way']?.text ?? '',
  'A talent (a keyword and a plural)': combatV2.talents['crit-damage']?.text ?? '',
  'Plain words (v1)': 'First pounce +14%.',
};

/** The keyword text, and (when `tap` is on) the first chip tapped once drawn, so a screenshot shows its popover open. */
function KeywordDemo({ text, help, tap }: { text: string; help: boolean; tap: boolean }) {
  const box = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!tap) return;
    box.current?.querySelector('button')?.click();
  }, [tap, text, help]);
  return (
    <div>
      <p class="prose" ref={box}>
        <KeywordText text={text} help={help} />
      </p>
      {/* Room under the chip for its popover, which opens below it. */}
      {tap && <div class="wb-pop-stage" />}
    </div>
  );
}

const keywordText: Entry = {
  name: 'KeywordText',
  file: 'apps/activity/src/ui/KeywordText.tsx',
  group: 'Tags & chips',
  description:
    "A combat v2 text (a Knack's, a talent's) with its keywords as chips: a word the content puts in braces is drawn as a Tag, the rest as plain words. A chip is tap-for-help (the keyword's entry opens in a popover); inside a button (a choice in the Knack picker, the slot that opens it) pass help off for plain chips, since a button must not hold a button. It is the line under a Knack's name in the Knack picker and the Knack part, and the talent's line in the Talent Book.",
  controls: {
    text: { kind: 'select', options: Object.keys(KEYWORD_SAMPLES) },
    help: { kind: 'toggle' },
    tap: { kind: 'toggle' },
  },
  defaults: { text: 'A Knack with several keywords', help: true, tap: false },
  presets: [
    ...Object.keys(KEYWORD_SAMPLES).map((name) => ({ name, props: { text: name } })),
    { name: 'Inside a button (no help)', props: { help: false } },
    { name: 'First chip tapped (its help open)', props: { tap: true } },
  ],
  render: (p) => (
    <KeywordDemo
      text={KEYWORD_SAMPLES[str(p, 'text')] ?? ''}
      help={bool(p, 'help')}
      tap={bool(p, 'tap')}
    />
  ),
};

export const tagEntries: readonly Entry[] = [
  tag,
  keywordText,
  landmarkChip,
  countBadge,
  costLine,
  countBadgeList,
  elementChip,
  roleChip,
  glossaryTag,
  rarityTag,
  outcomeBadge,
  stars,
  choiceMark,
];
