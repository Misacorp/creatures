# Roadmap

Status: **agreed with Misa 2026-10-13**. This is the forward-looking plan after M6 (PR #8, live in production). Each bigger item has its own design doc; this page gives the order, the intent and the links. Agents: read `CLAUDE.md`, then this page, then `docs/progress.md`.

## Where we are

Updated 2026-10-13, end of day.

| What                                                                                                                                                   | Where  | State         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------- |
| How to play and clickable tags, analytics event log, gear and crafting v1                                                                              | PR #9  | in production |
| Daily dungeon (single row), expeditions v2, 13:37 daily reset, tab order, Jersey 10 font, small-creature popover, combined balance pass                | PR #10 | in production |
| UX pass 1 (`design/ux-pass-1.md`): Expeditions, Dungeon and Raid screens, rank-up gifts, no chance percentages, design compendium (`docs/compendium/`) | PR #11 | in review     |

All 47 balance targets pass on seed `leet`. The first ranked week started 2026-10-12, and the first Festival is due five weeks later.

## Priorities (in order)

| #   | Item                           | State           | Intent and notes                                                                                                                                                                                                               | Design doc                                                                    |
| --- | ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | How to play and clickable tags | done (#9)       | "All the roles, elements, etc. are not intuitive at all."                                                                                                                                                                      | [`design/how-to-play.md`](design/how-to-play.md)                              |
| 2   | Gear and crafting              | v1 done (#9)    | Dismantle, upgrade, improve, craft from blueprints, enchant; slow creature downtime jobs and a Crafting skill. **Festival gear stays a Festival-finale-only prize; it is never craftable** (Misa, 2026-10-13).                 | [`design/gear.md`](design/gear.md)                                            |
| 3   | Expeditions v2                 | done (#10, #11) | Creature explorer ranks, familiarity, banner cards, supplies, push-on choices, Journal, rank-up gifts.                                                                                                                         | [`design/expeditions-v2.md`](design/expeditions-v2.md)                        |
| 4   | Daily dungeon                  | done (#10, #11) | Solo, server-simulated, played back as if live.                                                                                                                                                                                | [`design/daily-dungeon.md`](design/daily-dungeon.md)                          |
| 4b  | UX pass 1                      | in review (#11) | Misa's screen-by-screen review before he advertises the new features.                                                                                                                                                          | [`design/ux-pass-1.md`](design/ux-pass-1.md)                                  |
| 5   | **Analytics reports**          | **next**        | The event log has collected data since #9. Still to build: the daily rollups, the ops endpoint, the report workflow, `pnpm analyze`, and Misa's `OPS_TOKEN` checklist. Covers the dungeon, expeditions v2 and gear events too. | [`design/analytics.md`](design/analytics.md)                                  |
| 6   | Polish backlog                 | open            | "Let's tackle all of this eventually."                                                                                                                                                                                         | [below](#polish-backlog)                                                      |
| 7   | Routine upkeep                 | open            | "Let's do this."                                                                                                                                                                                                               | [below](#upkeep)                                                              |
| 8   | WebSocket push for live fights | open            | "Seems interesting."                                                                                                                                                                                                           | [`design/m5-finale.md`](design/m5-finale.md) (M5.1), [below](#websocket-push) |
| 9   | More content                   | open            | "Eventually yes." Ground it in `docs/compendium/` (see `threads.md`).                                                                                                                                                          | [below](#more-content)                                                        |
| 10  | Swap requests                  | open            | "Good idea but not a priority."                                                                                                                                                                                                | [below](#swap-requests)                                                       |

**Batching:** Misa prefers few, large PRs. Each item above is one PR, and small polish rides along with whatever touches the same screens.

**Production is not precious (Misa, 2026-10-13).** Players know the game is in development and that Misa may wipe progress at any time. Ship features when they are ready. Migrations stay forward-only and tested, and a wipe is Misa's call, never an agent's.

## Open design questions

- **Payoff:** should the bonus depend on the creature's stats instead of a flat +10%? Misa left this open, and the text now says "hits even harder".
- **Dungeon:** leaderboards or bragging posts? Should depth 1 be gentler? Its first-week clear rate is 81% against an 80% target (Misa: not alarming).
- **Gear:** a second slot later? Crafted items never beat drops today.
- **Rank-up gifts:** Bait jumps from 6 at rank 6 to 50 at rank 7. Smooth the curve in a later balance pass.

## Polish backlog

Small items noticed during M6. Each is a one-line fix or a short task.

1. **Round number in the stage header lags the intro.** The header still shows "Round 3" while the intro shows "Round 4". Update the header when the intro starts.
2. **Ability badges overlap the sprites slightly.** Nudge them to the corner and shrink them a little at small scales.
3. ~~**Expeditions screen visual pass:**~~ Done in #10 and #11 (banner cards, walking explorer, reveal).
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
