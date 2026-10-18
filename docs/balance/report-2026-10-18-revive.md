_A fallen creature gets back up on the way down (2026-10-18, log entry B-021): when the row goes down into the Undercroft, standing creatures recover 20% of max HP and a knocked-out one gets back up at 10% (`RULES.dungeon.undercroft.reviveBp` 1000), and the policy goes down when the row's average HP is over 50% after that (it was over 60% with nobody down). Seed `leet`, 12 weeks per economy sim, 200 raid weeks per cell, 24 economy sims per player count, 40 twenty-week pity sims and 40 thirty-week long-run sims per server size (`pnpm sim`, 96 targets: 68 pass, 28 fail). The report of B-020 (`report-2026-10-18-undercroft.md`, 70 pass, 26 fail) is the baseline for the dungeon numbers; the raid and curve targets also moved with the raid board change merged from main after it (see the log)._

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

68 passed, 28 failed, 0 not measured.

|     | Target                                                                                                                                                                                              | Measured | Requirement    | Metric                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ---------------------------------------- |
| ❌  | Phase 1 clear rate (the boss driven to its 70% floor), typical group (5-10 signed-up players, week 4 or later)                                                                                      | 71.4%    | >= 80.0%       | `raid.typical.phase1ClearRate`           |
| ✅  | Phase 2 clear rate (the boss driven to its 15% floor), typical group: a stronger server's result, not a routine one, or the finale has no work left                                                 | 0.9%     | 0.0% to 25.0%  | `raid.typical.phase2ClearRate`           |
| ❌  | Finale win rate, typical group (the boss usually falls, enrage is the real threat)                                                                                                                  | 75.4%    | 85.0% to 97.0% | `raid.typical.finaleWinRate`             |
| ✅  | Share of the boss's HP left when a typical group's finale begins (real work for the finale: a quarter to under half)                                                                                | 39.2%    | 25.0% to 45.0% | `raid.typical.finaleStartShare`          |
| ✅  | Phase 1 clear rate, 1 player with guests, week 4 or later                                                                                                                                           | 100.0%   | >= 80.0%       | `raid.solo.phase1ClearRate`              |
| ❌  | Finale win rate, 15 players (no easier-with-more-people cliff)                                                                                                                                      | 72.0%    | 85.0% to 99.0% | `raid.fifteen.finaleWinRate`             |
| ❌  | Spread of finale win rate between bosses, typical group (percentage points)                                                                                                                         | 17.6%    | <= 15.0%       | `raid.typical.bossSpread`                |
| ✅  | Bosses a typical group never beats or always beats in the finale (flagged)                                                                                                                          | 0        | <= 0           | `raid.typical.extremeBosses`             |
| ✅  | Creatures knocked out in a typical group's finale (share of the creatures in the row; big hits stay big, knock-outs and swings are wanted: the band only catches broken numbers)                    | 26.3%    | 10.0% to 30.0% | `raid.typical.koShare`                   |
| ✅  | Finale win points lost with the Guard role switched off, Guards spread through the row, typical group, bosses 15% tougher so the role has room to show                                              | 4.66     | >= 2           | `raid.guardValue`                        |
| ✅  | Barrage volleys that hit a creature the previous volley of the same barrage hit although enough others were standing (the no-repeat rule: none)                                                     | 0.0%     | <= 0.0%        | `raid.patternFairness`                   |
| ✅  | Median top player's share of contribution, groups of 5+ players                                                                                                                                     | 16.7%    | <= 35.0%       | `fair.topShareMedian`                    |
| ✅  | Setup credit share of total contribution (setters matter)                                                                                                                                           | 20.1%    | >= 15.0%       | `fair.setupShare`                        |
| ✅  | Reactions per round on average, groups of 5+ players                                                                                                                                                | 4.68     | >= 1           | `fair.reactionsPerRound`                 |
| ❌  | Newcomer (joined week 4) Essence per week at week 6, relative to a top earner                                                                                                                       | 65.6%    | >= 70.0%       | `econ.newcomerEssenceRatioWeek6`         |
| ❌  | Lowest element pick rate in raids                                                                                                                                                                   | 12.9%    | >= 15.0%       | `choice.elementPickRateMin`              |
| ✅  | Highest element pick rate in raids                                                                                                                                                                  | 32.6%    | <= 35.0%       | `choice.elementPickRateMax`              |
| ✅  | Highest creature contribution relative to the median creature of its rarity                                                                                                                         | 1.46x    | <= 1.60x       | `choice.creatureRatioMax`                |
| ✅  | Lowest creature contribution relative to the median creature of its rarity                                                                                                                          | 0.87x    | >= 0.60x       | `choice.creatureRatioMin`                |
| ✅  | Elements picked in under 10% of raid slots (flagged as dead)                                                                                                                                        | 0        | <= 0           | `choice.deadElements`                    |
| ❌  | Casual player's highest creature level at the end of week 4 (evolution level 15)                                                                                                                    | 10       | >= 15          | `econ.casualTopLevelWeek4`               |
| ✅  | Daily player owns at least 8 of 12 catchable species by the end of week 6                                                                                                                           | 11       | >= 8           | `econ.dailySpeciesWeek6`                 |
| ❌  | Top earner vs casual average team power at week 8                                                                                                                                                   | 2.03x    | <= 1.60x       | `econ.powerRatioTopVsCasualWeek8`        |
| ✅  | Jackpot rate per player per finale win, including pity                                                                                                                                              | 13.5%    | 6.0% to 15.0%  | `econ.jackpotRatePerWin`                 |
| ✅  | Players reaching hard pity (10 raids without a jackpot) over 20 weeks (pity counts finale wins, so a winnable raid reaches it more often than a hard one did)                                       | 22.5%    | <= 25.0%       | `econ.hardPityShare20Weeks`              |
| ✅  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, small server (5 players, 30 weeks)                                                             | 81.4%    | 60.0% to 85.0% | `longrun.small.finaleWinRate`            |
| ❌  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, typical server (10 players, 30 weeks)                                                          | 91.6%    | 60.0% to 85.0% | `longrun.typical.finaleWinRate`          |
| ❌  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, 15-player server (30 weeks)                                                                    | 91.8%    | 60.0% to 85.0% | `longrun.fifteen.finaleWinRate`          |
| ✅  | Festival finale win rate, lowest of the three server sizes                                                                                                                                          | 97.9%    | >= 70.0%       | `longrun.festivalWinRateMin`             |
| ✅  | Median weeks between rank-ups, all long-run servers (a winnable curve: most wins raise the rank, a loss stalls it a week or two)                                                                    | 1        | 1 to 2         | `longrun.rankUpGapMedian`                |
| ✅  | Share of servers with a loss streak of more than 4 weeks, worst of the three sizes                                                                                                                  | 0.0%     | <= 10.0%       | `longrun.lossStreakShareMax`             |
| ✅  | Days until a daily player's first crafted item arrives (90th percentile; a player who never crafts counts as 99)                                                                                    | 1.38     | <= 7           | `gear.dailyFirstCraftDaysP90`            |
| ✅  | Best Crafting skill level of a daily player 30 days after joining (median)                                                                                                                          | 6        | 4 to 6         | `gear.dailyBestSkillDay30`               |
| ❌  | Gear power at week 8 of a player who joined in week 4, relative to the median daily player's                                                                                                        | 57.0%    | >= 60.0%       | `gear.newcomerCatchUpWeek8`              |
| ✅  | A min-maxer's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                   | 6.4%     | 5.0% to 10.0%  | `gear.share.min-maxer.week2`             |
| ❌  | A min-maxer's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                   | 25.0%    | 15.0% to 22.0% | `gear.share.min-maxer.week8`             |
| ❌  | A min-maxer's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                  | 32.4%    | 25.0% to 32.0% | `gear.share.min-maxer.week20`            |
| ❌  | A min-maxer's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                  | 32.3%    | 33.0% to 40.0% | `gear.share.min-maxer.week30`            |
| ✅  | An engaged player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 5.1%     | 5.0% to 10.0%  | `gear.share.engaged.week2`               |
| ✅  | An engaged player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 15.6%    | 15.0% to 22.0% | `gear.share.engaged.week8`               |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                            | 23.9%    | 25.0% to 32.0% | `gear.share.engaged.week20`              |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                            | 27.1%    | 33.0% to 40.0% | `gear.share.engaged.week30`              |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 2.6%     | 3.0% to 6.0%   | `gear.share.regular.week2`               |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 9.2%     | 10.0% to 15.0% | `gear.share.regular.week8`               |
| ✅  | A regular player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 19.3%    | 18.0% to 24.0% | `gear.share.regular.week20`              |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 23.6%    | 28.0% to 34.0% | `gear.share.regular.week30`              |
| ❌  | A drop-in player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 5.3%     | 0.0% to 3.0%   | `gear.share.drop-in.week2`               |
| ❌  | A drop-in player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 4.7%     | 5.0% to 8.0%   | `gear.share.drop-in.week8`               |
| ✅  | A drop-in player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 14.0%    | 10.0% to 15.0% | `gear.share.drop-in.week20`              |
| ❌  | A drop-in player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 20.5%    | 15.0% to 20.0% | `gear.share.drop-in.week30`              |
| ✅  | Daily dungeon: depth 1 is cleared (the room boss beaten) in a player's first 7 days, share of those runs                                                                                            | 86.7%    | >= 80.0%       | `dungeon.firstWeekDepth1ClearRate`       |
| ✅  | Daily dungeon: depth a median daily player gains per week, from the end of week 2 to the end of week 8                                                                                              | 1.83     | 1 to 2         | `dungeon.dailyDepthGrowthPerWeek`        |
| ✅  | Daily dungeon: Essence as a share of a daily player's whole Essence income (raids, jackpots and dungeon)                                                                                            | 4.3%     | <= 40.0%       | `dungeon.dailyEssenceShare`              |
| ❌  | Gear's share of a daily player's raid-team power at week 8 with the dungeon's gear and parts in the game (must not pass 20%)                                                                        | 22.4%    | <= 20.0%       | `dungeon.dailyGearShareWeek8`            |
| ✅  | Daily dungeon: share of a daily player's runs, from their second week, that head home from the camp with the pack (the camp choice is real)                                                         | 19.3%    | 10.0% to 45.0% | `dungeon.dailyHomeRate`                  |
| ✅  | Daily dungeon: fights played per run (a lost one included), a daily player's runs from their second week (a run is short: 3 to 5.5 fights)                                                          | 4.27     | 3 to 5.5       | `dungeon.meanFights`                     |
| ✅  | Daily dungeon: share of a daily player's runs that beat the room boss at depth 8 or over (the Undercroft is offered) and go down into it (a real choice: not 20% below, not 80% above)              | 53.6%    | 20.0% to 80.0% | `dungeon.undercroftDescentRate`          |
| ✅  | Daily dungeon: fights played per run (the Undercroft's included, a lost one too) by a daily player at depth 8 or over, when the Undercroft is open to them (runs must not get too long: at most 7)  | 4.25     | <= 7           | `dungeon.eligibleMeanFights`             |
| ✅  | Day a daily player's 2nd expedition slot opens, after joining (median; the first day)                                                                                                               | 1        | <= 1           | `exp.dailySlot2Day`                      |
| ❌  | Day a daily player's 3rd expedition slot opens (median; about a month, 30 plus or minus 7)                                                                                                          | 55.5     | 23 to 37       | `exp.dailySlot3Day`                      |
| ❌  | Day a daily player's 4th expedition slot opens (median; about four months)                                                                                                                          | 320      | 90 to 150      | `exp.dailySlot4Day`                      |
| ❌  | Day a daily player's 5th expedition slot opens (median; about a year; a slot that never opens counts as 999)                                                                                        | 999      | 330 to 400     | `exp.dailySlot5Day`                      |
| ✅  | Worth per day of the best long strategy (always 12 or 24 hour trips) over the best short one (2 or 6 hours), Bait-free                                                                              | 2.96x    | >= 1.20x       | `exp.longVsShortRate`                    |
| ✅  | Worth per day of always sending 2 hour trips over the worst of the other three strategies (at most 1: spam is the worst)                                                                            | 0.16x    | <= 1.00x       | `exp.spamVsOthersRate`                   |
| ✅  | Share of daily players' finished trips that are 12 or 24 hours (long trips are what people send)                                                                                                    | 99.0%    | >= 50.0%       | `exp.dailyLongShare`                     |
| ✅  | Lowest expected worth of a risky push-on goal against coming home, over every length it is offered after                                                                                            | 0.91x    | >= 0.90x       | `exp.riskyRatioMin`                      |
| ✅  | Highest expected worth of a risky push-on goal against coming home (a fair gamble: within 10%)                                                                                                      | 1.09x    | <= 1.10x       | `exp.riskyRatioMax`                      |
| ✅  | Most species a casual player owns ahead of today's expeditions at the end of any week 1 to 12 (no faster than today, within the measure's noise of about half a species)                            | -0.68    | <= 0.45        | `exp.casualSpeciesVsToday`               |
| ✅  | Raid curve: finale win rate in a new server's first week (rank 1), casual-heavy journey server (1 engaged, 4 regular, 4 drop-in)                                                                    | 96.7%    | >= 85.0%       | `curve.casual-heavy.week1.finaleWinRate` |
| ✅  | Raid curve: finale win rate in a new server's first week (rank 1), default journey server                                                                                                           | 100.0%   | >= 90.0%       | `curve.default.week1.finaleWinRate`      |
| ✅  | Raid curve: finale win rate at Boss Ranks 2 to 5, default journey server (12-week runs, normal weeks)                                                                                               | 77.0%    | 70.0% to 85.0% | `curve.default.r2to5.finaleWinRate`      |
| ❌  | Raid curve: finale win rate at Boss Ranks 2 to 5, committed journey server (arranged rows)                                                                                                          | 91.8%    | >= 95.0%       | `curve.committed.r2to5.finaleWinRate`    |
| ✅  | Raid curve: finale win rate at Boss Rank 6 and up, default journey server                                                                                                                           | 59.1%    | 45.0% to 65.0% | `curve.default.r6up.finaleWinRate`       |
| ✅  | Raid curve: finale win rate at Boss Rank 6 and up, committed journey server                                                                                                                         | 90.5%    | >= 80.0%       | `curve.committed.r6up.finaleWinRate`     |
| ✅  | Raid curve: finale win rate of the hardest rank a committed server reaches within 12 weeks (ranks with at least 40 weeks; never a rank they cannot beat)                                            | 87.8%    | >= 60.0%       | `curve.committed.worstRankWinRate`       |
| ❌  | Raid curve: Phase 1 (Friday) clear rate over all normal weeks, default journey server (weekday rewards flow)                                                                                        | 72.0%    | >= 75.0%       | `curve.default.normal.phase1ClearRate`   |
| ✅  | Raid curve: Phase 2 (Saturday) clear rate over all normal weeks, default journey server (sometimes, not routinely)                                                                                  | 15.0%    | 5.0% to 50.0%  | `curve.default.normal.phase2ClearRate`   |
| ✅  | Raid curve: share of the finale's creatures knocked out over all normal weeks, default journey server (drama without wipes)                                                                         | 23.3%    | 10.0% to 35.0% | `curve.default.normal.koShare`           |
| ✅  | Supplies: a regular player carries at least about 3 supplies a week (weeks 3 to 12; B-011)                                                                                                          | 7.18     | >= 3           | `supplies.regular.usedPerWeek`           |
| ✅  | Supplies: a min-maxer carries at least about 8 supplies a week (weeks 3 to 12; B-011)                                                                                                               | 45.44    | >= 8           | `supplies.min-maxer.usedPerWeek`         |
| ✅  | Supplies: at least a quarter of a min-maxer's supplies are crafted in the Workshop (weeks 3 to 12)                                                                                                  | 56.6%    | >= 25.0%       | `supplies.min-maxer.craftedShare`        |
| ✅  | Supplies: at least a quarter of an engaged player's supplies are crafted in the Workshop (weeks 3 to 12)                                                                                            | 35.8%    | >= 25.0%       | `supplies.engaged.craftedShare`          |
| ✅  | Creatures: a min-maxer owns every species a trip can find (the base catalogue) after about 5 weeks (B-016: the pity floor only speeds players up, so B-014 plan of 9 is out of reach)               | 5        | 4 to 8         | `creatures.min-maxer.catalogueWeeks`     |
| ✅  | Creatures: an engaged player completes the base catalogue after about 9 weeks (B-016; B-014 planned 14, pity cannot slow a committed player)                                                        | 9        | 7 to 12        | `creatures.engaged.catalogueWeeks`       |
| ✅  | Creatures: a regular player completes the base catalogue after about 24 weeks (B-016: the pity threshold is set for this), and at least half of them by week 30                                     | 24       | 20 to 30       | `creatures.regular.catalogueWeeks`       |
| ✅  | Creatures: a min-maxer brings home 8 to 20 creatures a week, with the pity floor counted (weeks 3 to 30; B-016, the plan is 10 to 15)                                                               | 15.39    | 8 to 20        | `creatures.min-maxer.catchesPerWeek`     |
| ✅  | Creatures: an engaged player brings home 5 to 14 creatures a week (weeks 3 to 30; B-014)                                                                                                            | 10.5     | 5 to 14        | `creatures.engaged.catchesPerWeek`       |
| ✅  | Creatures: a regular player brings home 1.5 to 4 creatures a week (weeks 3 to 30; B-014)                                                                                                            | 2.45     | 1.5 to 4       | `creatures.regular.catchesPerWeek`       |
| ✅  | Creatures: a min-maxer gets 6 to 18 duplicates a week, enough to feed talents and fusion and not a flood (B-014)                                                                                    | 15.19    | 6 to 18        | `creatures.min-maxer.dupesPerWeek`       |
| ✅  | Creatures: an engaged player gets 4 to 12 duplicates a week (B-014)                                                                                                                                 | 10.21    | 4 to 12        | `creatures.engaged.dupesPerWeek`         |
| ✅  | Creatures: a regular player gets 1 to 3.5 duplicates a week (B-014)                                                                                                                                 | 2.07     | 1 to 3.5       | `creatures.regular.dupesPerWeek`         |
| ✅  | Creatures: lures take at most a quarter of the Bait a min-maxer earns; treats are the main use of Bait now (B-016)                                                                                  | 17.5%    | <= 25.0%       | `creatures.min-maxer.lureBaitShare`      |
| ✅  | Creatures: talents give a min-maxer's raid team 5 to 20% of its fight-scored power at the end of the run (B-014; not a design target, a guard against a talent that is worth nothing or everything) | 11.7%    | 5.0% to 20.0%  | `creatures.min-maxer.talentShareEnd`     |
| ✅  | Creatures: a committed trio reaches level 10 (the Bronze Ribbon gate) in week 1 or 2 (spec 9.2, B-016)                                                                                              | 1        | <= 2           | `creatures.min-maxer.trioLevel10Week`    |
| ✅  | Creatures: a committed trio reaches level 30 around week 11 (spec 9.2, B-016)                                                                                                                       | 11       | 8 to 14        | `creatures.min-maxer.trioLevel30Week`    |
| ✅  | Creatures: no gap of more than 6 levels between two unlocks on the ladder (the first gap, Hat at 1 to Scarf at 7, is the widest; spec 9.3a, B-016)                                                  | 6        | <= 6           | `creatures.min-maxer.stretchLevels`      |

## Finale structure (phase floors and enrage)

Typical groups (5-10 signed up, 1180 raid weeks). A cleared phase leaves its floor (Phase 1: 70% of the boss's HP, Phase 2: 15%), so a finale that follows a cleared Phase 2 starts at the Phase 2 floor. Enrage: 3 rounds at 400% of the boss's Attack on every creature, after the finale's own rounds.

| Measure                                                                                                                                 | Value                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Phase 1 clear rate                                                                                                                      | 71.4%                  |
| Phase 2 clear rate                                                                                                                      | 0.9%                   |
| Finale win rate                                                                                                                         | 75.4%                  |
| Boss HP left when the finale began (mean share of the maximum)                                                                          | 39.2%                  |
| Finale win rate when it began at the Phase 2 floor                                                                                      | 100.0%                 |
| Finale win rate when Phase 2 fell short of its floor                                                                                    | 75.2%                  |
| Finales that reached the enrage rounds                                                                                                  | 33.5%                  |
| Win rate inside the enrage rounds (of the finales that reached them)                                                                    | 26.6%                  |
| Enrage rounds played before the row was wiped (finales that reached enrage and were lost, mean)                                         | 3.00                   |
| Creatures knocked out in the finale                                                                                                     | 26.3%                  |
| Barrage volleys that broke the no-repeat rule (hit a creature the previous volley of the same barrage hit although enough others stood) | 0.00% of 12114 volleys |
| Barrage volleys that repeated a victim because too few other creatures were left standing (the rule allows it)                          | 0.07%                  |

## Roles (Guard and Support ablation)

The same raid weeks played again with a role switched off (Guard: no extra HP, no intercept, no cover; Support: no buff and no element effect; one element: only that Support effect), with the same rosters, sign-ups and dice. Guards are spread through the row (evenly spaced), the formation in which they show; the sim's default formation clumps them in front. The bosses' HP pool is 15% bigger than in the raid sweep, so the reference wins about 70% of its weeks and a role has room to show (at the sweep's own difficulty a spread row wins about 95% and hides what a Guard saves). Typical groups only (5-10 signed up), 2 times the sweep's weeks per cell. The Guard value of the targets is the first table's "Guard off" row, as win points lost. One standard error of a difference is about 1 point; differences under 2 points are noise. Grove has no Support species yet, so its Mend has nothing to switch off (0.0 is expected).

### Players bring their 3 strongest creatures (the sim's rule)

| Switched off  | Raid weeks | Finale win rate | Points vs everything on | Creatures knocked out |
| ------------- | ---------- | --------------- | ----------------------- | --------------------- |
| Everything on | 2358       | 60.1%           | 0.0                     | 32.8%                 |
| Guard off     | 2358       | 55.4%           | -4.7                    | 40.1%                 |
| Support off   | 2358       | 56.4%           | -3.7                    | 36.3%                 |

### Every player brings a Guard and a Support when they own one

A Support is only 1 to 3% of the creatures in the first table, so its effects hardly show there. This population shows what a Support is worth when one is present.

| Switched off         | Raid weeks | Finale win rate | Points vs everything on | Creatures knocked out |
| -------------------- | ---------- | --------------- | ----------------------- | --------------------- |
| Everything on        | 2358       | 64.8%           | 0.0                     | 26.7%                 |
| Guard off            | 2358       | 54.3%           | -10.5                   | 40.2%                 |
| Support off          | 2358       | 49.7%           | -15.0                   | 36.1%                 |
| Ember Stoke off      | 2358       | 61.4%           | -3.4                    | 28.2%                 |
| Spark Overcharge off | 2358       | 64.2%           | -0.6                    | 26.9%                 |
| Tide Mend off        | 2358       | 64.1%           | -0.7                    | 28.3%                 |
| Grove Mend off       | 2358       | 64.8%           | 0.0                     | 26.7%                 |

Guard value (the target): 4.7 win points.

## Setups (greedy and protected rows)

The same raid weeks (rosters, sign-ups and dice of the sweep) played with the row arranged three ways. **Default** is the sim's own row (`autoPlace`: Guards in front, payoffs at the back, Supports in the middle). **Greedy** packs setters and payoffs for the most reactions a round and puts Guards and Supports where they cost the fewest, at the edges. **Protected** puts every payoff beside a Guard where it can (adjacency stops at zone edges), Supports between payoffs, and takes whatever reactions remain. The two setups are the best arrangement a seeded hill-climb finds for their own score (`formations.ts`). Typical groups only (5-10 signed up). "+N ranks" plays the same weeks against a boss N Boss Ranks above the sweep's (the curve's HP and Attack for that rank): at +0 a typical group wins about 93% and there is little left to lose, +1 and +2 are what a server that keeps winning meets next. **Swing** is the standard deviation of the win rate over the cells (server size, boss, roster week) and of the knock-out share from finale to finale, in points; one standard error of a win rate is about 1.5 points at +0 and 2 points at +1.

### The shipped bosses (+0 ranks)

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 74.8%    | 0.0               | 70.9%           | 39.5%                      | 3.66              | 0%                     | 26.4%       | 7.8%                | 100%                             | 1.5%                            | 25.7                             | 33.5                            |
| Greedy              | 1179    | 92.7%    | +17.9             | 91.0%           | 29.9%                      | 6.67              | 12%                    | 9.8%        | 4.3%                | 100%                             | 1.2%                            | 15.9                             | 23.0                            |
| Protected           | 1179    | 94.0%    | +19.2             | 92.6%           | 29.2%                      | 6.56              | 63%                    | 8.4%        | 3.8%                | 100%                             | 0.8%                            | 13.5                             | 21.1                            |

### +1 rank

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 45.0%    | 0.0               | 42.0%           | 47.6%                      | 3.60              | 0%                     | 50.2%       | 9.6%                | 98%                              | 1.9%                            | 37.4                             | 39.1                            |
| Greedy              | 1179    | 75.4%    | +30.4             | 73.1%           | 37.7%                      | 6.59              | 12%                    | 26.0%       | 6.5%                | 100%                             | 2.0%                            | 33.5                             | 37.3                            |
| Protected           | 1179    | 77.9%    | +32.8             | 76.3%           | 36.9%                      | 6.47              | 63%                    | 22.8%       | 5.6%                | 99%                              | 1.5%                            | 32.1                             | 35.5                            |

### +2 ranks

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 27.1%    | 0.0               | 22.7%           | 54.2%                      | 3.56              | 0%                     | 66.4%       | 14.3%               | 99%                              | 5.0%                            | 29.8                             | 34.6                            |
| Greedy              | 1179    | 52.2%    | +25.1             | 53.0%           | 44.4%                      | 6.51              | 12%                    | 45.8%       | 6.8%                | 100%                             | 2.4%                            | 39.1                             | 43.1                            |
| Protected           | 1179    | 55.7%    | +28.7             | 55.6%           | 43.5%                      | 6.39              | 63%                    | 41.8%       | 6.4%                | 100%                             | 1.7%                            | 36.7                             | 42.4                            |

## High Boss Ranks

Typical groups (5-10 signed up) on the sweep's rosters of week 4 and week 8, against every boss at Boss Ranks 1, 3, 5, 7, 9 and 11 with the shipped rank curve (`RULES.raid.curve`; the rank is forced, whatever the roster would have been placed at). It shows where wins collapse for a roster that has stopped growing, not what a server at that rank looks like (a server that reaches rank 9 has been winning, so its creatures are stronger than these).

| Boss Rank | Roster week | Finales | Phase 1 cleared | Phase 2 cleared | Finale win rate | Boss HP left at the finale | Knocked out | Reached enrage |
| --------- | ----------- | ------- | --------------- | --------------- | --------------- | -------------------------- | ----------- | -------------- |
| 1         | 4           | 582     | 100.0%          | 100.0%          | 100.0%          | 15.0%                      | 0.5%        | 0.0%           |
| 3         | 4           | 582     | 41.9%           | 0.0%            | 46.9%           | 46.7%                      | 50.0%       | 71.0%          |
| 5         | 4           | 582     | 1.2%            | 0.0%            | 0.5%            | 62.9%                      | 91.6%       | 100.0%         |
| 7         | 4           | 582     | 0.0%            | 0.0%            | 0.0%            | 66.9%                      | 96.7%       | 99.7%          |
| 9         | 4           | 582     | 0.0%            | 0.0%            | 0.0%            | 69.0%                      | 98.9%       | 97.9%          |
| 11        | 4           | 582     | 0.0%            | 0.0%            | 0.0%            | 69.7%                      | 99.7%       | 95.2%          |
| 1         | 8           | 597     | 100.0%          | 100.0%          | 100.0%          | 15.0%                      | 0.4%        | 0.0%           |
| 3         | 8           | 597     | 98.7%           | 3.0%            | 99.5%           | 29.9%                      | 3.3%        | 1.3%           |
| 5         | 8           | 597     | 51.9%           | 0.0%            | 60.8%           | 44.4%                      | 33.5%       | 57.3%          |
| 7         | 8           | 597     | 29.0%           | 0.0%            | 32.5%           | 48.8%                      | 63.0%       | 80.2%          |
| 9         | 8           | 597     | 20.3%           | 0.0%            | 20.9%           | 51.0%                      | 77.7%       | 88.3%          |
| 11        | 8           | 597     | 17.9%           | 0.0%            | 17.4%           | 51.5%                      | 84.2%       | 89.3%          |

## Raid curve by Boss Rank (journey servers)

Seed "leet", 12 weeks, 60 servers per mix, allowance income. Festival weeks fight an eased boss; the rank tables count normal weeks only.

### casual-heavy (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 95.0%   | 35.0%   | 96.7%      | 7.5%        | 5.0%     | 1.7%            | 13        |
| 2    | 60    | 1.8  | 40.0%   | 38.3%   | 40.0%      | 60.8%       | 56.7%    | 0.0%            | 10        |
| 3    | 60    | 1.8  | 40.0%   | 38.3%   | 41.7%      | 57.7%       | 60.0%    | 1.7%            | 13        |
| 4    | 60    | 1.8  | 63.3%   | 41.7%   | 65.0%      | 37.8%       | 43.3%    | 8.3%            | 12        |
| 5    | 60    | 2.1  | 65.0%   | 38.3%   | 71.7%      | 32.5%       | 41.7%    | 13.3%           | 12        |
| 6    | 60    | 2.4  | 68.3%   | 38.3%   | 70.0%      | 30.2%       | 35.0%    | 5.0%            | 13        |
| 7    | 60    | 2.6  | 46.7%   | 16.7%   | 51.7%      | 44.7%       | 58.3%    | 10.0%           | 10        |
| 8    | 60    | 2.8  | 58.3%   | 23.3%   | 61.7%      | 36.4%       | 45.0%    | 6.7%            | 13        |
| 9    | 60    | 3.0  | 60.0%   | 18.3%   | 63.3%      | 34.6%       | 43.3%    | 6.7%            | 12        |
| 10   | 60    | 3.3  | 65.0%   | 21.7%   | 65.0%      | 37.8%       | 48.3%    | 13.3%           | 12        |
| 11   | 60    | 3.5  | 58.3%   | 16.7%   | 58.3%      | 38.4%       | 48.3%    | 6.7%            | 13        |
| 12   | 60    | 3.6  | 65.0%   | 13.3%   | 63.3%      | 33.3%       | 41.7%    | 5.0%            | 10        |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 106   | 97.2%   | 68.9%   | 98.1%      | 6.0%        | 2.8%     | 0.9%            | 18.9%                      |
| 2    | 213   | 42.3%   | 0.5%    | 48.8%      | 54.0%       | 59.6%    | 9.4%            | 49.3%                      |
| 3    | 190   | 41.0%   | 0.5%    | 40.5%      | 54.1%       | 70.5%    | 11.1%           | 47.4%                      |
| 4    | 60    | 36.7%   | 0.0%    | 35.0%      | 62.0%       | 73.3%    | 8.3%            | 47.5%                      |
| 5    | 8     | 0.0%    | 0.0%    | 0.0%       | 96.5%       | 100.0%   | 0.0%            | 58.4%                      |

Week 1 (rank 1): finale 96.7% (Phase 1 95.0%, Phase 2 35.0%). All normal weeks: Phase 1 50.8%, Phase 2 13.0%, finale 53.0%, knocked out 46.6%, won in overtime 8.2%. Mean rank after the last week: 3.95.

### default (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 100.0%  | 98.3%   | 100.0%     | 0.7%        | 0.0%     | 0.0%            | 12        |
| 2    | 60    | 1.8  | 53.3%   | 41.7%   | 60.0%      | 41.4%       | 45.0%    | 5.0%            | 13        |
| 3    | 60    | 2.0  | 86.7%   | 48.3%   | 90.0%      | 12.2%       | 18.3%    | 8.3%            | 16        |
| 4    | 60    | 2.3  | 76.7%   | 30.0%   | 80.0%      | 19.4%       | 21.7%    | 1.7%            | 10        |
| 5    | 60    | 2.8  | 80.0%   | 16.7%   | 85.0%      | 16.9%       | 25.0%    | 10.0%           | 9         |
| 6    | 60    | 3.4  | 80.0%   | 18.3%   | 86.7%      | 18.9%       | 26.7%    | 13.3%           | 12        |
| 7    | 60    | 3.8  | 86.7%   | 13.3%   | 91.7%      | 9.9%        | 15.0%    | 6.7%            | 13        |
| 8    | 60    | 4.3  | 80.0%   | 8.3%    | 86.7%      | 15.2%       | 21.7%    | 8.3%            | 16        |
| 9    | 60    | 4.6  | 83.3%   | 5.0%    | 85.0%      | 17.4%       | 26.7%    | 11.7%           | 10        |
| 10   | 60    | 5.2  | 65.0%   | 3.3%    | 76.7%      | 25.4%       | 33.3%    | 10.0%           | 9         |
| 11   | 60    | 5.6  | 66.7%   | 1.7%    | 73.3%      | 27.7%       | 35.0%    | 8.3%            | 12        |
| 12   | 60    | 6.0  | 70.0%   | 5.0%    | 75.0%      | 26.0%       | 28.3%    | 3.3%            | 13        |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 82    | 100.0%  | 98.8%   | 100.0%     | 1.8%        | 0.0%     | 0.0%            | 15.1%                      |
| 2    | 114   | 70.2%   | 1.8%    | 76.3%      | 28.0%       | 31.6%    | 7.9%            | 37.5%                      |
| 3    | 99    | 64.6%   | 0.0%    | 73.7%      | 24.7%       | 35.4%    | 9.1%            | 40.8%                      |
| 4    | 115   | 80.9%   | 0.9%    | 85.2%      | 17.3%       | 28.7%    | 13.9%           | 38.7%                      |
| 5    | 99    | 62.6%   | 2.0%    | 71.7%      | 28.2%       | 41.4%    | 13.1%           | 41.5%                      |
| 6    | 45    | 57.8%   | 0.0%    | 64.4%      | 34.9%       | 42.2%    | 6.7%            | 42.7%                      |
| 7    | 20    | 35.0%   | 0.0%    | 50.0%      | 56.6%       | 60.0%    | 10.0%           | 42.7%                      |
| 8    | 1     | 0.0%    | 0.0%    | 0.0%       | 100.0%      | 100.0%   | 0.0%            | 49.7%                      |

Week 1 (rank 1): finale 100.0% (Phase 1 100.0%, Phase 2 98.3%). All normal weeks: Phase 1 72.0%, Phase 2 15.0%, finale 78.3%, knocked out 23.3%, won in overtime 9.0%. Mean rank after the last week: 6.28.

### committed (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 100.0%  | 100.0%  | 100.0%     | 0.5%        | 0.0%     | 0.0%            | 10        |
| 2    | 60    | 1.8  | 76.7%   | 30.0%   | 95.0%      | 11.2%       | 11.7%    | 6.7%            | 8         |
| 3    | 60    | 2.5  | 76.7%   | 41.7%   | 83.3%      | 15.2%       | 18.3%    | 1.7%            | 17        |
| 4    | 60    | 2.8  | 98.3%   | 31.7%   | 98.3%      | 3.9%        | 1.7%     | 0.0%            | 14        |
| 5    | 60    | 3.3  | 91.7%   | 20.0%   | 96.7%      | 6.2%        | 8.3%     | 5.0%            | 11        |
| 6    | 60    | 3.9  | 88.3%   | 11.7%   | 95.0%      | 8.1%        | 6.7%     | 1.7%            | 10        |
| 7    | 60    | 4.5  | 90.0%   | 11.7%   | 95.0%      | 5.1%        | 8.3%     | 3.3%            | 8         |
| 8    | 60    | 5.2  | 96.7%   | 1.7%    | 98.3%      | 5.5%        | 5.0%     | 3.3%            | 17        |
| 9    | 60    | 5.6  | 93.3%   | 1.7%    | 96.7%      | 5.5%        | 6.7%     | 3.3%            | 14        |
| 10   | 60    | 6.1  | 81.7%   | 3.3%    | 86.7%      | 15.6%       | 18.3%    | 5.0%            | 11        |
| 11   | 60    | 6.6  | 93.3%   | 3.3%    | 95.0%      | 6.3%        | 6.7%     | 1.7%            | 10        |
| 12   | 60    | 7.2  | 76.7%   | 5.0%    | 85.0%      | 17.3%       | 16.7%    | 1.7%            | 8         |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 69    | 100.0%  | 100.0%  | 100.0%     | 1.2%        | 0.0%     | 0.0%            | 15.0%                      |
| 2    | 84    | 83.3%   | 7.1%    | 96.4%      | 9.3%        | 8.3%     | 4.8%            | 30.9%                      |
| 3    | 90    | 78.9%   | 0.0%    | 87.8%      | 13.8%       | 13.3%    | 1.1%            | 36.3%                      |
| 4    | 89    | 83.2%   | 2.3%    | 91.0%      | 9.3%        | 16.9%    | 7.9%            | 36.1%                      |
| 5    | 93    | 90.3%   | 0.0%    | 92.5%      | 5.1%        | 9.7%     | 2.1%            | 35.9%                      |
| 6    | 76    | 90.8%   | 5.3%    | 94.7%      | 6.0%        | 7.9%     | 2.6%            | 33.6%                      |
| 7    | 59    | 84.8%   | 3.4%    | 91.5%      | 14.7%       | 15.3%    | 6.8%            | 33.2%                      |
| 8    | 22    | 63.6%   | 0.0%    | 72.7%      | 32.4%       | 27.3%    | 0.0%            | 36.7%                      |

Week 1 (rank 1): finale 100.0% (Phase 1 100.0%, Phase 2 100.0%). All normal weeks: Phase 1 86.1%, Phase 2 14.3%, finale 92.4%, knocked out 9.3%, won in overtime 3.4%. Mean rank after the last week: 7.83.

## Supplies (journey servers)

- **shipped**: 1 seeds x 30 servers x 12 weeks, seed "leet"

### Min-maxer

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 38.5   | 41.4   | 49.4   | 41.3    |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                 | week 4                 | week 8                  | week 12                 |
| ------- | ---------------------- | ---------------------- | ----------------------- | ----------------------- |
| shipped | 7.7 / 4.8 / 29.9 / 0.0 | 8.3 / 7.0 / 26.3 / 0.0 | 13.4 / 7.0 / 28.0 / 1.5 | 13.3 / 6.9 / 19.3 / 2.0 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1           | week 4           | week 8           | week 12           |
| ------- | ---------------- | ---------------- | ---------------- | ----------------- |
| shipped | 29.9 / 1.4 / 0.0 | 26.3 / 2.7 / 0.0 | 28.0 / 8.9 / 0.1 | 19.3 / 10.5 / 0.9 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 3.8    | 3.6    | 3.3    | 3.4     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 15     | 39     | 20     | 19      |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 288    | 605    | 894    | 1028    |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 13.6   | 82.7   | 149.0  | 174.6   |

**Bait / Essence / glimmer / shards held**

| Variant | week 1          | week 4         | week 8          | week 12          |
| ------- | --------------- | -------------- | --------------- | ---------------- |
| shipped | 12 / 81 / 1 / 2 | 7 / 72 / 5 / 5 | 6 / 77 / 12 / 6 | 26 / 87 / 24 / 9 |

Share of days scrap blocked the gear path: shipped 8%

### Engaged

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 10.3   | 22.7   | 25.8   | 25.3    |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12                |
| ------- | --------------------- | --------------------- | --------------------- | ---------------------- |
| shipped | 4.4 / 3.7 / 3.8 / 0.0 | 6.7 / 6.9 / 9.0 / 0.0 | 9.7 / 6.9 / 9.2 / 0.0 | 10.1 / 6.9 / 7.8 / 0.2 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 3.8 / 0.0 / 0.0 | 9.0 / 1.4 / 0.0 | 9.2 / 2.5 / 0.1 | 7.8 / 3.8 / 0.4 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 1.6    | 2.0    | 1.3    | 1.4     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 49     | 205    | 532    | 1042    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 226    | 464    | 610    | 814     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 6.1    | 39.4   | 74.3   | 115.7   |

**Bait / Essence / glimmer / shards held**

| Variant | week 1           | week 4            | week 8           | week 12            |
| ------- | ---------------- | ----------------- | ---------------- | ------------------ |
| shipped | 102 / 90 / 0 / 2 | 107 / 223 / 2 / 6 | 53 / 383 / 6 / 7 | 12 / 485 / 13 / 13 |

Share of days scrap blocked the gear path: shipped 1%

### Regular

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.7    | 7.1    | 7.3    | 8.0     |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12               |
| ------- | --------------------- | --------------------- | --------------------- | --------------------- |
| shipped | 0.8 / 0.3 / 0.1 / 0.0 | 2.5 / 4.4 / 0.4 / 0.0 | 2.5 / 4.5 / 0.6 / 0.0 | 2.7 / 4.4 / 0.5 / 0.0 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.1 / 0.0 / 0.0 | 0.4 / 0.0 / 0.0 | 0.6 / 0.0 / 0.0 | 0.5 / 0.0 / 0.0 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.5    | 2.8    | 3.3    | 3.1     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 21     | 99     | 218    | 339     |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 128    | 286    | 427    | 494     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 2.4    | 16.9   | 40.4   | 55.5    |

**Bait / Essence / glimmer / shards held**

| Variant | week 1           | week 4            | week 8             | week 12             |
| ------- | ---------------- | ----------------- | ------------------ | ------------------- |
| shipped | 163 / 63 / 0 / 1 | 676 / 194 / 1 / 4 | 1348 / 398 / 2 / 7 | 2020 / 678 / 3 / 10 |

Share of days scrap blocked the gear path: shipped 0%

### Drop-in

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.0    | 0.3    | 1.1    | 1.0     |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12               |
| ------- | --------------------- | --------------------- | --------------------- | --------------------- |
| shipped | 0.1 / 0.0 / 0.0 / 0.0 | 0.2 / 0.4 / 0.0 / 0.0 | 0.4 / 1.1 / 0.0 / 0.0 | 0.4 / 1.3 / 0.0 / 0.0 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.1    | 0.8    | 2.9    | 4.8     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 14     | 25     | 47     | 71      |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 64     | 149    | 217    | 267     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 1.2    | 3.8    | 10.8   | 23.4    |

**Bait / Essence / glimmer / shards held**

| Variant | week 1          | week 4            | week 8            | week 12           |
| ------- | --------------- | ----------------- | ----------------- | ----------------- |
| shipped | 46 / 42 / 0 / 0 | 183 / 112 / 0 / 1 | 375 / 233 / 0 / 2 | 565 / 355 / 1 / 3 |

Share of days scrap blocked the gear path: shipped 0%

## Creatures: catches, duplicates and talents (journey servers)

- **shipped**: 1 seeds x 12 servers x 30 weeks, seed "leet:creatures"

### Min-maxer

Weeks to complete the base catalogue (median; share who did): shipped 5 (100%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                       |
| ------- | -------- | -------- | -------- | -------- | ------- | ------------------------------------- |
| shipped | 1 / 1    | 2 / 3    | 2 / 4    | 7 / 11   | 2       | 19 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1            | week 4             | week 8             | week 12            | week 20            | week 30            |
| ------- | ----------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| shipped | 41.3 / 10.1 / 5.3 | 56.9 / 13.4 / 11.8 | 75.4 / 15.5 / 15.2 | 66.3 / 13.4 / 13.4 | 63.1 / 13.9 / 13.9 | 86.5 / 17.5 / 17.5 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12          | week 20          | week 30          |
| ------- | --------------- | --------------- | --------------- | ---------------- | ---------------- | ---------------- |
| shipped | 2.0 / 3.3 / 0.0 | 2.3 / 5.5 / 3.9 | 2.4 / 2.9 / 9.8 | 1.5 / 1.3 / 10.7 | 0.6 / 0.9 / 12.4 | 1.2 / 0.3 / 16.0 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 5.7    | 1.0    | 0.0    | 0.0     | 0.0     | 0.0     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.8 | 0.3 / 1.4 | 0.0 / 2.6 | 0.0 / 2.3 | 0.0 / 1.8 | 0.0 / 2.6 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 5.7    | 10.8   | 12.0   | 12.0    | 12.0    | 12.0    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1     | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | ---------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 14.0 / 8.5 | 22.0 / 20.0 | 30.0 / 23.5 | 30.0 / 30.0 | 30.0 / 30.0 | 30.0 / 30.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1                   | week 4                   | week 8                    | week 12                   | week 20                   | week 30                    |
| ------- | ------------------------ | ------------------------ | ------------------------- | ------------------------- | ------------------------- | -------------------------- |
| shipped | 5725 / 5411 / 3513 / 611 | 6258 / 5029 / 3513 / 996 | 9262 / 4509 / 3295 / 1254 | 9055 / 2478 / 3039 / 1183 | 9917 / 1853 / 3203 / 1303 | 11700 / 1829 / 3109 / 1805 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1            | week 4            | week 8            | week 12          | week 20          | week 30          |
| ------- | ----------------- | ----------------- | ----------------- | ---------------- | ---------------- | ---------------- |
| shipped | 42.8 / 37.2 / 1.3 | 14.3 / 23.3 / 2.1 | 16.1 / 23.2 / 0.9 | 7.4 / 20.8 / 0.7 | 8.1 / 21.2 / 0.5 | 7.5 / 21.6 / 0.7 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1              | week 4              | week 8              | week 12             | week 20             | week 30             |
| ------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| shipped | 330 / 250 / 68 / 20 | 333 / 261 / 57 / 28 | 332 / 299 / 48 / 27 | 328 / 298 / 55 / 23 | 326 / 302 / 61 / 11 | 325 / 324 / 63 / 18 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 5.5 / 5.7 | 3.4 / 3.5 | 2.8 / 2.8 | 2.2 / 2.4 | 3.1 / 2.9 | 3.3 / 3.3 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.6 / 2.0 | 1.0 / 2.8 | 0.8 / 2.7 | 0.8 / 2.3 | 0.6 / 1.1 | 1.0 / 1.8 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.9%   | 5.3%   | 5.5%   | 7.2%    | 6.7%    | 11.7%   |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 265    | 616    | 896    | 1025    | 1120    | 1202    |

### Engaged

Weeks to complete the base catalogue (median; share who did): shipped 9 (100%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                       |
| ------- | -------- | -------- | -------- | -------- | ------- | ------------------------------------- |
| shipped | 1 / 1    | 2 / 4    | 3 / 5    | 11 / 17  | 2       | 33 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1           | week 4           | week 8             | week 12            | week 20            | week 30            |
| ------- | ---------------- | ---------------- | ------------------ | ------------------ | ------------------ | ------------------ |
| shipped | 18.3 / 4.2 / 1.6 | 27.6 / 6.4 / 5.1 | 48.8 / 11.4 / 10.4 | 45.7 / 10.1 / 10.1 | 47.4 / 10.6 / 10.6 | 53.0 / 12.0 / 12.0 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30          |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | ---------------- |
| shipped | 0.8 / 0.8 / 0.0 | 1.4 / 3.3 / 0.4 | 1.8 / 3.9 / 4.7 | 1.3 / 2.9 / 5.9 | 1.4 / 1.3 / 8.0 | 1.0 / 0.6 / 10.4 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 3.6    | 0.9    | 0.8    | 0.0     | 0.0     | 0.0     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.5 | 0.0 / 0.8 | 0.6 / 1.4 | 0.0 / 1.5 | 0.0 / 1.5 | 0.0 / 1.7 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 3.6    | 8.1    | 11.4   | 12.0    | 12.0    | 12.0    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1      | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 11.0 / 10.0 | 20.0 / 19.0 | 26.0 / 20.0 | 30.0 / 24.0 | 30.0 / 30.0 | 30.0 / 30.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1                  | week 4                   | week 8                   | week 12                  | week 20                  | week 30                  |
| ------- | ----------------------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| shipped | 2980 / 3896 / 3143 / 63 | 3853 / 5393 / 3513 / 217 | 7883 / 4094 / 3295 / 211 | 6461 / 3532 / 3039 / 274 | 7648 / 2113 / 3203 / 343 | 8563 / 1743 / 3109 / 327 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1            | week 4            | week 8            | week 12           | week 20          | week 30          |
| ------- | ----------------- | ----------------- | ----------------- | ----------------- | ---------------- | ---------------- |
| shipped | 29.3 / 26.3 / 0.8 | 19.9 / 25.0 / 1.1 | 13.1 / 24.1 / 1.3 | 10.9 / 20.6 / 0.9 | 5.3 / 17.2 / 0.2 | 8.6 / 19.3 / 0.5 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1             | week 4              | week 8              | week 12             | week 20             | week 30             |
| ------- | ------------------ | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| shipped | 298 / 167 / 37 / 8 | 305 / 234 / 58 / 16 | 301 / 298 / 44 / 19 | 301 / 263 / 39 / 18 | 298 / 262 / 47 / 16 | 297 / 259 / 43 / 12 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 2.5 / 2.9 | 3.7 / 3.6 | 2.7 / 2.6 | 2.1 / 1.9 | 1.5 / 1.6 | 1.4 / 1.5 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.3 / 0.8 | 0.4 / 1.6 | 0.6 / 1.9 | 0.5 / 1.8 | 0.7 / 1.6 | 0.7 / 1.2 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.1%   | 4.2%   | 3.1%   | 6.2%    | 8.3%    | 7.5%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 209    | 479    | 612    | 810     | 999     | 1075    |

### Regular

Weeks to complete the base catalogue (median; share who did): shipped 24 (83%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                         |
| ------- | -------- | -------- | -------- | -------- | ------- | --------------------------------------- |
| shipped | 2 / 2    | 4 / 8.5  | 7 / 12.5 | 24 / -   | 4       | 77.5 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1          | week 4          | week 8           | week 12         | week 20          | week 30          |
| ------- | --------------- | --------------- | ---------------- | --------------- | ---------------- | ---------------- |
| shipped | 3.3 / 1.4 / 0.0 | 8.7 / 2.1 / 0.9 | 10.3 / 2.4 / 1.8 | 8.9 / 1.8 / 1.5 | 12.2 / 3.2 / 2.9 | 12.3 / 3.1 / 3.1 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.4 / 0.6 / 0.0 | 0.6 / 1.1 / 0.1 | 0.6 / 0.9 / 0.0 | 0.7 / 1.7 / 0.6 | 0.5 / 1.1 / 1.4 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.3    | 0.7    | 0.4    | 0.3     | 0.2     | 0.0     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.4 | 0.0 / 0.3 | 0.0 / 0.3 | 0.1 / 0.5 | 0.0 / 0.4 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.3    | 4.7    | 6.9    | 8.0     | 10.4    | 11.8    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1    | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | --------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 9.0 / 6.0 | 16.0 / 10.0 | 20.0 / 14.5 | 20.0 / 19.5 | 27.0 / 20.0 | 30.0 / 23.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1               | week 4                 | week 8                 | week 12               | week 20                | week 30                 |
| ------- | -------------------- | ---------------------- | ---------------------- | --------------------- | ---------------------- | ----------------------- |
| shipped | 292 / 514 / 1804 / 7 | 558 / 2545 / 3196 / 13 | 641 / 1741 / 2711 / 14 | 581 / 1402 / 2573 / 8 | 922 / 1416 / 2960 / 12 | 1074 / 1331 / 2659 / 16 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1           | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | ---------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 14.9 / 0.0 / 0.0 | 6.7 / 0.0 / 0.5 | 7.7 / 0.0 / 0.1 | 4.4 / 0.0 / 0.1 | 5.3 / 0.0 / 0.4 | 3.7 / 0.0 / 0.4 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 168 / 0 / 3 / 0 | 175 / 0 / 3 / 4 | 171 / 0 / 6 / 7 | 171 / 0 / 3 / 6 | 172 / 0 / 6 / 6 | 168 / 0 / 4 / 6 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.2 / 0.2 | 0.2 / 0.2 | 0.4 / 0.6 | 0.3 / 0.3 | 0.4 / 0.4 | 0.3 / 0.3 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.1 / 0.0 | 0.1 / 0.4 | 0.0 / 0.7 | 0.1 / 0.6 | 0.3 / 0.6 | 0.2 / 0.6 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.3%   | 0.9%   | 3.5%   | 4.1%    | 4.7%    | 5.5%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 141    | 300    | 426    | 482     | 591     | 722     |

### Drop-in

Weeks to complete the base catalogue (median; share who did): shipped never (0%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                       |
| ------- | -------- | -------- | -------- | -------- | ------- | ------------------------------------- |
| shipped | 3 / 6    | 14 / -   | 20 / -   | - / -    | 13      | 73 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.3 / 0.3 / 0.0 | 1.1 / 0.5 / 0.0 | 0.7 / 0.2 / 0.0 | 1.4 / 0.4 / 0.2 | 3.0 / 0.8 / 0.3 | 1.6 / 0.4 / 0.3 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.2 / 0.0 | 0.1 / 0.2 / 0.0 | 0.1 / 0.2 / 0.0 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.3    | 0.2    | 0.1    | 0.2     | 0.4     | 0.1     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.1 | 0.0 / 0.1 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.3    | 2.0    | 2.6    | 3.3     | 4.8     | 6.3     |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1    | week 4     | week 8      | week 12     | week 20     | week 30     |
| ------- | --------- | ---------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 8.0 / 4.5 | 10.0 / 8.0 | 10.0 / 10.0 | 12.0 / 10.0 | 18.5 / 10.0 | 20.0 / 11.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1           | week 4              | week 8              | week 12             | week 20              | week 30              |
| ------- | ---------------- | ------------------- | ------------------- | ------------------- | -------------------- | -------------------- |
| shipped | 30 / 0 / 804 / 0 | 65 / 343 / 1617 / 0 | 69 / 602 / 1743 / 0 | 91 / 719 / 1448 / 0 | 157 / 362 / 1404 / 0 | 110 / 415 / 1579 / 0 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 5.0 / 0.0 / 0.0 | 6.6 / 0.0 / 0.0 | 1.7 / 0.0 / 0.1 | 2.0 / 0.0 / 0.1 | 1.5 / 0.0 / 0.1 | 2.0 / 0.0 / 0.0 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1         | week 4         | week 8         | week 12        | week 20        | week 30        |
| ------- | -------------- | -------------- | -------------- | -------------- | -------------- | -------------- |
| shipped | 48 / 0 / 0 / 0 | 48 / 0 / 0 / 0 | 52 / 0 / 0 / 0 | 47 / 0 / 0 / 0 | 43 / 0 / 0 / 2 | 46 / 0 / 0 / 1 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.1 / 0.0 | 0.0 / 0.0 | 0.1 / 0.0 | 0.0 / 0.2 | 0.0 / 0.1 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 0.9%   | 1.9%   | 3.0%   | 3.1%    | 4.1%    | 4.5%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 70     | 169    | 221    | 273     | 360     | 449     |

## Gear share of fight-scored power (journey servers)

20 servers of the default journey mix, 30 weeks, seed "leet:gear". Each cell is the median share of the team's fight-scored power that its worn gear gives, with the design's range under it.

| Profile   | Players | Week 2               | Week 8                 | Week 20                | Week 30                |
| --------- | ------- | -------------------- | ---------------------- | ---------------------- | ---------------------- |
| Min-maxer | 20      | 6.4% (5.0% to 10.0%) | 25.0% (15.0% to 22.0%) | 32.4% (25.0% to 32.0%) | 32.3% (33.0% to 40.0%) |
| Engaged   | 60      | 5.1% (5.0% to 10.0%) | 15.6% (15.0% to 22.0%) | 23.9% (25.0% to 32.0%) | 27.1% (33.0% to 40.0%) |
| Regular   | 60      | 2.6% (3.0% to 6.0%)  | 9.2% (10.0% to 15.0%)  | 19.3% (18.0% to 24.0%) | 23.6% (28.0% to 34.0%) |
| Drop-in   | 40      | 5.3% (0.0% to 3.0%)  | 4.7% (5.0% to 8.0%)    | 14.0% (10.0% to 15.0%) | 20.5% (15.0% to 20.0%) |

## Bosses

### Tidal Colossus (tide)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 30% / 85% / 100%           | 1.66                | 100.0%           |
| 5       | 200  | 4.4           | 87.0%         | 2.0%          | 88.5%      | 29% / 65% / 98%            | 2.62                | 31.8%            |
| 10      | 200  | 9.1           | 77.0%         | 0.5%          | 79.0%      | 29% / 61% / 97%            | 4.78                | 18.1%            |
| 15      | 200  | 13.6          | 65.5%         | 0.0%          | 79.5%      | 29% / 60% / 98%            | 6.93                | 13.3%            |

Typical group (5-10 signed up, 299 runs): Phase 1 79.9%, Phase 2 1.0%, finale 82.3%.

### Cinder Wyrm (ember)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 99.5%         | 100.0%     | 30% / 85% / 100%           | 0.85                | 100.0%           |
| 5       | 200  | 4.4           | 78.0%         | 0.0%          | 79.0%      | 29% / 62% / 98%            | 1.25                | 30.2%            |
| 10      | 200  | 9.1           | 67.5%         | 0.5%          | 74.5%      | 29% / 60% / 96%            | 2.74                | 17.2%            |
| 15      | 200  | 13.6          | 64.0%         | 0.0%          | 72.0%      | 28% / 59% / 97%            | 4.50                | 12.0%            |

Typical group (5-10 signed up, 296 runs): Phase 1 70.6%, Phase 2 0.3%, finale 75.3%.

### Thornmother (grove)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 39.0%         | 100.0%     | 30% / 80% / 100%           | 1.11                | 100.0%           |
| 5       | 200  | 4.4           | 59.0%         | 0.0%          | 59.5%      | 28% / 57% / 94%            | 1.84                | 31.4%            |
| 10      | 200  | 9.1           | 60.5%         | 0.0%          | 65.5%      | 28% / 58% / 96%            | 4.18                | 18.0%            |
| 15      | 200  | 13.5          | 54.0%         | 0.0%          | 64.5%      | 28% / 57% / 96%            | 6.57                | 13.3%            |

Typical group (5-10 signed up, 294 runs): Phase 1 58.8%, Phase 2 0.0%, finale 64.6%.

### Storm Sovereign (spark)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 30% / 85% / 100%           | 1.62                | 100.0%           |
| 5       | 200  | 4.3           | 85.0%         | 10.5%         | 85.5%      | 29% / 69% / 98%            | 2.57                | 32.5%            |
| 10      | 200  | 9.0           | 74.5%         | 0.5%          | 78.5%      | 29% / 62% / 98%            | 4.85                | 18.2%            |
| 15      | 200  | 13.4          | 64.5%         | 0.0%          | 72.0%      | 29% / 60% / 97%            | 6.98                | 13.4%            |

Typical group (5-10 signed up, 291 runs): Phase 1 76.3%, Phase 2 2.4%, finale 79.4%.

## Fairness and contribution

| Archetype  | Average share of contribution (groups of 5+) | Average Essence per raid week |
| ---------- | -------------------------------------------- | ----------------------------- |
| Casual     | 7.1%                                         | 46.8                          |
| Daily      | 11.6%                                        | 69.5                          |
| Top earner | 11.1%                                        | 58.9                          |
| Newcomer   | 6.9%                                         | 49.6                          |

## Archetype progression

Averages over the 24 default-server sims (10 players each).

### Casual

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 72      | 100         | 1             | 0               | 2.1           | 114         | 7.2       | 0.0     | 48.2           | 48.3         | 0.04             | 0.7  |
| 2    | 72      | 100         | 16            | 0               | 2.4           | 157         | 9.2       | 0.0     | 22.2           | 71.0         | 0.06             | 0.9  |
| 3    | 72      | 99          | 17            | 0               | 3.2           | 197         | 10.3      | 0.0     | 41.3           | 113.6        | 0.11             | 1.4  |
| 4    | 72      | 103         | 21            | 0               | 3.9           | 225         | 11.1      | 0.0     | 39.8           | 154.8        | 0.15             | 1.8  |
| 5    | 72      | 103         | 23            | 0               | 4.7           | 252         | 12.6      | 0.1     | 42.8           | 198.1        | 0.21             | 2.2  |
| 6    | 72      | 103         | 23            | 0               | 5.4           | 280         | 14.0      | 0.3     | 33.0           | 228.8        | 0.24             | 2.6  |
| 7    | 72      | 103         | 23            | 0               | 6.0           | 318         | 15.6      | 0.7     | 51.9           | 274.0        | 0.32             | 3.0  |
| 8    | 72      | 103         | 22            | 0               | 6.5           | 349         | 17.0      | 0.9     | 54.4           | 325.6        | 0.39             | 3.3  |
| 9    | 72      | 103         | 20            | 0               | 7.0           | 379         | 18.2      | 1.2     | 51.4           | 372.6        | 0.46             | 3.6  |
| 10   | 72      | 104         | 21            | 0               | 7.5           | 405         | 19.0      | 1.4     | 70.8           | 439.9        | 0.60             | 3.7  |
| 11   | 72      | 104         | 19            | 0               | 7.7           | 428         | 19.6      | 1.5     | 58.3           | 494.7        | 0.69             | 3.9  |
| 12   | 72      | 104         | 18            | 0               | 8.0           | 450         | 20.0      | 1.6     | 61.8           | 552.8        | 0.82             | 3.7  |

### Daily

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 96      | 318         | 64            | 0               | 4.1           | 218         | 10.9      | 0.0     | 87.7           | 90.8         | 0.06             | 0.9  |
| 2    | 96      | 318         | 76            | 0               | 6.5           | 311         | 14.9      | 0.8     | 43.8           | 83.1         | 0.09             | 1.3  |
| 3    | 96      | 318         | 74            | 0               | 8.0           | 415         | 18.0      | 1.8     | 65.5           | 79.7         | 0.14             | 2.1  |
| 4    | 96      | 328         | 77            | 0               | 9.2           | 500         | 19.8      | 2.2     | 64.0           | 77.3         | 0.21             | 2.6  |
| 5    | 96      | 328         | 75            | 0               | 10.1          | 561         | 21.2      | 2.6     | 75.2           | 83.7         | 0.28             | 3.1  |
| 6    | 96      | 328         | 75            | 0               | 11.0          | 609         | 22.6      | 2.9     | 77.1           | 85.3         | 0.41             | 3.6  |
| 7    | 96      | 328         | 72            | 0               | 11.5          | 660         | 24.3      | 3.2     | 86.3           | 91.2         | 0.54             | 3.8  |
| 8    | 96      | 329         | 74            | 0               | 11.9          | 712         | 25.9      | 3.6     | 93.5           | 123.4        | 0.77             | 3.2  |
| 9    | 96      | 328         | 72            | 0               | 12.0          | 764         | 27.5      | 3.9     | 85.2           | 122.6        | 0.92             | 3.4  |
| 10   | 96      | 329         | 74            | 0               | 12.0          | 811         | 28.9      | 4.3     | 94.0           | 132.9        | 1.08             | 3.0  |
| 11   | 96      | 328         | 75            | 0               | 12.0          | 853         | 29.7      | 4.6     | 85.4           | 127.2        | 1.21             | 3.0  |
| 12   | 96      | 328         | 75            | 0               | 12.0          | 887         | 29.9      | 4.9     | 93.6           | 134.0        | 1.35             | 2.9  |

### Top earner

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 48      | 340         | 63            | 0               | 3.8           | 221         | 11.2      | 0.0     | 83.7           | 87.2         | 0.02             | 1.0  |
| 2    | 48      | 340         | 81            | 0               | 6.1           | 326         | 15.4      | 1.1     | 49.2           | 87.2         | 0.08             | 1.3  |
| 3    | 48      | 340         | 77            | 0               | 7.8           | 423         | 18.4      | 1.8     | 70.2           | 95.2         | 0.17             | 2.0  |
| 4    | 48      | 352         | 83            | 0               | 9.3           | 495         | 20.1      | 2.2     | 61.6           | 83.8         | 0.23             | 2.6  |
| 5    | 48      | 352         | 80            | 0               | 10.1          | 558         | 21.2      | 2.5     | 73.0           | 90.7         | 0.29             | 3.1  |
| 6    | 48      | 352         | 81            | 0               | 10.9          | 608         | 22.7      | 2.8     | 77.9           | 87.7         | 0.44             | 3.4  |
| 7    | 48      | 352         | 81            | 0               | 11.5          | 657         | 24.3      | 3.1     | 81.4           | 87.0         | 0.54             | 3.8  |
| 8    | 48      | 352         | 78            | 0               | 11.8          | 710         | 25.9      | 3.5     | 95.4           | 108.6        | 0.79             | 3.1  |
| 9    | 48      | 352         | 81            | 0               | 12.0          | 764         | 27.4      | 4.0     | 109.2          | 138.4        | 1.10             | 2.3  |
| 10   | 48      | 352         | 78            | 0               | 12.0          | 807         | 28.7      | 4.3     | 100.8          | 147.8        | 1.31             | 2.2  |
| 11   | 48      | 352         | 79            | 0               | 12.0          | 851         | 29.7      | 4.6     | 87.9           | 130.4        | 1.46             | 2.4  |
| 12   | 48      | 352         | 80            | 0               | 12.0          | 887         | 30.0      | 4.9     | 86.6           | 125.9        | 1.56             | 2.7  |

### Newcomer

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 4    | 24      | 328         | 68            | 0               | 4.1           | 223         | 11.0      | 0.0     | 49.2           | 53.1         | 0.04             | 0.7  |
| 5    | 24      | 329         | 76            | 0               | 6.4           | 320         | 15.3      | 1.0     | 62.4           | 78.1         | 0.08             | 1.5  |
| 6    | 24      | 328         | 77            | 0               | 8.2           | 408         | 18.1      | 1.7     | 51.1           | 73.9         | 0.08             | 2.4  |
| 7    | 24      | 328         | 76            | 0               | 9.0           | 498         | 20.0      | 2.3     | 61.0           | 77.6         | 0.08             | 3.3  |
| 8    | 24      | 329         | 79            | 0               | 10.0          | 559         | 20.9      | 2.5     | 57.0           | 83.8         | 0.08             | 4.3  |
| 9    | 24      | 328         | 74            | 0               | 10.8          | 610         | 22.5      | 2.6     | 96.0           | 109.4        | 0.29             | 4.0  |
| 10   | 24      | 329         | 70            | 0               | 11.3          | 655         | 24.2      | 2.9     | 87.7           | 106.0        | 0.46             | 3.9  |
| 11   | 24      | 329         | 72            | 0               | 11.9          | 706         | 25.9      | 3.2     | 79.0           | 103.0        | 0.58             | 4.0  |
| 12   | 24      | 329         | 74            | 0               | 12.0          | 759         | 27.2      | 3.7     | 78.5           | 103.1        | 0.67             | 4.3  |

## Gear and crafting

Gear power is the power the worn items add to the top 3 creatures (`applyGear`, floored like the fight slots), and the share is that power over the top-3 power (gear included). The "today" columns are the same sims and seeds played without gear.

### Casual

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 2.8        | 2.7%       | 1.0                | 0.0            | 1.0                   | 48           | 9.7        |
| 2    | 5.4        | 3.5%       | 3.6                | 1.0            | 1.0                   | 71           | 17.6       |
| 3    | 6.9        | 3.6%       | 4.8                | 1.0            | 1.0                   | 114          | 36.3       |
| 4    | 9.2        | 4.1%       | 6.8                | 1.0            | 1.0                   | 155          | 54.0       |
| 5    | 12.8       | 5.1%       | 9.7                | 1.0            | 1.3                   | 198          | 71.6       |
| 6    | 16.1       | 5.6%       | 14.0               | 1.2            | 1.6                   | 229          | 87.6       |
| 7    | 22.1       | 6.8%       | 19.9               | 1.3            | 1.8                   | 274          | 104.1      |
| 8    | 28.9       | 8.1%       | 26.0               | 1.5            | 2.0                   | 326          | 120.3      |
| 9    | 34.8       | 9.1%       | 32.0               | 1.8            | 2.2                   | 373          | 135.6      |
| 10   | 40.4       | 9.9%       | 36.8               | 1.9            | 2.4                   | 440          | 152.9      |
| 11   | 46.6       | 10.7%      | 43.1               | 2.1            | 2.6                   | 495          | 168.7      |
| 12   | 51.8       | 11.3%      | 47.0               | 2.4            | 2.9                   | 553          | 184.5      |

### Daily

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 7.7        | 3.5%       | 6.0                | 2.2            | 1.7                   | 91           | 33.5       |
| 2    | 21.5       | 6.9%       | 21.4               | 9.5            | 3.6                   | 83           | 36.7       |
| 3    | 40.9       | 9.6%       | 37.3               | 17.9           | 4.8                   | 80           | 43.1       |
| 4    | 75.4       | 14.8%      | 53.7               | 26.5           | 5.7                   | 77           | 60.9       |
| 5    | 99.6       | 17.4%      | 65.1               | 35.6           | 6.2                   | 84           | 78.8       |
| 6    | 120.9      | 19.6%      | 72.9               | 44.8           | 6.6                   | 85           | 94.9       |
| 7    | 142.9      | 21.4%      | 81.8               | 54.4           | 7.1                   | 91           | 116.4      |
| 8    | 161.7      | 22.6%      | 90.0               | 62.7           | 7.5                   | 123          | 164.8      |
| 9    | 180.8      | 23.6%      | 96.3               | 69.1           | 7.9                   | 123          | 249.6      |
| 10   | 196.3      | 24.1%      | 102.6              | 74.9           | 8.2                   | 133          | 353.8      |
| 11   | 207.3      | 24.3%      | 107.4              | 80.2           | 8.6                   | 127          | 464.3      |
| 12   | 219.4      | 24.7%      | 112.1              | 85.0           | 8.9                   | 134          | 582.1      |

### Top earner

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 6.8        | 3.1%       | 4.9                | 2.0            | 1.6                   | 87           | 33.3       |
| 2    | 21.2       | 6.3%       | 22.6               | 8.8            | 3.4                   | 87           | 37.7       |
| 3    | 43.2       | 9.7%       | 39.0               | 17.4           | 4.8                   | 95           | 49.3       |
| 4    | 65.4       | 12.6%      | 51.4               | 25.5           | 5.6                   | 84           | 67.3       |
| 5    | 92.1       | 16.0%      | 65.2               | 34.7           | 6.2                   | 91           | 84.5       |
| 6    | 112.4      | 18.1%      | 73.9               | 44.1           | 6.7                   | 88           | 95.6       |
| 7    | 130.5      | 19.6%      | 82.0               | 53.9           | 7.2                   | 87           | 114.9      |
| 8    | 151.3      | 21.0%      | 91.1               | 63.2           | 7.5                   | 109          | 149.2      |
| 9    | 173.1      | 22.5%      | 98.2               | 70.0           | 8.0                   | 138          | 229.2      |
| 10   | 186.6      | 23.0%      | 101.6              | 75.5           | 8.3                   | 148          | 339.0      |
| 11   | 199.0      | 23.3%      | 106.6              | 80.8           | 8.6                   | 130          | 451.7      |
| 12   | 211.5      | 23.8%      | 111.3              | 85.7           | 8.9                   | 126          | 575.9      |

### Newcomer

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 4    | 10.6       | 4.7%       | 6.1                | 1.9            | 1.7                   | 53           | 35.4       |
| 5    | 24.9       | 7.8%       | 22.6               | 9.2            | 3.6                   | 78           | 38.8       |
| 6    | 39.6       | 9.6%       | 38.4               | 17.4           | 5.0                   | 74           | 39.2       |
| 7    | 66.0       | 12.9%      | 52.3               | 25.8           | 5.6                   | 78           | 55.3       |
| 8    | 96.7       | 17.0%      | 65.5               | 33.8           | 6.2                   | 84           | 84.0       |
| 9    | 123.4      | 19.8%      | 77.6               | 42.6           | 6.5                   | 109          | 93.7       |
| 10   | 141.4      | 21.3%      | 86.2               | 52.2           | 7.3                   | 106          | 110.8      |
| 11   | 162.8      | 22.8%      | 92.7               | 60.9           | 7.6                   | 103          | 146.0      |
| 12   | 181.0      | 23.7%      | 99.3               | 67.8           | 8.0                   | 103          | 225.4      |

### Daily players with gear and without (today)

| Week | Essence held | Essence held today | Top-3 power | Top-3 power today |
| ---- | ------------ | ------------------ | ----------- | ----------------- |
| 1    | 91           | 86                 | 218         | 196               |
| 2    | 83           | 125                | 311         | 243               |
| 3    | 80           | 136                | 415         | 341               |
| 4    | 77           | 189                | 500         | 400               |
| 5    | 84           | 254                | 561         | 429               |
| 6    | 85           | 302                | 609         | 454               |
| 7    | 91           | 359                | 660         | 481               |
| 8    | 123          | 403                | 712         | 519               |
| 9    | 123          | 480                | 764         | 547               |
| 10   | 133          | 544                | 811         | 572               |
| 11   | 127          | 598                | 853         | 600               |
| 12   | 134          | 644                | 887         | 628               |

### What the team wears (end of week 8)

| Archetype  | Common | Rare | Epic | Festival | Average item level | Power added per item | Bag | Blueprints | Scrap | Shards | Glimmer |
| ---------- | ------ | ---- | ---- | -------- | ------------------ | -------------------- | --- | ---------- | ----- | ------ | ------- |
| Casual     | 70%    | 25%  | 5%   | 11%      | 4.6                | 10.4                 | 3.0 | 3.2        | 120   | 5      | 1.8     |
| Daily      | 45%    | 47%  | 8%   | 5%       | 10.2               | 53.9                 | 4.2 | 10.1       | 165   | 7      | 7.3     |
| Top earner | 37%    | 54%  | 9%   | 3%       | 10.4               | 50.4                 | 4.2 | 9.6        | 149   | 6      | 7.8     |
| Newcomer   | 48%    | 46%  | 6%   | 3%       | 8.2                | 32.2                 | 4.0 | 6.3        | 84    | 7      | 4.3     |

## Daily dungeon

Every player with 3 creatures walks the day's map once on each day they check in (casuals on their leet days), with their 3 strongest creatures: 7 floors with the camp on floor 3 (floors count from 0; every path meets there) and the room boss last. A run is cleared when the boss is beaten (and the player then heads home or finishes the Undercroft), ends at home when the player heads home from the camp, and in a defeat when a fight is lost; a run that beat the boss and is lost in the Undercroft below it is a defeat that still moved the depth. From depth 8 the boss's chest opens at once and the player may go down into the Undercroft (see below). Depth 1 to 24 are listed; only beating the boss moves the depth.

### How runs end

| Archetype  | Runs | Cleared | Home | Defeat | Fights / run | Elites / run | Keepsakes / run | Pack found | Pack kept | Reached the camp |
| ---------- | ---- | ------- | ---- | ------ | ------------ | ------------ | --------------- | ---------- | --------- | ---------------- |
| Casual     | 1425 | 50%     | 8%   | 42%    | 4.94         | 0.59         | 1.39            | 7.31       | 6.23      | 94%              |
| Daily      | 7782 | 20%     | 19%  | 61%    | 4.30         | 0.44         | 1.06            | 5.73       | 4.37      | 88%              |
| Top earner | 3855 | 20%     | 19%  | 60%    | 4.33         | 0.46         | 1.09            | 5.72       | 4.38      | 89%              |
| Newcomer   | 1445 | 23%     | 17%  | 60%    | 4.48         | 0.50         | 1.22            | 6.10       | 4.73      | 90%              |

Fights count a lost one; the pack is Bait, Essence and scrap added up (the supply and experience are not in it; the boss's Essence and scrap, Market Day's scrap and the Undercroft's loot are). Of the runs that reached the camp: Casual rest 2%, swap 19%, keepsake 71%, home 9%; Daily rest 3%, swap 25%, keepsake 51%, home 21%; Top earner rest 3%, swap 24%, keepsake 51%, home 22%; Newcomer rest 3%, swap 17%, keepsake 62%, home 19%.

### The Undercroft

A daily player's runs at depth 8 or over (6898 runs). The main boss fell in 1553 of them, and the descent was offered: 833 went down (53.6% of the offered, 12.1% of all these runs; the policy goes when the row is over 50% HP after catching its breath, a fallen creature already back up). Of the descents, 21.6% beat the first keeper (0.22 keepers a descent), 660 were lost below (half the pack, the depth stays) and 4 headed home from an Undercroft camp. A descent plays 2.81 fights below. All these runs play 4.25 fights (3.91 on the main map); 15.1% step through a carved door and add a room (0.151 rooms a run).

### Clear rate by depth

| Depth | Casual    | Daily     | Top earner |
| ----- | --------- | --------- | ---------- |
| 1     | 91% (79)  | 82% (117) | 100% (48)  |
| 2     | 99% (73)  | 83% (115) | 94% (51)   |
| 3     | 95% (76)  | 85% (113) | 94% (51)   |
| 4     | 88% (82)  | 83% (115) | 92% (52)   |
| 5     | 82% (88)  | 73% (132) | 89% (54)   |
| 6     | 78% (92)  | 63% (152) | 77% (62)   |
| 7     | 68% (106) | 69% (140) | 68% (71)   |
| 8     | 56% (129) | 46% (207) | 56% (85)   |
| 9     | 55% (130) | 44% (216) | 48% (100)  |
| 10    | 40% (168) | 47% (205) | 49% (98)   |
| 11    | 47% (131) | 39% (245) | 42% (114)  |
| 12    | 33% (129) | 37% (258) | 37% (129)  |
| 13    | 52% (56)  | 29% (329) | 32% (151)  |
| 14    | 16% (70)  | 12% (821) | 11% (429)  |
| 15    | 44% (9)   | 33% (292) | 29% (165)  |
| 16    | 50% (4)   | 34% (281) | 27% (175)  |
| 17    | 50% (2)   | 26% (366) | 24% (203)  |
| 18    | 100% (1)  | 22% (436) | 20% (235)  |
| 19    | -         | 20% (474) | 13% (352)  |
| 20    | -         | 20% (462) | 21% (213)  |
| 21    | -         | 11% (725) | 11% (332)  |
| 22    | -         | 22% (321) | 22% (145)  |
| 23    | -         | 16% (354) | 27% (99)   |
| 24    | -         | 13% (352) | 10% (186)  |

Runs in brackets. Players stop at the depth where they win about a fifth of their runs.

### Depth after N weeks (median, quartiles)

| Week | Casual        | Daily         | Top earner    | Newcomer      |
| ---- | ------------- | ------------- | ------------- | ------------- |
| 1    | 1 (1 to 1)    | 4 (3 to 5)    | 4 (4 to 6)    | -             |
| 2    | 1 (1 to 2)    | 9 (8 to 9)    | 9 (8 to 10)   | -             |
| 4    | 5 (3 to 6)    | 14 (13 to 15) | 14 (13 to 15) | 5 (4 to 6)    |
| 6    | 8 (7 to 8)    | 17 (14 to 19) | 17 (15 to 19) | 12 (10 to 12) |
| 8    | 10 (9 to 11)  | 20 (18 to 22) | 19 (18 to 21) | 16 (14 to 17) |
| 10   | 12 (10 to 13) | 22 (20 to 24) | 21 (20 to 24) | 18 (16 to 20) |
| 12   | 13 (12 to 14) | 24 (22 to 26) | 24 (21 to 25) | 21 (20 to 22) |

### Reward flow per player and week

| Archetype  | Runs | Cleared | Bait | Essence | Scrap | Gear items |
| ---------- | ---- | ------- | ---- | ------- | ----- | ---------- |
| Casual     | 1.65 | 1.00    | 5.3  | 1.35    | 3.6   | 0.29       |
| Daily      | 6.76 | 1.93    | 17.3 | 3.60    | 11.4  | 0.53       |
| Top earner | 6.69 | 1.89    | 17.2 | 3.51    | 11.4  | 0.53       |
| Newcomer   | 6.69 | 2.20    | 17.9 | 3.95    | 12.6  | 0.67       |

A daily player's runs from week 2 end at home 19.3% of the time and take 4.27 fights (the Undercroft's included).

Dungeon Essence is 4.3% of a daily player's Essence income. Gear's share of a daily player's raid-team power at week 8 is 22.4% with the dungeon and 17.7% without it (the same sims and seeds).

## Elements

| Element | Raid slots | Pick rate |
| ------- | ---------- | --------- |
| tide    | 19127      | 28.6%     |
| ember   | 17356      | 25.9%     |
| grove   | 8600       | 12.9%     |
| spark   | 21838      | 32.6%     |

## Creatures

| Creature               | Rarity | Element | Role    | Picks | Pick rate | Average level | Average contribution | Relative to rarity median |
| ---------------------- | ------ | ------- | ------- | ----- | --------- | ------------- | -------------------- | ------------------------- |
| Ashmole                | common | ember   | support | 2879  | 4.3%      | 17.5          | 5470                 | 1.01x                     |
| Aurorix                | epic   | spark   | support | 197   | 0.3%      | 18.6          | 5942                 | 0.94x                     |
| Cindle                 | common | ember   | payoff  | 12697 | 19.0%     | 19.1          | 6255                 | 1.15x                     |
| Coralynx               | rare   | tide    | payoff  | 5505  | 8.2%      | 18.7          | 6675                 | 1.00x                     |
| Gaiadrake              | epic   | grove   | payoff  | 1494  | 2.2%      | 18.9          | 9233                 | 1.46x                     |
| Hearthshell (Festival) | epic   | ember   | guard   | 525   | 0.8%      | 15.1          | 4199                 | 0.66x                     |
| Lanternfin (Festival)  | epic   | tide    | support | 4136  | 6.2%      | 14.8          | 5513                 | 0.87x                     |
| Mistnewt               | common | tide    | guard   | 2843  | 4.2%      | 19.5          | 5278                 | 0.97x                     |
| Mossback               | rare   | grove   | setter  | 1905  | 2.8%      | 19.2          | 6308                 | 0.95x                     |
| Solmane                | epic   | ember   | setter  | 1255  | 1.9%      | 16.3          | 6316                 | 1.00x                     |
| Splashet               | common | tide    | setter  | 6643  | 9.9%      | 18.7          | 7531                 | 1.38x                     |
| Sproutle               | common | grove   | guard   | 5201  | 7.8%      | 19.2          | 4715                 | 0.87x                     |
| Stormray               | rare   | spark   | payoff  | 7042  | 10.5%     | 18.2          | 7498                 | 1.12x                     |
| Zipmouse               | common | spark   | setter  | 14599 | 21.8%     | 18.3          | 5411                 | 0.99x                     |

## Essence and jackpots

| Players | Player-weeks | Mean Essence | P10 | Median | P90 | Max |
| ------- | ------------ | ------------ | --- | ------ | --- | --- |
| 1       | 800          | 98.1         | 56  | 77     | 198 | 210 |
| 5       | 3501         | 56.4         | 0   | 54     | 161 | 210 |
| 10      | 7257         | 51.3         | 0   | 53     | 73  | 193 |
| 15      | 10822        | 50.2         | 0   | 51     | 149 | 204 |

| Source                           | Finale-win rolls | Jackpots | Rate  | Guaranteed by hard pity |
| -------------------------------- | ---------------- | -------- | ----- | ----------------------- |
| sweep, 1 players                 | 800              | 158      | 19.8% | 0                       |
| sweep, 5 players                 | 2723             | 391      | 14.4% | 0                       |
| sweep, 10 players                | 5348             | 664      | 12.4% | 0                       |
| sweep, 15 players                | 7731             | 1100     | 14.2% | 0                       |
| economy sims, 20 raid weeks each | 5915             | 796      | 13.5% | 79                      |

## Ability damage share (informational)

What abilities add to the damage dealt in the finale, measured by replaying each finale three times against a boss that cannot fall (every ability, only the basic ones, none) so all 12 rounds are played. Creature share = (all - basic only) / all; basic share = (basic only - none) / all. Creature abilities need creature level 10. Informational: the aim is a creature share of about 10-25% for a week-8 roster, not a target.

| Roster week | Group                        | Raids | Creature abilities per raid | Creature share | Basic share |
| ----------- | ---------------------------- | ----- | --------------------------- | -------------- | ----------- |
| 4           | typical group (5-10 players) | 582   | 22.3                        | 18.3%          | 3.4%        |
| 4           | 15 players                   | 400   | 38.2                        | 20.9%          | 3.7%        |
| 4           | 1 player with guests         | 400   | 3.0                         | 9.7%           | 0.7%        |
| 8           | typical group (5-10 players) | 598   | 23.0                        | 19.9%          | 3.2%        |
| 8           | 15 players                   | 400   | 40.4                        | 22.8%          | 3.5%        |
| 8           | 1 player with guests         | 400   | 3.0                         | 10.8%          | 0.8%        |

## Long-running servers (ladder, Festivals, seasons)

40 servers per size, 30 weeks each (6 seasons of 4 normal weeks and a Festival), with the Boss Rank ladder: placement at the first raid week, a normal finale win +1 rank, a loss keeps the rank, a Festival boss fights 3 ranks lower and the rank eases 1 after it. Every server starts at a random point of the 5-week calendar. A rank-up is a week that raised the rank.

| Server                      | Servers | Finale win rate (mean per server) | Per server p10 to p90 | Normal weeks | Festival weeks | Weeks 1-10 | Weeks 11+ | Median weeks between rank-ups (p10 to p90) | Servers with a loss streak over 4 | Median longest loss streak |
| --------------------------- | ------- | --------------------------------- | --------------------- | ------------ | -------------- | ---------- | --------- | ------------------------------------------ | --------------------------------- | -------------------------- |
| Small server (5 players)    | 40      | 81.4%                             | 73% to 87%            | 77.3%        | 97.9%          | 75.0%      | 84.6%     | 1.0 (1 to 3)                               | 0.0%                              | 2                          |
| Typical server (10 players) | 40      | 91.6%                             | 87% to 97%            | 89.7%        | 99.2%          | 86.3%      | 94.3%     | 1.0 (1 to 2)                               | 0.0%                              | 1                          |
| 15-player server            | 40      | 91.8%                             | 87% to 97%            | 90.1%        | 98.8%          | 86.3%      | 94.6%     | 1.0 (1 to 2)                               | 0.0%                              | 1                          |

Median server rank at the start of each week (the Festival boss fights at an eased rank):

| Server                      | Placement | Week 1 | Week 5 | Week 10 | Week 15 | Week 20 | Week 25 | Week 30 | Rank after the last week (p10 to p90) |
| --------------------------- | --------- | ------ | ------ | ------- | ------- | ------- | ------- | ------- | ------------------------------------- |
| Small server (5 players)    | 1.0       | 1.0    | 3.0    | 4.0     | 6.0     | 8.0     | 11.0    | 14.0    | 14.0 (11 to 15)                       |
| Typical server (10 players) | 1.0       | 1.0    | 3.0    | 5.0     | 8.0     | 10.0    | 13.0    | 16.0    | 17.0 (15 to 19)                       |
| 15-player server            | 1.0       | 1.0    | 3.0    | 5.0     | 8.0     | 10.0    | 13.0    | 16.0    | 17.0 (15 to 18)                       |

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

1. Tidal Colossus resists Overload (Reaction Resistance).
2. Round 1: Tidal Colossus has 89150 HP.
3. Lanternfin (Daily 1) powers up Sproutle (Newcomer 1) (+17% damage on its next hit).
4. Lanternfin (Daily 1) powers up Lanternfin (Top earner 1) (+17% damage on its next hit).
5. Lanternfin (Top earner 1) powers up Lanternfin (Daily 1) (+17% damage on its next hit).
6. Lanternfin (Top earner 1) powers up Lanternfin (Daily 4) (+17% damage on its next hit).
7. Lanternfin (Daily 4) powers up Lanternfin (Top earner 1) (+17% damage on its next hit).
8. Lanternfin (Daily 4) powers up Magmole (Daily 4) (+17% damage on its next hit).
9. Magmole (Daily 4) powers up Lanternfin (Daily 4) (+25% damage on its next hit).
10. Magmole (Daily 4) powers up Lanternfin (Daily 2) (+25% damage on its next hit).
11. Lanternfin (Daily 2) powers up Magmole (Daily 4) (+17% damage on its next hit).
12. Lanternfin (Daily 2) powers up Lanternfin (Top earner 2) (+17% damage on its next hit).
13. Lanternfin (Top earner 2) powers up Lanternfin (Daily 2) (+17% damage on its next hit).
14. Aurorix (Top earner 2) powers up Lanternfin (Casual 2) (+11% damage on its next hit).
15. Lanternfin (Casual 2) powers up Aurorix (Top earner 2) (+17% damage on its next hit).
16. Lanternfin (Casual 2) powers up Lanternfin (Daily 3) (+17% damage on its next hit).
17. Lanternfin (Daily 3) powers up Lanternfin (Casual 2) (+17% damage on its next hit).
18. Lanternfin (Daily 3) powers up Ashmole (Newcomer 1) (+17% damage on its next hit).
19. Ashmole (Newcomer 1) powers up Lanternfin (Daily 3) (+21% damage on its next hit).
20. Ashmole (Newcomer 1) powers up Tidewing (Daily 1) (+21% damage on its next hit).
21. Sproutle (Casual 3) acts.
22. Sproutle (Casual 3) hits Tidal Colossus for 38; 89112 HP left.
23. Sproutle (Casual 3) leaves Tidal Colossus Overgrown.
24. Sproutle (Newcomer 1) acts.
25. Sproutle (Newcomer 1) hits Tidal Colossus for 38; 89074 HP left.
26. Lanternfin (Daily 1) acts.
27. Lanternfin (Daily 1) hits Tidal Colossus for 102; 88972 HP left.
28. Lanternfin (Top earner 1) acts.
29. Lanternfin (Top earner 1) hits Tidal Colossus for 159; 88813 HP left.
30. Lanternfin (Daily 4) acts.

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
- **Daily dungeon** (`docs/design/dungeon-paths.md`): every player with at least 3 creatures walks the day's map once on each day they check in (casuals on their leet days); on the first day they ever ran, a run lost to a defeat may be tried once more (a run that headed home or cleared may not). The map (`generateDungeonMap`, from a seed of the day) is the same for the whole server; the team is the 3 strongest creatures by power (gear included), stood in one row by the game's rule for it (`dungeonRowOrder`); there is no basic ability, and every unlocked creature ability fires at its default round. Each fight is one `simulateDungeonRoom` with the HP carried and the keepsakes folded in. The walk is a small policy: prefer the foe the row's elements beat; take an elite only above 70% average HP with nobody down; prefer a mystery room or a cache below 50%; take an event's costly or gamble option only above 60% (a plain heal below 70%); at the camp swap in the strongest unused creature for a fallen one, else rest below 60%, else take the first keepsake, then head home when 2 creatures are down or average HP is under 35%. `random` players choose everything at random and `best` players look one floor ahead and take the better keepsake. The day's map is drawn with carved doors (`{ doors: true }`, as the worker draws it): the policy steps through a door when the route reaches it (no fight, so no risk; below depth 8 it is a quiet room), which adds a room of a random kind (`drawMark`) to the Undercroft. When the room boss falls at depth 8 or over the chest is banked at once (its gear, shard and supply are paid for good, its Essence and scrap go into the pack) and depth + 1 is locked in; then the policy goes down into the Undercroft when, after catching its breath (standing creatures +20% HP, a fallen one back up at 10% HP), the row's average HP is over 50% (`random` players flip a coin; `best` also wants over 75% for a level of 4 floors or more with no camp), else heads home with the pack. Below it plays the same walk on the level's own map (`generateUndercroftMap`, foes 1 depth harder): the same route and event rules, fights, elites and caches put 2 times their loot in the pack, epic fights, camps (the same camp rule and the same home rule as the main camp: the only way home from below), the keeper (a room boss with its signature) and its chest (gear by `rollUndercroftChest`); a cracked floor offers the next level under the same rule. A run is paid as the worker pays it: the pack (all of it at home or when done, half rounded up after a defeat, which below the boss keeps the depth; Market Day's scrap and the boss's full-clear and landmark extras are in the pack), once the boss has fallen its chest (the shard chance, the gear chance, certain at a landmark, the landmark's glimmer), the keepers' chests, the run's supply once a fight is cleared (safe), experience per creature by the fights it stood in the row for plus the full clear bonus for the row that beat the main boss, and the streak bonus on the first run of a day, through `nodeLoot`, `keptOnDefeat`, `rollDungeonLoot`, `rollUndercroftChest`, `dungeonExperience` and `streakBonus`.
- **Time** for jobs: check-ins at 09:00 and 20:00 (casuals at 09:00 on their leet days); a job is claimed at the first check-in after `jobDuration` (the crafter's skill included) has passed.
- **Typical group:** a raid week with 5 to 10 signed-up players, on rosters from the end of week 4 or 8.

Default mix: 3 casual, 4 daily, 2 top, 1 newcomer. Other server sizes use the same mix scaled by largest remainder.
