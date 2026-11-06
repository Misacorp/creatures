/**
 * Migration 65: the School's weekly teacher and lessons (phase 5 step 9, docs/design/valley/systems/school.md V-SCH-10 to 13). Additive:
 * production runs it with the flag off and both tables stay empty.
 *
 * - `school_weeks`: one row per teacher, made the first time the server sees the announcement (Friday, `teacherAnnounceDays` ahead) or the
 *   stay. `week_key` is the guild-local Monday the stay starts on (`YYYY-MM-DD`), `talent_id` the one talent drawn by the band rule
 *   from the books as they stood then (null: no talent benefits anyone, so no teacher that week), `picked_at` when the row was made,
 *   `posted_at` when the announcement post was queued (null: no channel yet, or nothing to post). `forced` is 1 when the staging dev tool brought the teacher now (the stay
 *   then counts as now until the week ends) and 2 when it announced the teacher now (it counts as announced until the stay). `players` and `benefits` record how many
 *   players the server had and how many the talent would benefit at the draw (the lab's "benefits 22 to 39% of visits"). No `user_id`:
 *   the `valley-fresh` tool clears it whole (`VALLEY_GUILD_TABLES`).
 * - `school_students`: one row per player per teacher week, made at the first thing that concerns the player: `told` 1 once the Gazette
 *   told them the teacher is announced or here, `lessons` how many of their creatures learned the talent that week. It carries `user_id`,
 *   so `purgeUser` clears it.
 * - `valley_seats.home_seat_id`: for a School seat (`place = 'school'`, `kind = 'student'`) the seat the student was taken from, so it
 *   goes back to its post by itself after the lesson (null: it came from the fire). The seat's `destination_id` is the teacher's week
 *   (`school_weeks.week_key`) and `passed_at` the moment it was seated.
 *
 * Both tables are read by their primary key (one row each), so there is no further index.
 */
export function valleySchoolMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS school_weeks (
    week_key TEXT PRIMARY KEY,
    talent_id TEXT,
    picked_at INTEGER NOT NULL,
    posted_at INTEGER,
    forced INTEGER NOT NULL DEFAULT 0,
    players INTEGER NOT NULL DEFAULT 0,
    benefits INTEGER NOT NULL DEFAULT 0
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS school_students (
    user_id TEXT NOT NULL,
    week_key TEXT NOT NULL,
    told INTEGER NOT NULL DEFAULT 0,
    lessons INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, week_key)
  )`);
  sql.exec('ALTER TABLE valley_seats ADD COLUMN home_seat_id TEXT');
}
