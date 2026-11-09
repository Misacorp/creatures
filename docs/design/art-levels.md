# Valley building levels: one look per level

Misa (2026-11-09): buildings should get **better**, not just more decorated, from level 1 to 5, and may change building material as they grow. Buildings of the same level share a common motif, so a level reads across the whole valley (like a new look per town hall level in Clash of Clans). Early levels are humbler than today's art. A forge stays stone or brick, but it can carry wooden parts at a wooden level.

## The five levels

Each level keeps what still stands from the level below, replaces what it upgrades, and adds its signature to **every** building, visible at 1x on the valley map.

| Level | Name    | Materials                                                                              | Signature on every building                                                   |
| ----- | ------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1     | Humble  | Raw logs and branches, rope lashings, packed earth, loose fieldstones, straw or thatch | Rope ties and bare wood: small, home-made, a little crooked                   |
| 2     | Settled | Sawn planks, dressed timber posts, wooden shingles, iron nails                         | The red-brown shingle roof (or plank cover) and a plank sign                  |
| 3     | Stone   | A cut-stone base or walls, a slate roof, black iron bands and brackets                 | Grey dressed stone and black iron fittings                                    |
| 4     | Valley  | Plastered or painted trim, brass lamps, glass                                          | The valley's teal-and-cream pennant or banner and a brass lamp                |
| 5     | Crystal | Valley crystal (the teal shard of the Market), gold trim                               | A glowing crystal finial or inlay and gold trim; the crystal glows by day too |

## Rules

- **Shared colours.** Every level's materials come from `apps/activity/src/sprites/concepts/valley-tiers.ts` (night colours and their day versions), so the shingles of a level 2 forge and a level 2 school are the same red. A building may add its own colours (fire, glass, cloth), within 16 per sprite.
- **Night and day.** Night is the main palette with the glow style's warm light lying on the ground; `alts.day` recolours the same pixels. Fire and crystal stay lit by day; lamps and windows go plain by day.
- **One canvas per building.** All five levels of a building share one canvas size (its footprint on the map), with the art standing on the same base row, centred. A smaller level leaves the canvas's top and sides empty. Footprints: Bonfire 64x56, Forge 56x60, Signpost 64x56, Paddock 64x64, School 64x64. The Market is built once and keeps its art.
- **What the game relies on** stays put at every level and is written in each set's notes: the Bonfire's seat points, the School's door (and the bell's place, which may move from a side post to a tower), the Paddock's roam rectangle for creatures (one rectangle for all levels).
- Each place's levels are listed in a set's `levels`, and `pnpm art levels` draws them side by side into `docs/art/levels/<place>.png`.
