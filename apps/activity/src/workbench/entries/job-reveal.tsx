import type { Creature } from '../../api';
import { sampleCreature } from '../../creature-card-sample';
import type { ExperienceView } from '../../experience';
import type { JobResult } from '../../gear-types';
import { jobResultRarity } from '../../gear-view';
import { JobReveal } from '../../JobReveal';
import { expToNext } from '@creatures/game';
import { ExperienceGainRow } from '../../ExperienceGainRow';
import { GlossaryTag } from '../../Glossary';
import { XpGain, XpList } from '../../ui/XpGain';
import { experienceGain, craftingGain } from '../../xp-gain';
import { bool, num, str } from '../props';
import { APPRENTICE, EXPERIENCE_BOOST_NAMES, experienceBoostOf } from './xp-boosts';
import type { Entry, Props } from '../types';

const WORKER: Creature = { ...sampleCreature('growing'), id: 'wb-worker', nickname: 'Cindle' };

const KINDS = ['dismantle: one rare', 'dismantle: five commons', 'craft', 'supply'] as const;

/**
 * What the job paid its worker: from the controls (level up, waiting at the level, the multiplier). The
 * level sizes are the game's: a level up from 6 starts level 7 with what was left over.
 */
function paid(p: Props): ExperienceView {
  const up = bool(p, 'levelUp');
  // A creature waits only at a ribbon level (10, 20) or its evolution level: show it at 10.
  const waiting = bool(p, 'waiting');
  const level = waiting ? 10 : 7;
  const needed = expToNext(level);
  const gained = num(p, 'gained');
  const boost = experienceBoostOf(str(p, 'boost'));
  return {
    creatureId: WORKER.id,
    gained,
    treat: boost?.parts.some((x) => x.source === 'treat') === true,
    levelBefore: up ? level - 1 : level,
    level,
    exp: waiting ? needed : up ? Math.min(gained - 1, 37) : 174,
    needed,
    waiting,
    gold: false,
    ...(boost === null ? {} : { boost }),
  };
}

function resultOf(p: Props): JobResult {
  const skillLevel = bool(p, 'craftUp') ? 3 : 2;
  const common = {
    experience: paid(p),
    xp: num(p, 'craftXp'),
    ...(bool(p, 'apprentice') ? { xpBoost: APPRENTICE } : {}),
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
    'The card of a claimed Workshop job. A dismantle is a picture: the item (or items) taken apart, an arrow, and what it became as count badges (scrap, shards, glimmer, Essence); then who did the work, with their experience and the Crafting XP as the shared XP rows (the bar counts up; a multiplier chip and the melon slice open the breakdown). A craft shows its orb and item, then the same worker rows.',
  controls: {
    kind: { kind: 'select', options: KINDS },
    gained: { kind: 'number', min: 1, max: 999 },
    craftXp: { kind: 'number', min: 1, max: 999 },
    levelUp: { kind: 'toggle' },
    craftUp: { kind: 'toggle' },
    waiting: { kind: 'toggle' },
    boost: { kind: 'select', options: EXPERIENCE_BOOST_NAMES },
    apprentice: { kind: 'toggle' },
    blueprint: { kind: 'toggle' },
  },
  defaults: {
    kind: 'dismantle: one rare',
    gained: 16,
    craftXp: 24,
    levelUp: false,
    craftUp: false,
    waiting: false,
    boost: 'none',
    apprentice: false,
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
      name: 'Dismantle with a treat, a level up',
      props: { boost: 'treat ×2', gained: 60, levelUp: true, craftUp: true },
    },
    {
      name: 'Dismantle on Hearty Breakfast, no treat',
      props: { boost: 'Hearty Breakfast, no treat', gained: 20 },
    },
    {
      name: 'Dismantle with several multipliers',
      props: { boost: 'treat, Hearty Breakfast and Cold Snap', gained: 50, apprentice: true },
    },
    {
      name: 'Dismantle, a blueprint learned',
      props: { blueprint: true },
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
      ...(bool(p, 'apprentice') ? { xpBoost: APPRENTICE } : {}),
    },
    'Cindle',
  );
  return (
    <XpList label="Progress">
      <ExperienceGainRow gain={exp} />
      <XpGain
        change={crafting}
        what="Crafting XP"
        label={<GlossaryTag entry="skill-crafting">Crafting</GlossaryTag>}
      />
    </XpList>
  );
}

const xpGain: Entry = {
  name: 'XpGain',
  file: 'apps/activity/src/ui/XpGain.tsx',
  group: 'Bars',
  description:
    'One "XP gained" row, the same wherever the app shows what an activity paid (a Workshop job, a trip, the dungeon team): the label, the level change and Level up!, then the level tag, a slim bar that counts up from the old value to the new one (a level crossed fills, flashes and starts again), the "+N", and the multiplier: a "×2" chip in the kind\'s colour when the total is not 1, the melon slice when a treat was packed; either opens the breakdown. Never a sentence about what changed the gain. Reduced motion shows the end at once.',
  covers: ['XpList', 'XpExtraRow'],
  controls: {
    gained: { kind: 'number', min: 1, max: 999 },
    craftXp: { kind: 'number', min: 1, max: 999 },
    levelUp: { kind: 'toggle' },
    craftUp: { kind: 'toggle' },
    waiting: { kind: 'toggle' },
    boost: { kind: 'select', options: EXPERIENCE_BOOST_NAMES },
    apprentice: { kind: 'toggle' },
  },
  defaults: {
    gained: 16,
    craftXp: 24,
    levelUp: false,
    craftUp: false,
    waiting: false,
    boost: 'none',
    apprentice: false,
  },
  presets: [
    { name: 'Experience and Crafting', props: {} },
    {
      name: 'Both levelled up, a treat',
      props: { levelUp: true, craftUp: true, gained: 60, boost: 'treat ×2' },
    },
    { name: 'Weather, no treat', props: { boost: 'Hearty Breakfast, no treat', gained: 20 } },
    {
      name: 'Several multipliers',
      props: { boost: 'treat, Hearty Breakfast and Cold Snap', gained: 50, apprentice: true },
    },
  ],
  render: (p) => <XpGainDemo key={JSON.stringify(p)} p={p} />,
};

export const jobRevealEntries: readonly Entry[] = [jobReveal, xpGain];
