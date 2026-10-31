# Testing plan

Status: **adopted**, 2026-10-18 (the overnight cleanup). Before this there was no written plan, and the long timeouts hid slow growth: the simulator's "tiny" test run grew from about a second to 37 s, and CI from a few minutes to 10.

**Goal.** Every rule is proven once, at the lowest layer that can prove it, and the PR checks finish in under
5 minutes. Tests are deterministic (seeded RNG, injected clock); live randomness is never asserted statistically
in the worker.

**Layers**

1. **Pure rules and content** (`packages/game`, `packages/engine`). Formulas, odds tables, draw order, content
   schemas, the combat engine, glossary. Exact assertions on small inputs; statistical checks only with a fixed
   seed and the smallest N that gives at least 5 standard deviations of margin. Budget: under 1 s per file,
   under 20 s per package.
2. **Server integration** (`apps/worker`, vitest Cloudflare pool, a real Durable Object per test). Wiring only:
   routes, schemas (reject unknown keys, limits), auth from the session, idempotency and races, transactions,
   migrations, that live randomness is drawn on the server at the right moment, and that the worker passes the
   right inputs to the pure rules. One or a few requests per behaviour, not loops of dozens. Budget: under 1 s
   per test, under 15 s per file. Each new file costs about 3 s of runtime start-up, so add to an existing file
   when the topic fits.
3. **Contract fixtures** (worker `*-fixtures.test.ts`; activity `server-contract` tests). The worker proves its real responses match the fixtures; the client proves it parses
   every fixture. This is how the two sides stay in sync without end-to-end browser tests. The fixtures are
   captured from the real server, never edited by hand: `pnpm fixtures:capture` plays the five scenario sets
   (branches, creatures, dungeon, expeditions, gear; one list, `apps/worker/test/fixture-sets.ts`, which also owns
   each set's seeded rngs) and writes the files of `apps/activity/src/fixtures` whole. Every UUID gets a stable id
   (`00000000-0000-4000-8<set>00-<counter>`, in order of first appearance), so a re-capture changes only what the
   server really changed and the client tests can name ids. `--set <name>` captures one set; `--check` writes
   nothing and exits 1 if a file would change (right after a capture it must exit 0). After a capture, review the
   diff and say in the PR what moved and why. The five `*-fixtures.test.ts` files play the same sets and compare
   shapes (`test/fixture-contract.ts`: `expectSameShape`, `createRecorder`). Not covered yet (phase 2): the raid
   and live fixtures (`live-*`, `action-*`, `practice-*`, `raid-*`, `errors.json`, `request-bodies.json`) have no
   scenario and are guarded by key lists in `raid-live.test.ts`; the older all-at-once dungeon fixtures
   (`dungeon-run-*`, `dungeon-today*` without the map, `dungeon-replay`, `dungeon-team-draft`,
   `dungeon-legacy-*`) are kept as the shapes of stored runs and are never captured.
4. **Client** (`apps/activity`, vitest + Preact). Pure view helpers and parsers first; component tests for
   interaction and accessibility rules; the in-memory build test that keeps dev tools out of production.
   Budget: under 2 s per file.
5. **Simulator** (`packages/sim`). Unit tests check the simulator's code (policies, analysis, report shape, CLI
   arguments and exit codes) on `TINY` settings with short horizons; one shared full-pipeline run per file at
   most. Balance itself is checked by the `sim` workflow (`pnpm sim:quick` on PRs that touch rules, engine,
   content or sim; `pnpm sim` on demand), whose target misses are reported, not failed. Budget: under 15 s per
   test, under 2 min for the package.
6. **Combat lab** (`packages/lab`). Its tests play out many seeded weekends and dungeon runs, so they are the
   slowest in the repo. Budget: the package finishes in about 10 s wall on 4 cores, and no single test file takes
   over about 6 s. Vitest runs files in parallel but the tests inside one file in turn, so a file over budget is
   split by topic (shared helpers in `test/helpers/`, not a `.test.ts` file), never given a longer timeout. To find
   the slow ones: `cd packages/lab && npx vitest run --reporter=json --outputFile=/tmp/v.json`, then read each
   file's `endTime - startTime` and each test's `duration`. The boss tests were split from one 22 s file into
   `boss*.test.ts` and `dungeon.test.ts` for this (2026-10-29).
7. **Economy lab** (`packages/econ`, the valley's proposed rules). Tests run the model on one or two seeds with
   short horizons and check invariants (no negative balances, conservation, determinism), the tuner on a tiny fake
   model, and the targets and dials as data. Speed budget: the full report (`pnpm --filter @creatures/econ report`,
   15+ servers over 20 seeds, one worker thread per core) under 30 s, the package's tests under 15 s. The report
   prints its seconds per section and a warning when over; `pnpm --filter @creatures/econ speed` runs the tests and
   fails when over. Over budget is a finding: speed the model up or move a check down a layer, do not raise it
   quietly. A quick look is `report -- --scenario <id> --seeds 5` (a second or two); changing numbers is the tuner's
   job (`tune -- --dials a,b`), not an agent's edit-and-rerun loop.

**Rules**

- **Move it down.** If an integration test needs more than about 5 requests, or a loop, to prove a property of a
  rule, prove the property in a pure test (layer 1) and keep one integration test that shows the worker uses that
  rule with the right inputs. Same for the simulator: test a policy or metric on a hand-built input, not by running
  the whole pipeline.
- **No duplicate runs.** A deterministic expensive result (a sim run, a played-out scenario) is computed once per
  file and shared by its assertions.
- **Delete with the feature.** When a mechanic is removed, its rule functions and tests go in the same PR; what
  stays is a test that the old route answers its 410 (one request).
- **Golden hashes need a reason.** A pinned digest or fixture may be re-pinned only with a sentence in the PR on
  what moved and why. A digest that is re-pinned on every change is not a guard; replace it with readable assertions.
  The simulator's legacy digest was retired for that reason (2026-10-19); its one "did the sim move" alarm is the
  readable headline-numbers test in `packages/sim/test/run.test.ts`, and a change to those numbers is explained in
  the PR.
- **Use the worker test kit.** `apps/worker/test/kit.ts` holds the helpers every worker test needs: `newKey`,
  `Json`, the time constants, `sessionCaller` (a session that signs in again as the fake clock moves), `give`
  (Bait or Essence through the ledger), `setCreature` and `captureConsole`. Do not copy them into a test file. A test
  that causes a failure on purpose calls `captureConsole()` and asserts on the logged kind, so the run stays quiet
  and real errors stand out.
- **Timeouts are budgets.** Default timeouts per layer as above (sim at most 30 s). A test that needs more is a
  test to split or move down, not a timeout to raise.
- **Test every way in, popovers included** (retro 2026-10-28: a help tag in an item card worked on the Workshop
  page and broke when the same card opened in a found item's popover). A part that can show inside a page popover
  (`PopoverHost`: the item card of a found item, the XP breakdown, the forecast, a creature's popover) gets one
  client test that opens it there, under a real `PopoverHost`, and taps a help tag inside it: the explanation must
  open in that popover, with its anchor still on the page (`ui/find-item-card.test.tsx` is the example). A part
  with a hover popover gets one test that moves the mouse from one trigger straight to the next.
- **CI shape.** Parallel jobs: checks (format, lint, typecheck, build), worker tests, sim tests, the rest (game,
  engine, lab, activity, the worker's scripts, the fixture check); one aggregate `ci` check for the ruleset. Target:
  under 5 min wall. Watch the per-file durations in the job log; anything over the layer budget is a finding.
- **Documentation-only PRs** run only the formatting check and the security job (decisions.md, 2026-10-29). The
  `changes` job counts a PR as documentation when every file it changes is Markdown or under `docs/`, except
  `docs/compendium/` (the compendium test reads it). A test that starts reading another file under `docs/` must add
  that folder to the exception in `.github/workflows/ci.yml`.

**Database reads**

Cloudflare's free tier allows 5,000,000 Durable Object `rows_read` a day, and a whole-table scan on a path that runs
on every request, every alarm or every object start used it up twice (decisions.md, 2026-10-25). Four guards:

- **The read budget test** (`apps/worker/test/read-budget.test.ts`). It seeds a realistic guild straight into the
  tables (`test/read-world.ts`, shared with the two tests below: 15 players, 30 creatures each with talents, a month
  of history in every table that grows: analytics, Games, ledger, gear, dungeon runs, expeditions, jobs; about 1 s)
  and measures the rows read, the sum of `rowsRead`
  of every cursor (`test/read-meter.ts`, reusable: `meterStorage`, `expectReadsUnder`), by an object start of a
  build that already started, an alarm with no lounge, and `/api/me`, `/api/state`, `/api/room`, `/api/games`,
  `/api/raid` and `/api/dungeon/today`, an alarm tick with 5 players lounging together (the object evicted before
  it, as production is between ticks) and one raid placement with a teammate's board socket open. Each has a budget
  of about 1.5x the measured value (written next to it); a failure lists the top statements by rows read, so the
  culprit is at the top. Raise a budget only with a reason in the PR.
- **The growth check** in the same file adds a second month of history and measures the alarm, the lounge tick, the
  placement, `/api/me`, `/api/state` and `/api/raid` again; they may read at most a few rows more. A new
  whole-table scan grows with the tables and fails it where a budget alone would only notice after the data grew.
- **The query plan audit** (`apps/worker/test/query-plan-audit.test.ts`). It records every distinct SQL statement the
  hot paths run in the same guild (an object start, a login, the main GETs including `/api/notifications`,
  `/api/weather` and `/api/gear`, an alarm with and without the lounge, a lounge payment, a raid placement with a
  board listener) and runs `EXPLAIN QUERY PLAN` on each with the bindings of its first execution. A plan step that
  is a plain `SCAN <table>` (not `SEARCH`, not `USING INDEX`) of a table that grows with play fails, naming the
  statement, its plan and the place in `src/` that ran it. This catches a missing index the day the statement is
  written, on every statement, not only on the ones a budget measures. When it fails: fix the statement (an index in
  a new migration, or a query that uses one). Tables that are small by design (one row per guild, player, party or
  hour of sessions) are in `SMALL_BY_DESIGN` with the reason; a single statement that has to scan goes in `ACCEPTED`
  with a reason. Add to either list only with a reason in the PR: they are a list of debts, not exceptions to
  forget. It does not look at how often a statement runs: that is the next guard.
- **A day in the life** (`apps/worker/test/read-day.test.ts`). One game day of a 10-player server on the same guild:
  4 opens of the game per player (a login and the usual tabs), a raid look each, 5 board placements, 5 players
  lounging for 3 hours with the object evicted between the minute ticks, and every alarm of the day (the daily
  reset and maintenance included). Every start, alarm and request is a real measurement; to stay fast only 30 of
  the 180 lounge ticks are simulated and the rest cost the average of the last 20 (flagged `scaled`). The day must
  stay under its budget (about 5% of the free tier, set at 1.5x the measured total, written next to it); a failure
  prints the rows by source (`start`, `alarm`, `lounge:*`, `request:<area>`). Cost per occurrence is covered by the
  budget test and the audit, frequency by this one: a path that is cheap once but runs all day, or an object that
  wakes more often, shows up here. When it fails: find the source that grew and fix the query or the frequency
  (push a change instead of polling, keep the state in a table instead of memory, run a pass once per build). Raise
  the budget only with a reason in the PR.
- **Production** counts the same thing: `GuildCore` wraps its `SqlStorage` (`src/read-meter.ts`), adds the rows read
  to `db_reads` per game day and source (`start`, `alarm`, `socket`, `request:<area>`), and the daily rollup copies
  a finished day to `analytics_daily` as `db.rows_read` with the dim `source`. The ops report has a "Database reads"
  section: rows per day against the free 5,000,000, the top sources, and an alert from 80% of a day.
