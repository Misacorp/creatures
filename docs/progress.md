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

- **The valley (2026-11-04):** phases 1 (systems on paper), 2 (the economy lab) and 3 (the prototype on staging: the welcome-back Gazette, markers that open their places, the new places, the School's teacher) are **done**; phase 3 passed with Misa on 2026-11-04 (Q55). Phase 4, the valley frame over today's game behind a staging flag, is next (`docs/design/valley/phase4-plan.md`; step 0, the resource library, is done; step 1, the `VALLEY` flag and the shell with the map, the tray, the Places list and the seven open places, is built). Phase 5 (the base systems, server-side; `phase5-plan.md`): step 0, the foundations (the `VALLEY_SYSTEMS` flag, one source of numbers in `@creatures/game`, the `settle` skeleton, `valley-fresh`, the lab's `compare`), is built. Branch `ccr-93a1de17-yutb1a`.
- **Combat v2 (2026-11-03):** phases 1 (design in the lab), 2 (the engine port) and 3 (content as data, #118) of 8 are **done**. Phase 4, game integration behind the `COMBAT_V2` flag on staging, is in progress on `combat-v2-phase4` (plan: `docs/design/combat/integration.md`, progress in its section 14): the engine plays a stage at a time with board events and the finale's inputs; the server stores Knacks, the v2 Talent Book and the track; the raid weekend (Saturday, Sunday, the live finale) and the dungeon run on v2; the bots and the raid test bench (clear the board, fill it, pick a rank, play each stage and open its replay; it replaced `raid-weekend` and the other raid dev tools) let the gate play a weekend on staging; the client has the Knack picker, the v2 creature page, the v2 raid tab (board, move highlights, boss card, track strip, swap requests) and fight playback (the stage view with the mark strip and announced moves, the replay, the results list, the live finale with its one input) and the dungeon's screens (a room on the stage's single row, each foe's move tiles on the map, "Out" for a creature at 0 HP and a descent that revives the fallen as on v1 (2026-11-04), the Knack on the team setup). Still to build: the gate's staging weekend. Next steps and their order: `docs/design/combat/roadmap.md`, "Where we are".
- **Combat v2 phase 5, slice 1 (2026-11-04):** the lab's path can play the game's raid rules (`packages/lab/src/journey.ts`: seats from the piece, players locked at stage 1, replacements from each player's own spares, the engine's `stageV2`), on servers of 5, 8 and 15 and parties of one to three. The lab report has a "Journey on the game's rules" section beside the old rules. Under four players waits for the engine's smaller boss. No tuned number changed.
- **Hidden best-of rewards (2026-11-04):** a best-of gear roller (`rules/best-of.ts`: roll X to Y pieces, keep the best N to M, spec as data and moved by depth, Undercroft level or Boss Rank) and combat v2 dungeon gear, pack and XP that grow with depth, the Undercroft at its own depth (`RULES.dungeon.depthRewards`, first numbers to tune). Combat v1 is unchanged (rolls 1, keep 1, same dice). `dungeonRewardScalars(depth)` is ready for the depth picker. Lab report: `report -- --dungeon-days --rewards`. The raid's kill bonus is not changed.
- Overnight cleanup 2026-10-18/19 (branch `ccr-8ffccd88-e59k13`): audit fixes, test speed, docs; proposals for Misa in the PR.
- **Production (2026-10-18):** main `f034142` (PR #35). Since `3b61330` (2026-10-15) it also includes:
  - #24: the raid retune: attack patterns, Guards, phase floors and enrage, a raid difficulty curve, the Bait allowance, raid rewards, the journey simulator;
  - #25: staging deploys only on a manual run; the deployed branch and commit are in the page's meta tags; agents cannot merge;
  - #26: tab pips, a kept dungeon setup, claims that scroll to their result;
  - #27: supplies from the dungeon and the Workshop instead of Bait; the systems review;
  - #28, #30: player feedback with `/feedback` (public issues, private screenshots) and the export fix;
  - #31: gear and creature revamp part 1: Hat, Scarf and Charm with item levels and lines, crafting with Reach, talents and the Talent Book, training by activity, Boons and Omens, the focused creature card;
  - #32: daily dungeon paths: a shared daily map played room by room, the camp, the pack, keepsakes, mystery rooms and the Undercroft;
  - #33: raid fights match the board exactly (slots kept, per-row silences, soft auto tiles, teammates can move an away player's creatures);
  - #34: the lounge message replaces Discord's launch card; Activity art;
  - #35: revamp part 2: two evolution forms for every evolving line, the last three weathers, gear sets and special lines, flipping and compare, one colour per kind of XP, the type scale and per-panel pixel font (`design/ux-patterns.md`).
- **Staging:** runs whichever branch was last deployed by hand (its meta tags and DEV panel show branch and commit). Misa uses it for several branches; deploy it only when he asks.
- **Open PR:** #36, raid posts in Discord as embeds with the boss portrait and a Play button (another session).
- **Reports:** the report workflow runs daily at 06:17 UTC; agents read the JSON from its job log. Run the `balance-review` skill on the next report: #31–#35 changed gear, training and the dungeon, so live numbers from before 2026-10-18 no longer describe the game.

## Next (in order)

1. **Polish and seams pass** after the two big merges (#32 into #35 by hand): bugs at the dungeon-paths and part-2 seams, UX consistency with `design/ux-patterns.md`, consolidated components.
2. **Upkeep:** one dependency bump (vitest 5.0.3 with `@cloudflare/vitest-plugin` 1.4.0, wrangler 4.149.0, vite 8.3.4, typescript-eslint 8.71.1, prettier 3.9.10), then close Dependabot #2 and #13; faster sim tests in CI; status lines of shipped design docs.
3. **Balance review** on live data from the revamp (raid targets, gear share, dungeon depth).
4. **Support reach shapes:** design and sim first, `attack-patterns.md` section 7.
5. **Content:** new species packs, later expedition areas, Festival creatures; see the roadmap, item 9. Art can run ahead of content: the Void concepts (four roles, no names or stats; 2026-10-30) are the first set drawn with the art studio (`design/art-studio.md`).

## Open questions for Misa

See "Open design questions" in `docs/roadmap.md`.

## Art direction: where it stands (handoff)

The lead agent owns art direction (`decisions/direction.md`, 2026-10-31). To pick up after a compaction or in a new session: read `docs/design/art-studio.md` (workflow, brief template, review checklist), then the art library catalogue `docs/art/README.md`, then Misa's verdicts on the art review page (`https://claude.ai/artifact/36APiGzTDAhvx359SHVkyX`, collection `reviews`, read with the ArtifactData tool). Rebuild and republish the page with `pnpm art review` after any art change.

- **Merged to main:** #120, #122 and #123 (the camp places, the sky strip, the School's visiting teacher, sprites up to 128 wide).
- **Valley art from now on:** goes on branch `claude/valley-art`, cut from the valley branch, and the valley session merges it; no PR to `main` (Misa, `decisions/direction.md` 2026-11-03). First on it: the School cupola centred (roof on the tower, an even frame round the bell opening, bell frames to match).
- **Waiting on Misa:** the newer drafts on the review page (the Void evolved forms and shinies, the redone Void foes, the House, Forge and Cave, the camp places, the sky and the School visit).
- **The valley prototype** (another session, branch `ccr-93a1de17-yutb1a`) draws the `valley-glow` places; it asks for art by cross-session message. Next likely asks: skies per location (forest, coast, mountains: same bands, a new horizon).
- **Not applied from the retro:** proposals 5 (no commit after a pipe; `git diff --check` before committing a merge) and 6 (publish an artifact only after its review).

## Notes for future agents

- Art review page for Misa: `https://claude.ai/artifact/36APiGzTDAhvx359SHVkyX` (Like / Redo / note per piece; answers in its database, collection `reviews`, one document per piece with `piece`, `verdict`, `note`). Read it with the ArtifactData tool before changing library art. Regenerate it after art changes with `pnpm art review` and republish it at the same URL (`design/art-studio.md`).
- Overnight 2026-10-31 (branch `claude/void-art`): Void concept sets in the library (creatures with stage 2 and shiny, the Quiet Verge place, gear, raid boss, foes, floor bosses), creatures wear their gear on their sprite, creatures blink and shiny ones twinkle.
- Pixel art: draw it with the art studio (`pnpm art <set>`, `design/art-studio.md`). Art drawn ahead of content is kept in the art library, catalogue `docs/art/README.md`; check it before adding content.

- Staging's last-week leet credits are simulated; real ones from 2026-10-11 on.
- `redirect: 'error'` is rejected by workerd; always use `'manual'`.
- Test timeouts: engine 30 s, game the default, sim 120 s. A test that needs more is a test to split or move down a layer (`design/testing.md`), not a timeout to raise.
- Misa's artifacts: setup checklist `https://claude.ai/artifact/Co4LRr4AiLyCPU2juAHFHW` (db-backed tasks); overnight summary `https://claude.ai/artifact/BRuaFKN1Gf7uPaoT1bfjLT` (static page; lead agent republishes it from its scratchpad file `overnight.html`). Keep the overnight page short: only what's done, what's in progress, and questions for Misa.
- The overnight cleanup of 2026-10-18/19 left its proposals on a decision page with Yes / Later / No per item: `https://claude.ai/artifact/UArBxYixFXiy17xAVJnT3F`. Misa's answers are in its database, collection `decisions` (one document per item id: `verdict`, `note`); read them with the ArtifactData tool before acting on a proposal.
