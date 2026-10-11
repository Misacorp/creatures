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
