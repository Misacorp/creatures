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

## Informational (no target)

The simulator also reports these, to keep an eye on them. They are not checked in `targets.json`.

| Measure                                                                                         | Aim             |
| ----------------------------------------------------------------------------------------------- | --------------- |
| Share of finale damage added by creature abilities, week-8 roster, typical group and 15 players | about 10-25%    |
| Share of finale damage added by the basic abilities                                             | small (a few %) |

The readiness band is calibrated separately (`node packages/sim/scripts/readiness.mjs`, see `docs/balance/report-2026-10-11-progression.md`); it has no target in `targets.json`.
