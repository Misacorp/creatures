# The daily dungeon: foes, floor bosses, modifiers, the map, keepsakes and mystery rooms

Status: 2026-10-18. Covers the foes, the floor bosses and the room modifiers of the daily dungeon, and the map redesign (the map, the camp, the pack, keepsakes, mystery rooms and the Undercroft), as in-world things.

Read `README.md` for the tags. The dungeon has no look brief in the shipped data, so every visual line here is `(compendium detail, not shipped)`.

**Source of truth:** `dungeon-foes.json` (foes and floor bosses: element, gimmicks and flavour line), `room-modifiers.json` (the modifiers' rules), `dungeon-keepsakes.json` (keepsakes), `dungeon-events.json` (mystery rooms), `glossary.json` (how they are explained to players), `docs/design/daily-dungeon.md` (the dungeon's first shape) and `docs/design/dungeon-paths.md` (the map, which replaces its three fixed rooms). The numbers stay in the data.

## The dungeon as a place

- A **sealed, layered place** that each explorer enters alone, once a day, with a team of three in one row. `(content: glossary.json "dungeon", "dungeon-row"; design: daily-dungeon.md)`
- A **map of rooms**, drawn once a day, from the door up to a floor boss, with a camp halfway. A **room** is one encounter on the map; a **floor** is the whole set of rooms at one depth, so the day's map is one floor. Creatures keep their HP from room to room, and knocked-out creatures stay out until the camp. `(content: glossary.json "dungeon", "dungeon-map")`
- The **day's map is the same for everyone on the server.** Each fight room and the boss has a modifier. `(content: glossary.json "room-modifiers"; design: dungeon-paths.md)`
- Depth: each full clear takes you one depth deeper. Every seventh depth is a **landmark**. `(content: glossary.json "depth", "landmark")`
- **A supply from the dungeon:** a run that clears its first room carries one supply home, a lure, a map scrap, a lantern or a satchel. The first depths give plain ones; the deeper the run, the better the odds of a good or a great one. `(content: glossary.json "dungeon", "supplies")`

**Compendium detail, not shipped** (place feel):

- _Mood:_ quiet, damp and a little surprising. Each room is a different weather inside one old place. Rooms are never sad; they are curious.
- _Climate:_ there is no sky. Each room has its own condition (see the modifiers below), so the dungeon's climate changes from room to room and day to day.
- _Banner brief (for art):_ a stone stair going down into the dark, with a small lantern on the first step and the four element colours faintly on the walls, one wall per element. Palette: deep slate `#2b2d3a`, lantern gold `#f2b84b`, moss `#4f8a3c`, tide `#2a9d9a`, spark `#f6e05e`. Never draw a creature in the banner.
- _Sensory:_ drip of water, the hum of sparks, warm stone, the smell of wet moss.
- _Layout:_ the dungeon is a tall stair, not a corridor: landings stacked one on another, with passages that fork and meet. The first three landings climb to a camp, the next two climb on to the floor boss's hall. See "The map, the camp and the pack" below.

---

## Foes

Ten foes, two per element. Each foe is a small fight in one room. `(content: dungeon-foes.json)` Every foe has a low Speed (2 to 5% dodge when dodge is on).

Foes have no turn order of their own: in the dungeon **your creatures always act left to right, then the foe** (`RULES.dungeon.turnOrder`, decided 2026-10-14). The raid's bosses keep theirs. `(content: glossary.json "dungeon-row")`

### Tide foes

**Puddle Imp** (no trick)

- Shipped flavour `(content)`: "Hides in puddles and splashes ankles. Not scary, just very wet."
- Compendium detail: it lives in the low corners of the dungeon, where the rain collects. Its trick is simply to be in the way.

**Drift Wisp** (Sea Mist, every third round, silences the two ends for a turn)

- Shipped flavour `(content)`: "A bit of sea fog that wandered underground and forgot the way home."
- Compendium detail: a wisp of Tidepool mist, carried into the dark. It is the Mistnewt's cousin, with less cosiness. It works best against a team that puts its weakest creatures at the ends.

### Ember foes

**Ember Mite** (Flare Up, every second round, pops on one random creature)

- Shipped flavour `(content)`: "A glowing bug that nests in warm stones and pops like a tiny firework."
- Compendium detail: a small bug that gathers in warm stone. Its pop can land on any creature in the row, so no one is safe from it.

**Ash Sprite** (no trick)

- Shipped flavour `(content)`: "Drifts out of cold hearths in a puff of grey and sneezes sparks."
- Compendium detail: a relic of a fire that has gone out, which is why it is cold to touch and sneezes sparks. It is the dungeon's gentle foe.

### Grove foes

**Bramble Hound** (Thorn Snap, every third round, silences the two ends for a turn)

- Shipped flavour `(content)`: "A hedge that learned to run. Its bark is mostly twigs."
- Compendium detail: it is one of the Bramble Matron's children `(inferred)`. Its bark is mostly twigs, which is why it is easy to underestimate.

**Moss Lurker** (Root Grab, every second round, slams the creature with the highest Attack and splashes the creatures beside it)

- Shipped flavour `(content)`: "Looks like a mossy rock until it blinks. It likes the loudest visitor best."
- Compendium detail: it sits still and waits for the loudest creature to step close, then grabs it. The rule of thumb for a team is: do not walk your strongest creature in front of the rock.

### Spark foes

**Static Bat** (Zap Dive, every third round, strikes the creature with the highest Attack, then arcs to one more)

- Shipped flavour `(content)`: "Hangs from the ceiling crackling, and dives at whoever hits hardest."
- Compendium detail: a bat that hunts by the static in the air. Its trick follows the strongest hitter, the same way the Storm Sovereign's Lightning Rod does `(inferred)`.

**Flicker Swarm** (Buzz Cloud, every second round, pesters one random creature)

- Shipped flavour `(content)`: "A hundred sparks that agree on nothing except which creature to pester."
- Compendium detail: a crowd of sparks that moves as one. It does not care where a creature stands, only that it is there to pester.

### Mire foes

Status: 2026-10-20. Shipped (`docs/design/speed-and-dodge.md` section 5.5). Both foes leave Mired on the creatures they hit. `(content: dungeon-foes.json)`

**Bog Toad** (Mud Spit, every second round, a small shell of mud on one random creature that leaves Mired)

- Shipped flavour `(content)`: "Sits so still you take it for a stone, then spits a mouthful of mud. It is very sorry afterwards."
- Compendium detail: a small cousin of Old Bogback, the one the Sunken Fen sends to the dungeon's damp corners. It leaves Mired on whoever it spits at, which is the first taste of the fen's slow ground.

**Tar Leech** (Tar Cling, every third round, a heavy hit on the left creature that leaves Mired)

- Shipped flavour `(content)`: "Black, shiny and slow. It clings to the nearest creature and will not take the hint."
- Compendium detail: tar that has learned to cling. It is the dungeon's patient foe: it is slow, it is not scary, and it will not let go.

---

## Floor bosses

Five floor bosses, one per element. Each is the last room's foe on its floor, has more HP and hits harder than the foes before it, and has its own trick. At a landmark depth it also gains a signature move, announced a round ahead. `(content: dungeon-foes.json, glossary.json "floor-boss")`

Each floor boss is a smaller echo of a raid boss `(inferred)`. The raid bosses are in `bosses.md`.

### Drowned Warden (Tide; Flood Gate, every third round, opens the gates on every row)

- Shipped flavour `(content)`: "Guards a sunken door nobody has opened. It opens its own gates for you instead."
- Compendium detail: a warden of the flooded corridor. It opens the gates for the team, which reads as a helpful boss. This is the dungeon's one "friendly" floor boss `(inferred)`, which fits its opening gates.
- Echo: the Tidal Colossus's Undertow and Great Wave `(inferred)`.
- Landmark signature, **Sluice Surge** (every fourth round, marked a round ahead): the gates open on every row at once, harder than the usual Flood Gate. `(content: dungeon-foes.json)`

### Slag Tyrant (Ember; Molten Shell, reflects the first reaction of every round; Anvil Fall, every third round, drops on the left creature and splashes the creatures beside it)

- Shipped flavour `(content)`: "King of a cooled forge, wearing a crown of slag. It turns your best trick back on you."
- Compendium detail: a king who once ran a forge that has since gone cold. The crown is slag, which is what a forge leaves behind.
- Echo: the Cinder Wyrm's Backdraft `(inferred)`.
- Landmark signature, **Slag Spill** (every fourth round, marked a round ahead): a slam on the strongest creature, and the creatures beside it are splashed. `(content: dungeon-foes.json)`

### Bramble Matron (Grove; Tangle, every second round, silences the two ends; Thorn Rain, every third round, thorns land on two random creatures)

- Shipped flavour `(content)`: "The old hedge that all the little hedges follow. Keep your right flank ready."
- Compendium detail: the eldest hedge in the dungeon. She has two tricks: a silence, and thorns that land on two random creatures.
- Echo: the Thornmother's Bramble Bind `(inferred)`.
- Landmark signature, **Briar Cage** (every fourth round, marked a round ahead): the first and the last creature of the row take a hit. `(content: dungeon-foes.json)`

### Coil Baron (Spark; Arc Lash, every round, strikes the creature with the highest Attack, then arcs to one more)

- Shipped flavour `(content)`: "A bad-tempered tangle of copper and lightning. It always goes for your best fighter."
- Compendium detail: a tangle of copper wire and lightning, which makes it the dungeon's machine-like foe. Copper and lightning is a cool, wired contrast with the Ember forge of the Slag Tyrant `(inferred)`.
- Echo: the Storm Sovereign's Lightning Rod `(inferred)`.
- Landmark signature, **Overload** (every fourth round, marked a round ahead): a slam on the strongest creature, and the creatures beside it are splashed. `(content: dungeon-foes.json)`

### Fen Lurker (Mire; Sink Down, every third round, a sweep of the row that leaves Mired)

- Shipped flavour `(content)`: "Looks like a bog-oak log until it blinks. Then you see that the log was looking at you."
- Compendium detail: a bog-oak log, black and mossy, with reeds growing from its back. It lies half sunk in tar and watches with two gold eyes. It is the dungeon's patient floor boss, the smaller echo of Old Bogback `(inferred)`.
- Echo: Old Bogback's Sinking Mud `(inferred)`.
- Landmark signature, **Pull Under** (every fourth round, marked a round ahead): a sweep of the whole row that leaves Mired. `(content: dungeon-foes.json)`

---

## Room modifiers

Each room rolls one modifier. It is shown before the run, and it lasts for that room only. `(content: room-modifiers.json, glossary.json "room-modifiers")`

The modifiers are **phenomena**: things the dungeon does to its rooms, the way weather does to a valley. The shipped descriptions give the exact effect. This table gives the feel. The numbers stay in `room-modifiers.json`.

| Modifier             | Shipped rule `(content)`                                          | In-world phenomenon `(compendium detail, not shipped)`                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flooded**          | Tide creatures hit harder.                                        | The room is under water. Tide runs strong in it.                                                                                                                                                                          |
| **Scorched**         | Ember creatures hit harder.                                       | A heat wave. The room is hot and everything burns brighter.                                                                                                                                                               |
| **Overgrown**        | Grove creatures hit harder.                                       | Roots and vines have grown into the room in one night. Growth feeds the Grove.                                                                                                                                            |
| **Stormy**           | Spark creatures hit harder.                                       | Storm air. Static hangs in the room and charges the Spark creatures.                                                                                                                                                      |
| **Dark**             | Your creatures crit more often.                                   | No light at all. Creatures act on instinct and land more critical hits in the dark.                                                                                                                                       |
| **Thorns**           | The foe turns the first reaction of each round back on your team. | Briars grow across the room. The first reaction of each round tangles back into the team. Shipped text is `(content: room-modifiers.json thorns)`.                                                                        |
| **Brittle**          | The foe has less HP but hits harder.                              | Cracked stone. The foe is fragile and it knows it, so it hits harder.                                                                                                                                                     |
| **Muddy** (id `mud`) | The whole team is slower (30%).                                   | The room is knee-deep in mud. Every step is a squelch, and everyone arrives a little late. Shipped text `(content)`: "Your whole team is 30% slower." The first modifier that changes Speed, the stat dodge is made from. |
| **Echoing**          | Guards and supports hit harder.                                   | Sound carries in the stone and doubles back. The quiet ones, the ones who hold the line and lift the others, ring loudest.                                                                                                |

Notes:

- **The four element modifiers share their names with the four raid marks** `(content)`: Scorched and Overgrown are both a mark and a modifier. The overlap is on purpose. Use it when you name new modifiers.
- **Thorns** is the one modifier that behaves like a boss trick, applied to the whole room `(content: room-modifiers.json, foe_gimmick)`. It is the same idea as Cinder Wyrm's Backdraft `(inferred)`.
- **Echoing** is the one modifier that boosts roles, not an element (Guard and Support), so it rewards a team with them in it, and it leans away from Payoffs on purpose `(content: room-modifiers.json echoing)`. It took the place of **Fog** (2026-10-14).
- **Dark** is the only modifier that changes how the room is played, not just how hard it hits `(inferred)`.
- **Fog is retired.** It made everyone act in row order, which is now the rule in every room, so it had nothing left to do. Old runs that rolled it still show its name and text in their replays, and it is not rolled any more `(content)`. The compendium keeps the idea: a room so murky that the order is all anyone can trust.
- **No modifier changes who acts first.** The order is the dungeon's rule, said before the run ("Your creatures act left to right, then the foe."). Anything that ever changes a rule of the fight must be shown before the run, or announced when it happens if it is a mystery modifier `(decision: Misa, 2026-10-14)`.

---

## The map, the camp and the pack

New with the map redesign. Read `docs/design/dungeon-paths.md` for the rules; this section is the feel.

### The map

- The dungeon **rearranges itself overnight**. Each day its halls are laid out afresh, and everyone on the server climbs the same halls, with their own luck. `(design: dungeon-paths.md "The same for everyone on the server")`
- The day's map is one floor. Its rooms sit in rows, with two or three in most rows and passages between them that fork and meet. A passage only goes up, and never crosses another. `(design)`
- A player picks which room to step into next, from the ones the passage allows. The map is shown whole before the run, the way a traveller can see a mountain before climbing it. `(design)`
- _Look:_ a stack of lantern-lit landings joined by short stairs, drawn as dots and lines on a dark slate. Each kind of room has its own mark: crossed blades, a horned skull, a question mark, a chest, a campfire, a crown. `(design)` for the marks; the mood is `(compendium detail, not shipped)`.

### Room kinds

| Kind        | In-world thing `(compendium detail, not shipped)`                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Fight**   | A normal dungeon foe in a room with a condition. As before. `(design)`                                                                    |
| **Elite**   | The same kind of foe, bigger and in a mood: a "Fierce" Puddle Imp, a "Fierce" Static Bat. It guards a keepsake. `(design)`                |
| **Mystery** | A room with a small scene and two ways to answer it. See "Mystery rooms" below. `(design)`                                                |
| **Cache**   | A basket, a chest or a sack that somebody left in a quiet room. Nothing guards it. The dungeon is generous that way. `(design)`           |
| **Camp**    | See below. `(design)`                                                                                                                     |
| **Boss**    | The floor boss, at the top. At a landmark depth it is the landmark boss, as before. `(design)`                                            |
| **Door**    | A carved door, from depth 8. No fight: stepping through adds a room to the first Undercroft floor. See "The Undercroft" below. `(design)` |
| **Epic**    | The Undercroft's one-foe room at boss strength. See "The Undercroft" below. `(design)`                                                    |

An elite is not a new creature. It is a foe "having a day": the same name with "Fierce" before it, never scary, only larger and louder `(inferred)`.

### The camp

- A **ledge with a small fire**, where every passage meets. It is the one quiet place in the dungeon, and no foe comes near it. `(compendium detail, not shipped)`
- Three things can be done there: rest by the fire, swap a creature for one who has been waiting at the camp, or take a keepsake from the two on offer. Or the team goes home. `(design: "The camp")`
- A creature that was knocked out is carried to the camp and is the first to be swapped, which keeps the rule "knocked out, never dead" `(inferred)`.
- _Sensory:_ the crackle of a tiny fire, the smell of tea, a kettle nobody admits to owning.

### The pack

- The **pack** is the team's shared satchel: the Bait, Essence and scrap they pick up on the way `(design)`.
- Heading home from the camp keeps all of it. A defeat keeps half: the knocked-out team is carried home and half of the satchel comes along, because a good pack has a strap that holds `(compendium detail, not shipped)`.
- Experience and the day's supply are never in the satchel. They are in the creatures: what they learned and what they were handed `(design, in-world reading is compendium detail)`.

### The Undercroft

A set of optional floors below the day's floor boss, for explorers who have passed the first landmark (depth 8 and on). New 2026-10-18. Read `docs/design/dungeon-paths.md` ("The Undercroft") for the rules; this section is the feel. `(content: glossary.json "undercroft", "carved-door", "cracked-floor", "epic-fight"; design)`

- **What it is.** The floor boss's hall has a stair at the back, and the stair goes down. Nobody built the Undercroft; the dungeon simply has more of itself underneath, older and a little grumpier. `(compendium detail, not shipped)`
- **It is harder, and it says so.** The run strip says "Foes are fiercer here", and the floors are named plainly: "Undercroft 1", "Undercroft 2". The foes are the same creatures as upstairs, only more awake `(inferred)`.
- **Catching breath.** On the way down the team stops on the stair for a moment, and a little of their strength comes back. A creature that was knocked out gets back up, wobbly, with a tenth of its strength: it only needed a sit on the stair. The stair is the one place in the dungeon where nobody is ever hurried `(compendium detail, not shipped)`.
- **The pack at risk.** Everything the team is carrying comes down with them. The satchel strap still holds, but only half of it, if the team is carried home `(design, in-world reading is compendium detail)`.
- **Rooms.** Each Undercroft floor is rooms in pairs, side by side, with no way to cross from one to the other until a room that is on its own. More landmarks passed means a longer first floor `(design)`.
- **The floor boss.** Each Undercroft floor ends in its own floor boss, the same kind that guards the hall above, with the same charged move it has at a landmark. It is not "the real boss". It is the one who was left in charge `(inferred)`. Its chest is better than the hall's.

**Carved door.** A door with no handle, carved with a pattern that nobody can read twice the same way. It stands in the upper halls only (depth 8 and on), and it is never guarded. Stepping through it fights nothing. It asks the first Undercroft floor for one more room, and the Undercroft decides which: a fight, a fierce foe, a mystery, a cache, a camp or an epic fight, never a boss. The player is told only that list, and finds out on the stair `(design; the door's patterns are compendium detail, not shipped)`.

**Epic fight.** A single room with one foe in a very large mood: the same kind of foe as in a normal room, at boss strength. Shown as "Fierce <name>". It leaves an Essence, scrap and a keepsake `(design)`.

**Camp (Undercroft).** The same small fire as upstairs, set on a landing of the stair. The only place down there where the team can go home `(design)`.

**Cracked floor.** Now and then an Undercroft floor boss's hall has a crack across its floor, with cold air coming up through it. It means there is another floor down, with more of the same and a new floor boss `(design)`. A run goes down at most three Undercroft floors, which is as deep as the stair goes `(compendium detail, not shipped)`.

---

## Keepsakes

A **keepsake** is a small thing found on the way that helps for the rest of the run: a charm, a feather, a bell. It is a gift, never a trap, and it never changes a foe's moves. It comes from an elite, the camp or some mystery rooms, and a run never holds the same one twice. `(content: dungeon-keepsakes.json; design: dungeon-paths.md "Keepsakes")`

The shipped descriptions give the exact effect. This table gives the feel. The numbers stay in `dungeon-keepsakes.json`.

| Keepsake             | Shipped rule `(content)`                | In-world thing `(compendium detail, not shipped)`                                                            |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Wayfarer's Charm** | Every creature gets more Attack and HP. | A little brass charm that travellers pass from hand to hand. It has been lucky for so long that it is shiny. |
| **Lantern Moth**     | Your creatures crit more often.         | A moth that lands on a shoulder and glows. In its light, small chances turn out well.                        |
| **Tide Pearl**       | Tide creatures hit harder.              | A pearl from the Tidepools, still cool and a little damp. The Tide in it answers to Tide.                    |
| **Warm Ember**       | Ember creatures hit harder.             | A coal that never goes out and never burns the hand that carries it.                                         |
| **Clover Sprig**     | Grove creatures hit harder.             | A sprig that grew in the dungeon without any light. It does not seem to mind.                                |
| **Static Feather**   | Spark creatures hit harder.             | A feather that crackles when stroked the wrong way. The Spark creatures find it very funny.                  |
| **Lullaby Bell**     | Foes hit softer.                        | A small bell with a slow, sleepy ring. Foes do not stop, but they take their time.                           |
| **Chalk Mark**       | Foes have less HP.                      | A cross in chalk on a foe's door. It means "already tired" `(inferred)`, and nobody knows who draws them.    |

Notes:

- **The four element keepsakes** echo the four element modifiers (Flooded, Scorched, Overgrown, Stormy): one pushes a whole room, the other is carried in a pocket `(inferred)`.
- **Wayfarer's Charm** is the only keepsake that gives two things. It is the "all-rounder", and the other seven are sharper `(design)`.
- Keepsakes are the dungeon's way of saying thanks. Never write one as cursed, heavy or costly `(compendium detail, not shipped)`.

---

## Mystery rooms

A **mystery room** is a small scene with two ways to answer it. The player sees only its name on the map, and the scene and the two answers once they step in. Each answer says exactly what it does, and a gamble shows its odds. At least one answer in every room costs nothing. `(content: dungeon-events.json; design: dungeon-paths.md "Mystery rooms")`

The tone is the one of the quirks: funny, warm, never mean `(inferred)`. Nothing here is grim. The worst that happens is a scrape, and the creatures are only ever "a bit tired", "knocked out" or "sore" `(compendium detail, not shipped)`.

### Glowing Pool

- Scene `(content)`: a small pool glows softly at the bottom of the room, and the water smells like warm tea.
- Answers `(content)`: **Drink** (the team heals) or **Fill a flask** (a little Bait and scrap).
- Compendium detail: a pool that has been left on all night. It is the dungeon's nicest corner `(inferred)`. The safe answers here are both good ones.

### Loose Stones

- Scene `(content)`: the floor is a patchwork of loose stones, and something shiny winks from under one of them.
- Answers `(content)`: **Dig** (a gamble: scrap, or a bump on every creature) or **Walk on** (a little scrap).
- Compendium detail: the shiny thing is a button. It is nearly always a button `(inferred)`. The scrape is from the stones, never from a trap.

### Sleeping Beetle

- Scene `(content)`: a round beetle snores on a small pile of coins, and one of its legs twitches in a dream.
- Answers `(content)`: **Take one coin** (a little scrap) or **Take the pile** (a bigger gamble: more scrap, or the beetle wakes and the team is shaken).
- Compendium detail: the beetle is not hostile. It is a light sleeper with a hoard. The "shaken" team is the beetle's grumpy sneeze `(inferred)`.

### Old Shrine

- Scene `(content)`: a tiny shrine of stacked stones, with an empty cup at its foot. It looks like it is waiting for something.
- Answers `(content)`: **Make an offering** (the team gives up a little HP and receives a keepsake) or **Bow and walk on** (nothing happens).
- Compendium detail: the cup wants a little of the team's warmth, which is what the HP is. The keepsake is the shrine saying thank you. Bowing is polite and costs nothing `(inferred)`.

### Lost Satchel

- Scene `(content)`: a small satchel sits on a ledge, its strap tied in a knot. Someone's lunch, maybe.
- Answers `(content)`: **Peek inside** (a little scrap) or **Shake it out** (a gamble: more Bait and scrap, or only crumbs).
- Compendium detail: the satchel belongs to another explorer who went home early. Neither answer is theft, since it is clearly lost `(inferred)`.

### Echoing Well

- Scene `(content)`: a deep, round well. When you call down it, it calls back a moment later, and a little kinder.
- Answers `(content)`: **Call down** (the team heals) or **Drop in a coin** (a gamble for a keepsake).
- Compendium detail: the well answers with the voice it thinks you need. It is the dungeon's way of using the echo that Echoing rooms are named for `(inferred)`.

### Mossy Bridge

- Scene `(content)`: a narrow bridge of mossy planks crosses a dark gap. A sign, mostly moss, says: Probably fine.
- Answers `(content)`: **Cross slowly** (a little Bait) or **Run across** (a gamble: an Essence, or a tumble that tires the team).
- Compendium detail: the sign is right most of the time. The tumble ends in a soft landing, which is why it only tires the team `(inferred)`.

### Mushroom Ring

- Scene `(content)`: a ring of small mushrooms hums a tune. One of them is plainly out of key, and proud of it.
- Answers `(content)`: **Pick a few** (a little scrap) or **Dance in the ring** (a gamble: the team is refreshed, or a little worn out).
- Compendium detail: the mushrooms sing the dungeon's lullaby, off key. Dancing along is either restful or silly, and the creatures do not mind which `(inferred)`.

### Blue Chasm (a rare room)

- Scene `(content)`: a narrow wooden plank crosses a bottomless chasm whose walls are lined with pale glowing crystals. There is a valuable treasure on the other side.
- Answers `(content)`: **Cross the plank** (a gamble: the team crosses and takes the treasure, or the whole team falls and the run ends) or **Don't risk it** (nothing happens).
- It is **rare**: it is not drawn onto the day's map, and the other eight are. A room can turn into it as a player steps in (`rare` in `dungeon-events.json`), from a few depths down, and never twice in a run. `(design: dungeon-paths.md "The Blue Chasm")`
- The treasure is shown in the room before the choice, so the gamble is the player's with open eyes. It fits where the player is: gear of their depth, a blueprint a step above their best, two great supplies, or shards and glimmer of the team's elements. `(design)`
- Compendium detail: the Blue Chasm is the dungeon's one honest drop. Its walls are lined with **pale blue crystals** that glow on their own, the same cool light as the Moonlit Reef's coral and the Echoing Well's voice `(inferred)`. Nobody mined them and nobody knows who laid the plank. The crystals hum when a creature steps on the wood, and the plank is old but is _not_ rotten: the chasm simply does not care whether you cross `(compendium detail, not shipped)`.
- The fall is not a trap. Nothing in the chasm is hostile, and the team is not hurt: the dungeon carries them out the way it brought them in, tired and a little embarrassed, with half of what they had gathered `(compendium detail, not shipped)`. This is the one mystery room whose bad answer ends the run, and it is the only reason the plank is a choice at all (Misa, 2026-10-21).

Notes:

- **Names** are a descriptor and a noun, as for foes and bosses: Glowing Pool, Loose Stones, Old Shrine.
- **Voice for new events:** one scene with one small oddity, one plain safe answer and one answer with a risk or a reward. The text is at most a few sentences and speaks to "you" only through the options `(compendium detail, not shipped)`.
- **Never** make a mystery room a fight, a trap or a loss of something permanent. The worst case is HP lost for the run, never a creature, an item or a currency from the player's own stock `(design)`. **One exception, decided with Misa (2026-10-21):** the Blue Chasm's fall ends the run as a defeat. It still takes nothing from the player's own stock: a defeat keeps half the pack, and no creature is lost.
