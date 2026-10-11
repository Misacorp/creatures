_Progression, phase 1 (rules, content, simulator): crits on, Boss Rank ladder, Festivals and seasons, rank-scaled rewards, readiness band. Seed `leet`, 12 weeks per economy sim, 200 raid weeks per cell, 24 economy sims per player count, 40 twenty-week pity sims and 40 thirty-week long-run sims per server size (`pnpm sim`). "Before" is the same full run on the `progression` branch before this work (crits off, boss scaled by average level)._

# Balance pass 4: progression

**Result: 21 passed / 0 failed before (21 targets), 27 passed / 0 failed after (the 21 old targets plus 6 new ones).** Five more seeds: `a`, `b`, `c`, `d` pass all 27; seed `e` passes 26 (the lowest creature is 0.57x of its rarity median, needs 0.60x: a support that is rarely picked, the same noise earlier passes saw). The finale and Phase 2 targets are sensitive to boss HP, so re-check them after the next content change.

## Before and after

| Target                                                                                         | Required       | Before | After  |
| ---------------------------------------------------------------------------------------------- | -------------- | ------ | ------ |
| Phase 1 clear rate, typical group (5-10 signed-up players, week 4 or later)                    | >= 95.0%       | 100.0% | 100.0% |
| Phase 2 clear rate, typical group                                                              | 70.0% to 85.0% | 72.0%  | 72.1%  |
| Finale win rate, typical group                                                                 | 40.0% to 60.0% | 54.5%  | 49.1%  |
| Phase 1 clear rate, 1 player with guests, week 4 or later                                      | >= 80.0%       | 100.0% | 100.0% |
| Finale win rate, 15 players (no easier-with-more-people cliff)                                 | 35.0% to 65.0% | 59.1%  | 48.8%  |
| Spread of finale win rate between bosses, typical group (percentage points)                    | <= 15.0%       | 7.8%   | 8.9%   |
| Bosses a typical group never beats or always beats in the finale (flagged)                     | <= 0           | 0      | 0      |
| Median top player's share of contribution, groups of 5+ players                                | <= 35.0%       | 15.9%  | 16.4%  |
| Setup credit share of total contribution (setters matter)                                      | >= 15.0%       | 15.7%  | 15.7%  |
| Reactions per round on average, groups of 5+ players                                           | >= 1           | 4.4    | 4.28   |
| Newcomer (joined week 4) Essence per week at week 6, relative to a top earner                  | >= 70.0%       | 93.5%  | 96.0%  |
| Lowest element pick rate in raids                                                              | >= 15.0%       | 19.9%  | 20.6%  |
| Highest element pick rate in raids                                                             | <= 35.0%       | 29.1%  | 30.1%  |
| Highest creature contribution relative to the median creature of its rarity                    | <= 1.60x       | 1.39x  | 1.46x  |
| Lowest creature contribution relative to the median creature of its rarity                     | >= 0.60x       | 0.69x  | 0.63x  |
| Elements picked in under 10% of raid slots (flagged as dead)                                   | <= 0           | 0      | 0      |
| Casual player's highest creature level at the end of week 4 (evolution level 15)               | >= 15          | 15     | 15     |
| Daily player owns at least 8 of 12 catchable species by the end of week 6                      | >= 8           | 11     | 11     |
| Top earner vs casual average team power at week 8                                              | <= 1.60x       | 1.50x  | 1.45x  |
| Jackpot rate per player per finale win, including pity                                         | 6.0% to 15.0%  | 12.4%  | 12.2%  |
| Players reaching hard pity (10 raids without a jackpot) over 20 weeks                          | <= 15.0%       | 11.9%  | 13.1%  |
| Long-run finale win rate per server, Festivals included, small server (5 players, 30 weeks)    | 40.0% to 60.0% | (new)  | 53.8%  |
| Long-run finale win rate per server, Festivals included, typical server (10 players, 30 weeks) | 40.0% to 60.0% | (new)  | 53.9%  |
| Long-run finale win rate per server, Festivals included, 15-player server (30 weeks)           | 40.0% to 60.0% | (new)  | 53.8%  |
| Festival finale win rate, lowest of the three server sizes                                     | >= 70.0%       | (new)  | 97.1%  |
| Median weeks between rank-ups, all long-run servers                                            | 2 to 4         | (new)  | 2      |
| Share of servers with a loss streak of more than 4 weeks, worst of the three sizes             | <= 10.0%       | (new)  | 0.0%   |

Finale win rate by boss, typical group (5 to 10 players): Tidal Colossus 58.5% -> 44.1%, Cinder Wyrm 51.7% -> 53.0%, Thornmother 50.7% -> 51.0%, Storm Sovereign 57.0% -> 48.1%.

Finale win rate by boss and group size (before -> after):

| Boss            | 5 players  | 10 players | 15 players |
| --------------- | ---------- | ---------- | ---------- |
| Tidal Colossus  | 64% -> 52% | 57% -> 37% | 66% -> 50% |
| Cinder Wyrm     | 36% -> 50% | 56% -> 48% | 59% -> 53% |
| Thornmother     | 62% -> 56% | 46% -> 44% | 45% -> 45% |
| Storm Sovereign | 60% -> 54% | 60% -> 40% | 66% -> 48% |

## What changed

- **Crits on** in `RULES.combat.luck`: 5% chance and +50% damage for every creature, 5% and +50% for the boss, the species bonus (+5% / +25% on four payoff species) kept, caps 30% / +150%. Fortune streaks and the damage spread stay in the code, off. Boss Attack stays at x1. The luck study tool still uses "no luck" as its base.
- **Boss Rank replaces scaling by average level.** `scaleBoss(boss, players, rank)`: HP = `baseHp x N^e x rankFactor`, Attack = `baseAtk x (1 + half the rank excess)`. The rank factor compounds +40% per rank (integer basis points, floored at each step, rank 1 to 30). Every signed-up player counts once, so the head count is weight-neutral and no cap is needed.
- **Per-boss head-count exponent** (`hpExponent` on the boss, optional; else `RULES.raid.scaling.hpExponent`, now 1.1). One exponent could not keep every boss flat from 5 to 15 players (see below).
- **Boss HP retuned** with crits on and the new scaling: base HP and exponent per boss.

| Boss            | Base HP (was) | Head-count exponent (was 1.2 for all) |
| --------------- | ------------- | ------------------------------------- |
| Tidal Colossus  | 6689 (4670)   | 1.07                                  |
| Cinder Wyrm     | 2749 (2870)   | 1.21                                  |
| Thornmother     | 5977 (4410)   | 1.04                                  |
| Storm Sovereign | 5203 (4340)   | 1.13                                  |

Base HP is not comparable with the old numbers: the old HP was multiplied by a level factor of about 2 to 3 at the rosters of week 4 to 8; the new base is the rank 1 boss, and the sweep fights each boss at the rank the old rule would have picked for the roster.

- **Phase 2 clears at 52% of the pool (was 54%).** With crits on, the gap between the Phase 2 clear rate and the finale win rate shrank from 18 to 15 points, so Phase 2 (needs 70 to 85%) could only reach 70% by pushing the finale to 60%. Each 100 basis points on the threshold is about 4 points of Phase 2 clears and does not move the finale. At 52%: Phase 2 72.1%, finale 49.1%.
- **Ladder, seasons, Festivals, rewards, readiness** in `packages/game/src/rules/progression.ts` (details below). Two Festival creatures were added to the content.
- **Pool for the creature balance target:** Festival species are compared with the catchable median but are excluded from the ratio target (players get them late, at level 1; Lanternfin shows 0.54x).

## The ladder and why the numbers are what they are

Rules: placement once (`placementRank`: the rank whose HP factor is nearest the old rule's +12% per average level, so a roster of level-1 creatures is rank 1); a finale win in a normal week +1; a loss changes nothing (no demotion, no Resolve); every 5th week of the global calendar is a Festival: the boss fights 3 ranks lower (`festivalEaseRanks`), Essence pays +50% (`festivalEssenceBp`), a win does not raise the rank, and afterwards the rank eases by 1 (`seasonResetRanks`, win or loss, never below 1).

**The arithmetic that decides everything.** Rank only rises on a normal win and only falls at a Festival, so over any stretch `wins = rank gained + resets`. Once a server's growth stops, rank gained is 0 and it wins exactly `seasonResetRanks / 4` of its normal weeks, however random the fights are. While it grows, every rank of growth is one more win. Over 30 weeks that is `wins = (final rank - placement rank) + 6 x resets`, so the long-run win rate is set by the reset and by how many ranks the whole growth is worth, which is the rank step: a server grows about 3.5 times stronger in its first 12 weeks (top-3 power of a daily player 200 -> 720).

Long-run results (40 servers per size, 30 weeks, every server starts at a random point of the 5-week calendar), with the shipped numbers:

| Server               | Finale win rate | Normal weeks | Festival weeks | Weeks 1-10 | Weeks 11+ | Median weeks between rank-ups (p10 to p90) | Servers with a loss streak over 4 | Median longest loss streak | Rank: placement -> after week 30 (p10 to p90) |
| -------------------- | --------------- | ------------ | -------------- | ---------- | --------- | ------------------------------------------ | --------------------------------- | -------------------------- | --------------------------------------------- |
| Small (5 players)    | 53.8%           | 42.9%        | 97.1%          | 70.3%      | 45.5%     | 2 (1 to 5)                                 | 0%                                | 3                          | 2 -> 6 (5 to 7)                               |
| Typical (10 players) | 53.9%           | 42.9%        | 97.9%          | 72.5%      | 44.6%     | 2 (1 to 5)                                 | 0%                                | 3                          | 2 -> 6 (6 to 7)                               |
| 15 players           | 53.8%           | 42.7%        | 97.9%          | 75.5%      | 42.9%     | 2 (1 to 5)                                 | 0%                                | 3                          | 2 -> 6 (6 to 7)                               |

Median rank at the start of week 1, 5, 10, 15, 20, 30: typical server 2, 3, 5, 6, 6, 6 (small 2, 3, 5, 6, 6, 7; 15 players 2, 3, 6, 6, 6, 6). The rank spread between the typical and the 15-player server after week 30 is 0 ranks (information, no target). At the plateau a server wins one normal week in four (a win to the wall, three losses), wins the Festival, drops one rank and climbs back: W L L L F, so the median gap between rank-ups is 2 and no server loses more than 3 in a row.

How the knobs move the long-run numbers (typical server, everything else as shipped; the other sizes are within a point):

| Setting                                 | Win rate (normal / Festival) | Weeks between rank-ups | Loss streak over 4 | Verdict                                                 |
| --------------------------------------- | ---------------------------- | ---------------------- | ------------------ | ------------------------------------------------------- |
| **Shipped:** step +40%, ease 3, reset 1 | 53.9% (42.9% / 97.9%)        | 2                      | 0%                 | passes                                                  |
| Step +20% (was the first guess)         | 65.3% (57.6% / 96.3%)        | 1                      | 5%                 | win rate and rank-up gap fail: too many ranks of growth |
| Step +35%                               | 54% to 56%                   | 2                      | 0% to 17% (ease 2) | passes with ease 3                                      |
| Ease 2 instead of 3                     | 53.6% (42.9% / 96.3%)        | 2                      | 5% to 10%          | borderline on the loss streak; Festival 94% to 96%      |
| Ease 1 (step 30%)                       | 50.7% (47.9% / 61.7%)        | 2                      | 60%                | fails: the Festival is not a break any more             |
| Reset 2                                 | 71.0% (64.3% / 97.9%)        | 1                      | 0%                 | fails: too many wins                                    |
| Reset 0 (no season reset)               | 36.8% (21.5% / 97.9%)        | 2                      | 0%                 | fails the win rate and leaves a stalled server stuck    |
| A Festival win also +1 rank             | 37.2% (22.0% / 97.9%)        | 2                      | 0%                 | fails: it cancels the reset                             |

**Conflict worth knowing about.** The targets "40-60% of finales won over 30 weeks" and "wins make the rank go up by 1" together force a big rank step, because a server's whole growth has to be worth only about 4 to 6 ranks. A +40% boss per rank is large; a smaller step passes only if the season reset were stronger, and a stronger reset (2 ranks) lifts the win rate to 71%. So the target set and the step are consistent, but the step is not a "gentle +8%". It is a game-feel question for Misa.

**The Festival is nearly always won (97%).** Ease 3 at +40% is a boss 2.7 times smaller. That gives every server its Festival creature almost every season and breaks every loss streak. A harder Festival (ease 2) is possible but lets 5 to 10% of servers lose more than 4 in a row.

## Head-count exponent and per-boss HP

The old single exponent (1.2) was tuned with the level factor. With the ladder the exponent only has to keep the odds flat from 5 to 15 players. Fitted on four seeds with `node packages/sim/scripts/tune.mjs --calibrate 5 --seeds 4`: Backdraft makes Cinder Wyrm easier for big groups (e 1.21), Thornmother's resisted reaction makes it harder (e 1.04), Tidal Colossus 1.07, Storm Sovereign 1.13. The 10-player cell is consistently 5 to 10 points below the 5 and 15 player cells on every boss (the default mix has a newcomer and a big casual share), which the exponent cannot fix. Cells by boss and size are in the table above.

## Rewards

Essence and the jackpot scale with the server rank: x(1 + 6% per rank above 1), capped at x2, and a Festival adds 50% on top (`essenceMultiplierBp`, `scaleEssence`, `jackpotEssenceFor`; the rank is the server's displayed rank, not the eased Festival one). A typical server at rank 6 earns +30% Essence; at a Festival +95%. The economy targets are unaffected: newcomer Essence at week 6 is 96.0% of a top earner (both earn the same multiplier), the jackpot rate and hard pity are unchanged (12.2% and 13.1%, hard pity went from 11.9% to 13.1% because the long ladder wins slightly more finales than before), and Essence is not a bottleneck (a daily player holds 600 to 960 by week 12, and the most expensive evolution costs far less).

## Readiness band

`readinessBand(forecast)` maps the margin (mean finale damage over the HP left, in basis points of "exactly enough") to `long_shot | even | likely | strong` at **8000, 8800 and 10300** (`RULES.progression.readiness`). The forecast is `forecastFinale(input, rng)` from the engine (every ability at its default round, 5 fresh seeds, damage measured against a boss that cannot fall), and `forecastWeek(...)` for Monday, which estimates the HP left at the finale from two simulated phases so the same thresholds apply from Monday to Saturday.

Calibration (`node packages/sim/scripts/readiness.mjs --cases 400`): 400 finale inputs (5, 10 and 15 player rosters at weeks 4 and 8, all four bosses, the pool scaled between 65% and 180% of the placement-rank boss so the middle of the scale is filled in). "Default timing": every ability at its default round, 40 seeds. "Skilled-ish": the abilities of every third player timed by a short greedy search (4 seeds a candidate, one pass), evaluated on other seeds. It knows the whole roster, so it is generous; "half the players" is the same with every second player.

```

After Saturday (forecast of the finale against the HP left):
band      | inputs | default win | skilled-ish win (a third) | skilled-ish p10 to p90 | half the players
long_shot |    177 |          0% |                        0% | 0% to 0% | 0%
even      |     24 |          0% |                       53% | 0% to 100% | 47%
likely    |     23 |         13% |                       89% | 78% to 100% | 81%
strong    |    176 |        100% |                      100% | 100% to 100% | 100%
margin (bp) where the win rate reaches:     15%      30%      50%      70%      90%
  default timing               9767     9894    10016    10184    10305
  skilled-ish (a third)        8007     8162     8555     8804     9360
  half the players             8131     8297     8518     8865     9669

From Monday (`forecastWeek`: finale damage over the HP the finale should start with; win rate of the whole week):
band      | inputs | default win | skilled-ish win (a third) | skilled-ish p10 to p90 | half the players
long_shot |    175 |          0% |                        0% | 0% to 0% | 0%
even      |     26 |          0% |                       46% | 0% to 90% | 42%
likely    |     26 |         23% |                       89% | 65% to 100% | 75%
strong    |    173 |        100% |                      100% | 100% to 100% | 100%
margin (bp) where the win rate reaches:     15%      30%      50%      70%      90%
  default timing               9608     9782     9990    10122    10352
  skilled-ish (a third)        8072     8152     8432     9004     9348
  half the players             8125     8299     8557     9046    10174

```

Reading it: the default-timing win rate crosses 50% at a margin of 10000 (the forecast is unbiased) and 90% at about 10300, which is the **strong** edge: even a team that presses nothing wins. A third of the players timing well moves the 50% point to about 8600 (a 14% damage uplift; perfect timing by everyone is more, see `luck.md`), so a margin of 8000 to 8800 is **even** (skilled-ish win rate 15% to about 70%), 8800 to 10300 is **likely** (skilled-ish win rate about 70% to 100%, default play wins 0% to 90%), and under 8000 is a **long shot** (skilled-ish play wins about 0% to 15%). Bands by the measured win rate (second seed in brackets):

| Band      | Margin        | Inputs    | Default win | Skilled-ish win (mean, p10 to p90) |
| --------- | ------------- | --------- | ----------- | ---------------------------------- |
| Long shot | below 8000    | 177 (158) | 0% (0%)     | 0% (1%), 0% to 0%                  |
| Even      | 8000 to 8799  | 24 (13)   | 0% (0%)     | 53% (25%), 0% to 100%              |
| Likely    | 8800 to 10299 | 23 (25)   | 13% (17%)   | 89% (85%), 78% to 100%             |
| Strong    | 10300 and up  | 176 (204) | 100% (100%) | 100% (100%)                        |

Because fights are nearly decided by the input, about 9 in 10 of the test inputs land in "long shot" or "strong" and only a narrow middle is uncertain; that is the "predictable fight" Misa accepted, and the band tells players which side they are on and that a better setup moves them. The Monday forecast agrees with the Saturday one within about 150 basis points at every win-rate level.

Caveats: the "skilled-ish" proxy decides what "likely" means; if real players are less skilled the likely band is a bit optimistic (default play wins 13% to 17% of "likely" inputs), if more, a bit pessimistic. Re-run the calibration after any combat or content change.

## Festival creatures

- **Lanternfin** (tide, epic, support): hp 198, atk 38, spd 47, growth 13 / 3 / 3, level cap 30. Ability **Lantern Glow**: leaves the boss Soaked and all creatures hit 7% harder for 2 rounds (default round 5).
- **Hearthshell** (ember, epic, guard): hp 236, atk 34, spd 22, growth 16 / 2 / 1, level cap 30. Ability **Hearth Ward**: its zone takes 70% less damage for 3 rounds and all creatures hit 7% harder this round (default round 3, at the first zone hit).

Both are `festival: true`, not catchable, not starters, single-stage (checked by the content loader). Their stats are inside the range of the catchable epics. The season index picks the creature: Lanternfin, Hearthshell, Lanternfin, and so on (`festivalCreatureFor(weekIndex)`). A duplicate follows the collection rules (`festivalGrantOutcome`: fuse up to 5 times, then Bait by rarity, never shiny).

## What the simulator now models

- Every economy sim runs the ladder: placement at the first raid week, win +1, Festival every 5th week of the global calendar from a seeded start, season resets, rank-scaled and Festival Essence, the Festival creature granted to participants after a won Festival (level 1, trained by the usual policy), crits on.
- The raid sweep (the old targets) fights each boss at `placementRank` of the roster, so it calibrates the content, not the ladder state.
- Long-run model: 40 servers each of 5, 10 and 15 players for 30 weeks; metrics `longrun.*` in `report.json` and `targets.json`.
- Tools: `node packages/sim/scripts/tune.mjs` (try rules and boss HP overrides, run long-run servers, `--calibrate` boss HP and exponents), `node packages/sim/scripts/readiness.mjs` (readiness calibration).

## Caveats

- Long-run servers are very similar to each other (per-server win rate 50% to 57%): the structure (`wins = gain + resets`) leaves little room for randomness. Real servers will differ more, through player churn, which the sim does not model (a server that loses players loses rank-ups until the reset catches up).
- The sim players never skip weeks and always bring their 3 strongest creatures; sign-up randomness (casuals 70%) is the only attendance noise.
- Crits cost about 5% of boss HP and the boss HP retune is fitted on one 24-sim sample per size and four seeds; boss and size cells move 3 to 5 points between seeds.
- (Written before phase 2.) The worker then still fought every server at rank 1 and did not copy the luck rules into its inputs. Phase 2 stores the ladder, scales the boss by it and copies the luck rules into every fight input.
