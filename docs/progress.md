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

- **PR #6** (hotfix, branch `ccr-8ffccd88-e59k13`): the Activity rejected jackpot first-on-server records; must merge before the first live finale (Sun 2026-10-11 20:00 Helsinki).
- **PR #7** (branch `creature-abilities`): creature abilities (phase 1 content/engine/sim + phase 2 worker/client), wins-only pity, raid news channel pin (migration 11). Full sim 21/21. Waiting for Misa to test on staging and merge.

## Next

1. After #6/#7 merge: verify prod deploys; check the first live finale and its Discord post.
2. Luck: fights are fully deterministic today (the engine never draws from its RNG). Branch `luck-measure` (49463da, pushed) adds an off-by-default luck config to the engine plus a study CLI (`node packages/sim/scripts/luck.mjs`) and `docs/design/luck.md`. Recommended "Fortune" Surge/Slump streaks (±60%, 17%/side/round, 3 rounds, all phases); waiting for Misa's pick, then boss HP retune and client banners.
3. M6 "feels like a game": pixel art creatures and bosses, retro UI, juice. Misa wants this before a multiplayer test.
4. WebSocket push for the live finale after a staging spike in real Discord.
5. Dependabot PR #2 (vitest 5): wait until `@cloudflare/vitest-plugin` 1.4.x is 7 days old, then bump both together.

## Open questions for Misa

(On the setup checklist artifact, "Decisions" section.)

- Pity: count lost finales toward the hard-pity jackpot, wins only (recommended), or half?
- Creature abilities defaults (unlock level 10, use every unlocked ability in your team of 3, basic ability for newcomers).

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
