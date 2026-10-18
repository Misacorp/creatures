import { DungeonMap } from '../../DungeonMap';
import { DepthProgress } from '../../DepthProgress';
import { SAMPLE_MAP, SAMPLE_STAGES, sampleState } from '../../dungeon-map-sample';
import { UNDERCROFT_STAGES, undercroftState } from '../../dungeon-undercroft-sample';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const NONE = 'none';
/** The Undercroft's stages are named `uc-<stage>` (they are made from the captured runs). */
const UC_PREFIX = 'uc-';
const STAGE_LABELS = [
  ...SAMPLE_STAGES.map((s) => s as string),
  ...UNDERCROFT_STAGES.map((s) => `${UC_PREFIX}${s}`),
];
const NODE_IDS = [
  NONE,
  ...SAMPLE_MAP.nodes.map((n) => n.id),
  ...[
    ...new Set(
      UNDERCROFT_STAGES.flatMap((s) => {
        const run = undercroftState(s);
        return [...run.map.nodes, ...(run.undercroft?.maps.flatMap((m) => m.nodes) ?? [])].map(
          (n) => n.id,
        );
      }),
    ),
  ].filter((id) => !SAMPLE_MAP.nodes.some((n) => n.id === id)),
];

function Demo({ p }: { p: Props }) {
  const picked = str(p, 'stage');
  const uc = UNDERCROFT_STAGES.find((s) => `${UC_PREFIX}${s}` === picked);
  const stage = SAMPLE_STAGES.find((s) => s === picked) ?? 'preview';
  const run = uc === undefined ? null : undercroftState(uc);
  const state = run ?? sampleState(stage);
  const map = run?.map ?? SAMPLE_MAP;
  const open = str(p, 'open');
  return (
    <div class="dungeon-card raid-section">
      <DungeonMap
        // A new map when the stage or the open room changes, so its drawer starts as the page says.
        key={`${picked}-${open}`}
        map={map}
        undercroft={run?.undercroft?.maps}
        depth={num(p, 'depth')}
        state={state}
        landmark={bool(p, 'landmark')}
        busy={bool(p, 'busy')}
        {...(open === NONE ? {} : { initialOpen: open })}
        {...(bool(p, 'withGo') ? { onGo: () => undefined } : {})}
      />
    </div>
  );
}

function DepthDemo({ p }: { p: Props }) {
  return (
    <div class="dungeon-card raid-section">
      <DepthProgress depth={num(p, 'depth')} />
    </div>
  );
}

const depthProgress: Entry = {
  name: 'DepthProgress',
  file: 'apps/activity/src/DepthProgress.tsx',
  group: 'Creatures & game pieces',
  description:
    'The depth track of the daily dungeon, on the pre-run card and in the end report: the depth the player is at, the next landmark and a pip for each depth between. Each step says what it unlocks, from the rules: a landmark gives a gear drop and bonus Essence, beating the first landmark opens the Undercroft ("Undercroft opens" at depth 8) and each later one adds a room ("Undercroft +1 room") up to the most the rules allow. A depth where nothing changes says "Nothing new".',
  controls: { depth: { kind: 'number', min: 1, max: 60 } },
  defaults: { depth: 3 },
  presets: [
    { name: 'Depth 3: the first landmark ahead', props: { depth: 3 } },
    { name: 'Depth 7: the first landmark (its boss opens the Undercroft)', props: { depth: 7 } },
    { name: 'Depth 8: the Undercroft opens', props: { depth: 8 } },
    { name: 'Depth 10: nothing new', props: { depth: 10 } },
    { name: 'Depth 14: the second landmark', props: { depth: 14 } },
    { name: 'Depth 15: a room more', props: { depth: 15 } },
    { name: 'Depth 33: near the most rooms', props: { depth: 33 } },
    { name: 'Depth 36: no more rooms to add', props: { depth: 36 } },
  ],
  render: (p) => <DepthDemo p={p} />,
};

const dungeonMap: Entry = {
  name: 'DungeonMap',
  file: 'apps/activity/src/DungeonMap.tsx',
  group: 'Creatures & game pieces',
  description:
    'The daily dungeon map (the Undercroft stages are the captured runs: the floors it drew stand above the floor boss in a darker band with their labels, with a pale crown for its floor boss, a crack on a cracked floor, a carved door and the epic fight). One floor of seven rows of rooms drawn from the entrance at the bottom to the floor boss at the top, three lanes wide, with a round button for every room (crossed blades, a horned skull, a "?", a chest, a campfire, a crown; foes tinted by their element). Rooms the run can reach glow, the one it stands in is outlined, visited ones are filled and the path taken is gold; rooms no path leads to any more are greyed out, with their paths. A room the run has been through opens its outcome (the foe HP and loot of a fight, the pick in a mystery room, the choice at the camp). Tapping a room opens a drawer with what is there, and Go when the run can go to it (DungeonNodeDrawer). A green triangle under each entrance room shows where a run starts (before the first move). From depth 8 the floor boss wears a small down-arrow badge (beating it lets the player descend), and so does a floor boss on a cracked floor; the red cross marks the room where a run was lost. Shown on the pre-run card (no run), during a run and on the results.',
  controls: {
    stage: { kind: 'select', options: STAGE_LABELS },
    open: { kind: 'select', options: NODE_IDS },
    withGo: { kind: 'toggle' },
    busy: { kind: 'toggle' },
    landmark: { kind: 'toggle' },
    depth: { kind: 'number', min: 1, max: 60 },
  },
  defaults: {
    stage: 'midway',
    open: NONE,
    withGo: true,
    busy: false,
    landmark: false,
    depth: 5,
  },
  presets: [
    {
      name: 'Before the run (preview, no Go): a green start triangle under each entrance room',
      props: { stage: 'preview', withGo: false },
    },
    {
      name: 'At the entrance (start triangles until the first move)',
      props: { stage: 'entrance' },
    },
    { name: 'Mid-run, before the camp', props: { stage: 'midway' } },
    { name: 'At the camp (pending)', props: { stage: 'camp' } },
    { name: 'After an elite', props: { stage: 'after-elite' } },
    { name: 'Past the camp', props: { stage: 'past-camp' } },
    { name: 'Finished (cleared)', props: { stage: 'finished' } },
    {
      name: 'Defeated (the route: a red cross on the room that was lost)',
      props: { stage: 'defeated', withGo: false },
    },
    { name: 'Rooms out of reach greyed (mid-run)', props: { stage: 'midway' } },
    { name: 'Drawer: a reachable fight', props: { stage: 'midway', open: 'f2l1' } },
    { name: 'Drawer: an elite', props: { stage: 'after-elite', open: 'f2l0' } },
    { name: 'Drawer: a mystery room', props: { stage: 'entrance', open: 'f1l1' } },
    { name: 'Drawer: the floor boss', props: { stage: 'past-camp', open: 'f6l1', landmark: true } },
    { name: 'Drawer: the camp', props: { stage: 'midway', open: 'f3l1' } },
    {
      name: 'Drawer: a fight the run won (HP 0, Cleared, loot, supply)',
      props: { stage: 'midway', open: 'f0l1' },
    },
    {
      name: 'Drawer: a fight the run lost (Defeat, HP left)',
      props: { stage: 'defeated', open: 'f2l1', withGo: false },
    },
    {
      name: 'Drawer: a mystery room the run went through',
      props: { stage: 'detour-mystery', open: 'f1l1' },
    },
    { name: 'Drawer: a cache the run opened', props: { stage: 'detour-cache', open: 'f2l2' } },
    {
      name: 'Drawer: the camp, what was done',
      props: { stage: 'detour-mystery', open: 'f3l1' },
    },
    {
      name: 'Drawer: the camp, its choice still waiting',
      props: { stage: 'camp', open: 'f3l1' },
    },
    { name: 'Drawer: a room out of reach', props: { stage: 'midway', open: 'f2l0' } },
    {
      name: 'Undercroft: no band above the boss, the boss wears the way-down arrow (depth 14)',
      props: { stage: 'uc-locked', depth: 14 },
    },
    {
      name: 'The way down: a down arrow on the floor boss from depth 8 (preview)',
      props: { stage: 'preview', withGo: false, depth: 8 },
    },
    {
      name: 'No arrow on the floor boss below depth 8 (preview)',
      props: { stage: 'preview', withGo: false, depth: 7 },
    },
    {
      name: 'Drawer: the floor boss at depth 8 (beat it to descend)',
      props: { stage: 'preview', withGo: false, depth: 8, open: 'f6l1' },
    },
    {
      name: 'Drawer: the floor boss below depth 8 (no descent line)',
      props: { stage: 'preview', withGo: false, depth: 7, open: 'f6l1' },
    },
    { name: 'Undercroft: a carved door ahead', props: { stage: 'uc-door-ahead' } },
    {
      name: 'Drawer: a carved door',
      props: { stage: 'uc-door-ahead', open: 'f5l1' },
    },
    {
      name: 'Drawer: a carved door the run walked through',
      props: { stage: 'uc-door-walked', open: 'f5l1', withGo: false },
    },
    {
      name: 'Drawer: a quiet room (a door below depth 8, looks like a mystery)',
      props: { stage: 'uc-quiet-room', open: 'f5l1' },
    },
    { name: 'Undercroft: just went down (its entrance floor)', props: { stage: 'uc-entrance' } },
    { name: 'Undercroft: midway', props: { stage: 'uc-midway' } },
    { name: 'Undercroft: an epic fight ahead', props: { stage: 'uc-epic' } },
    { name: 'Drawer: an epic fight', props: { stage: 'uc-epic', open: 'u1f2l1' } },
    { name: 'Undercroft: the floor boss is next', props: { stage: 'uc-keeper' } },
    { name: 'Drawer: the Undercroft floor boss', props: { stage: 'uc-keeper', open: 'u1f3l1' } },
    {
      name: 'Undercroft: a cracked floor under the floor boss (crack and down-arrow badges)',
      props: { stage: 'uc-cracked', depth: 14 },
    },
    {
      name: 'Drawer: a floor boss on a cracked floor',
      props: { stage: 'uc-cracked', open: 'u1f3l1' },
    },
    {
      name: 'Undercroft: a second floor below a cracked floor',
      props: { stage: 'uc-cracked-deeper' },
    },
    { name: 'Undercroft: the route of a cleared run', props: { stage: 'uc-done', withGo: false } },
    {
      name: 'Drawer: the floor boss that opened the way down',
      props: { stage: 'uc-done', open: 'f6l1', withGo: false },
    },
  ],
  render: (p) => <Demo p={p} />,
};

export const dungeonMapEntries: readonly Entry[] = [dungeonMap, depthProgress];
