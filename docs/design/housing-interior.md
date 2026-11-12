# The room itself: interior layers (housing C5)

Status: **wired** (2026-11-12) for wallpaper, floors, trim, ceilings and the frame; ways through are still sheets only. First pass, sheets only (2026-11-11). The generators are code, tested and committed (`apps/activity/src/sprites/workshop/interior/`). `pnpm housing interior-sheets [--out dir]` renders eight sheets, each at 1x (`<name>-1x.png`) and enlarged 3x (`<name>.png`; the night strip 4x), plus `8-house-phone.png` (the house at 2 image pixels a pixel, as a 390 px phone at device pixel ratio 2 shows it). Part of [`housing-next.md`](housing-next.md) C5; the drawing tools are the workshop's ([`housing-workshop.md`](housing-workshop.md)).

## The idea

A room today has one wallpaper and one floor; the trim and the ceiling line are baked into the wallpaper tile and the posts and slab are fixed in `shell.ts`. Here each is a layer drawn by a generator from **a kind (pattern) and a colourway**, so there are dozens of looks without dozens of drawings. A room cell is 112 x 64: 52 of wall, an 8 px floor strip, a 4 px slab, with 4 px posts straddling the edges. Layers draw in the scene's order: wallpaper, ceiling, trim, floor, slab, a stair, furniture, creature, small floor pieces, posts, doorways.

Every pattern uses four palette keys (`a` ground, `b` body, `c` detail, `d` line), so any pattern takes any palette. Tile widths divide 112 (8, 14, 16, 28, 56), so a paper tiles across a one or two cell room without a seam (the tile repeats from the room's left edge). The functions have no randomness; scatter comes from a pixel hash.

## Layers, kinds, counts

| Layer          | Kinds                                                                                                                                                            | Colourways                                                                                                    | Looks       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 1 Wallpaper    | 13: plain, thin stripes, wide stripes, damask, panels, tiles, brick, planks, starry, floral, polka, harlequin, two-tone split                                    | 12: cream, rose, sage, sky, lavender, slate, ochre, terracotta, forest, midnight, charcoal, white             | 156         |
| 2 Floor        | 9: long planks, short planks, herringbone, checker, stone flags, cobble, carpet, bordered carpet, tatami                                                         | 8: oak, walnut, ash, whitewash, slate, terracotta, moss, burgundy                                             | 72          |
| 3 Trim         | 4 and none: skirting, classic (skirting, picture rail, cornice), wainscot (panelled lower wall, skirting, cornice), panelled (tall panelling, skirting, cornice) | 8: painted white, sage, blue, rose; dark walnut, ebony; grey stone, sandstone (stone draws as ashlar courses) | 32 and none |
| 4 Frame        | 5 materials: timber, stone, painted, brick, dark iron                                                                                                            | 9: oak and dark timber, grey stone, painted in four colours, red brick, iron                                  | 9           |
| 5 Ways through | doorways 5: open arch, square frame, door ajar, curtain, bead strands; stairs 3: straight, ladder, spiral                                                        | a doorway takes the frame's colour and a cloth colour                                                         | 5 and 3     |
| 6 Ceiling      | 4: plain, beamed, coffered, rafters                                                                                                                              | 4: white and oak, cream and walnut, dark boards, stone and walnut                                             | 16          |

A room alone can look like 156 x 72 x 33 x 16, about 6 million ways (the frame and the ways are house wide), against 9 wallpaper and floor pairs today. The cost is small functions and about 50 palettes, not drawings.

## What the sheets show (art-director notes)

Judged at 1x and enlarged against `review-brief.md` (pixel art, hard edges, limited ramps, readable on a phone, the paper never fights the furniture).

- **Wallpaper.** The body tone `b` is at most 0.20 of luma from the ground and every tone at most 0.36 (a test pins both; the shipped walls go from 0.3 to 0.6 with their baked trim). Reads well at 1x. Weakest: _harlequin_ (its line is the strongest thing on the wall), _tiles_ (a grid; right for a bath), _starry_ on a light colour (it draws dark stars). _Floral_ and _polka_ are very quiet on light grounds.
- **Floors.** The strip is 8 px and the shipped sofa and rug stand over most of it, so the sheet uses a lamp and a plant only. Planks, parquet, checker, flags and carpet read at 1x; _cobble_ is the busiest; _tatami_ reads more as a rug than a floor.
- **Trim.** Skirting and cornice read at once. Wainscot and panelling change a room most for the cost. The stone cornice's dentil dashes are a little busy.
- **Frame.** A post is two pixels between ink and the slab four rows, so the materials read as colour plus one detail (knot, block seam, brick course, rivet). They show best on the whole-house mock. White or rose paint and dark timber change a house most; stone and iron are close at 1x.
- **Ceilings.** Coffered and beamed read well; plain is the shipped look. Rafters (a pitched underside, collar tie, king post) is the strongest look, for the top floor only, and ignores the plaster colour, so its four colourways make three looks.
- **Night** (`7-mix-night`): the Parlour mix through the house's own lighting pass (`house-light.ts`, called read only). Each pixel carries its material, so walls, floors and posts take the right ramps, and the lamp's stepped light works on patterned paper without noise.

## Ways through, and the collision analysis

The riskiest layer: the rooms' spots already use the whole width. In `rooms.json` the window sits at x 2 to 38, a floor-small spot at x 3 to 23, and the right edge holds a wall-small or the Hearth's mantel and a floor-small at x 90 to 110.

**Doorways** (20 wide, 38 tall, bottom on the furniture row) have three placements on the post between two neighbouring rooms of a floor:

- **A, straddle:** centred on the post, 10 px into each room. Reads best (the post becomes a door frame). Touches the left room's right edge and the right room's left edge.
- **B, in one room:** 18 px inside the left room, ending at the post. Touches only that room; the door belongs to the left room.
- **C, notch in the post:** a 2 px gap with a lintel inside the post's own width. No collisions, but it reads as a gap, not a door. Not recommended.

A wall spot in the zone is a real clash (a picture would hang in the doorway). A floor spot is not: the piece stands in front and hides the doorway's foot (the house mock shows a lamp doing it). The table is generated by `collisionTable` (`report.ts`) from the real room data; the zone is measured from the room's edge (A 10 px, B 18 px, stairs 46, 12 and 26 px):

| Room                   | Doorway A straddle, left edge          | A, right edge                              | B (18 px), right edge                      | Straight stair                                                                                              | Ladder                                     | Spiral                                                            |
| ---------------------- | -------------------------------------- | ------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| hearth                 | window-a (wall), floor-small-a (floor) | mantel (wall), floor-small-b (floor)       | mantel (wall), floor-small-b (floor)       | wall-large-a (wall), wall-small-a (wall), mantel (wall), floor-large-a (floor), floor-small-b (floor)       | mantel (wall), floor-small-b (floor)       | mantel (wall), floor-large-a (floor), floor-small-b (floor)       |
| kitchen                | window-a (wall), floor-small-a (floor) | wall-small-a (wall), floor-small-b (floor) | wall-small-a (wall), floor-small-b (floor) | wall-large-a (wall), wall-small-a (wall), floor-large-a (floor), floor-small-b (floor)                      | wall-small-a (wall), floor-small-b (floor) | wall-small-a (wall), floor-large-a (floor), floor-small-b (floor) |
| loft                   | window-a (wall), floor-large-a (floor) | floor-large-b (floor)                      | floor-large-b (floor)                      | wall-small-a (wall), floor-large-b (floor)                                                                  | floor-large-b (floor)                      | floor-large-b (floor)                                             |
| study                  | window-a (wall)                        | wall-small-a (wall), floor-small-a (floor) | wall-small-a (wall), floor-small-a (floor) | wall-large-a (wall), wall-small-a (wall), wall-small-b (wall), floor-large-a (floor), floor-small-a (floor) | wall-small-a (wall), floor-small-a (floor) | wall-small-a (wall), floor-large-a (floor), floor-small-a (floor) |
| attic (2 cells)        | none                                   | none                                       | none                                       | window-b (wall), floor-large-b (floor)                                                                      | none                                       | none                                                              |
| cellar (2 cells)       | none                                   | none                                       | none                                       | wall-large-b (wall), floor-large-b (floor)                                                                  | none                                       | floor-large-b (floor)                                             |
| gallery (2 cells)      | wall-large-a (wall)                    | wall-large-c (wall)                        | wall-large-c (wall)                        | wall-large-c (wall), floor-small-b (floor)                                                                  | wall-large-c (wall)                        | wall-large-c (wall), floor-small-b (floor)                        |
| conservatory (2 cells) | window-a (wall), floor-small-a (floor) | window-c (wall)                            | window-c (wall)                            | window-c (wall), floor-large-b (floor), floor-small-c (floor)                                               | window-c (wall)                            | window-c (wall), floor-small-c (floor)                            |
| bath                   | window-a (wall), floor-small-a (floor) | wall-small-a (wall), floor-small-b (floor) | wall-small-a (wall), floor-small-b (floor) | wall-small-a (wall), floor-large-a (floor), floor-small-b (floor)                                           | wall-small-a (wall), floor-small-b (floor) | wall-small-a (wall), floor-large-a (floor), floor-small-b (floor) |
| guest                  | window-a (wall)                        | wall-small-a (wall), floor-small-a (floor) | wall-small-a (wall), floor-small-a (floor) | wall-large-a (wall), wall-small-a (wall), floor-large-a (floor), floor-small-a (floor)                      | wall-small-a (wall), floor-small-a (floor) | wall-small-a (wall), floor-large-a (floor), floor-small-a (floor) |

Reading it: the recurring clashes are the window at the left and the wall-small, mantel and floor-small at the right of every one cell room. The two cell rooms have nearly clear ends (attic, cellar) except the gallery and conservatory, whose wall spots reach the edge.

**How to avoid the clash, in three ways:**

1. **A rule, no content change:** a doorway or stair is a house fixture of a room edge; the wall spots in its zone are hidden while it exists (the piece stays placed in the data and comes back when the way is removed; it is never lost from the inventory). Floor spots stay: they stand in front of the foot.
2. **A content change, the cleaner one:** reserve the outer 12 px of both ends as a door strip (the window moves from x 2 to 14, floor-small from x 3 to 14, the right wall-small and floor-small 12 px left). One edit per room kind, no rule needed.
3. **Only where there is room:** allow ways only on two cell rooms and on edges whose zone is clear in the table (attic and cellar today).

**Stairs** (a 64 px climb, a hole cut in the upper room's floor and slab) have three options, drawn in front of the wall and behind the furniture:

- **Straight stair** (42 wide, ten steps with a rail): the most readable and by far the most invasive; it takes the right 46 px, so all the wall pieces there and the large floor piece. Fits a two cell room, or a room that gives up its right side.
- **Ladder** (10 wide): takes the right 12 px and clashes only with what is already at the edge (the mantel, the lamp). Fits hut, loft and attic; reads as "up".
- **Spiral** (24 wide): 26 px; reads as a stair and clashes with the large floor piece and the right edge.

The hole needs the room above to have a free floor at that x; the house mock cuts the strip and the slab and the stair's top steps show in the upper room. A floor piece whose spot is inside the hole is hidden while the stair exists, the same rule as the doorway.

**Recommendation.** Make stairs and doorways fixtures of a room edge (the room kinds already have a `fixtures` list), whose reach hides the spots it meets (way 1 above), and make the door strip (way 2) when the ways ship. Build doorway style A first, the ladder and the spiral for one cell rooms, the straight stair for two cell rooms. Do not offer them as skins before the spot rule exists.

## How each layer becomes a skin kind (a plan, not built)

Today `SkinDefSchema` has the kinds `wall`, `floor`, `roof`, `walls` and the ground skins; a room names its `wall` and `floor` (checked in `schema.ts` against the skin ids), `HouseView` carries both per room, and the exterior (`roof`, `walls`) is house wide. The six layers fit the same shape:

| Layer     | Skin kind                       | Chosen                                                | Art                                                                                       | Earn                                                          |
| --------- | ------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Wallpaper | `wall` (exists)                 | per room                                              | a generated tile, `wall-<pattern>-<colour>`                                               | starter, part, set, drop, feat, as now                        |
| Floor     | `floor` (exists)                | per room                                              | `floor-<pattern>-<colour>`                                                                | as now                                                        |
| Trim      | new `trim`                      | per room, default none                                | an overlay tile, `trim-<kind>-<colour>`                                                   | plain skirting as starter; the rest as parts and drops        |
| Ceiling   | new `ceiling`                   | per room                                              | an overlay as wide as the room (112 or 224; rafters depends on the width, so two sprites) | plain as starter; beams with a part, rafters with the attic   |
| Frame     | new `frame`                     | house wide, beside `roof` and `walls` in the exterior | a post tile and a slab tile                                                               | timber (today's look) as starter; the rest as parts and drops |
| Ways      | a room fixture, not a worn skin | per room edge                                         | doorway and stair sprites in the frame's colour                                           | built with the part (a stair comes with a second floor)       |

What would change:

- **Content and schema** (`packages/game`): the skin kinds `trim`, `ceiling` and `frame`; two new per-room fields in a house's layout (`trim`, `ceiling`) and one on the exterior (`frame`), validated by the same strict schema against the skin ids; starter defaults equal today's look, so an existing house does not change. Skin entries are generated data (`pnpm housing` would write the JSON), so a new colour is one line. The 156 wallpapers should not all be shop items: the content names a few dozen, the generator makes art for every combination, and the catalogue lists only what the content names.
- **Server** (`apps/worker`): the existing skin change endpoint, with its idempotency, ownership and unlock checks, takes the new kinds; `RoomView` carries `trim` and `ceiling`, the exterior carries `frame`. No new rules: the unlock and price paths are the skins'. Reads stay small (a few more fields on rows the house view already reads).
- **Client** (`apps/activity`): `house-scene.ts` composes the layers in the order above (two more tile fills with the `wall` material; posts and slab use the frame's tiles with `exterior`); the night pass needs no change. The skin picker and catalogue gain the kinds (same rows as wallpapers); a room's picker would use layer tabs (wall, floor, trim, ceiling), not one long list. Tiles are generated into the art packs at build time; the runtime does not run the generators.
- **Art cross-check** (`house-content-art.test.ts`): every named skin has art. The generators' own tests (this change) prove tile widths and heights, palette keys, the contrast budget, determinism and the ways' sizes.

## Recommendation per layer

| Layer          | Verdict                                                                                   | Why                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Wallpaper    | **Keep**                                                                                  | Best value: 156 looks from small functions, reads at 1x, never fights furniture. Drop _harlequin_ or soften its line; keep _starry_ for dark colours. Ship about 8 patterns and 8 colours first. |
| 2 Floor        | **Keep, simplify**                                                                        | The strip is 8 px and often hidden. Keep planks (long, short), parquet, checker, flags and the two carpets; drop _cobble_ (noisy), fold _tatami_ into a set's own floor.                         |
| 3 Trim         | **Keep**                                                                                  | Wainscot and panelling change a room more than any other layer for the cost. Cut the stone cornice's dentils.                                                                                    |
| 4 Frame        | **Simplify**                                                                              | Two pixel posts and a four row slab show little. Three materials (timber, stone, painted) with the paint colours are enough; iron and brick are close to stone at 1x.                            |
| 5 Ways through | **Keep doorway A, the ladder and the spiral; drop the straight stair for one cell rooms** | They make the cutaway read as a house people move through. They need the fixture and the spot rule (and the door strip), so build them last.                                                     |
| 6 Ceiling      | **Keep, simplify**                                                                        | Beamed and coffered are cheap and good; rafters is the strongest look but top floor only. Drop _plain_ as a choice (it is the default).                                                          |

## Open questions for the lead

1. Do ways through go in this round, or stay a look until the door strip content change is accepted?
2. How many of the 156 wallpapers and 72 floors are earnable, and by which routes (colours by part, patterns by set)?
3. Is the trim its own per-room choice, or part of the wallpaper's skin (one choice instead of two)?
4. The frame: house wide only (as proposed), or also per floor?

## What is built (2026-11-12)

Wallpaper, floor, trim, ceiling and frame are in the game; ways through (doorways, stairs) are not wired, and their generators and the analysis above stand as they were.

- **Content.** Each pattern or kind is one skin with `gen: { pattern, colours, tier, family }` (`skins.json`, 30 entries): 12 wallpapers (no harlequin; starry in midnight, charcoal, forest and slate only), 7 floors (no cobble, no tatami), 4 trims, 4 ceilings (plain included, as a starter), 3 frames (timber in oak and dark, painted in four colours, stone in grey). Owned once, worn in any listed colour.
- **Stored.** A layer's look is `<skin id>:<colour>`. The room's `wall` column carries `;ceiling=…;trim=…` after the wallpaper and the house's `walls` column `;frame=…` after the walls skin, so no migration; a layer never chosen is absent and the view says null ("as built"). The server checks the skin, its kind, the colour and ownership (a starter is owned by rule).
- **Drawn.** `housing/interior-art.ts` runs the generators at runtime (cached per pattern, colour and size) in the housing chunk. The scene draws paper, ceiling, trim (cornice under the chosen ceiling; none under rafters), floor, then the slab and inner posts from the frame (the cut edges keep the walls skin). Paper, ceiling and trim are `wall`, the floor `floor`, the frame `exterior` for the night pass. A house that chose nothing paints the same pixels as before (`house-layers.test.ts`).
- **Picked.** A room has four chips (wallpaper, floor, trim, ceiling; two rows of two on a phone), the house a third chip (frame) beside roof and walls. The picker lists a pattern once and shows a row of its colours under it; trim, ceiling and frame start with "As built".
- **Not done.** Rafters are allowed in any room (the server does not know which rooms are under the roof without a new read); a generated wallpaper with no ceiling chosen has no ceiling line of its own.
