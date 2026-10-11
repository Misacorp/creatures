# Balance targets

The balance simulator (`packages/sim`) checks these and reports violations. Changing a target is a design decision: note it in `decisions.md`.

The machine-readable copy lives in `packages/sim/targets.json`. Keep the two in sync.

## Definitions

- **Typical group:** 5–10 signed-up players, mixed archetypes, at week 4 or later of progression.
- **Clear rate:** the share of simulated raid weeks where the stage is cleared.

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
| An element whose creatures are picked < 10%                                       | flagged as dead   |

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
