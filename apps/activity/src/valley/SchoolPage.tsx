/**
 * The School's page (phase 5 step 9b, `systems/school.md` V-SCH-10 to 13, `systems/trials.md` V-TRIAL-3, 4), under the School's scene the way
 * the visitor's page sits under his stall (`VisitorPage`): cards of the Signpost's seat family (`.sp-seat`). The first says where the
 * visiting teacher stands and what they teach (the shared talent chip, the stay's days in the reader's own time). The second is the
 * students: the faces of the player's creatures that would learn it, each with one Send (a seated student says "Learns it by morning" and
 * has one Take off); "None of yours this time." in words when no creature would. The third is the graduation: how many of the player's
 * creatures are ready, and when the next ceremony is ("this evening"). The words are `school-view.ts`; the server decides everything, and a
 * refusal shows as the game's shared alert (`no_teacher`, `would_not_learn`, `line_seated`).
 */
import type { SchoolState } from '../api';
import type { Creature } from '../api';
import { baseOption } from '../roster-picker';
import type { TalentView } from '../talent-types';
import { TalentChip } from '../TalentChip';
import { CreatureList } from '../ui/CreatureList';
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

/** What the page asks the game to do; resolves true when the server took it (the refusal shows as the game's alert). */
export interface SchoolActions {
  /** Seats a creature at the student seat (`index`), or empties the seat with `null` (free, so no key). */
  seat: (index: number, creatureId: string | null) => Promise<boolean>;
}

/** What the valley shell needs of the School: what the server said of it (null until it has) and what the page asks. */
export interface SchoolFeed {
  /** `GET /api/valley/school`; null until the first answer (the place then reads "not open yet"). */
  view: SchoolState | null;
  actions: SchoolActions;
  /** The server's clock, for "this evening". */
  now: number;
  /** The reader's own time zone (the days of the stay and of the ceremony are told in it). */
  zone: string;
}

/** The week's talent as the shared chip wants it (never golden: the teacher teaches the plain one). */
const talentOf = (talent: NonNullable<SchoolState['talent']>): TalentView => ({
  id: talent.id,
  name: talent.name,
  golden: false,
  text: talent.text,
  about: '',
  idle: false,
});

export function SchoolPage({
  view,
  creatures,
  graduation,
  now,
  zone,
  busy,
  actions,
}: {
  view: SchoolState;
  creatures: readonly Creature[];
  /** `valley.graduation`: how many are ready and when the next ceremony is; absent says nothing of it. */
  graduation: { ready: number; nextAt: number } | undefined;
  now: number;
  zone: string;
  busy: boolean;
  actions: SchoolActions;
}) {
  const faces = learners(view, creatures);
  const free = freeSeat(view);
  const lines = graduationLines(graduation, now, zone);
  return (
    <section class="sp-page sch-page" aria-label="School">
      <ul class="sp-seats" aria-label="The School">
        <li class="sp-seat">
          <div class="sp-seat-head">
            <h3 class="pix">Visiting teacher</h3>
          </div>
          <p class="sp-line">{teacherLine(view, zone)}</p>
          {view.talent !== null && view.phase !== 'away' && (
            <div class="sch-talent">
              <TalentChip talent={talentOf(view.talent)} />
              <p class="sp-line muted">
                A creature seated before or during the stay learns it by morning, if it can take it.
              </p>
            </div>
          )}
        </li>
        {teaching(view) && (
          <li class="sp-seat">
            <div class="sp-seat-head">
              <h3 class="pix">Your students</h3>
            </div>
            {faces.length === 0 ? (
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
            )}
            {faces.length > 0 && free === undefined && (
              <p class="sp-line muted">{SEATS_FULL_LINE}</p>
            )}
          </li>
        )}
        {lines.length > 0 && (
          <li class="sp-seat">
            <div class="sp-seat-head">
              <h3 class="pix">Graduation</h3>
            </div>
            {lines.map((line, i) => (
              <p key={line} class={i === 0 && (graduation?.ready ?? 0) > 0 ? 'sp-line sch-ready' : 'sp-line'}>
                {line}
              </p>
            ))}
          </li>
        )}
      </ul>
    </section>
  );
}
