// The read budget of player housing (`docs/design/database-reads.md`, checklist: measure rows per occurrence, price how often, add the
// path to the checks). The seeded guild is `read-world.ts`: 15 players, a month of history. Here every player also has a FULL house (every
// part built, every spot filled, every piece, skin, stamp, blueprint and material held, the guestbook at its keep, a mailbox with 20 gifts,
// a trophy hall with every display fed): the worst case of each path, on the build with housing on. Housing reads nothing on
// `/api/state`, an alarm tick or the object's start, so those must stay under the budgets `read-budget.test.ts` sets for them.
//
// Budgets are about 1.5x the rows read when they were set (the measured value is next to each). Raise one only with a reason in the PR.
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { MINUTE } from './kit';
import { expectReadsUnder, expectWritesUnder, type ReadReport } from './read-meter';
import { BUILD, callAs, inGuild, seedWorld, userId } from './read-world';
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
  // The reward hook (`HousingDrops.drop`), one moment each, for a player with a full house; the budget is the one `housing-drops.test.ts` sets for an empty one.
  dropTrip: { reads: 260, writes: 40 },
  dropScout: { reads: 260, writes: 40 },
  dropDungeon: { reads: 260, writes: 40 },
  dropRaid: { reads: 260, writes: 40 },
  dropGames: { reads: 260, writes: 40 },
} as const;

const MOMENTS = {
  dropTrip: { kind: 'trip', key: 'trip:m', place: 'tidepools', element: 'tide', ticks: 9 },
  dropScout: {
    kind: 'scout',
    key: 'scout:m',
    place: 'tidepools',
    element: 'tide',
    finds: 7,
    hours: 24,
  },
  dropDungeon: { kind: 'dungeon', key: 'dungeon:m', depth: 10, cleared: true },
  dropRaid: {
    kind: 'raid',
    key: 'raid:m',
    weekId: '2027-W02',
    bossId: 'tidal-colossus',
    rank: 3,
    cleared: true,
    festival: null,
    element: 'tide',
  },
  dropGames: { kind: 'games', key: 'games:m', medal: 'gold' },
} as const;

// Measured again on 2026-11-14 on main with the valley and combat v2 merged (rows read/written, housing alone; each is 2 more with the three flags
// on): own 762/1, visit 366/2, list 276/1, catalogue 550/1, pay 52/14, build 72/20, craft 55/14, place 220/4, skin 26/4, housemate 221/4,
// gift 48/9, stamp 105/7, collect 108/49, seen 39/16; the hook: 3/4 for a trip, scout, dungeon and games moment, 243/7 for a raid moment that
// rolls a blueprint. The comments beside the budgets keep the numbers they were set from; every budget still holds (own is the tightest).
//
// The file runs twice: with housing alone, and with housing, the valley systems and combat v2 all on (the three together are what production
// will run). The same budgets cover both.
const FLAG_SETS = [
  { label: 'housing alone', world: {}, flags: {}, state: BUDGET.state },
  {
    label: 'housing, valley systems and combat v2',
    world: { combatV2: true, valleySystems: true },
    flags: { combatV2: true, valleySystems: true },
    // The valley's own budget for the first look (`read-budget.test.ts`, `VALLEY_BUDGET.open`): the state itself reads 799 here with housing off or on.
    state: { reads: 1000, writes: 125 },
  },
] as const;

describe.each(FLAG_SETS)('read budget with $label on', ({ world: worldFlags, flags, state }) => {
  const measured: Record<string, ReadReport> = {};
  // The start, the state and the alarm of an object of the same build with housing off and on, on the same 15 full houses.
  const without: Record<string, ReadReport> = {};
  const withHousing: Record<string, ReadReport> = {};

  it('measures every housing path on 15 full houses, and the state and the alarm beside them', async () => {
    await inGuild(
      async (env) => {
        const { metered, clock } = env;
        // The seeded world's own core has no housing: the one measured is a second object of the same build with the flag on.
        const world = await seedWorld(env, worldFlags);
        const core = housingCore(env, world, BUILD, flags);
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
        // Each reward moment for player 1 (a full house), on an object with a seeded hook draw.
        const hooked = env.mk(BUILD, {
          housing: true,
          housingRng: createSeededRng('housing-reads'),
          ...flags,
        });
        const hook = hooked.housingHook;
        if (hook === null) throw new Error('no hook');
        for (const [name, moment] of Object.entries(MOMENTS)) {
          await measure(name, () => {
            hook.drop(userId(1), moment);
            return Promise.resolve();
          });
        }
      },
      { fresh: true },
    );
    console.info(
      `housing rows read/written (${Object.keys(flags).join('+') || 'housing alone'})`,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(measured).map(([k, r]) => [k, `${String(r.total)}/${String(r.written)}`]),
        ),
      ),
    );
  }, 120_000);

  it.each(Object.keys(BUDGET) as (keyof typeof BUDGET)[])(
    '%s reads and writes few rows',
    (name) => {
      const reads = measured[name];
      if (reads === undefined) throw new Error('the measuring test did not run');
      const budget = name === 'state' ? state : BUDGET[name];
      expectReadsUnder(`housing ${name}`, reads, budget.reads);
      expectWritesUnder(`housing ${name}`, reads, budget.writes);
    },
  );

  it('adds no rows to the start, /api/state or the alarm tick (housing on against off)', async () => {
    // Two identical guilds (the same 15 full houses); one is read by an object with housing on, the other with it off.
    const run = async (housing: boolean, into: Record<string, ReadReport>): Promise<void> => {
      await inGuild(
        async (env) => {
          const { metered, clock } = env;
          const world = await seedWorld(env, worldFlags);
          const seeded = housingCore(env, world, BUILD, flags);
          const core = housing ? seeded : env.mk(BUILD, flags);
          clock.t += 6 * MINUTE;
          await callAs(core, world.secrets, 1, '/api/me');
          await callAs(core, world.secrets, 1, '/api/state');
          clock.t += MINUTE;
          // The object's start: a new core on the storage, then its schema pass.
          into['start'] = (
            await metered.measure(() => {
              env.mk(BUILD, housing ? { housing: true, ...flags } : flags).migrate();
              return Promise.resolve();
            })
          ).reads;
          into['state'] = (
            await metered.measure(() => callAs(core, world.secrets, 1, '/api/state'))
          ).reads;
          into['alarm'] = (await metered.measure(() => core.alarm())).reads;
        },
        { fresh: true },
      );
    };
    await run(false, without);
    await run(true, withHousing);
    const totals = (r: Record<string, ReadReport>) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.total]));
    console.info(
      'housing off/on rows read',
      JSON.stringify({ flags: Object.keys(flags), off: totals(without), on: totals(withHousing) }),
    );
    // The start and the alarm are exact. A request's rows vary by a row or two between identical runs (two runs of the same guild with
    // housing off read 797 and 799 of the valley's `/api/state`, 398 and 399 of the plain one), so the state may differ by 3 at most.
    for (const [name, slack] of [
      ['start', 0],
      ['state', 3],
      ['alarm', 0],
    ] as const) {
      const a = without[name]?.total ?? NaN;
      const b = withHousing[name]?.total ?? NaN;
      expect(
        Math.abs(b - a),
        `${name}: housing on read ${String(b)}, off ${String(a)}`,
      ).toBeLessThanOrEqual(slack);
    }
  }, 120_000);
});
