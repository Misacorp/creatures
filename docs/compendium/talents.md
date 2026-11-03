# Talents

Status: written 2026-10-16 with the Creatures A step. Dev-only canon. The combat v2 talents (in development, not shipped) are in their own section at the end of this file. No numbers here: values and effects live in `packages/game/src/content/data/talents.json` and `RULES.talents`; the design is `docs/design/gear-and-creatures-v2.md` section 8.

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

#### Mudlump and Squelch lines (Mire)

Status: 2026-10-19. Shipped (`talents.json`, from `docs/design/mire-content-drafts.md`). Mudlump and Bogwarden are the Guard line, so the Mudlump pool is Guard talents. The Squelch line has a pool of its own (keyed `squelch`) that leans to debuff duration and power. The three the design asked for are marked; the rest are written in the same style. `(content, compendium detail, not shipped)`

| Talent (Mudlump pool) | What it is about                                            |
| --------------------- | ----------------------------------------------------------- |
| Mud Off Its Back      | Mud and muck slide off it. Debuffs on it are weaker.        |
| Hard to Budge         | A lump that stays where it is put: more armor.              |
| Stands in the Puddle  | It stands beside its neighbours and covers them.            |
| Thick and Lumpy       | A thick, lumpy coat of peat: more health.                   |
| Shrugs It Off         | Aimed hits hurt less.                                       |
| Naps in Warm Puddles  | Rests well between rooms of the dungeon.                    |
| Stays Calm in Storms  | Steady under pressure: it takes less from the big hits.     |
| Wide as a Puddle      | It spreads out: it protects one more creature on each side. |

| Talent (Squelch pool)   | What it is about                                                   |
| ----------------------- | ------------------------------------------------------------------ |
| Sticks Around           | What it sticks to stays stuck. The debuffs it applies last longer. |
| Low Croak               | A low, heavy croak. The debuffs it applies stack more often.       |
| Hums in the Damp        | A low hum that powers up its neighbours.                           |
| Splashes the Neighbours | A little water for the creatures beside it: a small heal.          |
| Loves Big Puddles       | Heals better when it is looked after.                              |
| Hides in the Reeds      | Does not like being aimed at, so aimed hits hurt less.             |
| Finds Things in Mud     | Its trips turn up more finds.                                      |

Mud Off Its Back is the Guard talent that resists debuffs (the line Clean coat); Sticks Around and Low Croak are the Support talents that make debuffs last longer (the line Clinging) and stack more often (Heavy hand). `(content)`

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
| Soot on Its Paws         | What it sticks to a foe sticks a little deeper.    |

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
| Slips Away                 | Light on its feet: it is hit less often.                                                                        |
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
| Long Strides             | A longer stride: more Speed.           |

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

## Combat v2 talents (in development)

Status: written 2026-10-31. **Combat v2 is in development and these talents are not shipped.** They sit beside the v1 talents above and do not replace them until v1 goes. Names were approved by Misa on 2026-10-31: six were renamed, and the rest kept theirs. The text and the numbers live in `packages/game/src/combat-v2/data/talents.json`; the other combat v2 names (Knacks, keywords, rule cards) are in `combat.md`.

- A combat v2 talent is drawn from a **line pool** (the stage 1 species of the line; its second forms share the pool) and is limited to the **roles** it works for. `(design: decisions, 2026-10-27)`
- One name per effect: a talent and a gear line with the same effect share a name. Where the gear line is listed as "same name", it is the shipped line. Where a talent was renamed, the shipped gear line keeps its old name until gear moves to combat v2 and then takes the new one. `(design: decisions, 2026-10-28 and 2026-10-31)`
- Each line below gives: roles, the line pools it is in, the player text, the gear line if there is one, and a line of canon. The canon lines are `(compendium detail, not shipped)`.

### Sharp Claws

- Roles: setter, payoff.
- Line pools: Cindle, Coralynx, Solmane.
- Text `(content: combat-v2/talents.json)`: "Attack +10%."
- Gear line `(content: gear-lines.json)`: the shipped line is **Creature Attack**, a different name for the same effect.
- Canon `(compendium detail, not shipped)`: Cindle's claws, only sharper. The plain one: nothing to explain.

### Hardy

- Roles: setter, payoff, guard, support.
- Line pools: Splashet, Sproutle, Ashmole, Mossback, Gaiadrake, Aurorix, Lanternfin, Hearthshell, Mudlump, Squelch.
- Text `(content: combat-v2/talents.json)`: "Max HP +22%."
- Gear line `(content: gear-lines.json)`: the shipped line is **Creature HP**, a different name for the same effect.
- Canon `(compendium detail, not shipped)`: Tough in the plainest way. The oldest kindness in the wild is a little more of you.

### Shoulder to Shoulder

- Roles: setter, payoff, guard, support.
- Line pools: Sproutle, Zipmouse, Solmane, Hearthshell.
- Text `(content: combat-v2/talents.json)`: "+23% on its hits for each creature {Beside} it of its element, at most 2."
- Gear line `(content: gear-lines.json)`: **Shoulder to shoulder** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: It likes company of its own kind. Stand creatures of its element beside it and it hits better.

### Odd One Out

- Roles: setter, payoff, guard, support.
- Line pools: Zipmouse, Ashmole, Coralynx, Aurorix, Lanternfin, Hearthshell.
- Text `(content: combat-v2/talents.json)`: "+18% on its hits while no creature {Beside} it shares its element."
- Gear line `(content: gear-lines.json)`: **Odd one out** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: The opposite: it likes to be the only one of its kind in the row, and stands out for it.

### Edge-walker

- Roles: setter, payoff, guard, support.
- Line pools: Splashet, Stormray, Aurorix.
- Text `(content: combat-v2/talents.json)`: "+16% on its hits while it stands at a {Row end}."
- Gear line `(content: gear-lines.json)`: **Edge-walker** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: It prefers the end of the row, where there is room to move and a view out.

### Front-liner

- Roles: setter, payoff, guard, support.
- Line pools: Solmane, Gaiadrake, Squelch.
- Text `(content: combat-v2/talents.json)`: "It takes 10% less from every hit in the {Front row}."
- Gear line `(content: gear-lines.json)`: **Front-liner** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: It belongs at the front, and the front row's knocks roll off it.

### Slow Burn

- Roles: setter, payoff.
- Line pools: Stormray.
- Text `(content: combat-v2/talents.json)`: "+2.5% on its hits per round from round 2, up to +15%."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It gets into a fight slowly, and the longer it goes the warmer it gets.

### Finisher

- Roles: setter, payoff.
- Line pools: Splashet, Mossback, Coralynx, Gaiadrake.
- Text `(content: combat-v2/talents.json)`: "+55% on its hits while the boss is below a third of its HP."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It saves itself for the end. When the boss is nearly done, it is at its best.

### First Pounce

- Roles: setter, payoff.
- Line pools: Splashet, Cindle, Zipmouse, Coralynx.
- Text `(content: combat-v2/talents.json)`: "Its first hit that lands each fight deals +170%."
- Gear line `(content: gear-lines.json)`: **First pounce** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: The first pounce is the best one. Cindle already says as much in its v1 talent Quick to Pounce.

### Steady Rhythm

- Roles: setter, payoff.
- Line pools: Cindle.
- Text `(content: combat-v2/talents.json)`: "Every third hit that lands is a crit, +0.1x on crits."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It counts in threes, like a drummer, and every third hit lands with a flourish.

### Crit Chance

- Roles: setter, payoff.
- Line pools: Cindle, Stormray, Coralynx.
- Text `(content: combat-v2/talents.json)`: "+12 crit chance points."
- Gear line `(content: gear-lines.json)`: **Crit chance** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: Luck, in the plainest way.

### Amplified Crits

- Was **Crit Damage**.
- Roles: payoff.
- Line pools: Cindle, Coralynx.
- Text `(content: combat-v2/talents.json)`: "Its {Crit}s are 3x."
- Gear line `(content: gear-lines.json)`: the shipped line is **Crit damage**, the old name. It takes this talent's name when gear moves to combat v2.
- Canon `(compendium detail, not shipped)`: When it does hit well it makes sure everyone knows. Cousin of the v1 talent Proud Ember.

### Perfect Timing

- Roles: setter, payoff.
- Line pools: Zipmouse.
- Text `(content: combat-v2/talents.json)`: "After it dodges, it stores a {Sure Crit} (up to 3): its next hit that lands is a 3x crit."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It slips a hit, and answers at exactly the right moment. Cousin of the v1 talent Pounces When Perfect.

### Easily Provoked

- Was **Hold the Line**.
- Roles: guard.
- Line pools: Sproutle, Ashmole.
- Text `(content: combat-v2/talents.json)`: "When hits it {Intercept}s add up to 25% of its max HP, it stores a {Sure Crit} (3x, up to 3)."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: A Guard that takes many knocks for its friends goes a little pink, and hits back harder. A flush, never a sneer.

### Opportunist

- Roles: payoff.
- Line pools: Mossback, Gaiadrake.
- Text `(content: combat-v2/talents.json)`: "Its {Reaction} bonus +100% when it cashes a {Mark} at 2 stacks or more."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It waits for the bigger mark, and the wait is worth it.

### Quick Draw

- Roles: payoff.
- Line pools: Splashet, Stormray, Coralynx.
- Text `(content: combat-v2/talents.json)`: "+32% on a {Reaction} on a mark added since the boss's last turn."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It cashes in right after a friend has marked the boss, while the mark is still fresh.

### Potent Mark

- Was **Owner's Mark**.
- Roles: setter.
- Line pools: Splashet, Cindle, Mossback, Solmane.
- Text `(content: combat-v2/talents.json)`: "{Reaction}s on a {Mark} it left have a +12% bonus while it stands."
- Gear line `(content: gear-lines.json)`: the shipped line is **Owner's mark**, the old name. It takes this talent's name when gear moves to combat v2.
- Canon `(compendium detail, not shipped)`: A Setter whose marks carry its signature, and are worth more for it, whoever cashes them.

### Deep Ink

- Roles: setter.
- Line pools: Zipmouse, Solmane.
- Text `(content: combat-v2/talents.json)`: "Its first {Mark} each fight adds 2 more stacks."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: The first mark of a fight is pressed in hard, like a first stamp.

### Rally Cry

- Roles: setter, payoff, guard, support.
- Line pools: Cindle, Mistnewt, Mossback, Solmane, Gaiadrake, Aurorix, Lanternfin.
- Text `(content: combat-v2/talents.json)`: "+40% on its hits for the rest of the fight after a creature {Beside} it is knocked out."
- Gear line `(content: gear-lines.json)`: **Rally cry** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: When a friend beside it is knocked out, it rises to the moment.

### Momentum

- Roles: setter, payoff.
- Line pools: Splashet, Zipmouse, Aurorix.
- Text `(content: combat-v2/talents.json)`: "After it dodges, or a Guard takes a hit aimed at it, its next hit deals +38%."
- Gear line `(content: gear-lines.json)`: **Momentum** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: A dodge, or a Guard's save, sets it moving.

### Flank Guard

- Roles: guard.
- Line pools: Sproutle, Zipmouse, Mistnewt, Mudlump.
- Text `(content: combat-v2/talents.json)`: "Its {Reach} covers only its longer side (more slots to the row end; both when it stands in the middle), twice the slots, and its cover is +50%."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It stands at one end of the row and watches over the long side.

### Long Shadow

- Roles: guard.
- Line pools: Mudlump.
- Text `(content: combat-v2/talents.json)`: "Cover +20% per slot of distance, and the hits it takes for others are cut by 20% per slot."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: Its shelter reaches the farthest creatures best, as a shadow is longest toward evening.

### Shoulder Charge

- Roles: guard.
- Line pools: Mistnewt, Ashmole, Hearthshell, Mudlump.
- Text `(content: combat-v2/talents.json)`: "When it {Intercept}s, it strikes back for 45% of its Attack, ignoring armour."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: When it steps in for a friend it gives the boss a shove on the way.

### Brace

- Roles: setter, payoff, guard, support.
- Line pools: Sproutle, Ashmole, Mudlump.
- Text `(content: combat-v2/talents.json)`: "It takes 40% less from a {Wind-up} hit aimed at its slot."
- Gear line `(content: gear-lines.json)`: **Brace** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: It sees the big hit coming and sets its feet.

### Refuse to Fall

- Was **Stubborn**.
- Roles: setter, payoff, guard, support.
- Line pools: Mossback, Gaiadrake, Hearthshell.
- Text `(content: combat-v2/talents.json)`: "Once per fight (in a raid, once per weekend), a hit that would knock it out leaves it at two fifths of its max HP, or at the HP it had if that was lower."
- Gear line `(content: gear-lines.json)`: the shipped line is **Stubborn**, the old name. It takes this talent's name when gear moves to combat v2.
- Canon `(compendium detail, not shipped)`: It is knocked down once, and gets up again. Misa wanted the name Second Wind, but that is a shipped gear line with another effect.

### Catch Breath

- Roles: setter, payoff, guard, support.
- Line pools: Mistnewt, Stormray, Solmane, Gaiadrake, Lanternfin, Hearthshell, Squelch.
- Text `(content: combat-v2/talents.json)`: "Once per fight (in a raid, once per weekend), when a hit drops it below half its max HP, it heals 30% of max HP."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: A pause after a big hit, and a deep breath.

### Unbothered

- Roles: setter, payoff, guard, support.
- Line pools: Mistnewt, Aurorix.
- Text `(content: combat-v2/talents.json)`: "It cannot be {Silenced}, and has +3% Attack and +6% Max HP."
- Gear line `(content: gear-lines.json)`: **Unbothered** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: Nothing hushes it, and being calm makes it a little stronger and sturdier.

### Culling Strike

- Was **Cull**.
- Roles: setter, payoff, guard, support (any hit can land it).
- Line pools: Mossback, Stormray, Hearthshell, Lanternfin, Squelch (one line for each role and each element; Misa, 2026-11-03).
- Text `(content: combat-v2/talents.json)`: "A hit that leaves the boss below 5% of its full HP defeats it. The HP removed counts as the killing blow, not as damage."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: A last, light touch that ends a fight already won. It is an enabler: effects are meant to stack on it later (killing-blow triggers), so it is not meant to be used alone, and a weak result for it alone is not a reason to buff it. (decision `2026-11-03-culling-strike-stays-as-an-enabler`)

### Wicked

- Was **Heavy Hand**. Its text now says "its debuffs", not Mired, because it covers every debuff (Mired is the only one today).
- Roles: guard, support.
- Line pools: Mudlump, Squelch.
- Text `(content: combat-v2/talents.json)`: "Each debuff it puts on the boss has an 80% chance to add 1 extra stack."
- Gear line `(content: gear-lines.json)`: the shipped line is **Heavy hand**, the old name. It takes this talent's name when gear moves to combat v2.
- Canon `(compendium detail, not shipped)`: A little sly, in the playful way: what it sticks to the boss tends to stick a little deeper. Never cruel. `(inferred)`

### Clinging

- Roles: guard, support.
- Line pools: Mudlump, Squelch.
- Text `(content: combat-v2/talents.json)`: "While it stands, {Mired} fades only every second round, and each stack counts for half as much again."
- Gear line `(content: gear-lines.json)`: **Clinging** (same name as the shipped gear line).
- Canon `(compendium detail, not shipped)`: It sticks to the boss like mud, and the Mire's gift is that it stays stuck.

### Bright Boost

- Roles: support.
- Line pools: Mistnewt, Ashmole, Stormray, Aurorix, Squelch.
- Text `(content: combat-v2/talents.json)`: "Every second {Boost} it gives is doubled."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: Every second boost shines twice as bright: a rhythm instead of a lucky chance.

### Kindred Boost

- Roles: support.
- Line pools: Sproutle, Ashmole.
- Text `(content: combat-v2/talents.json)`: "Its {Boost} +26% on creatures of its own element."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It cares most for its own kind.

### Triage

- Roles: support.
- Line pools: Sproutle, Lanternfin.
- Text `(content: combat-v2/talents.json)`: "Its heal on the creatures {Beside} it goes to the most hurt one, 100% bigger."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: It looks after whoever needs it most.

### Overheal Spill

- Roles: support.
- Line pools: Mistnewt, Lanternfin.
- Text `(content: combat-v2/talents.json)`: "Its healing past full HP passes to the most hurt creature in the row of the one it healed."
- Gear line: none.
- Canon `(compendium detail, not shipped)`: Nothing is wasted: what is too much for one creature spills over to the most hurt.
