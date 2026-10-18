import { describe, it } from 'vitest';
import { branchesScenarioOptions, runBranchesScenario } from './branches-scenario';
import { runCore } from './helpers';
import { nextGuild } from './raid-helpers';

/**
 * Re-captures the branch evolution fixtures from real server output. Skipped: it only prints. To use it,
 * change `it.skip` to `it`, run `pnpm --filter @creatures/worker exec vitest run
 * test/branches-capture.test.ts --disable-console-intercept`, and split the `FIXTURE-BRANCHES` line into
 * the files of `apps/activity/src/fixtures`: every key of `responses` is `<name>.json`, `errors` is
 * `branches-errors.json` and `requests` is `branches-request-bodies.json`.
 * `branches-fixtures.test.ts` then checks them.
 */
describe('capture the branches fixtures', () => {
  it.skip('prints the fixtures', async () => {
    const options = branchesScenarioOptions();
    const captured = await runCore(
      nextGuild(),
      (ctx) => runBranchesScenario(ctx, options.talentRng),
      options,
    );
    console.log('FIXTURE-BRANCHES ' + JSON.stringify(captured));
  });
});
