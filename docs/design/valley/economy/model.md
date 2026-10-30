# The economy lab: a deterministic model of the valley over 24 weeks

Status: **building** (roadmap phase 2, started 2026-10-30 after Misa's answer to Q32: "maybe you could do that and see what comes back"). Package: `packages/econ` (`@creatures/econ`). The resources it tracks are mapped in [`resources.md`](resources.md).

## Why

Misa: "build deterministic simulations that model the average economy over time... just a dozen or so weeks ahead". And in Q32: "players have things that they feel are progressing and they're not limited by or being starved of resources or things to upgrade. But then at the same time, having content for longer play sessions... it's meant to be taken slowly. So finding the balance there is interesting. And hopefully something the simulation could find out."

Before players see the valley's systems, we want to know, for each kind of player and server, how creatures grow, what piles up and what runs short, whether chains starve, how fast the server builds its places, and whether there is always something to look forward to.

## Shape

Like combat v2's lab (`packages/lab`): a separate, pure package for the **proposed** rules, apart from the shipped simulator (`packages/sim`), so the proposal can change freely. Ported into the game once accepted.

- **Pure and deterministic:** TypeScript strict, no I/O in `src/` (the report script writes files), a seeded RNG from `@creatures/game` (`createSeededRng`); live randomness belongs only to the real server (F-8). Same seed, same report.
- **Rules as data:** every rate, cap, cost and odds in one file (`src/rules.ts`), each group commented with the rule id it comes from (V-POST-10, V-SCOUT-2...), validated by a schema. System docs cite rule ids; the numbers live here and in the report.
- **Time:** hour by hour for 24 weeks (the valley's targets look at 12; combat v2's roster profile needs 24). Idle gains (XP, scrap, shards, Acorns) accrue as expected values; rare events (a creature, a gear piece, a blueprint, a keystone, a rare find) are seeded draws, and each scenario runs several seeds (example: 20) with the median and a spread reported.
- **Players** are profiles: when they visit (days and hours), how they set up posts (a few fixed policies: "set and forget", "optimiser"), how generously they give to projects, whether they fight in the dungeon and the raid. Kinds: daily (one evening visit), active (three visits a day), every other day, weekend off, weekly (Sundays), new (joins in week 6), returner (away weeks 5 to 8), hoarder (saves four weeks, then gives it all).
- **Servers:** 5, 8 and 15 players of mixed kinds; a lone keen player; a hoarder server.
- **Combat** is not simulated: dungeon and raid XP, Essence and drops are inputs in the rules (combat v2 sets them later), with whether a server kills its boss each week as a server dial (all, half, none).

## The rules it models (as decided by 2026-10-30)

Each from its system doc; the doc's example numbers are the lab's starting values.

- **Posts** (`systems/posts.md`): seats per place level, bought with Acorns at rising prices (V-POST-2); one idle XP rate everywhere (V-POST-3); fit +25% (V-POST-4); stores of about three days that stop picking up when full (V-POST-5); the away steps, curve B with A as a variant (V-POST-10); kit tilts (V-POST-11); mastery Skilled/Expert/Master at 2/7/21 effective days (V-POST-12); communal seats extra (V-POST-13).
- **The bonfire** (`systems/bonfire.md`): catch-up toward the higher of the 3rd-best and the server's middle, x2 fading to x1, fixed for 24 hours after a visit (V-BON-2); the hearth's level (V-BON-7).
- **Scouts** (`systems/scouts.md`): find rates and place profiles (V-SCOUT-2), new and duplicate creatures (V-SCOUT-3), second scout at a place half the creature chance (V-SCOUT-10), keystone clocks per server (V-SCOUT-9).
- **The Forge** (`systems/forge.md`, `systems/gear.md`): anvils, "for my team" orders, 16 hours a common piece, 6 scrap and 1 shard of its element, tinkering as the fallback (V-FORGE-1 to 4); pieces at the fire's level (V-FORGE-7); the bag of 200 (V-GEAR-6).
- **The commons** (`systems/commons.md`): every place its own project, sized by active weight, three build days between levels, the guided start (V-COM-5, V-COM-15); collections (V-COM-12); the Forge's fire with its start, time floor and warmth (V-COM-13).
- **Acorns and Essence** (`resources.md`): the allowance building up idly, leets, the dungeon; seats, kit, anvils, gifts; Essence from the raid to evolution and Reach.

## Outputs

A generated report, `economy/report.md` (never edited by hand), and `economy/roster-profile.json`.

1. **Targets** from `goals.md` as pass or fail lines at the top (T-1, T-2, T-3, T-4, T-6; T-5 belongs to combat v2's lab).
2. **The resource ledger** (`resources.md`, "What the lab watches"): for each spendable resource, per kind of player and week: in, out, stockpile, waste, days to the next thing worth buying, choices per visit, and prices in hours of idle income.
3. **Growth:** the levels of the 1st, 3rd, 10th and 20th creature per kind and week; XP by source (fights, idle, catch-up); the day the 1st, 3rd and 10th reach level 30 (T-6); days for a returner to get within 2 levels of the server's middle.
4. **The Forge:** anvil-hours tinkering for want of each input (T-4); pieces made, worn and dismantled per week; the week the bag first fills.
5. **The server:** each place's level and project progress per week; the share of income given; the top giver's share; weeks for a lone player to finish a project; keystones and collections per server-week; the fire by week for bosses killed all, half and none.
6. **The roster profile for combat v2** (the seam in `roadmap.md`): per kind (daily, weekly, new with weeks since joining) and week 1 to 24, in the shape of `RosterProfile` in `packages/lab/src/roster.ts` on branch `combat-v2-track` (levels of the 1st, 3rd, 10th and 20th creature, roster size, forms, talent slots, talents picked, gear).
7. **Journeys:** one daily and one weekly player's story by week, in a few plain lines each, to check the pace feels right.
8. **Cost:** rows read per visit and per server day for the lazy pass, as an estimate from the number of rows a visit touches (Pia's lists in `reviews/2026-10-30-posts-bonfire.md` and `reviews/2026-10-30-scouts-forge.md`).

## Speed, and tuning without loops

Combat v2's lab learned this the hard way (its full report went from 585 s to 80 s, and it gained an automatic tuner; commit d6394eb on `combat-v2-track`): agents changing numbers by hand and re-running the whole report is slow and expensive. This lab is cheap today (the full report, 15 servers x 20 seeds x 24 weeks, about 24 s; tests about 7 s), and is kept that way before any tuning starts:

- **Targets as data** in one file (`src/targets.ts`), read by the report and the tuner alike.
- **Quick runs:** `--scenario <id> --seeds <n>` runs one server for a quick look; the full report only at the end.
- **An automatic tuner:** given the dials it may move (example: project size, scout scrap rate, seat prices) and their bounds, it searches for values that pass every target and reports conflicting targets, instead of an agent editing and re-running.
- **Timings and a budget:** the report prints how long each section took; a speed budget in `docs/design/testing.md` (example: full report under 30 s, tests under 15 s).
- **Later, if needed:** step from visit to visit in one pass (as the server will) instead of hour by hour, and run servers on every core.

## How agents use it

1. Change `src/rules.ts` or a policy.
2. `pnpm --filter @creatures/econ report` regenerates the report; `pnpm --filter @creatures/econ test` checks the rules (no negative balances, resources conserved, determinism).
3. Read the targets; propose changes in the system doc and the rules together. Numbers Misa sees go to him as examples of feel ("a weekly player's best creature is level 24 at week 8, a daily player's 26"), never as a list to approve.
