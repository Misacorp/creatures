import { useEffect, useMemo, useState } from 'preact/hooks';
import { CaveCanvas } from '../../cave-canvas/CaveCanvas';
import { CaveLoading } from '../../cave-canvas/CaveScene';
import type { CaveView } from '../../cave-canvas/hold';
import { CAVE_STATES, caveSample, type CaveState } from '../cave-canvas-sample';
import { isPartnerLook } from '../../reaction-partners';
import { str } from '../props';
import type { Entry, Props } from '../types';

const TOUCH = ['none', 'a setter', 'a payoff', 'a creature that does both'] as const;

/** The species a preset starts touched (the creature of that species in your list: `withPartnerKits`). */
const TOUCHED_SPECIES: Record<string, string> = {
  'a setter': 'mossback',
  'a payoff': 'pyrelynx',
  'a creature that does both': 'cindle',
};

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
  const touch = str(p, 'touch');
  const touchedSpecies = TOUCHED_SPECIES[touch];
  const partnerLook = str(p, 'partnerLook');
  const sample = useMemo(() => caveSample(state, touchedSpecies !== undefined), [state, touch]);
  const touched = sample.creatures.find((c) => c.species === touchedSpecies)?.id;
  const [view, setView] = useState<CaveView>(sample.view);
  useEffect(() => {
    setView(sample.view);
  }, [sample]);
  return (
    <div class="wb-cave-canvas">
      <div class="vy-page">
        <div>
          <CaveCanvas
            key={`${state}-${String(p['drawers'])}-${touch}-${partnerLook}`}
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
            start={{
              ...(p['drawers'] === 'closed' ? { closed: true as const } : sample.start),
              ...(touched === undefined ? {} : { touch: touched }),
            }}
            {...(isPartnerLook(partnerLook) ? { partnerLook } : {})}
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
    "The daily dungeon (the valley's Cave) as a place, behind the valley and combat v2: today's map is the scene, every room a button with a name plate, the run so far lit and the team standing on its room. Before a run the team stands at the cave mouth with an Enter plate and your creatures sit in a one-row tray under the scene (drag one onto the mouth to add it, onto a place that is taken to swap, onto the tray to take it off). A now line is the scene's caption; plates open the left drawer (Pack, Route, Log during a fight); a tap on a room, the mouth, a creature, a mystery room, the camp, the way down or the result opens the right drawer. A room's fight takes the scene over and nothing of its answer shows until it has played. The Undercroft stands below the floor boss in a darker band, dragged up and down when the map is taller than the scene. `state` picks the moment (`loading`: the rock and now line before today has loaded). Touching a creature (a pointer over it, the keyboard on it, its drawer open) lights its reaction partners on the mouth, the map and the tray: the creatures that can cash a mark it sets, or set a mark it cashes, from their kits alone; `touch` starts with one touched, `partnerLook` is the look (badge is the pick, glow and dim are for the review).",
  covers: [],
  controls: {
    state: { kind: 'select', options: [...CAVE_STATES, 'loading'] },
    drawers: { kind: 'select', options: ['as the state opens them', 'closed'] },
    touch: { kind: 'select', options: TOUCH },
    partnerLook: { kind: 'select', options: ['badge', 'glow', 'dim'] },
  },
  defaults: {
    state: 'before a run',
    drawers: 'as the state opens them',
    touch: 'none',
    partnerLook: 'badge',
  },
  presets: [
    ...[...CAVE_STATES, 'loading' as const].map((s) => ({ name: s, props: { state: s } })),
    ...TOUCH.slice(1).flatMap((touch) =>
      (['badge', 'glow', 'dim'] as const).map((partnerLook) => ({
        name: `Partners: ${touch} touched (${partnerLook}${partnerLook === 'badge' ? ', the pick' : ''})`,
        props: { state: 'before a run', drawers: 'closed', touch, partnerLook },
      })),
    ),
  ],
  render: (p) => <CaveDemo p={p} />,
};

export const caveCanvasEntries: readonly Entry[] = [caveCanvas];
