/**
 * The School as a canvas (the rule is "A place is a canvas" in `ux-patterns.md`): the schoolyard fills the view and everything is done
 * by clicking something in it. Nothing scrolls. The place opens straight on this scene (no page under it); the HUD's back leaves for the
 * valley.
 *
 * In the scene: the visiting teacher at the lectern (a tap opens the talent and who of the player's would learn it), the bench's two
 * student seats (a seated student is a tap with its plate: that student; an empty seat is a dashed outline: pick who to send), the graduation
 * stage in front of the yard (a tap opens the graduation: who is ready, the next ceremony), and, while the School has a project being built, the builders'
 * corner (`builders-corner.ts`) clearly apart from the yard: its table opens the project board (left drawer), the helper's spot beside it
 * picks who helps build (right drawer). Under the scene stays the creature tray: a hand can carry a creature onto a free seat (or the
 * helper's spot), as at the Forge.
 *
 * What a click opens follows the side rule (`PlaceCanvas`): the right drawer is for the one thing that was clicked (the teacher, a
 * seat, the stage, the helper's spot), the left for the collection that belongs to no one spot (the project board). A phone shows the
 * open panel as its own page. The scene keeps one size and place for the whole visit; drawers lie over its edges. Every action is the
 * game's and the server decides.
 */
import { useMemo, useRef, useState } from 'preact/hooks';
import type { Creature, SchoolState, ValleyVisit } from '../api';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { creatureName } from '../game';
import { busyReason } from '../gear-view';
import { dropOutcome } from '../slot-outcome';
import { DragGhost } from '../ui/DragGhost';
import { useDragDrop } from '../use-drag-drop';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { HelperPanel, type HelperPost } from './BonfirePanels';
import { HonourRibbon, useHonour } from './HonourRibbon';
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel, type Opener } from './PlaceCanvas';
import { PLATES_Z } from './PlaceScene';
import { SceneFrame, sceneGeometry, type SceneGeometry } from './SceneFrame';
import { GraduationPanel, SeatPanel, TeacherPanel } from './SchoolPanels';
import { Tray } from './Tray';
import { At, CreatureSprite, Pic } from './parts';
import {
  CORNER_GROUP,
  FLAG_AT,
  HELPER_AT,
  TABLE_BOX,
  pileMaterial,
  pileSize,
} from './builders-corner';
import { cornerSprite } from './builders-corner-art';
import { commonsOf, hearthLine, percentFilled, placeOf } from './commons-view';
import { CREATURE_PX } from './place-cast';
import { seatAt } from './seat-parts';
import {
  STAGE_BOX,
  lecternBox,
  schoolLayout,
  schoolScale,
  schoolSceneDraw,
  freeSeatBox,
  seatBox,
  type TargetBox,
} from './school-canvas';
import type { SchoolActions } from './school-feed';
import { teacherSpecies } from './school-yard';
import { ceremonyWhen, readyLine, teacherLine, teaching } from './school-view';
import { trayFor, type TrayInput } from './tray-state';
import { depthOf } from './valley-logic';

/** What a carried creature lands on: a seat by the server's index, or the helper's spot. */
const seatDropId = (index: number): string => `school-seat-${String(index)}`;
export const HELPER_DROP = 'school-helper';

/** The right drawer: the one thing that was clicked. */
type Right =
  | { kind: 'teacher' | 'graduation' | 'helper'; from: Opener | null }
  | { kind: 'seat'; index: number; from: Opener | null };

/** The left drawer: a collection. */
type Left = { kind: 'board'; from: Opener | null };

/** What is open at the start (the workbench and the tests show each). */
export type SchoolStart = CommonsStart & {
  teacher?: boolean;
  seat?: number;
  graduation?: boolean;
  sheet?: boolean;
  helper?: boolean;
};

/** One student on its seat: the creature idling, wearing its honour (V-TRIAL-1). */
function Student({
  creature,
  g,
  x,
  y,
}: {
  creature: Creature;
  g: SceneGeometry;
  x: number;
  y: number;
}) {
  const honour = useHonour(creature.id);
  return (
    <At x={g.X(x)} y={g.Y(y)} class="vy-stand" z={depthOf(x, y)}>
      <CreatureSprite creature={creature} scale={g.s} idle={creature.id} />
      <HonourRibbon honour={honour} scale={g.s} />
    </At>
  );
}

export function SchoolCanvas({
  creatures,
  visit,
  view,
  graduation,
  now,
  zone,
  actions,
  commons,
  acorns = 0,
  busy = false,
  trayInput,
  onOpenPaddock,
  start = {},
}: {
  creatures: readonly Creature[];
  visit: ValleyVisit;
  /** What the server said of the School (the place is "not open yet" until it has). */
  view: SchoolState;
  /** `valley.graduation`: how many are ready and when the next ceremony is; absent says nothing of it. */
  graduation: { ready: number; nextAt: number } | undefined;
  now: number;
  zone: string;
  actions: SchoolActions;
  /** The School's project board (the commons): its gifts and its helper seat; absent leaves the School with no project. */
  commons?: CommonsActions | undefined;
  /** The player's Acorns (the `bait` balance). */
  acorns?: number;
  busy?: boolean;
  trayInput: TrayInput;
  /** A tap on a creature in the tray: the Paddock. */
  onOpenPaddock: () => void;
  start?: SchoolStart;
}) {
  const [right, setRight] = useState<Right | null>(() =>
    start.helper === true
      ? { kind: 'helper', from: null }
      : start.seat !== undefined
        ? { kind: 'seat', index: start.seat, from: null }
        : start.graduation === true
          ? { kind: 'graduation', from: null }
          : start.teacher === true
            ? { kind: 'teacher', from: null }
            : null,
  );
  const [left, setLeft] = useState<Left | null>(() =>
    start.sheet === true || start.view !== undefined ? { kind: 'board', from: null } : null,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  const open = teaching(view);
  const students = view.seats.flatMap((seat) => {
    const creature =
      seat.creatureId === null ? undefined : creatures.find((c) => c.id === seat.creatureId);
    return creature === undefined ? [] : [{ index: seat.index, creature }];
  });
  const species = useMemo(() => {
    const talent = view.talent?.id;
    return open && view.phase === 'here' && talent !== undefined
      ? teacherSpecies(talent, new Set(creatures.map((c) => c.species)))
      : null;
  }, [open, view.phase, view.talent?.id, creatures]);

  const block = commonsOf(visit);
  const place = placeOf(block, 'school');
  const hearth = block === null ? null : hearthLine(block.hearthBp);
  const helperId = block?.communal.find((c) => c.place === 'school')?.creatureId ?? null;
  const helper = helperId === null ? undefined : creatures.find((c) => c.id === helperId);
  const post: HelperPost | undefined =
    commons === undefined || place === undefined
      ? undefined
      : { creatureId: helper?.id ?? null, actions: commons };
  // The builders' corner stands while a project is being built (open for gifts, or building its three days) below the top level,
  // and while a helper is posted whatever the level, so that helper is never out of sight.
  const building =
    place !== undefined &&
    (((place.state === 'open' || place.state === 'building') && place.level < place.max) ||
      helperId !== null);
  const corner = post !== undefined && building;
  // The pile of materials in the corner grows with the project and changes with the level's material.
  const material = pileMaterial(place?.level ?? 1);
  const size = pileSize(place === undefined ? 0 : percentFilled(place));
  const draw = useMemo(
    () =>
      schoolSceneDraw(
        { lectern: open, bell: open && view.phase === 'announced', teacher: species },
        corner ? { material, size } : null,
      ),
    [open, view.phase, species, corner, material, size],
  );

  // --- A hand carrying a creature from the tray onto a free seat or the helper's spot ---

  const drag = useDragDrop<string>({
    disabled: busy,
    stripRef: rootRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p) => seatAt(p.x, p.y),
    onDrop: (creatureId, target) => {
      if (target === null) return dropOutcome('none', null, null, 'Cancelled.');
      if (target === HELPER_DROP) {
        if (post === undefined || helperId === creatureId)
          return dropOutcome('none', null, null, '');
        void post.actions.post('school', creatureId);
        return dropOutcome('valid', null, null, '');
      }
      const index = Number(/^school-seat-(\d+)$/.exec(target)?.[1]);
      const seat = view.seats.find((s) => s.index === index);
      if (
        !open ||
        seat === undefined ||
        seat.creatureId !== null ||
        view.seats.some((s) => s.creatureId === creatureId)
      ) {
        return dropOutcome('none', null, null, '');
      }
      void actions.seat(index, creatureId);
      return dropOutcome('valid', null, null, '');
    },
  });
  const carried =
    drag.drag === null ? undefined : creatures.find((c) => c.id === drag.drag?.creatureId);
  const ordered = trayFor(
    creatures.filter((c) => busyReason(c) === null),
    trayInput,
  );

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
  };

  // --- The drawers' panels ---

  const leaveRight = (): void => {
    setRight(null);
  };
  let rightPanel: CanvasPanel | null = null;
  if (right !== null) {
    const base = {
      wizard: true,
      returnFocusTo: right.from,
      backLabel: 'to the School',
      onClose: leaveRight,
    };
    if (right.kind === 'teacher') {
      rightPanel = {
        ...base,
        title: 'Visiting teacher',
        children: (
          <TeacherPanel
            view={view}
            creatures={creatures}
            zone={zone}
            busy={busy}
            actions={actions}
            onClose={leaveRight}
          />
        ),
      };
    } else if (right.kind === 'seat') {
      const seat = view.seats.find((s) => s.index === right.index);
      const student = students.find((s) => s.index === right.index)?.creature;
      rightPanel = {
        ...base,
        title: student === undefined ? 'Student seat' : creatureName(student),
        children: (
          <SeatPanel
            key={`${String(right.index)}-${seat?.creatureId ?? ''}`}
            view={view}
            creatures={creatures}
            index={right.index}
            busy={busy}
            actions={actions}
            onClose={leaveRight}
          />
        ),
      };
    } else if (right.kind === 'graduation') {
      rightPanel = {
        ...base,
        title: 'Graduation',
        children: (
          <GraduationPanel
            view={view}
            graduation={graduation}
            now={now}
            zone={zone}
            onClose={leaveRight}
          />
        ),
      };
    } else if (post !== undefined) {
      rightPanel = {
        ...base,
        title: 'The builders',
        children: (
          <HelperPanel
            visit={visit}
            creatures={creatures}
            helper={post}
            place="school"
            title="Who helps build the School?"
            backLabel="to the School"
            onClose={leaveRight}
          />
        ),
      };
    }
  }

  let leftPanel: CanvasPanel | null = null;
  if (left !== null) {
    leftPanel = {
      returnFocusTo: left.from,
      onClose: () => {
        setLeft(null);
      },
      title: 'Project board',
      children: (
        <PanelBody>
          <div class="fc-hub">
            {hearth !== null && <p class="sp-note">{hearth}</p>}
            {commons !== undefined && (
              <CommonsBoard
                place="school"
                host="panel"
                visit={visit}
                creatures={creatures}
                acorns={acorns}
                busy={busy}
                actions={commons}
                {...(start.view === undefined
                  ? {}
                  : {
                      start: {
                        view: start.view,
                        ...(start.row === undefined ? {} : { row: start.row }),
                      },
                    })}
              />
            )}
          </div>
        </PanelBody>
      ),
    };
  }

  // --- The scene ---

  const scene = (
    <SceneFrame
      key="school"
      id="school"
      label="School"
      draw={draw}
      onLeave={closeTop}
      scaleFor={(width, height) => schoolScale(width, height, corner)}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, schoolScale(390, 640, corner));
        const lay = schoolLayout(g, corner);
        return (
          <SchoolInside
            g={g}
            view={view}
            box={lay.box}
            students={students}
            helper={helper}
            corner={lay.corner}
            ready={graduation === undefined ? null : graduation.ready}
            nextWhen={graduation === undefined ? null : ceremonyWhen(graduation.nextAt, now, zone)}
            open={{
              teacher: right?.kind === 'teacher',
              seat: right?.kind === 'seat' ? right.index : null,
              graduation: right?.kind === 'graduation',
              board: left?.kind === 'board',
              helper: right?.kind === 'helper',
            }}
            hearthOpen={place?.state === 'open'}
            busy={busy}
            over={drag.drag?.over ?? null}
            onTeacher={(opener) => {
              setRight({ kind: 'teacher', from: opener });
            }}
            onSeat={(index, opener) => {
              setRight({ kind: 'seat', index, from: opener });
            }}
            onHouse={(opener) => {
              setRight({ kind: 'graduation', from: opener });
            }}
            onTable={(opener) => {
              setLeft({ kind: 'board', from: opener });
            }}
            onHelper={(opener) => {
              setRight({ kind: 'helper', from: opener });
            }}
          />
        );
      }}
    </SceneFrame>
  );

  return (
    <div
      class="sc-root"
      ref={rootRef}
      data-carrying={drag.drag === null ? undefined : 'yes'}
      data-over={drag.drag?.over ?? undefined}
    >
      <PlaceCanvas
        label="School"
        scene={scene}
        left={leftPanel}
        right={rightPanel}
        below={
          <Tray
            creatures={ordered}
            input={trayInput}
            label="Creatures to send"
            onPick={onOpenPaddock}
            drag={drag}
          />
        }
      />
      <DragGhost
        ghostRef={drag.ghostRef}
        creature={
          carried === undefined
            ? undefined
            : { species: carried.species, name: creatureName(carried) }
        }
      />
      <p class="visually-hidden" role="status">
        {teacherLine(view, zone)}
      </p>
    </div>
  );
}

/** A box of the School (art pixels from its top-left) as the scene's own coordinates. */
const placed = (box: { x: number; y: number }, at: TargetBox): TargetBox => ({
  ...at,
  x: box.x + at.x,
  y: box.y + at.y,
});

/** What stands in the scene over its canvas: the students, the corner, and each real button a `CanvasTarget`. */
function SchoolInside({
  g,
  view,
  box,
  students,
  helper,
  corner,
  ready,
  nextWhen,
  open,
  hearthOpen,
  busy,
  over,
  onTeacher,
  onSeat,
  onHouse,
  onTable,
  onHelper,
}: {
  g: SceneGeometry;
  view: SchoolState;
  /** The School's top-left in scene pixels. */
  box: { x: number; y: number };
  students: readonly { index: number; creature: Creature }[];
  helper: Creature | undefined;
  /** The builders' corner's top-left (scene pixels), or null when the School has no project being built. */
  corner: { x: number; y: number } | null;
  /** The ceremony's news (null: the server has not said), for the stage's spoken name. */
  ready: number | null;
  nextWhen: string | null;
  open: {
    teacher: boolean;
    seat: number | null;
    graduation: boolean;
    board: boolean;
    helper: boolean;
  };
  hearthOpen: boolean;
  busy: boolean;
  over: string | null;
  onTeacher: (opener: Opener) => void;
  onSeat: (index: number, opener: Opener) => void;
  onHouse: (opener: Opener) => void;
  onTable: (opener: Opener) => void;
  onHelper: (opener: Opener) => void;
}) {
  const seat = corner === null ? null : { x: corner.x + HELPER_AT.x, y: corner.y + HELPER_AT.y };
  const teachingNow = teaching(view);
  const lectern = placed(box, lecternBox());
  const stage = placed(box, STAGE_BOX);
  const readyText = ready === null ? null : (readyLine(ready) ?? 'nobody is ready to graduate yet');
  return (
    <>
      {students.map(({ index, creature }) => {
        const at = seatBox(index);
        return at === null ? null : (
          <Student key={creature.id} creature={creature} g={g} x={box.x + at.x} y={box.y + at.y} />
        );
      })}
      {/* The helper works at the table, facing it: the Forge's hammer-fall. */}
      {helper !== undefined && seat !== null && (
        <At x={g.X(seat.x)} y={g.Y(seat.y)} class="vy-stand" z={depthOf(seat.x, seat.y)}>
          <CreatureSprite creature={helper} scale={g.s} flip class="fi-hammer fi-d1" />
        </At>
      )}
      {/* The empty spot's flag: a piece of the scene's art, no tap of its own (the dashed outline over it is the target). */}
      {corner !== null && helper === undefined && (
        <At x={g.X(corner.x + FLAG_AT.x)} y={g.Y(corner.y + FLAG_AT.y)}>
          <Pic sprite={cornerSprite('help-flag')} scale={g.s} />
        </At>
      )}
      {ready !== null && (
        <CanvasTarget
          g={g}
          {...stage}
          label={`The graduation stage, ${readyText ?? ''}${nextWhen === null ? '' : `, the next ceremony is ${nextWhen}`}. Show the graduation`}
          plate="Graduation"
          expanded={open.graduation}
          onClick={onHouse}
        />
      )}
      {teachingNow && (
        <CanvasTarget
          g={g}
          {...lectern}
          z={PLATES_Z}
          label={
            view.phase === 'here'
              ? `The lectern, the visiting teacher is here teaching ${view.talent?.name ?? 'a talent'}. Show the lesson`
              : `The lectern, a visiting teacher comes. Show the lesson`
          }
          plate={view.phase === 'here' ? 'Teacher' : 'Lectern'}
          plateAt={lectern.h + 1}
          expanded={open.teacher}
          onClick={onTeacher}
        />
      )}
      {view.seats.map((s) => {
        const student = students.find((x) => x.index === s.index)?.creature;
        // A seated student's tap is the creature's whole box; an empty seat's outline is the seat only, under the house's walls.
        const at = student === undefined ? freeSeatBox(s.index) : seatBox(s.index);
        // An empty seat is a target only while a lesson is on; a student can always be taken off.
        if (at === null || (student === undefined && !teachingNow)) return null;
        const where = placed(box, at);
        // Its depth is the creature's own (the full box), so a seated student and its outline order the same way.
        const full = placed(box, seatBox(s.index) ?? at);
        const id = seatDropId(s.index);
        return (
          <CanvasTarget
            key={s.index}
            g={g}
            x={where.x}
            y={where.y}
            w={at.w}
            h={at.h}
            z={PLATES_Z + depthOf(full.x, full.y)}
            seat={id}
            over={over === id}
            slot={student === undefined}
            label={
              student === undefined
                ? 'A student seat: nobody sits here. Choose a creature to send'
                : `${creatureName(student)}, level ${String(student.level)}, sits at the School and learns it by morning. Show this student`
            }
            plate={student === undefined ? 'Seat' : creatureName(student)}
            {...(student === undefined ? {} : { plateMeta: { level: student.level } })}
            plateAt={at.h + 1}
            expanded={open.seat === s.index}
            disabled={busy}
            onClick={(opener) => {
              onSeat(s.index, opener);
            }}
          />
        );
      })}
      {corner !== null && (
        <CanvasTarget
          g={g}
          x={corner.x + TABLE_BOX.x}
          y={corner.y + TABLE_BOX.y}
          w={TABLE_BOX.w}
          h={TABLE_BOX.h}
          label={`The builders' table, ${hearthOpen ? "the School's project is open" : 'the School is being built'}. Open the project board`}
          plate="Project"
          group={CORNER_GROUP}
          plateAt={TABLE_BOX.h + 1}
          expanded={open.board}
          onClick={onTable}
        />
      )}
      {seat !== null && (
        <CanvasTarget
          g={g}
          x={seat.x}
          y={seat.y}
          w={CREATURE_PX}
          h={CREATURE_PX}
          z={PLATES_Z + depthOf(seat.x, seat.y)}
          seat={HELPER_DROP}
          over={over === HELPER_DROP}
          slot={helper === undefined}
          label={
            helper === undefined
              ? "The helper spot at the builders' table: nobody helps build. Choose a creature"
              : `${creatureName(helper)}, level ${String(helper.level)}, helping build the School at the builders' table. Change`
          }
          plate={helper === undefined ? 'Helper' : creatureName(helper)}
          group={CORNER_GROUP}
          {...(helper === undefined ? {} : { plateMeta: { level: helper.level } })}
          plateAt={CREATURE_PX + 1}
          expanded={open.helper}
          disabled={busy}
          onClick={onHelper}
        />
      )}
    </>
  );
}
