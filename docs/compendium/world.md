# World: the setting

Status: 2026-10-20 (Mire shipped; the rest as of 2026-10-13). Canon for names, meaning and tone. Read `README.md` first for the tags: `(content)`, `(design)`, `(inferred)` and `(compendium detail, not shipped)`.

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
- The explorers used to say a long dry spell always ends: the wild owed you a creature. Since 2026-10-20 it owes nothing: every hour of a trip simply has its chance, and long trips are better. `(inferred, design: decisions.md 2026-10-20)`
- A Discord server is a single **valley** or region, with its own sky, calendar and boss. The raid boss and the Festival belong to that region, not to one player. `(inferred)`
- The explorers' base is a **Workshop** at the edge of the wild, and the Old Crossroads is the nearest meeting point to it. `(inferred)` The Crossroads banner shows "a worn dirt crossing" and "travellers' campfire ashes", which fits. `(content: destinations.json)`

### Vocabulary

Use these words. They are what the shipped text already uses.

| Word                                     | Meaning                                              | Source                                     |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| explorer                                 | the player, out in the wild                          | glossary, journal                          |
| trip, expedition                         | a creature out in a place                            | glossary "away", "destination"             |
| creature                                 | any team member                                      | throughout                                 |
| beast                                    | a wild creature met on a trip                        | journal ("Some beasts take their turn...") |
| folk, pups, wardens, mice, cats, diggers | informal names for kinds of creature                 | journal, species-lore                      |
| boss, foe, room                          | fights: a raid boss, a dungeon foe, a dungeon room   | bosses, dungeon-foes                       |
| finale                                   | the live fight at the end of a raid week             | glossary "finale"                          |
| push on                                  | a choice to stay out longer at the end of a trip     | glossary "push-on"                         |
| the wheel                                | the four older elements in a loop                    | journal ("any-the-wheel")                  |
| the element chart                        | who deals more or less damage to whom, wheel and all | design (`speed-and-dodge.md` section 4)    |

## 2. The four elements as forces

The four elements are forces of the world, not just colours. The journal states the whole idea in one line: "Water puts out fire, fire eats the green, the green drinks lightning, and lightning splits the water. The wheel has never once stopped." `(content: journal.json, any-the-wheel)`

### The wheel (content)

Each element is **strong against** exactly one other. `(content: element-chart.json)`

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

### Mire: the fifth force, and how the wheel became a chart

Status: design, not shipped (`(design: speed-and-dodge.md section 5)`). Everything below is `(design)` or `(compendium detail, not shipped)`.

**Mire is patience. It sticks, it holds, it keeps.** `(design)` It is mud, tar, bog, peat and silt. Its colours are peat brown, ochre and tar black with an oily rainbow sheen. Its creatures are slow and sturdy. The bog keeps old things: a cart wheel, a gate, a lantern. `(design, compendium detail, not shipped)`

**The wheel was never the whole world.** `(compendium detail, not shipped)` For as long as explorers kept notes, they drew the elements as a loop, because that is what four things do when each beats one other. Then someone walked into the Sunken Fen and wrote down that the mud drank a flame, and that the flame, in turn, lit the swamp gas. Two elements beat each other: the loop had a chord across it, and then a fifth point. The explorers did not throw out the wheel. They gave it a new name, the **element chart**: a table of who is strong against whom, with the old loop as its first four lines. The journal keeps the new line: "the wheel was never the whole world." (Draft text in `docs/design/mire-content-drafts.md`, page `any-the-chart`.) New elements can be added to the chart without breaking the old ones.

| Pair                                            | Reading                                   | Source     |
| ----------------------------------------------- | ----------------------------------------- | ---------- |
| Mire against Ember                              | Damp smothers fire.                       | `(design)` |
| Ember against Mire                              | Swamp gas goes up.                        | `(design)` |
| Tide against Mire                               | It is already wet, so a wave does little. | `(design)` |
| Grove or Spark with Mire, and Mire against Tide | Nothing special happens.                  | `(design)` |

**The mark and the reactions** `(design)`:

| Element | Mark it leaves | Cashed in by           | Reaction               | What it means in-world `(compendium detail, not shipped)`                                                                                                                         |
| ------- | -------------- | ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mire    | Muddied        | Ember                  | Flare                  | The swamp gas in the mud catches a spark and goes up in one great breath. It also burns the Mired mud off the boss: keeping the mud keeps the boss slow, and burning it pays out. |
| Ember   | Scorched       | Tide, and now Mire too | Steam, and now Smother | Water on a hot rock is Steam. Wet earth on a fire is Smother: no steam, just a soft sound and the fire is gone, and the mud sticks to whatever it covered.                        |

**The derived fact still holds** `(design)`: every reaction pairs an element with the mark of the element it beats. Mire beats Ember, so Mire cashes Scorched (Smother). Ember beats Mire, so Ember cashes Muddied (Flare). Ember and Mire are the first pair that cash each other's marks.

**Mired** `(design)` is the first status effect a boss can put on your creatures and your creatures can put on a boss: mud that holds on to the feet. It makes a fighter slower and weaker for a few turns. It is not a wound; the fen only holds on. `(compendium detail, not shipped)`

**Mire as a force** `(compendium detail, not shipped)`: Grove is living patience, which grows. Mire is patience that keeps: it does not grow, it holds. Where Grove shelters, Mire keeps. Where Tide washes, Mire stays put. Its creatures are guards and debuffers, the ones who make a fight slower, which is how patience wins. Together with Ember it forms the first pair of elements that are strong against each other.

### Void: a concept, art first (not shipped)

Status: concept art only (2026-10-30). No creatures, names, stats, marks or place yet; nothing in the content. Everything below is `(compendium detail, not shipped)` and may change when Misa designs the element.

**Void is the dark between the stars.** It is the quiet the night sky is made of, the place things drift off to and, sometimes, come back from. Where Spark is a flash in the dark, Void is the dark itself. It fits the motif "light in the dark" (section 4) from the other side: Void creatures carry a little of the dark, and a star in it.

**The look** (Misa chose the dark purple over a pale first draft, 2026-10-30). Void creatures are **dusk purple**: a muted violet body, a lighter lilac rim and belly, so they still stand out on the night-sky UI. Each carries a **window**: a patch of starry night, darker than the body, with one warm star (a bigger window gets a second, cool one), as if it had a piece of the sky inside. The window always has a light edge inside the outline, and never sits just under the face (there it reads as an open mouth). One cool glint (pale cyan) is the accent. Void's purple is muted next to Spark's storm violet, and Spark always has its electric yellow. The palette, keys and concept sprites are in `apps/activity/src/sprites/concepts/void.ts`; how they were made is in `docs/design/art-studio.md`.

| Role    | Concept                                                                                | Where the window is               |
| ------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| Guard   | An eclipse hood: a wide crescent over a sturdy body, held like a shield.               | Inside the hood                   |
| Setter  | A floating wisp with a feeler that ends in a star; it points at the boss and marks it. | On the forehead, like a third eye |
| Support | A small planet with a ring for a halo and two moons in orbit; it lifts its neighbours. | A round moon on the forehead      |
| Payoff  | A lynx of the night: tall ears full of stars, a small star crest.                      | Inside the ears                   |

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
- **Old Bogback** (Mire, design, not shipped) is the oldest creature of the Sunken Fen: a huge toad half sunk in the peat, the one the fen's smaller toads and leeches grew up near. `(compendium detail, not shipped)` See `bosses.md`.
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
14. **Keeping.** `(design, compendium detail, not shipped)` The bog keeps old things, and Mire's whole nature is to hold on: a cart wheel, a lantern, a creature's feet. It joins "Remembering" (motif 13): the world forgets some things, and the fen is where it keeps the rest.

## 5. Things the content does not say

These are real gaps. They are the best places for new lore. `threads.md` has them with sources.

- Who the explorers are, and where they come from `(gap)`.
- Who writes the journals and the blueprints `(gap)`.
- Where Lanternfin and Hearthshell go between festivals `(gap)`.
- What the Festival is named after, beyond "the Festival of the tide" on a charm `(content: gear.json lantern-charm, gap for the rest)`.
- What lies behind the sunken door, and the ancient vault `(content: dungeon-foes.json, push-on-goals.json)`.
- Which creature is "the night singer" on the Reef `(content: journal.json reef-night-singer; no creature named)`.
