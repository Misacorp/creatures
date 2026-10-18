import { DungeonMap } from '../../DungeonMap';
import { lockedBandShown } from '../../dungeon-flow';
import { SAMPLE_MAP, SAMPLE_STAGES, sampleState } from '../../dungeon-map-sample';
import { UNDERCROFT_STAGES, undercroftState } from '../../dungeon-undercroft-sample';
import { bool, str } from '../props';
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
        lockedBand={run === null ? bool(p, 'lockedBand') : lockedBandShown(run)}
        state={state}
        landmark={bool(p, 'landmark')}
        busy={bool(p, 'busy')}
        {...(open === NONE ? {} : { initialOpen: open })}
        {...(bool(p, 'withGo') ? { onGo: () => undefined } : {})}
      />
    </div>
  );
}

const dungeonMap: Entry = {
  name: 'DungeonMap',
  file: 'apps/activity/src/DungeonMap.tsx',
  group: 'Creatures & game pieces',
  description:
    'The daily dungeon map (the Undercroft stages are the captured runs: the levels it drew stand above the boss in a darker band with their labels, with a pale crown for the keeper, a crack on a cracked floor, a carved door and the epic fight). Seven floors drawn from the entrance at the bottom to the room boss at the top, three lanes wide, with a round button for every room (crossed blades, a horned skull, a "?", a chest, a campfire, a crown; foes tinted by their element). Rooms the run can reach glow, the one it stands in is outlined, visited ones are filled and the path taken is gold; rooms no path leads to any more are greyed out, with their paths. A room the run has been through opens its outcome (the foe HP and loot of a fight, the pick in a mystery room, the choice at the camp). Tapping a room opens a drawer with what is there, and Go when the run can go to it (DungeonNodeDrawer). Shown on the pre-run card (no run) and during a run.',
  controls: {
    stage: { kind: 'select', options: STAGE_LABELS },
    open: { kind: 'select', options: NODE_IDS },
    withGo: { kind: 'toggle' },
    busy: { kind: 'toggle' },
    landmark: { kind: 'toggle' },
    lockedBand: { kind: 'toggle' },
  },
  defaults: {
    stage: 'midway',
    open: NONE,
    withGo: true,
    busy: false,
    landmark: false,
    lockedBand: false,
  },
  presets: [
    { name: 'Before the run (preview, no Go)', props: { stage: 'preview', withGo: false } },
    { name: 'At the entrance', props: { stage: 'entrance' } },
    { name: 'Mid-run, before the camp', props: { stage: 'midway' } },
    { name: 'At the camp (pending)', props: { stage: 'camp' } },
    { name: 'After an elite', props: { stage: 'after-elite' } },
    { name: 'Past the camp', props: { stage: 'past-camp' } },
    { name: 'Finished (cleared)', props: { stage: 'finished' } },
    { name: 'Defeated (the route, a lost last fight)', props: { stage: 'defeated' } },
    { name: 'Rooms out of reach greyed (mid-run)', props: { stage: 'midway' } },
    { name: 'Drawer: a reachable fight', props: { stage: 'midway', open: 'f2l1' } },
    { name: 'Drawer: an elite', props: { stage: 'after-elite', open: 'f2l0' } },
    { name: 'Drawer: a mystery room', props: { stage: 'entrance', open: 'f1l1' } },
    { name: 'Drawer: the room boss', props: { stage: 'past-camp', open: 'f6l1', landmark: true } },
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
      name: 'Undercroft: the quiet band above the boss (open to the player, not entered)',
      props: { stage: 'uc-locked' },
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
    { name: 'Undercroft: the keeper is next', props: { stage: 'uc-keeper' } },
    { name: 'Drawer: the keeper', props: { stage: 'uc-keeper', open: 'u1f3l1' } },
    { name: 'Undercroft: a cracked floor under the keeper', props: { stage: 'uc-cracked' } },
    {
      name: 'Drawer: a cracked keeper',
      props: { stage: 'uc-cracked', open: 'u1f3l1' },
    },
    {
      name: 'Undercroft: a second level below a cracked floor',
      props: { stage: 'uc-cracked-deeper' },
    },
    { name: 'Undercroft: the route of a cleared run', props: { stage: 'uc-done', withGo: false } },
    {
      name: 'Drawer: the room boss that opened the way down',
      props: { stage: 'uc-done', open: 'f6l1', withGo: false },
    },
  ],
  render: (p) => <Demo p={p} />,
};

export const dungeonMapEntries: readonly Entry[] = [dungeonMap];
