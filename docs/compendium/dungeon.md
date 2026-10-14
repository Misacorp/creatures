# The daily dungeon: foes, room bosses and modifiers

Status: 2026-10-13. Covers the foes, the room bosses and the room modifiers of the daily dungeon, as in-world things.

Read `README.md` for the tags. The dungeon has no look brief in the shipped data, so every visual line here is `(compendium detail, not shipped)`.

**Source of truth:** `dungeon-foes.json` (foes and room bosses: element, gimmicks and flavour line), `room-modifiers.json` (the modifiers' rules), `glossary.json` (how they are explained to players) and `docs/design/daily-dungeon.md` (the dungeon's shape). The numbers stay in the data.

## The dungeon as a place

- A **sealed, layered place** that each explorer enters alone, once a day, with a team of three in one row. `(content: glossary.json "dungeon", "dungeon-row"; design: daily-dungeon.md)`
- Three rooms: two foe rooms, then a room boss. Creatures keep their HP from room to room, and knocked-out creatures stay out. `(content: glossary.json "dungeon")`
- The **day's modifiers are the same for everyone on the server.** Each room has one. `(content: glossary.json "room-modifiers")`
- Depth: each full clear takes you one level deeper. Every seventh depth is a **landmark**. `(content: glossary.json "depth", "landmark")`

**Compendium detail, not shipped** (place feel):

- _Mood:_ quiet, damp and a little surprising. Each room is a different weather inside one old place. Rooms are never sad; they are curious.
- _Climate:_ there is no sky. Each room has its own condition (see the modifiers below), so the dungeon's climate changes from room to room and day to day.
- _Banner brief (for art):_ a stone stair going down into the dark, with a small lantern on the first step and the four element colours faintly on the walls, one wall per element. Palette: deep slate `#2b2d3a`, lantern gold `#f2b84b`, moss `#4f8a3c`, tide `#2a9d9a`, spark `#f6e05e`. Never draw a creature in the banner.
- _Sensory:_ drip of water, the hum of sparks, warm stone, the smell of wet moss.

---

## Foes

Eight foes, two per element. Each foe is a small fight in one room. `(content: dungeon-foes.json)`

Foes have no turn order of their own: in the dungeon **your creatures always act left to right, then the foe** (`RULES.dungeon.turnOrder`, decided 2026-10-14). The raid's bosses keep theirs. `(content: glossary.json "dungeon-row")`

### Tide foes

**Puddle Imp** (no trick)

- Shipped flavour `(content)`: "Hides in puddles and splashes ankles. Not scary, just very wet."
- Compendium detail: it lives in the low corners of the dungeon, where the rain collects. Its trick is simply to be in the way.

**Drift Wisp** (Sea Mist, every third round, silences the two ends for a turn)

- Shipped flavour `(content)`: "A bit of sea fog that wandered underground and forgot the way home."
- Compendium detail: a wisp of Tidepool mist, carried into the dark. It is the Mistnewt's cousin, with less cosiness. It works best against a team that puts its weakest creatures at the ends.

### Ember foes

**Ember Mite** (Flare Up, every third round, hits the back zone)

- Shipped flavour `(content)`: "A glowing bug that nests in warm stones and pops like a tiny firework."
- Compendium detail: a small bug that gathers in warm stone. Its trick reaches the back of the row, so a back creature needs to be ready.

**Ash Sprite** (no trick)

- Shipped flavour `(content)`: "Drifts out of cold hearths in a puff of grey and sneezes sparks."
- Compendium detail: a relic of a fire that has gone out, which is why it is cold to touch and sneezes sparks. It is the dungeon's gentle foe.

### Grove foes

**Bramble Hound** (Thorn Snap, every third round, silences the two ends for a turn)

- Shipped flavour `(content)`: "A hedge that learned to run. Its bark is mostly twigs."
- Compendium detail: it is one of the Bramble Matron's children `(inferred)`. Its bark is mostly twigs, which is why it is easy to underestimate.

**Moss Lurker** (Root Grab, every second round, strikes the creature with the highest Attack)

- Shipped flavour `(content)`: "Looks like a mossy rock until it blinks. It likes the loudest visitor best."
- Compendium detail: it sits still and waits for the loudest creature to step close, then grabs it. The rule of thumb for a team is: do not walk your strongest creature in front of the rock.

### Spark foes

**Static Bat** (Zap Dive, every third round, strikes the creature with the highest Attack)

- Shipped flavour `(content)`: "Hangs from the ceiling crackling, and dives at whoever hits hardest."
- Compendium detail: a bat that hunts by the static in the air. Its trick follows the strongest hitter, the same way the Storm Sovereign's Lightning Rod does `(inferred)`.

**Flicker Swarm** (Buzz Cloud, every second round, hits the middle zone)

- Shipped flavour `(content)`: "A hundred sparks that agree on nothing except which creature to pester."
- Compendium detail: a crowd of sparks that moves as one. The middle of the row is its target, which is the only place it bothers.

---

## Room bosses

Four room bosses, one per element. Each is the last room's foe, has more HP and hits harder than the foes before it, and has its own trick. `(content: dungeon-foes.json, glossary.json "room-boss")`

Each room boss is a smaller echo of a raid boss `(inferred)`. The raid bosses are in `bosses.md`.

### Drowned Warden (Tide; Flood Gate, every third round, hits the front zone)

- Shipped flavour `(content)`: "Guards a sunken door nobody has opened. It opens its own gates for you instead."
- Compendium detail: a warden of the flooded corridor. It opens the gates for the team, which reads as a helpful boss. This is the dungeon's one "friendly" room boss `(inferred)`, which fits its opening gates.
- Echo: the Tidal Colossus's Undertow `(inferred)`.

### Slag Tyrant (Ember; Molten Shell, reflects the first reaction of every round)

- Shipped flavour `(content)`: "King of a cooled forge, wearing a crown of slag. It turns your best trick back on you."
- Compendium detail: a king who once ran a forge that has since gone cold. The crown is slag, which is what a forge leaves behind.
- Echo: the Cinder Wyrm's Backdraft `(inferred)`.

### Bramble Matron (Grove; Tangle, every second round, silences the two ends; Thorn Rain, every fourth round, hits the back zone)

- Shipped flavour `(content)`: "The old hedge that all the little hedges follow. Keep your right flank ready."
- Compendium detail: the eldest hedge in the dungeon. She has two tricks, which makes her the only room boss with a back-row attack and a silence.
- Echo: the Thornmother's Bramble Bind `(inferred)`.

### Coil Baron (Spark; Arc Lash, every round, strikes the creature with the highest Attack)

- Shipped flavour `(content)`: "A bad-tempered tangle of copper and lightning. It always goes for your best fighter."
- Compendium detail: a tangle of copper wire and lightning, which makes it the dungeon's machine-like foe. Copper and lightning is a cool, wired contrast with the Ember forge of the Slag Tyrant `(inferred)`.
- Echo: the Storm Sovereign's Lightning Rod `(inferred)`.

---

## Room modifiers

Each room rolls one modifier. It is shown before the run, and it lasts for that room only. `(content: room-modifiers.json, glossary.json "room-modifiers")`

The modifiers are **phenomena**: things the dungeon does to its rooms, the way weather does to a valley. The shipped descriptions give the exact effect. This table gives the feel. The numbers stay in `room-modifiers.json`.

| Modifier      | Shipped rule `(content)`                                          | In-world phenomenon `(compendium detail, not shipped)`                                                                                             |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flooded**   | Tide creatures hit harder.                                        | The room is under water. Tide runs strong in it.                                                                                                   |
| **Scorched**  | Ember creatures hit harder.                                       | A heat wave. The room is hot and everything burns brighter.                                                                                        |
| **Overgrown** | Grove creatures hit harder.                                       | Roots and vines have grown into the room in one night. Growth feeds the Grove.                                                                     |
| **Stormy**    | Spark creatures hit harder.                                       | Storm air. Static hangs in the room and charges the Spark creatures.                                                                               |
| **Dark**      | Your creatures crit more often.                                   | No light at all. Creatures act on instinct and land more critical hits in the dark.                                                                |
| **Thorns**    | The foe turns the first reaction of each round back on your team. | Briars grow across the room. The first reaction of each round tangles back into the team. Shipped text is `(content: room-modifiers.json thorns)`. |
| **Brittle**   | The foe has less HP but hits harder.                              | Cracked stone. The foe is fragile and it knows it, so it hits harder.                                                                              |
| **Echoing**   | Payoff creatures hit harder.                                      | Sound carries in the stone and doubles back. The creature that finishes things rings loudest.                                                      |

Notes:

- **The four element modifiers share their names with the four raid marks** `(content)`: Scorched and Overgrown are both a mark and a modifier. The overlap is on purpose. Use it when you name new modifiers.
- **Thorns** is the one modifier that behaves like a boss trick, applied to the whole room `(content: room-modifiers.json, foe_gimmick)`. It is the same idea as Cinder Wyrm's Backdraft `(inferred)`.
- **Echoing** is the one modifier that boosts a role, not an element (Payoff), so it rewards a team with a Payoff in it `(content: room-modifiers.json echoing)`. It took the place of **Fog** (2026-10-14).
- **Dark** is the only modifier that changes how the room is played, not just how hard it hits `(inferred)`.
- **Fog is retired.** It made everyone act in row order, which is now the rule in every room, so it had nothing left to do. Old runs that rolled it still show its name and text in their replays, and it is not rolled any more `(content)`. The compendium keeps the idea: a room so murky that the order is all anyone can trust.
- **No modifier changes who acts first.** The order is the dungeon's rule, said before the run ("Your creatures act left to right, then the foe."). Anything that ever changes a rule of the fight must be shown before the run, or announced when it happens if it is a mystery modifier `(decision: Misa, 2026-10-14)`.
