import { useEffect, useMemo, useState } from 'preact/hooks';
import { CaveCanvas } from '../../cave-canvas/CaveCanvas';
import { CaveLoading } from '../../cave-canvas/CaveScene';
import type { CaveView } from '../../cave-canvas/hold';
import { CAVE_STATES, caveSample, type CaveState } from '../cave-canvas-sample';
import { str } from '../props';
import type { Entry, Props } from '../types';

const stateOf = (p: Props): CaveState =>
  CAVE_STATES.find((s) => s === str(p, 'state')) ?? 'before a run';

/** The Cave on fixture data: a stand-in for the server, so a fight plays out, the held state then shows, and Enter and a room's Go move on. */
function CaveDemo({ p }: { p: Props }) {
  if (str(p, 'state') === 'loading') {
    return (
      <div class="wb-cave-canvas">
        <div class="vy-page">
          <div>
            <CaveLoading />
          </div>
        </div>
      </div>
    );
  }
  const state = stateOf(p);
  const sample = useMemo(() => caveSample(state), [state]);
  const [view, setView] = useState<CaveView>(sample.view);
  useEffect(() => {
    setView(sample.view);
  }, [sample]);
  return (
    <div class="wb-cave-canvas">
      <div class="vy-page">
        <div>
          <CaveCanvas
            key={`${state}-${String(p['drawers'])}`}
            today={sample.today}
            offset={0}
            view={view}
            creatures={sample.creatures}
            busy={false}
            error={null}
            bait={120}
            treatsOff={false}
            draft={sample.draft}
            onDraftChange={() => undefined}
            onEnter={() => undefined}
            onAct={() => undefined}
            onFightDone={() => {
              // What the page does when the fight has played: the run shows its new state.
              if (view.kind === 'fight') setView({ kind: 'run', state: view.after });
            }}
            onPlaybackDone={() => undefined}
            onWatch={() => undefined}
            onRetry={() => undefined}
            onSeeLast={() => undefined}
            configure={sample.configure}
            trayInput={{ trips: [], jobs: null, now: 1_700_000_000_000 }}
            start={p['drawers'] === 'closed' ? { closed: true } : sample.start}
          />
        </div>
      </div>
    </div>
  );
}

const caveCanvas: Entry = {
  name: 'CaveCanvas',
  file: 'apps/activity/src/cave-canvas/CaveCanvas.tsx',
  group: 'Creatures & game pieces',
  description:
    "The daily dungeon (the valley's Cave) as a place, behind the valley and combat v2: today's map is the scene, every room a button with a name plate, the run so far lit and the team standing on its room. Before a run the team stands at the cave mouth with an Enter plate and your creatures sit in a one-row tray under the scene (drag one onto the mouth to add it, onto a place that is taken to swap, onto the tray to take it off). A now line is the scene's caption; plates open the left drawer (Pack, Route, Log during a fight); a tap on a room, the mouth, a creature, a mystery room, the camp, the way down or the result opens the right drawer. A room's fight takes the scene over and nothing of its answer shows until it has played. The Undercroft stands below the floor boss in a darker band, dragged up and down when the map is taller than the scene. `state` picks the moment (`loading`: the rock and now line before today has loaded).",
  covers: [],
  controls: {
    state: { kind: 'select', options: [...CAVE_STATES, 'loading'] },
    drawers: { kind: 'select', options: ['as the state opens them', 'closed'] },
  },
  defaults: { state: 'before a run', drawers: 'as the state opens them' },
  presets: [...CAVE_STATES, 'loading' as const].map((s) => ({ name: s, props: { state: s } })),
  render: (p) => <CaveDemo p={p} />,
};

export const caveCanvasEntries: readonly Entry[] = [caveCanvas];
