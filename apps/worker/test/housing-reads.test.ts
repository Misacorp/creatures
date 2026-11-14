// The read budget of player housing (`docs/design/database-reads.md`, checklist: measure rows per occurrence, price how often, add the
// path to the checks). The seeded guild is `read-world.ts`: 15 players, a month of history. Here every player also has a FULL house (every
// part built, every spot filled, every piece, skin, stamp, blueprint and material held, the guestbook at its keep, a mailbox with 20 gifts,
// a trophy hall with every display fed): the worst case of each path, on the build with housing on. Housing reads nothing on
// `/api/state`, an alarm tick or the object's start, so those must stay under the budgets `read-budget.test.ts` sets for them.
//
// Budgets are about 1.5x the rows read when they were set (the measured value is next to each). Raise one only with a reason in the PR.
import { describe, it } from 'vitest';
import { MINUTE } from './kit';
import { expectReadsUnder, expectWritesUnder, type ReadReport } from './read-meter';
import { BUILD, callAs, inGuild, seedWorld } from './read-world';
import { housingCore, runHousingPaths } from './housing-world';

/** What each housing path may read and write; the measured numbers are for a server of 15 full houses. */
const BUDGET = {
  own: { reads: 820, writes: 5 }, // measured 541 read, 1 written: the whole house view (displays 9 and every item row of a hoarder: 320) and the own view (mail 20, drops 14, parts, rooms, purse)
  visit: { reads: 480, writes: 5 }, // measured 317, 2 written (another house: its pieces, rooms, displays, guestbook of 30)
  list: { reads: 330, writes: 5 }, // measured 220, 1 written (15 houses: 15 names and each house's part rows)
  catalogue: { reads: 700, writes: 5 }, // measured 550, 1 written (2026-11-12, housing C5: a hoarder holds every skin and blueprint, one item row each by the same statement, no new statement; the budget was 830 while starter rows were written, now lowered with the same headroom as the other paths)
  pay: { reads: 70, writes: 25 }, // measured 48, 14 written: a partial payment into a part (the common call)
  build: { reads: 105, writes: 40 }, // measured 68, 20 written (was 582): the payment that finishes a part answers with its new rooms, displays and lists, not the house
  craft: { reads: 85, writes: 25 }, // measured 55, 14 written (was 420): one id's checks, the debit, and the new count, purse and materials
  place: { reads: 250, writes: 10 }, // measured 167, 4 written
  skin: { reads: 40, writes: 10 }, // measured 27, 6 written (was 465): answers with the room or the exterior only
  housemate: { reads: 260, writes: 10 }, // measured 172, 4 written
  gift: { reads: 75, writes: 15 }, // measured 48, 3 written: was 27 before the mailbox cap; the cap check counts the receiver's open mail (20 here, at most 30)
  stamp: { reads: 160, writes: 15 }, // measured 105, 7 written (14 visitor names of the guestbook)
  collect: { reads: 160, writes: 75 }, // measured 107, 49 written (20 gifts claimed, the credit and its ledger rows)
  seen: { reads: 60, writes: 25 }, // measured 39, 16 written (the "+N" of 16 materials)
  // The paths housing must not touch: the budgets of `read-budget.test.ts` (measured 398 and 23 here, with 15 full houses present).
  state: { reads: 700, writes: 10 },
  alarm: { reads: 30, writes: 5 },
} as const;

describe('read budget with housing on', () => {
  const measured: Record<string, ReadReport> = {};

  it('measures every housing path on 15 full houses, and the state and the alarm beside them', async () => {
    await inGuild(
      async (env) => {
        const { metered, clock } = env;
        // The seeded world's own core has no housing: the one measured is a second object of the same build with the flag on.
        const world = await seedWorld(env);
        const core = housingCore(env, world, BUILD);
        clock.t += 6 * MINUTE;
        // Warm: today's one-off work is not housing's.
        await callAs(core, world.secrets, 1, '/api/me');
        await callAs(core, world.secrets, 1, '/api/state');
        await callAs(core, world.secrets, 1, '/api/house');
        clock.t += MINUTE;
        const measure = async (name: string, fn: () => Promise<unknown>): Promise<void> => {
          measured[name] = (await metered.measure(fn)).reads;
        };
        await measure('state', () => callAs(core, world.secrets, 1, '/api/state'));
        await measure('alarm', () => core.alarm());
        await runHousingPaths(env, world, core, measure);
      },
      { fresh: true },
    );
  }, 120_000);

  it.each(Object.keys(BUDGET) as (keyof typeof BUDGET)[])(
    '%s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      expectReadsUnder(`housing ${name}`, reads, BUDGET[name].reads);
      expectWritesUnder(`housing ${name}`, reads, BUDGET[name].writes);
    },
  );
});
