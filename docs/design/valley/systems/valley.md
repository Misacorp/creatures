# The valley: the world as the game's menu

Status: **prototype** (`apps/activity/src/proto/valley/`, staging `prototype.html#valley`). Misa picked it on 2026-10-29: "a working foundation... it needs refinement, polish, art, and a lot of things".

## What it is

**One valley for the whole server** (Misa, round 1, Q1): everyone's creatures live and work in the same places, the places belong to the server, and each player's house is their own space. The valley shows the player's own creatures first and a few friends' at a time, so a 15-player server does not crowd it.

One pixel-art valley, panned on a phone and seen whole on a desktop. Places are buildings and spots in it; tapping one zooms into a full-screen scene where its activity happens. Your creatures live in the valley and are always at hand in the creature tray. What needs you is a bubble over the place it is about. There is no dock, rail or page menu; a small "Places" flag is the escape hatch.

## Rules (draft)

- **V-VAL-1** Places sit where they stand; the way there is the way back. Every scene has "◀ Valley" in the same top-left corner, and Escape.
- **V-VAL-2** Every building has a name plate. On a phone, places out of view have a named edge tab, with ! when they want you.
- **V-VAL-3** The creature tray is the one persistent element: each creature with its state drawn on it (one glyph per state, "Lv N"); tap a creature and the places it can go light up, the others say why in one word.
- **V-VAL-4** A scene fills the screen and the action happens in it; its one main button is pinned and always visible on a phone. No "art strip above, panel below".
- **V-VAL-5** One pixel scale per scene.

## Places today (prototype) and their posts (proposed)

| Place            | Today's feature inside                                                                                        | Posts it could hold (see `posts.md`)          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| House            | living room lounge, evolve, Journal and trophy shelves                                                        | the lounge (rest)                             |
| Paddock          | the creature list, new arrivals                                                                               | keepers                                       |
| Bonfire (new)    |                                                                                                               | idle creatures gather here (see `bonfire.md`) |
| Forge            | Workshop jobs, the bag chest, blueprints, supplies                                                            | smiths                                        |
| Signpost         | expeditions, the haul, push on                                                                                | scouts per destination                        |
| Cave             | the dungeon: dungeon passes stack to 3, and a pass can run any of the last 3 days' maps (round 3, Q7)         |                                               |
| Fairground       | the Valley Games as a weekly fair every Wednesday, about 5 events, the Prize Stall the same day (round 3, Q8) |                                               |
| Watchtower (new) | the raid: muster and set out; the week's threat and rule cards from Monday (no post)                          |                                               |
| School (new)     |                                                                                                               | teacher, students                             |

## Known work (from the prototype panel, 2026-10-29)

- Desktop scenes are drawn too small with scattered props; scale them up or compose them for the window.
- Art: real building sprites, a cave hill, the Watchtower, the bonfire, the School; one consistent world scale.
- Animation: walking creatures, the stepped zoom, the haul's sack, the evolve flash (built), ambient life.
- Phone: some edge tabs overlap buildings; the valley could be compressed vertically.
- Every place of today's game must be reachable before the valley replaces the page navigation (phase 4).
