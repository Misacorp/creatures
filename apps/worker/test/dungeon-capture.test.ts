import { describe, it } from 'vitest';
import { runCore } from './helpers';
import { dungeonScenarioOptions, runDungeonScenario } from './dungeon-scenario';
import { nextGuild } from './raid-helpers';

/**
 * Re-captures the dungeon fixtures from real server output. Skipped: it only prints. To use it, change
 * `it.skip` to `it`, run `pnpm --filter @creatures/worker exec vitest run test/dungeon-capture.test.ts
 * --disable-console-intercept`, and split the `FIXTURE-DUNGEON` line into the files of
 * `apps/activity/src/fixtures`: every key of `responses` is `<key>.json`, `errors` is
 * `dungeon-errors.json` and `requests` is `dungeon-request-bodies.json`. `dungeon-fixtures.test.ts`
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
