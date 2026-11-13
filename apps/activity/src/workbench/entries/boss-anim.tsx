import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BossAnimFrame } from '../../boss-anim/BossAnimLayer';
import { BOSS_LOOKS } from '../../boss-anim/looks';
import { FORM_OF, SHAPES, planOf } from '../../boss-anim/plan';
import { parseCells, sampleCells } from '../../boss-anim/sample-cells';
import {
  BOSS_MOVE_MS,
  PHASES,
  phaseShot,
  phaseSpans,
  type PhaseId,
} from '../../boss-anim/timeline';
import { foldSetupOf, stageModelOf } from '../../fight-v2';
import { StageV2 } from '../../StageV2';
import { ToggleButton } from '../../ui/ToggleButton';
import type { PlaybackV2 } from '../../use-playback-v2';
import { bool, num, str } from '../props';
import { replaySample } from '../fight-v2-sample';
import type { Entry, Props } from '../types';

const LOOKS = ['generic', ...Object.keys(BOSS_LOOKS)] as const;
const ELEMENTS = ['tide', 'ember', 'grove', 'spark'] as const;
const AT = ['custom time', ...PHASES.map((p) => p.id)] as const;
const SPEEDS = ['0.25', '0.5', '1', '2'] as const;

/** One step of the frame buttons: a frame of a 30 frames a second animation. */
const FRAME_MS = 33;

/** The storm boss's moves (the sample fight is against the Storm Sovereign): each is a preset below. */
const STORM_MOVES = [
  ['Lightning Bolt', 'lightning-bolt', 'columns'],
  ['Thunderclap', 'thunderclap', 'line3'],
  ['Static Strike', 'static-strike', 'line3'],
  ['Forked Lightning', 'forked-lightning', 'scatter'],
  ['Judgement Bolt', 'judgement-bolt', 'single'],
  ['Storm Front', 'storm-front', 'all'],
  ['Thunderbolt', 'thunderbolt', 'single'],
  ['Plain attack', 'plain', 'chain'],
] as const;

function BossAnimPage({ p }: { p: Props }) {
  const shape = SHAPES.find((s) => s === str(p, 'shape')) ?? 'column';
  const look = str(p, 'look');
  const at = str(p, 'at');
  const replay = useMemo(() => replaySample({ slot: 3, players: 4, stage: 1, seed: 'fold' }), []);
  const model = useMemo(
    () =>
      stageModelOf(
        foldSetupOf({
          fighters: replay.fighters,
          card: replay.card,
          bossHpStart: replay.bossHpStart,
        }),
        replay.events,
      ),
    [replay],
  );
  const grid = useMemo(
    () => ({
      rows: replay.boss.rows,
      cols: Math.max(replay.boss.cols, ...replay.fighters.map((f) => f.col + 1)),
    }),
    [replay],
  );
  const cells = useMemo(
    () => parseCells(str(p, 'cells'), grid) ?? sampleCells(shape, grid),
    [str(p, 'cells'), shape, grid],
  );
  const plan = useMemo(
    () => planOf({ moveId: str(p, 'moveId'), shape, cells }, grid),
    [shape, cells, grid, str(p, 'moveId')],
  );

  const total = BOSS_MOVE_MS;
  const startAt = at === 'custom time' ? num(p, 'time') : phaseShot(total, at as PhaseId);
  const [t, setT] = useState(startAt);
  const [playing, setPlaying] = useState(bool(p, 'play'));
  const [speed, setSpeed] = useState(str(p, 'speed'));
  const last = useRef(0);
  // A change of the page's props (a preset, a link) starts over from what they say.
  useEffect(() => {
    setT(startAt);
    setPlaying(bool(p, 'play'));
    setSpeed(str(p, 'speed'));
  }, [startAt, bool(p, 'play'), str(p, 'speed'), shape, str(p, 'moveId'), look, str(p, 'cells')]);
  useEffect(() => {
    if (!playing) return undefined;
    last.current = performance.now();
    let frame = 0;
    const tick = (): void => {
      const now = performance.now();
      const dt = (now - last.current) * Number(speed);
      last.current = now;
      setT((was) => (was + dt > total + 400 ? 0 : was + dt));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [playing, speed]);

  const playback: PlaybackV2 = {
    beat: 0,
    total: model.beats.length,
    finished: false,
    playing: false,
    setPlaying: () => undefined,
    move: () => undefined,
    show: null,
    fx: [],
    intro: null,
  };
  const spans = phaseSpans(total);
  const now = spans.find((s) => t < s.end) ?? spans[spans.length - 1];
  const clamped = Math.round(Math.min(total, Math.max(0, t)));
  return (
    <div class="wb-held">
      <StageV2
        boss={replay.boss}
        card={replay.card}
        fighters={replay.fighters}
        names={replay.names}
        you={replay.you}
        model={model}
        playback={playback}
        place="Boss animation"
        hpMax={replay.bossHpMax}
        rounds={replay.boss.rounds}
        overlay={
          <BossAnimFrame
            plan={plan}
            bossId={look === 'generic' ? null : look}
            element={str(p, 'element')}
            totalMs={total}
            t={clamped}
            grid={grid}
          />
        }
      />
      <div class="controls button-row" role="group" aria-label="Animation controls">
        <button
          type="button"
          class="primary"
          onClick={() => {
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setT(Math.max(0, clamped - FRAME_MS));
          }}
        >
          Back a frame
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setT(Math.min(total, clamped + FRAME_MS));
          }}
        >
          Forward a frame
        </button>
        {SPEEDS.map((s) => (
          <ToggleButton
            key={s}
            pressed={speed === s}
            onToggle={() => {
              setSpeed(s);
            }}
          >
            {`${s}×`}
          </ToggleButton>
        ))}
      </div>
      <p class="wb-note">
        {`${shape} (${FORM_OF[shape]}) · ${look} · ${String(clamped)} / ${String(total)} ms · ${now?.id ?? ''}`}
      </p>
    </div>
  );
}

const SHAPE_PRESETS = SHAPES.map((shape) => ({
  name: `Generic ${shape}`,
  props: { look: 'generic', shape, moveId: '', cells: 'auto', at: 'aim' },
}));

const bossAnimation: Entry = {
  name: 'BossAnimation',
  file: 'apps/activity/src/boss-anim/BossAnimLayer.tsx',
  group: 'Creatures & game pieces',
  description:
    "A boss move's animation on the real fight stage (the Storm Sovereign's board), for trying a move shape with any boss look and any target cells. A move is five phases (the weapon appears in the boss's hand, a down-pointing marker shows the cells it will hit, the weapon leaves the screen upwards, it comes through the marked cells, a burst where it landed); the motion belongs to the shape and the look only chooses the art. The `look` control picks a boss's own art or the generic art in the `element`'s colours; `moveId` names a move so the look's art for that move applies; `cells` is `auto` (a typical hit of the shape) or a list of `row:col` (from 0) such as `0:1 1:1 2:1`. Play with the speed buttons, step a frame at a time, or hold a phase with `at` (or `custom time`). Where it plays in the game: the raid stages' replays and the live finale (`boss-anim/`); how to give a boss its own look: `docs/design/boss-animations.md`.",
  controls: {
    look: { kind: 'select', options: LOOKS },
    element: { kind: 'select', options: ELEMENTS },
    shape: { kind: 'select', options: SHAPES },
    moveId: { kind: 'text', maxLength: 40 },
    cells: { kind: 'text', maxLength: 80 },
    at: { kind: 'select', options: AT },
    time: { kind: 'number', min: 0, max: BOSS_MOVE_MS, step: 1 },
    play: { kind: 'toggle' },
    speed: { kind: 'select', options: SPEEDS },
  },
  defaults: {
    look: 'storm-sovereign',
    element: 'spark',
    shape: 'columns',
    moveId: 'lightning-bolt',
    cells: 'auto',
    at: 'aim',
    time: 0,
    play: false,
    speed: '1',
  },
  presets: [
    ...STORM_MOVES.map(([name, moveId, shape]) => ({
      name: `Storm Sovereign: ${name}`,
      props: { look: 'storm-sovereign', shape, moveId, cells: 'auto', at: 'aim' },
    })),
    { name: 'Playing: Lightning Bolt', props: { play: true, at: 'custom time', time: 0 } },
    ...SHAPE_PRESETS,
    {
      name: 'Generic lance in the Tide colours',
      props: { look: 'generic', element: 'tide', shape: 'columns', moveId: '', at: 'aim' },
    },
  ],
  render: (p) => <BossAnimPage p={p} />,
};

export const bossAnimEntries: readonly Entry[] = [bossAnimation];
