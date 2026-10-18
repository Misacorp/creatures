# World: the setting

Status: 2026-10-13. Canon for names, meaning and tone. Read `README.md` first for the tags: `(content)`, `(design)`, `(inferred)` and `(compendium detail, not shipped)`.

## 1. The shape of the world

### What the content states

- **You are an explorer.** You send creatures out on **trips** to **places** (called destinations or expeditions in the game). Trips come home with catches, parts, supplies and journal pages. `(content: destinations.json, glossary.json)`
- **Creatures are the team.** Each creature has an element, a role and a line that evolves. `(content: creatures.json)`
- **Bait** is the currency that buys lures, treats and talent slots. It no longer buys levels. Trips and supplies cost no Bait. `(content: glossary.json "bait")`
- **Creatures grow by doing.** A creature earns **experience** on trips, in the daily dungeon, in raid stages and on Workshop jobs. A **treat** (a little Bait, packed when the activity starts) doubles one activity's experience for that creature. At levels 10 and 20 a creature waits for a **ribbon** (Bronze, then Silver), made from parts; Gold at level 30 is a reward. `(content: glossary.json "experience", "treat", "ribbon")`
- **The Workshop** is where creatures work on jobs (crafting gear and supplies) while you are away. `(content: glossary.json "workshop")`
- **Raids** are weekly fights against a big boss. A **season** is five raid weeks; week five is a **Festival**. `(content: glossary.json "season", "festival")`
- **The daily dungeon** is a solo run, once a day, with a team of three. `(content: glossary.json "dungeon")`
- **Servers keep time together.** Each Discord server has its own clock. The daily reset is at 13:37 in the server's time zone. The day's dungeon modifiers and the Festival are shared by everyone on the server. Moonlit Reef opens at night, "your server time". `(content: glossary.json "dungeon", "room-modifiers", "destination-moonlit-reef")`

### What we infer

- The ribbons read as a rite of passage: a creature that has seen a lot of the wild is given a token of it, made at the Workshop from the things it brought home. Bronze marks its first real season, Silver its first long road. Treats are a small kindness before a hard day, not a purchase. `(inferred)`
- The explorers say a long dry spell always ends: the wild owes you a creature. The game keeps a count of trips since your last new species and, after a long drought, the next place you visit shows you one you have not met. `(inferred, content: how-to-play.json "expeditions")`
- A Discord server is a single **valley** or region, with its own sky, calendar and boss. The raid boss and the Festival belong to that region, not to one player. `(inferred)`
- The explorers' base is a **Workshop** at the edge of the wild, and the Old Crossroads is the nearest meeting point to it. `(inferred)` The Crossroads banner shows "a worn dirt crossing" and "travellers' campfire ashes", which fits. `(content: destinations.json)`

### Vocabulary

Use these words. They are what the shipped text already uses.

| Word                                     | Meaning                                            | Source                                     |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| explorer                                 | the player, out in the wild                        | glossary, journal                          |
| trip, expedition                         | a creature out in a place                          | glossary "away", "destination"             |
| creature                                 | any team member                                    | throughout                                 |
| beast                                    | a wild creature met on a trip                      | journal ("Some beasts take their turn...") |
| folk, pups, wardens, mice, cats, diggers | informal names for kinds of creature               | journal, species-lore                      |
| boss, foe, room                          | fights: a raid boss, a dungeon foe, a dungeon room | bosses, dungeon-foes                       |
| finale                                   | the live fight at the end of a raid week           | glossary "finale"                          |
| push on                                  | a choice to stay out longer at the end of a trip   | glossary "push-on"                         |
| the wheel                                | the four elements in a loop                        | journal ("any-the-wheel")                  |

## 2. The four elements as forces

The four elements are forces of the world, not just colours. The journal states the whole idea in one line: "Water puts out fire, fire eats the green, the green drinks lightning, and lightning splits the water. The wheel has never once stopped." `(content: journal.json, any-the-wheel)`

### The wheel (content)

Each element is **strong against** exactly one other. `(content: elements.json)`

| Element | Force        | Strong against | Weak to (beaten by) |
| ------- | ------------ | -------------- | ------------------- |
| Tide    | water        | Ember          | Spark               |
| Ember   | fire         | Grove          | Tide                |
| Grove   | living green | Spark          | Ember               |
| Spark   | lightning    | Tide           | Grove               |

Colour families are fixed by the palette rules: Tide blues and teals, Ember reds, oranges and warm yellows, Grove greens, Spark electric yellow and storm violet. `(content: creatures.md palette rules)`

### The marks and the reactions (content, with one derived fact)

When a creature hits a boss, it can leave its element's **mark** on the boss. A mark is cashed in by the element that is **strong against** the marking element. `(content: reactions.json, glossary.json "mark-*", "reaction-*")`

| Element | Mark it leaves | Cashed in by | Reaction  | What it means in-world (`(inferred)` unless quoted)                                                                          |
| ------- | -------------- | ------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tide    | Soaked         | Spark        | Overload  | A wet creature met by a spark. The journal: "the water answered with a crack of light."                                      |
| Spark   | Charged        | Grove        | Grounding | Roots catch a charged creature. The journal: "Roots burst from the ground, caught it, and pulled it down in a single flash." |
| Grove   | Overgrown      | Ember        | Wildfire  | Fire reaching a vine-covered hillside. The journal: "One spark, and the whole hillside roared."                              |
| Ember   | Scorched       | Tide         | Steam     | Water on a hot rock. The journal: "A wave rolled into the hot cave and came back as a white wall of hot fog."                |

**Derived fact** `(content, derived)`: every reaction pairs an element with the mark of the element it beats. Tide cashes Scorched because Tide beats Ember. Spark cashes Soaked because Spark beats Tide. Each reaction is the wheel in action. Use this when you name a new mark or reaction.

A cashed mark is used up. The next hit leaves a new one. Only a Setter of another element can swap a mark. `(content: glossary.json "reaction-overload", "mark-soaked")`

### The four elements as forces (inferred and compendium)

- **Tide** is patient water that puts out what burns, and the first to show up. Its pools are warm and full of small life. `(inferred from places)` The journal's Tide pages are about timing, steam and luck. `(content: journal.json tide-*)`
- **Ember** is heat that lives in stone. It is the element that is "warm, a little dangerous, welcoming at the edges" (Ember Caves mood, `(content)`). Its creatures are diggers and lions, and the warm hearths of the wild. `(inferred)`
- **Grove** is living patience. It holds, shelters and grows over time. Its creatures are the guards and the garden-keepers. `(content: roles of Sproutle, Thornbuck, Mossback, Ancientshell)`
- **Spark** is quick, bright and short-lived. Its creatures strike first and fast. `(content: Zipmouse, Stormray, Voltaro, Tempestray roles)`
- **Lightning and water** share a story. Overload (a spark on a wet creature) and Steam (water on heat) are the two reactions the journal tells most often. `(content: journal.json, count of two each; the reading is inferred)`

### Balance as a world idea (inferred)

Nothing in the content says any element is good. Every element is strong against one and weak to another, and the reactions reward teams that use the loop. A world-level reading: no force wins for good; the loop keeps turning. The "wheel" line `(content)` supports this.

## 3. The raid bosses' place in the world

### Stated

- There are four **raid bosses**, one per element. Each is huge (24 by 24 pixels in art). Each fights for twelve finale rounds. `(content: bosses.json, bosses-lore.json)`
- The bosses are the big old powers. The lore calls them a "mountain" (Tidal Colossus), a "wyrm" (Cinder Wyrm), a "briar queen" (Thornmother) and a "crowned king of thunderclouds" (Storm Sovereign). `(content: bosses-lore.json)`
- **Bosses learn.** "After the first night of a hard fight, the big ones come back with a new trick and a long memory." `(content: journal.json any-boss-adapts)` In game, every boss adapts after Phase 1. `(content: adaptations.json)`
- Bosses come back week after week, at a **Rank** that goes up when you win and stays the same when you lose. `(content: glossary.json "boss-rank")`

### Inferred

- Each raid boss is the **oldest creature of its element** in its valley: the thing the smaller ones grew up near. `(inferred)`
- **Thornmother** is tied to the Verdant Hollow. The journal calls her "the old queen of thorns", and the Hollow's pages are about waiting and listening trees. `(inferred from journal verdant-both-ends)`
- **Storm Sovereign** is tied to Storm Ridge. The journal's "king of the clouds" page is set there. `(content: journal.json storm-lightning-rod)` The Sovereign is the Ridge's king; Tempestray's "storms" are his weather. `(inferred)`
- **Tidal Colossus** and **Cinder Wyrm** are not placed by the content. Tidal Colossus "rises from the deep" `(content: bosses-lore.json)`, so it sleeps under the Tidepools or the Moonlit Reef `(inferred)`. Cinder Wyrm is "black stone and living magma", which fits the Ember Caves `(inferred)`.
- The **floor bosses** of the daily dungeon are smaller echoes of the raid bosses. Slag Tyrant is "king of a cooled forge" and Bramble Matron is "the old hedge that all the little hedges follow". `(content: dungeon-foes.json)` They are lesser cousins of the raid bosses `(inferred)`. See `dungeon.md` and `bosses.md`.

## 4. Recurring motifs

Use these to keep new work in the same voice. Each motif has a shipped example.

1. **Marks and tracks.** A creature leaves a mark, a footprint or a scorch on the thing it meets. Splashet "leaves wet footprints wherever it goes" `(content)`. The marks are Soaked, Charged, Overgrown and Scorched `(content)`. Tracks and marks also show who was here before you.
2. **A home carried on the back.** Mossback's garden, Ancientshell's forest, Gaiadrake's trees and river, Hearthshell's bonfire, and the Ashmole burrow. A creature that carries a home is a creature that stays `(content: species-lore.json)`.
3. **Light in the dark.** Solmane's "sunlight in the deep" `(content: journal.json ember-lion-light)`, Lanternfin's paper lantern, Aurorix's ribbons, Moonlit Reef "glows when nobody looks", and the Festival lanterns. Sun and moon both appear, and Solmane prefers moonlight `(content: quirks.json solmane-moonlover)`.
4. **Waiting pays.** "The ones who rush in early get burned, and the ones who wait get paid." `(content: journal.json ember-cooling)` "Creatures come to the ones who wait, and the quiet ones wait best." `(content: journal.json any-bait-and-patience)` Setters go first, and the cashing creature waits its turn `(content: glossary.json "role-setter")`.
5. **The middle, the front and the ends.** "The ones in the middle are always the ones who get out." `(content: journal.json verdant-both-ends)` A zone attack is planned around the front, middle and back `(content: glossary.json "zone-front")`.
6. **Kings and queens.** The Thornmother is "the old queen of thorns". The Storm Sovereign is "the king of the clouds". The Slag Tyrant is "king of a cooled forge" `(content)`. Each is the top of its element.
7. **Shared warmth.** "A team that shares a burrow hits a little harder" `(content: journal.json ember-ash-burrow)`. Hearthshell "is happy to share its warmth" `(content: species-lore.json)`. Thornbuck "shelters the whole herd" `(content)`.
8. **Things come back stronger.** "The second one always comes back a little stronger than the first." `(content: journal.json road-fork-in-fur)` "A creature that comes back often learns the way." `(content: journal.json any-old-friend)` Bosses come back with a new trick `(content)`. Tidewing "leaves an even bigger splash" than Splashet `(content)`.
9. **Names that echo.** Scorched and Overgrown are both a mark and a dungeon modifier `(content: room-modifiers.json)`. Use the overlap on purpose.
10. **Gentle festivals.** "Everybody is in too good a mood to be afraid of it." The festival boss is easier. `(content: journal.json fest-bunting)` Lanterns are lit once a season `(content: gear.json "lantern-charm")`.
11. **Calm and sudden.** Coralynx "moves in quiet, sudden bursts" and "strikes from the shadows". Pyrelynx "waits for the perfect moment". `(content: species-lore.json)`
12. **Fog and cover.** Mistnewt, Fogwyrm and the Fog room modifier all use mist as cover `(content)`. The Reef's "fog on the reef" lets friends hide `(content: journal.json reef-fog-newt)`.
13. **Remembering.** The silver tide is gone by morning "and nobody remembers the way" `(content: journal.json reef-silver-tide)`. Bosses "have a long memory" `(content)`. The world forgets some things and keeps others.

## 5. Things the content does not say

These are real gaps. They are the best places for new lore. `threads.md` has them with sources.

- Who the explorers are, and where they come from `(gap)`.
- Who writes the journals and the blueprints `(gap)`.
- Where Lanternfin and Hearthshell go between festivals `(gap)`.
- What the Festival is named after, beyond "the Festival of the tide" on a charm `(content: gear.json lantern-charm, gap for the rest)`.
- What lies behind the sunken door, and the ancient vault `(content: dungeon-foes.json, push-on-goals.json)`.
- Which creature is "the night singer" on the Reef `(content: journal.json reef-night-singer; no creature named)`.
