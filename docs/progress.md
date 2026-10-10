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
| M5 live finale and loot reveal             | ⏳ not started                                                                                                                    |
| M6 polish, pixel art, retro UI             | ⏳ not started                                                                                                                    |

## Now

- `m4-raids` (pushed; staging): M4a server, M4b Discord posts, M4c Raid tab all committed, reviewed, main merged in (migrations: 7 = leet_sync source, 8 = raid, 9 = Discord posts).
- In flight: replay API follow-up (`you` alias + `bossHpMax` in the replay, on `m4-raids` working tree); balance pass on local branch `balance-2` in an agent worktree.
- Then: merge `balance-2` into `m4-raids`, full checks incl. `pnpm sim`, open one M4 PR to main.

## Next

1. M4 PR green; Misa tests on staging.
2. M5: live Sunday finale over WebSockets on the guild Durable Object, manual ability timing, loot reveal.
3. Dependabot PR #2 (vitest 5): wait until `@cloudflare/vitest-plugin` 1.4.x is 7 days old, then bump both together.
4. Later: an admin setting for the raid post channel (today it is the channel the Activity was last launched from).

## Open questions for Misa

(Also on the overnight page.)

- Raid posts go to the channel the Activity was last launched from. OK, or should a fixed channel be set? The bot needs View Channel + Send Messages there.

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
