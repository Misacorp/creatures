# Luck in the finale

Status: **measurement and prototype, 2026-10-11**. Nothing is switched on. Misa asked (see "Ability weight, defence and luck" in `decisions.md`) that player skill push the odds and not decide them, and that a roster should neither always win nor always lose. This note measures where we are and what a luck mechanic would have to look like.

Tool: `node packages/sim/scripts/luck.mjs [--quick] [--seeds N] [--search N] [--passes N] [--cases N] [--stages finale|all] [--luck "key=value,...;key=value,..."]` (code in `packages/sim/src/luck.ts`). Numbers below are from seed `luck`, 120 finale inputs, 200 seeds each.

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
