# Dungeon XP that grows with depth: what it does to the roster

A study, not a decision. The default model is unchanged (the dungeon still pays a flat 120 XP a run in `rules.ts`).

## The question

Combat v2 reports that on its dungeon runs creature XP will grow with depth (the owner's decision). For a top creature (in every room, a daily player, before treats and weather) the dungeon pays per day: week 1: 157, week 4: 373, week 8: 449, week 12: 503, week 24: 594. The same runs with no per-depth bonus (v1 rules, just deeper runs): 154 / 313 / 309 / 293 / 297. Their levers are `RULES.dungeon.depthRewards.xp` (`perDepthBp` 100, +1% a depth, `maxBp` 10000, +100% at most) and the base dungeon XP.

## How the lab models it

Two variants, off by default, switched by `ServerConfig.dungeonXp` (`src/dungeonXp.ts`): `'depth'` and `'v1'`. A run pays the curve's value for the week of the player's own life (week 1 is the first week since joining), interpolated linearly between the given weeks and held after week 24. The value is a daily player's one run a day, so it is a per-run amount; a weaker habit runs fewer runs (the lab's passes: one a day, up to three stored, none while away) and gets proportionally less, exactly as the flat 120 did. The top three creatures fight and each gets the full amount, as before. A third form, `{ perDepthBp, maxBp }`, is the lever study: the v1 column times `1 + min(maxBp, perDepthBp x depth) / 10000`, where depth is what the two given columns imply at the default lever (2, 19, 45, 72 at weeks 1, 4, 8, 12; 156 at week 24 assumed). At the default lever it gives the same numbers as the depth curve to within the interpolation.

Run it: `pnpm --filter @creatures/econ report -- --dungeon-xp-study --seeds 20 --levers` (about a minute). The tables below are its output: the mixed server of 8, 20 seeds, medians over players and seeds. "Two-week-old gap" is the gap to the 3rd best of the creatures a player has owned for at least 14 days (T-1, restated: within 5). "Bench median level" is the median level of everything below the top three. Weeks are the player's own weeks of play (a new player joins in week 6, so its week 4 is calendar week 9). The status of every target in `targets.ts` is judged on all the scenarios it needs, run with the variant.

## Reading

1. **The curve breaks T-1 for the daily player, because the dungeon only feeds the top three.** With flat 120 a daily player's two-week-old creatures are 100% within 5 levels of the 3rd best at week 4 and the median gap is 2.3. With the depth curve it is 85% (median gap 3.3), and by week 8 the gap is 8.0 (21% within 5); the top three are at level 30 at week 8 while the bench median is 17. The bench grows only by idle XP, which the dungeon does not change (bench median level: 15.0, 17.5, 21.5 at weeks 4, 8, 12 with the flat rule; 15.0, 17.3, 21.0 with the curve). More dungeon XP is XP for the team of three.
2. **The v1 column already does most of the harm.** It fails nothing at week 4 (100% for the daily player) but the gap at week 8 is 6.5 (29% within 5). The per-depth bonus is the smaller part at week 4 and week 8: the larger part is that a run pays 154 to 313 XP against the lab's 120. The flat base value is the lever that matters most; see below.
3. **Even the base misses a strict reading of T-1 at weeks 8 and 12.** With the flat 120, 64% of a daily player's two-week-old creatures are within 5 at week 8 and 55% at week 12. The shipped targets only judge the week 4 share (T-1a) and the 6th against the 3rd (T-1b), and both pass in the base. A strict "every profile, every week" reading fails for every column, including today's, so this study judges the T-1a bar (90% at week 4) for each profile and shows weeks 8 and 12.
4. **T-1a at week 4 per profile.** Base: all pass except the new player (65%, which fails the bar in the base too: a new player's early catches). Depth curve: daily 85%, every-other-day 86% and new 50% fail; active, weekend-off, weekly and returner (92%) pass. v1 curve: all pass but the new player (50%).
5. **Other targets.** With the depth curve T-1a, T-1b, T-6a and T-6b change from pass to fail. With the v1 curve T-1b, T-6a and T-6b change. (T-6, "the best creature is still growing in week 12", fails because the top creature is at the level cap (30) by week 8 for a daily player, four weeks earlier than today.) T-7b (a dead scrap pile) changed to fail with the v1 curve in a 10-seed run but not in the 20-seed run: treat it as noise-level. Every other target (T-2, T-3, T-4, T-7, T-8, T-9) keeps its status in both variants.
6. **Levers.** The grid (second table of the data) shows the week 4 share per profile for the lever settings, with T-1b and the daily player's median gap at weeks 8 and 12.
   - No setting of `maxBp` or `perDepthBp` passes T-1 at every profile and every week. The new player is at 50% in every row (55% at 75 bp), against 65% in the base, so it is the one profile that does not pass the T-1a bar under any depth XP. The daily player's T-1b spread at week 8 is 6.0 in every row, one over the limit of 5, including the row with no bonus at all (the v1 column): it is the size of the base XP, not the bonus, that fails it.
   - The week 4 bar (T-1a, daily and the other five profiles) passes with `perDepthBp` 100 and a cap of at most **1500** (+15%) for the daily player, and a cap of at most **500** (+5%) before the every-other-day player (93%) is also over 90%. Or with `perDepthBp` of **25** (+0.25% a depth) and no cap. At 50 and 75 bp the every-other-day player stays under (86%).
   - The daily player's median gap at weeks 8 and 12 never gets to 5 in any row (7.0 and 5.3 to 6.0 at best), because that needs the base XP to come down, not only the bonus.
7. **What would help instead** (not run): giving a creature the dungeon's depth XP only up to a cap near the level the team is at, or sharing a part of the run's XP with the bench (a post that lets the bench ride along), or lowering the base XP per run toward 120 as the bonus grows so the total stays near today's. These are design choices for Misa and combat v2, not implemented.

## Two more variants (asked for after the first draft)

- **B, deeper pays loot, XP grows only a little.** A run's XP is 120 x (1 + perDepthBp x depth), no cap: the flat base at any depth plus a small per-depth growth. Depth is the one inferred from the two columns (2, 19, 45, 72, 156 at weeks 1, 4, 8, 12, 24). Tried at 25 bp (+0.25% a depth: 121, 126, 134, 141 and 167 XP a run at weeks 1, 4, 8, 12, 24) and 50 bp (121, 131, 147, 163 and 214). In the code it is `{ perDepthBp, maxBp: Infinity, flatBase: true }`.
- **C, share with the bench.** The full depth curve, but of each run's amount above the flat 120, half stays with each fighter and the other half of the team's total (3 x the part above 120, halved) is spread evenly over every creature that is not on the team, as XP brought home (no catch-up, XP above a creature's bank is lost as always). In the code it is `dungeonXp: 'share'`. "At home" is read as every creature not in the team, whether it is at a post or not.

Per profile at weeks 4, 8 and 12 the rows are in the data below. In short (daily player; top / 3rd / median gap / bench median level):

|                 | Week 4                 | Week 8                 | Week 12              | Best reaches 30    |
| --------------- | ---------------------- | ---------------------- | -------------------- | ------------------ |
| flat 120 (base) | 19 / 19 / 2.3 / 15.0   | 25 / 25 / 4.0 / 17.5   | 29 / 29 / 5.0 / 21.5 | day 89 (week 13.7) |
| depth curve     | 22 / 21.5 / 3.3 / 15.0 | 30 / 30 / 8.0 / 17.3   | 30 / 30 / 5.5 / 21.0 | day 52 (week 8.4)  |
| v1 curve        | 21 / 20.5 / 3.8 / 15.0 | 29 / 28.5 / 6.5 / 17.0 | 30 / 30 / 6.0 / 22.0 | day 60 (week 9.6)  |
| B, 25 bp        | 19 / 19 / 2.8 / 15.0   | 25 / 25 / 4.0 / 17.0   | 29 / 29 / 5.0 / 21.5 | day 85 (week 13.1) |
| B, 50 bp        | 19 / 19 / 2.8 / 15.0   | 25 / 25 / 4.0 / 17.0   | 30 / 30 / 5.5 / 21.0 | day 84 (week 13.0) |
| C, share        | 20 / 20 / 3.0 / 15.0   | 28 / 27.5 / 5.5 / 18.0 | 30 / 30 / 5.0 / 22.0 | day 64 (week 10.1) |

- **B** is close to the base on every profile. T-1a and T-1b keep passing; the new player is at 65% (25 bp) and 62% (50 bp) at week 4, as in the base (65%). At 25 bp no target changes status. At 50 bp T-2d2 (a returner is within 2 levels of the middle in about 16 days, limit 17) and T-6b (the best creature is still growing at week 12) change to fail: the daily player's best is at the cap at week 12 (30.0), a week earlier than at 25 bp. The best reaches 30 at about week 13 in both, against week 13.7 in the base.
- **C** keeps T-1a for every profile but the new player (63%), and softens the depth curve's harm at weeks 4 and 8 (daily gap 3.0 and 5.5 against 3.3 and 8.0), but not enough: T-1b still fails, and the daily player's best reaches 30 at week 10.1, so T-6a (not capped at week 10) and T-6b fail, and T-2d2 fails as well. The bench barely benefits (bench median 18.0 against 17.3 at week 8): the extra XP is split across the whole roster, about 30 XP a creature a day at week 8.
- Targets that change against the base: B25 none; B50 T-2d2 and T-6b; C T-2d2, T-6a and T-6b.
- So the choice is between a slow top creature (B, near today) and a fast one that leaves the roster behind (the curves, even with sharing). T-6 needs the top creature to reach 30 no sooner than about week 12 or 13, which only B at 25 bp meets with margin.

## The owner's choice: the landmark rule (Q59)

Q59: a combat v2 dungeon run pays about 120 XP at any depth, plus a step of +1.75% at each landmark depth (every 7th), no cap. Combat's report for a top creature's dungeon XP a day for a daily player: week 1: 86, week 4: 121, week 8: 128, week 12: 134, week 24: 157 (mean depth 2.7 / 18.6 / 45 / 71 / 150). Week 1 is below 120 because shallow runs have small rooms (a creature's share is its room-priced base over max(the row's top base, 200)). In the lab it is `dungeonXp: 'landmark'` (interpolated like the others); `{ landmark: true, perRun, stepBp }` scales that report by `perRun / 120` and by the step's growth at the reported depths, for the sensitivity grid. Tables are in the Data section below (the same layout as the other columns).

- **Every target keeps its status against the flat-120 base.** None change. The curve is the same size as variant B at about 25 bp (121, 128, 134 against 126, 134, 141), a little under it.
- **The daily player's best reaches 30 on day 89 (week 13.7), the same as the base** (week 13.7; 40 of 40 get there). T-6 (still growing at week 12) holds.
- **Daily player, top / 3rd / median gap / bench median:** week 4 18 / 18 / 2.0 / 14.5; week 8 25 / 25 / 4.0 / 17.0; week 12 29 / 29 / 5.0 / 21.0. Base: 19 / 19 / 2.3 / 15.0; 25 / 25 / 4.0 / 17.5; 29 / 29 / 5.0 / 21.5. T-1a at week 4 passes for every profile but the new player (61%, against 65% in the base, which fails the bar as well).
- **Levers.** Neither `perRun` (120) nor `landmarkStepBp` (175) needs to move to keep every target: in the grid (perRun 100 to 130, step 100 to 350) all targets keep their status, T-1a passes for every profile but the new player, and the daily spread at week 8 stays 3 to 4 (limit 5). One cell (perRun 110, T-2d2 pass to fail) is a one-target flip between two cells that pass; read it as noise at 20 seeds (T-2d2's limit is 17 days and it sits near it).
- **The week 1 dip to 86 changes nothing early.** The T-2 targets (T-2a1, T-2a2, T-2b, T-2c, T-2d1, T-2d2) all keep passing, and so does every other early target. A first-week player gets 28% less dungeon XP than the flat rule (86 against 120), but the effect on week 4 is under a level (the daily top is 18 against 19). The new player's week 4 is 3.8 gap and 61% within 5 against 3.5 and 65% in the base: inside the noise of the other columns (62% at B50), and under the bar in the base too.
- So the landmark rule is nearly the flat base; the harm to the roster that the depth and v1 curves did does not appear.

## Caveats

- The curves are per top creature per day as combat v2 gave them; the lab applies them per run per player-week, and a player who is away gets nothing (as today). Depth is not tracked per player: the week of life stands in for it.
- The lever study's depth is inferred from the two columns, not given; it matches the default lever by construction and is only a guide to other settings.
- 20 seeds, one server of 8: week 4 shares move by a few points between seed counts (the daily player at the curve was 85% at 20 seeds and 85% at 10). The sweep is coarse and judged against the T-1a bar, which is already in `targets.ts`.

## Data

The output of `report -- --dungeon-xp-study --seeds 20 --levers`:

## flat 120 (base)

| Profile         | Week | Top  | 3rd  | Two-week-old gap to 3rd (median / worst) | Within 5 | Bench median level |
| --------------- | ---- | ---- | ---- | ---------------------------------------- | -------- | ------------------ |
| daily           | 4    | 19.0 | 19.0 | 2.3 / 4.0                                | 100%     | 15.0               |
| daily           | 8    | 25.0 | 25.0 | 4.0 / 10.0                               | 64%      | 17.5               |
| daily           | 12   | 29.0 | 29.0 | 5.0 / 13.0                               | 55%      | 21.5               |
| active          | 4    | 19.0 | 18.0 | 2.0 / 3.0                                | 100%     | 15.0               |
| active          | 8    | 25.0 | 23.0 | 2.0 / 8.0                                | 74%      | 16.3               |
| active          | 12   | 29.0 | 26.0 | 2.3 / 11.0                               | 68%      | 21.0               |
| every-other-day | 4    | 19.0 | 19.0 | 3.0 / 4.0                                | 100%     | 14.3               |
| every-other-day | 8    | 25.0 | 25.0 | 4.5 / 10.0                               | 62%      | 15.8               |
| every-other-day | 12   | 29.0 | 29.0 | 6.0 / 14.0                               | 48%      | 20.3               |
| weekend-off     | 4    | 19.0 | 19.0 | 1.3 / 4.0                                | 100%     | 14.0               |
| weekend-off     | 8    | 25.0 | 25.0 | 4.0 / 9.5                                | 67%      | 16.5               |
| weekend-off     | 12   | 29.0 | 29.0 | 5.0 / 13.0                               | 52%      | 21.0               |
| weekly          | 4    | 16.0 | 16.0 | 0.0 / 3.0                                | 100%     | 10.0               |
| weekly          | 8    | 22.0 | 22.0 | 3.0 / 7.5                                | 71%      | 15.3               |
| weekly          | 12   | 26.0 | 26.0 | 4.5 / 12.0                               | 59%      | 18.0               |
| new             | 4    | 23.0 | 21.0 | 3.5 / 6.0                                | 65%      | 15.0               |
| new             | 8    | 28.0 | 26.0 | 7.5 / 11.0                               | 45%      | 15.0               |
| new             | 12   | 30.0 | 29.0 | 7.3 / 14.0                               | 45%      | 18.0               |
| returner        | 4    | 19.0 | 19.0 | 2.3 / 4.0                                | 100%     | 14.3               |
| returner        | 8    | 20.0 | 20.0 | 4.0 / 6.0                                | 88%      | 15.0               |
| returner        | 12   | 27.0 | 27.0 | 6.5 / 12.0                               | 46%      | 15.0               |

A daily player's best creature reaches level 30: day 89 (week 13.7), 40 of 40 daily players get there.

T-1 per profile (share of two-week-old creatures within 5 levels at week 4, the bar is 90%): daily 100% pass, active 100% pass, every-other-day 100% pass, weekend-off 100% pass, weekly 100% pass, new 65% FAIL, returner 100% pass

## depth curve

| Profile         | Week | Top  | 3rd  | Two-week-old gap to 3rd (median / worst) | Within 5 | Bench median level |
| --------------- | ---- | ---- | ---- | ---------------------------------------- | -------- | ------------------ |
| daily           | 4    | 22.0 | 21.5 | 3.3 / 6.0                                | 85%      | 15.0               |
| daily           | 8    | 30.0 | 30.0 | 8.0 / 14.0                               | 21%      | 17.3               |
| daily           | 12   | 30.0 | 30.0 | 5.5 / 15.0                               | 50%      | 21.0               |
| active          | 4    | 22.0 | 20.0 | 3.0 / 5.0                                | 100%     | 15.0               |
| active          | 8    | 30.0 | 26.0 | 3.3 / 11.0                               | 63%      | 18.0               |
| active          | 12   | 30.0 | 30.0 | 4.3 / 14.5                               | 59%      | 23.0               |
| every-other-day | 4    | 22.0 | 21.0 | 4.0 / 6.0                                | 86%      | 14.3               |
| every-other-day | 8    | 30.0 | 30.0 | 9.0 / 15.0                               | 20%      | 15.3               |
| every-other-day | 12   | 30.0 | 30.0 | 7.0 / 15.0                               | 45%      | 19.8               |
| weekend-off     | 4    | 21.0 | 21.0 | 2.0 / 5.0                                | 100%     | 14.3               |
| weekend-off     | 8    | 30.0 | 30.0 | 8.0 / 14.0                               | 24%      | 16.5               |
| weekend-off     | 12   | 30.0 | 30.0 | 5.8 / 15.0                               | 49%      | 21.0               |
| weekly          | 4    | 18.0 | 16.0 | 0.0 / 3.0                                | 100%     | 10.0               |
| weekly          | 8    | 26.0 | 25.0 | 6.0 / 11.0                               | 41%      | 15.3               |
| weekly          | 12   | 30.0 | 30.0 | 8.0 / 16.0                               | 33%      | 18.3               |
| new             | 4    | 26.0 | 22.0 | 5.5 / 7.0                                | 50%      | 15.0               |
| new             | 8    | 30.0 | 28.0 | 8.8 / 13.0                               | 36%      | 15.0               |
| new             | 12   | 30.0 | 30.0 | 7.0 / 15.0                               | 45%      | 18.0               |
| returner        | 4    | 22.0 | 21.0 | 4.0 / 5.5                                | 92%      | 14.8               |
| returner        | 8    | 23.0 | 21.5 | 4.3 / 7.0                                | 66%      | 15.0               |
| returner        | 12   | 30.0 | 30.0 | 10.0 / 15.0                              | 27%      | 15.0               |

A daily player's best creature reaches level 30: day 52 (week 8.4), 40 of 40 daily players get there.

T-1 per profile (share of two-week-old creatures within 5 levels at week 4, the bar is 90%): daily 85% FAIL, active 100% pass, every-other-day 86% FAIL, weekend-off 100% pass, weekly 100% pass, new 50% FAIL, returner 92% pass

## v1 curve

| Profile         | Week | Top  | 3rd  | Two-week-old gap to 3rd (median / worst) | Within 5 | Bench median level |
| --------------- | ---- | ---- | ---- | ---------------------------------------- | -------- | ------------------ |
| daily           | 4    | 21.0 | 20.5 | 3.8 / 5.0                                | 100%     | 15.0               |
| daily           | 8    | 29.0 | 28.5 | 6.5 / 13.0                               | 29%      | 17.0               |
| daily           | 12   | 30.0 | 30.0 | 6.0 / 15.0                               | 48%      | 22.0               |
| active          | 4    | 21.0 | 20.0 | 3.0 / 4.5                                | 100%     | 15.0               |
| active          | 8    | 29.0 | 25.0 | 3.0 / 10.0                               | 63%      | 18.0               |
| active          | 12   | 30.0 | 28.5 | 3.0 / 13.0                               | 60%      | 22.0               |
| every-other-day | 4    | 21.0 | 20.0 | 4.0 / 5.0                                | 100%     | 14.3               |
| every-other-day | 8    | 29.0 | 28.0 | 7.8 / 13.0                               | 30%      | 16.0               |
| every-other-day | 12   | 30.0 | 30.0 | 6.0 / 15.0                               | 45%      | 21.5               |
| weekend-off     | 4    | 21.0 | 21.0 | 2.0 / 5.0                                | 100%     | 14.3               |
| weekend-off     | 8    | 28.0 | 28.0 | 6.0 / 12.0                               | 44%      | 17.0               |
| weekend-off     | 12   | 30.0 | 30.0 | 5.8 / 15.0                               | 49%      | 22.0               |
| weekly          | 4    | 18.0 | 16.0 | 0.0 / 3.0                                | 100%     | 10.0               |
| weekly          | 8    | 25.0 | 25.0 | 5.8 / 10.5                               | 48%      | 15.3               |
| weekly          | 12   | 30.0 | 29.0 | 8.0 / 15.0                               | 38%      | 18.0               |
| new             | 4    | 25.0 | 21.5 | 5.3 / 6.5                                | 50%      | 15.0               |
| new             | 8    | 30.0 | 27.5 | 8.5 / 12.5                               | 39%      | 15.0               |
| new             | 12   | 30.0 | 30.0 | 7.0 / 15.0                               | 44%      | 19.3               |
| returner        | 4    | 21.0 | 20.0 | 4.0 / 4.5                                | 100%     | 14.8               |
| returner        | 8    | 22.0 | 21.0 | 4.3 / 7.0                                | 66%      | 15.0               |
| returner        | 12   | 30.0 | 30.0 | 10.0 / 15.0                              | 26%      | 15.0               |

A daily player's best creature reaches level 30: day 60 (week 9.6), 40 of 40 daily players get there.

T-1 per profile (share of two-week-old creatures within 5 levels at week 4, the bar is 90%): daily 100% pass, active 100% pass, every-other-day 100% pass, weekend-off 100% pass, weekly 100% pass, new 50% FAIL, returner 100% pass

## B25: flat 120 x (1 + 0.25% a depth)

| Profile         | Week | Top  | 3rd  | Two-week-old gap to 3rd (median / worst) | Within 5 | Bench median level |
| --------------- | ---- | ---- | ---- | ---------------------------------------- | -------- | ------------------ |
| daily           | 4    | 19.0 | 19.0 | 2.8 / 4.0                                | 100%     | 15.0               |
| daily           | 8    | 25.0 | 25.0 | 4.0 / 10.0                               | 66%      | 17.0               |
| daily           | 12   | 29.0 | 29.0 | 5.0 / 14.0                               | 55%      | 21.5               |
| active          | 4    | 19.0 | 18.0 | 2.0 / 3.0                                | 100%     | 15.0               |
| active          | 8    | 25.0 | 23.0 | 2.0 / 8.0                                | 72%      | 17.0               |
| active          | 12   | 29.0 | 26.0 | 2.0 / 11.0                               | 67%      | 22.0               |
| every-other-day | 4    | 19.0 | 19.0 | 3.0 / 4.0                                | 100%     | 14.3               |
| every-other-day | 8    | 25.0 | 25.0 | 4.5 / 10.0                               | 61%      | 15.0               |
| every-other-day | 12   | 29.0 | 29.0 | 6.0 / 14.0                               | 48%      | 19.8               |
| weekend-off     | 4    | 19.0 | 19.0 | 1.3 / 4.0                                | 100%     | 14.0               |
| weekend-off     | 8    | 25.0 | 25.0 | 4.0 / 10.0                               | 67%      | 15.8               |
| weekend-off     | 12   | 29.0 | 29.0 | 5.0 / 14.0                               | 55%      | 21.0               |
| weekly          | 4    | 16.0 | 16.0 | 0.0 / 3.0                                | 100%     | 10.0               |
| weekly          | 8    | 22.0 | 22.0 | 3.0 / 8.0                                | 70%      | 15.0               |
| weekly          | 12   | 27.0 | 27.0 | 5.0 / 12.0                               | 51%      | 18.0               |
| new             | 4    | 23.0 | 21.0 | 4.0 / 6.0                                | 65%      | 15.0               |
| new             | 8    | 29.0 | 26.0 | 8.0 / 11.0                               | 43%      | 15.0               |
| new             | 12   | 30.0 | 29.0 | 7.0 / 14.0                               | 45%      | 18.0               |
| returner        | 4    | 19.0 | 19.0 | 2.3 / 3.5                                | 100%     | 14.3               |
| returner        | 8    | 20.0 | 20.0 | 4.0 / 6.0                                | 88%      | 15.0               |
| returner        | 12   | 27.0 | 27.0 | 8.0 / 12.0                               | 44%      | 15.0               |

A daily player's best creature reaches level 30: day 85 (week 13.1), 40 of 40 daily players get there.

T-1 per profile (share of two-week-old creatures within 5 levels at week 4, the bar is 90%): daily 100% pass, active 100% pass, every-other-day 100% pass, weekend-off 100% pass, weekly 100% pass, new 65% FAIL, returner 100% pass

## B50: flat 120 x (1 + 0.5% a depth)

| Profile         | Week | Top  | 3rd  | Two-week-old gap to 3rd (median / worst) | Within 5 | Bench median level |
| --------------- | ---- | ---- | ---- | ---------------------------------------- | -------- | ------------------ |
| daily           | 4    | 19.0 | 19.0 | 2.8 / 4.0                                | 100%     | 15.0               |
| daily           | 8    | 25.0 | 25.0 | 4.0 / 10.0                               | 60%      | 17.0               |
| daily           | 12   | 30.0 | 30.0 | 5.5 / 14.0                               | 50%      | 21.0               |
| active          | 4    | 19.0 | 18.0 | 2.0 / 3.0                                | 100%     | 15.0               |
| active          | 8    | 25.0 | 23.0 | 2.0 / 8.0                                | 71%      | 17.3               |
| active          | 12   | 30.0 | 27.0 | 2.5 / 12.0                               | 68%      | 22.0               |
| every-other-day | 4    | 19.0 | 19.0 | 3.0 / 4.0                                | 100%     | 14.3               |
| every-other-day | 8    | 25.0 | 25.0 | 4.3 / 10.0                               | 61%      | 15.0               |
| every-other-day | 12   | 30.0 | 30.0 | 6.0 / 15.0                               | 47%      | 20.0               |
| weekend-off     | 4    | 19.0 | 19.0 | 1.3 / 4.0                                | 100%     | 14.0               |
| weekend-off     | 8    | 25.0 | 25.0 | 4.0 / 10.0                               | 67%      | 15.0               |
| weekend-off     | 12   | 29.5 | 29.0 | 5.0 / 14.0                               | 52%      | 21.5               |
| weekly          | 4    | 16.0 | 16.0 | 0.0 / 3.0                                | 100%     | 10.0               |
| weekly          | 8    | 22.0 | 22.0 | 3.0 / 8.0                                | 70%      | 15.3               |
| weekly          | 12   | 27.0 | 27.0 | 5.0 / 13.0                               | 51%      | 18.0               |
| new             | 4    | 23.0 | 21.0 | 3.8 / 6.0                                | 62%      | 15.0               |
| new             | 8    | 29.0 | 26.0 | 7.8 / 11.0                               | 43%      | 15.0               |
| new             | 12   | 30.0 | 29.5 | 8.0 / 14.5                               | 43%      | 16.0               |
| returner        | 4    | 19.0 | 19.0 | 2.3 / 3.5                                | 100%     | 14.8               |
| returner        | 8    | 20.0 | 20.0 | 4.0 / 6.0                                | 92%      | 15.0               |
| returner        | 12   | 27.0 | 27.0 | 7.0 / 12.0                               | 44%      | 15.0               |

A daily player's best creature reaches level 30: day 84 (week 13.0), 40 of 40 daily players get there.

T-1 per profile (share of two-week-old creatures within 5 levels at week 4, the bar is 90%): daily 100% pass, active 100% pass, every-other-day 100% pass, weekend-off 100% pass, weekly 100% pass, new 62% FAIL, returner 100% pass

## C: depth curve, half of the part above 120 to the bench

| Profile         | Week | Top  | 3rd  | Two-week-old gap to 3rd (median / worst) | Within 5 | Bench median level |
| --------------- | ---- | ---- | ---- | ---------------------------------------- | -------- | ------------------ |
| daily           | 4    | 20.0 | 20.0 | 3.0 / 4.5                                | 100%     | 15.0               |
| daily           | 8    | 28.0 | 27.5 | 5.5 / 12.0                               | 50%      | 18.0               |
| daily           | 12   | 30.0 | 30.0 | 5.0 / 15.0                               | 52%      | 22.0               |
| active          | 4    | 20.0 | 19.0 | 2.0 / 3.5                                | 100%     | 15.0               |
| active          | 8    | 28.0 | 25.0 | 2.5 / 10.0                               | 62%      | 17.5               |
| active          | 12   | 30.0 | 29.0 | 3.5 / 13.5                               | 59%      | 21.3               |
| every-other-day | 4    | 20.0 | 20.0 | 3.0 / 5.0                                | 100%     | 15.0               |
| every-other-day | 8    | 28.0 | 27.0 | 6.5 / 12.0                               | 44%      | 16.0               |
| every-other-day | 12   | 30.0 | 30.0 | 5.3 / 15.0                               | 51%      | 21.3               |
| weekend-off     | 4    | 20.0 | 20.0 | 1.5 / 3.0                                | 100%     | 14.3               |
| weekend-off     | 8    | 28.0 | 28.0 | 5.5 / 12.0                               | 50%      | 18.0               |
| weekend-off     | 12   | 30.0 | 30.0 | 5.0 / 15.0                               | 51%      | 21.5               |
| weekly          | 4    | 17.0 | 16.0 | 0.0 / 2.0                                | 100%     | 12.0               |
| weekly          | 8    | 24.0 | 24.0 | 4.0 / 9.0                                | 57%      | 15.5               |
| weekly          | 12   | 29.0 | 29.0 | 6.3 / 14.0                               | 45%      | 18.0               |
| new             | 4    | 25.0 | 21.0 | 4.0 / 6.0                                | 63%      | 15.0               |
| new             | 8    | 30.0 | 27.0 | 9.5 / 12.0                               | 35%      | 15.0               |
| new             | 12   | 30.0 | 30.0 | 8.0 / 15.0                               | 42%      | 16.0               |
| returner        | 4    | 20.0 | 20.0 | 3.0 / 4.0                                | 100%     | 15.0               |
| returner        | 8    | 21.0 | 21.0 | 4.0 / 6.0                                | 68%      | 15.0               |
| returner        | 12   | 30.0 | 30.0 | 10.0 / 15.0                              | 28%      | 15.0               |

A daily player's best creature reaches level 30: day 64 (week 10.1), 40 of 40 daily players get there.

T-1 per profile (share of two-week-old creatures within 5 levels at week 4, the bar is 90%): daily 100% pass, active 100% pass, every-other-day 100% pass, weekend-off 100% pass, weekly 100% pass, new 63% FAIL, returner 100% pass

## Targets that change status against the base

depth curve: T-1a PASS -> FAIL, T-1b PASS -> FAIL, T-6a PASS -> FAIL, T-6b PASS -> FAIL
v1 curve: T-1b PASS -> FAIL, T-6a PASS -> FAIL, T-6b PASS -> FAIL
B25: flat 120 x (1 + 0.25% a depth): none
B50: flat 120 x (1 + 0.5% a depth): T-2d2 PASS -> FAIL, T-6b PASS -> FAIL
C: depth curve, half of the part above 120 to the bench: T-2d2 PASS -> FAIL, T-6a PASS -> FAIL, T-6b PASS -> FAIL

Base: T-1a PASS, T-1b PASS, T-2a1 PASS, T-2a2 PASS, T-2b PASS, T-2c PASS, T-2d1 PASS, T-2d2 PASS, T-3a PASS, T-3b PASS, T-3c PASS, T-3d PASS, T-3e PASS, T-4 PASS, T-4b PASS, T-6a PASS, T-6b PASS, T-7 PASS, T-7b PASS, T-8a PASS, T-8b PASS, T-8c PASS, T-8d PASS, T-8e PASS, T-9 PASS

## Lever grid (mixed server of 8)

Cells: the share within 5 levels at week 4 (T-1a bar 90%), then at the end the daily player T-1b spread at week 8 (6th below 3rd, at most 5) and the daily median gap at weeks 8 and 12.

| perDepthBp | maxBp | daily    | active | every-other-day | weekend-off | weekly | new      | returner | T-1b spread8 | daily gap wk 8 / 12 |
| ---------- | ----- | -------- | ------ | --------------- | ----------- | ------ | -------- | -------- | ------------ | ------------------- |
| 100        | 10000 | 85% FAIL | 100%   | 86% FAIL        | 100%        | 100%   | 50% FAIL | 92%      | 6.0          | 8.0 / 5.3           |
| 100        | 7500  | 85% FAIL | 100%   | 86% FAIL        | 100%        | 100%   | 50% FAIL | 92%      | 6.0          | 8.0 / 5.3           |
| 100        | 5000  | 85% FAIL | 100%   | 86% FAIL        | 100%        | 100%   | 50% FAIL | 92%      | 6.0          | 8.0 / 5.3           |
| 100        | 3000  | 85% FAIL | 100%   | 86% FAIL        | 100%        | 100%   | 50% FAIL | 92%      | 6.0          | 8.0 / 5.3           |
| 100        | 2000  | 85% FAIL | 100%   | 86% FAIL        | 100%        | 100%   | 50% FAIL | 92%      | 6.0          | 7.3 / 5.5           |
| 100        | 1500  | 100%     | 100%   | 86% FAIL        | 100%        | 100%   | 50% FAIL | 100%     | 6.0          | 7.0 / 5.8           |
| 100        | 1000  | 100%     | 100%   | 86% FAIL        | 100%        | 100%   | 50% FAIL | 100%     | 6.0          | 7.0 / 5.8           |
| 100        | 500   | 100%     | 100%   | 93%             | 100%        | 100%   | 50% FAIL | 100%     | 6.0          | 7.0 / 5.3           |
| 75         | 10000 | 100%     | 100%   | 86% FAIL        | 100%        | 100%   | 55% FAIL | 100%     | 6.0          | 7.5 / 5.8           |
| 50         | 10000 | 100%     | 100%   | 86% FAIL        | 100%        | 100%   | 50% FAIL | 100%     | 6.0          | 7.0 / 5.3           |
| 25         | 10000 | 100%     | 100%   | 100%            | 100%        | 100%   | 50% FAIL | 100%     | 6.0          | 7.0 / 6.0           |
| 0          | 0     | 100%     | 100%   | 100%            | 100%        | 100%   | 50% FAIL | 100%     | 6.0          | 6.5 / 6.0           |

## landmark (Q59): ~120 a run, +1.75% at every 7th depth, no cap (Q59)

| Profile         | Week | Top  | 3rd  | Two-week-old gap to 3rd (median / worst) | Within 5 | Bench median level |
| --------------- | ---- | ---- | ---- | ---------------------------------------- | -------- | ------------------ |
| daily           | 4    | 18.0 | 18.0 | 2.0 / 3.0                                | 100%     | 14.5               |
| daily           | 8    | 25.0 | 25.0 | 4.0 / 10.0                               | 62%      | 17.0               |
| daily           | 12   | 29.0 | 29.0 | 5.0 / 14.0                               | 55%      | 21.0               |
| active          | 4    | 18.0 | 17.5 | 2.0 / 3.0                                | 100%     | 15.0               |
| active          | 8    | 25.0 | 23.0 | 2.0 / 8.0                                | 72%      | 16.5               |
| active          | 12   | 29.0 | 26.0 | 2.5 / 11.0                               | 65%      | 20.5               |
| every-other-day | 4    | 18.0 | 18.0 | 3.0 / 3.0                                | 100%     | 14.0               |
| every-other-day | 8    | 25.0 | 25.0 | 4.8 / 10.0                               | 58%      | 15.0               |
| every-other-day | 12   | 29.0 | 29.0 | 5.8 / 14.0                               | 49%      | 20.5               |
| weekend-off     | 4    | 18.0 | 18.0 | 1.3 / 3.0                                | 100%     | 14.0               |
| weekend-off     | 8    | 24.0 | 24.0 | 3.5 / 9.0                                | 69%      | 17.5               |
| weekend-off     | 12   | 29.0 | 29.0 | 5.0 / 13.0                               | 52%      | 21.0               |
| weekly          | 4    | 16.0 | 16.0 | 0.0 / 3.0                                | 100%     | 10.0               |
| weekly          | 8    | 22.0 | 22.0 | 3.0 / 8.0                                | 71%      | 15.0               |
| weekly          | 12   | 26.0 | 26.0 | 4.5 / 12.0                               | 59%      | 18.5               |
| new             | 4    | 23.0 | 21.0 | 3.8 / 6.0                                | 61%      | 15.0               |
| new             | 8    | 28.0 | 26.0 | 7.0 / 11.0                               | 43%      | 15.0               |
| new             | 12   | 30.0 | 29.0 | 6.8 / 14.0                               | 48%      | 18.0               |
| returner        | 4    | 18.0 | 18.0 | 2.0 / 3.0                                | 100%     | 14.3               |
| returner        | 8    | 19.0 | 19.0 | 3.5 / 5.0                                | 100%     | 15.0               |
| returner        | 12   | 27.0 | 27.0 | 7.3 / 12.0                               | 41%      | 15.0               |

A daily player's best creature reaches level 30: day 89 (week 13.7), 40 of 40 daily players get there.

T-1 per profile (share of two-week-old creatures within 5 levels at week 4, the bar is 90%): daily 100% pass, active 100% pass, every-other-day 100% pass, weekend-off 100% pass, weekly 100% pass, new 61% FAIL, returner 100% pass

Targets against the base: none changed.

## Landmark lever grid (mixed server of 8)

Cells: the share within 5 levels at week 4 per profile, the daily T-1b spread at week 8, the daily median gap at weeks 8 and 12, the day the daily best reaches 30, and the targets that change against the base.

| perRun | stepBp | daily | active | every-other-day | weekend-off | weekly | new      | returner | spread8 | daily gap 8 / 12 | day 30               | changed          |
| ------ | ------ | ----- | ------ | --------------- | ----------- | ------ | -------- | -------- | ------- | ---------------- | -------------------- | ---------------- |
| 100    | 175    | 100%  | 100%   | 100%            | 100%        | 100%   | 65% FAIL | 100%     | 3.0     | 4.0 / 4.3        | day 94 (week 14.4)   | none             |
| 110    | 175    | 100%  | 100%   | 100%            | 100%        | 100%   | 58% FAIL | 100%     | 3.0     | 4.0 / 5.0        | day 91 (week 14.0)   | T-2d2 PASS->FAIL |
| 130    | 175    | 100%  | 100%   | 100%            | 100%        | 100%   | 61% FAIL | 100%     | 4.0     | 4.0 / 5.0        | day 85.5 (week 13.2) | none             |
| 120    | 100    | 100%  | 100%   | 100%            | 100%        | 100%   | 61% FAIL | 100%     | 3.0     | 3.5 / 5.0        | day 90 (week 13.9)   | none             |
| 120    | 250    | 100%  | 100%   | 100%            | 100%        | 100%   | 61% FAIL | 100%     | 4.0     | 4.0 / 5.0        | day 87.5 (week 13.5) | none             |
| 120    | 350    | 100%  | 100%   | 100%            | 100%        | 100%   | 60% FAIL | 100%     | 4.0     | 4.0 / 5.0        | day 86 (week 13.3)   | none             |
