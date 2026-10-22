import { fusionLevel, fusionThreshold } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/migrations';
import { runCore, undoFusionPointsMigration } from './helpers';
import { nextGuild, rows, seedPlayer } from './raid-helpers';
import { setCreature } from './kit';

describe('migration 37', () => {
  it('gives every creature the points of the fusion level it has', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(37);
    await runCore(nextGuild(), (ctx) => {
      const levels = [0, 1, 2, 3, 4, 5];
      const p = seedPlayer(ctx, 1, { creatures: levels.length, level: 5 });
      p.creatureIds.forEach((id, i) => {
        setCreature(ctx, id, { fusion_count: levels[i] ?? 0 });
      });
      undoFusionPointsMigration(ctx.sql);
      expect(
        rows<{ name: string }>(ctx.sql, "SELECT name FROM pragma_table_info('creatures')").map(
          (r) => r.name,
        ),
      ).not.toContain('fusion_points');
      ctx.core.migrate();
      ctx.core.migrate();
      const after = rows<{ fusion_count: number; fusion_points: number }>(
        ctx.sql,
        'SELECT fusion_count, fusion_points FROM creatures ORDER BY rowid',
      );
      // The points are the level's threshold, so the level is kept exactly (and never lower).
      expect(after.map((c) => c.fusion_points)).toEqual([0, 1, 4, 9, 18, 34]);
      for (const c of after) {
        expect(fusionLevel(c.fusion_points)).toBe(c.fusion_count);
        expect(c.fusion_points).toBe(fusionThreshold(c.fusion_count));
      }
      expect(
        rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
      ).toBe(SCHEMA_VERSION);
      return Promise.resolve();
    });
  });
});
