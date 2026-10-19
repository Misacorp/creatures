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
- **CI shape.** Parallel jobs: checks (format, lint, typecheck, build), worker tests, sim tests, the rest; one
  aggregate `ci` check for the ruleset. Target: under 5 min wall. Watch the per-file durations in the job log;
  anything over the layer budget is a finding.
