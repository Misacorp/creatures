# Database reads: how they cost, how to look them up, what to check

Cloudflare's free tier allows **5,000,000 Durable Object rows read a day** for the whole account (staging and production together). In October 2026 a server of about 10 players went over it twice. No single query was huge; cheap-looking work ran far too often. Decisions: `decisions.md`, the 2026-10-23 to 2026-10-26 entries, and "What the rows_read week taught us".

## How a read is counted

- Every statement returns a cursor whose `rowsRead` is the number of rows SQLite looked at, not the rows it returned. A lookup through an index reads a handful; a `SCAN` reads the whole table, and `ORDER BY` without a matching index reads every candidate first.
- **Cost per day = rows per occurrence × occurrences per day.** Most of our blow-ups were the second number: a few hundred rows is nothing once, and a lot every minute all day.

## How often things run

- **The guild object sleeps a few seconds after a request.** With hibernatable sockets open it is evicted between events and starts again on the next one: the constructor and `migrate()` run again. **Memory is not a cache**: anything that must last between requests goes in a table. Per-start work runs once per deployed build (`startup_passes`).
- **The alarm runs every 60 s while anyone has the game open** (the lounge check), plus a handful of scheduled events a day (leet sync, daily reset, raid phases, Games, DMs, rollup).
- **Every request** runs the session check and `ensureAlarm`'s "is anything due?" checks before its own work.
- **Socket pings cost nothing** (Cloudflare answers them without waking the object). A push reads only what it sends.
- **Clients**: the state loads once and every action answers with the new state. Avoid timers that reload a whole view; push the change instead.

## How to measure and look it up

- **Locally, per statement**: `apps/worker/test/read-meter.ts` (`meterStorage`, `describeReads`) wraps the storage and sums `rowsRead` per statement. Use it in a scratch test on the shared seeded world (`read-world.ts`: a month-old guild of 15 players, a fake lounge, helpers) to see what any path reads and which statement costs most.
- **The checks** (all in `apps/worker/test`, all in CI):
  - `read-budget.test.ts`: rows per object start, alarm tick (with and without the lounge), main page loads, a raid placement with a live board; plus a growth check (another month of history must not add reads).
  - `query-plan-audit.test.ts`: every statement the hot paths run is checked with `EXPLAIN QUERY PLAN`; a full scan of a table that grows fails, unless allowlisted with a reason.
  - `read-day.test.ts`: a realistic day of a 10-player server (lounge ticks with the object restarting, page loads, raid views, the daily jobs) must stay under its total.
- **In production**: the daily ops report (the `report` workflow, also printed as JSON for agents; the `balance-review` skill shows how to fetch it) has a "Database reads" section: rows read per game day and source (`start`, `alarm`, `socket`, `request:<area>`), as a share of the free 5M. Cloudflare's dashboard (Workers & Pages, Durable Objects, Rows read) has the account total.

## Checklist for a new feature

1. **Lookups** on a hot path use an index (a new table gets the indexes its lookups need in its migration). No `SCAN` of a table that grows.
2. **Frequency**: does it add work to every request, every alarm tick or every object start, or a client timer? If so, measure rows per occurrence and multiply by how often it runs in a day with players online.
3. **Memory**: nothing that must survive between requests is kept only in memory.
4. **History**: record what you need at the moment it happens (a counter, a summary row); never scan old rows to work it out later. Old details are deleted once nobody can use them (`old-data.ts`, daily).
5. **Live updates**: push the change over the socket, built from data you already have; no polling loops.
6. **Checks**: run the read budget test, the query plan audit and the day in the life; add your new hot path to them. Raise a budget only with a reason in the PR.
