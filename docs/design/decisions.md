# Design decisions

Newest last. Each entry: date, decision, reasoning. Technical decisions are made by the lead agent; game-feel decisions are confirmed with Misa (marked **[Misa]**).

## 2026-10-10: Hosting on Cloudflare, all-in

**Decision.** One Cloudflare Worker at `creatures.misacorp.dev` serves both the Activity frontend (Workers Static Assets) and the API (`/api/*`, `run_worker_first`). State lives in SQLite-backed Durable Objects. No AWS backend.

**Reasoning.**

- A Discord Activity needs a backend for the OAuth code exchange (client secret), so static hosting alone isn't enough.
- Serving frontend and API from one origin keeps Discord's URL mapping to a single `/` entry, and relative `/api/...` calls work through Discord's proxy with no extra mappings.
- The live Sunday finale needs a long-lived, stateful, real-time process (WebSockets, server-driven rounds). Durable Objects with the WebSocket Hibernation API and alarms fit this directly. On AWS it would take API Gateway WebSockets plus Lambda plus Step Functions plus DynamoDB for connection tracking.
- One cloud means one deploy pipeline, one set of credentials, and one place to look when something breaks.
- Misa offered AWS + CDK (the leet bot already runs there). We considered it seriously. Its real advantages were EventBridge Scheduler's native time-zone support and free-tier pricing; DST handling is solved on Cloudflare by computing alarm times in `Europe/Helsinki` (see below), and Cloudflare's free tier is also enough to start.
- Infrastructure is code: `apps/worker/wrangler.jsonc` declares the Worker, routes, custom domains, Durable Objects, migrations and cron triggers. CI applies it. Nothing is configured by clicking, except the one-time API token and the Discord Developer Portal (which has no IaC option).

**Plan tier.** Start on the Workers **Free** plan. Workers Paid is $5/month **per Cloudflare account** (not per Worker); it raises limits for all Workers on the account and replaces hard limits with usage billing above generous allowances. Upgrade only if a measured limit blocks us (the most likely one is the 10 ms CPU per request on Free). Misa has approved the $5/month if needed **[Misa]**.

## 2026-10-10: One Durable Object per Discord server

**Decision.** Each Discord server (guild) gets one `GuildWorld` Durable Object that owns all game state for that server in its embedded SQLite database: players, creatures, ledger, raids, schedules. The Worker authenticates the request and forwards it to the guild's object.

**Reasoning.**

- A Durable Object processes requests one at a time with synchronous SQLite transactions, which makes double-spending and duplicated rewards structurally impossible (no interleaving between balance check and debit). D1 has no interactive transactions, so race-safe spending there needs careful single-statement guards.
- 5–15 players per server is far below a single object's throughput (around 1,000 requests/second).
- Per-guild isolation supports multiple servers from day one **[Misa: build for multiple servers]**.
- Durable Object storage has point-in-time recovery (30 days).
- Activities launched outside a server (DMs) are not supported; the UI asks players to launch from a server channel.

## 2026-10-10: Scheduling in Helsinki time

**Decision.** Weekly events (Mon/Fri/Sat 13:37, Sunday finale, daily leet sync) are scheduled with Durable Object alarms. The next fire time is computed from the schedule configuration in `Europe/Helsinki` and converted to UTC with the `Intl` API, so DST transitions are handled. Each guild object re-arms its alarm on every authenticated request (see the 2026-10-10 entry on alarm safety nets). Every scheduled job is idempotent per (event, week) key. Tests cover the DST switch weeks (last Sunday of March and October).

**Reasoning.** Cloudflare cron triggers are UTC-only, and Helsinki switches between UTC+2 and UTC+3. Alarms fire at an exact epoch time, are retried automatically, and are per-guild.

## 2026-10-10: Staging environment

**Decision.** Pushing any branch other than `main` in this repo deploys to `creatures-staging.misacorp.dev`, which is mapped in a separate **dev Discord app**. Merging to `main` deploys to production. Fork PRs never deploy (they only trigger `pull_request` CI without secrets).

**Reasoning.** Misa tests in Discord before merging; staging makes that possible without touching production. A separate Discord app keeps production credentials out of staging.

## 2026-10-10: Frontend stack

**Decision.** Vite + Preact + TypeScript. No CSS framework yet; placeholder visuals until pixel art (M6).

**Reasoning.** Preact is about 4 KB, JSX escapes text by default (safe rendering of nicknames), and the Activity loads inside Discord's iframe where bundle size matters on mobile.

## 2026-10-10: Validation library

**Decision.** Valibot for request and content schemas.

**Reasoning.** Tree-shakable and much smaller than Zod in Worker bundles, with strict object schemas.

## 2026-10-10: Leet points to Bait conversion

**Decision.** The leet bot API reports **facts only** (who leeted, in which server, on which day). The game owns the scoring rules as tunable balance config:

- If `n` players leet on the same day in a server, each gets `n` leet points, capped at 8. **[Misa: multi-leet should reward everyone who took part]**
- A solo leet (`n = 1`) gets 2 points: a bonus for showing up when nobody else did. **[Misa]**
- Each leet point converts to 10 Bait (starting value; the simulator tunes it).
- Points are credited daily. No end-of-month bonuses, no streaks **[Misa]**.
- The ledger records a `source` for every credit (`leet`, later `quest`, and so on) so future server-wide cooperative quests can feed Bait without redesign **[Misa: possible future feature, not now]**.

**Reasoning.** Keeping scoring in the game lets us rebalance without changing the leet bot. Contract: `docs/design/leet-api.md`.

## 2026-10-10: Name and tone

**Decision.** The game is called **Leet Creatures** **[Misa]**. The game stands on its own: creatures, art and mechanics are not built around leet or tech humour. Leet is the currency source; light references are fine **[Misa]**.

## 2026-10-10: Live finale time and length

**Decision.** The Sunday finale starts at 20:00 Europe/Helsinki (default, configurable) **[Misa: accepted default]**. The fight itself is short: **2 minutes by default, never more than 5** **[Misa]**. Length is a boss parameter (a modifier can stretch a boss to the full 5 minutes later, when players are stronger). The server runs fixed-length rounds (about 10 seconds each, so 12 rounds at the default), and the fight ends early if the boss falls. Players who join a few minutes late can still watch the replay and get their loot reveal.

**Reasoning.** An hour-long window is far too long for this game; a short, intense finale is easier to attend together and keeps the single manual ability meaningful.

## 2026-10-10: Alarm safety net without cron (for now)

**Decision.** No cron trigger yet. Instead each guild's Durable Object checks its alarm on every authenticated request and re-arms it if missing, and `GET /api/me` runs a throttled leet sync (at most every 15 minutes) so balances are fresh even if an alarm was missed.

**Reasoning.** Cloudflare already retries failed alarms. A cron job would need a registry of all guild objects to iterate over, which doesn't exist yet. Revisit in M4 if weekly raid events need a cross-guild heartbeat.

## 2026-10-10: Ledger and spending

**Decision.** Each guild object keeps an append-only `ledger` and a `balances` table (integers, `CHECK (amount >= 0)`). Credits are idempotent per `(user, key)` (leet credits use `leet:<day id>`). Spends run balance check, debit and the purchased effect in one synchronous SQLite transaction; replaying the same idempotency key returns the stored result without charging again, and reusing a key for a different amount is refused. There is no public spend endpoint until M2 adds expeditions and training.

**Reasoning.** The Durable Object handles one request at a time and the transaction has no awaits, so double-spends and duplicated rewards can't happen even with retries or parallel clicks.

## 2026-10-10: Game rules from the research review

Misa reviewed the research defaults (`docs/research/`). **[Misa]** on all of these:

- **Reactions:** each element leaves one visible mark on the target (for example "Soaked"); the matching element consumes the mark for the payoff. One mark at a time, no hidden gauges.
- **Turn order:** always shown as a portrait strip above the row; only 2–3 orderings across all bosses. To be judged in play.
- **Absent players:** signed-up players who don't show up still take part, so the server's raid power doesn't drop. Their creatures are auto-placed. Their finale ability is **not** weakened: every ability has a **default firing time** in the fight, and an absent player's ability fires at that time. A present player may fire theirs whenever they choose. They still get the base reward.
- **"First on server":** a title goes to everyone who gets the item or creature **from the same drop instance** (for example two players who both receive an ultra-rare from one boss kill). No 7-day co-discoverer window.
- **Expeditions:** 2–3 slots plus a free recall that pays out partial rewards.
- **Shinies:** cosmetic only, no power.

## 2026-10-10: M2 collection on the server (implementation choices)

**Decision.**

- One creature per (player, line); the game rules live in the pure `@creatures/game` package and the Worker's `collection.ts` only applies them inside one `transactionSync` per action.
- Claiming an expedition rolls every catch inside that transaction from the live crypto RNG. Claiming again returns the stored result, so there is no second roll or payout. Claim needs no idempotency key: the expedition's `claimed` status is the key.
- Training retries are not re-priced: a repeated key replays the amount that was charged the first time (the level, and so the price, has moved on).
- A recall that earns zero catches does not use up the first-expedition Zipmouse guarantee (`expeditions_claimed` only counts claims that brought something back).
- Starters are chosen, not caught, so they do not create "first on server" records. A second starter request always answers 409, also for a repeated key; the client reloads its state.
- Every mutating route returns the fresh player state, so the Activity needs no second request. Errors are `{ error }` with 400 invalid, 404 not found or not yours, 409 conflict.

**Reasoning.** Everything stays server-authoritative and race-safe: the Durable Object runs one request at a time and each action has no `await` between its checks and its writes.

## 2026-10-10: Balance simulator (M3b) interpretations

**Decision.** `packages/sim` (`pnpm sim`, `pnpm sim:quick`) is deterministic for a seed and uses only `createSeededRng`. Where the design left room, it does this (all documented in the report's Method section):

- **Spending policy** is the same for every archetype: up to 3 expeditions funded from 50% of the Bait held (best expected rarity score the slot's share can buy), the rest trains the weakest of the 3 strongest trainable creatures. Players with a complete, fully fused collection stop sending expeditions (they would only convert to Bait at a loss).
- **Pity counter** advances on every raid a player takes part in without a jackpot, win or loss ("counts participation"). `PITY_COUNTS_LOSSES` in `packages/sim/src/raid.ts` switches to counting finale wins only.
- **Typical group** means a raid week with 5 to 10 signed-up players on rosters from the end of week 4 or 8. "Casual first creature reaches level 15" is measured as the casual's highest creature level at the end of week 4 (median over casuals). "Hard pity" means the counter reached 9 (the next win is guaranteed) within 20 weeks, over players who joined in week 1.
- `baitForDay` is imported straight from `apps/worker/src/economy.ts` (it has no dependencies) so the sim and the game cannot drift apart; it should move to `@creatures/game` as that file's comment says.
- The CLI runs TypeScript through Vite's SSR loader (Vite is already a pinned devDependency). Node's type stripping cannot resolve the extensionless imports in the workspace packages, and `tsx` is not installed.

**Reasoning.** The simulator only reports; changing game numbers or targets is a separate decision. Keeping the policy simple and written down makes the report's results explainable.

## 2026-10-10: First balance tuning pass

**Decision.** From the first simulator run (`docs/balance/report-2026-10-10.md`): Phase 1 now clears at 20% of the boss pool and Phase 2 at 45% (were 30% / 60%), and Cinder Wyrm's base HP drops from 8500 to 6000. Result (`docs/balance/report-2026-10-10-tuned.md`): typical-group Phase 1 and the boss spread now meet their targets; Phase 2 (≈94%) and the typical finale (≈68%) run slightly easy, and 15-player raids are much too easy.

**Not yet changed (needs a dedicated tuning pass):** boss HP scaling for 15 players, small servers earning far less Bait (5-player servers are much weaker than 10-player ones), guard creatures almost never being picked, casual progression to level 15, Essence piling up unused, and the pity targets. Difficulty is cliffy: ±15% boss HP swings win rates widely.

**Reasoning.** Fix the largest violations with the smallest changes first; leave economy-shaping changes for Misa to weigh in on.

## 2026-10-10: Real leet points

**Decision.** Staging reads the leet bot's dev API and production reads its prd API (`LEET_SOURCE=http`, URLs in `wrangler.jsonc`, key in the `LEET_API_KEY` environment secret, required by the deploy job). The mock stays for local development and tests. Staging's earlier simulated credits stay in its ledger; production starts clean and backfills the last 7 days of real leets on first sync.

## 2026-10-10: Per-guild timezone

**Decision.** Each guild's timezone is stored in that guild's data (`guild_meta.timezone`, an IANA name, added by migration 5) and `Europe/Helsinki` is only the default (`DEFAULT_GUILD_TIMEZONE`). The guild object resolves the timezone once per operation (cached in memory, cleared when it changes) and passes it explicitly to everything that computes guild-local dates: the leet sync (including `since_date` and the mock source), alarm scheduling, and later the raid calendar. No function has a default timezone parameter, so a missing timezone is a compile error. A stored value that is not a valid zone falls back to the default and logs a warning without the value. `GET /api/state` and `GET /api/me` return `timezone` so the client can show guild-local times. There is no endpoint to change it yet; `GuildCore.setTimezone` validates (`isValidTimeZone`) and re-arms the alarm for when an admin setting is added.

**Reasoning.** Servers outside Finland need their daily leet and weekly raid times in their own timezone. Passing the value explicitly keeps the engine and scheduling pure and testable, and avoids a hidden Helsinki assumption creeping back in. This replaces "Helsinki time" in the scheduling entry above wherever it describes behaviour: schedules are guild-local.

## 2026-10-10: Leet sync status visible to players

**Decision.** The leet sync records its own health in `leet_sync` (migration 6): `last_attempt_at`, `last_error` (an error kind such as `unauthorized`, `not_found`, `timeout`, `network`, `rate_limited`, `upstream`, `invalid_response`, `invalid_request`, `disabled` or `internal`; never a message, URL or key) and `last_days` (days processed by the last successful run). These are written in their own small transaction, apart from the credit transactions. `GET /api/state` and `GET /api/me` return `leetSync: { source, lastAttemptAt, lastSyncedAt, lastError, lastDays }`, and the Activity footer shows one text line from it: "synced 5 minutes ago (3 days)", "not synced yet", or a warning with a plain-English reason and "Tell the game admin." A guild with no leet source stores `disabled`.

**Reasoning.** A production player saw 0 Bait and no history, and Worker logs are not visible from the development environment. Showing the sync's state in the app makes a rejected key, an unknown server or a slow bot diagnosable by anyone, without leaking any upstream data (only a fixed set of kinds ever leaves the server).

**Follow-up.** `/api/me` and `/api/state` now wait up to 6 s for a sync (was 3 s), longer than the 5 s HTTP timeout, so one slow first call to the leet bot can finish in time. If the first sync is still running when the Activity loads (an attempt, nothing synced, no error), the Activity re-asks `/api/state` every 3 s, at most 5 times, and updates the balance, history and footer as the credits arrive.

## 2026-10-10: Leet points table

**Decision.** Leet points per day come from a fixed table by the number of players who leeted that day **[Misa]**:

| Leeters     | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  | 11  | 12+ |
| ----------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Points each | 5   | 5   | 6   | 6   | 7   | 7   | 8   | 8   | 9   | 9   | 9   | 10  |

Rules behind it: more leeters never pays anyone less; a solo leet pays the same as a double; each extra leeter adds less than the one before; at most 10 points a day (multi-leet awards cap at 10 too). It counts only who actually leeted, so inactive server members don't matter. The rate drops from 10 to **7 Bait per point** so total income stays near the simulator-tuned level (`docs/balance/report-2026-10-10-points.md`): small servers now earn about two thirds of what a big one does instead of under half, and the top-earner vs casual power ratio now meets its target. This replaces the earlier n-points / solo-2 / cap-8 rule.

## 2026-10-10: No raid sign-up; parties of up to 15

**Decision.** Raids have no sign-up **[Misa]**. Every player with a starter who was active in the last 14 days (opened the game or leeted) is in the week's raid automatically, with an auto-picked team and auto-placement they can change, and can opt out for the week. A raid party holds at most 15 players; bigger rosters are split into balanced parties (snake draft on team power), each fighting the same boss with its own HP pool. Details: `docs/design/m4-raids.md`.

**Reasoning.** Absent players should still count (the server's power doesn't drop), but long-gone players shouldn't inflate the boss or collect loot. A 15-player cap keeps the row readable and coordination possible; the engine itself handles hundreds of creatures in milliseconds, so the cap is about play, not performance.
