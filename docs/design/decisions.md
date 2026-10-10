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
