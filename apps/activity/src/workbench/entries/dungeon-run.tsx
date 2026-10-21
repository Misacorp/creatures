import { dungeonEvents, dungeonKeepsakes, expToNext } from '@creatures/game';
import { DungeonCamp } from '../../DungeonCamp';
import { DungeonDescend } from '../../DungeonDescend';
import { DungeonEvent } from '../../DungeonEvent';
import { DungeonResults } from '../../DungeonResults';
import { DungeonRun } from '../../DungeonRun';
import { DungeonRunStrip } from '../../DungeonRunStrip';
import { sampleRoster } from '../../creature-card-sample';
import actCampPending from '../../fixtures/dungeon-act-camp-pending.json';
import actCamp from '../../fixtures/dungeon-act-camp.json';
import actCleared from '../../fixtures/dungeon-act-cleared.json';
import actDefeat from '../../fixtures/dungeon-act-defeat.json';
import actEventPending from '../../fixtures/dungeon-act-event-pending.json';
import actEvent from '../../fixtures/dungeon-act-event.json';
import actFight from '../../fixtures/dungeon-act-fight.json';
import actHome from '../../fixtures/dungeon-act-home.json';
import startFixture from '../../fixtures/dungeon-start.json';
import { parseDungeonAct, parseDungeonStart } from '../../dungeon-parse';
import {
  sampleRunCreatures,
  sampleCampCreatures,
  sampleStateCamp,
  EMPTY_PACK,
  sampleSummary,
  sampleToday,
  omitKey,
} from '../../dungeon-path-samples';
import {
  undercroftLostSummary,
  undercroftState,
  undercroftSummary,
} from '../../dungeon-undercroft-sample';
import type { ExperienceView } from '../../experience';
import type { DungeonRewards, DungeonRunState, DungeonRunSummary } from '../../dungeon-types';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';
import { experienceBoostOf } from './xp-boosts';

const EVENT_IDS = dungeonEvents.map((e) => e.id);
const OUTCOMES = [
  'cleared',
  'home',
  'defeat',
  'cleared an Undercroft floor',
  'lost in the Undercroft',
  'an older run (no outcome)',
  'no rewards (lost in the first room)',
] as const;

/** The summary of a run's end as a real server answered it (`fixtures/dungeon-act-*.json`). */
function captured(outcome: 'cleared' | 'home' | 'defeat'): DungeonRunSummary {
  const answer = parseDungeonAct(
    outcome === 'cleared' ? actCleared : outcome === 'home' ? actHome : actDefeat,
  );
  if (answer.summary === undefined) throw new Error('the capture has a summary');
  return answer.summary;
}

/** The run of the strip's page: the sample row hurt as asked, the pack and the keepsakes as set. */
function stripState(p: Props): DungeonRunState {
  const hurt = str(p, 'hp');
  const team = sampleRunCreatures().map((c, i) => {
    if (hurt === 'all full') return c;
    if (hurt === 'one hurt') return i === 0 ? { ...c, hp: Math.round(c.hpMax * 0.3) } : c;
    if (hurt === 'one knocked out') return i === 2 ? { ...c, hp: 0 } : c;
    return i === 0 ? { ...c, hp: 0 } : i === 1 ? { ...c, hp: 0 } : c;
  });
  const keepsakes = dungeonKeepsakes
    .slice(0, num(p, 'keepsakes'))
    .map((k) => ({ id: k.id, name: k.name, description: k.description }));
  const at = str(p, 'at');
  return {
    ...sampleStateCamp(),
    at: at === 'entrance' ? null : at === 'camp' ? 'f3l1' : 'f1l2',
    pending: null,
    team,
    keepsakes,
    pack: { bait: num(p, 'bait'), essence: num(p, 'essence'), scrap: num(p, 'scrap') },
    landmark: bool(p, 'landmark'),
    lastEvent: bool(p, 'lastEvent')
      ? {
          name: 'Glowing Pool',
          option: 'Drink',
          outcome: 'Every creature healed 25% of its max HP.',
        }
      : null,
  };
}

const dungeonRunStrip: Entry = {
  name: 'DungeonRunStrip',
  file: 'apps/activity/src/DungeonRunStrip.tsx',
  group: 'Creatures & game pieces',
  description:
    'The strip at the top of an open dungeon run (above the map, a mystery room and the camp): where the run is, the row with an HP bar and the HP in words under each creature (a knocked-out one is grey with the skull), then what the run carries on two ink panels (side by side when they fit, stacked on a phone): the Pack (a pixel backpack with "At risk" hung under it and the loot as icons with numbers beside it) and the Keepsakes (a title with its "?" and the chips you can tap under it), and the line about what the last mystery room did.',
  controls: {
    at: { kind: 'select', options: ['entrance', 'mid-run', 'camp'] },
    hp: {
      kind: 'select',
      options: ['all full', 'one hurt', 'one knocked out', 'two knocked out'],
    },
    keepsakes: { kind: 'number', min: 0, max: 3 },
    bait: { kind: 'number', min: 0, max: 20 },
    essence: { kind: 'number', min: 0, max: 20 },
    scrap: { kind: 'number', min: 0, max: 20 },
    lastEvent: { kind: 'toggle' },
    landmark: { kind: 'toggle' },
  },
  defaults: {
    at: 'mid-run',
    hp: 'one hurt',
    keepsakes: 1,
    bait: 2,
    essence: 0,
    scrap: 1,
    lastEvent: true,
    landmark: false,
  },
  presets: [
    {
      name: 'Mid-run',
      props: {},
    },
    {
      name: 'The entrance: full row, an empty pack',
      props: {
        at: 'entrance',
        hp: 'all full',
        keepsakes: 0,
        bait: 0,
        scrap: 0,
        lastEvent: false,
      },
    },
    {
      name: 'One knocked out, a full pack',
      props: { hp: 'one knocked out', keepsakes: 3, bait: 5, essence: 1, scrap: 6 },
    },
    {
      name: 'Two knocked out, at the camp',
      props: { at: 'camp', hp: 'two knocked out', lastEvent: false },
    },
    { name: 'A landmark depth', props: { landmark: true } },
  ],
  render: (p) => <DungeonRunStrip state={stripState(p)} />,
};

const dungeonEvent: Entry = {
  name: 'DungeonEvent',
  file: 'apps/activity/src/DungeonEvent.tsx',
  group: 'Creatures & game pieces',
  description:
    "A mystery room of the daily dungeon: its name, the scene, and two big buttons that each say the exact outcome (the odds of a gamble too). Picking one is the run's next step. It is shown from the shipped events.",
  controls: {
    event: { kind: 'select', options: EVENT_IDS },
    busy: { kind: 'toggle' },
  },
  defaults: { event: EVENT_IDS[0] ?? '', busy: false },
  presets: [
    ...dungeonEvents.slice(0, 4).map((e) => ({ name: e.name, props: { event: e.id } })),
    { name: 'A step is on its way', props: { busy: true } },
  ],
  render: (p) => {
    const found = dungeonEvents.find((e) => e.id === str(p, 'event')) ?? dungeonEvents[0];
    if (found === undefined) return <p class="muted">The content has no events.</p>;
    return (
      <DungeonEvent
        event={{
          id: found.id,
          name: found.name,
          text: found.text,
          options: found.options.map((o) => ({ label: o.label, description: o.description })),
        }}
        busy={bool(p, 'busy')}
        onPick={() => undefined}
      />
    );
  },
};

function CampDemo({ p }: { p: Props }) {
  const base = sampleStateCamp();
  const step = str(p, 'step');
  const owned = sampleCampCreatures(num(p, 'owned'));
  const offers = dungeonKeepsakes
    .slice(0, 2)
    .map((k) => ({ id: k.id, name: k.name, description: k.description }));
  const initialStep =
    step === 'keepsakes'
      ? 'keepsake'
      : step === 'who goes home'
        ? 'out'
        : step === 'arrange after a swap'
          ? 'arrange'
          : 'menu';
  return (
    <DungeonCamp
      // A fresh card when the step changes, so it opens where the page says.
      key={`${step}-${String(num(p, 'owned'))}`}
      team={base.team}
      pack={{ bait: num(p, 'bait'), essence: 0, scrap: num(p, 'scrap') }}
      camp={{ offers, restBp: 4000 }}
      creatures={owned}
      busy={bool(p, 'busy')}
      onAct={() => undefined}
      initialStep={initialStep}
      {...((initialStep === 'out' || initialStep === 'arrange') && owned[0] !== undefined
        ? { initialIncoming: owned[0].id }
        : {})}
      {...(initialStep === 'arrange' && base.team[2] !== undefined
        ? { initialOut: base.team[2].id }
        : {})}
    />
  );
}

const dungeonCamp: Entry = {
  name: 'DungeonCamp',
  file: 'apps/activity/src/DungeonCamp.tsx',
  group: 'Creatures & game pieces',
  description:
    'The camp halfway up the dungeon map: the row on the same board as the dungeon entry (drag a creature onto another, or tap one and then another, to swap places; the HP stays under its creature, a downed one in red), one line of help, three short choices (Rest, take a keepsake, Swap a creature), and, set apart, "Head home with your pack". Keepsakes shows the two on offer; "who goes home" is the second step of a swap, with the knocked-out creature plain to see; "arrange after a swap" is the third, the row as the swap leaves it (the new creature in the place of the one that left, at full HP) to rearrange before "Swap and push on"; heading home asks once more.',
  controls: {
    step: {
      kind: 'select',
      options: ['choices', 'keepsakes', 'who goes home', 'arrange after a swap'],
    },
    owned: { kind: 'number', min: 3, max: 8 },
    bait: { kind: 'number', min: 0, max: 20 },
    scrap: { kind: 'number', min: 0, max: 20 },
    busy: { kind: 'toggle' },
  },
  defaults: { step: 'choices', owned: 6, bait: 2, scrap: 1, busy: false },
  presets: [
    { name: 'The choices', props: {} },
    { name: 'The two keepsakes', props: { step: 'keepsakes' } },
    { name: 'Who goes home (a swap)', props: { step: 'who goes home' } },
    {
      name: 'Arrange the row after a swap (the new creature in place)',
      props: { step: 'arrange after a swap' },
    },
    { name: 'Nobody to swap in (only three creatures)', props: { owned: 3 } },
    { name: 'An empty pack', props: { bait: 0, scrap: 0 } },
    { name: 'A step is on its way', props: { busy: true } },
  ],
  render: (p) => <CampDemo p={p} />,
};

function DescendDemo({ p }: { p: Props }) {
  const base = undercroftState('descent');
  const variant = str(p, 'card');
  if (base.pending?.kind !== 'descend') return <p class="muted">The capture has a descent.</p>;
  const descent =
    variant === 'a cracked floor (Undercroft 2)'
      ? { ...base.pending, level: 2, floors: 3, banked: { gear: [], supplies: [], parts: {} } }
      : variant === 'nothing banked'
        ? { ...base.pending, banked: { gear: [], supplies: [], parts: {} } }
        : base.pending;
  return (
    <DungeonDescend
      key={variant}
      descent={descent}
      pack={bool(p, 'emptyPack') ? { bait: 0, essence: 0, scrap: 0 } : base.pack}
      depth={base.depth}
      busy={bool(p, 'busy')}
      onAct={() => undefined}
    />
  );
}

const dungeonDescend: Entry = {
  name: 'DungeonDescend',
  file: 'apps/activity/src/DungeonDescend.tsx',
  group: 'Creatures & game pieces',
  description:
    'The descent card, after the floor boss (or an Undercroft floor boss on a cracked floor) has fallen. It says the new depth is unlocked, asks if the player dares delve deeper, what the boss chest already banked (gear as item rows, supplies and parts as icons with numbers), what stays at risk (the pack) side by side, what the Undercroft below is like (its rooms, the depth its foes are from, the breath the creatures catch, the double loot, and that the only way home is a camp) and two choices side by side: Descend, or Head home with your pack. Made from the captured answer; the buttons go nowhere here.',
  controls: {
    card: {
      kind: 'select',
      options: [
        'the floor boss fell (Undercroft 1)',
        'a cracked floor (Undercroft 2)',
        'nothing banked',
      ],
    },
    emptyPack: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: { card: 'the floor boss fell (Undercroft 1)', emptyPack: false, busy: false },
  presets: [
    { name: 'The floor boss fell', props: {} },
    {
      name: 'A cracked floor: another floor below',
      props: { card: 'a cracked floor (Undercroft 2)' },
    },
    { name: 'Nothing banked, an empty pack', props: { card: 'nothing banked', emptyPack: true } },
    { name: 'A step is on its way', props: { busy: true } },
  ],
  render: (p) => <DescendDemo p={p} />,
};

const EXPERIENCE_MODES = [
  'a level up with a treat',
  'Hearty Breakfast and a treat',
  'waiting and top level',
  'as the server sent it',
] as const;

/**
 * What the run paid the team, made up for the workbench: one case of each thing the team section can show,
 * with the game's level sizes and multipliers the server really sends.
 */
function experienceFor(
  team: DungeonRunSummary['team'],
  mode: string,
): ExperienceView[] | undefined {
  const base = { treat: false, gold: false, waiting: false };
  const at = (i: number): string => team[i]?.id ?? `missing-${String(i)}`;
  const paid = (
    i: number,
    p: { gained: number; from: number; to: number; exp: number; boost?: string },
  ): ExperienceView => {
    const boost = p.boost === undefined ? null : experienceBoostOf(p.boost);
    return {
      ...base,
      creatureId: at(i),
      gained: p.gained,
      treat: boost?.parts.some((x) => x.source === 'treat') === true,
      levelBefore: p.from,
      level: p.to,
      exp: p.exp,
      needed: p.to >= 30 ? null : expToNext(p.to),
      ...(boost === null ? {} : { boost }),
    };
  };
  switch (mode) {
    case 'a level up with a treat':
      return [
        paid(0, { gained: 260, from: 7, to: 8, exp: 90, boost: 'treat ×2' }),
        paid(1, { gained: 130, from: 7, to: 7, exp: 190 }),
        paid(2, { gained: 40, from: 3, to: 3, exp: 60 }),
      ];
    case 'Hearty Breakfast and a treat':
      return [
        paid(0, { gained: 487, from: 7, to: 8, exp: 270, boost: 'treat on Hearty Breakfast (×3)' }),
        paid(1, { gained: 162, from: 7, to: 7, exp: 200, boost: 'Hearty Breakfast, no treat' }),
        paid(2, { gained: 104, from: 3, to: 4, exp: 10, boost: 'Hearty Breakfast, no treat' }),
      ];
    case 'waiting and top level':
      return [
        { ...paid(0, { gained: 200, from: 10, to: 10, exp: expToNext(10) }), waiting: true },
        { ...paid(1, { gained: 200, from: 29, to: 30, exp: 0 }), gold: true },
        paid(2, { gained: 90, from: 30, to: 30, exp: 0 }),
      ];
    default:
      return undefined;
  }
}

/** The gear a result page can be shown with (the capture has none), and the streak bonuses of the 3rd and 7th day. */
const GEAR_OPTIONS = ['none (as captured)', 'one piece', 'three pieces', 'five pieces'] as const;
const STREAK_OPTIONS = [
  'none (as captured)',
  'day 3 (Bait and Scrap)',
  'day 7 (Essence and Scrap)',
];
const SAMPLE_GEAR = [
  { id: 'wb-g1', baseId: 'kelp-cap', rarity: 'common', itemLevel: 4 },
  { id: 'wb-g2', baseId: 'forge-scarf', rarity: 'rare', itemLevel: 6 },
  { id: 'wb-g3', baseId: 'trail-charm', rarity: 'epic', itemLevel: 5 },
  { id: 'wb-g4', baseId: 'emberkeepers-crown', rarity: 'common', itemLevel: 3 },
  { id: 'wb-g5', baseId: 'festival-hearth-scarf', rarity: 'rare', itemLevel: 7 },
] as const;

/** The run with the gear and the streak bonus the page's controls ask for. */
function withRewards<T extends { rewards: DungeonRewards }>(run: T, p: Props): T {
  const count = Math.max(0, GEAR_OPTIONS.indexOf(str(p, 'gear') as (typeof GEAR_OPTIONS)[number]));
  const streak = str(p, 'streak');
  return {
    ...run,
    rewards: {
      ...run.rewards,
      ...(count === 0
        ? {}
        : {
            gear: SAMPLE_GEAR.slice(0, count === 1 ? 1 : count === 2 ? 3 : 5).map((g) => ({
              ...g,
            })),
          }),
      ...(streak === STREAK_OPTIONS[1]
        ? { streak: { day: 3, bait: 2, essence: 0, parts: { scrap: 1 } } }
        : streak === STREAK_OPTIONS[2]
          ? { streak: { day: 7, bait: 0, essence: 1, parts: { scrap: 1 } } }
          : {}),
    },
  };
}

function ResultsDemo({ p }: { p: Props }) {
  const outcome = str(p, 'outcome');
  const noRewards = outcome === 'no rewards (lost in the first room)';
  const kind = noRewards
    ? 'defeat'
    : outcome === 'home' || outcome === 'defeat'
      ? outcome
      : 'cleared';
  const sample =
    outcome === 'cleared an Undercroft floor'
      ? undercroftSummary()
      : outcome === 'lost in the Undercroft'
        ? undercroftLostSummary()
        : bool(p, 'capture')
          ? captured(kind)
          : sampleSummary(kind);
  // A run lost in its first room paid nothing and kept an empty pack.
  const base: typeof sample = noRewards
    ? {
        ...sample,
        rewards: {
          ...sample.rewards,
          bait: 0,
          essence: 0,
          parts: {},
          gear: [],
          supplies: [],
          converted: [],
          streak: null,
        },
        pack: { found: EMPTY_PACK, kept: EMPTY_PACK },
      }
    : sample;
  const run: typeof base =
    outcome === 'an older run (no outcome)'
      ? (() => {
          const old: Record<string, unknown> = { ...base };
          for (const key of ['outcome', 'path', 'pack', 'keepsakes', 'route']) delete old[key];
          return old as unknown as typeof base;
        })()
      : base;
  const routed =
    bool(p, 'route') || run.route === undefined
      ? run
      : (() => {
          return omitKey(run, 'route');
        })();
  const paid = experienceFor(routed.team, str(p, 'experience'));
  const shown: typeof routed = withRewards(
    paid === undefined ? routed : { ...routed, rewards: { ...routed.rewards, experience: paid } },
    p,
  );
  const view = str(p, 'view');
  return (
    <DungeonResults
      run={shown}
      initialView={view === 'rooms' ? 'rooms' : 'map'}
      today={sampleToday({ canRun: false, last: shown })}
      offset={0}
      canRetry={bool(p, 'canRetry')}
      busy={false}
      error={null}
      onWatch={() => undefined}
      onRetry={() => undefined}
    />
  );
}

const dungeonResults: Entry = {
  name: 'DungeonResults',
  file: 'apps/activity/src/DungeonResults.tsx',
  group: 'Loot & reveals',
  description:
    'The end of a dungeon run. A short title (green when cleared or home safe, red when defeated) and one line that sums the run up; the rewards as badges only; the route as the map (opens first) or as Rooms, every room the run went through in order with a Cleared or Defeated banner and, for a camp, a mystery room, a cache or a door, a short line of what happened; the team, each creature with its level (a green +1 when it levelled up), its experience bar with the part just gained drawn brighter, and a line saying what multiplied the experience ("Treat gave 2x experience"); then the keepsakes the run held. An older three-room run keeps a plain line about its rooms. A run that paid nothing says "No rewards this time." with a small sad creature and a hint.',
  controls: {
    outcome: { kind: 'select', options: OUTCOMES },
    experience: { kind: 'select', options: EXPERIENCE_MODES },
    canRetry: { kind: 'toggle' },
    capture: { kind: 'toggle' },
    route: { kind: 'toggle' },
    view: { kind: 'select', options: ['map', 'rooms'] },
    gear: { kind: 'select', options: [...GEAR_OPTIONS] },
    streak: { kind: 'select', options: STREAK_OPTIONS },
  },
  defaults: {
    outcome: 'cleared',
    experience: 'a level up with a treat',
    canRetry: false,
    capture: false,
    route: true,
    view: 'map',
    gear: GEAR_OPTIONS[0],
    streak: STREAK_OPTIONS[0] ?? '',
  },
  presets: [
    { name: 'Cleared', props: {} },
    {
      name: 'One gear piece and a day 7 streak bonus',
      props: { gear: 'one piece', streak: STREAK_OPTIONS[2] ?? '' },
    },
    { name: 'Five gear pieces, wrapping', props: { gear: 'five pieces' } },
    {
      name: 'Three gear pieces and a day 3 streak bonus',
      props: { gear: 'three pieces', streak: STREAK_OPTIONS[1] ?? '' },
    },
    { name: 'Home safe', props: { outcome: 'home' } },
    {
      name: "Defeated on the day's floor (half the pack)",
      props: { outcome: 'defeat', canRetry: true },
    },
    {
      name: 'Lost in the Undercroft (half the pack)',
      props: { outcome: 'lost in the Undercroft' },
    },
    {
      name: 'Cleared an Undercroft floor (as the server sent it)',
      props: { outcome: 'cleared an Undercroft floor' },
    },
    {
      name: 'No rewards: an empty pack, a small sad creature and a hint',
      props: { outcome: 'no rewards (lost in the first room)', canRetry: true },
    },
    { name: 'Cleared, the rooms', props: { view: 'rooms' } },
    { name: 'Home safe, the rooms', props: { outcome: 'home', view: 'rooms' } },
    {
      name: 'Defeated, the rooms (the last one Defeated)',
      props: { outcome: 'defeat', view: 'rooms' },
    },
    {
      name: 'Lost in the Undercroft, the rooms',
      props: { outcome: 'lost in the Undercroft', view: 'rooms' },
    },
    {
      name: 'Cleared an Undercroft floor, the rooms',
      props: { outcome: 'cleared an Undercroft floor', view: 'rooms' },
    },
    {
      name: 'A creature that levelled up with a treat',
      props: { experience: 'a level up with a treat' },
    },
    {
      name: 'Hearty Breakfast (3x treat) and Cold Snap',
      props: { experience: 'Hearty Breakfast and a treat' },
    },
    {
      name: 'Waiting at a level, a Gold Ribbon and the top level',
      props: { experience: 'waiting and top level' },
    },
    {
      name: 'Cleared, as the server sent it',
      props: { capture: true, experience: 'as the server sent it' },
    },
    {
      name: 'Home safe, as the server sent it',
      props: { outcome: 'home', capture: true, experience: 'as the server sent it' },
    },
    {
      name: 'Defeated, as the server sent it',
      props: {
        outcome: 'defeat',
        capture: true,
        canRetry: true,
        experience: 'as the server sent it',
      },
    },
    {
      name: 'Defeated, the route as a map (a red cross on the lost room)',
      props: { outcome: 'defeat', view: 'map' },
    },
    { name: 'A run with no route (no Map / Rooms switch)', props: { route: false } },
    { name: 'An older three-room run', props: { outcome: 'an older run (no outcome)' } },
  ],
  render: (p) => (
    <ResultsDemo
      key={`${str(p, 'outcome')}-${String(bool(p, 'capture'))}-${String(bool(p, 'route'))}-${str(p, 'view')}-${str(p, 'experience')}`}
      p={p}
    />
  ),
};

const SCENES = {
  'at the entrance': () => parseDungeonStart(startFixture).state,
  'after the first fight': () => parseDungeonAct(actFight).state,
  'a mystery room': () => parseDungeonAct(actEventPending).state,
  'after the mystery room': () => parseDungeonAct(actEvent).state,
  'at the camp': () => parseDungeonAct(actCampPending).state,
  'after the camp (swapped)': () => parseDungeonAct(actCamp).state,
  'the descent card (the boss fell)': () => undercroftState('descent'),
  'a cracked floor: the descent card again': () => {
    const base = undercroftState('descent');
    return {
      ...base,
      pending:
        base.pending?.kind === 'descend'
          ? {
              ...base.pending,
              level: 2,
              floors: 3,
              banked: { gear: [], supplies: [], parts: {} },
            }
          : null,
    };
  },
  'before the boss (the down-arrow badge on the floor boss)': () => undercroftState('locked'),
  'a carved door ahead': () => undercroftState('door-ahead'),
  'in the Undercroft: the entrance': () => undercroftState('entrance'),
  'in the Undercroft: midway': () => undercroftState('midway'),
  'in the Undercroft: a floor boss on a cracked floor next': () => undercroftState('cracked'),
  'a second floor (below a cracked floor)': () => undercroftState('cracked-deeper'),
  'the boss is next': () => {
    const done = parseDungeonAct(actCleared).state;
    return {
      ...done,
      status: 'active' as const,
      outcome: null,
      at: 'f5l0',
      path: done.path.slice(0, -1),
      reachable: ['f6l1'],
    };
  },
} as const satisfies Record<string, () => DungeonRunState>;
const SCENE_NAMES = Object.keys(SCENES) as (keyof typeof SCENES)[];

function RunDemo({ p }: { p: Props }) {
  const scene = SCENE_NAMES.find((n) => n === str(p, 'scene')) ?? 'at the entrance';
  return (
    <DungeonRun
      key={scene}
      state={SCENES[scene]()}
      creatures={sampleRoster(6)}
      busy={bool(p, 'busy')}
      error={
        bool(p, 'error') ? 'Your run moved on in another window. The map was refreshed.' : null
      }
      onAct={() => undefined}
    />
  );
}

const dungeonRun: Entry = {
  name: 'DungeonRun',
  file: 'apps/activity/src/DungeonRun.tsx',
  group: 'Creatures & game pieces',
  description:
    'An open dungeon run as one screen, built from the states a real server sent: the strip at the top (the row with HP, keepsakes, the pack), then what the run stands at: the map with the rooms it can go to, a mystery room card, or the camp card. Tap a room for its drawer and Go; every pick is an act the screen above sends, which here goes nowhere.',
  controls: {
    scene: { kind: 'select', options: SCENE_NAMES },
    busy: { kind: 'toggle' },
    error: { kind: 'toggle' },
  },
  defaults: { scene: 'after the first fight', busy: false, error: false },
  presets: [
    { name: 'At the entrance', props: { scene: 'at the entrance' } },
    { name: 'After the first fight', props: {} },
    { name: 'A mystery room', props: { scene: 'a mystery room' } },
    { name: 'After the mystery room', props: { scene: 'after the mystery room' } },
    { name: 'At the camp', props: { scene: 'at the camp' } },
    {
      name: 'After the camp (a creature swapped in)',
      props: { scene: 'after the camp (swapped)' },
    },
    { name: 'The boss is next', props: { scene: 'the boss is next' } },
    { name: 'The descent card', props: { scene: 'the descent card (the boss fell)' } },
    {
      name: 'The descent card of a cracked floor',
      props: { scene: 'a cracked floor: the descent card again' },
    },
    {
      name: 'Before the boss: the quiet band above it',
      props: { scene: 'before the boss (the down-arrow badge on the floor boss)' },
    },
    { name: 'A carved door ahead', props: { scene: 'a carved door ahead' } },
    {
      name: 'In the Undercroft: the entrance',
      props: { scene: 'in the Undercroft: the entrance' },
    },
    { name: 'In the Undercroft: midway', props: { scene: 'in the Undercroft: midway' } },
    {
      name: 'A floor boss on a cracked floor next',
      props: { scene: 'in the Undercroft: a floor boss on a cracked floor next' },
    },
    { name: 'A second floor', props: { scene: 'a second floor (below a cracked floor)' } },
    { name: 'An act is on its way', props: { busy: true } },
    { name: 'With an error line', props: { error: true } },
  ],
  render: (p) => <RunDemo p={p} />,
};

export const dungeonRunEntries: readonly Entry[] = [
  dungeonRun,
  dungeonRunStrip,
  dungeonEvent,
  dungeonCamp,
  dungeonDescend,
  dungeonResults,
];
