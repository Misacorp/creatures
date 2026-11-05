# Phase 5 plan: simulation and balance on combat v2

Status: planned, 2026-11-04. Phase 5 of `roadmap.md`: a journey simulator on engine v2 (the Boss Rank curve, dungeon depths, week-by-week progress per play style, the raid weekend with attrition) and one balance pass, spiky, not flat (P-10). Gate (roadmap): weekly raid win rates in band at each rank, the classic trio not best everywhere, diversity of winning teams, no dead Knack. Misa's part: choose where numbers trade against feel.

## 1. Which simulator

Two simulators exist today:

|             | The journey sim (`packages/sim`)                                        | The lab's path (`packages/lab`, `--path`)                                                   |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Engine      | v1 only (`simulateFight`, `simulateDungeonRoom`)                        | v2 (`fightV2`, `weekendV2`)                                                                 |
| Raid        | v1 phases, floors, the v1 Boss Rank curve                               | the boss track, slots and cards, the young-server ramp, attrition, Determination, Festivals |
| Roster      | earned: XP, levels, gear, v1 talents, catches, the economy hour by hour | given: the valley's roster profile (levels per week by player kind)                         |
| Dungeon     | depth progression per player and day                                    | one fight per foe and depth; map runs at fixed depths; no progression                       |
| Play styles | four journey presets and server mixes                                   | dedicated, mixed and builder servers at three speeds                                        |

**Phase 5 builds on the lab's path, not on the journey sim.** The journey sim's strength comes from the v1 economy and v1 combat, and the valley is redesigning that economy: the valley owns the roster (how fast a server's players grow), combat v2 owns the challenges (decision `2026-10-30-the-boss-track-is-tuned-against`). Porting the journey sim's economy to v2 would rebuild what the valley replaces.

**The journey sim stays as it is** for the live game: production plays v1 until phase 8, and the balance loop (`balance-review`, `pnpm sim:live`) reads it. Its combat targets (`raid-*`, `curve-*`, `longrun-*`) retire when v2 ships.

## 2. What the v2 journey simulator adds to the lab's path

The path walks servers week by week on the track with the valley's roster. It becomes the v2 journey simulator by adding:

1. **The worker's raid rules, shared, not copied.** The arena pieces and seats per player, players locking at stage 1, the spare column, Knacks and talents locked once fought, and replacements between stages from each player's own spares. They are drawn from the same code the worker runs where possible (the engine's `stageV2`, the track's boss), so the simulator cannot drift from the game.
2. **Real party sizes.** The servers' players per week from the valley's coverage (mixed 5, 8 and 15), not only four columns; small parties (one to three players) per question 1.
3. **Players' choices as policies.**
   - **Knacks:** the best for the board, the first one known, or none.
   - **Talents:** rolled from the line pools over the weeks, golden at the game's chance, learned at the valley's rate.
   - **Placements:** following the board, or random.
   - **Replacements:** whether a player brings a spare after a knock-out.
   - **The finale's action:** Rally, Shield Wall or Purge, at the auto-fire rounds.
4. **The dungeon over days.**
   - Each player's daily run on the v2 rooms (the map, the camp, the Undercroft), at the valley's levels.
   - Depth growth per week, first-week clears and descent rates measured against today's dungeon targets.
5. **Rewards out, not in.**
   - Each stage's and room's Essence, XP and gear are recorded and compared with what the valley's roster assumes (about 120 XP a day from the dungeon and 70 from the raid for a top creature; `boss-track.md`, "Touch points").
   - The simulator does not feed them back into levels: that loop is the valley's. A mismatch goes to the valley session as numbers.
6. **The v2 reward shape** (Misa, section 7): each threshold of the weekend's HP removed (30% and 85% to start) is paid once when it is first crossed, whichever stage crosses it, and a kill pays a big bonus with lots of rare and epic gear. The worker's payout changes to this, and the simulator records it.

## 3. What is measured (the gate and the rest)

Each is a report section and, where it gates, a lab test with its threshold in `targets.ts`.

- **Raid by rank** (the gate):
  - the kill and the weekends to kill per slot, for dedicated, mixed and builder servers at the three speeds;
  - the stuck share (more than four weekends on one boss, at most 10% of servers);
  - Determination on from the second lap.
- **The classic trio not best everywhere** (the gate): the classic line loses on most cards (P-11), now on real party sizes.
- **Diversity of winning teams** (the gate):
  - how many different lines, element sets and Knack families win each boss;
  - the share of the winning weight the top line holds.
- **No dead Knack** (the gate): every Knack picked somewhere by the best-for-board policy, scored on damage potential (the raid searches saturate at a kill; lab follow-up, panel 6 finding 22).
- **The casual metric:** creatures used beyond each player's top three, at 1.5 (phase 1 accepted 1.41 and set 1.5 for phase 5).
- **The dungeon** (Misa, 2026-11-04, decision `2026-11-04-dungeon-direction-an-easy-base-dungeon`): the base dungeon is fairly easy (a daily player who plays it safe gains about 5 to 7 depth a week) and the Undercroft is the challenge, harder with depth; the choice at the end of the base floor (go down with the team as it stands, or not) must stay meaningful. A baseline with choices, not a strict target: the v1 `dungeon-*` targets are not the yardstick. The way down revives knocked-out creatures (decision `2026-11-04-combat-v2-undercroft-descent-revives-knocked`).
- **Talents' share**, the reaction cap, crit lines, and golden's effect.
- **The finale's actions:** what each is worth, so none is worth more than its intent.
- **Rewards against the valley's assumptions** (section 2.5).
- **Small parties and wide ones:** one to three players (a smaller boss: HP and Attack linear in the players below four, one piece per player, Misa), and fifteen.
- **CPU:** the worst stage and finale replay at fifteen players stay under the Free plan's limit (`integration.md`, section 8).

## 4. The balance pass

One pass, spiky, not flat (P-10): bosses ask different things, and a few strong builds come from investment. **Agents change rules and content; the tuners set the numbers** (as in phase 1): the track tuner (`--tune --track --write`) and the boss tuner re-run on the v2 journey's rosters and party sizes. A target the tuners cannot reach is a content problem, never a looser threshold. Where a number trades against feel (a boss that feels unfair, a Knack that is right but dull), the choice goes to Misa with the measured options.

Folded into the pass, from the lab's follow-ups and phase 4's open items:

- the track's three misses (mixed kills at slots 8, 11 and 14);
- slow servers getting stuck;
- deep ranks running out of creatures before the finale (attrition with real replacements);
- second answers for the 11 cards with one answer (P-13);
- the Tidal Colossus's and Old Bogback's second answers;
- the gear model and gear's effect lines (`gear-plan.md`: stat lines count today, effect lines do not);
- weather is out of v2 fights for good (Misa): its hooks are removed from the v2 fight path (done 2026-11-04: the raid stage's experience and the dungeon run's fight input read none);
- Culling Strike stays an enabler: not buffed for its solo value (decision `2026-11-03-culling-strike-stays-as-an-enabler`).

## 5. Order of the work

1. **The shared raid rules in the simulator**: seats, locks, the spare, replacements, real party sizes; the path's results rerun and compared with today's.
2. **Policies**: Knacks, talents from pools, placement, the finale's action.
3. **The dungeon over days.**
4. **Rewards recorded** against the valley's assumptions.
5. **The report sections and gate tests** (section 3).
6. **The balance pass** (section 4), with Misa's choices.
7. **Lab speed:** the lab's tests run in about 20 s, double their 10 s budget; move the slow measurements to the report so the suite stays fast as the simulator grows.

## 6. Not in phase 5

- The economy: income, trips, crafting and catches are the valley's.
- Production: the flag stays off until phase 8.
- Migration: phase 6 converts nothing (the game resets).
- New species or bosses.
- The six unreviewed icons; they come back when Misa wants them.

## 7. Answered by Misa (2026-11-04)

1. **Small parties** fight a smaller boss: its HP and arena follow the players, with no guests. In the game since 2026-11-04 (one column per player). Phase 5 answer, later the same day: small groups do not matter, a raid works better with lots of people. Only the numbers change, no mechanics (no column-hit counts, seats or cards): below four the HP and Attack scale linearly with the players (`players / 4` for both; four and above keep 0.7 and 0.3). Measured: under the old curve small1 and small2 were 100% stuck, and small3 under the linear curve matched the four-player server; small1 and small2 stay mostly stuck, which Misa accepts.
2. **The weekly replacement rate** of 0.3 ("3 times in 10 seems legit") is confirmed. The new-player rate stays the lead's assumption.
3. **Misa's server** is the live player base to measure against: 3 try-hard players, 3 daily players and 4 semi-weekly players (the journey server `live10`).
4. **Raid rewards** are paid at HP thresholds, whichever stage crosses them, and the kill bonus is big and exciting (lots of rare and epic gear). In the game since 2026-11-04: thresholds 30% and 85% of the weekend in `RULES.raid.v2.rewards`, each paid once; the kill bonus is two epic and four rare pieces per member (doubled by Misa, 2026-11-04).
5. **No weather in fights:** dropped from v2 fights for good. Done in the game since 2026-11-04.

Decision `2026-11-04-combat-v2-phase-5-answers-small`.

## 8. Progress

| Step                                        | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan                                        | Done (2026-11-04).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 1. The shared raid rules in the simulator   | Done (2026-11-04, `packages/lab/src/journey.ts`): seats, locks, per-player spares; the mixed server's one-weekend kill at slots 8 / 11 / 14 is 68% / 53% / 93% with everyone replacing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2. Policies (habits)                        | Done in the lab (2026-11-04, `packages/lab/src/habits.ts`): replacement by roster kind (daily 1.0, weekly 0.3, confirmed by Misa 2026-11-04), Knack, talent, placement and finale policies, small parties on the smaller boss. Mixed kill at slots 8 / 11 / 14 with the habits: 45% / 75% / 83% (replacement alone: 25% / 48% / 48%). Not yet modelled: daily players choosing the best finale ability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3. Misa's answers (2026-11-04)              | Done: small parties get HP and Attack linear in the players below four, nothing mechanical (small1 / small2 / small3 stuck share with Determination, everyone replaces: 98% / 68% / 0%, slots reached 11 / 13 / 19; Misa accepts that one and two stay mostly stuck). The weekly replacement rate 0.3 is confirmed. Misa's server (`live10`: 3 try-hard, 3 daily, 4 semi-weekly) is a journey server: stuck 0% with Determination (3% without, habits), 18 slots reached; one-weekend kill at slots 8 / 11 / 14: 98% / 43% / 93% everyone replaces, 90% / 63% / 98% with the habits.                                                                                                                                                                                                                                                                                                                       |
| 4. The dungeon over days                    | Done in the lab (2026-11-04, `packages/lab/src/dungeonDays.ts`, `report -- --dungeon-days`): each player's daily runs over 24 weeks on the game's v2 rooms, camp and Undercroft (the worker's descent: only the standing heal), at the valley's levels; daily players run every day, weekly players 2 or 3 times a week (Misa, 2026-11-04). Daily players, expected speed: median depth growth a week (weeks 2 to 8) 1.67 / 1.83 / 1.83 on dedicated / mixed / `live10` (target 1 to 2), fights a run 3.3 (3 to 5.5), descent rate 79% / 82% / 78% (20 to 80%), first-week depth 1 clears 13% / 5% / 4% (target at least 80%: the evolution gate puts the all-round line on stage 1 forms in weeks 1 and 2), the first keeper beaten in about 5% of descents. Weekly players gain 0.17 a week and barely clear (0% first week). Decision `2026-11-04-combat-v2-phase-5-step-3`.                            |
| 4b. The dungeon measures (Misa's direction) | Done in the lab (2026-11-04, `dungeonMeasure.ts`, `dungeonKnobs.ts`, `fourSlot.ts`; `report -- --dungeon-days [--scenarios a,b] [--step-back n]`, `report -- --four-slot`): the v1 `dungeon-*` yardstick is replaced by the safe daily player's gain by week band, stuck weeks, the base clear by depth, the descent choice by the team's state, the Undercroft by depth and what going down wins and risks; proposals in `targets.ts` (no test). Today's numbers give a safe daily player 1.0 / 2.2 / 1.2 / 0.5 / 0.2 a week; option `base55-u1` gives 4.4 / 6.3 / 6.6 / 6.6 / 6.6 with a level 1 clear chance of 3% to 61% by team state at depths 8 to 12. A four-slot row beats three. See section 9. Decision `2026-11-04-combat-v2-dungeon-measures-in-the`.                                                                                                                                         |
| 4c. The baseline in the game                | Done (2026-11-04): the lab's `base55-u1` is the v2 foe data (`foes.json`: base HP 12650 bp, +200 bp a depth; its own `undercroft` scale 20700 bp and curve +300 bp / +2 bp squared), built by one engine function for the worker and the lab. `report -- --dungeon-days --scenarios shipped` gives the same numbers as the option did. Decision `2026-11-04-combat-v2-dungeon-baseline-easier-base`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 4d. Rewards grow with depth                 | Done in the game and the lab (2026-11-04, `rules/best-of.ts`, `rules/dungeon-rewards.ts`, `dungeonRewards.ts`; `report -- --dungeon-days --rewards`): a hidden best-of gear roller (roll X to Y, keep the best N to M) and v2 dungeon gear, pack and XP that grow with depth, the Undercroft at its own depth; v1 unchanged. A top creature earns about 157 / 373 / 449 / 503 / 594 XP a day at weeks 1 / 4 / 8 / 12 / 24 (v1: 154 / 313 / 309 / 293 / 297; the valley assumes 120), so the XP cap may need to be lower. Decisions `2026-11-04-a-hidden-best-of-gear-roller`, `2026-11-04-combat-v2-dungeon-rewards-and-xp`.                                                                                                                                                                                                                                                                               |
| 4e. XP a run, landmark steps, more gear     | Done in the game and the lab (2026-11-05, `rules/dungeon-rewards.ts` `dungeonRunXp`, `RULES.dungeon.depthRewards`; Misa): a v2 run pays a creature in every room about 120 base XP at depth 1 whatever the rooms (its share of the run's full base, at least 200), plus 1.75% per landmark depth reached; gear steps are faster (base chest pieces 1.99 at 21-40, 3.10 at 41+, was 1.49 and 2.50). A top creature earns about 86 / 121 / 128 / 134 / 157 XP a day at weeks 1 / 4 / 8 / 12 / 24 (was 157 / 373 / 449 / 503 / 594). Decision `2026-11-05-combat-v2-dungeon-xp-about-120`.                                                                                                                                                                                                                                                                                                                    |
| 4f. Tools for the Undercroft past depth 40  | Measured in the lab (2026-11-05, `undercroftTools.ts`, `undercroftToolSet.ts`; `report -- --undercroft-tools [--servers n] [--tools a,b]`; Misa's question, no decision: his choice). A healthy team (over 80% HP at the floor's end) beats the keeper of level 1 20% of the time at depth 41+ (44% at 21 to 40, 59% at 8 to 12), a net loss of 5.4 pack units an attempt at 41+. The chance is flat at about 17 to 22% from depth 51 on, so the depth picker barely helps (stepping back 5 or 10: 19% / 21%). A camp in level 1 (the game's camp): 27 to 28% (net -2.1); a camp that also Rests 31% (-0.4); gear +10% (approximation) 35% (+1.0); four slots with foe HP x 4/3 26%; the depth-squared term halved 31% (-0.8), removed 44% (+4.8); a camp with gear +10% 44% (+4.9). One more bench creature changes nothing alone. Safe players' speed (6.6 a week) is unchanged by the Undercroft tools. |
| 5. The gate report and gate tests           | Done (2026-11-05, `packages/lab/src/gate.ts`, `test/gate.test.ts`; `report -- --gate`, also in the full report; about 45 s on 4 cores): every gate item of section 3 measured on the v2 journey against its target in `targets.ts`. 34 of 37 items pass; three miss and are listed in `KNOWN_MISSES` (not tests, no target loosened): the mixed server on slow rosters stuck 18% (at most 10%), the Storm Sovereign's winning teams (top line Sproutle 38%, at most 35%), the casual metric 1.36 (at least 1.5). The gate table is below. Decision `2026-11-05-combat-v2-phase-5-step-5`.                                                                                                                                                                                                                                                                                                                  |

**The gate table (full run of `report -- --gate`, 2026-11-05; the game's rules with `HABITS`, Determination on, 40 servers of each kind).**

| Gate item                                                                                       | Measured                                                                                                                       | Target                                                                                  | Result                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------- |
| Raid by rank: stuck share, dedicated / mixed / builders at slow, expected, fast; `live10`       | 0 / 18% / 0, 0 / 0 / 0, 0 / 0 / 0; `live10` 0%                                                                                 | at most 10% each                                                                        | 9 of 10 pass; **mixed slow misses** |
| Raid by rank: weekends to kill, the worst slot's median (slots at least half the servers reach) | 1 to 3 in every cell (the builders' expected and fast cells sit at 3)                                                          | at most 3                                                                               | pass                                |
| Raid by rank: one weekend at slots 8 / 11 / 14, mixed and `live10`                              | mixed 45% / 75% / 83%; `live10` 90% / 63% / 98%                                                                                | at least 21% (`MIXED_KILL_MIN`)                                                         | pass                                |
| Determination from the second lap                                                               | on from slot 6 (5% a stack, 5 stacks)                                                                                          | from slot 6                                                                             | pass                                |
| Classic trio not best everywhere, gauntlet cards                                                | behind by more than 10% on 18 of 18                                                                                            | more than half                                                                          | pass                                |
| Classic trio not best everywhere, raid cards (4 players)                                        | 17 of 18                                                                                                                       | more than half                                                                          | pass                                |
| Classic trio not best everywhere, the five bosses at 4 (potential) and 5, 10, 15 players        | 20 of 20 cases                                                                                                                 | more than half                                                                          | pass                                |
| Diversity of winning teams, Tidal Colossus / Cinder Wyrm / Thornmother / Old Bogback            | 14 / 9 / 13 / 15 lines; 13 / 5 / 12 / 15 element sets; 17 / 10 / 16 / 18 families; top line 19% / 24% / 20% / 16%              | at least 4 lines, 3 element sets, 4 families; top line at most 35% (the lab's proposal) | pass                                |
| Diversity of winning teams, Storm Sovereign                                                     | 7 lines, 4 element sets, 6 families, top line Sproutle 38%                                                                     | same                                                                                    | **miss** (top line)                 |
| No dead Knack                                                                                   | 0 of 44 unpicked across the potential searches and the report's best-team searches; 5 unpicked on the potential searches alone | 0                                                                                       | pass (on the union)                 |
| The casual metric                                                                               | 1.36 over 128 roster-card searches (about plus or minus 0.14)                                                                  | at least 1.5                                                                            | **miss**                            |

Beside the gate (not gating): `mixed5` / `mixed8` / `mixed15` stuck 5% / 10% / 0%, `small1` / `small2` / `small3` stuck 90% / 75% / 0% (Misa accepts that one and two stay mostly stuck), `live10` 0%. CPU at fifteen players on this machine: the worst raid stage 6.9 ms and the worst live finale replay 3.2 ms against the Free plan's 10 ms. Not re-measured in the gate (still in their own sections): talents' share, crit lines and golden, the reaction cap, the finale actions' worth (no worth-per-action measure exists yet), and the dungeon's v2 measures (section 9).

## 9. The dungeon measures (2026-11-04)

Misa's direction (decision `2026-11-04-dungeon-direction-an-easy-base-dungeon`): a fairly easy base dungeon where a safe daily player gains about 5 to 7 depth a week, an Undercroft that is the challenge and gets harder with depth, and the way down as the choice. A baseline with choices, not a strict target. The lab plays the reviving descent. Measured with `report -- --dungeon-days` (8 servers of each of `dedicated`, `mixed` and `live10`, three speeds, 24 weeks; every cleared run at depth 8 or more also plays the Undercroft as a probe). Nothing here changes game data: the options override the foe numbers in the lab only (`dungeonKnobs.ts`).

**What a wipe in the Undercroft costs (worker, read only).** The depth is locked in when the floor boss falls (`lockDepth`, depth + 1), and the main chest's gear, shard and supply are paid at that moment, so going down risks neither. A defeat below takes `defeatKeepBp` (50%) of the whole pack (Bait, Essence, scrap and shards, each rounded up, the floor's loot included) and a rare room's treasure not yet won; creature experience stays. A won level puts its loot in the pack (fights, elites and caches double) and banks the keeper's chest (Essence 2, scrap 7, 80% for a gear piece with raised rare and epic odds). In the lab's units a floor-end pack is about 14 units, so a defeat costs about 7.

**What sets the difficulty.** A foe's HP is the content's, times a scale (`foes.json`), times a depth factor (a step for each depth above 1 plus a curve for each square of them; Attack is flat). Until 2026-11-04 the scale was HP 23000 bp and the curve 1600 bp a depth plus 45 bp a depth squared, and the Undercroft used the same curve at the depth plus 1 for each level, so it had no steepness of its own. The options below move the base's scale and curve and give the Undercroft its own. **`base55-u1` is now the game's data** (decision `2026-11-04-combat-v2-dungeon-baseline-easier-base`, Misa: "Baseline numbers sound good"): base HP 12650 bp, +200 bp a depth; Undercroft (`undercroft` in `foes.json`) HP 20700 bp, +300 bp a depth, +2 bp a depth squared. `shipped` in the lab is that, `base55-u1` is an alias, and `old-shipped` keeps the numbers before. Knobs are relative to the game's data (or absolute `hpBp`).

**Safe daily player, depth gained a week (mean; a player who never goes down and one who goes down only above 80% HP gain the same).**

| Foe numbers         | Wk 1-2 | Wk 3-4 | Wk 5-8 | Wk 9-16 | Wk 17-24 | Stuck weeks, wk 1-2 / 17-24 |
| ------------------- | -----: | -----: | -----: | ------: | -------: | --------------------------: |
| today's (`shipped`) |    1.0 |    2.2 |    1.2 |     0.5 |      0.2 |                   54% / 85% |
| `base45-u1`         |    5.2 |    6.5 |    6.8 |     6.8 |      6.8 |                     2% / 0% |
| `base55-u1`         |    4.4 |    6.3 |    6.6 |     6.6 |      6.6 |                     6% / 0% |
| `base65-u1`         |    3.4 |    6.0 |    6.5 |     6.4 |      6.3 |                    14% / 0% |

Weekly players (2 or 3 runs a week, `base55-u1`): 0.1 / 0.7 / 1.4 / 1.8 / 1.7 a week, stuck (no gain in a week) in 95% of weeks 1-2 and about 10% of weeks 9 to 24. Today's numbers: 0.0 / 0.1 / 0.2 / 0.3 / 0.1. Options: base `45`, `55` and `65` are the share of today's foe HP (curve +2% a depth, no square); `u1` is the Undercroft at 90% HP, +3% a depth and +0.02% a depth squared (`SCENARIOS` in `dungeonMeasure.ts`). A daily player cannot gain more than 7 a week (one run a day), so 6.6 is a clear rate of about 94%.

**Base floor clear rate, safe daily player.**

| Foe numbers | Depth 1-4 | 5-7 | 8-12 | 13-20 | 21-40 | 41+ |
| ----------- | --------: | --: | ---: | ----: | ----: | --: |
| today's     |       20% | 23% |  18% |    4% |    1% |   - |
| `base55-u1` |       49% | 71% |  86% |   95% |   95% | 94% |

**The descent choice, `base55-u1`: the chance to beat the keeper of Undercroft level 1 by the team's share of HP at the end of the base floor (a knocked-out creature counts 0, before the way down revives it), and the share of floor-ends in each state.**

| Depth |               | <40% | 40-60% | 60-80% | >80% | all |
| ----- | ------------- | ---: | -----: | -----: | ---: | --: |
| 8-12  | floor-ends    |  11% |    12% |    30% |  48% |     |
|       | level 1 clear |   3% |    11% |    26% |  61% | 39% |
| 13-20 | floor-ends    |   6% |    10% |    24% |  60% |     |
|       | level 1 clear |   2% |    12% |    25% |  65% | 46% |
| 21-40 | floor-ends    |   5% |     8% |    20% |  67% |     |
|       | level 1 clear |   1% |     4% |    12% |  43% | 31% |
| 41+   | floor-ends    |   2% |     5% |    17% |  75% |     |
|       | level 1 clear |   0% |     2% |     6% |  20% | 16% |

By creatures knocked out at the floor's end (depth 8 to 12): 0 clears 46%, 1 clears 8%, 2 or more clear 2% (80% / 15% / 4% of floor-ends). Today's numbers: 7% overall at depths 8 to 12 (2% to 22% by state) and 1% at 13 to 20: the choice exists only for a good state and almost never pays.

**The Undercroft by depth (same state bucket).** Level 1 above falls with depth in every state (>80%: 61 / 65 / 43 / 20%). Level 2 (played as if the floor were cracked; its state is the team's when level 1's keeper fell) is easier than level 1 here, because a deeper level has two floors against the first level's two to five, and only a team that won level 1 gets there: >80%: 89 / 88 / 85 / 71%, <40%: 14 / 18 / 20 / 8%. It falls with depth only at 41+.

**Going down, per attempt, `base55-u1`, depth 8 to 12** (units are Bait + Essence + scrap in the pack):

| Team state | Win level 1 | Gain (units, gear) | Loss on a defeat (units) |
| ---------- | ----------: | ------------------ | -----------------------: |
| <40%       |          3% | 0.5, 0.03          |                      7.1 |
| 40-60%     |         11% | 1.8, 0.09          |                      7.7 |
| 60-80%     |         26% | 4.3, 0.20          |                      6.3 |
| >80%       |         61% | 10.4, 0.49         |                      3.4 |

Depth 41+, >80%: gain 5.6 units and 0.16 gear against a loss of 10.9 units: going down late has a worse trade, as it should.

**What a cleared run pays by depth (the game's rules, a multiple of depth 1).** Experience does not grow with depth (`RULES.xp.dungeon`: depth adds nothing) and the pack is flat per room (a landmark depth adds Essence 2 and scrap 2). Depth improves the gear and supply: item level 1 at depth 1, 2 at depth 4, 3 at depth 8, 11 at depth 21, 20 at depth 60 (a landmark adds 3); rare and epic odds 20% at depth 1, 24% at depth 8, 54% at depth 14 (landmark); good and great supplies 0% at depth 1, 31% at depth 8, 75% from depth 30. A depth picker's "2.4x XP" would be 1.0x XP today; its "loot" scalar has to come from the gear and supply tier. A safe daily player who steps back 2 or 4 depths after a wipe (a replay clears nothing new, so depth gain does not depend on how far back) gains 0.2 to 0.6 a week less (`base55-u1`: 3.8 / 5.9 / 6.4 / 6.2 / 6.2 against 4.4 / 6.3 / 6.6 / 6.6 / 6.6): the replay is a day not spent at the best depth.

**A four-slot team (lab only, `report -- --four-slot`).** The dungeon's arena is one row of three. A fourth slot has no single board, so the lab played one row of four (the main one: the foe still acts once a round), two rows of two (the foe acts twice a round, a harder fight) and three as the reference, with the same foes. The best teams from the lab search, over depths 4, 12 and 24 and uniform levels 15 and 25, at `base55-u1`, no bench:

| Board     | Objective  | Clear | Level 1 | Level 2 |  KOs |
| --------- | ---------- | ----: | ------: | ------: | ---: |
| three     | base floor |   98% |     33% |     20% | 1.43 |
| four wide | base floor |   99% |     51% |     43% | 1.01 |
| three     | Undercroft |   96% |     67% |     47% | 1.52 |
| four wide | Undercroft |  100% |     77% |     64% | 1.40 |

(Level 1 and 2 over depths 8 and deeper.) Of 10 best teams of four, 2 bring one of each of the four roles (Setter, Payoff, Guard, Support); the mean is 3.0 different roles (three: 2.6), and no two best teams are the same line. Where they stand: slot 1 is a Setter in 7 of 10, slot 4 a Payoff in 9 of 10, the Guards and Supports in the middle (three: Payoff last in 9 of 10, Setter first in 7). With the foe HP scaled by 4/3 so each creature faces the same HP, four still clears 100% and beats level 1 96% (base objective) and clears 99% and beats level 1 98% (Undercroft objective) at depth 12, level 25. Two by two: 98% clear and 91% / 73% on level 1 / 2 for the base objective, with 1.55 knocked out. Reading: a fourth slot makes the team stronger, so the foes would need about 4/3 the HP to hold the same difficulty, and the best teams are a Setter at the front and a Payoff at the back with the other two slots flexible rather than one of each role. Which board a four-slot dungeon should have is Misa's call.
