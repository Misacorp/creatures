/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   The local dry run of the simulated month prints its answers; `Json.body` is `any` on purpose. */
/**
 * The simulated month, locally (phase 5 step 10): `pnpm --filter @creatures/worker month:local` runs the whole month in the worker's test
 * harness (`vitest.month.config.ts`; the normal suite leaves this file out, a month is too slow for CI) and prints the lab-shaped live
 * report between two marker lines. `apps/worker/scripts/valley-month.mjs` does the same against a running Worker (staging, or `wrangler
 * dev`); this is the dry run that needs no account: valley-fresh, valley-bots, 28 `valley-sim-day` calls, valley-report.
 */
import { describe, it } from 'vitest';
import { ON, player } from './dev-helpers';
import { runCore } from './helpers';
import { nextGuild } from './raid-helpers';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;

describe('the simulated month, locally', () => {
  it('plays 28 game days of the bots and prints the report', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        await p.tool('valley-fresh', {});
        await p.tool('valley-bots', {});
        const started = Date.now();
        for (let day = 0; day < 28; day++) {
          // The per-player rate limit (a burst of 30, one request a second): a second of real time between calls, as the script waits.
          ctx.clock.t += 2_000;
          const result = await p.tool('valley-sim-day', {});
          console.log(
            `day ${String(day + 1)}: ${String(result.visits)} visits, rows read ${String(result.rows.read)}, written ${String(result.rows.written)}`,
          );
        }
        ctx.clock.t += 2_000;
        const report = await p.tool('valley-report', {});
        console.log(
          `month took ${String(Date.now() - started)} ms (clock may be coarse in the Worker runtime)`,
        );
        console.log('LIVE-REPORT-BEGIN');
        console.log(JSON.stringify(report.report));
        console.log('LIVE-REPORT-END');
        console.log(`MONTH-ROWS ${JSON.stringify(report.month.rowsTotal)}`);
        console.log(`MONTH-DECLINED ${JSON.stringify(report.month.declined)}`);
        console.log(`MONTH-FIRST-LEVELUP ${String(report.month.firstLevelUpDay)}`);
      },
      SYSTEMS,
    );
  }, 1_200_000);
});
