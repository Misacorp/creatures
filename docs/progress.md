# Progress log

Where the project is against the plan. Newest state at the top of each section. Agents: read this after `CLAUDE.md`; update it whenever a milestone step lands or the plan changes.

## Milestones

| Milestone                                  | State                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| M0 foundation, CI, deploys                 | ✅ merged (PR #1)                                                                                                                 |
| M1 Discord login, leet API, Bait ledger    | ✅ merged (PR #1, #3). Real leet points live in production (#4 fixed the CI timeout that blocked #3's deploy; prod runs 13081d4). |
| M2 starters, expeditions, training, fusion | ✅ merged (PR #1)                                                                                                                 |
| M3 combat engine, balance simulator        | ✅ merged (PR #1). First tuning pass done; deeper tuning still open.                                                              |
| M4 weekly raid                             | 🚧 branch `m4-raids`: M4a server ✅ committed; M4b Discord posts and M4c Raid tab in progress                                     |
| M5 live finale and loot reveal             | 🚧 branch `m5-finale`: design ✅, M5a server + M5b client in progress                                                             |
| M6 polish, pixel art, retro UI             | ⏳ not started                                                                                                                    |

## Now

- M4 is complete on `m4-raids`: **PR #5** (https://github.com/Misacorp/creatures/pull/5), green locally, on staging, waiting for Misa to test and merge. Includes balance pass 2 (`docs/balance/report-2026-10-11.md`, full sim 19/21).
- M5 on branch `m5-finale` (based on `m4-raids` until #5 merges): design done (`docs/design/m5-finale.md`, short polling first; WebSocket push later). In flight: M5a server (`apps/worker`, `packages/engine` helper) and M5b client (`apps/activity`).

## Next

1. M5: live Sunday finale over WebSockets on the guild Durable Object, manual ability timing (absent players fire at default), loot reveal.
2. Dependabot PR #2 (vitest 5): wait until `@cloudflare/vitest-plugin` 1.4.x is 7 days old, then bump both together.
3. Later: an admin setting for the raid post channel (today it is the channel the Activity was last launched from); Essence sinks (gear).

## Open questions for Misa

(Also on the overnight page and in PR #5.)

- Pity: should a lost finale count toward the hard-pity jackpot? (Balance report: counting losses makes 66% of players hit hard pity in 20 weeks.)
- Reactions are about half of all damage after balance pass 2. OK?
- Raid posts follow the channel the Activity was last launched from. OK, or a fixed channel?

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
