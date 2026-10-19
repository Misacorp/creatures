import { talentContent, talentText } from '@creatures/game';
import { parseGameState } from '../../api';
import creaturesState from '../../fixtures/creatures-state.json';
import { pendingFind, type Find } from '../../find-view';
import type { PendingCatch, TalentView } from '../../talent-types';
import { TripResult } from '../../TripResult';
import type { TripResultView } from '../../trip-result-view';
import { experienceGain, type ExperienceGain } from '../../xp-gain';
import { bool, str } from '../props';
import type { Entry } from '../types';

/** Real server output (the duplicate-choice scenario): three Splashet duplicates and one Splashet owned. */
const WAITING = parseGameState(creaturesState);
const [TEACHABLE, , , KNOWN] = WAITING.pending as [
  PendingCatch,
  PendingCatch,
  PendingCatch,
  PendingCatch,
];

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

const MISTNEWT: Find = {
  key: 'mistnewt',
  species: 'mistnewt',
  shiny: false,
  talent: talentNamed('Slow and Unbothered'),
  talentNew: true,
  badges: [
    { text: 'New!', entry: null },
    { text: 'First on server!', entry: 'first-on-server' },
  ],
  choice: null,
  answered: null,
};

/** The Splashet whose talent the owned Splashet already knows: Teach greyed, Fuse recommended. */
const KNOWN_FIND = pendingFind(KNOWN, WAITING.creatures);
/** A Splashet with a new talent: Teach recommended. */
const TEACH_FIND = pendingFind(TEACHABLE, WAITING.creatures);
/** The same card when Splashet is fully fused: Fuse greyed. */
const MAXED_FIND = pendingFind(
  { ...TEACHABLE, id: 'maxed', offered: { ...TEACHABLE.offered, fuse: [] } },
  WAITING.creatures.map((c) => (c.species === 'splashet' ? { ...c, fusionCount: 5 } : c)),
);

const scrap = (amount: number) => ({
  key: 'scrap',
  icon: { kind: 'part', part: 'scrap' } as const,
  amount,
  label: 'Scrap',
  entry: 'part-scrap',
});

/** The explorer's creature experience as the server's answer would give it (a Sproutle). */
function growth(p: {
  gained: number;
  treat: boolean;
  from: number;
  to: number;
  exp: number;
  needed: number;
}): ExperienceGain {
  return experienceGain(
    {
      creatureId: 'sproutle',
      gained: p.gained,
      treat: p.treat,
      levelBefore: p.from,
      level: p.to,
      exp: p.exp,
      needed: p.needed,
      waiting: false,
      gold: false,
    },
    'Sproutle',
  );
}

const BASE: TripResultView = {
  tone: 'home',
  explorer: { id: 'sproutle', species: 'sproutle', shiny: false, name: 'Sproutle' },
  place: { id: 'tidepools', name: 'Tidepools' },
  hours: 12,
  failure: null,
  pushOn: null,
  finds: [],
  noCatch: null,
  autoSettled: [],
  counts: [
    scrap(1),
    { key: 'satchel', icon: { kind: 'supply', id: 'satchel' }, amount: 1, name: 'Small Satchel' },
  ],
  loot: null,
  xp: { gained: 300, rank: 3, rankBefore: 3, rankedUp: false, value: 412, max: 1200 },
  growth: growth({ gained: 240, treat: true, from: 8, to: 9, exp: 40, needed: 300 }),
  stars: { stars: 1, gained: false, trips: 5 },
  slot: null,
  gifts: [],
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
        set: null,
        setComplete: false,
      },
    ],
  },
  'a duplicate': {
    ...BASE,
    finds: [KNOWN_FIND],
    growth: growth({ gained: 240, treat: true, from: 9, to: 9, exp: 190, needed: 300 }),
    stars: { stars: 1, gained: false, trips: 6 },
  },
  'three finds': {
    ...BASE,
    hours: 24,
    finds: [MISTNEWT, TEACH_FIND, MAXED_FIND],
    loot: {
      gear: [{ id: 'g1', baseId: 'kelp-cap', rarity: 'rare', itemLevel: 6 }],
      converted: [],
      parts: {},
      blueprints: [],
    },
    // A long trip that took the explorer up a rank.
    xp: { gained: 600, rank: 4, rankBefore: 3, rankedUp: true, value: 60, max: 1500 },
    stars: { stars: 2, gained: true, trips: 10 },
  },
  'called home early': {
    ...BASE,
    tone: 'recalled',
    noCatch: 'No creature came this time, only a small find.',
    xp: null,
    growth: null,
    stars: null,
  },
  'the trip failed': {
    ...BASE,
    tone: 'failed',
    failure:
      'Ancient vault did not work out. Nothing came back, and the explorer learned nothing this time.',
    counts: [],
    xp: null,
    growth: null,
    stars: null,
  },
};

export const tripResult: Entry = {
  name: 'TripResult',
  file: 'apps/activity/src/TripResult.tsx',
  group: 'Creatures & game pieces',
  description:
    'What a claimed trip brought home, on one card: the place banner with the explorer, one sentence of who went where, the creatures found (a duplicate chooses with radio rows), what came home, one progress block, journal pages and one full-width Claim. The buttons do nothing here.',
  controls: {
    scene: { kind: 'select', options: Object.keys(SCENES) },
    journalOpen: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: { scene: 'one new creature', journalOpen: true, busy: false },
  presets: Object.keys(SCENES).map((scene) => ({ name: scene, props: { scene } })),
  render: (p) => (
    <TripResult
      key={str(p, 'scene')}
      view={SCENES[str(p, 'scene')] ?? BASE}
      busy={bool(p, 'busy')}
      journalOpen={bool(p, 'journalOpen')}
      onClaim={() => undefined}
    />
  ),
};
