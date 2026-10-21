# Balance targets

The balance simulator (`packages/sim`) checks these and reports violations. Changing a target is a design decision: note it in `decisions.md`.

The machine-readable copy lives in `packages/sim/targets.json`. Keep the two in sync.

## Definitions

- **Typical group:** 5–10 signed-up players, mixed archetypes, at week 4 or later of progression.
- **Clear rate:** the share of simulated raid weeks where the stage is cleared.
- **Raid sweep:** single raid weeks on rosters from the economy sims (end of weeks 4 and 8), with the boss at the rank the old per-level rule would have chosen for the roster (`placementRank`). It calibrates boss HP and the head-count exponents. Crits are on.
- **Long-run servers:** 30-week sims of a small (5 players), typical (10) and 15-player server with the Boss Rank ladder, Festivals (every 5th week of the global calendar, from a random start) and season resets. A **rank-up** is a week that raised the rank; a **loss streak** is finale losses in consecutive raid weeks.

## Raid outcomes

| Target                                                                  | Value                                       |
| ----------------------------------------------------------------------- | ------------------------------------------- |
| Phase 1 clear rate, typical group                                       | ≥ 95%                                       |
| Phase 2 clear rate, typical group                                       | 70–85%                                      |
| Finale win rate, typical group                                          | 40–60%                                      |
| Phase 1 clear rate, 1 player (with guests), week 4+                     | ≥ 80%                                       |
| Finale win rate, 15 players                                             | 35–65% (no "easier with more people" cliff) |
| Spread of finale win rate between bosses (typical group)                | ≤ 15 percentage points                      |
| A boss that a typical group never beats, or always beats, in the finale | flagged                                     |

## Long-run progression (ladder, Festivals, seasons)

| Target                                                                        | Value  |
| ----------------------------------------------------------------------------- | ------ |
| Finale win rate per server over 30 weeks, Festivals included, small server    | 40–60% |
| The same, typical server (10 players)                                         | 40–60% |
| The same, 15-player server                                                    | 40–60% |
| Festival finale win rate (lowest of the three server sizes)                   | ≥ 70%  |
| Median weeks between rank-ups (all long-run servers)                          | 2–4    |
| Share of servers with a loss streak of more than 4 weeks (worst of the three) | ≤ 10%  |

The rank spread between the typical and the 15-player server after week 30 is reported as information, with no target.

## Fairness and contribution

| Target                                                                      | Value                  |
| --------------------------------------------------------------------------- | ---------------------- |
| Median top player's share of contribution, 5+ player groups                 | ≤ 35%                  |
| Setup credit share of total contribution                                    | ≥ 15% (setters matter) |
| Reactions per round, 5+ player groups                                       | ≥ 1.0 on average       |
| Newcomer (joined week 4) Essence per week at week 6, relative to top earner | ≥ 70%                  |

## Collection and choice

| Target                                                                            | Value             |
| --------------------------------------------------------------------------------- | ----------------- |
| Each element's pick rate in raids                                                 | 15–35%            |
| Any creature's average contribution relative to the median creature of its rarity | ≤ 1.6× and ≥ 0.6× |

Festival species are compared with the catchable median in the report but are not part of this target: players get them late, at level 1, so their averages say little about the species.
| An element whose creatures are picked < 10% | flagged as dead |

## Economy

| Target                                                            | Value                          |
| ----------------------------------------------------------------- | ------------------------------ |
| Casual player's first creature reaches level 15 (evolution level) | by end of week 4               |
| Daily player owns ≥ 8 of 12 catchable species                     | by end of week 6               |
| Top earner vs casual average team power at week 8                 | ≤ 1.6×                         |
| Jackpot rate per player per finale win, including pity            | 6–15%                          |
| Players reaching hard pity (10 raids)                             | ≤ 15% of players over 20 weeks |

## Gear and crafting

Measured on the default server's sims (10 players, 12 weeks), with the same seeds played without gear as "today".

| Target                                                                                                           | Value       |
| ---------------------------------------------------------------------------------------------------------------- | ----------- |
| Days until a daily player's first crafted item arrives (90th percentile; a player who never crafts counts as 99) | ≤ 7         |
| Best Crafting level of a daily player 30 days after joining (median)                                             | 4–6 (aim 5) |
| Gear power at week 8 of a player who joined in week 4, relative to the median daily player's                     | ≥ 60%       |

**Gear's share of the raid team's fight-scored power** (Gear A, 2026-10-16; `gear-and-creatures-v2.md` section 4) is measured by `packages/sim/src/gear-study.ts` on 30 weeks of the default journey server (1 min-maxer, 3 engaged, 3 regular, 2 drop-in): the share is `1 - bare / full`, where `full` is the fight-scored power of the three strongest creatures (`fightPower`, gear on) and `bare` the same three with their gear taken off. Median over the players of a profile, at the end of the week:

| Profile   | Week 2 | Week 8 | Week 20 | Week 30 |
| --------- | ------ | ------ | ------- | ------- |
| Min-maxer | 5–10%  | 15–22% | 25–32%  | 33–40%  |
| Engaged   | 5–10%  | 15–22% | 25–32%  | 33–40%  |
| Regular   | 3–6%   | 10–15% | 18–24%  | 28–34%  |
| Drop-in   | 0–3%   | 5–8%   | 10–15%  | 15–20%  |

These are the `gear-share-<profile>-week<N>` targets (16). They are design goals, not tuned values: the first Gear A numbers fall short of most of them (see `docs/balance/log.md` B-012), which is reported, not tuned away. The earlier targets of the stat-power share at week 8 (10–20%) and of the Essence gear no longer sinks (never above today's value; growth) are retired: upgrades are gone, and the Essence now goes to evolution and, later, to the Workshop's Reach.

The old stat-power share (`gearShare`, the power the worn items add to the top 3 over the top-3 power) is still printed in the report. The raid, long-run, fairness and collection targets above are measured with gear on, so they still hold after gear.

## Daily dungeon

Measured on the default server's sims (10 players, 12 weeks). Every player with 3 creatures runs the dungeon on each day they check in; the raid, long-run, fairness, collection and gear targets above are measured with the dungeon in the game, so they still hold with it (the dungeon's Bait, Essence, parts and gear feed the same economy).

| Target                                                                                                                                                   | Value  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Depth 1 cleared (the room boss beaten) in a player's first 7 days, share of those runs, all archetypes                                                   | ≥ 80%  |
| Depth a median daily player gains per week, from the end of week 2 to the end of week 8 (the opening week is left out)                                   | 1–2    |
| Dungeon Essence as a share of a daily player's whole Essence income (raids, jackpots and dungeon)                                                        | ≤ 40%  |
| Gear's share of a daily player's raid-team power at week 8 with the dungeon's gear and parts in the game (no dungeon: report)                            | ≤ 20%  |
| Share of a daily player's runs, from their second week, that end at home (heading home from the camp with the pack), so the camp choice is real          | 10–45% |
| Fights played per run (a lost one included), a daily player's runs from their second week (a run is short)                                               | 3–5.5  |
| Share of a daily player's runs that beat the room boss at depth 8 or over (the Undercroft is offered) and go down into it (a real choice)                | 20–80% |
| Fights played per run (the Undercroft's included) by a daily player at depth 8 or over, when the Undercroft is open to them (runs must not get too long) | ≤ 7    |

The report also lists how runs end (cleared, home, defeat), fights, elites, keepsakes and the pack per run, how the Undercroft is played (offered, descents, clear rate, levels, fights, carved doors), the clear rate per depth for casual, daily and top players, the depth after N weeks per archetype and the reward flow per player and week (`## Daily dungeon`). A run is a walk over the day's map (`docs/design/dungeon-paths.md`) and, from depth 8, may go down into the Undercroft after the room boss; a run that heads home is not a clear, and a run that beat the room boss and was lost below it is a defeat (half the pack) that still moved the depth.

## Expeditions v2

Measured on the default server's sims for the species target and on 60-week sims of a daily player (check-ins at 09:00 and 20:00) for the slot targets. "Bait-free" meant no supplies bought (supplies cannot be bought now, so every strategy is Bait-free). The strategies are always 2 h, always 6 h, always 12 h or 24 h trips, each claimed at the first check-in after it ends.

| Target                                                                                                   | Value                   |
| -------------------------------------------------------------------------------------------------------- | ----------------------- |
| Day a daily player's 2nd expedition slot opens (median)                                                  | the first day (≤ 1)     |
| Day the 3rd slot opens (about a month)                                                                   | 23–37                   |
| Day the 4th slot opens (about four months)                                                               | 90–150                  |
| Day the 5th slot opens (about a year; a slot that never opens counts as 999)                             | 330–400                 |
| Worth per day of the best long strategy (12 or 24 h) over the best short one (2 or 6 h), Bait-free       | ≥ 1.2×                  |
| Worth per day of always sending 2 h trips over the worst of the other three strategies                   | ≤ 1 (spam is the worst) |
| Share of a daily player's finished trips that are 12 or 24 h                                             | ≥ 50%                   |
| Lowest expected worth of a risky push-on goal against coming home, over every length it is offered after | ≥ 0.90                  |
| Highest expected worth of a risky push-on goal against coming home (a fair gamble)                       | ≤ 1.10                  |
| Most species a casual player owns ahead of today's expeditions at the end of any week 1–12 (no faster)   | ≤ 0.3 species           |

"Worth" is the number the sim compares trips by (`RULES.expeditions.worth`, in Bait; never shown to players): catch rolls by rarity, parts, glimmer, blueprints, gear, journal pages and explorer XP. The casual species baseline is the v1 curve (2.7, 4.8, 6.5, 7.9, 8.6, 9.1, 9.5, 9.7, 9.8, 10.0, 10.2, 10.4 species at the end of weeks 1–12), kept in `packages/sim/src/analysis.ts`.

## Expedition economy (since 2026-10-20, B-025)

Measured exactly, with no sampling, by `packages/sim/src/trip-ev.ts` (`pnpm sim:economy` prints the tables) and asserted by `packages/sim/test/economy-targets.test.ts`. The bands are `ECONOMY_TARGETS` in `packages/sim/src/economy-targets.ts`. Worth is in Bait (`RULES.expeditions.worth`, a new species 40, half of what a roll can bring already owned); a supply costs its blueprint (scrap 2, shard 6, glimmer 25, Bait 1:1); ROI is the extra expected worth over that cost. Today's numbers are in B-025.

| Target                                                                                                                                                                          | Band            | Today                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------- |
| Unsupplied trip: worth, creatures, scrap, shards, gear and XP per hour rise with the length                                                                                     | strictly rising | yes                          |
| 12 h, no supplies: creatures (a tick brings one 8% of the time, since 2026-10-20)                                                                                               | 1.0-1.5         | 1.20                         |
| 12 h, no supplies: scrap and shards in plain crafts (6 scrap + 1 shard)                                                                                                         | 0.8-1.5         | 1.13                         |
| 12 h, no supplies: gear pieces                                                                                                                                                  | 0.6-1.0         | 0.77                         |
| 2 h, no supplies: chance of at least one gear piece                                                                                                                             | 9-11%           | 10.0%                        |
| Every supply, every length, with and without Guard, Keen nose and a parts Boon: ROI                                                                                             | 1.1-4.0         | 1.10-3.59                    |
| Every supply on a 12 h trip: ROI                                                                                                                                                | 1.6-2.6         | 1.87-2.23                    |
| A supply is worth more (ROI) the longer the trip                                                                                                                                | rising          | yes                          |
| Each tier gains more Bait than the tier below, every length                                                                                                                     | rising          | yes                          |
| The second supply of a pair, given the first: ROI                                                                                                                               | 1.0-5.0         | 1.1-4.9                      |
| Repeating short trips never beats one long trip of the same hours on worth minus supply cost (a single supply; a pair may go over by 20%); k short trips still bring more gross | long wins net   | yes (pairs up to 1.17 times) |
| Every part kind and supply kind appears in the worth table                                                                                                                      | complete        | yes                          |

## Supplies (since 2026-10-16, B-011)

Measured on the default journey server (min-maxer, engaged, regular, drop-in; 12 weeks, weeks 3 to 12 for the rates) by `pnpm sim` (`packages/sim/src/supplies-study.ts`). Supplies cannot be bought: they come from the daily dungeon, from trips and from the Workshop.

| Target                                                 | Value |
| ------------------------------------------------------ | ----- |
| Supplies a regular player carries a week               | ≥ 3   |
| Supplies a min-maxer carries a week                    | ≥ 8   |
| Share of a min-maxer's supplies that are crafted       | ≥ 25% |
| Share of an engaged player's supplies that are crafted | ≥ 25% |

The rework's comparison with the old economy (Bait-bought supplies) is in `docs/balance/log.md` B-011. The upgrade-level check that stood here (`supplies-minmaxer-gear`) was retired in Gear A, because gear has no upgrade levels any more.

## Informational (no target)

The simulator also reports these, to keep an eye on them. They are not checked in `targets.json`.

| Measure                                                                                         | Aim             |
| ----------------------------------------------------------------------------------------------- | --------------- |
| Share of finale damage added by creature abilities, week-8 roster, typical group and 15 players | about 10-25%    |
| Share of finale damage added by the basic abilities                                             | small (a few %) |

The readiness band is calibrated separately (`node packages/sim/scripts/readiness.mjs`, see `docs/balance/report-2026-10-11-progression.md`); it has no target in `targets.json`.
