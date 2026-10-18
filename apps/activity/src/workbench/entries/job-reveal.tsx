import type { Creature } from '../../api';
import { sampleCreature } from '../../creature-card-sample';
import type { ExperienceView } from '../../experience';
import type { JobResult } from '../../gear-types';
import { jobResultRarity } from '../../gear-view';
import { JobReveal } from '../../JobReveal';
import { XpGain, XpList } from '../../ui/XpGain';
import { experienceGain, craftingGain } from '../../xp-gain';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const WORKER: Creature = { ...sampleCreature('growing'), id: 'wb-worker', nickname: 'Cindle' };

const KINDS = ['dismantle: one rare', 'dismantle: five commons', 'craft', 'supply'] as const;

/** What the job paid its worker: from the controls (level up, waiting at the level, a treat). */
function paid(p: Props): ExperienceView {
  const up = bool(p, 'levelUp');
  // A creature waits only at a ribbon level (10, 20) or its evolution level: show it at 10.
  const waiting = bool(p, 'waiting');
  const level = waiting ? 10 : 6;
  return {
    creatureId: WORKER.id,
    gained: num(p, 'gained'),
    treat: bool(p, 'treat'),
    levelBefore: up ? level - 1 : level,
    level,
    exp: up ? 12 : 140,
    needed: waiting ? 450 : 222,
    waiting,
    gold: false,
  };
}

function resultOf(p: Props): JobResult {
  const skillLevel = bool(p, 'craftUp') ? 3 : 2;
  const common = {
    experience: paid(p),
    xp: num(p, 'craftXp'),
    // The skill's total XP after the job: level 2 starts at 100 and level 3 at 250.
    skillXp: bool(p, 'craftUp') ? 255 : 140,
    skillLevel,
    leveledUp: bool(p, 'craftUp'),
  };
  switch (str(p, 'kind')) {
    case 'dismantle: five commons':
      return {
        kind: 'dismantle',
        items: [
          { baseId: 'kelp-cap', rarity: 'common', itemLevel: 2 },
          { baseId: 'trail-cap', rarity: 'common', itemLevel: 1 },
          { baseId: 'felt-hat', rarity: 'common', itemLevel: 6 },
          { baseId: 'patch-scarf', rarity: 'common', itemLevel: 3 },
          { baseId: 'static-charm', rarity: 'common', itemLevel: 3 },
        ],
        parts: { scrap: 11 },
        essence: 0,
        learned: [],
        marked: [],
        ...common,
      };
    case 'craft':
      return {
        kind: 'craft',
        gearId: 'wb-made',
        baseId: 'forge-hood',
        rarity: 'rare',
        itemLevel: 6,
        reach: 'none',
        upgraded: false,
        ...common,
      };
    case 'supply':
      return { kind: 'supply', supplyId: 'trail-snack', amount: 2, ...common };
    default:
      return {
        kind: 'dismantle',
        items: [{ baseId: 'forge-hood', rarity: 'rare', itemLevel: 14 }],
        parts: { scrap: 4, 'ember-shard': 1 },
        essence: 6,
        learned: bool(p, 'blueprint') ? ['forge-hood'] : [],
        marked: [],
        ...common,
      };
  }
}

const jobReveal: Entry = {
  name: 'JobReveal',
  file: 'apps/activity/src/JobReveal.tsx',
  group: 'Loot & reveals',
  description:
    "The card of a claimed Workshop job. A dismantle is a picture: the item (or items) taken apart, an arrow, and what it became as count badges (scrap, shards, glimmer, Essence); then who did the work, with their experience and the Crafting XP each as a label, a gain and a bar (the Crafting bar is its own colour, not the creature's gold). A craft shows its orb and item, then the same worker rows.",
  controls: {
    kind: { kind: 'select', options: KINDS },
    gained: { kind: 'number', min: 1, max: 999 },
    craftXp: { kind: 'number', min: 1, max: 999 },
    levelUp: { kind: 'toggle' },
    craftUp: { kind: 'toggle' },
    waiting: { kind: 'toggle' },
    treat: { kind: 'toggle' },
    blueprint: { kind: 'toggle' },
  },
  defaults: {
    kind: 'dismantle: one rare',
    gained: 8,
    craftXp: 12,
    levelUp: false,
    craftUp: false,
    waiting: false,
    treat: false,
    blueprint: false,
  },
  presets: [
    { name: 'Dismantle, one rare (default)', props: {} },
    {
      name: 'Dismantle, five commons',
      props: { kind: 'dismantle: five commons', gained: 20, craftXp: 18 },
    },
    {
      name: 'Dismantle, level up and waiting at the level',
      props: { levelUp: true, waiting: true, craftUp: true },
    },
    {
      name: 'Dismantle with a treat, a blueprint learned',
      props: { treat: true, gained: 16, blueprint: true },
    },
    { name: 'Craft', props: { kind: 'craft' } },
    { name: 'Supply', props: { kind: 'supply' } },
  ],
  render: (p) => (
    <JobReveal
      key={JSON.stringify(p)}
      result={resultOf(p)}
      items={[]}
      rarity={jobResultRarity(resultOf(p))}
      creatures={[WORKER]}
      onDismiss={() => undefined}
    />
  ),
};

function XpGainDemo({ p }: { p: Props }) {
  const exp = experienceGain(paid(p), 'Cindle');
  const crafting = craftingGain(
    {
      xp: num(p, 'craftXp'),
      skillXp: bool(p, 'craftUp') ? 255 : 140,
      skillLevel: bool(p, 'craftUp') ? 3 : 2,
      leveledUp: bool(p, 'craftUp'),
    },
    'Cindle',
  );
  return (
    <XpList label="Progress">
      <XpGain label="Experience" levels={exp.levels} gain={exp.gain} bar={exp.bar} />
      <XpGain label="Crafting" levels={crafting.levels} gain={crafting.gain} bar={crafting.bar} />
      <XpGain label="Level" levels={{ from: 3, to: 4 }} gain="+120" />
    </XpList>
  );
}

const xpGain: Entry = {
  name: 'XpGain',
  file: 'apps/activity/src/ui/XpGain.tsx',
  group: 'Bars',
  description:
    'One "XP gained" line, the same wherever the app shows what an activity paid: a label, a level change (Lv 4 to Lv 5), the gain in green, small tags and a note, and the bar under it (a level change alone has no bar). The trip result and the claimed Workshop job use it, in a list (XpList) of two columns. The Crafting bar has its own colour so it is never taken for the creature\'s experience.',
  covers: ['XpList'],
  controls: {
    gained: { kind: 'number', min: 1, max: 999 },
    craftXp: { kind: 'number', min: 1, max: 999 },
    levelUp: { kind: 'toggle' },
    craftUp: { kind: 'toggle' },
    waiting: { kind: 'toggle' },
    treat: { kind: 'toggle' },
  },
  defaults: {
    gained: 8,
    craftXp: 12,
    levelUp: false,
    craftUp: false,
    waiting: false,
    treat: false,
  },
  presets: [
    { name: 'Experience, Crafting and a level change', props: {} },
    { name: 'Both levelled up', props: { levelUp: true, craftUp: true } },
  ],
  render: (p) => <XpGainDemo p={p} />,
};

export const jobRevealEntries: readonly Entry[] = [jobReveal, xpGain];
