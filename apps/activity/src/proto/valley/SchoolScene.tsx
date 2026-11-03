/**
 * The School, full screen (prototype): the schoolhouse, and in its yard the creatures on a Bronze trial (the
 * honour: a ribbon and a title, never a gate). Each stands with its pips (one per box: a dungeon clear, a day at
 * a post, a find or smithing, a moment at the bonfire), ticked as they are done; a tap opens its checklist.
 * Graduation is the day's ceremony and happens whether or not you are there, and each time of day looks
 * different: before it, a creature with every box ticked sparkles in the yard; during it (`&ceremony=live`) the
 * bell rings and those creatures stand gathered at the door while the ribbon is pinned on; after it (the
 * default at the sample's clock) the graduates are back in the yard wearing their ribbons. The pinned button
 * follows the state: "See the graduation" at the ceremony, a calm line otherwise, "Learn a talent" (a stub: it
 * needs combat v2's talents) only when nothing else is going on. Stories that wait here show as the place's strip.
 */
import { useMemo, useState } from 'preact/hooks';
import { usePrefersReducedMotion } from '../../hooks';
import { baseOption } from '../../roster-picker';
import { CreatureList } from '../../ui/CreatureList';
import { Drawer } from '../../ui/Drawer';
import { PipRow } from '../../ui/PipRow';
import { weekClock } from './valley-logic';
import { sampleName } from './bonfire-sample';
import {
  glowLayout,
  glowScale,
  glowNameOf,
  glowSceneDraw,
  type PlaceSceneProps,
} from './glow-scene-art';
import { At, CreatureSprite, Glyph, Pic, Plate, isStill } from './parts';
import { PinnedAct } from './PinnedAct';
import { Stub } from './PeekScenes';
import { SceneFrame } from './SceneFrame';
import {
  BRONZE_BOXES,
  ceremonyParam,
  ceremonyPhase,
  honourTitle,
  pupilState,
  readyCount,
  schoolNote,
  tickedCount,
  type PupilState,
} from './school-logic';
import { BELL_RING, BRONZE_RIBBON, pupilsOf } from './school-sample';
import { DEFAULT_LOOK } from './valley-places';
import './school.css';

/** Scene pixels between two pupils standing in a row, and between two gathered at the door. */
const PUPIL_GAP = 30;
const DOOR_GAP = 28;
const SPRITE = 16;

const stateWord = (state: PupilState): string =>
  state === 'graduated'
    ? 'graduated'
    : state === 'pinning'
      ? 'graduating now'
      : state === 'ready'
        ? 'ready to graduate'
        : 'working on it';

export function SchoolScene({ world, onLeave, waiting, look = DEFAULT_LOOK }: PlaceSceneProps) {
  const reduced = usePrefersReducedMotion();
  const still = isStill() || reduced;
  const [stub, setStub] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [gradOpen, setGradOpen] = useState(false);
  const name = glowNameOf('school');
  const draw = useMemo(() => glowSceneDraw({ name, time: look.time }), [name, look.time]);

  const phase = ceremonyPhase(
    weekClock(world.now, world.timezone),
    typeof window === 'undefined' ? null : ceremonyParam(window.location.hash),
  );
  const pupils = pupilsOf(world.creatures);
  const nameOf = (id: string): string => {
    const at = world.creatures.findIndex((c) => c.id === id);
    const c = world.creatures[at];
    return c === undefined ? '' : sampleName(c, at);
  };
  const opened = pupils.find((p) => p.creature.id === open);
  const openedState = opened === undefined ? null : pupilState(opened.trial, phase);
  const stateOf = (i: number): PupilState => {
    const p = pupils[i];
    return p === undefined ? 'working' : pupilState(p.trial, phase);
  };
  const live = phase === 'live';
  // At the ceremony the creatures graduating stand gathered at the door; everyone else stays in the yard.
  const gathered = pupils.filter((_, i) => live && stateOf(i) === 'pinning');
  const yard = pupils.filter((_, i) => !(live && stateOf(i) === 'pinning'));
  const graduates = pupils.filter((_, i) => stateOf(i) === 'pinning' || stateOf(i) === 'graduated');
  const note = schoolNote(phase, readyCount(pupils.map((p) => p.trial)), pupils.length);

  const pupilButton = (
    p: (typeof pupils)[number],
    x: number,
    y: number,
    scale: number,
    flip: boolean,
  ) => {
    const state = pupilState(p.trial, phase);
    const wears = state === 'graduated' || state === 'pinning';
    const title = wears ? honourTitle(nameOf(p.creature.id)) : nameOf(p.creature.id);
    return (
      <At key={p.creature.id} x={x} y={y} class="sc-pupil-at" hidden={false}>
        <button
          type="button"
          class="sc-pupil"
          aria-label={`${title}, ${stateWord(state)}, ${String(tickedCount(p.trial))} / ${String(BRONZE_BOXES.length)} boxes ticked`}
          onClick={() => {
            setOpen(p.creature.id);
          }}
        >
          <span class="sc-figure">
            {(state === 'ready' || state === 'pinning') && (
              <span class={still ? 'sc-spark' : 'sc-spark pv-bounce'}>
                <Glyph id="sparkle" scale={2} />
              </span>
            )}
            <CreatureSprite creature={p.creature} scale={scale} flip={flip} />
            {wears && (
              <span class={state === 'pinning' && !still ? 'sc-ribbon pin' : 'sc-ribbon'}>
                <Pic sprite={BRONZE_RIBBON} scale={scale} />
              </span>
            )}
          </span>
          {!wears && <PipRow count={BRONZE_BOXES.length} lit={tickedCount(p.trial)} size="md" />}
          <Plate>{nameOf(p.creature.id)}</Plate>
        </button>
      </At>
    );
  };

  return (
    <>
      <SceneFrame
        id="school"
        label="School, talents"
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        scaleFor={(w, h) => glowScale(w, h, name)}
        act={
          note.action === null ? (
            <PinnedAct calm={note.line} />
          ) : (
            <PinnedAct
              label={note.action}
              onClick={() => {
                if (live) setGradOpen(true);
                else
                  setStub(
                    "the School: a creature's talent lessons. It waits for combat v2's talents and Talent Books",
                  );
              }}
            />
          )
        }
      >
        {(g) => {
          const layout = glowLayout(g, name);
          // The pupils stand as wide apart as the screen lets them (at the biggest pixel a phone is only 72 wide).
          const gap = Math.min(
            PUPIL_GAP,
            Math.floor((g.W - SPRITE - 4) / Math.max(1, yard.length - 1)),
          );
          const door = layout.spots['door'] ?? { x: g.cx, y: layout.below - 8 };
          const bell = layout.at(30, 6);
          return (
            <>
              {live && (
                <>
                  <At x={g.X(bell.x - 8)} y={g.Y(bell.y)} class={still ? undefined : 'sc-ring'}>
                    <Pic sprite={BELL_RING} scale={g.s} class="pv-flip" />
                  </At>
                  <At x={g.X(bell.x + 6)} y={g.Y(bell.y)} class={still ? undefined : 'sc-ring'}>
                    <Pic sprite={BELL_RING} scale={g.s} />
                  </At>
                </>
              )}
              {gathered.map((p, k) =>
                pupilButton(
                  p,
                  g.X(door.x + (k - (gathered.length - 1) / 2) * DOOR_GAP - SPRITE / 2),
                  g.Y(layout.below - SPRITE + 2),
                  g.s,
                  k % 2 === 1,
                ),
              )}
              {yard.map((p, k) =>
                pupilButton(
                  p,
                  g.X(g.cx + (k - (yard.length - 1) / 2) * gap - SPRITE / 2),
                  g.Y(layout.below + (gathered.length > 0 ? 8 : 3)),
                  g.s,
                  k % 2 === 1,
                ),
              )}
            </>
          );
        }}
      </SceneFrame>
      <Drawer
        open={opened !== undefined}
        onClose={() => {
          setOpen(null);
        }}
        title={
          opened === undefined
            ? 'Bronze trial'
            : openedState === 'graduated' || openedState === 'pinning'
              ? honourTitle(nameOf(opened.creature.id))
              : `${nameOf(opened.creature.id)}, Bronze trial`
        }
        meta={
          opened === undefined
            ? undefined
            : `${String(tickedCount(opened.trial))} / ${String(BRONZE_BOXES.length)}`
        }
      >
        {opened !== undefined && (
          <ul class="sc-boxes" aria-label="Bronze trial boxes">
            {BRONZE_BOXES.map((box) => {
              const done = opened.trial.ticked.includes(box.id);
              return (
                <li key={box.id} class={done ? 'sc-box done' : 'sc-box'}>
                  <Glyph id={box.glyph} scale={3} />
                  <span class="sc-box-label">{box.label}</span>
                  <span
                    class={done ? 'sc-tick done' : 'sc-tick'}
                    role="img"
                    aria-label={done ? 'Ticked' : 'Not yet'}
                  >
                    {done && <Glyph id="check" scale={2} />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Drawer>
      <Drawer
        open={gradOpen}
        onClose={() => {
          setGradOpen(false);
        }}
        title="Graduating today"
      >
        <CreatureList
          options={graduates.map((p) => ({
            ...baseOption(p.creature),
            name: honourTitle(nameOf(p.creature.id)),
          }))}
          selection={{ mode: 'show', label: 'Graduates' }}
          class="flat"
        />
      </Drawer>
      <Stub
        what={stub}
        onClose={() => {
          setStub(null);
        }}
      />
    </>
  );
}
