import { describe, it } from 'vitest';
import { runCore } from './helpers';
import { creaturesScenarioOptions, runCreaturesScenario } from './creatures-scenario';
import { nextGuild } from './raid-helpers';

/**
 * Re-captures the duplicate-choice and Talent Book fixtures from real server output. Skipped: it only
 * prints. To use it, change `it.skip` to `it`, run `pnpm --filter @creatures/worker exec vitest run
 * test/creatures-capture.test.ts --disable-console-intercept`, and split the `FIXTURE-CREATURES` line into
 * the files of `apps/activity/src/fixtures`: every key of `responses` is `<name>.json`, `errors` is
 * `creatures-errors.json` and `requests` is `creatures-request-bodies.json`. `creatures-fixtures.test.ts`
 * then checks them.
 */
describe('capture the creatures fixtures', () => {
  it.skip('prints the fixtures', async () => {
    const options = creaturesScenarioOptions();
    const captured = await runCore(
      nextGuild(),
      (ctx) => runCreaturesScenario(ctx, options.talentRng),
      options,
    );
    console.log('FIXTURE-CREATURES ' + JSON.stringify(captured));
  });
});
