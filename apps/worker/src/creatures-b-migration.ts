/**
 * Migration 30: training by activity ("Creatures B", docs/design/gear-and-creatures-v2.md section 9) and
 * the new-species pity (decisions.md, 2026-10-17). Never edit a released migration.
 *
 * - `creatures.exp` is the experience banked towards the next level; `creatures.ribbons` is how many
 *   ribbons the creature holds (0 none, 1 Bronze, 2 Silver, 3 Gold). Existing creatures get the ribbons
 *   they are past (spec 12): Bronze above level 10, Silver above level 20, Gold at level 30. Levels,
 *   fusions, quirks, nicknames and talents stay. The numbers are written out here on purpose: a released
 *   migration must not change when the rules are tuned.
 * - `expeditions.treat` is 1 when a treat was packed for the trip (it doubles the explorer's experience).
 *   A Workshop job keeps its treat in its stored input and a dungeon run in its stored rewards, so
 *   neither needs a column.
 * - `player_progress.pity_new` and `pity_creature` are the pity counters: catch rolls since the player
 *   last got a new species, and since they last got any creature.
 */
export function creaturesBMigration(sql: SqlStorage): void {
  sql.exec('ALTER TABLE creatures ADD COLUMN exp INTEGER NOT NULL DEFAULT 0 CHECK (exp >= 0)');
  sql.exec(
    'ALTER TABLE creatures ADD COLUMN ribbons INTEGER NOT NULL DEFAULT 0 CHECK (ribbons BETWEEN 0 AND 3)',
  );
  sql.exec(`UPDATE creatures SET ribbons = CASE
    WHEN level >= 30 THEN 3
    WHEN level > 20 THEN 2
    WHEN level > 10 THEN 1
    ELSE 0
  END`);
  sql.exec(
    'ALTER TABLE expeditions ADD COLUMN treat INTEGER NOT NULL DEFAULT 0 CHECK (treat IN (0, 1))',
  );
  sql.exec(
    'ALTER TABLE player_progress ADD COLUMN pity_new INTEGER NOT NULL DEFAULT 0 CHECK (pity_new >= 0)',
  );
  sql.exec(
    'ALTER TABLE player_progress ADD COLUMN pity_creature INTEGER NOT NULL DEFAULT 0 CHECK (pity_creature >= 0)',
  );
}
