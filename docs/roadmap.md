# Roadmap

Status: **agreed with Misa 2026-10-13**, updated 2026-10-18 after #35. This is the forward-looking plan after M6 (PR #8, live in production). Each bigger item has its own design doc; this page gives the order, the intent and the links. Agents: read `CLAUDE.md`, then this page, then `docs/progress.md`.

## Where we are

Updated 2026-10-18, after PR #35. Production runs `f034142`.

| What                                                                                                                                 | Where       | State         |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------- |
| How to play and clickable tags, analytics event log, gear and crafting v1                                                            | PR #9       | in production |
| Daily dungeon (single row), expeditions v2, 13:37 daily reset, tab order, Jersey 10 font                                             | PR #10      | in production |
| UX pass 1, rank-up gifts, design compendium                                                                                          | PR #11      | in production |
| Analytics reports, the balance loop, staging-only dev tools                                                                          | PR #12      | in production |
| Cleanup pass 1, component workbench                                                                                                  | PR #14, #15 | in production |
| Living room                                                                                                                          | PR #17, #23 | in production |
| Left-to-right dungeon, raid UX pass 2 and the Raid Roster, dungeon pre-run card                                                      | PR #18–#22  | in production |
| Raid retune: attack patterns, Guards, floors and enrage, raid curve, Bait allowance, raid rewards, journey simulator                 | PR #24      | in production |
| Staging deploys on demand; tab pips; supplies from dungeon and Workshop; systems review                                              | PR #25–#27  | in production |
| Player feedback with `/feedback`                                                                                                     | PR #28, #30 | in production |
| Gear and creature revamp part 1: Gear A/B, talents and Talent Book, training by activity, Boons and Omens                            | PR #31      | in production |
| Daily dungeon paths: map, camp, pack, keepsakes, mystery rooms, the Undercroft                                                       | PR #32      | in production |
| Raid fights match the board exactly                                                                                                  | PR #33      | in production |
| Lounge message                                                                                                                       | PR #34      | in production |
| Gear and creature revamp part 2: two forms per evolving line, last three weathers, gear sets and special lines, flipping and compare | PR #35      | in production |
| Raid posts as Discord embeds                                                                                                         | PR #36      | open          |

The simulator has 96 balance targets. On seed `leet`, about 28 fail. These failures are known, and Misa has said no balancing for now. The latest full run is [`balance/report-2026-10-18-revive.md`](balance/report-2026-10-18-revive.md) (68 pass, 28 fail); the history is in [`balance/log.md`](balance/log.md). The expedition-slot targets (`exp-slot-3`, `exp-slot-4`, `exp-slot-5`) sit well outside their ranges and look like a drifted target, so check them first in the next balance pass. The first ranked week started 2026-10-12, and the first Festival is due five weeks later.

## Priorities (in order)

| #   | Item                                                    | State                                    | Intent and notes                                                                                                                                                                                                                                                                                                                                                                                                                                    | Design doc                                                                                                 |
| --- | ------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | How to play and clickable tags                          | done (#9)                                | "All the roles, elements, etc. are not intuitive at all."                                                                                                                                                                                                                                                                                                                                                                                           | [`design/how-to-play.md`](design/how-to-play.md)                                                           |
| 2   | Gear and crafting                                       | v1 (#9); Gear A/B (#31), sets (#35)      | Dismantle, upgrade, improve, craft from blueprints, enchant; slow creature downtime jobs and a Crafting skill. **Festival gear stays a Festival-finale-only prize; it is never craftable** (Misa, 2026-10-13).                                                                                                                                                                                                                                      | [`design/gear.md`](design/gear.md)                                                                         |
| 3   | Expeditions v2                                          | done (#10, #11)                          | Creature explorer ranks, familiarity, banner cards, supplies, push-on choices, Journal, rank-up gifts.                                                                                                                                                                                                                                                                                                                                              | [`design/expeditions-v2.md`](design/expeditions-v2.md)                                                     |
| 4   | Daily dungeon                                           | done (#10, #11), paths in #32            | Solo, server-simulated, played back as if live.                                                                                                                                                                                                                                                                                                                                                                                                     | [`design/daily-dungeon.md`](design/daily-dungeon.md)                                                       |
| 4b  | UX pass 1                                               | done (#11)                               | Misa's screen-by-screen review before he advertises the new features.                                                                                                                                                                                                                                                                                                                                                                               | [`design/ux-pass-1.md`](design/ux-pass-1.md)                                                               |
| 5   | **Analytics reports and the balance loop**              | done (PR #12)                            | Misa: "understand where players are spending their resources" and "extrapolate it in a simulation branch". Covers the rollups (resource flow per currency and part), the ops endpoint, the report workflow (`OPS_TOKEN` checklist for Misa), `pnpm analyze` with anomaly flags, and the live-calibrated sim (`pnpm sim:live`). Also the balance loop: a findings log, a generated scalars registry and a patch notes generator (script plus skill). | [`design/analytics.md`](design/analytics.md) (phase 2), [`design/balance-loop.md`](design/balance-loop.md) |
| 5b  | **Dev tools**                                           | done (PR #12)                            | A staging-only debug panel in every view, a dev clock and per-view state tools ("set the game into a desired state for testing"). Strictly gated by a `DEV_TOOLS` var that is never on in production.                                                                                                                                                                                                                                               | [`design/dev-tools.md`](design/dev-tools.md)                                                               |
| 6   | **Cleanup pass 1** (with the polish backlog and upkeep) | built (PR #14) except slice 3 and upkeep | Misa: unify UX components, reduce duplicate code, unify repeating patterns. Includes the polish backlog below.                                                                                                                                                                                                                                                                                                                                      | [`design/cleanup-1.md`](design/cleanup-1.md), [below](#polish-backlog)                                     |
| 7   | Routine upkeep                                          | folded into 6                            | "Let's do this."                                                                                                                                                                                                                                                                                                                                                                                                                                    | [below](#upkeep)                                                                                           |
| 6b  | **Raid UX pass 2**                                      | done (PR #21, #22)                       | Misa, 2026-10-14: the raid board wraps on mobile so adjacency is unreadable; remove "Who's in this week"; reuse the dungeon screen patterns; discuss sit-out.                                                                                                                                                                                                                                                                                       | [`design/raid-ux-2.md`](design/raid-ux-2.md)                                                               |
| 6c  | **Attack patterns and element supports**                | done (#24); support reach shapes open    | Misa: varied boss attacks so placement and Guard/Support matter; harder hits are a direction to lean into.                                                                                                                                                                                                                                                                                                                                          | [`design/attack-patterns.md`](design/attack-patterns.md)                                                   |
| 8   | WebSocket push for live fights                          | open                                     | "Seems interesting."                                                                                                                                                                                                                                                                                                                                                                                                                                | [`design/m5-finale.md`](design/m5-finale.md) (M5.1), [below](#websocket-push)                              |
| 9   | More content                                            | open                                     | "Eventually yes." Ground it in `docs/compendium/` (see `threads.md`).                                                                                                                                                                                                                                                                                                                                                                               | [below](#more-content)                                                                                     |
| 10  | Swap requests                                           | open, wanted (2026-10-26)                | "Good idea but not a priority." Misa, 2026-10-26: "a system would help" (combat v2 R19).                                                                                                                                                                                                                                                                                                                                                            | [below](#swap-requests)                                                                                    |
| 11  | **Dungeon paths and camps**                             | done (#32)                               | Misa, 2026-10-15: choose the next room, camps, "push on or come home"; Slay the Spire as the model.                                                                                                                                                                                                                                                                                                                                                 | [`design/player-agency.md`](design/player-agency.md)                                                       |
| 12  | **Gear with gameplay modifiers**                        | done (#31, #35)                          | Misa: rolled modifiers that trigger at defined moments, limited by gear type and source so players can chase them; sets; role or element effects.                                                                                                                                                                                                                                                                                                   | [`design/player-agency.md`](design/player-agency.md)                                                       |
| 13  | **Stagger: interrupt a charge**                         | idea                                     | Misa: makes the live finale carry its weight; needs clear telegraphs so the timing can be hit.                                                                                                                                                                                                                                                                                                                                                      | [`design/player-agency.md`](design/player-agency.md)                                                       |
| 14  | **Creature progression revamp**                         | done (#31 talents, #35 second forms)     | Misa: choices as a creature grows, so two creatures are rarely alike; a cheap respec.                                                                                                                                                                                                                                                                                                                                                               | [`design/player-agency.md`](design/player-agency.md)                                                       |
| 15  | **Player journey simulator, Bait allowance**            | built (#24); slice 5 part, 6 open        | Misa, 2026-10-15: per-player progress by play style, waits and what causes them; models the planned 30 + 15–25 Bait income.                                                                                                                                                                                                                                                                                                                         | [`design/player-journey-sim.md`](design/player-journey-sim.md)                                             |

**Order after the overnight review (Misa, 2026-10-19).** His answers to the review page (`https://claude.ai/artifact/UArBxYixFXiy17xAVJnT3F`, database collection `decisions`) set this order:

1. **UI and code health first** (being built): the Lantern Cap made obtainable, Lantern Light also lengthening basic abilities, the mystery-room line clearing on the next move, the type scale everywhere, the pixel font on the dungeon cards, "‹ Back" at the top of the camp steps, one look for experience gains, the rooms recap stamp, the shared dungeon row, the splits of the biggest files (Stage and Game, `fight.ts`, the four largest server files, the leet sync), one server test kit, the legacy sim digest retired, and the simulator choosing second forms.
2. **Part 2 follow-ups** next (Capes, Warm burrow, Lane anchor, Maker's Mark, talents for the new forms' roles), so they ship with the balance pass: "add these first and THEN do the balance pass. The idea is to ship them all in one go."
3. **The balance pass** after that: "it's needed for sure".
4. **Later:** WebSocket push ("the week is only starting and we have plenty of time"), new content ("low priority right now since we're improving core systems"), Preact 11, and Stagger, with Misa's note on the live finale: "Last raid finale received feedback that it was over very quick. I think we could make it run at half the current speed and clearly indicate boss abilities that are charging up, as sort of progress bars beside the boss itself. Right now these are telegraphed as mainly text under the boss, which is hard to read in the middle of a fight."
5. **Raid summary redesign** (Misa, 2026-10-19, from a staging test): the after-action report "holds a lot of data" but is "lists and lists of bullet points that are incredibly cursed in their alignment". Wanted: a thought-out version, "a scoreboard or stuff like that, maybe a few highlights". Design round with screenshots first, like the XP bar and the creature card.
6. **Not changing:** an item may roll a line equal to its base (implicit) line; only two rolled lines may never be the same (Misa: "If an item has a static inherent bonus that matches what a modifier can roll, that should be allowed").

**Batching:** Misa prefers few, large PRs. Each item above is one PR, and small polish rides along with whatever touches the same screens.

**Production is not precious (Misa, 2026-10-13).** Players know the game is in development and that Misa may wipe progress at any time. Ship features when they are ready. Migrations stay forward-only and tested, and a wipe is Misa's call, never an agent's.

## Combat v2 (Misa, 2026-10-26)

A rework of combat so players bring creatures for what their species can do, not their level: Knacks, primer and detonator marks, boss turns between rows, slot targeting, armour, raid attrition. Being designed and simulated in `docs/design/combat/` and `packages/lab`; the phases from the lab to the game are in `docs/design/combat/roadmap.md`.

Later, for the endgame (Misa, 2026-10-29): an opt-in harder version of the week's boss (an extra rule card, a better chest), for servers with crafted gear and max-level creatures.

## Open design questions

- **Payoff:** should the bonus depend on the creature's stats instead of a flat +10%? Misa left this open, and the text now says "hits even harder". Still flat: every reaction in `reactions.json` has `payoffBonusBp: 11000`.
- **Dungeon:** leaderboards or bragging posts? None yet; every run is kept, so either can be added. Should depth 1 be gentler? Its first-week clear rate was 81% against an 80% target (Misa: not alarming). Overtaken by dungeon paths (#32); re-ask with the new numbers or drop.
- ~~**Gear:** a second slot later? Crafted items never beat drops today.~~ Answered by Gear A/B (#31): Hat, Scarf and Charm, with item levels and Reach crafts.
- **Rank-up gifts:** Bait jumps from 6 at rank 6 to 50 at rank 7. Smooth the curve in a later balance pass. Still open: `RULES.expeditions.rank.gifts` (`packages/game/src/rules/config.ts`) has the same jump.

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
6. ~~**Replay pacing drifts about 200 ms per round** behind the live timeline, because of per-beat timers. Drive replays from the same `liveTimeline` schedule.~~ Closed: replays are a step player (`use-playback.ts`) with their own speed controls, by design.
7. ~~**Backdraft is announced twice per round by the engine.** The client de-duplicates it; fix it at the source in `packages/engine`.~~ Fixed in the overnight cleanup (2026-10-18/19).
8. **Sprites:**
   - Misa finds Ashmole "kinda weird" but fine.
   - The bosses are still in the detailed style; decide whether to give them a chibi pass.
   - Stormray and Tempestray read slightly off-style.
9. **Effect description in the ability popover.** It was removed to keep the popover small; consider one muted line.
10. ~~**Contract fixtures were partly script-edited** (PR #8). Left: a `pnpm fixtures:capture` script.~~ Done (2026-10-18/19): `pnpm fixtures:capture` re-captures the five scenario sets (branches, creatures, dungeon, expeditions, gear) with stable ids; see `design/testing.md`. The raid fixtures (`live-*`, `action-*`, `practice-*`, `raid-*`, `errors.json`, `request-bodies.json`) have no scenario yet: a `raid-scenario.ts` in `apps/worker/test/fixture-sets.ts` would cover them (phase 2).
11. **Others' abilities summary** under the stage could become small icons on other players' creatures. Today it is a collapsed list.

## Next UI passes (Misa, 2026-10-21)

Noted while testing the expedition and Workshop rework on staging. The components exist; these are layout passes.

1. ~~**Expedition screen overhaul**~~ **Done (2026-10-21):** the Trips view is a world map (see decisions.md).
   - App-wide wide frame (top bar with tabs and currencies) for desktop: later, Expeditions first.
2. ~~**Refine and Recycle flow.**~~ **Done (2026-10-21):** Craft, Refine and Recycle are one job wizard in a drawer (see decisions.md). Before: today, tapping Refine opens the recipe preview between the supply card and the creature picker, and the picker repeats a "Refine ?" header with an empty "Cost" heading. Every creature is listed, most with "Needs Crafting level 3". Ideas:
   - Show the recipe once, inside the picker's header (in, arrow, out, time).
   - Drop the empty Cost heading.
   - List only the creatures that can do the job, with a short line such as "4 more need Crafting level 3".
   - Keep the time per creature.
3. ~~**Creature pages show Crafting level and explorer rank.**~~ **Done (2026-10-22):** two bars under Experience on the creature page (Explorer "Rank", Crafting "Craft"; "Max" at the top), the same working as the trip claim bars. Before: show both with progress bars, reusing the bars from the trip claim screen. Place them next to the creature's Experience, so a player can tell who to send exploring and who to put in the Workshop.
4. **Smaller follow-ups from the same round:**
   - The send screen's supply card shows the effect on the chosen trip length, not just the blurb.
   - Stock badges on muted supply cells are hard to read.
   - The basic supply blurbs ("More creatures") read bare on their own.
5. **Gear crafting for non-min-maxers** (balance log B-026). Engaged and regular players' gear share stays at 10–24% late in the game, under the intent that gear grows late. A crafting pass should make crafting into gear easier for them to reach, rather than loosening the targets.

## After the Valley Games (Misa, 2026-10-23)

- **Main menu redesign.** With Games as the sixth tab the tab bar barely fits on a phone (360 px has no spare width). Rethink the main navigation. **Chosen (Misa, 2026-10-24): option 1, a bottom dock on phones and a left rail on desktop** and built 2026-10-24 (a dock, later three group buttons with upward sub-menus, a left rail, a HUD; `design/decisions.md`). He liked the valley-as-menu map too: "explore it later".
- **A home in the world (very long term).** A player asked "where is home on the expedition map". Misa: players might like a home or village in the game world, and "ultimately ... houses and decorations, furniture, etc. to find, craft and place". The dock's place list stays data-driven so a map home can be added later.
- ~~**Valley Games polish and fixes**~~ **Done (2026-10-24):** alignment, spacing, the Good fit tick, a calm leaderboard, crowded big fields (see `design/valley-games.md`, "After v1"). The postponed ideas stay postponed (Misa, 2026-10-23).

## UI audit findings (2026-10-24)

The first full run of `apps/activity/scripts/ui-audit.mjs` (see `design/workbench.md`, "UI audit") found pre-existing overflow outside the Games, not yet fixed (the Games pages are clean):

- The item tile's level badge (`.item-lv`) is cut 1 to 3 px by its button (Slot, gear slots, item tiles, item pickers).
- Supply counts (`.supply-count`) stick out of their cells (SupplyGrid, SupplyCrafting).
- Compact raid party slots: the owner line (`.slot-owner`) sticks out of the slot.
- The fight stage's strike row (`.stage-strikes`) is cut vertically.
- A blocked item tile's wearer sprite (`.item-tile-wearer`) on the creature page.
- At 320 px: the party strip (RaidBoard, DungeonSetup), the finder chips and the living room stand out of the card.
- Unconfirmed: the creature page rows look cut inside the workbench's fixed-height phone frame; possibly a workbench artefact.
- About 70 pages could not be audited (components that render nothing by default) and need presets with content.

## After the treat box PR (Misa, 2026-10-21)

Shipped together in one PR (details in `docs/design/decisions.md`, 2026-10-21):

1. "Equip on" shows the item each creature already wears in the slot, with the shared Away / On a job tags.
2. A found item opens its full `ItemCard` on tap, or on hover with a mouse, with an Equip button when the item is owned.
3. Dungeon experience per room a creature stood in (more for elites, epics, keepers and the floor boss, a little for a cache, an `xp` mystery room effect), with a recap per creature on the end screen (B-028).
4. Blue Chasm, a rare mystery room (15% of mystery rooms from depth 3, once per run): 50% take the treasure shown (its item card can be inspected first), 50% the team falls and the run ends as a defeat.

Still open:

- **The shared creature list** (`ui/CreatureList` for every creature pick, Misa's "what a creature list shows" rule): built on its own branch, its own PR once the one above merges.
- **More risk-and-reward mystery rooms** (Misa: from rooms with decent rolls for any pick to drastic ones like the chasm; bigger risks may pay bigger rewards). Claude to propose ideas.
- Deferred, very low priority: a Blue Chasm prize of a **creature of a species the player lacks**. Misa: "a fun idea where you rescue a friend in need".

## Home page: later

The Home page and its Today board shipped on 2026-10-24 (decisions.md). Ideas for after it:

- **Signs in the room:** small signs in the living room that point at what needs the player (a letter on the table for a trip that is home).
- **Out and about:** show creatures that are away (on a trip, a job) as little figures or notes around the board or the room.
- **A valley news feed:** a short feed of what happened in the valley (catches, firsts, raid results) under "The valley today".
- **Who's here:** who has the Activity open, beside the room.
- **Tapping "Coming up" rows:** each row opens its place.
- **A dungeon status that says "done today"** (the quiet notice only says "No run waiting" now, because the client cannot tell done from not possible).
- **Per-player settings for the board's tilt (none, still, sway) and for showing quiet places (hide, show):** the typed `BoardSettings` is ready, stored and saved per player.

## Upkeep

- **Vitest 5 and `@cloudflare/vitest-plugin` together.** One PR: vitest 5.0.3, `@cloudflare/vitest-plugin` 1.4.0 (its peer range allows vitest 5), wrangler 4.149.0 (what the plugin pins), vite 8.3.4, typescript-eslint 8.71.1, prettier 3.9.10. Regenerate `worker-configuration.d.ts`, run the full gate, then close Dependabot #2 and #13. TypeScript 7 waits for typescript-eslint support (it allows `<6.1.0`); Preact 11 gets its own PR with a workbench check.
- **CI speed:** the sim's `run.test.ts` and `cli.test.ts` take about 5 of the 8 test minutes; share their runs.
- **Dependency review.**
  - Run `pnpm outdated` across the workspace.
  - Take only releases older than 7 days, with exact versions.
  - Check the Dependabot and secret-scanning alerts.
  - Refresh the pinned action SHAs in `.github/workflows/*` to current releases, each with a version comment (zizmor and actionlint already run in CI).
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
- **Support species per element (Misa, 2026-10-14):** Grove has no Support and Tide's only one (Lanternfin) is Festival-only. Add a common Grove Support line first (it carries Mend, the heal), then a common Tide one. _(Grove now has one: Sunfawn, a branch of Sproutle, 2026-10-18; Tide has one too: Drizzlewt, a branch of Mistnewt, the same day.)_ New species may be harder to find, for example only in later expedition areas. Misa plans new elements later too, so keep the element list data-driven.
- **Support reach shapes** (after attack patterns): left N, right N, both sides N or the whole row, growing with level or fusion. See `design/attack-patterns.md`, section 7.
- **More Festival creatures,** rotating by season.
- **Seasonal mutators** (the engine has mutator hooks) for Festival weeks.

## Swap requests

A player can ask another for a raid slot swap. The other player accepts or declines in the Raid tab, and the server swaps the two placements in one transaction. Requests expire at the next phase lock. Misa, 2026-10-26: wanted now ("we do it manually now; a system would help"); it is rule R19 of the combat v2 proposal, and pairings across players depend on it.
