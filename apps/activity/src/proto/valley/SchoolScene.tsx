/**
 * The School, full screen (prototype): the schoolhouse under its poster, and in its yard the creatures on a
 * Bronze trial (the honour: a ribbon and a title, never a gate). Each stands with its pips (one per box:
 * a dungeon clear, a day at a post, a find or smithing, a moment at the bonfire), ticked as they are done; a tap
 * opens its checklist. Graduation is the day's ceremony and happens whether or not you are there: before it, a
 * creature with every box ticked sparkles ("ready"); during it (`&ceremony=live`) the ribbon is pinned on; after
 * it (the default at the sample's clock) the graduate stands wearing its ribbon, titled "Pip, Bronze". Learning
 * a talent is a stub drawer: it needs combat v2's talents. Stories that wait here (a graduation, a teacher's
 * visit) show as the place's slim strip above it.
 */
import { useMemo, useState } from 'preact/hooks';
import { usePrefersReducedMotion } from '../../hooks';
import { ActionButton } from '../../ui/ActionButton';
import { Drawer } from '../../ui/Drawer';
import { PipRow } from '../../ui/PipRow';
import { weekClock } from './valley-logic';
import { sampleName } from './bonfire-sample';
import './school.css';
import { glowNameOf, glowSceneDraw, glowSceneSpots, type PlaceSceneProps } from './glow-scene-art';
import { At, CreatureSprite, Glyph, Pic, Plate, isStill } from './parts';
import { Stub } from './PeekScenes';
import { SceneFrame } from './SceneFrame';
import {
  BRONZE_BOXES,
  ceremonyParam,
  ceremonyPhase,
  honourTitle,
  pupilState,
  tickedCount,
  type PupilState,
} from './school-logic';
import { BRONZE_RIBBON, pupilsOf } from './school-sample';
import { DEFAULT_LOOK } from './valley-places';

/** Scene pixels between two pupils standing in a row. */
const PUPIL_GAP = 30;

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

  return (
    <>
      <SceneFrame
        id="school"
        label="School, talents"
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        act={
          <ActionButton
            label="Learn a talent"
            wide
            large
            onClick={() => {
              setStub(
                "the School: a creature's talent lessons. It waits for combat v2's talents and Talent Books",
              );
            }}
          />
        }
      >
        {(g) => {
          const spot = glowSceneSpots(g, name);
          const n = pupils.length;
          return (
            <>
              {pupils.map(({ creature, trial }, i) => {
                const state = pupilState(trial, phase);
                const x = g.cx + (i - (n - 1) / 2) * PUPIL_GAP - 8;
                const wears = state === 'graduated' || state === 'pinning';
                const title = wears ? honourTitle(nameOf(creature.id)) : nameOf(creature.id);
                return (
                  <At
                    key={creature.id}
                    x={g.X(x)}
                    y={g.Y(spot.below + 3)}
                    class="sc-pupil-at"
                    hidden={false}
                  >
                    <button
                      type="button"
                      class="sc-pupil"
                      aria-label={`${title}, ${stateWord(state)}, ${String(tickedCount(trial))} / ${String(BRONZE_BOXES.length)} boxes ticked`}
                      onClick={() => {
                        setOpen(creature.id);
                      }}
                    >
                      <span class="sc-figure">
                        {(state === 'ready' || state === 'pinning') && (
                          <span class={still ? 'sc-spark' : 'sc-spark pv-bounce'}>
                            <Glyph id="sparkle" scale={2} />
                          </span>
                        )}
                        <CreatureSprite creature={creature} scale={g.s} flip={i % 2 === 1} />
                        {wears && (
                          <span
                            class={state === 'pinning' && !still ? 'sc-ribbon pin' : 'sc-ribbon'}
                          >
                            <Pic sprite={BRONZE_RIBBON} scale={g.s} />
                          </span>
                        )}
                      </span>
                      {wears ? (
                        <Plate>
                          <span>{nameOf(creature.id)}</span>
                          <span class="sc-honour">Bronze</span>
                        </Plate>
                      ) : (
                        <>
                          <PipRow count={BRONZE_BOXES.length} lit={tickedCount(trial)} size="md" />
                          <Plate>{nameOf(creature.id)}</Plate>
                        </>
                      )}
                    </button>
                  </At>
                );
              })}
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
                  <PipRow
                    count={1}
                    lit={done ? 1 : 0}
                    size="md"
                    label={done ? 'Ticked' : 'Not yet'}
                  />
                </li>
              );
            })}
          </ul>
        )}
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
