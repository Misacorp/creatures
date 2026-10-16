# Progression study: where players wait, where progression stalls, what to add

Date: 2026-10-16. Tip of the study branch: cd25e20 (the player journey simulator, income model `allowance`). Nothing in the repo was changed: the study ran on an instrumented copy of `packages/sim` (see "Method"). Numbers are means per player unless a column says otherwise.

## Headline findings (ordered by impact on fun)

Numbers are per-player means from paired sim runs (100 servers x 30 weeks, 40 x 70 for ceilings); sections below hold the tables. Presets: min-maxer / engaged / regular / drop-in.

1. **There is no endgame.** Progression finishes at week 13 / 18 / 46 / 62+ and everyone lands on the same ceiling (942 to 946 raid power: three level-30 creatures, 14 of 14 species, 5 fusions, gear 13%). After it a min-maxer banks +470 to 1,000 Bait and +47 Essence a week (4.7k Bait, 1.1k Essence at week 30) and finds 0.1 new milestones a week (12 in week 1). _Proposal:_ levels 31 to 40 at four times the price from level 30. Tested: ceiling +22%, min-maxer reaches it in week 33 instead of 13, engaged week 42 instead of 18 (at today's price only +6 to +8 weeks). Trade-off: +22% power needs a raid retune; regulars and drop-ins do not reach 30 before week 50, so it does nothing for them.
2. **Casual dead stretches are all Bait, while their Essence sits idle.** Bait is the binding limit on 80% to 100% of days for every preset until the cap. A regular earns 160 Bait a week against 31 to 45 a level, a drop-in 44; the median gap between meaningful upgrades is 4 to 7 days (regulars) and 5 to 8 (drop-ins, from week 1) at weeks 6 to 12 and 15 to 19 days by week 20, while they hold 150 to 660 Essence unused. _Proposal:_ Essence pays training at 1 Essence = 1 Bait (keep 60). Tested: regulars +30 power (+7%), drop-ins +40 to +54 (+16% at week 8); at 1:2 +60 to +75 and +73 to +106 (+28%). Committed players barely move (+11 to +37). Trade-off: casuals' raid power rises 5% to 28% (retune), regulars' gear power -2 to -4.
3. **Bait-bought supplies are a trap, and nobody crafts them.** Not buying leaves a min-maxer +54 power at week 4 and +97 at week 6 (+13%), engaged +50 at week 12 (+6%): supplies add 16 catch rolls a week but those are duplicates (they return a third of the price) and the 14-creature collection fills at the same week with or without them. Zero supplies were crafted in 30 weeks (crafts and upgrades take the scrap first); crafting them first gives 1 to 19 a week. _Proposal:_ sell nothing for Bait: supplies come from scrap (3/6/10), finds and journal rewards, or give them an effect worth a level (a guaranteed missing species).
4. **Gear stops because of the caps, not scrap.** Gear finishes at week 12 / 18 / 46 (drop-ins never work it: dial 0%). At week 30 63% of worn items are still commons: Attack +20% is reached at +3 to +5 for any rarity, so an epic +5 is about a common +5. Scrap is not binding (committed income 52 to 237 a week, regulars hold 100 to 220; "scrap short" is the sim crafting commons for 9 and salvaging for 2). More dungeon or duplicate scrap: +/-1 power. Second slot at creature level 20: +24 gear, +45 power (+4.8%), plateau one week later. Caps 30/35 plus the slot: +85 power (+9%), gear 20% of power, worn commons 63% to 32% (caps alone take +5 items from 0.8 to 3 of 3). A slot at level 15 or on evolution reaches regulars (+17 power at week 12).
5. **Sinks:** Essence +43 to +47 a week (committed, from week 8), shards +12 to +20 (455 held), glimmer +4 to +6 (136 held), against spends of 1 to 7 shards and 0 to 1 glimmer. A re-roll at 25 Essence is about 2 a week; glimmer sinks must cost 3 to 5 for regulars (0.3 a week) to reach them.
6. **The dungeon is a wall at depth 20 to 24** by week 12 (full clears 4.3 a week to 0.1; at the wall 13 Bait, 2 scrap, 1 Essence, no gear a week). Dungeon gear does not skew raids: removing the min-maxer's moves the finale win share by -0.06 points (95% CI +/-0.31); damage share stays 19% (31% on a casual server; fair 13%). _No Boss-Rank gate is needed;_ raise the wall (replay at a cleared depth for loot, untested) instead.
7. **The collection ends early** (14 species, complete at week 6 / 12 / 40): later trips are duplicates, 47% to 69% of committed Bait (untested: more species or deep-area content).

**Limits.** Presets are guesses (regulars work gear 10%, drop-ins 0%, `spread` training is random); workshop order and the scrap reserve are sim policy; the sim never paid the jackpot Essence the worker pays (I switched it on; effect <= 6 power); raid Essence moves with tonight's retune; dead-period counts depend on the 3% threshold (5%: 71% of min-maxer days dead at week 8).

## Method and limits (read first)

- **Runs.** Default server mix (1 min-maxer, 3 engaged, 3 regular, 2 drop-in) with the four journey presets, `allowance` income, the shipped rules, `100` servers x 30 weeks (`base`), `40` x 70 weeks (`long`), `300` x 24 weeks for the dungeon-gear question (`q5-*`). Every candidate change is a paired run on the same seeds as `base` (same servers, same dice until a decision differs), so differences of more than about 3 power points on a mean are real; smaller ones are noise.
- **Instrumentation** (copy of the sim, not in the repo): every credit of scrap, shards, glimmer and every gear item is tagged with its source; each day the next gear upgrade and next craft are classified by what blocks them; supplies, workshop jobs, dungeon rooms and journey milestones are counted per week. With all knobs off the copy produces byte-identical journey reports to the repo (checked).
- **The sim never paid the jackpot Essence the worker pays** (`RULES.raid.jackpotEssence` x rank multiplier on a 6%-and-pity jackpot; `raid-resolve.ts` credits it, `raid.ts` only counts it). All runs here switch it on (`jackpotEssence`); a run with it off (`nojackpot`) differs by at most 6 power points (1.5%), so earlier reports are not wrong in substance, but the jackpot is about 15 to 25% of the weekly Essence of a committed player, so Essence held is low in them. **Worth fixing in the sim.**
- **Presets are guesses** (docs/design/player-journey-sim.md). Two dials decide a lot here: regulars work the gear on 10% of check-ins and drop-ins on 0%; both train "whatever they fancy" (`spread`, a uniform random trainable creature, which is pessimistic), engaged train the top 6, not the top 3.
- **Sim policy artefacts that look like economy facts.** (1) The workshop spends scrap on crafts first (enchant, improve, craft, then supplies), so scrap held sits near 4 for committed players and **supplies are never crafted** in the shipped policy; (2) players dismantle every unworn item beyond 2 spares; (3) equipping and upgrading score items by Attack and HP power with role weights, and skip an upgrade that adds nothing under the caps.
- **The raid will move** (another agent retunes it tonight). Essence from raids falls as finale wins fall in these runs (min-maxer raid Essence 83 a week at week 4, 31 at week 30), so Essence numbers after week 8 move with that retune. Raid power below means team power (the 3 strongest creatures, gear included), not win rate.
- The game's 13:37 reset, real attention patterns and trading are not modelled; expedition uptime and supply spending are per check-in.

## 1. Scrap and gear

### 1a. Scrap income by source (per player per week, `base`)

**min-maxer**

| Week | Total | 12 h trips | 24 h trips | Push-on goals (6 h/2 h trips) | Salvage (circular) | Raid phases | Dungeon (rooms, streak) | Rank gifts, dup blueprints, welcome | Spent | Held (end of week) |
| ---- | ----- | ---------- | ---------- | ----------------------------- | ------------------ | ----------- | ----------------------- | ----------------------------------- | ----- | ------------------ |
| 1    | 52.5  | 23.0       | 0          | 0                             | 4.7                | 0.5         | 5.3                     | 19.0                                | 48.0  | 4.5                |
| 2    | 83.6  | 28.0       | 0          | 0                             | 24.5               | 3.4         | 8.8                     | 19.0                                | 84.1  | 4.0                |
| 4    | 95.3  | 42.1       | 0          | 0                             | 25.5               | 4.5         | 4.8                     | 18.5                                | 94.9  | 3.5                |
| 8    | 127.5 | 0.2        | 71.2       | 0                             | 34.6               | 2.7         | 3.0                     | 15.7                                | 128.0 | 3.9                |
| 12   | 144.4 | 0          | 71.1       | 8.8                           | 51.1               | 2.5         | 2.2                     | 8.6                                 | 144.2 | 4.6                |
| 20   | 224.6 | 0          | 105.3      | 14.7                          | 79.3               | 1.8         | 2.1                     | 21.4                                | 224.8 | 4.4                |
| 30   | 236.6 | 0          | 113.7      | 17.3                          | 83.5               | 1.2         | 2.2                     | 18.6                                | 237.3 | 4.3                |

**engaged**

| Week | Total | 12 h trips | 24 h trips | Push-on goals (6 h/2 h trips) | Salvage (circular) | Raid phases | Dungeon (rooms, streak) | Rank gifts, dup blueprints, welcome | Spent | Held (end of week) |
| ---- | ----- | ---------- | ---------- | ----------------------------- | ------------------ | ----------- | ----------------------- | ----------------------------------- | ----- | ------------------ |
| 1    | 35.4  | 10.0       | 0          | 3.2                           | 0.9                | 0.5         | 5.3                     | 15.5                                | 28.1  | 7.3                |
| 2    | 46.4  | 13.7       | 0          | 4.1                           | 13.0               | 3.4         | 8.3                     | 3.8                                 | 42.2  | 11.5               |
| 4    | 50.8  | 13.7       | 0          | 5.1                           | 15.5               | 4.5         | 3.9                     | 8.1                                 | 52.7  | 11.6               |
| 8    | 60.8  | 20.8       | 0          | 8.5                           | 17.1               | 2.7         | 2.5                     | 9.1                                 | 61.7  | 11.4               |
| 12   | 107.5 | 4.4        | 51.3       | 2.2                           | 31.7               | 2.5         | 2.5                     | 12.9                                | 103.3 | 18.5               |
| 20   | 180.3 | 0          | 84.9       | 10.6                          | 66.5               | 1.8         | 2.1                     | 14.4                                | 176.2 | 34.7               |
| 30   | 233.9 | 0          | 105.4      | 15.7                          | 86.8               | 1.2         | 2                       | 22.8                                | 230.0 | 52.4               |

**regular**

| Week | Total | 12 h trips | 24 h trips | Push-on goals (6 h/2 h trips) | Salvage (circular) | Raid phases | Dungeon (rooms, streak) | Rank gifts, dup blueprints, welcome | Spent | Held (end of week) |
| ---- | ----- | ---------- | ---------- | ----------------------------- | ------------------ | ----------- | ----------------------- | ----------------------------------- | ----- | ------------------ |
| 1    | 15.8  | 2.0        | 0          | 0.7                           | 0                  | 0.4         | 1.3                     | 11.4                                | 3.0   | 12.9               |
| 2    | 13.2  | 3.9        | 0          | 1.2                           | 0.1                | 2.8         | 3.4                     | 1.8                                 | 5.5   | 20.6               |
| 4    | 19.4  | 5.0        | 0          | 1.6                           | 3.9                | 3.6         | 3.3                     | 1.9                                 | 9.8   | 40.4               |
| 8    | 18.7  | 5.0        | 0          | 1.8                           | 4.2                | 2.3         | 1.6                     | 3.9                                 | 14.1  | 70.7               |
| 12   | 19.9  | 5.8        | 0          | 1.9                           | 5.1                | 2.2         | 1.5                     | 3.4                                 | 11.1  | 96.3               |
| 20   | 23.6  | 7.6        | 0          | 3                             | 7.1                | 1.4         | 1.3                     | 3.2                                 | 19.7  | 160.9              |
| 30   | 28.2  | 4.7        | 7.6        | 2.3                           | 8.3                | 1.1         | 0.9                     | 3.4                                 | 19.4  | 218.7              |

**drop-in**

| Week | Total | 12 h trips | 24 h trips | Push-on goals (6 h/2 h trips) | Salvage (circular) | Raid phases | Dungeon (rooms, streak) | Rank gifts, dup blueprints, welcome | Spent | Held (end of week) |
| ---- | ----- | ---------- | ---------- | ----------------------------- | ------------------ | ----------- | ----------------------- | ----------------------------------- | ----- | ------------------ |
| 1    | 10.4  | 0.1        | 0          | 0.0                           | 0                  | 0.1         | 0.0                     | 10.1                                | 0     | 10.4               |
| 2    | 2.5   | 0.4        | 0          | 0.1                           | 0                  | 1.4         | 0.1                     | 0.3                                 | 0     | 12.8               |
| 4    | 3.8   | 0.5        | 0          | 0.1                           | 0.0                | 2.3         | 0.7                     | 0.3                                 | 0     | 20.3               |
| 8    | 4.9   | 0.7        | 0          | 0.4                           | 1.3                | 1.2         | 0.9                     | 0.3                                 | 0     | 38.7               |
| 12   | 5.6   | 1.0        | 0          | 0.3                           | 2.1                | 1.2         | 0.7                     | 0.3                                 | 0     | 58.5               |
| 20   | 4.2   | 1          | 0          | 0.3                           | 1.3                | 1.1         | 0.2                     | 0.4                                 | 0     | 92.4               |
| 30   | 3.6   | 0.9        | 0          | 0.3                           | 1.2                | 0.6         | 0.1                     | 0.5                                 | 0     | 132.2              |

Rules behind it: scrap per finished trip is 0 (2 h), 0 (6 h), 1 (12 h), 3 (24 h, needs explorer rank 5); phase 1 and 2 pay 3 and 4 to each participant of a cleared phase; the dungeon pays 1 for a cleared boss room, 2 on a landmark, plus 1 and 1 for the day 3 and day 7 streak. **The 24 h trip is the scrap faucet** (a committed player gets 70 to 115 a week from it once it opens, week 5 to 8); the dungeon is under 3% of scrap after week 4, because depth stalls (section 5).

### 1b. When gear stops improving (worn gear power, Shapley split; `long`, 70 weeks)

| Preset    | Metric           | final (last week) | 50% reached in week | 90% reached in week | 95% reached in week | 99% reached in week |
| --------- | ---------------- | ----------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| min-maxer | p_gear           | 68.1              | 4                   | 11                  | 12                  | 13                  |
| min-maxer | worn_levels_team | 11.7              | 5                   | 9                   | 11                  | 13                  |
| engaged   | p_gear           | 69.4              | 6                   | 17                  | 18                  | 20                  |
| engaged   | worn_levels_team | 11.5              | 6                   | 12                  | 15                  | 21                  |
| regular   | p_gear           | 70.4              | 12                  | 38                  | 46                  | 51                  |
| regular   | worn_levels_team | 11.7              | 9                   | 24                  | 32                  | 50                  |
| drop-in   | p_gear           | 29.8              | 19                  | 56                  | 62                  | 69                  |
| drop-in   | worn_levels_team | 0.0               | 1                   | 1                   | 1                   | 1                   |

**Gear power (Shapley share of team power) by week**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 8.4       | 6.3     | 2.1     | 1.3     |
| 2    | 21.4      | 15.7    | 5.1     | 1.8     |
| 4    | 40.2      | 30.1    | 12.5    | 3.9     |
| 6    | 50.5      | 42.3    | 19.7    | 6.3     |
| 8    | 57.4      | 48.7    | 26.4    | 9.2     |
| 12   | 67.0      | 56.5    | 36.2    | 12.8    |
| 16   | 69.8      | 61.8    | 44.8    | 14.9    |
| 20   | 68.4      | 68.8    | 49.4    | 16.8    |
| 24   | 68.3      | 69.1    | 52.4    | 18.0    |
| 30   | 68.3      | 69.2    | 56.3    | 20.0    |

**Gear power as the full marginal (team power with minus without gear, everything else as is). At the plateau this is 126 of 942 (13%) for min-maxers, matching the 10 to 20% design target; the Shapley split in B-009 gives 7%**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 2    | 33.6      | 24.2    | 6.4     | 2.3     |
| 4    | 68.9      | 48.3    | 17.1    | 5.0     |
| 8    | 106.6     | 84.5    | 40.9    | 12.2    |
| 12   | 120.6     | 102.6   | 59.8    | 18.2    |
| 20   | 125.9     | 126.2   | 85.9    | 26.8    |
| 30   | 126.1     | 127.8   | 100.5   | 33.5    |

**min-maxer: worn items by upgrade level (count of worn items), by rarity, and items/crafts/upgrades per week**

| Week | lv0 | lv1 | lv2 | lv3 | lv4 | lv5 | worn_common | worn_rare | worn_epic | worn_festival | items_got | crafts | upgrades |
| ---- | --- | --- | --- | --- | --- | --- | ----------- | --------- | --------- | ------------- | --------- | ------ | -------- |
| 4    | 0.2 | 0.6 | 1.3 | 0.8 | 0.1 | 0   | 2.1         | 0.6       | 0.2       | 0.2           | 11.0      | 9.3    | 2.3      |
| 8    | 0.0 | 0.1 | 0.4 | 1.0 | 1.3 | 0.2 | 1.9         | 0.6       | 0.2       | 0.2           | 12.9      | 11.8   | 0.7      |
| 12   | 0   | 0.1 | 0.3 | 0.7 | 1.3 | 0.7 | 1.9         | 0.7       | 0.2       | 0.2           | 16.2      | 13.4   | 0.2      |
| 20   | 0   | 0.0 | 0.3 | 0.7 | 1.2 | 0.8 | 1.9         | 0.6       | 0.2       | 0.2           | 21.8      | 18.3   | 0        |
| 30   | 0   | 0.0 | 0.3 | 0.7 | 1.2 | 0.8 | 1.9         | 0.6       | 0.2       | 0.2           | 22.2      | 18.8   | 0        |

**engaged: worn items by upgrade level (count of worn items), by rarity, and items/crafts/upgrades per week**

| Week | lv0 | lv1 | lv2 | lv3 | lv4 | lv5 | worn_common | worn_rare | worn_epic | worn_festival | items_got | crafts | upgrades |
| ---- | --- | --- | --- | --- | --- | --- | ----------- | --------- | --------- | ------------- | --------- | ------ | -------- |
| 4    | 1.1 | 0.9 | 0.7 | 0.2 | 0.0 | 0   | 1.7         | 0.8       | 0.2       | 0.3           | 5.9       | 4.3    | 1.8      |
| 8    | 0.1 | 0.2 | 0.8 | 1.1 | 0.7 | 0.1 | 1.6         | 0.8       | 0.2       | 0.3           | 5.5       | 4.5    | 1.1      |
| 12   | 0.0 | 0.1 | 0.4 | 0.9 | 1.1 | 0.6 | 1.6         | 0.8       | 0.2       | 0.4           | 7.3       | 6.4    | 0.4      |
| 20   | 0.0 | 0.0 | 0.3 | 0.7 | 1.0 | 0.9 | 1.5         | 0.8       | 0.3       | 0.4           | 11.1      | 8.4    | 0.1      |
| 30   | 0   | 0.0 | 0.3 | 0.7 | 1.0 | 0.9 | 1.5         | 0.8       | 0.3       | 0.3           | 12.5      | 9.1    | 0        |

**regular: worn items by upgrade level (count of worn items), by rarity, and items/crafts/upgrades per week**

| Week | lv0 | lv1 | lv2 | lv3 | lv4 | lv5 | worn_common | worn_rare | worn_epic | worn_festival | items_got | crafts | upgrades |
| ---- | --- | --- | --- | --- | --- | --- | ----------- | --------- | --------- | ------------- | --------- | ------ | -------- |
| 4    | 1.9 | 0.6 | 0.3 | 0.1 | 0.0 | 0   | 1.7         | 0.6       | 0.2       | 0.5           | 2.0       | 0.4    | 1.0      |
| 8    | 0.7 | 0.5 | 0.8 | 0.7 | 0.3 | 0.1 | 1.4         | 0.7       | 0.2       | 0.7           | 1.2       | 0.3    | 1.1      |
| 12   | 0.3 | 0.3 | 0.8 | 0.9 | 0.5 | 0.2 | 1.3         | 0.7       | 0.2       | 0.9           | 1.3       | 0.4    | 0.5      |
| 20   | 0.1 | 0.1 | 0.4 | 1.0 | 0.9 | 0.5 | 1.1         | 0.7       | 0.3       | 0.9           | 1.3       | 0.8    | 0.4      |
| 30   | 0.1 | 0.0 | 0.2 | 0.9 | 1.0 | 0.8 | 1.0         | 0.7       | 0.3       | 0.9           | 1.3       | 0.7    | 0.2      |

**Reading:** committed players finish the gear at week 12 (min-maxer) and week 18 to 20 (engaged); regulars are still climbing at week 30 (they upgrade on 10% of check-ins), drop-ins never upgrade (0%) so their gear power (20 at week 30) is rarity luck only. After the plateau **63% of worn items are still commons at week 30** (1.9 of 3 for min-maxers), 7% epic: rarity stops mattering because the caps (Attack +20%, HP +25%) are reached at +3 to +5 for any rarity: a common attack charm is 700 bp on average + 5 x 250 = 1950 of the 2000 cap, an epic has 1050 + 1250 = 2300. Only 0.8 of 3 worn items reach +5 in the base runs; the policy rightly skips upgrades that add nothing. The dropped and crafted items are a treadmill: a min-maxer gets 11 to 22 items a week, of which 1.4 worn items are crafted, 0.8 from the dungeon, 0.7 from finales.

### 1c. What blocks the next upgrade and the next craft (days a week in each state; end-of-day state)

**min-maxer: upgrade ("up\_", worn item) and craft ("cr\_") states, days of 7**

| Week | upgrade: affordable but not done | upgrade: Essence short | upgrade: scrap short | upgrade: both short | upgrade: held back for an evolution | craft: affordable | craft: scrap short | craft: shards short | craft: glimmer short | craft: no blueprint |
| ---- | -------------------------------- | ---------------------- | -------------------- | ------------------- | ----------------------------------- | ----------------- | ------------------ | ------------------- | -------------------- | ------------------- |
| 2    | 0                                | 6.2                    | 0.1                  | 0.5                 | 0.3                                 | 0                 | 7                  | 0                   | 0                    | 0                   |
| 4    | 0                                | 4.8                    | 0.2                  | 2.1                 | 0.0                                 | 0                 | 7                  | 0                   | 0                    | 0                   |
| 8    | 0.3                              | 0.8                    | 2.1                  | 3.8                 | 0                                   | 0                 | 7                  | 0                   | 0                    | 0                   |
| 12   | 0.5                              | 0.1                    | 4.9                  | 1.6                 | 0                                   | 0                 | 7                  | 0                   | 0                    | 0                   |
| 20   | 0.6                              | 0                      | 6.4                  | 0                   | 0                                   | 0                 | 7                  | 0                   | 0                    | 0                   |
| 30   | 0.5                              | 0                      | 6.5                  | 0                   | 0                                   | 0                 | 7                  | 0                   | 0                    | 0                   |

**engaged: upgrade ("up\_", worn item) and craft ("cr\_") states, days of 7**

| Week | upgrade: affordable but not done | upgrade: Essence short | upgrade: scrap short | upgrade: both short | upgrade: held back for an evolution | craft: affordable | craft: scrap short | craft: shards short | craft: glimmer short | craft: no blueprint |
| ---- | -------------------------------- | ---------------------- | -------------------- | ------------------- | ----------------------------------- | ----------------- | ------------------ | ------------------- | -------------------- | ------------------- |
| 2    | 0.3                              | 5.7                    | 0.0                  | 0.6                 | 0.3                                 | 3.2               | 3.8                | 0                   | 0                    | 0                   |
| 4    | 1.2                              | 4.5                    | 0.1                  | 0.9                 | 0.3                                 | 3.1               | 3.9                | 0                   | 0                    | 0                   |
| 8    | 1.3                              | 2.9                    | 0.5                  | 2.4                 | 0.0                                 | 3.0               | 4.0                | 0                   | 0                    | 0                   |
| 12   | 2.7                              | 1.4                    | 1.4                  | 1.4                 | 0                                   | 4.0               | 3.0                | 0                   | 0                    | 0                   |
| 20   | 4.3                              | 0.4                    | 2.0                  | 0.2                 | 0                                   | 4.8               | 2.2                | 0                   | 0                    | 0                   |
| 30   | 5.0                              | 0.0                    | 1.9                  | 0                   | 0                                   | 5.2               | 1.8                | 0                   | 0                    | 0                   |

**regular: upgrade ("up\_", worn item) and craft ("cr\_") states, days of 7**

| Week | upgrade: affordable but not done | upgrade: Essence short | upgrade: scrap short | upgrade: both short | upgrade: held back for an evolution | craft: affordable | craft: scrap short | craft: shards short | craft: glimmer short | craft: no blueprint |
| ---- | -------------------------------- | ---------------------- | -------------------- | ------------------- | ----------------------------------- | ----------------- | ------------------ | ------------------- | -------------------- | ------------------- |
| 2    | 1.7                              | 5.0                    | 0.0                  | 0.1                 | 0.2                                 | 5.6               | 1.4                | 0                   | 0                    | 0                   |
| 4    | 5.2                              | 0.9                    | 0.0                  | 0.0                 | 0.8                                 | 6.6               | 0.4                | 0                   | 0                    | 0                   |
| 8    | 4.3                              | 1.6                    | 0.0                  | 0.0                 | 1.0                                 | 6.9               | 0.1                | 0                   | 0                    | 0                   |
| 12   | 3.2                              | 2.9                    | 0.0                  | 0.1                 | 0.8                                 | 6.9               | 0.1                | 0                   | 0                    | 0                   |
| 20   | 4.4                              | 2.5                    | 0.0                  | 0.1                 | 0                                   | 6.9               | 0.1                | 0                   | 0                    | 0                   |
| 30   | 6.4                              | 0.6                    | 0.0                  | 0                   | 0                                   | 7.0               | 0.0                | 0                   | 0                    | 0                   |

**drop-in: upgrade ("up\_", worn item) and craft ("cr\_") states, days of 7**

| Week | upgrade: affordable but not done | upgrade: Essence short | upgrade: scrap short | upgrade: both short | upgrade: held back for an evolution | craft: affordable | craft: scrap short | craft: shards short | craft: glimmer short | craft: no blueprint |
| ---- | -------------------------------- | ---------------------- | -------------------- | ------------------- | ----------------------------------- | ----------------- | ------------------ | ------------------- | -------------------- | ------------------- |
| 2    | 0.9                              | 6.1                    | 0                    | 0                   | 0                                   | 7                 | 0                  | 0                   | 0                    | 0                   |
| 4    | 5.1                              | 1.7                    | 0                    | 0                   | 0.2                                 | 7                 | 0                  | 0                   | 0                    | 0                   |
| 8    | 6.8                              | 0.2                    | 0                    | 0                   | 0.1                                 | 7                 | 0                  | 0                   | 0                    | 0                   |
| 12   | 6.9                              | 0.0                    | 0                    | 0                   | 0.1                                 | 7                 | 0                  | 0                   | 0                    | 0                   |
| 20   | 6.9                              | 0.1                    | 0                    | 0                   | 0.0                                 | 7                 | 0                  | 0                   | 0                    | 0                   |
| 30   | 7                                | 0                      | 0                    | 0                   | 0                                   | 7                 | 0                  | 0                   | 0                    | 0                   |

**Reading:** the first 6 to 8 weeks are blocked on **Essence** (min-maxer: Essence short on 6.6, 6.2, 5.6, 4.8 days of 7 in weeks 1 to 4; engaged 5.8 to 4.5; a full +5 on three common items is 750 Essence, rare 1125, epic 1500). Scrap is short from week 8 for min-maxers (5 to 6 of 7 days after week 12) but that is the crafting policy eating every scrap into commons that are salvaged for 2 (a craft costs 9 scrap, 18 rare, 32 epic and a salvage returns 2, 5, 10): with a rule "do not craft with the scrap the next upgrade needs" (`q1-keep`) scrap is never the limit and gear power moves by +2 at weeks 8 to 12 only (the +25 to +27 team power that run shows for min-maxers at weeks 8 to 12 is a side effect: the saved scrap makes supplies, which saves Bait, see section 2). **Shards, glimmer and blueprints never block a craft or an upgrade** (0 days): the policy always has the cheap common blueprint. Regulars and drop-ins are "affordable" most days: they simply do not spend (profile dial), holding 150 to 390 Essence and 100 to 220 scrap by week 30.

### 1d. Candidate changes (paired against `base`; team power = raid power; values are mean per player, delta in brackets)

**Team power**

| Scenario        | min-maxer w8  | min-maxer w12 | min-maxer w30  | engaged w8    | engaged w12   | engaged w30    | regular w8    | regular w12   | regular w30   |
| --------------- | ------------- | ------------- | -------------- | ------------- | ------------- | -------------- | ------------- | ------------- | ------------- |
| base            | 815.7         | 894.0         | 942.1          | 682.1         | 792.6         | 943.9          | 434.1         | 535.0         | 762.1         |
| q1-dungeon-room | 816.6 (+1.0)  | 898.1 (+4.1)  | 942.9 (+0.8)   | 684.0 (+1.9)  | 794.2 (+1.6)  | 944.2 (+0.3)   | 432.8 (-1.3)  | 533.3 (-1.7)  | 760.9 (-1.2)  |
| q1-dup          | 818.0 (+2.3)  | 895.2 (+1.1)  | 943.3 (+1.3)   | 682.0 (-0.1)  | 792.6 (+0.0)  | 943.9 (+0.0)   | 432.4 (-1.7)  | 537.1 (+2.1)  | 763.3 (+1.2)  |
| q1-keep         | 842.7 (+27.1) | 919.2 (+25.1) | 942.5 (+0.4)   | 682.7 (+0.6)  | 796.4 (+3.8)  | 944.0 (+0.2)   | 429.2 (-4.9)  | 533.0 (-2.0)  | 758.4 (-3.7)  |
| q1-slot2-l15    | 842.7 (+27.0) | 921.9 (+27.8) | 987.3 (+45.2)  | 704.3 (+22.2) | 823.9 (+31.3) | 987.1 (+43.2)  | 441.2 (+7.1)  | 552.4 (+17.3) | 795.7 (+33.6) |
| q1-slot2-evo    | 837.8 (+22.1) | 911.5 (+17.5) | 974.4 (+32.3)  | 703.8 (+21.6) | 823.1 (+30.6) | 974.2 (+30.3)  | 444.6 (+10.5) | 552.5 (+17.5) | 789.5 (+27.4) |
| q1-slot2-l20    | 843.3 (+27.6) | 926.4 (+32.4) | 987.3 (+45.3)  | 699.6 (+17.4) | 824.7 (+32.1) | 987.5 (+43.6)  | 430.5 (-3.6)  | 532.3 (-2.8)  | 792.0 (+29.9) |
| q1-caps30       | 828.2 (+12.6) | 918.8 (+24.7) | 973.9 (+31.8)  | 687.2 (+5.1)  | 808.2 (+15.6) | 975.8 (+32.0)  | 434.7 (+0.6)  | 538.6 (+3.6)  | 783.3 (+21.2) |
| q1-caps25-slot2 | 862.1 (+46.4) | 947.6 (+53.6) | 1014.6 (+72.6) | 714.7 (+32.6) | 842.2 (+49.6) | 1018.0 (+74.1) | 432.1 (-2.0)  | 536.4 (+1.3)  | 812.0 (+49.9) |
| q1-caps30-slot2 | 876.3 (+60.6) | 962.3 (+68.2) | 1026.8 (+84.7) | 727.1 (+44.9) | 854.0 (+61.4) | 1028.1 (+84.3) | 432.2 (-1.8)  | 537.1 (+2.1)  | 821.0 (+58.9) |

**Gear power (Shapley)**

| Scenario        | min-maxer w8 | min-maxer w12 | min-maxer w30 | engaged w8   | engaged w12  | engaged w30   | regular w8  | regular w12  | regular w30  |
| --------------- | ------------ | ------------- | ------------- | ------------ | ------------ | ------------- | ----------- | ------------ | ------------ |
| base            | 57.4         | 67.0          | 68.3          | 48.7         | 56.5         | 69.2          | 26.4        | 36.2         | 56.3         |
| q1-dungeon-room | 57.6 (+0.2)  | 67.4 (+0.4)   | 68.7 (+0.4)   | 49.1 (+0.3)  | 56.4 (-0.1)  | 69.4 (+0.2)   | 25.6 (-0.8) | 35.9 (-0.3)  | 56.0 (-0.4)  |
| q1-dup          | 57.9 (+0.4)  | 66.8 (-0.2)   | 68.9 (+0.6)   | 48.8 (+0.1)  | 56.5 (-0.1)  | 69.2 (+0.0)   | 25.9 (-0.5) | 36.3 (+0.1)  | 56.4 (+0.1)  |
| q1-keep         | 59.6 (+2.2)  | 69.2 (+2.2)   | 68.5 (+0.2)   | 48.2 (-0.5)  | 56.5 (-0.1)  | 69.3 (+0.1)   | 25.8 (-0.5) | 36.2 (-0.0)  | 56.0 (-0.4)  |
| q1-slot2-l15    | 70.8 (+13.4) | 84.0 (+17.1)  | 92.9 (+24.6)  | 61.8 (+13.1) | 73.8 (+17.3) | 92.8 (+23.6)  | 32.3 (+6.0) | 46.9 (+10.6) | 75.5 (+19.2) |
| q1-slot2-evo    | 67.4 (+10.0) | 76 (+9.0)     | 84.9 (+16.6)  | 59.9 (+11.2) | 71.5 (+15.0) | 84.7 (+15.5)  | 32.1 (+5.8) | 46.0 (+9.8)  | 71.8 (+15.5) |
| q1-slot2-l20    | 71.9 (+14.5) | 85.9 (+18.9)  | 92.9 (+24.6)  | 59.0 (+10.3) | 74 (+17.5)   | 93.0 (+23.8)  | 25.8 (-0.6) | 36.5 (+0.3)  | 73.1 (+16.8) |
| q1-caps30       | 63.0 (+5.5)  | 79.1 (+12.1)  | 85.1 (+16.8)  | 51.5 (+2.8)  | 64.4 (+7.9)  | 86.0 (+16.8)  | 26.4 (+0.0) | 37.1 (+0.9)  | 67.0 (+10.6) |
| q1-caps25-slot2 | 81.5 (+24.0) | 96.6 (+29.6)  | 107.3 (+38.9) | 67.6 (+18.9) | 83.0 (+26.5) | 109.1 (+39.9) | 26.4 (+0.0) | 38.4 (+2.2)  | 83.7 (+27.3) |
| q1-caps30-slot2 | 89.6 (+32.1) | 104.6 (+37.6) | 113.6 (+45.3) | 74.8 (+26.1) | 90.3 (+33.8) | 114.4 (+45.2) | 26.7 (+0.4) | 39.0 (+2.7)  | 90.6 (+34.3) |

**Gear power (full marginal)**

| Scenario        | min-maxer w12 | min-maxer w30 | engaged w12   | engaged w30   |
| --------------- | ------------- | ------------- | ------------- | ------------- |
| base            | 120.6         | 126.1         | 102.6         | 127.8         |
| q1-slot2-l20    | 154.4 (+33.8) | 171.3 (+45.3) | 134.4 (+31.8) | 171.5 (+43.6) |
| q1-caps30       | 143.6 (+23.0) | 157.9 (+31.8) | 118.2 (+15.5) | 159.8 (+32.0) |
| q1-caps30-slot2 | 188.9 (+68.3) | 210.8 (+84.7) | 164.5 (+61.8) | 212.1 (+84.3) |

Definitions:

- `q1-dungeon-room`: +floor(depth / 5) scrap for every room cleared (partial clears pay too).
- `q1-dup`: 1 / 2 / 4 scrap (common / rare / epic) for every duplicate creature catch.
- `q1-keep`: the workshop does not craft with the scrap the next upgrade needs (policy, not a rule change).
- `q1-slot2-l15`, `-l20`, `-evo`: a second gear slot per creature, unlocked at creature level 15 or 20, or on evolution; bonuses of the two items add up before the existing caps; the equip and upgrade policy is cap-aware.
- `q1-caps30`: caps raised to Attack +30% and HP +35% (from 20 and 25), one slot. `q1-caps25-slot2`: +25 / +30 with a second slot at level 20; `q1-caps30-slot2`: +30 / +35 with it.

**min-maxer with second slot (level 20) and caps 30/35: worn items (of 6) and gear share**

| Week | worn_common | worn_rare | worn_epic | worn_festival | lv5 | gear_power_sum | power  |
| ---- | ----------- | --------- | --------- | ------------- | --- | -------------- | ------ |
| 8    | 3.5         | 1.6       | 0.3       | 0.6           | 0   | 166.1          | 876.3  |
| 12   | 2.9         | 1.9       | 0.5       | 0.7           | 0.1 | 188.9          | 962.3  |
| 20   | 1.9         | 2.5       | 0.8       | 0.8           | 1.0 | 206.2          | 1020.8 |
| 30   | 1.9         | 2.4       | 1.0       | 0.7           | 1.4 | 210.8          | 1026.8 |

| Preset (second slot at level 20) | Metric | final (last week) | 90% reached in week | 95% reached in week |
| -------------------------------- | ------ | ----------------- | ------------------- | ------------------- |
| min-maxer                        | p_gear | 92.9              | 12                  | 13                  |
| engaged                          | p_gear | 93.0              | 17                  | 18                  |
| regular                          | p_gear | 73.1              | 26                  | 28                  |
| drop-in                          | p_gear | 24.7              | 28                  | 29                  |

**Reading:** more scrap does nothing (dungeon and duplicate scrap move power by under 2 points: scrap is not the binding input). A second gear slot adds +24 gear power (Shapley) and **+45 team power (+4.8%) at the ceiling** for min-maxers and engaged, +30 power (+17 gear) for regulars by week 30, but moves the gear plateau week by at most one week (95% of final gear power: week 12 to 13 for min-maxers, 18 to 18 for engaged): the slot fills as soon as Essence allows, so it raises the ceiling, not the time to reach it. Raising the caps is what lets levels and rarity matter again: caps 30/35 take worn +5 items from 0.8 to 3.0 of 3 (one slot), and with the second slot worn commons fall from 63% to 32% of items and epics rise from 7% to 17%. A slot at level 15 or on evolution reaches regulars sooner: +17 power at week 12 for regulars (against -3 with level 20, which they reach after week 20) and +24 or +17 at week 30 for drop-ins.

## 2. Supplies and crafting agency

**Supplies used on trips per week (bought + found + crafted)**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 12.1      | 5.2     | 0.5     | 0.0     |
| 2    | 16.4      | 7.1     | 1.5     | 0.1     |
| 4    | 31.6      | 8.1     | 1.8     | 0.1     |
| 8    | 30.9      | 18.1    | 1.8     | 0.2     |
| 12   | 31.1      | 18.9    | 2.2     | 0.3     |
| 20   | 48.8      | 32.8    | 2.9     | 0.3     |
| 30   | 56        | 51.9    | 3.3     | 0.3     |

**Supplies bought with Bait per week**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 4.8       | 1.1     | 0       | 0       |
| 2    | 7.1       | 1.5     | 0       | 0       |
| 4    | 17.8      | 2.5     | 0       | 0       |
| 8    | 19.9      | 9.1     | 0       | 0       |
| 12   | 17.7      | 9.4     | 0       | 0       |
| 20   | 26.3      | 15.7    | 0       | 0       |
| 30   | 35.3      | 30.8    | 0.1     | 0       |

**Bait spent on supplies per week**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 66.4      | 15.1    | 0       | 0       |
| 2    | 98.9      | 20.7    | 0       | 0       |
| 4    | 249       | 33.4    | 0       | 0       |
| 8    | 273.8     | 125.4   | 0       | 0       |
| 12   | 243.9     | 130.9   | 0       | 0       |
| 20   | 363.4     | 217.7   | 0       | 0       |
| 30   | 483.4     | 420.5   | 1.4     | 0       |

**Supplies found on trips per week**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 7.2       | 4.1     | 0.7     | 0.0     |
| 2    | 9.3       | 5.5     | 1.6     | 0.1     |
| 4    | 13.9      | 5.6     | 1.9     | 0.2     |
| 8    | 11.1      | 9.1     | 1.8     | 0.2     |
| 12   | 13.1      | 9.5     | 2.4     | 0.4     |
| 20   | 19.0      | 15.3    | 2.9     | 0.4     |
| 30   | 19.4      | 18.2    | 3.1     | 0.4     |

**Supplies crafted per week, shipped workshop policy (always 0: crafts and upgrades take the scrap first)**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 0         | 0       | 0       | 0       |
| 2    | 0         | 0       | 0       | 0       |
| 4    | 0         | 0       | 0       | 0       |
| 8    | 0         | 0       | 0       | 0       |
| 12   | 0         | 0       | 0       | 0       |
| 20   | 0         | 0       | 0       | 0       |
| 30   | 0         | 0       | 0       | 0       |

**Supplies crafted per week if the workshop makes supplies before gear (`q2-supplyfirst`, stock target 6)**

| Scenario       | min-maxer w1 | min-maxer w2 | min-maxer w4 | min-maxer w8 | min-maxer w12 | min-maxer w20 | engaged w1 | engaged w2 | engaged w4 | engaged w8 | engaged w12 | engaged w20  | regular w1 | regular w2 | regular w4 | regular w8 | regular w12 | regular w20 |
| -------------- | ------------ | ------------ | ------------ | ------------ | ------------- | ------------- | ---------- | ---------- | ---------- | ---------- | ----------- | ------------ | ---------- | ---------- | ---------- | ---------- | ----------- | ----------- |
| base           | 0            | 0            | 0            | 0            | 0             | 0             | 0          | 0          | 0          | 0          | 0           | 0            | 0          | 0          | 0          | 0          | 0           | 0           |
| q2-supplyfirst | 1.3 (+1.3)   | 4.5 (+4.5)   | 6.1 (+6.1)   | 8.8 (+8.8)   | 10.7 (+10.7)  | 18.8 (+18.8)  | 2.8 (+2.8) | 5.0 (+5.0) | 6.9 (+6.9) | 7.1 (+7.1) | 9.8 (+9.8)  | 10.9 (+10.9) | 0.2 (+0.2) | 0.5 (+0.5) | 0.4 (+0.4) | 0.3 (+0.3) | 0.4 (+0.4)  | 0.7 (+0.7)  |

**Best Crafting level, same run**

| Scenario       | min-maxer w2 | min-maxer w4 | min-maxer w8 | min-maxer w12 | min-maxer w20 | engaged w2 | engaged w4 | engaged w8 | engaged w12 | engaged w20 | regular w2 | regular w4 | regular w8 | regular w12 | regular w20 |
| -------------- | ------------ | ------------ | ------------ | ------------- | ------------- | ---------- | ---------- | ---------- | ----------- | ----------- | ---------- | ---------- | ---------- | ----------- | ----------- |
| base           | 4.2          | 6.0          | 8.0          | 9.1           | 10            | 2.8        | 4.4        | 6.3        | 7.5         | 9.6         | 1          | 1.1        | 1.9        | 2.5         | 3.8         |
| q2-supplyfirst | 4.0 (-0.2)   | 5.9 (-0.2)   | 7.4 (-0.6)   | 8.6 (-0.5)    | 10 (+0)       | 2.5 (-0.2) | 4.2 (-0.2) | 6 (-0.3)   | 7.0 (-0.5)  | 8.5 (-1.1)  | 1 (+0)     | 1.1 (-0.1) | 1.6 (-0.3) | 2.1 (-0.3)  | 3 (-0.8)    |

### What supplies do to outcomes (paired runs)

**Team power**

| Scenario       | min-maxer w4  | min-maxer w6  | min-maxer w8  | min-maxer w12 | min-maxer w20 | engaged w4    | engaged w6    | engaged w8    | engaged w12   | engaged w20  | regular w4   | regular w6   | regular w8   | regular w12  | regular w20  |
| -------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------ | ------------ | ------------ | ------------ | ------------ | ------------ |
| base           | 623.0         | 723.1         | 815.7         | 894.0         | 941.0         | 531.2         | 619.8         | 682.1         | 792.6         | 938.8        | 305.2        | 371.6        | 434.1        | 535.0        | 672.6        |
| q2-nosupplies  | 669.6 (+46.6) | 811.7 (+88.6) | 853.6 (+38.0) | 917.6 (+23.6) | 942.9 (+1.9)  | 522.6 (-8.6)  | 627.9 (+8.1)  | 705.5 (+23.4) | 826.8 (+34.2) | 938.4 (-0.4) | 304.5 (-0.7) | 373.5 (+1.9) | 433.5 (-0.6) | 536.8 (+1.8) | 670.5 (-2.0) |
| q2-nobuy       | 677.1 (+54.2) | 819.7 (+96.6) | 852.4 (+36.7) | 926.3 (+32.3) | 942.8 (+1.8)  | 532.2 (+1.0)  | 638.8 (+19.1) | 714.9 (+32.7) | 842.9 (+50.3) | 942.0 (+3.2) | 307.8 (+2.6) | 375.1 (+3.5) | 436.5 (+2.4) | 536.3 (+1.2) | 671.4 (-1.2) |
| q2-nobuy-craft | 678.9 (+55.9) | 818.7 (+95.6) | 854.1 (+38.5) | 927.6 (+33.6) | 942.3 (+1.3)  | 547.7 (+16.5) | 649.2 (+29.5) | 728.2 (+46.1) | 862.7 (+70.1) | 943.4 (+4.6) | 306.9 (+1.7) | 372.2 (+0.5) | 435.6 (+1.5) | 537.6 (+2.6) | 672.0 (-0.6) |
| q2-supplyfirst | 632.1 (+9.2)  | 734.6 (+11.5) | 835.6 (+19.9) | 916.2 (+22.1) | 942.0 (+1.1)  | 539.7 (+8.5)  | 626.6 (+6.9)  | 693.8 (+11.7) | 814.5 (+21.9) | 941.6 (+2.8) | 305.4 (+0.2) | 371.4 (-0.3) | 430.7 (-3.4) | 533.7 (-1.4) | 672.2 (-0.4) |

**Catch rolls per week on trips**

| Scenario      | min-maxer w4 | min-maxer w8 | min-maxer w12 | engaged w4  | engaged w8  | engaged w12  |
| ------------- | ------------ | ------------ | ------------- | ----------- | ----------- | ------------ |
| base          | 65.6         | 62.2         | 62.5          | 20.5        | 32.7        | 49.8         |
| q2-nosupplies | 49.9 (-15.8) | 45.7 (-16.4) | 47.4 (-15.1)  | 18.0 (-2.5) | 23.8 (-8.9) | 38.4 (-11.4) |
| q2-nobuy      | 53.9 (-11.7) | 48.8 (-13.3) | 51.3 (-11.2)  | 19.4 (-1.1) | 26.5 (-6.2) | 42.5 (-7.3)  |

**Creatures owned (14 is the whole collection)**

| Scenario      | min-maxer w2 | min-maxer w4 | min-maxer w6 | min-maxer w8 | min-maxer w12 | engaged w2 | engaged w4  | engaged w6  | engaged w8  | engaged w12 | regular w2 | regular w4 | regular w6  | regular w8  | regular w12 |
| ------------- | ------------ | ------------ | ------------ | ------------ | ------------- | ---------- | ----------- | ----------- | ----------- | ----------- | ---------- | ---------- | ----------- | ----------- | ----------- |
| base          | 10.8         | 12.8         | 13.9         | 14           | 14            | 9.7        | 11.5        | 12.5        | 13.3        | 14.0        | 4.9        | 8.2        | 10.1        | 11.1        | 12.0        |
| q2-nosupplies | 10.5 (-0.3)  | 12.3 (-0.4)  | 13.7 (-0.3)  | 14.0 (-0.0)  | 14 (+0)       | 9.2 (-0.4) | 11.2 (-0.3) | 12.1 (-0.4) | 12.8 (-0.5) | 13.8 (-0.1) | 5.0 (+0.1) | 8.0 (-0.2) | 9.7 (-0.3)  | 10.8 (-0.3) | 11.7 (-0.3) |
| q2-nobuy      | 10.7 (-0.1)  | 12.8 (+0)    | 13.8 (-0.2)  | 14.0 (-0.0)  | 14 (+0)       | 9.5 (-0.2) | 11.4 (-0.1) | 12.3 (-0.1) | 13.3 (-0.0) | 14.0 (+0)   | 5.0 (+0.1) | 8.3 (+0.1) | 10.1 (+0.0) | 11.2 (+0.1) | 12.1 (+0.0) |

**Bait from converted duplicates per week**

| Scenario      | min-maxer w4  | min-maxer w8  | min-maxer w12  | engaged w4  | engaged w8   | engaged w12   |
| ------------- | ------------- | ------------- | -------------- | ----------- | ------------ | ------------- |
| base          | 230.7         | 296.3         | 383.8          | 43.5        | 121.2        | 221.3         |
| q2-nosupplies | 154.1 (-76.5) | 202.4 (-93.8) | 241.4 (-142.3) | 35.7 (-7.8) | 80.8 (-40.3) | 159.4 (-61.9) |
| q2-nobuy      | 179.7 (-50.9) | 228.0 (-68.2) | 292.2 (-91.6)  | 40.3 (-3.2) | 95.1 (-26.1) | 183.2 (-38.0) |

**Bait spent on training per week**

| Scenario      | min-maxer w4   | min-maxer w8   | min-maxer w12  | engaged w4    | engaged w8    | engaged w12   |
| ------------- | -------------- | -------------- | -------------- | ------------- | ------------- | ------------- |
| base          | 338.9          | 370.1          | 485.3          | 327.8         | 313.2         | 404.2         |
| q2-nosupplies | 512.6 (+173.7) | 549.8 (+179.7) | 570.6 (+85.3)  | 353.0 (+25.2) | 396.6 (+83.4) | 471.2 (+67.0) |
| q2-nobuy      | 535.7 (+196.8) | 582.2 (+212.0) | 634.3 (+149.0) | 357.6 (+29.8) | 410.4 (+97.2) | 495.2 (+91.0) |

Definitions: `q2-nosupplies` removes supplies altogether (bought, found, crafted); `q2-nobuy` sets the supply share of spare Bait to 0 for every player (found and crafted supplies still work); `q2-nobuy-craft` is that plus supply-first crafting.

**Reading.** In the shipped policy nobody crafts a supply in 30 weeks: a basic supply needs 3 scrap and the policy requires 8 scrap in reserve, and every scrap is spent on crafts and upgrades first (the min-maxer holds 4). The limits in the rules are: scrap 3 / 6 / 10 (plus 1 / 3 shards of an element for good / great), Crafting level 1 / 3 / 5 (a creature gains Crafting XP from jobs only, but gear crafting alone takes min-maxers to level 6 by week 4 and 10 by week 20, engaged to 4.4 and 9.6, regulars to 1.1 and 3.8, so the level gate is not the limit except for regulars), a job of 2 / 4 / 6 hours on a creature that is not on a trip, and 2 workshop slots. With supply-first, min-maxers craft 1.3, 4.5, 6, 9, 11, 19 supplies a week at weeks 1, 2, 4, 8, 12, 20 (engaged 3 to 11; regulars 0.2 to 0.8), still limited by scrap: on 37 to 53 of about 56 check-ins a week nothing was affordable.

**Is there a decision?** Today there is hardly one, and the dominant choice is "do not buy". Buying costs a min-maxer 250 to 275 Bait a week at weeks 4 to 8 (the same as 5 to 7 levels). It adds about 16 catch rolls a week (+31%) but the collection is only 14 creatures and is complete at week 6 (min-maxer), 12 (engaged) either way: creatures owned are the same with and without supplies (13.7 against 13.9 at week 6). The extra rolls are duplicates, which convert to 77 to 142 Bait a week, so a supply nets out at about two thirds of its price lost. Not buying (`q2-nobuy`) leaves a min-maxer **+54 power at week 4, +97 at week 6 (+13%)**, engaged +19 at week 6 and +50 at week 12 (+6%), and no difference at the ceiling. Crafting supplies from scrap on top (`q2-nobuy-craft`) adds another +10 to +20 for engaged.

## 3. Essence, shards and glimmer

### 3a. Essence flows per week and held (mean)

**min-maxer: Essence**

| Week | raid stages | jackpot | dungeon | spent on gear | spent on evolution | held   | share signed up |
| ---- | ----------- | ------- | ------- | ------------- | ------------------ | ------ | --------------- |
| 2    | 69.4        | 5.2     | 7.8     | 26.2          | 47                 | 15.2   | 1               |
| 4    | 82.9        | 14.9    | 3.8     | 85.4          | 1.2                | 33.3   | 1               |
| 8    | 63.3        | 21.0    | 2.0     | 49.8          | 0                  | 120.3  | 1               |
| 12   | 60.9        | 22.5    | 1.2     | 19.5          | 1.2                | 294.1  | 1               |
| 20   | 39.4        | 6.7     | 1.1     | 0             | 20.8               | 664.8  | 1               |
| 30   | 31.2        | 14.7    | 1.2     | 0             | 0                  | 1138.4 | 1               |

**engaged: Essence**

| Week | raid stages | jackpot | dungeon | spent on gear | spent on evolution | held  | share signed up |
| ---- | ----------- | ------- | ------- | ------------- | ------------------ | ----- | --------------- |
| 2    | 61.4        | 6.8     | 7.3     | 14.0          | 44.4               | 28.4  | 1               |
| 4    | 72.3        | 7.8     | 2.9     | 53.5          | 18.4               | 49.3  | 1               |
| 8    | 56.3        | 16.8    | 1.5     | 65.6          | 0                  | 86.5  | 1               |
| 12   | 55.9        | 18.7    | 1.5     | 31.5          | 0                  | 193.9 | 1               |
| 20   | 38.3        | 9.4     | 1.1     | 10.9          | 5.3                | 505.9 | 1               |
| 30   | 30.7        | 9.8     | 1       | 0             | 0                  | 926.4 | 1               |

**regular: Essence**

| Week | raid stages | jackpot | dungeon | spent on gear | spent on evolution | held  | share signed up |
| ---- | ----------- | ------- | ------- | ------------- | ------------------ | ----- | --------------- |
| 2    | 45.5        | 4.9     | 2.8     | 6.0           | 0.1                | 58.4  | 0.8             |
| 4    | 52.8        | 6.0     | 2.6     | 30.6          | 4.4                | 123.4 | 0.8             |
| 8    | 43.0        | 18.9    | 0.8     | 54.7          | 14.2               | 158.5 | 0.9             |
| 12   | 42.5        | 12.3    | 0.7     | 27.7          | 22.5               | 136.4 | 0.8             |
| 20   | 27.9        | 7.6     | 0.5     | 28.7          | 0.3                | 189.0 | 0.8             |
| 30   | 25.3        | 6.7     | 0.2     | 13.4          | 0                  | 391.9 | 0.9             |

**drop-in: Essence**

| Week | raid stages | jackpot | dungeon | spent on gear | spent on evolution | held  | share signed up |
| ---- | ----------- | ------- | ------- | ------------- | ------------------ | ----- | --------------- |
| 2    | 21.5        | 2.9     | 0.1     | 0             | 0                  | 28.4  | 0.5             |
| 4    | 29.4        | 4.4     | 0.7     | 0             | 0                  | 90.3  | 0.6             |
| 8    | 20.6        | 5.2     | 0.9     | 0             | 1.8                | 220.4 | 0.5             |
| 12   | 21.7        | 2.9     | 0.7     | 0             | 4.5                | 314.1 | 0.5             |
| 20   | 19.7        | 3.7     | 0.2     | 0             | 3.7                | 464.2 | 0.6             |
| 30   | 14.2        | 3.9     | 0.1     | 0             | 2.5                | 660.5 | 0.5             |

### 3b. Net accumulation per week (change in held, per week, `base`)

| Currency | Preset    | w1-4 | w4-8 | w8-12 | w12-20 | w20-30 |
| -------- | --------- | ---- | ---- | ----- | ------ | ------ |
| Essence  | min-maxer | 9.1  | 21.8 | 43.4  | 46.3   | 47.4   |
| Essence  | engaged   | 12.7 | 9.3  | 26.8  | 39.0   | 42.0   |
| Essence  | regular   | 37.4 | 8.8  | -5.5  | 6.6    | 20.3   |
| Essence  | drop-in   | 28.8 | 32.5 | 23.4  | 18.8   | 19.6   |
| Shards   | min-maxer | 5.7  | 9.8  | 11.9  | 17.7   | 20.3   |
| Shards   | engaged   | 2.0  | 3.4  | 5.9   | 11.3   | 16.5   |
| Shards   | regular   | 1.8  | 0.8  | 0.8   | 1.4    | 1.9    |
| Shards   | drop-in   | 0.3  | 0.6  | 0.6   | 0.5    | 0.4    |
| Glimmer  | min-maxer | 0.7  | 3.0  | 4.3   | 6.1    | 5.5    |
| Glimmer  | engaged   | 0.2  | 0.5  | 1.5   | 4.3    | 5.3    |
| Glimmer  | regular   | 0.3  | -0.0 | 0.1   | 0.3    | 0.4    |
| Glimmer  | drop-in   | 0.0  | 0.1  | 0.2   | 0.1    | 0.1    |
| Scrap    | min-maxer | -0.3 | 0.1  | 0.2   | -0.0   | -0.0   |
| Scrap    | engaged   | 1.4  | -0.0 | 1.8   | 2.0    | 1.8    |
| Scrap    | regular   | 9.2  | 7.6  | 6.4   | 8.1    | 5.8    |
| Scrap    | drop-in   | 3.3  | 4.6  | 5.0   | 4.2    | 4.0    |
| Bait     | min-maxer | 6.1  | 3.2  | -3.9  | 0.6    | 471.4  |
| Bait     | engaged   | 1.7  | 2.5  | -0.3  | -0.7   | 238.5  |
| Bait     | regular   | -0.8 | 0.2  | 0.5   | 0.5    | 0.5    |
| Bait     | drop-in   | -0.0 | -0.2 | -0.1  | -0.2   | 0.1    |

### 3c. Shards and glimmer: income, spend, held (per week, mean)

**min-maxer**

| Week | shards in | shards spent | shards held | glimmer in | glimmer spent | glimmer held |
| ---- | --------- | ------------ | ----------- | ---------- | ------------- | ------------ |
| 2    | 8.0       | 5.2          | 8.5         | 2.1        | 1.7           | 0.7          |
| 4    | 9.4       | 1.4          | 22.9        | 1.7        | 0.5           | 2.4          |
| 8    | 13.2      | 1.7          | 62.2        | 4.8        | 0.1           | 14.5         |
| 12   | 15.1      | 2.3          | 110.0       | 2.9        | 0             | 31.7         |
| 20   | 25.9      | 6.4          | 251.3       | 6.6        | 0.5           | 80.9         |
| 30   | 26.6      | 7.2          | 454.8       | 5.7        | 0.8           | 135.6        |

**engaged**

| Week | shards in | shards spent | shards held | glimmer in | glimmer spent | glimmer held |
| ---- | --------- | ------------ | ----------- | ---------- | ------------- | ------------ |
| 2    | 5.1       | 3.2          | 6.2         | 1.5        | 1.0           | 0.7          |
| 4    | 3.8       | 2.3          | 10.2        | 0.8        | 0.7           | 0.8          |
| 8    | 5.5       | 1.6          | 23.9        | 0.8        | 0.2           | 2.9          |
| 12   | 13.4      | 4.0          | 47.6        | 3.7        | 0.5           | 9.0          |
| 20   | 24.1      | 9.4          | 137.9       | 7.0        | 2.9           | 43.8         |
| 30   | 31.1      | 13.3         | 302.6       | 11.9       | 5.6           | 96.9         |

**regular**

| Week | shards in | shards spent | shards held | glimmer in | glimmer spent | glimmer held |
| ---- | --------- | ------------ | ----------- | ---------- | ------------- | ------------ |
| 2    | 2.2       | 0.0          | 3.2         | 0.1        | 0.0           | 0.2          |
| 4    | 1.9       | 0.6          | 6.6         | 0.7        | 0.2           | 1.1          |
| 8    | 1.6       | 1.0          | 9.7         | 0.3        | 0.3           | 1.0          |
| 12   | 1.7       | 0.8          | 12.9        | 0.5        | 0.2           | 1.4          |
| 20   | 2.6       | 1.0          | 24.2        | 0.5        | 0.2           | 3.8          |
| 30   | 3.3       | 1.0          | 42.9        | 1.0        | 0.3           | 8.2          |

### 3d. Candidate sink that works on the real bottleneck: Essence pays part of a training level

**Team power (`etrain1`: 1 Essence = 1 Bait, `etrain2`: 1 Essence = 2 Bait; a player keeps 60 Essence for evolutions and gear)**

| Scenario   | min-maxer w4 | min-maxer w8  | min-maxer w12 | min-maxer w20 | min-maxer w30 | engaged w4   | engaged w8    | engaged w12   | engaged w20  | engaged w30  | regular w4    | regular w8    | regular w12   | regular w20   | regular w30   | drop-in w4    | drop-in w8    | drop-in w12   | drop-in w20   | drop-in w30    |
| ---------- | ------------ | ------------- | ------------- | ------------- | ------------- | ------------ | ------------- | ------------- | ------------ | ------------ | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- | -------------- |
| base       | 623.0        | 815.7         | 894.0         | 941.0         | 942.1         | 531.2        | 682.1         | 792.6         | 938.8        | 943.9        | 305.2         | 434.1         | 535.0         | 672.6         | 762.1         | 161.5         | 255.5         | 324.3         | 418.2         | 483.6          |
| q3-etrain1 | 627.3 (+4.3) | 828.4 (+12.8) | 906 (+12.0)   | 941.9 (+1.0)  | 942.5 (+0.4)  | 533.8 (+2.6) | 693.4 (+11.3) | 813.5 (+20.9) | 940.7 (+1.9) | 943.6 (-0.3) | 317.7 (+12.5) | 463.4 (+29.4) | 564.9 (+29.8) | 701.5 (+28.9) | 798.3 (+36.2) | 166.4 (+4.9)  | 295.8 (+40.3) | 377.5 (+53.2) | 463.6 (+45.5) | 537.8 (+54.2)  |
| q3-etrain2 | 629.8 (+6.9) | 833.5 (+17.9) | 917 (+23.0)   | 942.1 (+1.1)  | 942.4 (+0.4)  | 534.0 (+2.8) | 702.3 (+20.2) | 829.9 (+37.3) | 941.9 (+3.1) | 943.7 (-0.1) | 329.1 (+23.9) | 493.8 (+59.8) | 598.5 (+63.5) | 739.0 (+66.4) | 836.7 (+74.6) | 179.2 (+17.7) | 328.3 (+72.8) | 412.1 (+87.9) | 506.1 (+88.0) | 590.0 (+106.4) |

**Essence held**

| Scenario   | min-maxer w8 | min-maxer w12 | min-maxer w30  | engaged w8   | engaged w12   | engaged w30    | regular w8    | regular w12  | regular w30   | drop-in w8    | drop-in w12   | drop-in w30   |
| ---------- | ------------ | ------------- | -------------- | ------------ | ------------- | -------------- | ------------- | ------------ | ------------- | ------------- | ------------- | ------------- |
| base       | 120.3        | 294.1         | 1138.4         | 86.5         | 193.9         | 926.4          | 158.5         | 136.4        | 391.9         | 220.4         | 314.1         | 660.5         |
| q3-etrain1 | 57.4 (-62.9) | 63.0 (-231.1) | 472.1 (-666.4) | 49.6 (-36.9) | 61.7 (-132.2) | 306.9 (-619.4) | 59.4 (-99.1)  | 52.6 (-83.8) | 58.3 (-333.6) | 73.6 (-146.8) | 67.6 (-246.5) | 60.1 (-600.4) |
| q3-etrain2 | 57.2 (-63.2) | 59.5 (-234.5) | 531.5 (-607.0) | 50.4 (-36.2) | 56.0 (-137.9) | 358.5 (-567.9) | 54.3 (-104.2) | 55.3 (-81.2) | 58.0 (-333.9) | 70.0 (-150.4) | 65.9 (-248.3) | 59.2 (-601.3) |

**Gear power (Essence is diverted from upgrades)**

| Scenario   | min-maxer w8 | min-maxer w12 | min-maxer w30 | engaged w8  | engaged w12 | engaged w30 | regular w8  | regular w12 | regular w30 | drop-in w8  | drop-in w12 | drop-in w30 |
| ---------- | ------------ | ------------- | ------------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| base       | 57.4         | 67.0          | 68.3          | 48.7        | 56.5        | 69.2        | 26.4        | 36.2        | 56.3        | 9.2         | 12.8        | 20.0        |
| q3-etrain1 | 58.2 (+0.8)  | 68.1 (+1.1)   | 68.6 (+0.3)   | 48.5 (-0.2) | 56.8 (+0.2) | 69.0 (-0.2) | 23.5 (-2.9) | 32.4 (-3.8) | 54.5 (-1.9) | 9.9 (+0.8)  | 14.2 (+1.3) | 21.8 (+1.8) |
| q3-etrain2 | 58.4 (+1.0)  | 68.9 (+1.9)   | 68.5 (+0.2)   | 48.8 (+0.1) | 57.2 (+0.7) | 69.1 (-0.1) | 24.0 (-2.3) | 33.7 (-2.5) | 56.0 (-0.4) | 11.0 (+1.8) | 14.9 (+2.1) | 23.6 (+3.6) |

**Reading.** Essence is spent on exactly two things (evolution: 20 or 40, and gear upgrades), so it piles up everywhere once those are done: surplus per week of +43 to +47 for min-maxers from week 8, +27 to +42 for engaged, +19 to +33 for drop-ins from the start (who evolve late and never upgrade), -6 to +37 for regulars; held at week 30: 1138, 926, 392, 661. Shards (+12 to +20 a week for committed players, 1 to 2 for the others; 455 held at week 30 for min-maxers) are spent only on crafts and enchants: 1 to 7 a week. Glimmer (+4 to +6 a week committed, 0.1 to 0.4 others) is spent at 0 to 1 a week by min-maxers and up to 6 by engaged at week 30 (epic crafts): enchants are one per item, so 3 glimmer and 9 shards pay for all of them. Sink sizing: **Essence -> training absorbs the whole surplus of the casual presets and is the only candidate that touches their binding limit (Bait, 98 to 100% of their days)**: 1:1 gives regulars +30 power (+7%) and drop-ins +40 to +54 (+16% at week 8); 1:2 gives regulars +60 to +75 and drop-ins +73 to +106 (+28% at week 8) and costs gear power (-2 to -4 for regulars). It does little for committed players (+11 to +37 at weeks 8 to 12) because they need the Essence for gear. Sinks for committed players must absorb about 45 Essence, 15 to 20 shards and 5 glimmer a week; a gear affix re-roll at 25 Essence, one shard and no glimmer is about 2 re-rolls a week; a respec or cosmetic at 10 glimmer is affordable every 2 weeks by committed players and never by regulars (0.3 a week), so price glimmer sinks at 3 to 5 if regulars should reach them.

## 4. Levels and caps

**Highest creature level**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 14.8      | 15      | 9.5     | 6.3     |
| 2    | 15.0      | 15      | 12.0    | 8.9     |
| 4    | 19.9      | 15      | 14.4    | 11.6    |
| 6    | 24.3      | 17.9    | 15.8    | 13.1    |
| 8    | 28.7      | 20.5    | 17.0    | 14.2    |
| 10   | 30.0      | 22.9    | 17.9    | 15      |
| 12   | 30        | 25.5    | 18.9    | 15.6    |
| 16   | 30        | 30.0    | 20.7    | 16.6    |
| 20   | 30        | 30      | 22.3    | 17.8    |
| 30   | 30        | 30      | 25.7    | 20.4    |
| 40   | 30        | 30      | 29.3    | 22.5    |
| 50   | 30        | 30      | 30      | 24.3    |
| 60   | 30        | 30      | 30      | 25.2    |
| 70   | 30        | 30      | 30      | 25.7    |

**Average level of the raid team**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 7.7       | 7.6     | 7.2     | 6.2     |
| 2    | 13.7      | 13.7    | 9.1     | 8.1     |
| 4    | 19.5      | 14.9    | 11.5    | 9.1     |
| 6    | 23.9      | 17.8    | 13.3    | 10.2    |
| 8    | 28.4      | 20.2    | 15.3    | 11.1    |
| 10   | 29.4      | 22.8    | 16.4    | 12.2    |
| 12   | 29.6      | 25.3    | 17.1    | 13.3    |
| 16   | 30        | 29.1    | 18.4    | 15.0    |
| 20   | 30        | 30.0    | 20.0    | 16.4    |
| 30   | 30        | 30      | 23.3    | 18.8    |
| 40   | 30        | 30      | 26.9    | 20.5    |
| 50   | 30        | 30      | 29.7    | 21.7    |
| 60   | 30        | 30      | 30      | 22.6    |
| 70   | 30        | 30      | 30      | 23.4    |

**Ceiling and when each preset reaches it (`long`)**

| Preset    | Metric     | final (last week) | 50% reached in week | 90% reached in week | 95% reached in week | 99% reached in week |
| --------- | ---------- | ----------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| min-maxer | power      | 941.7             | 4                   | 12                  | 13                  | 19                  |
| min-maxer | team_level | 30.0              | 4                   | 8                   | 9                   | 13                  |
| engaged   | power      | 944.2             | 6                   | 16                  | 18                  | 20                  |
| engaged   | team_level | 30.0              | 7                   | 14                  | 15                  | 19                  |
| regular   | power      | 946.3             | 13                  | 41                  | 46                  | 51                  |
| regular   | team_level | 30.0              | 17                  | 43                  | 47                  | 51                  |
| drop-in   | power      | 671.2             | 16                  | 55                  | 62                  | 69                  |
| drop-in   | team_level | 23.4              | 16                  | 50                  | 60                  | 69                  |

**Team power (raid power)**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 1    | 257.6     | 238.3   | 154.1   | 65.9    |
| 2    | 444.7     | 395.6   | 221.5   | 95.4    |
| 4    | 626.8     | 532.2   | 304.8   | 164.6   |
| 6    | 726.1     | 621.3   | 372.5   | 212.9   |
| 8    | 821.5     | 683.1   | 436.2   | 254.3   |
| 10   | 857.5     | 739.1   | 489.8   | 288.6   |
| 12   | 897.5     | 792.6   | 539.3   | 322.8   |
| 16   | 929.5     | 882.8   | 624.1   | 378.4   |
| 20   | 940.6     | 939.0   | 676.2   | 414.1   |
| 30   | 941.7     | 944     | 761.9   | 482.5   |
| 40   | 941.7     | 944.2   | 861.5   | 540.1   |
| 50   | 941.7     | 944.2   | 938.2   | 588.2   |
| 60   | 941.7     | 944.2   | 946.3   | 636.3   |
| 70   | 941.7     | 944.2   | 946.3   | 671.2   |

**Bait income against the price of a level (`base`)**

**min-maxer: Bait per week**

| Week | allowance + leet | duplicate conversion | dungeon | spent on training | spent on supplies | levels bought | price of next team level | Bait held |
| ---- | ---------------- | -------------------- | ------- | ----------------- | ----------------- | ------------- | ------------------------ | --------- |
| 1    | 313.9            | 21.0                 | 15.3    | 296.2             | 66.4              | 19.9          | 3.9                      | 6.3       |
| 2    | 313.5            | 74.2                 | 18.1    | 346.7             | 98.9              | 22.8          | 26.2                     | 10.6      |
| 4    | 313.9            | 230.7                | 15.4    | 338.9             | 249               | 9.0           | 41.4                     | 24.8      |
| 8    | 313.7            | 296.3                | 14      | 370.1             | 273.8             | 6.8           | 59.1                     | 37.4      |
| 12   | 313.5            | 383.8                | 12.1    | 485.3             | 243.9             | 16.5          | 31.7                     | 21.7      |
| 20   | 313.4            | 709.6                | 12.7    | 762.8             | 363.4             | 28.7          | 0                        | 26.1      |
| 24   | 313.8            | 741.8                | 13.6    | 182.6             | 431.0             | 4.3           | 0                        | 821.5     |
| 30   | 313.8            | 730.1                | 13.4    | 0                 | 483.4             | 0             | 0                        | 4739.7    |

**engaged: Bait per week**

| Week | allowance + leet | duplicate conversion | dungeon | spent on training | spent on supplies | levels bought | price of next team level | Bait held |
| ---- | ---------------- | -------------------- | ------- | ----------------- | ----------------- | ------------- | ------------------------ | --------- |
| 1    | 286.4            | 7.0                  | 15.0    | 298.5             | 15.1              | 19.9          | 3                        | 7.2       |
| 2    | 286.1            | 19.9                 | 17.7    | 305.8             | 20.7              | 18.5          | 25.3                     | 11.3      |
| 4    | 286.2            | 43.5                 | 14.8    | 327.8             | 33.4              | 21.1          | 32.7                     | 12.3      |
| 8    | 286.0            | 121.2                | 12.7    | 313.2             | 125.4             | 7.7           | 43.1                     | 22.2      |
| 12   | 286.1            | 221.3                | 12.4    | 404.2             | 130.9             | 8.0           | 53.1                     | 20.9      |
| 20   | 285.8            | 466.6                | 9.3     | 596.1             | 217.7             | 22.0          | 1.6                      | 15.7      |
| 24   | 286.8            | 513.2                | 7.5     | 690.8             | 234.5             | 27.2          | 0                        | 20.8      |
| 30   | 286.2            | 680.8                | 7.5     | 0                 | 420.5             | 0             | 0                        | 2400.3    |

**regular: Bait per week**

| Week | allowance + leet | duplicate conversion | dungeon | spent on training | spent on supplies | levels bought | price of next team level | Bait held |
| ---- | ---------------- | -------------------- | ------- | ----------------- | ----------------- | ------------- | ------------------------ | --------- |
| 1    | 160.8            | 0.2                  | 3.8     | 161.6             | 0                 | 15.9          | 11.1                     | 6.2       |
| 2    | 159.8            | 0.8                  | 10.2    | 175.8             | 0                 | 16.1          | 10.8                     | 5.5       |
| 4    | 161.3            | 4.0                  | 9.4     | 178.9             | 0                 | 16.0          | 14.5                     | 3.9       |
| 8    | 161.5            | 11.3                 | 8.4     | 189.2             | 0                 | 13.2          | 26.9                     | 4.7       |
| 12   | 159.5            | 17.4                 | 8.2     | 192.3             | 0                 | 10.1          | 31.7                     | 6.6       |
| 20   | 159.6            | 33.4                 | 7.4     | 206.1             | 0                 | 7.6           | 35.4                     | 10.9      |
| 24   | 160.0            | 36.8                 | 6.7     | 207.0             | 0.3               | 7             | 39.9                     | 13.5      |
| 30   | 160.4            | 48.7                 | 6.0     | 217.9             | 1.4               | 6.0           | 44.7                     | 15.6      |

**drop-in: Bait per week**

| Week | allowance + leet | duplicate conversion | dungeon | spent on training | spent on supplies | levels bought | price of next team level | Bait held |
| ---- | ---------------- | -------------------- | ------- | ----------------- | ----------------- | ------------- | ------------------------ | --------- |
| 1    | 44.2             | 0                    | 0.0     | 38.0              | 0                 | 5.6           | 14.2                     | 6.5       |
| 2    | 41.8             | 0                    | 0.4     | 42.4              | 0                 | 4.3           | 14.5                     | 6.9       |
| 4    | 45.6             | 0                    | 2.1     | 48.4              | 0                 | 4.3           | 12.3                     | 6.3       |
| 8    | 44.1             | 0.1                  | 3.2     | 48.2              | 0                 | 5.0           | 10.8                     | 5.4       |
| 12   | 43.5             | 0.2                  | 2.6     | 47.5              | 0                 | 4.7           | 14.4                     | 4.9       |
| 20   | 44.3             | 0.6                  | 1.8     | 47.6              | 0                 | 4.3           | 18.2                     | 3.3       |
| 24   | 43.6             | 0.7                  | 1.5     | 46.3              | 0                 | 4.0           | 18.7                     | 3.6       |
| 30   | 43.6             | 1.0                  | 1.6     | 47.3              | 0                 | 3.7           | 19.3                     | 3.9       |

**Binding limit, days a week (of 7), `base`**

**min-maxer**

| Week | Bait to train | Essence to evolve | next check-in (not a wait) | only gear left | max fusion | nothing worth buying |
| ---- | ------------- | ----------------- | -------------------------- | -------------- | ---------- | -------------------- |
| 1    | 1.5           | 1.2               | 4.3                        | 0              | 0          | 0                    |
| 2    | 1.6           | 5.0               | 0.4                        | 0              | 0          | 0                    |
| 4    | 7             | 0                 | 0                          | 0              | 0          | 0                    |
| 8    | 7             | 0                 | 0                          | 0              | 0          | 0                    |
| 12   | 5.6           | 0                 | 0                          | 1.4            | 0.0        | 0                    |
| 16   | 0.1           | 0                 | 0                          | 6.3            | 0.6        | 0                    |
| 20   | 0.1           | 0                 | 0                          | 6.3            | 0.6        | 0                    |
| 30   | 0             | 0                 | 0                          | 6.5            | 0.5        | 0                    |

**engaged**

| Week | Bait to train | Essence to evolve | next check-in (not a wait) | only gear left | max fusion | nothing worth buying |
| ---- | ------------- | ----------------- | -------------------------- | -------------- | ---------- | -------------------- |
| 1    | 1.4           | 1.4               | 4.2                        | 0              | 0          | 0                    |
| 2    | 1.3           | 5.1               | 0.6                        | 0              | 0          | 0                    |
| 4    | 6.8           | 0.2               | 0                          | 0              | 0          | 0                    |
| 8    | 7             | 0                 | 0                          | 0              | 0          | 0                    |
| 12   | 7             | 0                 | 0                          | 0              | 0          | 0                    |
| 16   | 7             | 0                 | 0                          | 0              | 0          | 0                    |
| 20   | 0.3           | 0                 | 0                          | 2.4            | 4.2        | 0.1                  |
| 30   | 0             | 0                 | 0                          | 2.0            | 5.0        | 0                    |

**regular**

| Week | Bait to train | Essence to evolve | next check-in (not a wait) | only gear left | max fusion | nothing worth buying |
| ---- | ------------- | ----------------- | -------------------------- | -------------- | ---------- | -------------------- |
| 1    | 6.0           | 0                 | 1.0                        | 0              | 0          | 0                    |
| 2    | 5.4           | 0.1               | 1.5                        | 0              | 0          | 0                    |
| 4    | 6.7           | 0.0               | 0.2                        | 0              | 0          | 0                    |
| 8    | 6.9           | 0.1               | 0.0                        | 0              | 0          | 0                    |
| 12   | 6.9           | 0.1               | 0.0                        | 0              | 0          | 0                    |
| 16   | 6.8           | 0                 | 0.1                        | 0              | 0          | 0                    |
| 20   | 6.9           | 0                 | 0.1                        | 0              | 0          | 0                    |
| 30   | 6.9           | 0                 | 0.1                        | 0              | 0          | 0                    |

**drop-in**

| Week | Bait to train | Essence to evolve | next check-in (not a wait) | only gear left | max fusion | nothing worth buying |
| ---- | ------------- | ----------------- | -------------------------- | -------------- | ---------- | -------------------- |
| 1    | 6.9           | 0                 | 0.1                        | 0              | 0          | 0                    |
| 2    | 5.6           | 0                 | 1.4                        | 0              | 0          | 0                    |
| 4    | 5.6           | 0                 | 1.4                        | 0              | 0          | 0                    |
| 8    | 5.9           | 0.1               | 1.1                        | 0              | 0          | 0                    |
| 12   | 6.7           | 0                 | 0.3                        | 0              | 0          | 0                    |
| 16   | 6.9           | 0                 | 0.1                        | 0              | 0          | 0                    |
| 20   | 7             | 0                 | 0                          | 0              | 0          | 0                    |
| 30   | 7             | 0                 | 0                          | 0              | 0          | 0                    |

**Extending the ceiling: levels 31 to 40 (`q4-cap40` at today's price 3 + 2 x level; `q4-cap40-x4`: from level 30 a level costs four times as much)**

| Preset (cap 40) | Metric     | final (last week) | 50% reached in week | 90% reached in week | 95% reached in week | 99% reached in week |
| --------------- | ---------- | ----------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| min-maxer       | power      | 1159.2            | 6                   | 17                  | 19                  | 28                  |
| min-maxer       | team_level | 40.0              | 6                   | 13                  | 13                  | 20                  |
| engaged         | power      | 1161.7            | 9                   | 23                  | 26                  | 29                  |
| engaged         | team_level | 40.0              | 11                  | 21                  | 23                  | 28                  |
| regular         | power      | 863.2             | 11                  | 34                  | 37                  | 40                  |
| regular         | team_level | 27.0              | 13                  | 35                  | 38                  | 40                  |
| drop-in         | power      | 545.0             | 11                  | 32                  | 36                  | 40                  |
| drop-in         | team_level | 20.4              | 13                  | 32                  | 36                  | 39                  |

| Preset (cap 40, x4 past 30) | Metric     | final (last week) | 50% reached in week | 90% reached in week | 95% reached in week | 99% reached in week |
| --------------------------- | ---------- | ----------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| min-maxer                   | power      | 1146.1            | 6                   | 28                  | 33                  | 39                  |
| min-maxer                   | team_level | 40.0              | 6                   | 21                  | 23                  | 38                  |
| engaged                     | power      | 1123.7            | 8                   | 35                  | 42                  | 49                  |
| engaged                     | team_level | 39.4              | 11                  | 34                  | 38                  | 48                  |
| regular                     | power      | 937.7             | 13                  | 40                  | 45                  | 49                  |
| regular                     | team_level | 29.8              | 17                  | 42                  | 46                  | 50                  |
| drop-in                     | power      | 589.4             | 13                  | 40                  | 45                  | 49                  |
| drop-in                     | team_level | 21.6              | 14                  | 38                  | 43                  | 49                  |

**Reading.** Everyone converges on the same ceiling (942 to 946 power: three level-30 creatures, all 14 species, 5 fusions each, gear 13%). Min-maxers have it at week 13 (95% of the climb; level 30 on top at week 10, team average 29.6 at week 12 and 30 from week 16), engaged at week 18, regulars at week 46, drop-ins not within 70 weeks (671 at week 70 with no gear work). **Bait is the binding limit on 80% to 100% of days for every preset from week 3 or 4 until the cap** (min-maxer 7 of 7 days in weeks 4 to 10, engaged until week 19, regulars and drop-ins for all 30 weeks), and the binding limit moves from Bait to "only gear or max fusion left" (nothing left to buy) at week 13 (min-maxer) and week 19 (engaged). Committed players' Bait is mostly **duplicate conversion from trips, not the allowance**: 47% of a min-maxer's Bait at week 8, 69% at week 20 (710 against 314 a week), and 29% (week 8) to 61% (week 20) of an engaged player's; the collection is complete at week 6 (min-maxer), 12 (engaged), 40 (regular), never in 70 weeks (drop-in, 12.3 of 14), so every later trip is duplicates. After the cap the surplus is 470 to 1000 Bait a week (4.7k held at week 30, 31k at week 70). A regular earns 160 Bait a week against a level price of 31 to 45 (5 to 8 levels a week with the catch-up discount) and takes 46 weeks to the cap; a drop-in earns 44 against 14 to 20 (4 to 5 levels a week, many at the half catch-up price).

## 5. Dungeon

**min-maxer: depth at the end of the week, runs and full clears a week, rooms cleared per run (of 3), and what the dungeon paid per week**

| Week | depth | runs | full clears | rooms/run | Bait | Essence | scrap | common items | rare items | epic items | boss shards |
| ---- | ----- | ---- | ----------- | --------- | ---- | ------- | ----- | ------------ | ---------- | ---------- | ----------- |
| 1    | 5.3   | 5.8  | 4.3         | 2.7       | 15.3 | 4.3     | 5.3   | 0.5          | 0.1        | 0.0        | 2.5         |
| 2    | 10.1  | 7    | 4.8         | 2.6       | 18.1 | 7.8     | 8.8   | 0.8          | 0.5        | 0.1        | 3.0         |
| 3    | 13.9  | 7    | 3.8         | 2.5       | 17.3 | 5.3     | 6.3   | 0.5          | 0.2        | 0.1        | 2.3         |
| 4    | 15.9  | 7    | 2.0         | 2.2       | 15.4 | 3.8     | 4.8   | 0.3          | 0.3        | 0.0        | 1.2         |
| 6    | 17.9  | 7    | 0.8         | 2.0       | 14.1 | 1.9     | 2.9   | 0.1          | 0.1        | 0.0        | 0.5         |
| 8    | 19.6  | 7    | 0.9         | 2         | 14   | 2.0     | 3.0   | 0.1          | 0.0        | 0.0        | 0.5         |
| 12   | 20.9  | 7    | 0.1         | 1.7       | 12.1 | 1.2     | 2.2   | 0.0          | 0.0        | 0          | 0.1         |
| 20   | 21.9  | 7    | 0.1         | 1.8       | 12.7 | 1.1     | 2.1   | 0            | 0.0        | 0          | 0.1         |
| 30   | 22.7  | 7    | 0.1         | 1.9       | 13.4 | 1.2     | 2.2   | 0.0          | 0          | 0.0        | 0.1         |

**engaged: depth at the end of the week, runs and full clears a week, rooms cleared per run (of 3), and what the dungeon paid per week**

| Week | depth | runs | full clears | rooms/run | Bait | Essence | scrap | common items | rare items | epic items | boss shards |
| ---- | ----- | ---- | ----------- | --------- | ---- | ------- | ----- | ------------ | ---------- | ---------- | ----------- |
| 1    | 5.3   | 5.5  | 4.3         | 2.7       | 15.0 | 4.3     | 5.3   | 0.5          | 0.2        | 0.0        | 2.6         |
| 2    | 9.7   | 7    | 4.4         | 2.5       | 17.7 | 7.3     | 8.3   | 0.8          | 0.5        | 0.1        | 2.6         |
| 3    | 13.6  | 7    | 3.9         | 2.5       | 17.5 | 5.4     | 6.4   | 0.5          | 0.2        | 0.1        | 2.4         |
| 4    | 15    | 7    | 1.4         | 2.1       | 14.8 | 2.9     | 3.9   | 0.2          | 0.1        | 0.0        | 0.9         |
| 6    | 16.9  | 7    | 1.0         | 2.0       | 14.3 | 2.4     | 3.4   | 0.2          | 0.1        | 0.0        | 0.6         |
| 8    | 18    | 7    | 0.4         | 1.8       | 12.7 | 1.5     | 2.5   | 0.1          | 0          | 0          | 0.3         |
| 12   | 19.7  | 7    | 0.4         | 1.8       | 12.4 | 1.5     | 2.5   | 0.1          | 0.0        | 0.0        | 0.2         |
| 20   | 21.2  | 7    | 0.1         | 1.3       | 9.3  | 1.1     | 2.1   | 0.0          | 0.0        | 0          | 0.1         |
| 30   | 21.4  | 7    | 0           | 1.1       | 7.5  | 1       | 2     | 0            | 0          | 0          | 0           |

**regular: depth at the end of the week, runs and full clears a week, rooms cleared per run (of 3), and what the dungeon paid per week**

| Week | depth | runs | full clears | rooms/run | Bait | Essence | scrap | common items | rare items | epic items | boss shards |
| ---- | ----- | ---- | ----------- | --------- | ---- | ------- | ----- | ------------ | ---------- | ---------- | ----------- |
| 1    | 2.2   | 1.3  | 1.2         | 2.9       | 3.8  | 1.2     | 1.3   | 0.1          | 0.0        | 0          | 0.7         |
| 2    | 5.0   | 3.9  | 2.8         | 2.7       | 10.2 | 2.8     | 3.4   | 0.4          | 0.1        | 0.0        | 1.6         |
| 3    | 7.1   | 4.5  | 2.1         | 2.3       | 10.3 | 2.7     | 3.5   | 0.4          | 0.2        | 0.0        | 1.2         |
| 4    | 8.6   | 4.5  | 1.5         | 2.1       | 9.4  | 2.6     | 3.3   | 0.4          | 0.2        | 0.1        | 1.0         |
| 6    | 10.8  | 4.5  | 1.1         | 2.0       | 8.8  | 1.2     | 1.9   | 0.1          | 0.1        | 0          | 0.6         |
| 8    | 12.4  | 4.5  | 0.8         | 1.9       | 8.4  | 0.8     | 1.6   | 0.1          | 0.0        | 0.0        | 0.4         |
| 12   | 14.5  | 4.5  | 0.5         | 1.8       | 8.2  | 0.7     | 1.5   | 0.1          | 0.1        | 0.0        | 0.3         |
| 20   | 17.8  | 4.5  | 0.4         | 1.7       | 7.4  | 0.5     | 1.3   | 0.1          | 0.0        | 0.0        | 0.3         |
| 30   | 19.7  | 4.5  | 0.1         | 1.3       | 6.0  | 0.2     | 0.9   | 0.0          | 0.0        | 0          | 0.1         |

**drop-in: depth at the end of the week, runs and full clears a week, rooms cleared per run (of 3), and what the dungeon paid per week**

| Week | depth | runs | full clears | rooms/run | Bait | Essence | scrap | common items | rare items | epic items | boss shards |
| ---- | ----- | ---- | ----------- | --------- | ---- | ------- | ----- | ------------ | ---------- | ---------- | ----------- |
| 1    | 1.0   | 0.0  | 0.0         | 3         | 0.0  | 0.0     | 0.0   | 0            | 0          | 0          | 0.0         |
| 2    | 1.2   | 0.1  | 0.1         | 3         | 0.4  | 0.1     | 0.1   | 0.0          | 0.0        | 0.0        | 0.1         |
| 3    | 1.6   | 0.5  | 0.4         | 2.9       | 1.4  | 0.4     | 0.4   | 0.1          | 0.0        | 0          | 0.3         |
| 4    | 2.2   | 0.8  | 0.7         | 2.9       | 2.1  | 0.7     | 0.7   | 0.0          | 0.0        | 0.0        | 0.4         |
| 6    | 3.9   | 1.2  | 0.9         | 2.7       | 3.1  | 0.9     | 0.9   | 0.1          | 0.0        | 0.0        | 0.6         |
| 8    | 5.6   | 1.4  | 0.8         | 2.3       | 3.2  | 0.9     | 0.9   | 0.1          | 0.1        | 0.0        | 0.4         |
| 12   | 8.0   | 1.5  | 0.5         | 1.8       | 2.6  | 0.7     | 0.7   | 0.1          | 0.1        | 0.0        | 0.3         |
| 20   | 10.6  | 1.6  | 0.2         | 1.2       | 1.8  | 0.2     | 0.2   | 0.0          | 0          | 0.0        | 0.1         |
| 30   | 12.1  | 1.5  | 0.1         | 1.1       | 1.6  | 0.1     | 0.1   | 0.0          | 0.0        | 0          | 0.1         |

**Depth over 70 weeks (the wall)**

| Week | min-maxer | engaged | regular | drop-in |
| ---- | --------- | ------- | ------- | ------- |
| 4    | 16.3      | 15.0    | 8.8     | 2.3     |
| 8    | 19.7      | 18.1    | 12.5    | 5.7     |
| 12   | 21        | 19.9    | 14.6    | 8.0     |
| 20   | 21.9      | 21.3    | 17.8    | 10.5    |
| 30   | 22.8      | 21.4    | 19.7    | 12.1    |
| 40   | 23.5      | 21.5    | 20.6    | 13.4    |
| 50   | 23.9      | 21.5    | 21.1    | 14.4    |
| 60   | 23.9      | 21.5    | 21.2    | 15.3    |
| 70   | 24.1      | 21.5    | 21.3    | 16.5    |

### Does a min-maxer's dungeon gear skew the server's raid? (paired runs, 300 servers x 24 weeks)

Same servers, same seeds; in `q5-nodg-mm` the min-maxer's dungeon runs pay everything except gear drops; in `q5-nodg-all` nobody gets dungeon gear; `q5b-*` is a casual server with one min-maxer (1 min-maxer, 4 regular, 4 drop-in) where the min-maxer carries about a third of the damage.

| Measure                                                                        | Default mix: base | min-maxer without dungeon gear | nobody with dungeon gear | Casual server: base | min-maxer without dungeon gear |
| ------------------------------------------------------------------------------ | ----------------- | ------------------------------ | ------------------------ | ------------------- | ------------------------------ |
| Finale won, weeks 2 to 8                                                       | 91.1%             | 91.1%                          | 90.7%                    | 77.9%               | 78.0%                          |
| Finale won, weeks 8 to 24                                                      | 48.6%             | 48.5%                          | 48.8%                    | 51.2%               | 51.1%                          |
| Min-maxer share of raid damage, weeks 2 to 24 (fair share of 7.5 signers: 13%) | 19.4%             | 19.3%                          | 19.3%                    | 30.5%               | 30.7%                          |

**Gear power with and without dungeon gear**

| Scenario    | min-maxer w4 | min-maxer w8 | min-maxer w12 | min-maxer w24 | engaged w4  | engaged w8  | engaged w12 | engaged w24 | regular w4  | regular w8  | regular w12 | regular w24 |
| ----------- | ------------ | ------------ | ------------- | ------------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| q5-base     | 39.8         | 56.9         | 66.6          | 68.5          | 30.0        | 48.9        | 56.6        | 69.1        | 12.4        | 26.1        | 36.2        | 52.1        |
| q5-nodg-mm  | 36.9 (-2.9)  | 55.8 (-1.1)  | 66.7 (+0.1)   | 68.7 (+0.3)   | 30.0 (-0.0) | 48.7 (-0.2) | 56.6 (-0.0) | 69.1 (+0.0) | 12.7 (+0.2) | 25.7 (-0.4) | 35.9 (-0.4) | 52.0 (-0.1) |
| q5-nodg-all | 37.5 (-2.3)  | 55.6 (-1.3)  | 66.4 (-0.2)   | 68.5 (+0.1)   | 26.9 (-3.1) | 47.1 (-1.8) | 56.0 (-0.6) | 69.1 (+0.0) | 11.3 (-1.2) | 24.8 (-1.3) | 35.1 (-1.1) | 51.8 (-0.3) |

**Team power**

| Scenario    | min-maxer w4 | min-maxer w8 | min-maxer w12 | min-maxer w24 | engaged w4   | engaged w8   | engaged w12  | engaged w24  | regular w4   | regular w8   | regular w12  | regular w24  |
| ----------- | ------------ | ------------ | ------------- | ------------- | ------------ | ------------ | ------------ | ------------ | ------------ | ------------ | ------------ | ------------ |
| q5-base     | 626.6        | 820.4        | 895.1         | 942.4         | 531.5        | 682.8        | 793.8        | 943.6        | 305.3        | 433.9        | 537.9        | 711.0        |
| q5-nodg-mm  | 621.8 (-4.8) | 821.2 (+0.9) | 898.8 (+3.7)  | 942.9 (+0.5)  | 531.4 (-0.1) | 682.0 (-0.8) | 793.1 (-0.8) | 943.7 (+0.1) | 304.5 (-0.9) | 430.8 (-3.2) | 536.3 (-1.6) | 709.8 (-1.3) |
| q5-nodg-all | 622.0 (-4.6) | 818.1 (-2.2) | 896.9 (+1.8)  | 942.5 (+0.1)  | 527.0 (-4.5) | 679.5 (-3.3) | 791.7 (-2.2) | 943.7 (+0.0) | 304.0 (-1.3) | 430.7 (-3.3) | 533.8 (-4.1) | 709.3 (-1.7) |

**Reading.** The dungeon is a depth wall, not a gear faucet: depth climbs fast while a team is weak (min-maxer depth 5, 10, 14, 16 at weeks 1 to 4) and stalls at 20 to 22 by week 12 (24 at week 70, power fixed at 942); full clears drop from 4.3 a week to 0.8 at week 6 and 0.1 from week 12, rooms cleared per run fall from 2.7 to 1.8 of 3. At the wall a week of seven runs pays 12 to 14 Bait, 1 to 2 Essence, about 2 scrap, 0.1 boss shards and no gear. Dungeon gear is front-loaded: 1.5 items in week 2, 0.1 by week 6; a min-maxer wears 0.8 dungeon items of 3 at any time, but that is worth **3 gear power at week 4 and nothing from week 12** (all dungeon gear removed: gear power -2.9 at week 4, -1.1 at week 8, 0 later). The paired finale result: removing the min-maxer's dungeon gear moves the finale win share by -0.06 points (95% CI +-0.31, weeks 2 to 24; -0.16 +-0.55 for weeks 8 to 24) in the default server and -0.25 +-0.32 in the casual server; the min-maxer's share of raid damage is 19% (default server, weeks 2 to 24; 21% to 22% in weeks 2 to 12) and 31% (casual server) with or without it, against a fair share of 13%. **No gate on dungeon depth or gear by Boss Rank is needed today**; the min-maxer's edge in the raid comes from levels, evolution and fusion (gear is 7% to 13% of team power), not from dungeon gear. Revisit if gear grows (second slot, caps 30/35, modifiers): gear would then be 20% of power.

## 6. Dead periods

Definition (a "meaningful upgrade day"): a day on which the raid team's power is at least 3% above its value at the previous meaningful day (the anchor moves each time), or a team creature evolves, or the worn gear gets rarer than ever before. A dead period is a stretch of 7 or more days without one. Sensitivity runs at 2% and 5% are in the JSON (`dead` in each scenario file). A second reading counts the journey milestones (first rare catch, evolution, fusion steps, level 10/15/20/25/30, first epic gear, +5, depth landmarks, expedition slots, raid firsts: 37 in all).

**Share of player-days inside a dead period of 7+ days / 14+ days (`base`)**

| Week | min-maxer   | engaged     | regular   | drop-in   |
| ---- | ----------- | ----------- | --------- | --------- |
| 1    | 0% / 0%     | 0% / 0%     | 0% / 0%   | 11% / 0%  |
| 2    | 0% / 0%     | 0% / 0%     | 1% / 0%   | 41% / 0%  |
| 3    | 0% / 0%     | 8% / 0%     | 3% / 0%   | 44% / 1%  |
| 4    | 0% / 0%     | 36% / 0%    | 14% / 0%  | 52% / 3%  |
| 5    | 2% / 0%     | 6% / 0%     | 26% / 0%  | 58% / 6%  |
| 6    | 4% / 0%     | 1% / 0%     | 35% / 1%  | 53% / 7%  |
| 8    | 13% / 6%    | 28% / 0%    | 53% / 6%  | 73% / 13% |
| 10   | 84% / 68%   | 59% / 0%    | 71% / 19% | 82% / 29% |
| 12   | 80% / 70%   | 64% / 0%    | 81% / 31% | 86% / 40% |
| 14   | 96% / 90%   | 75% / 1%    | 84% / 35% | 89% / 52% |
| 16   | 100% / 99%  | 98% / 62%   | 89% / 53% | 95% / 69% |
| 20   | 100% / 100% | 98% / 98%   | 97% / 68% | 97% / 74% |
| 24   | 100% / 100% | 100% / 100% | 98% / 83% | 98% / 87% |
| 30   | 100% / 100% | 100% / 100% | 89% / 49% | 91% / 53% |

**Sensitivity to the threshold: share of player-days in a 7+ day dead period at 2% / 3% / 5%**

| Preset    | w4              | w8              | w12             | w20                |
| --------- | --------------- | --------------- | --------------- | ------------------ |
| min-maxer | 0% / 0% / 0%    | 5% / 13% / 71%  | 72% / 80% / 94% | 100% / 100% / 100% |
| engaged   | 24% / 36% / 60% | 1% / 28% / 91%  | 2% / 64% / 98%  | 97% / 98% / 99%    |
| regular   | 6% / 14% / 29%  | 38% / 53% / 74% | 65% / 81% / 93% | 88% / 97% / 100%   |
| drop-in   | 45% / 52% / 65% | 64% / 73% / 86% | 79% / 86% / 93% | 93% / 97% / 99%    |

**Median length of a closed gap that started in the week (days; 90th percentile)**

| Start week | min-maxer | engaged | regular | drop-in |
| ---------- | --------- | ------- | ------- | ------- |
| 1          | 1 (1)     | 1 (1)   | 1 (3)   | 5 (7)   |
| 2          | 1 (2)     | 1 (2)   | 2 (4)   | 5 (7)   |
| 4          | 2 (3)     | 4 (6)   | 3 (6)   | 6 (8)   |
| 6          | 4 (5)     | 4 (6)   | 4 (8)   | 6 (9)   |
| 8          | 5 (16)    | 6 (9)   | 5 (11)  | 7 (13)  |
| 12         | 5 (49)    | 6 (9)   | 7 (14)  | 8 (20)  |
| 16         | 34 (34)   | 12 (27) | 10 (20) | 12 (28) |
| 20         | -         | 3 (4)   | 15 (27) | 15 (27) |
| 24         | -         | -       | 19 (33) | 19 (33) |

**What the binding limit was on the days inside dead periods** (share of those days): committed players weeks 5 to 12: Bait to train 94% to 100%; min-maxer from week 13 and engaged from week 21: nothing left to buy (scrap for gear 87% to 92% is the cap-bound gear plus the crafting policy, max fusion 7% to 68%); regulars and drop-ins: Bait to train 98% to 100% in every week bucket.

**New journey milestones per player per week (`base-c`; median in brackets)**

| Week | min-maxer | engaged   | regular | drop-in |
| ---- | --------- | --------- | ------- | ------- |
| 1    | 12.3 (12) | 10.9 (11) | 3.2 (3) | 1.1 (1) |
| 2    | 5.4 (6)   | 6.6 (7)   | 5.6 (6) | 1.6 (2) |
| 3    | 2.4 (2)   | 1.7 (2)   | 4.1 (4) | 1.5 (1) |
| 4    | 2.0 (2)   | 0.9 (1)   | 2.6 (2) | 1.0 (1) |
| 5    | 0.6 (0)   | 1.5 (1)   | 1.7 (1) | 1.0 (1) |
| 6    | 0.8 (1)   | 0.7 (0)   | 1.2 (1) | 1.4 (1) |
| 8    | 0.9 (1)   | 1.1 (1)   | 0.5 (0) | 1.3 (1) |
| 10   | 0.5 (0)   | 0.3 (0)   | 0.4 (0) | 1.1 (1) |
| 12   | 0.2 (0)   | 1.3 (1)   | 0.7 (0) | 0.8 (0) |
| 14   | 0.3 (0)   | 0.3 (0)   | 0.6 (0) | 0.6 (0) |
| 16   | 0.1 (0)   | 1.5 (2)   | 0.4 (0) | 0.5 (0) |
| 20   | 0.1 (0)   | 0.3 (0)   | 0.2 (0) | 0.3 (0) |
| 24   | 0.1 (0)   | 0.0 (0)   | 0.1 (0) | 0.3 (0) |
| 30   | 0.0 (0)   | 0.0 (0)   | 0.2 (0) | 0.2 (0) |

The last weeks of a run are censored (an open gap is counted only up to the end), so the last row understates. A fixed +3% threshold also takes longer as power grows, so read gap growth together with the absolute pace (levels bought a week, section 4: 6 to 10 for regulars, 4 to 5 for drop-ins).

**Reading.** Min-maxers get a meaningful upgrade every day in week 1, every 2.5 days in week 4, every 4 to 5 days in weeks 6 to 8 (13% of days in a 7+ day gap at week 8) and then run out: 84% of days from week 10, 100% from week 16 (their power is 942 flat; 12 milestones in week 1, about 1 a week from week 5 to 14, 0.1 after week 16). Engaged have a lull in weeks 3 to 5 (36% of days in a gap at week 4; consistent with evolutions being done and the Bait now spreading over the top 6 creatures, of which only 3 count: 21 levels are bought a week but the team average moves by 0.1) and then gaps of 6 to 8 days until week 14, ending at week 18. Regulars: gaps of 4 days at week 6, 5 days at week 8, 7 at week 12, 15 to 19 days at weeks 20 to 24 (81% of days in a 7+ day gap at week 12, 49% of days in a 14+ day gap at week 30). Drop-ins: a gap median of 5 to 7 days from week 1 (41% of days at week 2) growing to 15 to 19 days by week 20. The cause is Bait for 98% to 100% of the dead days of the non-committed, and an empty catalogue for the committed. Markers by type: 97% to 100% of committed markers after week 4 are plain +3% power steps (levels); evolutions are 25% to 29% of markers at week 2 and gone by week 4.

## Appendix: scenarios and files

| Scenario               | Servers x weeks   | What it is                                                                                             |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| base, base-b, base-c   | 100 x 30          | default mix, shipped rules, jackpot Essence on (b and c re-runs with extra metrics; identical numbers) |
| long                   | 40 x 70           | same, to find the ceilings                                                                             |
| nojackpot              | 100 x 30          | jackpot Essence off, as the sim was                                                                    |
| q1-*                   | 100 x 30          | scrap sources, workshop policy, second gear slot, caps                                                 |
| q2-*                   | 100 x 30          | supplies off / not bought / crafted first                                                              |
| q3-etrain1, q3-etrain2 | 100 x 30          | Essence pays for training at 1:1 and 1:2                                                               |
| q4-cap40, q4-cap40-x4  | 100 x 40, 60 x 50 | level cap 40, with a x4 price from level 30                                                            |
| q5-_, q5b-_            | 300 x 24          | dungeon gear removed for the min-maxer or everybody, default and casual server                         |

Raw data: `progression/<scenario>.json` (per preset, per week, per metric: n, mean, p10, p25, p50, p75, p90; per server: finale win, rank, damage shares; dead-period aggregates at 2%, 3%, 5%). Scenario definitions: `progression/scn/*.json`. Study code: `progression/scripts/` (runner, summariser, table builders; `study.ts` and `study-hooks.ts` are the new sim-side files) and `progression/study-instrumentation.patch` (a plain diff of the instrumented copy of `packages/sim/src` and `scripts` against the repo at cd25e20, for reading; it is not applied to the repo). The per-server raw shards (360 MB) and the instrumented copy were deleted after the summaries were written; the paired confidence intervals in section 5 came from `scripts/paired.mjs` on those shards. To re-run: copy the repo, apply the diff, `node scripts/mkscn.mjs`, `scripts/run.sh <scenario> 4`, `node scripts/build.mjs`.
