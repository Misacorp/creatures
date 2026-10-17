import { talentContent, talentText } from '@creatures/game';
import type { TalentView } from '../../talent-types';
import { TripResult, type Find, type TripResultView } from '../../TripResult';
import { bool, str } from '../props';
import type { Entry } from '../types';

/** A talent as the card shows it, found by its name in the content (the first talent if the name moved). */
function talentNamed(name: string): TalentView {
  const defs = [...talentContent.byId.values()];
  const def = defs.find((d) => d.name === name) ?? defs[0];
  if (def === undefined) throw new Error('no talents in the content');
  const text = talentText(def, false);
  return {
    id: def.id,
    name: def.name,
    golden: false,
    text: text.text,
    about: text.about,
    idle: false,
  };
}

const scrap = (amount: number) => ({
  key: 'scrap',
  icon: { kind: 'part', part: 'scrap' } as const,
  amount,
  label: 'Scrap',
});

const MISTNEWT: Find = {
  kind: 'new',
  key: 'mistnewt',
  species: 'mistnewt',
  talent: talentNamed('Slow and Unbothered'),
  badges: [
    { text: 'New!', entry: null },
    { text: 'First on server!', entry: 'first-on-server' },
  ],
};

/** A Splashet the player already has: Teach cannot go anywhere (the talent is known), Fuse is recommended. */
const SPLASHET_KNOWN: Find = {
  kind: 'duplicate',
  key: 'splashet',
  species: 'splashet',
  talent: talentNamed('First to Say Hello'),
  options: [
    {
      key: 'fuse',
      label: 'Fuse',
      detail: 'Splashet: fusion 3 → 4 / 5',
      blocked: null,
      recommended: true,
      request: { choice: 'fuse', creatureId: 'c1' },
    },
    {
      key: 'teach',
      label: 'Teach',
      detail: '',
      blocked: "Already in Splashet's Talent Book",
      recommended: false,
      request: { choice: 'teach', creatureId: 'c1', slot: 2 },
    },
    {
      key: 'release',
      label: 'Release',
      detail: '',
      pays: [scrap(3)],
      blocked: null,
      recommended: false,
      request: { choice: 'release' },
    },
  ],
};

/** A Splashet when Splashet is fully fused: Fuse is greyed, and Teach has two places to go. */
const SPLASHET_FULL: Find = {
  kind: 'duplicate',
  key: 'splashet-2',
  species: 'splashet',
  talent: talentNamed('First to Say Hello'),
  options: [
    {
      key: 'teach-c1',
      label: 'Teach',
      detail: 'Splashet, empty slot 2',
      blocked: null,
      recommended: true,
      request: { choice: 'teach', creatureId: 'c1', slot: 2 },
    },
    {
      key: 'teach-c2',
      label: 'Teach',
      detail: 'Tidewing, replaces Playful',
      blocked: null,
      recommended: false,
      request: { choice: 'teach', creatureId: 'c2', slot: 1 },
    },
    {
      key: 'fuse',
      label: 'Fuse',
      detail: '',
      blocked: 'Fully fused (5 / 5)',
      recommended: false,
      request: { choice: 'fuse', creatureId: 'c1' },
    },
    {
      key: 'release',
      label: 'Release',
      detail: '',
      pays: [scrap(3)],
      blocked: null,
      recommended: false,
      request: { choice: 'release' },
    },
  ],
};

const CINDLE: Find = {
  kind: 'duplicate',
  key: 'cindle',
  species: 'cindle',
  talent: talentNamed('Quick to Pounce'),
  options: [
    {
      key: 'fuse',
      label: 'Fuse',
      detail: 'Cindle: fusion 1 → 2 / 5',
      blocked: null,
      recommended: true,
      request: { choice: 'fuse', creatureId: 'c3' },
    },
    {
      key: 'teach',
      label: 'Teach',
      detail: 'Cindle, replaces Warm Paws',
      blocked: null,
      recommended: false,
      request: { choice: 'teach', creatureId: 'c3', slot: 1 },
    },
    {
      key: 'release',
      label: 'Release',
      detail: '',
      pays: [
        scrap(3),
        {
          key: 'ember',
          icon: { kind: 'part', part: 'ember-shard' },
          amount: 1,
          label: 'Ember shard',
        },
      ],
      blocked: null,
      recommended: false,
      request: { choice: 'release' },
    },
  ],
};

const BASE: TripResultView = {
  explorer: { id: 'sproutle', species: 'sproutle', name: 'Sproutle' },
  place: { id: 'tidepools', name: 'Tidepools' },
  hours: 12,
  finds: [],
  counts: [
    scrap(1),
    { key: 'satchel', icon: { kind: 'supply', id: 'satchel' }, amount: 1, name: 'Small Satchel' },
  ],
  loot: null,
  xp: { gained: 300, value: 412, max: 1200, startCap: 'Rank 3', endCap: 'Rank 4' },
  growth: { gained: 240, treat: true, from: 8, to: 9 },
  stars: { stars: 1, gained: false, trips: 5 },
  journal: [],
};

const SCENES: Record<string, TripResultView> = {
  'one new creature': {
    ...BASE,
    finds: [MISTNEWT],
    journal: [
      {
        title: 'A small friend',
        text: 'The mist-newts stand at the back and hum. Everyone in front of them stands a little taller, and nobody can say why.',
      },
    ],
  },
  'a duplicate': {
    ...BASE,
    finds: [SPLASHET_KNOWN],
    growth: { gained: 240, treat: true, from: 9, to: 9 },
    stars: { stars: 1, gained: false, trips: 6 },
  },
  'three finds': {
    ...BASE,
    hours: 24,
    finds: [MISTNEWT, SPLASHET_FULL, CINDLE],
    loot: {
      gear: [{ id: 'g1', baseId: 'kelp-cap', rarity: 'rare', itemLevel: 6 }],
      converted: [],
      parts: {},
      blueprints: [],
    },
    stars: { stars: 2, gained: true, trips: 10 },
  },
  'nothing found': { ...BASE, hours: 2, finds: [] },
};

export const tripResult: Entry = {
  name: 'TripResult',
  file: 'apps/activity/src/TripResult.tsx',
  group: 'Creatures & game pieces',
  description:
    'DRAFT, not used in the game yet. The new expedition result: who went where for how long over the place banner, the creatures found (a duplicate chooses with radio rows, Recommended preselected, impossible choices greyed with the reason), what came home, one progress block, journal pages and one Claim button.',
  controls: {
    scene: { kind: 'select', options: Object.keys(SCENES) },
    header: { kind: 'select', options: ['strip', 'backdrop'] },
    journalOpen: { kind: 'toggle' },
  },
  defaults: { scene: 'one new creature', header: 'strip', journalOpen: true },
  presets: Object.keys(SCENES).map((scene) => ({ name: scene, props: { scene } })),
  render: (p) => (
    <TripResult
      key={str(p, 'scene')}
      view={SCENES[str(p, 'scene')] ?? BASE}
      header={str(p, 'header') === 'backdrop' ? 'backdrop' : 'strip'}
      journalOpen={bool(p, 'journalOpen')}
      onClaim={() => undefined}
    />
  ),
};
