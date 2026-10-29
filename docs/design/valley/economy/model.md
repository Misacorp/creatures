# The economy lab: a deterministic model of the valley over twelve weeks

Status: **to design** (roadmap phase 2). Nothing is built.

## Why

Misa: "build deterministic simulations that model the average economy over time... just a dozen or so weeks ahead". Before players see the valley's systems, we want to know, for each kind of player and server, how creatures grow, what piles up and what runs short, whether chains starve, and how fast the server builds its places.

## Shape

Follow combat v2's lab (`packages/lab`): a separate, pure package for the **proposed** rules, apart from the shipped simulator (`packages/sim`), so the proposal can change freely. Ported into `packages/sim` and the game once accepted.

- **Package:** `packages/econ` (name to confirm), TypeScript strict, no I/O, an injected seeded RNG (live randomness only in the real server, F-8).
- **Rules as data:** every rate, cap, cost and odds in one data file (`rules.ts`), validated by a schema; system docs reference rule ids (V-POST-3), never numbers.
- **Time:** day by day for 12 weeks (84 days); inside a day, the player's check-ins at their habitual times; posts computed lazily between check-ins exactly as the server will (the same function, so the model doubles as the reference implementation).
- **Players:** profiles reused from `packages/sim/src/profiles.ts` (login days, check-ins a day, raid sign-up), plus valley dials: how they assign posts (a few fixed policies: "set and forget", "optimiser", "collector"), how generously they give to the commons, how many creatures they catch.
- **Servers:** 5, 8 and 15 players of mixed profiles; a newcomer joining in week 6; a "hoarder" who saves for weeks and gives it all at once; a quiet server where one keen player gives alone.
- **Combat:** not simulated in detail; raid and dungeon XP and rewards come from the shipped simulator's averages (or combat v2's lab when available) as inputs.

## Outputs (a generated report, `economy/report.md`, never edited by hand)

- Per profile, per week: the level of the 1st, 3rd, 10th and 20th creature (T-1); total XP by source (fights, posts, bonfire, lounge); resources in, out and stored; anvil-hours slowed for want of input (T-4).
- Per server, per week: each place's level, project progress, keystones found, the share of resources given to the commons (T-3), the top giver's share of each project, how many weeks a lone player takes to finish one, how much a newcomer has caught up by week 12.
- Per profile: the gain of a player who looks in four times a day over a daily one (V-POST-11 keeps it small; upgrade costs grow faster than output).
- Targets from `goals.md` as pass or fail lines at the top.
- A few "journeys": one player's story by week, in words, to check the pace feels right.

## How agents use it

1. Change `rules.ts` or a policy.
2. `pnpm --filter @creatures/econ report` regenerates the report; `test` checks the rules (no negative balances, conservation of resources, determinism: same seed, same report).
3. Read the targets; propose changes in the system doc and the data together.
