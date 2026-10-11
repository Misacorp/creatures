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

- Production runs PR #7 (8cf2589): creature abilities, Boss Rank ladder, Festivals, crits, readiness band, after-action stats, wins-only pity, raid news pin.
- Branch `m6-look`: M6 "feels like a game". First a style sample artifact for Misa (palette, pixel font, sample sprites, boss card, UI panel), then the full pass.

## Next

1. Watch the first ranked week in production (placement at next week creation, or at Phase 1 for an open week).
2. M6 after Misa reacts to the style sample: sprites for every creature and boss, retro UI frame, juice (hit flash, "Critical!", loot reveal).
3. WebSocket push for the live finale after a staging spike in real Discord.
4. Dependabot PR #2 (vitest 5): wait until `@cloudflare/vitest-plugin` 1.4.x is 7 days old, then bump both together.

## Open questions for Misa

- None blocking. Style sample feedback when it's ready.

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
