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

## Next

Follow `docs/roadmap.md`. Next is item 5, analytics reports and the balance loop (`design/analytics.md` phase 2, `design/balance-loop.md`), with item 5b, dev tools (`design/dev-tools.md`), in parallel where files don't overlap. After that comes item 6, cleanup pass 1 (`design/cleanup-1.md`). Lore and new content start from `docs/compendium/`.

**Overnight plan (2026-10-13, after Misa's go-ahead):**

1. **Analytics server.** Build the rollups (resource flow and per-feature use), the guild directory, the ops endpoint with privacy tests, and the report workflow (it needs `OPS_TOKEN`; send Misa the checklist in `design/analytics.md`).
2. **Dev tools server.** Build the `DEV_TOOLS` gate, the dev clock and the `/api/dev/*` routes, in a separate worktree. Reconcile the shared files (`guild-core.ts`, `wrangler.jsonc`) at merge.
3. **Analysis.** Build `pnpm analyze`, `pnpm sim:live`, `pnpm scalars` with its staleness test, `docs/balance/log.md`, `pnpm patch-notes`, and the `patch-notes` skill.
4. **Dev tools panel.** Build the client panel per view.
5. **PRs.** Open one PR for analytics and the balance loop, and one for dev tools; or one combined PR if they are ready together. Send Misa the `OPS_TOKEN` checklist.
6. **Cleanup.** Run the cleanup audit, read-only, so the cleanup PR can start next.

## Open questions for Misa

See "Open design questions" in `docs/roadmap.md`. Misa will need to add the `OPS_TOKEN` secret when the report workflow lands; the checklist will follow.

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
