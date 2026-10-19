# Items: gear, supplies, parts and blueprints

Status: 2026-10-18 (gear v2, base stats and local lines; gear sets and position lines). Flavour only. The numbers and rules live in `RULES` and the data files, not here.

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

Forty-two bases in three slots (twenty-eight more are the gear sets, below). Hats and Scarves come in three makes for neutral and for each element (fifteen of each slot), unlocked at item levels 1, 5 and 10: a plain one, a better one and a fine one, each a fixed set of **base stats** (a Hat leans to Attack and carries some HP, a Scarf leans to HP and carries a little Attack; the finer Hats and some Scarves also carry crit chance or crit damage). Charms have no stats: each has one fixed line (its base line, bigger on higher item levels), and there is a Compass for explorers and four Charms made for one role each. Three Festival pieces complete the list (the Lantern Cap is the third). `(content: gear.json)` The rest of an item is rolled from the lines in `gear-lines.json`. The line names are the glossary's.

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
- _The Festival pieces:_ given out at the Festival. Festival gear is "won by clearing a Festival finale" and "cannot be crafted"; it is special, not stronger: its level and rarity follow the same odds as any finale piece, and what it has of its own is one fixed Festival line (Hearth warmth on the scarf, Lantern luck on the charm), a short list of lines to roll and a lantern-gold look `(content: glossary.json "gear-festival")`. The Lantern Charm is lit once a season. The Hearth Scarf is given to everyone who stood by the Festival hearth. The Lantern Cap is made for the longest night of the Festival. A Festival win gives one of the three Lantern Night pieces that the player does not own yet, picked at random (in the bag or worn counts as owned); once they own all three, any one of them. The week's Festival creature does not decide which piece (updated 2026-10-19: before this, the piece matched the creature's element, and the Cap could never drop). `(design: decisions.md 2026-10-19)`
- _The finer makes:_ the plain Hat or Scarf is what a maker turns out in an afternoon; the better and the fine ones are what the same maker turns out after years at the bench (the Brine Hood and the Forge Scarf are second-year work, the crowns and mantles are master work). A crown or a mantle never improves a plain piece: it is simply a different, grander piece of the same kind `(compendium detail, not shipped)`.
- _The Cap and Scarf makers' tags:_ an Ember piece is warmer to the touch, a Tide piece damp at the edges, a Grove one a little green, a Spark one a little static. That is why the tag matters.

**What the old gear became.** The charms, bands and trinkets of the first version were converted when gear changed (2026-10-16): an Attack or crit piece became a Hat, an HP piece a Scarf, a speed piece a Charm, with the same tint. The enchants were taken back by their teachers and the materials returned `(compendium detail, not shipped; design: gear-and-creatures-v2.md section 12)`.

## Gear sets

Added 2026-10-18 (more gear and modifiers). A **set** is three named pieces, a Hat, a Scarf and a Charm, that share a tag. Wear two of them on one creature for a small bonus, all three for a named effect `(content: gear-sets.json)`. Every set piece is a base in `gear.json` like the others: twenty-seven new bases for the nine plain sets, plus a Festival Lantern Cap that completes Lantern Night with the two Festival pieces that were already there. A set piece has the stats of a fine (item level 10) Hat or Scarf and the same Charm line as the plain Charm of its tag, so the set is the reward, not a bigger number; it unlocks at item level 12 (the Festival ones at 1, like all Festival pieces). The pieces of a role's set can only be worn by that role, the way the role Charms are.

| Name                 | Slot  | Tag      | Set                 | Base stats or line                  | From item level | Flavour `(content)`                                                                  |
| -------------------- | ----- | -------- | ------------------- | ----------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Tidepool Cowl        | Hat   | Tide     | Tidepool Finery     | 24 Attack, 48 HP, 2 pt crit chance  | 12              | "A hood of wet kelp that never drips on the one who wears it."                       |
| Tidepool Stole       | Scarf | Tide     | Tidepool Finery     | 150 HP, 12 Attack                   | 12              | "A stole of sea silk that ripples even when the air is still."                       |
| Tidepool Locket      | Charm | Tide     | Tidepool Finery     | Tide Attunement                     | 12              | "A locket with a drop of the tide inside, ticking in and out."                       |
| Forge-Warm Bonnet    | Hat   | Ember    | Forge-Warm Kit      | 28 Attack, 38 HP, 20 pt crit damage | 12              | "A bonnet stitched by the forge-folk, still warm from the last pour."                |
| Forge-Warm Sash      | Scarf | Ember    | Forge-Warm Kit      | 150 HP, 12 Attack                   | 12              | "A sash that keeps the heat of the day and lends it back at dusk."                   |
| Forge-Warm Token     | Charm | Ember    | Forge-Warm Kit      | Ember Attunement                    | 12              | "A cinder token that glows when the rest of the kit is close."                       |
| Hollow Weave Cap     | Hat   | Grove    | Hollow Weave        | 19 Attack, 67 HP, 2 pt crit chance  | 12              | "Woven in the Hollow from reeds that lean toward whoever wears it."                  |
| Hollow Weave Shawl   | Scarf | Grove    | Hollow Weave        | 180 HP, 6 Attack                    | 12              | "A shawl of bark thread and moss, soft as a nest."                                   |
| Hollow Weave Knot    | Charm | Grove    | Hollow Weave        | Grove Attunement                    | 12              | "A knot of green cord that tightens a little in the rain."                           |
| Ridge Copper Cap     | Hat   | Spark    | Ridge Copper        | 24 Attack, 38 HP, 3 pt crit chance  | 12              | "A cap lined with copper from the Ridge. It hums when a storm is near."              |
| Ridge Copper Scarf   | Scarf | Spark    | Ridge Copper        | 142 HP, 12 Attack, 2 pt crit chance | 12              | "A scarf of copper thread that stands on end before the lightning does."             |
| Ridge Copper Bead    | Charm | Spark    | Ridge Copper        | Spark Attunement                    | 12              | "A glass bead with copper inside. It passes one spark to the next."                  |
| Watchman's Cap       | Hat   | Guard    | Warden's Watch      | 24 Attack, 48 HP, 2 pt crit chance  | 12              | "A cap with a short brim, so its wearer can look straight ahead."                    |
| Watchman's Cloak     | Scarf | Guard    | Warden's Watch      | 150 HP, 12 Attack                   | 12              | "A cloak cut wide enough to stand in front of two friends."                          |
| Watchman's Whistle   | Charm | Guard    | Warden's Watch      | Armor                               | 12              | "A whistle blown once at dusk, so the gate knows who stands there."                  |
| Helper's Bonnet      | Hat   | Support  | Hearth Helpers      | 24 Attack, 48 HP, 2 pt crit chance  | 12              | "A bonnet with a pocket for biscuits and another for the spare biscuits."            |
| Helper's Kerchief    | Scarf | Support  | Hearth Helpers      | 150 HP, 12 Attack                   | 12              | "A kerchief knotted by someone who always knows who needs a hot drink."              |
| Helper's Ladle       | Charm | Support  | Hearth Helpers      | Boost                               | 12              | "A ladle with a long handle, for reaching a bowl across the table."                  |
| Firstfoot Cap        | Hat   | Setter   | First Footprints    | 24 Attack, 48 HP, 2 pt crit chance  | 12              | "A cap worn by whoever is first through the door each morning."                      |
| Firstfoot Scarf      | Scarf | Setter   | First Footprints    | 150 HP, 12 Attack                   | 12              | "A scarf that has been the first thing out of the house for years."                  |
| Firstfoot Print      | Charm | Setter   | First Footprints    | Marking hit                         | 12              | "A clay print of a very quick paw. It does not like being stepped on."               |
| Pouncer's Cap        | Hat   | Payoff   | Pounce Set          | 24 Attack, 48 HP, 2 pt crit chance  | 12              | "A cap with a loose brim, quick to flip back when its wearer springs."               |
| Pouncer's Wrap       | Scarf | Payoff   | Pounce Set          | 150 HP, 12 Attack                   | 12              | "A wrap cut short at the ends, so nothing catches mid-leap."                         |
| Pouncer's Tooth      | Charm | Payoff   | Pounce Set          | Payoff's pounce                     | 12              | "A milk tooth on a cord. It has waited a long time for the right moment."            |
| Wanderer's Hat       | Hat   | Explorer | Crossroads Wanderer | 24 Attack, 48 HP, 2 pt crit chance  | 12              | "A wide hat with a map folded in the band, for rain or for roads."                   |
| Wanderer's Scarf     | Scarf | Explorer | Crossroads Wanderer | 150 HP, 12 Attack                   | 12              | "A long scarf with one end in every season."                                         |
| Wanderer's Coin      | Charm | Explorer | Crossroads Wanderer | Trail XP                            | 12              | "A coin from the Old Crossroads. Heads is the road ahead, tails another."            |
| Festival Lantern Cap | Hat   | Grove    | Lantern Night       | 1 Attack, 5 HP, Lantern light       | 1               | "A paper cap with a candle-glow inside, made for the longest night of the Festival." |

| Set                 | Tag      | Two pieces              | Three pieces                                                    | Flavour `(content)`                                                                   |
| ------------------- | -------- | ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tidepool Finery     | Tide     | Steam bonus +8%         | Its first Steam each fight cannot be reflected.                 | "Worn to the Tidepool Finery, where everyone arrives a little damp and nobody minds." |
| Forge-Warm Kit      | Ember    | Wildfire bonus +8%      | Crits after a Wildfire deal +20 pt crit damage for a round.     | "The kit the forge-folk pack for the long cold walk home."                            |
| Hollow Weave        | Grove    | HP +8%                  | Heals 3% of max HP whenever it cashes Grounding.                | "Woven one strand at a time in the Hollow, and it takes all three to hold."           |
| Ridge Copper        | Spark    | Crit chance +2 pt       | Overload also leaves Charged afterwards, so a chain can follow. | "Copper from the Ridge, drawn into thread, glass and bead."                           |
| Warden's Watch      | Guard    | Armor +4 pt             | Cover reaches one more slot in its row.                         | "The night watch's own kit. It asks a Guard to stand a little wider."                 |
| Hearth Helpers      | Support  | Boost +3 pt             | Its boost also lands on the creature two slots away.            | "The kit of the one who makes sure everyone is warm, fed and within reach."           |
| First Footprints    | Setter   | Marking hit +8%         | Its first mark each fight cannot be replaced.                   | "Whoever leaves the first mark is the one the others follow."                         |
| Pounce Set          | Payoff   | Payoff's pounce +5%     | Its first reaction each fight crits.                            | "For the creature that waits for the mark, and then does not wait at all."            |
| Crossroads Wanderer | Explorer | Trips take 4% less time | One extra catch roll on 24 hour trips.                          | "Worn by those who take the fifth road at the Old Crossroads."                        |
| Lantern Night       | Festival | Attack and HP +3%       | Guards in its row: their abilities last 1 more round.           | "The Festival pieces together: hearth, lantern and cap, lit once a season."           |

**Compendium detail, not shipped** (who makes them):

- _The element sets:_ the Tidepool Finery is what the shore folk wear to their yearly gathering; the Forge-Warm Kit is packed by the forge-folk for the walk home; the Hollow Weave is made by the woodfolk of the Hollow, one strand at a time; the Ridge Copper is drawn out of the Ridge's copper into thread, glass and bead.
- _The role sets:_ older than the plain role Charms. Each was made for the kind of creature that wears it: the Warden's Watch for whoever stands in front, the Hearth Helpers for whoever keeps everyone fed and within reach, the First Footprints for whoever leaves the first mark, and the Pounce Set for whoever waits for it. Only that kind can wear them, which is why the sets are carried by role.
- _The Crossroads Wanderer:_ the travelling kit of those who take the fifth road at the Old Crossroads. It is where the Compass comes from.
- _Lantern Night:_ the three Festival pieces together, hearth, lantern and cap, lit once a season.
- _How they are found:_ set pieces drop like any other piece once the item level reaches 12 (the finale from Boss Rank 9, the dungeon from depth 22, trips from explorer rank 6), and their blueprints are learned like any other. A role set's pieces are role-locked, so they also come as the finale's rare role-locked drop. `(design: decisions.md, 2026-10-18)`

## Position lines

Ten lines that depend on where the creature stands, added 2026-10-18 `(content: gear-lines.json)`: Shoulder to shoulder, Odd one out, Edge-walker, Heart of the row, Front-liner, Back-row patience, Lantern bearer, Four winds, Sheltered, and Beside the mark-maker (the Setter twin of Guard's shadow). They are the special lines: an item has at most one. **Compendium detail, not shipped:** these are the oldest kind of whisper, the ones that are not about the creature at all but about who it is standing next to. A Lantern bearer is simply the one who carries the light, and everyone beside it can see a little further.

## Chance lines and trigger lines

Twenty-one lines added 2026-10-18 `(content: gear-lines.json)`, from Rare up, and special: an item has at most one of these or a position line. **Chance lines** work some of the time: Second wind, Echo, Sidestep, Quick re-mark, Steady paws, Spill-over, Warm heart, Tinker's luck and Second look. **Trigger lines** wait for a moment: Payback, Kindling, Opening mark, Rally cry, Ember tail, Storm warning, Stubborn, Last stand, Overflow, Second breath, Patient and Shared warmth. **Compendium detail, not shipped:** these are the whispers that sound like habits rather than gifts. Stubborn is the old one, said only to pieces that have been through a great deal; Echo is what a hat remembers of the hit it just took part in; Tinker's luck is the way a good bench-worker knows, before a piece is even on the table, how it was put together.

## Gear lines

Every item has its fixed base (stats for a Hat or a Scarf, a base line for a Charm; a Festival piece also has its Festival line) and 1 to 3 rolled lines. The lines are in `gear-lines.json`; each has five tiers and a short line of text `(content)`. Names: the lines of the item itself, which read "(this item)" on a card (Attack as a share and as a flat amount, HP as a share and as a flat amount, and the crit chance and crit damage of the item as a share), Creature Attack and Creature HP (rare, Charms only), Crit chance, Crit damage, All damage taken, Area ward, Aimed ward, Well-fed, the four Attunements (Tide, Ember, Grove, Spark), the four Hunters, the four reaction bonuses (Steam, Wildfire, Grounding, Overload), the four Wards, Armor, Cover, Boost, Mend, Spark-share, Marking hit, Payoff's pounce, Strike, Lingering, Marked foe, First pounce, Owner's mark, Backdraft ward, Keen reaction, Adaptation pierce, Unbothered, Brace, Guard's shadow, Trail XP, Quick feet, Keen nose, Lucky find, Packer, Busy paws, Apprentice, Between-room rest, the ten position lines (Shoulder to shoulder, Odd one out, Edge-walker, Heart of the row, Front-liner, Back-row patience, Lantern bearer, Four winds, Sheltered, Beside the mark-maker), the nine chance lines (Second wind, Echo, Sidestep, Quick re-mark, Steady paws, Spill-over, Warm heart, Tinker's luck, Second look), the twelve trigger lines (Payback, Kindling, Opening mark, Rally cry, Ember tail, Storm warning, Stubborn, Last stand, Overflow, Second breath, Patient, Shared warmth), and the three Festival lines (Hearth warmth, Lantern luck, Lantern light).

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

## Treats

A treat is a little Bait spent on one creature when an activity starts (a trip, the dungeon team, a Workshop job); that activity gives it double experience, and triple on a Hearty Breakfast day. Raids take no treats. `(content: glossary.json "treat")`

**The treat icon** (shipped 2026-10-19, redrawn the same day): a pair of cherries on one stem, in the game's red with a grove-green stem and leaf (`treat` in `apps/activity/src/glyphs.ts`, picked by `TREAT_ICON` from four designs: cherries, cookie, bone biscuit, wrapped candy). It is the prefix of the "Treat" line in an experience gain's breakdown (tap the gain's multiplier chip, "2x") and the picture of the glossary's Treat entry; it no longer sits next to the gain. The first design, a watermelon slice, was dropped because its pinks and greens were not the game's. `(content: glossary.json "treat"; design: decisions.md 2026-10-19)`

**Compendium detail, not shipped** (in-world): the valley's cooks keep a jar of cherries for creatures before a long day, and a creature that has had its pair works with a will. Nobody agrees whether it is the cherries or the being thought of that does it.

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

A blueprint teaches a creature to craft one kind of item. You learn each one once. A blueprint you already know is not wasted: each repeat find raises its **quality**, up to ten points, and each point helps the next crafts of that item come out a rarity better (at ten marks a repeat find turns into scrap) `(content: glossary.json "blueprint", "blueprint-quality")`. A creature taking an item apart can find the item's blueprint in its working notes, or raise the quality of the one you already own `(content: glossary.json "job-dismantle")`.

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
- **Festival Lantern Cap** (Grove, festival): "made for the longest night of the Festival."

These three are Lantern Night. A Festival win gives one the player lacks, so a few Festivals complete the set.

Festival gear is epic-power with a look of its own, and it has no extra power over Epic gear `(content: glossary.json "gear-rarity-festival")`. Use it for cosmetic flavour and for Festival stories, not for power.
