# Roadmap

Status: **agreed with Misa 2026-10-13**. This is the forward-looking plan after M6 (PR #8, live in production). Each bigger item has its own design doc; this page gives the order, the intent and the links. Agents: read `CLAUDE.md`, then this page, then `docs/progress.md`.

## Where we are

Production runs PR #8 (`d4b3191`). It includes:

- the weekly raid with the live Sunday finale;
- creature abilities;
- the Boss Rank ladder with Festivals and seasons;
- crits;
- the readiness band and after-action stats;
- the pixel-art look with sprites;
- the fight stage with content-paced rounds and boss telegraphs;
- tap-to-fire with Auto fire;
- the pre-fight countdown;
- drag-and-drop placement;
- creature lore and quirks.

The first ranked week starts Monday 2026-10-12, and the first Festival is due five weeks later. Misa runs a multiplayer raid test the weekend after this plan.

## Priorities (in order)

| #   | Item                               | Intent (Misa's words where given)                                                                                                                                                                                                             | Design doc                                                                    |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | **Analytics and reports**          | Misa watches production, but agents also need tools "to analyse and understand the results and how players are playing the game": reports, day-by-day activity, whatever established games track to understand balance and player motivation. | [`design/analytics.md`](design/analytics.md)                                  |
| 2   | **How to play** and clickable tags | "All the roles, elements, etc. are not intuitive at all. Just being able to click on the tags that display stuff like Grove and Setter would help."                                                                                           | [`design/how-to-play.md`](design/how-to-play.md)                              |
| 3   | **Daily dungeon**                  | A solo daily mode with the player's own team of three. The server generates a seed and simulates the run. The client shows it as if it were happening live, then gives out the results and rewards. No real-time backend.                     | [`design/daily-dungeon.md`](design/daily-dungeon.md)                          |
| 4   | **Gear**                           | "Absolutely." Gear is the Essence sink, the raid, dungeon and Festival loot, and the stat depth (crit stats).                                                                                                                                 | [`design/gear.md`](design/gear.md)                                            |
| 5   | **Expeditions v2**                 | Misa has his own ideas; first he wants a proposal for expeditions as a feature players "get better at over time", unlocking more options and more interesting expeditions. More variety, plus a visual refresh of the screen.                 | [`design/expeditions-v2.md`](design/expeditions-v2.md)                        |
| 6   | **Polish backlog**                 | "Let's tackle all of this eventually."                                                                                                                                                                                                        | [Polish backlog](#polish-backlog) below                                       |
| 7   | **Routine upkeep**                 | "Let's do this."                                                                                                                                                                                                                              | [Upkeep](#upkeep) below                                                       |
| 8   | **WebSocket push** for live fights | "Seems interesting." Smoother live updates than polling, after a staging spike in real Discord.                                                                                                                                               | [`design/m5-finale.md`](design/m5-finale.md) (M5.1), [below](#websocket-push) |
| 9   | **More content**                   | "Eventually yes": bosses, creatures, Festival creatures, seasonal mutators.                                                                                                                                                                   | [below](#more-content)                                                        |
| 10  | **Swap requests**                  | "Good idea but not a priority."                                                                                                                                                                                                               | [below](#swap-requests)                                                       |

**Suggested batching (Misa prefers few, large PRs):**

- **PR A:** analytics, how to play, upkeep and the quick polish items.
- **PR B:** the daily dungeon and gear. They share loot, rewards and the playback stage.
- **PR C:** expeditions v2, after Misa adds his ideas to the proposal.
- WebSockets, content and swaps follow.

**The weekend multiplayer test:** before it, ship only fixes and polish to production. After it, fold Misa's findings into PR A or PR B.

## Polish backlog

Small items noticed during M6. Each is a one-line fix or a short task.

1. **Round number in the stage header lags the intro.** The header still shows "Round 3" while the intro shows "Round 4". Update the header when the intro starts.
2. **Ability badges overlap the sprites slightly.** Nudge them to the corner and shrink them a little at small scales.
3. **Expeditions screen visual pass:**
   - sprites walking on a destination map;
   - timer bars;
   - the catch reveal.

   Folded into expeditions v2, but a quick restyle can come first.

4. **Long-press to drag on touch,** if touch-scrolling the placement rows feels awkward. Today a drag starts on your own creature after 8 px of movement.
5. **"Strikes your strongest" telegraph is generic.** The stage doesn't know creature Attack. Add Attack to the stage row data, or a `strongest` hint in the live snapshot, so the forecast can name the target.
6. **Replay pacing drifts about 200 ms per round** behind the live timeline, because of per-beat timers. Drive replays from the same `liveTimeline` schedule.
7. **Backdraft is announced twice per round by the engine.** The client de-duplicates it; fix it at the source in `packages/engine`.
8. **Sprites:**
   - Misa finds Ashmole "kinda weird" but fine.
   - The bosses are still in the detailed style; decide whether to give them a chibi pass.
   - Stormray and Tempestray read slightly off-style.
9. **Effect description in the ability popover.** It was removed to keep the popover small; consider one muted line.
10. **Contract fixtures were partly script-edited** (PR #8). Add a `pnpm fixtures:capture` script that regenerates all fixtures from real server output in one go, so they never drift.
11. **Others' abilities summary** under the stage could become small icons on other players' creatures. Today it is a collapsed list.

## Upkeep

- **Vitest 5 and `@cloudflare/vitest-pool-workers` 1.4.x together.** Dependabot PR #2 bumps vitest alone and must not be merged as is. Bump both once the plugin release is at least 7 days old (`minimumReleaseAge`), run the full gate, then close PR #2.
- **Dependency review.**
  - Run `pnpm outdated` across the workspace.
  - Take only releases older than 7 days, with exact versions.
  - Check the Dependabot and secret-scanning alerts.
  - Refresh the pinned action SHAs in `.github/workflows/*` to current releases, each with a version comment, and re-run zizmor and actionlint.
- **Wrangler:** update to a current version and regenerate `worker-configuration.d.ts` (`pnpm cf-typegen`).
- **Dead code:**
  - Remove leftovers from replaced mechanics: the hidden jackpot UI paths and any old Hold wording.
  - Keep the Fortune streak code; it is a documented, default-off option.
- **Docs:**
  - Refresh `docs/progress.md`.
  - Mark superseded sections in older design docs (M2 expedition notes, M4 finale timing).
- **Staging:** practice fights and test data accumulate. Consider a staging-only reset route for one's own guild, behind `RAID_PRACTICE` or a separate flag.

## WebSocket push

Live finales and practice fights poll every 2 s and at round boundaries. A push channel would make other players' Fire presses, round starts and the countdown arrive instantly, and cut requests.

- **Plan** (from `m5-finale.md`, M5.1):
  1. First, a **staging spike inside real Discord** on desktop, iOS and Android. It checks the `/.proxy` versus bare path, query-string tickets, idle timeouts and backgrounding.
  2. Then use the Durable Object Hibernation API with a one-time ticket (`POST /api/raid/live/ticket`, single use, 60 s) and an origin check.
  3. The server pushes the same snapshot shape. Polling stays as the fallback.
- **Research** is already in `docs/research/platform.md` ("Live finale transport").

## More content

- **Harder bosses that hit harder**, so guards and shields matter. The luck study found that about 4 to 6 knockouts per finale make Shield Wall timing count. They also add new mechanics, not just numbers, for high ranks.
- **Fill role gaps:** there is no Spark guard, and there are few supports. Each new species needs:
  - lore;
  - a visual brief;
  - a sprite in the chibi style;
  - an ability;
  - a sim pass.
- **More Festival creatures,** rotating by season.
- **Seasonal mutators** (the engine has mutator hooks) for Festival weeks.

## Swap requests

A player can ask another for a raid slot swap. The other player accepts or declines in the Raid tab, and the server swaps the two placements in one transaction. Requests expire at the next phase lock. This is low priority; build it when placement friction shows up in the analytics or in Misa's tests.
