/**
 * Migration 31: Boons and Omens (docs/design/gear-and-creatures-v2.md section 10; see `weather.ts`). Never
 * edit a released migration. Like the other game tables there are no foreign keys: rows are only written
 * by the weather code, always inside a transaction.
 *
 * - `weather_days` is one row per game day (named by the guild-local date it starts on, `gameDay`): the
 *   Boon and Omen drawn for it, a day ahead, with the live server random source, and the strength they
 *   were drawn at (`boon_bp` and `omen_bp`, 10000 is x1; the Boss Rank at the draw decides it). Strength is
 *   stored, not derived, so a rank change between the draw and the day never changes what players were
 *   shown. `week_id` is the raid week the day falls in (one wild Omen a week at most), `festival` whether
 *   that week is a Festival (Boons only), `drawn_at` when the draw was made (a wild Omen needs it to be
 *   before the day starts: always known a day ahead).
 * - `expeditions.weather_json` is what the day did to a trip when it was sent (its time, extra rolls,
 *   chances, experience): the claim reads this and never the weather, so it is deterministic. Trips from
 *   before this migration have none and read as a trip under no weather.
 *
 * A Workshop job keeps its day's effects in its stored input, a dungeon run in its stored input and
 * summary, and a raid stage in its stored fight input, so none of them needs a column.
 */
export function weatherMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE weather_days (
    day TEXT PRIMARY KEY,
    boon TEXT NOT NULL,
    omen TEXT,
    wild INTEGER NOT NULL DEFAULT 0 CHECK (wild IN (0, 1)),
    boon_bp INTEGER NOT NULL CHECK (boon_bp > 0),
    omen_bp INTEGER NOT NULL CHECK (omen_bp >= 0),
    rank INTEGER NOT NULL CHECK (rank >= 1),
    week_id TEXT NOT NULL,
    festival INTEGER NOT NULL DEFAULT 0 CHECK (festival IN (0, 1)),
    drawn_at INTEGER NOT NULL
  )`);
  sql.exec('CREATE INDEX weather_days_week ON weather_days(week_id)');
  sql.exec('ALTER TABLE expeditions ADD COLUMN weather_json TEXT');
}
