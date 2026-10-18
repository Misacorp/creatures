import { dungeonEvents, dungeonKeepsakes } from '@creatures/game';
import { DungeonCamp } from '../../DungeonCamp';
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
  sampleStateCamp,
  sampleSummary,
  sampleToday,
  omitKey,
} from '../../dungeon-path-samples';
import type { DungeonRunState, DungeonRunSummary } from '../../dungeon-types';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const EVENT_IDS = dungeonEvents.map((e) => e.id);
const OUTCOMES = ['cleared', 'home', 'defeat', 'an older run (no outcome)'] as const;

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
    'The strip at the top of an open dungeon run (above the map, a mystery room and the camp): where the run is, the row with an HP bar and the HP in words under each creature (a knocked-out one is grey with the skull), the keepsakes as chips you can tap, the pack as icons with numbers and an "At risk" tag, and the line about what the last mystery room did.',
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
  const owned = sampleRoster(num(p, 'owned'));
  const offers = dungeonKeepsakes
    .slice(0, 2)
    .map((k) => ({ id: k.id, name: k.name, description: k.description }));
  const initialStep = step === 'keepsakes' ? 'keepsake' : step === 'who goes home' ? 'out' : 'menu';
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
      {...(initialStep === 'out' && owned[0] !== undefined ? { initialIncoming: owned[0].id } : {})}
    />
  );
}

const dungeonCamp: Entry = {
  name: 'DungeonCamp',
  file: 'apps/activity/src/DungeonCamp.tsx',
  group: 'Creatures & game pieces',
  description:
    'The camp halfway up the dungeon map: the row with Left and Right buttons to change its order, three choices that each say what they do (Rest, take a keepsake, Swap a creature), and, set apart, "Head home with your pack" with what pushing on risks. Keepsakes shows the two on offer; "who goes home" is the second step of a swap, with the knocked-out creature plain to see; heading home asks once more.',
  controls: {
    step: { kind: 'select', options: ['choices', 'keepsakes', 'who goes home'] },
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
    { name: 'Nobody to swap in (only three creatures)', props: { owned: 3 } },
    { name: 'An empty pack', props: { bait: 0, scrap: 0 } },
    { name: 'A step is on its way', props: { busy: true } },
  ],
  render: (p) => <CampDemo p={p} />,
};

function ResultsDemo({ p }: { p: Props }) {
  const outcome = str(p, 'outcome');
  const kind = outcome === 'home' || outcome === 'defeat' ? outcome : 'cleared';
  const base = bool(p, 'capture') ? captured(kind) : sampleSummary(kind);
  const run: typeof base =
    outcome === 'an older run (no outcome)'
      ? (() => {
          const old: Record<string, unknown> = { ...base };
          for (const key of ['outcome', 'path', 'pack', 'keepsakes', 'route']) delete old[key];
          return old as unknown as typeof base;
        })()
      : base;
  const shown =
    bool(p, 'route') || run.route === undefined
      ? run
      : (() => {
          return omitKey(run, 'route');
        })();
  const view = str(p, 'view');
  return (
    <DungeonResults
      run={shown}
      initialView={view === 'map' ? 'map' : 'fights'}
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
    'The end of a dungeon run. A path run says how it ended in its headline (cleared with the new depth, home safe with the whole pack, or defeated with half of it), the pack on one line (what was lost after a defeat is struck through), the keepsakes it held as chips, the route as the fights it played or as the map (a Fights / Map switch; a tap on a room tells what happened there) and the team; an older three-room run keeps its old headline. Rewards, experience, the streak and "Watch again" are the same for both.',
  controls: {
    outcome: { kind: 'select', options: OUTCOMES },
    canRetry: { kind: 'toggle' },
    capture: { kind: 'toggle' },
    route: { kind: 'toggle' },
    view: { kind: 'select', options: ['fights', 'map'] },
  },
  defaults: { outcome: 'cleared', canRetry: false, capture: false, route: true, view: 'fights' },
  presets: [
    { name: 'Cleared', props: {} },
    { name: 'Home safe', props: { outcome: 'home' } },
    { name: 'Defeated (half the pack)', props: { outcome: 'defeat', canRetry: true } },
    { name: 'Cleared, as the server sent it', props: { capture: true } },
    { name: 'Home safe, as the server sent it', props: { outcome: 'home', capture: true } },
    {
      name: 'Defeated, as the server sent it',
      props: { outcome: 'defeat', capture: true, canRetry: true },
    },
    { name: 'Cleared, the route as a map', props: { view: 'map' } },
    { name: 'Defeated, the route as a map', props: { outcome: 'defeat', view: 'map' } },
    { name: 'A run with no route (no Fights / Map switch)', props: { route: false } },
    { name: 'An older three-room run', props: { outcome: 'an older run (no outcome)' } },
  ],
  render: (p) => (
    <ResultsDemo
      key={`${str(p, 'outcome')}-${String(bool(p, 'capture'))}-${String(bool(p, 'route'))}-${str(p, 'view')}`}
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
  dungeonResults,
];
