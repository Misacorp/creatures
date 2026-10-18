_Dungeon paths in the simulator (2026-10-18, log entry B-019): the daily dungeon is a walk over the day's map with a camp, a pack, keepsakes and events, played by a small policy. Foe HP at depth 1 and its step per depth, the experience per fight and the elite's Bait were retuned (`docs/balance/log.md`). Seed `leet`, 12 weeks per economy sim, 200 raid weeks per cell, 24 economy sims per player count, 40 twenty-week pity sims and 40 thirty-week long-run sims per server size (`pnpm sim`, 94 targets: 65 pass, 29 fail). The report just before the change is not kept; B-018's full run (92 targets, 65 pass) is the baseline._

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

65 passed, 29 failed, 0 not measured.

|     | Target                                                                                                                                                                                              | Measured | Requirement    | Metric                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ---------------------------------------- |
| ❌  | Phase 1 clear rate (the boss driven to its 70% floor), typical group (5-10 signed-up players, week 4 or later)                                                                                      | 74.2%    | >= 80.0%       | `raid.typical.phase1ClearRate`           |
| ✅  | Phase 2 clear rate (the boss driven to its 15% floor), typical group: a stronger server's result, not a routine one, or the finale has no work left                                                 | 0.8%     | 0.0% to 25.0%  | `raid.typical.phase2ClearRate`           |
| ❌  | Finale win rate, typical group (the boss usually falls, enrage is the real threat)                                                                                                                  | 76.5%    | 85.0% to 97.0% | `raid.typical.finaleWinRate`             |
| ✅  | Share of the boss's HP left when a typical group's finale begins (real work for the finale: a quarter to under half)                                                                                | 38.7%    | 25.0% to 45.0% | `raid.typical.finaleStartShare`          |
| ✅  | Phase 1 clear rate, 1 player with guests, week 4 or later                                                                                                                                           | 100.0%   | >= 80.0%       | `raid.solo.phase1ClearRate`              |
| ❌  | Finale win rate, 15 players (no easier-with-more-people cliff)                                                                                                                                      | 70.5%    | 85.0% to 99.0% | `raid.fifteen.finaleWinRate`             |
| ✅  | Spread of finale win rate between bosses, typical group (percentage points)                                                                                                                         | 7.8%     | <= 15.0%       | `raid.typical.bossSpread`                |
| ✅  | Bosses a typical group never beats or always beats in the finale (flagged)                                                                                                                          | 0        | <= 0           | `raid.typical.extremeBosses`             |
| ✅  | Creatures knocked out in a typical group's finale (share of the creatures in the row; big hits stay big, knock-outs and swings are wanted: the band only catches broken numbers)                    | 26.3%    | 10.0% to 30.0% | `raid.typical.koShare`                   |
| ✅  | Finale win points lost with the Guard role switched off, Guards spread through the row, typical group, bosses 15% tougher so the role has room to show                                              | 4.71     | >= 2           | `raid.guardValue`                        |
| ✅  | Barrage volleys that hit a creature the previous volley of the same barrage hit although enough others were standing (the no-repeat rule: none)                                                     | 0.0%     | <= 0.0%        | `raid.patternFairness`                   |
| ✅  | Median top player's share of contribution, groups of 5+ players                                                                                                                                     | 16.6%    | <= 35.0%       | `fair.topShareMedian`                    |
| ✅  | Setup credit share of total contribution (setters matter)                                                                                                                                           | 19.5%    | >= 15.0%       | `fair.setupShare`                        |
| ✅  | Reactions per round on average, groups of 5+ players                                                                                                                                                | 4.63     | >= 1           | `fair.reactionsPerRound`                 |
| ✅  | Newcomer (joined week 4) Essence per week at week 6, relative to a top earner                                                                                                                       | 78.8%    | >= 70.0%       | `econ.newcomerEssenceRatioWeek6`         |
| ❌  | Lowest element pick rate in raids                                                                                                                                                                   | 12.0%    | >= 15.0%       | `choice.elementPickRateMin`              |
| ✅  | Highest element pick rate in raids                                                                                                                                                                  | 32.7%    | <= 35.0%       | `choice.elementPickRateMax`              |
| ✅  | Highest creature contribution relative to the median creature of its rarity                                                                                                                         | 1.42x    | <= 1.60x       | `choice.creatureRatioMax`                |
| ✅  | Lowest creature contribution relative to the median creature of its rarity                                                                                                                          | 0.83x    | >= 0.60x       | `choice.creatureRatioMin`                |
| ✅  | Elements picked in under 10% of raid slots (flagged as dead)                                                                                                                                        | 0        | <= 0           | `choice.deadElements`                    |
| ❌  | Casual player's highest creature level at the end of week 4 (evolution level 15)                                                                                                                    | 10       | >= 15          | `econ.casualTopLevelWeek4`               |
| ✅  | Daily player owns at least 8 of 12 catchable species by the end of week 6                                                                                                                           | 11       | >= 8           | `econ.dailySpeciesWeek6`                 |
| ❌  | Top earner vs casual average team power at week 8                                                                                                                                                   | 2.05x    | <= 1.60x       | `econ.powerRatioTopVsCasualWeek8`        |
| ✅  | Jackpot rate per player per finale win, including pity                                                                                                                                              | 13.4%    | 6.0% to 15.0%  | `econ.jackpotRatePerWin`                 |
| ✅  | Players reaching hard pity (10 raids without a jackpot) over 20 weeks (pity counts finale wins, so a winnable raid reaches it more often than a hard one did)                                       | 20.8%    | <= 25.0%       | `econ.hardPityShare20Weeks`              |
| ✅  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, small server (5 players, 30 weeks)                                                             | 84.7%    | 60.0% to 85.0% | `longrun.small.finaleWinRate`            |
| ❌  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, typical server (10 players, 30 weeks)                                                          | 92.4%    | 60.0% to 85.0% | `longrun.typical.finaleWinRate`          |
| ❌  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, 15-player server (30 weeks)                                                                    | 93.4%    | 60.0% to 85.0% | `longrun.fifteen.finaleWinRate`          |
| ✅  | Festival finale win rate, lowest of the three server sizes                                                                                                                                          | 96.3%    | >= 70.0%       | `longrun.festivalWinRateMin`             |
| ✅  | Median weeks between rank-ups, all long-run servers (a winnable curve: most wins raise the rank, a loss stalls it a week or two)                                                                    | 1        | 1 to 2         | `longrun.rankUpGapMedian`                |
| ✅  | Share of servers with a loss streak of more than 4 weeks, worst of the three sizes                                                                                                                  | 0.0%     | <= 10.0%       | `longrun.lossStreakShareMax`             |
| ✅  | Days until a daily player's first crafted item arrives (90th percentile; a player who never crafts counts as 99)                                                                                    | 1.38     | <= 7           | `gear.dailyFirstCraftDaysP90`            |
| ✅  | Best Crafting skill level of a daily player 30 days after joining (median)                                                                                                                          | 6        | 4 to 6         | `gear.dailyBestSkillDay30`               |
| ❌  | Gear power at week 8 of a player who joined in week 4, relative to the median daily player's                                                                                                        | 55.0%    | >= 60.0%       | `gear.newcomerCatchUpWeek8`              |
| ✅  | A min-maxer's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                   | 7.2%     | 5.0% to 10.0%  | `gear.share.min-maxer.week2`             |
| ❌  | A min-maxer's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                   | 23.9%    | 15.0% to 22.0% | `gear.share.min-maxer.week8`             |
| ❌  | A min-maxer's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                  | 32.0%    | 25.0% to 32.0% | `gear.share.min-maxer.week20`            |
| ❌  | A min-maxer's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                  | 31.8%    | 33.0% to 40.0% | `gear.share.min-maxer.week30`            |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 4.5%     | 5.0% to 10.0%  | `gear.share.engaged.week2`               |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 13.5%    | 15.0% to 22.0% | `gear.share.engaged.week8`               |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                            | 24.7%    | 25.0% to 32.0% | `gear.share.engaged.week20`              |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                            | 27.1%    | 33.0% to 40.0% | `gear.share.engaged.week30`              |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 2.6%     | 3.0% to 6.0%   | `gear.share.regular.week2`               |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 9.0%     | 10.0% to 15.0% | `gear.share.regular.week8`               |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 17.5%    | 18.0% to 24.0% | `gear.share.regular.week20`              |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 22.4%    | 28.0% to 34.0% | `gear.share.regular.week30`              |
| ❌  | A drop-in player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 4.7%     | 0.0% to 3.0%   | `gear.share.drop-in.week2`               |
| ❌  | A drop-in player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 4.6%     | 5.0% to 8.0%   | `gear.share.drop-in.week8`               |
| ✅  | A drop-in player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 13.0%    | 10.0% to 15.0% | `gear.share.drop-in.week20`              |
| ✅  | A drop-in player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 19.4%    | 15.0% to 20.0% | `gear.share.drop-in.week30`              |
| ✅  | Daily dungeon: depth 1 is cleared (the room boss beaten) in a player's first 7 days, share of those runs                                                                                            | 89.4%    | >= 80.0%       | `dungeon.firstWeekDepth1ClearRate`       |
| ✅  | Daily dungeon: depth a median daily player gains per week, from the end of week 2 to the end of week 8                                                                                              | 1.83     | 1 to 2         | `dungeon.dailyDepthGrowthPerWeek`        |
| ✅  | Daily dungeon: Essence as a share of a daily player's whole Essence income (raids, jackpots and dungeon)                                                                                            | 4.1%     | <= 40.0%       | `dungeon.dailyEssenceShare`              |
| ❌  | Gear's share of a daily player's raid-team power at week 8 with the dungeon's gear and parts in the game (must not pass 20%)                                                                        | 22.8%    | <= 20.0%       | `dungeon.dailyGearShareWeek8`            |
| ✅  | Daily dungeon: share of a daily player's runs, from their second week, that head home from the camp with the pack (the camp choice is real)                                                         | 19.3%    | 10.0% to 45.0% | `dungeon.dailyHomeRate`                  |
| ✅  | Daily dungeon: fights played per run (a lost one included), a daily player's runs from their second week (a run is short: 3 to 5.5 fights)                                                          | 4.13     | 3 to 5.5       | `dungeon.meanFights`                     |
| ✅  | Day a daily player's 2nd expedition slot opens, after joining (median; the first day)                                                                                                               | 1        | <= 1           | `exp.dailySlot2Day`                      |
| ❌  | Day a daily player's 3rd expedition slot opens (median; about a month, 30 plus or minus 7)                                                                                                          | 54.5     | 23 to 37       | `exp.dailySlot3Day`                      |
| ❌  | Day a daily player's 4th expedition slot opens (median; about four months)                                                                                                                          | 313.5    | 90 to 150      | `exp.dailySlot4Day`                      |
| ❌  | Day a daily player's 5th expedition slot opens (median; about a year; a slot that never opens counts as 999)                                                                                        | 999      | 330 to 400     | `exp.dailySlot5Day`                      |
| ✅  | Worth per day of the best long strategy (always 12 or 24 hour trips) over the best short one (2 or 6 hours), Bait-free                                                                              | 2.96x    | >= 1.20x       | `exp.longVsShortRate`                    |
| ✅  | Worth per day of always sending 2 hour trips over the worst of the other three strategies (at most 1: spam is the worst)                                                                            | 0.16x    | <= 1.00x       | `exp.spamVsOthersRate`                   |
| ✅  | Share of daily players' finished trips that are 12 or 24 hours (long trips are what people send)                                                                                                    | 99.0%    | >= 50.0%       | `exp.dailyLongShare`                     |
| ✅  | Lowest expected worth of a risky push-on goal against coming home, over every length it is offered after                                                                                            | 0.91x    | >= 0.90x       | `exp.riskyRatioMin`                      |
| ✅  | Highest expected worth of a risky push-on goal against coming home (a fair gamble: within 10%)                                                                                                      | 1.09x    | <= 1.10x       | `exp.riskyRatioMax`                      |
| ✅  | Most species a casual player owns ahead of today's expeditions at the end of any week 1 to 12 (no faster than today, within the measure's noise of about half a species)                            | -0.7     | <= 0.45        | `exp.casualSpeciesVsToday`               |
| ✅  | Raid curve: finale win rate in a new server's first week (rank 1), casual-heavy journey server (1 engaged, 4 regular, 4 drop-in)                                                                    | 98.3%    | >= 85.0%       | `curve.casual-heavy.week1.finaleWinRate` |
| ✅  | Raid curve: finale win rate in a new server's first week (rank 1), default journey server                                                                                                           | 100.0%   | >= 90.0%       | `curve.default.week1.finaleWinRate`      |
| ✅  | Raid curve: finale win rate at Boss Ranks 2 to 5, default journey server (12-week runs, normal weeks)                                                                                               | 79.9%    | 70.0% to 85.0% | `curve.default.r2to5.finaleWinRate`      |
| ❌  | Raid curve: finale win rate at Boss Ranks 2 to 5, committed journey server (arranged rows)                                                                                                          | 93.1%    | >= 95.0%       | `curve.committed.r2to5.finaleWinRate`    |
| ❌  | Raid curve: finale win rate at Boss Rank 6 and up, default journey server                                                                                                                           | 72.7%    | 45.0% to 65.0% | `curve.default.r6up.finaleWinRate`       |
| ✅  | Raid curve: finale win rate at Boss Rank 6 and up, committed journey server                                                                                                                         | 93.4%    | >= 80.0%       | `curve.committed.r6up.finaleWinRate`     |
| ✅  | Raid curve: finale win rate of the hardest rank a committed server reaches within 12 weeks (ranks with at least 40 weeks; never a rank they cannot beat)                                            | 86.0%    | >= 60.0%       | `curve.committed.worstRankWinRate`       |
| ✅  | Raid curve: Phase 1 (Friday) clear rate over all normal weeks, default journey server (weekday rewards flow)                                                                                        | 75.5%    | >= 75.0%       | `curve.default.normal.phase1ClearRate`   |
| ✅  | Raid curve: Phase 2 (Saturday) clear rate over all normal weeks, default journey server (sometimes, not routinely)                                                                                  | 14.6%    | 5.0% to 50.0%  | `curve.default.normal.phase2ClearRate`   |
| ✅  | Raid curve: share of the finale's creatures knocked out over all normal weeks, default journey server (drama without wipes)                                                                         | 20.0%    | 10.0% to 35.0% | `curve.default.normal.koShare`           |
| ✅  | Supplies: a regular player carries at least about 3 supplies a week (weeks 3 to 12; B-011)                                                                                                          | 7.24     | >= 3           | `supplies.regular.usedPerWeek`           |
| ✅  | Supplies: a min-maxer carries at least about 8 supplies a week (weeks 3 to 12; B-011)                                                                                                               | 45.95    | >= 8           | `supplies.min-maxer.usedPerWeek`         |
| ✅  | Supplies: at least a quarter of a min-maxer's supplies are crafted in the Workshop (weeks 3 to 12)                                                                                                  | 56.9%    | >= 25.0%       | `supplies.min-maxer.craftedShare`        |
| ✅  | Supplies: at least a quarter of an engaged player's supplies are crafted in the Workshop (weeks 3 to 12)                                                                                            | 35.4%    | >= 25.0%       | `supplies.engaged.craftedShare`          |
| ✅  | Creatures: a min-maxer owns every species a trip can find (the base catalogue) after about 5 weeks (B-016: the pity floor only speeds players up, so B-014 plan of 9 is out of reach)               | 5        | 4 to 8         | `creatures.min-maxer.catalogueWeeks`     |
| ✅  | Creatures: an engaged player completes the base catalogue after about 9 weeks (B-016; B-014 planned 14, pity cannot slow a committed player)                                                        | 8        | 7 to 12        | `creatures.engaged.catalogueWeeks`       |
| ✅  | Creatures: a regular player completes the base catalogue after about 24 weeks (B-016: the pity threshold is set for this), and at least half of them by week 30                                     | 24       | 20 to 30       | `creatures.regular.catalogueWeeks`       |
| ✅  | Creatures: a min-maxer brings home 8 to 20 creatures a week, with the pity floor counted (weeks 3 to 30; B-016, the plan is 10 to 15)                                                               | 15.65    | 8 to 20        | `creatures.min-maxer.catchesPerWeek`     |
| ✅  | Creatures: an engaged player brings home 5 to 14 creatures a week (weeks 3 to 30; B-014)                                                                                                            | 10.63    | 5 to 14        | `creatures.engaged.catchesPerWeek`       |
| ✅  | Creatures: a regular player brings home 1.5 to 4 creatures a week (weeks 3 to 30; B-014)                                                                                                            | 2.51     | 1.5 to 4       | `creatures.regular.catchesPerWeek`       |
| ✅  | Creatures: a min-maxer gets 6 to 18 duplicates a week, enough to feed talents and fusion and not a flood (B-014)                                                                                    | 15.47    | 6 to 18        | `creatures.min-maxer.dupesPerWeek`       |
| ✅  | Creatures: an engaged player gets 4 to 12 duplicates a week (B-014)                                                                                                                                 | 10.34    | 4 to 12        | `creatures.engaged.dupesPerWeek`         |
| ✅  | Creatures: a regular player gets 1 to 3.5 duplicates a week (B-014)                                                                                                                                 | 2.13     | 1 to 3.5       | `creatures.regular.dupesPerWeek`         |
| ✅  | Creatures: lures take at most a quarter of the Bait a min-maxer earns; treats are the main use of Bait now (B-016)                                                                                  | 18.3%    | <= 25.0%       | `creatures.min-maxer.lureBaitShare`      |
| ❌  | Creatures: talents give a min-maxer's raid team 5 to 20% of its fight-scored power at the end of the run (B-014; not a design target, a guard against a talent that is worth nothing or everything) | -2.1%    | 5.0% to 20.0%  | `creatures.min-maxer.talentShareEnd`     |
| ✅  | Creatures: a committed trio reaches level 10 (the Bronze Ribbon gate) in week 1 or 2 (spec 9.2, B-016)                                                                                              | 1        | <= 2           | `creatures.min-maxer.trioLevel10Week`    |
| ✅  | Creatures: a committed trio reaches level 30 around week 11 (spec 9.2, B-016)                                                                                                                       | 10       | 8 to 14        | `creatures.min-maxer.trioLevel30Week`    |
| ✅  | Creatures: no gap of more than 6 levels between two unlocks on the ladder (the first gap, Hat at 1 to Scarf at 7, is the widest; spec 9.3a, B-016)                                                  | 6        | <= 6           | `creatures.min-maxer.stretchLevels`      |

## Finale structure (phase floors and enrage)

Typical groups (5-10 signed up, 1180 raid weeks). A cleared phase leaves its floor (Phase 1: 70% of the boss's HP, Phase 2: 15%), so a finale that follows a cleared Phase 2 starts at the Phase 2 floor. Enrage: 3 rounds at 400% of the boss's Attack on every creature, after the finale's own rounds.

| Measure                                                                                                                                 | Value                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Phase 1 clear rate                                                                                                                      | 74.2%                  |
| Phase 2 clear rate                                                                                                                      | 0.8%                   |
| Finale win rate                                                                                                                         | 76.5%                  |
| Boss HP left when the finale began (mean share of the maximum)                                                                          | 38.7%                  |
| Finale win rate when it began at the Phase 2 floor                                                                                      | 100.0%                 |
| Finale win rate when Phase 2 fell short of its floor                                                                                    | 76.3%                  |
| Finales that reached the enrage rounds                                                                                                  | 31.9%                  |
| Win rate inside the enrage rounds (of the finales that reached them)                                                                    | 26.5%                  |
| Enrage rounds played before the row was wiped (finales that reached enrage and were lost, mean)                                         | 2.99                   |
| Creatures knocked out in the finale                                                                                                     | 26.3%                  |
| Barrage volleys that broke the no-repeat rule (hit a creature the previous volley of the same barrage hit although enough others stood) | 0.00% of 11974 volleys |
| Barrage volleys that repeated a victim because too few other creatures were left standing (the rule allows it)                          | 0.02%                  |

## Roles (Guard and Support ablation)

The same raid weeks played again with a role switched off (Guard: no extra HP, no intercept, no cover; Support: no buff and no element effect; one element: only that Support effect), with the same rosters, sign-ups and dice. Guards are spread through the row (evenly spaced), the formation in which they show; the sim's default formation clumps them in front. The bosses' HP pool is 15% bigger than in the raid sweep, so the reference wins about 70% of its weeks and a role has room to show (at the sweep's own difficulty a spread row wins about 95% and hides what a Guard saves). Typical groups only (5-10 signed up), 2 times the sweep's weeks per cell. The Guard value of the targets is the first table's "Guard off" row, as win points lost. One standard error of a difference is about 1 point; differences under 2 points are noise. Grove has no Support species yet, so its Mend has nothing to switch off (0.0 is expected).

### Players bring their 3 strongest creatures (the sim's rule)

| Switched off  | Raid weeks | Finale win rate | Points vs everything on | Creatures knocked out |
| ------------- | ---------- | --------------- | ----------------------- | --------------------- |
| Everything on | 2358       | 61.3%           | 0.0                     | 33.9%                 |
| Guard off     | 2358       | 56.6%           | -4.7                    | 40.6%                 |
| Support off   | 2358       | 57.3%           | -3.9                    | 37.2%                 |

### Every player brings a Guard and a Support when they own one

A Support is only 1 to 3% of the creatures in the first table, so its effects hardly show there. This population shows what a Support is worth when one is present.

| Switched off         | Raid weeks | Finale win rate | Points vs everything on | Creatures knocked out |
| -------------------- | ---------- | --------------- | ----------------------- | --------------------- |
| Everything on        | 2358       | 67.1%           | 0.0                     | 26.3%                 |
| Guard off            | 2358       | 56.9%           | -10.2                   | 39.9%                 |
| Support off          | 2358       | 51.9%           | -15.3                   | 36.2%                 |
| Ember Stoke off      | 2358       | 63.4%           | -3.7                    | 28.3%                 |
| Spark Overcharge off | 2358       | 66.9%           | -0.2                    | 26.5%                 |
| Tide Mend off        | 2358       | 66.9%           | -0.3                    | 27.5%                 |
| Grove Mend off       | 2358       | 67.1%           | 0.0                     | 26.3%                 |

Guard value (the target): 4.7 win points.

## Setups (greedy and protected rows)

The same raid weeks (rosters, sign-ups and dice of the sweep) played with the row arranged three ways. **Default** is the sim's own row (`autoPlace`: Guards in front, payoffs at the back, Supports in the middle). **Greedy** packs setters and payoffs for the most reactions a round and puts Guards and Supports where they cost the fewest, at the edges. **Protected** puts every payoff beside a Guard where it can (adjacency stops at zone edges), Supports between payoffs, and takes whatever reactions remain. The two setups are the best arrangement a seeded hill-climb finds for their own score (`formations.ts`). Typical groups only (5-10 signed up). "+N ranks" plays the same weeks against a boss N Boss Ranks above the sweep's (the curve's HP and Attack for that rank): at +0 a typical group wins about 93% and there is little left to lose, +1 and +2 are what a server that keeps winning meets next. **Swing** is the standard deviation of the win rate over the cells (server size, boss, roster week) and of the knock-out share from finale to finale, in points; one standard error of a win rate is about 1.5 points at +0 and 2 points at +1.

### The shipped bosses (+0 ranks)

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 75.4%    | 0.0               | 73.5%           | 39.0%                      | 3.77              | 0%                     | 26.6%       | 7.5%                | 100%                             | 1.8%                            | 23.1                             | 34.3                            |
| Greedy              | 1179    | 94.4%    | +19.0             | 93.2%           | 29.6%                      | 6.88              | 11%                    | 9.3%        | 4.5%                | 100%                             | 1.2%                            | 13.3                             | 21.5                            |
| Protected           | 1179    | 94.9%    | +19.5             | 93.6%           | 28.8%                      | 6.80              | 58%                    | 8.1%        | 4.0%                | 100%                             | 1.2%                            | 13.0                             | 20.5                            |

### +1 rank

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 47.2%    | 0.0               | 44.7%           | 46.9%                      | 3.71              | 0%                     | 50.7%       | 9.7%                | 99%                              | 2.2%                            | 37.5                             | 40.4                            |
| Greedy              | 1179    | 78.1%    | +30.9             | 76.5%           | 37.0%                      | 6.82              | 11%                    | 24.0%       | 6.2%                | 100%                             | 2.3%                            | 29.8                             | 36.7                            |
| Protected           | 1179    | 79.6%    | +32.4             | 79.1%           | 36.0%                      | 6.74              | 58%                    | 22.1%       | 5.7%                | 100%                             | 1.7%                            | 28.4                             | 35.7                            |

### +2 ranks

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 27.1%    | 0.0               | 23.2%           | 53.5%                      | 3.68              | 0%                     | 67.4%       | 12.1%               | 100%                             | 2.8%                            | 27.6                             | 35.9                            |
| Greedy              | 1179    | 54.6%    | +27.5             | 54.6%           | 43.6%                      | 6.72              | 11%                    | 44.6%       | 7.4%                | 100%                             | 3.6%                            | 38.4                             | 43.6                            |
| Protected           | 1179    | 57.9%    | +30.8             | 56.5%           | 42.5%                      | 6.66              | 58%                    | 41.2%       | 7.2%                | 100%                             | 1.8%                            | 36.8                             | 42.9                            |

## High Boss Ranks

Typical groups (5-10 signed up) on the sweep's rosters of week 4 and week 8, against every boss at Boss Ranks 1, 3, 5, 7, 9 and 11 with the shipped rank curve (`RULES.raid.curve`; the rank is forced, whatever the roster would have been placed at). It shows where wins collapse for a roster that has stopped growing, not what a server at that rank looks like (a server that reaches rank 9 has been winning, so its creatures are stronger than these).

| Boss Rank | Roster week | Finales | Phase 1 cleared | Phase 2 cleared | Finale win rate | Boss HP left at the finale | Knocked out | Reached enrage |
| --------- | ----------- | ------- | --------------- | --------------- | --------------- | -------------------------- | ----------- | -------------- |
| 1         | 4           | 582     | 100.0%          | 100.0%          | 100.0%          | 15.0%                      | 0.5%        | 0.0%           |
| 3         | 4           | 582     | 48.5%           | 0.0%            | 49.8%           | 45.7%                      | 50.2%       | 65.1%          |
| 5         | 4           | 582     | 1.2%            | 0.0%            | 0.5%            | 61.8%                      | 92.7%       | 99.8%          |
| 7         | 4           | 582     | 0.0%            | 0.0%            | 0.0%            | 65.9%                      | 97.6%       | 99.5%          |
| 9         | 4           | 582     | 0.0%            | 0.0%            | 0.0%            | 68.1%                      | 99.2%       | 98.6%          |
| 11        | 4           | 582     | 0.0%            | 0.0%            | 0.0%            | 68.9%                      | 99.8%       | 95.7%          |
| 1         | 8           | 597     | 100.0%          | 100.0%          | 100.0%          | 15.0%                      | 0.4%        | 0.0%           |
| 3         | 8           | 597     | 98.5%           | 2.5%            | 99.2%           | 29.7%                      | 3.5%        | 1.5%           |
| 5         | 8           | 597     | 53.1%           | 0.0%            | 62.6%           | 44.0%                      | 33.3%       | 55.9%          |
| 7         | 8           | 597     | 32.2%           | 0.0%            | 34.7%           | 48.3%                      | 63.2%       | 79.4%          |
| 9         | 8           | 597     | 22.8%           | 0.0%            | 21.4%           | 50.5%                      | 78.5%       | 88.1%          |
| 11        | 8           | 597     | 20.3%           | 0.0%            | 17.4%           | 51.0%                      | 84.1%       | 89.1%          |

## Raid curve by Boss Rank (journey servers)

Seed "leet", 12 weeks, 60 servers per mix, allowance income. Festival weeks fight an eased boss; the rank tables count normal weeks only.

### casual-heavy (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 98.3%   | 41.7%   | 98.3%      | 5.1%        | 1.7%     | 0.0%            | 13        |
| 2    | 60    | 1.8  | 38.3%   | 36.7%   | 38.3%      | 62.4%       | 58.3%    | 0.0%            | 10        |
| 3    | 60    | 1.8  | 41.7%   | 38.3%   | 41.7%      | 58.0%       | 60.0%    | 1.7%            | 13        |
| 4    | 60    | 1.8  | 60.0%   | 41.7%   | 58.3%      | 40.6%       | 43.3%    | 1.7%            | 12        |
| 5    | 60    | 2.0  | 70.0%   | 40.0%   | 73.3%      | 25.6%       | 31.7%    | 5.0%            | 12        |
| 6    | 60    | 2.3  | 68.3%   | 35.0%   | 73.3%      | 29.0%       | 33.3%    | 6.7%            | 13        |
| 7    | 60    | 2.6  | 60.0%   | 18.3%   | 58.3%      | 38.9%       | 45.0%    | 3.3%            | 10        |
| 8    | 60    | 2.9  | 56.7%   | 23.3%   | 56.7%      | 39.4%       | 48.3%    | 5.0%            | 13        |
| 9    | 60    | 3.0  | 63.3%   | 20.0%   | 68.3%      | 27.3%       | 41.7%    | 10.0%           | 12        |
| 10   | 60    | 3.3  | 58.3%   | 20.0%   | 63.3%      | 36.3%       | 48.3%    | 11.7%           | 12        |
| 11   | 60    | 3.5  | 75.0%   | 21.7%   | 76.7%      | 27.5%       | 33.3%    | 10.0%           | 13        |
| 12   | 60    | 3.9  | 60.0%   | 10.0%   | 60.0%      | 38.0%       | 46.7%    | 6.7%            | 10        |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 105   | 99.1%   | 71.4%   | 99.1%      | 4.6%        | 0.9%     | 0.0%            | 18.3%                      |
| 2    | 215   | 46.1%   | 0.5%    | 48.4%      | 51.6%       | 55.8%    | 5.1%            | 47.9%                      |
| 3    | 180   | 42.2%   | 0.0%    | 46.7%      | 49.6%       | 65.6%    | 12.2%           | 46.5%                      |
| 4    | 63    | 44.4%   | 0.0%    | 39.7%      | 58.7%       | 66.7%    | 6.3%            | 46.7%                      |
| 5    | 14    | 0.0%    | 0.0%    | 0.0%       | 94.6%       | 100.0%   | 0.0%            | 57.6%                      |

Week 1 (rank 1): finale 98.3% (Phase 1 98.3%, Phase 2 41.7%). All normal weeks: Phase 1 53.2%, Phase 2 13.2%, finale 54.9%, knocked out 44.3%, won in overtime 6.4%. Mean rank after the last week: 4.13.

### default (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 100.0%  | 100.0%  | 100.0%     | 0.8%        | 0.0%     | 0.0%            | 12        |
| 2    | 60    | 1.8  | 55.0%   | 41.7%   | 63.3%      | 38.9%       | 41.7%    | 5.0%            | 13        |
| 3    | 60    | 2.0  | 90.0%   | 48.3%   | 91.7%      | 10.6%       | 13.3%    | 5.0%            | 16        |
| 4    | 60    | 2.4  | 76.7%   | 28.3%   | 81.7%      | 19.0%       | 23.3%    | 5.0%            | 10        |
| 5    | 60    | 2.9  | 78.3%   | 20.0%   | 76.7%      | 22.1%       | 28.3%    | 5.0%            | 9         |
| 6    | 60    | 3.3  | 88.3%   | 20.0%   | 93.3%      | 10.8%       | 13.3%    | 6.7%            | 12        |
| 7    | 60    | 3.9  | 86.7%   | 13.3%   | 88.3%      | 13.7%       | 20.0%    | 8.3%            | 13        |
| 8    | 60    | 4.3  | 86.7%   | 10.0%   | 88.3%      | 12.2%       | 16.7%    | 5.0%            | 16        |
| 9    | 60    | 4.7  | 80.0%   | 0.0%    | 90.0%      | 12.3%       | 20.0%    | 10.0%           | 10        |
| 10   | 60    | 5.2  | 70.0%   | 0.0%    | 85.0%      | 19.0%       | 26.7%    | 11.7%           | 9         |
| 11   | 60    | 5.8  | 75.0%   | 3.3%    | 81.7%      | 20.2%       | 26.7%    | 8.3%            | 12        |
| 12   | 60    | 6.2  | 76.7%   | 0.0%    | 85.0%      | 19.2%       | 21.7%    | 6.7%            | 13        |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 80    | 100.0%  | 100.0%  | 100.0%     | 1.8%        | 0.0%     | 0.0%            | 15.0%                      |
| 2    | 109   | 73.4%   | 3.7%    | 78.9%      | 25.6%       | 26.6%    | 5.5%            | 36.3%                      |
| 3    | 109   | 68.8%   | 0.0%    | 73.4%      | 25.2%       | 34.9%    | 8.3%            | 40.8%                      |
| 4    | 103   | 79.6%   | 0.0%    | 84.5%      | 16.0%       | 25.2%    | 9.7%            | 37.7%                      |
| 5    | 97    | 71.1%   | 0.0%    | 83.5%      | 18.1%       | 30.9%    | 14.4%           | 38.8%                      |
| 6    | 53    | 66.0%   | 0.0%    | 77.4%      | 23.7%       | 32.1%    | 9.4%            | 39.5%                      |
| 7    | 22    | 59.1%   | 0.0%    | 68.2%      | 43.7%       | 40.9%    | 9.1%            | 40.0%                      |
| 8    | 2     | 0.0%    | 0.0%    | 0.0%       | 91.7%       | 100.0%   | 0.0%            | 51.0%                      |

Week 1 (rank 1): finale 100.0% (Phase 1 100.0%, Phase 2 100.0%). All normal weeks: Phase 1 75.5%, Phase 2 14.6%, finale 81.7%, knocked out 20.0%, won in overtime 8.0%. Mean rank after the last week: 6.62.

### committed (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 100.0%  | 100.0%  | 100.0%     | 0.8%        | 0.0%     | 0.0%            | 10        |
| 2    | 60    | 1.8  | 80.0%   | 31.7%   | 96.7%      | 8.2%        | 8.3%     | 5.0%            | 8         |
| 3    | 60    | 2.5  | 88.3%   | 43.3%   | 91.7%      | 8.5%        | 15.0%    | 6.7%            | 17        |
| 4    | 60    | 2.9  | 91.7%   | 35.0%   | 90.0%      | 10.9%       | 10.0%    | 0.0%            | 14        |
| 5    | 60    | 3.3  | 95.0%   | 20.0%   | 96.7%      | 5.9%        | 3.3%     | 0.0%            | 11        |
| 6    | 60    | 3.9  | 86.7%   | 8.3%    | 90.0%      | 12.6%       | 13.3%    | 3.3%            | 10        |
| 7    | 60    | 4.5  | 96.7%   | 11.7%   | 98.3%      | 3.1%        | 1.7%     | 0.0%            | 8         |
| 8    | 60    | 5.2  | 96.7%   | 3.3%    | 100.0%     | 3.5%        | 3.3%     | 3.3%            | 17        |
| 9    | 60    | 5.6  | 95.0%   | 5.0%    | 98.3%      | 3.5%        | 3.3%     | 1.7%            | 14        |
| 10   | 60    | 6.2  | 80.0%   | 1.7%    | 95.0%      | 11.8%       | 18.3%    | 13.3%           | 11        |
| 11   | 60    | 6.7  | 91.7%   | 3.3%    | 95.0%      | 7.1%        | 6.7%     | 1.7%            | 10        |
| 12   | 60    | 7.3  | 86.7%   | 5.0%    | 90.0%      | 13.3%       | 11.7%    | 1.7%            | 8         |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 68    | 100.0%  | 100.0%  | 100.0%     | 1.5%        | 0.0%     | 0.0%            | 15.0%                      |
| 2    | 83    | 85.5%   | 12.0%   | 97.6%      | 7.8%        | 6.0%     | 3.6%            | 31.1%                      |
| 3    | 89    | 88.8%   | 1.1%    | 92.1%      | 10.6%       | 13.5%    | 5.6%            | 35.6%                      |
| 4    | 93    | 80.7%   | 1.1%    | 86.0%      | 13.2%       | 17.2%    | 3.2%            | 35.7%                      |
| 5    | 82    | 96.3%   | 1.2%    | 97.6%      | 2.8%        | 3.7%     | 1.2%            | 33.9%                      |
| 6    | 82    | 90.2%   | 4.9%    | 97.6%      | 4.0%        | 9.8%     | 7.3%            | 32.5%                      |
| 7    | 61    | 88.5%   | 3.3%    | 93.4%      | 11.1%       | 8.2%     | 1.6%            | 31.0%                      |
| 8    | 24    | 70.8%   | 0.0%    | 79.2%      | 27.4%       | 25.0%    | 4.2%            | 37.4%                      |

Week 1 (rank 1): finale 100.0% (Phase 1 100.0%, Phase 2 100.0%). All normal weeks: Phase 1 88.8%, Phase 2 14.9%, finale 94.0%, knocked out 8.3%, won in overtime 3.4%. Mean rank after the last week: 7.98.

## Supplies (journey servers)

- **shipped**: 1 seeds x 30 servers x 12 weeks, seed "leet"

### Min-maxer

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 38.6   | 42.5   | 49.2   | 41.8    |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                 | week 4                 | week 8                  | week 12                 |
| ------- | ---------------------- | ---------------------- | ----------------------- | ----------------------- |
| shipped | 7.9 / 4.8 / 29.8 / 0.0 | 8.8 / 7.0 / 26.7 / 0.0 | 13.1 / 7.0 / 27.8 / 1.6 | 12.6 / 6.9 / 20.4 / 1.9 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1           | week 4           | week 8           | week 12           |
| ------- | ---------------- | ---------------- | ---------------- | ----------------- |
| shipped | 29.8 / 1.5 / 0.0 | 26.7 / 2.0 / 0.0 | 27.8 / 9.9 / 0.3 | 20.4 / 10.8 / 0.6 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 3.8    | 3.3    | 3.4    | 3.2     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 18     | 39     | 18     | 20      |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 289    | 587    | 902    | 1030    |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 14.1   | 77.7   | 152.6  | 187.6   |

**Bait / Essence / glimmer / shards held**

| Variant | week 1          | week 4          | week 8          | week 12          |
| ------- | --------------- | --------------- | --------------- | ---------------- |
| shipped | 17 / 82 / 1 / 2 | 14 / 66 / 4 / 7 | 8 / 98 / 14 / 5 | 23 / 85 / 25 / 9 |

Share of days scrap blocked the gear path: shipped 10%

### Engaged

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 10.2   | 22.9   | 25.7   | 24.8    |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12               |
| ------- | --------------------- | --------------------- | --------------------- | --------------------- |
| shipped | 4.4 / 3.6 / 3.8 / 0.0 | 6.9 / 6.9 / 8.9 / 0.0 | 9.6 / 7.0 / 9.0 / 0.0 | 9.9 / 6.9 / 7.6 / 0.2 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 3.8 / 0.0 / 0.0 | 8.9 / 1.4 / 0.0 | 9.0 / 2.2 / 0.0 | 7.6 / 4.0 / 0.5 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 1.6    | 2.1    | 1.3    | 1.5     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 49     | 207    | 532    | 1046    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 226    | 465    | 611    | 814     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 6.1    | 37.0   | 72.0   | 114.0   |

**Bait / Essence / glimmer / shards held**

| Variant | week 1           | week 4            | week 8            | week 12            |
| ------- | ---------------- | ----------------- | ----------------- | ------------------ |
| shipped | 109 / 89 / 0 / 2 | 147 / 203 / 3 / 6 | 118 / 352 / 5 / 7 | 19 / 499 / 13 / 14 |

Share of days scrap blocked the gear path: shipped 1%

### Regular

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.7    | 7.2    | 7.2    | 8.0     |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12               |
| ------- | --------------------- | --------------------- | --------------------- | --------------------- |
| shipped | 0.8 / 0.4 / 0.1 / 0.0 | 2.6 / 4.5 / 0.3 / 0.0 | 2.3 / 4.5 / 0.5 / 0.0 | 3.0 / 4.4 / 0.4 / 0.0 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.1 / 0.0 / 0.0 | 0.3 / 0.0 / 0.0 | 0.5 / 0.0 / 0.0 | 0.4 / 0.0 / 0.0 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.6    | 2.9    | 3.3    | 3.2     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 20     | 99     | 219    | 344     |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 131    | 293    | 432    | 497     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 2.4    | 16.8   | 38.6   | 55.3    |

**Bait / Essence / glimmer / shards held**

| Variant | week 1           | week 4            | week 8             | week 12             |
| ------- | ---------------- | ----------------- | ------------------ | ------------------- |
| shipped | 164 / 62 / 0 / 1 | 688 / 191 / 1 / 4 | 1379 / 417 / 2 / 7 | 2077 / 691 / 3 / 10 |

Share of days scrap blocked the gear path: shipped 0%

### Drop-in

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.0    | 0.3    | 0.7    | 1.3     |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12               |
| ------- | --------------------- | --------------------- | --------------------- | --------------------- |
| shipped | 0.1 / 0.0 / 0.0 / 0.0 | 0.2 / 0.5 / 0.0 / 0.0 | 0.4 / 1.1 / 0.0 / 0.0 | 0.5 / 1.2 / 0.0 / 0.0 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.1    | 0.9    | 3.1    | 4.8     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 14     | 25     | 49     | 76      |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 65     | 153    | 222    | 276     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 1.2    | 3.9    | 11.8   | 24.6    |

**Bait / Essence / glimmer / shards held**

| Variant | week 1          | week 4            | week 8            | week 12           |
| ------- | --------------- | ----------------- | ----------------- | ----------------- |
| shipped | 46 / 41 / 0 / 0 | 182 / 106 / 0 / 1 | 370 / 210 / 0 / 2 | 562 / 345 / 1 / 3 |

Share of days scrap blocked the gear path: shipped 0%

## Creatures: catches, duplicates and talents (journey servers)

- **shipped**: 1 seeds x 12 servers x 30 weeks, seed "leet:creatures"

### Min-maxer

Weeks to complete the base catalogue (median; share who did): shipped 5 (100%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                       |
| ------- | -------- | -------- | -------- | -------- | ------- | ------------------------------------- |
| shipped | 1 / 1    | 2 / 3    | 2.5 / 4  | 8 / 10   | 2       | 23 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1           | week 4             | week 8             | week 12            | week 20            | week 30            |
| ------- | ---------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| shipped | 41.2 / 9.9 / 5.1 | 55.6 / 12.8 / 11.5 | 73.7 / 16.2 / 15.8 | 68.2 / 15.4 / 15.4 | 66.3 / 14.1 / 14.1 | 86.7 / 18.0 / 18.0 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8           | week 12          | week 20          | week 30          |
| ------- | --------------- | --------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| shipped | 1.8 / 3.3 / 0.0 | 2.5 / 5.3 / 3.8 | 1.3 / 3.0 / 11.4 | 1.0 / 2.2 / 12.3 | 1.0 / 0.9 / 12.2 | 0.8 / 0.3 / 17.0 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 5.7    | 0.9    | 0.0    | 0.0     | 0.0     | 0.0     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.8 | 0.5 / 1.3 | 0.0 / 1.8 | 0.0 / 1.8 | 0.0 / 2.3 | 0.0 / 2.5 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 5.7    | 10.9   | 12.0   | 12.0    | 12.0    | 12.0    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1     | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | ---------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 14.0 / 9.0 | 21.0 / 20.0 | 30.0 / 25.5 | 30.0 / 30.0 | 30.0 / 30.0 | 30.0 / 30.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1                   | week 4                   | week 8                    | week 12                   | week 20                    | week 30                    |
| ------- | ------------------------ | ------------------------ | ------------------------- | ------------------------- | -------------------------- | -------------------------- |
| shipped | 5795 / 5645 / 3513 / 632 | 6618 / 5261 / 3375 / 929 | 7656 / 4923 / 3318 / 1321 | 9496 / 2694 / 3093 / 1261 | 10543 / 2155 / 3386 / 1386 | 11935 / 1946 / 3353 / 1795 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1            | week 4            | week 8            | week 12          | week 20          | week 30          |
| ------- | ----------------- | ----------------- | ----------------- | ---------------- | ---------------- | ---------------- |
| shipped | 43.3 / 38.8 / 1.3 | 14.2 / 25.2 / 1.4 | 14.3 / 23.6 / 0.7 | 7.0 / 21.1 / 0.7 | 8.3 / 20.3 / 0.2 | 7.3 / 20.0 / 0.5 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1             | week 4             | week 8             | week 12            | week 20            | week 30            |
| ------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| shipped | 331 / 263 / 67 / 0 | 334 / 275 / 65 / 8 | 331 / 324 / 41 / 2 | 328 / 316 / 57 / 6 | 327 / 302 / 60 / 3 | 327 / 298 / 72 / 5 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 5.4 / 5.6 | 3.9 / 4.2 | 2.7 / 2.2 | 2.6 / 2.5 | 3.2 / 3.0 | 3.8 / 3.8 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.6 / 0.0 | 0.5 / 0.8 | 0.8 / 0.2 | 0.8 / 0.6 | 0.9 / 0.3 | 0.5 / 0.5 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 3.2%   | 5.3%   | 5.7%   | 10.7%   | 7.1%    | -2.1%   |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 266    | 604    | 913    | 1027    | 1121    | 1189    |

### Engaged

Weeks to complete the base catalogue (median; share who did): shipped 8 (100%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                       |
| ------- | -------- | -------- | -------- | -------- | ------- | ------------------------------------- |
| shipped | 1 / 1    | 2 / 3    | 3 / 5    | 10 / 16  | 2       | 30 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1           | week 4           | week 8             | week 12            | week 20            | week 30            |
| ------- | ---------------- | ---------------- | ------------------ | ------------------ | ------------------ | ------------------ |
| shipped | 18.2 / 4.1 / 1.5 | 27.1 / 6.1 / 4.7 | 51.0 / 11.4 / 10.5 | 47.7 / 10.7 / 10.7 | 49.7 / 10.9 / 10.9 | 57.9 / 12.4 / 12.4 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30          |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | ---------------- |
| shipped | 0.7 / 0.8 / 0.0 | 1.4 / 2.9 / 0.4 | 1.3 / 4.1 / 5.1 | 1.4 / 3.2 / 6.2 | 1.3 / 1.4 / 8.3 | 0.9 / 0.5 / 11.0 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 3.7    | 0.9    | 0.8    | 0.0     | 0.0     | 0.0     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.4 | 0.0 / 0.9 | 0.4 / 1.6 | 0.0 / 1.6 | 0.0 / 1.6 | 0.0 / 1.9 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 3.7    | 8.6    | 11.5   | 12.0    | 12.0    | 12.0    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1      | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 11.0 / 10.0 | 20.0 / 19.0 | 27.0 / 20.0 | 30.0 / 22.5 | 30.0 / 30.0 | 30.0 / 30.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1                  | week 4                   | week 8                   | week 12                  | week 20                  | week 30                  |
| ------- | ----------------------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| shipped | 2980 / 4008 / 3176 / 62 | 3847 / 5219 / 3375 / 217 | 7843 / 3878 / 3318 / 214 | 6815 / 3077 / 3093 / 260 | 8414 / 2299 / 3386 / 393 | 9816 / 1883 / 3353 / 332 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1            | week 4            | week 8            | week 12           | week 20          | week 30          |
| ------- | ----------------- | ----------------- | ----------------- | ----------------- | ---------------- | ---------------- |
| shipped | 29.4 / 26.4 / 0.7 | 19.8 / 25.6 / 1.3 | 13.3 / 25.3 / 1.3 | 10.5 / 21.1 / 1.3 | 5.9 / 17.8 / 0.2 | 9.0 / 21.9 / 0.6 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1             | week 4             | week 8             | week 12            | week 20            | week 30            |
| ------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| shipped | 299 / 168 / 38 / 0 | 305 / 245 / 60 / 3 | 301 / 311 / 45 / 1 | 299 / 271 / 36 / 5 | 300 / 272 / 50 / 3 | 295 / 306 / 42 / 5 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 2.6 / 2.9 | 4.0 / 4.0 | 2.7 / 2.8 | 1.9 / 1.9 | 1.6 / 1.6 | 1.3 / 1.4 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.3 / 0.0 | 0.4 / 0.3 | 0.6 / 0.1 | 0.6 / 0.5 | 0.5 / 0.3 | 0.9 / 0.5 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.1%   | 2.4%   | 4.8%   | 5.1%    | 8.1%    | 9.1%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 210    | 468    | 622    | 812     | 1008    | 1073    |

### Regular

Weeks to complete the base catalogue (median; share who did): shipped 24 (86%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                       |
| ------- | -------- | -------- | -------- | -------- | ------- | ------------------------------------- |
| shipped | 2 / 2    | 4 / 9.5  | 7 / 13   | 25 / -   | 4       | 77 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1          | week 4          | week 8           | week 12         | week 20          | week 30          |
| ------- | --------------- | --------------- | ---------------- | --------------- | ---------------- | ---------------- |
| shipped | 3.3 / 1.4 / 0.0 | 9.1 / 2.6 / 1.2 | 10.5 / 2.4 / 1.8 | 8.7 / 1.7 / 1.4 | 11.4 / 2.9 / 2.7 | 12.9 / 3.1 / 3.1 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.5 / 0.7 / 0.0 | 0.6 / 1.0 / 0.3 | 0.6 / 0.7 / 0.1 | 0.6 / 1.8 / 0.4 | 0.2 / 1.1 / 1.8 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.3    | 0.9    | 0.4    | 0.3     | 0.2     | 0.0     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.3 | 0.0 / 0.4 | 0.1 / 0.3 | 0.1 / 0.4 | 0.0 / 0.5 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.3    | 4.6    | 6.8    | 8.1     | 10.5    | 11.9    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1    | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | --------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 9.0 / 6.0 | 16.0 / 10.0 | 20.0 / 13.0 | 20.0 / 19.0 | 26.5 / 20.0 | 30.0 / 25.5 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1               | week 4                 | week 8                 | week 12               | week 20               | week 30                |
| ------- | -------------------- | ---------------------- | ---------------------- | --------------------- | --------------------- | ---------------------- |
| shipped | 292 / 526 / 1804 / 7 | 568 / 2538 / 3058 / 14 | 656 / 1794 / 2914 / 14 | 573 / 1427 / 2764 / 8 | 881 / 1352 / 3304 / 7 | 1050 / 1380 / 3081 / 9 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1           | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | ---------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 15.0 / 0.0 / 0.0 | 6.9 / 0.0 / 0.5 | 7.9 / 0.0 / 0.2 | 4.3 / 0.0 / 0.2 | 5.1 / 0.0 / 0.4 | 3.3 / 0.0 / 0.3 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 168 / 0 / 3 / 0 | 175 / 0 / 3 / 0 | 169 / 0 / 5 / 3 | 169 / 0 / 5 / 1 | 169 / 0 / 4 / 0 | 171 / 0 / 4 / 1 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.2 / 0.2 | 0.2 / 0.2 | 0.4 / 0.3 | 0.3 / 0.3 | 0.4 / 0.3 | 0.1 / 0.2 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.1 / 0.0 | 0.2 / 0.0 | 0.1 / 0.3 | 0.1 / 0.1 | 0.1 / 0.0 | 0.1 / 0.1 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.2%   | 2.5%   | 4.4%   | 4.9%    | 5.8%    | 7.1%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 141    | 291    | 424    | 488     | 603     | 737     |

### Drop-in

Weeks to complete the base catalogue (median; share who did): shipped never (0%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                         |
| ------- | -------- | -------- | -------- | -------- | ------- | --------------------------------------- |
| shipped | 3 / 6    | 14.5 / - | 20.5 / - | - / -    | 17      | 69.5 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.3 / 0.3 / 0.0 | 1.1 / 0.6 / 0.1 | 0.9 / 0.0 / 0.0 | 1.3 / 0.3 / 0.1 | 2.4 / 0.5 / 0.4 | 1.8 / 0.8 / 0.5 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.0 / 0.1 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.1 / 0.0 | 0.1 / 0.3 / 0.0 | 0.2 / 0.4 / 0.0 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.3    | 0.2    | 0.0    | 0.2     | 0.1     | 0.2     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.2 | 0.0 / 0.1 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.3    | 2.1    | 2.3    | 2.8     | 4.1     | 5.8     |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1    | week 4     | week 8      | week 12     | week 20     | week 30     |
| ------- | --------- | ---------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 8.0 / 4.5 | 10.0 / 6.0 | 10.0 / 10.0 | 12.0 / 10.0 | 19.0 / 10.0 | 20.0 / 10.5 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1           | week 4              | week 8              | week 12             | week 20              | week 30              |
| ------- | ---------------- | ------------------- | ------------------- | ------------------- | -------------------- | -------------------- |
| shipped | 30 / 0 / 804 / 0 | 65 / 350 / 1338 / 0 | 81 / 592 / 1228 / 0 | 79 / 566 / 1155 / 0 | 134 / 428 / 1404 / 0 | 134 / 390 / 1564 / 0 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 5.0 / 0.0 / 0.0 | 5.6 / 0.0 / 0.0 | 1.0 / 0.0 / 0.1 | 1.8 / 0.0 / 0.3 | 2.2 / 0.0 / 0.2 | 1.4 / 0.0 / 0.0 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1         | week 4         | week 8         | week 12        | week 20        | week 30        |
| ------- | -------------- | -------------- | -------------- | -------------- | -------------- | -------------- |
| shipped | 48 / 0 / 0 / 0 | 48 / 0 / 0 / 0 | 46 / 0 / 0 / 0 | 51 / 0 / 0 / 0 | 43 / 0 / 0 / 0 | 55 / 0 / 0 / 0 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.1 / 0.0 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 0.9%   | 2.2%   | 3.1%   | 3.2%    | 3.5%    | 5.3%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 70     | 170    | 225    | 266     | 385     | 478     |

## Gear share of fight-scored power (journey servers)

20 servers of the default journey mix, 30 weeks, seed "leet:gear". Each cell is the median share of the team's fight-scored power that its worn gear gives, with the design's range under it.

| Profile   | Players | Week 2               | Week 8                 | Week 20                | Week 30                |
| --------- | ------- | -------------------- | ---------------------- | ---------------------- | ---------------------- |
| Min-maxer | 20      | 7.2% (5.0% to 10.0%) | 23.9% (15.0% to 22.0%) | 32.0% (25.0% to 32.0%) | 31.8% (33.0% to 40.0%) |
| Engaged   | 60      | 4.5% (5.0% to 10.0%) | 13.5% (15.0% to 22.0%) | 24.7% (25.0% to 32.0%) | 27.1% (33.0% to 40.0%) |
| Regular   | 60      | 2.6% (3.0% to 6.0%)  | 9.0% (10.0% to 15.0%)  | 17.5% (18.0% to 24.0%) | 22.4% (28.0% to 34.0%) |
| Drop-in   | 40      | 4.7% (0.0% to 3.0%)  | 4.6% (5.0% to 8.0%)    | 13.0% (10.0% to 15.0%) | 19.4% (15.0% to 20.0%) |

## Bosses

### Tidal Colossus (tide)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 30% / 85% / 100%           | 1.58                | 100.0%           |
| 5       | 200  | 4.4           | 80.5%         | 2.5%          | 80.0%      | 29% / 64% / 97%            | 2.43                | 32.0%            |
| 10      | 200  | 9.1           | 76.0%         | 0.0%          | 77.5%      | 29% / 61% / 97%            | 4.87                | 17.8%            |
| 15      | 200  | 13.6          | 72.0%         | 0.0%          | 78.5%      | 29% / 60% / 98%            | 6.71                | 13.5%            |

Typical group (5-10 signed up, 299 runs): Phase 1 77.9%, Phase 2 0.7%, finale 77.6%.

### Cinder Wyrm (ember)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 99.5%         | 100.0%     | 30% / 85% / 100%           | 0.77                | 100.0%           |
| 5       | 200  | 4.4           | 84.0%         | 0.0%          | 81.5%      | 30% / 62% / 99%            | 1.17                | 31.4%            |
| 10      | 200  | 9.1           | 63.0%         | 0.0%          | 70.5%      | 29% / 59% / 97%            | 2.64                | 16.6%            |
| 15      | 200  | 13.6          | 56.0%         | 0.5%          | 67.5%      | 28% / 58% / 97%            | 4.13                | 12.2%            |

Typical group (5-10 signed up, 296 runs): Phase 1 68.6%, Phase 2 0.0%, finale 73.0%.

### Thornmother (grove)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 85.0%         | 100.0%     | 30% / 84% / 100%           | 1.12                | 100.0%           |
| 5       | 200  | 4.4           | 79.0%         | 0.5%          | 78.5%      | 29% / 63% / 97%            | 2.23                | 31.8%            |
| 10      | 200  | 9.1           | 68.5%         | 0.0%          | 75.0%      | 29% / 60% / 98%            | 4.71                | 17.6%            |
| 15      | 200  | 13.5          | 57.0%         | 0.0%          | 64.5%      | 28% / 58% / 97%            | 6.41                | 12.6%            |

Typical group (5-10 signed up, 294 runs): Phase 1 70.4%, Phase 2 0.3%, finale 74.8%.

### Storm Sovereign (spark)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 30% / 85% / 100%           | 1.51                | 100.0%           |
| 5       | 200  | 4.3           | 89.5%         | 8.0%          | 88.0%      | 30% / 68% / 99%            | 2.38                | 31.9%            |
| 10      | 200  | 9.0           | 76.5%         | 0.0%          | 79.0%      | 29% / 62% / 97%            | 4.92                | 18.0%            |
| 15      | 200  | 13.4          | 64.0%         | 0.0%          | 71.5%      | 29% / 59% / 97%            | 6.62                | 13.6%            |

Typical group (5-10 signed up, 291 runs): Phase 1 79.7%, Phase 2 2.4%, finale 80.8%.

## Fairness and contribution

| Archetype  | Average share of contribution (groups of 5+) | Average Essence per raid week |
| ---------- | -------------------------------------------- | ----------------------------- |
| Casual     | 7.0%                                         | 47.3                          |
| Daily      | 11.5%                                        | 71.0                          |
| Top earner | 11.3%                                        | 60.4                          |
| Newcomer   | 7.0%                                         | 49.4                          |

## Archetype progression

Averages over the 24 default-server sims (10 players each).

### Casual

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 72      | 100         | 1             | 0               | 2.0           | 113         | 7.2       | 0.0     | 48.3           | 48.3         | 0.04             | 0.7  |
| 2    | 72      | 100         | 15            | 0               | 2.3           | 156         | 9.2       | 0.0     | 25.0           | 73.9         | 0.07             | 0.9  |
| 3    | 72      | 99          | 16            | 0               | 3.0           | 197         | 10.4      | 0.0     | 41.0           | 116.3        | 0.14             | 1.3  |
| 4    | 72      | 103         | 22            | 0               | 3.9           | 226         | 11.3      | 0.0     | 37.8           | 155.2        | 0.15             | 1.8  |
| 5    | 72      | 103         | 24            | 0               | 4.5           | 251         | 12.8      | 0.1     | 48.3           | 203.6        | 0.24             | 2.2  |
| 6    | 72      | 103         | 24            | 0               | 5.3           | 282         | 14.4      | 0.4     | 38.8           | 239.2        | 0.28             | 2.7  |
| 7    | 72      | 103         | 23            | 0               | 5.9           | 317         | 16.0      | 0.7     | 56.2           | 290.6        | 0.39             | 2.9  |
| 8    | 72      | 103         | 21            | 0               | 6.6           | 351         | 17.4      | 1.0     | 57.6           | 343.2        | 0.49             | 3.1  |
| 9    | 72      | 103         | 22            | 0               | 7.0           | 381         | 18.5      | 1.2     | 56.4           | 394.9        | 0.58             | 3.3  |
| 10   | 72      | 104         | 20            | 0               | 7.3           | 407         | 19.2      | 1.4     | 59.3           | 450.1        | 0.68             | 3.5  |
| 11   | 72      | 104         | 19            | 0               | 7.6           | 433         | 19.6      | 1.6     | 63.9           | 508.3        | 0.81             | 3.5  |
| 12   | 72      | 104         | 19            | 0               | 7.8           | 453         | 20.0      | 1.7     | 54.6           | 558.5        | 0.89             | 3.6  |

### Daily

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 96      | 318         | 64            | 0               | 4.2           | 219         | 11.0      | 0.0     | 87.5           | 90.9         | 0.06             | 0.9  |
| 2    | 96      | 318         | 75            | 0               | 6.6           | 315         | 15.0      | 0.8     | 50.4           | 88.0         | 0.09             | 1.5  |
| 3    | 96      | 318         | 73            | 0               | 8.0           | 415         | 18.0      | 1.8     | 68.5           | 80.7         | 0.16             | 2.2  |
| 4    | 96      | 328         | 75            | 0               | 9.0           | 496         | 19.9      | 2.2     | 67.7           | 78.9         | 0.22             | 2.7  |
| 5    | 96      | 328         | 78            | 0               | 10.1          | 552         | 21.1      | 2.5     | 80.9           | 90.5         | 0.32             | 3.1  |
| 6    | 96      | 328         | 73            | 0               | 10.9          | 602         | 22.6      | 2.8     | 85.6           | 88.3         | 0.48             | 3.5  |
| 7    | 96      | 328         | 72            | 0               | 11.4          | 655         | 24.2      | 3.1     | 82.8           | 90.8         | 0.59             | 3.8  |
| 8    | 96      | 329         | 73            | 0               | 11.8          | 707         | 25.9      | 3.4     | 81.6           | 102.0        | 0.72             | 3.9  |
| 9    | 96      | 328         | 74            | 0               | 12.0          | 755         | 27.4      | 3.9     | 87.1           | 119.1        | 0.88             | 3.8  |
| 10   | 96      | 329         | 75            | 0               | 12.0          | 805         | 28.8      | 4.3     | 99.1           | 129.6        | 1.10             | 3.0  |
| 11   | 96      | 328         | 75            | 0               | 12.0          | 848         | 29.7      | 4.6     | 96.5           | 138.4        | 1.29             | 2.6  |
| 12   | 96      | 328         | 73            | 0               | 12.0          | 880         | 29.9      | 4.9     | 94.8           | 131.9        | 1.45             | 2.5  |

### Top earner

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 48      | 340         | 63            | 0               | 3.7           | 222         | 11.3      | 0.0     | 84.0           | 87.5         | 0.02             | 1.0  |
| 2    | 48      | 340         | 81            | 0               | 6.1           | 325         | 15.4      | 1.0     | 54.5           | 88.8         | 0.08             | 1.4  |
| 3    | 48      | 340         | 79            | 0               | 7.9           | 416         | 18.2      | 1.7     | 68.3           | 90.9         | 0.17             | 2.1  |
| 4    | 48      | 352         | 83            | 0               | 9.1           | 488         | 19.9      | 2.1     | 56.1           | 76.7         | 0.17             | 2.9  |
| 5    | 48      | 352         | 82            | 0               | 10.0          | 562         | 21.0      | 2.6     | 78.2           | 94.5         | 0.25             | 3.4  |
| 6    | 48      | 352         | 81            | 0               | 10.7          | 611         | 22.5      | 2.9     | 79.9           | 90.7         | 0.38             | 3.7  |
| 7    | 48      | 352         | 81            | 0               | 11.4          | 664         | 24.3      | 3.2     | 86.5           | 103.7        | 0.52             | 3.8  |
| 8    | 48      | 352         | 81            | 0               | 11.8          | 720         | 26.0      | 3.6     | 89.4           | 118.1        | 0.73             | 3.5  |
| 9    | 48      | 352         | 80            | 0               | 12.0          | 769         | 27.5      | 4.0     | 118.2          | 145.7        | 1.10             | 2.1  |
| 10   | 48      | 352         | 80            | 0               | 12.0          | 815         | 28.9      | 4.4     | 87.7           | 123.4        | 1.27             | 2.2  |
| 11   | 48      | 352         | 78            | 0               | 12.0          | 856         | 29.7      | 4.6     | 80.3           | 110.6        | 1.38             | 2.5  |
| 12   | 48      | 352         | 83            | 0               | 12.0          | 893         | 30.0      | 4.9     | 89.4           | 110.8        | 1.50             | 2.7  |

### Newcomer

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 4    | 24      | 328         | 68            | 0               | 3.9           | 217         | 11.3      | 0.0     | 55.8           | 59.6         | 0.04             | 0.8  |
| 5    | 24      | 329         | 77            | 0               | 6.1           | 323         | 15.3      | 1.1     | 62.3           | 79.3         | 0.08             | 1.5  |
| 6    | 24      | 328         | 78            | 0               | 7.6           | 421         | 18.3      | 2.0     | 63.0           | 75.1         | 0.13             | 2.4  |
| 7    | 24      | 328         | 76            | 0               | 9.1           | 484         | 20.1      | 2.1     | 61.3           | 78.3         | 0.13             | 3.3  |
| 8    | 24      | 329         | 72            | 0               | 10.2          | 538         | 21.6      | 2.4     | 57.2           | 75.7         | 0.13             | 4.2  |
| 9    | 24      | 328         | 76            | 0               | 10.9          | 583         | 23.0      | 2.8     | 68.5           | 71.8         | 0.17             | 4.9  |
| 10   | 24      | 329         | 76            | 0               | 11.3          | 638         | 24.7      | 3.0     | 78.6           | 96.6         | 0.29             | 5.0  |
| 11   | 24      | 329         | 73            | 0               | 11.8          | 687         | 26.0      | 3.4     | 75.8           | 98.2         | 0.38             | 5.3  |
| 12   | 24      | 329         | 70            | 0               | 12.0          | 742         | 27.5      | 3.8     | 115.5          | 131.7        | 0.71             | 3.6  |

## Gear and crafting

Gear power is the power the worn items add to the top 3 creatures (`applyGear`, floored like the fight slots), and the share is that power over the top-3 power (gear included). The "today" columns are the same sims and seeds played without gear.

### Casual

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 2.8        | 2.7%       | 1.0                | 0.0            | 1.0                   | 48           | 9.8        |
| 2    | 5.4        | 3.6%       | 3.7                | 1.0            | 1.0                   | 74           | 18.0       |
| 3    | 7.2        | 3.6%       | 5.0                | 1.0            | 1.0                   | 116          | 36.6       |
| 4    | 9.5        | 4.1%       | 7.0                | 1.0            | 1.0                   | 155          | 55.4       |
| 5    | 11.6       | 4.5%       | 9.3                | 1.0            | 1.3                   | 204          | 71.9       |
| 6    | 18.7       | 6.5%       | 15.2               | 1.1            | 1.6                   | 239          | 88.3       |
| 7    | 24.6       | 7.6%       | 21.3               | 1.3            | 1.9                   | 291          | 105.6      |
| 8    | 30.7       | 8.6%       | 26.8               | 1.6            | 2.0                   | 343          | 121.1      |
| 9    | 35.3       | 9.1%       | 31.9               | 1.8            | 2.1                   | 395          | 137.3      |
| 10   | 39.9       | 9.7%       | 36.5               | 2.0            | 2.4                   | 450          | 152.2      |
| 11   | 46.2       | 10.5%      | 42.1               | 2.2            | 2.7                   | 508          | 169.3      |
| 12   | 51.3       | 11.1%      | 46.2               | 2.5            | 2.8                   | 558          | 185.5      |

### Daily

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 7.9        | 3.6%       | 6.2                | 2.2            | 1.7                   | 91           | 33.2       |
| 2    | 22.1       | 6.9%       | 22.4               | 9.5            | 3.6                   | 88           | 34.3       |
| 3    | 41.9       | 9.8%       | 38.2               | 18.1           | 4.9                   | 81           | 44.5       |
| 4    | 71.1       | 14.0%      | 54.1               | 26.4           | 5.7                   | 79           | 62.1       |
| 5    | 93.9       | 16.7%      | 63.7               | 35.6           | 6.3                   | 90           | 84.7       |
| 6    | 116.9      | 19.1%      | 73.6               | 44.9           | 6.7                   | 88           | 96.8       |
| 7    | 140.3      | 21.2%      | 82.7               | 54.5           | 7.2                   | 91           | 116.3      |
| 8    | 162.0      | 22.8%      | 90.6               | 63.2           | 7.6                   | 102          | 162.5      |
| 9    | 176.8      | 23.4%      | 97.4               | 69.7           | 8.0                   | 119          | 246.5      |
| 10   | 194.8      | 24.2%      | 103.5              | 75.1           | 8.2                   | 130          | 354.9      |
| 11   | 209.0      | 24.7%      | 108.4              | 80.5           | 8.6                   | 138          | 471.7      |
| 12   | 219.4      | 24.9%      | 112.2              | 85.5           | 8.9                   | 132          | 594.8      |

### Top earner

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 6.6        | 3.1%       | 5.0                | 2.0            | 1.6                   | 87           | 34.1       |
| 2    | 23.3       | 7.0%       | 21.7               | 9.3            | 3.5                   | 89           | 36.9       |
| 3    | 42.1       | 10.0%      | 37.2               | 17.3           | 4.9                   | 91           | 48.4       |
| 4    | 61.4       | 12.4%      | 50.4               | 26.0           | 5.7                   | 77           | 66.8       |
| 5    | 91.9       | 16.1%      | 63.6               | 34.7           | 6.2                   | 94           | 91.5       |
| 6    | 109.3      | 17.5%      | 71.1               | 44.1           | 6.6                   | 91           | 106.2      |
| 7    | 134.5      | 20.0%      | 84.3               | 53.6           | 7.1                   | 104          | 125.8      |
| 8    | 157.5      | 21.6%      | 92.0               | 62.4           | 7.5                   | 118          | 169.5      |
| 9    | 177.2      | 22.9%      | 98.8               | 69.3           | 7.9                   | 146          | 249.2      |
| 10   | 191.8      | 23.4%      | 104.9              | 75.1           | 8.2                   | 123          | 350.0      |
| 11   | 204.6      | 23.9%      | 111.6              | 80.6           | 8.6                   | 111          | 460.4      |
| 12   | 216.7      | 24.2%      | 115.5              | 86.0           | 8.8                   | 111          | 577.6      |

### Newcomer

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 4    | 10.4       | 4.7%       | 6.3                | 2.3            | 1.8                   | 60           | 35.4       |
| 5    | 28.6       | 8.7%       | 23.5               | 9.4            | 3.7                   | 79           | 43.6       |
| 6    | 47.6       | 10.9%      | 39.1               | 18.0           | 4.8                   | 75           | 49.3       |
| 7    | 69.5       | 13.8%      | 49.4               | 26.8           | 5.7                   | 78           | 61.7       |
| 8    | 91.9       | 16.7%      | 62.3               | 36.5           | 6.2                   | 76           | 73.4       |
| 9    | 108.0      | 18.1%      | 74.0               | 45.3           | 6.7                   | 72           | 86.0       |
| 10   | 133.3      | 20.6%      | 82.4               | 55.5           | 7.0                   | 97           | 100.7      |
| 11   | 153.8      | 22.2%      | 95.1               | 65.7           | 7.6                   | 98           | 130.6      |
| 12   | 177.9      | 23.9%      | 103.6              | 72.8           | 7.8                   | 132          | 200.6      |

### Daily players with gear and without (today)

| Week | Essence held | Essence held today | Top-3 power | Top-3 power today |
| ---- | ------------ | ------------------ | ----------- | ----------------- |
| 1    | 91           | 86                 | 219         | 196               |
| 2    | 88           | 125                | 315         | 243               |
| 3    | 81           | 139                | 415         | 341               |
| 4    | 79           | 188                | 496         | 400               |
| 5    | 90           | 253                | 552         | 429               |
| 6    | 88           | 304                | 602         | 455               |
| 7    | 91           | 358                | 655         | 482               |
| 8    | 102          | 404                | 707         | 519               |
| 9    | 119          | 475                | 755         | 547               |
| 10   | 130          | 543                | 805         | 572               |
| 11   | 138          | 595                | 848         | 599               |
| 12   | 132          | 645                | 880         | 628               |

### What the team wears (end of week 8)

| Archetype  | Common | Rare | Epic | Festival | Average item level | Power added per item | Bag | Blueprints | Scrap | Shards | Glimmer |
| ---------- | ------ | ---- | ---- | -------- | ------------------ | -------------------- | --- | ---------- | ----- | ------ | ------- |
| Casual     | 67%    | 25%  | 7%   | 11%      | 4.6                | 11.0                 | 2.8 | 3.5        | 121   | 5      | 1.8     |
| Daily      | 39%    | 51%  | 9%   | 7%       | 10.3               | 54.0                 | 4.2 | 10.3       | 163   | 7      | 7.5     |
| Top earner | 42%    | 50%  | 8%   | 5%       | 10.3               | 52.5                 | 4.2 | 10.1       | 169   | 6      | 6.8     |
| Newcomer   | 55%    | 42%  | 3%   | 4%       | 8.0                | 30.6                 | 4.0 | 5.4        | 73    | 6      | 4.8     |

## Daily dungeon

Every player with 3 creatures walks the day's map once on each day they check in (casuals on their leet days), with their 3 strongest creatures: 7 floors with the camp on floor 3 (floors count from 0; every path meets there) and the room boss last. A run is cleared when the boss is beaten, ends at home when the player heads home from the camp, and in a defeat when a fight is lost. Depth 1 to 24 are listed; only a clear moves the depth.

### How runs end

| Archetype  | Runs | Cleared | Home | Defeat | Fights / run | Elites / run | Keepsakes / run | Pack found | Pack kept | Reached the camp |
| ---------- | ---- | ------- | ---- | ------ | ------------ | ------------ | --------------- | ---------- | --------- | ---------------- |
| Casual     | 1433 | 61%     | 9%   | 30%    | 4.70         | 0.60         | 1.41            | 4.72       | 4.19      | 96%              |
| Daily      | 7777 | 28%     | 19%  | 53%    | 4.17         | 0.46         | 1.09            | 4.22       | 3.35      | 89%              |
| Top earner | 3860 | 28%     | 19%  | 53%    | 4.19         | 0.46         | 1.04            | 4.24       | 3.37      | 89%              |
| Newcomer   | 1440 | 33%     | 17%  | 50%    | 4.26         | 0.50         | 1.21            | 4.32       | 3.50      | 91%              |

Fights count a lost one; the pack is Bait, Essence and scrap added up (the supply, experience and the boss chest are not in it). Of the runs that reached the camp: Casual rest 2%, swap 16%, keepsake 73%, home 9%; Daily rest 3%, swap 24%, keepsake 53%, home 21%; Top earner rest 3%, swap 29%, keepsake 47%, home 21%; Newcomer rest 3%, swap 19%, keepsake 60%, home 19%.

### Clear rate by depth

| Depth | Casual    | Daily     | Top earner |
| ----- | --------- | --------- | ---------- |
| 1     | 97% (74)  | 83% (115) | 100% (48)  |
| 2     | 97% (74)  | 85% (113) | 96% (50)   |
| 3     | 95% (76)  | 85% (113) | 96% (50)   |
| 4     | 89% (81)  | 81% (119) | 92% (52)   |
| 5     | 79% (91)  | 75% (128) | 87% (55)   |
| 6     | 76% (95)  | 61% (158) | 79% (61)   |
| 7     | 69% (105) | 63% (153) | 65% (74)   |
| 8     | 59% (122) | 47% (205) | 47% (102)  |
| 9     | 51% (141) | 51% (190) | 47% (102)  |
| 10    | 47% (148) | 49% (195) | 44% (108)  |
| 11    | 46% (133) | 43% (225) | 46% (104)  |
| 12    | 42% (119) | 38% (256) | 34% (143)  |
| 13    | 28% (109) | 32% (299) | 36% (134)  |
| 14    | 17% (52)  | 11% (886) | 12% (409)  |
| 15    | 67% (6)   | 34% (286) | 40% (120)  |
| 16    | 14% (7)   | 28% (340) | 27% (178)  |
| 17    | -         | 26% (362) | 23% (212)  |
| 18    | -         | 23% (410) | 24% (200)  |
| 19    | -         | 20% (466) | 22% (219)  |
| 20    | -         | 18% (518) | 15% (311)  |
| 21    | -         | 12% (662) | 11% (367)  |
| 22    | -         | 18% (373) | 20% (167)  |
| 23    | -         | 15% (386) | 11% (239)  |
| 24    | -         | 13% (341) | 10% (155)  |

Runs in brackets. Players stop at the depth where they win about a fifth of their runs.

### Depth after N weeks (median, quartiles)

| Week | Casual        | Daily         | Top earner    | Newcomer      |
| ---- | ------------- | ------------- | ------------- | ------------- |
| 1    | 1 (1 to 1)    | 4 (3 to 5)    | 5 (4 to 6)    | -             |
| 2    | 1 (1 to 2)    | 9 (8 to 9)    | 9 (8 to 10)   | -             |
| 4    | 5 (4 to 5)    | 14 (13 to 14) | 14 (13 to 14) | 5 (4 to 6)    |
| 6    | 8 (7 to 8)    | 17 (14 to 19) | 17 (16 to 19) | 12 (10 to 13) |
| 8    | 10 (9 to 11)  | 20 (18 to 21) | 20 (18 to 21) | 15 (14 to 17) |
| 10   | 12 (11 to 13) | 22 (20 to 24) | 22 (21 to 23) | 19 (17 to 20) |
| 12   | 13 (12 to 14) | 24 (22 to 25) | 24 (22 to 25) | 21 (20 to 22) |

### Reward flow per player and week

| Archetype  | Runs | Cleared | Bait | Essence | Scrap | Gear items |
| ---------- | ---- | ------- | ---- | ------- | ----- | ---------- |
| Casual     | 1.66 | 1.01    | 5.2  | 1.26    | 3.7   | 0.22       |
| Daily      | 6.75 | 1.92    | 17.1 | 3.51    | 12.4  | 0.48       |
| Top earner | 6.70 | 1.90    | 17.2 | 3.48    | 12.2  | 0.47       |
| Newcomer   | 6.67 | 2.19    | 17.5 | 3.82    | 13.1  | 0.53       |

A daily player's runs from week 2 end at home 19.3% of the time and take 4.13 fights.

Dungeon Essence is 4.1% of a daily player's Essence income. Gear's share of a daily player's raid-team power at week 8 is 22.8% with the dungeon and 18.7% without it (the same sims and seeds).

## Elements

| Element | Raid slots | Pick rate |
| ------- | ---------- | --------- |
| tide    | 19764      | 29.5%     |
| ember   | 17273      | 25.8%     |
| grove   | 8019       | 12.0%     |
| spark   | 21918      | 32.7%     |

## Creatures

| Creature               | Rarity | Element | Role    | Picks | Pick rate | Average level | Average contribution | Relative to rarity median |
| ---------------------- | ------ | ------- | ------- | ----- | --------- | ------------- | -------------------- | ------------------------- |
| Ashmole                | common | ember   | support | 3373  | 5.0%      | 17.8          | 5640                 | 1.01x                     |
| Aurorix                | epic   | spark   | support | 147   | 0.2%      | 16.0          | 5741                 | 0.94x                     |
| Cindle                 | common | ember   | payoff  | 12427 | 18.6%     | 19.1          | 6227                 | 1.12x                     |
| Coralynx               | rare   | tide    | payoff  | 6373  | 9.5%      | 18.4          | 6458                 | 1.00x                     |
| Gaiadrake              | epic   | grove   | payoff  | 1310  | 2.0%      | 18.7          | 8682                 | 1.42x                     |
| Hearthshell (Festival) | epic   | ember   | guard   | 368   | 0.5%      | 14.4          | 3933                 | 0.64x                     |
| Lanternfin (Festival)  | epic   | tide    | support | 4069  | 6.1%      | 14.4          | 5203                 | 0.85x                     |
| Mistnewt               | common | tide    | guard   | 2578  | 3.8%      | 19.3          | 5245                 | 0.94x                     |
| Mossback               | rare   | grove   | setter  | 1748  | 2.6%      | 19.6          | 6339                 | 0.98x                     |
| Solmane                | epic   | ember   | setter  | 1105  | 1.6%      | 16.2          | 6135                 | 1.00x                     |
| Splashet               | common | tide    | setter  | 6744  | 10.1%     | 18.3          | 7667                 | 1.38x                     |
| Sproutle               | common | grove   | guard   | 4961  | 7.4%      | 18.8          | 4641                 | 0.83x                     |
| Stormray               | rare   | spark   | payoff  | 7337  | 11.0%     | 18.3          | 7475                 | 1.16x                     |
| Zipmouse               | common | spark   | setter  | 14434 | 21.6%     | 18.4          | 5482                 | 0.99x                     |

## Essence and jackpots

| Players | Player-weeks | Mean Essence | P10 | Median | P90 | Max |
| ------- | ------------ | ------------ | --- | ------ | --- | --- |
| 1       | 800          | 100.6        | 77  | 80     | 198 | 198 |
| 5       | 3501         | 59.8         | 0   | 55     | 163 | 201 |
| 10      | 7257         | 52.5         | 0   | 53     | 74  | 194 |
| 15      | 10822        | 50.0         | 0   | 51     | 157 | 207 |

| Source                           | Finale-win rolls | Jackpots | Rate  | Guaranteed by hard pity |
| -------------------------------- | ---------------- | -------- | ----- | ----------------------- |
| sweep, 1 players                 | 800              | 158      | 19.8% | 0                       |
| sweep, 5 players                 | 2847             | 420      | 14.8% | 0                       |
| sweep, 10 players                | 5428             | 709      | 13.1% | 0                       |
| sweep, 15 players                | 7563             | 1147     | 15.2% | 0                       |
| economy sims, 20 raid weeks each | 6025             | 809      | 13.4% | 74                      |

## Ability damage share (informational)

What abilities add to the damage dealt in the finale, measured by replaying each finale three times against a boss that cannot fall (every ability, only the basic ones, none) so all 12 rounds are played. Creature share = (all - basic only) / all; basic share = (basic only - none) / all. Creature abilities need creature level 10. Informational: the aim is a creature share of about 10-25% for a week-8 roster, not a target.

| Roster week | Group                        | Raids | Creature abilities per raid | Creature share | Basic share |
| ----------- | ---------------------------- | ----- | --------------------------- | -------------- | ----------- |
| 4           | typical group (5-10 players) | 582   | 22.4                        | 18.3%          | 3.5%        |
| 4           | 15 players                   | 400   | 38.1                        | 21.1%          | 3.8%        |
| 4           | 1 player with guests         | 400   | 3.0                         | 9.9%           | 0.7%        |
| 8           | typical group (5-10 players) | 598   | 23.0                        | 19.2%          | 3.4%        |
| 8           | 15 players                   | 400   | 40.3                        | 22.7%          | 3.7%        |
| 8           | 1 player with guests         | 400   | 3.0                         | 12.3%          | 0.7%        |

## Long-running servers (ladder, Festivals, seasons)

40 servers per size, 30 weeks each (6 seasons of 4 normal weeks and a Festival), with the Boss Rank ladder: placement at the first raid week, a normal finale win +1 rank, a loss keeps the rank, a Festival boss fights 3 ranks lower and the rank eases 1 after it. Every server starts at a random point of the 5-week calendar. A rank-up is a week that raised the rank.

| Server                      | Servers | Finale win rate (mean per server) | Per server p10 to p90 | Normal weeks | Festival weeks | Weeks 1-10 | Weeks 11+ | Median weeks between rank-ups (p10 to p90) | Servers with a loss streak over 4 | Median longest loss streak |
| --------------------------- | ------- | --------------------------------- | --------------------- | ------------ | -------------- | ---------- | --------- | ------------------------------------------ | --------------------------------- | -------------------------- |
| Small server (5 players)    | 40      | 84.7%                             | 77% to 90%            | 81.8%        | 96.3%          | 77.3%      | 88.4%     | 1.0 (1 to 3)                               | 0.0%                              | 1                          |
| Typical server (10 players) | 40      | 92.4%                             | 87% to 97%            | 90.5%        | 100.0%         | 84.8%      | 96.3%     | 1.0 (1 to 2)                               | 0.0%                              | 1                          |
| 15-player server            | 40      | 93.4%                             | 87% to 97%            | 91.9%        | 99.6%          | 88.3%      | 96.0%     | 1.0 (1 to 2)                               | 0.0%                              | 1                          |

Median server rank at the start of each week (the Festival boss fights at an eased rank):

| Server                      | Placement | Week 1 | Week 5 | Week 10 | Week 15 | Week 20 | Week 25 | Week 30 | Rank after the last week (p10 to p90) |
| --------------------------- | --------- | ------ | ------ | ------- | ------- | ------- | ------- | ------- | ------------------------------------- |
| Small server (5 players)    | 1.0       | 1.0    | 3.0    | 5.0     | 7.0     | 9.0     | 12.0    | 15.0    | 15.0 (13 to 16)                       |
| Typical server (10 players) | 1.0       | 1.0    | 3.0    | 5.0     | 8.0     | 10.0    | 13.0    | 16.0    | 17.0 (16 to 18)                       |
| 15-player server            | 1.0       | 1.0    | 3.0    | 6.0     | 8.0     | 11.0    | 14.0    | 17.0    | 17.5 (15 to 18)                       |

Rank spread between the typical and the 15-player server after week 30 (informational, no target): -0.5 ranks.

## Outliers

- Dominant creatures (contribution above 1.6x the median of their rarity): none.
- Weak creatures (below 0.6x): none.
- Dead elements (picked in under 10% of raid slots): none.
- Unbeatable bosses (typical group never wins the finale): none.
- Trivial bosses (typical group always wins the finale): none.
- Boss and group size combinations at 0% or 100% finale wins: tidal-colossus with 1 player: always won; cinder-wyrm with 1 player: always won; thornmother with 1 player: always won; storm-sovereign with 1 player: always won.

## Example fight

Tidal Colossus finale, 10-player server on a week 4 roster (won). First 30 events:

1. Tidal Colossus resists Overload (Reaction Resistance).
2. Round 1: Tidal Colossus has 78103 HP.
3. Lanternfin (Daily 1) powers up Thornbuck (Top earner 2) (+17% damage on its next hit).
4. Lanternfin (Daily 1) powers up Lanternfin (Daily 4) (+17% damage on its next hit).
5. Lanternfin (Daily 4) powers up Lanternfin (Daily 1) (+17% damage on its next hit).
6. Lanternfin (Daily 4) powers up Magmole (Daily 4) (+17% damage on its next hit).
7. Magmole (Daily 4) powers up Lanternfin (Daily 4) (+25% damage on its next hit).
8. Magmole (Daily 4) powers up Lanternfin (Daily 2) (+25% damage on its next hit).
9. Lanternfin (Daily 2) powers up Magmole (Daily 4) (+17% damage on its next hit).
10. Lanternfin (Daily 2) powers up Magmole (Top earner 2) (+17% damage on its next hit).
11. Magmole (Top earner 2) powers up Lanternfin (Daily 2) (+25% damage on its next hit).
12. Magmole (Top earner 2) powers up Lanternfin (Casual 2) (+25% damage on its next hit).
13. Lanternfin (Casual 2) powers up Magmole (Top earner 2) (+17% damage on its next hit).
14. Magmole (Daily 3) powers up Voltaro (Daily 1) (+25% damage on its next hit).
15. Sproutle (Casual 3) acts.
16. Sproutle (Casual 3) hits Tidal Colossus for 35; 78068 HP left.
17. Sproutle (Casual 3) leaves Tidal Colossus Overgrown.
18. Sproutle (Newcomer 1) acts.
19. Sproutle (Newcomer 1) hits Tidal Colossus for 38; 78030 HP left.
20. Thornbuck (Top earner 2) acts.
21. Thornbuck (Top earner 2) hits Tidal Colossus for 122 (+4% from modifiers); 77908 HP left.
22. Lanternfin (Daily 1) acts.
23. Lanternfin (Daily 1) hits Tidal Colossus for 115; 77793 HP left.
24. Lanternfin (Daily 4) acts.
25. Lanternfin (Daily 4) hits Tidal Colossus for 146; 77647 HP left.
26. Magmole (Daily 4) acts.
27. Magmole (Daily 4) hits Tidal Colossus for 495 (weak matchup); 77152 HP left.
28. Wildfire! Magmole (Daily 4) cashes in the mark set by Sproutle (Casual 3) for 389 bonus damage (+5% from modifiers).
29. Lanternfin (Daily 2) acts.
30. Lanternfin (Daily 2) hits Tidal Colossus for 133; 77019 HP left.

## Method

- **Income:** each day, every player who opens the game earns the daily allowance (`dailyAllowance()`) and every leeter the leet bonus on top (`leetBonusForDay(n)`, n = players who leeted that day); `--income current` plays the old leet-only pay (`baitForDay(n)`) instead. Casuals open the game and leet on 2 random days a week, dailies open it every day and leet on 6, top earners leet on all 7, and the newcomer plays like a daily from week 4.
- **Weather:** every day has a Boon and, from Boss Rank 3, an Omen (`drawWeather`, from a seeded stream of its own, drawn a day ahead at the server's rank), applied to the raid stage, the dungeon runs, the trips and the Workshop jobs of the day exactly as the server applies them; `--no-weather` plays without it, and `pnpm sim:weather` reads what each Boon and Omen does to the raid (docs/balance/log.md B-017).
- **Starter:** the starter whose element the server owns least (ties in content order). The first expedition brings a Zipmouse (game rule).
- **Check-ins:** casuals check in once on each leet day (every few days); everyone else twice a day (09:00 and 20:00).
- **At a check-in:** claim trips (and take an end-of-trip goal), claim jobs, evolve creatures that are at level 15 when there is enough Essence, buy the ribbons of creatures waiting at level 10 or 20, manage gear, send trips into the free slots, start workshop jobs.
- **Trips (expeditions v2):** slots come from the sum of the explorer ranks above 1 (`slotsFor`); a trip is free and supplies cannot be bought. Each free slot sends the idle creature of the highest explorer rank, to the open place (rank, night and Festival gates) where the most unowned species can be found (rarer ones count more, the weekly special place a little extra), for the length that pays the most per hour until the next check-in claims it (casuals: the longest they may). Supplies: those in stock that help (found on trips, dropped by the dungeon, crafted, or a rank gift); at most 2, never two of a kind. When a trip has ended it rolls its end-of-trip offer; a goal is taken when its extra hours (counted from the end of the trip) are over already (no waiting) and its worth ratio is at least 97%. The workshop makes supplies when the stock is low.
- **Training by activity:** levels come from experience (`@creatures/game` `experience.ts`, curve 25 x L + 2 x L x L): a finished trip pays its explorer by its length, a dungeon run pays its three creatures per room cleared and for a full clear, a raid stage pays every creature that fought (one and a half times when cleared) and a Workshop job pays its worker 4 an hour. A creature stops at level 10 and 20 until its ribbon (materials only) is bought, and at 15 until it evolves; experience earned while it waits is banked. A player with a training focus (the strongest 3 or 6) sends those creatures on trips first; a profile's treat policy packs a treat (3 + half the level in Bait, double experience for that creature) for the long trips, the dungeon and the longer jobs while the Bait lasts. There is no catch-up bonus and Bait buys no levels.
- **Raids:** everyone active signs up (casuals with 70% probability) and brings their 3 highest-power creatures. Sign-up order is shuffled each week; `autoPlace` builds the row in that order; `fillWithGuests` fills it to 9 slots with fewer than 3 players. Phase 1 runs on Friday, Phase 2 on Saturday (with the adaptation Phase 1 suggested) and the finale on Sunday; the boss HP pool carries across them. In the finale each player brings their basic ability (round-robin over the four) plus the creature ability of each team creature at level 10 or above; every ability fires at its default round. Bosses rotate in content order by the global week index. Crits are on (5% for +50%, players and boss). The raid sweep fights each boss at the rank the old per-level rule would have chosen for the roster (`placementRank`), which is what the boss HP and the head-count exponents are calibrated at; the long-run servers (below) use the ladder.
- **Boss Rank ladder (long-run servers):** a new server is placed once at its first raid week, a finale win in a normal week adds 1 rank, a loss changes nothing, every 5th week of the global calendar is a Festival (boss 3 ranks lower, +50% Essence, a win grants each participant the season's Festival creature through the duplicate rules) and the rank eases 1 after every Festival. Each long-run server starts at a random point of the 5-week calendar.
- **Rewards:** Essence from `essenceForStage` for every cleared stage, weighted by the stage's contribution and scaled by the server's rank and the Festival bonus (`essenceMultiplierBp`). Jackpots from `rollJackpot` on a finale win. The pity counter advances only on a finale win without a jackpot; a lost finale changes nothing (soft pity from raid 5, hard pity at raid 10).
- **Evolution:** at level 15 (stage 1 level cap) when the player has the Essence from the content; the species switches to its stage 2 form and keeps its fusion count.
- **Team power** = sum over the top 3 creatures of `atk + hp / 10`, using `effectiveStats` (fusion and the worn gear included, like the worker's `power`).
- **Gear drops** follow the worker: the welcome kit when a player joins (a Common Trail Cap at item level 1, a blueprint and scrap), phase scrap for every participant of a cleared Phase 1 or 2, one reward per participant of a won finale at the server's rank (a gear piece of the boss's element at item level 3 + Boss Rank, or a blueprint they do not know yet; and the Festival piece in a Festival week), the dungeon's gear chance, and the loot of every claimed expedition (scrap, a shard, a glimmer, a blueprint; a blueprint the player knows is a well-thumbed mark, scrap at the most marks) and of a push-on gear find. All rolls use the game's pure functions (`rollFinaleReward`, `rollFestivalItem`, `rollDungeonItem`, `expeditionLoot`, `rollExpeditionItem`, `rollWelcomeKit`, `rollCraft`) with a seeded stream of their own.
- **Gear policy**, at every check-in after the claims: claim finished jobs; Equip best (the game's `planEquipBest` over the 3 strongest creatures by power without gear, the bag and what they wear, under the wear rule: a Hat from creature level 1, a Scarf from 7, a Charm from 13, an item level at most the creature's level, a role-locked Charm only on its role); keep the 3 best unworn items as spares; then start jobs in the free workshop slots on creatures that are not exploring (the one with the most Crafting XP first): the first job crafts (a supply when fewer than 4 are in stock, a first craft before any supply, else the blueprint whose plain item adds the most to a team creature, aimed with the biggest Reach the creature's level, the parts and the Essence above 40 allow), the second takes apart the extras (a bundle of up to 5 Commons once 3 wait, or an Epic, Festival or Rare piece alone) as a dismantle job, which pays its refund range, Essence and a blueprint chance when it is claimed. Items fold into the fight slots with `applyGear` (stats, crit, the modifier sheet, and the trip and Workshop lines the sim also reads: Quick feet, Trail XP, Lucky find, Keen nose, Packer, Busy paws, Apprentice). A creature on a job does not explore (one busy state) but still fights.
- **Daily dungeon** (`docs/design/dungeon-paths.md`): every player with at least 3 creatures walks the day's map once on each day they check in (casuals on their leet days); on the first day they ever ran, a run lost to a defeat may be tried once more (a run that headed home or cleared may not). The map (`generateDungeonMap`, from a seed of the day) is the same for the whole server; the team is the 3 strongest creatures by power (gear included), stood in one row by the game's rule for it (`dungeonRowOrder`); there is no basic ability, and every unlocked creature ability fires at its default round. Each fight is one `simulateDungeonRoom` with the HP carried and the keepsakes folded in. The walk is a small policy: prefer the foe the row's elements beat; take an elite only above 70% average HP with nobody down; prefer a mystery room or a cache below 50%; take an event's costly or gamble option only above 60% (a plain heal below 70%); at the camp swap in the strongest unused creature for a fallen one, else rest below 60%, else take the first keepsake, then head home when 2 creatures are down or average HP is under 35%. `random` players choose everything at random and `best` players look one floor ahead and take the better keepsake. A run is paid as the worker pays it: the pack (all of it at home or on a clear, half rounded up after a defeat), on a clear the boss chest (Essence, scrap, the shard chance, the gear chance, certain at a landmark), the run's supply once a fight is cleared (safe), experience per creature by the fights it stood in the row for plus the full clear bonus, and the streak bonus on the first run of a day, through `nodeLoot`, `keptOnDefeat`, `rollDungeonLoot`, `dungeonExperience` and `streakBonus`.
- **Time** for jobs: check-ins at 09:00 and 20:00 (casuals at 09:00 on their leet days); a job is claimed at the first check-in after `jobDuration` (the crafter's skill included) has passed.
- **Typical group:** a raid week with 5 to 10 signed-up players, on rosters from the end of week 4 or 8.

Default mix: 3 casual, 4 daily, 2 top, 1 newcomer. Other server sizes use the same mix scaled by largest remainder.
