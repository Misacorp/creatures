# Places

Status: 2026-10-20 (a concept place added 2026-10-31, at the end). Covers the eight destinations, and the daily dungeon as a place.

Read `README.md` for the tags. Banners, moods, residents, journal pages and the destination texts are shipped data `(content: destinations.json, journal.json, glossary.json)`. Push-on flavour, sensory details and story hooks are `(compendium detail, not shipped)`.

**Former player text.** Each destination's glossary entry used to show in a "?" popup that has been removed. The text is kept here, word for word, under "Former player text (glossary)" in each place. The entries are still in `glossary.json` until another agent removes them. Do not edit them there.

## At a glance

| Place            | Element                               | Access                      | Residents (catchable, stage 1)                               | Deeper area           | In the weekly rotation |
| ---------------- | ------------------------------------- | --------------------------- | ------------------------------------------------------------ | --------------------- | ---------------------- |
| Tidepools        | Tide                                  | Explorer rank 1             | Splashet, Mistnewt, Coralynx                                 | No deep-only creature | Yes                    |
| Ember Caves      | Ember                                 | Explorer rank 1             | Cindle, Ashmole, Mossback                                    | Solmane               | Yes                    |
| Verdant Hollow   | Grove                                 | Explorer rank 1             | Sproutle, Mossback                                           | Gaiadrake             | Yes                    |
| Storm Ridge      | Spark                                 | Explorer rank 1             | Zipmouse, Stormray                                           | Aurorix               | Yes                    |
| Old Crossroads   | None (mixed)                          | Explorer rank 2             | Splashet, Cindle, Sproutle, Zipmouse, Stormray               | Gaiadrake             | Yes                    |
| Moonlit Reef     | Tide                                  | Explorer rank 4, night only | Mistnewt, Coralynx                                           | Aurorix               | Yes                    |
| Sunken Fen       | Mire                                  | Explorer rank 1             | Mudlump, Squelch                                             | No deep-only creature | Yes                    |
| Festival Grounds | None                                  | Festival weeks only         | Ashmole, Solmane; Lanternfin and Hearthshell (not catchable) | No deep-only creature | Festival week only     |
| Daily dungeon    | None (all four elements in its rooms) | One run a day               | Dungeon foes and floor bosses (see `dungeon.md`)             | Not applicable        | No                     |

`(content: destinations.json, weekly-specials.json, glossary.json "daily-dungeon")`

The rarity mix is set per place in the data. In short: Tidepools and the Ember and Grove places are mostly common, the Storm Ridge uses the same mix as the default, the Old Crossroads and Moonlit Reef have a real rare share, and the Festival Grounds has epics and no rares `(content: destinations.json)`. The exact numbers are in the data and are not repeated here.

## Push-on goals (shipped, shared by every place)

Push-on goals are not tied to one place in the data. Every trip can offer them when it ends `(content: push-on-goals.json)`. Place flavour for each goal is below, in each place's section, as `(compendium detail, not shipped)`.

| Goal                 | Risk `(content)` | Earliest rank | Trip lengths             | Reward kind                         | Shipped flavour                                                                    |
| -------------------- | ---------------- | ------------- | ------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------- |
| Linger a while       | Safe             | 4             | Short, medium, long, day | A chance of one more creature       | "There is still something rustling nearby. One more look cannot hurt."             |
| Forage around        | Safe             | 1             | Short, medium, long, day | Scrap                               | "Berries, bark and bits of metal: the ground is full of useful things."            |
| Take field notes     | Safe             | 1             | Short, medium, long, day | A journal page and some explorer XP | "Sit down, look closely and write it all down while it is fresh."                  |
| Scout ahead          | Safe             | 2             | Medium, long, day        | A supply                            | "A faint trail leads on. Someone left supplies along it."                          |
| Take the shortcut    | Risky            | 3             | Medium, long, day        | A rare gear piece                   | "A narrow gap in the rocks. It could be a treasure road, or a trap."               |
| Open the lost cache  | Risky            | 3             | Medium, long, day        | A blueprint                         | "A sealed chest with an old symbol on the lid. Nobody knows what is inside."       |
| Press deeper         | Risky            | 4             | Long, day                | Chances at creatures and a supply   | "Past the last marker the creatures grow thick. So does the danger."               |
| Break into the vault | Risky            | 6             | Long, day                | An epic gear piece                  | "A door older than any road. What is behind it is worth a great deal, or nothing." |

`(content: push-on-goals.json)`. The glossary also says a goal can be "Very risky". The data has only "safe" and "risky" (`README.md`, contradiction 6).

---

## Tidepools

**Element:** Tide. **Access:** explorer rank 1, open to everyone. **Residents:** Splashet, Mistnewt and Coralynx. **Deeper area:** no deep-only creature, but the deeper area makes rarer catches likelier. `(content: destinations.json)`

**Flavour line** `(content)`: "Warm shallows where every pool hides something small and splashy."

### Mood and climate

- **Mood** `(content)`: bright, calm and curious.
- **Climate** `(compendium detail, not shipped)`: warm shallows in the morning, with a low tide that uncovers the shelf and small waves at the edge. The air is clean and a little salty.

### Banner art brief `(content: destinations.json)`

- **Scene:** "A sunlit rock shelf at low tide: shallow pools full of starfish and anemones, small waves lapping the edge, a wide pale sky above."
- **Palette:** Pool teal `#2a9d9a`, Wet slate `#3d4f66`, Foam white `#e8f4f2`, Coral pink `#e8836f`.
- **Details:** three or four separate pools at different depths, each catching a different bit of sky; tiny crab and starfish silhouettes that can sit in the foreground; wet footprints leading in from the left edge, where the creature starts walking.
- **Never:** deep dark water; any creature drawn in the scene.

### Residents

| Creature | Rarity | Note                        |
| -------- | ------ | --------------------------- |
| Splashet | Common | Starter. Tide line, setter. |
| Mistnewt | Common | Tide line, guard.           |
| Coralynx | Rare   | Single stage. Payoff.       |

There is no deep-only creature here `(content)`.

### Push-on flavour `(compendium detail, not shipped)`

| Goal                 | Place flavour                                                                   |
| -------------------- | ------------------------------------------------------------------------------- |
| Linger a while       | A crab is still rustling under the anemones. One more look.                     |
| Forage around        | Shells, sea glass and a bit of old rope along the tideline.                     |
| Take field notes     | Sit on the warm rock and list every pool, from the biggest to the smallest.     |
| Scout ahead          | A trail of wet footprints goes round the shelf, with a dry sack left on a rock. |
| Take the shortcut    | A gap between two pools that the tide has only just opened.                     |
| Open the lost cache  | A waterproof crate wedged in the shelf, with a faded mark on the lid.           |
| Press deeper         | Past the last pool the water goes dark and the anemones grow thick.             |
| Break into the vault | A door of worn stone under the shelf, older than the tide marks.                |

### Journal pages set here `(content: journal.json)`

| Page           | Set             |
| -------------- | --------------- |
| The first pool | The Tide Ledger |
| Low water      | The Tide Ledger |
| Warm stone     | The Tide Ledger |
| A small friend | none            |
| A lucky hit    | none            |

### Sensory details `(compendium detail, not shipped)`

- The soft slap of small waves, and the squeak of wet rock under a paw.
- The smell of salt, weed and warm stone at low tide.
- Light through shallow water, moving on the sand like a net.
- Anemones closing when a shadow passes.

### Story hooks `(compendium detail, not shipped)`

- A spark-bred friend has been seen here, and the water "answers with a crack of light" `(content: journal.json tide-first-pool)`. Who was the spark, and where did it go?
- The Colossus "rises from the deep" `(content: bosses-lore.json)`. The shelf's last pool is the nearest the deep comes `(compendium detail, not shipped)`.
- A starfish that has been counting the tides for longer than anyone remembers.

### Former player text (glossary)

From `glossary.json`, entry `destination-tidepools`:

> **Tidepools**
> Short: A warm, splashy Tide place. Open to everyone.
> Lines:
>
> - Splashet, Mistnewt and Coralynx live here.
> - The deeper area makes rarer catches likelier.

---

## Ember Caves

**Element:** Ember. **Access:** explorer rank 1, open to everyone. **Residents:** Cindle, Ashmole and Mossback. **Deeper area:** Solmane. `(content: destinations.json)`

**Flavour line** `(content)`: "A warm tunnel of glowing rock where something is always humming."

### Mood and climate

- **Mood** `(content)`: warm, a little dangerous, welcoming at the edges.
- **Climate** `(compendium detail, not shipped)`: hot air inside the cave, cooler toward the mouth, with a faint updraft that carries sparks outward. The deep is brighter than the mouth.

### Banner art brief `(content: destinations.json)`

- **Scene:** "The mouth of a volcanic cave glowing orange from inside: cracked black rock, rivers of slow lava, drifting sparks, a few green ferns growing at the cool edge."
- **Palette:** Cinder black `#2b2024`, Lava orange `#e8742c`, Ember gold `#f2b84b`, Fern green `#5a8a4a`.
- **Details:** glowing cracks that run across the whole strip like a path; a few floating sparks that can drift upward in the loop; a small cool pocket of green on the right edge so the cave feels lived in.
- **Never:** smoke that hides the scene; any creature drawn in the scene.

### Residents

| Creature | Rarity | Note                                                                  |
| -------- | ------ | --------------------------------------------------------------------- |
| Cindle   | Common | Ember line, payoff. Starter.                                          |
| Ashmole  | Common | Ember line, support. Also at the Festival Grounds.                    |
| Mossback | Rare   | Grove line, setter. A Grove creature in an Ember place.               |
| Solmane  | Epic   | Deeper area only. Single stage, setter. Also at the Festival Grounds. |

### Push-on flavour `(compendium detail, not shipped)`

| Goal                 | Place flavour                                                             |
| -------------------- | ------------------------------------------------------------------------- |
| Linger a while       | The cracks are humming. Something is still walking in the glow.           |
| Forage around        | Charred roots, warm pebbles, and a few cool stones by the green edge.     |
| Take field notes     | Write down the glow, the heat and the hum before the next spark.          |
| Scout ahead          | A lantern still burns in a side tunnel, with a pack left beside it.       |
| Take the shortcut    | A narrow crack that glows brighter the longer you look at it.             |
| Open the lost cache  | A chest sealed with black wax, warm to the touch.                         |
| Press deeper         | The air shimmers. The creatures get thicker, and so does the heat.        |
| Break into the vault | A door cut into the stone, glowing along its seams, older than the forge. |

### Journal pages set here `(content: journal.json)`

| Page                   | Set             |
| ---------------------- | --------------- |
| Green at the mouth     | The Ash Records |
| Where the sea comes in | The Ash Records |
| The ash burrow         | The Ash Records |
| Sunlight in the deep   | none            |
| Cooling off            | none            |

### Sensory details `(compendium detail, not shipped)`

- A low hum through the rock. The flavour line says "something is always humming" `(content: destinations.json)`.
- The hot air on the face, and cool air from the green pocket on the right.
- Sparks that rise slowly, then drift sideways.
- The crack of a lava river, and the crunch of black stone underfoot.

### Story hooks `(compendium detail, not shipped)`

- The Ash Records set is a set of stories about the cave's own history, and the Ember Caves are where the records are kept `(inferred)`. Who keeps them?
- The mane of light that "walks first" in the deep `(content: journal.json ember-lion-light)` is Solmane. Does it come back up to the mouth?
- A burrow where everyone is welcome, and a Mossback garden grows at the edge.

### Former player text (glossary)

From `glossary.json`, entry `destination-ember-caves`:

> **Ember Caves**
> Short: A glowing Ember place. Open to everyone.
> Lines:
>
> - Cindle, Ashmole and Mossback live here.
> - Something golden sleeps in the deeper area.

---

## Verdant Hollow

**Element:** Grove. **Access:** explorer rank 1, open to everyone. **Residents:** Sproutle and Mossback. **Deeper area:** Gaiadrake. `(content: destinations.json)`

**Flavour line** `(content)`: "A green bowl in the hills where the trees seem to lean in and listen."

### Mood and climate

- **Mood** `(content)`: hushed, soft and ancient.
- **Climate** `(compendium detail, not shipped)`: cool and still under the trees, with the light coming down in shafts. Damp near the stream, and warmer in the sun-patches where Sproutle naps.

### Banner art brief `(content: destinations.json)`

- **Scene:** "A sunken forest bowl with tall mossy trunks, shafts of light through leaves, a little stream and mushrooms in the foreground."
- **Palette:** Moss green `#4f8a3c`, Deep bark `#4a3b2c`, Light shaft `#f4e9a8`, Toadstool red `#c8483f`.
- **Details:** several layers of trees, so the strip has depth from front to back; one or two light shafts falling at an angle; a trail of flat stones crossing the stream from left to right.
- **Never:** dead trees; any creature drawn in the scene.

### Residents

| Creature  | Rarity | Note                                         |
| --------- | ------ | -------------------------------------------- |
| Sproutle  | Common | Grove line, guard. Starter.                  |
| Mossback  | Rare   | Grove line, setter. Also in the Ember Caves. |
| Gaiadrake | Epic   | Deeper area only. Single stage, payoff.      |

### Push-on flavour `(compendium detail, not shipped)`

| Goal                 | Place flavour                                                              |
| -------------------- | -------------------------------------------------------------------------- |
| Linger a while       | The leaves rustle again, as if someone is walking just out of sight.       |
| Forage around        | Mushrooms, bark, and a few bright bits of metal from an old camp.          |
| Take field notes     | Sit by the stream and write down the trees that lean in to listen.         |
| Scout ahead          | A flat-stone trail leads across the stream, with a pack left under a fern. |
| Take the shortcut    | A gap between two mossy trunks, with light falling straight through it.    |
| Open the lost cache  | A box hidden under a root, with a flower carved into the lid.              |
| Press deeper         | Past the last marker the trees grow close, and the roots grow thick.       |
| Break into the vault | A door under the oldest tree, its frame wrapped in roots.                  |

### Journal pages set here `(content: journal.json)`

| Page                  | Set            |
| --------------------- | -------------- |
| Heavy bark            | Rootwork Notes |
| Roots and a bolt      | Rootwork Notes |
| A garden on a shell   | Rootwork Notes |
| Brambles at both ends | none           |
| A wall of moss        | none           |

### Sensory details `(compendium detail, not shipped)`

- Wind in the leaves, and the soft tap of a drip on moss.
- The smell of damp bark, mushrooms and cut grass.
- Light through leaves: the pale band across the stream.
- The hush of the bowl, where sound seems to come from the trees.

### Story hooks `(compendium detail, not shipped)`

- "The old queen of thorns" `(content: journal.json verdant-both-ends)` is, in our reading, the Hollow's listener, since the trees "seem to lean in and listen" `(content: destinations.json; the link is inferred)`. Does she listen to the explorers too?
- Bark-wardens stand at the front and take the blows, and "never say so" `(content: journal.json verdant-heavy-bark)`. A warden with a story of its own.
- A Mossback's garden is harvested by other creatures. Who plants the next one?

### Former player text (glossary)

From `glossary.json`, entry `destination-verdant-hollow`:

> **Verdant Hollow**
> Short: A hushed Grove place. Open to everyone.
> Lines:
>
> - Sproutle and Mossback live here.
> - Something huge sleeps in the deeper area.

---

## Storm Ridge

**Element:** Spark. **Access:** explorer rank 1, open to everyone. **Residents:** Zipmouse and Stormray. **Deeper area:** Aurorix. `(content: destinations.json)`

**Flavour line** `(content)`: "A windy ridge where the air tingles and the thunder is close enough to touch."

**Note:** this destination used to have no `odds` block and fell back to the default mix. It now carries an explicit block with the same values `(content: destinations.json; README.md, contradiction 5)`.

### Mood and climate

- **Mood** `(content)`: windy, electric and exciting.
- **Climate** `(compendium detail, not shipped)`: a bare ridge with rocky steps and a constant wind. The air tingles before a storm. Thunder is close.

### Banner art brief `(content: destinations.json)`

- **Scene:** "A bare mountain ridge under a purple thundercloud: rocky steps, lightning striking a far peak, wind-bent grass and a few standing stones."
- **Palette:** Storm purple `#4b3f72`, Slate grey `#5d6b7a`, Bolt yellow `#f6e05e`, Wind grass `#8aa05a`.
- **Details:** a single bright bolt in the distance that can flash in the loop; standing stones along the ridge line like waypoints; grass blowing in one direction, against the walking creature.
- **Never:** rain that hides the ridge; any creature drawn in the scene.

### Residents

| Creature | Rarity | Note                                     |
| -------- | ------ | ---------------------------------------- |
| Zipmouse | Common | Spark line, setter.                      |
| Stormray | Rare   | Spark line, payoff.                      |
| Aurorix  | Epic   | Deeper area only. Single stage, support. |

### Push-on flavour `(compendium detail, not shipped)`

| Goal                 | Place flavour                                                               |
| -------------------- | --------------------------------------------------------------------------- |
| Linger a while       | A wisp of static is still in the grass, and the thunder has not finished.   |
| Forage around        | Scraps of wire and a few glass beads blown up the slope.                    |
| Take field notes     | Write down the wind's direction, the bolts and the standing stones.         |
| Scout ahead          | A line of standing stones leads on, with a pack wedged between two of them. |
| Take the shortcut    | A gap in the rocks where the wind howls and the air tingles.                |
| Open the lost cache  | A tin box, scorched and humming, marked with a bolt.                        |
| Press deeper         | Past the last stone, the storm is closer, and the creatures gather.         |
| Break into the vault | A door set into the ridge, with a lightning bolt carved over it.            |

### Journal pages set here `(content: journal.json)`

| Page                  | Set            |
| --------------------- | -------------- |
| The lightning rod     | Static Letters |
| First in, first out   | Static Letters |
| A wet wire            | Static Letters |
| The edge of the cloud | none           |
| The watcher above     | none           |

### Sensory details `(compendium detail, not shipped)`

- A constant wind, and the flap of grass against it.
- The hum in the air before a bolt, and the crack after it.
- The smell of ozone, and wet stone after a flash.
- Standing stones cold to the touch, even in sun.

### Story hooks `(compendium detail, not shipped)`

- "The king of the clouds" picks out the strongest creature on the ridge and strikes it first `(content: journal.json storm-lightning-rod)`. The king is the ridge's weather.
- The Static Letters set may be a message sent by lightning. Who is sending it?
- "The watcher above" is a ribbon of light that keeps spirits high, and "the crowd has never seen its face" `(content: journal.json storm-aurora-watcher)`. A hidden face.

### Former player text (glossary)

From `glossary.json`, entry `destination-storm-ridge`:

> **Storm Ridge**
> Short: A windy Spark place. Open to everyone.
> Lines:
>
> - Zipmouse and Stormray live here.
> - Something bright drifts in the deeper area.

---

## Old Crossroads

**Element:** none (mixed). **Access:** explorer rank 2, open to everyone. **Residents:** Splashet, Cindle, Sproutle, Zipmouse and Stormray (the only place where all five pass through). **Deeper area:** Gaiadrake. `(content: destinations.json)`

**Flavour line** `(content)`: "Four old roads meet here, and a little of everything wanders through."

### Mood and climate

- **Mood** `(content)`: dusty, friendly and full of possibilities.
- **Climate** `(compendium detail, not shipped)`: an open crossing with a long evening sky. Dust on the road, and the smell of campfire ash.

### Banner art brief `(content: destinations.json)`

- **Scene:** "A worn dirt crossing where four paths meet, with a crooked wooden signpost, a stone well, a lantern post and travellers' campfire ashes."
- **Palette:** Road dust `#b89968`, Sign wood `#6e4b2d`, Evening sky `#e9b48a`, Weed green `#7c9a52`.
- **Details:** a signpost with four arrows, each pointing along a different path; four paths in four slightly different colours that fade into the distance; footprints and cart tracks, so it looks well used.
- **Never:** people drawn in the scene; any creature drawn in the scene.

### Residents

| Creature | Rarity | Note                         |
| -------- | ------ | ---------------------------- |
| Splashet | Common | Tide line, setter. Starter.  |
| Cindle   | Common | Ember line, payoff. Starter. |
| Sproutle | Common | Grove line, guard. Starter.  |
| Zipmouse | Common | Spark line, setter.          |
| Stormray | Rare   | Spark line, payoff.          |

Deeper area: Gaiadrake `(content)`.

### Push-on flavour `(compendium detail, not shipped)`

| Goal                 | Place flavour                                                          |
| -------------------- | ---------------------------------------------------------------------- |
| Linger a while       | The travellers' fire is still warm, and someone is still on the road.  |
| Forage around        | Dropped nails from cart wheels, and a few good stones by the well.     |
| Take field notes     | Sit by the signpost and write down the four roads, and who walks them. |
| Scout ahead          | The fourth road has supplies left at its first milestone.              |
| Take the shortcut    | A cart track that cuts across the fields, and looks like a trap.       |
| Open the lost cache  | A sealed box by the well, with the old symbol on the lid.              |
| Press deeper         | Past the last signpost, the travellers stop, and the wild begins.      |
| Break into the vault | A door older than any road, set at the crossing's heart.               |

### Journal pages set here `(content: journal.json)`

| Page                | Set                 |
| ------------------- | ------------------- |
| Which end first     | The Signpost Series |
| Fast feet           | The Signpost Series |
| Front, middle, back | The Signpost Series |
| Who pays the toll   | The Signpost Series |
| The wishing well    | none                |
| A fork in the fur   | none                |

### Sensory details `(compendium detail, not shipped)`

- The creak of the signpost in the wind.
- Cart tracks and footprints, dry and dusty.
- The smell of campfire ash and evening bread.
- The splash of a well bucket, far off.

### Story hooks `(compendium detail, not shipped)`

- The four roads each lead to one element's place. Which road is which? (See `threads.md`, T12.)
- "The old symbol" on the lost cache lid is the same mark as a signpost arrow `(compendium detail, not shipped)`. The cache and the vault might be linked.
- The Gaiadrake's deep area is the Crossroads' own secret `(content)`. A carried forest walks past the signpost.

### Former player text (glossary)

From `glossary.json`, entry `destination-old-crossroads`:

> **Old Crossroads**
> Short: A mixed place where everything passes through.
> Lines:
>
> - Needs explorer rank 2.
> - Splashet, Cindle, Sproutle, Zipmouse and Stormray pass through.
> - Trips that were out when expeditions changed come home from here.

---

## Moonlit Reef

**Element:** Tide. **Access:** explorer rank 4, and only at night. **Residents:** Mistnewt and Coralynx. **Deeper area:** Aurorix. `(content: destinations.json)`

**Flavour line** `(content)`: "Only the night tide uncovers this reef, and it glows when nobody looks."

**Hours:** the glossary gives the night hours, "20:00 to 06:00 of your server time". The data says only `night: true` `(content: glossary.json "destination-moonlit-reef"; README.md, contradiction 4)`.

### Mood and climate

- **Mood** `(content)`: dreamy, quiet and a little magical.
- **Climate** `(compendium detail, not shipped)`: cool, still night air. Moonlight on wet coral. The tide is out, and the water is shallow and silver.

### Banner art brief `(content: destinations.json)`

- **Scene:** "A shallow reef at night under a huge pale moon: glowing coral, drifting jellyfish lights, silver ripples and a thin line of aurora far above."
- **Palette:** Night blue `#1c2a4a`, Moon silver `#d8e2f0`, Reef glow `#5fd0c5`, Coral violet `#9a6bc2`.
- **Details:** the moon reflected in the water as a long broken stripe; glowing coral shapes that light the foreground from below; a faint aurora ribbon at the top edge.
- **Never:** daylight; any creature drawn in the scene.

### Residents

| Creature | Rarity | Note                                         |
| -------- | ------ | -------------------------------------------- |
| Mistnewt | Common | Tide line, guard. Also in the Tidepools.     |
| Coralynx | Rare   | Single stage, payoff. Also in the Tidepools. |
| Aurorix  | Epic   | Deeper area only. Single stage, support.     |

### Push-on flavour `(compendium detail, not shipped)`

| Goal                 | Place flavour                                                                |
| -------------------- | ---------------------------------------------------------------------------- |
| Linger a while       | The water has not pulled back yet, and something is still glowing out there. |
| Forage around        | Glowing shells and sea glass that is cold to the touch.                      |
| Take field notes     | Write down the moon's stripe on the water before it is gone.                 |
| Scout ahead          | A lantern light on the reef, with supplies tucked inside the coral.          |
| Take the shortcut    | A channel through the coral, open only for a short while.                    |
| Open the lost cache  | A chest sealed in pearl and coral, which hums in the dark.                   |
| Press deeper         | Past the glowing wall, the reef goes quiet and the creatures get thick.      |
| Break into the vault | A door of coral that opens only when the silver tide is out.                 |

### Journal pages set here `(content: journal.json)`

| Page             | Set            |
| ---------------- | -------------- |
| The silver tide  | Moonlit Verses |
| A lance of coral | Moonlit Verses |
| A glowing wall   | Moonlit Verses |
| The night singer | none           |
| Fog on the reef  | none           |

### Sensory details `(compendium detail, not shipped)`

- The quiet of a night reef, with water moving very softly.
- Cool, damp air and the smell of salt and moonlit coral.
- A gentle glow from below, lighting every shell.
- Something singing far out over the water, if you listen `(compendium detail; see T01 in threads.md)`.

### Story hooks `(compendium detail, not shipped)`

- "By morning it is gone, and nobody remembers the way" `(content: journal.json reef-silver-tide)`. How does an explorer find the reef again? (See `threads.md`, T13.)
- The night singer makes the boss forget its counter-move `(content: journal.json reef-night-singer)`. Who is singing?
- The deepest edge of the reef "lights up like a wall" `(content: journal.json reef-glowing-wall)`. What is on the other side?

### Former player text (glossary)

From `glossary.json`, entry `destination-moonlit-reef`:

> **Moonlit Reef**
> Short: A glowing Tide place, only open at night.
> Lines:
>
> - Open from 20:00 to 06:00 of your server time. Needs explorer rank 4.
> - Mistnewt and Coralynx live here.
> - The rarest creatures wait in the deeper area.

---

## Festival Grounds

**Element:** none. **Access:** explorer rank 1, and only in Festival weeks. **Residents:** Ashmole and Solmane, plus Lanternfin and Hearthshell, which are not catchable on normal trips. **Deeper area:** none. `(content: destinations.json, creatures.json)`

**Flavour line** `(content)`: "The lanterns are lit and the music has started: the whole meadow is a party."

**Festival:** every fifth raid week is a Festival. In a Festival week, this place is the weekly special, with the "festival-bounty" twist: two more hours of finds on every trip `(content: weekly-specials.json, glossary.json "festival")`.

### Mood and climate

- **Mood** `(content)`: joyful, warm and a bit noisy.
- **Climate** `(compendium detail, not shipped)`: a summer evening that goes on and on. Warm air from the bonfire, the first stars, and fireworks starting in the sky.

### Banner art brief `(content: destinations.json)`

- **Scene:** "A meadow set up for a festival: strings of paper lanterns between poles, bunting, a small bonfire, long picnic tables and fireworks starting in the sky."
- **Palette:** Lantern red `#d9453b`, Bunting yellow `#f2c14e`, Twilight blue `#3a4c8a`, Bonfire orange `#f08a3c`.
- **Details:** lines of lanterns that curve across the whole strip; a bonfire at the right edge as the finish line; one or two small fireworks that can burst in the loop.
- **Never:** crowds of people; any creature drawn in the scene.

### Residents

| Creature    | Rarity | Note                                                                  |
| ----------- | ------ | --------------------------------------------------------------------- |
| Ashmole     | Common | Ember line, support. Also in the Ember Caves.                         |
| Solmane     | Epic   | Single stage, setter. Also in the Ember Caves.                        |
| Lanternfin  | Epic   | Festival creature. Tide line, support. Not catchable on normal trips. |
| Hearthshell | Epic   | Festival creature. Ember line, guard. Not catchable on normal trips.  |

The Festival creatures are described in `creatures.md`.

### Push-on flavour `(compendium detail, not shipped)`

| Goal                 | Place flavour                                                                 |
| -------------------- | ----------------------------------------------------------------------------- |
| Linger a while       | The music is still going, and someone wants one more song.                    |
| Forage around        | Ribbon scraps, lantern wire and paper bunting.                                |
| Take field notes     | Sit by the bonfire and write down every song and every lantern.               |
| Scout ahead          | A lantern path leads to a stall with supplies, left for the festival.         |
| Take the shortcut    | A gap between the picnic tables, lit by a firework.                           |
| Open the lost cache  | A box of prizes, sealed and tied with bunting.                                |
| Press deeper         | Past the last lantern line, the party is wild, and so are the creatures.      |
| Break into the vault | A door in the bonfire's shadow, wrapped in bunting, and older than the party. |

### Journal pages set here `(content: journal.json)`

| Page                | Set  |
| ------------------- | ---- |
| Paper lanterns      | none |
| The hearth ward     | none |
| Bunting and ribbons | none |
| The last night      | none |

The Festival Grounds has no journal set `(content)`.

### Sensory details `(compendium detail, not shipped)`

- Music from far off, and laughter from the far end of the meadow.
- The smell of bonfire smoke and warm paper lanterns.
- A low hum of lanterns swinging in the breeze.
- The first firework, and the hush before the next.

### Story hooks `(compendium detail, not shipped)`

- "The Festival of the tide" is the name on a charm `(content: gear.json)`. Is it the same festival as this meadow?
- The Hearthshell "shows up when a festival begins" `(content: species-lore.json)`. Where does it come from in the other weeks?
- "The last night" is the moment everyone remembers why they came `(content: journal.json fest-last-night)`. What is the reveal?

### Former player text (glossary)

From `glossary.json`, entry `destination-festival-grounds`:

> **Festival Grounds**
> Short: Only open in Festival weeks.
> Lines:
>
> - Ashmole, Solmane, Lanternfin and Hearthshell live here.
> - The Festival creatures live nowhere else.

---

## Sunken Fen

**Element:** Mire. **Access:** explorer rank 1, like the other element places. **Residents:** Mudlump and Squelch (both common, so every roll is a common catch). **Deeper area:** no deep-only creature; a rarer-catch push of 15%, the highest of any place. `(content: destinations.json; design: speed-and-dodge.md section 5.6)`

**Flavour line** `(content)`: "A flat, quiet bog where the mud keeps everything it is given. Old things turn up here."

**Design note** `(design)`: a Mire destination where the bog keeps old things: better odds of old finds (gear, journal pages, the Ancient vault push-on). **As built** `(content)`: places have no knob of their own for old finds, so the identity is carried by what already follows a place's element. Gear a trip finds here (the Ancient vault, the lost cache) is Mire gear, shards found here are Mire shards, and it has the biggest rarer-catch push. Its journal set is the Peat Notes, four pages, so its pages come around as often as any place's do.

### Mood and climate

- **Mood** (draft): still, damp and patient, with a little gold in it.
- **Climate** `(compendium detail, not shipped)`: a flat bog under pale mist at dusk. The air is cool and damp and smells of peat and rain. Sound carries a long way over it and then stops.

### Banner art brief `(content: destinations.json)`

- **Scene:** "A flat bog at dusk under pale mist: pools of black water with an oily sheen, banks of peat and ochre reeds, a half-sunk cart wheel and signpost, and a half-sunk stone arch at the far end."
- **Palette:** Peat brown `#5b4630`, Tar black `#1f1a26`, Ochre reed `#c49a3c`, Fen mist `#b9b49a`.
- **Details:** an oily rainbow sheen drifting on the black pools; a half-sunk cart wheel, a leaning signpost and a stone arch: things the bog kept; clusters of cattail reeds, their dark heads against the pale mist.
- **Never:** bright sunshine or loud colours; any creature drawn in the scene.
- **Drawn:** `apps/activity/src/sprites/data/mire-banner-sprites.ts` (64 by 24).

### Residents

| Creature | Rarity | Note                            |
| -------- | ------ | ------------------------------- |
| Mudlump  | Common | Mire line, guard `(content)`.   |
| Squelch  | Common | Mire line, support `(content)`. |

Old Bogback, the raid boss, is the fen's oldest creature, and the Bog Toad, Tar Leech and Fen Lurker are the dungeon's smaller kin. `(content: bosses.json, dungeon-foes.json; the kinship is compendium detail, not shipped)`

### Push-on flavour `(compendium detail, not shipped)`

| Goal                 | Place flavour                                                                  |
| -------------------- | ------------------------------------------------------------------------------ |
| Linger a while       | A bubble rises from the black water, and then another, slowly.                 |
| Forage around        | Reed roots, peat bricks and a few smooth stones the mud has polished.          |
| Take field notes     | Write down where the ground holds and where it lets go.                        |
| Scout ahead          | A boardwalk of old planks, half sunk, leads on. A pack sits on the last one.   |
| Take the shortcut    | A narrow bank between two pools, with prints that were not there a moment ago. |
| Open the lost cache  | A tin box furred with moss and closed tight, marked with a small round seal.   |
| Press deeper         | Past the last reed the mist thickens, and the ground begins to hum.            |
| Break into the vault | A stone arch half sunk in the fen, with a lantern still burning under it.      |

### Journal pages set here `(content: journal.json)`

| Page                                  | Set            |
| ------------------------------------- | -------------- |
| What the bog keeps (`fen-old-things`) | The Peat Notes |
| Slow ground (`fen-slow-ground`)       | The Peat Notes |
| Damp and gas (`fen-damp-and-gas`)     | The Peat Notes |
| The patient ones (`fen-patient-ones`) | The Peat Notes |

### Sensory details `(compendium detail, not shipped)`

- A soft squelch with every step, and the pop of a bubble a moment after.
- Oil on the water, turning blue, green and violet as the light moves.
- The smell of peat, wet leaves and, very faintly, something that could catch fire.
- Cattails ticking against each other in a wind you cannot feel.

### Story hooks `(compendium detail, not shipped)`

- The bog keeps old things, so every old thing in the game could have passed through it. The half-sunk arch at the right of the banner is a door. Where does it lead? See T32 in `threads.md`.
- The wheel was never the whole world: this is the place where the explorers first drew a chord across the loop. See `world.md`.
- Old Bogback is "older than its name". Who named the fen?

---

## Daily dungeon

The daily dungeon is a place, not a destination. It has no banner, no push-on goals and no entry in `destinations.json`. It is one run a day, with a team of three, through three rooms `(content: glossary.json "dungeon"; design: daily-dungeon.md)`.

**Element:** none. Each room has its own element and its own foe. **Access:** once a day. **Residents:** the eight dungeon foes and the four floor bosses, all in `dungeon.md`.

### Mood and climate

- **Mood** `(compendium detail, not shipped)`: quiet and damp, with a sense that something is about to change. Each room is a different weather inside one old place.
- **Climate** `(compendium detail, not shipped)`: no sky. Each room is set by its modifier (see `dungeon.md`), so the climate changes from room to room and from day to day.

### Banner art brief `(compendium detail, not shipped)`

There is no banner in the data. This is the proposed brief.

- **Scene:** a stone stair going down into the dark, with a small lantern on the first step and the four element colours faintly on the walls, one wall for each element.
- **Palette:** deep slate `#2b2d3a`, lantern gold `#f2b84b`, moss `#4f8a3c`, tide `#2a9d9a`, spark `#f6e05e`.
- **Never:** a creature drawn in the banner.

### Residents

See `dungeon.md`: foes, floor bosses and the room modifiers as in-world phenomena.

### The Crystal Hollow `(compendium detail, not shipped)`

A small, common place inside the dungeon, met as a mystery room. A nook whose walls and floor are covered in pale blue crystals that hum quietly, kin of the Blue Chasm's. See `dungeon.md` "Crystal Hollow".

### The Blue Chasm `(compendium detail, not shipped)`

A rare place inside the dungeon, met as a mystery room. A bottomless gap with pale blue crystals lining its walls, crossed by one narrow wooden plank, and a treasure on the far side. It is lit only by the crystals. See `dungeon.md` "Blue Chasm".

### Push-on flavour

Not applicable. The dungeon has no trips and no push-on goals.

### Journal pages set here

None. The journal belongs to expeditions. A dungeon journal could be a new set (see `threads.md`, T16).

### Sensory details `(compendium detail, not shipped)`

- A drip of water, and the hum of sparks in one room.
- Warm stone and the smell of wet moss.
- A flicker of lantern light on the walls.
- The quiet before the floor boss, and then its heavy step.

### Story hooks `(compendium detail, not shipped)`

- The Drowned Warden "opens its own gates for you instead" `(content: dungeon-foes.json)`. The warden is the dungeon's friend. (See `threads.md`, T10.)
- The landmark depths, every seventh one, pay a guaranteed gear drop `(content: glossary.json "landmark")`. What is at a landmark? (See `threads.md`, T15.)
- The dungeon's modifiers are the same for everyone on the server each day `(content: glossary.json "room-modifiers")`. Someone must set them.

### Former player text (glossary)

None. The dungeon's glossary entries (`dungeon`, `dungeon-row`, `depth`, `room-modifiers`, `floor-boss`, `landmark`, `streak` and the modifiers) are not destination entries. They are not moved, and they stay in `glossary.json`.

## The living room

Status: shipped 2026-10-14. Design: `docs/design/living-room.md` `(design)`.

- **What it is.** The cozy room where creatures rest between jobs: a band at the top of the Activity on a wide window, and on a phone the top of the **Home** page, the gold middle button of the bottom menu (since 2026-10-24; it was a Lounge button and sheet for a few hours before) `(content: tabs.ts NAV_HOME)`. Tapping a creature there shows its info, with the "First on server" tag when its owner holds that record. Each player present has one lounger there `(design)`. It is not a destination: nothing is caught or spent in it. Since 2026-10-20 a creature lounging in good company (another player there too) slowly gains experience, up to a daily limit, after which it is Rested `(design: living-room.md, "Lounging with company")`.
- **Furniture, left to right.** A curtained window with a sill and a floor cushion; a red couch under a landscape picture; a table with two chairs and a stool; a stone fireplace on a patterned rug with a pouf and a potted plant; a bookshelf with a lamp, a wall clock and a beanbag `(content: apps/activity/src/sprites/data/room-sprites.ts)`.
- **Time of day.** The room follows the server's clock: daylight through the window by day, an orange and pink sky at dawn and dusk, the moon and lamplight at night. Night is the same hours as the Moonlit Reef's `(design)`. The fire is always lit `(content: room-sprites.ts)`.
- **Who lounges.** A creature does one thing at a time ("creature permanence", Misa's term): one away on an expedition or busy at the workshop cannot lounge. Raiders can, since the raid is a weekly event, not a job `(design)`. When all of a player's creatures are busy, their spot shows a note on a cushion: "all out working" `(content: room-view.ts)`.
- **Bubble lines.** Short, warm, lowercase, a few characters each: emotes (♪, zzz, !, ..., ?, ♥, hehe) and two-word comforts ("cozy", "warm here", "nice rug", "so snug", "snooze", "tea time", "good fire") `(content: apps/activity/src/room-bubbles.ts)`. New lines should stay as short and as gentle; no jokes at a player's expense, no game advice.
- **Name.** "The living room" for now. A world name (a hearth, a den) is an open seed: if one is chosen, record it here and in `threads.md` `(compendium detail, not shipped)`.

---

## Concept places (not shipped)

Places below are ideas with art, not content. They are not in `destinations.json`, so the compendium test does not check them. They carry no numbers or rules.

## The Quiet Verge (working name)

**Concept, not shipped (2026-10-31).** Asked by Misa: "design a Void area that can be explored". Art: `apps/activity/src/sprites/concepts/void-place.ts` (two banners, set `void-place`, catalogue in `docs/art/README.md`). Misa may rename it; other names tried: the Hush, the Dim Meadow, Night's Edge. Everything here is `(compendium detail, not shipped)`.

**Element:** Void (see `world.md`, "Void"). **Residents:** void-guard and void-setter (common), void-support (rare), void-payoff (deep) `(concept codes; the creatures have no names yet)`. **Deeper area:** the Far Side.

**Flavour line (draft):** "The edge of the map, where the night sky carries on underneath."

### Access idea

A late place, like the Moonlit Reef, but with its own door. The Old Crossroads signpost has four arrows; at dusk a fifth shadow lies across the ground where no arrow points `(see T12)`. Only explorers who have been to the Crossroads and carry a light of their own (the Moon Lantern is the natural key, see T13) can follow it. It is open in the dark hours, as the Reef is, so the two night places need a choice between them. Whether it is also a rank gate, and whether the door is every night or only some, is for Misa to decide.

### Mood and climate

- **Mood** (draft): hushed, spacious and a little lonely, with warmth at the edges. Not scary: the dark here is kind, like a blanket.
- **Climate**: cool, dry and perfectly still, a night with no wind. The air tastes faintly of cold metal and rain that has not fallen yet. Sound does not echo; it simply stops.

### Banner art brief

- **Scene:** "A dusk plain of pale lilac dust under a sky that goes dark early: a still pool that holds the stars like a window, three leaning standing stones, a dark moon with a bright rim, and a stone arch at the far end with one warm star inside it."
- **Palette:** Dusk sky `#262050`, Lilac dust `#6f62b8`, Window dark `#100c22`, Warm star `#fff1b8`. Accents: pale rim `#c5bdee`, cool glint `#9fe8ff`.
- **Details:** every dark thing has a light edge, so nothing disappears into the night panel; small stone chips floating just above the ground; the pool and the arch are the two "windows"; the lower strip is calm dust for the explorer to walk on, left to right. An alternative, "window open", warms the sky to plum and the stars to gold, for a festival or a special night.
- **Never:** true black fields; any creature drawn in the scene; anything with teeth or eyes in the dark.
- **Drawn (concept):** `void-place-banner` (the main banner) and `void-place-deep` (the Far Side: the ground ends, flat stones cross open sky, one great ring with a warm star at its middle hangs ahead).

### Residents

| Creature (concept code) | Rarity | Note                                                                                              |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| void-guard              | Common | The eclipse hood. Shelters under the standing stones.                                             |
| void-setter             | Common | The star-feeler wisp. Drifts over the pool and points at whatever is nearest, then marks it.      |
| void-support            | Rare   | The little planet with two moons. Seen at the arch, lifting a smaller creature up to look inside. |
| void-payoff             | Deep   | The night lynx. Only on the Far Side, where its ears fill with stars.                             |

### Journal page drafts

| Page                 | Draft text                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| The fifth shadow     | There are four arrows on the signpost, and one shadow with no arrow. At dusk it points the way.        |
| What the pool keeps  | The still pool does not show your face. It shows the sky you walked under last night, with you in it.  |
| A window to hold     | Every creature here carries a small window. Look in and you will see one warm star, and it looks back. |
| The stones that wait | The stepping stones on the Far Side never move. They only seem to, when you are not looking.           |

### Push-on flavour

| Goal                 | Place flavour                                                                      |
| -------------------- | ---------------------------------------------------------------------------------- |
| Linger a while       | One small light drifts over the pool and does not seem to be going anywhere.       |
| Forage around        | Cold pebbles that hold a little light, and dust that sparkles when you blow on it. |
| Take field notes     | Sketch the standing stones and note which way each one leans.                      |
| Scout ahead          | A lantern hangs from a stone, still lit, with a pack tucked underneath.            |
| Take the shortcut    | A line of flat stones across the dark. The gaps are wide. The stones are patient.  |
| Open the lost cache  | A box of grey stone with a star cut into the lid, warm to the touch.               |
| Press deeper         | Past the last standing stone the ground ends, and the stars begin below your feet. |
| Break into the vault | The arch with the warm star in it. It is not a door until you step into it.        |

### Sensory details

- A silence so complete you can hear your own lantern.
- Cold air, no wind, and the smell of metal and distant rain.
- Dust that glitters like frost and does not melt.
- A soft light from below, from the pool, that makes every shadow lean upward.

### Story hooks

- The fifth shadow at the Crossroads: where do the four roads go? Perhaps one of them is the night's, and the signpost never had room for it. See T12.
- The half-sunk arch in the Sunken Fen and the standing arch here look like the same stonework. Is the bog's door the Verge's door seen from the other side? See T32 and T11 (the old symbol).
- The Moon Lantern "shows the hidden places' doors" `(content: supplies.json)`. This is what it was made to find. See T13.
- Solmane is a little afraid of the dark and walks into it to light the way for others `(T04)`. A Solmane that comes back from the Far Side, unafraid, would answer that.
- Something sings across the water at the Reef `(T01)`. Here, at the great ring, something answers.
- The payoff lynx and the support planet share one window each: where did the first window come from? No one here will say.

### Items and content needed to ship

Void element (chart, marks), four named creatures with stats and lore, a destination entry (flags for access and night), the two banners moved into `data/`, journal pages, push-on text, a glossary entry, and an entry in the weekly rotation. Listed in the set's `notes`.
