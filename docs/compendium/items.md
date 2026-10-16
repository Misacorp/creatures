# Items: gear, enchants, supplies, parts and blueprints

Status: 2026-10-13. Flavour only. The numbers and rules live in `RULES` and the data files, not here.

Read `README.md` for the tags. Flavour lines quoted below are shipped text. Who makes each object, and where it comes from, is `(compendium detail, not shipped)` unless the source says so.

**Source of truth:** `gear.json` (bases), `enchants.json` (enchants), `supplies.json` (supplies), `glossary.json` (parts, blueprints, the Workshop and jobs), and `docs/design/gear.md` (the design). Where the design and the data differ, see `README.md`, contradictions 9, 10 and 12.

## The world of things

Items come from three places in the world. Explorers find them on trips. Creatures make them in the Workshop, slowly, while the explorer is away. And the Festival gives out its own pieces. `(content: glossary.json "workshop", "gear", "job-craft"; design: gear.md)`

- **Gear** is worn by one creature at a time. It is a charm, a band or a trinket, and it adds to the creature's strength or its crits. `(content: glossary.json "gear")`
- **Enchants** are a second layer on a piece of gear: one effect for one kind of creature. `(content: glossary.json "enchant-*")`
- **Supplies** are for one trip: a lure, a map, a lantern or a satchel. `(content: glossary.json "supplies")`
- **Parts** are the raw material: scrap, element shards and glimmer. `(content: glossary.json "part-*")`
- **Blueprints** teach a creature how to craft one kind of item. You learn each one once. `(content: glossary.json "blueprint")`

**Compendium detail, not shipped** (where things come from, by element): the Tide makers work with shell, kelp and seawater. The Ember makers are forge-folk who work near the caves. The Grove makers are woodfolk of the Hollow, who use bark and moss. The Spark makers use glass, copper and storm-charged bead. Neutral pieces are made in camp by explorers themselves.

---

## Gear bases

Nineteen bases: five neutral, three per element tint, and two Festival pieces. `(content: gear.json)` Each has a main stat that it adds to. The stat names are the glossary's: Attack, HP, speed, crit chance and crit damage.

| Name                   | Kind    | Main stat   | Tint    | Rarity   | Flavour `(content)`                                                     |
| ---------------------- | ------- | ----------- | ------- | -------- | ----------------------------------------------------------------------- |
| Trail Charm            | Charm   | Attack      | Neutral | Common   | "A knotted cord every explorer ties before the first long walk."        |
| Patch Band             | Band    | HP          | Neutral | Common   | "Mended so often that it is mostly patches, and tougher for it."        |
| Quick Trinket          | Trinket | Speed       | Neutral | Common   | "A tiny bell that never rings but somehow makes feet lighter."          |
| Fortune Charm          | Charm   | Crit chance | Neutral | Rare     | "Found in the pocket of a coat nobody remembers owning."                |
| Keen Trinket           | Trinket | Crit damage | Neutral | Rare     | "A bright sliver of something sharp, wrapped in thread."                |
| Tidepool Charm         | Charm   | HP          | Tide    | Common   | "A shell that keeps a little pool of seawater in it, always."           |
| Wave Band              | Band    | Speed       | Tide    | Rare     | "Woven from kelp that moves as if the tide were still in."              |
| Pearl Trinket          | Trinket | Attack      | Tide    | Epic     | "A pearl that hums quietly whenever a storm is far away."               |
| Cinder Charm           | Charm   | Attack      | Ember   | Common   | "A coal that stays warm in the coldest pocket."                         |
| Forge Band             | Band    | HP          | Ember   | Rare     | "Hammered flat on a forge that was left running overnight."             |
| Phoenix Trinket        | Trinket | Crit damage | Ember   | Epic     | "A single feather that is a little too hot to hold for long."           |
| Mossy Charm            | Charm   | HP          | Grove   | Common   | "Soft with moss, and a small fern grows from it in spring."             |
| Bark Band              | Band    | Attack      | Grove   | Rare     | "A ring of bark that tightens a little when danger is near."            |
| Heartwood Trinket      | Trinket | HP          | Grove   | Epic     | "Carved from the oldest tree in the grove, which did not mind."         |
| Static Charm           | Charm   | Speed       | Spark   | Common   | "Crackles when you rub it on wool, and sometimes when you don't."       |
| Volt Band              | Band    | Crit chance | Spark   | Rare     | "A copper loop that taps out a rhythm against the wrist."               |
| Storm Trinket          | Trinket | Attack      | Spark   | Epic     | "A glass bead with a small thundercloud trapped inside."                |
| Festival Lantern Charm | Charm   | HP          | Tide    | Festival | "A paper lantern charm, lit once a season at the Festival of the tide." |
| Festival Hearth Band   | Band    | Attack      | Ember   | Festival | "A warm band given to everyone who stood by the Festival hearth."       |

**Gear kinds (content):** charm, band and trinket. **Rarities (content):** common, rare, epic and festival.

**Compendium detail, not shipped** (who makes each kind):

- _Trail Charm and the neutral charms:_ camp-knots, made by explorers before a trip.
- _Patch Band and Forge Band:_ mended bands. The Forge Band was "hammered flat" by a forge-folk. The Patch Band is what a worn band looks like after a long career.
- _The three Tide pieces:_ shell, kelp and pearl, from the shore.
- _The three Ember pieces:_ coal, forge metal and a phoenix feather from the caves.
- _The three Grove pieces:_ moss, bark and heartwood from the Hollow.
- _The three Spark pieces:_ copper, glass and storm bead from the Ridge.
- _The Festival pieces:_ given out at the Festival. Festival gear is "won by clearing a Festival finale, and crafted only from Festival blueprints" `(content: glossary.json "gear-rarity-festival")`. The Lantern Charm is lit once a season. The Hearth Band is given to everyone who stood by the Festival hearth.

## Enchants

Nine enchants. Each one goes on a piece of gear. An item has one enchant slot, and a new enchant replaces the old one `(content: glossary.json "enchant-*")`. Each enchant works for one kind of creature, except Steady Hand, which works for every creature `(content: enchants.json)`.

| Name            | Works for       | Adds        | Shard `(content)` | Flavour `(content)`                                           |
| --------------- | --------------- | ----------- | ----------------- | ------------------------------------------------------------- |
| Payoff's Edge   | Payoffs         | Attack      | Ember             | "Sharpens the moment a mark is cashed in."                    |
| Guard's Bulwark | Guards          | HP          | Grove             | "Roots the wearer to the spot, and the spot to the ground."   |
| Setter's Wit    | Setters         | Speed       | Tide              | "Always one step ahead of the mark."                          |
| Support's Grace | Supports        | HP          | Spark             | "Keeps the wearer on their feet so the team stays on theirs." |
| Spark Luck      | Spark creatures | Crit chance | Spark             | "Lightning likes to strike twice for its own."                |
| Ember Fury      | Ember creatures | Crit damage | Ember             | "Burns brightest on the hardest hit."                         |
| Tide Flow       | Tide creatures  | Speed       | Tide              | "Moves like water finding its way downhill."                  |
| Grove Hide      | Grove creatures | HP          | Grove             | "Bark grows thick where it is needed most."                   |
| Steady Hand     | Any creature    | Attack      | Tide              | "Nothing flashy, just a little more behind every hit."        |

**Compendium detail, not shipped** (who writes enchants): the Enchant is the Workshop's oldest craft, taught by the elders of each element. The enchant's name is the name of the teacher, which is why most of them are "Owner's Thing". Steady Hand is the only enchant with no teacher, and it is a common, honest craft.

**Enchant costs.** Glossary text names the costs (glimmer plus three shards, in each case) `(content: glossary.json)`. The costs are not in `enchants.json`. See `README.md`, contradiction 12.

## Supplies

Twelve supplies in four kinds, each in three tiers: basic, good and great. A trip carries up to two supplies, never two of the same kind `(content: glossary.json "supplies")`. Supplies cannot be bought. A run of the daily dungeon drops one, trips can find them, and the Workshop crafts the kind and tier a player wants `(content: glossary.json "supplies", "dungeon", "job-supply")`. The best tier of each kind always brings a choice at the end of the trip `(content)`.

| Kind      | Basic          | Good           | Great           | Flavour (basic, good, great) `(content)`                                                                                                                                             |
| --------- | -------------- | -------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lure      | Plain Lure     | Sweet Lure     | Golden Lure     | "A bit of dried fruit on a string. Better than nothing." / "Sticky and fragrant. Even shy creatures lean closer." / "It shines like honey in the sun. Rare creatures cannot resist." |
| Map scrap | Map Scrap      | Inked Map      | Trail Atlas     | "A torn corner with a few trails marked in pencil." / "A neat map with the good spots circled twice." / "Every path, pool and cave, drawn by someone who went there."                |
| Lantern   | Candle Lantern | Glow Lantern   | Moon Lantern    | "A small flame in a tin. It shows the next few steps." / "It glows steady and warm, even in the deepest corners." / "Lit by moonlight itself. The hidden places show their doors."   |
| Satchel   | Small Satchel  | Sturdy Satchel | Explorer's Pack | "Room for a few extra pebbles and berries." / "Plenty of pockets, and every one gets filled." / "Straps, pouches and hooks for everything worth carrying home."                      |

**Compendium detail, not shipped** (who makes them):

- _Lures:_ camp cooks, who know that a sweet smell reaches further than a good eye.
- _Map scraps:_ the cartographers of the Old Crossroads, who draw the four roads from the signpost.
- _Lanterns:_ lamp-makers who work by moonlight. The Moon Lantern is the one they are proudest of.
- _Satchels:_ the packers, who make a bag for anyone who walks.

Crafting a supply is a Workshop job. Basic supplies need the lowest Crafting level, and the great ones need the highest. `(content: glossary.json "job-supply")`

## Parts

Parts are the raw material. They pay for upgrades, crafts, improving and enchants. `(content: glossary.json "part-*")`

| Part        | Shipped text `(content)`                                                                                                                                    | In-world flavour `(compendium detail, not shipped)`                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Scrap       | "Generic parts. They pay for upgrades, crafting and improving." Found by dismantling gear, on expeditions, in cleared raid phases and in the daily dungeon. | The everyday leftovers of any explorer's kit.                                           |
| Tide Shard  | "A shard of Tide. It pays for Tide crafts and enchants."                                                                                                    | A shard of the tide, which keeps some of the water's pull.                              |
| Ember Shard | "A shard of Ember. It pays for Ember crafts and enchants."                                                                                                  | A shard of the forge, still warm.                                                       |
| Grove Shard | "A shard of Grove. It pays for Grove crafts and enchants."                                                                                                  | A shard of heartwood, slow and steady.                                                  |
| Spark Shard | "A shard of Spark. It pays for Spark crafts and enchants."                                                                                                  | A shard of the storm, still a little charged.                                           |
| Glimmer     | "A rare part. It pays for Epic crafts and every enchant." Found by dismantling Epic gear, at dungeon landmarks, and rarely on expeditions.                  | The rarest part. It is bright and small, and the explorers who find it are proud of it. |

## Blueprints

A blueprint teaches a creature to craft one kind of item. You learn each one once. A blueprint you already know turns into scrap `(content: glossary.json "blueprint")`.

Sources: expeditions (more often on long ones, and some push-on rewards) and the welcome kit `(content: glossary.json; design: gear.md, checked against the code)`. Raids, the dungeon and Festivals do not grant blueprints. See `README.md`, contradiction 10 (resolved).

**Compendium detail, not shipped** (in-world): a blueprint is a folded sheet of crafting notes, written in a hand that is neat, dry and a little impatient. Someone wrote them down for the next explorer. The writer is an open thread (see `threads.md`). The **Lost Pages** journal set `(content: journal.json)` might be the same hand.

## The Workshop and the jobs

The Workshop is where creatures work while the explorer is away. There are two job slots at the start `(content: glossary.json "workshop")`. A creature on a job cannot go on a trip, and the other way round. A creature on a job still fights in raids `(content)`.

| Job            | Shipped text `(content)`                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Craft          | Makes a new item from a blueprint you know. The parts are paid when the job starts. The item is rolled when you claim it. |
| Improve        | Re-rolls one extra stat of an item, for scrap. Needs a Rare or better item. The new stat can be better or worse.          |
| Enchant        | Adds an enchant to an item. Costs glimmer and shards. A new enchant replaces the old one.                                 |
| Craft supplies | Makes supplies for expeditions. Costs scrap, and shards for the better tiers. One supply per job.                         |

**Compendium detail, not shipped** (in-world): a job is a creature's slow, patient work. The Workshop smells of hot metal, wet wool and pine. Creatures work at their own pace. The explorer comes back to a finished thing.

### Crafting skill

The Crafting skill grows slowly, each time a creature finishes a job. Each level makes jobs a little shorter and gives a small chance of a better craft. It never changes how a creature fights `(content: glossary.json "skill-crafting")`.

**Compendium detail, not shipped** (in-world): Crafting is an apprenticeship. A creature is not a fighter at the Workshop; it is a trainee. A creature that has learned to craft has a little of the teacher's manner. This is a good place for a quirk line such as "Cindle kept the forge too hot" `(design: gear.md, the example line)`.

## Festival items

- **Festival Lantern Charm** (Tide, festival): "lit once a season at the Festival of the tide."
- **Festival Hearth Band** (Ember, festival): "given to everyone who stood by the Festival hearth."

Festival gear is epic-power with a look of its own, and it has no extra power over Epic gear `(content: glossary.json "gear-rarity-festival")`. Use it for cosmetic flavour and for Festival stories, not for power.
