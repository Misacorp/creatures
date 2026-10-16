# Items: gear, supplies, parts and blueprints

Status: 2026-10-16 (gear v2). Flavour only. The numbers and rules live in `RULES` and the data files, not here.

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

Twenty-two bases in three slots: a Hat, a Scarf and a Charm for neutral and each element, a Compass for explorers, four Charms made for one role each, and the Festival pieces. `(content: gear.json)` Every base has one fixed line (its base line, bigger on higher item levels); the rest of an item is rolled from the lines in `gear-lines.json`. The line names are the glossary's.

| Name                   | Slot  | Tag      | Base line         | Flavour `(content)`                                                                  |
| ---------------------- | ----- | -------- | ----------------- | ------------------------------------------------------------------------------------ |
| Trail Cap              | Hat   | Neutral  | Attack            | "A knotted cap every explorer ties before the first long walk."                      |
| Kelp Cap               | Hat   | Tide     | Attack            | "Woven from kelp that moves as if the tide were still in."                           |
| Coal-Warm Cap          | Hat   | Ember    | Attack            | "Kept by a forge fire until it forgot how to be cold."                               |
| Acorn Cap              | Hat   | Grove    | Attack            | "A real acorn cap, a size too big, and very proud of it."                            |
| Thundercap             | Hat   | Spark    | Attack            | "Crackles when you rub it on wool, and sometimes when you don't."                    |
| Patch Scarf            | Scarf | Neutral  | HP                | "Mended so often that it is mostly patches, and tougher for it."                     |
| Seafoam Scarf          | Scarf | Tide     | HP                | "Light as foam, and it keeps a little pool of seawater in its folds."                |
| Ember Muffler          | Scarf | Ember    | HP                | "Hammered soft on a forge that was left running overnight."                          |
| Leafknit Scarf         | Scarf | Grove    | HP                | "Soft with moss, and a small fern grows from it in spring."                          |
| Static Wrap            | Scarf | Spark    | HP                | "A copper thread wound through the wool taps out a rhythm."                          |
| Festival Hearth Scarf  | Scarf | Ember    | HP, Festival glow | "A warm scarf given to everyone who stood by the Festival hearth."                   |
| Trail Charm            | Charm | Neutral  | Attack            | "A knotted cord every explorer ties before the first long walk."                     |
| Tidepool Charm         | Charm | Tide     | Tide Attunement   | "A shell that keeps a little pool of seawater in it, always."                        |
| Cinder Charm           | Charm | Ember    | Ember Attunement  | "A coal that stays warm in the coldest pocket."                                      |
| Mossy Charm            | Charm | Grove    | Grove Attunement  | "Soft with moss, and a small fern grows from it in spring."                          |
| Static Charm           | Charm | Spark    | Spark Attunement  | "Crackles when you rub it on wool, and sometimes when you don't."                    |
| Crossroads Compass     | Charm | Explorer | Trail XP          | "Its needle points at the four roads, and sometimes at a fifth."                     |
| Warden's Bell          | Charm | Guard    | Armor             | "Rung once at the gate, so everyone behind it knows who stands there."               |
| Hearth Bell            | Charm | Support  | Boost             | "A small brass bell that sounds like supper being ready."                            |
| Footprint Charm        | Charm | Setter   | Marking hit       | "A clay print of a paw that was always the first one there."                         |
| Pounce Charm           | Charm | Payoff   | Payoff's pounce   | "A claw on a string, tied tight, and itching to be used."                            |
| Festival Lantern Charm | Charm | Tide     | Tide Attunement   | "A paper lantern charm, lit once a season at the Festival of the tide." (and a glow) |

**Gear slots, rarities and tags (content):** hat, scarf and charm; common, rare, epic and festival; neutral, an element, explorer, or a role (only Charms are made for a role).

**Compendium detail, not shipped** (who makes each kind):

- _The neutral pieces and the Trail Charm:_ camp-knots, made by explorers before a trip. The Patch Scarf is what a worn scarf looks like after a long career.
- _The Tide pieces:_ shell, kelp and seafoam, from the shore. _The Ember pieces:_ coal, forge metal and warm wool from the caves. _The Grove pieces:_ moss, acorn and leaf-knit from the Hollow. _The Spark pieces:_ copper, glass and storm bead from the Ridge.
- _The Crossroads Compass:_ the cartographers' own, found on the roads out of the Old Crossroads. The four role Charms are older: each was made for one kind of creature by someone who watched them work, which is why only that kind of creature can wear one.
- _The Festival pieces:_ given out at the Festival. Festival gear is "won by clearing a Festival finale, and crafted only from Festival blueprints" `(content: glossary.json "gear-rarity-festival")`. The Lantern Charm is lit once a season. The Hearth Scarf is given to everyone who stood by the Festival hearth.
- _The Cap and Scarf makers' tags:_ an Ember piece is warmer to the touch, a Tide piece damp at the edges, a Grove one a little green, a Spark one a little static. That is why the tag matters.

**What the old gear became.** The charms, bands and trinkets of the first version were converted when gear changed (2026-10-16): an Attack or crit piece became a Hat, an HP piece a Scarf, a speed piece a Charm, with the same tint. The enchants were taken back by their teachers and the materials returned `(compendium detail, not shipped; design: gear-and-creatures-v2.md section 12)`.

## Gear lines

Every item has its base line and 1 to 3 rolled lines (a Festival piece has 2 and its glow). The lines are in `gear-lines.json`; each has five tiers and a short line of text `(content)`. Names: Attack, Sturdy blow, HP, Thick coat, Crit chance, Crit damage, All damage taken, Area ward, Aimed ward, Well-fed, the four Attunements (Tide, Ember, Grove, Spark), the four Hunters, the four reaction bonuses (Steam, Wildfire, Grounding, Overload), the four Wards, Armor, Cover, Boost, Mend, Spark-share, Marking hit, Payoff's pounce, Strike, Lingering, Marked foe, First pounce, Owner's mark, Backdraft ward, Keen reaction, Adaptation pierce, Unbothered, Brace, Guard's shadow, Trail XP, Quick feet, Keen nose, Lucky find, Packer, Busy paws, Apprentice, Between-room rest and Festival glow.

**Compendium detail, not shipped:** the lines are what the makers whisper to a piece as it is finished. A Hunter is a promise to find a certain kind of foe; a Ward is a promise never to be found by one. A Guard's shadow is the oldest line of all: it is simply the warmth of standing near someone steady.

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
