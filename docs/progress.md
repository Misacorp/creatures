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

- Production runs PR #8 (`d4b3191`). First ranked week started 2026-10-12; first Festival five weeks later. Misa runs a multiplayer raid test this coming weekend.
- Plans written on branch `plans` (2026-10-13): `docs/roadmap.md` plus `docs/design/{analytics,how-to-play,daily-dungeon,gear,expeditions-v2}.md`.

## Next

Follow `docs/roadmap.md` (reordered 2026-10-13): 1 how to play + clickable tags (with the analytics event log and a beta superscript), 2 gear and crafting, 3 expeditions v2 (Misa commenting), 4 daily dungeon, 5 analytics reports, 6 polish backlog, 7 upkeep, 8 WebSocket push, 9 content, 10 swap requests.

## Open questions for Misa

- Expeditions v2: Misa is commenting in the shared doc `https://claude.ai/code/artifact/40f1a5e0-df40-4d61-8e04-154751c36f48` (docs connector; read its comments with the docs tools, then update `docs/design/expeditions-v2.md`).
- Daily dungeon: attempts per day, leaderboards.
- Gear: one or two slots; jobs and expeditions as one shared busy state or separate; how many crafting skills.
- Analytics: add the `OPS_TOKEN` secret when the report workflow lands (checklist will follow).

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
