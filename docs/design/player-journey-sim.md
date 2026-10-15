# Player journey simulator (design, 2026-10-15)

Misa wants to see what one player's progress looks like N weeks into the game, for different play styles: where they wait for meaningful upgrades, what those upgrades are, and what holds them back. The journeys then feed the raid and dungeon balance runs, so tuning reflects real play styles instead of one spending policy.

Status: slices 1 to 4 are built (`packages/sim`, `pnpm sim:journey`); slices 5 and 6 are not. Nothing here changes the game.

## What existed before

`packages/sim` already played a whole server through the real rules, day by day (`economy.ts` `runEconomy`): leets and Bait, check-ins, expeditions with supplies (`trips.ts`), training, evolution, fusion, gear and crafting (`gear.ts`), the daily dungeon (`dungeon.ts`) and the weekly raid with the Boss Rank ladder (`raid.ts`, `ladder.ts`). Its weekly snapshots feed the raid and dungeon tuning.

What it lacked, and what this work adds:

- **Play styles differed only in effort.** The four archetypes (`archetypes.ts`: casual, daily, top earner, newcomer) differed in leet days a week, check-ins a day and raid sign-up; they all spent the same way (`policy.ts`: push one creature to its evolution, then level the top three evenly). Now every habit and decision is a dial of a **profile** (`profiles.ts`), and the archetypes are four profiles with exactly today's behaviour.
- **Averages, not journeys.** The output was server means per week. Now a recorder (`journey.ts`) logs each player's milestones, power, binding limit, waits and currencies day by day.
- **One income model.** Bait came only from leets (`apps/worker/src/economy.ts` `baitForDay`). Now income is pluggable (`income.ts`).

The power study (B-009 in `docs/balance/log.md`) showed what the journey view must answer: power grows mostly from catches and evolutions until week 6 and only from levels after that; training cost (3 + 2 x level) outgrows flat Bait; Essence, shards and glimmer pile up while scrap runs short.

## Player profiles: a set of dials

A profile is data (`PlayerProfile`, validated by a strict schema; `parseProfile`). Every dial is a number or a choice; presets are named sets of values; a server can draw each player's dials from a range around their preset (`--noise`).

| Dial               | What it controls                                                                                                                                                                                                    | Values                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `loginDays`        | days a week the player opens the game (may be fractional: the average over weeks)                                                                                                                                   | 0 to 7                            |
| `leetDays`         | days a week with a leet; a leet is always a login, so never above `loginDays`                                                                                                                                       | 0 to 7                            |
| `raidDayBias`      | chance (percent) that each of Friday to Sunday is picked first when the login days are chosen                                                                                                                       | 0 to 100                          |
| `checkInHours`     | local hours of the check-ins of a login day, including at night                                                                                                                                                     | 1 to 12 hours, ascending          |
| `trainFocus`       | creatures that share the Bait: the top 3, the top 6, or `spread` (whatever the player fancies: a random trainable)                                                                                                  | 3, 6, spread                      |
| `evolutionPush`    | rush a creature that is working towards its evolution before levelling the rest                                                                                                                                     | true / false                      |
| `tripPercent`      | expedition uptime: chance that a check-in sends trips into idle slots                                                                                                                                               | 0 to 100                          |
| `supplyPercent`    | share of the spare Bait (above the training reserve) that may go to trip supplies                                                                                                                                   | 0 to 100                          |
| `dungeon`          | `best`: the best three of the top six by row score, in the game's row order; `good`: the strongest three in the game's row order (today's); `reasonable`: the strongest three, strongest first; `random`: any three | best / good / reasonable / random |
| `signUpPercent`    | chance to sign up each week                                                                                                                                                                                         | 0 to 100                          |
| `signUpNeedsLogin` | signing up needs a login on Monday to Friday of that week                                                                                                                                                           | true / false                      |
| `raidRow`          | `auto`: the default row (`autoPlace`); `greedy` or `protected`: the player arranges their own places (the setup study's rules, `formations.ts`)                                                                     | auto / greedy / protected         |
| `craftPercent`     | chance per check-in that the player upgrades gear and starts workshop jobs (they always wear and sort what they have)                                                                                               | 0 to 100                          |
| `joinWeek`         | first week they play                                                                                                                                                                                                | 1 to 104                          |

**Presets** (`PRESETS`; the numbers are the first guess, to be fitted to live data, slice 6):

| Preset    | Login / leet days | Check-ins (hours)           | Training        | Trips / supplies | Dungeon    | Raid (sign-up, row) | Gear |
| --------- | ----------------- | --------------------------- | --------------- | ---------------- | ---------- | ------------------- | ---- |
| Min-maxer | 7 / 7             | every 3 hours, 00 to 21     | top 3, push     | 100% / 100%      | best       | 100%, protected row | 100% |
| Engaged   | 7 / 5.5           | 09 and 20                   | top 6, push     | 85% / 60%        | good       | 100%, auto          | 40%  |
| Regular   | 4.5 / 2.25        | 18                          | spread, no push | 55% / 20%        | reasonable | 85%, auto           | 10%  |
| Drop-in   | 1.5 / 0.3         | 20 (60% pull to Fri to Sun) | spread, no push | 30% / 0%         | random     | 90%, auto           | 0%   |

**Today's archetypes** are profiles too (`LEGACY_PROFILES`): casuals log in only on their leet days (login days equal leet days) and check in once at 09:00; the others log in every day and check in at 09:00 and 20:00. All train the top 3 with the push, always send trips, spend all spare Bait on supplies, run the dungeon with the strongest three in the game's row order, take the default raid row and always work the gear. A test (`legacy-unchanged.test.ts`, fixture `test/fixtures/legacy-digest.json`, taken from commit 3f31620) pins that the old simulations give identical numbers; `pnpm sim:quick` writes a byte-identical report.

A server is a mix: default 1 min-maxer, 3 engaged, 3 regular, 2 drop-in; `--server-mix casual-heavy` (1 engaged, 4 regular, 4 drop-in) and `committed` (2 min-maxers, 4 engaged, 2 regular, 1 drop-in) are named; `--mix name=count,...` is free.

## Income models

Income is a pluggable rule (`income.ts`, `--income`, `EconomyOptions.income`), so the sims can compare the shipped income with the old one. Both read their numbers from the shipped rules.

- **`allowance`** (the shipped income, and the default of both `pnpm sim` and `pnpm sim:journey`): every player who opens the game that day gets `dailyAllowance()` (25 Bait) and every leeter gets `leetBonusForDay(n)` on top (15 for 1 or 2 leeters, up to 32 at 10 or more; `packages/game/src/rules/income.ts`, `RULES.income`). Login days and leet days are separate in the profiles, so a player who opens the game daily but leets twice a week earns the allowance daily and the bonus twice.
- **`current`** (the income before the allowance, kept selectable for comparisons): a leet pays `baitForDay(n)` Bait to each of the n players who leeted that day (`apps/worker/src/economy.ts`, 35 to 70 Bait). No income without a leet. The "today is unchanged" test is pinned to this model.

The journey runs pair the two models on the same seeds (same servers, same dice streams until the Bait differs).

## The daily loop

Each simulated day, in `runEconomy` (the old and the new simulations are the same code): the week's login and leet days are drawn (one shuffled order of the week decides both: the leet days are its first days and the login days a longer stretch of it, so a leet is always a login; a raid-day bias moves Friday to Sunday up the order), income is credited when the day starts, and then the day runs by the hour. At each hour at which somebody checks in, every such player does a check-in: claim income and expeditions, evolve, work the gear, send trips, buy supplies, train, start jobs. Each player runs the daily dungeon once, at their first check-in of the day. At 12:00 the raid is signed up for (Friday) and its stage played (Friday, Saturday, Sunday). Everything goes through the real rules; no rule is copied into the sim. The game's 13:37 daily reset is not modelled: a sim day is a calendar day.

## The journey log

`JourneyRecorder` watches the economy through two hooks (`EconomyObserver`: a raid stage was played; a day ended) and changes nothing: a test shows a run with a recorder is byte-identical to one without. Per player, per day (day 1 is the day they joined):

- **Milestones** with the day: the first catch of each rarity, first evolution, each fusion step, level 10, 15, 20, 25 and 30 (the highest creature), each species cap reached, first rare and first epic gear, first +5 upgrade, dungeon depth 5, 10, 15, 20, 25, 30 and the first landmark depths, each expedition slot, first raid stage cleared, first finale won, first jackpot (`milestoneCatalogue`).
- **Power** each day: the raid team (the three strongest creatures, gear included) and its split into **levels, fusion, evolution and gear** on top of the same creatures at their first stage, level 1, no fusion, no gear (`powerSplit`). The split is the Shapley value over the four factors (each one's average marginal power over every order they could be added in), the method of the B-009 power study, so the parts and the base add up to the total exactly. A level above the first stage's cap only exists with the evolution.
- **The binding limit** at the end of each day (`bindingLimit`), judged on the raid team, the first that applies:
  1. a team creature at its evolution level without the Essence: `level_cap_waiting_evolution` when no team creature can be trained at all, `essence_to_evolve` when the rest can;
  2. a trainable team creature whose next level costs more Bait than held: `bait_to_train`; the Bait is there but not spent, or an affordable evolution not done yet: `next_check_in` (not a wait);
  3. nothing to train or evolve: the gear path's limit (`scrap_for_gear`, `glimmer_for_craft`, `shards_for_craft`, `essence_for_gear`, `craft_timer`); else `max_fusion` (every team creature fully fused) or `nothing_worth_buying`.
     The record also lists everything that applies (`blocked`), including `expedition_slots_full`, and the gear path's own limit (`gearLimit`, null for a player who never works the gear).
- **Waits:** runs of days with the same binding limit, with a start, a length and a cause. After a check-in a player has always trained until the Bait ran out, so a Bait wait is the stretch between two trainings (a day with a training is not a wait). A limit that is not a wait carries the previous wait on. The gear path has its own waits (same `gearLimit` until any upgrade or craft).
- **Currencies held** (Bait, Essence, scrap, glimmer, shards), **supplies** in stock, used and bought, **gear** owned and worn with its rarity and upgrade levels.

## Output

`pnpm sim:journey` (`packages/sim/scripts/journey.mjs`, `src/journey-cli.ts`):

```
pnpm sim:journey [--profiles <names or file.json>] [--weeks N] [--seed S] [--servers N]
  [--income current|allowance] [--mix name=count,...] [--server-mix default|casual-heavy|committed]
  [--noise] [--out dir]
```

Defaults: 12 weeks, 50 servers, `allowance`, the four presets in the default mix, seed `journey`, out `journey-out`. `--profiles` takes preset names to keep or a JSON file of profiles (with a file, a profile named like a preset plays that preset's count in the default mix and any other profile plays one player, unless `--mix` says otherwise). It writes `report-journey.json` and `report-journey.md`:

- per preset: per week, the median and quartiles of power (and the median of each part of the split), top level, team level, Bait, Essence, scrap, glimmer, shards, supplies and worn gear; raid results (share signed up, share whose server won the finale, Essence paid, share of the group's contribution);
- per preset: for each milestone, the share of players who reached it and the distribution of the day (quartiles, 90th percentile, max);
- per preset: waits by cause (share of players who waited, days per player, longest wait), the share of days each limit applied, and the supplies used and bought;
- per week: the servers' finale win share, boss rank and group size;
- one example journey per preset (the first player of the first server) day by day.

The raid goes through `raid.ts` and the shipped rules, so a boss retune is followed without changes here. A player who arranges their row (`raidRow`) rearranges only their own creatures among the places they hold in the default row (`arrangeRowPartial`); the others keep the default row.

## Assumptions to watch

- `spread` training picks a random trainable creature each time (among those the player can pay for): a pessimistic model of "levels whatever it likes". Regulars and drop-ins reach their first evolution late and pile up Essence because of it.
- Signing up needs a login in the sim (the game must be opened), so a drop-in who comes only on Saturday misses the raid.
- The presets are guesses until they are fitted to the live report (slice 6).
- The gear path's limit looks only at the price of the cheapest worn upgrade; it ignores the Essence the sim holds back for an evolution (`GEAR_POLICY.evolutionLookahead`), so a player with the Essence but under the reserve shows no limit although nothing is bought.
- Expedition uptime and the supply share are per check-in, so a player with many check-ins sends more trips than the percentage says.

## Calibration against live data

The daily ops report (B-series, `balance-review` skill) has real logins, leets, trips, training and dungeon runs per day. Once a week of it exists, the presets get fitted to the real players' distribution (how many check-ins, how much spending goes where), and the journey page marks where live players are.

## Build slices

1. **Profiles and income models** (built): the dials, the presets, the pluggable income (current and allowance), without changing results for today's archetypes (a test pins today's numbers).
2. **Profile-driven decisions** (built): training focus, evolution push, expedition uptime, supply spending, dungeon skill, raid row skill, crafting.
3. **Journey log** (built): milestones, power split, binding limit and waits, currencies.
4. **`pnpm sim:journey`** (built). The journey page (an artifact with one timeline per preset, milestones as markers, waits as shaded bands, two income models side by side) is not built; the Markdown summary and the JSON are.
5. **Balance runs from journeys:** the raid and dungeon sims take rosters from journey snapshots instead of the single spending policy, so a raid row holds a min-maxer next to a drop-in, as on a real server. The existing targets keep passing; new targets can come from the journeys (for example "a regular player waits no more than N days for a meaningful upgrade in weeks 1 to 8").
6. **Calibration** from the live report.
