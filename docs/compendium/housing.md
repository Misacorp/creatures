# Housing: the house, its rooms, its furniture and its words

Status: 2026-11-09 (the first content of player housing; behind the `HOUSING` flag). Names and flavour for the data in `packages/game/src/content/data/housing/`. The numbers and the rules live in `HOUSING_RULES` and in those files, not here. The design is `docs/design/housing.md`.

Read `README.md` for the tags. Lines marked `(content)` are shipped text in the files named. Everything about who makes what, and why, is `(compendium detail, not shipped)`.

## The house in the world

- Every explorer keeps a **house**. It begins as a hut with one room, the **Hearth**, and a good fire, and it grows when its owner decides to build. Nothing about it makes anyone stronger. It is a place to come back to. `(design: housing.md section 1)`
- A house is built from **parts**: a cottage, a house, a cellar, wings, a terrace, a garden, a pool. Each is paid for a little at a time, whenever the owner has something to give, and it stands the moment the last piece is paid. `(design)`
- Furniture is **made**, not bought, at the workbench by the hearth. A **blueprint** shows how. A **set** is nine pieces that look like they belong together, and each set belongs to a place and its element. A few **wild** pieces belong to no set. `(design)`
- **Luxury materials** are the fine things the valley gives up: woods, stones, metals and cloth. The scouts bring them home. They are good for building and for nothing else. `(design)`
- **Visitors** may look around any house, leave one small gift a day and one stamp per house. The guestbook is stamps only. `(design)`

**Compendium detail, not shipped.** Furniture makers are spread across the valley, and each keeps to their own wood: the tide-folk work driftwood and shell, the forge-folk black charwood and iron, the woodfolk of the Hollow living wood and moss, the ridge-folk ash and copper wire. The fen keeps its oak for a hundred years and then lets it go. The oldest pieces, the Ancient set, nobody remembers making: they were simply there at the Crossroads, and a little worn. The Festival's makers use paper, paint and bunting, and only for one long evening a year, so those pieces are the hardest to find.

Motifs that run through the house: the hearth that is always lit, the door that is never locked, the guestbook that only holds small marks. In keeping with the rest of the world, nobody pays rent, nothing wears out and no house is better than another.

## Parts

Eleven parts. The hut is the start; the rest are built in an order the prerequisites allow. Prices are in `parts.json`. Each part also teaches the blueprint of one roof or wall style, noted below. `(content: parts.json)`

| Part             | Needs         | Teaches      | Line `(content)`                         |
| ---------------- | ------------- | ------------ | ---------------------------------------- |
| Hut              | Nothing       | Nothing      | One room and a good fire.                |
| Cottage          | Hut           | Slate        | A kitchen, and a bed upstairs.           |
| House            | Cottage       | Timber       | Three storeys and a roof over all of it. |
| Cellar           | Cottage       | Fieldstone   | Cool and quiet, under the floor.         |
| Terrace          | Cottage       | Brick        | A stone deck for sunny mornings.         |
| Garden           | Cottage       | Moss         | A lawn, a hedge and room for flowers.    |
| West Wing        | House         | Red Tile     | A long hall for everything you have won. |
| West Upper Floor | West Wing     | Nothing      | A gallery above the hall.                |
| East Wing        | House         | Copper Green | A glass room full of light.              |
| East Upper Floor | East Wing     | Nothing      | A bath, and a room for guests.           |
| Pool             | Garden, House | Shingle      | A tiled pool, deep enough to float in.   |

## Rooms

Fourteen kinds of room. Each has fixed spots for a window, a wall, the ceiling, the floor and a rug, and no free placement. The trophy hall is all displays: it fills itself from what the player has done. `(content: rooms.json)`

| Room         | Built with       | Note `(compendium detail, not shipped)`                                                                         |
| ------------ | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Hearth       | Hut              | Where the house starts. The workbench and the mailbox are here, and the mantel holds the best raid plaque.      |
| Kitchen      | Cottage          | The warm room behind the hearth.                                                                                |
| Loft         | Cottage          | Under the roof, with a round window.                                                                            |
| Study        | House            | A quiet room for books.                                                                                         |
| Attic        | House            | Under the big roof, with two small dormers.                                                                     |
| Cellar       | Cellar           | Cool and quiet, with no window.                                                                                 |
| Trophy Hall  | West Wing        | The trophy hall. Plaques, medals, badges, keepsakes, journal books and the dungeon marker fill it on their own. |
| Gallery      | West Upper Floor | A long wall for pictures.                                                                                       |
| Conservatory | East Wing        | Glass on three sides.                                                                                           |
| Bath         | East Upper Floor | A small room with a big window.                                                                                 |
| Guest Room   | East Upper Floor | A spare bed, in case anyone stays.                                                                              |
| Terrace      | Terrace          | A stone deck on the west edge. Outdoors.                                                                        |
| Garden       | Garden           | A lawn with a hedge line. Outdoors.                                                                             |
| Pool         | Pool             | A tiled basin with water. Outdoors.                                                                             |

## Forms

A form is a kind of furniture and the spot it fits. Every piece of a form shares one outline, so every bed sleeps a creature in the same place. `(content: forms.json)`

| Form               | Fits        |
| ------------------ | ----------- |
| Bed                | floor large |
| Cupboard           | floor large |
| Table              | floor large |
| Shelf              | wall large  |
| Stool              | floor small |
| Lamp               | ceiling     |
| Rug                | rug         |
| Frame              | wall small  |
| Curtains           | window      |
| Sofa               | floor large |
| Fireplace          | floor large |
| Chair              | floor small |
| Plant              | floor small |
| Seat               | floor small |
| Clock              | wall small  |
| Tall Piece         | floor large |
| Hanging            | ceiling     |
| Large Garden Piece | yard large  |
| Small Garden Piece | yard small  |
| Fence              | fence       |
| Poolside Piece     | poolside    |
| Pool Float         | water       |

## Sets

Nine sets: the starter set and eight to collect, each with its own palette and one motif that appears on every piece. Finishing a set puts its keepsake in the trophy hall's cabinet. A set is never a bonus. `(content: sets.json)`

| Set           | Element | Keepsake `(content)`                                               | Motif and palette `(design)`                                                                                                                |
| ------------- | ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Cosy          | None    | Hearth Bell: A small brass bell. It rings when someone comes home. | The living room as it is: warm wood, cream cushions. Shipped sprites; only the missing forms are new.                                       |
| Tidepool      | Tide    | Pearl Shell: A shell with a pearl still inside.                    | Driftwood with scalloped shell edges; sea blue, sand, pearl white.                                                                          |
| Moonlit       | Tide    | Moon Pebble: A smooth stone, cool at noon and warm at midnight.    | Night-reef blue lacquer, coral pink inlay, a soft moonstone knob; silver highlights.                                                        |
| Emberhold     | Ember   | Forge Ember: A coal that has never gone out.                       | Forge-folk work: black charwood, riveted iron bands, amber glow; rust, coal, ember orange.                                                  |
| Rootwood      | Grove   | Acorn Seedling: A seedling in a thimble, and growing.              | Woodfolk of the Hollow: living-wood curves, leaf carving, moss cushions; bark brown, moss and leaf greens.                                  |
| Stormglass    | Spark   | Spark Bead: A glass bead with a small storm inside.                | Pale ash with a lightning scar, copper coils and glass beads; slate, copper, storm violet.                                                  |
| Fenkeeper     | Mire    | Opal Drop: A drop of opal on a reed string.                        | The bog keeps things: dark oak with reed bindings, an oil-sheen opal; peat brown, murky teal, a violet glint.                               |
| Ancient       | None    | Gold Spiral: A small spiral of gold leaf, worn thin by hands.      | Carved standing-stone slabs, spiral carvings, worn gold leaf; sandstone, faded gold, patina teal.                                           |
| Lantern Night | None    | Paper Tassel: A red tassel that still smells of festival evenings. | Paper lanterns and bunting on painted wood; festival red, gold, cream.                                                                      |
| Quiet Verge   | None    | Quiet Verge Keepsake: TODO line                                    | draft: Dusk-violet stone edged in pale rim light, arches with a warm star inside, chips of stone that float; window dark, lilac, star gold. |

### Keepsakes

Shown in the cabinet when the set is complete. `(content: sets.json)`

| Keepsake             | Set           | Line `(content)`                                       |
| -------------------- | ------------- | ------------------------------------------------------ |
| Hearth Bell          | Cosy          | A small brass bell. It rings when someone comes home.  |
| Pearl Shell          | Tidepool      | A shell with a pearl still inside.                     |
| Moon Pebble          | Moonlit       | A smooth stone, cool at noon and warm at midnight.     |
| Forge Ember          | Emberhold     | A coal that has never gone out.                        |
| Acorn Seedling       | Rootwood      | A seedling in a thimble, and growing.                  |
| Spark Bead           | Stormglass    | A glass bead with a small storm inside.                |
| Opal Drop            | Fenkeeper     | A drop of opal on a reed string.                       |
| Gold Spiral          | Ancient       | A small spiral of gold leaf, worn thin by hands.       |
| Paper Tassel         | Lantern Night | A red tassel that still smells of festival evenings.   |
| Quiet Verge Keepsake | Quiet Verge   | TODO: one line about the Quiet Verge keepsake. (draft) |

### Cosy set

Warm wood and cream cushions. The room you started in. `(content)`

| Piece           | Form      | Line `(content)`                                |
| --------------- | --------- | ----------------------------------------------- |
| Cosy Bed        | Bed       | A plain wooden bed with a cream quilt.          |
| Cosy Cupboard   | Cupboard  | A sturdy cupboard in warm wood.                 |
| Cosy Table      | Table     | A low wooden table that has seen a lot of tea.  |
| Cosy Wall Shelf | Shelf     | A simple wall shelf for small things.           |
| Cosy Bookshelf  | Cupboard  | A bookshelf with room for one more book.        |
| Cosy Stool      | Stool     | A little stool, handy for everything.           |
| Cosy Lamp       | Lamp      | A lamp with a warm, yellow glow.                |
| Cosy Rug        | Rug       | A soft rug to stand on.                         |
| Cosy Picture    | Frame     | A picture of a meadow in a plain frame.         |
| Cosy Curtains   | Curtains  | Cream curtains that let the light in.           |
| Cosy Sofa       | Sofa      | A deep sofa with cream cushions.                |
| Cosy Fireplace  | Fireplace | A little fireplace that is always lit.          |
| Cosy Chair      | Chair     | A wooden chair with a soft seat.                |
| Cosy Plant      | Plant     | A potted plant, doing its best.                 |
| Cosy Pouf       | Seat      | A round pouf, soft as a cloud.                  |
| Cosy Beanbag    | Seat      | A beanbag that takes the shape of whoever sits. |
| Cosy Cushion    | Seat      | A cushion for the floor.                        |
| Cosy Clock      | Clock     | A small clock that is only slightly wrong.      |

### Tidepool set

Driftwood and shell, from where the tide leaves things. `(content)`

| Piece             | Form     | Line `(content)`                                                     |
| ----------------- | -------- | -------------------------------------------------------------------- |
| Tidepool Bed      | Bed      | Driftwood slats and a shell-edged headboard. Smells faintly of salt. |
| Tidepool Cupboard | Cupboard | A cupboard of sanded driftwood, its doors scalloped like a shell.    |
| Tidepool Table    | Table    | A low table from one long plank the tide delivered.                  |
| Tidepool Shelf    | Shelf    | A shelf for small finds, with a scallop along every edge.            |
| Tidepool Stool    | Stool    | A round stool on three driftwood legs.                               |
| Tidepool Lamp     | Lamp     | A glass float in a rope net, glowing pearl white.                    |
| Tidepool Rug      | Rug      | A sand-coloured rug with a wave stitched along its edge.             |
| Tidepool Frame    | Frame    | A frame of tiny shells around a picture of the sea.                  |
| Tidepool Curtains | Curtains | Pale blue curtains with a shell-shaped hem.                          |

### Moonlit set

Blue lacquer and coral, made for the reef at night. `(content)`

| Piece            | Form     | Line `(content)`                                                 |
| ---------------- | -------- | ---------------------------------------------------------------- |
| Moonlit Bed      | Bed      | Blue lacquer with a coral inlay and a crescent on the headboard. |
| Moonlit Cupboard | Cupboard | A night-blue cupboard with a soft moonstone knob.                |
| Moonlit Table    | Table    | A lacquered table that holds the light like water.               |
| Moonlit Shelf    | Shelf    | A silver-edged shelf with a crescent cut at each end.            |
| Moonlit Stool    | Stool    | A little blue stool with a coral top.                            |
| Moonlit Lamp     | Lamp     | A crescent lantern with a soft white glow.                       |
| Moonlit Rug      | Rug      | A deep blue rug with silver tide lines.                          |
| Moonlit Frame    | Frame    | A coral-inlaid frame around a picture of the reef at night.      |
| Moonlit Curtains | Curtains | Sea silk curtains that shimmer when anyone walks past.           |

### Emberhold set

Black wood and riveted iron, made by the forge-folk. `(content)`

| Piece              | Form     | Line `(content)`                                          |
| ------------------ | -------- | --------------------------------------------------------- |
| Emberhold Bed      | Bed      | A charwood bed with iron bands, warm as a banked fire.    |
| Emberhold Cupboard | Cupboard | Black charwood doors held by riveted iron straps.         |
| Emberhold Table    | Table    | A forge table, banded in iron, with a glow underneath.    |
| Emberhold Shelf    | Shelf    | An iron-banded shelf that still feels warm.               |
| Emberhold Stool    | Stool    | A short charwood stool with three rivets on the seat.     |
| Emberhold Lamp     | Lamp     | A hanging forge lamp with an amber glow behind iron bars. |
| Emberhold Rug      | Rug      | A coal-grey rug edged in ember orange.                    |
| Emberhold Frame    | Frame    | A riveted iron frame around a picture of the caves.       |
| Emberhold Curtains | Curtains | Heavy rust-red curtains, hemmed to keep the heat in.      |

### Rootwood set

Living wood and moss, shaped by the woodfolk of the Hollow. `(content)`

| Piece             | Form     | Line `(content)`                                                 |
| ----------------- | -------- | ---------------------------------------------------------------- |
| Rootwood Bed      | Bed      | A bed grown into curves, with a leaf curling at each top corner. |
| Rootwood Cupboard | Cupboard | Living-wood doors carved with leaves.                            |
| Rootwood Table    | Table    | A round table on roots that still seem to be reaching.           |
| Rootwood Shelf    | Shelf    | A bark shelf with a curl of leaf at each end.                    |
| Rootwood Stool    | Stool    | A stump stool with a moss cushion.                               |
| Rootwood Lamp     | Lamp     | A seed-pod lantern, green as new leaves.                         |
| Rootwood Rug      | Rug      | A mossy rug, nearly soft enough to nap on.                       |
| Rootwood Frame    | Frame    | A frame of twisted twigs with a leaf in each corner.             |
| Rootwood Curtains | Curtains | Moss velvet curtains, heavy and green.                           |

### Stormglass set

Pale ash, copper wire and glass beads, from the high ridge. `(content)`

| Piece               | Form     | Line `(content)`                                                   |
| ------------------- | -------- | ------------------------------------------------------------------ |
| Stormglass Bed      | Bed      | Pale ash with a lightning scar down the headboard and copper trim. |
| Stormglass Cupboard | Cupboard | A cupboard of ash, bound with copper coils.                        |
| Stormglass Table    | Table    | A grey-white table with a zigzag of copper across it.              |
| Stormglass Shelf    | Shelf    | A shelf strung with glass beads on copper wire.                    |
| Stormglass Stool    | Stool    | An ash stool with a bead on each leg.                              |
| Stormglass Lamp     | Lamp     | A glass bulb wrapped in copper, faintly crackling.                 |
| Stormglass Rug      | Rug      | A slate rug with a violet zigzag.                                  |
| Stormglass Frame    | Frame    | A copper-trimmed frame around a picture of a storm.                |
| Stormglass Curtains | Curtains | Slate curtains with a copper thread that sparks in the dark.       |

### Fenkeeper set

Dark oak and tied reeds. The bog keeps things. `(content)`

| Piece              | Form     | Line `(content)`                                                         |
| ------------------ | -------- | ------------------------------------------------------------------------ |
| Fenkeeper Bed      | Bed      | Dark bog oak bound with reed, an opal drop on the headboard.             |
| Fenkeeper Cupboard | Cupboard | A cupboard the bog kept for a hundred years, with a reed-wrapped handle. |
| Fenkeeper Table    | Table    | A peat-brown table with a rim of tied reeds.                             |
| Fenkeeper Shelf    | Shelf    | A reed-bound shelf with an opal at one end.                              |
| Fenkeeper Stool    | Stool    | A squat stool, bound with reed and never quite dry.                      |
| Fenkeeper Lamp     | Lamp     | A fen lantern that hangs from reeds, glowing teal.                       |
| Fenkeeper Rug      | Rug      | A woven reed mat in peat brown and murky teal.                           |
| Fenkeeper Frame    | Frame    | A bog oak frame with a drop of opal on top.                              |
| Fenkeeper Curtains | Curtains | Reed-green curtains with a violet glint in the weave.                    |

### Ancient set

Carved stone and worn gold, older than the roads. `(content)`

| Piece            | Form     | Line `(content)`                                                  |
| ---------------- | -------- | ----------------------------------------------------------------- |
| Ancient Bed      | Bed      | A slab bed carved with spirals and a stepped headboard.           |
| Ancient Cupboard | Cupboard | A standing-stone cupboard, its doors worn smooth by time.         |
| Ancient Table    | Table    | A stone table with a ring of spirals and a gold-leaf edge.        |
| Ancient Shelf    | Shelf    | A stepped stone shelf with a thread of gold.                      |
| Ancient Stool    | Stool    | A small stone seat, spiral-carved and surprisingly comfortable.   |
| Ancient Lamp     | Lamp     | A bowl lamp of patina-green bronze, stepped like a little temple. |
| Ancient Rug      | Rug      | A sandstone rug woven with faded gold spirals.                    |
| Ancient Frame    | Frame    | A stone frame with a worn gold border.                            |
| Ancient Curtains | Curtains | Faded gold curtains, heavy as old banners.                        |

### Lantern Night set

Paper lanterns and bunting, for the longest evening of the year. `(content)`

| Piece                  | Form     | Line `(content)`                                               |
| ---------------------- | -------- | -------------------------------------------------------------- |
| Lantern Night Bed      | Bed      | A painted bed hung with bunting and a small red tassel.        |
| Lantern Night Cupboard | Cupboard | A red lacquer cupboard with gold paint around the doors.       |
| Lantern Night Table    | Table    | A low painted table with paper lanterns strung above.          |
| Lantern Night Shelf    | Shelf    | A shelf with a tassel at each end, painted festival red.       |
| Lantern Night Stool    | Stool    | A cream stool with a red tassel under the seat.                |
| Lantern Night Lamp     | Lamp     | A round paper lantern that glows warm all evening.             |
| Lantern Night Rug      | Rug      | A cream rug with red and gold bunting woven in.                |
| Lantern Night Frame    | Frame    | A red frame with a tiny tassel at the corner.                  |
| Lantern Night Curtains | Curtains | Lantern silk curtains, red and gold, that glow in the evening. |

### Quiet Verge set

Draft: TODO one line about the Quiet Verge set. `(content)`

| Piece                | Form     | Line `(content)`                               |
| -------------------- | -------- | ---------------------------------------------- |
| Quiet Verge Bed      | Bed      | TODO: one line about the Quiet Verge bed.      |
| Quiet Verge Cupboard | Cupboard | TODO: one line about the Quiet Verge cupboard. |
| Quiet Verge Table    | Table    | TODO: one line about the Quiet Verge table.    |
| Quiet Verge Shelf    | Shelf    | TODO: one line about the Quiet Verge shelf.    |
| Quiet Verge Stool    | Stool    | TODO: one line about the Quiet Verge stool.    |
| Quiet Verge Lamp     | Lamp     | TODO: one line about the Quiet Verge lamp.     |
| Quiet Verge Rug      | Rug      | TODO: one line about the Quiet Verge rug.      |
| Quiet Verge Frame    | Frame    | TODO: one line about the Quiet Verge frame.    |
| Quiet Verge Curtains | Curtains | TODO: one line about the Quiet Verge curtains. |

## Wild pieces

Twelve pieces in no set. Each has its own source. `(content: pieces.json)`

| Piece          | Form       | Where from                              | Line `(content)`                                           |
| -------------- | ---------- | --------------------------------------- | ---------------------------------------------------------- |
| Rocking Chair  | Chair      | Yours from the start.                   | A chair that rocks itself a little when nobody is looking. |
| Hammock        | Bed        | Found on trips to the Tidepools.        | A net bed strung between two driftwood posts.              |
| Reef Tank      | Tall Piece | Found on trips to the Moonlit Reef.     | A tall glass tank of slow, glowing reef.                   |
| Tall Clock     | Tall Piece | Won after a cleared raid finale.        | A tall clock with a slow tick, and a very old face.        |
| Cuckoo Clock   | Clock      | Found at the end of a dungeon run.      | The cuckoo comes out on the hour and bows.                 |
| Wayfarer Globe | Stool      | Earned with the Wayfarer stamp.         | A small globe with a pin in every place you have been.     |
| Music Box      | Stool      | Won with a Games gold.                  | Wind it up and it plays something you almost remember.     |
| Moss Terrarium | Plant      | Found on trips to the Verdant Hollow.   | A glass jar with a small, damp forest inside.              |
| Star Chart     | Shelf      | Found on trips to Storm Ridge.          | A chart of the night sky, with a few stars added by hand.  |
| Old Map        | Shelf      | Found on trips to the Old Crossroads.   | A map of roads that may not be there any more.             |
| Wind Chime     | Hanging    | Found on trips to Storm Ridge.          | Copper and glass that ring before the storm does.          |
| Paper Mobile   | Hanging    | Found on trips to the Festival Grounds. | Paper lanterns turning slowly in the warm air.             |

## Garden and pool pieces

Twelve pieces for the terrace, the garden and the pool. `(content: pieces.json)`

| Piece            | Form               | Where from                              | Line `(content)`                                                  |
| ---------------- | ------------------ | --------------------------------------- | ----------------------------------------------------------------- |
| Stone Fountain   | Large Garden Piece | Found on trips to the Tidepools.        | A stone fountain with water that sings.                           |
| Mossback Topiary | Large Garden Piece | Found on trips to the Verdant Hollow.   | A hedge clipped into a big, round, sleepy shape.                  |
| Rose Arbor       | Large Garden Piece | Found on trips to the Old Crossroads.   | An arch of roses that smells like summer.                         |
| Flowerbed        | Small Garden Piece | Yours from the start.                   | A small bed of whatever is in season.                             |
| Lantern Post     | Small Garden Piece | Found on trips to the Festival Grounds. | A post with a paper lantern for late evenings.                    |
| Birdbath         | Small Garden Piece | Found on trips to the Storm Ridge.      | A shallow dish for the rain to fill.                              |
| Garden Bench     | Small Garden Piece | Found on trips to the Sunken Fen.       | A bench just big enough for two and a cup of tea.                 |
| Sundial          | Small Garden Piece | Found on trips to the Ember Caves.      | It tells the time on sunny days, and is honest about the rest.    |
| Hedge            | Fence              | Yours from the start.                   | A tidy green hedge, almost.                                       |
| Picket Fence     | Fence              | Found on trips to the Old Crossroads.   | White pickets, a little crooked, all the nicer for it.            |
| Lounger          | Poolside Piece     | Found on trips to the Moonlit Reef.     | A long chair for doing nothing beside the water.                  |
| Swim Ring        | Pool Float         | Found on trips to the Tidepools.        | A ring that floats, and a creature that does not want to get out. |

## Luxury materials

Sixteen, in four families. The three rare ones turn up less often. `(content: materials.json, resources.json)`

| Material      | Family | Element | Rare | Where `(content)`                                                               | Line `(content)`                                                    |
| ------------- | ------ | ------- | ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Driftwood     | Wood   | Tide    | No   | Found at Tidepools and Old Crossroads, and from raid finales.                   | Grey wood the tide sanded smooth. It still smells of salt.          |
| Charwood      | Wood   | Ember   | No   | Found at Ember Caves and Old Crossroads, and from the dungeon and raid finales. | Wood that came out of the fire black and hard, and kept its warmth. |
| Heartbark     | Wood   | Grove   | No   | Found at Verdant Hollow and Old Crossroads, and from raid finales.              | Bark from the oldest trees of the Hollow, soft as cork.             |
| Lightning Ash | Wood   | Spark   | No   | Found at Storm Ridge and Old Crossroads, and from raid finales.                 | Pale ash from a tree the storm struck and did not finish.           |
| Bog Oak       | Wood   | Mire    | No   | Found at Sunken Fen, and from the dungeon and raid finales.                     | Black oak the bog kept for a hundred years, and gave back.          |
| Sea Glass     | Stone  | Tide    | No   | Found at Tidepools, and from raid finales.                                      | Green glass the sea rolled until it forgot it was a bottle.         |
| Moonstone     | Stone  | Tide    | Yes  | Found at Moonlit Reef.                                                          | A pale stone that glows a little when the reef is dark.             |
| Cinder Garnet | Stone  | Ember   | No   | Found at Ember Caves, and from raid finales.                                    | A red stone from the caves where the embers sleep.                  |
| Storm Quartz  | Stone  | Spark   | No   | Found at Storm Ridge, and from raid finales.                                    | Clear quartz with a crackle in it, from the high ridge.             |
| Fen Opal      | Stone  | Mire    | Yes  | Found at Sunken Fen, and from raid finales.                                     | A dull stone with an oil sheen. Only the fen finds it.              |
| Cinder Iron   | Metal  | Ember   | No   | Found at Ember Caves, and from the dungeon.                                     | Dark iron from the caves. It takes a hammer well.                   |
| Bright Copper | Metal  | Spark   | No   | Found at Storm Ridge, and from the dungeon.                                     | Copper from the ridge, bright as a new coin and faintly humming.    |
| Old Gold      | Metal  | None    | Yes  | Found at Old Crossroads, and from raid finales.                                 | Gold from before the roads were roads. Thin, soft and very old.     |
| Sea Silk      | Cloth  | Tide    | No   | Found at Moonlit Reef, and from the Valley Games.                               | Fine thread spun from the reef at night.                            |
| Moss Velvet   | Cloth  | Grove   | No   | Found at Verdant Hollow, and from the Valley Games.                             | Moss, pressed and dried until it feels like velvet.                 |
| Lantern Silk  | Cloth  | None    | No   | Found at Festival Grounds, and from the Festival finale and the Valley Games.   | Red and gold silk from the Festival lanterns.                       |

## Skins

Wallpapers and floors for the rooms, roofs and walls for the outside of the house, and the ground the outdoor rooms stand on. Each set has its own wallpaper and floor. `(content: skins.json)`

| Skin                    | Kind        | Where from `(content)`                                                    |
| ----------------------- | ----------- | ------------------------------------------------------------------------- |
| Cosy Wallpaper          | wall        | Yours from the start.                                                     |
| Cosy Floor              | floor       | Yours from the start.                                                     |
| Tidepool Wallpaper      | wall        | A blueprint from the Tidepools or the Tidal Colossus.                     |
| Tidepool Floor          | floor       | A blueprint from the Tidepools or the Tidal Colossus.                     |
| Moonlit Wallpaper       | wall        | A blueprint from the Moonlit Reef or a Tide boss.                         |
| Moonlit Floor           | floor       | A blueprint from the Moonlit Reef or a Tide boss.                         |
| Emberhold Wallpaper     | wall        | A blueprint from the Ember Caves, the dungeon or the Cinder Wyrm.         |
| Emberhold Floor         | floor       | A blueprint from the Ember Caves, the dungeon or the Cinder Wyrm.         |
| Rootwood Wallpaper      | wall        | A blueprint from the Verdant Hollow or the Thornmother.                   |
| Rootwood Floor          | floor       | A blueprint from the Verdant Hollow or the Thornmother.                   |
| Stormglass Wallpaper    | wall        | A blueprint from Storm Ridge or the Storm Sovereign.                      |
| Stormglass Floor        | floor       | A blueprint from Storm Ridge or the Storm Sovereign.                      |
| Fenkeeper Wallpaper     | wall        | A blueprint from the Sunken Fen, the dungeon or Old Bogback.              |
| Fenkeeper Floor         | floor       | A blueprint from the Sunken Fen, the dungeon or Old Bogback.              |
| Ancient Wallpaper       | wall        | A blueprint from the Old Crossroads or any cleared finale.                |
| Ancient Floor           | floor       | A blueprint from the Old Crossroads or any cleared finale.                |
| Lantern Night Wallpaper | wall        | A blueprint from the Festival Grounds, a Festival finale or a Games gold. |
| Lantern Night Floor     | floor       | A blueprint from the Festival Grounds, a Festival finale or a Games gold. |
| Quiet Verge Wallpaper   | wall        | A blueprint from the Old Crossroads or the Moonlit Reef.                  |
| Quiet Verge Floor       | floor       | A blueprint from the Old Crossroads or the Moonlit Reef.                  |
| Kitchen Wallpaper       | wall        | Comes with the Cottage.                                                   |
| Kitchen Floor           | floor       | Comes with the Cottage.                                                   |
| Attic Wallpaper         | wall        | Comes with the House.                                                     |
| Attic Floor             | floor       | Comes with the House.                                                     |
| Cellar Wallpaper        | wall        | Comes with the Cellar.                                                    |
| Cellar Floor            | floor       | Comes with the Cellar.                                                    |
| Trophy Hall Wallpaper   | wall        | Comes with the West Wing.                                                 |
| Trophy Hall Floor       | floor       | Comes with the West Wing.                                                 |
| Gallery Wallpaper       | wall        | Comes with the West Upper Floor.                                          |
| Gallery Floor           | floor       | Comes with the West Upper Floor.                                          |
| Conservatory Wallpaper  | wall        | Comes with the East Wing.                                                 |
| Conservatory Floor      | floor       | Comes with the East Wing.                                                 |
| Bath Wallpaper          | wall        | Comes with the East Upper Floor.                                          |
| Bath Floor              | floor       | Comes with the East Upper Floor.                                          |
| Guest Room Wallpaper    | wall        | Comes with the East Upper Floor.                                          |
| Guest Room Floor        | floor       | Comes with the East Upper Floor.                                          |
| Thatch                  | roof        | Yours from the start.                                                     |
| Slate                   | roof        | Learned by building the Cottage.                                          |
| Red Tile                | roof        | Learned by building the West Wing.                                        |
| Copper Green            | roof        | Learned by building the East Wing.                                        |
| Moss                    | roof        | Learned by building the Garden.                                           |
| Plaster                 | house walls | Yours from the start.                                                     |
| Timber                  | house walls | Learned by building the House.                                            |
| Fieldstone              | house walls | Learned by building the Cellar.                                           |
| Brick                   | house walls | Learned by building the Terrace.                                          |
| Shingle                 | house walls | Learned by building the Pool.                                             |
| Lawn                    | ground      | Yours from the start.                                                     |
| Deck                    | ground      | Yours from the start.                                                     |
| Pool Tile               | ground      | Yours from the start.                                                     |

Room skins (art pass 2): every indoor room except the Hearth, Loft and Study starts in its own wallpaper and floor, so the parts of a big house read as different rooms. They are free, come with the part that has the room (and so also show up as choices for other rooms once that part is built), and belong to no set.

- **Kitchen** (`kitchen-wall`, `kitchen-floor`): Cream plaster over terracotta tiles, and a floor of terracotta and cream squares. As warm as the oven.
- **Attic** (`attic-wall`, `attic-floor`): Bare boards between the rafters, and dusty floorboards nobody minds.
- **Cellar** (`cellar-wall`, `cellar-floor`): Damp stone laid block on block, with moss at its foot, and flagstones, cool underfoot.
- **Trophy Hall** (`hall-wall`, `hall-floor`): Dark panelling with brass studs and a chair rail, and a parquet floor that has seen a lot of boots.
- **Gallery** (`gallery-wall`, `gallery-floor`): Pale plaster under a gold picture rail, and pale oak laid in chevrons.
- **Conservatory** (`conservatory-wall`, `conservatory-floor`): Panes of sky and cloud in thin frames over a whitewashed low wall, and diamond tiles that hold the sun.
- **Bath** (`bath-wall`, `bath-floor`): Small white tiles with a teal stripe, and a mosaic floor of blue and white.
- **Guest Room** (`guest-wall`, `guest-floor`): Soft sage stripes over cream beadboard, and whitewashed planks that are quiet to walk on.

## Stamps

Twenty-four small marks for a friend's guestbook. One everyone has; the journal's sets, the raid bosses, the dungeon, the Games and the house itself unlock the rest; four are rare finds. `(content: stamps.json)`

| Stamp          | Line `(content)`                                   | How `(content)`                          |
| -------------- | -------------------------------------------------- | ---------------------------------------- |
| Paw Print      | A paw print in ink. Everyone has one.              | Everyone starts with this one.           |
| Ledger Shell   | A tiny shell with a line of writing.               | Find every page of The Tide Ledger.      |
| Ash Feather    | A feather, burnt at the tip.                       | Find every page of The Ash Records.      |
| Root Knot      | A knot of root, tied tight.                        | Find every page of Rootwork Notes.       |
| Static Spark   | A little blue spark that tickles.                  | Find every page of Static Letters.       |
| Signpost       | A signpost with too many arrows.                   | Find every page of The Signpost Series.  |
| Crescent       | A pale crescent, like a nail clipping of the moon. | Find every page of Moonlit Verses.       |
| Peat Bubble    | A bubble from the fen, just about to pop.          | Find every page of The Peat Notes.       |
| Torn Page      | A page with one corner torn off.                   | Find every page of Lost Pages.           |
| Colossus Wave  | A wave as big as a house.                          | Beat Tidal Colossus in a raid.           |
| Wyrm Coil      | A coil of scales, still warm.                      | Beat Cinder Wyrm in a raid.              |
| Thorn Crown    | A crown of thorns with a flower in it.             | Beat Thornmother in a raid.              |
| Storm Crown    | A crown with a crack of lightning.                 | Beat Storm Sovereign in a raid.          |
| Bogback Moss   | A tuft of moss from a very large back.             | Beat Old Bogback in a raid.              |
| Deep Door      | A door standing open on the dark.                  | Go ten floors deep in the dungeon.       |
| Gold Medal     | A gold medal on a ribbon.                          | Win gold at the Valley Games.            |
| Wayfarer       | A boot print from every road.                      | Visit seven different places.            |
| Glimmer Star   | A star that only shines on some.                   | Find a shiny creature.                   |
| Housewarming   | A small house with smoke from the chimney.         | Build the Cottage.                       |
| Matched Set    | Two chairs that match.                             | Finish a furniture set.                  |
| Old Coin       | An old coin with a worn face.                      | A rare find after a raid.                |
| Lantern Key    | A key on a lantern ring.                           | A rare find at the end of a dungeon run. |
| Pressed Flower | A flower, pressed flat.                            | A rare find on trips and scouts.         |
| Rosette        | A ribbon rosette.                                  | A rare find at the Valley Games.         |

## Displays

The trophy hall's eight displays fill themselves: raid plaques (the mantel in the Hearth shows the best one), the Games medals bench, the event badges, the Festival case, the commons' keepsakes shelf, the journal's finished sets as bound books, the dungeon depth marker and the cabinet of set keepsakes. `(design: housing.md 2.5)`

## Notes and open threads

- The Cosy set is the living room as it already looks: it reuses the shipped props, and only the bed, the cupboard and the wall shelf are new. `(design)`
- The porch (a place for the valley's visitors to wait) is a held-back seam, not content. `(design: housing.md 7)`
- The bonfire and the house do not compete: a housemate may be asleep in its bed and still be seen at the bonfire. `(design: housing.md 8)`
