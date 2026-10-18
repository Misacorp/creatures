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
   every fixture. This is how the two sides stay in sync without end-to-end browser tests.
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
- **Timeouts are budgets.** Default timeouts per layer as above (sim at most 30 s). A test that needs more is a
  test to split or move down, not a timeout to raise.
- **CI shape.** Parallel jobs: checks (format, lint, typecheck, build), worker tests, sim tests, the rest; one
  aggregate `ci` check for the ruleset. Target: under 5 min wall. Watch the per-file durations in the job log;
  anything over the layer budget is a finding.
