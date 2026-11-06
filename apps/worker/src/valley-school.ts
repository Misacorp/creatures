/**
 * The School's weekly teacher and lessons (phase 5 step 9, docs/design/valley/systems/school.md V-SCH-10 to 13), behind `VALLEY_SYSTEMS`.
 * Two parts, as the visitor's:
 *
 * - `SchoolWeeks`: the teacher's weeks. One talent is drawn a week by the band rule (`pickTeacherTalent` in `@creatures/game`) from the
 *   server's books and lines as they stand when the row is made, with live dice: "benefits from 2 up to a quarter of the players, never
 *   everyone, else one player; never golden". The row (`school_weeks`, keyed by the Monday of the stay) is made the first time the server
 *   sees the announcement (Friday 00:00 guild-local, `teacherAnnounceDays` ahead) or the stay (Monday to Wednesday): the alarm (armed for
 *   Friday 00:00), a read of the School, a seat, or a returning player's paper, whichever comes first. The announcement is one Discord post
 *   (`school:<week>`) with the talent's name and the days as time stamps. The Gazette's once-a-week mention is told here too.
 * - `ValleySchool`: what players do. The read (the teacher, your student seats, which of your creatures would learn), seating a creature,
 *   and the lessons the lazy pass settles: a creature seated before the arrival or on a day of the stay learns by the next morning if its
 *   line's pool holds the talent and its owner's book for the line lacks it; the talent enters that player's book (never golden) and the
 *   student goes back to its post by itself (V-SCH-13).
 *
 * Price (one pass a week, measured in `read-budget.test.ts`): making a week's row reads every creature's line once
 * (`SELECT DISTINCT user_id, line FROM creatures`: one row per creature of the server) and every book entry (`line_talents`), about 2000
 * rows for a server of 15 with a full roster, once a week; the rest of the time `current` reads one or two primary-key rows and the lazy
 * pass reads nothing more unless a creature sits at the School (a few rows). Writes: one `school_weeks` row a week, one
 * `school_students` row per player per week.
 *
 * A student seat is a `valley_seats` row (`place = 'school'`, `kind = 'student'`, `position` the seat's number), so a creature stands at
 * exactly one seat, as everywhere in the valley, and seating takes it off its post (the post it came from is `home_seat_id`).
 * `destination_id` is the teacher's week and `passed_at` the moment it was seated.
 */
import {
  VALLEY_RULES,
  addDaysToKey,
  lessonTakes,
  pickTeacherTalent,
  teacherWeekOf,
  visitorWeekOf,
  type Rng,
  type TeacherPhase,
  type TeacherPlayer,
} from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { formatTeacherPost } from './discord-format';
import { enqueuePost } from './discord-posts';
import type { LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';
import { booksByLine, recordFound } from './talent-v2-store';
import { zonedTimeToEpoch } from './time';
import type { PaperRecorder } from './valley-gazette';
import type { ValleySettle } from './valley-settle';

/** The talent library in file order and every line's pool (combat v2's data). */
const TALENT_IDS: readonly string[] = Object.keys(combatV2.talents);
const POOLS = combatV2.pools;

export type TeacherWeekRow = {
  week_key: string;
  talent_id: string | null;
  picked_at: number;
  posted_at: number | null;
  forced: number;
  players: number;
  benefits: number;
};

/** Where the teacher stands at an instant: the phase, the week of his stay (the Monday) and his row. */
export interface SchoolNow {
  phase: TeacherPhase;
  /** The Monday of the stay this is about (null while away). */
  weekKey: string | null;
  row: TeacherWeekRow | null;
}

export interface SchoolWeeksDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly timezone: () => string;
  /** Live randomness for the week's talent. */
  readonly rng: Rng;
}

export class SchoolWeeks {
  constructor(private readonly deps: SchoolWeeksDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  weekRow(key: string): TeacherWeekRow | null {
    return (
      this.sql
        .exec<TeacherWeekRow>(
          'SELECT week_key, talent_id, picked_at, posted_at, forced, players, benefits FROM school_weeks WHERE week_key = ?',
          key,
        )
        .toArray()[0] ?? null
    );
  }

  /** The stay's first and last moment: Monday 00:00 guild-local and `teacherStayDays` days on. */
  stayOf(weekKey: string): { from: number; until: number } {
    const tz = this.deps.timezone();
    return {
      from: zonedTimeToEpoch(weekKey, 0, 0, tz),
      until: zonedTimeToEpoch(addDaysToKey(weekKey, VALLEY_RULES.school.teacherStayDays), 0, 0, tz),
    };
  }

  /**
   * Where the teacher stands at `at`, making the week's row when this is the first time anyone sees the announcement or the stay. Runs in
   * the caller's transaction when it has one (the row and its post are written together). A row the staging tool made counts whatever the
   * weekday: this week's as here until the week ends, next week's as announced.
   */
  current(at: number = this.deps.now()): SchoolNow {
    const week = visitorWeekOf(at, this.deps.timezone());
    const { phase, key } = teacherWeekOf(VALLEY_RULES, week);
    const own = this.weekRow(week.key);
    if (phase === 'here')
      return { phase, weekKey: week.key, row: own ?? this.make(week.key, at, 0) };
    if (own?.forced === 1) return { phase: 'here', weekKey: week.key, row: own };
    const next = addDaysToKey(week.key, 7);
    if (phase === 'announced' && key !== null) {
      return { phase, weekKey: key, row: this.weekRow(key) ?? this.make(key, at, 0) };
    }
    const upcoming = this.weekRow(next);
    if (upcoming !== null && upcoming.forced > 0)
      return { phase: 'announced', weekKey: next, row: upcoming };
    return { phase: 'away', weekKey: null, row: null };
  }

  /** The alarm's and the routes' entry: make the row if the announcement or the stay is on and none exists yet. Cheap while away (no read). */
  ensureAnnounced(at: number = this.deps.now()): void {
    const week = visitorWeekOf(at, this.deps.timezone());
    if (teacherWeekOf(VALLEY_RULES, week).phase === 'away') return;
    this.deps.storage.transactionSync(() => {
      this.current(at);
    });
  }

  /**
   * The staging tool: brings the teacher now for the current week's stay, whatever the weekday (the row is made if there is none; he counts as
   * here until the week ends). The announcement is posted as usual (once).
   */
  arriveNow(at: number = this.deps.now()): SchoolNow {
    return this.deps.storage.transactionSync(() => {
      const key = visitorWeekOf(at, this.deps.timezone()).key;
      this.force(key, at, 1);
      return this.current(at);
    });
  }

  /** The staging tool: announces next week's teacher now (the row and its post are made once; it counts as announced until the stay). */
  announceNow(at: number = this.deps.now()): SchoolNow {
    return this.deps.storage.transactionSync(() => {
      const next = addDaysToKey(visitorWeekOf(at, this.deps.timezone()).key, 7);
      this.force(next, at, 2);
      const row = this.weekRow(next);
      return { phase: 'announced', weekKey: next, row };
    });
  }

  /** Makes the week's row for the staging tool (`forced` 1: brought, 2: announced now), or marks the one there is (a brought row stays brought). */
  private force(key: string, at: number, how: 1 | 2): void {
    const row = this.weekRow(key);
    if (row === null) this.make(key, at, how);
    else if (row.forced === 0 || (how === 1 && row.forced === 2)) {
      this.sql.exec('UPDATE school_weeks SET forced = ? WHERE week_key = ?', how, key);
    }
  }

  /** Draws the week's talent from the books as they stand, writes the row and queues the announcement. */
  private make(key: string, at: number, forced: 0 | 1 | 2): TeacherWeekRow {
    const players = this.players();
    const talent = pickTeacherTalent(this.deps.rng, TALENT_IDS, POOLS, players);
    const benefits =
      talent === null
        ? 0
        : players.filter((p) =>
            [...p.lines].some(([line, book]) => lessonTakes(POOLS[line] ?? [], book, talent)),
          ).length;
    const row: TeacherWeekRow = {
      week_key: key,
      talent_id: talent,
      picked_at: at,
      posted_at: null,
      forced,
      players: players.length,
      benefits,
    };
    this.sql.exec(
      'INSERT INTO school_weeks (week_key, talent_id, picked_at, posted_at, forced, players, benefits) VALUES (?, ?, ?, NULL, ?, ?, ?)',
      row.week_key,
      row.talent_id,
      row.picked_at,
      row.forced,
      row.players,
      row.benefits,
    );
    const name = talent === null ? undefined : combatV2.talents[talent]?.name;
    if (name !== undefined) {
      const stay = this.stayOf(key);
      // One post a week: the key is the week's, so a second try (or a later dev announcement) queues nothing. A server with no channel
      // known posts nothing and `posted_at` stays empty. The last stamp is a second before the stay ends, so it names Wednesday.
      if (
        enqueuePost(
          this.sql,
          {
            key: `school:${key}`,
            content: JSON.stringify(formatTeacherPost(name, stay.from, stay.until - 1000)),
          },
          at,
        )
      ) {
        this.sql.exec('UPDATE school_weeks SET posted_at = ? WHERE week_key = ?', at, key);
        return { ...row, posted_at: at };
      }
    }
    return row;
  }

  /**
   * Every player of the server with the lines they own and their book for each, in one pass (two queries over the whole server, once a
   * week). A player is whoever owns a creature.
   */
  private players(): TeacherPlayer[] {
    const owned = this.sql
      .exec<{ user_id: string; line: string }>('SELECT DISTINCT user_id, line FROM creatures')
      .toArray();
    const books = new Map<string, Set<string>>();
    for (const row of this.sql
      .exec<{ user_id: string; line: string; talent_id: string }>(
        // Through the primary key, one player at a time (the audit forbids a whole-table scan of the books).
        'SELECT user_id, line, talent_id FROM line_talents WHERE user_id IN (SELECT DISTINCT user_id FROM creatures)',
      )
      .toArray()) {
      const key = `${row.user_id}\u0000${row.line}`;
      const book = books.get(key) ?? new Set<string>();
      book.add(row.talent_id);
      books.set(key, book);
    }
    const byUser = new Map<string, Map<string, ReadonlySet<string>>>();
    for (const row of owned) {
      const lines = byUser.get(row.user_id) ?? new Map<string, ReadonlySet<string>>();
      lines.set(row.line, books.get(`${row.user_id}\u0000${row.line}`) ?? new Set<string>());
      byUser.set(row.user_id, lines);
    }
    return [...byUser.values()].map((lines) => ({ lines }));
  }

  /** The next time, after `from`, that the announcement is due in the guild's timezone: when to wake the object. Pure, no read. */
  nextAnnounceAt(from: number = this.deps.now()): number {
    const tz = this.deps.timezone();
    const week = visitorWeekOf(from, tz);
    const day = 7 - VALLEY_RULES.school.teacherAnnounceDays;
    const at = zonedTimeToEpoch(addDaysToKey(week.key, day), 0, 0, tz);
    return at > from ? at : zonedTimeToEpoch(addDaysToKey(week.key, 7 + day), 0, 0, tz);
  }

  /**
   * The Gazette's line about the teacher (V-SCH-11): once per player per teacher week, the first time a returning player's paper is
   * written while he is announced or here and a talent was drawn. Returns the talent, or null when there is none to tell.
   */
  tellIfNews(userId: string, at: number): string | null {
    const now = this.current(at);
    if (now.phase === 'away' || now.weekKey === null || now.row?.talent_id == null) return null;
    const told =
      this.sql
        .exec(
          `INSERT INTO school_students (user_id, week_key, told) VALUES (?, ?, 1)
           ON CONFLICT(user_id, week_key) DO UPDATE SET told = 1 WHERE told = 0 RETURNING told`,
          userId,
          now.weekKey,
        )
        .toArray().length > 0;
    return told ? now.row.talent_id : null;
  }
}

export interface ValleySchoolDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly timezone: () => string;
  readonly settle: ValleySettle;
  readonly weeks: SchoolWeeks;
  readonly lessons: SchoolLessons;
}

/** One of the caller's student seats. */
export interface SchoolSeatView {
  index: number;
  /** The creature sitting there, or null. */
  creatureId: string | null;
  /** When it learns (the next morning), or null when the seat is empty. */
  learnsAt: number | null;
}

/** What `GET /api/valley/school` answers. While away the talent and the days are hidden (nothing is announced). */
export interface SchoolView {
  phase: TeacherPhase;
  /** The announced or present teacher's talent (null while away, or when no talent benefits anyone this week). */
  talent: { id: string; name: string; text: string } | null;
  /** The stay: Monday 00:00 to the end of Wednesday (guild-local), as epoch ms; null while away. */
  arrivesAt: number | null;
  leavesAt: number | null;
  /** The caller's student seats (`school.seats` of them). */
  seats: SchoolSeatView[];
  /** The caller's creatures that would learn the talent (faces; empty: "none of yours this time"). Includes those already seated. */
  wouldLearn: string[];
}

export interface SeatResult {
  index: number;
  creatureId: string | null;
}

type SchoolSeatRow = {
  seat_id: string;
  position: number;
  creature_id: string | null;
  destination_id: string;
  passed_at: number;
  home_seat_id: string | null;
};

export interface SchoolLessonsDeps {
  readonly storage: LedgerStorage;
  readonly timezone: () => string;
  readonly weeks: SchoolWeeks;
}

/**
 * The lessons of the School's seats: when a student learns, what it learns and its way home. Apart from `ValleySchool` (which seats
 * students and needs the valley's settle) so the settle pass itself can hold it without a loop.
 */
export class SchoolLessons {
  constructor(private readonly deps: SchoolLessonsDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  seatRows(userId: string): SchoolSeatRow[] {
    return this.sql
      .exec<SchoolSeatRow>(
        `SELECT seat_id, position, creature_id, destination_id, passed_at, home_seat_id FROM valley_seats
         WHERE user_id = ? AND place = 'school' ORDER BY position`,
        userId,
      )
      .toArray();
  }

  /** The morning a student seated at `seatedAt` for the teacher of `weekKey` learns: the first midnight after the later of the two. */
  learnsAt(weekKey: string, seatedAt: number): number {
    const tz = this.deps.timezone();
    const at = Math.max(seatedAt, zonedTimeToEpoch(weekKey, 0, 0, tz));
    const week = visitorWeekOf(at, tz);
    const today = addDaysToKey(week.key, Math.floor(week.hoursIn / 24));
    return zonedTimeToEpoch(addDaysToKey(today, 1), 0, 0, tz);
  }

  /** The student leaves its seat for the post it came from when that is empty (else it rests at the fire). */
  sendHome(userId: string, seat: SchoolSeatRow): void {
    if (seat.creature_id === null) return;
    if (seat.home_seat_id !== null) {
      this.sql.exec(
        `UPDATE valley_seats SET creature_id = ? WHERE seat_id = ? AND user_id = ? AND creature_id IS NULL`,
        seat.creature_id,
        seat.home_seat_id,
        userId,
      );
    }
    this.sql.exec(
      'UPDATE valley_seats SET creature_id = NULL, home_seat_id = NULL WHERE seat_id = ?',
      seat.seat_id,
    );
  }

  /**
   * V-SCH-13, in the lazy pass: every student whose morning has come learns (its owner's book for the line gains the talent, never golden)
   * when its line's pool holds it and the book lacks it, and goes back to its post by itself either way. Returns how many learned. Called
   * by the pass only when a creature sits at the School (the pass already read the seats), inside its transaction; `rec` is the arrival's
   * paper log when this pass is an arrival.
   */
  learnDue(userId: string, at: number, rec?: PaperRecorder): number {
    let learned = 0;
    for (const seat of this.seatRows(userId)) {
      if (seat.creature_id === null || at < this.learnsAt(seat.destination_id, seat.passed_at))
        continue;
      const talent = this.deps.weeks.weekRow(seat.destination_id)?.talent_id ?? null;
      const creature = this.sql
        .exec<{ line: string }>(
          'SELECT line FROM creatures WHERE id = ? AND user_id = ?',
          seat.creature_id,
          userId,
        )
        .toArray()[0];
      if (talent !== null && creature !== undefined) {
        const book = new Set(
          this.sql
            .exec<{ talent_id: string }>(
              'SELECT talent_id FROM line_talents WHERE user_id = ? AND line = ?',
              userId,
              creature.line,
            )
            .toArray()
            .map((r) => r.talent_id),
        );
        if (lessonTakes(POOLS[creature.line] ?? [], book, talent)) {
          recordFound(this.sql, userId, creature.line, { talentId: talent, golden: false }, at);
          this.sql.exec(
            `INSERT INTO school_students (user_id, week_key, lessons) VALUES (?, ?, 1)
             ON CONFLICT(user_id, week_key) DO UPDATE SET lessons = lessons + 1`,
            userId,
            seat.destination_id,
          );
          rec?.lesson(seat.creature_id, talent);
          learned += 1;
        }
      }
      this.sendHome(userId, seat);
    }
    return learned;
  }
}

export class ValleySchool {
  constructor(private readonly deps: ValleySchoolDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** The caller's creatures (id and line) that would learn the talent: the line's pool holds it and the line's book lacks it. */
  private learners(userId: string, talent: string): { id: string; line: string }[] {
    const books = booksByLine(this.sql, userId);
    const creatures = this.sql
      .exec<{ id: string; line: string }>(
        'SELECT id, line FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
        userId,
      )
      .toArray();
    return creatures.filter((c) =>
      lessonTakes(
        POOLS[c.line] ?? [],
        new Set((books.get(c.line) ?? []).map((e) => e.talentId)),
        talent,
      ),
    );
  }

  /** The School as the caller may see it. Settles first, so a lesson that fell due is learned and the student is home. */
  view(userId: string): Outcome<SchoolView> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      const now = this.deps.weeks.current();
      const talentId = now.row?.talent_id ?? null;
      const def = talentId === null ? undefined : combatV2.talents[talentId];
      const open = now.phase !== 'away' && now.weekKey !== null && def !== undefined;
      const rows = this.deps.lessons.seatRows(userId);
      const seats: SchoolSeatView[] = [];
      for (let index = 0; index < VALLEY_RULES.school.seats; index++) {
        const row = rows.find((r) => r.position === index);
        seats.push({
          index,
          creatureId: row?.creature_id ?? null,
          learnsAt:
            row?.creature_id == null
              ? null
              : this.deps.lessons.learnsAt(row.destination_id, row.passed_at),
        });
      }
      const stay = open && now.weekKey !== null ? this.deps.weeks.stayOf(now.weekKey) : null;
      return {
        phase: now.phase,
        talent: open && def !== undefined ? { id: def.id, name: def.name, text: def.text } : null,
        arrivesAt: stay?.from ?? null,
        leavesAt: stay?.until ?? null,
        seats,
        wouldLearn:
          open && talentId !== null ? this.learners(userId, talentId).map((c) => c.id) : [],
      };
    });
  }

  /**
   * V-SCH-13: seats a creature at the caller's student seat `index` (or empties the seat with `null`). Free, no key (like every post).
   * Taking a creature off its post is how every seat works: the post it stood at is remembered and takes the seat's old student (a swap),
   * and the student goes back to it after the lesson. 409 `no_teacher` (nobody is announced or here, or no talent benefits anyone this
   * week), `would_not_learn` (its line's pool lacks the talent or the book has it), `line_seated` (another student of the line already
   * sits there). 404 for a creature that is not the caller's.
   */
  seat(userId: string, input: { index: number; creatureId: string | null }): Outcome<SeatResult> {
    return atomically(this.deps.storage, () => {
      if (input.index < 0 || input.index >= VALLEY_RULES.school.seats) {
        throw new GameError(400, 'no_such_seat');
      }
      this.deps.settle.settle(userId, 'now');
      const now = this.deps.now();
      const rows = this.deps.lessons.seatRows(userId);
      const mine = rows.find((r) => r.position === input.index);
      if (input.creatureId === null) {
        if (mine?.creature_id != null) this.deps.lessons.sendHome(userId, mine);
        this.deps.settle.settle(userId, 'now');
        return { index: input.index, creatureId: null };
      }
      if (mine?.creature_id === input.creatureId)
        return { index: input.index, creatureId: input.creatureId };
      const creature = this.sql
        .exec<{ id: string; line: string }>(
          'SELECT id, line FROM creatures WHERE id = ? AND user_id = ?',
          input.creatureId,
          userId,
        )
        .toArray()[0];
      if (creature === undefined) throw new GameError(404, 'not_found');
      const school = this.deps.weeks.current(now);
      const talent = school.row?.talent_id ?? null;
      if (school.phase === 'away' || school.weekKey === null || talent === null) {
        throw new GameError(409, 'no_teacher');
      }
      if (!this.learners(userId, talent).some((c) => c.id === creature.id)) {
        throw new GameError(409, 'would_not_learn');
      }
      for (const other of rows) {
        if (other.position === input.index || other.creature_id === null) continue;
        const line = this.sql
          .exec<{ line: string }>('SELECT line FROM creatures WHERE id = ?', other.creature_id)
          .toArray()[0]?.line;
        if (line === creature.line) throw new GameError(409, 'line_seated');
      }
      // The seat's row is made the first time it is used.
      let seatId = mine?.seat_id;
      if (seatId === undefined) {
        seatId = crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO valley_seats (seat_id, user_id, place, kind, position, destination_id, prev_destination_id, passed_at)
           VALUES (?, ?, 'school', 'student', ?, ?, ?, ?)`,
          seatId,
          userId,
          input.index,
          school.weekKey,
          school.weekKey,
          now,
        );
      }
      // The post the creature comes from (any seat of the player's), which takes the seat's old student: a drag onto an occupied seat is a swap.
      const from = this.sql
        .exec<{ seat_id: string; place: string; home_seat_id: string | null }>(
          'SELECT seat_id, place, home_seat_id FROM valley_seats WHERE creature_id = ? AND user_id = ?',
          creature.id,
          userId,
        )
        .toArray()[0];
      const home =
        from === undefined ? null : from.place === 'school' ? from.home_seat_id : from.seat_id;
      if (from !== undefined) {
        this.sql.exec(
          'UPDATE valley_seats SET creature_id = ?, home_seat_id = NULL WHERE seat_id = ?',
          mine?.creature_id ?? null,
          from.seat_id,
        );
      } else if (mine?.creature_id != null) {
        // The seat's old student has no post to swap with: it goes back to its own.
        this.deps.lessons.sendHome(userId, mine);
      }
      this.sql.exec(
        `UPDATE valley_seats SET creature_id = ?, home_seat_id = ?, destination_id = ?, prev_destination_id = ?, passed_at = ?
         WHERE seat_id = ?`,
        creature.id,
        home,
        school.weekKey,
        school.weekKey,
        now,
        seatId,
      );
      // What the post earned up to now is booked, and the Forge and the Market see the new arrangement at once.
      this.deps.settle.settle(userId, 'now');
      return { index: input.index, creatureId: creature.id };
    });
  }
}
