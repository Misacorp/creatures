import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { GuildCore } from '../src/guild-core';
import { pendingLevelReset } from '../src/level-reset';
import { runCore } from './helpers';
import { seedPlayer } from './raid-helpers';

/** How many talents the creature holds. */
function talents(sql: SqlStorage, creatureId: string): number {
  return Number(
    sql.exec('SELECT COUNT(*) AS n FROM creature_talents WHERE creature_id = ?', creatureId).one()[
      'n'
    ],
  );
}

describe('start-up passes', () => {
  it('run once per deployed build, and on every start without one', async () => {
    await runCore('startup-passes-guild', (ctx) => {
      const start = (build?: string) => {
        new GuildCore(ctx.storage, () => ctx.clock.t, {
          guildId: () => ctx.guildId,
          talentRng: createSeededRng('startup'),
          ...(build === undefined ? {} : { build }),
        }).migrate();
      };
      // A creature without a talent: the kind of work the missing-talents pass picks up.
      const [creature] = seedPlayer(ctx, 1, { creatures: 1 }).creatureIds as [string];
      ctx.sql.exec('DELETE FROM creature_talents WHERE creature_id = ?', creature);
      start('build-a');
      expect(talents(ctx.sql, creature)).toBeGreaterThan(0);

      // The same build starts again (a wake after sleeping): the passes are skipped.
      ctx.sql.exec('DELETE FROM creature_talents WHERE creature_id = ?', creature);
      start('build-a');
      expect(talents(ctx.sql, creature)).toBe(0);

      // A new deploy runs them again, and so does a start without a build (local dev, tests).
      start('build-b');
      expect(talents(ctx.sql, creature)).toBeGreaterThan(0);
      ctx.sql.exec('DELETE FROM creature_talents WHERE creature_id = ?', creature);
      start('build-b');
      expect(talents(ctx.sql, creature)).toBe(0);
      start();
      expect(talents(ctx.sql, creature)).toBeGreaterThan(0);
    });
  });

  it('reads no level reset notice before its table exists', async () => {
    await runCore('startup-passes-level-reset', (ctx) => {
      ctx.sql.exec('DROP TABLE IF EXISTS level_reset');
      expect(pendingLevelReset(ctx.sql, '111111111111111111')).toBeNull();
    });
  });
});
