import { DungeonMap } from '../../DungeonMap';
import { SAMPLE_MAP, SAMPLE_STAGES, sampleState } from '../../dungeon-map-sample';
import { bool, str } from '../props';
import type { Entry, Props } from '../types';

const NONE = 'none';
const STAGE_LABELS = SAMPLE_STAGES.map((s) => s as string);
const NODE_IDS = [NONE, ...SAMPLE_MAP.nodes.map((n) => n.id)];

function Demo({ p }: { p: Props }) {
  const stage = SAMPLE_STAGES.find((s) => s === str(p, 'stage')) ?? 'preview';
  const state = sampleState(stage);
  const open = str(p, 'open');
  return (
    <div class="dungeon-card raid-section">
      <DungeonMap
        // A new map when the stage or the open room changes, so its drawer starts as the page says.
        key={`${stage}-${open}`}
        map={SAMPLE_MAP}
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
    'The daily dungeon map: seven floors drawn from the entrance at the bottom to the room boss at the top, three lanes wide, with a round button for every room (crossed blades, a horned skull, a "?", a chest, a campfire, a crown; foes tinted by their element). Rooms the run can reach glow, the one it stands in is outlined, visited ones are filled and the path taken is gold. Tapping a room opens a drawer with what is there, and Go when the run can go to it (DungeonNodeDrawer). Shown on the pre-run card (no run) and during a run.',
  controls: {
    stage: { kind: 'select', options: STAGE_LABELS },
    open: { kind: 'select', options: NODE_IDS },
    withGo: { kind: 'toggle' },
    busy: { kind: 'toggle' },
    landmark: { kind: 'toggle' },
  },
  defaults: { stage: 'midway', open: NONE, withGo: true, busy: false, landmark: false },
  presets: [
    { name: 'Before the run (preview, no Go)', props: { stage: 'preview', withGo: false } },
    { name: 'At the entrance', props: { stage: 'entrance' } },
    { name: 'Mid-run, before the camp', props: { stage: 'midway' } },
    { name: 'At the camp (pending)', props: { stage: 'camp' } },
    { name: 'After an elite', props: { stage: 'after-elite' } },
    { name: 'Past the camp', props: { stage: 'past-camp' } },
    { name: 'Finished (cleared)', props: { stage: 'finished' } },
    { name: 'Drawer: a reachable fight', props: { stage: 'midway', open: 'f2l1' } },
    { name: 'Drawer: an elite', props: { stage: 'after-elite', open: 'f2l0' } },
    { name: 'Drawer: a mystery room', props: { stage: 'entrance', open: 'f1l1' } },
    { name: 'Drawer: the room boss', props: { stage: 'past-camp', open: 'f6l1', landmark: true } },
    { name: 'Drawer: the camp', props: { stage: 'midway', open: 'f3l1' } },
  ],
  render: (p) => <Demo p={p} />,
};

export const dungeonMapEntries: readonly Entry[] = [dungeonMap];
