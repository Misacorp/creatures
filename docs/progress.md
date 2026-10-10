# Progress log

Where the project is against the plan. Newest state at the top of each section. Agents: read this after `CLAUDE.md`; update it whenever a milestone step lands or the plan changes.

## Milestones

| Milestone                                  | State                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| M0 foundation, CI, deploys                 | ✅ merged (PR #1)                                                                                                                 |
| M1 Discord login, leet API, Bait ledger    | ✅ merged (PR #1, #3). Real leet points live in production (#4 fixed the CI timeout that blocked #3's deploy; prod runs 13081d4). |
| M2 starters, expeditions, training, fusion | ✅ merged (PR #1)                                                                                                                 |
| M3 combat engine, balance simulator        | ✅ merged (PR #1). First tuning pass done; deeper tuning still open.                                                              |
| M4 weekly raid                             | ✅ in PR #5 (waiting for Misa)                                                                                                    |
| M5 live finale and loot reveal             | ✅ in PR #5 (waiting for Misa); WebSocket push deferred                                                                           |
| M6 polish, pixel art, retro UI             | ⏳ not started                                                                                                                    |

## Now

- **PR #5** (https://github.com/Misacorp/creatures/pull/5), head branch `m4-raids` (= `m5-finale`): M4 raid + M5 live finale + balance pass 2. All checks green locally; staging runs it. Waiting for Misa to test (practice finale on staging) and merge.

## Next

1. After #5 merges: verify the production deploy (`/api/config` version), watch the first real Sunday finale.
2. WebSocket push for the live finale (M5.1), after a staging spike in real Discord on desktop, iOS, Android (`docs/design/m5-finale.md`).
3. Apply Misa's answers (pity rule, reactions share, Hold rule, post channel).
4. M6: polish, pixel art, retro UI; Essence sinks (gear); admin setting for the post channel; swap requests.
5. Dependabot PR #2 (vitest 5): wait until `@cloudflare/vitest-plugin` 1.4.x is 7 days old, then bump both together.

## Open questions for Misa

(Also on the overnight page and in PR #5.)

- Pity: should a lost finale count toward the hard-pity jackpot? (Balance report: counting losses makes 66% of players hit hard pity in 20 weeks.)
- Reactions are about half of all damage after balance pass 2. OK?
- Raid posts follow the channel the Activity was last launched from. OK, or a fixed channel?
- Live finale Fire/Hold rule (held ability fires in the last round if forgotten). OK?

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
