# Luck in the finale

Status: **measurement and prototype, 2026-10-11** (second study at the end: crits, boss crits, knockouts and guards). Nothing is switched on. Misa asked (see "Ability weight, defence and luck" in `decisions.md`) that player skill push the odds and not decide them, and that a roster should neither always win nor always lose. This note measures where we are and what a luck mechanic would have to look like.

Tool: `node packages/sim/scripts/luck.mjs [--quick] [--seeds N] [--search N] [--passes N] [--cases N] [--stages finale|all] [--retune] [--json] [--luck "key=value,...;key=value,..."]` (see the second study for the extra keys `bossAtkBp` and `ko`) (code in `packages/sim/src/luck.ts`). Numbers below are from seed `luck`, 120 finale inputs, 200 seeds each.

## What was measured

- **Inputs:** economy sims of 5, 7, 10, 12 and 15 players (3 sims each, rosters at week 4 and week 8, all four bosses) signed up as in the raid sweep and played through Phase 1 and Phase 2. Each finale input is fixed: roster, row, boss, HP pool left, adaptation and every ability at its default round. Groups by players signed up: small (4 or fewer, 11 inputs), **typical (5 to 10, 66 inputs)**, large (11 to 15, 43 inputs).
- **Win probability** of an input: the share of 200 seeds in which the finale is won.
- **Skilled timing** (proxy for perfect ability timing): for each ability in turn, try every fire round 1 to 12 and keep the best, two passes, found on separate seeds. This is an upper bound: it knows the whole roster and (with luck) the dice's distribution, which real players do not.
- **Whole week:** the same with luck in Phase 1, Phase 2 and the finale (so the pool the finale starts from varies too), 100 seeds.

## Where randomness comes from today: nowhere inside a fight

`simulateFight` never draws from its RNG. The RNG is only handed to mutator hooks, and no shipped mutator uses it.

- Turn order ties break by position. The boss's normal attack goes to the first living creature of the first zone with one, guards first. Lightning Rod strikes the highest Attack, ties by position. Gimmicks fire on fixed rounds. Marks, reactions, support buffs and shields are all deterministic.
- The seed stored with every fight changes nothing. Checked: 200 seeds on every sample input gave the same result every time (a test pins that any seed gives identical events).
- What does vary between two weeks is the input: sign-ups, sign-up order (placement), who trained what, which boss. Players cannot get the same input twice, but a given input is a foregone conclusion.
- The boss barely matters for the outcome either: in the sample about 2 of 29 creatures are knocked out per finale, and removing the boss's attack entirely changes damage by 0.2%. So defence and boss-side luck cannot move the odds today (consistent with "defence stays as it is, harder bosses later").

## Numbers with the shipped rules

| Typical group (5 to 10 signed up, 66 inputs)              | Shipped rules                                                |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| Win probability of an input                               | exactly 0% or 100%                                           |
| Inputs decided (5% or less, or 95% or more)               | **100%** (37 lose, 29 win)                                   |
| Inputs between 15% and 85%                                | 0%                                                           |
| Average p(1-p) (0.25 is a coin flip, 0 is all or nothing) | **0.000**                                                    |
| With skilled timing                                       | 88% win, **+44 points**; 44% of inputs flip from loss to win |

Small groups (4 or fewer): 100% decided, 82% win, skilled +18. Large (11 to 15, including the 15-player cap): 100% decided, 70% win, skilled +26.

So today **every finale is decided by the input**, and ability timing alone flips 44% of typical inputs. Finale damage over the boss HP left (1.0 is break-even): typical p10 0.74, median 0.97, p90 1.76. The standard deviation of the log of that across all 120 inputs is 0.38 (0.28 within a boss, week and size cell), so rosters differ a lot; luck has to be about that big to open most inputs.

Side finding (not luck): the median finale ratio differs by boss (Cinder Wyrm 0.99, Thornmother 1.12, Tidal Colossus 1.20, Storm Sovereign 1.27) and by size (typical 0.97, small and large 1.16). Centring every boss and size on 1.0 would need boss HP of roughly +0% (Cinder Wyrm), +12%, +20% and +27%, and about +16% for the large and small groups, a few percent less for typical. This is independent of luck and the sample is small, so check it with the full `pnpm sim` before acting.

## What was prototyped (default off)

`RULES.combat.luck` (all zero) and an optional `luck` on the fight input (`LuckConfig`, validated by the engine). **The engine uses only the `luck` its input carries; absent means no luck**, so inputs stored before luck existed replay exactly whatever the rules say later. Whoever builds a live input (the worker) copies `RULES.combat.luck` in, and the stored input then records what the fight used. Dice are drawn from the injected RNG at the start of every round for every slot, whatever happens in the fight, so a creature's roll depends only on the seed, the round and its slot. That keeps the live finale's prefix property (rounds 1..r depend only on abilities fired by round r) and means ability timing never shifts anyone's dice.

1. **Crit:** `critChanceBp` per hit, `critBp` extra damage (added to the hit's bonus, so a crit that cashes a reaction is multiplied by it). The hit event carries `crit: true` ("Critical!" in `describeEvent`) and `luckBp`.
2. **Spread:** every hit multiplied by 1 + u, u uniform in plus or minus `spreadBp`. Hit event carries `luckBp`.
3. **Surge and Slump (Fortune):** each round with chance `surgeChanceBp` a Surge starts (all player damage +`swingBp`), with chance `slumpChanceBp` a Slump (-`swingBp`), lasting `swingRounds` rounds; none can start while one runs. The `round_start` event carries `luck: { kind, bp, rounds }` on the round it starts, and every hit inside carries `luckBp`.

New fields are optional and extra, so the current client keeps working (its event check only needs `t` and `round`); showing "Critical!" and "Surge!" in the live view and replay is client work still to do.

## Results

Typical group, shipped rules versus each setting. "Finale only" is the input fixed as above with luck in the finale; "whole week" has luck in all three stages.

| Setting                                                   | Seed-to-seed spread of finale damage | Mean damage change | Decided (finale only) | Between 15% and 85% (finale only) | Decided (week) | Between 15% and 85% (week) | Mean p(1-p) (week) | Skilled uplift (finale only / week) |
| --------------------------------------------------------- | -----------------------------------: | -----------------: | --------------------: | --------------------------------: | -------------: | -------------------------: | -----------------: | ----------------------------------: |
| Shipped rules                                             |                                   0% |                 0% |                  100% |                                0% |           100% |                         0% |              0.000 |                           +44 / +44 |
| Crit 15%, +50%                                            |                                 1.5% |                +7% |                   94% |                                5% |            91% |                         8% |              0.018 |                           +34 / +28 |
| Crit 20%, +100%                                           |                                 3.0% |               +19% |                   86% |                                6% |            95% |                         5% |              0.012 |                            +24 / +3 |
| Spread plus or minus 30%                                  |                                 1.8% |                 0% |                   92% |                                6% |            89% |                         8% |              0.019 |                           +42 / +39 |
| Surge and Slump 17% each, plus or minus 35%, 3 rounds     |                                12.3% |                 0% |                   48% |                               35% |            36% |                        53% |              0.122 |                           +32 / +28 |
| Surge and Slump 20% each, plus or minus 50%, 3 rounds     |                                18.3% |                +1% |                   32% |                               48% |            14% |                        68% |              0.157 |                           +27 / +24 |
| **Surge and Slump 17% each, plus or minus 60%, 3 rounds** |                                21.6% |                 0% |                   27% |                               59% |         **8%** |                    **74%** |              0.176 |                       +25 / **+21** |
| Surge and Slump 15% each, plus or minus 70%, 3 rounds     |                                23.7% |                +1% |                   21% |                               65% |             3% |                        77% |              0.181 |                           +24 / +19 |

(Surge only, never a Slump: 20%, +50%, 3 rounds gave an 8% spread but a +19% mean and 62% decided; it only makes the boss easier and has to be paid for with boss HP, so it was dropped.)

Recommended setting, by group (whole week, luck in all stages):

| Group                     | Decided | Between 15% and 85% | Mean p(1-p) | Skilled uplift (week) | Skilled uplift (finale only) |
| ------------------------- | ------: | ------------------: | ----------: | --------------------: | ---------------------------: |
| Small (4 or fewer)        |     18% |                 64% |       0.163 |                  +9.5 |                        +11.3 |
| **Typical (5 to 10)**     |      8% |                 74% |       0.176 |                 +20.8 |                        +25.3 |
| **Large (11 to 15, cap)** |     14% |                 72% |       0.163 |                 +16.1 |                        +18.8 |

Luck in the finale only (Phase 1 and 2 unchanged, whole-week run): typical decided 29%, between 15% and 85% 59%, skilled +25; large decided 28%, in band 51%, skilled +20.

## Why per-hit luck cannot do it

A finale has several hundred hits, and independent per-hit luck averages out: crit at 20% for +100% moves total damage by only 3% (one standard deviation), a plus or minus 30% spread by 1.8%. Inputs differ from each other by 28% to 38% (standard deviation of the log), so those leave 86% to 94% of inputs decided. A visible mechanic has to be correlated or lumpy. Surge and Slump streaks are: about two events per fight, each moving about 14% of the damage. Luck in Phase 1 and Phase 2 helps a lot as well, because the finale only has to take what is left of the pool (a median 43% for typical groups, 28% to 49% from the 10th to the 90th percentile), so a swing earlier in the week moves the finale's break-even about two to three times as much: the same setting goes from 27% decided (finale only) to 8% decided (all stages).

## Recommendation

Add one mechanic, **Fortune: Surge and Slump streaks**, and apply it to Phase 1, Phase 2 and the finale.

- Each round, while no streak is running: 17% chance of a Surge ("Fortune smiles: everyone hits 60% harder for 3 rounds") and 17% of a Slump ("Bad omen: everyone hits 60% weaker for 3 rounds"). Settings: `surgeChanceBp: 1700, slumpChanceBp: 1700, swingBp: 6000, swingRounds: 3`.
- It is symmetric, so the average damage does not move (0% to +1% in every group): **no boss HP retune is needed** for it. (Crit would need boss HP +7% to +19% to keep the same centre, for almost no gain.)
- It is visible (one event, one banner) and it gives skill something to do: the live finale shows the Surge when its round starts and Fire takes effect next round, so a present player can hold a strong ability for a Surge or save a Shield Wall for a Slump. The skilled-timing uplift for typical groups falls from +44 points to about +21 (week) and the large and small groups land at +16 and +10, the "clear but not decisive" band.
- Result for typical groups: 8% of inputs decided (was 100%), 74% between 15% and 85%, mean p(1-p) 0.18 (was 0).
- A milder version (20% each, plus or minus 50%) leaves 14% decided and 68% in the band, skilled uplift +24; the 70% version leaves 3% decided and 77% in the band, uplift +19. Misa can pick the feel; the table has the dial.
- Optional flavour on top: crits ("Critical!") change little (3% spread) and push damage up; if wanted, scale boss HP by 1 + chance x bonus (a 15% chance of +50% is +7.5%). Not recommended as a luck source.

### Caveats

- **Perfect timing is an upper bound**; real players find part of it, so the real uplift is smaller than the numbers above. If the target is +10 to +20 for real players, the 60% or 70% settings are the ones with room.
- **The sample is small** (66 typical inputs; the three sims per size are not independent) and the greedy timing search is cheap (8 search seeds, 2 passes), so treat the figures as plus or minus a few points.
- A swing of plus or minus 60% is large; a Slump in a lost-by-a-hair finale will feel bad and needs good copy ("Bad omen"), and a Slump in Phase 1 or Phase 2 only matters through the pool, which players see before Sunday.
- Boss HP is not retuned anywhere here. With luck on, the typical group's win rate is 49%, large 65% to 67%, small 67% to 70%: the size and boss differences above remain and would need the HP retune listed there.

## Switching it on later (work not done here)

1. The worker copies `RULES.combat.luck` into every fight input it builds and stores (`raid-resolve.ts`, `raid-live.ts`); tests for stored and replayed inputs.
2. Client: show "Critical!" (hit `crit`), and a Surge or Slump banner (`round_start.luck`) in the live view, replay and Discord summary.
3. Set the numbers in `RULES.combat.luck`, re-run `pnpm sim` and the full luck study, and retune boss HP per boss and size.
4. Record the decision in `decisions.md`.

## Second study: crits, boss crits, knockouts and guards (2026-10-11)

Misa prefers crit mechanics to Fortune streaks: every action can crit from a small baseline, crit chance and crit damage are stats with caps, and bosses crit too. The first study showed that per-hit crits average out. The hypothesis tested here: crits matter once **knockouts** happen, because a boss crit that knocks out a key creature removes all its future hits (correlated variance), and a harder boss that hits harder would make guards and shields count. Everything below is default off, and no shipped boss or creature value was changed (only study parameters).

### What was built (all default off, old inputs replay exactly)

- **Crit stats per creature.** `RULES.combat.luck` holds the baseline and caps: `critChanceBp` (baseline chance, 0 = crits off; study value 500), `critBp` (extra damage, 5000), `critMaxChanceBp` 3000 and `critMaxBp` 15000 (caps for creatures and boss). A creature's stats are baseline plus its species bonus, capped (`creatureCritStats`). The bonus is an optional `crit: { chanceBp, damageBp }` on a species in the content (schema-validated), which `makeSlot` copies into the fight slot, so a stored row keeps what the fight used. Four payoff species (Cindle, Pyrelynx, Stormray, Tempestray) carry +5% chance and +25% damage as a glass-cannon archetype (10% and +75% in total). Inert while luck is off.
- **Boss crits.** `bossCritChanceBp` and `bossCritBp` in the luck config, plus an optional `crit` bonus on the boss in the content (`bossCritStats`, same caps). The boss's normal attack and its gimmick hits crit; a reflected reaction never does. Dice are drawn at the start of every round for every slot (one set for its normal attack, one for gimmicks, indexed by the target's slot) after the player dice, so switching boss crits on never moves a player die, and the prefix property holds (tests).
- **Events.** `hit` carries `crit: true` and `critBp` (the crit's extra damage, which now differs per creature); `boss_hit` carries `crit: true` and `critBp`; `describeEvent` adds "Critical!" to both. A stored `luck` from before these fields (no caps, no boss crit) means no cap and no boss crit and replays exactly (test).
- **Prototype extra, study only:** `bossRandomTargetBp`, the chance that the boss's normal attack picks a random living creature of the whole row instead of the first in front (a guard in the target's zone still takes the hit). It exists to test the hypothesis fairly, because the shipped boss always hits the front first.
- **Study tool.** New `--luck` keys `bossAtkBp` (boss Attack in basis points of shipped, 30000 = x3) and `ko=N` (finds the boss Attack that knocks out N creatures per finale on average in the typical group, ability timing at default, bisection on a sample of the typical inputs), `--retune` (scales the finale pool and the weekly pool per group by the mean damage change, so every setting keeps the shipped mean damage and the win probabilities are about the shape, not a shifted centre) and `--json`. New measures per input: knockouts per finale, best-timing of only the Shield Walls (basic and guard abilities, found on separate seeds), the win probability with every Shield Wall ability left out and with each one left out in turn, with the guard role taken away from every guard and from each guard in turn (a guard fights on as a plain payoff, so it loses its +30% HP and the interception), all for the finale only and for the whole week where it makes sense. Summaries per group, per snapshot week (4 and 8) and, for the typical group, per boss. Run as before: `node packages/sim/scripts/luck.mjs --retune --json --luck "critChanceBp=500,bossCritChanceBp=500,ko=4"`. One setting takes about 10 minutes on one core at 200 seeds, so run settings in parallel.

### Setup

Same sample as the first study: 120 finale inputs (11 small, 66 typical of which 35 at week 4 and 31 at week 8, 43 large), 200 seeds per input (100 per whole-week run), timing search 16 seeds x 2 passes on separate seeds. "Decided" means a win probability of at most 5% or at least 95%. "Skilled uplift" is perfect-timing win probability minus default-timing, an upper bound. All runs use `--retune`. The boss HP retune is the mean damage change in the next table (a setting that adds 5% damage needs 5% more boss HP to keep the centre). The boss Attack multiplier is chosen once, on the typical group, to give the stated knockouts; "knockouts per finale" is the average over the typical inputs, counted in the finale as played.

### Results, typical group (5 to 10 signed up)

(a) crits 5% / +50%, with the four archetype species. (b) adds boss crits 5% / +50%. (c) adds boss Attack for about 2, 4 or 6 knockouts. The last rows are extras to find out how far crits and knockouts can go and what the smallest extra is.

| Setting (typical group, 66 inputs)                       | Boss Attack | Mean damage change = boss HP retune | Seed spread of damage | Knockouts per finale | Decided (finale) | In 15-85% (finale) | Decided (week) | In 15-85% (week) | Mean p(1-p) (finale / week) | Skilled uplift in points (finale / week) |
| -------------------------------------------------------- | ----------: | ----------------------------------: | --------------------: | -------------------: | ---------------: | -----------------: | -------------: | ---------------: | --------------------------: | ---------------------------------------: |
| Shipped rules                                            |          x1 |                               +0.0% |                  0.0% |                  1.8 |             100% |                 0% |           100% |               0% |               0.000 / 0.000 |                                +44 / +44 |
| (a) crits 5% / +50%                                      |          x1 |                               +4.8% |                  1.5% |                  1.8 |              92% |                 6% |            89% |               6% |               0.016 / 0.018 |                                +41 / +40 |
| (b) + boss crits 5% / +50%                               |          x1 |                               +4.7% |                  1.5% |                  1.8 |              91% |                 6% |            89% |               9% |               0.017 / 0.021 |                                +41 / +39 |
| (c) + boss Attack for 2 knockouts                        |       x1.28 |                               +4.4% |                  1.6% |                  2.2 |              92% |                 6% |            89% |               6% |               0.016 / 0.016 |                                +40 / +37 |
| (c) + boss Attack for 4 knockouts                        |       x3.03 |                               +1.5% |                  1.7% |                  4.2 |              94% |                 3% |            86% |               8% |               0.010 / 0.022 |                                +41 / +31 |
| (c) + boss Attack for 6 knockouts                        |       x4.64 |                               -1.4% |                  1.7% |                  5.8 |              94% |                 2% |            92% |               6% |               0.010 / 0.016 |                                +39 / +22 |
| crits and boss crits 10% / +100%, 4 knockouts            |       x3.01 |                               +9.6% |                  3.2% |                  4.4 |              85% |                 8% |            80% |              17% |               0.021 / 0.036 |                                +39 / +31 |
| (b) + random boss target, 6 knockouts                    |       x4.06 |                               -2.7% |                  3.9% |                  5.8 |              82% |                14% |            85% |              12% |               0.036 / 0.028 |                                +36 / +29 |
| (b) + 10 knockouts                                       |       x8.16 |                               -9.4% |                  1.8% |                  8.9 |              88% |                11% |            94% |               5% |               0.025 / 0.009 |                                +40 / +15 |
| (b) + random boss target, 10 knockouts                   |       x6.46 |                              -11.6% |                  5.6% |                  9.1 |              74% |                17% |            74% |              17% |               0.044 / 0.040 |                                +39 / +27 |
| **(b) + Surge/Slump 17% / 60%, 4 knockouts**             |       x3.22 |                               +1.6% |                 20.3% |                  4.3 |              24% |                61% |             9% |              74% |               0.136 / 0.166 |                                +29 / +24 |
| (b) + Surge/Slump 17% / 45%, 4 knockouts                 |       x3.04 |                               +1.9% |                 15.3% |                  4.2 |              42% |                41% |            26% |              56% |               0.106 / 0.136 |                                +32 / +27 |
| (b) + Surge/Slump 17% / 60% + random target, 4 knockouts |       x3.05 |                               -0.1% |                 21.2% |                  4.2 |              27% |                65% |            11% |              73% |               0.142 / 0.166 |                                +28 / +23 |

### By group and week (week 4 and week 8 rosters)

| Setting                          | Measure                        | Small (4 or fewer, 11) | Typical week 4 (35) | Typical week 8 (31) | Typical (66) | Large (11-15, 43) |
| -------------------------------- | ------------------------------ | ---------------------: | ------------------: | ------------------: | -----------: | ----------------: |
| Shipped                          | inputs                         |                     11 |                  35 |                  31 |           66 |                43 |
|                                  | decided / in band (finale)     |              100% / 0% |           100% / 0% |           100% / 0% |    100% / 0% |         100% / 0% |
|                                  | decided / in band (week)       |              100% / 0% |           100% / 0% |           100% / 0% |    100% / 0% |         100% / 0% |
|                                  | mean p(1-p) (week)             |                  0.000 |               0.000 |               0.000 |        0.000 |             0.000 |
|                                  | skilled uplift (finale / week) |              +18 / +18 |           +43 / +43 |           +45 / +45 |    +44 / +44 |         +26 / +26 |
|                                  | knockouts per finale           |                    0.7 |                 2.2 |                 1.3 |          1.8 |               1.8 |
| (b) crits and boss crits         | inputs                         |                     11 |                  35 |                  31 |           66 |                43 |
|                                  | decided / in band (finale)     |              82% / 18% |            89% / 9% |            94% / 3% |     91% / 6% |          98% / 0% |
|                                  | decided / in band (week)       |              82% / 18% |           89% / 11% |            90% / 6% |     89% / 9% |          93% / 0% |
|                                  | mean p(1-p) (week)             |                  0.042 |               0.026 |               0.014 |        0.021 |             0.008 |
|                                  | skilled uplift (finale / week) |              +19 / +18 |           +41 / +38 |           +42 / +40 |    +41 / +39 |         +26 / +26 |
|                                  | knockouts per finale           |                    0.7 |                 2.2 |                 1.3 |          1.8 |               1.9 |
| (c) boss Attack for 4 knockouts  | inputs                         |                     11 |                  35 |                  31 |           66 |                43 |
|                                  | decided / in band (finale)     |              100% / 0% |            91% / 3% |            97% / 3% |     94% / 3% |          98% / 0% |
|                                  | decided / in band (week)       |              100% / 0% |            86% / 9% |            87% / 6% |     86% / 8% |          93% / 7% |
|                                  | mean p(1-p) (week)             |                  0.000 |               0.022 |               0.022 |        0.022 |             0.013 |
|                                  | skilled uplift (finale / week) |               +18 / +0 |           +42 / +30 |           +40 / +32 |    +41 / +31 |         +25 / +22 |
|                                  | knockouts per finale           |                    2.4 |                 4.8 |                 3.7 |          4.2 |               4.0 |
| **Surge/Slump 17% / 60% on top** | inputs                         |                     11 |                  35 |                  31 |           66 |                43 |
|                                  | decided / in band (finale)     |              18% / 55% |           23% / 57% |           26% / 65% |    24% / 61% |         23% / 53% |
|                                  | decided / in band (week)       |              18% / 55% |           14% / 74% |            3% / 74% |     9% / 74% |         16% / 74% |
|                                  | mean p(1-p) (week)             |                  0.133 |               0.163 |               0.170 |        0.166 |             0.165 |
|                                  | skilled uplift (finale / week) |              +19 / +13 |           +30 / +24 |           +28 / +24 |    +29 / +24 |         +22 / +19 |
|                                  | knockouts per finale           |                    2.7 |                 4.8 |                 3.7 |          4.3 |               4.2 |

Small groups are hurt by a boss Attack chosen for typical groups: with x3 a 9-slot row loses a fifth of the row to knockouts and the whole week is lost in Phase 1 or 2 (skilled uplift +0). A lethality dial would have to scale with the row.

### How much guards and shields now matter (typical group)

Points of win probability. "Best-timed Shield Walls" is the uplift from timing only the basic Shield Wall and the guards' abilities, against default timing. "Left out" is the win probability lost when every Shield Wall ability is removed (or one, or the guard role of every guard, or of one guard); every typical input has a guard and a Shield Wall ability.

| Setting (typical group)                            | Knockouts per finale | Best-timed Shield Walls (finale / week) | All Shield Walls left out (finale / week) | One Shield Wall left out (finale) | Guard role removed from all guards (finale / week) | From one guard (finale) |
| -------------------------------------------------- | -------------------: | --------------------------------------: | ----------------------------------------: | --------------------------------: | -------------------------------------------------: | ----------------------: |
| Shipped rules                                      |                  1.8 |                           +10.6 / +10.6 |                               +3.0 / +3.0 |                              +0.5 |                                        +0.0 / -1.5 |                    -0.4 |
| (a) crits                                          |                  1.8 |                             +8.4 / +8.1 |                               +4.5 / +5.0 |                              +0.5 |                                        -0.2 / -0.2 |                    -0.1 |
| (b) + boss crits                                   |                  1.8 |                             +8.7 / +8.1 |                               +4.6 / +5.1 |                              +0.5 |                                        -0.1 / -0.2 |                    -0.1 |
| (c) boss Attack for 2 knockouts                    |                  2.2 |                             +8.5 / +7.8 |                               +5.2 / +6.7 |                              +0.6 |                                        -0.0 / +0.1 |                    -0.1 |
| (c) boss Attack for 4 knockouts                    |                  4.2 |                             +8.8 / +9.7 |                              +8.6 / +10.3 |                              +0.7 |                                        +0.5 / +1.5 |                    +0.2 |
| (c) boss Attack for 6 knockouts                    |                  5.8 |                             +9.9 / +8.1 |                              +12.1 / +6.8 |                              +1.0 |                                        +1.4 / +2.3 |                    +0.6 |
| (b) + 10 knockouts                                 |                  8.9 |                            +16.3 / +5.2 |                              +12.8 / +6.7 |                              +1.7 |                                        +0.7 / +0.7 |                    +0.4 |
| (b) + random target, 6 knockouts                   |                  5.8 |                             +8.8 / +9.3 |                               +9.5 / +5.1 |                              +1.0 |                                        +0.6 / +0.7 |                    +0.4 |
| (b) + random target, 10 knockouts                  |                  9.1 |                            +14.0 / +8.0 |                               +8.3 / +6.1 |                              +0.9 |                                        +1.0 / +1.5 |                    +0.3 |
| **Surge/Slump 17% / 60%, 4 knockouts**             |                  4.3 |                             +8.4 / +6.7 |                               +7.5 / +6.3 |                              +0.5 |                                        +0.4 / +1.6 |                    -0.0 |
| Surge/Slump 17% / 45%, 4 knockouts                 |                  4.2 |                             +9.6 / +8.6 |                               +7.3 / +7.0 |                              +0.7 |                                        +0.5 / +1.6 |                    +0.1 |
| Surge/Slump 17% / 60% + random target, 4 knockouts |                  4.2 |                             +7.4 / +5.8 |                               +6.7 / +5.5 |                              +0.7 |                                        +0.2 / +0.3 |                    +0.0 |

### Per boss (typical group)

| Setting (typical group)            | Boss            | Knockouts | Mean damage change | Decided / in band (finale) | Decided / in band (week) | Skilled uplift (finale / week) | All Shield Walls left out (finale) |
| ---------------------------------- | --------------- | --------: | -----------------: | -------------------------: | -----------------------: | -----------------------------: | ---------------------------------: |
| (c) 6 knockouts                    | tidal-colossus  |       4.8 |              -0.2% |                   93% / 0% |                 93% / 7% |                      +40 / +13 |                              +13.7 |
| (c) 6 knockouts                    | cinder-wyrm     |       8.3 |              +1.1% |                   94% / 0% |                100% / 0% |                      +59 / +50 |                               +6.1 |
| (c) 6 knockouts                    | thornmother     |       2.2 |              +3.3% |                   88% / 6% |                81% / 12% |                      +27 / +12 |                              +10.2 |
| (c) 6 knockouts                    | storm-sovereign |       7.2 |              -8.9% |                  100% / 0% |                 94% / 6% |                      +27 / +12 |                              +18.6 |
| (b) + random target, 6 knockouts   | tidal-colossus  |       5.0 |              +0.2% |                  79% / 14% |                86% / 14% |                      +37 / +28 |                              +12.8 |
| (b) + random target, 6 knockouts   | cinder-wyrm     |       7.9 |              -0.1% |                  89% / 11% |                 94% / 6% |                      +55 / +52 |                               +7.2 |
| (b) + random target, 6 knockouts   | thornmother     |       2.1 |              +0.9% |                  75% / 19% |                75% / 19% |                      +22 / +13 |                              +10.0 |
| (b) + random target, 6 knockouts   | storm-sovereign |       7.7 |             -10.8% |                  83% / 11% |                83% / 11% |                      +29 / +21 |                               +8.6 |
| Surge/Slump 17% / 60%, 4 knockouts | tidal-colossus  |       3.2 |              +1.7% |                  21% / 50% |                 7% / 64% |                      +25 / +19 |                               +9.7 |
| Surge/Slump 17% / 60%, 4 knockouts | cinder-wyrm     |       6.8 |              +5.1% |                  22% / 56% |                 6% / 78% |                      +43 / +37 |                               +8.9 |
| Surge/Slump 17% / 60%, 4 knockouts | thornmother     |       1.3 |              +2.8% |                  12% / 81% |                 6% / 94% |                      +24 / +20 |                               +5.1 |
| Surge/Slump 17% / 60%, 4 knockouts | storm-sovereign |       5.1 |              -2.9% |                  39% / 56% |                17% / 61% |                      +22 / +18 |                               +6.6 |

### What the numbers say

1. **Crits at 5% / +50% move the odds very little and cost boss HP.** The seed-to-seed spread of finale damage is 1.5% and the mean damage rises 4.8% (a crit on a reaction hit multiplies the whole reaction, and the four archetype species crit more). Typical inputs: 92% decided (100% before), 6% between 15% and 85%, mean p(1-p) 0.016. Boss crits at the same size change nothing measurable. The skilled uplift barely moves (+44 to +41). Boss HP would need about +5% to keep the centre.
2. **More lethality does not open outcomes.** Boss Attack x1.3, x3.0 and x4.6 (2, 4 and 6 knockouts) leave 92%, 94% and 94% decided and 2% to 6% in the band, with a seed spread of damage of 1.6% to 1.7%. The hypothesis fails because the shipped boss hits the front first and guards first, deterministically: the creatures it knocks out are the low-Attack guards and front-row creatures, the same ones every seed, and what a knockout costs is small (damage falls about 6 points between zero and six knockouts, in the average, and only Storm Sovereign, whose Lightning Rod hits the highest Attack, loses 9%). A crit only changes which round a creature falls in. Lethality does cost small groups their week.
3. **Even random knockouts are not enough.** Letting the boss pick a random living creature (zones still guarded) doubles the spread (3.9% at 6 knockouts, 5.6% at 9) and moves 14% to 17% of inputs into the band, with 74% to 82% still decided; the 17% case knocks out 44% of the row. Arithmetic agrees: a knockout removes about 1/20 of the row for about half of the rounds, 2% to 3% of the damage, so a dozen random knockouts move total damage by a few points while inputs differ from each other by 28% to 38%. Stronger crits (10% / +100%, caps still 30% / +150%) give 3.2% spread, 85% decided, 8% in band, and +9.6% damage to pay for.
4. **Shield Walls come to count, the guard role does not.** With the shipped boss, leaving out every Shield Wall costs 3 points and timing them well gains 11. At 4 knockouts leaving them out costs 8.6 points in the finale (10.3 over the whole week), at 6 knockouts 12.1 (6.8), so timing the Shield Walls well becomes a fifth to a third of all timing skill (+8.8 of +41 without streaks, +8.4 of +29 with them). One Shield Wall ability on its own is worth 0.5 to 1 point (1.7 at 9 knockouts), so it is a team effort, not a single creature's job. The guard role (the +30% HP and the interception) is worth at most 1.4 points in the finale in any setting (2.3 over the whole week), one guard at most 0.6, and about 1 even at 9 random knockouts: the one hit a round cannot take out enough, and a guard soaks hits that would have gone to an equally cheap front creature. **Making a boss hit harder alone does not make guard creatures count.** Untested ideas that would: a boss with several hits a round, hits that go to the highest Attack or a random creature while the guard intercepts them, and zone hits such as Undertow, which a guard cannot intercept today.
5. **Fortune streaks (Surge and Slump) are what opens the outcomes**, on top of crits and lethality: at 17% each and plus or minus 60% for 3 rounds, 61% of typical inputs are between 15% and 85% in the finale only and 74% over the whole week (24% and 9% decided), mean p(1-p) 0.136 and 0.166, skilled uplift +29 (finale) and +24 (week), which is the first study's result nearly unchanged. Plus or minus 45% leaves 41% and 56% in the band with an uplift of +32 and +27. Random targeting adds almost nothing on top (65% and 73%). By boss, Thornmother is the most open (81% in the band in the finale, 94% over the week) and Tidal Colossus the least in the finale (50%).

### Recommendation

The smallest set that gets typical inputs into the band is **Fortune streaks alone**: Surge and Slump at 17% each, plus or minus 60%, 3 rounds, in all stages (`surgeChanceBp: 1700, slumpChanceBp: 1700, swingBp: 6000, swingRounds: 3`). Crits, boss crits and boss lethality add almost nothing to the odds: they take typical inputs from 100% decided to 85% to 94% decided and put 2% to 8% of them in the band, and even random knockouts of nearly half the row leave 74% decided and 17% in the band. The 61% to 74% in the band that streaks give is out of their reach; what is missing is a correlated, team-wide swing, which only Fortune provides.

On top of that, in order of how much they are worth:

1. **Crits at 5% / +50% (the Misa-preferred flavour), with the four glass-cannon species and the caps.** Cheap, readable ("Critical!"), and about 5% more damage, so boss HP +5% in a package that includes them (on their own they take mean p(1-p) only from 0 to 0.016). Boss crits at 5% / +50% are free flavour (no measurable cost) and make a boss hit feel dangerous; optional.
2. **Boss Attack x3 (about 4 knockouts per finale) if shields should count now.** It takes the value of the Shield Walls from 3 to about 7.5 points (finale) and best-timed Shield Walls give +8 of the +29 timing uplift. The mean damage ends +1.6% (crit gains minus knockout losses), so typical groups need almost no boss HP retune. Misa said defence stays as it is for now, so leave the dial at x1 and turn it up per boss when harder bosses arrive. It does not make guard creatures themselves count (see 4 above).
3. **Boss HP retune** for the whole package (crits, boss crits, streaks, x3): typical +1.6%, small -7.7%, large +5.0%, plus the boss and size retune from the first study, which is independent.

With the package (crits, boss crits, streaks, x3) the typical numbers are: 24% decided and 61% in the band (finale), 9% and 74% (week), mean p(1-p) 0.166 (week), skilled uplift +29 (finale) and +24 (week). Perfect timing is an upper bound; real players will find only part of it, so the real uplift will be smaller than +24 to +29, plausibly inside the +10 to +25 target (not measured). A milder streak (17% / 45%) gives 56% in the band over the week but also more decided finales (42%), so 60% is the setting to ship if the band matters.

If Misa does not want streaks, **crits plus knockouts reach only 6% to 17% of inputs in the band, however hard the boss hits**. The minimal extra needed is then a swing that is shared by the whole team in a fight, which is what a streak is. Alternatives that would also be correlated (not tested): a per-fight luck roll (a "weather" or "omen" for the whole fight, drawn at the start), or crits that are big and rare enough to matter (not possible with 300 hits: a single hit would have to be worth tens of percent of the finale).

### Caveats

- The sample is small (66 typical inputs, three economy sims per size that are not independent); treat figures as plus or minus a few points. The knockout counts differ a lot by boss for one multiplier (1.3 to 8.3 at the x3 and x4.6 dials; Cinder Wyrm's speed order and reflect, Storm Sovereign's Lightning Rod).
- "Skilled timing" is perfect play found by search, and it also searches shield timing against the same dice distribution; it is an upper bound.
- The guard-role loss turns a guard into a plain payoff (its only difference is a bonus on reactions), which is not exactly neutral.
- Phase 1 and 2 get the same boss Attack in the whole-week columns, and the pool is retuned by the finale's damage change, so week numbers carry a little more noise than the finale-only ones.

### Switching it on later (work not done here)

The first study's list still applies. In addition: the worker copies `RULES.combat.luck` (with the baseline set to the study values) into every fight input; the client shows "Critical!" on hit and boss hit events (`crit`, `critBp`) and the species crit stats in the Collection; set the boss HP retune; record the decision in `decisions.md`.
