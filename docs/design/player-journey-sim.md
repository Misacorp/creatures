# Player journey simulator (design, 2026-10-15)

Misa wants to see what one player's progress looks like N weeks into the game, for different play styles: where they wait for meaningful upgrades, what those upgrades are, and what holds them back. The journeys then feed the raid and dungeon balance runs, so tuning reflects real play styles instead of one spending policy.

Status: design. To be built after the raid retune (PR #24) is merged, as its own PR. Nothing here changes the game.

## What exists today

`packages/sim` already plays a whole server through the real rules, day by day (`economy.ts` `runEconomy`): leets and Bait, check-ins, expeditions with supplies (`trips.ts`), training, evolution, fusion, gear and crafting (`gear.ts`), the daily dungeon (`dungeon.ts`) and the weekly raid with the Boss Rank ladder (`raid.ts`, `ladder.ts`). Its weekly snapshots feed the raid and dungeon tuning.

What it lacks:

- **Play styles differ only in effort.** The four archetypes (`archetypes.ts`: casual, daily, top earner, newcomer) differ in leet days a week, check-ins a day and raid sign-up. They all spend the same way (`policy.ts`: push one creature to its evolution, then level the top three evenly).
- **Averages, not journeys.** The output is server means per week. Nothing records when a player gets a meaningful upgrade, how long they wait, or what they are waiting on.
- **One income model.** Bait comes only from leets (`apps/worker/src/economy.ts` `baitForDay`).

The power study (B-009 in `docs/balance/log.md`) showed what the journey view must answer: power grows mostly from catches and evolutions until week 6 and only from levels after that; training cost (3 + 2 x level) outgrows flat Bait; Essence, shards and glimmer pile up while scrap runs short.

## Player profiles: a set of dials

A profile is data, not code. Every dial is a number or a choice; presets are named sets of values, and a server can draw random profiles between presets.

| Dial              | What it controls                                                                                           | Example range              |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| Login days        | days a week the player opens the game                                                                      | 1 to 7                     |
| Check-in times    | when they check in (local times), including at night                                                       | 1 to 6 a day               |
| Leet rate         | share of login days with a leet                                                                            | 0% to 100%                 |
| Training focus    | how many creatures share the Bait: the top 3, the top 6, or "whatever I like"                              | 3, 6, spread               |
| Evolution push    | rush one creature to its evolution first, or level evenly                                                  | yes / no                   |
| Expedition uptime | how often an idle slot gets a trip at a check-in                                                           | 30% to 100%                |
| Supply spending   | share of spare Bait spent on trip supplies                                                                 | 0% to 60%                  |
| Dungeon skill     | how good the dungeon team is: the best three by the sim's row score, a reasonable three, or a random three | best / good / random       |
| Raid sign-up      | chance to sign up each week                                                                                | 30% to 100%                |
| Raid row skill    | arranged row (the sim's greedy or protected setups) or the default auto-fill                               | arranged / auto            |
| Crafting          | how often they craft and upgrade gear                                                                      | never / sometimes / always |
| Join week         | first week they play                                                                                       | 1 to 12                    |

**Presets** (names for the journey page):

- **Min-maxer:** logs in daily with check-ins every few hours including the night, always leets, top 3 only, evolution push, expeditions 100%, best dungeon team, arranged raid row, always crafts.
- **Engaged:** daily, two check-ins, leets most days, levels about six creatures, expeditions most of the time, a good dungeon team, raids every week.
- **Regular:** four or five days a week, one check-in, leets half the time, levels what it likes, a reasonable dungeon team, auto-filled raid row.
- **Drop-in:** opens the game once or twice a week, mostly for the raid, rarely leets, no planning.

A server is a mix (default: 1 min-maxer, 3 engaged, 3 regular, 2 drop-in), and a "noise" option draws each player's dials from a range around their preset.

## Income models

Income is a pluggable rule, so the sims can compare today's with the planned rework.

- **Current** (shipped): a leet pays `baitForDay(n)` = 7 Bait x leet points, where the points follow the table 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 10 by the number of players n who leeted that day (35 to 70 Bait). No income without a leet.
- **Planned: allowance plus leet bonus** (Misa, 2026-10-15; final numbers are the lead's, recorded here and in `decisions.md`):
  - **Daily allowance: 25 Bait** for opening the game that day (once a day, from the game's 13:37 reset; missed days are not paid later).
  - **Leet bonus: 15 to 32 Bait**, by how many players leeted that day: 15 (1 or 2 leeters), 17 (3), 19 (4), 21 (5), 23 (6), 25 (7), 27 (8), 29 (9), 32 (10 or more). Misa asked for about 40 for a solo leet and under 60 at 10 leeters. It keeps two of the old leet table's rules: more leeters never pays anyone less, and a solo leet pays the same as a double.
  - A day pays 25 to 57 Bait (40 for a solo leet). Compared with today: a top earner on a server where 8 players leet gets 52 a day instead of 56; a player who opens the game every day but leets twice a week gets about 210 a week instead of about 80. Logging in becomes worth it; leeting stays the bigger lever per day.
  - Both numbers become `RULES` scalars so the sim tunes them, and the change ships with its own balance pass (training costs, supply prices and the raid ladder move with income).

## The daily loop and the journey log

Each simulated day, for each player, at each of their check-ins: claim income, claim expeditions, evolve, craft, send trips, train, run the dungeon once a day, sign up and play the raid on its days, all by the profile's dials, through the real rules (no rule is copied into the sim).

The **journey log** records, per player:

- **Milestones** with the day they happen: first catch of each rarity, first evolution, each fusion step, level 10, 15, 20, 25, 30, each species cap reached, first rare and first epic gear, first +5 upgrade, each dungeon depth record and landmark, first raid stage cleared, first finale won, first jackpot.
- **Power** each day (the game's own power of the raid team, split into levels, fusion, evolution and gear as in B-009).
- **What holds them back** at each check-in, the one binding limit: not enough Bait to train, not enough Essence to evolve, a level cap waiting on evolution, max fusion, scrap or glimmer for a craft, a craft timer, all expedition slots busy, or nothing left worth buying. Runs of the same limit become **waits**, with a start, a length and a cause.
- **Currencies held** each day, so piles (Essence, shards) and shortages (scrap) show.

## Output

- `pnpm sim:journey` (new script): `--profiles` (presets or a file), `--weeks`, `--seed`, `--income current|allowance`. It writes a JSON report and a short Markdown summary.
- **The journey page** (an artifact, like the raid forecast): one timeline per preset, with milestones as markers, power as a line, waits as shaded bands named by their cause, and a table of "days to reach" each milestone by preset. Two income models can be shown side by side.
- **Feeding the balance runs:** the raid and dungeon sims take rosters from journey snapshots instead of the single spending policy, so a raid row holds a min-maxer next to a drop-in, as on a real server. The existing targets keep passing; new targets can come from the journeys (for example "a regular player waits no more than N days for a meaningful upgrade in weeks 1 to 8").

## Calibration against live data

The daily ops report (B-series, `balance-review` skill) has real logins, leets, trips, training and dungeon runs per day. Once a week of it exists, the presets get fitted to the real players' distribution (how many check-ins, how much spending goes where), and the journey page marks where live players are.

## Build slices

1. **Profiles and income models:** the dials, the presets, the pluggable income (current and allowance), all without changing results for today's archetypes (a test pins today's numbers).
2. **Profile-driven decisions:** training focus, evolution push, expedition uptime, supply spending, dungeon skill, raid row skill, crafting.
3. **Journey log:** milestones, power split, binding limit and waits, currencies.
4. **`pnpm sim:journey`** and the journey page.
5. **Balance runs from journeys,** and the first journey targets.
6. **Calibration** from the live report.
