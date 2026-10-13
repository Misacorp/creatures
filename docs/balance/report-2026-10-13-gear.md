_Gear and crafting in the simulator (balance pass 5, 2026-10-13): the sim plays drops, equipping, upgrades, dismantling and workshop jobs with the game's pure functions, `RULES.gear` was tuned against six new targets and the boss HP was recalibrated for the extra power. Seed `leet`, 12 weeks per economy sim, 200 raid weeks per cell, 24 economy sims per player count, 40 twenty-week pity sims and 40 thirty-week long-run sims per server size (`pnpm sim`). Before and after numbers are in `docs/design/decisions.md` ("Gear numbers set by simulation"); the run before gear (27 targets) is `report-2026-10-11-progression.md`. Targets are in `packages/sim/targets.json` (33 now)._

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

33 passed, 0 failed, 0 not measured.

|     | Target                                                                                                                         | Measured | Requirement    | Metric                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- | --------------------------------- |
| ✅  | Phase 1 clear rate, typical group (5-10 signed-up players, week 4 or later)                                                    | 99.7%    | >= 95.0%       | `raid.typical.phase1ClearRate`    |
| ✅  | Phase 2 clear rate, typical group                                                                                              | 70.0%    | 70.0% to 85.0% | `raid.typical.phase2ClearRate`    |
| ✅  | Finale win rate, typical group                                                                                                 | 49.2%    | 40.0% to 60.0% | `raid.typical.finaleWinRate`      |
| ✅  | Phase 1 clear rate, 1 player with guests, week 4 or later                                                                      | 100.0%   | >= 80.0%       | `raid.solo.phase1ClearRate`       |
| ✅  | Finale win rate, 15 players (no easier-with-more-people cliff)                                                                 | 51.0%    | 35.0% to 65.0% | `raid.fifteen.finaleWinRate`      |
| ✅  | Spread of finale win rate between bosses, typical group (percentage points)                                                    | 5.5%     | <= 15.0%       | `raid.typical.bossSpread`         |
| ✅  | Bosses a typical group never beats or always beats in the finale (flagged)                                                     | 0        | <= 0           | `raid.typical.extremeBosses`      |
| ✅  | Median top player's share of contribution, groups of 5+ players                                                                | 16.4%    | <= 35.0%       | `fair.topShareMedian`             |
| ✅  | Setup credit share of total contribution (setters matter)                                                                      | 15.2%    | >= 15.0%       | `fair.setupShare`                 |
| ✅  | Reactions per round on average, groups of 5+ players                                                                           | 4.13     | >= 1           | `fair.reactionsPerRound`          |
| ✅  | Newcomer (joined week 4) Essence per week at week 6, relative to a top earner                                                  | 92.5%    | >= 70.0%       | `econ.newcomerEssenceRatioWeek6`  |
| ✅  | Lowest element pick rate in raids                                                                                              | 20.9%    | >= 15.0%       | `choice.elementPickRateMin`       |
| ✅  | Highest element pick rate in raids                                                                                             | 29.2%    | <= 35.0%       | `choice.elementPickRateMax`       |
| ✅  | Highest creature contribution relative to the median creature of its rarity                                                    | 1.53x    | <= 1.60x       | `choice.creatureRatioMax`         |
| ✅  | Lowest creature contribution relative to the median creature of its rarity                                                     | 0.61x    | >= 0.60x       | `choice.creatureRatioMin`         |
| ✅  | Elements picked in under 10% of raid slots (flagged as dead)                                                                   | 0        | <= 0           | `choice.deadElements`             |
| ✅  | Casual player's highest creature level at the end of week 4 (evolution level 15)                                               | 15       | >= 15          | `econ.casualTopLevelWeek4`        |
| ✅  | Daily player owns at least 8 of 12 catchable species by the end of week 6                                                      | 11       | >= 8           | `econ.dailySpeciesWeek6`          |
| ✅  | Top earner vs casual average team power at week 8                                                                              | 1.54x    | <= 1.60x       | `econ.powerRatioTopVsCasualWeek8` |
| ✅  | Jackpot rate per player per finale win, including pity                                                                         | 12.4%    | 6.0% to 15.0%  | `econ.jackpotRatePerWin`          |
| ✅  | Players reaching hard pity (10 raids without a jackpot) over 20 weeks                                                          | 13.3%    | <= 15.0%       | `econ.hardPityShare20Weeks`       |
| ✅  | Long-run finale win rate per server, Festivals included, small server (5 players, 30 weeks)                                    | 54.3%    | 40.0% to 60.0% | `longrun.small.finaleWinRate`     |
| ✅  | Long-run finale win rate per server, Festivals included, typical server (10 players, 30 weeks)                                 | 54.4%    | 40.0% to 60.0% | `longrun.typical.finaleWinRate`   |
| ✅  | Long-run finale win rate per server, Festivals included, 15-player server (30 weeks)                                           | 54.7%    | 40.0% to 60.0% | `longrun.fifteen.finaleWinRate`   |
| ✅  | Festival finale win rate, lowest of the three server sizes                                                                     | 96.7%    | >= 70.0%       | `longrun.festivalWinRateMin`      |
| ✅  | Median weeks between rank-ups, all long-run servers                                                                            | 2        | 2 to 4         | `longrun.rankUpGapMedian`         |
| ✅  | Share of servers with a loss streak of more than 4 weeks, worst of the three sizes                                             | 0.0%     | <= 10.0%       | `longrun.lossStreakShareMax`      |
| ✅  | Gear's share of a daily player's raid-team power at week 8 (median)                                                            | 12.0%    | 10.0% to 20.0% | `gear.dailyShareWeek8`            |
| ✅  | Days until a daily player's first crafted item arrives (90th percentile; a player who never crafts counts as 99)               | 1.38     | <= 7           | `gear.dailyFirstCraftDaysP90`     |
| ✅  | Essence held by daily players at week 12 minus the same sims without gear (today's value; must not be above it)                | -619.39  | <= 0           | `gear.dailyEssenceWeek12VsToday`  |
| ✅  | Weekly growth of daily players' Essence stockpile from week 8 to 12 minus today's growth (no runaway; negative means it falls) | -45.8    | <= 0           | `gear.dailyEssenceGrowthVsToday`  |
| ✅  | Best Crafting skill level of a daily player 30 days after joining (median)                                                     | 5        | 4 to 6         | `gear.dailyBestSkillDay30`        |
| ✅  | Gear power at week 8 of a player who joined in week 4, relative to the median daily player's                                   | 64.1%    | >= 60.0%       | `gear.newcomerCatchUpWeek8`       |

## Bosses

### Tidal Colossus (tide)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 80% / 99% / 100%           | 1.36                | 100.0%           |
| 5       | 200  | 4.4           | 96.5%         | 69.0%         | 56.0%      | 35% / 63% / 92%            | 2.62                | 32.7%            |
| 10      | 200  | 9.1           | 100.0%        | 58.5%         | 39.5%      | 29% / 56% / 91%            | 4.29                | 18.6%            |
| 15      | 200  | 13.6          | 100.0%        | 77.0%         | 53.5%      | 31% / 58% / 96%            | 6.47                | 13.6%            |

Typical group (5-10 signed up, 299 runs): Phase 1 99.0%, Phase 2 62.5%, finale 46.5%.

### Cinder Wyrm (ember)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 80% / 100% / 100%          | 0.42                | 100.0%           |
| 5       | 200  | 4.4           | 100.0%        | 76.5%         | 48.0%      | 32% / 60% / 94%            | 0.81                | 30.3%            |
| 10      | 200  | 9.1           | 100.0%        | 79.5%         | 46.5%      | 31% / 58% / 96%            | 1.64                | 16.2%            |
| 15      | 200  | 13.6          | 100.0%        | 72.0%         | 45.0%      | 30% / 56% / 95%            | 2.72                | 11.4%            |

Typical group (5-10 signed up, 296 runs): Phase 1 100.0%, Phase 2 79.1%, finale 52.0%.

### Thornmother (grove)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 55% / 91% / 100%           | 1.18                | 100.0%           |
| 5       | 200  | 4.4           | 100.0%        | 69.0%         | 52.0%      | 32% / 61% / 93%            | 2.32                | 31.8%            |
| 10      | 200  | 9.1           | 100.0%        | 70.0%         | 45.0%      | 30% / 58% / 94%            | 4.22                | 17.6%            |
| 15      | 200  | 13.5          | 100.0%        | 76.5%         | 47.5%      | 30% / 57% / 95%            | 6.00                | 12.8%            |

Typical group (5-10 signed up, 294 runs): Phase 1 100.0%, Phase 2 70.7%, finale 51.0%.

### Storm Sovereign (spark)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 80% / 100% / 100%          | 1.32                | 100.0%           |
| 5       | 200  | 4.3           | 99.5%         | 75.5%         | 56.5%      | 34% / 64% / 94%            | 2.39                | 32.1%            |
| 10      | 200  | 9.0           | 100.0%        | 65.0%         | 40.0%      | 30% / 57% / 92%            | 4.24                | 18.4%            |
| 15      | 200  | 13.4          | 100.0%        | 77.0%         | 58.0%      | 31% / 59% / 95%            | 6.62                | 13.6%            |

Typical group (5-10 signed up, 291 runs): Phase 1 100.0%, Phase 2 67.7%, finale 47.1%.

## Fairness and contribution

| Archetype  | Average share of contribution (groups of 5+) | Average Essence per raid week |
| ---------- | -------------------------------------------- | ----------------------------- |
| Casual     | 7.6%                                         | 53.2                          |
| Daily      | 11.1%                                        | 69.9                          |
| Top earner | 11.3%                                        | 62.8                          |
| Newcomer   | 6.9%                                         | 50.4                          |

## Archetype progression

Averages over the 24 default-server sims (10 players each).

### Casual

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 72      | 109         | 0                    | 45                   | 58                | 2.7           | 132         | 7.2       | 0.0     | 5.3            | 5.3          | 0.00             | 0.0  |
| 2    | 72      | 109         | 0                    | 34                   | 68                | 4.8           | 180         | 11.3      | 0.0     | 37.0           | 35.4         | 0.00             | 0.4  |
| 3    | 72      | 108         | 0                    | 48                   | 61                | 6.5           | 207         | 13.5      | 0.0     | 49.0           | 61.4         | 0.03             | 1.0  |
| 4    | 72      | 114         | 0                    | 46                   | 73                | 7.9           | 258         | 14.9      | 0.4     | 50.7           | 62.2         | 0.06             | 1.5  |
| 5    | 72      | 114         | 0                    | 39                   | 72                | 8.6           | 312         | 15.0      | 1.0     | 55.5           | 69.2         | 0.13             | 2.0  |
| 6    | 72      | 114         | 1                    | 47                   | 72                | 9.1           | 362         | 15.0      | 1.3     | 48.6           | 67.3         | 0.15             | 2.5  |
| 7    | 72      | 115         | 2                    | 43                   | 73                | 9.5           | 435         | 15.1      | 1.8     | 52.2           | 65.2         | 0.19             | 2.9  |
| 8    | 72      | 114         | 3                    | 45                   | 71                | 9.7           | 477         | 15.8      | 2.1     | 56.3           | 65.3         | 0.21             | 3.4  |
| 9    | 72      | 114         | 5                    | 51                   | 68                | 9.8           | 513         | 17.0      | 2.2     | 55.7           | 73.9         | 0.25             | 3.8  |
| 10   | 72      | 115         | 11                   | 59                   | 66                | 10.0          | 542         | 18.2      | 2.2     | 58.2           | 70.5         | 0.39             | 3.6  |
| 11   | 72      | 115         | 15                   | 61                   | 68                | 10.2          | 572         | 19.3      | 2.2     | 47.5           | 67.5         | 0.42             | 3.8  |
| 12   | 72      | 115         | 21                   | 67                   | 68                | 10.4          | 599         | 20.4      | 2.2     | 44.0           | 74.5         | 0.47             | 3.9  |

### Daily

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 96      | 313         | 0                    | 116                  | 187               | 6.9           | 205         | 12.6      | 0.0     | 11.4           | 7.4          | 0.00             | 0.0  |
| 2    | 96      | 312         | 0                    | 95                   | 217               | 9.0           | 317         | 15.0      | 1.0     | 69.8           | 32.1         | 0.04             | 0.7  |
| 3    | 96      | 314         | 6                    | 92                   | 224               | 9.7           | 452         | 15.1      | 2.2     | 81.6           | 18.7         | 0.14             | 1.5  |
| 4    | 96      | 333         | 24                   | 159                  | 196               | 10.2          | 523         | 16.8      | 2.5     | 79.8           | 17.1         | 0.16             | 2.2  |
| 5    | 96      | 331         | 57                   | 170                  | 214               | 10.6          | 581         | 18.8      | 2.5     | 88.4           | 24.6         | 0.22             | 2.9  |
| 6    | 96      | 332         | 103                  | 198                  | 234               | 10.9          | 629         | 20.6      | 2.5     | 87.1           | 28.4         | 0.27             | 3.7  |
| 7    | 96      | 332         | 151                  | 237                  | 245               | 11.3          | 674         | 22.5      | 2.5     | 78.7           | 39.2         | 0.42             | 3.8  |
| 8    | 96      | 332         | 190                  | 265                  | 252               | 11.6          | 713         | 24.2      | 2.5     | 74.7           | 50.3         | 0.51             | 3.9  |
| 9    | 96      | 331         | 214                  | 304                  | 235               | 11.8          | 747         | 25.8      | 2.5     | 80.3           | 74.3         | 0.71             | 3.4  |
| 10   | 96      | 333         | 260                  | 354                  | 233               | 11.9          | 779         | 27.2      | 2.5     | 78.1           | 88.9         | 0.80             | 3.4  |
| 11   | 96      | 333         | 296                  | 406                  | 215               | 11.9          | 807         | 28.4      | 2.5     | 69.2           | 115.8        | 0.90             | 3.4  |
| 12   | 96      | 332         | 309                  | 403                  | 263               | 12.0          | 830         | 29.6      | 2.5     | 71.3           | 157.7        | 0.97             | 3.5  |

### Top earner

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 48      | 362         | 0                    | 125                  | 230               | 7.3           | 216         | 14.0      | 0.1     | 11.6           | 7.3          | 0.00             | 0.0  |
| 2    | 48      | 361         | 2                    | 103                  | 259               | 9.2           | 352         | 15.0      | 1.5     | 68.5           | 19.7         | 0.00             | 0.7  |
| 3    | 48      | 363         | 11                   | 122                  | 245               | 9.9           | 478         | 15.6      | 2.6     | 78.6           | 14.1         | 0.10             | 1.5  |
| 4    | 48      | 385         | 40                   | 189                  | 233               | 10.3          | 544         | 17.8      | 2.6     | 79.6           | 19.2         | 0.25             | 1.9  |
| 5    | 48      | 383         | 96                   | 208                  | 271               | 10.8          | 601         | 20.1      | 2.6     | 89.7           | 23.8         | 0.38             | 2.4  |
| 6    | 48      | 384         | 140                  | 240                  | 279               | 11.3          | 650         | 22.2      | 2.6     | 85.7           | 33.7         | 0.44             | 3.1  |
| 7    | 48      | 385         | 213                  | 305                  | 287               | 11.6          | 695         | 24.3      | 2.6     | 79.2           | 41.7         | 0.63             | 3.0  |
| 8    | 48      | 384         | 239                  | 337                  | 281               | 11.7          | 735         | 26.1      | 2.6     | 74.6           | 60.1         | 0.79             | 2.8  |
| 9    | 48      | 383         | 274                  | 390                  | 257               | 11.9          | 768         | 27.6      | 2.6     | 77.7           | 92.7         | 0.88             | 3.0  |
| 10   | 48      | 384         | 346                  | 466                  | 272               | 11.9          | 801         | 29.1      | 2.6     | 77.4           | 116.8        | 0.96             | 3.1  |
| 11   | 48      | 384         | 253                  | 331                  | 318               | 12.0          | 818         | 29.9      | 2.7     | 68.4           | 163.6        | 1.06             | 3.2  |
| 12   | 48      | 384         | 250                  | 345                  | 275               | 12.0          | 840         | 30.0      | 2.7     | 71.1           | 177.4        | 1.13             | 3.4  |

### Newcomer

| Week | Players | Bait earned | Bait from duplicates | Spent on expeditions | Spent on training | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | -------------------- | -------------------- | ----------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 4    | 24      | 333         | 0                    | 108                  | 219               | 6.9           | 254         | 14.8      | 0.8     | 68.0           | 19.0         | 0.00             | 0.8  |
| 5    | 24      | 332         | 2                    | 120                  | 215               | 9.2           | 403         | 15.0      | 1.9     | 80.6           | 18.5         | 0.04             | 1.7  |
| 6    | 24      | 331         | 11                   | 135                  | 201               | 10.0          | 490         | 16.2      | 2.3     | 79.3           | 15.8         | 0.13             | 2.3  |
| 7    | 24      | 331         | 36                   | 164                  | 202               | 10.6          | 544         | 18.2      | 2.3     | 76.2           | 16.5         | 0.13             | 3.1  |
| 8    | 24      | 332         | 66                   | 163                  | 235               | 10.9          | 593         | 20.2      | 2.3     | 73.8           | 28.0         | 0.17             | 3.7  |
| 9    | 24      | 330         | 122                  | 210                  | 237               | 11.3          | 635         | 22.0      | 2.3     | 75.5           | 28.3         | 0.29             | 3.7  |
| 10   | 24      | 333         | 159                  | 245                  | 248               | 11.5          | 675         | 23.8      | 2.3     | 71.7           | 45.0         | 0.58             | 3.0  |
| 11   | 24      | 334         | 176                  | 259                  | 236               | 11.8          | 708         | 25.4      | 2.3     | 68.1           | 49.0         | 0.71             | 2.9  |
| 12   | 24      | 332         | 223                  | 321                  | 243               | 11.9          | 743         | 26.8      | 2.3     | 69.0           | 64.3         | 0.88             | 2.4  |

## Gear and crafting

Gear power is the power the worn items add to the top 3 creatures (`applyGear`, floored like the fight slots), and the share is that power over the top-3 power (gear included). The "today" columns are the same sims and seeds played without gear.

### Casual

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 1.5        | 1.2%       | 0.0                   | 0.0            | 1.0                   | 0                     | 5            | 12.6       |
| 2    | 4.0        | 2.2%       | 0.3                   | 1.1            | 1.0                   | 7                     | 35           | 6.4        |
| 3    | 7.3        | 3.5%       | 1.3                   | 2.0            | 1.5                   | 23                    | 61           | 7.3        |
| 4    | 12.4       | 4.7%       | 2.7                   | 2.6            | 2.1                   | 42                    | 62           | 7.5        |
| 5    | 18.0       | 5.7%       | 3.7                   | 3.1            | 2.4                   | 37                    | 69           | 6.8        |
| 6    | 24.1       | 6.5%       | 4.5                   | 3.9            | 2.9                   | 40                    | 67           | 5.8        |
| 7    | 32.4       | 7.4%       | 5.2                   | 4.7            | 3.2                   | 33                    | 65           | 6.8        |
| 8    | 39.5       | 8.2%       | 6.1                   | 5.3            | 3.5                   | 49                    | 65           | 6.8        |
| 9    | 46.3       | 9.0%       | 6.8                   | 5.9            | 3.8                   | 44                    | 74           | 7.0        |
| 10   | 52.8       | 9.7%       | 7.6                   | 6.5            | 4.1                   | 61                    | 70           | 6.1        |
| 11   | 59.4       | 10.3%      | 8.2                   | 7.2            | 4.5                   | 50                    | 67           | 6.4        |
| 12   | 64.7       | 10.7%      | 8.7                   | 7.9            | 4.8                   | 36                    | 75           | 5.9        |

### Daily

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 4.7        | 2.3%       | 0.2                   | 2.0            | 2.0                   | 4                     | 7            | 4.3        |
| 2    | 12.6       | 3.9%       | 1.2                   | 3.9            | 3.1                   | 22                    | 32           | 3.8        |
| 3    | 25.6       | 5.6%       | 3.1                   | 5.6            | 4.0                   | 57                    | 19           | 4.1        |
| 4    | 38.3       | 7.3%       | 5.0                   | 7.8            | 4.9                   | 73                    | 17           | 4.0        |
| 5    | 51.0       | 8.7%       | 6.4                   | 10.3           | 5.7                   | 80                    | 25           | 3.7        |
| 6    | 63.4       | 10.0%      | 7.6                   | 13.0           | 6.2                   | 83                    | 28           | 3.7        |
| 7    | 74.6       | 11.0%      | 8.5                   | 16.6           | 6.7                   | 68                    | 39           | 3.8        |
| 8    | 82.5       | 11.5%      | 9.3                   | 20.9           | 7.1                   | 64                    | 50           | 4.2        |
| 9    | 89.4       | 11.9%      | 9.8                   | 26.5           | 7.6                   | 56                    | 74           | 4.2        |
| 10   | 97.0       | 12.4%      | 10.2                  | 33.2           | 8.0                   | 64                    | 89           | 4.4        |
| 11   | 103.4      | 12.8%      | 10.6                  | 40.7           | 8.5                   | 42                    | 116          | 4.3        |
| 12   | 107.4      | 12.9%      | 10.9                  | 49.4           | 8.8                   | 28                    | 158          | 4.2        |

### Top earner

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 1    | 5.3        | 2.5%       | 0.1                   | 2.2            | 2.2                   | 3                     | 7            | 4.3        |
| 2    | 14.3       | 4.0%       | 1.0                   | 4.1            | 3.2                   | 20                    | 20           | 4.2        |
| 3    | 26.9       | 5.6%       | 2.6                   | 6.3            | 4.3                   | 47                    | 14           | 3.9        |
| 4    | 40.8       | 7.4%       | 4.5                   | 9.0            | 5.4                   | 75                    | 19           | 3.4        |
| 5    | 54.1       | 9.0%       | 6.0                   | 11.7           | 6.0                   | 85                    | 24           | 3.1        |
| 6    | 66.3       | 10.2%      | 7.3                   | 15.0           | 6.5                   | 76                    | 34           | 3.9        |
| 7    | 76.7       | 11.0%      | 8.3                   | 19.6           | 6.9                   | 71                    | 42           | 3.4        |
| 8    | 85.3       | 11.6%      | 9.0                   | 25.6           | 7.4                   | 56                    | 60           | 3.8        |
| 9    | 92.7       | 12.1%      | 9.3                   | 33.1           | 7.8                   | 45                    | 93           | 3.8        |
| 10   | 99.0       | 12.4%      | 9.5                   | 42.2           | 8.3                   | 52                    | 117          | 3.6        |
| 11   | 103.9      | 12.7%      | 9.4                   | 49.1           | 8.6                   | 20                    | 164          | 4.0        |
| 12   | 109.0      | 13.0%      | 9.5                   | 55.2           | 9.0                   | 56                    | 177          | 4.4        |

### Newcomer

| Week | Gear power | Gear share | Upgrade levels (team) | Crafts claimed | Crafting level (best) | Essence spent on gear | Essence held | Scrap held |
| ---- | ---------- | ---------- | --------------------- | -------------- | --------------------- | --------------------- | ------------ | ---------- |
| 4    | 8.7        | 3.4%       | 1.4                   | 2.5            | 2.5                   | 33                    | 19           | 2.7        |
| 5    | 21.3       | 5.3%       | 2.8                   | 4.1            | 3.4                   | 48                    | 19           | 4.0        |
| 6    | 33.8       | 6.9%       | 4.5                   | 6.0            | 4.1                   | 70                    | 16           | 3.9        |
| 7    | 44.6       | 8.2%       | 5.7                   | 8.1            | 5.0                   | 75                    | 17           | 3.3        |
| 8    | 55.1       | 9.3%       | 6.7                   | 9.9            | 5.8                   | 62                    | 28           | 3.8        |
| 9    | 65.4       | 10.3%      | 7.7                   | 12.8           | 6.2                   | 75                    | 28           | 4.1        |
| 10   | 75.2       | 11.1%      | 8.1                   | 16.3           | 6.6                   | 55                    | 45           | 3.8        |
| 11   | 81.8       | 11.5%      | 9.0                   | 20.1           | 7.0                   | 64                    | 49           | 4.3        |
| 12   | 90.1       | 12.1%      | 9.5                   | 26.4           | 7.5                   | 54                    | 64           | 3.8        |

### Daily players with gear and without (today)

| Week | Essence held | Essence held today | Top-3 power | Top-3 power today |
| ---- | ------------ | ------------------ | ----------- | ----------------- |
| 1    | 7            | 11                 | 205         | 200               |
| 2    | 32           | 59                 | 317         | 304               |
| 3    | 19           | 101                | 452         | 426               |
| 4    | 17           | 172                | 523         | 487               |
| 5    | 25           | 262                | 581         | 530               |
| 6    | 28           | 340                | 629         | 567               |
| 7    | 39           | 413                | 674         | 600               |
| 8    | 50           | 487                | 713         | 631               |
| 9    | 74           | 560                | 747         | 658               |
| 10   | 89           | 632                | 779         | 681               |
| 11   | 116          | 697                | 807         | 704               |
| 12   | 158          | 777                | 830         | 723               |

### What the team wears (end of week 8)

| Archetype  | Common | Rare | Epic | Festival | Average level | Enchanted | Power added per item | Bag | Blueprints | Scrap | Shards | Glimmer |
| ---------- | ------ | ---- | ---- | -------- | ------------- | --------- | -------------------- | --- | ---------- | ----- | ------ | ------- |
| Casual     | 63%    | 17%  | 2%   | 19%      | 2.0           | 7%        | 13.2                 | 2.7 | 1.9        | 7     | 5      | 0.3     |
| Daily      | 65%    | 14%  | 3%   | 19%      | 3.1           | 50%       | 27.5                 | 2.0 | 3.5        | 4     | 17     | 0.5     |
| Top earner | 59%    | 15%  | 3%   | 23%      | 3.0           | 60%       | 28.4                 | 2.0 | 4.4        | 4     | 21     | 0.8     |
| Newcomer   | 51%    | 19%  | 3%   | 26%      | 2.2           | 21%       | 18.4                 | 2.0 | 2.4        | 4     | 10     | 0.0     |

## Elements

| Element | Raid slots | Pick rate |
| ------- | ---------- | --------- |
| tide    | 19589      | 29.2%     |
| ember   | 14008      | 20.9%     |
| grove   | 14265      | 21.2%     |
| spark   | 19278      | 28.7%     |

## Creatures

| Creature              | Rarity | Element | Role    | Picks | Pick rate | Average level | Average contribution | Relative to rarity median |
| --------------------- | ------ | ------- | ------- | ----- | --------- | ------------- | -------------------- | ------------------------- |
| Ashmole               | common | ember   | support | 9     | 0.0%      | 1.0           | 2436                 | n/a                       |
| Aurorix               | epic   | spark   | support | 323   | 0.5%      | 11.1          | 4079                 | 0.61x                     |
| Cindle                | common | ember   | payoff  | 13061 | 19.5%     | 19.4          | 6879                 | 1.32x                     |
| Coralynx              | rare   | tide    | payoff  | 9119  | 13.6%     | 14.8          | 6216                 | 1.00x                     |
| Gaiadrake             | epic   | grove   | payoff  | 4352  | 6.5%      | 18.3          | 9764                 | 1.45x                     |
| Lanternfin (Festival) | epic   | tide    | support | 557   | 0.8%      | 11.1          | 3884                 | 0.58x                     |
| Mistnewt              | common | tide    | guard   | 1914  | 2.9%      | 16.9          | 3432                 | 0.66x                     |
| Mossback              | rare   | grove   | setter  | 3307  | 4.9%      | 18.9          | 5994                 | 0.96x                     |
| Solmane               | epic   | ember   | setter  | 938   | 1.4%      | 14.7          | 6714                 | 1.00x                     |
| Splashet              | common | tide    | setter  | 7999  | 11.9%     | 18.9          | 5886                 | 1.13x                     |
| Sproutle              | common | grove   | guard   | 6606  | 9.8%      | 19.4          | 3164                 | 0.61x                     |
| Stormray              | rare   | spark   | payoff  | 17981 | 26.8%     | 18.5          | 9495                 | 1.53x                     |
| Zipmouse              | common | spark   | setter  | 974   | 1.5%      | 17.1          | 5226                 | 1.00x                     |

## Essence and jackpots

| Players | Player-weeks | Mean Essence | P10 | Median | P90 | Max |
| ------- | ------------ | ------------ | --- | ------ | --- | --- |
| 1       | 800          | 80.9         | 80  | 80     | 86  | 86  |
| 5       | 3501         | 55.7         | 15  | 71     | 88  | 114 |
| 10      | 7257         | 51.2         | 15  | 44     | 91  | 132 |
| 15      | 10822        | 56.8         | 15  | 61     | 94  | 141 |

| Source                           | Finale-win rolls | Jackpots | Rate  | Guaranteed by hard pity |
| -------------------------------- | ---------------- | -------- | ----- | ----------------------- |
| sweep, 1 players                 | 800              | 159      | 19.9% | 0                       |
| sweep, 5 players                 | 1889             | 277      | 14.7% | 0                       |
| sweep, 10 players                | 3084             | 313      | 10.1% | 0                       |
| sweep, 15 players                | 5413             | 767      | 14.2% | 0                       |
| economy sims, 20 raid weeks each | 4385             | 543      | 12.4% | 45                      |

## Ability damage share (informational)

What abilities add to the damage dealt in the finale, measured by replaying each finale three times against a boss that cannot fall (every ability, only the basic ones, none) so all 12 rounds are played. Creature share = (all - basic only) / all; basic share = (basic only - none) / all. Creature abilities need creature level 10. Informational: the aim is a creature share of about 10-25% for a week-8 roster, not a target.

| Roster week | Group                        | Raids | Creature abilities per raid | Creature share | Basic share |
| ----------- | ---------------------------- | ----- | --------------------------- | -------------- | ----------- |
| 4           | typical group (5-10 players) | 582   | 18.7                        | 18.2%          | 3.3%        |
| 4           | 15 players                   | 400   | 31.6                        | 19.4%          | 3.9%        |
| 4           | 1 player with guests         | 400   | 3.0                         | 10.9%          | 0.6%        |
| 8           | typical group (5-10 players) | 598   | 23.1                        | 20.4%          | 3.0%        |
| 8           | 15 players                   | 400   | 40.5                        | 21.5%          | 3.7%        |
| 8           | 1 player with guests         | 400   | 3.0                         | 11.5%          | 0.7%        |

## Long-running servers (ladder, Festivals, seasons)

40 servers per size, 30 weeks each (6 seasons of 4 normal weeks and a Festival), with the Boss Rank ladder: placement at the first raid week, a normal finale win +1 rank, a loss keeps the rank, a Festival boss fights 3 ranks lower and the rank eases 1 after it. Every server starts at a random point of the 5-week calendar. A rank-up is a week that raised the rank.

| Server                      | Servers | Finale win rate (mean per server) | Per server p10 to p90 | Normal weeks | Festival weeks | Weeks 1-10 | Weeks 11+ | Median weeks between rank-ups (p10 to p90) | Servers with a loss streak over 4 | Median longest loss streak |
| --------------------------- | ------- | --------------------------------- | --------------------- | ------------ | -------------- | ---------- | --------- | ------------------------------------------ | --------------------------------- | -------------------------- |
| Small server (5 players)    | 40      | 54.3%                             | 53% to 57%            | 43.8%        | 96.7%          | 71.0%      | 46.0%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |
| Typical server (10 players) | 40      | 54.4%                             | 53% to 57%            | 43.8%        | 97.1%          | 73.0%      | 45.1%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |
| 15-player server            | 40      | 54.7%                             | 50% to 57%            | 44.0%        | 97.5%          | 76.8%      | 43.6%     | 2.0 (1 to 5)                               | 0.0%                              | 3                          |

Median server rank at the start of each week (the Festival boss fights at an eased rank):

| Server                      | Placement | Week 1 | Week 5 | Week 10 | Week 15 | Week 20 | Week 25 | Week 30 | Rank after the last week (p10 to p90) |
| --------------------------- | --------- | ------ | ------ | ------- | ------- | ------- | ------- | ------- | ------------------------------------- |
| Small server (5 players)    | 2.0       | 2.0    | 3.0    | 5.0     | 6.0     | 7.0     | 7.0     | 7.0     | 6.5 (6 to 7)                          |
| Typical server (10 players) | 2.0       | 2.0    | 3.0    | 5.0     | 6.0     | 6.0     | 7.0     | 7.0     | 7.0 (6 to 7)                          |
| 15-player server            | 2.0       | 2.0    | 3.0    | 6.0     | 6.0     | 7.0     | 6.5     | 7.0     | 7.0 (6 to 7)                          |

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

1. Tidal Colossus resists Grounding (Reaction Resistance).
2. Round 1: Tidal Colossus has 99846 HP.
3. Sproutle (Casual 3) acts.
4. Sproutle (Casual 3) hits Tidal Colossus for 42; 99804 HP left.
5. Sproutle (Casual 3) leaves Tidal Colossus Overgrown.
6. Thornbuck (Newcomer 1) acts.
7. Thornbuck (Newcomer 1) hits Tidal Colossus for 58; 99746 HP left.
8. Thornbuck (Daily 3) acts.
9. Thornbuck (Daily 3) hits Tidal Colossus for 72; 99674 HP left.
10. Fogwyrm (Top earner 2) acts.
11. Fogwyrm (Top earner 2) hits Tidal Colossus for 102; 99572 HP left.
12. Thornbuck (Top earner 2) acts.
13. Thornbuck (Top earner 2) hits Tidal Colossus for 74; 99498 HP left.
14. Fogwyrm (Top earner 1) acts.
15. Fogwyrm (Top earner 1) hits Tidal Colossus for 104; 99394 HP left.
16. Tidewing (Daily 1) acts.
17. Tidewing (Daily 1) hits Tidal Colossus for 100; 99294 HP left.
18. Tidewing (Daily 1) replaces Overgrown with Soaked.
19. Tidewing (Daily 4) acts.
20. Tidewing (Daily 4) hits Tidal Colossus for 104; 99190 HP left.
21. Coralynx (Daily 1) acts.
22. Coralynx (Daily 1) hits Tidal Colossus for 110; 99080 HP left.
23. Tempestray (Daily 1) acts.
24. Tempestray (Daily 1) hits Tidal Colossus for 1336 (strong matchup); 97744 HP left.
25. Overload! Tempestray (Daily 1) cashes in the mark set by Tidewing (Daily 1) for 1066 bonus damage.
26. Pyrelynx (Top earner 1) acts.
27. Pyrelynx (Top earner 1) hits Tidal Colossus for 105 (weak matchup); 97639 HP left.
28. Pyrelynx (Top earner 1) leaves Tidal Colossus Scorched.
29. Tempestray (Top earner 1) acts.
30. Tempestray (Top earner 1) hits Tidal Colossus for 564 (Critical!) (strong matchup); 97075 HP left.

## Method

- **Leet credit:** each day, every player who leets earns `baitForDay(n)` (n = players who leeted that day). Casuals leet on 2 random days a week, dailies on 6, top earners on all 7, and the newcomer like a daily from week 4.
- **Starter:** the starter whose element the server owns least (ties in content order). The first expedition brings a Zipmouse (game rule).
- **Check-ins:** casuals check in once on each leet day; everyone else twice a day (morning and evening, 12 hours apart, so a Long expedition always finishes in time).
- **At a check-in:** claim expeditions (game `rollCatches`, fusion and conversion rules), evolve creatures that are at level 15 when there is enough Essence, plan expeditions, train, then send the planned expeditions.
- **Expeditions:** up to 3, one per creature. The budget is 50% of the Bait held (all of it when nothing can be trained). Each free slot gets an equal share of the remaining budget and buys the option with the highest value that fits. Value = rolls x expected rarity score of a roll (common 1, rare 4, epic 10). Explorers are creatures whose element has the most unowned catchable species. A player whose collection is complete (every catchable species owned with 5 fusions) stops sending expeditions.
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
