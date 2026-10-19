# Talents

Status: written 2026-10-16 with the Creatures A step. Dev-only canon. No numbers here: values and effects live in `packages/game/src/content/data/talents.json` and `RULES.talents`; the design is `docs/design/gear-and-creatures-v2.md` section 8.

## What a talent is

- A talent is a small gift a creature is born with, named for something its line is already known for (`species-lore.json` traits, `quirks.json`). It is **content**, not lore: the name and the one-line effect are what players see (`(content)`, `talents.json`).
- Every catch rolls one from its line's pool, and one roll in twenty is **golden**: the same talent, a little stronger, in a gold frame. A golden talent stays golden in the creature's Talent Book. (`(design)`, section 8.1)
- A creature wears its talents in slots: one at catch, a second at level 20, a third at level 25 for rare and epic species. Epic and Festival species also carry one fixed **signature talent** that is never rolled and never golden. (`(design)`)
- A duplicate catch carries a talent too. The player chooses what to do with it: **Teach** it to the creature they own, **Fuse** it, **Release** it for parts, or **Keep** it as a second creature of a branching line. (`(design)`, section 8.2)

## Naming style

- Named after a behaviour or a feeling, never a stat: "Splashes First", not "Attack Burst". Two to four words, Title Case, no punctuation but a comma. `(inferred)`
- The name should make sense to a player who never reads the effect line: "Stands Close" is a Guard's cover, "Easily Distracted" is why it finds shiny things on trips.
- Talents of a line stay in that line's element and role: a Tide Setter talks about marks and puddles, a Grove Guard about cover and rest.
- Never mean. A creature can be lazy, shy or stubborn; it is never cruel. `(inferred)`

## The pools

Each line has a pool of 7 or 8. Branch forms share their line's pool, so a Sproutle's pool mixes Guard and Support talents on purpose: its talents hint which branch it wants. Every other evolving line also has a second form now (Geyserpup, Wickat, Drizzlewt, Kilnmole, Halcyray, Bloomback), but those pools were written for the first form: a talent that does nothing for the second form's role shows as idle on its card. Adding second-role talents to those pools is an open question for Misa.

### Splashet line (Tide Setter)

| Talent             | What it is about                                             |
| ------------------ | ------------------------------------------------------------ |
| Splashes First     | It jumps in before anyone has said go.                       |
| Wet Footprints     | The mark it leaves is worth following.                       |
| Bigger Splash      | The splash that leaves its mark is the big one.              |
| Puddle Hopper      | It never stays where the big splash lands.                   |
| Playful            | It just wants to hit things for fun.                         |
| First to Say Hello | It greets every place, so it learns every place sooner.      |
| Easily Distracted  | It wanders off on trips and comes back with something shiny. |
| Glides on a Breeze | Light on its feet, quick off the mark.                       |

### Cindle line (Ember Payoff)

| Talent                | What it is about                                         |
| --------------------- | -------------------------------------------------------- |
| Quick to Pounce       | The first pounce is the best one.                        |
| Warm to the Touch     | The fire it sets spreads a little further.               |
| Chases Flickers       | It loves a spark and finds the weak spot.                |
| Proud Ember           | When it hits well it makes sure everyone knows.          |
| Waits for the Moment  | Patient, then sudden, against a foe already marked.      |
| Purrs Like a Campfire | Calm near the workbench, so jobs seem to take less time. |
| Pounces When Perfect  | It saves its best pounce for a perfect moment.           |
| Fiercely Loyal        | Hits harder while a Guard stands beside it.              |

#### Mudlump and Squelch lines (Mire, design, not shipped)

Status: 2026-10-19. A design draft for the Mire content slice (`docs/design/speed-and-dodge.md` sections 3.6 and 5.3; the full text is in `docs/design/mire-content-drafts.md`). The Mudlump pool mixes a Guard and Support talents on purpose, like the Sproutle pool: its talents hint which branch it wants. Mudlump and Bogwarden are the Guard line; the Squelch line has a pool of its own (keyed `squelch`) that leans to debuff duration and power. The three below are the ones the design asks for. A full pool needs seven or eight, so the rest are for the content slice to write in the same style. `(design, compendium detail, not shipped)`

| Talent           | What it is about                                                   |
| ---------------- | ------------------------------------------------------------------ |
| Mud Off Its Back | Mud and muck slide off it. Debuffs on it are weaker.               |
| Sticks Around    | What it sticks to stays stuck. The debuffs it applies last longer. |
| Low Croak        | A low, heavy croak. The debuffs it applies stack more often.       |

The first is a Guard talent that resists debuffs (the line Clean coat); the other two are Support talents that make debuffs last longer (Lingering) and stack more often (Heavy hand). `(design)`

## Sproutle line (Grove Guard, or Support after the second branch)

| Talent                | What it is about                                       |
| --------------------- | ------------------------------------------------------ |
| Stands Close          | It keeps its neighbours near and covered.              |
| Hard to Move          | A stubborn little root that does not budge.            |
| Shy Around Strangers  | Does not like being aimed at, so aimed hits hurt less. |
| Perks Up in the Rain  | Heals better when it is looked after.                  |
| Sunny Nap             | Rests well between rooms of the dungeon.               |
| Mossy Bed             | A soft, deep coat of moss: more health.                |
| Shares the Sun        | A Support talent: it warms its neighbours.             |
| Steady Under Pressure | A Guard talent: it braces when the line is crowded.    |

### Zipmouse line (Spark Setter, or Guard after the second branch)

| Talent                | What it is about                                     |
| --------------------- | ---------------------------------------------------- |
| Zoomies               | Just fast. Acts earlier when the boss goes by speed. |
| Static Fizz           | Its sparks cash in a little bigger.                  |
| Charged Up            | The hit that leaves its mark carries the charge.     |
| Trail of Sparks       | The mark it leaves pays others who follow it.        |
| Races Anything        | It starts every fight at a run.                      |
| Scurries Off First    | Back from a trip sooner than the rest.               |
| Freezes Like a Statue | Hard to aim at when it goes still.                   |
| Big Ears              | Hears it coming: a little armor.                     |

### Mistnewt line (Tide Guard)

| Talent                 | What it is about                                  |
| ---------------------- | ------------------------------------------------- |
| Slow and Unbothered    | It does not hurry, and it does not flinch.        |
| Hides Friends in Mist  | A Guard talent: it covers its neighbours.         |
| Damp, Cool Mornings    | A fog that takes the edge off Tide hits.          |
| Calm and Patient       | All damage it takes is a little less.             |
| Drifts Without a Sound | Quick feet on a trip.                             |
| Thick Fog              | Hard to aim at in the mist.                       |
| Misty Mornings         | It remembers the places it walks through at dawn. |
| Steady Mist            | A little armor.                                   |

### Ashmole line (Ember Support)

| Talent                   | What it is about                                   |
| ------------------------ | -------------------------------------------------- |
| Warm Burrow              | Its boost warms the one it helps a little more.    |
| Toasty Paws              | It tops up its neighbours at the start of a round. |
| Cheerful in Ash          | Heals better when it is cared for.                 |
| Busy and Hardworking     | Shorter workbench jobs.                            |
| Digs for Friends         | Teaches the workbench faster.                      |
| Hoards Cosy Things       | Finds a few more parts on its trips.               |
| Tunnels Through Anything | Digs past a foe's defence.                         |

### Stormray line (Spark Payoff, rare)

| Talent                 | What it is about                           |
| ---------------------- | ------------------------------------------ |
| Bold and Showy         | It wants the crowd to see: more attack.    |
| Rides the Storm's Edge | Its Spark reactions cash in bigger.        |
| Loud, Flashy Entrance  | The first hit of a fight is a performance. |
| Fast to Strike         | Its strike hits harder.                    |
| Calm in the Eye        | All damage it takes is a little less.      |
| Lazy Wingbeats         | Back from a trip sooner.                   |
| Proud Wings            | When it lands a good hit it shows.         |
| Storm Chaser           | Hits harder against Spark foes.            |

### Mossback line (Grove Support, rare)

| Talent                 | What it is about                                   |
| ---------------------- | -------------------------------------------------- |
| Tends the Garden       | Its Grove reactions cash in bigger.                |
| Patient and Thoughtful | The hit that leaves its mark carries more thought. |
| Remembers Everything   | The mark it leaves is worth following.             |
| Loves Sunny Rocks      | Rests well between rooms of the dungeon.           |
| Hosts Small Creatures  | Area hits do less damage to the wearer.            |
| Forgives Most Things   | A burn that comes back hurts it less.              |
| Wise and Patient       | Digs past a foe's defence.                         |
| Sturdy Shell           | More health.                                       |

### Coralynx (Tide Payoff, rare, three slots)

| Talent                     | What it is about                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Quiet, Sudden Bursts       | It strikes first, and silently.                                                                                 |
| Coral Crown                | Its Tide reactions cash in bigger.                                                                              |
| Strikes from the Shadows   | When it hits well, it hits very well.                                                                           |
| Fierce About Its Territory | Hits harder against Ember foes.                                                                                 |
| Lance Practice             | Its Coral Lance strikes harder.                                                                                 |
| Elegant                    | It does nothing clumsily: more attack.                                                                          |
| Patrols at Dusk            | Not shipped as written: it is a plain Explorer XP talent for now (the Moonlit Reef bonus waits for the engine). |

### Epic and Festival lines

Epic and Festival species each have one fixed **signature talent** (never rolled, never golden) and a pool for the talents their duplicates carry.

| Line        | Signature          | What it is about                                     |
| ----------- | ------------------ | ---------------------------------------------------- |
| Solmane     | Lights Up a Room   | A lion whose mane makes every mark glow brighter.    |
| Gaiadrake   | Impossible to Stop | Nothing slows it down: it shrugs off being stunned.  |
| Aurorix     | Watcher Above      | Its Purge lasts one round longer: it keeps watching. |
| Lanternfin  | Guiding Light      | Its boost guides everyone it helps a little further. |
| Hearthshell | Fire That Lasts    | The warmth it gives lingers a round longer.          |

Their pools:

### Solmane line (Ember Support, epic)

| Talent                   | What it is about                       |
| ------------------------ | -------------------------------------- |
| Warm-Hearted             | A big heart: more health.              |
| Leads from the Front     | It is first into every fight.          |
| Regal Bearing            | Its Ember reactions cash in bigger.    |
| Mane Aglow               | Hits harder against Ember foes.        |
| Crown of Embers          | Its Ember reactions cash in bigger.    |
| Generous with Its Warmth | The mark it leaves is worth following. |
| Warm Steps               | Quick feet on a trip.                  |

### Gaiadrake line (Grove Guard, epic)

| Talent                         | What it is about                           |
| ------------------------------ | ------------------------------------------ |
| Ancient and Gentle             | A very old, very kind heart: more health.  |
| Ecosystem on Its Back          | Its Grove reactions cash in bigger.        |
| Slow to Move                   | A thick coat that takes the edge off hits. |
| Protects Everything It Carries | Area hits do less damage.                  |
| Mossy Shoulders                | Its Grove reactions grow with it.          |
| Steady Footfalls               | It saves its best for the right moment.    |
| Ancient Strength               | Quiet, old strength: more attack.          |
| Roots Run Deep                 | Hits harder against Grove foes.            |

### Aurorix line (Spark Support, epic)

| Talent                 | What it is about                          |
| ---------------------- | ----------------------------------------- |
| Graceful               | Light on its feet.                        |
| Drifts Above the Noise | Hard to aim at.                           |
| Starry Nights          | Its boost shines a little brighter.       |
| Looks After Friends    | It tops up its neighbours.                |
| Dreamy                 | Its Spark share reaches a little further. |
| Ribbon Trails          | Its Spark reactions grow with it.         |
| Quiet Gaze             | Area hits do less damage.                 |
| Star Wishes            | It packs a little more for a trip.        |

### Lanternfin line (Tide Support, epic)

| Talent                  | What it is about                          |
| ----------------------- | ----------------------------------------- |
| Gentle                  | It tops up its neighbours.                |
| Festive                 | Its Spark share reaches a little further. |
| Guides Through the Dark | Area hits do less damage.                 |
| Hums Happily            | Heals better when it is cared for.        |
| Early Sleeper           | Rests well between rooms of the dungeon.  |
| Lantern Glow            | A warm glow: more health.                 |
| Bright Lantern          | Its Tide reactions grow with it.          |
| Warm Hum                | It learns the places it visits sooner.    |

### Hearthshell line (Ember Guard, epic)

| Talent            | What it is about                           |
| ----------------- | ------------------------------------------ |
| Calm and Warm     | It braces when the line is crowded.        |
| Banked Embers     | Its Ember reactions grow with it.          |
| Reliable          | A little armor.                            |
| Hosts Friends     | It keeps its neighbours near and covered.  |
| Slow and Steady   | More health.                               |
| Shares Its Warmth | Heals better when it is cared for.         |
| Fireside Tales    | Teaches the workbench faster.              |
| Cosy Shell        | A thick coat that takes the edge off hits. |

## Held back, on purpose

These talents are in the design but need work that is not built yet, so they are **not in any pool** (the content file lists them under `deferred`, and a test keeps them out of the pools until they work).

| Talent              | Line     | What it waits for                                                                |
| ------------------- | -------- | -------------------------------------------------------------------------------- |
| Shade Napper        | Cindle   | Creature experience by activity (Creatures B): more experience for the creature. |
| Light Sleeper       | Sproutle | The engine counting silences, to ignore the first one in each fight.             |
| Gentle but Stubborn | Ashmole  | The same silence counter.                                                        |

When one is built, move it from `deferred` into its pool in `talents.json`, and the pool size check (7 or 8) will say whether another has to leave.
