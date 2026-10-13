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

## 2026-10-10: M4 raid server (implementation choices)

**Decision.**

- The raid calendar is pure functions over `RULES.raid.schedule` (weekday + local time) and the guild timezone (`raid-schedule.ts`). A week id is the ISO week label of the day the week starts (for example `2027-W02`); Monday 00:00–13:36 belongs to the previous week.
- One alarm per guild serves the leet sync and the raid events: it is set to the earliest of the next 13:40 sync and the next not-done raid event, and when it fires it runs everything due in time order. Raid events are idempotent per (week, event) through `raid_events` done markers; missed events run late in order, and events of a week that was never opened are marked skipped. Due events also run on any authenticated request and on session creation.
- Schema migration 7 is the leet-sync `source` column; the raid tables are migration 8 (raid weeks, parties, members, opt-outs, teams, placements, results, event markers, jackpot pity; `server_firsts` is recreated to allow the `jackpot` kind).
- Each party resolves a phase in one transaction: the stored result row is the done marker and Essence has the ledger key `raid:<week>:<party>:<phase>`. The fight seed is 128 live crypto bits stored as hex next to the exact fight input; the engine sees opaque player keys (`m1`, `m2`, ...), so stored inputs and replays contain no user ids. The adaptation (and the HP pool) are kept per party, since each party's phase 1 decides its own.
- Auto team power is `atk + floor(hp / 10)` of the effective stats (`creaturePower` in `@creatures/game`, also used by the simulator). Away creatures still fight.
- M4 finales give every member one default finale ability, round-robin over the content list, firing at its default round. A jackpot pays `RULES.raid.jackpotEssence` and records one shared `jackpot` server first (species `jackpot`) for everyone who hit in the same finale; a lost finale advances the pity counter like a miss.

**Reasoning.** Server-authoritative and race-safe like the rest of the game, with one alarm to re-arm and no duplicated schedulers; replays are exact because input and seed are stored.

## 2026-10-10: Discord raid posts

**Decision.**

- The announcement channel is `location.channel_id` from Discord's verified activity-instance answer (never from the client, and only if it is a snowflake). It is stored in `guild_meta.announce_channel_id` and updated on every login, so it is "the channel most recently launched from". Without one, nothing is queued.
- Posts go through a queue table, `discord_posts` (migration 9). A post is queued inside the transaction that commits the raid event (boss reveal at week start; one post per party for each phase), with the unique key `raid:<week>:<event>:<party>` (`raid:<week>:weekStart:all` for the reveal), so it is queued at most once even if an event runs again. Queuing never blocks the raid: errors are caught and logged by type.
- Delivery runs after the transaction: in the background on any authenticated request and on session creation, and from the alarm. The alarm also wakes for the earliest pending post. A post is claimed (attempt counted, leased for 10 minutes) before sending, so two runs never send it twice at the same time; an object that dies mid-send can send it again after the lease. Each message is one `POST /channels/{id}/messages` with a 5 s timeout, `redirect: 'manual'`, `allowed_mentions: { parse: [] }` and `flags: 4` (no embeds). On 429 the post waits `retry_after`; on 5xx or a network error it retries after 1 min, 5 min, 30 min, 2 h; after 5 attempts it is `failed`. 403, 404 and other client errors fail at once. Logs contain error kinds only.
- Message text is built by pure functions (`discord-format.ts`). All player text (display names, nicknames) is cut to 32 code points and markdown-escaped (backslash, asterisk, underscore, tilde, backtick, pipe, greater-than, hash, hyphen, square brackets, parentheses and colon get a backslash), and a zero-width space follows every `@`, so mentions, channel links, emoji and timestamps typed by players stay inert. Messages are cut to 2,000 characters without splitting an escape, a surrogate pair or a timestamp.
- Content: Monday boss reveal (name, element, gimmicks in plain words, turn order, phase times as Discord timestamps, players in); Friday and Saturday per-party summary (cleared or not, boss HP left, top three by contribution, most used reaction, key moment, the flat Essence per player, and after phase 1 the boss's counter-move); Sunday finale result, jackpot hits, and this week's first-on-server records of the party's members.

**Reasoning.** A queue in the same database as the raid state gives exactly-once queuing with the same transaction guarantees as the rest of the game, and keeps the slow, unreliable network call out of every transaction. Escaping plus `allowed_mentions` is defence in depth: the second alone already prevents pings, the first keeps the text clean. The bot needs View Channel and Send Messages in the announcement channel (usually the voice channel's text chat).

## 2026-10-11: Second balance tuning pass

**Decision.** From the simulator (full run, seed `leet`: 12 of 21 targets passed before, 19 after; `docs/balance/report-2026-10-11.md`):

- Training costs `3 + 2 x level` (was `10 + 5 x level`). The simulator's players now push one creature at a time to its evolution level before spreading Bait over the team; the old "always train the weakest of the top 3" rule kept every casual's best creature at level 4.
- Boss HP grows with `N^1.2` (was `N^0.9`) and 12% per average creature level (was 7%). Bigger servers earn more Bait per player, so with a sub-linear exponent 15-player raids were won 99% of the time; at 1.2 the finale win rate is flat from 5 to 15 players. The raid is now equally hard for a week-4 and a week-8 roster.
- Phase 1 clears at 18% of the pool (was 20%), Phase 2 at 54% (was 45%).
- Reactions deal x4.5 (was x2.5) and payoff creatures get an extra x1.1 (was x1.25). Setters now earn a real share of the credit (16.6%, target 15%) and no creature runs away from its rarity (highest 1.41x).
- Boss base HP: Tidal Colossus 4724, Cinder Wyrm 2710, Thornmother 4296, Storm Sovereign 4380. Mistnewt and Fogwyrm get more Attack (a guard nobody picked), Gaiadrake and Pyrelynx a little less, Sproutle a little more.

**Left failing on purpose.** The jackpot rate per finale win (18.9%, target 6-15%) and players reaching hard pity (66%, target <= 15%) cannot both be met while a lost finale advances the pity counter without a jackpot roll: at a 50% finale win rate a guaranteed jackpot every 10 raids is already 20% of a player's wins, and most players reach it. Counting only finale wins toward pity would pass both (measured: rate 11%, hard pity 18%, about 7% with soft pity starting at raid 5). That changes the pity rule, so it is an owner decision; nothing was changed in the worker.

**Reasoning.** One lever at a time, checked on six seeds, with the fixed owner decisions (leet points table and cap, Bait per point, hard pity at 10 raids, 70/30 Essence split, schedule) untouched. Tests that hard-coded the old numbers now read them from `RULES`; the engine's hand-checked combat tests use a pinned copy of the original reaction multipliers so retuning the shipped content does not break them.

## 2026-10-11: Live finale over short polling first

**Decision.** The live Sunday finale (M5) runs on the guild Durable Object with the fight's state derived from the clock. The client polls `GET /api/raid/live` every 2 s and acts with `POST /api/raid/live/action`. WebSocket push on the same object comes later, after a staging spike inside real Discord. The fight input and seed are frozen at the start, rounds come from `floor((now - start) / 10 s)`, and every read re-simulates the fight with the abilities known so far. That stays consistent because of the engine's prefix property (rounds 1..r depend only on abilities fired in rounds 1..r), which a test pins down. Present players can **Fire** (takes effect next round) or **Hold** (keep it past the default round; an unused held ability fires in the last round). Everyone else fires at the default round **[Misa: absent players fire at default; Hold rule to confirm]**. Details: `docs/design/m5-finale.md`.

**Reasoning.** Discord documents almost nothing about WebSockets through its Activity proxy (`docs/research/platform.md`). Plain HTTPS already works on every client, and 15 players polling every 2 s is trivial load. Deriving rounds from the clock needs no per-round alarm or broadcast state, survives restarts, and lets polling and a future push channel share one snapshot format. CLAUDE.md's "the live finale uses WebSockets" remains the target, but it is deferred.

## 2026-10-11: M5a live finale server (implementation choices)

**Decision.** The server side of the live finale follows `docs/design/m5-finale.md`. Where the spec left room, these are the choices:

- **Storage (migration 10).** `raid_live` holds one fight per (week, party, practice): the frozen input (without abilities), the seed, the members, each member's ability state (`default` | `held` | `fired`, `fireAtRound`, `params`), `started_at`, `round_ms` (10 000) and `rounds`. `raid_abilities` holds the pick per (week, user). `raid_reveal_seen` marks a seen reveal per (user, week). A `raid_live` row is never deleted; for a real finale the `raid_results` finale row is the done marker.
- **The finale event** now starts the live fights, sets the week status to `finale` (so team, placement and the ability pick lock) and is marked done. A live fight counts from the scheduled time if it starts within 30 s of it, otherwise from the moment it started. If the event runs more than 10 minutes late (the object slept through it), nobody can watch: it resolves instantly through `resolveParty`, as in M4, using the players' ability picks. This also keeps a missed finale from running into the next week.
- **End and resolution.** A fight is over when its time is up (`started_at + rounds × round_ms`), or when the rounds shown include the boss falling or everyone knocked out. It resolves through `settleParty` from a live read, from any authenticated request (an unresolved row costs one simulation per request while a fight is live), or from the guild alarm, which is armed for the end of the last round through the existing alarm multiplexing. Jackpot rolls draw from the injected `raidRng` at that moment; the seed draw happens at the start.
- **Fire and Hold.** The error order for Fire is: not in the fight (`not_in_fight`, 409), then `too_late` if the current round is the last or the fight is over, then `already_fired` if the ability has fired or is already scheduled. So in the last round every Fire is `too_late`, and `already_fired` is for earlier presses. Hold: `already_fired` if Fire was pressed; pressing Hold again on a held ability is a no-op; `hold_too_late` from the default round on, in the last round and after the end. Parameters (`zone`, `element`) go with Fire only and only for Shield Wall and Re-mark (`invalid_body`, 400, otherwise). A held ability fires at the start of the last round in the simulation, so the last round is also the last moment a Hold can matter.
- **Snapshot.** `GET /api/raid/live` has the spec's fields. Extras: `names` (the replay's name tables), `row` (the frozen row, as in the replay), `abilities[].defaultRound` and `abilities[].fireAtRound` (the round a pressed Fire takes effect), and `you` is the caller's opaque player key (`m1`, ...) or null. In `none` and `lobby` the fight fields are empty. `done` stays until the week ends. The seed is never in a response; after resolution it is public through the replay as before.
- **Reveal.** `you.reveal` is for the latest finale the player took part in (real finales only) unless marked seen. `POST /api/raid/reveal-seen` answers 404 `not_found` for a week the player did not take part in, so the table only holds rows for real participation. `firstOnServer` is read from `server_firsts` (the jackpot record of that finale's week).
- **Ability pick.** `PUT /api/raid/ability` is allowed while the week is not `finale` and the clock is before the finale time; otherwise 409 `locked`. Unpicked members get the M4 round-robin by position in the party.
- **Practice.** `RAID_PRACTICE` is `"on"` in the staging environment only. A practice fight is visible for 10 minutes (the cooldown) and then disappears; a finished real finale shows again after that. A practice fight is refused (409 `practice_blocked`) from 30 minutes before the finale until that party's finale has resolved, and once per party per 10 minutes (409 `practice_cooldown`). Practice and the real fight have separate rows, and the real fight, while it is going or in its lobby, always takes precedence in the snapshot and in actions.
- **Watching.** The set of players who polled in the last 10 s is kept in memory in the guild object (best effort; lost on restart) and lists display names of the caller's party only.
- **Rate limit.** Unchanged (burst 30, one per second per player). Polling every 2 s is 0.5 requests per second, and a test polls for 200 s without a 429.

**Reasoning.** Keeping `raid_live` as the one source for both the live view and the resolution means the replay is exactly what was watched, and the prefix property (pinned by an engine test) keeps every re-simulation consistent. The instant fallback keeps a long outage from producing a "live" fight nobody can see.

## 2026-10-11: Misa's answers after testing M4 and M5 on staging

- **Reactions** at about half of all damage (balance pass 2): accepted **[Misa]**.
- **Live finale Fire/Hold**: accepted **[Misa]**.
- **Raid post channel:** a fixed channel per server, set by someone with Manage Server **[Misa: a specific channel]**. Plan: a "Post raid news here" button in the Raid tab, shown only to members with Manage Server (or Administrator, or the owner). The permission is checked on the server through Discord's API, and the channel is the one the Activity was launched from (verified, never typed in). Until it is set, posts follow the last launch channel.
- **Creature abilities** (Misa's idea): finale abilities should come from the player's creatures and unlock as they level, so investing in a creature pays off. Proposed defaults, waiting for his OK: each species has its own ability, unlocked at level 10 and stronger after evolving; every creature in the raid team of 3 with an unlocked ability gives one use in the finale; a player with none still gets one basic ability (today's four); absent players' abilities fire at their default rounds.
- **Pity rule:** still open (count lost finales or wins only).
- Production leet points were confirmed correct by Misa.

## 2026-10-11: Pinning the raid-post channel from the Activity

**Decision.** A server admin can pin the raid-post channel from the Raid tab ("Raid news" card). Implementation choices:

- **Storage (migration 11).** `guild_meta.announce_channel_pinned` (0 or 1) and `sessions.channel_id`. Every session remembers the channel Discord reported at login (verified, snowflake only; null for sessions made before the migration, which cannot pin until the player reopens the Activity). While the flag is 1, logins do not change `announce_channel_id`; pinning writes the session's channel into it, so `announceChannelId` and the post queue needed no change. Unpinning only clears the flag: the channel stays as it was until the next login, which then updates it as before.
- **Routes.** `POST /api/raid/channel { action: 'pin' | 'unpin' }` (strict; the channel is never in the body) and `GET /api/raid/channel` answering `{ pinned, here, canManage }`. `GET /api/raid` also carries `channel: { pinned, canManage }`, where `canManage` is `null` unless it is in the 60 s cache (no Discord call on a raid read). No answer contains a channel id. Pinning from another channel moves the pin; unpinning is allowed from any channel.
- **Who may.** The guild owner, or a member whose base permissions (the @everyone role, whose id equals the guild id, OR-ed with their roles; BigInt) include Administrator or Manage Server. Checked on the server with the bot token: `GET /guilds/{id}` (owner), then `GET /guilds/{id}/roles` and `GET /guilds/{id}/members/{user}`; the last two only when the user is not the owner. Channel overwrites are ignored (the permissions are server-wide). Each reply is validated with valibot. Same fetch conventions as the other Discord calls (5 s timeout, `redirect: 'manual'`, error kinds only in logs, snowflake-only ids in URLs).
- **Failures.** Any Discord failure (network, timeout, 4xx/5xx/429 on the guild or roles lookup, wrong shape, no bot token configured) is 503 `discord_unavailable` and nothing changes; no permission is 403 `forbidden`. A 404 on the member lookup means the user is not in the guild, which counts as "no permission" (403), not as a failure; a 404 on the guild or roles means the bot is not in the guild, which is our configuration problem (503). A session without a launch channel gets 409 `channel_unknown` when pinning.
- **Cache.** The guild object keeps each player's answer, positive or negative, for 60 s (in memory, at most 200 players, concurrent lookups share one request). A pin or unpin always asks Discord again, so a role that was just granted or removed counts at once. Failures are never cached.
- **Client.** The card is shown only when `GET /api/raid/channel` says `canManage: true`, asked once when the Raid tab opens and silent on errors. Buttons: "Post raid news in this channel" / "Raid news posts here" with "Stop pinning" / "Raid news goes to another channel" with the pin button. In the last state "Stop pinning" is offered too, so an admin does not have to go to the other channel to undo a pin.

**Discord API assumptions.** `GET /guilds/{id}`, `/roles` and `/members/{user}` are plain REST calls with the bot token and need no extra permission for a bot that is in the guild. I believe the single-member lookup does not need the privileged Server Members intent (that restriction is documented for the member list and for Gateway events); this is from memory of the docs and should be confirmed on staging. If it did need the intent, enabling "Server Members Intent" in the Discord developer portal would be the fix. The `permissions` field of a role is a decimal string, parsed with BigInt.

**Reasoning.** Keeping the pin in the existing `announce_channel_id` means the queue and every poster keep working unchanged. Asking Discord on the server (never trusting a client claim) and failing closed when Discord cannot answer keeps the permission check authoritative; the 60 s cache keeps the calls to a few per admin per minute under the per-player rate limit.

## 2026-10-11: Creature abilities, phase 1 (content, engine, simulator, pity)

**Decision.** The spec is `docs/design/creature-abilities.md` (agreed with Misa). Phase 1 implements the content, engine and simulator side; the live server and client follow in phase 2. Implementation choices:

- **Content.** `FinaleAbilityDef` has `kind: 'basic' | 'creature'` and `effects` (1 to 3 of `rally`, `shield_wall`, `re_mark`, `purge`, `strike`; strict schemas, integer basis points; `rounds` defaults to 1 for rally and shield wall, absent for purge means the rest of the fight). Species have an optional `ability: { id }`. `RULES.abilities.unlockLevel` is 10. `abilitiesFor(team, levelOf)` returns a team's creature abilities. `loadContent` checks that referenced abilities exist, belong to one species and are `creature` abilities, that basic abilities have one effect with a player choice, and that a stage-2 ability is stronger than the stage-1 one (same ops and choice, no amount or duration lower, at least one higher or an extra effect). All 20 species have an ability.
- **Engine.** `AbilityChoice` gains `key` (unique in a fight, 1 to 64 characters, duplicates throw) and an optional `creatureId` (a slot of the same player; required for strike and `own` zone or element). A player may hold several choices. Timed effects run from the round they fire in: rallies add up, Shield Walls on one zone multiply (two 50% walls leave 25%), the longest purge wins (a `restored` adaptation event marks the end of a timed purge). A strike is a hit by its creature at `atk x atkBp / 10000`: it can cash in the mark, applies marks like a hit, credits contribution like a hit, leaves the creature's support buff for its normal turn, lands even if the creature is knocked out, and is never reflected by Backdraft when the creature is down. An `re_mark` by a creature credits setup to that creature. A strike that kills the boss ends the fight. Events carry `key` and `creature`; strike hits carry `ability` and `key`; `describeEvent` says "Cindle's Flare Strike".
- **Balance.** Numbers come from the simulator (`docs/balance/report-2026-10-11-abilities.md`): basic abilities are weak (Rally +10% for 1 round instead of the starting +15%, because +15% made a basic Rally better than most creature abilities), creature abilities add about 20% of finale damage for a week-8 roster. Boss base HP was re-tuned (the abilities lift each boss differently). The ability damage share is reported as information, not a target.
- **Pity: finale wins only** **[Misa]**. The counter advances only on a win without a jackpot; a loss changes nothing; soft pity starts at raid 5 (`softPityFromRaid` 5). `PITY_COUNTS_LOSSES` is removed from the simulator and the worker's `rollJackpots` does the same. This makes both pity targets pass (jackpot rate 12.4%, hard pity 11.9%). It replaces the earlier "pity counts participation" choice.
- **Worker and client in this phase.** Only what keeps them working: each member brings their basic ability with key `<alias>:basic`; the ability picker and `PUT /api/raid/ability` accept basic abilities only; the Fire/Hold parameter checks read `effects`. The live snapshot, `key` in the action body and creature abilities in the finale are phase 2.

**Reasoning.** Effects as data keep new abilities a content change. Giving every ability its own key and creature makes replays and descriptions exact. Weak basics plus unlockable creature abilities give training a visible payoff without making the finale depend on rare creatures.

## 2026-10-11: Creature abilities, phase 2 (server and client)

**Decision.** The live finale and the Activity now use creature abilities, following `docs/design/creature-abilities.md`. Interpretations and choices:

- **Building.** Each member's abilities are built once in `buildPhaseInput`, so the live start, the instant late path (event more than 10 minutes late) and practice all share it: the basic pick (key `<alias>:basic`) plus `abilitiesFor(frozen team, levels)`. A creature ability's key is `<alias>:c<n>`, where `n` is the creature's index in the member's effective team (0 to 2, not its position in the ability list), so a locked creature leaves a gap (`m1:c0`, `m1:c2`) and no raw creature id is in a key. The choice's `creatureId` is the creature id, which is also the frozen row slot id. A creature that is not in the row would be skipped (it cannot happen with a row of 3 slots per player).
- **Storage.** The `abilities` JSON of `raid_live` holds `key`, `alias`, `abilityId`, `creatureId`, `mode`, `fireAtRound` and `params` per use. No migration is needed (it is JSON).
- **Snapshot.** `abilities[]` has one entry per use: `{ key, alias, abilityId, creature, mode, fired, firedAtRound, fireAtRound, defaultRound }`. `fired` and `firedAtRound` are found by the ability event's `key`.
- **Action.** `POST /api/raid/live/action` takes a required `key` (at most 16 characters, shape `m<n>:basic` or `m<n>:c<digit>`, strict schema). A well-formed key that is not the caller's, or does not exist, gets 409 `not_your_ability` (the same answer for both, so a key reveals nothing). A caller who is not in the fight still gets 409 `not_in_fight` first. Fire and Hold apply per key. `zone` and `element` are accepted only when the ability's effects use `choose`, so for all shipped creature abilities they are 400 `invalid_body`.
- **Raid view.** `you.abilities` is `[{ key?, abilityId, creatureId | null, species | null, unlocked, unlockLevel }]`: the basic ability first (`creatureId` and `species` null, `unlockLevel` 1), then one entry for each team creature whose species has an ability, in team order. A locked entry has no `key` because it will not be in the fight. It is empty for players who are not in a party. It previews the current effective team, so it can differ from the frozen fight if the team changes, which is only allowed before the finale.
- **Collection.** Each creature in the state response has `ability: { id, unlocked, unlockLevel, nextId? } | null`. `nextId` is the evolved species' ability and is absent for stage 2 and for species that never evolve.
- **Legacy rows.** `raid_live` rows from before this change (no `key`, no `creatureId`) are read through `normalizeAbilities`: a choice without a key becomes `<alias>:basic`. A choice is dropped when its ability no longer exists in the content, its key repeats, its creature is not in the frozen row, or it is a creature ability without a creature. If the engine still refuses the stored fight, the fight is simulated without abilities (and the error kind is logged) instead of failing every read. Stored results (`raid_results`) are never re-simulated, so replays from before still read as they were.
- **Client.** The live panel has one card per own ability, labelled "Cindle's Flare Strike" (the creature's fight name, so nicknames show as set) or "Rally (basic)", with the effect line from the content description, its state and its own Fire and Hold. A lock per key stops a double tap on one ability while another stays pressable. Other players show as "2 of 4 used. Latest: Rex's Flare Strike (round 5)". The Raid tab card "Your finale abilities" keeps the basic picker and lists the creature abilities, locked ones as "Unlocks at level 10 (now level 7)". Collection cards show "<Name>: <effect>" when unlocked, "Finale ability: unlocks at level 10" when locked, and "Evolves into: <stage 2 species> (<stronger ability>)" for a creature that can evolve. All text is rendered as text.
- **Client bug found on the way.** The state parser refused `kind: 'jackpot'` in `serverFirsts`, so after any jackpot hit on a server, `GET /api/state` would have failed to parse in the Activity. The parser and type now accept it (a test uses a real response).
- **Fixtures** in `apps/activity/src/fixtures` were re-captured from real server output (live, action, practice, raid view, a new `collection-state.json`, and the new `not_your_ability` error). A lost finale's `pity` is 0 now (wins-only pity).

**Reasoning.** One place builds abilities, so the live, instant and practice finales cannot differ. Keys by team slot are short, stable within a fight and leak nothing. Tolerant reading of old rows means a deploy during a live finale cannot break it, and old replays are plain stored data.

## 2026-10-11: Ability weight, defence and luck (Misa)

- **Ability weight:** creature and basic abilities at about a fifth of finale damage is right **[Misa]**.
- **Defence:** keep it as it is. Harder future bosses will hit harder, which gives guard creatures and shields more value and a reason to build them for harder content **[Misa]**. Revisit when harder bosses arrive.
- **Luck:** player skill (ability timing, coordination on defence) should push the odds up, not decide the outcome. A fight should keep an element of randomness **[Misa]**. Next step: measure how much a fixed roster's outcome varies with the seed alone, and if it is close to all-or-nothing, propose a small visible luck element (for example crits or a damage spread), tuned with the simulator.

## 2026-10-11: Crits are in; progression proposal

- **Crits** go into combat regardless of the luck study: a small baseline crit chance and crit damage for every hit, crit stats with caps, and boss crits **[Misa]**. They are being built behind config on branch `luck-crits`. Boss HP is retuned when they are switched on.
- **Pre-decided fights** are acceptable if the week-to-week path is visible and honest **[Misa]**. The research-backed proposal in `docs/design/progression.md` replaces the current "boss follows average level" scaling with a visible per-server Boss Rank ladder, with Resolve after a loss, Festival weeks, rank-scaled rewards and a readiness band. Waiting for Misa's calls on its five questions.

## 2026-10-11: Progression decisions (Misa)

On `docs/design/progression.md`:

1. **Boss Rank ladder** replaces scaling by average level **[Misa]**. A finale win raises the server's rank by 1. A loss keeps the rank, and players grow their creatures and try a similar boss next week **[Misa]**. There is no Resolve and no demotion.
2. **Festival weeks: yes**, with **festival-only loot** **[Misa]**. Plan: every 5th week is a Festival, with an easier variant and bonus Essence. A festival finale win gives each participant that festival's creature, which can't be caught any other way.
3. **Season reset tied to the festival cycle** **[Misa]**. A season is 4 normal weeks plus 1 Festival week. After each Festival the rank eases back by a small amount, set by the simulator. This also keeps a stalled server from being stuck forever.
4. **Readiness band: yes, kept vague** **[Misa]**. Only Long shot / Even / Likely / Strong. No numbers, no frequencies.
5. **After-action card:** "Close one!" when the boss was nearly down, plus enough fight stats for players to work out what to change **[Misa]**. The card shows damage per player and creature, reactions, abilities and when they fired, knockouts and boss HP left. It gives no solutions.
6. **Luck:** crits in, Fortune streaks out for now (lead's call, delegated by Misa). The final crit settings come from the crit study. Nothing here blocks the first full raid week.

## 2026-10-11: After-action card (implementation choices)

**Decision.** Every resolved stage (Phase 1, Phase 2, finale) has an after-action card in the Raid tab results and on the finale loot reveal (the Raid tab one and the one at the end of the live finale), following item 5 of Misa's progression decisions. It states facts and never gives advice. Interpretations:

- **Endpoint, not inline.** `GET /api/raid/stats/:week/:party/:phase` (same path checks as the replay) instead of a `stats` field on `PhaseResultView`. Reasons: the stats need the stored `input` and `result` (hundreds of kilobytes of JSON for a big finale), and `GET /api/raid` is read after every team or placement change; and the reveal can be about an earlier week. The card asks for its numbers when it is shown. `RevealView` gained `party`, so the client can ask for the finale's stats. Nothing is simulated again: the stats are built from the stored fight.
- **Who may read.** Only members of that fight. A missing fight and someone else's fight are the same 404 `not_found`. (The replay route stays open to every guild member, as before.)
- **Privacy.** Players are `displayName` plus a `you` flag (the caller's own name is sent too; the client prints "You"). No user ids, no creature ids at all (not even the caller's), no `m1` keys, no seed. Guests have `owner: null`.
- **Shape.** `outcome` (`cleared` | `missed` | `wiped`; wiped means every creature in the row was knocked out and the stage was not cleared), `close`, `rounds`, `maxRounds`, `boss` (`hpMax`, `hpStart`, `hpEnd`, `leftBp` in basis points of the whole pool, `needed` HP to clear, `lost` HP taken off), `players` (damage, contribution, best damage first), `creatures` (the top 5 plus the caller's own, each with its overall `rank`), `reactions` (per reaction: count and how many were reflected), `abilities` (`used`: whose, which, creature, round, `byDefault`; and `unused`, abilities that never fired because the fight ended first), `knockouts` (creature, species, owner, round), `adaptation` (rule, what it resists, `resistBp`, `purged`, `purgedRound`, `restoredRound`; null in Phase 1, which has none).
- **Damage means credited damage**, as in the existing summaries and Discord posts: the share of a reaction bonus credited to its setter and the support share are in "contribution", not in the hitter's "damage". Top creatures and players are sorted by that damage.
- **The close rule** is `RULES.raid.closeCall` (`missBp` 1000, `spareBp` 1000), integer maths. Not cleared: close when the shortfall is at most 10% of the stage's target. A phase's target is its clear threshold (cumulative HP to take off the pool, as the engine decides `cleared`); the finale's target is the whole pool, so a finale is close when the boss kept at most 10% of its maximum HP. Cleared: a phase is close when it took at most 10% of its threshold off beyond it; a finale win always empties the pool, so its spare is measured in rounds: close when the boss fell with at most 10% of the finale's rounds still to play (rounds 11 and 12 of 12). Phase 2's threshold is cumulative, so Phase 1 damage counts towards it. A wipe-out can be close (a stage the whole party was knocked out in, at 5% of the pool left, is close); the headline then still says "Close one!" and the outcome line says everyone was knocked out.
- **Client.** The headline is "Close one!" when `close`, else "Cleared" or "Not cleared". Bars are `<progress>` elements with classes (no inline styles); the caller's rows are highlighted. Long lists (reactions, abilities, knockouts) show 6 lines and the rest behind "Show all". The result card in the Raid tab no longer repeats the HP bar, reaction count and top three, because the card has them. If the stats cannot be loaded, the card says so and the rest of the result still shows.
- **Advice removed from the replay.** The replay's personal recap used to end with suggestions ("Try a Setter right before a Payoff", "A Guard in the same zone takes hits for it"). That contradicts Misa's rule, so it now prints facts only (`recapNotes`: no reaction set up, N setups overwritten, creature X knocked out in round R).
- **Replay opens from the reveal.** The `Replay` view now takes the week and party it is for (it used to take the current week's view), so a reveal for an earlier week can open its replay too.

**Not done on purpose.** The "one concrete fixable cause" from `progression.md` section 6 (replaying the stored fight with one change) is not built: Misa decided on stats without solutions.

## 2026-10-11: Crits, boss crits, knockouts and guards measured (study, nothing switched on)

**Decision.** Misa prefers crits to Fortune streaks, so crits were built as stats and measured together with boss crits and boss lethality (`docs/design/luck.md`, second study). Built, all default off and replay-safe: per-creature crit chance and crit damage (baseline in `RULES.combat.luck`, optional `crit` bonus on species and bosses in the content, caps 30% and +150%), boss crits (own chance and damage), "Critical!" on hits and boss hits, a prototype random boss target, and study-tool support for boss Attack dials, knockout targets, boss HP retuning and guard and shield measures. Four payoff species carry a +5% / +25% crit bonus, inert while luck is off.

**Result.** Crits plus boss crits plus any boss lethality (up to 9 knockouts per finale, even with random targets) leave 74% to 94% of typical inputs decided and only 2% to 17% in the 15% to 85% band: the boss knocks out low-Attack front creatures, the same ones every seed, so knockouts are neither big nor random. Fortune streaks (17% each, plus or minus 60%, 3 rounds) on top reach 61% (finale) and 74% (week) in the band with a skilled uplift of +29 and +24. Boss Attack x3 (about 4 knockouts) makes Shield Walls count (leaving them out costs 8 points instead of 3) but the guard role stays worth about 1 point at any lethality.

**Recommendation to Misa (pending his call).** Ship streaks plus crits as flavour; leave boss Attack at x1 until harder bosses arrive; for guard creatures to count, harder bosses need several hits a round or hits that reach key creatures and zone hits a guard can intercept.

**Reasoning.** Variance has to be shared by the whole team to move outcomes; per-hit luck averages out and knockouts with front-first targeting are deterministic and cheap.

## 2026-10-11: Progression, phase 1 (rules, content, simulator)

**Decision.** Misa's progression decisions are built in the rules, content and simulator (`docs/design/progression.md`, "Phase 1: what was built"; measurements in `docs/balance/report-2026-10-11-progression.md`). The worker and client follow in phase 2. Choices and interpretations:

- **Crits are on** (`RULES.combat.luck`): 5% / +50% for every creature and for the boss, species bonus kept, caps unchanged. Fortune streaks and the damage spread stay in the code, default off (lead's call, delegated by Misa). Boss Attack stays at x1. Stored inputs carry the luck config they were fought with (the worker must copy `RULES.combat.luck` in; phase 2).
- **Boss Rank replaces scaling by average level.** `scaleBoss(boss, players, rank)`. HP = `baseHp x N^e x rankFactor`; the rank factor compounds **+40% per rank** (integer basis points, floored each step, rank 1 to 30); Attack follows the excess at half strength so higher ranks do not knock out the row, as the old level scaling did. **A smaller step does not fit the targets:** over 30 weeks a server's wins are its rank gains plus the season resets, so the long-run win rate (40 to 60%) and "median 2 to 4 weeks between rank-ups" need the server's whole growth to be worth only 4 to 6 ranks. At +20% the simulator gave 65% and a median of 1 week. This is a game-feel question for Misa (a big, visible step per rank).
- **Head count is weight-neutral.** Every signed-up player counts once whatever their level, so one veteran cannot inflate the boss and no per-player cap is needed (there is no per-player weight). The exponent is now **per boss** (optional `hpExponent` in content, else `RULES.raid.scaling.hpExponent` 1.1): one exponent could not keep every boss flat from 5 to 15 players (Backdraft, resisted reactions). Fitted on four seeds with the tuning tool.
- **Placement** (`placementRank(levels)`): once, at the server's first raid week, the rank whose HP factor is closest to the old rule (+12% per average level above 1).
- **Ladder** (`nextRank`): a finale win in a normal week +1; a loss keeps the rank; no demotion, no Resolve; never below 1. **A Festival win does not raise the rank** (interpretation: the Festival is a break from the ladder; its reward is the Essence bonus and the creature). A week with no finale changes nothing.
- **Seasons and Festivals** (`seasonOf`, `raidWeekPlan`): a season is 5 weeks, the 5th is a Festival, from the global week index (the number that rotates the bosses), so every server shares the calendar and nothing is stored. The Festival boss fights at rank - 3 and Essence pays +50%; after each Festival (won or lost) the rank eases by 1. Ease 3 makes the Festival a near-certain win (97%) and breaks every loss streak; ease 2 lets 5% to 10% of servers lose more than 4 in a row.
- **Festival creatures:** Lanternfin (tide, epic, support) and Hearthshell (ember, epic, guard), `festival: true`, never catchable; one per Festival by season index, alternating (`festivalCreatureFor`). A repeat is the usual duplicate (`festivalGrantOutcome`: fuse up to 5, then Bait by rarity). The content loader checks the flag (not catchable, not a starter, single-stage, has an ability).
- **Rewards scale with rank** (`essenceMultiplierBp`): x(1 + 6% per rank above 1), capped at x2; a Festival adds +50% on top; the multiplier follows the server's displayed rank, not the eased one; jackpot Essence scales the same way (`jackpotEssenceFor`). `essenceForStage` takes an optional week argument.
- **Readiness band** (`readinessBand`, `forecastFinale`, `forecastWeek`): margin = mean finale damage (5 fresh seeds, defaults, boss that cannot fall) over the HP left; thresholds 8000 / 8800 / 10300 basis points calibrated against the win rate of "skilled-ish" play (a third of the players timing well). Monday's forecast estimates the HP left from two simulated phases so the same thresholds apply all week.
- **Targets:** six new ones (long-run win rate per server size, Festival win rate, weeks between rank-ups, loss streaks), none loosened. The creature balance target now leaves out Festival species (compared, not enforced). **Phase 2 clears at 52% of the pool (was 54%)**: with crits on the Phase 2 and finale clear rates sit closer together, and the 70 to 85% target could not be met with boss HP alone.
- **Worker in this phase:** only what keeps it compiling: `scaleBoss(boss, players, 1)` (every server at rank 1), nothing stored.

**Reasoning.** The ladder's arithmetic (wins = rank gain + resets) makes the season reset the control for the steady win rate and the rank step the control for the honeymoon, so those two were tuned together; the Festival ease only has to make the relief week reliable. The remaining knobs were left where the targets pass on six seeds.

## 2026-10-11: Progression, phase 2 (worker and client)

**Decision.** The Boss Rank ladder, seasons, Festival weeks, rank-scaled payouts, the Festival creature and the readiness band are live on the server and in the Raid tab (`docs/design/progression.md`, "Phase 2: what was built"). The lead's numbers and Misa's decisions are unchanged; these are the interpretations:

- **Storage (migration 12).** `raid_ladder` (one row: the server's `rank`, NULL until placed, and `best_rank`, NULL until a normal week is cleared). `raid_weeks` gets `rank`, `effective_rank`, `festival`, `season_index`, `festival_species` (the week's plan, fixed at creation) and `ladder_at`, `ladder_won`, `rank_after` (the ladder's done marker and result). `raid_festival_grants` (primary key week and user: the idempotency of the grant). `server_firsts` is recreated with a fourth kind, `festival`.
- **Old weeks.** A week that exists when the migration runs keeps every new column NULL (`season_index IS NULL` means "legacy"). Two cases **[lead's change after review]**:
  - **Pool not stored yet** (the deploy landed between the week's creation and its Phase 1, the likely case): at Phase 1 the week is ranked (`convertLegacyWeek`). The server's rank is used, or, if it has none, the server is placed at that moment with `placementRank` from the creatures its members bring, and the rank is stored on the guild. The week stores its `raidWeekPlan` (rank, effective rank, season, Festival) and the boss is scaled with the plan's effective rank, not rank 1 (rank 1 is far weaker than the old formula for a levelled server). From then on it is a normal ranked week: rank-scaled payouts, Festival rules if the calendar says so, and the ladder moves after its finale. Before Phase 1 such a week shows no rank and no readiness band (there is no boss to forecast).
  - **Pool already stored at Phase 1:** the pool is untouched, Essence and jackpot pay the base amounts, no Festival rules, and its finale does not move the ladder. The server is placed when the next week is created.

  The new view fields are null for a week that has no rank (`rank`, `effectiveRank`, `season`). The luck rules (crits) apply to every fight built after the deploy, so a legacy week's remaining phases have crits even though Phase 1 did not.

- **Placement** (`placementRank`, once, from the 3 team creatures of every roster member): at week creation if the roster is not empty. **Deviation from the brief:** on a brand-new server the week usually opens before anyone has a creature, so placement happens as soon as the week has a member (`syncRoster`, on the first view or action) instead of at Phase 1. Phase 1 is still the last chance. Reason: otherwise the boss card would show no rank, and no readiness band, for the whole first week. Everyone who is eligible joins in the same `syncRoster` call, so the roster is not split across two placements.
- **The week's plan** is `raidWeekPlan(weekIndex, rank)`, stored at creation. The Festival creature of a Festival week is stored with the week (`festival_species`), so a later content change cannot change which creature a week gives.
- **Server won** = at least half of the parties that played a finale won (integer maths: `won x 2 >= played`; a tie counts as a win) **[lead's decision; Misa can change it]**. The ladder moves once, in the transaction of the last party that settles (a party with no members is not waited for). A week where no finale was played changes nothing. The rank the ladder starts from is the week's stored rank. The best rank is the rank of a won **normal** week (a Festival win never counts).
- **Festival grants** (`festivalGrantOutcome`): to every member of every party that won, in the same transaction that settles the party, once per (week, user). New: a level 1 creature (origin `festival`, never shiny). Fused: +1 fusion. Converted: Bait by rarity, credited with the key `festival:<week>` and source `festival`. "First on server": a **new kind `festival`** (the species is the Festival creature; everyone who got it in the same Festival shares it), because "caught" would be wrong for it; this needed the `server_firsts` CHECK to be widened. Festival species cannot be caught: `rollCatches` only draws `catchable` stage 1 species and the content loader refuses a catchable Festival species; a worker test claims 80 expeditions to be sure.
- **Readiness band** (`raid-readiness.ts`): `forecastWeek` while the week is open or only Phase 1 has resolved (Monday to Friday evening), `forecastFinale` on the finale input the party would fight with now once Phase 2 has resolved, none once the finale has started. It uses a **separate injected Rng** (crypto in production; `readinessRng` in `GuildCoreOptions`), never `raidRng` and never a stored seed, and only the band leaves the server (`party.readiness`). It is cached in memory per party and week state; a new state (Friday's or Saturday's result) is computed at once, a change to teams, placements, ability picks or the roster is picked up lazily and never more often than every 30 seconds, and without a change it is refreshed every 5 minutes (which catches training). A forecast that throws gives `null` and never breaks the view.
- **API additions** on `GET /api/raid` (and every response that returns the view): `rank`, `effectiveRank`, `festival`, `festivalCreature` (species id), `season: { index, week }` (week 1 to 5), `bestRank`, `party.readiness`, and in `you.reveal` (and the live finale's `loot`) `rankChange: { before, after, festival, serverWon } | null` and `festivalGrant: { species, outcome, fusionCount?, bait?, firstOnServer } | null`. `rankChange` is null until the ladder has moved (a multi-party server's first parties see it only after the last party has finished). The displayed Essence and jackpot are computed with the same `payoutWeek` as the payouts.
- **Discord.** Monday: "Boss Rank N." and, in a Festival week, "Festival week: <creature> for every winner, bonus Essence." The finale post lists "Festival creature: <name> for <members of this party who got it>" and the rank line ("The server climbs to Rank N.", "Rank N stays.", "The Festival is over. The server eases to Rank N."), with "X of Y parties won." first on a multi-party server. The rank line is in the post of the party that settles last, because earlier parties do not know the result yet. Both lines come before the records list, so a long post cannot cut them off. All names are escaped as before.
- **Client.** Boss card: the rank tag, "Festival week" styling and the creature teaser, five season pips (week 1 to 5, the 5th is the Festival, each pip also readable as text), and the band as a word (Long shot / Even / Likely / Strong) with the hint "How ready your team looks". The loot reveal (Raid tab and live finale) shows the Festival creature and the rank sentence. Collection shows a "Festival" badge on Festival species and says they are not found on expeditions; no screen offers them as catchable. No inline styles, text only.

**Reasoning.** One stored plan per week and one done marker per ladder move make every step idempotent and replay-safe; legacy weeks are plain old data, so a deploy in the middle of a week breaks nothing; a separate readiness Rng keeps the forecast independent of any real fight.

## 2026-10-11: Ladder feel accepted (Misa)

Misa accepted the tuned ladder:

- +40% boss HP per rank;
- the plateau rhythm (a win, then a few losses at the new rank, the Festival, and the season ease of one rank);
- Festivals as a near-sure win and a reliable break.

PR #7 is merged and production runs it.

## 2026-10-11: Creature lore, visual briefs, traits and personality quirks

**Context.** Misa asked for every species to have a short written description, a visual identity that works as an input brief for art, behavioural traits, and a cosmetic personality quirk per individual creature, so things stay consistent as the game evolves. The art direction coming next is chunky pixel art (16×16 creatures, 24×24 bosses) on a dark night-sky UI.

**Decision.** Details are in `docs/design/creatures.md`. The data files are the source of truth.

- **Content:** `species-lore.json` (all 22 species), `bosses-lore.json` and `quirks.json` live in `packages/game`, validated at load like all content. Every species and boss must have an entry. A stage 2 form must also say what it keeps from stage 1 and what changes (`appearance.fromStage1`, an addition to the requested fields). Palettes must contain at least two colours of the element's hue family (a test).
- **The visual brief is not shown to players.** The Collection card gets an "About" disclosure with the description, the traits as chips and "Personality: <quirk>". The lore ships to the client with the content package (about 50 KB of JSON before minifying and compression), instead of the server sending text.
- **Quirks are cosmetic**: no gameplay effect, no visual change. About 40 general quirks plus 2 to 3 "against type" quirks per evolution line (keyed by the stage 1 species id, so a stage 2 form uses its line's). `pickQuirk(speciesId, rng)` is pure: 75% general, 25% against type. Quirks are stored by id, so text can be edited; ids are never changed.
- **Server (migration 13):** `creatures.quirk_id`, assigned at creation (starter, expedition catch, Festival grant) with the live crypto RNG, in the same transaction. A **separate `quirkRng`** (like `readinessRng`) keeps quirks out of the catch and raid draws. Evolution, fusion and training never change it. Existing creatures are backfilled once in the migration from crypto randomness; the result is stored. The creature view carries `quirk` (the id, or null if unknown).

**Reasoning.** One shared source keeps writers, the client and artists in step. Lore in the content package needs no new API, and an id-based quirk can be reworded later without touching creatures. Keeping the quirk RNG separate protects scripted-test draws and the rule that fights and catches use their own randomness.

## 2026-10-11: M6 visual foundation choices

- **Fonts:** Pixelify Sans (display) and Atkinson Hyperlegible (reading), both OFL.
  - Self-hosted from the pinned `@fontsource/*` 5.3.0 packages, using only the latin woff2 files via our own `@font-face` rules. Vite emits them as same-origin assets, so `font-src 'self'` holds.
  - The licence texts ship in `apps/activity/public/fonts-licence.txt`.
- **Drag and drop:**
  - Built on pointer events, not the HTML5 drag API, which fails on mobile. A drag lifts after 8 px of movement.
  - Own creatures use `touch-action: none` so touch dragging works. Touch-scrolling the row therefore starts on an empty slot or a gap, and the row auto-scrolls while dragging. If that feels awkward, long-press-to-drag is the alternative.
  - Tap-to-place and keyboard placement remain.
  - No optimistic UI; the server stays authoritative.
- **Element icons:** each element always shows its icon (droplet, flame, leaf, bolt) next to its colour, so element colours are not confused with status colours **[Misa]**.

## 2026-10-11: Live stage as rows, abilities on the creatures, Auto fire toggle **[Misa]**

**Context.** Misa tried the practice fight on staging: the zones side by side did not fit a phone, names were cut off, and the ability cards under the stage were far from the creatures they belong to. He also asked to replace "Hold" with a clearer control.

**Decision.**

- **Zones are rows**, top to bottom: the boss, then Front (closest to it), Middle, Back. Each row has its label at the left and its creatures centred in slot order, wrapping onto more lines. Nothing scrolls sideways. The largest zone is 15 creatures (a party of 15 players, 45 slots). The sprite size follows the zone size and the measured width (`zone-layout.ts`), so a 15-creature zone uses 2x sprites on three lines at 360 px. The Placement strip in the Raid tab uses the same rows. Drag-and-drop hit-testing already used screen rectangles, so it works unchanged; auto-scroll while dragging now scrolls the page near the top and bottom of the window, and the up and down arrow keys move between lines.
- **Creature abilities are used on the stage.** Your creature with an ability wears a badge and opens a popover when tapped (Fire, Auto fire toggle, the ability's text). The basic ability keeps one panel under the stage. Replays show only "used" marks, and are not interactive.
- **Auto fire replaces Hold.** The popover and the basic panel have a big **Fire** button and an **Auto fire** toggle ("Auto fire, round 7" when on, "Auto fire off, last round" when off). The toggle works both ways until the ability's default round; the last-round safety net stays. New server action `unhold` on `POST /api/raid/live/action` (`not_held` if not held, `hold_too_late` after the default round); `hold` stays as the wire name for auto fire off. The word "Hold" is gone from player-facing text.
- **Names** show in full under the sprite (two lines, then an ellipsis, full name as tooltip). "You" sits above the sprite, a knocked-out creature is a grey sprite with a skull.

**Reasoning.** Rows fit narrow phones and match the order the boss attacks in. Putting each ability on its creature makes the choice obvious, and one toggle is easier to understand than a one-way "Hold".

**Checked, not a bug.** The boss HP the stage shows equals the engine's `bossHpEnd` for whole fights, including practice-style inputs (tests in `stage.test.ts`). The odd "18689 / 18698" in the screenshot came from a dev test fight.

## 2026-10-11: Pre-fight countdown, Auto fire preferences, tap fix **[Misa]**

**Context.** Misa tried the practice fight on the Discord mobile app: tapping his creatures opened nothing. He also asked for a dramatic countdown before a fight and for Auto fire to be settable before it.

**Decision.**

- **Countdown.** In the last 30 seconds before a live finale or practice fight, a big pixel-font number covers the stage (calm to 11, faster and gold to orange from 10 to 6, red with a stepped shake and a growing number from 5 to 1, then "FIGHT!"). It is computed from the server's `startsAt` and the clock offset and wakes exactly when the number changes (no extra polls). Reduced motion: a still number with colour changes only. The overlay does not take taps.
- **Preview stage in the lobby.** The lobby snapshot now carries the party's row, the names, the boss pool and the caller's own abilities (read-only, same builder as the start). Tapping an ability creature opens the popover with only the Auto fire toggle.
- **Auto fire preferences (migration 14, `raid_autofire`).** `PUT /api/raid/autofire { target, on }`, `target` = `basic` or an own team creature id, allowed until the finale starts (`locked` after). They set the first mode of each ability at the live start, the instant late finale and the practice start (off = `held`). Also settable in the Raid tab's abilities card. Every live ability has `autoFire`; each Raid-view ability preview has `autoFire`.
- **Practice fights** start after a 30 second lobby; Fire before the start is `not_started`. The 10 minute cooldown counts from the request.
- **The mobile tap bug.** Not reproducible by touch in Chromium with fixture data (real touch events, 90 ms holds, taps during beat playback: the popover always opened). The one real gap found: only creatures with an ability were buttons, and abilities unlock at level 10, so on staging a team below it had no tappable creature at all. Own creatures are now always buttons: one without an ability opens a note ("Its ability unlocks at level 10. It is level 4 now.").

**Reasoning.** The server stays authoritative: preferences are validated and only ever read at the start. The lobby preview reuses the start's builder so it cannot drift from the fight.

## 2026-10-11: Slower, readable fights, a round intro and a hidden jackpot **[Misa]**

**Context.** Misa watched the first real live finale in production: "it feels like a speed run; combos and crits just aren't picked up by my eyes". He also asked to keep the jackpot and pity "behind the scenes".

**Decision.**

- **Round intro.** Every live round opens with a big "Round N" (pixel face, "of 12" under it) over the stage for 3 seconds, then the round's creature actions play. Replays show it for 1.5 s (0.9 s at 2x). With reduced motion it is plain text for the same time. It lets taps through, and the first round waits for the countdown's "FIGHT!" to end.
- **Two clocks (`stage-fx.ts`).** The **stagger** (when each beat starts) is 500 ms by default and up to 700 ms for beats with a crit, reaction, ability, knockout or gimmick; it is compressed to fit the round and never goes below 250 ms. The **visible duration** is separate, so effects overlap the next beats: damage numbers 1.3 s, crits 2 s with a bigger "CRITICAL!" pop, reactions 1.5 s as a large burst with the reaction's name and both element colours, knockouts 1 s ("KO!" tag), ability cards 1.5 s (creature name and ability). The beat logic stays pure and tested.
- **Live round budget.** 15 s per round: 3 s intro, the beats, and the last beat's effects end about 1.5 s before the next round (so 10.5 s for beats and effects). Replays keep the visible durations; 2x halves the stagger and shortens the durations by about 30%.
- **Round length 10 s to 15 s** (`LIVE_ROUND_MS`): 12 rounds are 3 minutes, under Misa's 5 minute cap. The live finale and practice use it for fights **started after the change**; a stored `raid_live` row keeps its own `round_ms`, which the snapshot and the clock already read. The client's `DEFAULT_ROUND_MS` (used only to know when the Raid tab stops expecting a result) follows.
- **Jackpot and pity are hidden from players.**
  - Gone from the player-facing surfaces: the loot reveal's jackpot burst and "Jackpot!" / "No jackpot this time (pity N/10)" lines, the chest art, the pity number, the Discord finale post's jackpot lines (and its "First jackpot" record), the Raid tab's "Jackpot:" badge, and the jackpot "first on server" entry in the Collection's list.
  - The jackpot Essence is still paid, with the same mechanics, storage (`jackpot_pity`, the `jackpot` server-first rows, the ledger entry) and idempotency. Players see it only inside one combined Essence figure: the live `loot.essence`, `you.reveal.essence` and the finale's `essence` in the result list now include it.
  - The server no longer sends `pity`, `loot.jackpot`, `you.reveal.jackpot`, `party.results[].jackpot` (the list of display names) or `serverFirsts` entries of kind `jackpot`, and the ledger list leaves out the `jackpot` flag of a raid payout's meta, so none of it can be inspected from a client. Contract tests pin the key sets and check the responses for the words `jackpot` and `pity`.
  - The after-action stats never carried a jackpot line, so there was nothing to remove there.

**Reasoning.** Slow effects and a clear round marker are what let people read a combo; keeping the stagger and the visible duration apart lets rounds stay inside the time budget without making effects flash by. Hiding the jackpot keeps its fun as a surprise inside the total without turning the pity counter into something to game.

**Fixtures.** The contract fixtures of the affected responses were edited to the new server shape by script, and the worker's contract test, which compares the real server output's key sets with them, passes. They were not re-captured from a running server (a capture would have changed unrelated recorded values); their old `roundMs` of 10 000 is legitimate for a fight stored under the old length.

## 2026-10-11: Content-paced rounds, smooth effects and a boss telegraph **[Misa]**

**Context.** Misa tried the slower stage on staging: more time to see damage and effects was a step in the right direction. His feedback: the round switch text should be 1 to 2 seconds shorter; damage numbers should linger even longer, overlap, and keep floating up so new ones appear below older ones; some numbers, especially on his creatures, were choppy; the idle wait at the end of each round dragged (give effects about 2 seconds, then go straight on); and he could not read when and whom the boss attacks.

**Decision.**

- **Rounds last as long as their content (server-authoritative).** A pure function in the engine, `roundPlaybackMs(roundEvents, options)`, gives a round's length: the intro (1.5 s live, 1 s in replays) + the staggers of every beat but the last visible one + that beat's wind-up + a **2 s tail** after the last effect appears, **clamped to 6..22 s** (12 rounds of 22 s are 4:24, under the 5 minute cap). The beat boundaries and staggers moved from the client into the engine (`beatEnds`, `beatTiming`, `planRounds`), so the client and the server use the same code. A beat's stagger is 500 ms, up to 700 ms for a crit, reaction, ability, knockout, boss gimmick or luck banner; a boss action adds a 600 ms wind-up. Rounds that would pass 22 s squeeze their staggers in proportion.
- **The live schedule is cumulative.** Round 1 starts at `started_at`; round r+1 starts at `start(r) + roundPlaybackMs(events of round r)`. That is sound because of the prefix property (round r's events are fixed once it has started; Fire takes effect from the next round), pinned by tests on the engine and the server. The snapshot sends `roundStarts` and `nextRoundAt`, and the client polls just after `nextRoundAt`. The fight ends at the end of round 12, or of the round the boss falls in, plus its playback (it used to end as the boss-falling round began). The alarm is armed for the end of the schedule computed from the stored fight, and re-armed by every request. Practice fights use the same pacing.
- **Legacy rows.** Migration 15 adds `raid_live.pacing` (default 0). A row stored before it keeps its fixed `round_ms` schedule and its old end rule; new rows store pacing 1 (and `round_ms` 22 000 as an upper bound). The snapshot's `roundMs` is null for new fights.
- **Typical and longest finale.** 3 players (row of 9) about 2:00, 5 players about 2:35, 8 players about 3:35; from 12 players on the rounds hit the 22 s cap and the finale is the longest possible 4:24.
- **Smoother, longer effects.** Damage numbers 2.5 s, crits 3 s, reaction bursts 2.5 s, ability cards 2 s, knockout tags 1.5 s, boss labels 2 s; effects overlap freely. Numbers rise continuously from their spawn point (a newer number on a creature sits below older ones; on the boss the side-by-side lanes stay).
- **The cause of the choppiness.** Floating numbers (and the other effects) used `steps(10)`, `steps(8)` and so on: a 1.3 s number moved in 10 jumps, about 7 changes a second (a crit about 4.5), while the page itself ran at a steady 60 fps (measured in Chromium: 16.7 ms frames, 10 distinct transforms per number). It was not re-rendering or re-keying: numbers are keyed by event index and were not re-created. Now all floats, fades, bursts and pops use smooth easing on `transform` and `opacity` with `will-change`, `steps()` stays only for sprite hops, flashes and shakes, each effect keeps one ref function (no ref churn on every render), and the beams' positions are measured once. Measured after: a number's transform changes on 29 of 30 frames in a 500 ms window.
- **Boss attack telegraph.** For every boss action (normal attack, zone hit, strike on the strongest, silence, reflect): 600 ms of red reticles on exactly the affected creatures (a zone outline for a zone hit) and a leaning boss; then a beam or shockwave, a slash, and a label with the attack's name and area ("Undertow · whole FRONT row", "Lightning Rod · Cindle", "Bramble Bind · both ends"); then the damage numbers and a blocked mark for shielded or guarded creatures. One round ahead the stage shows "Next round: ..." (derived purely from the boss content and the round number, `bossWarnings`), with a warning glyph on the target zone or on the ends of the row; a strike on the strongest creature is worded generically because the stage does not know the creatures' Attack. Reduced motion: static frames, outlines and labels.

**Reasoning.** Pacing by content removes both the dead air after a short round and the cut-off of a crowded one, and keeping it in the engine means the server's clock and the stage cannot drift apart. The wind-up gives players a moment to read who is about to be hit, and the forecast gives them a round to react with Shield Wall.

**Fixtures.** The `live-*`, `action-*` and `practice-*` contract fixtures were edited by script to add `roundStarts` and `nextRoundAt` (and `roundMs: null` in the lobby and none states), not re-captured, because a re-capture would have churned unrelated recorded values. Their `roundMs` of 10 000 and fixed schedule are what a legacy row sends. A new fixture, `live-paced.json`, was captured from the real server (a content-paced fight at round 4). The worker's contract test compares the real output's key sets with all of them.

## 2026-10-13: Roadmap after M6 (Misa)

Misa set the forward plan, recorded in `docs/roadmap.md` with design docs for each bigger item:

- **Analytics and reports:** agents need tools to understand how players play and whether the game is balanced.
- **How to play,** with clickable tags: "the roles and elements are not intuitive".
- **Daily dungeon:** solo, server-simulated, played back as if live, no real-time backend.
- **Gear:** "absolutely".
- **Expeditions v2:** something players "get better at"; a proposal first, then Misa adds his ideas.
- **Polish and upkeep:** yes.
- **WebSocket push:** interesting.
- **More content:** eventually.
- **Swap requests:** not a priority.

## 2026-10-13: Roadmap reorder, crafting direction, production may change freely (Misa)

- **Order:** how to play, then gear and crafting, then expeditions v2, then the daily dungeon, then analytics reports. The analytics **event log** ships with how to play so data builds up early; the reports and the `OPS_TOKEN` secret come later.
- **Gear becomes crafting:** dismantle into parts, upgrade, improve, craft from blueprint drops, enchant. Creatures get long **downtime jobs** and crafting skills that level very slowly, for the idle RPG pillar. Slow gear at first is fine. Sketch in `design/gear.md`.
- **Production:** players know the game is in development and progress may be wiped. Ship features when ready, including before the weekend raid test. Agents still never wipe data on their own; that is Misa's call.
- **Beta badge:** a small "beta" superscript on the Leet Creatures title.
- **Expeditions v2 review** happens in a shared, commentable doc; the repo copy is updated from it when Misa is done.

## 2026-10-13: Analytics event log (step 1 of `design/analytics.md`)

The per-guild event log is in, invisible to players: no route reads it yet, and rollups, the guild directory, the ops endpoint, the report workflow and `OPS_TOKEN` come later.

- **Schema (migration 16).** `analytics_events (id INTEGER PRIMARY KEY, at, kind, actor_hash, props_json)` with an index on `at`; `analytics_seen (actor_hash, last_at)` for session detection; `analytics_once (key, at)` for once-only marks (one live join per player per finale). Times are UTC epoch ms.
- **What is logged** (`analytics.ts` has the typed union and the writer): `session_start`; `starter_chosen`; `expedition_send`, `expedition_claim` (each catch with species, rarity, shiny and new/fused/converted, plus how long it waited) and `expedition_recall` (how much of the trip had passed); `train`; `evolve`; `fuse` (one per catch that fused or paid Bait); `roster_optout`; `team_set`; `placement`; `ability_pick`; `autofire_toggle`; `live_join`; `live_action` (fire, hold, unhold: the round, and the default round); `phase_result` (guild-level: boss, rank, festival, party size, win, rounds, and the top contributor's damage share in basis points, no per-user id); `rank_change`; `festival_grant` (species and result, no player); `post_result` (sent, retry or failed, with the error kind only).
- **Privacy by construction.** Props hold only content ids (species, boss, ability), enums, integers and booleans, and every value is re-checked against content or a fixed list when written, so an unknown value becomes `"unknown"` and free text cannot get in. `props_json` is capped at 1024 characters. A privacy test scans every event of a broad scenario for user ids, display names, nicknames, the guild and channel ids, the client secret and bot token.
- **Actor hash.** First 128 bits (32 hex characters) of HMAC-SHA256 of the Discord user id, with a key HKDF-derived from `DISCORD_CLIENT_SECRET` (the same secret source as session tokens, own salt `leet-creatures/analytics` and info `analytics-actor-v1`). Stable for one user, not reversible from reports. Rotating that secret changes every hash (it already signs out everyone), so retention numbers restart at a rotation. Web Crypto is async and Durable Object transactions are synchronous, so the hash is computed once per request, before the transaction, and cached per user in memory; the writer only reads the cache (a miss gives a NULL actor, never a raw id).
- **Written where the action commits.** Each event is a single INSERT inside the transaction of the action, so it exists if and only if the action committed. Replays of a stored result (same idempotency key) and repeats that change nothing (the same team, ability pick, opt-out value, slot, or Auto fire setting; hold on an ability that is already held) log nothing. Writing never throws, so logging cannot undo a game action.
- **Sessions.** A request from a player whose last activity is more than 30 minutes old logs `session_start`; the "last seen" mark is written at most once a minute per player, so a normal request costs no write.
- **Retention.** The guild alarm deletes events and the support rows older than 90 days, in batches of 500 (at most 20 batches per alarm); if a backlog is left, the alarm comes back a minute later.

## 2026-10-13: Gear and crafting v1 (server and content)

The server and content half of `design/gear.md` ("v1 build spec") is in; the Workshop UI, sprites and the sim model come separately. Defaults held: one gear slot per creature, one shared busy state for expeditions and jobs, one skill (Crafting), no trading, no gear on sprites. All numbers are in `RULES.gear` and are starting values for the sim to tune.

- **Content.** `data/gear.json` has 19 bases: 5 neutral (3 Common, 2 Rare), 3 per element (a Common, a Rare and an Epic each) and 2 Festival bases (Tide lantern charm, Ember hearth band). `data/enchants.json` has 9 enchants: 4 by role (Payoff +6% Attack, Guard +8% HP, Setter +5% speed, Support +6% HP), 4 by element (Spark +3 crit points, Ember +10 crit damage points, Tide +4% speed, Grove +7% HP) and one for everyone (+3% Attack). An enchant that does not match the wearer shows as inactive. Parts: `scrap`, one shard per element, `glimmer`. Gear never reaches the engine: `applyGear` folds it into the stats and the crit bonus before the fight, so the engine, the combat tests and old replays are untouched.
- **Rolls.** Rarity gives secondaries (0, 1, 2, 2 for Festival) and a primary multiplier (x1.0, x1.25, x1.5, x1.5). Primary roll ranges in basis points: Attack 300 to 500, HP 400 to 700, speed 200 to 400, crit chance 100 to 200, crit damage 500 to 900; secondaries 100 to 250, 150 to 350, 100 to 200, 50 to 100 and 200 to 400. Each upgrade level adds a fixed step to the primary: Attack 80, HP 100, speed 50, crit chance 25, crit damage 150.
- **Caps per creature** (basis points): Attack 2000, HP 2500, speed 1000, crit chance 500, crit damage 2500. The gear's crit bonus also never takes a creature past the engine's room (30% chance and +150% damage in total), and a species that is already past it keeps what it has. With one slot, Attack and HP cannot reach their caps (an Epic +5 with the best roll and enchant stays under both); speed and the crit stats can. The caps are for a later second slot. A test checks every base, rarity, level, enchant, role and element, and that the best possible item (Epic +5, best rolls, matching enchant) adds between 10% and 25% to a mid creature's power. It is about 12%, and a typical Epic +3 is about 3%, so gear starts well under the 15 to 25% design ceiling: slow gear first, the sim decides how much to raise the numbers.
- **Upgrades.** Essence 20, 30, 45, 65, 90 and scrap 2, 3, 5, 8, 12 for +1 to +5, times 1.0 (Common), 1.5 (Rare) and 2.0 (Epic and Festival). A full Common costs 250 Essence and 30 scrap; a full Epic 500 and 60. Dismantling returns scrap 2, 5, 10, 10 by rarity, a shard of the item's tint (0, 1, 2, 2; none for neutral items), 1 glimmer for Epic and Festival, and half the scrap its upgrades cost.
- **Crafting costs.** By blueprint rarity: Common 6 scrap; Rare 12 scrap and 1 tint shard; Epic 24 scrap, 2 tint shards and 1 glimmer; Festival 24 scrap, 2 tint shards and 2 glimmer (neutral bases pay no shard). Improve re-rolls one secondary of a Rare or better item for 6 scrap (12 for Epic and Festival). Enchanting costs 1 glimmer and 3 shards of the enchant's own element. Durations: craft 4, 8, 12 and 12 hours by blueprint rarity, improve 2 hours, enchant 6 hours. A craft can come out one rarity higher (not above Epic; Festival stays Festival).
- **Crafting skill.** XP per finished job is its nominal hours times 10 (the skill shortens the time, not the XP). Levels 1 to 10 at 0, 80, 200, 380, 600, 900, 1300, 1800, 2500 and 3500 XP. Each level above 1 shortens jobs by 3% (27% at level 10) and adds a 1% chance of a craft one rarity higher (9% at level 10). A steady crafter (two Rare crafts and two improves a week) is at level 5 after a month; a casual one (one Rare craft a week) at level 3.
- **Drops.** Finale win, one roll per participant: Common 75%, Rare 22%, Epic 3% at Boss Rank 1; Rare gains 2.5 points and Epic 1.5 points for each rank above 1 (capped at 50% and 25%); the base is picked evenly among the normal bases. Cleared Phase 1 and 2: 3 and 4 scrap each. A won Festival finale also gives the Festival piece in the tint of the week's Festival creature, next to the normal roll. Expedition claim: scrap 1, 3 and 6 by duration (a recall pays the share that was caught and nothing else); a completed trip rolls one shard of the explorer's element (15%, 30%, 50%), and 12 hour trips a glimmer (5%) and a blueprint (10%; Common 60%, Rare 35%, Epic 5%, a base of that rarity). A blueprint the player knows becomes 5 scrap. Welcome kit (the first `GET /api/gear`, once): a random Common item, a random Common blueprint and 8 scrap, which pays for any Common craft, so crafting starts on day 1.
- **Inventory and workshop.** 60 items (crafts still in the workshop hold a place, so a claim can never find the bag full); 2 workshop slots. A drop that finds the bag full is turned into its dismantle yield (shown as `converted`), so loot is never lost.
- **Choices where the spec said "your choice".** Dismantling a worn item takes it off first (the in-page confirmation is the safeguard); an item in an open improve or enchant job cannot be dismantled or put in a second job. Enchanting an item that already has an enchant replaces it (the same enchant again is refused). Improve re-rolls the stat and the value of the chosen secondary (never a stat the item already has; the old one may come back). Equipping onto an occupied creature puts the old item back in the bag (the creature that held the moved item is left empty).
- **Busy state.** A creature is busy while it is away on an expedition or has an unclaimed job. Starting either refuses with `creature_away` / `creature_on_job`, a database index keeps one open job per creature and per item, and both kinds of busy creature still fight in raids. The collection view has `busy`, `gear` and `statsWithGear` for each creature (`stats` stays the stats without gear; `away` is expedition only).
- **Fights.** `loadCreatures` folds the worn item into each creature's stats, crit bonus and power at the moment a fight is built (phase resolve, live finale start, practice start, readiness forecast, party balancing and auto teams); `slotFor` puts the final stats and crit bonus into the fight slot. The stored input is therefore self-contained: tests show a fight with gear differs from one without, every stored fight replays exactly, an item changed, dismantled or levelled afterwards cannot touch a stored fight, and gear changed during the live finale does not reach the frozen fight. There is no separate "team freeze" moment: the stats of a phase are those at the moment it resolves, and the live finale is frozen at its start.
- **Idempotency.** Upgrade, dismantle, job start and job claim carry the client's key. `gear_actions (user, key)` stores the result and a fingerprint of the action; a retry returns the stored result, the same key on another action (or one a ledger spend used) is `key_conflict`. The Essence of an upgrade goes through the ledger's `spend` (check, debit, scrap and level in one transaction). Drops are idempotent per (player, key) in `gear_grants` (`raid:<week>:phase1|phase2|finale`, `festival:<week>`, `expedition:<id>`, `welcome`), draw nothing on a repeat, and use their own live RNG (`gearRng`), separate from the catch, fight and quirk RNGs. A claimed job stores its result and never rolls again; stored action results are pruned after 30 days.
- **Client contract.** `GET /api/gear` is `{ serverNow, balances, inventory, items, parts, blueprints, jobs, slots, skills, grants }`; the actions answer `{ result, gear, state }`. The loot of raids is not added to the Raid view (that would change every raid fixture); the loot reveal reads `grants` (keys above) for the week it shows. Expedition claims have `result.loot`. Fixtures were captured from real server output and the Worker's `gear-fixtures.test.ts` fails when the shape changes. New error codes: `insufficient_parts`, `creature_on_job`, `workshop_full`, `inventory_full`, `item_busy`, `not_ready`, `max_level`, `same_enchant`, `blueprint_unknown`, `nothing_to_improve`, `invalid_secondary`, `invalid_blueprint`, `invalid_enchant`, `item_gone` (plus the usual `key_conflict`, `insufficient_funds`, `creature_away`, `not_found`, `invalid_body`).
- **Analytics.** `gear_drop`, `gear_equip`, `gear_upgrade`, `gear_dismantle`, `job_start` and `job_claim`, one event per action that changed something, with content ids (bases, enchants), enums and integers only, rebuilt on write like the others. Raid drops are guild level (no actor); the rest carry the actor hash. The privacy scan covers all six.
- **Not done here.** Sprites and the Workshop UI; the daily dungeon's parts; the sim does not model gear yet (its slots are still without it, and its targets pass unchanged); nothing was balanced by simulation.

## 2026-10-13: Gear and crafting v1 (client)

The Workshop tab, the gear slot on creature cards and the loot lists are in; they only display the server's views and send intents.

- **Workshop tab.** Parts as icons with numbers; two job slots with smooth timer bars (a one second linear step, none with reduced motion), a Ready state and a claim that plays the finale's orb reveal and then pops the item in; the bag as a grid of item sprites in rarity frames with +level; item details with Upgrade (cost shown, a reason in words when it is disabled), Equip, Take off, Improve, Enchant and Dismantle with an in-page confirmation (focus starts on "Keep it", Escape keeps the item); known blueprints with the craft price and a Craft button. Creature pickers show the Crafting level and the job length with that creature, and list busy creatures with the reason instead of hiding them.
- **Numbers come from the shared rules.** Craft, improve and enchant prices, job lengths and names come from `@creatures/game` (`craftCost`, `improveCost`, `enchantCost`, `jobDuration`); owned amounts, the upgrade price, the dismantle yield, slots and the bag size come from the server's gear view. Nothing is copied into the UI, so the tuning of `RULES.gear` carries over.
- **Collection card.** A gear slot (sprite in its rarity frame, or an empty frame) opens a picker to equip, swap or take off; an item worn by another creature says so before the tap. Stats show `statsWithGear` with the gear's share in its own colour ("ATK 79 +12"). A creature on a job gets an "On a job" badge, and the Expeditions tab keeps it out of the explorer list and says why.
- **Rarity without colour.** Each rarity has its own frame edge (single, double, thick, dashed) and its own pips (one to three, a star for Festival); the rarity name is always in the text and tag too. The gear colour (teal) is only used for gear numbers.
- **Loot.** Expedition claims list `result.loot` (items, parts, blueprints, items turned into parts when the bag was full). The finale reveal reads `GET /api/gear` grants for its week (`raid:<week>:finale`, `festival:<week>`) and pops the items in with the rest of the reveal; it shows nothing when there is no grant.
- **How to play.** A ninth section, "The Workshop", holds the gear, part, enchant, job and skill entries (their "More" links open it). It is last, after Rewards.
- **Sprites.** 12x12 item sprites per kind (charm, band, trinket) recoloured by the element tint (grey when neutral), 8x8 part icons with a distinct silhouette each, and an anvil glyph for the tab.
- **Contract.** The client's server-contract tests now cover every gear, workshop and expedition-loot fixture (request bodies, parsed answers, error texts); the `claim` answer of an expedition without `loot` (older trips) still parses.

## 2026-10-13: Gear numbers set by simulation

The balance simulator now plays gear and crafting (`packages/sim/src/gear.ts`, with the game's own pure functions) and `RULES.gear` was tuned against six new targets (`docs/design/balance-targets.md`, report `docs/balance/report-2026-10-13-gear.md`). All 33 targets pass on the full run with seed `leet`.

- **What the sim plays.** Every player gets the welcome kit when they join (the week-4 newcomer too). Drops follow the worker: phase scrap, one gear roll per finale participant at the server's rank, the Festival piece, and expedition loot. At each check-in a player claims jobs, equips the best items on the 3 strongest creatures (an item is scored by the Attack and HP it adds, weighted by role: payoffs want Attack, guards HP), dismantles all but 2 spare items, upgrades by power per Essence (holding back the cost of an evolution that is 3 levels away), then fills the 2 workshop slots on creatures that are not exploring (enchant, then improve a weak secondary, then craft the best blueprint the parts pay for). Gear folds into the fight slots with `applyGear`, like `slotFor` in the worker. A creature on a job does not explore.
- **Findings with the v1 numbers.** Gear was 5.2% of a daily player's raid-team power at week 8 (target 10–20%). Nobody ever sent a 12 hour expedition (of about 960 trips in an 8-week, 10-player sim, 832 were 1 hour and 127 were 6 hours, as Bait buys short trips), so no blueprint or glimmer ever dropped beyond the welcome kit and a player crafted the same Common item all month. Essence was fully spent on upgrades (59 held at week 12, against 802 without gear).
- **Numbers changed.**

| `RULES.gear`                                            | v1                                             | now                                              |
| ------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Primary roll, Attack / HP (basis points)                | 300–500 / 400–700                              | 520–880 / 760–1260                               |
| Primary roll, speed / crit chance / crit damage         | 200–400 / 100–200 / 500–900                    | 300–600 / 150–300 / 700–1300                     |
| Secondary roll, Attack / HP                             | 100–250 / 150–350                              | 200–500 / 300–700                                |
| Secondary roll, speed / crit chance / crit damage       | 100–200 / 50–100 / 200–400                     | 150–300 / 75–150 / 300–600                       |
| Upgrade step per level (Attack, HP, speed, chance, dmg) | 80, 100, 50, 25, 150                           | 250, 260, 70, 35, 200                            |
| Craft scrap, Common / Rare / Epic / Festival            | 6 / 12 / 24 / 24                               | 9 / 18 / 32 / 32                                 |
| Crafting XP per nominal hour                            | 10                                             | 24                                               |
| XP for levels 2 to 10                                   | 80, 200, 380, 600, 900, 1300, 1800, 2500, 3500 | 100, 250, 450, 700, 1000, 1600, 2500, 3800, 5500 |
| Expedition glimmer odds, 1 h / 6 h / 12 h               | 0 / 0 / 5%                                     | 1% / 4% / 10%                                    |
| Expedition blueprint odds, 1 h / 6 h / 12 h             | 0 / 0 / 10%                                    | 2% / 8% / 15%                                    |
| Welcome scrap                                           | 8                                              | 10 (pays any Common craft: 9)                    |

Unchanged: the caps (Attack 20%, HP 25%, speed 10%, crit +5 and +25 points), upgrade Essence and scrap prices and the rarity multipliers, dismantle yields, improve and enchant prices, job hours, the 3% and 1% skill effects, finale and phase drops, shard odds, inventory 60 and 2 workshop slots. The rolls are about 1.7 times the v1 ones and the upgrade steps about 3 times (Attack), so the Essence spent on upgrades is what moves power and Essence stays the sink it was meant to be.

- **Boss HP had to change.** Gear is real extra power, so at 10% or more of team power it lifts win rates whatever the gear numbers are: with the old boss HP the typical finale win rate went from 49% to about 69%, Phase 2 clears to 86% and the 15-player finale to 80%. Retuning `RULES.gear` cannot fix that without missing the share target, so the boss HP was recalibrated with `tune.mjs --calibrate` (8 rounds, 2 seeds): Tidal Colossus 6689 to 7344, Cinder Wyrm 2749 to 2916 (head-count exponent 121 to 123), Thornmother 5977 to 6729, Storm Sovereign 5203 to 5423 (exponent 113 to 115). Rank rules are untouched.
- **Results (seed `leet`, full run).**

| Target                                                   | v1 numbers, no retune | now   |
| -------------------------------------------------------- | --------------------- | ----- |
| Gear share of a daily player's team power, week 8        | 5.2%                  | 12.0% |
| First crafted item, 90th percentile (days)               | 1.4                   | 1.4   |
| Daily Essence held at week 12 (today without gear: 777)  | 59                    | 158   |
| Best Crafting level 30 days after joining (median)       | 4                     | 5     |
| Newcomer gear power at week 8 vs the median daily player | 73%                   | 64%   |
| Typical finale win rate (with gear)                      | not measured          | 49.2% |

The gear share grows from 2% in week 1 to 7% in week 4, 12% in week 8 and 13% in week 12 for a daily player, then stops at about 13% (a 30-week run): one Attack-primary item at +4 or +5 reaches the Attack cap (20%). The caps only start to bite there, and 25% is never near. A second slot or higher caps are the way to keep gear growing; the glossary text pins the caps at 20% and 25%, so they were left alone. Top earners reach 13% too, and the top earner against casual power ratio went from 1.45 to 1.54 (limit 1.6).

- **Limits of the check.** Several targets pass by a thin margin, as they did before gear: Phase 2 clear 70.0% (needs 70%), setup credit 15.2% (needs 15%), lowest creature contribution 0.61 (needs 0.60). Gear lifts attackers' contribution more than guards' and supports', which costs the weakest creatures a few points; the `leet` seed passes, other seeds already missed some targets before gear (seed `s3` fails Phase 2, the boss spread, the highest creature ratio and hard pity without gear). The quick run (4 sims) fails 3 or 4 targets by noise (it passed 27 of 27 before, also by thin margins).
- **Text to fix.** `glossary.json` still says blueprints come from long expeditions and glimmer from 12 hour trips; both now drop on any trip. (Content, not changed here.)

## 2026-10-13: Daily dungeon v1 (engine, content, server and balance model)

The engine, content, server and simulator half of `design/daily-dungeon.md` is in; the UI comes next (`apps/activity/src/dungeon-types.ts` and the `dungeon-*.json` fixtures are what it builds against). All 37 simulator targets (33 old, 4 new) pass on the full run with seed `leet`.

**Defaults held for the open questions** (until Misa says otherwise): one run per guild-local day per player, plus one free retry on the first day a player ever ran, **only when that first run was lost** (a cleared first run gets no retry); raid creatures are used freely with no locking, and creatures on an expedition or a workshop job may go too (the run is instant, as raids allow); no leaderboard and no Discord post yet, but every run is kept (summary and rewards for good, inputs and events for 90 days) so either can be added.

- **Engine.** `FightSlot.hp` is an optional starting HP (capped at the creature's maximum, which includes the Guard bonus; 0 starts the creature knocked out, and a fight where everyone starts knocked out plays no rounds). `FightResult` gained `hpStart`, `hpEnd` and `hpMax` by creature id, which is what chaining needs; nothing else in the fight changed (existing tests, the prefix property tests and the golden fight are untouched; stored raid results now carry the three small maps). `simulateDungeon` plays the rooms in order from one seed, each room from its own seeded stream (`<seed>:room:<n>`), carries HP, keeps knocked-out creatures out, and stops at the first lost room. The rooms of a run are stored in full (foe and modifier definitions included), so a replay never reads content again. A solo row of 3 needed nothing: the zones of a row of three are one slot each.
- **Room modifiers are folds, not engine features.** A modifier is content: a list of effects (`team_stat` for the team's Attack, HP or speed by element and/or role, `foe_stat`, `team_crit`, `foe_gimmick`, `turn_order`) applied to the room's fight input before the fight (stats, foe HP and Attack, the luck config, the gimmick list, `turnOrderOverride`). The fight engine has no dungeon special cases and needs no mutator.
- **Content.** `dungeon-foes.json`: 8 foes (two per element, some with a gimmick: Sea Mist, Flare Up, Thorn Snap, Root Grab, Zap Dive, Buzz Cloud) and 4 room bosses (Drowned Warden, Slag Tyrant with a reflecting shell, Bramble Matron, Coil Baron), each with an element, turn order, gimmicks, rounds (6 for a foe, 8 for a boss) and a flavour line. A foe reuses the boss pieces (gimmicks, turn order, crit bonus) in its own schema and is turned into a boss for the fight. `room-modifiers.json`: Flooded, Scorched, Overgrown, Stormy (an element hits 20% harder), Dark (+5 crit points), Thorns (the foe reflects the first reaction each round), Brittle (foe -20% HP, +25% Attack) and Fog (slot order). Gimmick ops are the existing ones, so no new gimmick glossary entries; each modifier and the terms dungeon, depth, room modifiers, room boss, landmark and streak have glossary entries (section "Rewards", since a tenth How to play section would need page art), and the coverage check requires them. The scrap, shard and glimmer lines of the part entries now mention the dungeon.
- **Rules (`RULES.dungeon`).** A run has 3 rooms (two foes, then a room boss) and a team of 3. Foe HP and Attack at depth d are the content numbers times a base strength (HP 130%, Attack 100%) times `10000 + step x n + curve x n^2` basis points, with n = d - 1: HP step 3000 and curve 300, Attack step 2000 and curve 150, depths above 60 count as 60. Every 7th depth is a landmark. Per cleared room: Bait 1, 1 and 1; Essence 1 and scrap 1 from the boss room; the boss room also drops a shard of the boss's element at 40%. A full clear has a 10% gear chance (rare 18% and epic 2% at depth 1, +0.4 and +0.2 points per depth, capped at 45% and 18%); a fully cleared landmark pays Essence 2, scrap 2 and a glimmer and its gear drop is certain (+20 and +6 points on the rare and epic odds). Streaks count days in a row in a cycle of 7: the 3rd day pays 1 scrap, the 7th 1 Essence and 1 scrap; a missed day starts the count at 1 again and the depth is kept. A landmark depth is only passed once per player (depth never goes down), so landmark chests are rare.
- **Server.** Migration 18: `dungeon_runs` (one row per run; UNIQUE on (player, day, attempt) and on (player, key); the seed, the stored input and result, the summary and the rewards), `dungeon_progress` (depth, streak, last and first day) and `dungeon_days` (the seed of the day's modifiers, drawn once from crypto on the first look). `GET /api/dungeon/today` is the day's state with the three modifiers (from the day seed, which only decides modifiers); `POST /api/dungeon/run` validates, draws the run seed from crypto at that moment, rolls the rooms from it, simulates every room, and stores and pays in ONE transaction; `GET /api/dungeon/run/:id` is the owner's full replay (404 for anyone else's, the same as for a run that does not exist). No answer carries a seed, and the seed cannot be derived from anything seen before (it is a fresh draw; the day seed is a separate draw). A retry with the same key returns the stored run (a changed body under the same key, or a key a ledger spend or a gear action used, is `key_conflict`). Gear folds into the slots with the same `loadCreatures` as raids, so a stored run keeps its stats whatever happens to the gear later. Payouts are idempotent per (player, day, attempt): ledger keys `dungeon:<day>:<attempt>:bait|essence` and gear grants `dungeon:<day>:<attempt>` (a full bag turns an item into parts), and the streak bonus once per day (`dungeon:<day>:streak`). The day is the guild-local calendar day, resolved once per request from the guild timezone and passed down (tests cover both DST changes in Europe/Helsinki, a 23 and a 25 hour day, and Los Angeles). The alarm empties the inputs and events of runs older than 90 days.
- **Request shape.** `team` is 3 ids and `formation` the zones (`front`, `middle`, `back`) each once, where `formation[i]` is the zone of `team[i]`; `abilities.basic` is the basic ability with a round (or null for the default round) and a zone for Shield Wall or an element for Re-mark; `abilities.creatures` lists rounds for creature abilities (every unlocked creature ability, level 10 or more, is in the run, and an unlisted one fires at its default round). Abilities fire once in every room. Errors: `invalid_body` (wrong count, bad key, unknown keys), `duplicate_creature`, `invalid_formation`, `invalid_abilities`, `invalid_id`, `not_found` (not the caller's creature or run), `already_run`, `key_conflict`. A player needs 3 creatures; with fewer, `today` says `need_creatures`.
- **Analytics.** `dungeon_run` (depth, attempt, rooms cleared, cleared, landmark, the modifiers, the team's species and roles, how many wear gear) and `dungeon_reward` (depth, Bait, Essence, scrap, shards, glimmer, gear count, landmark, streak bonus day), content ids and numbers only, one of each per run that was played (a replay or a refused run logs nothing); the dungeon's gear also logs a `gear_drop` with source `dungeon`. The privacy scan covers them.
- **Balance model (`packages/sim`).** Every player with 3 creatures runs the dungeon on each day they check in (casuals on their leet days) with their 3 strongest creatures in the default row (`autoPlace`), Rally as the basic ability and every creature ability at its default round; the day's modifiers are shared, the first-day retry is played, and rewards are paid as the worker pays them. The model uses the game's own pure functions and the engine's `simulateDungeon`. New targets: depth 1 cleared in a player's first 7 days at least 80% (measured 89.7%); a median daily player gains 1-2 depths per week from the end of week 2 to the end of week 8 (1.83); dungeon Essence at most 40% of a daily player's Essence income (3.8%); gear share of a daily player's power at week 8 at most 20% with the dungeon's gear and parts (12.9%, against 12.0% without the dungeon).
- **How depth was tuned.** Daily players climb about a depth a day until the foes catch up with their power, then slowly: median daily depth 5 after week 1, 8 after 2, 15 after 4, 19 after 8 and 21 after 12 (casual 12 and 16 after 8 and 12 weeks, since they run twice a week). Clear rate by depth for a daily player runs from 86% at depth 1 to about 50-60% at depths 5 to 11, 20% at depth 14 and 10% at depth 19. The first version had foes growing 12% a depth, which gave a very sharp wall (depth 30 in a week or two, then nothing); the second compounded and still stalled; a straight line left depth 2 too hard for week-1 teams (46% clear). The shipped curve is gentle first and steeper later, which kept week-1 players able to win (depth 2 to 5 clear 73% to 48% for dailies) and the pace at about 1.8 depths a week through week 8. "About 1-2 per week" is measured from the end of week 2 to the end of week 8, because the opening week is a depth a day for everybody; growth after week 8 is slower (the median daily player gains under 1 a week), because power growth slows then.
- **The rewards are small on purpose.** The raid targets were already thin and the dungeon's income feeds the same economy: Bait buys levels and Essence and scrap buy evolutions, upgrades and crafts. With the first reward numbers (Bait about 90 a week, Essence 11, scrap 25 for a daily player) the 15-player finale win rate went from 51% to 74%, Crafting level 7 against a limit of 6, and setup credit under its minimum. About 14 Bait a week on its own (and nothing else) already took the 15-player finale from 51% to 55%. The shipped rewards give a daily player about 14 Bait, 3 Essence and 4 scrap a week and 0.3 gear items, which still moves the raids: typical finale win rate 49.2% to 55.1%, 15-player finale 51.0% to 63.0% (limit 65%), Phase 2 clear 70.0% to 77.3%. Boss HP and gear numbers were left alone, as asked. If Misa wants the dungeon to feel richer, the raids need their boss HP retuned in the same step.
- **Limits of the check.** The 15-player finale (63.0% of 65%) and Crafting level (6 of 6) are close to their limits; as before, a different seed can miss thin targets. The quick run was not used. Several small reward changes flipped the thin fairness targets (lowest creature contribution, boss spread) by noise, so the shipped numbers are one of the few of about twenty candidates that passed everything, not a robust optimum.
- **Not done here.** The Activity UI (Dungeon tab, pickers, playback, loot reveal, How to play entries), a leaderboard, the Discord post, blueprints as dungeon drops, sprites for foes. `docs/design/daily-dungeon.md` has the new status line.
