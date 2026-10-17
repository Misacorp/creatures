# Items: gear, supplies, parts and blueprints

Status: 2026-10-17 (gear v2, base stats and local lines). Flavour only. The numbers and rules live in `RULES` and the data files, not here.

Read `README.md` for the tags. Flavour lines quoted below are shipped text. Who makes each object, and where it comes from, is `(compendium detail, not shipped)` unless the source says so.

**Source of truth:** `gear.json` (bases), `gear-lines.json` (lines), `supplies.json` (supplies), `glossary.json` (parts, blueprints, the Workshop and jobs), and `docs/design/gear-and-creatures-v2.md` (the design; `gear.md` is the first version). Where the design and the data differ, see `README.md`, contradictions 9, 10 and 12.

## The world of things

Items come from three places in the world. Explorers find them on trips. Creatures make them in the Workshop, slowly, while the explorer is away. And the Festival gives out its own pieces. `(content: glossary.json "workshop", "gear", "job-craft"; design: gear.md)`

- **Gear** is worn by one creature at a time: a Hat, a Scarf and a Charm. Each item has lines that add to the creature's strength, its toughness, its reactions or its trips. `(content: glossary.json "gear")`
- **Supplies** are for one trip: a lure, a map, a lantern or a satchel. `(content: glossary.json "supplies")`
- **Parts** are the raw material: scrap, element shards and glimmer. `(content: glossary.json "part-*")`
- **Blueprints** teach a creature how to craft one kind of item. You learn each one once. `(content: glossary.json "blueprint")`

**Compendium detail, not shipped** (where things come from, by element): the Tide makers work with shell, kelp and seawater. The Ember makers are forge-folk who work near the caves. The Grove makers are woodfolk of the Hollow, who use bark and moss. The Spark makers use glass, copper and storm-charged bead. Neutral pieces are made in camp by explorers themselves.

---

## Gear bases

Forty-two bases in three slots. Hats and Scarves come in three makes for neutral and for each element (fifteen of each slot), unlocked at item levels 1, 5 and 10: a plain one, a better one and a fine one, each a fixed set of **base stats** (a Hat leans to Attack and carries some HP, a Scarf leans to HP and carries a little Attack; the finer Hats and some Scarves also carry crit chance or crit damage). Charms have no stats: each has one fixed line (its base line, bigger on higher item levels), and there is a Compass for explorers and four Charms made for one role each. Two Festival pieces complete the list. `(content: gear.json)` The rest of an item is rolled from the lines in `gear-lines.json`. The line names are the glossary's.

| Name                   | Slot  | Tag      | Base stats or line                  | From item level | Flavour `(content)`                                                        |
| ---------------------- | ----- | -------- | ----------------------------------- | --------------- | -------------------------------------------------------------------------- |
| Trail Cap              | Hat   | Neutral  | 2 Attack, 4 HP                      | 1               | "A knotted cap every explorer ties before the first long walk."            |
| Felt Hat               | Hat   | Neutral  | 12 Attack, 24 HP                    | 5               | "Pressed felt, a little stiff, and it keeps its shape in any weather."     |
| Wayfarer's Hood        | Hat   | Neutral  | 24 Attack, 48 HP, 2 pt crit chance  | 10              | "A deep hood for long roads, made by someone who walked a great many."     |
| Kelp Cap               | Hat   | Tide     | 2 Attack, 4 HP                      | 1               | "Woven from kelp that moves as if the tide were still in."                 |
| Brine Hood             | Hat   | Tide     | 12 Attack, 24 HP                    | 5               | "A salt-stiff hood that smells of the harbour and never quite dries."      |
| Tidecaller's Crown     | Hat   | Tide     | 24 Attack, 48 HP, 2 pt crit chance  | 10              | "A crown of shell and driftwood. The sea answers when it is worn."         |
| Coal-Warm Cap          | Hat   | Ember    | 2 Attack, 3 HP                      | 1               | "Kept by a forge fire until it forgot how to be cold."                     |
| Forge Hood             | Hat   | Ember    | 14 Attack, 19 HP, 1 pt crit chance  | 5               | "A heavy hood singed at the edges, from standing too near the anvil."      |
| Emberkeeper's Crown    | Hat   | Ember    | 28 Attack, 38 HP, 20 pt crit damage | 10              | "Iron and cinder-glass, worn by those who tend the oldest fires."          |
| Acorn Cap              | Hat   | Grove    | 1 Attack, 5 HP                      | 1               | "A real acorn cap, a size too big, and very proud of it."                  |
| Bark Hood              | Hat   | Grove    | 9 Attack, 33 HP                     | 5               | "Stitched from bark strips that creak softly when the wind turns."         |
| Greenwarden's Crown    | Hat   | Grove    | 19 Attack, 67 HP, 2 pt crit chance  | 10              | "A ring of living branches that was never once cut from its tree."         |
| Thundercap             | Hat   | Spark    | 2 Attack, 3 HP                      | 1               | "Crackles when you rub it on wool, and sometimes when you don't."          |
| Static Hood            | Hat   | Spark    | 12 Attack, 19 HP, 2 pt crit chance  | 5               | "Its lining is copper wire, and your hair stands up when you wear it."     |
| Storm Cowl             | Hat   | Spark    | 24 Attack, 38 HP, 3 pt crit chance  | 10              | "A cowl woven with lightning-struck thread. It hums before a storm."       |
| Patch Scarf            | Scarf | Neutral  | 12 HP, 1 Attack                     | 1               | "Mended so often that it is mostly patches, and tougher for it."           |
| Woolen Wrap            | Scarf | Neutral  | 70 HP, 5 Attack                     | 5               | "A thick wrap, knitted in the long evenings, warm to the very end."        |
| Traveller's Mantle     | Scarf | Neutral  | 150 HP, 12 Attack                   | 10              | "A long mantle that has seen every road, and mended every one of them."    |
| Seafoam Scarf          | Scarf | Tide     | 12 HP, 1 Attack                     | 1               | "Light as foam, and it keeps a little pool of seawater in its folds."      |
| Brine Shawl            | Scarf | Tide     | 70 HP, 5 Attack                     | 5               | "A shawl that holds the sea in its weave and keeps the cold out."          |
| Tidewarden's Mantle    | Scarf | Tide     | 150 HP, 12 Attack                   | 10              | "A mantle for those who guard the shore, heavy with sea-salt and pride."   |
| Ember Muffler          | Scarf | Ember    | 12 HP, 1 Attack                     | 1               | "Hammered soft on a forge that was left running overnight."                |
| Forge Scarf            | Scarf | Ember    | 70 HP, 5 Attack                     | 5               | "A scarf of quenched wool, tough as a smith and just as quiet."            |
| Emberkeeper's Mantle   | Scarf | Ember    | 150 HP, 12 Attack                   | 10              | "A mantle that stays warm all night, long after the fire is out."          |
| Leafknit Scarf         | Scarf | Grove    | 14 HP, 1 Attack                     | 1               | "Soft with moss, and a small fern grows from it in spring."                |
| Bark Shawl             | Scarf | Grove    | 84 HP, 2 Attack                     | 5               | "A shawl lined with moss and bark. Soft inside, stubborn outside."         |
| Greenwarden's Mantle   | Scarf | Grove    | 180 HP, 6 Attack                    | 10              | "A mantle that grows a little each spring, and shelters whoever wears it." |
| Static Wrap            | Scarf | Spark    | 11 HP, 1 Attack                     | 1               | "A copper thread wound through the wool taps out a rhythm."                |
| Copper Wrap            | Scarf | Spark    | 66 HP, 5 Attack, 1 pt crit chance   | 5               | "A wrap threaded with copper. It taps along to your footsteps."            |
| Stormcaller's Mantle   | Scarf | Spark    | 142 HP, 12 Attack, 2 pt crit chance | 10              | "A mantle that crackles in the dry air. Thunder waits just behind it."     |
| Festival Hearth Scarf  | Scarf | Ember    | 12 HP, 1 Attack, Hearth warmth      | 1               | "A warm scarf given to everyone who stood by the Festival hearth."         |
| Trail Charm            | Charm | Neutral  | Creature Attack                     | 1               | "A knotted cord every explorer ties before the first long walk."           |
| Tidepool Charm         | Charm | Tide     | Tide Attunement                     | 1               | "A shell that keeps a little pool of seawater in it, always."              |
| Cinder Charm           | Charm | Ember    | Ember Attunement                    | 1               | "A coal that stays warm in the coldest pocket."                            |
| Mossy Charm            | Charm | Grove    | Grove Attunement                    | 1               | "Soft with moss, and a small fern grows from it in spring."                |
| Static Charm           | Charm | Spark    | Spark Attunement                    | 1               | "Crackles when you rub it on wool, and sometimes when you don't."          |
| Crossroads Compass     | Charm | Explorer | Trail XP                            | 1               | "Its needle points at the four roads, and sometimes at a fifth."           |
| Warden's Bell          | Charm | Guard    | Armor                               | 1               | "Rung once at the gate, so everyone behind it knows who stands there."     |
| Hearth Bell            | Charm | Support  | Boost                               | 1               | "A small brass bell that sounds like supper being ready."                  |
| Footprint Charm        | Charm | Setter   | Marking hit                         | 1               | "A clay print of a paw that was always the first one there."               |
| Pounce Charm           | Charm | Payoff   | Payoff's pounce                     | 1               | "A claw on a string, tied tight, and itching to be used."                  |
| Festival Lantern Charm | Charm | Tide     | Tide Attunement, Lantern luck       | 1               | "A paper lantern charm, lit once a season at the Festival of the tide."    |

**Gear slots, rarities and tags (content):** hat, scarf and charm; common, rare and epic (Festival is a kind of piece, not a rarity); neutral, an element, explorer, or a role (only Charms are made for a role).

**Compendium detail, not shipped** (who makes each kind):

- _The neutral pieces and the Trail Charm:_ camp-knots, made by explorers before a trip. The Patch Scarf is what a worn scarf looks like after a long career.
- _The Tide pieces:_ shell, kelp and seafoam, from the shore. _The Ember pieces:_ coal, forge metal and warm wool from the caves. _The Grove pieces:_ moss, acorn and leaf-knit from the Hollow. _The Spark pieces:_ copper, glass and storm bead from the Ridge.
- _The Crossroads Compass:_ the cartographers' own, found on the roads out of the Old Crossroads. The four role Charms are older: each was made for one kind of creature by someone who watched them work, which is why only that kind of creature can wear one.
- _The Festival pieces:_ given out at the Festival. Festival gear is "won by clearing a Festival finale" and "cannot be crafted"; it is special, not stronger: its level and rarity follow the same odds as any finale piece, and what it has of its own is one fixed Festival line (Hearth warmth on the scarf, Lantern luck on the charm), a short list of lines to roll and a lantern-gold look `(content: glossary.json "gear-festival")`. The Lantern Charm is lit once a season. The Hearth Scarf is given to everyone who stood by the Festival hearth.
- _The finer makes:_ the plain Hat or Scarf is what a maker turns out in an afternoon; the better and the fine ones are what the same maker turns out after years at the bench (the Brine Hood and the Forge Scarf are second-year work, the crowns and mantles are master work). A crown or a mantle never improves a plain piece: it is simply a different, grander piece of the same kind `(compendium detail, not shipped)`.
- _The Cap and Scarf makers' tags:_ an Ember piece is warmer to the touch, a Tide piece damp at the edges, a Grove one a little green, a Spark one a little static. That is why the tag matters.

**What the old gear became.** The charms, bands and trinkets of the first version were converted when gear changed (2026-10-16): an Attack or crit piece became a Hat, an HP piece a Scarf, a speed piece a Charm, with the same tint. The enchants were taken back by their teachers and the materials returned `(compendium detail, not shipped; design: gear-and-creatures-v2.md section 12)`.

## Gear lines

Every item has its fixed base (stats for a Hat or a Scarf, a base line for a Charm; a Festival piece also has its Festival line) and 1 to 3 rolled lines. The lines are in `gear-lines.json`; each has five tiers and a short line of text `(content)`. Names: the lines of the item itself, which read "(this item)" on a card (Attack as a share and as a flat amount, HP as a share and as a flat amount, and the crit chance and crit damage of the item as a share), Creature Attack and Creature HP (rare, Charms only), Crit chance, Crit damage, All damage taken, Area ward, Aimed ward, Well-fed, the four Attunements (Tide, Ember, Grove, Spark), the four Hunters, the four reaction bonuses (Steam, Wildfire, Grounding, Overload), the four Wards, Armor, Cover, Boost, Mend, Spark-share, Marking hit, Payoff's pounce, Strike, Lingering, Marked foe, First pounce, Owner's mark, Backdraft ward, Keen reaction, Adaptation pierce, Unbothered, Brace, Guard's shadow, Trail XP, Quick feet, Keen nose, Lucky find, Packer, Busy paws, Apprentice, Between-room rest, and the two Festival lines (Hearth warmth, Lantern luck).

**Compendium detail, not shipped:** the lines are what the makers whisper to a piece as it is finished. A Hunter is a promise to find a certain kind of foe; a Ward is a promise never to be found by one. A Guard's shadow is the oldest line of all: it is simply the warmth of standing near someone steady. The "(this item)" lines are different: they are not whispered to the creature at all, only to the piece, which is why they make that piece bigger and nothing else.

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

**Lures are the one supply made from Bait** (and a little scrap), since 2026-10-16: Bait's two jobs are treats, which grow creatures, and lures, which find them. A trip no longer always brings a creature; a lure raises the chance that it does, and the chance that the creature is a species the player does not have yet, the better tiers more. Lures are crafted only: trips and the dungeon do not drop them, and rank gifts give the lure tiers of old supplies as map scraps and satchels instead. `(content: supplies.json, glossary.json "supply-lure"; design: gear-and-creatures-v2.md 9.5)`

## Parts

Parts are the raw material. They pay for crafts. `(content: glossary.json "part-*")`

| Part        | Shipped text `(content)`                                                                                                                 | In-world flavour `(compendium detail, not shipped)`                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Scrap       | "Generic parts. They pay for crafting." Found by dismantling gear, on expeditions, in cleared raid phases and in the daily dungeon.      | The everyday leftovers of any explorer's kit.                                           |
| Tide Shard  | "A shard of Tide. It pays for Tide crafts."                                                                                              | A shard of the tide, which keeps some of the water's pull.                              |
| Ember Shard | "A shard of Ember. It pays for Ember crafts."                                                                                            | A shard of the forge, still warm.                                                       |
| Grove Shard | "A shard of Grove. It pays for Grove crafts."                                                                                            | A shard of heartwood, slow and steady.                                                  |
| Spark Shard | "A shard of Spark. It pays for Spark crafts."                                                                                            | A shard of the storm, still a little charged.                                           |
| Glimmer     | "A rare part. Epic gear and dungeon landmarks give it." Found by dismantling Epic gear, at dungeon landmarks, and rarely on expeditions. | The rarest part. It is bright and small, and the explorers who find it are proud of it. |

## Blueprints

A blueprint teaches a creature to craft one kind of item. You learn each one once. A blueprint you already know is not wasted: each repeat find makes it **well-thumbed**, up to ten marks, and each mark helps the next crafts of that item come out a rarity better (at ten marks a repeat find turns into scrap) `(content: glossary.json "blueprint", "well-thumbed")`. A creature taking an item apart can find the item's blueprint in its working notes, or thumb the one you already own `(content: glossary.json "job-dismantle")`.

Sources: expeditions (more often on long ones, and some push-on rewards), the welcome kit, a won finale's reward slot (sometimes a blueprint instead of gear), and taking an item apart in the Workshop `(content: glossary.json; design: gear-and-creatures-v2.md section 3)`. The dungeon and Festivals do not grant blueprints. See `README.md`, contradiction 10 (resolved).

**Compendium detail, not shipped** (in-world): a blueprint is a folded sheet of crafting notes, written in a hand that is neat, dry and a little impatient. Someone wrote them down for the next explorer. The writer is an open thread (see `threads.md`). The **Lost Pages** journal set `(content: journal.json)` might be the same hand.

## The Workshop and the jobs

The Workshop is where creatures work while the explorer is away. There are two job slots at the start `(content: glossary.json "workshop")`. A creature on a job cannot go on a trip, and the other way round. A creature on a job still fights in raids `(content)`.

| Job            | Shipped text `(content)`                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Craft          | Makes a new item from a blueprint you know. Takes 3 hours and makes a Common. The parts are paid when the job starts. The item is rolled when you claim it. Reach for a Rare or an Epic costs more and takes longer.                          |
| Reach          | Essence (and a glimmer for an Epic) on top of a craft for a chance at a Rare or an Epic. Rare needs Crafting level 3, Epic level 6. The odds are shown first; there are no rerolls.                                                           |
| Dismantle      | A creature takes items apart: Commons in bundles of up to 5 in 15 minutes, a Rare in an hour, an Epic or a Festival piece in two. The refund is a range, a fraction of what the craft cost, rolled at the claim, the same for every creature. |
| Craft supplies | Makes supplies for expeditions. Costs scrap, and shards for the better tiers. One supply per job.                                                                                                                                             |

**Compendium detail, not shipped** (in-world): a job is a creature's slow, patient work. The Workshop smells of hot metal, wet wool and pine. Creatures work at their own pace. The explorer comes back to a finished thing.

### Crafting skill

The Crafting skill grows slowly, each time a creature finishes a job. Each level makes jobs a little shorter and gives a small chance of a better craft. It never changes how a creature fights `(content: glossary.json "skill-crafting")`.

**Compendium detail, not shipped** (in-world): Crafting is an apprenticeship. A creature is not a fighter at the Workshop; it is a trainee. A creature that has learned to craft has a little of the teacher's manner. This is a good place for a quirk line such as "Cindle kept the forge too hot" `(design: gear.md, the example line)`.

## Festival items

- **Festival Lantern Charm** (Tide, festival): "lit once a season at the Festival of the tide."
- **Festival Hearth Band** (Ember, festival): "given to everyone who stood by the Festival hearth."

Festival gear is epic-power with a look of its own, and it has no extra power over Epic gear `(content: glossary.json "gear-rarity-festival")`. Use it for cosmetic flavour and for Festival stories, not for power.
