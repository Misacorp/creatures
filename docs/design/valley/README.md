# The Valley: a game world built around the creatures

Status: **planning** (started 2026-10-29). Nothing here is shipped. The game today is the page-based Activity; the valley exists as a staging-only prototype (`prototype.html#valley`) and as this plan.

This folder is the home of the valley and "peaceful systems" overhaul: the world as the game's menu, creatures holding job posts, roster-wide growth, co-op idling for the whole server, and the economy that ties it together. Any agent (or the lead after a context compression) starts here.

## North Star

Opening the game is walking into your valley and seeing your creatures at work. Every creature you catch becomes useful, because every one of them can hold a post, grow and be picked for a challenge. Being away never costs anything; coming back tells you a short story of what happened, with one surprise and one real choice. The server shares the valley: what friends do for the common good shows in the world, and the places themselves grow when the server builds them up together.

## Which document wins (authority, highest first)

1. **Misa's decisions**: `docs/design/decisions.md` (entries tagged "Valley") and the **accepted** goals in [`goals.md`](goals.md).
2. **The system docs** in [`systems/`](systems/): one per system, each with a status (idea, proposed, accepted, built).
3. **The economy lab** (to be built, [`economy/model.md`](economy/model.md)): its data and tests. Where a system doc and the lab disagree, fix one of them in the same change.
4. **Generated reports** in [`economy/`](economy/) (never edit by hand once the lab exists).
5. **Research** in `docs/research/` (evidence, not rules).
6. **The compendium** (`docs/compendium/`) holds names and flavour only.

Numbers live in data, never in prose. A doc may give an example number, marked as an example.

## Reading order for an agent

1. This page, then [`log.md`](log.md) (the newest entries: where we are and what is next).
2. [`goals.md`](goals.md): what we are trying to achieve, and the filters every idea must pass.
3. [`roadmap.md`](roadmap.md): the phases, their gates, and the current phase.
4. [`questions.md`](questions.md): the question ledger (what waits for Misa, what is queued, what he answered), and [`deciding.md`](deciding.md): how we decide with him, in rounds of one to three questions.
5. The system docs your task touches, in [`systems/`](systems/).
6. [`process.md`](process.md): how we iterate (agents, the reviewer panel, the simulations).
7. Research: [`docs/research/idle-job-posts.md`](../../research/idle-job-posts.md), [`collectors-idle-and-rewards.md`](../../research/collectors-idle-and-rewards.md), [`idle-coop-raids.md`](../../research/idle-coop-raids.md).

## What exists today

| Thing                                                                                | Where                                                                                        | State                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| Valley prototype (the hybrid: valley world, full-screen place scenes, creature tray) | `apps/activity/src/proto/valley/`, staging `prototype.html#valley` (DEV panel, "Prototypes") | clickable, fixture data, staging only |
| Party prototype (creatures first)                                                    | `apps/activity/src/proto/party/`                                                             | kept for comparison; the valley won   |
| Prototype scaffold, shared sample world, tour steps, shooter                         | `apps/activity/src/proto/*.ts`, `apps/activity/scripts/proto-shoot.mjs`                      | built                                 |
| Full-window desktop layout, three looks (arcade, hearth, quest), room on Home only   | the game, looks staging only (DEV panel, "Look")                                             | built on branch `ccr-93a1de17-yutb1a` |
| Valley map (places, what players do, shortcuts, posts idea)                          | Claude artifact "Valley Map" (Misa has the link)                                             | v2                                    |
| Research on job posts, roster XP, idling, the School, co-op idle                     | `docs/research/idle-job-posts.md`                                                            | done                                  |

Today's game against the vision, system by system (keep, rework or scrap): [`scrap-list.md`](scrap-list.md).

## Where we are (2026-10-30)

- **Phase 1** (the base systems on paper): every system is drafted in full, reviewed by the panel (`reviews/`) and decided by Misa in 13 rounds of questions (`questions.md`, 35 answers), except the School, which waits on combat v2's talents. Nearly every number is still an example.
- **Phase 2 started** (Q32): the resource map (`economy/resources.md`) and the economy lab (`economy/model.md`, `packages/econ`), being built.
- **Phase 2 passed** (round 18, Q47); **phase 3 (prototype the feel) is current** (`phase3-plan.md`).
- **Waiting on Misa:** nothing. Round 18 decided the School teaches talents (with visiting teachers), a broker post trades shards, and the gate. Queued: **targets** (the rest of `goals.md`'s numbers, with the prototype).
- **How to continue:** read the last entry of `log.md`, then `questions.md`'s "Waiting on Misa"; run the `valley-round` skill to record answers and ask the next round.
- **Seams with combat v2** (`combat-v2-track`): the roster profile the economy lab must output, the fixed boss track, gear's stats and lines (`roadmap.md`). The combat session can message this one.

## The systems (one doc each)

| System                                                    | Doc                                        | Status                                                             |
| --------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| The valley as the world and the menu                      | [`systems/valley.md`](systems/valley.md)   | prototype                                                          |
| Job posts                                                 | [`systems/posts.md`](systems/posts.md)     | proposed; core rules decided (rounds 1–7); panel 2026-10-30        |
| The bonfire: roster-wide growth                           | [`systems/bonfire.md`](systems/bonfire.md) | proposed; core rules decided (rounds 4–6); panel 2026-10-30        |
| The return moment ("while you were away")                 | [`systems/return.md`](systems/return.md)   | proposed; core rules decided (round 8); panel 2026-10-30           |
| Scouts: expeditions as standing posts                     | [`systems/scouts.md`](systems/scouts.md)   | proposed; panel 2026-10-30; numbers wait on the lab                |
| The Forge loop: crafting fed by finds                     | [`systems/forge.md`](systems/forge.md)     | proposed; decided rounds 9–10; panel 2026-10-30                    |
| The School and visiting teachers                          | [`systems/school.md`](systems/school.md)   | idea; waits on combat v2's talents                                 |
| The commons: co-op idling for the whole server            | [`systems/commons.md`](systems/commons.md) | proposed; decided rounds 1–12; panel 2026-10-30                    |
| Gear: crafting, item level and the lottery                | [`systems/gear.md`](systems/gear.md)       | decided in part (rounds 9–11); cap sources proposed                |
| The raid as defending the valley                          | [`systems/defence.md`](systems/defence.md) | direction set by Misa (round 5); combat lives on `combat-v2-track` |
| Later: cosmetics, housing, gardening, fishing, stargazing | [`systems/later.md`](systems/later.md)     | parked                                                             |

## Relationship to other work

- **Combat v2** (`docs/design/combat/`, branch `combat-v2-bosses`) owns fights, Knacks, the talent rework and the raid weekend's rules. The valley owns where and how creatures live, work and grow between fights. Shared seams: creature XP and levels, talents (the School teaches what combat v2 defines), the raid's muster and framing. Agree changes on a seam with the combat lead before building.
- **The shipped game** keeps working while this is planned; nothing here changes it until Misa accepts a phase (see [`roadmap.md`](roadmap.md)).
