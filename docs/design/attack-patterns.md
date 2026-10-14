# Attack patterns: varied boss and foe attacks

Status: **design and simulator prototype, 2026-10-14. Nothing here is built or shipped.** The prototype is an in-memory fork of the fight engine in the session scratchpad, run through Vite SSR like `packages/sim/scripts/*.mjs`; no repo code changed. Misa's brief:

> vary up the attack patterns of raid bosses. Instead of single hits, they could hit entire rows at once quite often, drop "artillery" on X random creatures in any space, deal high damage hits to single creatures that radiate a portion of the damage to their neighbours, etc. These positional elements and adjacency rules would warrant placing creatures to cover more scenarios. I'd be interested in seeing if the dungeon could also use some form of varying attack patterns from enemies.

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

- **Guard:** keeps taking hits aimed at one creature, and now creatures standing right beside a Guard take 40% less from area attacks (sweeps, shells, splash). A Lance stops at it.
- **Support:** still boosts its neighbours' next hit by 15%, and now also wards them: the first hit each neighbour takes each round is 40% weaker.

**What the simulator says** (section 4):

- **The raid stays in its win band.** With each boss's HP and head-count exponent re-fitted, the finale win rate matches today's within about one point at every party size (3 players 79% today and 78% with patterns, 7 players 59% and 60%, 10 players 40% and 42%, 15 players 40% and 39%). Boss HP moves by between -11% and +4%.
- **The boss now actually threatens.** It takes about 30% of the team's HP in a finale (about 11% to 13% today) and knocks out about 16% of the creatures in a typical party (about 6% today). Knock-outs last for that stage only; every stage starts at full HP.
- **Guard and Support start to earn their place, if players place them well.** Switching the whole Guard role off costs the finale 0.1 points today with clumped Guards and 1.3 points with patterns, but **3.5 to 4.6 points once the Guards are spread through the rows** (1.8 today). Guard, Support and Shield Wall together are worth **4 points with clumped Guards and 11 points with good formation** (2 and 5 today). Supports are rare in the simulator's raids (1 to 3% of creatures), so their raid value stays near 0 to 1 point; if every player brought one it is worth 7 points, 6 of them from the buff that exists today.
- **Formation is worth more than any role.** Spreading the Guards alone lifts the win rate by about 12 points, even against today's bosses (more reactions per round: 3.8 instead of 3.3).
- **Dungeon:** a lighter version (one pattern per foe; room bosses keep their trick and gain one; every 7th depth the room boss gains a charged signature move). At depth 14 a Guard on the left beats a second payoff by 13 points (6 today) and at a landmark by 21 (7 today); a Support with the ward ties a second payoff at depth 14 (it loses by 15 today). Foe HP -2% keeps today's clear rates.

**Two findings for the lead** (section 5): at higher Boss Ranks the patterns need a cap on one hit, and the Cinder Wyrm's balance leans entirely on its reflect.

**What I need from you:** four short questions in section 7, each with a recommended answer.

## 1. How a hit works (the vocabulary)

The words are the ones to use in the glossary and the UI. Every number was run in the prototype.

- **Row.** The raid's zone: Front, Middle or Back (the stage draws zones as rows). In the dungeon every row is one creature. A row's creatures stand in slot order, left to right.
- **Beside.** The slot directly left or right of a creature (`neighbours()` in `zones.ts`; it ignores row edges, as the Support does today).
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

**Support (v2).** Its 15% buff for its neighbours stays. New: **Ward.** Each round a living, non-silenced Support wards each neighbour: the first hit that neighbour takes that round, of any kind, is 40% weaker. One ward per creature, not stacked. `RULES.combat.wardBp = 4000`. The prevented damage is credited to the Support.

**Splash.** A Slam's victim takes the full hit; each living creature beside the one that actually took it (the victim, or the Guard that stepped in) takes `splashBp` of the hit's damage as an area hit. Cover, ward and Shield Wall apply to the splash.

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
- **Counters.** _Guard:_ cover for the creatures beside it, and its HP. _Support:_ ward. _Ability:_ Shield Wall on the named row, fired a round ahead. _Placement:_ a Guard every third slot, so every fragile creature stands beside one.
- **Engine shape.** `{ op: 'sweep', rows: ('front'|'middle'|'back'|'all')[], power }`. `hit_zone` stays as it is.

### 2.2 Barrage ("shells on any space")

- **Mechanic.** `count = clamp(ceil(living x shareBp / 10000), min, max)`. That many distinct living creatures, picked by a partial Fisher-Yates shuffle from dice drawn at the start of the round, each take `power`. **Fairness rules** (measured in 4.5): a creature cannot be hit twice in one volley; a creature hit by this gimmick's last volley is skipped unless fewer than `count` others live; `max` caps the volley at 6, so a 15-player row gets a readable number of marks. A shell is not interceptable (nothing can catch a falling shell), but cover and ward apply.
- **Damage share.** Cinder Fall: 130% each, 12% of the living creatures (2 to 6), every 2 rounds. Seed Burst (charged, every 5): 360% each, 15% of the living creatures (3 to 6).
- **Randomness and how it is drawn.** At the start of every round of a fight whose boss has a pattern op, the engine draws 40 uniform integers in [0, 1,000,000) from the fight's RNG, after every die that already existed. A boss without patterns draws exactly what it draws today, so stored fights replay unchanged. A barrage reads as many as it needs. The fight's seed is a fresh `crypto.getRandomValues` draw when the fight starts, as for crits, so nothing a player can see or compute names a shell's target before the round.
- **Telegraph.** _Card:_ a scatter glyph; "Every 2 rounds: 2 to 6 random creatures take a hit of 130% of its attack. Never the same creature twice running." _Forecast:_ "Next round: Cinder Fall drops embers on 2 to 6 random creatures" (the count depends on who is still up, so the range is the honest wording). _Wind-up:_ red reticles on exactly the chosen creatures for 600 ms, then the hits.
- **Counters.** _Guard:_ cover. _Support:_ ward. _Placement:_ spread Guards. _Ability:_ none (random); only the charged version can be answered by a Shield Wall, because its marks show a round ahead.
- **Engine shape.** `{ op: 'barrage', shells: { min, max, shareBp }, power }`.

### 2.3 Slam ("a hit you feel next door")

- **Mechanic.** The victim is chosen by `aim`: `front` (the front-most living creature, as the plain attack picks), `strongest` (highest Attack), or `random` (one die). It is an aimed hit, so a Guard takes it instead if the victim is not a Guard. The creature that takes the hit is the **impact**. Each living creature beside the impact takes `splashBp` of the hit's damage (before crits and reductions) as an area hit.
- **Damage share.** Coil Crush: 310% on the front-most, splash 45% (140%), every 4 rounds. Thunderclap: 340% on the strongest, splash 45%, every 4 rounds.
- **Telegraph.** _Card:_ a fist-and-ripples glyph; "Every 4 rounds: hits your strongest creature for 340% of its attack. The creatures beside it take 45%." _Forecast:_ "Next round: Thunderclap slams your strongest, and splashes its neighbours" (the stage does not know the strongest, as for strikes today). _Wind-up:_ a reticle on the victim and small rings on the two neighbours, re-aimed to the Guard if one steps in.
- **Counters.** _Guard:_ intercept (the Guard takes the slam, and the splash spreads from where the Guard stands); the Guard's neighbours are covered, so the splash is 40% lighter there. _Support:_ ward on the first hit. _Ability:_ Shield Wall on the victim's row. _Placement:_ do not stand two key payoffs side by side; a Guard in each row.
- **Engine shape.** `{ op: 'slam', aim: 'front'|'strongest'|'random', power, splashBp }`.

### 2.4 Lance ("a lane through the whole line")

- **Mechanic.** A lane is picked (`random`: one die over the row's width; `strongest`: the lane of the highest-Attack creature). The creature at that slot of Front, Middle and Back takes `power`, then `power x falloffBp`, then that again: Riptide 200%, 160%, 128% (falloff 80%). A Guard in the lane takes its hit and **stops the lance**. An empty or knocked-out slot is passed through.
- **Telegraph.** _Card:_ an arrow-through-rows glyph; "Every 4 rounds: one lane of creatures, front to back, takes 200%, then 160%, then 128% of its attack. A Guard stops it." _Forecast:_ "Next round: Riptide cuts a lane through every row". _Wind-up:_ reticles on the (up to three) creatures and a thin beam through them. The lane is not named a round ahead (it is random), only that a lance comes.
- **Counters.** _Guard:_ a Guard at the **front** slot of a lane blocks everything behind it (measured on a Lance alone: Guards clumped at the front of the row cut its damage by 40%, spread Guards by 31%). _Support:_ ward. _Ability:_ none.
- **Engine shape.** `{ op: 'lance', lane: 'random'|'strongest', power, falloffBp }`.

### 2.5 Chain (the "focus the strongest" family)

- **Mechanic.** Today's strike on the highest Attack, with jumps. The first hit is aimed at the strongest living creature (ties: lower slot), so a Guard in its row takes it. Jump k (1 to `jumps`) hits the (k+1)-th strongest living creature as an area hit at `power x decay^k`. The same creature is never hit twice.
- **Damage share.** Lightning Rod: 170% on the strongest, then 94%, then 51% (decay 55%), every round. Today it is 120% on the strongest only.
- **Variants** (same fields, not prototyped): a `pick: 'lowest_hp'` strike ("culling": the finisher, aimed at the creature with the lowest HP share), and a random jump order for dungeon foes.
- **Telegraph.** _Card:_ today's strongest-strike glyph with a spark arc; "Every round: strikes your highest-attack creature for 170%, then jumps to the next two (94%, 51%)." _Forecast:_ "Next round: Lightning Rod strikes your strongest, then jumps twice". _Wind-up:_ a reticle on the target and arcs to the jump creatures.
- **Counters.** _Guard:_ intercepts the first hit (the biggest part of the Guard's value in the raid: 4.3). _Support:_ ward. _Placement:_ a Guard in the row of your strongest creature; spread the top Attacks across rows so a chain does not take all three.
- **Engine shape.** Extend `strike_highest_atk` with optional `jumps` (0 to 3, default 0) and `decayBp` (default 5500). Defaults keep today's behaviour exactly.

### 2.6 Pincer ("the vines close on both ends")

- **Mechanic.** The first and the last living creature of every row (`scope: 'rows'`), or of the whole row (`scope: 'row'`, for the dungeon), take `power` as area hits. A one-creature row is hit once. That is six hits whatever the party size, so it is the pattern that hits a small party's share hardest (4.2 re-fits for it).
- **Damage share.** Briar Pincer: 220%, every 3 rounds.
- **Telegraph.** _Card:_ a two-arrows-closing glyph; "Every 3 rounds: the first and last creature of every row take 220% of its attack." _Forecast:_ "Next round: Briar Pincer closes on the ends of every row" (with the end markers the Bramble Bind forecast already draws). _Wind-up:_ reticles on up to six creatures.
- **Counters.** _Placement first:_ keep the creatures you cannot lose off the row ends. In the prototype, a formation with payoffs off the ends and Guards spread cuts a pincer's knock-outs from 11.6% (Guards clumped at the front) to 6.6%. _Guard:_ a Guard on an end has +30% HP but gets no cover, and it is hit every time, so Guards placed on every row end do worse than Guards spread (13.8% against 7.1% knock-outs); a Guard's use is **beside** an end creature. _Support:_ ward on the creature beside.
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
| 3 (2.7)                      | 78.8%     | 78.2%             | 9.7% to 22.2%                            | 16.8% to 37.3%                  |
| 5 (4.4)                      | 68.0%     | 67.6%             | 8.0% to 20.4%                            | 15.2% to 39.0%                  |
| 7 (6.5)                      | 58.6%     | 59.8%             | 7.0% to 16.7%                            | 13.2% to 32.7%                  |
| 10 (9.1)                     | 40.3%     | 41.5%             | 4.9% to 13.4%                            | 10.9% to 30.0%                  |
| 15 (13.5)                    | 39.5%     | 39.3%             | 3.9% to 10.6%                            | 8.8% to 26.3%                   |

- **Bands** (`packages/sim/targets.json`): typical group (5 to 10 signed) 50.3% today and 51.0% with patterns (band 40% to 60%); 15-player group (11 to 15 signed) 39.5% and 39.3% (band 35% to 65%). By boss, typical group: Colossus 43.1% to 44.4%, Wyrm 41.9% to 42.8%, Thornmother 60.5% to 59.9%, Sovereign 55.8% to 57.0%; the spread between bosses is 18.7 points today in this sample and 17.1 with patterns (the target is 15; the repo's own sim measures 10.6% on its seeds, so this sample is noisier, but patterns do not widen it).
- **How the band was held.** At today's HP the patterns lower the win rate by 3 points (Colossus, Wyrm), 12 (Thornmother) and 17 (Sovereign, whose chain hits every round), and they change its slope with party size: a pincer's six hits and a lance's three are a bigger share of a small row. So two levers per boss were fitted (both already exist in `bosses.json`: `baseHp` and `hpExponent`): bisect the HP so the typical group wins as often as today, and step the head-count exponent in 0.02 until the small and large groups do too. Fitted on 6 seeds, verified on 12 other seeds.

| Boss            | `hpExponent` today to fitted | HP vs today at 3 / 7 / 15 players |
| --------------- | ---------------------------- | --------------------------------- |
| Tidal Colossus  | 1.07 to 1.09                 | -4% / -2% / -0.5%                 |
| Cinder Wyrm     | 1.23 to 1.23                 | -0.3% at every size               |
| Thornmother     | 1.04 to 1.14                 | -11% / -3% / +4%                  |
| Storm Sovereign | 1.15 to 1.21                 | -11% / -6.5% / -2%                |

- **Attack is not touched.** The pattern powers are percentages of boss Attack, so a rank still scales them. See the Rank risk in section 5 for what happens at higher ranks.
- **How I would tune in the build.** Use `pnpm tune` on the real sim: first `power` in the content (lethality: aim for 25% to 35% of team HP lost and 10% to 20% knocked out in a typical finale), then per-boss `baseHp` and `hpExponent` as above. The rest of the repo's 47 targets need a full `pnpm sim` run, which the prototype did not do.

### 4.3 Do Guard and Support earn their place?

**Method.** The mechanic is switched off and the creature stays in its slot (a Guard keeps its stats but gets no extra HP, no intercept, no cover, no lance block; a Support gives neither buff nor ward; Shield Wall abilities fire but do nothing; removing the ability instead would also remove a player's ability slot, which the earlier study's Shield Wall number did). Win rate is the pooled finale win over the four bosses, the same rosters and dice in every row; patterned bosses are at their fitted HP. Placement: **clumped** is `autoPlace` (Guards in the first slots); **spread** puts the Guards evenly through the row; **smart** is spread plus payoffs moved off the row ends. 3,840 finales per cell.

Players bring their top three creatures by power (the sim's rule):

| Bosses  | Formation | Win rate | No Guard | No Support | No Shield Wall effect | None of the three |
| ------- | --------- | -------- | -------- | ---------- | --------------------- | ----------------- |
| Today   | clumped   | 57.4%    | -0.1     | -0.6       | -1.6                  | -2.1              |
| Today   | spread    | 69.3%    | -1.8     | 0.0        | -2.0                  | -4.7              |
| Today   | smart     | 73.0%    | -1.8     | -0.4       | -2.0                  | -5.4              |
| Pattern | clumped   | 57.3%    | -1.3     | -1.2       | -1.5                  | -4.2              |
| Pattern | spread    | 69.5%    | -3.5     | -0.4       | -2.9                  | -9.7              |
| Pattern | smart     | 75.1%    | -4.6     | -0.5       | -2.4                  | -10.7             |

Every player brings a Guard and a Support when they own one (a Support is then 25% of the creatures instead of 2%):

| Bosses  | Formation | Win rate | No Guard | No Support | No Shield Wall effect | None of the three |
| ------- | --------- | -------- | -------- | ---------- | --------------------- | ----------------- |
| Today   | clumped   | 53.1%    | 0.0      | -6.5       | -0.1                  | -7.1              |
| Today   | smart     | 69.2%    | -1.3     | -6.1       | -1.3                  | -8.9              |
| Pattern | clumped   | 54.3%    | -0.7     | -7.1       | -0.3                  | -8.4              |
| Pattern | smart     | 72.1%    | -3.4     | -7.2       | -1.4                  | -12.7             |

Reading it:

- **Today a Guard is worth 0 to 2 points** (the earlier study's 0 to 1.2). With patterns it is **worth 1.3 points when clumped and 3.5 to 4.6 when spread**: the new hits are aimed (Slam, Chain) and a Guard saves the strongest creature. The role is paid for by formation, not by its stats.
- **By boss** (patterned, smart formation; win points lost with the Guard role off, and with all three off): Colossus -0.2 and -1.8, Wyrm -7.1 and -20.9, Thornmother -2.4 and -5.5, Sovereign -8.6 and -14.8. The Guard pays most on the Sovereign, whose chain and slam aim at the strongest, and on the Wyrm. The Colossus is all area hits and one lance, which chip a team without knocking out its best creatures, so Guards barely show; its counter is the Shield Wall on the announced row, and the sim fires Shield Wall at its default timing, so the sim cannot show that value.
- **Which part of the Guard carries it** (a separate 6-seed run, patterned, smart, switching one part off; the whole role is -4.9 there): intercept -1.9, extra HP -0.9, cover -0.3, lance block 0.0. The parts do not add up; they overlap. Clumped, only the extra HP counts (-0.7). Cover is small in win rate, but on its own it stops 16% to 27% of a sweep, a barrage or a pincer (4.5): damage spread over many creatures rarely decides a finale, knock-outs of the strongest do.
- **Support:** the buff is worth 5.6 to 6.0 points when Supports are present (that exists today); the ward adds 1.7 to 2.1. In the sim's normal rosters supports are so rare that either is worth about half a point.
- **Shield Wall** is worth 1.5 to 2.9 points with the sim's rosters (today 1.6 to 2.0), and 5.5 to 7.9 points against the Cinder Wyrm alone, because a Shield Wall on the payoffs' row halves the reflected hit.
- **At what cost.** A Guard gives up a payoff's reaction damage: a roster built around Guards is not stronger, it is safer. In the dungeon (4.6) the same trade was measured directly against a second payoff.
- **Credit.** Contribution per creature, relative to the mean creature: Guard 0.51 today, 0.54 clumped and 0.62 spread with patterns; Support 0.80 today, 0.85 and 0.71; payoff about 1.1. With a Guard and a Support in every team, Guards and Supports sit at 0.55 to 0.58 against payoffs at 1.8 to 1.9 (the earlier study's 0.3x to 0.55x). Splash absorption and cover count (section 5), and it still barely moves credit: across the settings the Guard's intercept is at most 1.4% of team HP, its cover at most 2.6%, and the Support's ward at most 3.7%. Paying them like payoffs needs a credit multiplier, a separate decision.

### 4.4 Does placement change the outcome?

**Yes, more than any role.**

- **The same bosses, different formations.** Today's bosses: clumped 57.4%, spread 69.3%, smart 73.0%. Patterned: 57.3%, 69.5%, 75.1%. Most of it is not the Guards' stats: with Guards spread, a typical party's reactions per round go from 3.28 to 3.82 (+16%) and damage dealt rises about 5%, which is worth about 12 win points here. I did not chase the cause. A likely one is turn order: it decides who marks the boss and who cashes the mark, and `autoPlace` puts the weakly hitting Guards first and all the payoffs together at the back (not verified).
- **Which formation answers which pattern** (each pattern alone on a neutral boss, a typical or large party, every player brings a Guard, all rules on; team HP lost, and creatures knocked out):

| Pattern alone                 | Guards clumped in front | Guards spread           | Guards on the row ends | Spread, payoffs off the ends |
| ----------------------------- | ----------------------- | ----------------------- | ---------------------- | ---------------------------- |
| Sweep (a row, every 3)        | 17.0% lost, 4.6% KO     | 14.3% lost, 4.4% KO     | 14.9% lost, 4.3% KO    | 14.3% lost, 4.5% KO          |
| Barrage (2 to 6 random)       | 16.2% lost, 3.2% KO     | 12.8% lost, 3.1% KO     | 14.3% lost, 3.2% KO    | 12.8% lost, 3.1% KO          |
| Slam on the front-most        | 8.7% lost, 5.4% KO      | 9.4% lost, 5.0% KO      | 8.9% lost, 5.1% KO     | 9.4% lost, 5.0% KO           |
| Lance (one lane)              | **6.6% lost**, 2.8% KO  | 8.0% lost, 3.0% KO      | 8.2% lost, 3.0% KO     | 8.0% lost, 3.0% KO           |
| Chain (strongest and 2 jumps) | 10.2% lost, 2.8% KO     | **8.7% lost**, 4.8% KO  | 9.2% lost, 4.9% KO     | 8.7% lost, 4.8% KO           |
| Slam on the strongest         | 11.8% lost, 6.3% KO     | **10.0% lost**, 5.1% KO | 10.2% lost, 5.6% KO    | 9.9% lost, 5.2% KO           |
| Pincer (ends of every row)    | 20.6% lost, 11.6% KO    | 16.5% lost, 7.1% KO     | 20.7% lost, 13.8% KO   | 16.6% lost, **6.6% KO**      |

So: a **Lance** wants Guards at the front slots (they block it); **Chain, Slam on the strongest, Barrage and Sweep** want Guards spread (a Guard in the strongest creature's row, and one beside each fragile creature); a **Pincer** wants the valuable creatures off the ends and does **not** want Guards stacked on the ends, where they are hit every time and fall; a **Slam on the front-most** is answered by nobody but the front creature. A boss that mixes two of these (every boss does) means a formation is a compromise, which is the point.

### 4.5 What each counter stops, fairness and length

**Each pattern alone, what each counter stops** (neutral boss shell, boss pool that cannot fall, every player brings a Guard and a Support, formation smart; team HP lost in the finale; the percent is how much of the "nothing" damage the counter stops, and "KO" is the share of creatures knocked out). "Nothing" has every mechanic switched off:

| Pattern alone                     | Nothing         | Guard (spread) | Guard (clumped) | Ward           | Shield Wall (auto-timed) | All three     |
| --------------------------------- | --------------- | -------------- | --------------- | -------------- | ------------------------ | ------------- |
| Plain attack only                 | 5.3%, KO 5.7%   | -7%, KO 2.7%   | -7%, KO 2.8%    | -14%, KO 4.5%  | -19%, KO 4.7%            | -46%, KO 1.5% |
| Sweep (front row, every 3)        | 21.0%, KO 19.9% | -16%, KO 8.3%  | +3%, KO 6.1%    | -17%, KO 11.6% | -17%, KO 12.2%           | -48%, KO 2.9% |
| Barrage (2 to 6 random)           | 19.5%, KO 6.9%  | -25%, KO 3.1%  | -9%, KO 3.2%    | -14%, KO 5.6%  | -13%, KO 5.8%            | -47%, KO 1.9% |
| Slam on the front-most + splash   | 11.5%, KO 12.5% | +1%, KO 6.7%   | -3%, KO 6.6%    | -12%, KO 10.7% | -20%, KO 9.3%            | -37%, KO 3.4% |
| Lance (one lane)                  | 13.5%, KO 6.6%  | -31%, KO 3.1%  | -40%, KO 3.1%   | -14%, KO 5.4%  | -13%, KO 5.5%            | -55%, KO 1.8% |
| Chain (strongest + 2 jumps)       | 12.3%, KO 5.6%  | -20%, KO 5.1%  | -9%, KO 2.7%    | -9%, KO 4.4%   | -15%, KO 4.6%            | -42%, KO 2.9% |
| Slam on the strongest + splash    | 14.6%, KO 9.7%  | -18%, KO 5.3%  | -10%, KO 5.5%   | -8%, KO 8.0%   | -16%, KO 6.1%            | -43%, KO 3.7% |
| Pincer (ends of every row)        | 25.3%, KO 23.7% | -27%, KO 16.5% | -11%, KO 14.5%  | -12%, KO 22.0% | -13%, KO 21.7%           | -47%, KO 6.0% |
| Charged Barrage (3 to 6, every 4) | 18.4%, KO 7.2%  | -24%, KO 3.2%  | -8%, KO 3.4%    | -14%, KO 5.6%  | -22%, KO 5.4%            | -52%, KO 1.8% |

Every pattern has at least two counters that cut it by a tenth or more, and all three together stop 37% to 55%. A Guard does not always lower the damage (a Slam on the front-most: +1%) but it halves the knock-outs (12.5% to 6.7%), because the hit lands on a Guard instead of a payoff. The Shield Wall column is auto-timed (as the sim fires it); a player who fires it at a charged sweep's announced row does better, which was not simulated.

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

Foe patterns as in 3.2, clear rate of three-room runs, 2,000 runs per cell. "Old rules" is the Guard and Support as shipped; "new rules" has cover and a 40% ward. Teams are the earlier study's recipes, setter on the left unless the Guard is; level, fusion and gear are the medians of the sim's players at that depth. At depth 5 every team clears 45% to 50% and at depth 10 92% to 100%, patterns or not, so the roles only separate from about depth 12; the table shows depth 14 and a landmark depth (the same depth with the room boss's signature move).

| Team (left / middle / right)  | Depth 14 today | Depth 14, patterns (old rules) | Depth 14, patterns (new rules) | Landmark today | Landmark, patterns (new rules) |
| ----------------------------- | -------------- | ------------------------------ | ------------------------------ | -------------- | ------------------------------ |
| setter / payoff / payoff      | 76%            | 67%                            | 67%                            | 75%            | 56%                            |
| **Guard** / setter / payoff   | 82%            | 80%                            | 80%                            | 82%            | 77%                            |
| setter / **Guard** / payoff   | 79%            | 73%                            | 74%                            | 78%            | 64%                            |
| setter / payoff / **Guard**   | 49%            | 48%                            | 48%                            | 48%            | 47%                            |
| setter / **Support** / payoff | 61%            | 56%                            | **67%**                        | 60%            | **63%**                        |

- **A Guard on the left earns its place:** +13 points over a second payoff at depth 14 (+6 today) and +21 at a landmark (+7 today). A Guard in the middle is +7 and +8 (+3 and +3 today). A Guard on the right is not worth a slot, as today.
- **A Support with the ward now ties a second payoff** at depth 14 (67% against 67%; it was 15 behind) and is 7 ahead at a landmark. In an earlier run of the same foes a 30% ward left the Support 5 behind a second payoff at depth 14 and a 50% ward 9 ahead; **40%** is the middle.
- **What it costs.** All teams lose a few points: a payoff-heavy team 9 at depth 14 and 19 at a landmark; the Guard-left team 2 and 5. Per run, 0.1 to 0.3 more creatures are knocked out. To hold today's progression numbers the foes need to be 2% lighter (foe HP x0.98, or foe Attack x0.95, restores the mean clear rate of the four teams at depth 14 and 10 exactly: 74.4% to 74.5% and 95.5% to 95.5%). Run the full dungeon targets (`pnpm sim`) after that.
- **Cover** (40% or 60%) made no measurable difference in a row of three: the dungeon's value is intercept plus ward.

## 5. Risks

1. **Readability on a 360 px phone.**
   - Marks: a barrage, pincer or lance shows at most six reticles, a slam three (victim and two rings), a chain three plus arcs, a sweep an outline of the row (up to 15 creatures: no 15 reticles). The content test "at most two pattern actions a round" keeps a round to at most two kinds of mark.
   - Numbers: the most boss hits in a round in the runs was 19 (15 players); a sweep of a 15-creature row already shows 15 numbers today (Undertow). When an action hits more than eight creatures, show numbers only above 10% of max HP and one row total (numbers already overlap and rise, per the 2026-10-11 pacing decision).
   - Forecast text: at most two clauses ("Next round: Great Wave sweeps MIDDLE; Riptide cuts a lane"), on two lines.
   - **Adjacency does not line up when a row wraps.** A row of 15 wraps onto lines of five or six at 360 px, so "beside" in slot order is not always beside on screen, and a lane is not a column. Mitigation: marks go on the exact creatures (a shield pip on a creature a Guard covers, a ward pip on a warded one, the lance's beam through its three), the Placement strip draws the cover links, and optionally rows are laid out in fixed-width lines so columns align (`zone-layout.ts`).
2. **Fight length.** Two to three seconds longer in a typical finale, none for large parties (4.5). At the 22-second round cap a crowded round squeezes its creature staggers; the boss's actions are one beat each and do not grow.
3. **RNG feel.** The no-repeat rule, the cap of six shells and distinct victims make a volley fair (4.5). Charged targets are drawn once, at the announcement, never re-rolled. A boss crit stays its own die per hit.
4. **Reflect and reactions.** Backdraft is a direct hit and stays as it is. **The Cinder Wyrm's balance leans on it:** capping the reflected hit at 80% of the payoff's max HP moves its finale win rate from 56% to 87% (knock-outs 18% to 9%); at 40% it is 93%. So the reflect cannot be softened without a large rise in the Wyrm's HP (not measured), and that is a separate decision. The Wyrm's new moves (a barrage and a slam on the front-most) add 3 points of knock-outs (18.4% to 21.5%), not more. A charged hit lands after every creature's turn, so it never interferes with a mark or a reaction in the same round.
5. **Loot credit.** The rule is **credit what the Guard or Support actually saves or takes**: the HP a Guard loses in place of someone (an intercepted hit or a splash it takes), the HP it loses when hit itself (`guardOwnCreditBp`, as now), and the damage its cover prevents (credited to the Guard); the damage a ward prevents is credited to the Support. All of it is bounded by HP or by a share of a hit, so it cannot be farmed by standing in a splash. Measured, it moves a Guard from 0.51x to 0.54x to 0.62x of the mean creature and a Support from 0.80x to 0.71x to 0.85x: no one is paid like a payoff. If Misa wants that, a credit multiplier for Guard and Support is the lever, and it is separate.
6. **Boss Rank.** Pattern powers are percentages of boss Attack, and Attack grows with rank. Rank 5 (the median here) is Attack 72; **rank 9 is about three times that**. Against today's rosters at three times the Attack, with no cap, 18% of boss hits would one-shot a creature, 72% of the creatures would be knocked out and the finale win rate would be 10%. A cap on one hit (no hit takes more than 50% of the victim's max HP) brings that to 0% one-shots, 39% knocked out and 32% wins; at today's ranks it removes the 1% one-shots and lifts wins by about two points (so the tuned HP would rise about 4%). It was not in the tuned numbers above. Adopt it in slice 2 and re-tune, or lower `atkRankShareBp` for patterned bosses.
7. **Party-size slope.** The fixed-count patterns (a pincer's six hits, a lance's three) hit small parties harder; fixed by the per-boss exponent (4.2). Re-fit with `pnpm tune` after any power change.
8. **Complexity.** Guard has four rules and Support two, held together by one idea ("aimed" against "area"). A fifth rule was tried and dropped (nearest Guard). Each pattern gets a glossary entry of at most four lines, as `gimmick-hit-zone` has now.
9. **Stored fights and replays.** New dice are drawn after every existing die and only for a boss with a pattern op. A live fight stores the rules it used (`FightInput.rules`: `coverBp`, `wardBp`, absent means today's rules), as `luck` does, so a later retune never changes a stored fight. A client that meets an event it does not know must ignore it (`describeEvent` needs a default).
10. **Dungeon.** Foes are hidden before the run, so a pattern is a surprise unless the room banner and forecast tell it; the landmark boss is announced before the run. Row of three: a pincer hits two of three creatures and a whole-row sweep all three, so the dungeon's powers are low and its patterns few.
11. **Side findings.** (a) The default formation (`autoPlace`) is about 12 win points below a spread one against today's bosses (3.28 reactions a round against 3.82); changing `autoPlace` would shift the whole raid calibration, so leave it alone in this work. (b) The sim's players bring almost no Supports, so Support value cannot show in the sim's own targets. (c) The earlier study's Shield Wall number removes a player's ability slot along with the effect; the effect alone is worth 1.6 to 2.0 points.

## 6. Build plan

Slices in order. Each is one coherent commit group; the whole can be one PR. Tests are deterministic (seeded) and use the numbers from the prototype as expected values where noted.

**Slice 0: the hit model, no behaviour change.** `hurt()` in `packages/engine/src/fight.ts` takes a mode (`aimed`, `area`, `direct`) instead of `interceptable`; the plain attack and `strike_highest_atk` are aimed, `hit_zone` is area, reflect is direct. Tests: the existing golden fight and fixtures unchanged; a test that plays 40 stored rosters x 4 bosses x 3 stages through the engine and compares the event logs with a stored copy (the prototype did this against the shipped engine: 480 of 480 identical).

**Slice 1: Guard cover and Support ward.** `RULES.combat.coverBp` (4000) and `wardBp` (4000); `FightInput.rules?: { coverBp: number; wardBp: number }` (absent: 0 and 0, today's rules; whoever builds a live input copies `RULES` in, as for `luck`); cover for creatures beside a Guard against area hits; ward set each round by living, non-silenced Supports and consumed by a creature's first hit; credit in `perCreature` (cover to `guardCredit`, ward to `supportCredit`); events carry `covered` and `warded`. Files: `fight.ts`, `types.ts`, `config.ts`, `describe.ts`, the glossary entries `role-guard` and `role-support`, `packages/sim` (study switch `neutralSupports`). Tests: exact arithmetic on a row of 9 (the prototype's hand-made fights, boss Attack 100: a 100% sweep on a creature beside a Guard and a Support takes 36; a 300% slam that a Guard takes gives each neighbour 150, or 90 if the Guard is still standing when the splash lands, because cover uses the Guard as it stands then); cover and ward absent when `rules` is absent; silenced or knocked-out Support gives no ward.

**Slice 2: the new ops.** Schema in `packages/game/src/content/schema.ts` (below), dice (40 after all others, only for a boss with a pattern op), selection and resolution in `fight.ts` (partial Fisher-Yates, no-repeat rule, splash from the impact, lance stop, chain order), `strike_highest_atk` `jumps` and `decayBp`, the optional per-hit cap (`RULES.combat.maxHitBp`, recommended 5000, risk 6). Tests per op on rows of 3, 9, 21 and 45: exact targets; distinct shells; never the same creature in two volleys; a lance stopped by a Guard; splash on the impact's neighbours; chain order and no repeats; counts clamp; determinism with a seed; dice count is constant whatever happens; a boss without patterns draws exactly what it draws today.

**Slice 3: Charge and the forecast.** `charge` wrapper; the `charge` event; announce at `landing - 1`; fizzle for a fallen creature; `firstZoneHit` and `defaultAbilityRound` learn `sweep` rows and charged sweeps (Shield Wall's default row and round); `bossWarnings` in `gimmick-schedule.ts` grows target kinds (`rows`, `random`, `slam`, `lane`, `ends`, `charge`) and stays a pure function of content and round (the walk row of a sweep is `rows[(round / every - 1) mod length]`); `playback.ts` treats `charge` as a visible event (+600 ms in its beat) and the new boss actions as boss actions with wind-ups. Tests: the prefix property (rounds up to r unchanged when a Fire in round r changes round r+1); a Shield Wall fired in the announce round halves the charged sweep; forecast text per op and round; a stored fight with the old events replays.

**Slice 4: content and retune.** `bosses.json` (3.1), the `gimmick-*` glossary entries (seven, at most four lines each) and the `role-guard` and `role-support` edits (the coverage test requires them), How to play, the compendium (`bosses.md`, `dungeon.md`), `decisions.md`, `docs/balance/scalars.md` for the new scalars. Retune with `pnpm tune` (4.2): `power` first, then per-boss `baseHp` and `hpExponent`. Content tests: no round has more than two pattern actions for each boss's `finaleRounds`; none lands in round 1; `charge.trigger.every >= 2`; every boss keeps at most four gimmicks.

**Slice 5: telegraph and UI.** `apps/activity/src/telegraph.ts` (`strikeLabel`, `forecastNextRound`, both wordings), `stage.ts` (`BossStrike` actions, up to six reticles, row outline, splash rings, lance beam, persistent amber marks for a charge, cover and ward pips), `boss-icons.ts` and `raid-text.ts` (`gimmickText` and `gimmickShort` are exhaustive switches over `op`), `glyphs.ts` (seven glyphs), the Placement strip (cover links), the boss card popovers, the workbench gallery. Tests: the stage's beat and cue mapping for each op; label and forecast text; reticle count never above six; layout checks at 360 px (the existing zone-layout tests); reduced-motion frames; no `innerHTML` (render all text as text, creature names come from players).

**Slice 6: the dungeon** (after the left-to-right change has merged; it edits `dungeon.ts`, the telegraph and the dungeon content). Foe patterns (3.2), the landmark boss by depth (`rollRooms` takes the depth; a landmark picks `landmarkIndex mod 4`), the landmark signatures, the room banner line, the pre-run landmark card, `describeEvent` and the replay; foe HP x0.98. Tests: every shipped foe and boss played on a row of three, checking that each pattern reaches exactly the creatures it names (the test the earlier row change added, extended); landmark boss fixed per depth; a modifier test that none of them changes a pattern.

**Slice 7 (optional, later).** A formation hint in the Placement strip ("Guards spread: -9% HP lost to a Barrage"), a credit multiplier for Guard and Support, `pick: 'lowest_hp'`, and whether `autoPlace` should spread Guards (it lifts every win rate by 12 points: re-calibrate first).

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

New or changed events (`types.ts`): `charge { round, gimmick, marks: string[], rows?: Zone[] }`; `boss_hit` gains optional `splash: true`, `covered`, `warded`; the `gimmick` event keeps `op` (the new op names). New files: none (everything fits `fight.ts`, `zones.ts` for lane and ends helpers, `gimmick-schedule.ts`); `fight.ts` is already 1,100 lines, so put the pattern selection in a new `patterns.ts` that returns plans (targets and powers) to `fight.ts`, and keep `hurt()` there.

**Sim target updates (`packages/sim/targets.json`).** Keep the 47. Add: `raid.typical.koShare` range 10% to 22% (today 6%); `raid.guardValue` (win points lost with the Guard role switched off, spread formation) at least 2.0; `raid.patternFairness` (the same creature in two volleys running) at most 0%. Add a `roles` ablation report to `pnpm sim` (the prototype's switches, kept out of the engine as the existing `neutralGuards` study switch is).

## 7. Questions for Misa

1. **How hard may a boss hit?** In the prototype a finale takes about 30% of the team's HP and knocks out about 16% of the creatures in a typical party (about 11% and 6% today). Knock-outs last for that stage only, and the next stage starts everyone at full HP. _Recommended: yes, at this level._ It is what makes Guards and Shield Walls matter; we can turn the dial down with one number per move and re-check after the first live finale.
2. **Is it fine that some attacks are random?** Barrages pick 2 to 6 random creatures, never the same one twice running and never more than six, and the stage shows the victims as they fall (the charged one shows them a round ahead). _Recommended: yes._ Nothing in it can be computed by a player, and the streaks that feel unfair are removed.
3. **The Support gets a defence (the ward).** Without it a Support is a pure damage helper and, in the simulator, worth about half a point in the raid. With a 40% ward it ties a second payoff in the dungeon at depth 14. This changes the Support's description ("Boosts its neighbours' next hit by 15%, and softens the first hit they take each round by 40%"). _Recommended: yes._
4. **Dungeon landmarks: a fixed, announced boss?** Every 7th depth the room boss would be a fixed pick (Warden, Tyrant, Matron, Baron, then round again), named on the pre-run card with its charged signature move, so players can plan their row. Today it is drawn from the run's seed. _Recommended: yes._ It makes a landmark a planning day, which fits "modifiers and patterns shown before the run where possible".

## Appendix: the prototype in one paragraph

A fork of `fight.ts` (`fightx.ts`) takes a second argument of rule switches (`cover`, `ward`, `guardNearest`, ablations, caps) and reads the new gimmick ops from the boss; `lib.ts` builds raid weeks from the simulator's economy snapshots (`openRaidWeek`, `fightFor`) and plays the three stages with the fork; `dlib.ts` does the same for the dungeon's chain of rooms with foes always left to right. Experiments: 0 baseline and identity check; 1 lethality; 3 and 13 tuning (HP bisection, exponent grid); 5 and 11 ablations; 7 length; 9 each pattern against each counter; 12 win by party size; 14 fairness; 15 dungeon retune; 16 formation by pattern; 17 reflect cap; 18 hit cap; 19 credit; 20 hand-made arithmetic checks. Nothing from the scratchpad is in the repo.
