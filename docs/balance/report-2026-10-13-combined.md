_Combined balance pass (2026-10-13): gear and crafting, the single-row daily dungeon and expeditions v2 together, with Crafting XP per hour halved, setup credit at 60% and Guards credited for the damage hits aimed at them. Seed `leet`, full run, from `pnpm sim`._

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

47 passed, 0 failed, 0 not measured.

|     | Target                                                                                                                         | Measured | Requirement    | Metric                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- | ---------------------------------- |
| ✅  | Phase 1 clear rate, typical group (5-10 signed-up players, week 4 or later)                                                    | 99.9%    | >= 95.0%       | `raid.typical.phase1ClearRate`     |
| ✅  | Phase 2 clear rate, typical group                                                                                              | 77.5%    | 70.0% to 85.0% | `raid.typical.phase2ClearRate`     |
| ✅  | Finale win rate, typical group                                                                                                 | 51.8%    | 40.0% to 60.0% | `raid.typical.finaleWinRate`       |
| ✅  | Phase 1 clear rate, 1 player with guests, week 4 or later                                                                      | 100.0%   | >= 80.0%       | `raid.solo.phase1ClearRate`        |
| ✅  | Finale win rate, 15 players (no easier-with-more-people cliff)                                                                 | 41.4%    | 35.0% to 65.0% | `raid.fifteen.finaleWinRate`       |
| ✅  | Spread of finale win rate between bosses, typical group (percentage points)                                                    | 10.6%    | <= 15.0%       | `raid.typical.bossSpread`          |
| ✅  | Bosses a typical group never beats or always beats in the finale (flagged)                                                     | 0        | <= 0           | `raid.typical.extremeBosses`       |
| ✅  | Median top player's share of contribution, groups of 5+ players                                                                | 15.6%    | <= 35.0%       | `fair.topShareMedian`              |
| ✅  | Setup credit share of total contribution (setters matter)                                                                      | 16.0%    | >= 15.0%       | `fair.setupShare`                  |
| ✅  | Reactions per round on average, groups of 5+ players                                                                           | 3.83     | >= 1           | `fair.reactionsPerRound`           |
| ✅  | Newcomer (joined week 4) Essence per week at week 6, relative to a top earner                                                  | 93.7%    | >= 70.0%       | `econ.newcomerEssenceRatioWeek6`   |
| ✅  | Lowest element pick rate in raids                                                                                              | 20.0%    | >= 15.0%       | `choice.elementPickRateMin`        |
| ✅  | Highest element pick rate in raids                                                                                             | 30.0%    | <= 35.0%       | `choice.elementPickRateMax`        |
| ✅  | Highest creature contribution relative to the median creature of its rarity                                                    | 1.33x    | <= 1.60x       | `choice.creatureRatioMax`          |
| ✅  | Lowest creature contribution relative to the median creature of its rarity                                                     | 0.68x    | >= 0.60x       | `choice.creatureRatioMin`          |
| ✅  | Elements picked in under 10% of raid slots (flagged as dead)                                                                   | 0        | <= 0           | `choice.deadElements`              |
| ✅  | Casual player's highest creature level at the end of week 4 (evolution level 15)                                               | 15       | >= 15          | `econ.casualTopLevelWeek4`         |
| ✅  | Daily player owns at least 8 of 12 catchable species by the end of week 6                                                      | 11       | >= 8           | `econ.dailySpeciesWeek6`           |
| ✅  | Top earner vs casual average team power at week 8                                                                              | 1.44x    | <= 1.60x       | `econ.powerRatioTopVsCasualWeek8`  |
| ✅  | Jackpot rate per player per finale win, including pity                                                                         | 12.1%    | 6.0% to 15.0%  | `econ.jackpotRatePerWin`           |
| ✅  | Players reaching hard pity (10 raids without a jackpot) over 20 weeks                                                          | 11.9%    | <= 15.0%       | `econ.hardPityShare20Weeks`        |
| ✅  | Long-run finale win rate per server, Festivals included, small server (5 players, 30 weeks)                                    | 55.7%    | 40.0% to 60.0% | `longrun.small.finaleWinRate`      |
| ✅  | Long-run finale win rate per server, Festivals included, typical server (10 players, 30 weeks)                                 | 55.2%    | 40.0% to 60.0% | `longrun.typical.finaleWinRate`    |
| ✅  | Long-run finale win rate per server, Festivals included, 15-player server (30 weeks)                                           | 55.1%    | 40.0% to 60.0% | `longrun.fifteen.finaleWinRate`    |
| ✅  | Festival finale win rate, lowest of the three server sizes                                                                     | 97.1%    | >= 70.0%       | `longrun.festivalWinRateMin`       |
| ✅  | Median weeks between rank-ups, all long-run servers                                                                            | 2        | 2 to 4         | `longrun.rankUpGapMedian`          |
| ✅  | Share of servers with a loss streak of more than 4 weeks, worst of the three sizes                                             | 0.0%     | <= 10.0%       | `longrun.lossStreakShareMax`       |
| ✅  | Gear's share of a daily player's raid-team power at week 8 (median)                                                            | 12.8%    | 10.0% to 20.0% | `gear.dailyShareWeek8`             |
| ✅  | Days until a daily player's first crafted item arrives (90th percentile; a player who never crafts counts as 99)               | 1.38     | <= 7           | `gear.dailyFirstCraftDaysP90`      |
| ✅  | Essence held by daily players at week 12 minus the same sims without gear (today's value; must not be above it)                | -522.31  | <= 0           | `gear.dailyEssenceWeek12VsToday`   |
| ✅  | Weekly growth of daily players' Essence stockpile from week 8 to 12 minus today's growth (no runaway; negative means it falls) | -35.19   | <= 0           | `gear.dailyEssenceGrowthVsToday`   |
| ✅  | Best Crafting skill level of a daily player 30 days after joining (median)                                                     | 5        | 4 to 6         | `gear.dailyBestSkillDay30`         |
| ✅  | Gear power at week 8 of a player who joined in week 4, relative to the median daily player's                                   | 83.5%    | >= 60.0%       | `gear.newcomerCatchUpWeek8`        |
| ✅  | Daily dungeon: depth 1 is cleared (all rooms) in a player's first 7 days, share of those runs                                  | 82.5%    | >= 80.0%       | `dungeon.firstWeekDepth1ClearRate` |
| ✅  | Daily dungeon: depth a median daily player gains per week, from the end of week 2 to the end of week 8                         | 1.67     | 1 to 2         | `dungeon.dailyDepthGrowthPerWeek`  |
| ✅  | Daily dungeon: Essence as a share of a daily player's whole Essence income (raids, jackpots and dungeon)                       | 3.9%     | <= 40.0%       | `dungeon.dailyEssenceShare`        |
| ✅  | Gear's share of a daily player's raid-team power at week 8 with the dungeon's gear and parts in the game (must not pass 20%)   | 12.8%    | <= 20.0%       | `dungeon.dailyGearShareWeek8`      |
| ✅  | Day a daily player's 2nd expedition slot opens, after joining (median; the first day)                                          | 1        | <= 1           | `exp.dailySlot2Day`                |
| ✅  | Day a daily player's 3rd expedition slot opens (median; about a month, 30 plus or minus 7)                                     | 27.5     | 23 to 37       | `exp.dailySlot3Day`                |
| ✅  | Day a daily player's 4th expedition slot opens (median; about four months)                                                     | 121      | 90 to 150      | `exp.dailySlot4Day`                |
| ✅  | Day a daily player's 5th expedition slot opens (median; about a year; a slot that never opens counts as 999)                   | 370      | 330 to 400     | `exp.dailySlot5Day`                |
| ✅  | Worth per day of the best long strategy (always 12 or 24 hour trips) over the best short one (2 or 6 hours), Bait-free         | 2.58x    | >= 1.20x       | `exp.longVsShortRate`              |
| ✅  | Worth per day of always sending 2 hour trips over the worst of the other three strategies (at most 1: spam is the worst)       | 0.30x    | <= 1.00x       | `exp.spamVsOthersRate`             |
| ✅  | Share of daily players' finished trips that are 12 or 24 hours (long trips are what people send)                               | 99.1%    | >= 50.0%       | `exp.dailyLongShare`               |
| ✅  | Lowest expected worth of a risky push-on goal against coming home, over every length it is offered after                       | 0.96x    | >= 0.90x       | `exp.riskyRatioMin`                |
| ✅  | Highest expected worth of a risky push-on goal against coming home (a fair gamble: within 10%)                                 | 1.00x    | <= 1.10x       | `exp.riskyRatioMax`                |
| ✅  | Most species a casual player owns ahead of today's expeditions at the end of any week 1 to 12 (no faster than today)           | 0.2      | <= 0.3         | `exp.casualSpeciesVsToday`         |

## Bosses

### Tidal Colossus (tide)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 97% / 100% / 100%          | 1.95                | 100.0%           |
| 5       | 200  | 4.4           | 99.5%         | 81.5%         | 58.5%      | 36% / 66% / 95%            | 2.73                | 31.3%            |
| 10      | 200  | 9.1           | 100.0%        | 65.5%         | 40.0%      | 30% / 57% / 93%            | 4.45                | 17.5%            |
| 15      | 200  | 13.6          | 100.0%        | 56.5%         | 31.0%      | 28% / 54% / 92%            | 5.45                | 12.3%            |

Typical group (5-10 signed up, 299 runs): Phase 1 99.7%, Phase 2 69.2%, finale 44.8%.

### Cinder Wyrm (ember)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 74% / 99% / 100%           | 0.55                | 100.0%           |
| 5       | 200  | 4.4           | 100.0%        | 89.0%         | 70.5%      | 33% / 62% / 97%            | 0.75                | 29.8%            |
| 10      | 200  | 9.1           | 100.0%        | 83.0%         | 52.5%      | 31% / 58% / 97%            | 1.71                | 15.4%            |
| 15      | 200  | 13.6          | 100.0%        | 86.0%         | 58.0%      | 31% / 59% / 97%            | 2.59                | 11.0%            |

Typical group (5-10 signed up, 296 runs): Phase 1 100.0%, Phase 2 84.1%, finale 55.4%.

### Thornmother (grove)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 66% / 99% / 100%           | 1.42                | 100.0%           |
| 5       | 200  | 4.4           | 100.0%        | 86.0%         | 65.5%      | 34% / 64% / 97%            | 2.34                | 31.8%            |
| 10      | 200  | 9.1           | 100.0%        | 78.5%         | 49.5%      | 30% / 58% / 96%            | 3.97                | 17.3%            |
| 15      | 200  | 13.5          | 100.0%        | 73.0%         | 45.0%      | 29% / 57% / 95%            | 5.09                | 12.1%            |

Typical group (5-10 signed up, 294 runs): Phase 1 100.0%, Phase 2 78.6%, finale 52.7%.

### Storm Sovereign (spark)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 96% / 100% / 100%          | 1.75                | 100.0%           |
| 5       | 200  | 4.3           | 100.0%        | 90.0%         | 74.5%      | 37% / 70% / 97%            | 2.76                | 30.9%            |
| 10      | 200  | 9.0           | 100.0%        | 74.0%         | 46.5%      | 31% / 59% / 94%            | 4.55                | 17.7%            |
| 15      | 200  | 13.4          | 100.0%        | 51.5%         | 31.5%      | 29% / 54% / 91%            | 5.25                | 13.7%            |

Typical group (5-10 signed up, 291 runs): Phase 1 100.0%, Phase 2 78.4%, finale 54.3%.

## Fairness and contribution

| Archetype  | Average share of contribution (groups of 5+) | Average Essence per raid week |
| ---------- | -------------------------------------------- | ----------------------------- |
| Casual     | 7.8%                                         | 53.3                          |
| Daily      | 11.2%                                        | 69.9                          |
| Top earner | 11.0%                                        | 62.0                          |
| Newcomer   | 7.1%                                         | 49.4                          |

## Archetype progression

Averages over the 24 default-server sims (10 players each).

### Casual

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 72      | 109         | 0                    | 22                   | 78                | 2.2           | 113         | 8.7       | 0.0     | 7.7            | 7.9          | 0.00             | 0.0  |
| 2    | 72      | 109         | 0                    | 34                   | 68                | 4.1           | 179         | 12.1      | 0.0     | 43.4           | 41.9         | 0.03             | 0.5  |
| 3    | 72      | 108         | 1                    | 56                   | 63                | 6.5           | 210         | 14.2      | 0.0     | 51.2           | 66.2         | 0.06             | 1.2  |
| 4    | 72      | 114         | 3                    | 46                   | 84                | 7.8           | 292         | 15.0      | 0.9     | 52.6           | 57.7         | 0.10             | 1.7  |
| 5    | 72      | 114         | 7                    | 46                   | 80                | 8.4           | 330         | 15.0      | 1.0     | 56.1           | 70.2         | 0.15             | 2.3  |
| 6    | 72      | 114         | 11                   | 48                   | 85                | 9.0           | 427         | 15.0      | 1.8     | 48.0           | 55.4         | 0.18             | 2.7  |
| 7    | 72      | 115         | 13                   | 50                   | 82                | 9.5           | 476         | 15.6      | 2.1     | 49.3           | 60.9         | 0.22             | 3.0  |
| 8    | 72      | 114         | 16                   | 58                   | 75                | 9.8           | 521         | 16.9      | 2.3     | 59.5           | 71.6         | 0.25             | 3.5  |
| 9    | 72      | 114         | 17                   | 60                   | 77                | 10.0          | 558         | 18.3      | 2.4     | 54.7           | 73.4         | 0.28             | 3.9  |
| 10   | 72      | 115         | 20                   | 62                   | 82                | 10.0          | 590         | 19.6      | 2.4     | 59.3           | 71.5         | 0.39             | 3.8  |
| 11   | 72      | 115         | 20                   | 56                   | 84                | 10.1          | 624         | 20.9      | 2.4     | 47.4           | 73.0         | 0.49             | 3.7  |
| 12   | 72      | 115         | 21                   | 59                   | 76                | 10.2          | 650         | 22.0      | 2.4     | 40.6           | 81.3         | 0.57             | 3.5  |

### Daily

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 96      | 313         | 7                    | 88                   | 230               | 7.4           | 221         | 14.2      | 0.1     | 17.7           | 13.2         | 0.00             | 0.0  |
| 2    | 96      | 312         | 32                   | 123                  | 246               | 9.6           | 407         | 15.0      | 1.8     | 77.8           | 16.1         | 0.05             | 0.9  |
| 3    | 96      | 314         | 52                   | 151                  | 224               | 10.2          | 511         | 15.7      | 2.3     | 86.5           | 14.8         | 0.14             | 1.7  |
| 4    | 96      | 333         | 74                   | 197                  | 226               | 10.4          | 569         | 17.9      | 2.3     | 83.1           | 18.9         | 0.18             | 2.5  |
| 5    | 96      | 331         | 119                  | 225                  | 242               | 10.7          | 619         | 19.9      | 2.3     | 88.9           | 31.3         | 0.25             | 3.2  |
| 6    | 96      | 332         | 134                  | 222                  | 262               | 10.9          | 665         | 21.9      | 2.3     | 85.9           | 44.1         | 0.35             | 3.6  |
| 7    | 96      | 332         | 148                  | 255                  | 219               | 11.3          | 700         | 23.5      | 2.3     | 76.7           | 62.9         | 0.44             | 3.9  |
| 8    | 96      | 332         | 161                  | 300                  | 201               | 11.7          | 729         | 24.9      | 2.3     | 78.1           | 99.9         | 0.60             | 3.5  |
| 9    | 96      | 331         | 167                  | 319                  | 189               | 11.8          | 755         | 26.0      | 2.3     | 76.0           | 128.4        | 0.76             | 3.3  |
| 10   | 96      | 333         | 180                  | 336                  | 187               | 11.9          | 780         | 27.2      | 2.3     | 76.3           | 167.8        | 0.86             | 3.3  |
| 11   | 96      | 333         | 229                  | 357                  | 214               | 12.0          | 808         | 28.4      | 2.3     | 70.0           | 201.7        | 0.95             | 3.2  |
| 12   | 96      | 332         | 302                  | 362                  | 303               | 12.0          | 835         | 29.8      | 2.3     | 64.2           | 242.0        | 0.97             | 3.5  |

### Top earner

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 48      | 362         | 9                    | 110                  | 270               | 7.2           | 246         | 14.8      | 0.4     | 18.1           | 7.9          | 0.02             | 0.0  |
| 2    | 48      | 361         | 35                   | 132                  | 276               | 9.5           | 434         | 15.0      | 1.9     | 81.0           | 16.8         | 0.04             | 0.9  |
| 3    | 48      | 363         | 58                   | 194                  | 239               | 10.0          | 521         | 16.2      | 2.5     | 81.4           | 16.6         | 0.10             | 1.8  |
| 4    | 48      | 385         | 79                   | 223                  | 261               | 10.3          | 586         | 18.6      | 2.5     | 81.7           | 23.6         | 0.23             | 2.4  |
| 5    | 48      | 383         | 122                  | 238                  | 286               | 10.6          | 642         | 20.9      | 2.5     | 87.7           | 29.8         | 0.33             | 2.9  |
| 6    | 48      | 384         | 136                  | 246                  | 265               | 10.9          | 683         | 22.9      | 2.5     | 85.9           | 52.8         | 0.48             | 3.1  |
| 7    | 48      | 385         | 168                  | 338                  | 233               | 11.3          | 718         | 24.5      | 2.5     | 76.2           | 72.2         | 0.60             | 3.3  |
| 8    | 48      | 384         | 177                  | 346                  | 219               | 11.7          | 748         | 25.9      | 2.5     | 77.6           | 122.4        | 0.79             | 3.0  |
| 9    | 48      | 383         | 180                  | 358                  | 214               | 11.8          | 775         | 27.2      | 2.5     | 76.9           | 165.6        | 0.92             | 2.9  |
| 10   | 48      | 384         | 191                  | 364                  | 217               | 11.9          | 801         | 28.5      | 2.5     | 76.9           | 218.1        | 1.00             | 3.0  |
| 11   | 48      | 384         | 240                  | 369                  | 288               | 12.0          | 824         | 29.8      | 2.5     | 67.4           | 262.8        | 1.10             | 2.8  |
| 12   | 48      | 384         | 323                  | 379                  | 325               | 12.0          | 843         | 30.0      | 2.5     | 64.3           | 286.2        | 1.15             | 2.9  |

### Newcomer

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 4    | 24      | 333         | 9                    | 113                  | 241               | 7.6           | 287         | 15.0      | 0.9     | 71.0           | 13.2         | 0.00             | 0.9  |
| 5    | 24      | 332         | 37                   | 118                  | 265               | 9.4           | 475         | 15.1      | 2.4     | 81.0           | 11.0         | 0.04             | 1.7  |
| 6    | 24      | 331         | 57                   | 177                  | 219               | 10.0          | 547         | 17.4      | 2.4     | 80.5           | 16.8         | 0.04             | 2.6  |
| 7    | 24      | 331         | 77                   | 196                  | 234               | 10.2          | 602         | 19.5      | 2.4     | 72.7           | 24.5         | 0.08             | 3.2  |
| 8    | 24      | 332         | 112                  | 204                  | 253               | 10.7          | 651         | 21.5      | 2.4     | 79.0           | 41.6         | 0.17             | 3.5  |
| 9    | 24      | 330         | 121                  | 236                  | 219               | 11.0          | 687         | 23.0      | 2.4     | 73.8           | 57.1         | 0.25             | 3.8  |
| 10   | 24      | 333         | 168                  | 298                  | 206               | 11.3          | 717         | 24.5      | 2.4     | 74.4           | 89.9         | 0.33             | 4.2  |
| 11   | 24      | 334         | 169                  | 319                  | 196               | 11.6          | 743         | 25.8      | 2.4     | 68.0           | 125.4        | 0.46             | 3.9  |
| 12   | 24      | 332         | 177                  | 329                  | 189               | 11.7          | 767         | 27.0      | 2.4     | 60.3           | 169.8        | 0.54             | 4.0  |

## Gear and crafting

Gear power is the power the worn items add to the top 3 creatures (`applyGear`, floored like the fight slots), and the share is that power over the top-3 power (gear included). The "today" columns are the same sims and seeds played without gear.

### Casual

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 1.6        | 1.4%       | 0.0                   | 0.0            | 1.0                   | 0                     | 8            | 4.4        |
| 2    | 4.5        | 2.5%       | 0.5                   | 1.1            | 1.0                   | 11                    | 42           | 7.7        |
| 3    | 8.4        | 3.9%       | 1.6                   | 2.1            | 1.1                   | 28                    | 66           | 6.5        |
| 4    | 16.2       | 5.5%       | 3.0                   | 3.0            | 1.6                   | 45                    | 58           | 8.0        |
| 5    | 21.9       | 6.5%       | 4.2                   | 4.0            | 2.0                   | 44                    | 70           | 8.9        |
| 6    | 34.4       | 7.9%       | 4.9                   | 5.3            | 2.7                   | 37                    | 55           | 8.0        |
| 7    | 43.7       | 9.1%       | 5.6                   | 6.7            | 3.0                   | 37                    | 61           | 6.8        |
| 8    | 51.8       | 9.8%       | 6.3                   | 8.1            | 3.4                   | 43                    | 72           | 7.6        |
| 9    | 59.1       | 10.5%      | 7.2                   | 9.4            | 3.6                   | 52                    | 73           | 7.8        |
| 10   | 66.9       | 11.3%      | 8.0                   | 10.7           | 3.9                   | 63                    | 72           | 7.4        |
| 11   | 74.3       | 11.9%      | 8.7                   | 12.0           | 4.0                   | 47                    | 73           | 7.0        |
| 12   | 79.6       | 12.2%      | 9.1                   | 13.2           | 4.2                   | 33                    | 81           | 7.0        |

### Daily

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 7.1        | 3.2%       | 0.3                   | 3.1            | 1.8                   | 6                     | 13           | 4.1        |
| 2    | 26.5       | 6.4%       | 1.7                   | 8.0            | 3.4                   | 36                    | 16           | 4.3        |
| 3    | 44.4       | 8.6%       | 4.1                   | 12.5           | 4.2                   | 77                    | 15           | 3.6        |
| 4    | 58.1       | 10.2%      | 6.0                   | 16.5           | 5.0                   | 83                    | 19           | 3.6        |
| 5    | 69.7       | 11.2%      | 7.5                   | 21.6           | 5.6                   | 79                    | 31           | 3.7        |
| 6    | 79.6       | 11.9%      | 8.5                   | 27.2           | 6.0                   | 75                    | 44           | 3.3        |
| 7    | 86.9       | 12.4%      | 9.3                   | 32.4           | 6.3                   | 60                    | 63           | 4.0        |
| 8    | 91.7       | 12.6%      | 9.9                   | 38.2           | 6.6                   | 43                    | 100          | 4.3        |
| 9    | 96.0       | 12.7%      | 10.4                  | 44.1           | 6.9                   | 49                    | 128          | 4.5        |
| 10   | 101.4      | 13.0%      | 10.6                  | 50.3           | 7.1                   | 38                    | 168          | 4.1        |
| 11   | 105.2      | 13.0%      | 11.0                  | 58.4           | 7.5                   | 38                    | 202          | 3.7        |
| 12   | 109.7      | 13.1%      | 11.1                  | 69.0           | 7.9                   | 26                    | 242          | 4.3        |

### Top earner

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 7.9        | 3.2%       | 0.3                   | 3.2            | 1.7                   | 7                     | 8            | 4.1        |
| 2    | 29.6       | 6.8%       | 1.7                   | 8.0            | 3.4                   | 34                    | 17           | 4.1        |
| 3    | 45.8       | 8.8%       | 4.0                   | 12.6           | 4.2                   | 71                    | 17           | 4.8        |
| 4    | 61.7       | 10.5%      | 5.8                   | 17.2           | 5.0                   | 78                    | 24           | 3.3        |
| 5    | 75.2       | 11.7%      | 7.6                   | 22.8           | 5.8                   | 84                    | 30           | 4.2        |
| 6    | 83.5       | 12.2%      | 8.5                   | 28.5           | 6.0                   | 65                    | 53           | 3.5        |
| 7    | 90.2       | 12.5%      | 9.3                   | 34.2           | 6.3                   | 59                    | 72           | 4.5        |
| 8    | 94.1       | 12.6%      | 9.7                   | 40.1           | 6.7                   | 29                    | 122          | 3.9        |
| 9    | 99.5       | 12.8%      | 10.0                  | 46.5           | 7.0                   | 36                    | 166          | 3.7        |
| 10   | 102.8      | 12.8%      | 10.3                  | 53.0           | 7.1                   | 26                    | 218          | 3.9        |
| 11   | 105.8      | 12.8%      | 10.5                  | 61.9           | 7.7                   | 24                    | 263          | 4.0        |
| 12   | 110.3      | 13.1%      | 10.2                  | 71.8           | 8.0                   | 42                    | 286          | 4.4        |

### Newcomer

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 4    | 14.8       | 5.1%       | 1.9                   | 3.9            | 1.9                   | 44                    | 13           | 3.1        |
| 5    | 37.0       | 7.8%       | 3.2                   | 8.6            | 3.6                   | 43                    | 11           | 4.1        |
| 6    | 56.7       | 10.3%      | 5.3                   | 13.2           | 4.3                   | 78                    | 17           | 4.5        |
| 7    | 68.8       | 11.4%      | 6.7                   | 17.5           | 5.0                   | 69                    | 24           | 3.7        |
| 8    | 79.6       | 12.2%      | 7.8                   | 23.0           | 5.8                   | 64                    | 42           | 4.0        |
| 9    | 86.9       | 12.6%      | 8.8                   | 28.4           | 6.0                   | 60                    | 57           | 4.1        |
| 10   | 92.4       | 12.9%      | 9.3                   | 33.9           | 6.3                   | 43                    | 90           | 3.4        |
| 11   | 95.5       | 12.8%      | 9.8                   | 40.0           | 6.8                   | 34                    | 125          | 4.6        |
| 12   | 100.5      | 13.1%      | 10.0                  | 46.5           | 7.0                   | 18                    | 170          | 5.3        |

### Daily players with gear and without (today)

| Week | Essence held | Essence held today | Top-3 power | Top-3 power today |
| ---- | ------------ | ------------------ | ----------- | ----------------- |
| 1    | 13           | 16                 | 221         | 202               |
| 2    | 16           | 60                 | 407         | 320               |
| 3    | 15           | 102                | 511         | 445               |
| 4    | 19           | 182                | 569         | 496               |
| 5    | 31           | 262                | 619         | 535               |
| 6    | 44           | 336                | 665         | 570               |
| 7    | 63           | 414                | 700         | 593               |
| 8    | 100          | 481                | 729         | 611               |
| 9    | 128          | 548                | 755         | 625               |
| 10   | 168          | 619                | 780         | 638               |
| 11   | 202          | 697                | 808         | 653               |
| 12   | 242          | 764                | 835         | 671               |

### What the team wears (end of week 8)

| Archetype  | Common | Rare | Epic | Festival | Average level | Enchanted | Power added per item | Bag | Blueprints | Scrap | Shards | Glimmer |
| ---------- | ------ | ---- | ---- | -------- | ------------- | --------- | -------------------- | --- | ---------- | ----- | ------ | ------- |
| Casual     | 63%    | 17%  | 5%   | 14%      | 2.1           | 49%       | 17.3                 | 2.8 | 2.0        | 8     | 8      | 0.4     |
| Daily      | 64%    | 21%  | 3%   | 11%      | 3.3           | 97%       | 30.6                 | 2.0 | 5.8        | 4     | 28     | 2.9     |
| Top earner | 63%    | 22%  | 5%   | 10%      | 3.2           | 100%      | 31.4                 | 2.0 | 5.7        | 4     | 29     | 3.2     |
| Newcomer   | 68%    | 15%  | 8%   | 8%       | 2.6           | 90%       | 26.5                 | 2.0 | 4.4        | 4     | 16     | 1.7     |

## Daily dungeon

Every player with 3 creatures runs the dungeon once on each day they check in (casuals on their leet days), with their 3 strongest creatures. Depth 1 to 24 are listed; a run is cleared when all 3 rooms are.

### Clear rate by depth

| Depth | Casual    | Daily     | Top earner |
| ----- | --------- | --------- | ---------- |
| 1     | 89% (81)  | 74% (129) | 96% (50)   |
| 2     | 91% (79)  | 81% (119) | 86% (56)   |
| 3     | 81% (89)  | 79% (121) | 77% (62)   |
| 4     | 73% (98)  | 62% (154) | 80% (60)   |
| 5     | 79% (91)  | 63% (152) | 70% (69)   |
| 6     | 79% (91)  | 62% (154) | 70% (69)   |
| 7     | 86% (84)  | 54% (178) | 56% (86)   |
| 8     | 76% (95)  | 65% (148) | 51% (94)   |
| 9     | 77% (94)  | 58% (166) | 60% (80)   |
| 10    | 80% (90)  | 67% (143) | 75% (64)   |
| 11    | 62% (116) | 52% (184) | 53% (90)   |
| 12    | 65% (110) | 49% (196) | 42% (115)  |
| 13    | 53% (125) | 36% (269) | 34% (141)  |
| 14    | 54% (112) | 25% (390) | 23% (205)  |
| 15    | 49% (98)  | 18% (520) | 20% (240)  |
| 16    | 32% (87)  | 14% (683) | 16% (299)  |
| 17    | 32% (37)  | 11% (800) | 13% (361)  |
| 18    | 25% (8)   | 11% (775) | 11% (390)  |
| 19    | 100% (2)  | 9% (816)  | 9% (398)   |
| 20    | 0% (2)    | 8% (666)  | 8% (362)   |
| 21    | -         | 6% (623)  | 8% (280)   |
| 22    | -         | 7% (328)  | 5% (240)   |
| 23    | -         | 6% (156)  | 6% (106)   |
| 24    | -         | 4% (73)   | 0% (53)    |

Runs in brackets. Players stop at the depth where they win about a fifth of their runs.

### Depth after N weeks (median, quartiles)

| Week | Casual        | Daily         | Top earner    | Newcomer      |
| ---- | ------------- | ------------- | ------------- | ------------- |
| 1    | 1 (1 to 1)    | 5 (5 to 6)    | 6 (5 to 6)    | -             |
| 2    | 3 (3 to 3)    | 9 (9 to 10)   | 10 (9 to 10)  | -             |
| 4    | 6 (5 to 7)    | 15 (14 to 16) | 15 (14 to 17) | 6 (5 to 6)    |
| 6    | 9 (9 to 10)   | 17 (16 to 18) | 18 (16 to 19) | 14 (13 to 15) |
| 8    | 12 (11 to 13) | 19 (17 to 20) | 19 (17 to 20) | 17 (16 to 19) |
| 10   | 14 (13 to 15) | 20 (19 to 21) | 20 (19 to 22) | 19 (18 to 20) |
| 12   | 16 (15 to 17) | 21 (19 to 22) | 21 (19 to 22) | 20 (19 to 22) |

### Reward flow per player and week

| Archetype  | Runs | Cleared | Bait | Essence | Scrap | Gear items |
| ---------- | ---- | ------- | ---- | ------- | ----- | ---------- |
| Casual     | 1.84 | 1.25    | 4.8  | 1.56    | 1.6   | 0.33       |
| Daily      | 6.91 | 1.65    | 13.7 | 2.96    | 4.0   | 0.43       |
| Top earner | 6.89 | 1.66    | 13.4 | 2.99    | 4.0   | 0.39       |
| Newcomer   | 6.88 | 2.13    | 14.2 | 3.53    | 4.5   | 0.53       |

Dungeon Essence is 3.9% of a daily player's Essence income. Gear's share of a daily player's raid-team power at week 8 is 12.8% with the dungeon and 12.2% without it (the same sims and seeds).

## Elements

| Element | Raid slots | Pick rate |
| ------- | ---------- | --------- |
| tide    | 15960      | 23.8%     |
| ember   | 17625      | 26.3%     |
| grove   | 13400      | 20.0%     |
| spark   | 20155      | 30.0%     |

## Creatures

| Creature               | Rarity | Element | Role    | Picks | Pick rate | Average level | Average contribution | Relative to rarity median |
| ---------------------- | ------ | ------- | ------- | ----- | --------- | ------------- | -------------------- | ------------------------- |
| Ashmole                | common | ember   | support | 276   | 0.4%      | 17.5          | 5468                 | 0.90x                     |
| Aurorix                | epic   | spark   | support | 146   | 0.2%      | 17.9          | 6631                 | 0.94x                     |
| Cindle                 | common | ember   | payoff  | 14240 | 21.2%     | 19.8          | 7064                 | 1.16x                     |
| Coralynx               | rare   | tide    | payoff  | 6587  | 9.8%      | 13.9          | 6058                 | 0.87x                     |
| Gaiadrake              | epic   | grove   | payoff  | 3892  | 5.8%      | 20.5          | 9137                 | 1.29x                     |
| Hearthshell (Festival) | epic   | ember   | guard   | 317   | 0.5%      | 11.5          | 3543                 | 0.50x                     |
| Lanternfin (Festival)  | epic   | tide    | support | 1035  | 1.5%      | 14.2          | 4710                 | 0.67x                     |
| Mistnewt               | common | tide    | guard   | 834   | 1.2%      | 19.4          | 5283                 | 0.87x                     |
| Mossback               | rare   | grove   | setter  | 2933  | 4.4%      | 19.3          | 6989                 | 1.00x                     |
| Solmane                | epic   | ember   | setter  | 2792  | 4.2%      | 18.4          | 7070                 | 1.00x                     |
| Splashet               | common | tide    | setter  | 7504  | 11.2%     | 19.5          | 6722                 | 1.10x                     |
| Sproutle               | common | grove   | guard   | 6575  | 9.8%      | 19.7          | 4157                 | 0.68x                     |
| Stormray               | rare   | spark   | payoff  | 19290 | 28.7%     | 19.7          | 9293                 | 1.33x                     |
| Zipmouse               | common | spark   | setter  | 719   | 1.1%      | 18.4          | 6779                 | 1.11x                     |

## Essence and jackpots

| Players | Player-weeks | Mean Essence | P10 | Median | P90 | Max |
| ------- | ------------ | ------------ | --- | ------ | --- | --- |
| 1       | 800          | 83.0         | 80  | 80     | 86  | 86  |
| 5       | 3501         | 65.7         | 17  | 79     | 91  | 131 |
| 10      | 7257         | 54.8         | 16  | 46     | 92  | 121 |
| 15      | 10822        | 50.6         | 15  | 43     | 90  | 125 |

| Source                           | Finale-win rolls | Jackpots | Rate  | Guaranteed by hard pity |
| -------------------------------- | ---------------- | -------- | ----- | ----------------------- |
| sweep, 1 players                 | 800              | 158      | 19.8% | 0                       |
| sweep, 5 players                 | 2318             | 294      | 12.7% | 0                       |
| sweep, 10 players                | 3348             | 376      | 11.2% | 0                       |
| sweep, 15 players                | 4450             | 522      | 11.7% | 0                       |
| economy sims, 20 raid weeks each | 4332             | 525      | 12.1% | 39                      |

## Ability damage share (informational)

What abilities add to the damage dealt in the finale, measured by replaying each finale three times against a boss that cannot fall (every ability, only the basic ones, none) so all 12 rounds are played. Creature share = (all - basic only) / all; basic share = (basic only - none) / all. Creature abilities need creature level 10. Informational: the aim is a creature share of about 10-25% for a week-8 roster, not a target.

| Roster week | Group                        | Raids | Creature abilities per raid | Creature share | Basic share |
| ----------- | ---------------------------- | ----- | --------------------------- | -------------- | ----------- |
| 4           | typical group (5-10 players) | 582   | 19.1                        | 18.2%          | 3.2%        |
| 4           | 15 players                   | 400   | 35.3                        | 20.4%          | 3.7%        |
| 4           | 1 player with guests         | 400   | 3.0                         | 15.8%          | 0.7%        |
| 8           | typical group (5-10 players) | 598   | 23.1                        | 20.3%          | 3.2%        |
| 8           | 15 players                   | 400   | 40.5                        | 22.3%          | 3.5%        |
| 8           | 1 player with guests         | 400   | 3.0                         | 17.2%          | 0.7%        |

## Long-running servers (ladder, Festivals, seasons)

40 servers per size, 30 weeks each (6 seasons of 4 normal weeks and a Festival), with the Boss Rank ladder: placement at the first raid week, a normal finale win +1 rank, a loss keeps the rank, a Festival boss fights 3 ranks lower and the rank eases 1 after it. Every server starts at a random point of the 5-week calendar. A rank-up is a week that raised the rank.

| Server                      | Servers | Finale win rate (mean per server) | Per server p10 to p90 | Normal weeks | Festival weeks | Weeks 1-10 | Weeks 11+ | Median weeks between rank-ups (p10 to p90) | Servers with a loss streak over 4 | Median longest loss streak |
| --------------------------- | ------- | --------------------------------- | --------------------- | ------------ | -------------- | ---------- | --------- | ------------------------------------------ | --------------------------------- | -------------------------- |
| Small server (5 players)    | 40      | 55.7%                             | 53% to 60%            | 45.2%        | 97.5%          | 76.5%      | 45.3%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |
| Typical server (10 players) | 40      | 55.2%                             | 50% to 57%            | 44.7%        | 97.1%          | 74.5%      | 45.5%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |
| 15-player server            | 40      | 55.1%                             | 53% to 57%            | 44.5%        | 97.5%          | 73.0%      | 46.1%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |

Median server rank at the start of each week (the Festival boss fights at an eased rank):

| Server                      | Placement | Week 1 | Week 5 | Week 10 | Week 15 | Week 20 | Week 25 | Week 30 | Rank after the last week (p10 to p90) |
| --------------------------- | --------- | ------ | ------ | ------- | ------- | ------- | ------- | ------- | ------------------------------------- |
| Small server (5 players)    | 2.0       | 2.0    | 3.0    | 6.0     | 6.0     | 7.0     | 7.0     | 7.0     | 7.0 (6 to 8)                          |
| Typical server (10 players) | 2.0       | 2.0    | 3.0    | 5.0     | 6.0     | 6.0     | 7.0     | 7.0     | 7.0 (6 to 8)                          |
| 15-player server            | 2.0       | 2.0    | 3.0    | 5.0     | 6.0     | 7.0     | 7.0     | 7.0     | 7.0 (6 to 7)                          |

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
2. Round 1: Tidal Colossus has 100856 HP.
3. Magmole (Daily 3) powers up Thornbuck (Top earner 2) (+15% damage on its next hit).
4. Magmole (Daily 3) powers up Solmane (Daily 1) (+15% damage on its next hit).
5. Thornbuck (Casual 3) acts.
6. Thornbuck (Casual 3) hits Tidal Colossus for 69; 100787 HP left.
7. Thornbuck (Casual 3) leaves Tidal Colossus Overgrown.
8. Thornbuck (Newcomer 1) acts.
9. Thornbuck (Newcomer 1) hits Tidal Colossus for 69; 100718 HP left.
10. Thornbuck (Daily 3) acts.
11. Thornbuck (Daily 3) hits Tidal Colossus for 79; 100639 HP left.
12. Thornbuck (Top earner 2) acts.
13. Thornbuck (Top earner 2) hits Tidal Colossus for 89; 100550 HP left.
14. Magmole (Daily 3) acts.
15. Magmole (Daily 3) hits Tidal Colossus for 306 (weak matchup); 100244 HP left.
16. Wildfire! Magmole (Daily 3) cashes in the mark set by Thornbuck (Casual 3) for 238 bonus damage.
17. Solmane (Daily 1) acts.
18. Solmane (Daily 1) hits Tidal Colossus for 91 (weak matchup); 100153 HP left.
19. Solmane (Daily 1) leaves Tidal Colossus Scorched.
20. Tidewing (Daily 1) acts.
21. Tidewing (Daily 1) hits Tidal Colossus for 319; 99834 HP left.
22. Steam! Tidewing (Daily 1) cashes in the mark set by Solmane (Daily 1) for 203 bonus damage.
23. Solmane (Top earner 1) acts.
24. Solmane (Top earner 1) hits Tidal Colossus for 81 (weak matchup); 99753 HP left.
25. Solmane (Top earner 1) leaves Tidal Colossus Scorched.
26. Tidewing (Daily 4) acts.
27. Tidewing (Daily 4) hits Tidal Colossus for 319; 99434 HP left.
28. Steam! Tidewing (Daily 4) cashes in the mark set by Solmane (Top earner 1) for 203 bonus damage.
29. Solmane (Daily 2) acts.
30. Solmane (Daily 2) hits Tidal Colossus for 81 (weak matchup); 99353 HP left.

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
- **Daily dungeon** (`docs/design/daily-dungeon.md`): every player with at least 3 creatures runs it once on each day they check in (casuals on their leet days); on the first day they ever ran, a lost run may be tried once more. The team is the 3 strongest creatures by power (gear included), stood in one row by the game's rule for it (`dungeonRowOrder`: setters and supports left, a Guard in the middle, payoffs right); the basic ability is Rally and every unlocked creature ability fires at its default round. The day's three room modifiers are shared by the whole server and come from a seed of the day, the foes from the run's seed, and a full clear moves the depth up by 1. Rewards follow the worker: Bait, Essence and scrap for each cleared room, a shard from the boss room, a gear chance on a full clear (certain at a landmark depth), and the streak bonus on the first run of a day, through `dungeonPayout`, `rollDungeonLoot` and `streakBonus`.
- **Time** for jobs: check-ins at 09:00 and 20:00 (casuals at 09:00 on their leet days); a job is claimed at the first check-in after `jobDuration` (the crafter's skill included) has passed.
- **Typical group:** a raid week with 5 to 10 signed-up players, on rosters from the end of week 4 or 8.

Default mix: 3 casual, 4 daily, 2 top, 1 newcomer. Other server sizes use the same mix scaled by largest remainder.
