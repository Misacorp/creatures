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

- Production runs PR #9 (How to play, gear and crafting v1, analytics event log; merged 2026-10-13).
- Branch `dungeon` (combined PR, 2026-10-13): the daily dungeon (single row), expeditions v2 (creature explorer ranks, destinations as banner cards, supplies, push-on choices, Journal, profile, 1-slot restart), the combined balance pass (47 of 47 sim targets on `leet`), the tab order Creatures · Workshop · Expeditions · Dungeon · Raid, the Jersey 10 pixel font, the 13:37 daily reset, and the small-creature popover.

## Next

Follow `docs/roadmap.md`: after the combined PR, 5 analytics reports (rollups, ops endpoint, report workflow, `OPS_TOKEN` checklist for Misa), 6 polish backlog, 7 upkeep, 8 WebSocket push, 9 content, 10 swap requests.

## Open questions for Misa

- Dungeon: leaderboards or bragging posts (not built). Depth 1 is slightly hard on one sim seed (78.6% first-week clear against 80%): make depth 1 gentler?
- Gear: a second slot later? Crafted items never beat drops today.
- Analytics: add the `OPS_TOKEN` secret when the report workflow lands (checklist will follow).

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
