_Expeditions v2 in the simulator (balance pass 6, 2026-10-13): destinations, supplies (bought, crafted and found), push-on goals, explorer ranks, familiarity, slots and the weekly special, played with the game's own pure functions. `RULES.expeditions` and the content in `packages/game/src/content/data` were tuned against ten new targets (`exp-*`). Seed `leet`, 12 weeks per economy sim (60 weeks for the slot targets), 200 raid weeks per cell, 24 economy sims per player count (`pnpm sim`). Targets are in `packages/sim/targets.json` (43 now). One target is not met: setup credit share is 14.1% (needs 15%); see `docs/design/decisions.md` ("Expeditions v2 numbers set by simulation"). The run before expeditions v2 (33 targets) is `report-2026-10-13-gear.md`._

# Balance simulator report

| Setting                                     | Value                                                         |
| ------------------------------------------- | ------------------------------------------------------------- |
| Seed                                        | `leet`                                                        |
| Run size                                    | full                                                          |
| Weeks per economy sim                       | 12                                                            |
| Raid weeks per player count and boss        | 200                                                           |
| Economy sims per player count               | 24                                                            |
| 20-week economy sims for jackpot and pity   | 40 (20 weeks each)                                            |
| Long-run server sims (5, 10 and 15 players) | 40 each (30 weeks each)                                       |
| Player counts in the sweep                  | 1, 5, 10, 15                                                  |
| Default server                              | 10 players (3 casual, 4 daily, 2 top earner, 1 newcomer)      |
| Roster snapshots                            | end of weeks 4 and 8 (or the last week if the run is shorter) |
| Bosses                                      | Tidal Colossus, Cinder Wyrm, Thornmother, Storm Sovereign     |

## Summary

42 passed, 1 failed, 0 not measured.

|     | Target                                                                                                                         | Measured | Requirement    | Metric                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- | --------------------------------- |
| ✅  | Phase 1 clear rate, typical group (5-10 signed-up players, week 4 or later)                                                    | 100.0%   | >= 95.0%       | `raid.typical.phase1ClearRate`    |
| ✅  | Phase 2 clear rate, typical group                                                                                              | 75.0%    | 70.0% to 85.0% | `raid.typical.phase2ClearRate`    |
| ✅  | Finale win rate, typical group                                                                                                 | 49.9%    | 40.0% to 60.0% | `raid.typical.finaleWinRate`      |
| ✅  | Phase 1 clear rate, 1 player with guests, week 4 or later                                                                      | 100.0%   | >= 80.0%       | `raid.solo.phase1ClearRate`       |
| ✅  | Finale win rate, 15 players (no easier-with-more-people cliff)                                                                 | 36.4%    | 35.0% to 65.0% | `raid.fifteen.finaleWinRate`      |
| ✅  | Spread of finale win rate between bosses, typical group (percentage points)                                                    | 2.0%     | <= 15.0%       | `raid.typical.bossSpread`         |
| ✅  | Bosses a typical group never beats or always beats in the finale (flagged)                                                     | 0        | <= 0           | `raid.typical.extremeBosses`      |
| ✅  | Median top player's share of contribution, groups of 5+ players                                                                | 15.9%    | <= 35.0%       | `fair.topShareMedian`             |
| ❌  | Setup credit share of total contribution (setters matter)                                                                      | 14.1%    | >= 15.0%       | `fair.setupShare`                 |
| ✅  | Reactions per round on average, groups of 5+ players                                                                           | 4.1      | >= 1           | `fair.reactionsPerRound`          |
| ✅  | Newcomer (joined week 4) Essence per week at week 6, relative to a top earner                                                  | 93.9%    | >= 70.0%       | `econ.newcomerEssenceRatioWeek6`  |
| ✅  | Lowest element pick rate in raids                                                                                              | 19.8%    | >= 15.0%       | `choice.elementPickRateMin`       |
| ✅  | Highest element pick rate in raids                                                                                             | 29.5%    | <= 35.0%       | `choice.elementPickRateMax`       |
| ✅  | Highest creature contribution relative to the median creature of its rarity                                                    | 1.43x    | <= 1.60x       | `choice.creatureRatioMax`         |
| ✅  | Lowest creature contribution relative to the median creature of its rarity                                                     | 0.60x    | >= 0.60x       | `choice.creatureRatioMin`         |
| ✅  | Elements picked in under 10% of raid slots (flagged as dead)                                                                   | 0        | <= 0           | `choice.deadElements`             |
| ✅  | Casual player's highest creature level at the end of week 4 (evolution level 15)                                               | 15       | >= 15          | `econ.casualTopLevelWeek4`        |
| ✅  | Daily player owns at least 8 of 12 catchable species by the end of week 6                                                      | 11       | >= 8           | `econ.dailySpeciesWeek6`          |
| ✅  | Top earner vs casual average team power at week 8                                                                              | 1.45x    | <= 1.60x       | `econ.powerRatioTopVsCasualWeek8` |
| ✅  | Jackpot rate per player per finale win, including pity                                                                         | 12.4%    | 6.0% to 15.0%  | `econ.jackpotRatePerWin`          |
| ✅  | Players reaching hard pity (10 raids without a jackpot) over 20 weeks                                                          | 13.3%    | <= 15.0%       | `econ.hardPityShare20Weeks`       |
| ✅  | Long-run finale win rate per server, Festivals included, small server (5 players, 30 weeks)                                    | 54.9%    | 40.0% to 60.0% | `longrun.small.finaleWinRate`     |
| ✅  | Long-run finale win rate per server, Festivals included, typical server (10 players, 30 weeks)                                 | 55.1%    | 40.0% to 60.0% | `longrun.typical.finaleWinRate`   |
| ✅  | Long-run finale win rate per server, Festivals included, 15-player server (30 weeks)                                           | 55.3%    | 40.0% to 60.0% | `longrun.fifteen.finaleWinRate`   |
| ✅  | Festival finale win rate, lowest of the three server sizes                                                                     | 96.7%    | >= 70.0%       | `longrun.festivalWinRateMin`      |
| ✅  | Median weeks between rank-ups, all long-run servers                                                                            | 2        | 2 to 4         | `longrun.rankUpGapMedian`         |
| ✅  | Share of servers with a loss streak of more than 4 weeks, worst of the three sizes                                             | 0.0%     | <= 10.0%       | `longrun.lossStreakShareMax`      |
| ✅  | Gear's share of a daily player's raid-team power at week 8 (median)                                                            | 12.3%    | 10.0% to 20.0% | `gear.dailyShareWeek8`            |
| ✅  | Days until a daily player's first crafted item arrives (90th percentile; a player who never crafts counts as 99)               | 1.38     | <= 7           | `gear.dailyFirstCraftDaysP90`     |
| ✅  | Essence held by daily players at week 12 minus the same sims without gear (today's value; must not be above it)                | -579.7   | <= 0           | `gear.dailyEssenceWeek12VsToday`  |
| ✅  | Weekly growth of daily players' Essence stockpile from week 8 to 12 minus today's growth (no runaway; negative means it falls) | -39.36   | <= 0           | `gear.dailyEssenceGrowthVsToday`  |
| ✅  | Best Crafting skill level of a daily player 30 days after joining (median)                                                     | 6        | 4 to 6         | `gear.dailyBestSkillDay30`        |
| ✅  | Gear power at week 8 of a player who joined in week 4, relative to the median daily player's                                   | 77.6%    | >= 60.0%       | `gear.newcomerCatchUpWeek8`       |
| ✅  | Day a daily player's 2nd expedition slot opens, after joining (median; the first day)                                          | 1        | <= 1           | `exp.dailySlot2Day`               |
| ✅  | Day a daily player's 3rd expedition slot opens (median; about a month, 30 plus or minus 7)                                     | 28       | 23 to 37       | `exp.dailySlot3Day`               |
| ✅  | Day a daily player's 4th expedition slot opens (median; about four months)                                                     | 121.5    | 90 to 150      | `exp.dailySlot4Day`               |
| ✅  | Day a daily player's 5th expedition slot opens (median; about a year; a slot that never opens counts as 999)                   | 369.5    | 330 to 400     | `exp.dailySlot5Day`               |
| ✅  | Worth per day of the best long strategy (always 12 or 24 hour trips) over the best short one (2 or 6 hours), Bait-free         | 2.58x    | >= 1.20x       | `exp.longVsShortRate`             |
| ✅  | Worth per day of always sending 2 hour trips over the worst of the other three strategies (at most 1: spam is the worst)       | 0.30x    | <= 1.00x       | `exp.spamVsOthersRate`            |
| ✅  | Share of daily players' finished trips that are 12 or 24 hours (long trips are what people send)                               | 99.1%    | >= 50.0%       | `exp.dailyLongShare`              |
| ✅  | Lowest expected worth of a risky push-on goal against coming home, over every length it is offered after                       | 0.96x    | >= 0.90x       | `exp.riskyRatioMin`               |
| ✅  | Highest expected worth of a risky push-on goal against coming home (a fair gamble: within 10%)                                 | 1.00x    | <= 1.10x       | `exp.riskyRatioMax`               |
| ✅  | Most species a casual player owns ahead of today's expeditions at the end of any week 1 to 12 (no faster than today)           | 0.1      | <= 0.3         | `exp.casualSpeciesVsToday`        |

## Bosses

### Tidal Colossus (tide)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 95% / 100% / 100%          | 1.88                | 100.0%           |
| 5       | 200  | 4.4           | 100.0%        | 83.5%         | 71.5%      | 39% / 70% / 96%            | 2.74                | 32.2%            |
| 10      | 200  | 9.1           | 100.0%        | 57.5%         | 35.5%      | 29% / 55% / 91%            | 4.64                | 17.7%            |
| 15      | 200  | 13.6          | 100.0%        | 55.5%         | 28.0%      | 28% / 54% / 92%            | 6.08                | 13.0%            |

Typical group (5-10 signed up, 299 runs): Phase 1 100.0%, Phase 2 67.6%, finale 49.5%.

### Cinder Wyrm (ember)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 72% / 99% / 100%           | 0.56                | 100.0%           |
| 5       | 200  | 4.4           | 100.0%        | 89.0%         | 67.0%      | 34% / 64% / 97%            | 0.67                | 31.1%            |
| 10      | 200  | 9.1           | 100.0%        | 85.0%         | 45.0%      | 30% / 57% / 96%            | 1.93                | 15.8%            |
| 15      | 200  | 13.6          | 100.0%        | 72.0%         | 46.0%      | 30% / 56% / 96%            | 2.59                | 10.9%            |

Typical group (5-10 signed up, 296 runs): Phase 1 100.0%, Phase 2 87.5%, finale 51.4%.

### Thornmother (grove)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 62% / 97% / 100%           | 1.37                | 100.0%           |
| 5       | 200  | 4.4           | 100.0%        | 87.5%         | 71.5%      | 36% / 67% / 97%            | 2.43                | 31.6%            |
| 10      | 200  | 9.1           | 100.0%        | 71.0%         | 41.5%      | 30% / 57% / 94%            | 4.21                | 17.5%            |
| 15      | 200  | 13.5          | 100.0%        | 73.0%         | 35.5%      | 29% / 55% / 95%            | 5.55                | 12.4%            |

Typical group (5-10 signed up, 294 runs): Phase 1 100.0%, Phase 2 75.9%, finale 49.3%.

### Storm Sovereign (spark)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 93% / 100% / 100%          | 1.70                | 100.0%           |
| 5       | 200  | 4.3           | 100.0%        | 89.0%         | 79.0%      | 40% / 73% / 97%            | 2.58                | 31.5%            |
| 10      | 200  | 9.0           | 100.0%        | 62.0%         | 37.5%      | 29% / 56% / 92%            | 4.59                | 18.3%            |
| 15      | 200  | 13.4          | 100.0%        | 58.0%         | 36.0%      | 29% / 54% / 92%            | 6.00                | 13.6%            |

Typical group (5-10 signed up, 291 runs): Phase 1 100.0%, Phase 2 69.1%, finale 49.5%.

## Fairness and contribution

| Archetype  | Average share of contribution (groups of 5+) | Average Essence per raid week |
| ---------- | -------------------------------------------- | ----------------------------- |
| Casual     | 7.8%                                         | 50.8                          |
| Daily      | 11.1%                                        | 66.7                          |
| Top earner | 11.2%                                        | 59.3                          |
| Newcomer   | 6.8%                                         | 45.8                          |

## Archetype progression

Averages over the 24 default-server sims (10 players each).

### Casual

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 72      | 109         | 0                    | 22                   | 78                | 2.1           | 110         | 8.6       | 0.0     | 8.4            | 7.6          | 0.00             | 0.0  |
| 2    | 72      | 109         | 0                    | 30                   | 67                | 3.9           | 174         | 12.0      | 0.0     | 41.3           | 37.9         | 0.00             | 0.5  |
| 3    | 72      | 108         | 1                    | 55                   | 57                | 6.2           | 206         | 14.0      | 0.0     | 51.2           | 64.7         | 0.03             | 1.2  |
| 4    | 72      | 114         | 5                    | 45                   | 85                | 7.6           | 284         | 15.0      | 0.8     | 52.0           | 55.3         | 0.07             | 1.7  |
| 5    | 72      | 114         | 6                    | 41                   | 73                | 8.3           | 324         | 15.0      | 1.0     | 53.2           | 63.5         | 0.11             | 2.3  |
| 6    | 72      | 114         | 11                   | 47                   | 84                | 8.8           | 411         | 15.0      | 1.7     | 48.3           | 55.6         | 0.14             | 2.7  |
| 7    | 72      | 115         | 13                   | 47                   | 80                | 9.2           | 456         | 15.2      | 1.9     | 51.9           | 62.0         | 0.19             | 3.0  |
| 8    | 72      | 114         | 14                   | 50                   | 76                | 9.7           | 506         | 16.6      | 2.2     | 53.8           | 58.1         | 0.24             | 3.4  |
| 9    | 72      | 114         | 16                   | 55                   | 76                | 9.9           | 541         | 17.9      | 2.3     | 46.2           | 59.6         | 0.26             | 3.6  |
| 10   | 72      | 115         | 18                   | 55                   | 80                | 10.0          | 573         | 19.2      | 2.3     | 58.6           | 70.4         | 0.38             | 3.5  |
| 11   | 72      | 115         | 18                   | 49                   | 84                | 10.1          | 606         | 20.6      | 2.3     | 48.5           | 69.7         | 0.40             | 3.8  |
| 12   | 72      | 115         | 19                   | 52                   | 76                | 10.1          | 634         | 21.7      | 2.3     | 46.7           | 78.3         | 0.46             | 3.9  |

### Daily

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 96      | 313         | 8                    | 87                   | 215               | 7.5           | 214         | 13.7      | 0.1     | 18.5           | 12.5         | 0.00             | 0.0  |
| 2    | 96      | 312         | 33                   | 128                  | 221               | 9.5           | 356         | 15.0      | 1.3     | 76.6           | 30.6         | 0.04             | 0.9  |
| 3    | 96      | 314         | 54                   | 148                  | 217               | 10.1          | 483         | 15.2      | 2.1     | 85.6           | 16.9         | 0.16             | 1.7  |
| 4    | 96      | 333         | 75                   | 190                  | 220               | 10.3          | 543         | 17.4      | 2.2     | 80.9           | 18.3         | 0.21             | 2.4  |
| 5    | 96      | 331         | 115                  | 215                  | 235               | 10.5          | 595         | 19.4      | 2.2     | 86.9           | 25.1         | 0.27             | 3.1  |
| 6    | 96      | 332         | 125                  | 210                  | 245               | 10.8          | 640         | 21.3      | 2.2     | 85.4           | 36.0         | 0.39             | 3.5  |
| 7    | 96      | 332         | 147                  | 267                  | 196               | 11.4          | 675         | 22.8      | 2.2     | 79.0           | 46.4         | 0.49             | 3.7  |
| 8    | 96      | 332         | 165                  | 310                  | 188               | 11.7          | 706         | 24.1      | 2.2     | 69.4           | 59.0         | 0.59             | 3.7  |
| 9    | 96      | 331         | 172                  | 320                  | 176               | 11.9          | 732         | 25.2      | 2.2     | 66.7           | 82.8         | 0.73             | 3.3  |
| 10   | 96      | 333         | 178                  | 331                  | 179               | 11.9          | 759         | 26.4      | 2.2     | 77.0           | 103.1        | 0.88             | 3.0  |
| 11   | 96      | 333         | 232                  | 356                  | 208               | 12.0          | 789         | 27.6      | 2.2     | 71.8           | 138.7        | 0.97             | 3.0  |
| 12   | 96      | 332         | 301                  | 377                  | 258               | 12.0          | 819         | 29.1      | 2.2     | 72.2           | 182.6        | 1.05             | 3.1  |

### Top earner

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 48      | 362         | 7                    | 111                  | 251               | 7.3           | 232         | 14.5      | 0.1     | 18.9           | 11.4         | 0.02             | 0.0  |
| 2    | 48      | 361         | 38                   | 139                  | 260               | 9.4           | 409         | 15.0      | 1.8     | 77.2           | 12.5         | 0.02             | 0.9  |
| 3    | 48      | 363         | 59                   | 179                  | 234               | 10.1          | 504         | 15.9      | 2.5     | 81.3           | 16.0         | 0.08             | 1.8  |
| 4    | 48      | 385         | 78                   | 215                  | 253               | 10.4          | 564         | 18.0      | 2.5     | 82.5           | 21.8         | 0.21             | 2.3  |
| 5    | 48      | 383         | 113                  | 223                  | 280               | 10.7          | 621         | 20.5      | 2.5     | 89.0           | 24.8         | 0.33             | 2.8  |
| 6    | 48      | 384         | 135                  | 257                  | 245               | 10.9          | 666         | 22.2      | 2.5     | 85.3           | 38.0         | 0.44             | 3.1  |
| 7    | 48      | 385         | 165                  | 334                  | 212               | 11.3          | 703         | 23.8      | 2.5     | 80.0           | 49.2         | 0.58             | 3.2  |
| 8    | 48      | 384         | 179                  | 350                  | 207               | 11.7          | 734         | 25.1      | 2.5     | 67.1           | 70.8         | 0.65             | 3.4  |
| 9    | 48      | 383         | 181                  | 364                  | 196               | 11.8          | 762         | 26.3      | 2.5     | 66.5           | 95.6         | 0.75             | 3.4  |
| 10   | 48      | 384         | 193                  | 375                  | 201               | 11.9          | 789         | 27.6      | 2.5     | 76.1           | 130.3        | 0.94             | 3.2  |
| 11   | 48      | 384         | 237                  | 386                  | 241               | 12.0          | 819         | 29.0      | 2.5     | 70.5           | 163.8        | 1.04             | 3.2  |
| 12   | 48      | 384         | 313                  | 386                  | 325               | 12.0          | 840         | 30.0      | 2.6     | 73.3           | 203.4        | 1.15             | 2.9  |

### Newcomer

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 4    | 24      | 333         | 9                    | 125                  | 213               | 7.9           | 265         | 14.9      | 0.8     | 69.2           | 22.5         | 0.00             | 0.9  |
| 5    | 24      | 332         | 35                   | 116                  | 247               | 9.8           | 437         | 15.0      | 1.8     | 81.5           | 25.5         | 0.04             | 1.7  |
| 6    | 24      | 331         | 56                   | 164                  | 219               | 10.3          | 522         | 16.8      | 2.4     | 80.1           | 20.9         | 0.08             | 2.5  |
| 7    | 24      | 331         | 72                   | 180                  | 228               | 10.4          | 577         | 19.0      | 2.4     | 74.4           | 26.5         | 0.08             | 3.2  |
| 8    | 24      | 332         | 119                  | 206                  | 242               | 10.7          | 623         | 20.8      | 2.4     | 65.8           | 30.5         | 0.13             | 3.6  |
| 9    | 24      | 330         | 143                  | 253                  | 211               | 10.9          | 659         | 22.6      | 2.4     | 66.4           | 42.8         | 0.17             | 4.0  |
| 10   | 24      | 333         | 159                  | 298                  | 193               | 11.5          | 689         | 23.9      | 2.4     | 74.0           | 57.2         | 0.29             | 4.0  |
| 11   | 24      | 334         | 168                  | 328                  | 163               | 11.6          | 712         | 25.0      | 2.4     | 67.6           | 76.8         | 0.46             | 3.8  |
| 12   | 24      | 332         | 178                  | 322                  | 188               | 11.8          | 736         | 26.2      | 2.4     | 67.3           | 109.8        | 0.75             | 2.5  |

## Gear and crafting

Gear power is the power the worn items add to the top 3 creatures (`applyGear`, floored like the fight slots), and the share is that power over the top-3 power (gear included). The "today" columns are the same sims and seeds played without gear.

### Casual

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 1.6        | 1.5%       | 0.0                   | 0.0            | 1.0                   | 1                     | 8            | 4.2        |
| 2    | 4.3        | 2.5%       | 0.5                   | 1.2            | 1.2                   | 11                    | 38           | 7.0        |
| 3    | 7.8        | 3.7%       | 1.5                   | 1.9            | 1.6                   | 24                    | 65           | 6.9        |
| 4    | 14.5       | 5.0%       | 3.0                   | 2.5            | 2.2                   | 46                    | 55           | 7.1        |
| 5    | 20.0       | 6.1%       | 3.9                   | 3.2            | 2.7                   | 41                    | 64           | 6.5        |
| 6    | 28.3       | 6.8%       | 4.6                   | 4.2            | 3.2                   | 32                    | 56           | 6.7        |
| 7    | 35.0       | 7.6%       | 5.3                   | 5.0            | 3.6                   | 38                    | 62           | 7.1        |
| 8    | 43.5       | 8.5%       | 6.3                   | 5.9            | 4.1                   | 47                    | 58           | 6.2        |
| 9    | 50.2       | 9.2%       | 6.9                   | 7.0            | 4.4                   | 43                    | 60           | 7.2        |
| 10   | 57.3       | 9.9%       | 7.6                   | 7.8            | 4.7                   | 47                    | 70           | 6.2        |
| 11   | 64.4       | 10.6%      | 8.3                   | 8.7            | 5.0                   | 49                    | 70           | 5.9        |
| 12   | 70.4       | 11.1%      | 8.8                   | 9.6            | 5.3                   | 37                    | 78           | 7.2        |

### Daily

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 5.8        | 2.7%       | 0.2                   | 2.7            | 2.5                   | 5                     | 13           | 3.8        |
| 2    | 16.6       | 4.6%       | 1.3                   | 6.1            | 4.1                   | 29                    | 31           | 3.8        |
| 3    | 31.8       | 6.6%       | 3.7                   | 9.5            | 5.2                   | 70                    | 17           | 3.3        |
| 4    | 44.7       | 8.2%       | 5.4                   | 12.6           | 5.8                   | 77                    | 18           | 3.4        |
| 5    | 56.9       | 9.5%       | 6.9                   | 16.8           | 6.4                   | 80                    | 25           | 3.2        |
| 6    | 68.1       | 10.6%      | 7.8                   | 21.5           | 6.9                   | 74                    | 36           | 3.8        |
| 7    | 77.4       | 11.5%      | 8.7                   | 26.1           | 7.3                   | 69                    | 46           | 3.6        |
| 8    | 84.2       | 11.9%      | 9.3                   | 31.0           | 7.6                   | 57                    | 59           | 4.2        |
| 9    | 89.8       | 12.2%      | 9.8                   | 36.5           | 8.0                   | 43                    | 83           | 4.4        |
| 10   | 95.8       | 12.6%      | 10.0                  | 42.0           | 8.3                   | 57                    | 103          | 4.4        |
| 11   | 102.3      | 12.9%      | 10.4                  | 49.3           | 8.8                   | 36                    | 139          | 4.0        |
| 12   | 106.9      | 13.0%      | 10.6                  | 59.4           | 9.3                   | 28                    | 183          | 4.2        |

### Top earner

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 6.8        | 2.9%       | 0.2                   | 2.9            | 2.5                   | 5                     | 11           | 3.1        |
| 2    | 20.3       | 4.9%       | 1.5                   | 6.3            | 4.1                   | 31                    | 12           | 4.4        |
| 3    | 33.3       | 6.6%       | 3.3                   | 9.7            | 5.3                   | 54                    | 16           | 4.3        |
| 4    | 45.9       | 8.1%       | 5.2                   | 13.2           | 5.9                   | 75                    | 22           | 3.1        |
| 5    | 59.6       | 9.5%       | 6.5                   | 17.4           | 6.4                   | 86                    | 25           | 3.2        |
| 6    | 70.5       | 10.6%      | 7.8                   | 22.2           | 6.9                   | 72                    | 38           | 2.9        |
| 7    | 80.4       | 11.4%      | 8.5                   | 27.0           | 7.3                   | 69                    | 49           | 3.4        |
| 8    | 86.6       | 11.8%      | 9.0                   | 32.0           | 7.8                   | 45                    | 71           | 4.4        |
| 9    | 93.0       | 12.2%      | 9.5                   | 37.4           | 8.0                   | 42                    | 96           | 4.4        |
| 10   | 99.9       | 12.6%      | 9.8                   | 43.3           | 8.4                   | 41                    | 130          | 3.9        |
| 11   | 105.3      | 12.8%      | 10.2                  | 51.0           | 8.8                   | 37                    | 164          | 4.1        |
| 12   | 109.8      | 13.0%      | 10.2                  | 60.9           | 9.4                   | 31                    | 203          | 3.9        |

### Newcomer

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 4    | 12.0       | 4.5%       | 1.3                   | 3.2            | 2.6                   | 31                    | 23           | 1.5        |
| 5    | 29.5       | 6.7%       | 2.5                   | 5.9            | 4.0                   | 44                    | 26           | 3.4        |
| 6    | 45.0       | 8.6%       | 4.5                   | 9.5            | 5.2                   | 69                    | 21           | 2.9        |
| 7    | 57.3       | 9.9%       | 6.0                   | 12.5           | 5.8                   | 69                    | 27           | 2.9        |
| 8    | 68.2       | 10.9%      | 7.1                   | 16.3           | 6.3                   | 62                    | 30           | 4.6        |
| 9    | 77.1       | 11.7%      | 7.9                   | 21.0           | 6.8                   | 54                    | 43           | 4.0        |
| 10   | 85.1       | 12.3%      | 8.8                   | 26.1           | 7.3                   | 60                    | 57           | 4.3        |
| 11   | 89.9       | 12.6%      | 9.4                   | 30.8           | 7.6                   | 48                    | 77           | 5.3        |
| 12   | 94.0       | 12.7%      | 9.8                   | 36.6           | 7.9                   | 34                    | 110          | 3.8        |

### Daily players with gear and without (today)

| Week | Essence held | Essence held today | Top-3 power | Top-3 power today |
| ---- | ------------ | ------------------ | ----------- | ----------------- |
| 1    | 13           | 16                 | 214         | 202               |
| 2    | 31           | 60                 | 356         | 320               |
| 3    | 17           | 103                | 483         | 445               |
| 4    | 18           | 182                | 543         | 496               |
| 5    | 25           | 262                | 595         | 535               |
| 6    | 36           | 337                | 640         | 570               |
| 7    | 46           | 413                | 675         | 593               |
| 8    | 59           | 481                | 706         | 611               |
| 9    | 83           | 546                | 732         | 625               |
| 10   | 103          | 619                | 759         | 637               |
| 11   | 139          | 696                | 789         | 653               |
| 12   | 183          | 762                | 819         | 671               |

### What the team wears (end of week 8)

| Archetype  | Common | Rare | Epic | Festival | Average level | Enchanted | Power added per item | Bag | Blueprints | Scrap | Shards | Glimmer |
| ---------- | ------ | ---- | ---- | -------- | ------------- | --------- | -------------------- | --- | ---------- | ----- | ------ | ------- |
| Casual     | 67%    | 16%  | 3%   | 15%      | 2.1           | 9%        | 14.6                 | 2.7 | 2.2        | 6     | 5      | 0.6     |
| Daily      | 64%    | 15%  | 3%   | 18%      | 3.1           | 79%       | 28.1                 | 2.0 | 6.1        | 4     | 17     | 1.7     |
| Top earner | 58%    | 21%  | 2%   | 19%      | 3.0           | 82%       | 28.9                 | 2.0 | 6.7        | 4     | 17     | 1.5     |
| Newcomer   | 64%    | 6%   | 11%  | 19%      | 2.4           | 53%       | 22.7                 | 2.0 | 4.5        | 5     | 9      | 0.5     |

## Elements

| Element | Raid slots | Pick rate |
| ------- | ---------- | --------- |
| tide    | 16358      | 24.4%     |
| ember   | 17710      | 26.4%     |
| grove   | 13284      | 19.8%     |
| spark   | 19788      | 29.5%     |

## Creatures

| Creature               | Rarity | Element | Role    | Picks | Pick rate | Average level | Average contribution | Relative to rarity median |
| ---------------------- | ------ | ------- | ------- | ----- | --------- | ------------- | -------------------- | ------------------------- |
| Ashmole                | common | ember   | support | 151   | 0.2%      | 16.6          | 5473                 | 0.94x                     |
| Aurorix                | epic   | spark   | support | 63    | 0.1%      | 13.4          | 4751                 | 0.71x                     |
| Cindle                 | common | ember   | payoff  | 14115 | 21.0%     | 19.0          | 6740                 | 1.15x                     |
| Coralynx               | rare   | tide    | payoff  | 6971  | 10.4%     | 13.9          | 6000                 | 0.91x                     |
| Gaiadrake              | epic   | grove   | payoff  | 4182  | 6.2%      | 20.0          | 9594                 | 1.43x                     |
| Hearthshell (Festival) | epic   | ember   | guard   | 335   | 0.5%      | 12.1          | 3467                 | 0.52x                     |
| Lanternfin (Festival)  | epic   | tide    | support | 1095  | 1.6%      | 13.8          | 4725                 | 0.70x                     |
| Mistnewt               | common | tide    | guard   | 720   | 1.1%      | 16.8          | 4229                 | 0.72x                     |
| Mossback               | rare   | grove   | setter  | 2509  | 3.7%      | 19.0          | 6624                 | 1.00x                     |
| Solmane                | epic   | ember   | setter  | 3109  | 4.6%      | 18.2          | 6715                 | 1.00x                     |
| Splashet               | common | tide    | setter  | 7572  | 11.3%     | 19.0          | 6220                 | 1.06x                     |
| Sproutle               | common | grove   | guard   | 6593  | 9.8%      | 19.3          | 3520                 | 0.60x                     |
| Stormray               | rare   | spark   | payoff  | 19111 | 28.5%     | 19.1          | 9292                 | 1.40x                     |
| Zipmouse               | common | spark   | setter  | 614   | 0.9%      | 16.3          | 6470                 | 1.11x                     |

## Essence and jackpots

| Players | Player-weeks | Mean Essence | P10 | Median | P90 | Max |
| ------- | ------------ | ------------ | --- | ------ | --- | --- |
| 1       | 800          | 83.0         | 80  | 80     | 86  | 86  |
| 5       | 3501         | 67.3         | 17  | 78     | 90  | 130 |
| 10      | 7257         | 50.2         | 15  | 43     | 91  | 119 |
| 15      | 10822        | 47.8         | 15  | 41     | 90  | 141 |

| Source                           | Finale-win rolls | Jackpots | Rate  | Guaranteed by hard pity |
| -------------------------------- | ---------------- | -------- | ----- | ----------------------- |
| sweep, 1 players                 | 800              | 158      | 19.8% | 0                       |
| sweep, 5 players                 | 2513             | 336      | 13.4% | 0                       |
| sweep, 10 players                | 2828             | 321      | 11.4% | 0                       |
| sweep, 15 players                | 3869             | 494      | 12.8% | 0                       |
| economy sims, 20 raid weeks each | 4365             | 540      | 12.4% | 46                      |

## Ability damage share (informational)

What abilities add to the damage dealt in the finale, measured by replaying each finale three times against a boss that cannot fall (every ability, only the basic ones, none) so all 12 rounds are played. Creature share = (all - basic only) / all; basic share = (basic only - none) / all. Creature abilities need creature level 10. Informational: the aim is a creature share of about 10-25% for a week-8 roster, not a target.

| Roster week | Group                        | Raids | Creature abilities per raid | Creature share | Basic share |
| ----------- | ---------------------------- | ----- | --------------------------- | -------------- | ----------- |
| 4           | typical group (5-10 players) | 582   | 18.7                        | 17.3%          | 3.4%        |
| 4           | 15 players                   | 400   | 34.6                        | 20.1%          | 3.6%        |
| 4           | 1 player with guests         | 400   | 3.0                         | 15.0%          | 0.7%        |
| 8           | typical group (5-10 players) | 598   | 23.1                        | 19.8%          | 3.1%        |
| 8           | 15 players                   | 400   | 40.5                        | 21.9%          | 3.6%        |
| 8           | 1 player with guests         | 400   | 3.0                         | 16.5%          | 0.7%        |

## Long-running servers (ladder, Festivals, seasons)

40 servers per size, 30 weeks each (6 seasons of 4 normal weeks and a Festival), with the Boss Rank ladder: placement at the first raid week, a normal finale win +1 rank, a loss keeps the rank, a Festival boss fights 3 ranks lower and the rank eases 1 after it. Every server starts at a random point of the 5-week calendar. A rank-up is a week that raised the rank.

| Server                      | Servers | Finale win rate (mean per server) | Per server p10 to p90 | Normal weeks | Festival weeks | Weeks 1-10 | Weeks 11+ | Median weeks between rank-ups (p10 to p90) | Servers with a loss streak over 4 | Median longest loss streak |
| --------------------------- | ------- | --------------------------------- | --------------------- | ------------ | -------------- | ---------- | --------- | ------------------------------------------ | --------------------------------- | -------------------------- |
| Small server (5 players)    | 40      | 54.9%                             | 53% to 57%            | 44.3%        | 97.5%          | 75.0%      | 44.9%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |
| Typical server (10 players) | 40      | 55.1%                             | 53% to 57%            | 44.7%        | 96.7%          | 73.8%      | 45.8%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |
| 15-player server            | 40      | 55.3%                             | 53% to 57%            | 44.7%        | 97.5%          | 73.3%      | 46.3%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |

Median server rank at the start of each week (the Festival boss fights at an eased rank):

| Server                      | Placement | Week 1 | Week 5 | Week 10 | Week 15 | Week 20 | Week 25 | Week 30 | Rank after the last week (p10 to p90) |
| --------------------------- | --------- | ------ | ------ | ------- | ------- | ------- | ------- | ------- | ------------------------------------- |
| Small server (5 players)    | 2.0       | 2.0    | 3.0    | 6.0     | 6.0     | 7.0     | 7.0     | 7.0     | 7.0 (6 to 8)                          |
| Typical server (10 players) | 2.0       | 2.0    | 3.0    | 5.0     | 6.0     | 6.0     | 6.5     | 7.0     | 7.0 (6 to 8)                          |
| 15-player server            | 2.0       | 2.0    | 3.0    | 5.0     | 6.0     | 6.0     | 7.0     | 7.0     | 7.0 (6 to 7)                          |

Rank spread between the typical and the 15-player server after week 30 (informational, no target): 0.0 ranks.

## Outliers

- Dominant creatures (contribution above 1.6x the median of their rarity): none.
- Weak creatures (below 0.6x): none.
- Dead elements (picked in under 10% of raid slots): none.
- Unbeatable bosses (typical group never wins the finale): none.
- Trivial bosses (typical group always wins the finale): none.
- Boss and group size combinations at 0% or 100% finale wins: tidal-colossus with 1 player: always won; cinder-wyrm with 1 player: always won; thornmother with 1 player: always won; storm-sovereign with 1 player: always won.

## Example fight

Tidal Colossus finale, 10-player server on a week 4 roster (lost). First 30 events:

1. Tidal Colossus resists Steam (Reaction Resistance).
2. Round 1: Tidal Colossus has 108324 HP.
3. Lanternfin (Top earner 1) powers up Thornbuck (Top earner 2) (+15% damage on its next hit).
4. Lanternfin (Top earner 1) powers up Solmane (Daily 1) (+15% damage on its next hit).
5. Thornbuck (Casual 3) acts.
6. Thornbuck (Casual 3) hits Tidal Colossus for 61; 108263 HP left.
7. Thornbuck (Casual 3) leaves Tidal Colossus Overgrown.
8. Thornbuck (Newcomer 1) acts.
9. Thornbuck (Newcomer 1) hits Tidal Colossus for 69; 108194 HP left.
10. Thornbuck (Daily 3) acts.
11. Thornbuck (Daily 3) hits Tidal Colossus for 76; 108118 HP left.
12. Mistnewt (Casual 2) acts.
13. Mistnewt (Casual 2) hits Tidal Colossus for 29; 108089 HP left.
14. Thornbuck (Top earner 2) acts.
15. Thornbuck (Top earner 2) hits Tidal Colossus for 97; 107992 HP left.
16. Lanternfin (Top earner 1) acts.
17. Lanternfin (Top earner 1) hits Tidal Colossus for 99; 107893 HP left.
18. Solmane (Daily 1) acts.
19. Solmane (Daily 1) hits Tidal Colossus for 450 (weak matchup); 107443 HP left.
20. Wildfire! Solmane (Daily 1) cashes in the mark set by Thornbuck (Casual 3) for 350 bonus damage.
21. Tidewing (Daily 1) acts.
22. Tidewing (Daily 1) hits Tidal Colossus for 116; 107327 HP left.
23. Tidewing (Daily 1) leaves Tidal Colossus Soaked.
24. Solmane (Top earner 1) acts.
25. Solmane (Top earner 1) hits Tidal Colossus for 82 (weak matchup); 107245 HP left.
26. Solmane (Top earner 1) replaces Soaked with Scorched.
27. Tidewing (Daily 4) acts.
28. Tidewing (Daily 4) hits Tidal Colossus for 275; 106970 HP left.
29. Steam! Tidewing (Daily 4) cashes in the mark set by Solmane (Top earner 1) for 175 bonus damage.
30. Solmane (Daily 2) acts.

## Method

- **Leet credit:** each day, every player who leets earns `baitForDay(n)` (n = players who leeted that day). Casuals leet on 2 random days a week, dailies on 6, top earners on all 7, and the newcomer like a daily from week 4.
- **Starter:** the starter whose element the server owns least (ties in content order). The first expedition brings a Zipmouse (game rule).
- **Check-ins:** casuals check in once on each leet day (every few days); everyone else twice a day (09:00 and 20:00).
- **At a check-in:** claim trips (and take an end-of-trip goal), claim jobs, evolve creatures that are at level 15 when there is enough Essence, train, manage gear, send trips into the free slots, start workshop jobs.
- **Trips (expeditions v2):** slots come from the sum of the explorer ranks above 1 (`slotsFor`); a trip is free, only supplies cost Bait. Each free slot sends the idle creature of the highest explorer rank, to the open place (rank, night and Festival gates) where the most unowned species can be found (rarer ones count more, the weekly special place a little extra), for the length that pays the most per hour until the next check-in claims it (casuals: the longest they may). Supplies: those in stock that help, then supplies whose estimated worth is at least 30% of the price, within a budget of the Bait held above 43 (all of it when nothing can be trained); at most 2, never two of a kind. When a trip has ended it rolls its end-of-trip offer; a goal is taken when its extra hours (counted from the end of the trip) are over already (no waiting) and its worth ratio is at least 97%. The workshop makes supplies from spare parts when no gear job is wanted.
- **Training:** the rest of the Bait goes to one creature at a time, at the game's training cost with the catch-up discount: of the 3 strongest trainable creatures (not at their level cap), the furthest-along one that still has to reach its evolution level (players push one creature to its evolution before starting the next); if none of the three is working towards an evolution, the weakest of them. The median top level is computed across the simulated players.
- **Raids:** everyone active signs up (casuals with 70% probability) and brings their 3 highest-power creatures. Sign-up order is shuffled each week; `autoPlace` builds the row in that order; `fillWithGuests` fills it to 9 slots with fewer than 3 players. Phase 1 runs on Friday, Phase 2 on Saturday (with the adaptation Phase 1 suggested) and the finale on Sunday; the boss HP pool carries across them. In the finale each player brings their basic ability (round-robin over the four) plus the creature ability of each team creature at level 10 or above; every ability fires at its default round. Bosses rotate in content order by the global week index. Crits are on (5% for +50%, players and boss). The raid sweep fights each boss at the rank the old per-level rule would have chosen for the roster (`placementRank`), which is what the boss HP and the head-count exponents are calibrated at; the long-run servers (below) use the ladder.
- **Boss Rank ladder (long-run servers):** a new server is placed once at its first raid week, a finale win in a normal week adds 1 rank, a loss changes nothing, every 5th week of the global calendar is a Festival (boss 3 ranks lower, +50% Essence, a win grants each participant the season's Festival creature through the duplicate rules) and the rank eases 1 after every Festival. Each long-run server starts at a random point of the 5-week calendar.
- **Rewards:** Essence from `essenceForStage` for every cleared stage, weighted by the stage's contribution and scaled by the server's rank and the Festival bonus (`essenceMultiplierBp`). Jackpots from `rollJackpot` on a finale win. The pity counter advances only on a finale win without a jackpot; a lost finale changes nothing (soft pity from raid 5, hard pity at raid 10).
- **Evolution:** at level 15 (stage 1 level cap) when the player has the Essence from the content; the species switches to its stage 2 form and keeps its fusion count.
- **Team power** = sum over the top 3 creatures of `atk + hp / 10`, using `effectiveStats` (fusion and the worn gear included, like the worker's `power`).
- **Gear drops** follow the worker: the welcome kit when a player joins (a Common item, a Common blueprint and scrap), phase scrap for every participant of a cleared Phase 1 or 2, one gear roll per participant of a won finale at the server's rank (and the Festival piece in a Festival week), and the loot of every claimed expedition (scrap, a shard, a glimmer, a blueprint; a blueprint the player knows is scrap). All rolls use the game's pure functions (`rollFinaleDrop`, `rollFestivalDrop`, `expeditionLoot`, `rollWelcomeKit`, `rollGear`) with a seeded stream of their own.
- **Gear policy**, at every check-in after the claims: claim finished jobs; equip (the 3 strongest creatures by power without gear get the items, best pair first, an item scored by the Attack and HP it adds weighted by the creature's role: payoffs want Attack, guards HP); dismantle every unworn item that no job holds except the 2 best spares; upgrade the worn item that adds the most per Essence, as long as the Essence left covers the cheapest evolution a creature is within 3 levels of; then start jobs in the free workshop slots on creatures that are not exploring (the one with the most Crafting XP first): an enchant of a worn item if glimmer and shards allow, an improve of a worn item's speed or crit secondary (twice per item at most), else a craft of the best blueprint the parts pay for (higher rarity first, Attack or HP items first). Items fold into the fight slots with `applyGear`, caps included. A creature on a job does not explore (one busy state) but still fights.
- **Time** for jobs: check-ins at 09:00 and 20:00 (casuals at 09:00 on their leet days); a job is claimed at the first check-in after `jobDuration` (the crafter's skill included) has passed.
- **Typical group:** a raid week with 5 to 10 signed-up players, on rosters from the end of week 4 or 8.

Default mix: 3 casual, 4 daily, 2 top, 1 newcomer. Other server sizes use the same mix scaled by largest remainder.
