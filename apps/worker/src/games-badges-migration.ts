/**
 * Migration 40: the Valley Games' event badges (docs/design/valley-games.md, "Medals"). A creature
 * collects a badge per event id it has won (gold, first place), with a win count: `games_badges`, one
 * row per creature and event id, written by the award (`games-award.ts`). A team's win counts once for
 * each member; a shared first place counts for everyone who shares it; bots never count.
 *
 * Back-filled here from what the Games already paid: the gold placings of real players on awarded
 * days (`games_placings.creature_ids` lists a team's members). Never edit this once released.
 */
export function gamesBadgesMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE games_badges (
    creature_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    wins INTEGER NOT NULL CHECK (wins >= 0),
    PRIMARY KEY (creature_id, event_id)
  )`);
  sql.exec('CREATE INDEX games_badges_by_user ON games_badges (user_id, event_id)');
  sql.exec(`INSERT INTO games_badges (creature_id, event_id, user_id, wins)
    SELECT m.value, p.event_id, MAX(p.user_id), COUNT(*)
    FROM games_placings p
    JOIN games_days d ON d.day = p.day
    JOIN json_each(p.creature_ids) m
    WHERE p.medal = 'gold' AND p.bot = 0 AND d.awarded_at IS NOT NULL
    GROUP BY m.value, p.event_id`);
}
