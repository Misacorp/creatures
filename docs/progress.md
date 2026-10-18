# Progress log

Where the project is against the plan. Agents: read `CLAUDE.md`, then **`docs/roadmap.md`** (the forward plan and its design docs), then this file. Update it whenever a step lands or the plan changes.

## Milestones

| Milestone                                  | State                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| M0 foundation, CI, deploys                 | ✅ merged (PR #1)                                                                                                                 |
| M1 Discord login, leet API, Bait ledger    | ✅ merged (PR #1, #3). Real leet points live in production (#4 fixed the CI timeout that blocked #3's deploy; prod runs 13081d4). |
| M2 starters, expeditions, training, fusion | ✅ merged (PR #1)                                                                                                                 |
| M3 combat engine, balance simulator        | ✅ merged (PR #1). Retuned in #24 (attack patterns, raid curve, journey sim).                                                     |
| M4 weekly raid                             | ✅ merged (PR #5, #7)                                                                                                             |
| M5 live finale and loot reveal             | ✅ merged (PR #5, #7, #8); WebSocket push is roadmap item 8                                                                       |
| M6 polish, pixel art, retro UI             | ✅ merged (PR #8, production d4b3191)                                                                                             |

## Now

- Overnight cleanup 2026-10-18/19 (branch `ccr-8ffccd88-e59k13`): audit fixes, test speed, docs; proposals for Misa in the PR.
- **Production (2026-10-18):** main `f034142` (PR #35). Since `3b61330` (2026-10-15) it also includes:
  - #24: the raid retune: attack patterns, Guards, phase floors and enrage, a raid difficulty curve, the Bait allowance, raid rewards, the journey simulator;
  - #25: staging deploys only on a manual run; the footer shows branch and commit; agents cannot merge;
  - #26: tab pips, a kept dungeon setup, claims that scroll to their result;
  - #27: supplies from the dungeon and the Workshop instead of Bait; the systems review;
  - #28, #30: player feedback with `/feedback` (public issues, private screenshots) and the export fix;
  - #31: gear and creature revamp part 1: Hat, Scarf and Charm with item levels and lines, crafting with Reach, talents and the Talent Book, training by activity, Boons and Omens, the focused creature card;
  - #32: daily dungeon paths: a shared daily map played room by room, the camp, the pack, keepsakes, mystery rooms and the Undercroft;
  - #33: raid fights match the board exactly (slots kept, per-row silences, soft auto tiles, teammates can move an away player's creatures);
  - #34: the lounge message replaces Discord's launch card; Activity art;
  - #35: revamp part 2: two evolution forms for every evolving line, the last three weathers, gear sets and special lines, flipping and compare, one colour per kind of XP, the type scale and per-panel pixel font (`design/ux-patterns.md`).
- **Staging:** runs whichever branch was last deployed by hand (its footer shows branch and commit). Misa uses it for several branches; deploy it only when he asks.
- **Open PR:** #36, raid posts in Discord as embeds with the boss portrait and a Play button (another session).
- **Reports:** the report workflow runs daily at 06:17 UTC; agents read the JSON from its job log. Run the `balance-review` skill on the next report: #31–#35 changed gear, training and the dungeon, so live numbers from before 2026-10-18 no longer describe the game.

## Next (in order)

1. **Polish and seams pass** after the two big merges (#32 into #35 by hand): bugs at the dungeon-paths and part-2 seams, UX consistency with `design/ux-patterns.md`, consolidated components.
2. **Upkeep:** one dependency bump (vitest 5.0.3 with `@cloudflare/vitest-plugin` 1.4.0, wrangler 4.149.0, vite 8.3.4, typescript-eslint 8.71.1, prettier 3.9.10), then close Dependabot #2 and #13; faster sim tests in CI; status lines of shipped design docs.
3. **Balance review** on live data from the revamp (raid targets, gear share, dungeon depth).
4. **Support reach shapes:** design and sim first, `attack-patterns.md` section 7.
5. **Content:** new species packs, later expedition areas, Festival creatures; see the roadmap, item 9.

## Open questions for Misa

See "Open design questions" in `docs/roadmap.md`.

## Notes for future agents

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Test timeouts: engine 30 s, game the default, sim 120 s. A test that needs more is a test to split or move down a layer (`design/testing.md`), not a timeout to raise.
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
- The overnight cleanup of 2026-10-18/19 left its proposals on a decision page with Yes / Later / No per item: `https://claude.ai/artifact/UArBxYixFXiy17xAVJnT3F`. Misa's answers are in its database, collection `decisions` (one document per item id: `verdict`, `note`); read them with the ArtifactData tool before acting on a proposal.
