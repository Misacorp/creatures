import {
  baseMinLevel,
  createSeededRng,
  gearBase,
  gearLine,
  itemLines,
  itemStats,
  rollItem,
  statText,
} from '@creatures/game';
import { CostList, ItemFrame, ItemSprite, PartCount, PartsRow } from '../../GearArt';
import { LootList } from '../../LootList';
import { ItemCard } from '../../ItemCard';
import { pileLabel } from '../../claim-view';
import { partCountItems } from '../../count-items';
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
      gear: 'kelp-cap',
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
  file: 'apps/activity/src/LootList.tsx',
  group: 'Loot & reveals',
  description:
    'What a grant gave, with pictures: each gear item as a compact row (image with its level in the corner and rarity border, name, rarity badge; no stats), items that did not fit the bag, new blueprints and parts. It is on the expedition claim, the dungeon results and the finale reveal.',
  controls: {
    gear: { kind: 'number', min: 0, max: 5 },
    rarity: { kind: 'select', options: [...RARITIES, 'mixed'] },
    festival: { kind: 'toggle' },
    converted: { kind: 'toggle' },
    blueprint: { kind: 'select', options: [NONE, 'new', 'known'] },
    scrap: { kind: 'number', min: 0, max: 99 },
    glimmer: { kind: 'number', min: 0, max: 99 },
    counted: { kind: 'toggle' },
  },
  defaults: {
    gear: 2,
    rarity: 'rare',
    festival: false,
    converted: false,
    blueprint: NONE,
    scrap: 3,
    glimmer: 0,
    counted: false,
  },
  presets: [
    { name: 'Two items and scrap', props: {} },
    { name: 'Four items, mixed rarity', props: { gear: 4, rarity: 'mixed', scrap: 0 } },
    { name: 'Festival item', props: { gear: 1, festival: true, scrap: 0 } },
    { name: 'Bag full (converted)', props: { gear: 0, converted: true, scrap: 5 } },
    { name: 'New blueprint', props: { gear: 0, blueprint: 'new', scrap: 0 } },
    { name: 'Known blueprint', props: { gear: 0, blueprint: 'known', scrap: 0 } },
    { name: 'Empty (draws nothing)', props: { gear: 0, scrap: 0 } },
  ],
  render: (p) => {
    const mixed = str(p, 'rarity') === 'mixed';
    const rarity = rarityOf(str(p, 'rarity'));
    const bases = GEAR_BASE_IDS;
    const base = (i: number): string =>
      bool(p, 'festival')
        ? 'festival-hearth-scarf'
        : (bases[(i * 5) % bases.length] ?? 'trail-charm');
    const loot: GrantLoot = {
      gear: Array.from({ length: num(p, 'gear') }, (_, i) => ({
        id: `g${String(i)}`,
        baseId: base(i),
        rarity: mixed ? (RARITIES[(i + 1) % RARITIES.length] ?? 'common') : rarity,
        itemLevel: mixed ? ([15, 9, 21, 4, 12][i % 5] ?? 4) : 4 + i,
      })),
      converted: bool(p, 'converted') ? [{ baseId: base(4), rarity: 'common', itemLevel: 3 }] : [],
      parts: { scrap: num(p, 'scrap'), glimmer: num(p, 'glimmer') },
      blueprints:
        str(p, 'blueprint') === NONE
          ? []
          : [{ baseId: base(2), duplicate: str(p, 'blueprint') === 'known' }],
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
    'A price: each part with the amount needed, and a note in words (and a red colour) when the player has too little; it is on the craft buttons in the Workshop.',
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
    'The frame around a gear item: one single border in the rarity colour (grey, blue, pink) and the item level, "Lv 15", in the bottom-right corner. It is the same on every item image: slots, the picker, item cards, the Workshop bag, loot lists and reveals.',
  controls: {
    rarity: { kind: 'select', options: RARITIES },
    base: { kind: 'select', options: GEAR_BASE_IDS },
    scale: { kind: 'number', min: 1, max: 8 },
    level: { kind: 'number', min: 1, max: 40 },
  },
  defaults: { rarity: 'epic', base: 'kelp-cap', scale: 4, level: 15 },
  presets: RARITIES.map((rarity) => ({ name: rarity, props: { rarity } })),
  render: (p) => (
    <ItemFrame rarity={rarityOf(str(p, 'rarity'))} baseId={str(p, 'base')} level={num(p, 'level')}>
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
    body: 'You earned 40 Essence and a Kelp Cap.',
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

const itemCard: Entry = {
  name: 'ItemCard',
  file: 'apps/activity/src/ItemCard.tsx',
  group: 'Loot & reveals',
  description:
    'An item\'s full details, the one layout wherever they show (the Workshop item and the picker\'s detail panel): the image at the top left with its level in the corner, to its right the name, a small rarity badge and the base stats (one row each, "Attack 41 +22" with the bonus its own lines add), then a full-width divider and the modifiers with their values and tier pips. A Charm has no stats. Rolled from a seed, so the same words give the same item.',
  controls: {
    base: { kind: 'select', options: GEAR_BASE_IDS },
    rarity: { kind: 'select', options: RARITIES },
    itemLevel: { kind: 'number', min: 1, max: 20 },
    seed: { kind: 'text', maxLength: 24 },
    wornInSet: { kind: 'number', min: 0, max: 3 },
    lines: { kind: 'text', maxLength: 90 },
  },
  defaults: {
    base: 'brine-hood',
    rarity: 'epic',
    itemLevel: 15,
    seed: 'card',
    wornInSet: 0,
    lines: '',
  },
  presets: [
    { name: 'A Hat, Epic', props: {} },
    { name: 'A Scarf, Rare', props: { base: 'forge-scarf', rarity: 'rare', itemLevel: 10 } },
    { name: 'A Hat with a crit stat', props: { base: 'storm-cowl', itemLevel: 20 } },
    { name: 'A Charm (no stats)', props: { base: 'cinder-charm', itemLevel: 12 } },
    {
      name: 'A set piece, 0 worn',
      props: { base: 'forge-warm-bonnet', rarity: 'rare', itemLevel: 12, wornInSet: 0 },
    },
    {
      name: 'A set piece, 2 worn (the two-piece bonus is on)',
      props: { base: 'forge-warm-bonnet', rarity: 'rare', itemLevel: 12, wornInSet: 2 },
    },
    {
      name: 'A set piece, 3 worn (both bonuses on)',
      props: { base: 'forge-warm-bonnet', rarity: 'rare', itemLevel: 12, wornInSet: 3 },
    },
    {
      name: 'A role set Charm (Guard only)',
      props: { base: 'watchmans-whistle', rarity: 'epic', itemLevel: 16, wornInSet: 1 },
    },
    {
      name: 'A Festival set piece (Lantern Night)',
      props: { base: 'festival-lantern-cap', rarity: 'rare', itemLevel: 8, wornInSet: 2 },
    },
    {
      name: 'A Hat with a position line',
      props: {
        base: 'trail-cap',
        rarity: 'rare',
        itemLevel: 15,
        lines: 'edge-walker:4,crit-damage:3',
      },
    },
    {
      name: 'A Scarf with a position line',
      props: {
        base: 'woolen-wrap',
        rarity: 'rare',
        itemLevel: 15,
        lines: 'front-liner:5,area-ward:3',
      },
    },
    {
      name: 'A Hat with a chance line (Echo, Epic: +2 pt)',
      props: {
        base: 'trail-cap',
        rarity: 'epic',
        itemLevel: 15,
        lines: 'echo:4,crit-damage:3,attack-local-pct:2',
      },
    },
    {
      name: 'A Charm with a trigger line (Payback)',
      props: { base: 'cinder-charm', rarity: 'rare', itemLevel: 15, lines: 'payback:4,hp:3' },
    },
    {
      name: 'A Scarf with a once-a-fight trigger line (Stubborn)',
      props: {
        base: 'woolen-wrap',
        rarity: 'epic',
        itemLevel: 15,
        lines: 'stubborn:1,area-ward:3,hp-local-pct:2',
      },
    },
    {
      name: "A Charm for the Workshop (Tinker's luck)",
      props: { base: 'trail-charm', rarity: 'rare', itemLevel: 12, lines: 'tinkers-luck:3' },
    },
    {
      name: 'A Festival piece',
      props: { base: 'festival-hearth-scarf', rarity: 'rare', itemLevel: 8 },
    },
    {
      name: 'A Festival piece with a chance line (Second wind, +2 pt)',
      props: {
        base: 'festival-hearth-scarf',
        rarity: 'rare',
        itemLevel: 8,
        lines: 'second-wind:2,area-ward:2',
      },
    },
  ],
  render: (p) => {
    const id = str(p, 'base');
    const base = gearBase(id);
    const level = Math.max(num(p, 'itemLevel'), base === undefined ? 1 : baseMinLevel(base));
    const seeded = rollItem(createSeededRng(str(p, 'seed')), {
      baseId: id,
      rarity: rarityOf(str(p, 'rarity')),
      itemLevel: level,
    });
    // `lines` ("edge-walker:4,crit-damage:3": a line id and its tier I to V) replaces the rolled lines, so a
    // screenshot can show exactly the line it is about.
    const picked = str(p, 'lines')
      .split(',')
      .flatMap((part) => {
        const [lineId = '', tier = '1'] = part.trim().split(':');
        return gearLine(lineId) === undefined
          ? []
          : [{ id: lineId, tier: Math.max(0, Math.min(4, Number(tier) - 1 || 0)) }];
      });
    const rolled = picked.length > 0 ? { ...seeded, lines: picked } : seeded;
    return (
      <section class="item-detail card-item">
        <ItemCard
          item={{
            baseId: id,
            slot: base?.slot ?? 'hat',
            rarity: rolled.rarity,
            itemLevel: level,
            stats: itemStats(rolled).map((s) => ({
              stat: s.stat,
              value: s.value,
              base: s.base,
              text: statText(s.stat, s.value),
            })),
            lines: itemLines(rolled).map((l) => ({ ...l, active: null })),
          }}
          wornInSet={num(p, 'wornInSet')}
        />
      </section>
    );
  },
};

export const lootEntries: readonly Entry[] = [
  rewardPile,
  rewardSummary,
  lootList,
  partCount,
  partsRow,
  costList,
  itemFrame,
  itemCard,
  revealShell,
  revealStage,
  revealLater,
];
