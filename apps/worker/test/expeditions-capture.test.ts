import { describe, it } from 'vitest';
import { runCore } from './helpers';
import { runTripsScenario, tripsScenarioOptions } from './expeditions-scenario';
import { nextGuild } from './raid-helpers';

/**
 * Re-captures the expedition fixtures from real server output. Skipped: it only prints. To use it,
 * change `it.skip` to `it`, run `pnpm --filter @creatures/worker exec vitest run
 * test/expeditions-capture.test.ts --disable-console-intercept`, and split the `FIXTURE-TRIPS` line
 * into the files of `apps/activity/src/fixtures`: every key of `responses` is `<name>.json`, `errors` is
 * `expedition-errors.json` and `requests` is `expedition-request-bodies.json`.
 * `expeditions-fixtures.test.ts` then checks them.
 */
describe('capture the expedition fixtures', () => {
  it.skip('prints the fixtures', async () => {
    const { draw, options } = tripsScenarioOptions();
    const captured = await runCore(nextGuild(), (ctx) => runTripsScenario(ctx, draw), options);
    console.log('FIXTURE-TRIPS ' + JSON.stringify(captured));
  });
});
