/**
 * What a click in the School's canvas opens (`SchoolCanvas.tsx` holds the state; the side rule is `PlaceCanvas`'s). Everything the old
 * School page said is here, each in the place it belongs in the scene:
 *
 * - `TeacherPanel` (right drawer, a page on a phone): the lectern. Where the teacher stands and the days of the stay, the talent with its
 *   shared chip, and which of the player's creatures would learn it, each with one Send (a seated student says "Learns it by morning" and
 *   has one Take off).
 * - `SeatPanel` (right drawer): one student seat. Seated: that student, with the one Take off. Empty: who of the player's would learn
 *   the talent, a tap seating the creature.
 * - `GraduationPanel` (right drawer): the School's house. How many creatures are ready to graduate and when the next ceremony is, in
 *   words that never count down.
 *
 * The words are `school-view.ts`; the server decides everything, and a refusal shows as the game's shared alert. Each panel is a
 * `PanelBody` in a one-step `ui/Wizard` whose first step has no Back (the X is the way out).
 */
import type { Creature, SchoolState } from '../api';
import { creatureName } from '../game';
import { baseOption } from '../roster-picker';
import { TalentChip } from '../TalentChip';
import type { TalentView } from '../talent-types';
import { CreatureList } from '../ui/CreatureList';
import { useWizard } from '../ui/use-wizard';
import { WizardFooter, WizardView } from '../ui/Wizard';
import { PanelBody } from './PlaceCanvas';
import type { SchoolActions } from './school-feed';
import {
  LEARNS_BY_MORNING,
  NONE_OF_YOURS,
  SEATS_FULL_LINE,
  freeSeat,
  graduationLines,
  learners,
  teacherLine,
  teaching,
} from './school-view';

/** The week's talent as the shared chip wants it (never golden: the teacher teaches the plain one). */
const talentOf = (talent: NonNullable<SchoolState['talent']>): TalentView => ({
  id: talent.id,
  name: talent.name,
  golden: false,
  text: talent.text,
  about: '',
  idle: false,
});

export function TeacherPanel({
  view,
  creatures,
  zone,
  busy,
  actions,
  onClose,
}: {
  view: SchoolState;
  creatures: readonly Creature[];
  zone: string;
  busy: boolean;
  actions: SchoolActions;
  onClose: () => void;
}) {
  const wizard = useWizard(
    [{ id: 'teacher', title: 'Visiting teacher', backLabel: 'to the School' }],
    { onExit: onClose },
  );
  const faces = learners(view, creatures);
  const free = freeSeat(view);
  return (
    <PanelBody>
      <WizardView wizard={wizard}>
        <div class="dr-stack">
          <p class="sp-line">{teacherLine(view, zone)}</p>
          {view.talent !== null && view.phase !== 'away' && (
            <div class="sch-talent">
              <TalentChip talent={talentOf(view.talent)} />
              <p class="sp-note">
                A creature seated before or during the stay learns it by morning, if it can take it.
              </p>
            </div>
          )}
          {teaching(view) &&
            (faces.length === 0 ? (
              <p class="sp-line">{NONE_OF_YOURS}</p>
            ) : (
              <CreatureList
                options={faces.map((l) => ({
                  ...baseOption(l.creature),
                  ...(l.seat === null ? {} : { note: LEARNS_BY_MORNING }),
                }))}
                selection={{ mode: 'show', label: 'Your creatures that would learn' }}
                chips={false}
                class="flat"
                reasonSide
                side={(option) => {
                  const seat = faces.find((l) => l.creature.id === option.id)?.seat ?? null;
                  return seat === null ? (
                    <button
                      type="button"
                      class="sch-send"
                      disabled={busy || free === undefined}
                      aria-label={`Send ${option.name} to the teacher`}
                      onClick={() => {
                        if (free !== undefined) void actions.seat(free.index, option.id);
                      }}
                    >
                      Send
                    </button>
                  ) : (
                    <button
                      type="button"
                      class="sch-send"
                      disabled={busy}
                      aria-label={`Take ${option.name} off the seat`}
                      onClick={() => {
                        void actions.seat(seat, null);
                      }}
                    >
                      Take off
                    </button>
                  );
                }}
              />
            ))}
          {teaching(view) && faces.length > 0 && free === undefined && (
            <p class="sp-note">{SEATS_FULL_LINE}</p>
          )}
        </div>
      </WizardView>
    </PanelBody>
  );
}

export function SeatPanel({
  view,
  creatures,
  index,
  busy,
  actions,
  onClose,
}: {
  view: SchoolState;
  creatures: readonly Creature[];
  /** The server's seat index. */
  index: number;
  busy: boolean;
  actions: SchoolActions;
  onClose: () => void;
}) {
  const seat = view.seats.find((s) => s.index === index);
  const student =
    seat?.creatureId === null || seat === undefined
      ? undefined
      : creatures.find((c) => c.id === seat.creatureId);
  const wizard = useWizard(
    [
      {
        id: 'seat',
        title: student === undefined ? 'Student seat' : creatureName(student),
        backLabel: 'to the School',
      },
    ],
    { onExit: onClose },
  );
  const waiting = learners(view, creatures).filter((l) => l.seat === null);
  return (
    <PanelBody
      footer={
        student === undefined ? undefined : (
          <WizardFooter
            label="Take off the seat"
            busy={busy}
            onFinish={() => {
              void actions.seat(index, null).then((ok) => {
                if (ok) onClose();
              });
            }}
          />
        )
      }
    >
      <WizardView wizard={wizard}>
        <div class="dr-stack">
          {student === undefined ? (
            <>
              <p class="sp-note">Who of yours joins the lesson? It learns it by morning.</p>
              {waiting.length === 0 ? (
                <p class="sp-line">{NONE_OF_YOURS}</p>
              ) : (
                <CreatureList
                  options={waiting.map((l) => baseOption(l.creature))}
                  selection={{
                    mode: 'pick',
                    label: 'Who joins the lesson',
                    onPick: (id) => {
                      void actions.seat(index, id).then((ok) => {
                        if (ok) onClose();
                      });
                    },
                  }}
                  chips={false}
                  class="flat"
                />
              )}
            </>
          ) : (
            <CreatureList
              options={[{ ...baseOption(student), note: LEARNS_BY_MORNING }]}
              selection={{ mode: 'show', label: 'Student' }}
              chips={false}
              class="flat"
            />
          )}
        </div>
      </WizardView>
    </PanelBody>
  );
}

export function GraduationPanel({
  view,
  graduation,
  now,
  zone,
  onClose,
}: {
  view: SchoolState;
  /** `valley.graduation`: how many are ready and when the next ceremony is; absent says nothing of it. */
  graduation: { ready: number; nextAt: number } | undefined;
  now: number;
  zone: string;
  onClose: () => void;
}) {
  const wizard = useWizard(
    [{ id: 'graduation', title: 'Graduation', backLabel: 'to the School' }],
    {
      onExit: onClose,
    },
  );
  const lines = graduationLines(graduation, now, zone);
  return (
    <PanelBody>
      <WizardView wizard={wizard}>
        <div class="dr-stack">
          {!teaching(view) && <p class="sp-line">{teacherLine(view, zone)}</p>}
          {lines.map((line, i) => (
            <p
              key={line}
              class={i === 0 && (graduation?.ready ?? 0) > 0 ? 'sp-line sch-ready' : 'sp-line'}
            >
              {line}
            </p>
          ))}
        </div>
      </WizardView>
    </PanelBody>
  );
}
