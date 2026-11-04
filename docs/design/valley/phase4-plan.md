# Phase 4 plan: the valley frame in the game

Status: **current** (phase 3 passed 2026-11-04, Q55). The resource library (step 0) is done; step 1 is under way. The valley ships all at once (phase 6, with combat v2), so phase 4 builds nothing that phase 5 throws away (Misa, Q57: "no pointless intermediate steps").

## The gate

From `roadmap.md`: **the whole game is playable through the valley on staging; nothing is lost from today's game.** No new economy yet: today's systems (Bait, Essence, trips, Workshop jobs, the dungeon, the raid, the Games, the lounge) work exactly as now, reached through places instead of tabs. The new systems (posts, the bonfire's catch-up, the School, the commons, the visitor, the Market) are phase 5.

## How it switches on

- A server flag, `VALLEY=on`, reported in `/api/config` as `valley` (like `combatV2`). Staging only; production never sets it until phase 6.
- With the flag on, `Game.tsx` renders the valley shell instead of `MainNav` and the tab pages. With it off, nothing changes. Both shells share every page component, so a page fixed in one is fixed in both.
- No new endpoints, no new tables: the shell reads what today's screens read (`/api/state`, `/api/me`, the pages' own calls). The places' bubbles come from today's alerts (`tab-alerts.ts`, `use-tab-pips.ts`). The read budget (`docs/design/database-reads.md`) is unchanged by construction; the day-in-the-life check proves it.

## Where each of today's screens lives

Today's navigation is a `tab` state in `Game.tsx` with two groups (Collection: Creatures, Workshop, Journal, Stats; Adventure: Expeditions, Dungeon, Raid, Games) plus Home and the Settings overlay (inventory of 2026-11-03). In the valley:

| Today                                                                                                      | In the valley             | Notes                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home: the Today board ("Needs you", "Coming up", "The valley today", quiet places)                         | The valley itself         | "Needs you" becomes the places' bubbles; "Coming up" becomes each place's state line in the Places list ("back in 2 hours"); the sky and Games lineup show on the map and at the Fairground. |
| Home: "While you were away" paper                                                                          | The welcome-back Gazette  | Built from today's away counts and events (`home/away-notice.ts`); dismissing it calls today's `POST /api/away/dismiss`.                                                                     |
| Home: living room (presence, lounger XP, lounge spot, swap, weather calendar, trophy shelf)                | The House                 | The house's scene is today's living room; in phase 5 the lounge's XP moves to the bonfire.                                                                                                   |
| Creatures list, filters, creature page (ribbon, evolve, gear, talents, Knacks v2, Games row, rename, note) | The Paddock, and the tray | The tray is the roster everywhere; tapping a creature opens its popover, then its page. The Paddock's main action opens the full list with today's filters.                                  |
| Waiting catches (duplicates)                                                                               | The Paddock's gate        | A newcomer waits at the gate as a bubble; today's choose flow opens from there.                                                                                                              |
| Workshop (jobs, supplies, blueprints, gear bag, dismantle, conversion notice)                              | The Forge                 | Jobs show as workers at the anvils; today's Workshop page opens from the scene's main action.                                                                                                |
| Journal, Stats                                                                                             | The House                 | A shelf and a desk in the house open today's pages.                                                                                                                                          |
| Expeditions (world map, send, push on, claim, trip results)                                                | The Signpost              | Trips out show as creatures on the road; the scene is today's world map, as the prototype already does.                                                                                      |
| Dungeon (setup, run, camp, descend, Undercroft, playback, results)                                         | The Cave                  | Today's dungeon screens unchanged inside the place.                                                                                                                                          |
| Raid (timeline, placement, boss card, abilities, live finale, replays, results, summary, combat v2 parts)  | The Arena                 | Today's raid screens unchanged inside the place; the live finale opens from the Arena's bubble.                                                                                              |
| Valley Games (lineup, entries, show, results, medal table, Prize Stall)                                    | The Fairground            | Unchanged inside the place.                                                                                                                                                                  |
| HUD (place title, Bait and Essence pile, ledger popover, leet warning, cog)                                | The same HUD              | Its names and icons come from the resource library.                                                                                                                                          |
| Settings, How to play, glossary popovers                                                                   | Unchanged                 | The cog and the "?" stay where they are.                                                                                                                                                     |
| Starter pick, notices, wipe notice, level-reset card                                                       | Unchanged                 | Shown over the valley on first open.                                                                                                                                                         |

Every row is one item on the gate's checklist; an end-to-end test (Playwright, staging-shaped data) walks each one through the valley.

## Today's pages inside a place

Each place has a **scene** (its art, the creatures there doing today's work, its waiting stories, one pinned action) and its **inside**: today's page, opened by the pinned action and closed by "◀ Valley". This keeps everything today's players can do, unchanged, while the scenes take over parts of it over time (phase 5 replaces the Workshop's job slots with the Forge's posts, for example). Lead's call; Misa judges it on staging.

## What carries over from the prototype

The prototype (`apps/activity/src/proto/valley/`, `proto/welcome/`, dev only) is the reference, not code to copy as is: its sample world, sample state and dev params stay behind. Ported into the shipped tree, with tests: the map and its art (`valley-art.ts`, the glow sprites, `ValleyMap`, edge chips), `SceneFrame` with one scale per scene and the sky backdrop, the tray, `PinnedAct`, the Places list with state lines, the Gazette's story rendering and the strip of waiting stories. The UX rules of `ux-patterns.md` apply as everywhere; new shared parts get rows there.

## Order

0. **The resource library** (round 5, Q13: "some kind of resource library acting as a source of truth so we can easily change it later. It needs to be pretty generic"): one data file naming every resource, with its kind, name, plural and icon; every screen reads names and icons from it. It changes nothing visible today (Bait stays Bait until the reset renames it Acorns with one data edit). Can start now.
1. **The flag and the shell:** `VALLEY=on`, the map with today's seven places (cave, fairground, house, paddock, forge, arena, signpost) and the four new ones not yet open (Q58: the bonfire, the School, the visitor's stall, the Market; a tap says in a line what each will be), the HUD, the tray, the Places list; each of the seven opens today's page inside it.
2. **Bubbles and state lines** from today's alerts and timers.
3. **The scenes** for the places whose work stays in phase 5 (the lounger at the house, the dungeon team at the cave, the raid party at the arena, the Games' entries at the fairground, the roster in the paddock). Not the Signpost's trips or the Forge's jobs: phase 5 replaces both with posts (Q2), so their scenes wait for posts and the places open today's pages (Q57).
4. **The Gazette** from today's away notice, closing with the currencies flying into the purse (V-RET-4a, Q56).
5. **Desktop and accessibility** (at 1100 px the map still pans sideways, because the valley is 1152 px wide and the card has padding; decide whether a desktop fits or keeps panning), the panel at both widths, the gate's end-to-end checklist, then Misa on staging.

## Decided with Misa (round 25)

- **Q57: A.** A place's inside is today's page; nothing is rebuilt as a scene before phase 5 ("We'll ship this all at once so no pointless intermediate steps").
- **Q58: A.** The four new places are on the map from phase 4, not yet open, so the map has one layout.
