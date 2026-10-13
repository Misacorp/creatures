import { createSeededRng } from '@creatures/game';
import { describe, it } from 'vitest';
import { runCore } from './helpers';
import { runExpeditionScenario, runGearScenario } from './gear-scenario';
import { nextGuild } from './raid-helpers';

/**
 * Re-captures the gear fixtures from real server output. Skipped: it only prints. To use it, change
 * `it.skip` to `it`, run `pnpm --filter @creatures/worker exec vitest run test/gear-capture.test.ts
 * --disable-console-intercept`, and split the two `FIXTURE-` lines into the files of
 * `apps/activity/src/fixtures` (`gear-*.json`, `workshop-*.json`, `expedition-claim-loot.json`,
 * `collection-state.json`; the names are the keys of `responses`, and `errors` and `requests` are
 * `gear-errors.json` and `gear-request-bodies.json`). `gear-fixtures.test.ts` then checks them.
 */
describe('capture the gear fixtures', () => {
  it.skip('prints the fixtures', async () => {
    const main = await runCore(nextGuild(), (ctx) => runGearScenario(ctx), {
      gearRng: createSeededRng('fixture-gear'),
    });
    console.log('FIXTURE-MAIN ' + JSON.stringify(main));
    const script = [0, 0, 0, 0, 0];
    let i = 0;
    const rest = createSeededRng('fixture-exp');
    const exp = await runCore(nextGuild(), (ctx) => runExpeditionScenario(ctx), {
      rng: createSeededRng('fixture-catch'),
      gearRng: { nextU32: () => script[i++] ?? rest.nextU32() },
    });
    console.log('FIXTURE-EXP ' + JSON.stringify(exp));
  });
});
