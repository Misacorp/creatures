/**
 * Migration 37: fusion points (docs/design/decisions.md, 2026-10-20). A fusion level is now reached by
 * gathering points (each duplicate fused in adds points by its rarity), so `creatures.fusion_points`
 * stores them; `fusion_count` stays and is the level those points have reached.
 *
 * Existing creatures keep the level they have: their points start at that level's threshold (1, 3, 6, 11
 * and 19 for levels 1 to 5). The numbers are written out here on purpose: a released migration must not
 * change when the rules are tuned. Never edit a released migration.
 */
export function fusionPointsMigration(sql: SqlStorage): void {
  sql.exec(
    'ALTER TABLE creatures ADD COLUMN fusion_points INTEGER NOT NULL DEFAULT 0 CHECK (fusion_points >= 0)',
  );
  sql.exec(`UPDATE creatures SET fusion_points = CASE fusion_count
    WHEN 1 THEN 1
    WHEN 2 THEN 3
    WHEN 3 THEN 6
    WHEN 4 THEN 11
    WHEN 5 THEN 19
    ELSE 0
  END`);
}
