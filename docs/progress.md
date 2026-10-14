# Progress log

Where the project is against the plan. Agents: read `CLAUDE.md`, then **`docs/roadmap.md`** (the forward plan and its design docs), then this file. Update it whenever a step lands or the plan changes.

## Milestones

| Milestone                                  | State                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| M0 foundation, CI, deploys                 | ✅ merged (PR #1)                                                                                                                 |
| M1 Discord login, leet API, Bait ledger    | ✅ merged (PR #1, #3). Real leet points live in production (#4 fixed the CI timeout that blocked #3's deploy; prod runs 13081d4). |
| M2 starters, expeditions, training, fusion | ✅ merged (PR #1)                                                                                                                 |
| M3 combat engine, balance simulator        | ✅ merged (PR #1). First tuning pass done; deeper tuning still open.                                                              |
| M4 weekly raid                             | ✅ merged (PR #5, #7)                                                                                                             |
| M5 live finale and loot reveal             | ✅ merged (PR #5, #7, #8); WebSocket push is roadmap item 8                                                                       |
| M6 polish, pixel art, retro UI             | ✅ merged (PR #8, production d4b3191)                                                                                             |

## Now

- Production runs PR #10, merged 2026-10-13: the daily dungeon, expeditions v2, the 13:37 reset, the tab order, the Jersey 10 font and the combined balance pass. PR #9 shipped How to play, gear v1 and the event log.
- PR #11 (UX pass 1 and the design compendium) is in production, merged 2026-10-13 (`ec44e6e`).
- **Dungeon order of play (2026-10-14, branch `worktree-agent-a151f66c8c91b38c5`):** every dungeon fight now goes left to right, then the foe (`RULES.dungeon.turnOrder`); dungeon foes lost their turn order, and Fog was replaced by Echoing (Payoff +20%). The order is shown before the run and in the playback (slot numbers and a turn strip). Waiting for review with the rest of the stack.

## Next

Follow `docs/roadmap.md`.

- **Items 5 and 5b are built** (branch `analytics`, PR #12, 2026-10-14 overnight): rollups, guild directory, ops endpoint, report workflow, `pnpm analyze`, `pnpm sim:live`, `pnpm scalars`, `pnpm patch-notes`, the `patch-notes` and `balance-review` skills, and the staging-only dev tools (server gate, dev clock, `/api/dev/*`, client panel). Waiting for Misa to review, merge and add `OPS_TOKEN`.
- **Item 6, cleanup pass 1:** slices 1, 2 and 4–18 are built (branch `cleanup-1`, PR #14, stacked on #12). Left: slice 3 (unused glossary entries and v1 expedition rules) and the four game-feel questions at the end of `design/cleanup-1-audit.md`, then step 3 upkeep (Vitest 5 and Dependabot PR #2, outdated dependencies, zizmor and actionlint). Screenshot and interaction harnesses used for the slices live only in the session scratchpad; recreate from the PR #14 description if needed.
- The first real balance report needs about a week of rolled-up data after `OPS_TOKEN` is set. Then run the `balance-review` skill.

## Open questions for Misa

See "Open design questions" in `docs/roadmap.md`. Misa needs to add the `OPS_TOKEN` secret (checklist in PR #12 and `design/analytics.md`).

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
