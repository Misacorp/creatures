_The Undercroft in the simulator (2026-10-18, log entry B-020): the sim draws the day's map with carved doors and plays the full current rules of `docs/design/dungeon-paths.md`: a door adds a room to the Undercroft, the boss's chest is banked at depth 8 and over, and a healthy row (over 60% HP after catching its breath, nobody down) goes down into the Undercroft (rooms with twice the loot, epic fights, camps, a keeper and its chest, a cracked floor for the next level); a defeat below keeps half the pack and the depth. Two foe numbers were tuned (`RULES.dungeon.undercroft.depthBonus` 3 to 1, `RULES.dungeon.hpCurveBp` 300 to 340). Seed `leet`, 12 weeks per economy sim, 200 raid weeks per cell, 24 economy sims per player count, 40 twenty-week pity sims and 40 thirty-week long-run sims per server size (`pnpm sim`, 96 targets: 70 pass, 26 fail). The report of B-019 (`report-2026-10-18-dungeon-paths.md`, 94 targets: 65 pass, 29 fail) is the baseline._

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

70 passed, 26 failed, 0 not measured.

|     | Target                                                                                                                                                                                              | Measured | Requirement    | Metric                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ---------------------------------------- |
| ❌  | Phase 1 clear rate (the boss driven to its 70% floor), typical group (5-10 signed-up players, week 4 or later)                                                                                      | 70.8%    | >= 80.0%       | `raid.typical.phase1ClearRate`           |
| ✅  | Phase 2 clear rate (the boss driven to its 15% floor), typical group: a stronger server's result, not a routine one, or the finale has no work left                                                 | 1.3%     | 0.0% to 25.0%  | `raid.typical.phase2ClearRate`           |
| ❌  | Finale win rate, typical group (the boss usually falls, enrage is the real threat)                                                                                                                  | 74.4%    | 85.0% to 97.0% | `raid.typical.finaleWinRate`             |
| ✅  | Share of the boss's HP left when a typical group's finale begins (real work for the finale: a quarter to under half)                                                                                | 38.8%    | 25.0% to 45.0% | `raid.typical.finaleStartShare`          |
| ✅  | Phase 1 clear rate, 1 player with guests, week 4 or later                                                                                                                                           | 100.0%   | >= 80.0%       | `raid.solo.phase1ClearRate`              |
| ❌  | Finale win rate, 15 players (no easier-with-more-people cliff)                                                                                                                                      | 73.9%    | 85.0% to 99.0% | `raid.fifteen.finaleWinRate`             |
| ✅  | Spread of finale win rate between bosses, typical group (percentage points)                                                                                                                         | 8.3%     | <= 15.0%       | `raid.typical.bossSpread`                |
| ✅  | Bosses a typical group never beats or always beats in the finale (flagged)                                                                                                                          | 0        | <= 0           | `raid.typical.extremeBosses`             |
| ✅  | Creatures knocked out in a typical group's finale (share of the creatures in the row; big hits stay big, knock-outs and swings are wanted: the band only catches broken numbers)                    | 28.0%    | 10.0% to 30.0% | `raid.typical.koShare`                   |
| ✅  | Finale win points lost with the Guard role switched off, Guards spread through the row, typical group, bosses 15% tougher so the role has room to show                                              | 4.54     | >= 2           | `raid.guardValue`                        |
| ✅  | Barrage volleys that hit a creature the previous volley of the same barrage hit although enough others were standing (the no-repeat rule: none)                                                     | 0.0%     | <= 0.0%        | `raid.patternFairness`                   |
| ✅  | Median top player's share of contribution, groups of 5+ players                                                                                                                                     | 16.4%    | <= 35.0%       | `fair.topShareMedian`                    |
| ✅  | Setup credit share of total contribution (setters matter)                                                                                                                                           | 19.6%    | >= 15.0%       | `fair.setupShare`                        |
| ✅  | Reactions per round on average, groups of 5+ players                                                                                                                                                | 4.65     | >= 1           | `fair.reactionsPerRound`                 |
| ✅  | Newcomer (joined week 4) Essence per week at week 6, relative to a top earner                                                                                                                       | 70.4%    | >= 70.0%       | `econ.newcomerEssenceRatioWeek6`         |
| ❌  | Lowest element pick rate in raids                                                                                                                                                                   | 12.7%    | >= 15.0%       | `choice.elementPickRateMin`              |
| ✅  | Highest element pick rate in raids                                                                                                                                                                  | 31.8%    | <= 35.0%       | `choice.elementPickRateMax`              |
| ✅  | Highest creature contribution relative to the median creature of its rarity                                                                                                                         | 1.37x    | <= 1.60x       | `choice.creatureRatioMax`                |
| ✅  | Lowest creature contribution relative to the median creature of its rarity                                                                                                                          | 0.84x    | >= 0.60x       | `choice.creatureRatioMin`                |
| ✅  | Elements picked in under 10% of raid slots (flagged as dead)                                                                                                                                        | 0        | <= 0           | `choice.deadElements`                    |
| ❌  | Casual player's highest creature level at the end of week 4 (evolution level 15)                                                                                                                    | 10       | >= 15          | `econ.casualTopLevelWeek4`               |
| ✅  | Daily player owns at least 8 of 12 catchable species by the end of week 6                                                                                                                           | 11       | >= 8           | `econ.dailySpeciesWeek6`                 |
| ❌  | Top earner vs casual average team power at week 8                                                                                                                                                   | 2.01x    | <= 1.60x       | `econ.powerRatioTopVsCasualWeek8`        |
| ✅  | Jackpot rate per player per finale win, including pity                                                                                                                                              | 13.5%    | 6.0% to 15.0%  | `econ.jackpotRatePerWin`                 |
| ✅  | Players reaching hard pity (10 raids without a jackpot) over 20 weeks (pity counts finale wins, so a winnable raid reaches it more often than a hard one did)                                       | 17.8%    | <= 25.0%       | `econ.hardPityShare20Weeks`              |
| ✅  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, small server (5 players, 30 weeks)                                                             | 82.6%    | 60.0% to 85.0% | `longrun.small.finaleWinRate`            |
| ❌  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, typical server (10 players, 30 weeks)                                                          | 93.1%    | 60.0% to 85.0% | `longrun.typical.finaleWinRate`          |
| ❌  | Long-run finale win rate per server (default journey players on the raid curve), Festivals included, 15-player server (30 weeks)                                                                    | 93.1%    | 60.0% to 85.0% | `longrun.fifteen.finaleWinRate`          |
| ✅  | Festival finale win rate, lowest of the three server sizes                                                                                                                                          | 98.3%    | >= 70.0%       | `longrun.festivalWinRateMin`             |
| ✅  | Median weeks between rank-ups, all long-run servers (a winnable curve: most wins raise the rank, a loss stalls it a week or two)                                                                    | 1        | 1 to 2         | `longrun.rankUpGapMedian`                |
| ✅  | Share of servers with a loss streak of more than 4 weeks, worst of the three sizes                                                                                                                  | 0.0%     | <= 10.0%       | `longrun.lossStreakShareMax`             |
| ✅  | Days until a daily player's first crafted item arrives (90th percentile; a player who never crafts counts as 99)                                                                                    | 1.38     | <= 7           | `gear.dailyFirstCraftDaysP90`            |
| ✅  | Best Crafting skill level of a daily player 30 days after joining (median)                                                                                                                          | 6        | 4 to 6         | `gear.dailyBestSkillDay30`               |
| ❌  | Gear power at week 8 of a player who joined in week 4, relative to the median daily player's                                                                                                        | 58.1%    | >= 60.0%       | `gear.newcomerCatchUpWeek8`              |
| ✅  | A min-maxer's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                   | 6.1%     | 5.0% to 10.0%  | `gear.share.min-maxer.week2`             |
| ❌  | A min-maxer's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                   | 24.3%    | 15.0% to 22.0% | `gear.share.min-maxer.week8`             |
| ✅  | A min-maxer's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                  | 31.6%    | 25.0% to 32.0% | `gear.share.min-maxer.week20`            |
| ❌  | A min-maxer's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                                  | 31.4%    | 33.0% to 40.0% | `gear.share.min-maxer.week30`            |
| ✅  | An engaged player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 5.4%     | 5.0% to 10.0%  | `gear.share.engaged.week2`               |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 14.2%    | 15.0% to 22.0% | `gear.share.engaged.week8`               |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                            | 24.2%    | 25.0% to 32.0% | `gear.share.engaged.week20`              |
| ❌  | An engaged player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                            | 27.6%    | 33.0% to 40.0% | `gear.share.engaged.week30`              |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 2.6%     | 3.0% to 6.0%   | `gear.share.regular.week2`               |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 9.0%     | 10.0% to 15.0% | `gear.share.regular.week8`               |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 16.4%    | 18.0% to 24.0% | `gear.share.regular.week20`              |
| ❌  | A regular player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 22.8%    | 28.0% to 34.0% | `gear.share.regular.week30`              |
| ❌  | A drop-in player's gear share of the raid team's fight-scored power at week 2 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 5.0%     | 0.0% to 3.0%   | `gear.share.drop-in.week2`               |
| ❌  | A drop-in player's gear share of the raid team's fight-scored power at week 8 (median; docs/design/gear-and-creatures-v2.md section 4)                                                              | 4.4%     | 5.0% to 8.0%   | `gear.share.drop-in.week8`               |
| ✅  | A drop-in player's gear share of the raid team's fight-scored power at week 20 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 11.2%    | 10.0% to 15.0% | `gear.share.drop-in.week20`              |
| ✅  | A drop-in player's gear share of the raid team's fight-scored power at week 30 (median; docs/design/gear-and-creatures-v2.md section 4)                                                             | 19.2%    | 15.0% to 20.0% | `gear.share.drop-in.week30`              |
| ✅  | Daily dungeon: depth 1 is cleared (the room boss beaten) in a player's first 7 days, share of those runs                                                                                            | 88.3%    | >= 80.0%       | `dungeon.firstWeekDepth1ClearRate`       |
| ✅  | Daily dungeon: depth a median daily player gains per week, from the end of week 2 to the end of week 8                                                                                              | 1.83     | 1 to 2         | `dungeon.dailyDepthGrowthPerWeek`        |
| ✅  | Daily dungeon: Essence as a share of a daily player's whole Essence income (raids, jackpots and dungeon)                                                                                            | 4.3%     | <= 40.0%       | `dungeon.dailyEssenceShare`              |
| ❌  | Gear's share of a daily player's raid-team power at week 8 with the dungeon's gear and parts in the game (must not pass 20%)                                                                        | 22.4%    | <= 20.0%       | `dungeon.dailyGearShareWeek8`            |
| ✅  | Daily dungeon: share of a daily player's runs, from their second week, that head home from the camp with the pack (the camp choice is real)                                                         | 19.1%    | 10.0% to 45.0% | `dungeon.dailyHomeRate`                  |
| ✅  | Daily dungeon: fights played per run (a lost one included), a daily player's runs from their second week (a run is short: 3 to 5.5 fights)                                                          | 4.11     | 3 to 5.5       | `dungeon.meanFights`                     |
| ✅  | Daily dungeon: share of a daily player's runs that beat the room boss at depth 8 or over (the Undercroft is offered) and go down into it (a real choice: not 20% below, not 80% above)              | 26.6%    | 20.0% to 80.0% | `dungeon.undercroftDescentRate`          |
| ✅  | Daily dungeon: fights played per run (the Undercroft's included, a lost one too) by a daily player at depth 8 or over, when the Undercroft is open to them (runs must not get too long: at most 7)  | 4.07     | <= 7           | `dungeon.eligibleMeanFights`             |
| ✅  | Day a daily player's 2nd expedition slot opens, after joining (median; the first day)                                                                                                               | 1        | <= 1           | `exp.dailySlot2Day`                      |
| ❌  | Day a daily player's 3rd expedition slot opens (median; about a month, 30 plus or minus 7)                                                                                                          | 55       | 23 to 37       | `exp.dailySlot3Day`                      |
| ❌  | Day a daily player's 4th expedition slot opens (median; about four months)                                                                                                                          | 319      | 90 to 150      | `exp.dailySlot4Day`                      |
| ❌  | Day a daily player's 5th expedition slot opens (median; about a year; a slot that never opens counts as 999)                                                                                        | 999      | 330 to 400     | `exp.dailySlot5Day`                      |
| ✅  | Worth per day of the best long strategy (always 12 or 24 hour trips) over the best short one (2 or 6 hours), Bait-free                                                                              | 2.96x    | >= 1.20x       | `exp.longVsShortRate`                    |
| ✅  | Worth per day of always sending 2 hour trips over the worst of the other three strategies (at most 1: spam is the worst)                                                                            | 0.16x    | <= 1.00x       | `exp.spamVsOthersRate`                   |
| ✅  | Share of daily players' finished trips that are 12 or 24 hours (long trips are what people send)                                                                                                    | 99.0%    | >= 50.0%       | `exp.dailyLongShare`                     |
| ✅  | Lowest expected worth of a risky push-on goal against coming home, over every length it is offered after                                                                                            | 0.91x    | >= 0.90x       | `exp.riskyRatioMin`                      |
| ✅  | Highest expected worth of a risky push-on goal against coming home (a fair gamble: within 10%)                                                                                                      | 1.09x    | <= 1.10x       | `exp.riskyRatioMax`                      |
| ✅  | Most species a casual player owns ahead of today's expeditions at the end of any week 1 to 12 (no faster than today, within the measure's noise of about half a species)                            | -0.68    | <= 0.45        | `exp.casualSpeciesVsToday`               |
| ✅  | Raid curve: finale win rate in a new server's first week (rank 1), casual-heavy journey server (1 engaged, 4 regular, 4 drop-in)                                                                    | 98.3%    | >= 85.0%       | `curve.casual-heavy.week1.finaleWinRate` |
| ✅  | Raid curve: finale win rate in a new server's first week (rank 1), default journey server                                                                                                           | 100.0%   | >= 90.0%       | `curve.default.week1.finaleWinRate`      |
| ✅  | Raid curve: finale win rate at Boss Ranks 2 to 5, default journey server (12-week runs, normal weeks)                                                                                               | 80.0%    | 70.0% to 85.0% | `curve.default.r2to5.finaleWinRate`      |
| ❌  | Raid curve: finale win rate at Boss Ranks 2 to 5, committed journey server (arranged rows)                                                                                                          | 93.4%    | >= 95.0%       | `curve.committed.r2to5.finaleWinRate`    |
| ❌  | Raid curve: finale win rate at Boss Rank 6 and up, default journey server                                                                                                                           | 68.3%    | 45.0% to 65.0% | `curve.default.r6up.finaleWinRate`       |
| ✅  | Raid curve: finale win rate at Boss Rank 6 and up, committed journey server                                                                                                                         | 92.7%    | >= 80.0%       | `curve.committed.r6up.finaleWinRate`     |
| ✅  | Raid curve: finale win rate of the hardest rank a committed server reaches within 12 weeks (ranks with at least 40 weeks; never a rank they cannot beat)                                            | 88.8%    | >= 60.0%       | `curve.committed.worstRankWinRate`       |
| ✅  | Raid curve: Phase 1 (Friday) clear rate over all normal weeks, default journey server (weekday rewards flow)                                                                                        | 75.3%    | >= 75.0%       | `curve.default.normal.phase1ClearRate`   |
| ✅  | Raid curve: Phase 2 (Saturday) clear rate over all normal weeks, default journey server (sometimes, not routinely)                                                                                  | 15.0%    | 5.0% to 50.0%  | `curve.default.normal.phase2ClearRate`   |
| ✅  | Raid curve: share of the finale's creatures knocked out over all normal weeks, default journey server (drama without wipes)                                                                         | 20.8%    | 10.0% to 35.0% | `curve.default.normal.koShare`           |
| ✅  | Supplies: a regular player carries at least about 3 supplies a week (weeks 3 to 12; B-011)                                                                                                          | 7.15     | >= 3           | `supplies.regular.usedPerWeek`           |
| ✅  | Supplies: a min-maxer carries at least about 8 supplies a week (weeks 3 to 12; B-011)                                                                                                               | 45.47    | >= 8           | `supplies.min-maxer.usedPerWeek`         |
| ✅  | Supplies: at least a quarter of a min-maxer's supplies are crafted in the Workshop (weeks 3 to 12)                                                                                                  | 56.7%    | >= 25.0%       | `supplies.min-maxer.craftedShare`        |
| ✅  | Supplies: at least a quarter of an engaged player's supplies are crafted in the Workshop (weeks 3 to 12)                                                                                            | 36.2%    | >= 25.0%       | `supplies.engaged.craftedShare`          |
| ✅  | Creatures: a min-maxer owns every species a trip can find (the base catalogue) after about 5 weeks (B-016: the pity floor only speeds players up, so B-014 plan of 9 is out of reach)               | 5.5      | 4 to 8         | `creatures.min-maxer.catalogueWeeks`     |
| ✅  | Creatures: an engaged player completes the base catalogue after about 9 weeks (B-016; B-014 planned 14, pity cannot slow a committed player)                                                        | 8        | 7 to 12        | `creatures.engaged.catalogueWeeks`       |
| ✅  | Creatures: a regular player completes the base catalogue after about 24 weeks (B-016: the pity threshold is set for this), and at least half of them by week 30                                     | 24       | 20 to 30       | `creatures.regular.catalogueWeeks`       |
| ✅  | Creatures: a min-maxer brings home 8 to 20 creatures a week, with the pity floor counted (weeks 3 to 30; B-016, the plan is 10 to 15)                                                               | 15.69    | 8 to 20        | `creatures.min-maxer.catchesPerWeek`     |
| ✅  | Creatures: an engaged player brings home 5 to 14 creatures a week (weeks 3 to 30; B-014)                                                                                                            | 10.41    | 5 to 14        | `creatures.engaged.catchesPerWeek`       |
| ✅  | Creatures: a regular player brings home 1.5 to 4 creatures a week (weeks 3 to 30; B-014)                                                                                                            | 2.51     | 1.5 to 4       | `creatures.regular.catchesPerWeek`       |
| ✅  | Creatures: a min-maxer gets 6 to 18 duplicates a week, enough to feed talents and fusion and not a flood (B-014)                                                                                    | 15.48    | 6 to 18        | `creatures.min-maxer.dupesPerWeek`       |
| ✅  | Creatures: an engaged player gets 4 to 12 duplicates a week (B-014)                                                                                                                                 | 10.13    | 4 to 12        | `creatures.engaged.dupesPerWeek`         |
| ✅  | Creatures: a regular player gets 1 to 3.5 duplicates a week (B-014)                                                                                                                                 | 2.13     | 1 to 3.5       | `creatures.regular.dupesPerWeek`         |
| ✅  | Creatures: lures take at most a quarter of the Bait a min-maxer earns; treats are the main use of Bait now (B-016)                                                                                  | 17.4%    | <= 25.0%       | `creatures.min-maxer.lureBaitShare`      |
| ✅  | Creatures: talents give a min-maxer's raid team 5 to 20% of its fight-scored power at the end of the run (B-014; not a design target, a guard against a talent that is worth nothing or everything) | 9.7%     | 5.0% to 20.0%  | `creatures.min-maxer.talentShareEnd`     |
| ✅  | Creatures: a committed trio reaches level 10 (the Bronze Ribbon gate) in week 1 or 2 (spec 9.2, B-016)                                                                                              | 1        | <= 2           | `creatures.min-maxer.trioLevel10Week`    |
| ✅  | Creatures: a committed trio reaches level 30 around week 11 (spec 9.2, B-016)                                                                                                                       | 11       | 8 to 14        | `creatures.min-maxer.trioLevel30Week`    |
| ✅  | Creatures: no gap of more than 6 levels between two unlocks on the ladder (the first gap, Hat at 1 to Scarf at 7, is the widest; spec 9.3a, B-016)                                                  | 6        | <= 6           | `creatures.min-maxer.stretchLevels`      |

## Finale structure (phase floors and enrage)

Typical groups (5-10 signed up, 1180 raid weeks). A cleared phase leaves its floor (Phase 1: 70% of the boss's HP, Phase 2: 15%), so a finale that follows a cleared Phase 2 starts at the Phase 2 floor. Enrage: 3 rounds at 400% of the boss's Attack on every creature, after the finale's own rounds.

| Measure                                                                                                                                 | Value                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Phase 1 clear rate                                                                                                                      | 70.8%                  |
| Phase 2 clear rate                                                                                                                      | 1.3%                   |
| Finale win rate                                                                                                                         | 74.4%                  |
| Boss HP left when the finale began (mean share of the maximum)                                                                          | 38.8%                  |
| Finale win rate when it began at the Phase 2 floor                                                                                      | 100.0%                 |
| Finale win rate when Phase 2 fell short of its floor                                                                                    | 74.1%                  |
| Finales that reached the enrage rounds                                                                                                  | 34.3%                  |
| Win rate inside the enrage rounds (of the finales that reached them)                                                                    | 25.4%                  |
| Enrage rounds played before the row was wiped (finales that reached enrage and were lost, mean)                                         | 2.99                   |
| Creatures knocked out in the finale                                                                                                     | 28.0%                  |
| Barrage volleys that broke the no-repeat rule (hit a creature the previous volley of the same barrage hit although enough others stood) | 0.00% of 11944 volleys |
| Barrage volleys that repeated a victim because too few other creatures were left standing (the rule allows it)                          | 0.05%                  |

## Roles (Guard and Support ablation)

The same raid weeks played again with a role switched off (Guard: no extra HP, no intercept, no cover; Support: no buff and no element effect; one element: only that Support effect), with the same rosters, sign-ups and dice. Guards are spread through the row (evenly spaced), the formation in which they show; the sim's default formation clumps them in front. The bosses' HP pool is 15% bigger than in the raid sweep, so the reference wins about 70% of its weeks and a role has room to show (at the sweep's own difficulty a spread row wins about 95% and hides what a Guard saves). Typical groups only (5-10 signed up), 2 times the sweep's weeks per cell. The Guard value of the targets is the first table's "Guard off" row, as win points lost. One standard error of a difference is about 1 point; differences under 2 points are noise. Grove has no Support species yet, so its Mend has nothing to switch off (0.0 is expected).

### Players bring their 3 strongest creatures (the sim's rule)

| Switched off  | Raid weeks | Finale win rate | Points vs everything on | Creatures knocked out |
| ------------- | ---------- | --------------- | ----------------------- | --------------------- |
| Everything on | 2358       | 61.1%           | 0.0                     | 33.1%                 |
| Guard off     | 2358       | 56.6%           | -4.5                    | 39.7%                 |
| Support off   | 2358       | 57.6%           | -3.5                    | 36.0%                 |

### Every player brings a Guard and a Support when they own one

A Support is only 1 to 3% of the creatures in the first table, so its effects hardly show there. This population shows what a Support is worth when one is present.

| Switched off         | Raid weeks | Finale win rate | Points vs everything on | Creatures knocked out |
| -------------------- | ---------- | --------------- | ----------------------- | --------------------- |
| Everything on        | 2358       | 65.9%           | 0.0                     | 26.7%                 |
| Guard off            | 2358       | 55.9%           | -9.9                    | 40.1%                 |
| Support off          | 2358       | 51.8%           | -14.0                   | 35.7%                 |
| Ember Stoke off      | 2358       | 62.8%           | -3.1                    | 28.2%                 |
| Spark Overcharge off | 2358       | 65.5%           | -0.3                    | 26.9%                 |
| Tide Mend off        | 2358       | 65.4%           | -0.5                    | 28.3%                 |
| Grove Mend off       | 2358       | 65.9%           | 0.0                     | 26.7%                 |

Guard value (the target): 4.5 win points.

## Setups (greedy and protected rows)

The same raid weeks (rosters, sign-ups and dice of the sweep) played with the row arranged three ways. **Default** is the sim's own row (`autoPlace`: Guards in front, payoffs at the back, Supports in the middle). **Greedy** packs setters and payoffs for the most reactions a round and puts Guards and Supports where they cost the fewest, at the edges. **Protected** puts every payoff beside a Guard where it can (adjacency stops at zone edges), Supports between payoffs, and takes whatever reactions remain. The two setups are the best arrangement a seeded hill-climb finds for their own score (`formations.ts`). Typical groups only (5-10 signed up). "+N ranks" plays the same weeks against a boss N Boss Ranks above the sweep's (the curve's HP and Attack for that rank): at +0 a typical group wins about 93% and there is little left to lose, +1 and +2 are what a server that keeps winning meets next. **Swing** is the standard deviation of the win rate over the cells (server size, boss, roster week) and of the knock-out share from finale to finale, in points; one standard error of a win rate is about 1.5 points at +0 and 2 points at +1.

### The shipped bosses (+0 ranks)

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 72.5%    | 0.0               | 70.3%           | 39.1%                      | 3.62              | 0%                     | 28.6%       | 7.6%                | 99%                              | 1.6%                            | 25.6                             | 35.1                            |
| Greedy              | 1179    | 93.0%    | +20.5             | 91.9%           | 29.2%                      | 6.82              | 12%                    | 9.6%        | 3.9%                | 100%                             | 0.9%                            | 16.4                             | 23.3                            |
| Protected           | 1179    | 94.4%    | +21.9             | 92.9%           | 28.6%                      | 6.78              | 60%                    | 7.8%        | 3.6%                | 100%                             | 0.5%                            | 14.6                             | 20.8                            |

### +1 rank

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 47.2%    | 0.0               | 42.6%           | 47.1%                      | 3.58              | 0%                     | 50.1%       | 9.7%                | 99%                              | 2.7%                            | 37.6                             | 40.0                            |
| Greedy              | 1179    | 78.6%    | +31.5             | 78.4%           | 36.6%                      | 6.79              | 12%                    | 23.4%       | 6.3%                | 100%                             | 1.8%                            | 29.6                             | 36.1                            |
| Protected           | 1179    | 81.2%    | +34.0             | 79.4%           | 35.9%                      | 6.77              | 60%                    | 21.0%       | 6.1%                | 100%                             | 1.1%                            | 27.8                             | 34.2                            |

### +2 ranks

| Row                 | Finales | Win rate | Points vs default | Phase 1 cleared | Boss HP left at the finale | Reactions a round | Payoffs beside a Guard | Knocked out | Knocked out in wins | Lost with over half the row down | Won with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
| ------------------- | ------- | -------- | ----------------- | --------------- | -------------------------- | ----------------- | ---------------------- | ----------- | ------------------- | -------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| Default (autoPlace) | 1179    | 28.5%    | 0.0               | 24.3%           | 53.8%                      | 3.56              | 0%                     | 66.1%       | 12.7%               | 100%                             | 2.7%                            | 28.6                             | 36.1                            |
| Greedy              | 1179    | 53.6%    | +25.1             | 55.0%           | 43.3%                      | 6.68              | 12%                    | 45.1%       | 7.3%                | 100%                             | 2.4%                            | 39.3                             | 43.3                            |
| Protected           | 1179    | 58.1%    | +29.6             | 57.0%           | 42.7%                      | 6.70              | 60%                    | 41.3%       | 7.7%                | 100%                             | 2.9%                            | 37.4                             | 42.5                            |

## High Boss Ranks

Typical groups (5-10 signed up) on the sweep's rosters of week 4 and week 8, against every boss at Boss Ranks 1, 3, 5, 7, 9 and 11 with the shipped rank curve (`RULES.raid.curve`; the rank is forced, whatever the roster would have been placed at). It shows where wins collapse for a roster that has stopped growing, not what a server at that rank looks like (a server that reaches rank 9 has been winning, so its creatures are stronger than these).

| Boss Rank | Roster week | Finales | Phase 1 cleared | Phase 2 cleared | Finale win rate | Boss HP left at the finale | Knocked out | Reached enrage |
| --------- | ----------- | ------- | --------------- | --------------- | --------------- | -------------------------- | ----------- | -------------- |
| 1         | 4           | 582     | 100.0%          | 100.0%          | 100.0%          | 15.0%                      | 0.5%        | 0.0%           |
| 3         | 4           | 582     | 39.9%           | 0.0%            | 43.3%           | 47.0%                      | 54.2%       | 70.8%          |
| 5         | 4           | 582     | 0.7%            | 0.0%            | 0.2%            | 62.9%                      | 92.2%       | 100.0%         |
| 7         | 4           | 582     | 0.2%            | 0.0%            | 0.0%            | 66.9%                      | 97.2%       | 100.0%         |
| 9         | 4           | 582     | 0.0%            | 0.0%            | 0.0%            | 68.9%                      | 99.2%       | 98.5%          |
| 11        | 4           | 582     | 0.0%            | 0.0%            | 0.0%            | 69.6%                      | 99.8%       | 95.0%          |
| 1         | 8           | 597     | 100.0%          | 100.0%          | 100.0%          | 15.0%                      | 0.5%        | 0.0%           |
| 3         | 8           | 597     | 98.0%           | 3.5%            | 98.5%           | 29.6%                      | 4.1%        | 2.5%           |
| 5         | 8           | 597     | 53.1%           | 0.0%            | 63.8%           | 44.0%                      | 33.0%       | 52.9%          |
| 7         | 8           | 597     | 33.2%           | 0.0%            | 38.0%           | 48.4%                      | 60.1%       | 78.4%          |
| 9         | 8           | 597     | 21.6%           | 0.0%            | 21.8%           | 50.5%                      | 77.8%       | 86.3%          |
| 11        | 8           | 597     | 18.8%           | 0.0%            | 17.4%           | 51.0%                      | 84.1%       | 86.9%          |

## Raid curve by Boss Rank (journey servers)

Seed "leet", 12 weeks, 60 servers per mix, allowance income. Festival weeks fight an eased boss; the rank tables count normal weeks only.

### casual-heavy (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 98.3%   | 40.0%   | 98.3%      | 5.1%        | 1.7%     | 0.0%            | 13        |
| 2    | 60    | 1.8  | 38.3%   | 36.7%   | 38.3%      | 62.5%       | 56.7%    | 0.0%            | 10        |
| 3    | 60    | 1.8  | 41.7%   | 38.3%   | 41.7%      | 56.9%       | 58.3%    | 0.0%            | 13        |
| 4    | 60    | 1.8  | 65.0%   | 41.7%   | 65.0%      | 36.7%       | 41.7%    | 6.7%            | 12        |
| 5    | 60    | 2.1  | 68.3%   | 38.3%   | 75.0%      | 29.5%       | 36.7%    | 11.7%           | 12        |
| 6    | 60    | 2.4  | 66.7%   | 38.3%   | 65.0%      | 33.4%       | 36.7%    | 1.7%            | 13        |
| 7    | 60    | 2.6  | 58.3%   | 18.3%   | 63.3%      | 36.0%       | 46.7%    | 10.0%           | 10        |
| 8    | 60    | 2.9  | 60.0%   | 23.3%   | 60.0%      | 38.5%       | 48.3%    | 8.3%            | 13        |
| 9    | 60    | 3.1  | 60.0%   | 23.3%   | 61.7%      | 34.2%       | 43.3%    | 5.0%            | 12        |
| 10   | 60    | 3.3  | 61.7%   | 20.0%   | 68.3%      | 33.1%       | 40.0%    | 8.3%            | 12        |
| 11   | 60    | 3.6  | 60.0%   | 20.0%   | 61.7%      | 35.4%       | 51.7%    | 13.3%           | 13        |
| 12   | 60    | 3.8  | 66.7%   | 11.7%   | 66.7%      | 32.0%       | 41.7%    | 8.3%            | 10        |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 106   | 99.1%   | 71.7%   | 99.1%      | 4.4%        | 0.9%     | 0.0%            | 18.3%                      |
| 2    | 208   | 45.7%   | 2.4%    | 48.1%      | 53.3%       | 56.7%    | 6.3%            | 47.7%                      |
| 3    | 177   | 42.4%   | 0.0%    | 46.9%      | 49.5%       | 66.1%    | 13.0%           | 47.4%                      |
| 4    | 73    | 35.6%   | 0.0%    | 34.3%      | 62.0%       | 76.7%    | 11.0%           | 50.2%                      |
| 5    | 13    | 23.1%   | 0.0%    | 23.1%      | 74.6%       | 76.9%    | 0.0%            | 52.6%                      |

Week 1 (rank 1): finale 98.3% (Phase 1 98.3%, Phase 2 40.0%). All normal weeks: Phase 1 52.7%, Phase 2 14.0%, finale 54.8%, knocked out 44.7%, won in overtime 7.6%. Mean rank after the last week: 4.12.

### default (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 100.0%  | 100.0%  | 100.0%     | 0.7%        | 0.0%     | 0.0%            | 12        |
| 2    | 60    | 1.8  | 58.3%   | 41.7%   | 61.7%      | 40.7%       | 45.0%    | 6.7%            | 13        |
| 3    | 60    | 2.0  | 88.3%   | 48.3%   | 90.0%      | 11.3%       | 11.7%    | 1.7%            | 16        |
| 4    | 60    | 2.4  | 78.3%   | 33.3%   | 80.0%      | 20.0%       | 23.3%    | 3.3%            | 10        |
| 5    | 60    | 2.8  | 80.0%   | 16.7%   | 88.3%      | 14.6%       | 25.0%    | 13.3%           | 9         |
| 6    | 60    | 3.4  | 81.7%   | 16.7%   | 88.3%      | 15.1%       | 21.7%    | 10.0%           | 12        |
| 7    | 60    | 3.9  | 85.0%   | 13.3%   | 93.3%      | 11.6%       | 18.3%    | 11.7%           | 13        |
| 8    | 60    | 4.4  | 78.3%   | 13.3%   | 83.3%      | 17.1%       | 21.7%    | 5.0%            | 16        |
| 9    | 60    | 4.7  | 80.0%   | 3.3%    | 83.3%      | 15.7%       | 20.0%    | 3.3%            | 10        |
| 10   | 60    | 5.2  | 83.3%   | 0.0%    | 93.3%      | 15.5%       | 23.3%    | 16.7%           | 9         |
| 11   | 60    | 5.8  | 85.0%   | 3.3%    | 83.3%      | 17.7%       | 16.7%    | 0.0%            | 12        |
| 12   | 60    | 6.3  | 63.3%   | 6.7%    | 75.0%      | 28.1%       | 33.3%    | 8.3%            | 13        |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 83    | 100.0%  | 100.0%  | 100.0%     | 1.7%        | 0.0%     | 0.0%            | 15.0%                      |
| 2    | 107   | 72.9%   | 1.9%    | 76.6%      | 27.5%       | 29.9%    | 6.5%            | 36.3%                      |
| 3    | 107   | 71.0%   | 0.0%    | 78.5%      | 21.5%       | 31.8%    | 10.3%           | 38.9%                      |
| 4    | 101   | 71.3%   | 0.0%    | 80.2%      | 20.3%       | 30.7%    | 10.9%           | 39.3%                      |
| 5    | 95    | 80.0%   | 0.0%    | 85.3%      | 16.8%       | 26.3%    | 11.6%           | 39.5%                      |
| 6    | 55    | 61.8%   | 1.8%    | 72.7%      | 30.2%       | 38.2%    | 10.9%           | 42.1%                      |
| 7    | 24    | 50.0%   | 0.0%    | 58.3%      | 46.5%       | 45.8%    | 4.2%            | 43.4%                      |
| 8    | 3     | 66.7%   | 0.0%    | 66.7%      | 40.4%       | 33.3%    | 0.0%            | 40.7%                      |

Week 1 (rank 1): finale 100.0% (Phase 1 100.0%, Phase 2 100.0%). All normal weeks: Phase 1 75.3%, Phase 2 15.0%, finale 81.2%, knocked out 20.8%, won in overtime 8.2%. Mean rank after the last week: 6.57.

### committed (9 players)

Per week (all servers; rank is the mean rank at the start of the week):

| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |
| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |
| 1    | 60    | 1.0  | 100.0%  | 100.0%  | 100.0%     | 0.5%        | 0.0%     | 0.0%            | 10        |
| 2    | 60    | 1.8  | 83.3%   | 30.0%   | 98.3%      | 6.9%        | 5.0%     | 3.3%            | 8         |
| 3    | 60    | 2.5  | 80.0%   | 43.3%   | 85.0%      | 14.5%       | 20.0%    | 5.0%            | 17        |
| 4    | 60    | 2.8  | 95.0%   | 31.7%   | 98.3%      | 3.7%        | 5.0%     | 3.3%            | 14        |
| 5    | 60    | 3.4  | 88.3%   | 18.3%   | 95.0%      | 7.4%        | 13.3%    | 8.3%            | 11        |
| 6    | 60    | 3.9  | 95.0%   | 5.0%    | 96.7%      | 6.5%        | 10.0%    | 6.7%            | 10        |
| 7    | 60    | 4.6  | 86.7%   | 8.3%    | 93.3%      | 7.4%        | 10.0%    | 3.3%            | 8         |
| 8    | 60    | 5.2  | 88.3%   | 6.7%    | 93.3%      | 8.0%        | 8.3%     | 1.7%            | 17        |
| 9    | 60    | 5.6  | 93.3%   | 0.0%    | 98.3%      | 5.0%        | 6.7%     | 5.0%            | 14        |
| 10   | 60    | 6.1  | 86.7%   | 3.3%    | 91.7%      | 12.5%       | 13.3%    | 5.0%            | 11        |
| 11   | 60    | 6.7  | 91.7%   | 1.7%    | 98.3%      | 4.5%        | 5.0%     | 3.3%            | 10        |
| 12   | 60    | 7.3  | 86.7%   | 3.3%    | 93.3%      | 11.8%       | 11.7%    | 5.0%            | 8         |

Per Boss Rank (normal weeks):

| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |
| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |
| 1    | 68    | 100.0%  | 100.0%  | 100.0%     | 1.1%        | 0.0%     | 0.0%            | 15.0%                      |
| 2    | 83    | 87.9%   | 9.6%    | 98.8%      | 5.9%        | 3.6%     | 2.4%            | 30.1%                      |
| 3    | 89    | 77.5%   | 0.0%    | 88.8%      | 13.6%       | 22.5%    | 11.2%           | 36.1%                      |
| 4    | 88    | 87.5%   | 3.4%    | 92.0%      | 8.6%        | 15.9%    | 8.0%            | 35.3%                      |
| 5    | 89    | 86.5%   | 0.0%    | 94.4%      | 5.8%        | 11.2%    | 5.6%            | 35.7%                      |
| 6    | 83    | 91.6%   | 2.4%    | 95.2%      | 6.5%        | 8.4%     | 3.6%            | 33.6%                      |
| 7    | 57    | 87.7%   | 1.8%    | 91.2%      | 11.3%       | 10.5%    | 1.8%            | 32.3%                      |
| 8    | 25    | 72.0%   | 0.0%    | 88.0%      | 23.0%       | 20.0%    | 8.0%            | 36.6%                      |

Week 1 (rank 1): finale 100.0% (Phase 1 100.0%, Phase 2 100.0%). All normal weeks: Phase 1 87.3%, Phase 2 14.1%, finale 94.0%, knocked out 8.3%, won in overtime 5.1%. Mean rank after the last week: 7.98.

## Supplies (journey servers)

- **shipped**: 1 seeds x 30 servers x 12 weeks, seed "leet"

### Min-maxer

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 38.5   | 42.6   | 48.9   | 41.4    |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                 | week 4                 | week 8                  | week 12                 |
| ------- | ---------------------- | ---------------------- | ----------------------- | ----------------------- |
| shipped | 7.7 / 4.8 / 29.9 / 0.0 | 9.4 / 7.0 / 26.3 / 0.0 | 12.6 / 7.0 / 28.3 / 1.1 | 13.9 / 6.9 / 18.5 / 2.5 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1           | week 4           | week 8           | week 12           |
| ------- | ---------------- | ---------------- | ---------------- | ----------------- |
| shipped | 29.9 / 1.4 / 0.0 | 26.3 / 2.9 / 0.0 | 28.3 / 9.4 / 0.1 | 18.5 / 10.1 / 0.6 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 3.8    | 3.4    | 3.2    | 3.5     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 15     | 39     | 18     | 20      |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 288    | 600    | 895    | 1031    |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 13.6   | 84.0   | 150.8  | 180.2   |

**Bait / Essence / glimmer / shards held**

| Variant | week 1          | week 4         | week 8          | week 12           |
| ------- | --------------- | -------------- | --------------- | ----------------- |
| shipped | 12 / 81 / 1 / 2 | 7 / 73 / 4 / 6 | 7 / 85 / 11 / 7 | 44 / 75 / 23 / 12 |

Share of days scrap blocked the gear path: shipped 10%

### Engaged

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 10.3   | 22.5   | 25.5   | 24.2    |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12               |
| ------- | --------------------- | --------------------- | --------------------- | --------------------- |
| shipped | 4.4 / 3.7 / 3.8 / 0.0 | 6.7 / 6.9 / 9.0 / 0.0 | 9.1 / 6.8 / 9.4 / 0.0 | 9.4 / 6.9 / 7.3 / 0.3 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 3.8 / 0.0 / 0.0 | 9.0 / 1.3 / 0.0 | 9.4 / 2.4 / 0.1 | 7.3 / 3.8 / 0.5 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 1.6    | 2.0    | 1.3    | 1.4     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 49     | 202    | 532    | 1043    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 226    | 463    | 611    | 813     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 6.1    | 38.7   | 73.8   | 116.1   |

**Bait / Essence / glimmer / shards held**

| Variant | week 1           | week 4            | week 8           | week 12            |
| ------- | ---------------- | ----------------- | ---------------- | ------------------ |
| shipped | 102 / 90 / 0 / 2 | 100 / 221 / 2 / 6 | 41 / 387 / 6 / 7 | 12 / 507 / 13 / 13 |

Share of days scrap blocked the gear path: shipped 1%

### Regular

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.7    | 7.0    | 7.0    | 7.4     |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12               |
| ------- | --------------------- | --------------------- | --------------------- | --------------------- |
| shipped | 0.8 / 0.3 / 0.1 / 0.0 | 2.7 / 4.4 / 0.4 / 0.0 | 2.1 / 4.5 / 0.5 / 0.0 | 2.7 / 4.3 / 0.4 / 0.0 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.1 / 0.0 / 0.0 | 0.4 / 0.0 / 0.0 | 0.5 / 0.0 / 0.0 | 0.4 / 0.0 / 0.0 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.5    | 3.1    | 3.4    | 3.3     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 21     | 98     | 217    | 343     |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 128    | 288    | 427    | 492     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 2.4    | 17.6   | 40.1   | 54.6    |

**Bait / Essence / glimmer / shards held**

| Variant | week 1           | week 4            | week 8             | week 12             |
| ------- | ---------------- | ----------------- | ------------------ | ------------------- |
| shipped | 163 / 63 / 0 / 1 | 678 / 196 / 1 / 4 | 1352 / 412 / 2 / 7 | 2024 / 680 / 3 / 10 |

Share of days scrap blocked the gear path: shipped 0%

### Drop-in

**Supplies used per week**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.0    | 0.4    | 1.0    | 1.4     |

**Supplies obtained per week: found / dungeon / crafted / gift**

| Variant | week 1                | week 4                | week 8                | week 12               |
| ------- | --------------------- | --------------------- | --------------------- | --------------------- |
| shipped | 0.1 / 0.0 / 0.0 / 0.0 | 0.3 / 0.5 / 0.0 / 0.0 | 0.4 / 1.1 / 0.0 / 0.0 | 0.4 / 1.5 / 0.0 / 0.0 |

**Supplies crafted per week: all / good tier / great tier**

| Variant | week 1          | week 4          | week 8          | week 12         |
| ------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |

**Supplies in stock**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 0.1    | 0.8    | 2.8    | 4.7     |

**Scrap held**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 14     | 26     | 49     | 75      |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 64     | 152    | 216    | 269     |

**Upgrade levels on worn gear**

| Variant | week 1 | week 4 | week 8 | week 12 |
| ------- | ------ | ------ | ------ | ------- |
| shipped | 1.2    | 3.7    | 10.3   | 22.3    |

**Bait / Essence / glimmer / shards held**

| Variant | week 1          | week 4            | week 8            | week 12           |
| ------- | --------------- | ----------------- | ----------------- | ----------------- |
| shipped | 46 / 42 / 0 / 0 | 181 / 113 / 0 / 1 | 367 / 225 / 0 / 2 | 563 / 330 / 1 / 3 |

Share of days scrap blocked the gear path: shipped 0%

## Creatures: catches, duplicates and talents (journey servers)

- **shipped**: 1 seeds x 12 servers x 30 weeks, seed "leet:creatures"

### Min-maxer

Weeks to complete the base catalogue (median; share who did): shipped 5.5 (100%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                         |
| ------- | -------- | -------- | -------- | -------- | ------- | --------------------------------------- |
| shipped | 1 / 1    | 2 / 3    | 2 / 4    | 7 / 11   | 2       | 19.5 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1            | week 4             | week 8             | week 12            | week 20            | week 30            |
| ------- | ----------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| shipped | 41.3 / 10.1 / 5.3 | 54.5 / 13.2 / 11.4 | 74.4 / 16.6 / 16.3 | 66.7 / 14.6 / 14.6 | 64.4 / 14.1 / 14.1 | 85.1 / 19.5 / 19.5 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8           | week 12          | week 20          | week 30          |
| ------- | --------------- | --------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| shipped | 2.0 / 3.3 / 0.0 | 2.4 / 5.3 / 3.8 | 1.7 / 3.9 / 10.8 | 1.8 / 1.9 / 10.8 | 0.8 / 0.6 / 12.8 | 1.1 / 0.3 / 18.1 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 5.7    | 1.1    | 0.0    | 0.0     | 0.0     | 0.0     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.8 | 0.5 / 1.4 | 0.0 / 2.8 | 0.0 / 2.2 | 0.0 / 1.9 | 0.0 / 3.2 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 5.7    | 10.6   | 12.0   | 12.0    | 12.0    | 12.0    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1     | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | ---------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 14.0 / 8.5 | 22.0 / 20.0 | 30.0 / 24.0 | 30.0 / 30.0 | 30.0 / 30.0 | 30.0 / 30.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1                   | week 4                   | week 8                    | week 12                   | week 20                    | week 30                    |
| ------- | ------------------------ | ------------------------ | ------------------------- | ------------------------- | -------------------------- | -------------------------- |
| shipped | 5725 / 5411 / 3513 / 611 | 6040 / 5179 / 3475 / 876 | 8204 / 5454 / 3251 / 1319 | 9437 / 2412 / 2858 / 1195 | 10159 / 2025 / 3359 / 1353 | 12023 / 1554 / 3470 / 1767 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1            | week 4            | week 8            | week 12          | week 20          | week 30          |
| ------- | ----------------- | ----------------- | ----------------- | ---------------- | ---------------- | ---------------- |
| shipped | 42.8 / 37.2 / 1.3 | 13.6 / 23.5 / 1.7 | 16.4 / 24.2 / 0.8 | 6.8 / 19.3 / 1.0 | 8.3 / 20.9 / 0.3 | 9.2 / 20.4 / 0.3 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1              | week 4              | week 8              | week 12             | week 20             | week 30             |
| ------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| shipped | 330 / 250 / 68 / 20 | 333 / 264 / 52 / 32 | 336 / 314 / 55 / 18 | 329 / 286 / 55 / 28 | 325 / 306 / 59 / 11 | 325 / 312 / 63 / 17 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 5.5 / 5.7 | 2.8 / 3.0 | 3.3 / 3.1 | 2.6 / 2.3 | 2.6 / 2.3 | 3.6 / 3.4 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.6 / 2.0 | 1.1 / 3.2 | 0.7 / 1.8 | 0.8 / 2.8 | 0.7 / 1.1 | 1.3 / 1.7 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.6%   | 5.8%   | 5.6%   | 6.7%    | 7.8%    | 9.7%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 265    | 619    | 905    | 1018    | 1124    | 1190    |

### Engaged

Weeks to complete the base catalogue (median; share who did): shipped 8 (100%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                         |
| ------- | -------- | -------- | -------- | -------- | ------- | --------------------------------------- |
| shipped | 1 / 1    | 2 / 4    | 3 / 5    | 11 / 16  | 2       | 32.5 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1           | week 4           | week 8            | week 12            | week 20            | week 30            |
| ------- | ---------------- | ---------------- | ----------------- | ------------------ | ------------------ | ------------------ |
| shipped | 18.3 / 4.2 / 1.6 | 27.3 / 6.0 / 4.6 | 50.2 / 10.8 / 9.8 | 45.7 / 10.1 / 10.1 | 48.4 / 10.8 / 10.8 | 54.9 / 11.4 / 11.4 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30          |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | ---------------- |
| shipped | 0.8 / 0.8 / 0.0 | 1.3 / 2.9 / 0.5 | 1.6 / 3.8 / 4.3 | 1.2 / 2.8 / 6.1 | 1.7 / 1.1 / 8.0 | 0.7 / 0.7 / 10.0 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 3.6    | 0.9    | 0.7    | 0.0     | 0.0     | 0.0     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.5 | 0.0 / 0.8 | 0.5 / 1.6 | 0.0 / 1.6 | 0.0 / 1.4 | 0.0 / 1.7 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 3.6    | 8.2    | 11.4   | 12.0    | 12.0    | 12.0    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1      | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 11.0 / 10.0 | 20.0 / 19.0 | 26.0 / 20.0 | 30.0 / 24.0 | 30.0 / 30.0 | 30.0 / 30.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1                  | week 4                   | week 8                   | week 12                  | week 20                  | week 30                  |
| ------- | ----------------------- | ------------------------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| shipped | 2980 / 3896 / 3143 / 63 | 3809 / 4896 / 3475 / 221 | 7904 / 3632 / 3251 / 215 | 6563 / 3615 / 2858 / 284 | 8030 / 2055 / 3359 / 382 | 9238 / 1683 / 3470 / 334 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1            | week 4            | week 8            | week 12           | week 20          | week 30          |
| ------- | ----------------- | ----------------- | ----------------- | ----------------- | ---------------- | ---------------- |
| shipped | 29.3 / 26.3 / 0.8 | 19.1 / 24.4 / 1.0 | 12.9 / 22.4 / 1.3 | 10.6 / 21.3 / 0.9 | 5.2 / 17.6 / 0.3 | 8.6 / 19.6 / 0.5 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1             | week 4              | week 8              | week 12             | week 20             | week 30             |
| ------- | ------------------ | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| shipped | 298 / 167 / 37 / 8 | 305 / 228 / 58 / 14 | 301 / 272 / 43 / 18 | 306 / 281 / 36 / 18 | 296 / 264 / 52 / 20 | 300 / 273 / 45 / 10 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 2.5 / 2.9 | 4.1 / 3.8 | 2.8 / 2.7 | 1.9 / 1.8 | 1.4 / 1.5 | 1.3 / 1.3 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.3 / 0.8 | 0.3 / 1.4 | 0.6 / 1.8 | 0.5 / 1.8 | 0.6 / 2.0 | 0.3 / 1.0 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.2%   | 2.6%   | 5.0%   | 6.7%    | 7.2%    | 8.3%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 209    | 472    | 615    | 818     | 1000    | 1070    |

### Regular

Weeks to complete the base catalogue (median; share who did): shipped 24 (92%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                       |
| ------- | -------- | -------- | -------- | -------- | ------- | ------------------------------------- |
| shipped | 2 / 2    | 4 / 9    | 7 / 13   | 24 / -   | 4       | 73 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1          | week 4          | week 8           | week 12         | week 20          | week 30          |
| ------- | --------------- | --------------- | ---------------- | --------------- | ---------------- | ---------------- |
| shipped | 3.3 / 1.4 / 0.0 | 8.1 / 2.0 / 1.0 | 10.1 / 2.3 / 1.5 | 8.7 / 1.9 / 1.7 | 10.4 / 2.6 / 2.3 | 15.3 / 3.3 / 3.2 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.3 / 0.7 / 0.0 | 0.4 / 1.0 / 0.1 | 0.6 / 0.9 / 0.2 | 0.6 / 1.2 / 0.4 | 0.4 / 1.0 / 1.8 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.3    | 0.6    | 0.6    | 0.2     | 0.3     | 0.1     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.4 | 0.0 / 0.4 | 0.1 / 0.3 | 0.1 / 0.3 | 0.0 / 0.4 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 2.3    | 4.4    | 6.7    | 7.7     | 10.3    | 11.9    |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1    | week 4      | week 8      | week 12     | week 20     | week 30     |
| ------- | --------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 9.0 / 6.0 | 16.0 / 10.0 | 20.0 / 13.5 | 20.0 / 19.0 | 26.5 / 20.0 | 30.0 / 26.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1               | week 4                 | week 8                 | week 12               | week 20                | week 30                |
| ------- | -------------------- | ---------------------- | ---------------------- | --------------------- | ---------------------- | ---------------------- |
| shipped | 292 / 514 / 1804 / 7 | 547 / 2401 / 3128 / 12 | 600 / 1674 / 2753 / 17 | 629 / 1487 / 2364 / 7 | 780 / 1488 / 3072 / 15 | 1251 / 1350 / 2616 / 7 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1           | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | ---------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 14.9 / 0.0 / 0.0 | 6.3 / 0.0 / 0.4 | 7.8 / 0.0 / 0.4 | 4.6 / 0.0 / 0.1 | 5.1 / 0.0 / 0.5 | 4.2 / 0.0 / 0.5 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 168 / 0 / 3 / 0 | 173 / 0 / 3 / 3 | 172 / 0 / 3 / 6 | 167 / 0 / 3 / 6 | 171 / 0 / 6 / 6 | 171 / 0 / 4 / 4 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.2 / 0.2 | 0.2 / 0.2 | 0.2 / 0.3 | 0.3 / 0.2 | 0.3 / 0.4 | 0.2 / 0.1 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.1 / 0.0 | 0.2 / 0.3 | 0.1 / 0.6 | 0.1 / 0.6 | 0.2 / 0.6 | 0.1 / 0.4 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.3%   | 2.3%   | 3.4%   | 4.1%    | 5.6%    | 6.1%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 141    | 296    | 424    | 487     | 601     | 739     |

### Drop-in

Weeks to complete the base catalogue (median; share who did): shipped never (0%)

**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**

| Variant | level 10 | level 15 | level 20 | level 30 | evolved | longest stretch                       |
| ------- | -------- | -------- | -------- | -------- | ------- | ------------------------------------- |
| shipped | 3 / 6    | 14 / -   | 20.5 / - | - / -    | 14      | 73 days (ladder gap at most 6 levels) |

**Catch rolls / creatures / duplicates per week**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.3 / 0.3 / 0.0 | 0.8 / 0.5 / 0.0 | 1.3 / 0.2 / 0.1 | 1.9 / 0.3 / 0.1 | 2.1 / 0.7 / 0.4 | 2.6 / 0.4 / 0.2 |

**Duplicates answered per week: taught / fused / released**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.1 / 0.0 | 0.1 / 0.3 / 0.0 | 0.1 / 0.1 / 0.0 |

**New species per week**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.3    | 0.2    | 0.1    | 0.2     | 0.3     | 0.1     |

**Catch rolls the pity forced per week: a species the player lacked / any creature**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.2 | 0.0 / 0.0 |

**Base species owned**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 1.3    | 2.1    | 2.5    | 3.1     | 4.2     | 5.6     |

**Best creature level / raid team lowest level (median, end of the week)**

| Variant | week 1    | week 4     | week 8      | week 12     | week 20     | week 30     |
| ------- | --------- | ---------- | ----------- | ----------- | ----------- | ----------- |
| shipped | 8.0 / 4.5 | 10.0 / 7.5 | 10.0 / 10.0 | 12.0 / 10.0 | 18.0 / 10.0 | 20.0 / 10.0 |

**Experience per week: trips / dungeon / raids / jobs**

| Variant | week 1           | week 4              | week 8               | week 12              | week 20              | week 30              |
| ------- | ---------------- | ------------------- | -------------------- | -------------------- | -------------------- | -------------------- |
| shipped | 30 / 0 / 804 / 0 | 65 / 369 / 1450 / 0 | 103 / 610 / 1457 / 0 | 125 / 784 / 1854 / 0 | 132 / 431 / 1655 / 0 | 162 / 349 / 2067 / 0 |

**Levels gained / treats packed / ribbons bought per week**

| Variant | week 1          | week 4          | week 8          | week 12         | week 20         | week 30         |
| ------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| shipped | 5.0 / 0.0 / 0.0 | 5.9 / 0.0 / 0.0 | 2.0 / 0.0 / 0.2 | 2.2 / 0.0 / 0.1 | 2.8 / 0.0 / 0.3 | 2.2 / 0.0 / 0.1 |

**Bait per week: earned / treats / lures / talent slots**

| Variant | week 1         | week 4         | week 8         | week 12        | week 20        | week 30        |
| ------- | -------------- | -------------- | -------------- | -------------- | -------------- | -------------- |
| shipped | 48 / 0 / 0 / 0 | 49 / 0 / 0 / 0 | 50 / 0 / 0 / 0 | 53 / 0 / 0 / 0 | 45 / 0 / 0 / 1 | 51 / 0 / 0 / 1 |

**Lures carried / crafted per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |

**Golden talents / talents slotted from the book per week**

| Variant | week 1    | week 4    | week 8    | week 12   | week 20   | week 30   |
| ------- | --------- | --------- | --------- | --------- | --------- | --------- |
| shipped | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.1 | 0.0 / 0.1 |

**Talents' share of fight power (weeks that were scored)**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 0.9%   | 1.8%   | 2.9%   | 3.0%    | 3.6%    | 4.7%    |

**Team power**

| Variant | week 1 | week 4 | week 8 | week 12 | week 20 | week 30 |
| ------- | ------ | ------ | ------ | ------- | ------- | ------- |
| shipped | 70     | 174    | 225    | 286     | 371     | 460     |

## Gear share of fight-scored power (journey servers)

20 servers of the default journey mix, 30 weeks, seed "leet:gear". Each cell is the median share of the team's fight-scored power that its worn gear gives, with the design's range under it.

| Profile   | Players | Week 2               | Week 8                 | Week 20                | Week 30                |
| --------- | ------- | -------------------- | ---------------------- | ---------------------- | ---------------------- |
| Min-maxer | 20      | 6.1% (5.0% to 10.0%) | 24.3% (15.0% to 22.0%) | 31.6% (25.0% to 32.0%) | 31.4% (33.0% to 40.0%) |
| Engaged   | 60      | 5.4% (5.0% to 10.0%) | 14.2% (15.0% to 22.0%) | 24.2% (25.0% to 32.0%) | 27.6% (33.0% to 40.0%) |
| Regular   | 60      | 2.6% (3.0% to 6.0%)  | 9.0% (10.0% to 15.0%)  | 16.4% (18.0% to 24.0%) | 22.8% (28.0% to 34.0%) |
| Drop-in   | 40      | 5.0% (0.0% to 3.0%)  | 4.4% (5.0% to 8.0%)    | 11.2% (10.0% to 15.0%) | 19.2% (15.0% to 20.0%) |

## Bosses

### Tidal Colossus (tide)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 30% / 85% / 100%           | 1.72                | 100.0%           |
| 5       | 200  | 4.4           | 82.0%         | 3.0%          | 83.5%      | 29% / 65% / 97%            | 2.52                | 32.2%            |
| 10      | 200  | 9.1           | 72.5%         | 0.0%          | 75.5%      | 29% / 60% / 96%            | 4.62                | 17.7%            |
| 15      | 200  | 13.6          | 69.5%         | 0.5%          | 77.0%      | 29% / 60% / 98%            | 6.96                | 13.3%            |

Typical group (5-10 signed up, 299 runs): Phase 1 75.9%, Phase 2 1.7%, finale 78.6%.

### Cinder Wyrm (ember)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 99.0%         | 100.0%     | 30% / 85% / 100%           | 0.84                | 100.0%           |
| 5       | 200  | 4.4           | 77.5%         | 0.5%          | 75.5%      | 29% / 62% / 98%            | 1.15                | 30.8%            |
| 10      | 200  | 9.1           | 65.0%         | 0.0%          | 69.5%      | 28% / 59% / 96%            | 2.59                | 16.4%            |
| 15      | 200  | 13.6          | 58.0%         | 0.0%          | 72.0%      | 29% / 59% / 97%            | 4.51                | 12.4%            |

Typical group (5-10 signed up, 296 runs): Phase 1 67.6%, Phase 2 0.0%, finale 70.3%.

### Thornmother (grove)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 84.5%         | 100.0%     | 30% / 84% / 100%           | 1.26                | 100.0%           |
| 5       | 200  | 4.4           | 79.0%         | 0.5%          | 77.5%      | 29% / 63% / 98%            | 2.17                | 32.6%            |
| 10      | 200  | 9.1           | 62.5%         | 0.0%          | 70.5%      | 29% / 60% / 97%            | 4.51                | 17.4%            |
| 15      | 200  | 13.5          | 58.5%         | 0.0%          | 70.5%      | 28% / 59% / 97%            | 6.63                | 12.9%            |

Typical group (5-10 signed up, 294 runs): Phase 1 65.6%, Phase 2 0.0%, finale 70.7%.

### Storm Sovereign (spark)

| Players | Runs | Avg signed up | Phase 1 clear | Phase 2 clear | Finale win | Pool lost P1 / P2 / finale | Reactions per round | Median top share |
| ------- | ---- | ------------- | ------------- | ------------- | ---------- | -------------------------- | ------------------- | ---------------- |
| 1       | 200  | 1.0           | 100.0%        | 100.0%        | 100.0%     | 30% / 85% / 100%           | 1.65                | 100.0%           |
| 5       | 200  | 4.3           | 88.0%         | 10.5%         | 88.0%      | 30% / 69% / 99%            | 2.51                | 32.3%            |
| 10      | 200  | 9.0           | 69.5%         | 0.5%          | 75.5%      | 29% / 61% / 97%            | 4.52                | 18.3%            |
| 15      | 200  | 13.4          | 67.5%         | 0.0%          | 76.0%      | 29% / 59% / 97%            | 6.91                | 13.4%            |

Typical group (5-10 signed up, 291 runs): Phase 1 73.9%, Phase 2 3.4%, finale 78.0%.

## Fairness and contribution

| Archetype  | Average share of contribution (groups of 5+) | Average Essence per raid week |
| ---------- | -------------------------------------------- | ----------------------------- |
| Casual     | 7.0%                                         | 47.2                          |
| Daily      | 11.5%                                        | 70.9                          |
| Top earner | 11.2%                                        | 59.8                          |
| Newcomer   | 6.8%                                         | 48.4                          |

## Archetype progression

Averages over the 24 default-server sims (10 players each).

### Casual

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 72      | 100         | 1             | 0               | 2.1           | 114         | 7.2       | 0.0     | 48.3           | 48.3         | 0.04             | 0.7  |
| 2    | 72      | 100         | 16            | 0               | 2.4           | 157         | 9.2       | 0.0     | 22.7           | 71.6         | 0.06             | 0.9  |
| 3    | 72      | 99          | 18            | 0               | 3.2           | 201         | 10.3      | 0.0     | 44.1           | 117.0        | 0.13             | 1.4  |
| 4    | 72      | 103         | 22            | 0               | 3.9           | 229         | 11.2      | 0.0     | 39.0           | 157.5        | 0.17             | 1.8  |
| 5    | 72      | 103         | 24            | 0               | 4.7           | 254         | 12.5      | 0.1     | 48.3           | 206.5        | 0.25             | 2.1  |
| 6    | 72      | 103         | 24            | 0               | 5.2           | 282         | 14.0      | 0.4     | 37.4           | 240.7        | 0.26             | 2.7  |
| 7    | 72      | 103         | 23            | 0               | 5.9           | 317         | 15.5      | 0.7     | 44.4           | 280.9        | 0.35             | 2.9  |
| 8    | 72      | 103         | 23            | 0               | 6.5           | 352         | 16.9      | 1.0     | 55.6           | 330.1        | 0.43             | 3.2  |
| 9    | 72      | 103         | 21            | 0               | 6.9           | 381         | 18.0      | 1.2     | 50.3           | 376.9        | 0.49             | 3.5  |
| 10   | 72      | 104         | 20            | 0               | 7.2           | 406         | 18.9      | 1.4     | 72.2           | 444.6        | 0.65             | 3.4  |
| 11   | 72      | 104         | 21            | 0               | 7.5           | 427         | 19.5      | 1.6     | 51.3           | 492.2        | 0.71             | 3.8  |
| 12   | 72      | 104         | 21            | 0               | 7.9           | 445         | 19.9      | 1.7     | 60.8           | 551.8        | 0.83             | 3.7  |

### Daily

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 96      | 318         | 64            | 0               | 4.1           | 218         | 10.9      | 0.0     | 87.6           | 90.8         | 0.06             | 0.9  |
| 2    | 96      | 318         | 76            | 0               | 6.6           | 312         | 14.9      | 0.9     | 46.1           | 85.9         | 0.09             | 1.4  |
| 3    | 96      | 318         | 74            | 0               | 8.1           | 413         | 18.0      | 1.7     | 66.6           | 81.7         | 0.13             | 2.2  |
| 4    | 96      | 328         | 76            | 0               | 9.3           | 492         | 19.9      | 2.2     | 61.0           | 77.4         | 0.19             | 2.6  |
| 5    | 96      | 328         | 77            | 0               | 10.1          | 560         | 21.1      | 2.5     | 77.4           | 86.6         | 0.26             | 3.2  |
| 6    | 96      | 328         | 73            | 0               | 10.8          | 609         | 22.6      | 2.8     | 92.8           | 96.1         | 0.44             | 3.4  |
| 7    | 96      | 328         | 72            | 0               | 11.5          | 660         | 24.1      | 3.2     | 72.4           | 90.0         | 0.53             | 3.8  |
| 8    | 96      | 329         | 74            | 0               | 11.9          | 708         | 25.8      | 3.5     | 97.9           | 121.0        | 0.77             | 3.3  |
| 9    | 96      | 328         | 74            | 0               | 12.0          | 763         | 27.3      | 3.9     | 89.8           | 116.8        | 0.93             | 3.2  |
| 10   | 96      | 329         | 76            | 0               | 12.0          | 810         | 28.7      | 4.3     | 92.0           | 121.7        | 1.08             | 2.9  |
| 11   | 96      | 328         | 75            | 0               | 12.0          | 857         | 29.7      | 4.6     | 87.7           | 117.5        | 1.22             | 3.1  |
| 12   | 96      | 328         | 74            | 0               | 12.0          | 894         | 29.9      | 4.9     | 93.8           | 127.1        | 1.36             | 3.1  |

### Top earner

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 1    | 48      | 340         | 63            | 0               | 3.8           | 221         | 11.2      | 0.0     | 83.8           | 87.2         | 0.02             | 1.0  |
| 2    | 48      | 340         | 80            | 0               | 6.1           | 326         | 15.4      | 1.1     | 51.3           | 87.2         | 0.08             | 1.4  |
| 3    | 48      | 340         | 80            | 0               | 7.8           | 422         | 18.5      | 1.8     | 71.3           | 89.3         | 0.17             | 2.0  |
| 4    | 48      | 352         | 82            | 0               | 8.9           | 492         | 20.1      | 2.1     | 56.3           | 75.8         | 0.19             | 2.7  |
| 5    | 48      | 352         | 83            | 0               | 9.9           | 541         | 21.1      | 2.3     | 75.3           | 83.1         | 0.25             | 3.3  |
| 6    | 48      | 352         | 81            | 0               | 10.9          | 589         | 22.5      | 2.6     | 87.7           | 94.1         | 0.42             | 3.5  |
| 7    | 48      | 352         | 81            | 0               | 11.5          | 646         | 24.0      | 3.1     | 72.4           | 81.9         | 0.52             | 3.7  |
| 8    | 48      | 352         | 81            | 0               | 11.9          | 707         | 25.6      | 3.4     | 106.5          | 128.3        | 0.81             | 2.9  |
| 9    | 48      | 352         | 81            | 0               | 12.0          | 757         | 27.2      | 3.8     | 106.3          | 138.0        | 1.08             | 2.2  |
| 10   | 48      | 352         | 81            | 0               | 12.0          | 809         | 28.4      | 4.3     | 100.1          | 136.7        | 1.27             | 2.3  |
| 11   | 48      | 352         | 80            | 0               | 12.0          | 848         | 29.5      | 4.5     | 84.8           | 123.8        | 1.40             | 2.6  |
| 12   | 48      | 352         | 78            | 0               | 12.0          | 882         | 29.9      | 4.8     | 80.5           | 120.6        | 1.46             | 3.2  |

### Newcomer

| Week | Players | Bait earned | Bait on lures | Spent on treats | Species owned | Top-3 power | Top level | Evolved | Essence earned | Essence held | Jackpots (total) | Pity |
| ---- | ------- | ----------- | ------------- | --------------- | ------------- | ----------- | --------- | ------- | -------------- | ------------ | ---------------- | ---- |
| 4    | 24      | 328         | 60            | 0               | 3.8           | 204         | 10.7      | 0.0     | 54.9           | 58.2         | 0.08             | 0.6  |
| 5    | 24      | 329         | 79            | 0               | 6.0           | 301         | 14.5      | 0.6     | 62.1           | 87.0         | 0.13             | 1.4  |
| 6    | 24      | 328         | 80            | 0               | 7.7           | 407         | 17.5      | 1.6     | 61.7           | 80.6         | 0.13             | 2.4  |
| 7    | 24      | 328         | 77            | 0               | 9.0           | 483         | 19.6      | 1.9     | 55.3           | 72.8         | 0.13             | 3.3  |
| 8    | 24      | 329         | 76            | 0               | 9.9           | 546         | 20.8      | 2.5     | 60.9           | 76.6         | 0.13             | 4.2  |
| 9    | 24      | 328         | 72            | 0               | 10.8          | 597         | 22.3      | 2.7     | 94.0           | 96.2         | 0.33             | 3.9  |
| 10   | 24      | 329         | 75            | 0               | 11.4          | 640         | 23.7      | 3.1     | 98.3           | 106.4        | 0.54             | 3.5  |
| 11   | 24      | 329         | 73            | 0               | 11.8          | 691         | 25.3      | 3.4     | 68.8           | 89.9         | 0.58             | 4.2  |
| 12   | 24      | 329         | 75            | 0               | 12.0          | 752         | 26.6      | 3.9     | 89.1           | 118.1        | 0.71             | 4.1  |

## Gear and crafting

Gear power is the power the worn items add to the top 3 creatures (`applyGear`, floored like the fight slots), and the share is that power over the top-3 power (gear included). The "today" columns are the same sims and seeds played without gear.

### Casual

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 2.8        | 2.7%       | 1.0                | 0.0            | 1.0                   | 48           | 9.7        |
| 2    | 5.4        | 3.5%       | 3.6                | 1.0            | 1.0                   | 72           | 17.7       |
| 3    | 6.9        | 3.5%       | 5.0                | 1.0            | 1.0                   | 117          | 36.1       |
| 4    | 9.1        | 4.0%       | 6.5                | 1.0            | 1.0                   | 157          | 54.3       |
| 5    | 11.5       | 4.5%       | 9.1                | 1.1            | 1.2                   | 207          | 71.8       |
| 6    | 15.2       | 5.4%       | 13.8               | 1.3            | 1.7                   | 241          | 87.8       |
| 7    | 22.9       | 7.2%       | 21.0               | 1.5            | 1.9                   | 281          | 104.1      |
| 8    | 28.6       | 8.1%       | 26.5               | 1.7            | 2.0                   | 330          | 121.1      |
| 9    | 33.8       | 8.9%       | 31.7               | 1.9            | 2.2                   | 377          | 136.6      |
| 10   | 38.9       | 9.6%       | 37.1               | 2.2            | 2.4                   | 445          | 153.6      |
| 11   | 44.2       | 10.3%      | 42.7               | 2.5            | 2.6                   | 492          | 169.7      |
| 12   | 48.4       | 10.7%      | 45.4               | 2.6            | 2.8                   | 552          | 186.3      |

### Daily

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 7.7        | 3.5%       | 6.0                | 2.2            | 1.7                   | 91           | 33.5       |
| 2    | 21.5       | 6.8%       | 21.0               | 9.6            | 3.6                   | 86           | 36.8       |
| 3    | 43.1       | 10.1%      | 37.7               | 18.2           | 4.9                   | 82           | 44.0       |
| 4    | 69.1       | 13.6%      | 52.6               | 26.4           | 5.7                   | 77           | 61.3       |
| 5    | 99.7       | 17.3%      | 66.6               | 35.5           | 6.3                   | 87           | 80.3       |
| 6    | 120.9      | 19.5%      | 75.7               | 44.7           | 6.7                   | 96           | 95.5       |
| 7    | 142.1      | 21.3%      | 85.0               | 54.1           | 7.2                   | 90           | 116.0      |
| 8    | 158.0      | 22.1%      | 91.2               | 62.7           | 7.5                   | 121          | 162.3      |
| 9    | 177.1      | 23.0%      | 97.5               | 69.8           | 7.9                   | 117          | 240.1      |
| 10   | 193.0      | 23.7%      | 102.6              | 76.0           | 8.2                   | 122          | 337.9      |
| 11   | 209.9      | 24.4%      | 109.2              | 81.5           | 8.6                   | 117          | 449.2      |
| 12   | 222.6      | 24.8%      | 112.5              | 86.5           | 8.9                   | 127          | 568.0      |

### Top earner

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 1    | 6.8        | 3.1%       | 4.9                | 2.0            | 1.6                   | 87           | 33.3       |
| 2    | 22.0       | 6.5%       | 22.3               | 8.8            | 3.5                   | 87           | 37.2       |
| 3    | 43.1       | 9.8%       | 39.1               | 17.9           | 4.8                   | 89           | 48.5       |
| 4    | 66.8       | 13.0%      | 52.7               | 26.1           | 5.6                   | 76           | 66.3       |
| 5    | 87.4       | 15.8%      | 64.7               | 35.5           | 6.3                   | 83           | 76.7       |
| 6    | 106.5      | 17.8%      | 72.0               | 44.8           | 6.7                   | 94           | 95.6       |
| 7    | 128.9      | 19.7%      | 80.4               | 54.8           | 7.2                   | 82           | 109.7      |
| 8    | 155.5      | 21.8%      | 89.7               | 63.1           | 7.5                   | 128          | 158.9      |
| 9    | 171.8      | 22.6%      | 97.4               | 69.3           | 8.0                   | 138          | 243.3      |
| 10   | 192.1      | 23.7%      | 103.0              | 75.3           | 8.3                   | 137          | 341.1      |
| 11   | 203.2      | 23.9%      | 108.0              | 80.4           | 8.6                   | 124          | 455.2      |
| 12   | 214.6      | 24.3%      | 113.0              | 84.9           | 8.9                   | 121          | 576.5      |

### Newcomer

| Week | Gear power | Gear share | Item levels (team) | Crafts claimed | Crafting level (best) | Essence held | Scrap held |
| ---- | ---------- | ---------- | ------------------ | -------------- | --------------------- | ------------ | ---------- |
| 4    | 7.8        | 3.8%       | 5.4                | 2.4            | 1.5                   | 58           | 34.3       |
| 5    | 23.8       | 7.6%       | 21.5               | 9.7            | 3.5                   | 87           | 44.9       |
| 6    | 48.1       | 11.5%      | 38.4               | 17.8           | 5.0                   | 81           | 52.0       |
| 7    | 74.8       | 15.1%      | 53.0               | 26.5           | 5.8                   | 73           | 63.8       |
| 8    | 95.0       | 17.1%      | 64.0               | 35.9           | 6.3                   | 77           | 81.3       |
| 9    | 116.3      | 19.0%      | 74.8               | 45.0           | 6.8                   | 96           | 83.9       |
| 10   | 133.8      | 20.6%      | 83.0               | 55.5           | 7.1                   | 106          | 100.5      |
| 11   | 153.8      | 22.1%      | 93.2               | 64.5           | 7.5                   | 90           | 132.0      |
| 12   | 180.0      | 23.8%      | 100.5              | 71.0           | 8.0                   | 118          | 212.7      |

### Daily players with gear and without (today)

| Week | Essence held | Essence held today | Top-3 power | Top-3 power today |
| ---- | ------------ | ------------------ | ----------- | ----------------- |
| 1    | 91           | 86                 | 218         | 196               |
| 2    | 86           | 125                | 312         | 243               |
| 3    | 82           | 139                | 413         | 341               |
| 4    | 77           | 188                | 492         | 400               |
| 5    | 87           | 253                | 560         | 429               |
| 6    | 96           | 304                | 609         | 454               |
| 7    | 90           | 359                | 660         | 481               |
| 8    | 121          | 404                | 708         | 518               |
| 9    | 117          | 477                | 763         | 546               |
| 10   | 122          | 547                | 810         | 571               |
| 11   | 117          | 604                | 857         | 599               |
| 12   | 127          | 654                | 894         | 627               |

### What the team wears (end of week 8)

| Archetype  | Common | Rare | Epic | Festival | Average item level | Power added per item | Bag | Blueprints | Scrap | Shards | Glimmer |
| ---------- | ------ | ---- | ---- | -------- | ------------------ | -------------------- | --- | ---------- | ----- | ------ | ------- |
| Casual     | 69%    | 26%  | 5%   | 12%      | 4.6                | 10.1                 | 3.0 | 3.4        | 121   | 5      | 1.8     |
| Daily      | 39%    | 53%  | 8%   | 6%       | 10.4               | 52.7                 | 4.3 | 10.5       | 162   | 7      | 7.6     |
| Top earner | 39%    | 53%  | 8%   | 4%       | 10.1               | 51.8                 | 4.1 | 10.5       | 159   | 7      | 7.6     |
| Newcomer   | 45%    | 48%  | 7%   | 6%       | 8.3                | 31.7                 | 3.7 | 6.5        | 81    | 5      | 4.1     |

## Daily dungeon

Every player with 3 creatures walks the day's map once on each day they check in (casuals on their leet days), with their 3 strongest creatures: 7 floors with the camp on floor 3 (floors count from 0; every path meets there) and the room boss last. A run is cleared when the boss is beaten (and the player then heads home or finishes the Undercroft), ends at home when the player heads home from the camp, and in a defeat when a fight is lost; a run that beat the boss and is lost in the Undercroft below it is a defeat that still moved the depth. From depth 8 the boss's chest opens at once and the player may go down into the Undercroft (see below). Depth 1 to 24 are listed; only beating the boss moves the depth.

### How runs end

| Archetype  | Runs | Cleared | Home | Defeat | Fights / run | Elites / run | Keepsakes / run | Pack found | Pack kept | Reached the camp |
| ---------- | ---- | ------- | ---- | ------ | ------------ | ------------ | --------------- | ---------- | --------- | ---------------- |
| Casual     | 1435 | 55%     | 8%   | 36%    | 4.78         | 0.58         | 1.37            | 7.10       | 6.24      | 96%              |
| Daily      | 7782 | 25%     | 18%  | 57%    | 4.14         | 0.43         | 1.04            | 5.46       | 4.37      | 88%              |
| Top earner | 3855 | 24%     | 19%  | 57%    | 4.21         | 0.45         | 1.08            | 5.54       | 4.37      | 89%              |
| Newcomer   | 1423 | 29%     | 16%  | 56%    | 4.25         | 0.46         | 1.13            | 5.80       | 4.68      | 88%              |

Fights count a lost one; the pack is Bait, Essence and scrap added up (the supply and experience are not in it; the boss's Essence and scrap, Market Day's scrap and the Undercroft's loot are). Of the runs that reached the camp: Casual rest 2%, swap 20%, keepsake 70%, home 9%; Daily rest 3%, swap 25%, keepsake 51%, home 21%; Top earner rest 3%, swap 25%, keepsake 51%, home 21%; Newcomer rest 2%, swap 21%, keepsake 59%, home 18%.

### The Undercroft

A daily player's runs at depth 8 or over (6894 runs). The main boss fell in 1550 of them, and the descent was offered: 413 went down (26.6% of the offered, 6.0% of all these runs; the policy goes when the row is over 60% HP after catching its breath with nobody down). Of the descents, 34.4% beat the first keeper (0.36 keepers a descent), 270 were lost below (half the pack, the depth stays) and 3 headed home from an Undercroft camp. A descent plays 2.85 fights below. All these runs play 4.07 fights (3.90 on the main map); 15.2% step through a carved door and add a room (0.152 rooms a run).

### Clear rate by depth

| Depth | Casual    | Daily     | Top earner |
| ----- | --------- | --------- | ---------- |
| 1     | 94% (77)  | 82% (117) | 100% (48)  |
| 2     | 97% (74)  | 83% (115) | 94% (51)   |
| 3     | 94% (77)  | 85% (113) | 94% (51)   |
| 4     | 90% (80)  | 83% (115) | 92% (52)   |
| 5     | 81% (89)  | 73% (132) | 89% (54)   |
| 6     | 81% (89)  | 63% (152) | 77% (62)   |
| 7     | 74% (97)  | 67% (144) | 68% (71)   |
| 8     | 61% (119) | 47% (204) | 56% (86)   |
| 9     | 55% (130) | 48% (201) | 46% (104)  |
| 10    | 49% (143) | 43% (221) | 53% (91)   |
| 11    | 44% (151) | 40% (240) | 33% (147)  |
| 12    | 34% (137) | 34% (285) | 38% (128)  |
| 13    | 41% (76)  | 36% (267) | 28% (171)  |
| 14    | 18% (68)  | 11% (872) | 9% (515)   |
| 15    | 25% (20)  | 37% (260) | 42% (115)  |
| 16    | 13% (8)   | 29% (333) | 24% (197)  |
| 17    | -         | 26% (372) | 25% (191)  |
| 18    | -         | 21% (454) | 26% (185)  |
| 19    | -         | 21% (448) | 20% (242)  |
| 20    | -         | 19% (477) | 17% (282)  |
| 21    | -         | 11% (705) | 12% (329)  |
| 22    | -         | 17% (392) | 16% (196)  |
| 23    | -         | 18% (313) | 13% (187)  |
| 24    | -         | 18% (254) | 10% (162)  |

Runs in brackets. Players stop at the depth where they win about a fifth of their runs.

### Depth after N weeks (median, quartiles)

| Week | Casual        | Daily         | Top earner    | Newcomer      |
| ---- | ------------- | ------------- | ------------- | ------------- |
| 1    | 1 (1 to 1)    | 4 (3 to 5)    | 4 (4 to 6)    | -             |
| 2    | 1 (1 to 2)    | 9 (8 to 9)    | 9 (8 to 10)   | -             |
| 4    | 5 (4 to 5)    | 14 (13 to 15) | 14 (13 to 14) | 4 (3 to 5)    |
| 6    | 8 (7 to 8)    | 17 (15 to 19) | 16 (14 to 18) | 12 (11 to 13) |
| 8    | 10 (9 to 11)  | 20 (18 to 22) | 19 (18 to 21) | 14 (14 to 17) |
| 10   | 12 (11 to 13) | 22 (20 to 24) | 22 (21 to 23) | 19 (16 to 20) |
| 12   | 13 (12 to 14) | 24 (22 to 26) | 24 (22 to 25) | 21 (19 to 23) |

### Reward flow per player and week

| Archetype  | Runs | Cleared | Bait | Essence | Scrap | Gear items |
| ---------- | ---- | ------- | ---- | ------- | ----- | ---------- |
| Casual     | 1.66 | 1.02    | 5.3  | 1.35    | 3.7   | 0.25       |
| Daily      | 6.76 | 1.93    | 17.1 | 3.62    | 11.7  | 0.53       |
| Top earner | 6.69 | 1.89    | 16.9 | 3.55    | 11.6  | 0.53       |
| Newcomer   | 6.59 | 2.21    | 17.2 | 3.93    | 12.4  | 0.63       |

A daily player's runs from week 2 end at home 19.1% of the time and take 4.11 fights (the Undercroft's included).

Dungeon Essence is 4.3% of a daily player's Essence income. Gear's share of a daily player's raid-team power at week 8 is 22.4% with the dungeon and 18.1% without it (the same sims and seeds).

## Elements

| Element | Raid slots | Pick rate |
| ------- | ---------- | --------- |
| tide    | 19457      | 29.1%     |
| ember   | 17689      | 26.5%     |
| grove   | 8475       | 12.7%     |
| spark   | 21252      | 31.8%     |

## Creatures

| Creature               | Rarity | Element | Role    | Picks | Pick rate | Average level | Average contribution | Relative to rarity median |
| ---------------------- | ------ | ------- | ------- | ----- | --------- | ------------- | -------------------- | ------------------------- |
| Ashmole                | common | ember   | support | 2755  | 4.1%      | 18.0          | 5561                 | 1.01x                     |
| Aurorix                | epic   | spark   | support | 196   | 0.3%      | 17.9          | 5779                 | 0.87x                     |
| Cindle                 | common | ember   | payoff  | 12790 | 19.1%     | 19.1          | 6228                 | 1.13x                     |
| Coralynx               | rare   | tide    | payoff  | 5656  | 8.5%      | 18.5          | 6498                 | 1.00x                     |
| Gaiadrake              | epic   | grove   | payoff  | 1548  | 2.3%      | 18.5          | 8429                 | 1.27x                     |
| Hearthshell (Festival) | epic   | ember   | guard   | 634   | 0.9%      | 14.4          | 3692                 | 0.56x                     |
| Lanternfin (Festival)  | epic   | tide    | support | 4117  | 6.2%      | 14.4          | 5366                 | 0.81x                     |
| Mistnewt               | common | tide    | guard   | 2783  | 4.2%      | 19.6          | 5230                 | 0.95x                     |
| Mossback               | rare   | grove   | setter  | 1902  | 2.8%      | 18.7          | 6277                 | 0.97x                     |
| Solmane                | epic   | ember   | setter  | 1510  | 2.3%      | 16.8          | 6626                 | 1.00x                     |
| Splashet               | common | tide    | setter  | 6901  | 10.3%     | 18.6          | 7513                 | 1.37x                     |
| Sproutle               | common | grove   | guard   | 5025  | 7.5%      | 19.2          | 4618                 | 0.84x                     |
| Stormray               | rare   | spark   | payoff  | 7083  | 10.6%     | 18.1          | 7521                 | 1.16x                     |
| Zipmouse               | common | spark   | setter  | 13973 | 20.9%     | 18.2          | 5427                 | 0.99x                     |

## Essence and jackpots

| Players | Player-weeks | Mean Essence | P10 | Median | P90 | Max |
| ------- | ------------ | ------------ | --- | ------ | --- | --- |
| 1       | 800          | 100.8        | 77  | 80     | 198 | 210 |
| 5       | 3501         | 59.4         | 0   | 55     | 164 | 205 |
| 10      | 7257         | 49.7         | 0   | 52     | 70  | 195 |
| 15      | 10822        | 51.6         | 0   | 51     | 156 | 199 |

| Source                           | Finale-win rolls | Jackpots | Rate  | Guaranteed by hard pity |
| -------------------------------- | ---------------- | -------- | ----- | ----------------------- |
| sweep, 1 players                 | 800              | 158      | 19.8% | 0                       |
| sweep, 5 players                 | 2816             | 425      | 15.1% | 0                       |
| sweep, 10 players                | 5235             | 638      | 12.2% | 0                       |
| sweep, 15 players                | 7928             | 1148     | 14.5% | 0                       |
| economy sims, 20 raid weeks each | 5938             | 803      | 13.5% | 64                      |

## Ability damage share (informational)

What abilities add to the damage dealt in the finale, measured by replaying each finale three times against a boss that cannot fall (every ability, only the basic ones, none) so all 12 rounds are played. Creature share = (all - basic only) / all; basic share = (basic only - none) / all. Creature abilities need creature level 10. Informational: the aim is a creature share of about 10-25% for a week-8 roster, not a target.

| Roster week | Group                        | Raids | Creature abilities per raid | Creature share | Basic share |
| ----------- | ---------------------------- | ----- | --------------------------- | -------------- | ----------- |
| 4           | typical group (5-10 players) | 582   | 22.3                        | 18.3%          | 3.4%        |
| 4           | 15 players                   | 400   | 38.2                        | 20.9%          | 3.8%        |
| 4           | 1 player with guests         | 400   | 3.0                         | 9.9%           | 0.7%        |
| 8           | typical group (5-10 players) | 598   | 23.0                        | 20.0%          | 3.2%        |
| 8           | 15 players                   | 400   | 40.2                        | 22.6%          | 3.6%        |
| 8           | 1 player with guests         | 400   | 3.0                         | 11.6%          | 0.7%        |

## Long-running servers (ladder, Festivals, seasons)

40 servers per size, 30 weeks each (6 seasons of 4 normal weeks and a Festival), with the Boss Rank ladder: placement at the first raid week, a normal finale win +1 rank, a loss keeps the rank, a Festival boss fights 3 ranks lower and the rank eases 1 after it. Every server starts at a random point of the 5-week calendar. A rank-up is a week that raised the rank.

| Server                      | Servers | Finale win rate (mean per server) | Per server p10 to p90 | Normal weeks | Festival weeks | Weeks 1-10 | Weeks 11+ | Median weeks between rank-ups (p10 to p90) | Servers with a loss streak over 4 | Median longest loss streak |
| --------------------------- | ------- | --------------------------------- | --------------------- | ------------ | -------------- | ---------- | --------- | ------------------------------------------ | --------------------------------- | -------------------------- |
| Small server (5 players)    | 40      | 82.6%                             | 73% to 90%            | 78.6%        | 98.3%          | 76.3%      | 85.8%     | 1.0 (1 to 3)                               | 0.0%                              | 2                          |
| Typical server (10 players) | 40      | 93.1%                             | 87% to 97%            | 91.5%        | 99.6%          | 87.8%      | 95.8%     | 1.0 (1 to 2)                               | 0.0%                              | 1                          |
| 15-player server            | 40      | 93.1%                             | 87% to 97%            | 91.4%        | 100.0%         | 87.3%      | 96.0%     | 1.0 (1 to 2)                               | 0.0%                              | 1                          |

Median server rank at the start of each week (the Festival boss fights at an eased rank):

| Server                      | Placement | Week 1 | Week 5 | Week 10 | Week 15 | Week 20 | Week 25 | Week 30 | Rank after the last week (p10 to p90) |
| --------------------------- | --------- | ------ | ------ | ------- | ------- | ------- | ------- | ------- | ------------------------------------- |
| Small server (5 players)    | 1.0       | 1.0    | 3.0    | 5.0     | 7.0     | 9.0     | 11.0    | 14.0    | 14.0 (12 to 16)                       |
| Typical server (10 players) | 1.0       | 1.0    | 3.0    | 6.0     | 8.0     | 11.0    | 14.0    | 17.0    | 17.0 (15 to 18)                       |
| 15-player server            | 1.0       | 1.0    | 3.0    | 5.0     | 8.0     | 11.0    | 13.5    | 16.5    | 17.0 (15 to 19)                       |

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
2. Round 1: Tidal Colossus has 82598 HP.
3. Lanternfin (Top earner 1) powers up Sproutle (Newcomer 1) (+17% damage on its next hit).
4. Lanternfin (Top earner 1) powers up Lanternfin (Daily 4) (+17% damage on its next hit).
5. Lanternfin (Daily 4) powers up Lanternfin (Top earner 1) (+17% damage on its next hit).
6. Lanternfin (Daily 4) powers up Magmole (Daily 4) (+17% damage on its next hit).
7. Magmole (Daily 4) powers up Lanternfin (Daily 4) (+25% damage on its next hit).
8. Magmole (Daily 4) powers up Lanternfin (Daily 2) (+25% damage on its next hit).
9. Lanternfin (Daily 2) powers up Magmole (Daily 4) (+17% damage on its next hit).
10. Lanternfin (Daily 2) powers up Aurorix (Top earner 2) (+17% damage on its next hit).
11. Aurorix (Top earner 2) powers up Lanternfin (Daily 2) (+11% damage on its next hit).
12. Aurorix (Top earner 2) powers up Lanternfin (Top earner 2) (+11% damage on its next hit).
13. Lanternfin (Top earner 2) powers up Aurorix (Top earner 2) (+17% damage on its next hit).
14. Lanternfin (Top earner 2) powers up Lanternfin (Casual 2) (+17% damage on its next hit).
15. Lanternfin (Casual 2) powers up Lanternfin (Top earner 2) (+17% damage on its next hit).
16. Magmole (Daily 3) powers up Voltaro (Daily 1) (+29% damage on its next hit).
17. Sproutle (Casual 3) acts.
18. Sproutle (Casual 3) hits Tidal Colossus for 36; 82562 HP left.
19. Sproutle (Casual 3) leaves Tidal Colossus Overgrown.
20. Sproutle (Newcomer 1) acts.
21. Sproutle (Newcomer 1) hits Tidal Colossus for 38; 82524 HP left.
22. Lanternfin (Top earner 1) acts.
23. Lanternfin (Top earner 1) hits Tidal Colossus for 145; 82379 HP left.
24. Lanternfin (Daily 4) acts.
25. Lanternfin (Daily 4) hits Tidal Colossus for 156 (+14% from modifiers); 82223 HP left.
26. Magmole (Daily 4) acts.
27. Magmole (Daily 4) hits Tidal Colossus for 574 (weak matchup); 81649 HP left.
28. Wildfire! Magmole (Daily 4) cashes in the mark set by Sproutle (Casual 3) for 458 bonus damage (+12% from modifiers).
29. Lanternfin (Daily 2) acts.
30. Lanternfin (Daily 2) hits Tidal Colossus for 122; 81527 HP left.

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
- **Daily dungeon** (`docs/design/dungeon-paths.md`): every player with at least 3 creatures walks the day's map once on each day they check in (casuals on their leet days); on the first day they ever ran, a run lost to a defeat may be tried once more (a run that headed home or cleared may not). The map (`generateDungeonMap`, from a seed of the day) is the same for the whole server; the team is the 3 strongest creatures by power (gear included), stood in one row by the game's rule for it (`dungeonRowOrder`); there is no basic ability, and every unlocked creature ability fires at its default round. Each fight is one `simulateDungeonRoom` with the HP carried and the keepsakes folded in. The walk is a small policy: prefer the foe the row's elements beat; take an elite only above 70% average HP with nobody down; prefer a mystery room or a cache below 50%; take an event's costly or gamble option only above 60% (a plain heal below 70%); at the camp swap in the strongest unused creature for a fallen one, else rest below 60%, else take the first keepsake, then head home when 2 creatures are down or average HP is under 35%. `random` players choose everything at random and `best` players look one floor ahead and take the better keepsake. The day's map is drawn with carved doors (`{ doors: true }`, as the worker draws it): the policy steps through a door when the route reaches it (no fight, so no risk; below depth 8 it is a quiet room), which adds a room of a random kind (`drawMark`) to the Undercroft. When the room boss falls at depth 8 or over the chest is banked at once (its gear, shard and supply are paid for good, its Essence and scrap go into the pack) and depth + 1 is locked in; then the policy goes down into the Undercroft when, after catching its breath (+20% HP), the row's average HP is over 60% with nobody down (`random` players flip a coin; `best` also wants over 75% for a level of 4 floors or more with no camp), else heads home with the pack. Below it plays the same walk on the level's own map (`generateUndercroftMap`, foes 1 depth harder): the same route and event rules, fights, elites and caches put 2 times their loot in the pack, epic fights, camps (the same camp rule and the same home rule as the main camp: the only way home from below), the keeper (a room boss with its signature) and its chest (gear by `rollUndercroftChest`); a cracked floor offers the next level under the same rule. A run is paid as the worker pays it: the pack (all of it at home or when done, half rounded up after a defeat, which below the boss keeps the depth; Market Day's scrap and the boss's full-clear and landmark extras are in the pack), once the boss has fallen its chest (the shard chance, the gear chance, certain at a landmark, the landmark's glimmer), the keepers' chests, the run's supply once a fight is cleared (safe), experience per creature by the fights it stood in the row for plus the full clear bonus for the row that beat the main boss, and the streak bonus on the first run of a day, through `nodeLoot`, `keptOnDefeat`, `rollDungeonLoot`, `rollUndercroftChest`, `dungeonExperience` and `streakBonus`.
- **Time** for jobs: check-ins at 09:00 and 20:00 (casuals at 09:00 on their leet days); a job is claimed at the first check-in after `jobDuration` (the crafter's skill included) has passed.
- **Typical group:** a raid week with 5 to 10 signed-up players, on rosters from the end of week 4 or 8.

Default mix: 3 casual, 4 daily, 2 top, 1 newcomer. Other server sizes use the same mix scaled by largest remainder.
