import { describe, it } from 'vitest';
import { runCore } from './helpers';
import { dungeonScenarioOptions, runDungeonScenario } from './dungeon-scenario';
import { nextGuild } from './raid-helpers';

/**
 * Re-captures the dungeon fixtures from real server output. Skipped: it only prints. To use it, change
 * `it.skip` to `it`, run `pnpm --filter @creatures/worker exec vitest run test/dungeon-capture.test.ts
 * --disable-console-intercept`, and split the `FIXTURE-DUNGEON` line into the files of
 * `apps/activity/src/fixtures`: every key of `responses` is `<key>.json`, `errors` is
 * `dungeon-errors.json` (its last rows: the rows of the older run route come first and stay) and `requests` is
 * `dungeon-request-bodies.json` (merged into the older entries). `dungeon-fixtures.test.ts`
 * then checks them.
 */
describe('capture the dungeon fixtures', () => {
  it.skip('prints the fixtures', async () => {
    const captured = await runCore(nextGuild(), (ctx) => runDungeonScenario(ctx), {
      ...dungeonScenarioOptions(),
    });
    console.log('FIXTURE-DUNGEON ' + JSON.stringify(captured));
  });
});
