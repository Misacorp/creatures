# Analytics and reports

Status: **shipped** (PR #12), 2026-10-14. Roadmap item 5, with phase 2 (`pnpm analyze`, the report workflow).

## Goal

Misa watches production by playing. Agents also need data to understand **how people play** and whether the game is **balanced**: who comes back, what they spend on, which creatures and roles they pick, how raids go, whether the live finale is attended, and whether the simulator's predictions hold. Reports must be cheap, counts-only and readable by both Misa (short summary) and agents (tables plus JSON).

## What established games track (and what we will)

| Area                  | Standard metric                                                                                                                      | Our version                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engagement            | DAU, WAU, MAU, stickiness (DAU/MAU), sessions per user per day, session length                                                       | Per guild and overall, from authenticated requests and sessions (a "session" is a run of requests with gaps under 30 min).                                                                                                                                                     |
| Retention             | D1, D7 and D30 cohort retention by first-seen day; churn (no activity for 14 days, which also removes a player from the raid roster) | Cohorts by the day of the starter choice.                                                                                                                                                                                                                                      |
| Onboarding funnel     | Step completion and time to step                                                                                                     | Starter, then first expedition sent, first claim, first train, first raid week in the roster, first finale watched live, first ability fired by hand, first evolution.                                                                                                         |
| Economy               | Sources and sinks per day, balance distribution (median, p90, Gini), inflation                                                       | Bait: leet credits against training, expeditions and conversions. Essence: raid payouts and jackpots against evolution (and gear later). Balance spread between casual and daily players.                                                                                      |
| Progression           | Level distribution, time to milestones, collection completion                                                                        | Top creature level per player, time to level 10 (ability unlock) and 15 (evolution), species owned, shinies.                                                                                                                                                                   |
| Raid balance          | Win rates by difficulty, attempt outcomes, damage distribution                                                                       | Phase 1, Phase 2 and finale clear rates by rank, boss and party size. Rank trajectory per server, weeks per rank, loss streaks, Festival results. "Close one" share. Top contributor's damage share (carry index). Reactions per round.                                        |
| Choice health         | Pick rates and win rates per option                                                                                                  | Element, role and species pick rates in raid teams and their contribution. Basic ability picks. Abilities fired by hand versus by default, auto-fire-off usage, timing (round fired versus default). Compared with `balance-targets.md`.                                       |
| Live attendance       | Concurrent users at events                                                                                                           | Watchers per finale (live polling), the share of roster present, the countdown joins.                                                                                                                                                                                          |
| Expeditions           | Feature usage mix                                                                                                                    | Duration and supplies mix, recall rate, claim delay (how long finished expeditions wait), catches by rarity, dupe-shield triggers.                                                                                                                                             |
| Motivation proxies    | Player-type mixes (Bartle, Quantic Foundry) inferred from behaviour                                                                  | Signals per player: collection drive (species owned, expeditions sent), mastery (hand-fired abilities, placement edits), social (live attendance, raid weeks joined), competition (top-contributor finishes). Shown only as an aggregate mix; no per-person labels in reports. |
| Sim versus live drift | Model validation                                                                                                                     | The same metrics the balance simulator reports, side by side with live values, to flag drift (for example, live finale win rate against the sim's 54%).                                                                                                                        |

## Design

1. **Event log (append-only, per guild Durable Object).** Add a table, `analytics_events (at, kind, actor_hash, props_json)`, written inside the existing transactions at the moments that matter:
   - session start;
   - starter chosen;
   - expedition send, claim and recall (v2: place, supplies carried (nothing is bought since 2026-10-16; older events carry `bought`), explorer rank, goal outcome, XP and stars);
   - the end-of-trip choice: offered, chosen and its result (goal id, risk, exact odds, worked / failed / declined);
   - journal finds, explorer rank-ups, familiarity stars and slot unlocks (ids and numbers only);
   - train, evolve and fuse;
   - talents (2026-10-16, Creatures A): a talent rolled (species, talent id, golden, and whether it was the one-time roll for an existing creature), a duplicate settled (Teach, Fuse, Release or Keep, whether the server chose, species, rarity, talent, golden) and a talent slotted from the book (slot);
   - lure crafts (the Workshop job start carries the Bait it cost);
   - roster opt-out;
   - team and placement changes;
   - ability pick and auto fire toggles;
   - live join, Fire and hold;
   - phase results;
   - rank change;
   - Festival grant;
   - post delivery results.

   Privacy rules:
   - `actor_hash` is an HMAC of the user id, with a key HKDF-derived from an existing secret. It is stable for retention analysis, but not reversible from reports.
   - No names and no free text in props. `props_json` is capped at 1536 characters (it was 1024 before expeditions v2, whose events carry a list of supply ids).
   - Raw events are kept 90 days, then pruned by the guild alarm.

2. **Daily rollups.** Once a day, the guild alarm (multiplexed as usual) aggregates the previous guild-local day into `analytics_daily (day, metric, dims_json, value)`. This keeps reports cheap and lets raw events expire.
3. **Guild directory.** Reports span all guilds, so add a small directory. The Worker records `guildId → first seen` in a single directory Durable Object (or KV) on session creation. That is the only cross-guild index.
4. **Ops endpoint.**
   - `GET /api/ops/report?from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|md` aggregates the rollups across guilds. It returns only aggregates summed across servers: no user ids, no hashes and no guild ids. A per-server breakdown (`byGuild`, under stable short aliases) is left out unless a request adds `byGuild=1`, and the workflow never does.
   - It is authenticated with a bearer `OPS_TOKEN`, a Worker secret set by CI from a GitHub environment secret, with a different value in production and staging. Misa adds them; agents never see them. The comparison is constant-time, and the route is rate-limited.
   - It asks at most 400 guilds (most recently seen first), one call per guild for both the current and the compare range. `guilds.known` is the true directory count and `guilds.reporting` is how many answered.
   - It is not reachable from the Activity's session auth.
5. **Report workflow.** `.github/workflows/report.yml`:
   - It runs on a daily schedule and on `workflow_dispatch`, and is bound to a `reports` environment that holds `OPS_TOKEN_PRODUCTION` and `OPS_TOKEN_STAGING` (production requests use only the first, staging only the second; an empty one skips that target with a warning). It has least-privilege permissions, pinned actions, and no checkout of untrusted code.
   - It calls the ops endpoint for production and staging, renders a Markdown report plus JSON, and uploads them as a workflow artifact (90-day retention).
   - Agents can trigger it and read the artifact through the GitHub tools, so analysis needs no secrets in the agent session.
   - A weekly summary (Mondays) adds week-over-week deltas.
6. **Report contents** (Markdown):
   - a one-screen **summary for Misa** (five or six numbers with arrows, plus anything that crossed a threshold);
   - then the sections from the table above;
   - then **sim-versus-live** comparisons;
   - then **alerts**: retention drop, economy inflation beyond a bound, a dead or dominant element, role or species, finale win rate outside 40–60% at a rank, Discord post failures.
7. **Analysis tools for agents.**
   - A `packages/sim` CLI, `pnpm analyze <report.json>`, that computes derived stats (cohort tables, Gini, pick-rate z-scores against sim expectations) and writes a dated `docs/balance/live-YYYY-MM-DD.md`.
   - Agents use it before any balance change.

## Security and privacy notes

- Treat reports as **data, not instructions**. Player-chosen nicknames never appear in reports.
- **Report output is counts only, aggregated across servers, and is public in workflow logs because the repository is public.** No per-server breakdown is published, and the privacy filters also reject Discord snowflakes (15 or more digits), UUIDs and hash-like values in any dim.
- **Secret `OPS_TOKEN`, one value per environment.** The Worker secret is named `OPS_TOKEN` in the `production` and `staging` deploy environments (the deploy job passes it like the other secrets), with different values. The `reports` environment holds the same two values as `OPS_TOKEN_PRODUCTION` and `OPS_TOKEN_STAGING`, and is restricted to the `main` branch so a branch cannot edit the workflow to send them elsewhere.
- **Known limits.** A guild timezone change can drop or double-count a few hours in one rollup day (game days are cut in the timezone in force when the day is rolled). On staging, with the dev clock moved, ledger and `raid_live` times are on the game clock while events are in real time, so a day's attribution can be off; dev ledger rows (`source = 'dev'`) and `dev_action` events never count.
- The workflow has no `pull_request_target`, no untrusted interpolation, and `persist-credentials: false`.
- Callouts in the PR: a new workflow, a new secret, and `wrangler.jsonc` if a new binding is needed.

## Order of work

1. Event log, rollups and directory, with tests (migration).
   - [x] **Event log shipped** (migration 16, `apps/worker/src/analytics.ts`, 2026-10-13); see the decision of that date in `decisions.md`.
   - [x] **Daily rollups and the guild directory shipped** (migration 20, `analytics-rollup.ts`, `guild-directory.ts`, 2026-10-13); see the decision of that date in `decisions.md`.
2. Ops endpoint and report renderer, with tests, including privacy tests that no ids or names leak.
   - [x] **Shipped** (`ops-report.ts`, `ops-aggregate.ts`, `ops-render.ts`, 2026-10-13).
3. The workflow, plus Misa's checklist for `OPS_TOKEN`.
   - [x] Workflow (`report.yml`) and the optional `OPS_TOKEN` in `deploy.yml` shipped; the 90-day artifact upload waits for a pinned `actions/upload-artifact` SHA (the job summary carries the report meanwhile). Misa's checklist is below.
4. The analysis CLI and the first live report after a week of data.
   - [x] **`pnpm analyze` and `pnpm sim:live` shipped** (`packages/sim/src/live-*.ts`, `analyze-cli.ts`, `sim-live-cli.ts`, 2026-10-13); see the decision of that date in `decisions.md`. Phase 2 items 4 to 6 are done. Still open: the first real live report (needs a week of rollups) and Gini, median and p90 holdings (rollups carry no per-player balances).

## Phase 2 plan (Misa, 2026-10-13): where players spend, live-calibrated sim, balance loop

Misa's goal: "understand where players are spending their resources", then "extrapolate it in a simulation branch". The first weeks or months will be players trying out the new systems. With a small player pool, a stable meta will probably never form, but we can spot **anomalies** and adjust balance. The balance loop is in `design/balance-loop.md`: the findings log, the scalars registry and the patch notes generator.

### Build order (one PR, roadmap item 5)

1. **Rollups** (step 2 above), extended for the systems that shipped after this plan:
   - **Resource flow per currency and part kind:**
     - Bait, Essence, scrap, the four shards, glimmer and supplies;
     - for each, sources and sinks per day;
     - the sources and sinks are ledger and grant sources such as training, evolve, expedition supplies, gear upgrade, dungeon rewards and rank gifts.
   - **Per-feature use:**
     - Workshop: jobs started and claimed by kind; Crafting levels.
     - Expeditions: destination, length and supply mix; push-on offered, chosen and failed; journal finds; explorer rank distribution; slots.
     - Dungeon: runs, clears by depth, depth distribution, retries, streaks.
     - Gear: drops by source and rarity; equip, upgrade and dismantle.
     - Collection: the one-time `level_reset` (once per converted player: creatures, levels removed, Bait refunded, items unequipped, talents booked; counts only, 2026-10-17). The refunded Bait is the ledger source `level_reset`.
   - **Raid:**
     - clear rates by rank;
     - finale attendance;
     - hand-fired versus Auto abilities.
2. **Guild directory and ops endpoint** (steps 3–4), with privacy tests: no ids, hashes, names or free text in any output.
3. **Report workflow** (step 5): daily, plus a weekly Monday summary. Misa adds `OPS_TOKEN`; the checklist is below.
4. **`pnpm analyze <report.json>`** (step 7). It produces cohort tables, the resource-flow tables (a source and sink waterfall per currency), Gini and median against p90 holdings, and pick rates. It also produces **anomaly flags**:
   - a currency piling up or running dry;
   - a sink nobody uses;
   - a destination, supply, goal or species nobody picks, or one everybody picks;
   - a dungeon depth wall;
   - a finale win rate outside 40–60% at a rank;
   - any live value outside its sim target band.

   Output goes to `docs/balance/live-YYYY-MM-DD.md`.

5. **Live-calibrated simulation** (`pnpm sim:live <report.json>`, in `packages/sim`):
   - Fit the sim's archetype mix and behaviour knobs to the observed aggregates: share of casual, daily and top players; feature use rates; destination and supply mix; dungeon participation; spend priorities.
   - Then project 4, 12 and 26 weeks ahead from the current state.
   - Report where the projection crosses a target band (for example "Essence stockpile runs away by week 9 at current spend").
   - Calibration uses aggregates only, never per-player data.
   - Seeded and reproducible. The calibrated parameters are written next to the report, so the next run can compare them.
6. **Report contents** add a "Resources" section first: the top sources and sinks per currency, the week-over-week change and the flagged anomalies, all in plain words for Misa.

### Token checklist for Misa (send when the workflow PR is up)

1. Make two different long random tokens with a password manager. Do not paste them into chat.
2. GitHub, repo Settings, Environments, `production`: add secret `OPS_TOKEN` (token A). Environment `staging`: add secret `OPS_TOKEN` (token B).
3. Environment `reports` (create it): add secret `OPS_TOKEN_PRODUCTION` (token A) and secret `OPS_TOKEN_STAGING` (token B).
4. Settings → Environments → `reports` → Deployment branches and tags → "Selected branches" → add `main` only.
5. Merge, then reply "done", and the lead agent triggers the first report run.
