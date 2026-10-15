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

- **Production (2026-10-15):** main `3b61330`. Since 2026-10-14 it also includes:
  - PR #12: analytics reports, the balance loop, dev tools;
  - PR #14: cleanup pass 1;
  - PR #15: the component workbench at `creatures-staging.misacorp.dev/workbench.html`;
  - PR #17: the living room, Misa's own branch;
  - PR #18: the dungeon always acts left to right, the reworked dungeon fight, pre-run and post-run screens, "1 / 3" counts, the role assessment, and the attack-pattern design;
  - PR #20: the test timeout fix that unblocked the production deploy;
  - PR #21: Raid UX pass 2 and the Raid Roster (at most 3 creatures a player);
  - PR #22: the dungeon pre-run card with the roster board, the last team remembered, the fight screen that does not spoil the result, bosses that ignore fallen creatures;
  - PR #23: drag and drop in the living room (another session).
- **In progress:** the raid retune (attack patterns, phase floors, enrage) on branch `ccr-8ffccd88-e59k13`.
- **Reports:** `OPS_TOKEN` is set. The report workflow runs daily at 06:17 UTC; agents read the JSON from its job log. The first rollups landed 2026-10-14. After about a week of data, run the `balance-review` skill.

## Next (in order)

1. **Attack patterns plus raid structure** (being built), as one raid retune: `design/attack-patterns.md`, section 6 for the slices, and the "Raid structure" section of `design/raid-ux-2.md`. The structure part is phase floors (the boss goes immune and the phase ends, no overkill, finale at 15%) and enrage (raid finale, plus dungeon boss rooms to teach it; an enrage loss is a normal loss). Misa decided all four questions on 2026-10-14.
   - The seven moves for raid bosses and dungeon foes.
   - Guard cover.
   - Element supports: Stoke, Overcharge, Mend.
   - Fixed, announced landmark bosses.
   - A single-hit cap.
   - A review of the Cinder Wyrm reflect.
   - Misa decided: hit hard, randomness is fine, Support is not a ward, landmarks fixed.
2. **Support reach shapes:** design and sim first, `attack-patterns.md` section 7.
3. **Cleanup leftovers:**
   - slice 3 (unused glossary entries, v1 expedition rules), after Misa answers the audit questions;
   - upkeep: Vitest 5 and Dependabot PR #2, outdated dependencies, zizmor and actionlint.
4. **Content:** Grove and Tide support species, new elements and later expedition areas. See the roadmap, item 9.

## Open questions for Misa

See "Open design questions" in `docs/roadmap.md`. Misa needs to add the `OPS_TOKEN` secret (checklist in PR #12 and `design/analytics.md`).

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Heavy statistical tests need the 30 s package timeout (engine, game) or 60 s (sim).
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
