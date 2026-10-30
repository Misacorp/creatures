# Economy and rewards

Leet points, Bait, the ledger and spending, economy targets, rewards that cut across features.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-10-20: Raids harder for the tick economy; steeper fusion; early gear at a lower level

ID: `2026-10-20-raids-harder-for-the-tick-economy` · Status: current

Misa: "We should make raids harder. Raids shouldn't be a pushover, but neither should they be impossible to win at the early stages." With expedition ticks, the dungeon payout and gradual fusion in, the sim's teams won every raid (typical finale 99.3%, four bosses at 100%, 1.9% of creatures knocked out). Decisions, all through scalars (balance log B-026):

- **Fusion is steeper** (the lead's call, inside Misa's "the last levels a lot harder"): `RULES.fusion.thresholds` cumulative 1, 4, 9, 18, 34 points (1, 3, 5, 9 and 16 per level) instead of 1, 3, 6, 11, 19. Migration 37 is not released, so its hard-coded backfill points changed in place to 0, 1, 4, 9, 18, 34 (and its test): a released migration would have needed a new one.
- **Bosses and the curve.** Boss HP up 15% to 40% per boss (Cinder Wyrm and Thornmother, which stayed at 100%, the most), Attack 33 to 35, rank 1's share of the pool 35% to 26% (so week 1 keeps its absolute HP and stays easy for casual servers), ranks 2 to 5 unchanged (they get tougher through the base HP), ranks 6 and up +9% HP. Result in the sim: typical finale 87%, 15 players 94%, Phase 1 84%, KO share 12.7%, no boss at 0 or 100%, long-run win 67 to 83%.
- **Gear (Misa, 2026-10-20 via the lead):** gear becoming a bigger share of power over time is intended, especially late as players pour resources into crafting. Gear rewards are not cut and gear-share bands should rise over the weeks (the proposal with measured values is in B-026). Early gear stays low-level: expedition finds are at item level 1 per explorer rank (was 2) and dungeon gear gains a level every 3 depths (was 2); crafted gear is unchanged. Week 2 gear share is now near the bands for engaged, regular and drop-in players.
- **Not changed, on purpose:** `creatureBp` stays 800 (about 46 catches a week for a min-maxer is acceptable, Misa 2026-10-20), and the ticks, dungeon payout, supply values and crafting volume are as merged. The targets that encode the old scarce economy (expedition slot days, casual discovery, duplicate counts, late gear shares) are listed as proposed new bands in B-026 for the lead to decide.

## 2026-10-20: Economy targets, tested exactly

ID: `2026-10-20-economy-targets-tested-exactly` · Status: current

Expedition and crafting balance is now checked with exact expected values (`packages/sim/src/trip-ev.ts`, `pnpm sim:economy`), and the bands live in `ECONOMY_TARGETS` (`packages/sim/src/economy-targets.ts`) with a fast test (`economy-targets.test.ts`). Every supply must return 1.1 to 4 times its crafting cost on every trip length, about 2 on a 12 hour trip, each tier must gain more than the one below, and a new part kind or supply kind without a worth fails a test. Known exception: the lantern on a 2 hour trip (ROI 0.4 to 0.5), because its fixed part only exists when a creature comes. A bonus deep creature roll like the lure's would fix it (follow-up, a rule change). The tuning is B-025.

## 2026-10-15: the Bait allowance and leet bonus ship

ID: `2026-10-15-the-bait-allowance-and-leet-bonus` · Status: current

- **Numbers are the `RULES.income` contract**, not the earlier planning numbers in the journey design (30 and 15 to 25): a daily allowance of 25 Bait and a leet bonus of 15 to 32 (`leetBonusForDay`, by how many players leeted that day). A solo leet day pays 40, a day with 10 or more leeters 57. The balance pass still follows with the sim.
- **A leet credits `leetBonusForDay(n)`**, not `baitForDay(n)`. The sync only sees finalised days, so `n` is the day's final count and there is no top-up; the per-player key `leet:<day id>` still keeps a re-delivered day from paying anyone twice. Leet points are still computed and kept in the ledger meta (`points`, with the new `bonus`). `baitForDay` stays exported for the simulator's "current" income model and is unused by the game.
- **The allowance is granted in the guild object's `handle()`**, on a player's first authenticated request of a game day (13:37 guild-local, DST-safe through `gameDay`). The Bait is a ledger credit with source `allowance` and key `allowance:<game day>` (unique per player and day), written in the same transaction as the `daily_allowance` row (migration 25) and a `daily_allowance` analytics event, so retries and parallel requests never pay twice. Missed days are never paid later. The grant is idempotent and never fails a request.
- **The client is told once.** `GET /api/me` returns `allowance: { day, amount }` on the first call after a grant and `null` afterwards (the row's `announced` flag is set in the same step); the Activity shows "Daily allowance: +25 Bait" on its notice line. The history list shows the credit as "daily allowance".
- **Tests only:** `GuildCoreOptions.dailyAllowance: false` switches the grant off; the shared test helper does so, so other features keep exact Bait balances.

## 2026-10-15: a player journey simulator, and the planned Bait allowance

ID: `2026-10-15-a-player-journey-simulator-and-the` · Status: current

- **Journey simulator (Misa: "sounds good").** The balance sim gets player profiles as dials (login days, check-in times including night, leet rate, how many creatures share the Bait, expedition uptime, dungeon and raid skill, crafting), four presets (min-maxer, engaged, regular, drop-in), and a per-player journey log: milestones, power, the one limit holding the player back at each check-in, and waits. The raid and dungeon sims then draw rosters from journeys. Design: `docs/design/player-journey-sim.md`. Built after PR #24.
- **Planned Bait income (Misa, numbers by the lead).** A daily allowance of 30 Bait for opening the game, plus a leet bonus of 15 to 25 Bait by how many players leeted (15 for 1 or 2, then 17, 19, 20, 21, 22, 23, 24, 25 at 10 or more), keeping the leet table's rules (more leeters never pays less, solo equals double, each extra adds less). A day pays 30 to 55. Not shipped yet: the sims model it as a second income rule first, and it ships with its own balance pass.

## 2026-10-13: Combined balance pass (gear, dungeon and expeditions v2 together)

ID: `2026-10-13-combined-balance-pass-gear-dungeon-and` · Status: current

The merge left 3 of 47 targets failing on seed `leet` (setup credit share 13.9%, lowest creature 0.58x, Crafting level at day 30 of 7). After this pass **all 47 pass** on the full run (report: `docs/balance/report-2026-10-13-combined.md`). Raids stay the main source of big loot; the 2 hour trip minimum, the slot days (about 1, 30, 120 and 365: 1, 27.5, 121, 370), the push-on fairness (0.96 to 1.00) and the gear power numbers are untouched. Boss HP, ranks and species stats were **not** changed.

| Number                                                                                  | Before                                        | After | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | --------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RULES.gear.skill.xpPerHour` (Crafting XP per nominal job hour)                         | 24                                            | 12    | Trips and the dungeon feed the workshop, so a daily player did about twice the jobs of the gear pass (16 crafts in the first month against 8) and the best Crafting level at day 30 was 7. Halving XP gives 5 (the aim) on all three seeds; a daily player is at about level 6.6 in week 8 and 7.9 in week 12 (it was 8.1 and 9.7), so the top levels stay far away.                                                                                                                                                                                                 |
| `RULES.combat.setupShareBp` (new; setter's share of a reaction's bonus credit)          | 5000 (hard-coded half)                        | 6000  | Setup credit was 13.9% of contribution. 6000 gives 16 to 17% on all seeds. Credit only: the damage dealt is the same, so no fight outcome moves. 5500 gave 15.2%, too thin.                                                                                                                                                                                                                                                                                                                                                                                          |
| `RULES.combat.guardOwnCreditBp` (new; a Guard's credit for damage hits aimed at itself) | 0 (only damage taken for a neighbour counted) | 10000 | The lowest creature was Sproutle (a Guard) at 0.58x. In the sim's raids a Guard took almost no hit for a neighbour (about 4 damage a week on average) while the hits aimed at the Guard itself did about 680, so its contribution was just its small own damage. Species stats do not fix this: raising Sproutle's Attack by up to 100% left its ratio at 0.55 to 0.64, because a stronger Sproutle gets picked more often into rosters where it does worse. Crediting damage taken moves Sproutle to 0.68x (0.68 to 0.72 on the three seeds) and Mistnewt to 0.87x. |
| `RULES.dungeon.bossShardBp` (room boss shard chance)                                    | 4000                                          | 6000  | The "richer dungeon" Misa liked, in parts that do not feed Bait.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `RULES.dungeon.fullClear.gearBp` (gear chance on a full clear)                          | 1000                                          | 1500  | Same. A daily player now gets 0.43 dungeon gear items a week (0.32 before). Gear share at week 8 is 12.8% (max 20%).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Why these levers.** The Crafting pace was the first lever and the simplest: XP per hour. The setup and creature targets were thin because of how credit is counted, not because a creature is weak, so the credit rules changed, not the species. A **richer Bait payout was tried and rejected**: with 2/2/3 or 3/3/4 Bait per room the raid sweep put players on a higher boss rank (rank follows the roster's average level) and the boss spread went to 20% and 28% (limit 15%) and the typical finale win rate fell to 49% (from 54%). Only a Bait-free richer dungeon was kept. Changes to dungeon foe HP (12500 to 12000) were tried too and did not help the one seed that misses depth 1 (see below), so they were dropped.

**Where the credit rules show up.** The after-action card, the Essence share by contribution (about 30% of a stage's Essence is paid by contribution) and the replay's recap. `apps/activity/src/replay.ts` computed the setup credit as half of the bonus by itself; it now reads `RULES.combat.setupShareBp` so the recap and the server agree. Fights already stored keep the old 50/50 totals (their results are not recomputed); replaying them in the client shows the new split. No glossary or How to play text mentions the split, the XP per hour or the caps this pass touched, so no player-facing text changed. `docs/design/m3-combat.md` has the new rules.

**Results, full run (`pnpm sim`):**

| Seed   | Passed | Failed                                                                            |
| ------ | ------ | --------------------------------------------------------------------------------- |
| `leet` | 47/47  | none                                                                              |
| `s2`   | 47/47  | none                                                                              |
| `s3`   | 46/47  | dungeon depth 1 cleared in the first week 78.6% (needs 80%; leet 82.5%, s2 87.0%) |

The merge's 3 failures became: setup share 13.9% to 16.0% (s2 16.4%, s3 16.5%), lowest creature 0.58x to 0.68x (0.68 and 0.72), Crafting level at day 30 7 to 5 (5 and 5). Typical finale win rate is 51.8%, Phase 2 clear 77.5%, 15-player finale 41.4%, boss spread 10.6%. A fourth seed (`s4`), run once with the shipped numbers, missed the boss spread by 0.2 points; the boss spread flips with noise (it was 15.5% on `s3` and 15.7% on `leet` with other candidates), and boss HP was left alone as it is calibrated on 2 seeds already.

**Noise to know about.** The casual species target (casual players at most 0.3 species ahead of the v1 curve) moved between 0.02 and 0.38 across candidates that changed nothing about trips (Essence by contribution shifts what casuals buy), so it is the least reliable target; shipped it reads 0.20 on `leet`, 0.23 on `s2`, 0.27 on `s3`. The boss spread and hard pity targets show the same kind of noise. The dungeon depth 1 clear on `s3` is the one miss that looks structural (every candidate left it at 78.6 to 79.7%); it needs a gentler depth 1 if more players should clear it in week 1, which is a game-feel call, not a tuning slip.

## 2026-10-10: Leet points table

ID: `2026-10-10-leet-points-table` · Status: current

**Decision.** Leet points per day come from a fixed table by the number of players who leeted that day **[Misa]**:

| Leeters     | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  | 11  | 12+ |
| ----------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Points each | 5   | 5   | 6   | 6   | 7   | 7   | 8   | 8   | 9   | 9   | 9   | 10  |

Rules behind it: more leeters never pays anyone less; a solo leet pays the same as a double; each extra leeter adds less than the one before; at most 10 points a day (multi-leet awards cap at 10 too). It counts only who actually leeted, so inactive server members don't matter. The rate drops from 10 to **7 Bait per point** so total income stays near the simulator-tuned level (`docs/balance/report-2026-10-10-points.md`): small servers now earn about two thirds of what a big one does instead of under half, and the top-earner vs casual power ratio now meets its target. This replaces the earlier n-points / solo-2 / cap-8 rule.

## 2026-10-10: Leet sync status visible to players

ID: `2026-10-10-leet-sync-status-visible-to-players` · Status: current

**Decision.** The leet sync records its own health in `leet_sync` (migration 6): `last_attempt_at`, `last_error` (an error kind such as `unauthorized`, `not_found`, `timeout`, `network`, `rate_limited`, `upstream`, `invalid_response`, `invalid_request`, `disabled` or `internal`; never a message, URL or key) and `last_days` (days processed by the last successful run). These are written in their own small transaction, apart from the credit transactions. `GET /api/state` and `GET /api/me` return `leetSync: { source, lastAttemptAt, lastSyncedAt, lastError, lastDays }`, and the Activity footer shows one text line from it: "synced 5 minutes ago (3 days)", "not synced yet", or a warning with a plain-English reason and "Tell the game admin." A guild with no leet source stores `disabled`.

**Reasoning.** A production player saw 0 Bait and no history, and Worker logs are not visible from the development environment. Showing the sync's state in the app makes a rejected key, an unknown server or a slow bot diagnosable by anyone, without leaking any upstream data (only a fixed set of kinds ever leaves the server).

**Follow-up.** `/api/me` and `/api/state` now wait up to 6 s for a sync (was 3 s), longer than the 5 s HTTP timeout, so one slow first call to the leet bot can finish in time. If the first sync is still running when the Activity loads (an attempt, nothing synced, no error), the Activity re-asks `/api/state` every 3 s, at most 5 times, and updates the balance, history and footer as the credits arrive.

## 2026-10-10: Real leet points

ID: `2026-10-10-real-leet-points` · Status: current

**Decision.** Staging reads the leet bot's dev API and production reads its prd API (`LEET_SOURCE=http`, URLs in `wrangler.jsonc`, key in the `LEET_API_KEY` environment secret, required by the deploy job). The mock stays for local development and tests. Staging's earlier simulated credits stay in its ledger; production starts clean and backfills the last 7 days of real leets on first sync.

## 2026-10-10: Ledger and spending

ID: `2026-10-10-ledger-and-spending` · Status: current

**Decision.** Each guild object keeps an append-only `ledger` and a `balances` table (integers, `CHECK (amount >= 0)`). Credits are idempotent per `(user, key)` (leet credits use `leet:<day id>`). Spends run balance check, debit and the purchased effect in one synchronous SQLite transaction; replaying the same idempotency key returns the stored result without charging again, and reusing a key for a different amount is refused. There is no public spend endpoint until M2 adds expeditions and training.

**Reasoning.** The Durable Object handles one request at a time and the transaction has no awaits, so double-spends and duplicated rewards can't happen even with retries or parallel clicks.

## 2026-10-10: Leet points to Bait conversion

ID: `2026-10-10-leet-points-to-bait-conversion` · Status: current

**Decision.** The leet bot API reports **facts only** (who leeted, in which server, on which day). The game owns the scoring rules as tunable balance config:

- If `n` players leet on the same day in a server, each gets `n` leet points, capped at 8. **[Misa: multi-leet should reward everyone who took part]**
- A solo leet (`n = 1`) gets 2 points: a bonus for showing up when nobody else did. **[Misa]**
- Each leet point converts to 10 Bait (starting value; the simulator tunes it).
- Points are credited daily. No end-of-month bonuses, no streaks **[Misa]**.
- The ledger records a `source` for every credit (`leet`, later `quest`, and so on) so future server-wide cooperative quests can feed Bait without redesign **[Misa: possible future feature, not now]**.

**Reasoning.** Keeping scoring in the game lets us rebalance without changing the leet bot. Contract: `docs/design/leet-api.md`.
