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
  - `read-day.test.ts`: a realistic day of a 10-player server (lounge ticks with the object restarting, page loads, raid views, the daily jobs) must stay under its total. It runs twice, the second time with the combat v2 flag on (and Knack saves and talent learns), against the same total.
  - `read-week.test.ts`: a whole production-like week (Monday to Sunday) of a 10-player server with `COMBAT_V2`, `VALLEY` and `VALLEY_SYSTEMS` on and housing off, with rows read and written per day. See "A week in the life" below.
  - `read-budget-v2.test.ts` and the second case of `query-plan-audit.test.ts`: the combat v2 paths (the creature page load with the flag on, a Knack save, a talent learn, a role-changing evolution) in a guild whose creatures carry v2 talents and Knacks.
- **In production**: the daily ops report (the `report` workflow, also printed as JSON for agents; the `balance-review` skill shows how to fetch it) has a "Database reads" section: rows read per game day and source (`start`, `alarm`, `socket`, `request:<area>`), as a share of the free 5M. Cloudflare's dashboard (Workers & Pages, Durable Objects, Rows read) has the account total.

## Checklist for a new feature

1. **Lookups** on a hot path use an index (a new table gets the indexes its lookups need in its migration). No `SCAN` of a table that grows.
2. **Frequency**: does it add work to every request, every alarm tick or every object start, or a client timer? If so, measure rows per occurrence and multiply by how often it runs in a day with players online.
3. **Memory**: nothing that must survive between requests is kept only in memory.
4. **History**: record what you need at the moment it happens (a counter, a summary row); never scan old rows to work it out later. Old details are deleted once nobody can use them (`old-data.ts`, daily).
5. **Live updates**: push the change over the socket, built from data you already have; no polling loops.
6. **Checks**: run the read budget test, the query plan audit and the day in the life; add your new hot path to them. Raise a budget only with a reason in the PR.

## A week in the life (all three flags on, measured 2026-11-14)

`read-week.test.ts` runs Monday to Sunday of a server of 10 players (15 in the seeded guild) through the object's own alarms and the usual requests, so a path that only costs on one day of the week shows on that day. It covers:

- **Players**: six play every day (4 openings: login and the tabs), four come on three days and all ten on Sunday (3 openings). The first opening of a player's game day also looks at the visitor and the School (seating a student while the teacher is in), closes the Gazette, gives to the commons, saves a Knack and runs the day's v2 dungeon (start, rooms, camp, rest of the run, replay). A raid-board look a day each; five placements a day Monday to Friday.
- **The valley**: scouts (6 seats for three players, 2 for the rest), two anvils each with orders and a stocked shelf, a communal seat at the bonfire, the Market with a broker for everyone, the visitor, the School's teacher (Monday to Wednesday), trials ticking through the dungeon runs, the Gazette.
- **Lounge**: five players for 3 hours on Tuesday, Thursday and Saturday (180 object starts and alarm ticks each, 30 simulated and the rest scaled).
- **Alarms and the raid weekend**: daily resets and the maintain pass, weather and allowance, Games, rollups, stage 1 on Saturday, stage 2 on Sunday, the live finale on Sunday (lobby, start, 8 rounds with ten snapshots and two pollers, settle).
- **Not covered**: the leet sync (needs the leet API), housing (off), DM network calls, clients without a socket polling `/api/room`, the first days of a brand new server (the `valley-fresh` start), the day the Market or a commons project is first built, players with more than 30 creatures.

Measured (rows read / rows written, one run; runs differ by a few hundred rows):

| Day                        |        Read |    Written |
| -------------------------- | ----------: | ---------: |
| Monday (from 14:00)        |     128,034 |      5,853 |
| Tuesday (lounge)           |     144,976 |      5,347 |
| Wednesday                  |     116,057 |      5,298 |
| Thursday (lounge)          |     119,444 |      4,711 |
| Friday                     |     114,017 |      5,338 |
| Saturday (lounge, stage 1) |      99,787 |      4,650 |
| Sunday (stage 2, finale)   |     108,196 |      6,404 |
| **Week**                   | **830,511** | **37,601** |

The worst day by reads is Tuesday with about 145,000 rows: **2.9% of the free 5,000,000** (the week's total is 17% of one day's allowance); the worst day by writes is Sunday with about 6,400 rows: 6.4% of the free 100,000. A server of 10 players is far from the limit; the whole account could carry about 30 such servers before the free tier is reached on a day like Tuesday. Where the rows go on a day: `request:state` about 30 to 36 thousand (about 1,100 rows per call, with the valley's pass), `request:raid` 26 to 35 thousand (about 680 per weekday look), the dungeon runs 10 to 18 thousand, a lounge evening 24 thousand, the valley routes 5 to 17 thousand. Nothing is surprisingly high and no query needed fixing. Budgets (about 1.5x): worst day 218,000 read and 9,500 written, week 1,250,000 read and 56,000 written. The test also fails if the worst day passes 5% of the free reads or 10% of the free writes.
