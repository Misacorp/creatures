# The Cave as a canvas place

Misa agreed concept C on 2026-11-20 (decision `dungeon.md`, "The Cave as a place"): today's map is the scene. Code: `apps/activity/src/cave-canvas/` (a `valley/PlaceCanvas`, as the raid's `raid-canvas/` is). Workbench page: `CaveCanvas`.

## When it shows

Only with the valley on AND the day's dungeon playing by combat v2 (`today.rules === 2`), and, when a run is open, only if that run started on v2 (`cave-canvas/flag.ts`, `caveCanvasOn`). Both switches are staging-only, so production keeps the old page (`Dungeon.tsx`'s page branch, untouched). When the canvas shows, `Dungeon` tells `Game` (`onCanvasChange`) and `Game` adds `cave` to `ValleyFrame`'s `sceneless`: the valley draws no scene of its own above it, as for the raid's `arena`.

**No flash on the first load.** `Game` does not wait for `onCanvasChange`: until the Dungeon has reported, it decides from what start-up knows, so with the valley and combat v2 (`/api/config`'s `combatV2`, `live-flags`) both on the Cave starts sceneless and the valley's own scene never draws above "Loading". While today loads the place shows `CaveLoading` (the cave rock and a "Loading the cave..." now line). In the rare case of a v1 day or open run `Dungeon` reports `false` and the old page with the valley scene shows. The report resets when the tab leaves the Cave.

## The scene

The scene is `CaveScene`: the day's map (`DungeonMap` with its `canvas` option), every room a 44 px button with a name plate under it (`roomPlate`: the foe's name, Elite, Mystery, Camp, Cache, Door, Epic, Floor boss, Keeper). The run so far is lit (the map's own statuses), the team stands on the room it is in with one gold "Your team" plate. Frame: `SceneTop` (plates for the left drawer, the now line as a caption), shared with the raid scene.

- **Rock:** one class, `cave-rock`, the art's floor tile under everything, wall layers at the top and both sides, and the Undercroft's own darker, bluer band (`undercroft-*` sprites) from its seam down. Art: the library set `valley-cave-canvas` (`cave-art.ts`; the mouth is the art session's pick, variant C). The CSS gradient under it is the fallback.
- **Cave mouth:** before a run the team stands on the mouth's ground strip, the "Enter" plate under it. In a run that has not gone in yet the team stands there too (no Enter).
- **Props:** the campfire beside the Camp room; the cracked stair beside the way down.
- **Fight:** a room's fight takes the scene's place (`CavePlayback`: `StageV2` in `canvas` and `single` mode, foe on top, your row below, the room banner, the page's rests), then the map comes back. No page, no scrolling.
- **Undercroft / tall map:** the map keeps a readable size; when it is taller than the box, the box is dragged up and down (mouse drag by `useDragScroll`, a finger scrolls it natively, `PanHint axis="y"` is the same cue as the raid board's), opening on the team (`map-size.ts`, `startOffset`). A map that fits is not dragged. No scrolling inside the map otherwise.
- **Reduced motion** is respected (no smooth scroll to the team); no focus rings in the art (`art-focus.css`), the gold arrow instead; every room and creature is a real button.

## The team at the mouth: the standers

**Drops before a run.** Dropped on a place that is taken, a creature from the tray swaps in: the one that stood there goes back to the tray (owned, unplaced). A drag between two places moves or swaps. On the cave mouth with a full team a drop is still refused, with a hint ("The team is full. Drop one on the tray first."). The team reaches the server only through the debounced draft (`PUT /api/dungeon/team`).

The creatures at the cave mouth (and on the map) are buttons of the valley's stander look: the same class, `vy-stand-btn` (no box, no ring, the gold focus arrow of `art-focus.css`), so tap and keyboard behave as for the Bonfire's and the Paddock's creatures. They do not use `valley/PlaceScene`'s `Stander` itself, because that places a creature at scene coordinates (`SceneGeometry`), opens a creature popover and is moved by the Paddock's free-roam `Hand`; the mouth needs three ordered places that are drop targets, a tap that opens the configurator drawer, and the tray's drag (`useDragDrop`), as the raid's seats do.

## Now line

| Where                      | Text                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Before a run               | "Pick your team · Enter the cave", then "Your team is ready · Enter the cave" (a tap opens Enter) |
| Blocked                    | "Not today" (a tap opens the reason)                                                              |
| On the map                 | "Room 2 / 7: choose the next room"; in the Undercroft "Undercroft 1 · Room 3 / 4: ..."            |
| Mystery room               | "<room name>: pick one"                                                                           |
| Camp                       | "Camp: rest, keepsake or swap"                                                                    |
| The way down               | "The way down: descend or go home"                                                                |
| A fight (or a watched run) | "Room 3 / 7: Drift Wisp"                                                                          |
| After                      | "The run is over" (a tap opens the result)                                                        |

## Drawers and actions

Left drawer (plates on the scene frame): **Pack** (the real `DungeonRunStrip`: team HP, pack, keepsakes), **Route** (the rooms so far as a list), **Log** (only during a fight). Right drawer (the one thing tapped), in `panels.tsx`:

| Action                           | Before                                               | Now                                                                                                                               |
| -------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tap a room                       | Page: a bottom sheet (`DungeonNodeDrawer`)           | Right drawer with the same sheet (`nodeSheet`); Go pinned, none in the preview                                                    |
| Tap the cave mouth / "Enter"     | Page: the pre-run card (depth, treats, Enter button) | Right drawer: depth picker, treats (not with valley systems on: the server refuses them, `treats_off`), Enter pinned              |
| Tap a creature                   | Page: configurator under the board                   | Right drawer: the configurator (before a run: with Add to / Remove from team); in a run: its tile and the locked configurator     |
| Pick the team                    | Page: a board with a picker                          | Tray under the scene (one row, scrolling sideways); drag onto the mouth to add, onto the tray to remove; or tap, then Add to team |
| Mystery room, Camp, the way down | Cards above the map                                  | Right drawer, opened by itself; the now line reopens it                                                                           |
| The result                       | Results page with its own route map                  | Right drawer without the map (the scene shows the route); Watch again, Next run                                                   |
| Blocked, first-day retry         | Cards on the pre-run page                            | Right drawer, opened by itself                                                                                                    |
| A fight                          | Own page, scrolled to                                | The scene                                                                                                                         |

What left the main view: the run strip (it is the Pack drawer), the page's map-beside-cards layout, the fight page and its scrolling (`fightScroll` is not used on the canvas), the results page's own route map.

## The hold rule

The server answers a move at once with the room's stored fight and the run after it. On the canvas nothing of that answer shows until the fight has played: the scene, the HP shown on the map, the Pack, the Route, the now line, the valley's Cave line and the Home pips all stay as they were before the room (`hold.ts`). `Dungeon` keeps the run before the room in the `fight` view (`before`) and keeps the answer's `today` (or the reload that a finished run needs) in a ref, applied when the playback ends (`fightDone`). Balances already waited (`refreshOwed`). The raid canvas's `hold.ts` is the model; there the end is a clock (`endsAt`), here it is the playback's own end. Leaving the Cave mid-fight hands the held answer to the game at unmount (the pip, the Cave line, the balances), and a day reset that comes while an answer is held waits for the release before it reloads today.

## Reaction partners on a touch (Misa, 2026-11-26)

Touch a creature (the pointer over it, the keyboard on it, or its drawer open) and the creatures that can react with it are lit: on the cave mouth, on the map and in the tray. Same helper, look and rules as the raid (`raid-screen.md`, section 7): `reaction-partners.ts`, one look: dim the rest. The Cave has no tiles (figures at the mouth and on the map, a one-row tray), so there the partners only keep full strength and the rest dim; the reaction ring (`cue-react`, v1's, no name bar) is for board tiles, as on the raid. The Cave's creatures are all your own, so every kit (saved Knack, slotted talents, worn gear) comes from the state's `creatures`, the team (by id, also during a run: `DungeonRunCreature` carries no Knack or talents) and the tray alike. Nothing is lit during a fight. A tap on a phone opens the drawer at once (no popover here), so there the partners show only behind it.
