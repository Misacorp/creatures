import {
  CostList,
  ItemFrame,
  ItemSprite,
  PartCount,
  PartsRow,
  partCountItems,
} from '../../GearArt';
import { LootList } from '../../GearLoot';
import { pileLabel } from '../../claim-view';
import type { GearRarity, GrantLoot, PartKind, PartsBundle } from '../../gear-types';
import type { RevealFrame } from '../../reveal-anim';
import type { PileSource } from '../../reward-pile';
import { RewardPile } from '../../RewardPile';
import { CountBadge, type CountItem } from '../../ui/CountBadge';
import { RevealLater, RevealShell, RevealStage } from '../../ui/RevealShell';
import { RewardSummary } from '../../ui/RewardSummary';
import { OutcomeBadge } from '../../ui/RevealShell';
import { GEAR_BASE_IDS, NONE, PARTS, RARITIES, SUPPLY_IDS } from '../data';
import { bool, num, str } from '../props';
import type { Control, Entry, Props } from '../types';

const partControls: Record<string, Control> = Object.fromEntries(
  PARTS.map((part) => [part, { kind: 'number', min: 0, max: 99 } satisfies Control]),
);
const partDefaults = (scrap: number): Record<string, number> =>
  Object.fromEntries(PARTS.map((part) => [part, part === 'scrap' ? scrap : 0]));

function parts(p: Props): PartsBundle {
  const out: Partial<Record<PartKind, number>> = {};
  for (const part of PARTS) out[part] = num(p, part);
  return out;
}

function rarityOf(value: string): GearRarity {
  return RARITIES.find((r) => r === value) ?? 'common';
}

function pileSource(p: Props): PileSource {
  const supply = str(p, 'supply');
  return {
    parts: parts(p),
    essence: num(p, 'essence'),
    bait: num(p, 'bait'),
    ...(str(p, 'gear') === NONE ? {} : { gear: [{ baseId: str(p, 'gear') }] }),
    ...(supply === NONE ? {} : { supplies: [supply] }),
  };
}

const SOURCE_CONTROLS = {
  gear: { kind: 'select', options: [NONE, ...GEAR_BASE_IDS] },
  ...partControls,
  supply: { kind: 'select', options: [NONE, ...SUPPLY_IDS] },
  essence: { kind: 'number', min: 0, max: 999 },
  bait: { kind: 'number', min: 0, max: 9999 },
} as const satisfies Record<string, Control>;

const SOURCE_DEFAULTS = {
  gear: NONE,
  ...partDefaults(3),
  supply: NONE,
  essence: 0,
  bait: 0,
};

const SOURCE_PRESETS = [
  { name: 'Nothing earned', props: { scrap: 0 } },
  { name: 'Scrap and Bait', props: { scrap: 4, bait: 120 } },
  {
    name: 'Everything',
    props: {
      gear: 'wave-band',
      scrap: 6,
      'ember-shard': 2,
      glimmer: 1,
      supply: 'lure-good',
      essence: 40,
      bait: 250,
    },
  },
];

const rewardPile: Entry = {
  name: 'RewardPile',
  file: 'apps/activity/src/RewardPile.tsx',
  group: 'Loot & reveals',
  description:
    'A small heap of icons, one for each kind of reward earned (gear, parts, supplies, Essence, Bait); it sits beside the counts on every reward screen and draws nothing when nothing was earned.',
  controls: SOURCE_CONTROLS,
  defaults: SOURCE_DEFAULTS,
  presets: SOURCE_PRESETS,
  render: (p) => <RewardPile source={pileSource(p)} label={pileLabel(pileSource(p), 'Loot')} />,
};

function countItems(p: Props): CountItem[] {
  const items = partCountItems(parts(p));
  if (num(p, 'essence') > 0) {
    items.push({
      key: 'essence',
      icon: { kind: 'glyph', id: 'gem' },
      amount: num(p, 'essence'),
      label: 'Essence',
      entry: 'essence',
    });
  }
  if (num(p, 'bait') > 0) {
    items.push({
      key: 'bait',
      icon: { kind: 'glyph', id: 'bait' },
      amount: num(p, 'bait'),
      label: 'Bait',
      entry: 'bait',
    });
  }
  return items;
}

const rewardSummary: Entry = {
  name: 'RewardSummary',
  file: 'apps/activity/src/ui/RewardSummary.tsx',
  group: 'Loot & reveals',
  description:
    'The rewards of a screen: the pile of icons with its count badges beside it; it ends every claimed expedition, Workshop job and raid phase.',
  controls: { ...SOURCE_CONTROLS, prefix: { kind: 'select', options: ['Loot', 'Rewards'] } },
  defaults: { ...SOURCE_DEFAULTS, scrap: 4, bait: 120, prefix: 'Rewards' },
  presets: SOURCE_PRESETS,
  render: (p) => (
    <RewardSummary
      source={pileSource(p)}
      prefix={str(p, 'prefix') === 'Loot' ? 'Loot' : 'Rewards'}
      countsLabel="Rewards"
      counts={countItems(p)}
    />
  ),
};

const lootList: Entry = {
  name: 'LootList',
  file: 'apps/activity/src/GearLoot.tsx',
  group: 'Loot & reveals',
  description:
    'What a grant gave, with pictures: each gear item in its rarity frame, items that did not fit the bag, new blueprints and parts; it is on the loot reveals and claim screens.',
  controls: {
    gear: { kind: 'number', min: 0, max: 3 },
    rarity: { kind: 'select', options: RARITIES },
    converted: { kind: 'toggle' },
    blueprint: { kind: 'select', options: [NONE, 'new', 'known'] },
    scrap: { kind: 'number', min: 0, max: 99 },
    glimmer: { kind: 'number', min: 0, max: 99 },
    counted: { kind: 'toggle' },
  },
  defaults: {
    gear: 2,
    rarity: 'rare',
    converted: false,
    blueprint: NONE,
    scrap: 3,
    glimmer: 0,
    counted: false,
  },
  presets: [
    { name: 'Two items and scrap', props: {} },
    { name: 'Festival item', props: { gear: 1, rarity: 'festival', scrap: 0 } },
    { name: 'Bag full (converted)', props: { gear: 0, converted: true, scrap: 5 } },
    { name: 'New blueprint', props: { gear: 0, blueprint: 'new', scrap: 0 } },
    { name: 'Known blueprint', props: { gear: 0, blueprint: 'known', scrap: 0 } },
    { name: 'Empty (draws nothing)', props: { gear: 0, scrap: 0 } },
  ],
  render: (p) => {
    const rarity = rarityOf(str(p, 'rarity'));
    const bases = GEAR_BASE_IDS;
    const base = (i: number): string => bases[(i * 5) % bases.length] ?? 'trail-charm';
    const loot: GrantLoot = {
      gear: Array.from({ length: num(p, 'gear') }, (_, i) => ({
        id: `g${String(i)}`,
        baseId: base(i),
        rarity,
      })),
      converted: bool(p, 'converted') ? [{ baseId: base(4), rarity: 'common' }] : [],
      parts: { scrap: num(p, 'scrap'), glimmer: num(p, 'glimmer') },
      blueprints:
        str(p, 'blueprint') === NONE
          ? []
          : [{ baseId: base(2), rarity: 'rare', duplicate: str(p, 'blueprint') === 'known' }],
    };
    return <LootList loot={loot} label="Loot" counted={bool(p, 'counted')} />;
  },
};

const partCount: Entry = {
  name: 'PartCount',
  file: 'apps/activity/src/GearArt.tsx',
  group: 'Loot & reveals',
  description:
    'A gear part icon with its number (Scrap, a shard, Glimmer); the part is named for screen readers and tapping it explains the part.',
  controls: {
    kind: { kind: 'select', options: PARTS },
    amount: { kind: 'number', min: 0, max: 9999 },
    tag: { kind: 'toggle' },
  },
  defaults: { kind: 'scrap', amount: 5, tag: true },
  presets: PARTS.map((kind) => ({ name: kind, props: { kind } })),
  render: (p) => (
    <PartCount
      kind={PARTS.find((k) => k === str(p, 'kind')) ?? 'scrap'}
      amount={num(p, 'amount')}
      tag={bool(p, 'tag')}
    />
  ),
};

const partsRow: Entry = {
  name: 'PartsRow',
  file: 'apps/activity/src/GearArt.tsx',
  group: 'Loot & reveals',
  description:
    'All the parts a player holds as icons with numbers, zero counts included so the row never jumps; it is at the top of the Workshop.',
  controls: partControls,
  defaults: { ...partDefaults(12), glimmer: 2, 'ember-shard': 4 },
  presets: [
    { name: 'All zero', props: partDefaults(0) },
    {
      name: 'Some of everything',
      props: Object.fromEntries(PARTS.map((part, i) => [part, i + 1])),
    },
  ],
  render: (p) => (
    <PartsRow
      parts={{
        scrap: num(p, 'scrap'),
        'tide-shard': num(p, 'tide-shard'),
        'ember-shard': num(p, 'ember-shard'),
        'grove-shard': num(p, 'grove-shard'),
        'spark-shard': num(p, 'spark-shard'),
        glimmer: num(p, 'glimmer'),
      }}
    />
  ),
};

const costList: Entry = {
  name: 'CostList',
  file: 'apps/activity/src/GearArt.tsx',
  group: 'Loot & reveals',
  description:
    'A price: each part with the amount needed, and a note in words (and a red colour) when the player has too little; it is on craft, improve and enchant buttons in the Workshop.',
  controls: {
    scrapCost: { kind: 'number', min: 0, max: 99 },
    scrapHave: { kind: 'number', min: 0, max: 99 },
    glimmerCost: { kind: 'number', min: 0, max: 99 },
    glimmerHave: { kind: 'number', min: 0, max: 99 },
    essence: { kind: 'number', min: 0, max: 99 },
    essenceHave: { kind: 'number', min: 0, max: 99 },
  },
  defaults: {
    scrapCost: 6,
    scrapHave: 10,
    glimmerCost: 1,
    glimmerHave: 0,
    essence: 5,
    essenceHave: 20,
  },
  presets: [
    { name: 'Can afford', props: { glimmerHave: 3 } },
    { name: 'Missing Glimmer', props: { glimmerHave: 0 } },
    { name: 'Missing everything', props: { scrapHave: 0, glimmerHave: 0, essenceHave: 0 } },
  ],
  render: (p) => (
    <CostList
      cost={{ scrap: num(p, 'scrapCost'), glimmer: num(p, 'glimmerCost') }}
      have={{
        scrap: num(p, 'scrapHave'),
        'tide-shard': 0,
        'ember-shard': 0,
        'grove-shard': 0,
        'spark-shard': 0,
        glimmer: num(p, 'glimmerHave'),
      }}
      {...(num(p, 'essence') > 0
        ? { essence: num(p, 'essence'), essenceHave: num(p, 'essenceHave') }
        : {})}
    />
  ),
};

const itemFrame: Entry = {
  name: 'ItemFrame',
  file: 'apps/activity/src/GearArt.tsx',
  group: 'Loot & reveals',
  description:
    'The frame around a gear item: each rarity has its own edge style and its own pips, so rarity never depends on colour alone; it is on every item card and loot reveal.',
  controls: {
    rarity: { kind: 'select', options: RARITIES },
    base: { kind: 'select', options: GEAR_BASE_IDS },
    scale: { kind: 'number', min: 1, max: 8 },
  },
  defaults: { rarity: 'epic', base: 'wave-band', scale: 4 },
  presets: RARITIES.map((rarity) => ({ name: rarity, props: { rarity } })),
  render: (p) => (
    <ItemFrame rarity={rarityOf(str(p, 'rarity'))}>
      <ItemSprite baseId={str(p, 'base')} scale={num(p, 'scale')} />
    </ItemFrame>
  ),
};

const revealShell: Entry = {
  name: 'RevealShell',
  file: 'apps/activity/src/ui/RevealShell.tsx',
  group: 'Loot & reveals',
  description:
    'The card every reveal sits in: a heading with an optional badge, the content, and a "Got it" button (or the screen\'s own buttons); it holds the finale loot, claimed jobs and trips.',
  controls: {
    title: { kind: 'text', maxLength: 40 },
    badge: { kind: 'toggle' },
    cleared: { kind: 'toggle' },
    busy: { kind: 'toggle' },
    ownFooter: { kind: 'toggle' },
    body: { kind: 'text', maxLength: 120 },
  },
  defaults: {
    title: 'Finale loot',
    badge: true,
    cleared: true,
    busy: false,
    ownFooter: false,
    body: 'You earned 40 Essence and a Wave Band.',
  },
  presets: [
    { name: 'Cleared', props: {} },
    {
      name: 'Not cleared',
      props: { cleared: false, body: 'The boss held. You still earned 10 Essence.' },
    },
    { name: 'No badge', props: { badge: false } },
    { name: 'Own buttons', props: { ownFooter: true } },
    { name: 'Busy', props: { busy: true } },
  ],
  render: (p) => (
    <RevealShell
      id="wb-reveal"
      title={str(p, 'title')}
      {...(bool(p, 'badge') ? { badge: <OutcomeBadge cleared={bool(p, 'cleared')} /> } : {})}
      busy={bool(p, 'busy')}
      onDismiss={() => undefined}
      {...(bool(p, 'ownFooter')
        ? {
            footer: (
              <p class="button-row">
                <button type="button" class="primary">
                  See the replay
                </button>
                <button type="button">Close</button>
              </p>
            ),
          }
        : {})}
    >
      <p>{str(p, 'body')}</p>
    </RevealShell>
  ),
};

const revealStage: Entry = {
  name: 'RevealStage',
  file: 'apps/activity/src/ui/RevealShell.tsx',
  group: 'Loot & reveals',
  description:
    'The orb that shakes and then opens to show a gem; the finale loot reveal and a claimed Workshop job both start with it. Pick the moment of the animation.',
  controls: { phase: { kind: 'select', options: ['shake', 'open', 'count', 'done'] } },
  defaults: { phase: 'shake' },
  presets: ['shake', 'open', 'count', 'done'].map((phase) => ({ name: phase, props: { phase } })),
  render: (p) => {
    const phase =
      (['shake', 'open', 'count', 'done'] as const).find((x) => x === str(p, 'phase')) ?? 'shake';
    const frame: RevealFrame = { at: 0, phase, count: 0 };
    return <RevealStage frame={frame} />;
  },
};

const revealLater: Entry = {
  name: 'RevealLater',
  file: 'apps/activity/src/ui/RevealShell.tsx',
  group: 'Loot & reveals',
  description:
    'Content that fades in once the reveal animation is done (the text is in the page from the start; only its look is delayed); it holds the loot list under the orb.',
  controls: { done: { kind: 'toggle' }, text: { kind: 'text', maxLength: 60 } },
  defaults: { done: true, text: 'Parts: 3 Scrap' },
  presets: [
    { name: 'Waiting', props: { done: false } },
    { name: 'Done', props: { done: true } },
  ],
  render: (p) => (
    <RevealLater done={bool(p, 'done')}>
      <CountBadge icon={{ kind: 'part', part: 'scrap' }} amount={3} label="Scrap" />
      <p>{str(p, 'text')}</p>
    </RevealLater>
  ),
};

export const lootEntries: readonly Entry[] = [
  rewardPile,
  rewardSummary,
  lootList,
  partCount,
  partsRow,
  costList,
  itemFrame,
  revealShell,
  revealStage,
  revealLater,
];
