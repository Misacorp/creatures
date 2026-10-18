# Attack patterns: varied boss and foe attacks

Status: **shipped** (PR #24), 2026-10-16, except section 7 (support reach shapes), which is still open. The design and simulator prototype were written on 2026-10-14: an in-memory fork of the fight engine in the session scratchpad, run through Vite SSR like `packages/sim/scripts/*.mjs`. Misa's brief:

> vary up the attack patterns of raid bosses. Instead of single hits, they could hit entire rows at once quite often, drop "artillery" on X random creatures in any space, deal high damage hits to single creatures that radiate a portion of the damage to their neighbours, etc. These positional elements and adjacency rules would warrant placing creatures to cover more scenarios. I'd be interested in seeing if the dungeon could also use some form of varying attack patterns from enemies.

**Update, later the same day: Misa answered the questions** (section 7). Harder hits and knock-outs are a direction to lean into, the randomness is fine, a landmark boss is fixed and announced, and **the Support is not a ward**: it is one role with an effect that follows its element (section 1 and 4.7). Every number that used the old ward was re-run with it off, so the tables below are current.

Read first: `docs/compendium/bosses.md` and `dungeon.md` (voice and lore), `decisions.md` (combat, raid, dungeon), and the files named in section 6. Build slices are in section 6, the questions for Misa in section 7.

## Summary for Misa

**What it is.** Bosses stop hitting one creature at a time. Each of the four raid bosses keeps its trick and learns two new moves, drawn from seven attack shapes:

- **Sweep:** a wave hits a whole row. The Colossus's Undertow stays, and a bigger Great Wave rolls through the rows.
- **Barrage:** shells land on 2 to 6 random creatures anywhere in the line (the Wyrm's Cinder Fall).
- **Slam:** one huge hit, and the creatures right beside the victim take a share (the Wyrm's Coil Crush, the Sovereign's Thunderclap).
- **Lance:** a lane that cuts through every row, front to back (the Colossus's Riptide).
- **Chain:** hits your strongest, then jumps to the next strongest (the Sovereign's Lightning Rod, now arcing).
- **Pincer:** hits both ends of every row (the Thornmother's Briar Pincer).
- **Charge:** a sweep, barrage, slam, lance or pincer, announced a round ahead with the victims marked on the stage (the Colossus's Great Wave, the Thornmother's Seed Burst).

Every move is shown before it happens: on the boss card before the fight, in "Next round: ..." on the stage, and as red marks on the exact creatures in the half second before it lands. Random moves are announced as random ("2 to 6 random creatures"); the victims show when the shells fall.

**Why formation starts to matter.** Each shape has a different answer, so no single formation wins:

- A **Lance** stops at the first Guard in its lane, so Guards at the front of the row blunt it.
- A **Slam, Chain or Barrage** is best met with Guards spread through the rows, so each fragile creature stands next to one.
- A **Pincer** only hits the row ends, so keep your best hitters off the ends.
- A **Sweep** or a **Charge** is the Shield Wall's day: the row is named a round ahead.

**Two role changes make this work** (the role list stays the same):

- **Guard:** keeps taking hits aimed at one creature, and now creatures standing right beside a Guard take 40% less from area attacks (sweeps, shells, splash). A Lance stops at it. A Guard protects itself and others.
- **Support:** one role, with an effect that follows its element, on top of the +15% next-hit buff every Support keeps. **Ember** stokes the buff (+25%), **Spark** overcharges reactions its neighbours cash in (+15% bonus damage), **Tide** heals its neighbours 4% a round and clears their silence, **Grove** heals them 6% a round. Today only Ember (Ashmole, Magmole), Spark (Aurorix) and Tide (Lanternfin, Festival-only) have a Support species; **Grove has none**.

**What the simulator says** (section 4):

- **The raid stays in its win band.** With each boss's HP and head-count exponent re-fitted, the finale win rate matches today's within about two points at every party size (3 players 79% today and 79% with patterns, 5 players 69% and 67%, 7 players 59% and 59%, 10 players 40% and 40%, 15 players 40% and 39%). Boss HP moves by between -11% and +4%.
- **The boss now actually threatens.** It takes about 30% of the team's HP in a finale (about 11% to 13% today) and knocks out about 16% of the creatures in a typical party (about 6% today). Knock-outs last for that stage only; every stage starts at full HP.
- **A Guard earns its place, if players place it well.** Switching the whole Guard role off costs the finale 0.0 points today with clumped Guards and 1.2 with patterns, but **4.0 to 5.2 points once the Guards are spread through the rows** (1.9 today). Guard, Support and Shield Wall together are worth **4 points with clumped Guards and about 11 points with good formation** (2 and 5 today).
- **A Support earns its place, mostly in the dungeon.** In the dungeon, at depth 14, a Support in the middle is a little behind a second payoff (Spark -2 points, Grove -3, Tide -7, Ember -8) and a little ahead of it at a landmark (+8, +5, +3, +3); none is dominant at the proposed dials, and none is useless. In the raid a Support reaches two of 22 to 45 creatures: when every player brings one, its buff is worth 5 to 6 points and beats a third attacker by 3 to 6, but its element effect adds only 0.4 to 2.4 points on top. The simulator's players seldom bring one (1 to 3% of creatures).
- **Some effects are dials you can overshoot.** Grove healing at 12% a round and Spark overcharge at +30% each beat a Guard in the middle in the dungeon (a Support that does everything). Four Spark "mark tricks" were tried and dropped (one dominates the raid and backfires in the dungeon, one is a trap on the end slot, two lose points or do nothing).
- **Formation is worth more than any role.** Spreading the Guards alone lifts the win rate by about 12 points, even against today's bosses (more reactions per round: 3.8 instead of 3.3).
- **Dungeon:** a lighter version (one pattern per foe; room bosses keep their trick and gain one; every 7th depth the room boss gains a charged signature move, and that boss is fixed and announced). At depth 14 a Guard on the left beats a second payoff by 13 points (6 today) and at a landmark by 21 (7 today). Foe HP -6% keeps today's clear rates.

**Two findings for the lead** (section 5): at higher Boss Ranks the patterns need a cap on one hit, and the Cinder Wyrm's balance leans entirely on its reflect. Both are in the build plan.

**What I need from you:** two new short questions in section 7 (the Grove Support species, and how wild Spark may get), each with a recommended answer.

## 1. How a hit works (the vocabulary)

The words are the ones to use in the glossary and the UI. Every number was run in the prototype.

- **Row.** The raid's zone: Front, Middle or Back (the stage draws zones as rows). In the dungeon every row is one creature. A row's creatures stand in slot order, left to right.
- **Beside.** The slot directly left or right of a creature (`neighbours()` in `zones.ts`). _Note: in the raid, beside stops at row edges (`zoneNeighbours`), for the Support and the Guard's cover; only the dungeon uses the plain line. See the 2026-10-14 decision "Raid neighbours stop at row edges" in `decisions.md`, and `combat-rules.md` 1.5._
- **Lane.** The same slot position in every row: the creature at slot k of Front, of Middle and of Back. In a raid row of `3N` creatures a lane has three creatures.
- **Aimed hit.** One target: the plain attack, a strike on the strongest, the first hit of a Slam or a Chain. A Guard can take it for the target.
- **Area hit.** Every other hit: sweeps, shells, splash, the jumps of a chain, a lance, a pincer. A Guard cannot take it, but covers its neighbours.
- **Direct hit.** Reflected damage (Backdraft). Nothing intercepts or covers it, as today.

**Guard (v2).** Four short rules, one idea (the Guard stands in front of its friends):

1. 30% more HP (unchanged).
2. A hit aimed at a non-Guard goes to a living Guard in the same row (the dungeon: a Guard beside it), as today.
3. **Cover (new):** a creature right beside a living Guard takes 40% less from area hits. `RULES.combat.coverBp = 4000`. The prevented damage is credited to the Guard.
4. **A Lance stops at the first Guard in its lane (new):** the Guard takes it, creatures behind it are spared.

One variant was tried and dropped: sending an aimed hit to the **nearest** Guard in the row instead of the first. It moved the finale by 0.0 points, so it is not worth a rule.

**Support (v2): one role, an effect that follows its element** (Misa: a Guard protects, a Support does something else). Every Support keeps the shared base, the +15% next-hit buff for its neighbours (a living, non-silenced Support, at round start). On top, its element gives it one more effect, in `RULES.combat.supportFx` (a table by element, so it can be tuned without engine changes):

| Element | Effect (the dial in brackets)                                                                                                    | Species that carry it today                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Ember   | **Stoke:** the neighbours' buff is stronger (+25% instead of +15%)                                                               | Ashmole, Magmole (common; Ashmole is catchable)     |
| Spark   | **Overcharge:** a reaction cashed in by a neighbour deals more bonus damage (+15% of the reaction's bonus damage)                | Aurorix (epic, catchable)                           |
| Tide    | **Mend:** heals each neighbour 4% of its max HP at round start (capped at what is missing, never revives) and clears its silence | Lanternfin (epic, **Festival-only**, not catchable) |
| Grove   | **Mend:** heals each neighbour 6% of its max HP at round start (capped at what is missing, never revives)                        | **none: no Grove Support species exists**           |

Healing is credited to the Support as `supportCredit` (the HP actually restored). The old idea of a **ward** (the first hit each neighbour takes each round is 40% weaker) was drawn up first and is **rejected** by Misa: it made the Support a second Guard. Section 4.7 shows what the four effects are worth and what was tried and dropped (Spark mark tricks that backfire or dominate).

**Splash.** A Slam's victim takes the full hit; each living creature beside the one that actually took it (the victim, or the Guard that stepped in) takes `splashBp` of the hit's damage as an area hit. Cover and Shield Wall apply to the splash.

**Shield Wall** is unchanged (one row, 50% less, for a round) and applies to every pattern that hits that row. Its default row and round come from the boss's first zone hit, so `firstZoneHit` in `fight.ts` must learn the new row-hitting ops (slice 3).

## 2. Pattern catalogue

Seven patterns. Powers are percent of boss Attack **per creature hit**, before crits, covers and Shield Walls. Boss Attack is about 72 at a typical Boss Rank (5) and creatures have about 430 HP, so 100% is about a sixth of a creature's HP. The ops are new gimmick ops (section 6 has the schema); `hit_zone`, `silence_ends` and `reflect_first_reaction` are unchanged, `strike_highest_atk` gains optional fields.

| #   | Pattern     | Shape                                                                                    | Aimed or area               | Randomness                                     | Used by (nominal)                                    |
| --- | ----------- | ---------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| 1   | **Sweep**   | one or all rows, walking from row to row on each firing                                  | area                        | none                                           | Colossus: Undertow (kept), Great Wave (charged)      |
| 2   | **Barrage** | 2 to 6 random creatures anywhere, each once                                              | area, not interceptable     | partial shuffle from dice drawn at round start | Wyrm: Cinder Fall. Thornmother: Seed Burst (charged) |
| 3   | **Slam**    | one heavy hit, splash to the creatures beside the victim                                 | aimed, then area for splash | the victim by `aim`; `random` uses one die     | Wyrm: Coil Crush. Sovereign: Thunderclap             |
| 4   | **Lance**   | one lane through all rows, softer each row                                               | area, a Guard stops it      | the lane: one die                              | Colossus: Riptide                                    |
| 5   | **Chain**   | the strongest, then jumps to the next strongest                                          | first hit aimed, jumps area | none                                           | Sovereign: Lightning Rod                             |
| 6   | **Pincer**  | the first and last creature of every row                                                 | area                        | none                                           | Thornmother: Briar Pincer                            |
| 7   | **Charge**  | a sweep, barrage, slam, lance or pincer, announced a round ahead with the victims marked | as the pattern inside       | the pattern's dice, drawn at the announcement  | Colossus: Great Wave. Thornmother: Seed Burst        |

### 2.1 Sweep ("the wave rolls on")

- **Mechanic.** Every living creature in one row takes `power`. `rows` is a walk: the first firing hits `rows[0]`, the next `rows[1]`, and so on, round again; `all` is every row. The row of firing n is `rows[(n - 1) mod length]`, so the content and the round number name it: no dice, and the forecast can say it.
- **Damage share.** Undertow stays 80% on the Front row every 3 rounds. Great Wave (charged, every 5): 320% on Middle, then Back, then Front.
- **Telegraph.** _Card:_ a wave glyph, the move's name, "Every 3 rounds: hits every creature in the front row for 80% of its attack." _Forecast:_ "Next round: Undertow hits FRONT" (today's wording) and "Great Wave sweeps the MIDDLE row". _Wind-up:_ the row's outline (today's zone telegraph).
- **Counters.** _Guard:_ cover for the creatures beside it, and its HP. _Support:_ a Grove or Tide Support heals the chip back. _Ability:_ Shield Wall on the named row, fired a round ahead. _Placement:_ a Guard every third slot, so every fragile creature stands beside one.
- **Engine shape.** `{ op: 'sweep', rows: ('front'|'middle'|'back'|'all')[], power }`. `hit_zone` stays as it is.

### 2.2 Barrage ("shells on any space")

- **Mechanic.** `count = clamp(ceil(living x shareBp / 10000), min, max)`. That many distinct living creatures, picked by a partial Fisher-Yates shuffle from dice drawn at the start of the round, each take `power`. **Fairness rules** (measured in 4.5): a creature cannot be hit twice in one volley; a creature hit by this gimmick's last volley is skipped unless fewer than `count` others live; `max` caps the volley at 6, so a 15-player row gets a readable number of marks. A shell is not interceptable (nothing can catch a falling shell), but cover applies.
- **Damage share.** Cinder Fall: 130% each, 12% of the living creatures (2 to 6), every 2 rounds. Seed Burst (charged, every 5): 360% each, 15% of the living creatures (3 to 6).
- **Randomness and how it is drawn.** At the start of every round of a fight whose boss has a pattern op, the engine draws 40 uniform integers in [0, 1,000,000) from the fight's RNG, after every die that already existed. A boss without patterns draws exactly what it draws today, so stored fights replay unchanged. A barrage reads as many as it needs. The fight's seed is a fresh `crypto.getRandomValues` draw when the fight starts, as for crits, so nothing a player can see or compute names a shell's target before the round.
- **Telegraph.** _Card:_ a scatter glyph; "Every 2 rounds: 2 to 6 random creatures take a hit of 130% of its attack. Never the same creature twice running." _Forecast:_ "Next round: Cinder Fall drops embers on 2 to 6 random creatures" (the count depends on who is still up, so the range is the honest wording). _Wind-up:_ red reticles on exactly the chosen creatures for 600 ms, then the hits.
- **Counters.** _Guard:_ cover. _Support:_ a Grove or Tide Support heals the chip back. _Placement:_ spread Guards. _Ability:_ none (random); only the charged version can be answered by a Shield Wall, because its marks show a round ahead.
- **Engine shape.** `{ op: 'barrage', shells: { min, max, shareBp }, power }`.

### 2.3 Slam ("a hit you feel next door")

- **Mechanic.** The victim is chosen by `aim`: `front` (the front-most living creature, as the plain attack picks), `strongest` (highest Attack), or `random` (one die). It is an aimed hit, so a Guard takes it instead if the victim is not a Guard. The creature that takes the hit is the **impact**. Each living creature beside the impact takes `splashBp` of the hit's damage (before crits and reductions) as an area hit.
- **Damage share.** Coil Crush: 310% on the front-most, splash 45% (140%), every 4 rounds. Thunderclap: 340% on the strongest, splash 45%, every 4 rounds.
- **Telegraph.** _Card:_ a fist-and-ripples glyph; "Every 4 rounds: hits your strongest creature for 340% of its attack. The creatures beside it take 45%." _Forecast:_ "Next round: Thunderclap slams your strongest, and splashes its neighbours" (the stage does not know the strongest, as for strikes today). _Wind-up:_ a reticle on the victim and small rings on the two neighbours, re-aimed to the Guard if one steps in.
- **Counters.** _Guard:_ intercept (the Guard takes the slam, and the splash spreads from where the Guard stands); the Guard's neighbours are covered, so the splash is 40% lighter there. _Support:_ a Grove or Tide Support heals the survivors. _Ability:_ Shield Wall on the victim's row. _Placement:_ do not stand two key payoffs side by side; a Guard in each row.
- **Engine shape.** `{ op: 'slam', aim: 'front'|'strongest'|'random', power, splashBp }`.

### 2.4 Lance ("a lane through the whole line")

- **Mechanic.** A lane is picked (`random`: one die over the row's width; `strongest`: the lane of the highest-Attack creature). The creature at that slot of Front, Middle and Back takes `power`, then `power x falloffBp`, then that again: Riptide 200%, 160%, 128% (falloff 80%). A Guard in the lane takes its hit and **stops the lance**. An empty or knocked-out slot is passed through.
- **Telegraph.** _Card:_ an arrow-through-rows glyph; "Every 4 rounds: one lane of creatures, front to back, takes 200%, then 160%, then 128% of its attack. A Guard stops it." _Forecast:_ "Next round: Riptide cuts a lane through every row". _Wind-up:_ reticles on the (up to three) creatures and a thin beam through them. The lane is not named a round ahead (it is random), only that a lance comes.
- **Counters.** _Guard:_ a Guard at the **front** slot of a lane blocks everything behind it (measured on a Lance alone: Guards clumped at the front of the row cut its damage by 40%, spread Guards by 31%). _Support:_ none. _Ability:_ none.
- **Engine shape.** `{ op: 'lance', lane: 'random'|'strongest', power, falloffBp }`.

### 2.5 Chain (the "focus the strongest" family)

- **Mechanic.** Today's strike on the highest Attack, with jumps. The first hit is aimed at the strongest living creature (ties: lower slot), so a Guard in its row takes it. Jump k (1 to `jumps`) hits the (k+1)-th strongest living creature as an area hit at `power x decay^k`. The same creature is never hit twice.
- **Damage share.** Lightning Rod: 170% on the strongest, then 94%, then 51% (decay 55%), every round. Today it is 120% on the strongest only.
- **Variants** (same fields, not prototyped): a `pick: 'lowest_hp'` strike ("culling": the finisher, aimed at the creature with the lowest HP share), and a random jump order for dungeon foes.
- **Telegraph.** _Card:_ today's strongest-strike glyph with a spark arc; "Every round: strikes your highest-attack creature for 170%, then jumps to the next two (94%, 51%)." _Forecast:_ "Next round: Lightning Rod strikes your strongest, then jumps twice". _Wind-up:_ a reticle on the target and arcs to the jump creatures.
- **Counters.** _Guard:_ intercepts the first hit (the biggest part of the Guard's value in the raid: 4.3). _Support:_ none. _Placement:_ a Guard in the row of your strongest creature; spread the top Attacks across rows so a chain does not take all three.
- **Engine shape.** Extend `strike_highest_atk` with optional `jumps` (0 to 3, default 0) and `decayBp` (default 5500). Defaults keep today's behaviour exactly.

### 2.6 Pincer ("the vines close on both ends")

- **Mechanic.** The first and the last living creature of every row (`scope: 'rows'`), or of the whole row (`scope: 'row'`, for the dungeon), take `power` as area hits. A one-creature row is hit once. That is six hits whatever the party size, so it is the pattern that hits a small party's share hardest (4.2 re-fits for it).
- **Damage share.** Briar Pincer: 220%, every 3 rounds.
- **Telegraph.** _Card:_ a two-arrows-closing glyph; "Every 3 rounds: the first and last creature of every row take 220% of its attack." _Forecast:_ "Next round: Briar Pincer closes on the ends of every row" (with the end markers the Bramble Bind forecast already draws). _Wind-up:_ reticles on up to six creatures.
- **Counters.** _Placement first:_ keep the creatures you cannot lose off the row ends. In the prototype, a formation with payoffs off the ends and Guards spread cuts a pincer's knock-outs from 11.6% (Guards clumped at the front) to 6.6%. _Guard:_ a Guard on an end has +30% HP but gets no cover, and it is hit every time, so Guards placed on every row end do worse than Guards spread (13.8% against 7.1% knock-outs); a Guard's use is **beside** an end creature. _Support:_ a Grove or Tide Support beside an end creature heals it.
- **Engine shape.** `{ op: 'pincer', scope: 'rows'|'row', power }`.

### 2.7 Charge ("the sea rears")

- **Mechanic.** A wrapper. `then` is a sweep, barrage, slam, lance or pincer; the gimmick's `trigger` is the **landing** round. At the start of the round before (`landing - 1`), after the dice and before abilities, the engine selects the targets (drawing dice for random patterns) and emits a `charge` event naming the creatures (and rows). At the landing round the named creatures are hit. A creature that fell in between is skipped (the hit fizzles, no re-aim). A Shield Wall fired in the announce round takes effect from the round after, which is exactly the landing round, so it works. A charge needs `every >= 2` (it cannot land in round 1).
- **Telegraph (two rounds of notice).** _Card:_ the inner pattern's glyph with an hourglass; "Every 5 rounds, announced a round ahead: ...". _Forecast, the round before the announce:_ "Next round: Seed Burst is gathering". _Round of the announce:_ amber marks stay on the victims (and the row outline for a sweep) and the forecast reads "Next round: Seed Burst lands on the marked creatures"; the marks come from the `charge` event, so `bossWarnings` stays a pure function of content and round. _Wind-up and hit:_ as the inner pattern.
- **Counters.** All the inner pattern's, plus the one that was missing: the victims and rows are known, so a **Shield Wall fired in the announce round** halves a charged sweep on its row.
- **Engine shape.** `{ op: 'charge', then: sweep | barrage | slam | lance | pincer }` (the `then` object has no id, name or trigger of its own; a charged strike is possible and was not prototyped).

## 3. Who gets what

### 3.1 Raid bosses

Names checked against `bosses.json` and the compendium: Tidal Colossus (Tide, left to right), Cinder Wyrm (Ember, by speed), Thornmother (Grove, right to left), Storm Sovereign (Spark, left to right). Every boss keeps its existing trick and turn order and gains two moves. The names follow each boss's lore: the Colossus's long arms drag; the Wyrm's frill sheds embers and its body coils; the Thornmother mothers seeds and scoops the party with her vines; the Sovereign picks out the strongest and looks down on everyone.

| Boss            | Existing, kept                           | New 1                                                         | New 2                                                                     | Rounds (of 12) with a pattern landing            |
| --------------- | ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| Tidal Colossus  | Undertow (sweep Front, 80%, every 3)     | **Riptide:** lance, random lane, 200% / 160% / 128%, every 4  | **Great Wave:** charge, then a sweep Middle, Back, Front at 320%, every 5 | 3, 4, 5, 6, 8, 9, 10, 12 (8)                     |
| Cinder Wyrm     | Backdraft (reflect the first reaction)   | **Cinder Fall:** barrage, 2 to 6 shells, 130% each, every 2   | **Coil Crush:** slam on the front-most, 310%, splash 45%, every 4         | 2, 4, 6, 8, 10, 12 (6; 4, 8 and 12 have both)    |
| Thornmother     | Bramble Bind (silence the ends, every 2) | **Briar Pincer:** pincer on every row, 220%, every 3          | **Seed Burst:** charge, then a barrage, 3 to 6 shells, 360% each, every 5 | 3, 5, 6, 9, 10, 12 (6)                           |
| Storm Sovereign | Lightning Rod (becomes a chain)          | **Lightning Rod:** chain, 170% then 94% then 51%, every round | **Thunderclap:** slam on the strongest, 340%, splash 45%, every 4         | every round (the chain); Thunderclap on 4, 8, 12 |

Rules for choosing the periods (a content test, slice 4): **no round has more than two pattern actions**, and none lands in round 1. The periods 2, 3, 4 and 5 were picked because their least common multiple is not 12. With 3, 4 and 6 (the first draft) round 12 held three attacks on the Colossus, and with 3, 2 and 4 it did on the Thornmother. Phases 1 and 2 (10 rounds) use the same boss, so they see these moves too.

How often: the boss does 0.9 things besides its plain attack in a typical round (0.5 today). The Colossus hits whole rows on 6 of 12 rounds (Undertow and Great Wave), which is "quite often" in Misa's words; the Wyrm and Thornmother mix 2 to 3 kinds of attack.

### 3.2 Dungeon: foes and room bosses

The dungeon stays simple. Foes always act left to right (the parallel change), the row is three creatures, and a Guard covers what is **beside** it (`guardReach: 'adjacent'`; cover and splash use the same adjacency). Patterns are lighter:

- **Four of the eight foes get one pattern each.** The others keep their trick, or have none (Puddle Imp and Ash Sprite are the dungeon's gentle foes in the compendium).
- **Room bosses keep their old trick and gain one pattern.**
- **Every 7th depth (a landmark) the room boss also gains a charged signature move**, announced a round ahead, so a landmark is a planning day.

| Foe or room boss          | Old trick                            | New (powers as run in the prototype)                                                             | Pattern            |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------ |
| Ember Mite                | Flare Up: hits the back creature     | **Flare Up:** pops on 1 random creature, 100%, every 2 rounds                                    | barrage (1 shell)  |
| Moss Lurker               | Root Grab: strikes the strongest     | **Root Grab:** grabs the strongest, 75%; the roots spread to the creatures beside (40%), every 2 | slam               |
| Static Bat                | Zap Dive: strikes the strongest      | **Zap Dive:** the strongest at 85%, arcs to one more at 51%, every 3                             | chain (1 jump)     |
| Flicker Swarm             | Buzz Cloud: hits the middle creature | **Buzz Cloud:** pesters 1 random creature, 70%, every 2                                          | barrage (1 shell)  |
| Drift Wisp, Bramble Hound | silence the two ends                 | unchanged                                                                                        | none               |
| Puddle Imp, Ash Sprite    | none                                 | unchanged                                                                                        | none               |
| Drowned Warden (boss)     | Flood Gate: hits the left creature   | **Flood Gate:** the gates open on the whole row, 50% each, every 3                               | sweep, all rows    |
| Slag Tyrant (boss)        | Molten Shell (reflect)               | keeps Molten Shell. **Anvil Fall:** drops on the left creature, 145%, splash 45%, every 3        | slam               |
| Bramble Matron (boss)     | Tangle (silence), Thorn Rain (back)  | keeps Tangle. **Thorn Rain:** 2 random thorns, 75% each, every 3                                 | barrage (2 shells) |
| Coil Baron (boss)         | Arc Lash: strikes the strongest      | **Arc Lash:** the strongest at 60%, arcs to one more at 36%, every round                         | chain (1 jump)     |

**Landmark signatures** (the room boss at depth 7, 14, 21, 28, ...; each lands every 4 rounds and is announced a round ahead): Drowned Warden **Sluice Surge** (whole-row sweep, 95%); Slag Tyrant **Slag Spill** (slam on the strongest, 240%, splash 50%); Bramble Matron **Briar Cage** (pincer on the two ends, 130%); Coil Baron **Overload** (slam on the strongest, 220%, splash 50%). Names follow the compendium: Warden's gates, the Tyrant's slag, the Matron's thorns, the Baron's copper.

**How a pattern is communicated** (foes are rolled from the run's seed, so they are hidden before the run):

1. **Before the run.** The day's three modifiers, as today. New: a **landmark depth names its boss** on the pre-run card ("Depth 14, a landmark: the Slag Tyrant waits. It winds up Slag Spill a round ahead."). For that the landmark boss becomes a fixed pick per landmark (depth 7 Drowned Warden, 14 Slag Tyrant, 21 Bramble Matron, 28 Coil Baron, then round again) instead of a draw from the run's seed. A landmark becomes a planning day: a Guard on the left, not a second payoff.
2. **Room banner, when a room opens.** The banner shows the foe, its element and the room's twist today; it gains the trick's glyph, its name and one line in the dungeon's row wording ("Flare Up: pops on one random creature").
3. **"Next round" forecast and wind-up marks.** The stage's existing forecast and telegraph, in the `row` wording ("Anvil Fall hits the left creature and splashes the middle").
4. **In the replay.** The same.

## 4. Simulator prototype results

### 4.1 What was run

- **Engine.** An in-memory fork of `packages/engine/src/fight.ts` with the new ops and rules behind switches. With every switch off it is **identical to the shipped engine on 480 of 480 fights** (event logs compared; three stages, four bosses, 40 rosters), which is the evidence slice 0 can keep every stored fight replaying. Hand-made fights (a row of nine, exact numbers, no luck) checked the arithmetic of splash, cover, ward, lance and charge.
- **Raid rosters.** The simulator's economy: 8 simulated servers for each of 5 server sizes (3, 5, 7, 10 and 15 players), snapshots at weeks 4 and 8, 2 sign-up draws each, so 160 rosters. Sign-ups, boss rank (`placementRank`), crits (players and boss, 5% and +50%), abilities and all three stages (the boss pool and the adaptation carry over) play as the raid sweep plays them. A cell is rosters x 4 bosses x seeds (6 to 12 per roster): 1,500 to 6,000 finales. Pooled paired comparisons (the same rosters and dice with one switch changed) resolve about half a point; a single cell is good to about two.
- **Seeds.** Economy `pat:econ:<size>:<0..7>`; sign-ups `pat:case:...`; the tuning used its own fight seeds (`t13`) and the numbers below use fresh ones (`fresh`, `F5`, `F11`, `e19`, ...). The rosters are the same in the tuning and the verification; only the dice differ. Scripts and logs are in the session scratchpad (`patterns/exp*.ts`).
- **Dungeon.** The earlier role study's team recipes (setter left, X in the middle, payoff right; depth, level, fusion and gear of the economy sim's medians), foes always left to right, 2,000 runs per cell, foe patterns as in 3.2.
- **Limits.** Players use the simulator's default formation (`autoPlace`: Guards in the front slots) unless a row says otherwise. The sim's players bring their three highest-power creatures, so Supports are only 1 to 3% of raid creatures; a "both" population (every player brings a Guard and a Support when they own one) shows what a Support is worth when it is there.

### 4.2 Win rate by party size, and how it was held

Finale win rate and what the boss does, today's bosses against the patterned bosses with HP and exponent re-fitted (fresh seeds, 12 per roster and boss, 1,536 finales per row; the finale played from the boss pool that Phases 1 and 2 leave):

| Server size (players signed) | Win today | Win with patterns | Creatures knocked out, today to patterns | Team HP lost, today to patterns |
| ---------------------------- | --------- | ----------------- | ---------------------------------------- | ------------------------------- |
| 3 (2.7)                      | 78.8%     | 78.8%             | 9.7% to 22.0%                            | 16.8% to 36.9%                  |
| 5 (4.4)                      | 68.9%     | 66.8%             | 7.9% to 20.8%                            | 15.2% to 39.6%                  |
| 7 (6.5)                      | 58.9%     | 59.1%             | 6.9% to 17.1%                            | 13.2% to 33.3%                  |
| 10 (9.1)                     | 40.0%     | 40.0%             | 4.9% to 13.8%                            | 11.0% to 30.8%                  |
| 15 (13.5)                    | 39.6%     | 39.0%             | 3.9% to 10.7%                            | 8.8% to 26.4%                   |

- **Bands** (`packages/sim/targets.json`): typical group (5 to 10 signed) 50.8% today and 49.9% with patterns (band 40% to 60%); 15-player group (11 to 15 signed) 39.6% and 39.0% (band 35% to 65%). By boss, typical group: Colossus 43.4% to 43.1%, Wyrm 42.1% to 39.7%, Thornmother 61.1% to 59.7%, Sovereign 56.5% to 57.3%; the spread between bosses is 19.0 points today in this sample and 20.0 with patterns (the target is 15; the repo's own sim measures 10.6% on its seeds, so this sample is noisier; the Wyrm is the one that sits 2 points lower).
- **How the band was held.** At today's HP the patterns lower the win rate by 3 points (Colossus, Wyrm), 12 (Thornmother) and 17 (Sovereign, whose chain hits every round), and they change its slope with party size: a pincer's six hits and a lance's three are a bigger share of a small row. So two levers per boss were fitted (both already exist in `bosses.json`: `baseHp` and `hpExponent`): bisect the HP so the typical group wins as often as today, and step the head-count exponent in 0.02 until the small and large groups do too. Fitted on 6 seeds while the since-dropped ward was still in, then verified **without refitting** on 12 other seeds with the ward off: every size is within 2.1 points (the table).

| Boss            | `hpExponent` today to fitted | HP vs today at 3 / 7 / 15 players |
| --------------- | ---------------------------- | --------------------------------- |
| Tidal Colossus  | 1.07 to 1.09                 | -4% / -2% / -0.5%                 |
| Cinder Wyrm     | 1.23 to 1.23                 | -0.3% at every size               |
| Thornmother     | 1.04 to 1.14                 | -11% / -3% / +4%                  |
| Storm Sovereign | 1.15 to 1.21                 | -11% / -6.5% / -2%                |

- **Attack is not touched.** The pattern powers are percentages of boss Attack, so a rank still scales them. See the Rank risk in section 5 for what happens at higher ranks.
- **How I would tune in the build.** Use `pnpm tune` on the real sim: first `power` in the content (lethality: aim for 25% to 35% of team HP lost and 10% to 20% knocked out in a typical finale), then per-boss `baseHp` and `hpExponent` as above. The rest of the repo's 47 targets need a full `pnpm sim` run, which the prototype did not do.
- **To lean into harder hits later** (Misa's direction): raise `power` on the aimed moves first (Slam, Chain), because the Guard's value comes from those; keep the single-hit cap (section 6, slice 2) so a harder boss never one-shots; and re-fit HP and exponent each time.

### 4.3 Do Guard and Support earn their place?

**Method.** The mechanic is switched off and the creature stays in its slot (a Guard keeps its stats but gets no extra HP, no intercept, no cover, no lance block; a Support gives neither its buff nor its element effect; Shield Wall abilities fire but do nothing; removing the ability instead would also remove a player's ability slot, which the earlier study's Shield Wall number did). Win rate is the pooled finale win over the four bosses, the same rosters and dice in every row; patterned bosses are at their fitted HP. Placement: **clumped** is `autoPlace` (Guards in the first slots); **spread** puts the Guards evenly through the row; **smart** is spread plus payoffs moved off the row ends. 3,840 finales per cell. The Support here is the shared +15% buff only; the element effects are measured in 4.7.

Players bring their top three creatures by power (the sim's rule):

| Bosses  | Formation | Win rate | No Guard | No Support | No Shield Wall effect | None of the three |
| ------- | --------- | -------- | -------- | ---------- | --------------------- | ----------------- |
| Today   | clumped   | 57.3%    | 0.0      | -0.5       | -1.4                  | -2.0              |
| Today   | spread    | 69.2%    | -1.9     | 0.0        | -2.0                  | -4.7              |
| Today   | smart     | 73.2%    | -1.8     | -0.2       | -2.1                  | -5.6              |
| Pattern | clumped   | 57.0%    | -1.2     | -0.8       | -1.8                  | -4.0              |
| Pattern | spread    | 69.3%    | -4.0     | +0.2       | -3.4                  | -9.9              |
| Pattern | smart     | 74.9%    | -5.2     | -0.4       | -3.1                  | -10.6             |

Every player brings a Guard and a Support when they own one (a Support is then 25% of the creatures instead of 2%):

| Bosses  | Formation | Win rate | No Guard | No Support | No Shield Wall effect | None of the three |
| ------- | --------- | -------- | -------- | ---------- | --------------------- | ----------------- |
| Today   | clumped   | 52.8%    | 0.0      | -6.0       | 0.0                   | -6.6              |
| Today   | smart     | 68.8%    | -1.3     | -6.1       | -1.0                  | -8.9              |
| Pattern | clumped   | 52.1%    | -0.8     | -5.1       | -0.6                  | -6.1              |
| Pattern | smart     | 70.3%    | -3.7     | -5.3       | -1.6                  | -11.5             |

Reading it:

- **Today a Guard is worth 0 to 2 points** (the earlier study's 0 to 1.2). With patterns it is **worth 1.2 points when clumped and 4.0 to 5.2 when spread**: the new hits are aimed (Slam, Chain) and a Guard saves the strongest creature. The role is paid for by formation, not by its stats.
- **By boss** (patterned, smart formation; win points lost with the Guard role off, and with all three off): Colossus -1.2 and -1.7, Wyrm -7.6 and -20.6, Thornmother -2.3 and -5.2, Sovereign -9.5 and -14.9. The Guard pays most on the Sovereign, whose chain and slam aim at the strongest, and on the Wyrm. The Colossus is all area hits and one lance, which chip a team without knocking out its best creatures, so Guards barely show; its counter is the Shield Wall on the announced row, and the sim fires Shield Wall at its default timing, so the sim cannot show that value.
- **Which part of the Guard carries it** (a separate 6-seed run, patterned, smart, switching one part off; the whole role is -5.4 there): intercept -1.9, extra HP -0.9, cover -0.3, lance block -0.1. The parts do not add up; they overlap. Clumped, only the extra HP counts (-0.7; the whole role -1.0). Cover is small in win rate, but on its own it stops 16% to 27% of a sweep, a barrage or a pincer (4.5): damage spread over many creatures rarely decides a finale, knock-outs of the strongest do.
- **Support, shared buff:** worth 5.1 to 6.1 points when Supports are present (that exists today); in the sim's normal rosters Supports are so rare that it is worth 0.2 to 0.8.
- **Shield Wall** is worth 1.4 to 3.4 points with the sim's rosters (today 1.4 to 2.1), and 7.7 to 10 points against the Cinder Wyrm alone, because a Shield Wall on the payoffs' row halves the reflected hit.
- **At what cost.** A Guard gives up a payoff's reaction damage: a roster built around Guards is not stronger, it is safer. In the dungeon (4.6) the same trade was measured directly against a second payoff.
- **Credit.** Contribution per creature, relative to the mean creature: Guard 0.51 today, 0.55 clumped and 0.62 spread with patterns; Support 0.80 today, 0.81 and 0.67; payoff about 1.1. With a Guard and a Support in every team, Guards and Supports sit at 0.53 to 0.60 against payoffs at 1.8 to 1.9 (the earlier study's 0.3x to 0.55x). Splash absorption, cover and healing count (section 5), and it still barely moves credit: across the settings the Guard's intercept is at most 1.4% of team HP and its cover at most 2.6%. Paying them like payoffs needs a credit multiplier, a separate decision.

### 4.4 Does placement change the outcome?

**Yes, more than any role.**

- **The same bosses, different formations.** Today's bosses: clumped 57.3%, spread 69.2%, smart 73.2%. Patterned: 57.0%, 69.3%, 74.9%. Most of it is not the Guards' stats: with Guards spread, a typical party's reactions per round go from 3.28 to 3.82 (+16%) and damage dealt rises about 5%, which is worth about 12 win points here. I did not chase the cause. A likely one is turn order: it decides who marks the boss and who cashes the mark, and `autoPlace` puts the weakly hitting Guards first and all the payoffs together at the back (not verified).
- **Which formation answers which pattern** (each pattern alone on a neutral boss, a typical or large party, every player brings a Guard, all rules on; team HP lost, and creatures knocked out):

| Pattern alone                 | Guards clumped in front | Guards spread           | Guards on the row ends | Spread, payoffs off the ends |
| ----------------------------- | ----------------------- | ----------------------- | ---------------------- | ---------------------------- |
| Sweep (a row, every 3)        | 17.0% lost, 4.6% KO     | 14.3% lost, 4.4% KO     | 14.9% lost, 4.3% KO    | 14.3% lost, 4.5% KO          |
| Barrage (2 to 6 random)       | 16.2% lost, 3.2% KO     | 12.8% lost, 3.1% KO     | 14.3% lost, 3.2% KO    | 12.8% lost, 3.1% KO          |
| Slam on the front-most        | 8.7% lost, 5.4% KO      | 9.4% lost, 5.0% KO      | 8.9% lost, 5.1% KO     | 9.4% lost, 5.0% KO           |
| Lance (one lane)              | **6.6% lost**, 2.8% KO  | 8.0% lost, 3.0% KO      | 8.2% lost, 3.0% KO     | 8.0% lost, 3.0% KO           |
| Chain (strongest and 2 jumps) | 10.2% lost, 2.8% KO     | **8.7% lost**, 4.9% KO  | 9.2% lost, 5.2% KO     | 8.7% lost, 4.9% KO           |
| Slam on the strongest         | 11.8% lost, 6.3% KO     | **10.0% lost**, 5.3% KO | 10.3% lost, 5.8% KO    | 9.9% lost, 5.3% KO           |
| Pincer (ends of every row)    | 20.6% lost, 11.6% KO    | 16.5% lost, 7.1% KO     | 20.7% lost, 13.8% KO   | 16.6% lost, **6.6% KO**      |

So: a **Lance** wants Guards at the front slots (they block it); **Chain, Slam on the strongest, Barrage and Sweep** want Guards spread (a Guard in the strongest creature's row, and one beside each fragile creature); a **Pincer** wants the valuable creatures off the ends and does **not** want Guards stacked on the ends, where they are hit every time and fall; a **Slam on the front-most** is answered by nobody but the front creature. A boss that mixes two of these (every boss does) means a formation is a compromise, which is the point.

### 4.5 What each counter stops, fairness and length

**Each pattern alone, what each counter stops** (neutral boss shell, boss pool that cannot fall, every player brings a Guard, formation smart unless noted; team HP lost in the finale; the percent is how much of the "nothing" damage the counter stops, and "KO" is the share of creatures knocked out). "Nothing" has every mechanic switched off. The Support's element effects are not pattern-specific and are in 4.7.

| Pattern alone                     | Nothing         | Guard (spread) | Guard (clumped) | Shield Wall (auto-timed) | Guard + Shield Wall |
| --------------------------------- | --------------- | -------------- | --------------- | ------------------------ | ------------------- |
| Plain attack only                 | 5.3%, KO 5.7%   | -7%, KO 2.7%   | -7%, KO 2.8%    | -19%, KO 4.7%            | -25%, KO 2.3%       |
| Sweep (front row, every 3)        | 21.0%, KO 19.9% | -16%, KO 8.3%  | +3%, KO 6.1%    | -17%, KO 12.2%           | -33%, KO 4.5%       |
| Barrage (2 to 6 random)           | 19.5%, KO 6.9%  | -25%, KO 3.1%  | -9%, KO 3.2%    | -13%, KO 5.8%            | -36%, KO 2.6%       |
| Slam on the front-most + splash   | 11.5%, KO 12.5% | +1%, KO 6.7%   | -3%, KO 6.6%    | -20%, KO 9.3%            | -20%, KO 5.0%       |
| Lance (one lane)                  | 13.5%, KO 6.6%  | -31%, KO 3.1%  | -40%, KO 3.1%   | -13%, KO 5.5%            | -42%, KO 2.7%       |
| Chain (strongest + 2 jumps)       | 12.3%, KO 5.6%  | -20%, KO 5.0%  | -9%, KO 2.7%    | -15%, KO 4.6%            | -31%, KO 4.0%       |
| Slam on the strongest + splash    | 14.6%, KO 9.7%  | -18%, KO 5.3%  | -10%, KO 5.5%   | -16%, KO 6.1%            | -33%, KO 4.7%       |
| Pincer (ends of every row)        | 25.3%, KO 23.7% | -27%, KO 16.5% | -11%, KO 14.5%  | -13%, KO 21.7%           | -37%, KO 10.4%      |
| Charged Barrage (3 to 6, every 4) | 18.4%, KO 7.2%  | -24%, KO 3.2%  | -8%, KO 3.4%    | -22%, KO 5.4%            | -41%, KO 2.7%       |

Every pattern has at least one counter that cuts it by a tenth or more besides the Shield Wall, and the Guard with a Shield Wall stop 20% to 42%. A Guard does not always lower the damage (a Slam on the front-most: +1%) but it halves the knock-outs (12.5% to 6.7%), because the hit lands on a Guard instead of a payoff. The Shield Wall column is auto-timed (as the sim fires it); a player who fires it at a charged sweep's announced row does better, which was not simulated. A healing Support (Tide, Grove) recovers part of the chip a sweep or barrage leaves: 4.7 measures how much.

**Artillery fairness** (a Barrage every round on a typical party, 6 seeds per roster; per creature over a 12-round finale):

| Party             | Rule                      | Shells per volley | Hits per creature, mean and spread | Never hit | Hit 4+ times | Most hits on one creature | Same creature in two volleys running |
| ----------------- | ------------------------- | ----------------- | ---------------------------------- | --------- | ------------ | ------------------------- | ------------------------------------ |
| Typical (5 to 10) | no-repeat rule (proposed) | 3.1               | 1.71, sd 1.05                      | 12%       | 5%           | 6                         | 0%                                   |
| Typical (5 to 10) | plain random              | 3.1               | 1.71, sd 1.23                      | 16%       | 8%           | 8                         | 13%                                  |
| Large (11 to 15)  | no-repeat rule (proposed) | 5.6               | 1.66, sd 1.03                      | 12%       | 4%           | 6                         | 0%                                   |
| Large (11 to 15)  | plain random              | 5.6               | 1.66, sd 1.19                      | 17%       | 7%           | 8                         | 13%                                  |
| Small (1 to 4)    | no-repeat rule (proposed) | 2.0               | 2.40, sd 1.13                      | 4%        | 17%          | 6                         | 0%                                   |
| Small (1 to 4)    | plain random              | 2.0               | 2.40, sd 1.42                      | 7%        | 20%          | 8                         | 19%                                  |

The rule removes the streaks ("the same creature, twice running") and cuts the worst case from 8 hits to 6. About one creature in eight is never hit; that is fair, it is a random draw.

**Length.** Playback per `planRounds` with the shipped pacing, 12 rounds, the boss pool that cannot fall (the longest case). The mean finale grows by two to three seconds; nothing grows for large parties, which already sit at the 22-second round cap (264 s for 12 rounds).

| Party             | Finale today | Finale with patterns | Boss hits a round, mean and largest seen |
| ----------------- | ------------ | -------------------- | ---------------------------------------- |
| Small (1 to 4)    | 123 s        | 125 s                | 1.6 (5) to 3.4 (8)                       |
| Typical (5 to 10) | 197 s        | 200 s                | 2.0 (11) to 4.2 (14)                     |
| Large (11 to 15)  | 264 s        | 264 s                | 2.6 (16) to 5.4 (19)                     |

### 4.6 Dungeon

Foe patterns as in 3.2, clear rate of three-room runs, 2,000 runs per cell. "Old rules" is the Guard as shipped; "cover" has the new Guard cover (the Support here is the shared buff only; its element effects are in 4.7). Teams are the earlier study's recipes, setter on the left unless the Guard is; level, fusion and gear are the medians of the sim's players at that depth. At depth 5 every team clears 45% to 50% and at depth 10 92% to 100%, patterns or not, so the roles only separate from about depth 12; the table shows depth 14 and a landmark depth (the same depth with the room boss's signature move).

| Team (left / middle / right)  | Depth 14 today | Depth 14, patterns (old rules) | Depth 14, patterns (cover) | Landmark today | Landmark, patterns (cover) |
| ----------------------------- | -------------- | ------------------------------ | -------------------------- | -------------- | -------------------------- |
| setter / payoff / payoff      | 76%            | 67%                            | 67%                        | 75%            | 56%                        |
| **Guard** / setter / payoff   | 82%            | 80%                            | 80%                        | 82%            | 77%                        |
| setter / **Guard** / payoff   | 79%            | 73%                            | 74%                        | 78%            | 64%                        |
| setter / payoff / **Guard**   | 49%            | 48%                            | 48%                        | 48%            | 47%                        |
| setter / **Support** / payoff | 61%            | 56%                            | 56%                        | 60%            | 54%                        |

- **A Guard on the left earns its place:** +13 points over a second payoff at depth 14 (+6 today) and +21 at a landmark (+7 today). A Guard in the middle is +7 and +8 (+3 and +3 today). A Guard on the right is not worth a slot, as today.
- **A Support with only the shared buff does not**: 11 points behind a second payoff at depth 14 and 2 behind at a landmark (15 behind and 15 behind today). The element effects (4.7) close that gap.
- **What it costs.** All teams lose a few points: a payoff-heavy team 9 at depth 14 and 19 at a landmark; the Guard-left team 2 and 5. Per run, 0.1 to 0.3 more creatures are knocked out. To hold today's progression numbers at depth 14 the foes need to be about 6% lighter (foe HP x0.94, or foe Attack x0.86, restores the mean clear rate of the four teams: 74.4% today, 74.5% after). Run the full dungeon targets (`pnpm sim`) after that.
- **Cover** (40% or 60%) made no measurable difference in a row of three: the dungeon's value is intercept plus the Support's effect.

### 4.7 Support designs

**The brief (Misa).** A Guard protects itself and others; a Support does something else (heal, boost damage, play with marks), and an element may give it its own effect. **Which Supports exist** (from `creatures.json`): Ember has Ashmole (common, catchable) and its evolution Magmole; Spark has Aurorix (epic, catchable); Tide has Lanternfin (epic, **Festival-only**, not catchable); **Grove has none**. So today's players can only field an Ember or a Spark Support, and a healing Support exists only for Lanternfin during a Festival.

**Method.** Each effect is applied to every Support through a study switch, so it is measured apart from which species exist. Patterns on, Guard cover on, no ward. _Raid:_ every player brings a Support when they own one, 2,560 finales per cell, pooled over the four bosses at their fitted HP, "off" is the Support with no buff and no effect. _Dungeon:_ depth 14 and a landmark (the same depth with the signature move), 2,000 runs per cell, the Support in the middle of setter / Support / payoff, against a second payoff, a Guard in the middle and a Guard on the left. (Another seed set for the same teams in 4.6 gives values a point apart: 67 and 56 for the second payoff, 56 and 54 for the shared buff. Differences under 2 points are noise.)

**The four designs, and what they are worth** (win rate, with the points over the shared buff alone in brackets):

| Support (dial)                                 | Raid, clumped | Raid, smart  | Dungeon d14         | Dungeon landmark | Healed, share of team HP (of all damage) |
| ---------------------------------------------- | ------------- | ------------ | ------------------- | ---------------- | ---------------------------------------- |
| _Off: no buff, no effect_                      | 75.2%         | 82.7%        | n/a                 | n/a              |                                          |
| _Shared +15% buff only_                        | 80.2%         | 87.1%        | 55%                 | 53%              |                                          |
| **Ember Stoke** (buff +25%)                    | 82.6% (+2.4)  | 89.4% (+2.3) | 58% (+3)            | 58% (+5)         |                                          |
| **Spark Overcharge** (reactions +15%)          | 81.1% (+0.9)  | 87.9% (+0.8) | 64% (+9)            | 63% (+10)        |                                          |
| **Tide Mend** (heal 4%, clear silence)         | 80.6% (+0.4)  | 87.5% (+0.4) | 59% (+4)            | 58% (+5)         | raid 2.3% (8%); dungeon 10.9% (12%)      |
| **Grove Mend** (heal 6%)                       | 80.6% (+0.4)  | 87.8% (+0.6) | 63% (+8)            | 60% (+7)         | raid 3.1% (11%); dungeon 16.8% (18%)     |
| _Reference: a third attacker (plain)_          | 77.1%         | 83.3%        | 66% (second payoff) | 55%              |                                          |
| _Reference: Guard in the middle / on the left_ | n/a           | n/a          | 74% / 79%           | 64% / 77%        |                                          |

- **Against a second payoff.** In the dungeon, a Support in the middle at depth 14 is Spark -2, Grove -3, Tide -7, Ember -8; at a landmark Spark +8, Grove +5, Tide +3, Ember +3. All are behind a Guard (74% in the middle, 79% on the left at depth 14). In the raid, when every player brings one, a Support beats a plain third attacker by 3 points with the shared buff alone and by 3.5 to 6 with an element effect. So each Support earns a slot at about the value of a second payoff and costs a payoff's damage, and no design is dominant or useless at these dials.
- **Healing is a dungeon effect.** One Support reaches two creatures. In the dungeon's three-creature row that is two thirds of the team, and HP carries over between rooms, so Grove's 6% heals 17% of the team's HP in a run (18% of all damage taken). In the raid it reaches two of 22 to 45 creatures: 3% of team HP healed and a gain of 0.4 to 0.6 points. A Support on the end of the dungeon row reaches one creature and is worth little (47% at depth 14 for every design except Spark seed). A raid-only multiplier on the dials is possible but cannot fix the reach (Grove at 12% is only +1.2 in the raid).
- **The dials are steep.** Dungeon, depth 14 and landmark: Grove 6% 63 and 60, **9% 73 and 63, 12% 80 and 65** (12% beats a Guard on the left at depth 14); Spark overcharge +10% 61 and 60, +15% 64 and 63, **+30% 77 and 76, +60% 84 and 83**. Ember's wider variant (reach two slots) is +3.9 in the raid and nothing in a row of three. Keep Grove at or below 8% and Spark at or below +20%; the table of dials is in slice 1.
- **Tide's cleanse is worth nothing measurable.** On its own it is 0.0 in the raid, even against the Thornmother (78% with and without), and in the dungeon it can even cost points (50% against 55% at depth 14) most likely because a silenced setter skipping its turn changes who marks the boss and can make reactions line up (not traced). Silence reaches two creatures, so a cleanse has little to do. Keep it as flavour on top of Mend, not as the selling point.
- **Spark mark tricks tried and dropped.**
  - _Re-mark after a reaction_ (the boss keeps the Support's element as the mark): -2.7 points in the raid (-1.5 smart), 0 in the dungeon. It overwrites a mark the next creature wanted.
  - _Seed the mark at round start_ (when the boss has none): -0.2 in the raid, 0 in the dungeon, +13 only when the Support stands on the left and acts first.
  - _Conduct_ (once a round, the first neighbour hit that cannot cash the mark cashes it anyway): **+15.8 points in the raid** (reactions per round 2.4 to 5.4: dominant) but **-6 at depth 14 in the dungeon** (most likely it spends the mark on the setter's weak hit, so the payoff finds none; not traced).
  - _Afterglow_ (a reaction cashed by a neighbour does not use the mark up, once a round): +4.7 in the raid, +2 in the dungeon in the middle but -1 to -4 on the left.
  - All four are order-sensitive, because reactions are most of the damage: a mark effect either breaks a team's order or doubles the raid's reactions. **Overcharge** is the safe form: it only adds, never takes a mark, and its dial is a plain percentage. A wilder Spark is a question for Misa (section 7).
- **Credit.** Healing is credited to the Support as the HP actually restored. In the 'every player brings a Support' raid a Support earns 0.53 to 0.55 of the mean creature against a payoff at 1.8 (measured with the shared buff only); healing adds about 3% of team HP in restored HP, small next to damage, as the Guard's credit is.
- **At what cost, one more time.** A Support is not free: the same slot as a payoff. In the dungeon at depth 14 it costs 2 to 8 points against a second payoff and gains 3 to 8 at a landmark. That is the intended trade: a landmark (announced, charged signature move) is where a Support or a Guard pays, an ordinary deep day is where a second payoff does.

## 5. Risks

1. **Readability on a 360 px phone.**
   - Marks: a barrage, pincer or lance shows at most six reticles, a slam three (victim and two rings), a chain three plus arcs, a sweep an outline of the row (up to 15 creatures: no 15 reticles). The content test "at most two pattern actions a round" keeps a round to at most two kinds of mark.
   - Numbers: the most boss hits in a round in the runs was 19 (15 players); a sweep of a 15-creature row already shows 15 numbers today (Undertow). When an action hits more than eight creatures, show numbers only above 10% of max HP and one row total (numbers already overlap and rise, per the 2026-10-11 pacing decision).
   - Forecast text: at most two clauses ("Next round: Great Wave sweeps MIDDLE; Riptide cuts a lane"), on two lines.
   - **Adjacency does not line up when a row wraps.** A row of 15 wraps onto lines of five or six at 360 px, so "beside" in slot order is not always beside on screen, and a lane is not a column. Mitigation: marks go on the exact creatures (a shield pip on a creature a Guard covers, a green number where a Support heals, the lance's beam through its three), the Placement strip draws the cover links, and optionally rows are laid out in fixed-width lines so columns align (`zone-layout.ts`).
2. **Fight length.** Two to three seconds longer in a typical finale, none for large parties (4.5). At the 22-second round cap a crowded round squeezes its creature staggers; the boss's actions are one beat each and do not grow.
3. **RNG feel.** The no-repeat rule, the cap of six shells and distinct victims make a volley fair (4.5). Charged targets are drawn once, at the announcement, never re-rolled. A boss crit stays its own die per hit.
4. **Reflect and reactions.** Backdraft is a direct hit and stays as it is. **The Cinder Wyrm's balance leans on it:** capping the reflected hit at 80% of the payoff's max HP moves its finale win rate from 56% to 87% (knock-outs 18% to 9%); at 40% it is 93%. So the reflect cannot be softened without a large rise in the Wyrm's HP (not measured), and that is a separate decision. The Wyrm's new moves (a barrage and a slam on the front-most) add 3 points of knock-outs (18.4% to 21.5%), not more. A charged hit lands after every creature's turn, so it never interferes with a mark or a reaction in the same round.
5. **Loot credit.** The rule is **credit what the Guard or Support actually saves or takes**: the HP a Guard loses in place of someone (an intercepted hit or a splash it takes), the HP it loses when hit itself (`guardOwnCreditBp`, as now), and the damage its cover prevents (credited to the Guard); the HP a Support heals is credited to the Support (the HP actually restored, so it cannot be farmed at full health). All of it is bounded by HP or by a share of a hit, so it cannot be farmed by standing in a splash. Measured, it moves a Guard from 0.51x to 0.54x to 0.62x of the mean creature and a Support from 0.80x to 0.71x to 0.85x: no one is paid like a payoff. If Misa wants that, a credit multiplier for Guard and Support is the lever, and it is separate.
6. **Boss Rank.** Pattern powers are percentages of boss Attack, and Attack grows with rank. Rank 5 (the median here) is Attack 72; **rank 9 is about three times that**. Against today's rosters at three times the Attack, with no cap, 18% of boss hits would one-shot a creature, 74% of the creatures would be knocked out and the finale win rate would be 9%. A cap on one hit (no hit takes more than 50% of the victim's max HP) brings that to 0% one-shots, 40% knocked out and 31% wins; at today's ranks it removes the 1% one-shots and lifts wins by about two points (50.8% to 52.7%, so the tuned HP would rise about 4%). It was not in the tuned numbers above. **Misa wants harder hits later, which makes the cap the safety rail for that direction:** adopt it in slice 2 (50% of max HP) and re-tune; the alternative is to lower `atkRankShareBp` for patterned bosses.
7. **Party-size slope.** The fixed-count patterns (a pincer's six hits, a lance's three) hit small parties harder; fixed by the per-boss exponent (4.2). Re-fit with `pnpm tune` after any power change.
8. **Complexity.** Guard has four rules, held together by one idea ("aimed" against "area"); a fifth was tried and dropped (nearest Guard). A Support has the shared buff plus one element effect, four of them in one table. Each pattern gets a glossary entry of at most four lines, as `gimmick-hit-zone` has now.
9. **Stored fights and replays.** New dice are drawn after every existing die and only for a boss with a pattern op. A live fight stores the rules it used (`FightInput.rules`: `coverBp` and `supportFx`, absent means today's rules), as `luck` does, so a later retune never changes a stored fight. A client that meets an event it does not know must ignore it (`describeEvent` needs a default).
10. **Dungeon.** Foes are hidden before the run, so a pattern is a surprise unless the room banner and forecast tell it; the landmark boss is announced before the run. Row of three: a pincer hits two of three creatures and a whole-row sweep all three, so the dungeon's powers are low and its patterns few.
11. **Support species gap.** Grove has no Support species, Tide's only one is Festival-only, and Spark's is an epic. A healing Support would be something most players cannot field until content is added; a Grove Support line (common) is the first content to add (a question for Misa).
12. **Side findings.** (a) The default formation (`autoPlace`) is about 12 win points below a spread one against today's bosses (3.28 reactions a round against 3.82); changing `autoPlace` would shift the whole raid calibration, so leave it alone in this work. (b) The sim's players bring almost no Supports, so Support value cannot show in the sim's own targets. (c) The earlier study's Shield Wall number removes a player's ability slot along with the effect; the effect alone is worth 1.4 to 2.1 points. (d) The Support dials are steep: in the dungeon Grove at 12% or Spark at +30% beats a Guard (4.7), so every Support number needs a ceiling in the schema, not only a value in the content.

## 6. Build plan

Slices in order. Each is one coherent commit group; the whole can be one PR. Tests are deterministic (seeded) and use the numbers from the prototype as expected values where noted.

**Slice 0: the hit model, no behaviour change.** `hurt()` in `packages/engine/src/fight.ts` takes a mode (`aimed`, `area`, `direct`) instead of `interceptable`; the plain attack and `strike_highest_atk` are aimed, `hit_zone` is area, reflect is direct. Tests: the existing golden fight and fixtures unchanged; a test that plays 40 stored rosters x 4 bosses x 3 stages through the engine and compares the event logs with a stored copy (the prototype did this against the shipped engine: 480 of 480 identical).

**Slice 1: Guard cover and the Support's element effects.** `RULES.combat.coverBp` (4000) and `RULES.combat.supportFx`, a table by element: ember `{ buffBp: 2500 }`, spark `{ reactionBp: 1500 }`, tide `{ healBp: 400, cleanse: true }`, grove `{ healBp: 600 }`; every Support also keeps the shared `supportBuffBp` (1500) unless its entry replaces it. The schema caps each dial (`healBp` at most 800, `reactionBp` at most 2500, `buffBp` at most 3500: the steep ends of 4.7). `FightInput.rules?: { coverBp: number; supportFx: ... }` (absent: no cover and no element effects, today's rules; whoever builds a live input copies `RULES` in, as for `luck`). Cover for creatures beside a Guard against area hits. Support effects at round start for a living, non-silenced Support (heal each neighbour, capped at what is missing, never reviving; clear its silence) and in `hitBoss` (a neighbour's reaction bonus). Credit in `perCreature`: cover to `guardCredit`, healing to `supportCredit`. Events carry `covered`, `heal` and `cleanse`; `support_buff` carries the `bp`. Files: `fight.ts`, `types.ts`, `config.ts`, `schema.ts`, `describe.ts`, the glossary entries `role-guard` and `role-support` (one line for the element effects), `packages/sim` (study switches: `neutralSupports`, and a per-element override so an effect can be measured apart from the species that exist). Tests: exact arithmetic on a row of 9 (the prototype's hand-made fights, boss Attack 100: a 100% sweep on a creature beside a Guard takes 60; a 300% slam that a Guard takes gives each neighbour 150, or 90 if the Guard is still standing when the splash lands, because cover uses the Guard as it stands then); a heal never exceeds the missing HP and never revives; a silenced or knocked-out Support gives nothing; Spark's bonus applies only to a reaction a neighbour cashes in; cover and every effect are absent when `rules` is absent.

**Slice 2: the new ops.** Schema in `packages/game/src/content/schema.ts` (below), dice (40 after all others, only for a boss with a pattern op), selection and resolution in `fight.ts` (partial Fisher-Yates, no-repeat rule, splash from the impact, lance stop, chain order), `strike_highest_atk` `jumps` and `decayBp`, **the single-hit cap** (`RULES.combat.maxHitBp`, 5000 = a hit takes at most 50% of the victim's max HP, aimed and area hits, not reflect; stored in `FightInput.rules`; risk 6; Misa asked to keep it in the plan). Tests per op on rows of 3, 9, 21 and 45: exact targets; distinct shells; never the same creature in two volleys; a lance stopped by a Guard; splash on the impact's neighbours; chain order and no repeats; counts clamp; determinism with a seed; dice count is constant whatever happens; a boss without patterns draws exactly what it draws today.

**Slice 3: Charge and the forecast.** `charge` wrapper; the `charge` event; announce at `landing - 1`; fizzle for a fallen creature; `firstZoneHit` and `defaultAbilityRound` learn `sweep` rows and charged sweeps (Shield Wall's default row and round); `bossWarnings` in `gimmick-schedule.ts` grows target kinds (`rows`, `random`, `slam`, `lane`, `ends`, `charge`) and stays a pure function of content and round (the walk row of a sweep is `rows[(round / every - 1) mod length]`); `playback.ts` treats `charge` as a visible event (+600 ms in its beat) and the new boss actions as boss actions with wind-ups. Tests: the prefix property (rounds up to r unchanged when a Fire in round r changes round r+1); a Shield Wall fired in the announce round halves the charged sweep; forecast text per op and round; a stored fight with the old events replays.

**Slice 4: content, retune and the Wyrm review.** `bosses.json` (3.1), the `gimmick-*` glossary entries (seven, at most four lines each) and the `role-guard` and `role-support` edits (the coverage test requires them), How to play, the compendium (`bosses.md`, `dungeon.md`), `decisions.md`, `docs/balance/scalars.md` for the new scalars. Retune with `pnpm tune` (4.2): `power` first, then per-boss `baseHp` and `hpExponent`. **Review of the Cinder Wyrm's reflect** (Backdraft; Misa asked for it): its difficulty leans on Backdraft. Measured: capping the reflected hit at 80% of the payoff's max HP moves the Wyrm's finale win rate from 56% to 87%, 40% to 93%; so any softening needs the Wyrm's HP raised in the same step. Options to measure with the fork before choosing: leave it (fits "harder hits"); a cap with a higher Wyrm HP; or an adjacent Guard taking the backlash (a Guard's job; the reflect is a direct hit today). Content tests: no round has more than two pattern actions for each boss's `finaleRounds`; none lands in round 1; `charge.trigger.every >= 2`; every boss keeps at most four gimmicks.

**Slice 5: telegraph and UI.** `apps/activity/src/telegraph.ts` (`strikeLabel`, `forecastNextRound`, both wordings), `stage.ts` (`BossStrike` actions, up to six reticles, row outline, splash rings, lance beam, persistent amber marks for a charge, cover pips, heal numbers), `boss-icons.ts` and `raid-text.ts` (`gimmickText` and `gimmickShort` are exhaustive switches over `op`), `glyphs.ts` (seven glyphs), the Placement strip (cover links), the boss card popovers, the workbench gallery. Tests: the stage's beat and cue mapping for each op; label and forecast text; reticle count never above six; layout checks at 360 px (the existing zone-layout tests); reduced-motion frames; no `innerHTML` (render all text as text, creature names come from players).

**Slice 6: the dungeon** (after the left-to-right change has merged; it edits `dungeon.ts`, the telegraph and the dungeon content). Foe patterns (3.2), the landmark boss by depth (`rollRooms` takes the depth; a landmark picks `landmarkIndex mod 4`), the landmark signatures, the room banner line, the pre-run landmark card, `describeEvent` and the replay; foe HP x0.94 (4.6). Tests: every shipped foe and boss played on a row of three, checking that each pattern reaches exactly the creatures it names (the test the earlier row change added, extended); landmark boss fixed per depth; a modifier test that none of them changes a pattern.

**Slice 7 (optional, later).** A formation hint in the Placement strip ("Guards spread: -9% HP lost to a Barrage"), a credit multiplier for Guard and Support, **a Grove Support species** (a common line, content and sprites and a compendium entry; the Grove Mend effect has no carrier until it exists) and later a common Tide Support, a wilder Spark effect if Misa wants one (4.7), `pick: 'lowest_hp'`, and whether `autoPlace` should spread Guards (it lifts every win rate by 12 points: re-calibrate first).

**The dials (Misa: keep per-move dials).** Everything below is a number in content or in `RULES`, so a move can be turned up or down without engine work; re-fit boss HP and exponent after any change (4.2).

| Dial                         | Where                                 | Proposed value                            | Notes                                                                            |
| ---------------------------- | ------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Move power                   | `bosses.json`, `power`                | table in 3.1                              | the first lethality lever; aimed moves (Slam, Chain) move the Guard's value most |
| Move frequency               | `trigger.every`                       | 2 to 5                                    | at most two pattern actions in any round (content test)                          |
| Splash share                 | `splashBp`                            | 4500                                      |                                                                                  |
| Shells                       | `shells` (min, max, `shareBp`)        | 2 to 6 at 12%; 3 to 6 at 15%              | max 6 for readability                                                            |
| Lance falloff                | `falloffBp`                           | 8000                                      |                                                                                  |
| Single-hit cap               | `RULES.combat.maxHitBp`               | 5000                                      | the rail for harder hits; raise to 6000 to allow more spikes                     |
| Guard cover                  | `RULES.combat.coverBp`                | 4000                                      | 40% or 60% made no difference in the dungeon                                     |
| Support effects              | `RULES.combat.supportFx`              | Ember +25%, Spark +15%, Tide 4%, Grove 6% | steep: keep Grove at or below 8%, Spark at or below +20%                         |
| Boss HP, head-count exponent | `bosses.json`, `baseHp`, `hpExponent` | table in 4.2                              | re-fit after every change above                                                  |

**Engine shape (schema).** In `schema.ts`, beside the four existing ops (all powers in basis points of boss Attack, per creature hit; strict objects, as now):

```ts
const Rows = v.pipe(v.array(v.picklist(['front', 'middle', 'back', 'all'])), v.minLength(1), v.maxLength(4));
{ ...gimmickBase, op: v.literal('sweep'),   rows: Rows, power: BasisPoints }
{ ...gimmickBase, op: v.literal('barrage'), shells: v.strictObject({ min: Count1to8, max: Count1to8, shareBp: BasisPoints }), power: BasisPoints }
{ ...gimmickBase, op: v.literal('slam'),    aim: v.picklist(['front', 'strongest', 'random']), power: BasisPoints, splashBp: BasisPoints }
{ ...gimmickBase, op: v.literal('lance'),   lane: v.picklist(['random', 'strongest']), power: BasisPoints, falloffBp: BasisPoints }
{ ...gimmickBase, op: v.literal('pincer'),  scope: v.picklist(['rows', 'row']), power: BasisPoints }
{ ...gimmickBase, op: v.literal('charge'),  then: v.variant('op', [sweep, barrage, slam, lance, pincer]) }  // `then` has no id, name or trigger; the trigger is the landing round and must be `every >= 2`
// extended, optional fields (defaults keep today's behaviour):
{ ...gimmickBase, op: v.literal('strike_highest_atk'), power: BasisPoints, jumps: v.optional(Count0to3), decayBp: v.optional(BasisPoints) }
```

The Support effects are a table in `RULES.combat.supportFx` (schema: `v.record(ElementSchema, v.strictObject({ buffBp: optional, reach: optional, healBp: optional, cleanse: optional, reactionBp: optional }))`, with the dial caps of slice 1); the prototype's `remark`, `seed`, `conduct` and `keep` switches are not part of it (4.7).

New or changed events (`types.ts`): `charge { round, gimmick, marks: string[], rows?: Zone[] }`; `boss_hit` gains optional `splash: true` and `covered`; new `heal { round, supporter, target, amount }` and `cleanse { round, supporter, target }`; the existing `support_buff` event carries the (now element-dependent) `bp`; the `gimmick` event keeps `op` (the new op names). New files: none (everything fits `fight.ts`, `zones.ts` for lane and ends helpers, `gimmick-schedule.ts`); `fight.ts` is already 1,100 lines, so put the pattern selection in a new `patterns.ts` that returns plans (targets and powers) to `fight.ts`, and keep `hurt()` there.

**Sim target updates (`packages/sim/targets.json`).** Keep the 47. Add: `raid.typical.koShare` range 10% to 22% (today 6%); `raid.guardValue` (win points lost with the Guard role switched off, spread formation) at least 2.0; `raid.patternFairness` (the same creature in two volleys running) at most 0%. Add a `roles` ablation report to `pnpm sim` (the prototype's switches, kept out of the engine as the existing `neutralGuards` study switch is).

## 7. Decisions and open questions

### Decisions (Misa, 2026-10-14)

1. **Hit strength: yes.** Harder hits and knock-outs are a direction to lean further into later. Recorded here and in `decisions.md` when the build starts. In the plan: the per-move dials (section 6), the single-hit cap at 50% of max HP as the safety rail (slice 2), and a review of the Cinder Wyrm's reflect (slice 4).
2. **Randomness: yes.** ("This is why we have the randomness seed.") Barrages stay random with the fairness rules: distinct victims, never the same creature in two volleys running, at most six shells, the victims shown as they fall (a charged one a round ahead).
3. **Support: not a ward.** One role with an effect that follows its element, on top of the +15% buff (section 1, designs and numbers in 4.7). The ward is rejected: it made the Support a second Guard.
4. **Landmarks: yes.** A fixed, announced landmark boss every 7th depth (Warden, Tyrant, Matron, Baron, then round again), named on the pre-run card with its charged signature move.

### Decided (Misa, 2026-10-14, second round)

5. **Grove and Tide Support gap: accepted for now.** New species are welcome, and some can be harder to find (for example in later expedition areas); new elements are planned later. Filling the gap is its own work item (roadmap item 9, "More content"), not part of the attack-pattern build. Until then Grove's Mend has no carrier, and Tide's is Festival-only (Lanternfin).
6. **Spark: ship Overcharge.** Wilder mark effects come later as a rare Spark Support, or as a boss or Festival twist, with their own tuning.
7. **Support reach: make it part of the positional game.** Misa: neighbours is simple; supports could reach "up to 5 creatures to its left", "up to 5 to its right", "the entire row" or "2 to either side", with the reach scaling with creature level or another mechanic. This is open design (below), done after the patterns ship, because it changes placement rules and the raid numbers.

### Open design: Support reach (next step after the patterns)

- **Shape per species,** as content data on the Support's line: `left N`, `right N`, `both N`, `row`. The dungeon's row of 3 caps any reach at the whole team, so reach mostly matters in the raid's long rows.
- **Size from progression:** reach grows with level or fusion (for example +1 at fusion 2 and 4), capped per shape. The trade-off is strength against spread: a wider reach dilutes the effect per creature (for example the buff or heal is divided over the creatures reached, with a floor).
- **Telegraph:** the setup shows the reach as highlighted slots when a Support is picked up or tapped, and the creature popover names it ("Boosts up to 3 creatures to its right").
- **To test in the simulator before building:**
  - whether a shape becomes the only right answer;
  - raid finale win and support credit per creature, by shape and size;
  - placement search cost for `autoPlace`, which then has to place Supports by shape.
- **Interaction:** with Guard cover (does a Support behind a Guard reach past it?) and with Pincer and Lance (end slots and lanes).

## Appendix: the prototype in one paragraph

A fork of `fight.ts` (`fightx.ts`) takes a second argument of rule switches (`cover`, a Support-effect table by element with a study override, ablations, the hit and reflect caps) and reads the new gimmick ops from the boss; `lib.ts` builds raid weeks from the simulator's economy snapshots (`openRaidWeek`, `fightFor`) and plays the three stages with the fork; `dlib.ts` does the same for the dungeon's chain of rooms with foes always left to right. Experiments: 0 baseline and identity check; 1 lethality; 3 and 13 tuning (HP bisection, exponent grid); 5 and 11 ablations; 7 length; 9 each pattern against each counter; 12 win by party size; 14 fairness; 15 dungeon retune; 16 formation by pattern; 17 reflect cap; 18 hit cap; 19 credit; 20 hand-made arithmetic checks; 21 and 22 the Support designs in the raid and the dungeon. The first round used a Support ward; it was removed after Misa's answer and every affected number was re-run. Nothing from the scratchpad is in the repo.
