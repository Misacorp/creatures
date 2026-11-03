/**
 * The School, full screen (prototype): the schoolhouse, and in its yard the creatures on a Bronze trial (the
 * honour: a ribbon and a title, never a gate). Each stands with its pips (one per box: a dungeon clear, a day at
 * a post, a find or smithing, a moment at the bonfire), ticked as they are done; a tap opens its checklist.
 * Graduation is the day's ceremony and happens whether or not you are there, and each time of day looks
 * different: before it, a creature with every box ticked sparkles in the yard; during it (`&ceremony=live`) the
 * bell rings and those creatures stand gathered at the door while the ribbon is pinned on; after it (the
 * default at the sample's clock) the graduates are back in the yard wearing their ribbons. The pinned button
 * follows the state: "See the graduation" at the ceremony, "Send to the teacher" when the week's teacher has a
 * lesson one of yours can take and a seat is free, a calm line otherwise. Stories that wait here show as the place's strip.
 *
 * The visiting teacher (`teacher-logic.ts`, V-SCH-11 to 13): announced over the weekend, at the door Monday to
 * Wednesday, gone after. Its lesson opens in a drawer: the talent, then the faces of your creatures that would
 * learn it, each with one Send; two student seats, a seated student sits on the yard's bench and leaves its post.
 * No banner (round 22): the yard is always there (a bench of four seats, empty seats are room to join); the
 * bell swings the weekend before and the day the teacher arrives; the lectern stands from the weekend to
 * Wednesday, the teacher (in the mortarboard) at it Monday to Wednesday; a student who sits or learned wears
 * the talent's role icon.
 */
import { useMemo, useState } from 'preact/hooks';
import { usePrefersReducedMotion } from '../../hooks';
import { baseOption } from '../../roster-picker';
import { TalentChip } from '../../TalentChip';
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
import { At, CreatureSprite, Glyph, Pic, Plate, isStill, useTick } from './parts';
import { PinnedAct } from './PinnedAct';
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
import {
  bellFrame,
  bellRings,
  bellSprite,
  bellTopLeft,
  lecternSprite,
  lecternStands,
  lecternTopLeft,
  seatOfStudent,
  seatTopLeft,
  teacherSprite,
  teacherTopLeft,
} from './school-yard';
import { getSeats, lessonOf, setSeats, teacherWeekday, type Seats } from './teacher-sample';
import { ROLE_GLYPH, SEATS, TEACHER_DAYS, teacherNote } from './teacher-logic';
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
  const [lessonOpen, setLessonOpen] = useState(false);
  const [seats, setSeatsState] = useState<Seats | null>(getSeats());
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
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const lesson = lessonOf(world, hash, seats);
  const seatedIds = lesson.seated.map((s) => s.creature.id);
  // A seated student has left its place in the yard: it stands at the School's door with the teacher.
  const gathered = pupils.filter((_, i) => live && stateOf(i) === 'pinning');
  const yard = pupils.filter(
    (p, i) => !(live && stateOf(i) === 'pinning') && !seatedIds.includes(p.creature.id),
  );
  const graduates = pupils.filter((_, i) => stateOf(i) === 'pinning' || stateOf(i) === 'graduated');
  const teach = teacherNote(lesson.state);
  const note = schoolNote(phase, readyCount(pupils.map((p) => p.trial)), pupils.length, teach);
  const changeSeats = (ids: readonly string[]): void => {
    const next: Seats = { seated: ids, done: false };
    setSeats(next);
    setSeatsState(next);
  };
  const talent = lesson.talent;
  const roleGlyph = (role: string): string => ROLE_GLYPH[role] ?? 'unknown';
  const weekday = teacherWeekday(world, hash);
  const visit = talent !== null && lecternStands(weekday);
  const ringing = visit && bellRings(weekday);
  const tick = useTick(220, ringing && !still);
  // Held still (reduced motion, screenshots) the ringing bell stands tilted, so the shot shows it rings.
  const frame = ringing && still ? 'left' : bellFrame(tick, ringing);
  const teacherLook = teacherSprite(lesson.teacher.species);
  const teacherRole = talent === null ? null : roleGlyph(talent.roles[0] ?? '');

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
    const learner = lesson.learnerId === p.creature.id && teacherRole !== null;
    return (
      <At key={p.creature.id} x={x} y={y} class="sc-pupil-at" hidden={false}>
        <button
          type="button"
          class="sc-pupil"
          aria-label={`${title}, ${stateWord(state)}, ${String(tickedCount(p.trial))} / ${String(BRONZE_BOXES.length)} boxes ticked${learner ? `, learned ${talent?.name ?? 'a talent'}` : ''}`}
          onClick={() => {
            setOpen(p.creature.id);
          }}
        >
          <span class="sc-figure">
            {learner ? (
              <span class="sc-spark">
                <Glyph id={teacherRole ?? 'sparkle'} scale={2} />
              </span>
            ) : (
              (state === 'ready' || state === 'pinning') && (
                <span class={still ? 'sc-spark' : 'sc-spark pv-bounce'}>
                  <Glyph id="sparkle" scale={2} />
                </span>
              )
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
                if (live && note.action === 'See the graduation') setGradOpen(true);
                else setLessonOpen(true);
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
          const bell = layout.at(32, 6);
          const schoolBottom = layout.at(0, 50).y;
          const bellAt = layout.at(bellTopLeft().x, bellTopLeft().y);
          const lecternAt = layout.at(lecternTopLeft().x, lecternTopLeft().y);
          const teacherAt = layout.at(teacherTopLeft().x, teacherTopLeft().y);
          return (
            <>
              {ringing && (
                <At x={g.X(bellAt.x)} y={g.Y(bellAt.y)}>
                  <Pic sprite={bellSprite(frame, look.time)} scale={g.s} />
                </At>
              )}
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
                  g.Y(schoolBottom - SPRITE + 2),
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
              {talent !== null && visit && (
                <At x={g.X(lecternAt.x)} y={g.Y(lecternAt.y)} class="sc-pupil-at" hidden={false}>
                  <button
                    type="button"
                    class="sc-pupil"
                    aria-label={
                      lesson.state.phase === 'coming'
                        ? `A teacher is coming Monday with ${talent.name}`
                        : `The lectern: the visiting teacher is here with ${talent.name}`
                    }
                    onClick={() => {
                      setLessonOpen(true);
                    }}
                  >
                    <span class="sc-figure">
                      <Pic sprite={lecternSprite(look.time)} scale={g.s} />
                    </span>
                    {lesson.state.phase === 'coming' && <Plate>Monday</Plate>}
                  </button>
                </At>
              )}
              {talent !== null && lesson.state.phase === 'here' && (
                <At x={g.X(teacherAt.x)} y={g.Y(teacherAt.y)} class="sc-pupil-at" hidden={false}>
                  <button
                    type="button"
                    class="sc-pupil"
                    aria-label={`The visiting teacher, here with ${talent.name}`}
                    onClick={() => {
                      setLessonOpen(true);
                    }}
                  >
                    <span class="sc-figure">
                      {teacherLook === null ? (
                        <CreatureSprite
                          creature={{ species: lesson.teacher.species, shiny: false }}
                          scale={g.s}
                          flip
                        />
                      ) : (
                        <Pic sprite={teacherLook} scale={g.s} class="pv-creature pv-flip" />
                      )}
                    </span>
                  </button>
                </At>
              )}
              {lesson.seated.map((s, k) => {
                const top = seatTopLeft(seatOfStudent(k) ?? 0);
                if (top === null) return null;
                const at = layout.at(top.x, top.y);
                return (
                  <At
                    key={s.creature.id}
                    x={g.X(at.x)}
                    y={g.Y(at.y)}
                    class="sc-pupil-at"
                    hidden={false}
                  >
                    <button
                      type="button"
                      class="sc-pupil"
                      aria-label={`${s.name}, seated on the School bench, learns ${talent?.name ?? 'a talent'} by morning`}
                      onClick={() => {
                        setLessonOpen(true);
                      }}
                    >
                      <span class="sc-figure">
                        {teacherRole !== null && (
                          <span class="sc-spark">
                            <Glyph id={teacherRole} scale={2} />
                          </span>
                        )}
                        <CreatureSprite creature={s.creature} scale={g.s} />
                      </span>
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
      <Drawer
        open={lessonOpen}
        onClose={() => {
          setLessonOpen(false);
        }}
        title="Visiting teacher"
        meta={TEACHER_DAYS}
      >
        {talent === null ? (
          <p class="muted">No teacher this week: nothing on the server needs one.</p>
        ) : (
          <>
            <div class="sc-talent">
              <span class="sc-roles" aria-hidden="true">
                {talent.roles.map((role) => (
                  <Glyph key={role} id={roleGlyph(role)} scale={2} />
                ))}
              </span>
              <TalentChip
                talent={{
                  id: talent.id,
                  name: talent.name,
                  golden: false,
                  text: talent.text,
                  about: '',
                  idle: false,
                }}
              />
            </div>
            <p class="muted small">
              {lesson.state.phase === 'gone'
                ? `The teacher from ${lesson.teacher.from} has gone. The next one comes Monday.`
                : lesson.done
                  ? `From ${lesson.teacher.from}, ${TEACHER_DAYS}.`
                  : `From ${lesson.teacher.from}, ${TEACHER_DAYS}. A creature seated before or during the visit learns by morning.`}
            </p>
            {lesson.done ? (
              <p class="sc-result">
                {`${talent.name} is in ${lesson.state.learnedBy ?? 'your'}'s book. Teach it to a creature on its card.`}
              </p>
            ) : lesson.eligible.length === 0 && lesson.seated.length === 0 ? (
              <p class="sc-result">None of yours can learn this one.</p>
            ) : (
              <>
                <CreatureList
                  options={[...lesson.seated, ...lesson.eligible].map((s) => ({
                    ...baseOption(s.creature),
                    name: s.name,
                    ...(seatedIds.includes(s.creature.id) ? { note: 'Learns by morning' } : {}),
                  }))}
                  selection={{ mode: 'show', label: 'Your creatures that would learn' }}
                  chips={false}
                  class="flat"
                  side={(o) =>
                    seatedIds.includes(o.id) ? (
                      <button
                        type="button"
                        class="sc-send"
                        aria-label={`Call ${o.name} back`}
                        onClick={() => {
                          changeSeats(seatedIds.filter((id) => id !== o.id));
                        }}
                      >
                        Call back
                      </button>
                    ) : (
                      <button
                        type="button"
                        class="sc-send primary"
                        disabled={!lesson.state.seatFree}
                        aria-label={`Send ${o.name} to the teacher`}
                        onClick={() => {
                          changeSeats([...seatedIds, o.id].slice(0, SEATS));
                        }}
                      >
                        Send
                      </button>
                    )
                  }
                />
                {!lesson.state.seatFree && (
                  <p class="muted small">Both seats are taken. Call one back to send another.</p>
                )}
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
