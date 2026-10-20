# Combat rules reference

Status: written 2026-10-15 from the engine (`packages/engine/src/fight.ts`, `patterns.ts`, `zones.ts`, `affects.ts`, `dungeon.ts`, `gimmick-schedule.ts`), `RULES` (`packages/game/src/rules/config.ts`) and the content data; revised the same day after the lead's decisions on its open questions (Shield Wall, chain and overkill were fixed in the engine; the terms row and line were settled). Style borrowed from card-game rules references (`docs/research/card-game-rules.md`). This document describes **what the engine does**. If the two disagree, the engine is right until a decision says otherwise (`decisions.md`).

## How to read this

- Rules are numbered (3.2, 3.2.1). An _Example_ follows each rule that is easy to misread. All example numbers are made up for the example (a boss Attack of 100 and so on), they are not balance values.
- Every number names the `RULES` field (or content field) it comes from, in `code`. The field is the truth; the number printed next to it is its value on 2026-10-15 and may be retuned. A field set to 0 is "off".
- All maths is whole numbers. Percentages are basis points in code (10000 = 100%). **Every division rounds down**, so a share that is taken away rounds down and what is left rounds up.
- **Old fights replay as they were fought.** A fight stored without rules (before the attack-pattern work) has none of these: armor, cover, the hit cap, element effects for Supports, a Guard roll, the Shield Wall of the creature that takes the hit (1.19, 3.3), the chain's "no creature twice" (6.6), and no overkill on the boss (2.4.5). A Guard in such a fight has 30% more HP (`RULES.combat.guardHpBp`). A fight stored without `bossAttacks` has one plain attack a round, and a fight stores the boss it was fought with (2.5.3), so a rank-gated move added later is not in it. This document describes fights with rules, which is every new fight (`liveFightRules()`).
- **Words that mean one thing each.** "Row", "line", "hit", "damage", "reduce", "instead" and "beside" are used exactly as defined in section 1.
- "The boss" means a raid boss or a dungeon foe or room boss, unless a rule says otherwise. It is one engine.

## 1. Terms

**1.1 Creature.** A player's creature in a fight. It has an element (Tide, Ember, Grove, Spark), a role (Setter, Payoff, Guard, Support), Attack, Speed and HP. The boss is not a creature.

**1.2 Line.** All the creatures one team brings, left to right. In the raid the line is three rows side by side: three creatures per player (`RULES.raid.teamSize`), the whole party; guests fill a small party up (`RULES.combat.guestRowSize`, `guestsBelowPlayers`). In the dungeon the line is three creatures (`RULES.dungeon.teamSize`), and each creature is a row of its own (1.4).

**1.3 Slot.** A numbered place in the line, counted from the left. Empty places in a formation are dropped before the fight, so slots are counted over the creatures that came. A creature keeps its slot for the whole fight. A knocked-out creature's slot stays; the others do not close up.

**1.4 Row.** Front, Middle or Back: the line cut into three parts. Front and Back each get a third of the slots, rounded down; Middle gets the rest. A line of one or two slots is all Middle. The stage draws each row as a line of its own, and player text says "row" for it ("sweeps the MIDDLE row"). **In code a row is called a zone** (`zone`, `zoneNeighbours`, `hit_zone`, `nearestLivingZone`); the content fields `sweep.rows` and `pincer.scope: rows` already say row.

_Example._ 9 slots are 3 / 3 / 3. 10 slots are 3 / 4 / 3. In the dungeon the line has three slots, so each slot is a row of its own: the left creature is Front, the middle one Middle, the right one Back.

**1.5 Beside.** The slot directly left or right of a creature.

1.5.1 In the raid, beside stops at the edge of a row (`zoneNeighbours`). The last Front slot is not beside the first Middle slot (decision 2026-10-14, "Raid neighbours stop at row edges"). A raid fight stands on the board: two creatures are beside each other only if their board slots are exactly one apart, so an empty board slot between them breaks it (decision 2026-10-18, board positions).

1.5.2 In the dungeon, beside is the plain line (`neighbours`): the left and the right slot, whatever the rows. (Every slot is its own row there, so a row edge would leave nothing beside anyone.)

1.5.3 **Two places away** (the longer reach of two gear sets, `coverReach` and `boostReach`) is the same idea one step on: in the raid the creature two board slots away in the same row, with a creature standing in the slot between (a gap breaks it, as it breaks beside); in the dungeon, two slots along the line. The position lines of gear (Front-liner, Back-row patience, Four winds, Lantern bearer, the ends and the middle of a row) and Lantern Night's Shield Wall for the Guards of a row are folded onto the sheet before the fight, from the same board: a creature next to an empty board slot has no neighbour on that side, and its row's ends and middle are its first and last creature (as the row-end silence counts them).

**1.6 Lane.** A slot position inside a row, read across all three rows: the creature at position 2 of Front, of Middle and of Back are in the same lane. With a line of 3N slots, a lane has three creatures. The position is the board's: an empty board slot keeps its column, so creatures after a gap do not shift left (`laneOfIndex`). In the dungeon there is one lane.

**1.7 Living, knocked out.** A creature is living while its HP is above 0. At 0 it is knocked out (the game never says "dead"). A knocked-out creature stays out for the rest of the fight. It does not act, is not a target of any boss rule, gives no buff and receives no buff or healing. Nothing revives it. (In the dungeon the run carries HP from room to room, so it stays out for the run.)

**1.8 Boss and foe.** The boss is the creature-side's opponent. A raid boss is a boss. A dungeon enemy is a foe; a foe of kind `boss` is a room boss. Foes and bosses follow the same rules.

**1.9 Plain attack and move.** The plain attack is what every boss does every round (`RULES.combat.bossAttackBp`, 100% of its Attack), once, or two or three times at the higher Boss Ranks (`FightInput.bossAttacks`, 2.5.2). A move is a special action from the boss's content (its `gimmicks`: Undertow, Cinder Fall, and so on). Moves come due on a schedule (`every: N` or each round). A raid boss's move can be **rank-gated**: it only exists in the fight from a Boss Rank on (2.5.3).

**1.10 Attack.** One thing the boss does that can hit creatures: the plain attack, or one move (including a charged move landing). An attack makes zero or more hits. Everything the boss does in one round is its **boss turn** (2.5).

**1.11 Hit.** One attack on one creature, resolved in the fixed order of section 3. An attack with many hits resolves them one after another, completely, in the order its rule lists.

**1.12 Proposed damage.** The amount a hit would deal before section 3 changes it: boss Attack times the attack's power, plus a crit if it crits (3.1).

**1.13 Damage.** What a hit deals after section 3 has changed it. Damage dealt and damage taken are the same number. **A creature loses at most the HP it has left, but the hit shows its full damage:** a creature with 30 HP left that takes a 100 hit shows 100 and is knocked out (as in card games, damage dealt can exceed what is left). Credit counts only the HP really lost (4.8). A hit that a Shield Wall stops is logged as 0.

**1.14 Source.** What a hit comes from: the plain attack, a move, the enrage hit, or a reflected hit.

**1.15 Aimed hit.** A hit with one chosen target. A Guard can take it instead (4.2). Aimed hits are: the plain attack, the first hit of a strike or chain, a slam's main hit, and a reflected hit.

**1.16 Area hit.** Every other hit: a row attack, a sweep, a barrage shell, a slam's splash, a chain's jumps, a lance, a pincer, an enrage hit. No Guard steps in for an area hit, but a Guard beside the victim covers it (4.3).

**1.17 Reflected hit.** Damage a reaction sends back at the creature that set it off (5.4). It is a new hit with the boss as source, not a redirect.

**1.18 Redirect.** A rule that says a different creature takes a hit **instead**. A hit is redirected at most once, and never to a knocked-out creature. The only redirect is the Guard's (4.2). The creature that takes the hit is the **taker**; the creature it was aimed at is the **aimed creature**. They are the same unless a Guard stepped in.

**1.19 Reduce.** Take a share off damage. The reductions are Shield Wall, armor, cover and the taker's modifier sheet (section 3, 10.5). Reducing never changes who is hit. Each reduction belongs to the taker: the Shield Wall of the taker's row, the taker's armor, the cover of a Guard beside the taker.

**1.20 Mark.** The element left on the boss by a creature's hit (Soaked, Scorched, Overgrown, Charged). The boss has at most one mark at a time.

**1.21 Reaction.** The extra damage when a creature of the right element hits a marked boss (Steam, Overload, Wildfire, Grounding). A reaction clears the mark.

**1.22 Setup and payoff.** The **setup** is leaving a mark. The **payoff hit** is the hit that cashes it in (sets off the reaction). The roles are written with capitals: a **Setter** is good at setup, a **Payoff** at the payoff hit. Any role can do either.

## 2. A fight

**2.1 Stages.** Everything is one engine fight against one boss, with one line.

2.1.1 A raid week has three stages for each party: **Phase 1** (Friday), **Phase 2** (Saturday) and the **finale** (Sunday). Boss HP carries from stage to stage (`RULES.raid.phases`). A creature's HP does not: each stage starts everyone at full HP.

2.1.2 A dungeon run is **three rooms** (`RULES.dungeon.rooms`): two normal foes, then a room boss. HP carries from room to room, and so does being knocked out. Every room is a fresh fight: no mark carries over, and the room's rounds start at 1.

2.1.2a **Between-room rest.** A creature that wears a Between-room rest line (a Scarf line of gear v2) recovers that share of its maximum HP when a room is won and the next begins (`DungeonRunInput.rest`, by creature id, in basis points; the shares of all its worn lines add). It never goes above its maximum and a knocked-out creature stays out. The raid has no rooms, so the line does nothing there.

2.1.3 Room modifiers (Flooded, Thorns, and so on) are plain changes to the room's numbers or one extra foe move, applied before the fight starts. They add no new rule.

**2.2 Rounds.** A fight is played in numbered rounds, from 1. Each round has the steps in 2.3 to 2.6, in that order. The step order never changes.

2.2.1 Round limits: Phase 1 and Phase 2 have 10 rounds each (`RULES.raid.phases[].rounds`). The finale has the boss's `finaleRounds` (12 for all four bosses). A normal dungeon foe has 6 rounds and a room boss 8 (`rounds` in `dungeon-foes.json`).

2.2.2 Overtime (enrage, section 7) adds rounds after the limit, in the finale and in a dungeon boss room only.

**2.3 Round start.** In this order:

1. The round is announced. If it is an enrage round, enrage is announced.
2. Dice are drawn (9.2). Nothing later in the round changes them. (With status effects on, the round's effect dice are the very last of them, 13.3.)
3. A charge that lands next round is announced and its victims are marked (6.12). Not in enrage rounds.
4. If the boss has a reflect move due this round, it arms (5.4). Not in enrage rounds.
5. Supports act (4.5): each living, non-silenced Support in slot order boosts, heals and cleanses the creatures beside it.
   5a. **Kind Rain** (`FightInput.rainHealBp`, 10.9), if the day has it: every living creature heals that share of its max HP. One `sky_heal` event names who was healed.
   5b. **Gear lines of the round start** (11 and 12), each creature in slot order and only while it stands: in round 1 Opening mark, then Kindling; then Warm heart, Second wind; in the first enrage round Second breath.
6. Finale abilities set for this round fire, in the order they were stored (section 8). Not in enrage rounds. If the boss has fallen or retreated, they do not fire.

**2.4 Creature turns.** Creatures act one at a time in the boss's turn order.

2.4.1 Turn order is set by the boss. A raid boss has one of: `left_to_right`, `right_to_left`, `serpentine` or `speed` (highest Speed first, ties to the lower slot). `speed` stays in the engine so stored fights replay, but no boss in content uses it. `serpentine` goes row by row, Front then Middle then Back; on odd rounds (1, 3, ...) Front and Back run left to right and Middle right to left, on even rounds every row flips. Board slots 1 to 9 with three per row: round 1 acts 1,2,3,6,5,4,7,8,9; round 2 acts 3,2,1,4,5,6,9,8,7. Uneven rows work the same, gaps and knocked-out creatures are skipped, and enrage rounds keep flipping by round number. The order is worked out each round, and Overflow reads that round's order. Today: Tidal Colossus and Storm Sovereign left to right, Thornmother right to left, Cinder Wyrm serpentine. The dungeon is always left to right (`RULES.dungeon.turnOrder`), whatever the foe or the room says.

2.4.1a **The end of a creature's turn.** After a creature's turn, whether it hit the boss or was skipped (2.4.2), the status effects on it count down by one turn (13.4). A knocked-out creature has none left.

2.4.2 A knocked-out creature is skipped. A silenced creature skips its turn and its silence counts down by one (6.4). Every other creature hits the boss (2.4.3). **Morning Haze** (`FightInput.skipFirstTurn`, 10.9): a creature named there also skips the first turn it reaches alive (a `skip` event with reason `haze`); if that turn was silenced anyway, the silence is the lost turn and the haze is spent on it, so it never costs two.

2.4.3 A creature's hit on the boss deals its Attack, times the element matchup (read from the **element chart**: today 150% against the element it beats, 75% against the element that beats it, otherwise 100%), times one combined bonus (Support boost, Rally, crit, mutators; they add together, then multiply once), minus the boss's resist if it has adapted. Then marks and reactions (section 5). After the hit (12) an Echo can land it again.

**The element chart** (`element-chart.json`) is a list of attacker-to-defender pairs, each with a multiplier in basis points: today Tide, Ember, Grove and Spark each deal 15000 to the next in the loop and 7500 to the one before. A pair that is not listed is 10000 (neutral). An element can be strong against, or weak to, several others; "strong" means exactly 150% (`CHART_STRONG_BP`). `matchupBp(attacker, defender)` reads the chart; foe hits on creatures ignore it. The chart's numbers are balance knobs (`docs/balance/scalars.md`).

2.4.4 If the boss's pool reaches 0, or reaches its phase floor (section 7), the creatures after it do not act and the boss does not take its turn.

2.4.5 **No overkill.** A hit on the boss counts only up to the HP the boss had left on that hit, down to 0 (a kill) or down to the phase floor (a retreat, 7.1). The part above is not damage: it is not in the log's `damage`, the reaction bonus (the plain hit is counted first, the bonus gets what is left), the credit, or the totals per element. The boss then falls (or retreats) and the fight stops (2.7).

_Example._ The boss has 150 HP left. A creature's plain hit would deal 100 and its reaction bonus 212, 312 in all. 100 counts, then 50 of the bonus: the log says 150, the boss is at 0, and the setup is credited from a bonus of 50.

**2.5 The boss turn.** If the boss is still up:

1. Its moves that are due this round, in the order of its content list. Each move picks its targets just before it lands, from the creatures standing at that moment. (None in an enrage round.)
2. Its plain attack.
3. In an enrage round only: the enrage hit (7.2).
4. The end of the boss turn: the status effects on the boss count down by one turn (13.4). A boss that fell or retreated earlier in the round has no boss turn, so nothing counts down.

A `purge` move (13.6) is one of the moves of step 1, in its place in the content list.

So the plain attack comes **after** the moves, and it picks its target after they have done their damage. This is how the game plays, on purpose: a move can knock out the front creature and the plain attack then goes for the next one standing.

2.5.2 **More than one plain attack.** `FightInput.bossAttacks` (1 to 3, absent is 1) is how many times the boss makes its plain attack in step 2, in a row. Each one is a complete plain attack (4.2.5, 6.2): it picks its target when it is made, from the creatures standing at that moment (so a creature the one before knocked out is not aimed at again, and the next one goes for the next front creature or Guard), it is its own aimed hit, and it has its own boss crit die (3.1.1, 9.2). A Guard in the front row takes every one of them (the same Guard die picks among several Guards each time, 4.2.3). Enrage rounds make them too (7.2.1). The input is built from the `bossAttacks` column of the raid curve (`RULES.raid.curve`, read by `bossAttacksAtRank`; the last row holds above the table). The input only carries the field when it is above 1, so every stored fight replays as it was.

_Example._ With `bossAttacks` 3, Front is s0 (100 HP), s1 (100 HP), s2 (Guard) and a boss Attack of 100: the first attack goes for the Guard s2 (the front row's Guard takes it), and so do the second and third. Without a Guard: the first knocks out s0, the second knocks out s1, the third hits s2.

2.5.3 **Rank-gated moves.** A raid boss's move may carry `fromRank` (a whole number from 2; absent is always). The worker builds the week's boss with `bossAtRank(boss, rank)` (the rank the boss fights at, `fightRank`): only the moves whose `fromRank` is absent or reached are in `boss.gimmicks`, in content order (so a move keeps its place and its pattern dice window, 9.2). Everything that shows the boss is built from that boss: the fight, the readiness forecast, the boss card, the forecast and the Discord reveal. The fight input stores the boss it was fought with, so a replay never looks at the content again and a later rank or content change never reaches a stored fight. Dungeon foes have no ranks and may not carry `fromRank`. The content limits that go with it: at most six moves in all, at most two damaging moves in any round and none of the attack patterns in round 1 (the content tests check each boss at ranks 1, 4, 7 and 10).

2.5.1 A move is due when its trigger fits the round: `every: N` is due in rounds N, 2N, 3N ... and `eachRound` in every round. The number of times a move has come due up to this round is its **firing** (a move `every: 5` has firing 1 in round 5, firing 2 in round 10).

**2.6 Round end.** The round is closed in the log. If every creature is knocked out, the fight ends here.

**2.7 How a fight ends.** The fight stops at the first of these:

1. **Kill.** The boss's pool is 0. The creatures win. (Phases 1 and 2 have a floor above 0, so they never end this way.)
2. **Retreat.** The pool reaches the phase floor (7.1). The phase is cleared.
3. **Wipe.** Every creature is knocked out. The creatures lose.
4. **Out of rounds.** The last round, including any overtime, is played. In a raid phase the stage ends: it is cleared if the boss lost at least `RULES.raid.phases[].clearAtLossBp` of its maximum HP in the week (30% for Phase 1, 85% for Phase 2), otherwise not. In the finale, and in a dungeon room, the boss still standing is a loss.

The fight is checked after every creature turn: a hit that kills or retreats the boss stops everything after it, including the rest of the round.

## 3. Resolving one hit

**3.1 Proposed damage.** The boss's Attack, times the attack's power (a share of its Attack: the plain attack `RULES.combat.bossAttackBp`, a move's `power`), rounded down. Each hit is worked out on its own. A crit can then add to it.

3.1.1 A crit is decided by a die for the aimed creature's slot (9.2): chance `RULES.combat.luck.bossCritChanceBp` (5%) plus the boss's own bonus, damage `bossCritBp` (+50%), both capped (`critMaxChanceBp`, `critMaxBp`). A reflected hit never crits.

**3.2 The order.** A hit changes in exactly this order, each step working on what the one before left. Nothing is skipped or reordered.

1. **Who takes it:** the Guard step-in, or the Guard roll (4.2). The rest of the steps belong to the taker. **Dodge** (14) comes right after this step, when the fight has it: a hit the taker dodges deals nothing and the steps below are skipped. **Sidestep** (11) comes next, and is only rolled if the dodge failed: an area hit that a Sidestep roll turns aside deals nothing and the steps below are skipped.
2. **Shield Wall** on the taker's row (3.3).
3. **Armor**, if the taker is a Guard (4.1).
4. **Cover**, if it is an area hit and the taker is beside a living Guard (4.3).
5. **The taker's modifier sheet** (10.5), if it has one: the ward against the boss's element, then charged moves, then the hit's shape (area, aimed or reflected), then every hit, then (trigger lines, 12) Last stand once it has fired, and Storm warning on the landing it was marked for. Always after armor and cover.
6. **The single-hit cap**: off (`RULES.combat.maxHitBp` 0). If it were above 0, no aimed or area hit would deal more than that share of the taker's maximum HP (never less than 1). It never limits a reflected hit.
7. **HP**: the damage is taken, the taker loses that much HP, but never more than it has left (1.13).

3.2.1 Rounding: every step rounds the amount **down**, so each reduction prevents a rounded-down share.

_Example._ Cinder Wyrm's Coil Crush with a boss Attack of 100 (`power` 310%, `splashBp` 45%) aims at creature A. A, a Guard G and a creature B stand in the Front row, with B beside G. A Shield Wall of 50% is up on Front.

- Proposed damage 310. G steps in. Shield Wall (G's row is Front): 155. Armor (25%, `RULES.combat.guard.armorBp`): prevents 38 (155 x 25% = 38.75, down), so G takes 117.
- The splash is worked out from the move's 310, not from what G took: 310 x 45% = 139. It goes to every living creature beside G (the impact), as an area hit. B: Shield Wall 69, cover (40%, `RULES.combat.coverBp`) prevents 27, so B takes 42.

**3.3 Shield Wall.** A Shield Wall belongs to a row and runs for some rounds (8.3). It is checked against the row of the **taker**, after any Guard stepped in (3.2 step 2). It does not matter which row the hit was aimed at. Several walls on a row multiply: two 50% walls leave 25% of the damage. A wall reduces every kind of hit on that row, including splash, enrage and reflected hits. A wall that reduces a hit to nothing ends the hit: no HP is lost. The log names the taker (the Guard) and the aimed creature it stood in for.

3.3.1 In the raid a Guard stands in the aimed creature's row, so the taker and the aimed creature are in the same row and the rule changes nothing. In the dungeon every slot is its own row: a Guard that steps in from the next slot is protected by the wall on **its own** slot, not by the wall on the slot the hit was aimed at.

_Example._ In the dungeon the foe's slam is aimed at the left creature (Front) and the Guard in the middle (Middle) takes it. A Shield Wall of 50% on Middle halves it. One on Front does nothing to it.

**3.4 Knock-out.** When a creature's HP reaches 0 it is knocked out at once: it is marked down in the log, it stops being a target, and it can no longer act, cover, step in, boost or be healed. The attack that knocked it out carries on.

3.4.1 **A creature that falls in the middle of an attack is skipped** by the later hits of the same attack. The hit is not aimed again.

_Example._ Lightning Rod (a chain) aims its first hit at your strongest creature A, but Guard G steps in and G is knocked out. G was never going to be hit again (6.6), and the jumps go on to the creatures that were not hit.

3.4.2 The reverse also holds. A Guard that was knocked out earlier in the same attack no longer steps in or covers; its neighbour takes the next hit itself.

**3.5 Order of hits inside an attack.** Hits land in the order the rule lists them: the creatures of a row from left to right, a chain from strongest down, a lance from Front to Back, a pincer's first end before its last. Each hit is fully resolved (3.2 to 3.4) before the next starts, so a Guard that fell on hit 1 is gone for hit 2.

## 4. Roles

**4.1 Guard: armor.** A Guard has no extra HP (`RULES.combat.guard.hpBp` 0) and takes 25% less damage from **every** hit that reaches it (`RULES.combat.guard.armorBp`): a hit aimed at it, a hit it takes for a neighbour, a splash, a lance, an enrage hit and a reflected hit. Armor works after Shield Wall (3.2). One number serves every Guard for now.

4.1.1 Armor and cover never stack: cover is for creatures that are not Guards.

_Example._ An area hit of 100 reaches a Guard that stands beside another Guard. It is not covered (a Guard is never covered). Armor prevents 25, so it takes 75.

**4.2 Guard: it takes aimed hits.** When an aimed hit would hit a creature that is not a Guard, a living Guard takes it **instead** (a redirect, 1.18).

4.2.1 Who can: in the raid, a living Guard anywhere in the same row as the aimed creature. In the dungeon, a living Guard directly beside it (the left one is a candidate before the right one).

4.2.2 **A hit aimed at a Guard stays on it.** It is never redirected to another Guard. A hit is redirected at most once: the Guard never passes it on.

4.2.3 **Two Guards roll.** If more than one living Guard can take the hit, a die picks one, evenly. The die belongs to the slot the hit is aimed at, drawn at round start (9.2), and candidates are counted left to right. Every hit aimed at the same slot in the same round uses the same die, so it picks the same place in the list (the same Guard, unless a Guard has fallen since).

_Example._ Guards G1 and G2 are in the Front row, and the boss's plain attack and a slam both aim at the front-most creature A this round. The same die picks for both, so the same Guard takes both hits, unless that Guard is knocked out by the first.

4.2.4 What a Guard takes instead: aimed hits only. The plain attack, a strike on the strongest, the first hit of a chain or slam, a reflected hit (5.4). Not: a row attack, a sweep, a barrage, a splash, a jump of a chain, a lance, a pincer, an enrage hit.

4.2.5 **The plain attack goes for the Guard.** In the raid, the plain attack aims at the front-most row that has someone standing and takes that row's Guard if it has one (the roll of 4.2.3 picks among several, using the die of the row's front-most creature), otherwise that row's leftmost living creature. In the dungeon it aims at the leftmost living creature, and a Guard beside it steps in.

**4.3 Guard: cover.** A creature right beside a living Guard (1.5) takes 40% less from **area hits** (`RULES.combat.coverBp`). It applies at step 4 of 3.2 (a Guard's own sheet can add to it, 10.6), to splash, sweeps, barrage shells, lance hits, pincers, chain jumps and enrage hits alike. A creature beside two Guards is covered once (the left one counts and is credited). The damage prevented is credited to the Guard (a score, not a rule).

_Example._ In the raid, a Guard at the end of the Front row covers its Front neighbour but not the first Middle slot: beside stops at the row edge (1.5.1). In the dungeon, a Guard in the middle covers both its neighbours.

**4.4 A Lance stops at a Guard.** A lance hits the creature in its lane in each row, Front to Back. A living Guard in the lane takes its hit (with its armor) and stops the lance: nobody behind it is hit (6.10).

**4.5 Support.** At the start of each round (2.3 step 5), every living Support that is not silenced does the following for each living creature beside it, in slot order.

4.5.1 **Reach.** Beside is as in 1.5: in the raid the reach stops at the edge of the Support's row, in the dungeon it is the plain line. A Support beside a knocked-out creature gives that slot nothing: it does not reach past it.

4.5.2 **Boost.** The creature's next hit on the boss deals more: 15% (`RULES.combat.supportBuffBp`), or 25% for an Ember Support (`RULES.combat.supportFx.ember.buffBp`). It waits until the creature hits; a silenced creature keeps it. A second boost from the same Support replaces the first; boosts from different Supports add up. A boost already given stays if the Support is later knocked out.

4.5.3 **Element effects.** Tide: heals 4% of the creature's max HP (`supportFx.tide.healBp`), and clears its silence (`supportFx.tide.cleanse`). Grove: heals 6% (`supportFx.grove.healBp`). Spark: when the creature sets off a reaction, the reaction's bonus damage is 15% larger (`supportFx.spark.reactionBp`; not when the reaction is reflected). Ember: the stronger boost above. A cleansing Support (Tide) also removes every debuff from the creature (13.7).

4.5.4 **Healing never revives and never overheals.** It heals at most what is missing. It skips knocked-out creatures.

4.5.5 A knocked-out or silenced Support gives nothing that round.

_Example._ A Support in the last slot of Front is beside the slot to its left only. It does not boost the first Middle creature.

**4.6 Setter.** A Setter's hit leaves its element's mark on the boss, replacing a mark of another element (5.2). It is the only role that can replace a mark.

**4.7 Payoff.** When a Payoff's hit sets off a reaction, the reaction's multiplier is 10% higher (`payoffBonusBp` 110% in `reactions.json`).

**4.8 Credit.** Armor, cover, healing, setup and boosts are credited to the creature that did them (`guardCredit`, `supportCredit`, `setupCredit`). Credit decides loot shares only. It never changes the damage dealt.

4.8.1 Credit counts what really happened, never the proposed amount: damage to the boss counts up to the HP the boss had left (2.4.5); damage a Guard takes counts up to the HP it had left; and the damage armor or cover prevented counts only up to the HP it really saved (a Guard with 40 HP left that takes a 100 hit with 25% armor takes 40, and its armor is credited nothing, since the hit would have knocked it out either way).

4.8.2 **Healing is credit that damage does not pay for.** The HP a Support really restores is credited to it as `supportCredit` by design, like what a Guard absorbs. Credit is therefore not zero-sum against the damage dealt: the total credit of a fight is higher than the damage it dealt by the healing and the prevented damage, and nobody should expect the two to match.

## 5. Marks and reactions

**5.1 Marking.** A creature's hit on a boss with no mark leaves its element's mark: any role can do it. The mark stays across rounds until it is cashed in or replaced. A fight starts with no mark.

**5.2 Replacing.** If the boss has a mark and a hit does not set off a reaction: a Setter whose element is different replaces the mark. Any other creature changes nothing.

**5.3 Cashing in.** A mark is set off by any element that deals 150% to the marking element on the element chart (2.4.3), so a mark can have more than one trigger. Each (mark, trigger element) pair is its own entry in `reactions.json` with its own id, name and numbers; entries of one mark share its mark id and name. A creature whose element is a trigger of the mark, and that hits a boss carrying it, sets off the reaction for that pair (the engine looks it up by mark element and trigger element). Content tests check that every reaction's trigger deals 150% to its mark and that every 150% pair has a reaction. Today each mark has one trigger:

| Mark (element)    | Set off by | Reaction  |
| ----------------- | ---------- | --------- |
| Soaked (Tide)     | Spark      | Overload  |
| Charged (Spark)   | Grove      | Grounding |
| Overgrown (Grove) | Ember      | Wildfire  |
| Scorched (Ember)  | Tide       | Steam     |

5.3.1 The hit deals `multiplierBp` times its plain damage (450%); a Payoff gets 495% (`payoffBonusBp`). The part above the plain hit is the **bonus**. The boss's adaptation can cut the bonus. Element effects of Supports can raise it (4.5.3). The bonus is counted after the plain hit and, on a hit that ends the fight, only up to the HP the boss had left (2.4.5).

5.3.2 The mark is cleared. The hit that cashed it in leaves no new mark, so the next hit marks again.

5.3.3 The setup is credited with 60% of the bonus (`RULES.combat.setupShareBp`); the payoff hit keeps the rest. This is credit only.

_Example._ Cindle (Ember) hits first and leaves Scorched. Splashet (Tide) acts after it and sets off Steam. If Splashet acts first, it finds no mark and leaves Soaked; Cindle's Ember hit does nothing special, since Soaked needs Spark.

**5.4 Reflect (Backdraft, Molten Shell, Thorns).** A reflect move arms at round start (2.3 step 4), **every round it is due** (a reflect move due every round arms every round). The **first** reaction set off that round, by a creature that is still living, is reflected.

5.4.1 The payoff hit deals its plain damage only. The bonus does not go to the boss. It becomes a **reflected hit** on the creature that set off the reaction: source reflect, no crit, no cover, no cap.

5.4.2 **Who takes it.** It is treated as an aimed hit on that creature: a Guard that can take hits for it takes it **instead** (raid: a living Guard in its row; dungeon: beside it; the roll of 4.2.3 if several), then the taker's Shield Wall and armor. A creature that is itself a Guard takes it with armor.

5.4.3 The reaction still counts: the mark is cleared. The setup earns no credit.

5.4.5 **Bramble Season** (`FightInput.brambleBp`, 10.9) is a smaller, always-on cousin of Backdraft that needs no boss move. The **first** reaction set off each round, by a creature that is still living, sends that share of its bonus damage back as a reflected hit on the creature that set it off (the payoff creature, as in 5.4.1); the boss takes the rest of the bonus. The returning part is the same kind of hit as Backdraft's: aimed at that creature, a Guard that can takes it instead, then the taker's Shield Wall, armor and sheet (`reflectedBp`, `takenBp`, the ward), no crit, no cover, no cap. The setup earns credit from what the boss took. If Backdraft already reflected that reaction whole, that reaction was the round's first and Bramble does nothing more (a second reaction is never Bramble's). It works in every round, enrage rounds included, and draws no die. A share too small to send anything back writes no hit.

5.4.4 **One reflection a round.** It is armed for one round only; the next round arms it again. Only the first reaction of the round is reflected: a second reaction in the same round goes through unreflected, as an ordinary reaction. An ability's strike from a creature that is knocked out is never reflected.

_Example._ Wyrm's Backdraft is armed. Splashet's plain hit is 100; Steam makes it 450, so the bonus is 350. The boss takes 100. A Guard stands in Splashet's row: it takes the 350 instead, armor prevents 87 (25%), so it takes 263.

## 6. Boss moves

**6.1 In general.** Each move names its power as a share of boss Attack for each hit. A move is aimed or area (1.15, 1.16), and picks only **living** creatures. When a rule below has no living target, it does nothing.

**6.2 Plain attack.** One aimed hit, `RULES.combat.bossAttackBp` of Attack, on the target of 4.2.5.

**6.3 Row attack (`hit_zone`: Undertow, Thorn Rain).** An area hit on every living creature of the aimed row, at the move's `power`.

6.3.1 **Nearest-living-row fallback.** If nobody stands in the aimed row, the attack goes to the nearest row that has someone: one step away first; on a tie Front before Back (`nearestLivingZone`). It does nothing only when the whole line is down.

_Example._ Undertow aims Front. Front is knocked out, Middle and Back stand. It hits Middle (one step), not Back (two). If Middle is aimed and Front and Back both stand, it hits Front.

6.3.2 In the dungeon every row is one slot: a row attack hits the creature at that place, and passes to the next one if it is down.

**6.4 Silence (`silence_ends`: Bramble Bind, Sea Mist, Thorn Snap, Tangle).** No damage. With `scope` `rows` (the raid: Bramble Bind, Choking Vines) the leftmost and the rightmost living creature of each row (Front first, the board's rows, see 1.4) are silenced; a row with one creature standing silences it once, an empty row is skipped. With `scope` `row` (the dungeon) it is the two ends of the whole line, as in 6.11. A silenced creature skips its next `turns` turns (1 or 2 today). A silence already running is not added to, it lasts as long as the longer one. A silenced creature skips its turn when it would have acted, and the count goes down then. A silenced Support gives nothing (4.5.5). A Tide Support beside a silenced creature clears it at the next round start (4.5.3).

6.4.1 Silence is applied after the creatures act, so it first bites in the next round.

**6.5 Reflect (`reflect_first_reaction`).** Not an attack. It arms the trap of 5.4.

**6.6 Strike and chain (`strike_highest_atk`: Lightning Rod, Zap Dive, Arc Lash).** A first **aimed** hit on the strongest living creature (highest Attack; ties to the lower slot), at `power`. With `jumps` above 0, jump k (1 to `jumps`) is an **area** hit on the k-th next strongest creature at `power` times `decayBp` to the power k (each step rounded down; default 55%). The creatures are ranked once, before any hit lands, so a jump is not re-aimed.

6.6.1 **No creature is hit twice by the same chain.** The jumps go down the ranking after the strongest. A creature the chain has already hit is skipped, and the jump goes to the next strongest not yet hit. The only creature that can already have been hit is the one that took the first hit: a Guard that stepped in for it. So a Guard that took the first hit is skipped by the jumps even if it is the next strongest, and the chain reaches one creature further down.

_Example._ Attack order A (strongest), G (a Guard), C, D. The strike aimed at A is taken by G. Jump 1 skips G and hits C, jump 2 hits D. (Without rules, in an old fight, jump 1 hit G again.)

6.6.2 The `gimmick` event lists the creatures as picked by the ranking, before any Guard stepped in; the hits that follow are the truth.

**6.7 Sweep (`sweep`: Great Wave, Flood Gate, Static Field, Spring Tide, Eruption).** An area hit on every living creature of one row. `rows` is a walk: firing n hits `rows[(n - 1) mod length]`. A named row with nobody standing falls back like 6.3.1. With `all`, every living creature of every row is hit (a row with nobody is skipped).

6.7.1 **The Payoff row (`payoffs`).** The row with the most living Payoffs. A tie goes to the front-most row, then the middle one; with no Payoff standing anywhere, every row counts as 0, so it is the front-most row with someone standing. It is worked out from who stands when the sweep is planned (for a charge, when it is announced, 6.12.1). It exists to punish a line that stacks its Payoffs in one row: cover helps only the creatures beside a Guard (4.3) and no Guard steps in for an area hit (1.16). A row of fixed size cannot be "fullest", so the Payoff count is what tells a stacked row from a spread one (the earlier idea of a `fullest` row was dropped for that reason).

**6.8 Barrage (`barrage`: Cinder Fall, Seed Burst, Thorn Rain, Flare Up).** Shells land on distinct living creatures, each an area hit at `power`. Shells cannot be stepped in for, but cover works.

6.8.1 Number of shells: living creatures times `shareBp`, rounded up, held between `min` and `max` (and never above the living count).

6.8.2 Fairness: no creature is hit twice in one volley. A creature hit by this move's **last volley** is skipped (not "never the same twice running" without exception), **unless fewer than the shell count of other creatures are standing**: then all the others are hit and the rest are taken from the last volley's creatures. The last volley is remembered **per move**: a boss with two barrage moves keeps two memories, and one does not see the other's volley. The picks are a shuffle driven by the round's dice (9.2).

**6.9 Slam (`slam`: Coil Crush, Thunderclap, Magma Spit, Judgement Bolt, Root Grab, Anvil Fall).** An aimed hit at `power` on the victim, then a **splash**.

6.9.1 The victim: `front` (picked exactly as the plain attack picks, including the Guard and its roll, 4.2.5), `strongest` (highest Attack, ties to the lower slot), `left` (the leftmost living creature), `random` (one die over the living creatures), or `payoff` (the living Payoff with the highest Attack, ties to the lower slot; with no Payoff standing, the strongest creature, so the slam is never wasted).

6.9.1.1 **The Payoff slam punishes an exposed Payoff.** It is an aimed hit like any slam, so a living Guard in the Payoff's row takes it instead (4.2): a protected row shrugs it off, a greedy row with no Guard in the Payoff's row loses its carry (and the splash goes beside whoever took it, 6.9.2).

6.9.2 The **impact** is the creature that took the hit: the Guard if one stepped in, else the victim. Every living creature beside the impact takes `splashBp` of the move's damage (worked out as in 3.2's example: from the move's own amount before any reduction) as an **area** hit, so cover and Shield Wall apply to it. The splash goes beside the impact even if the impact was knocked out by the hit.

**6.10 Lance (`lance`: Riptide).** An area hit on the creature in the chosen lane of each row, Front then Middle then Back. Row number r (0, 1, 2) takes `power` times `falloffBp` to the power r (each step rounded down). The lane is `random` (one die over the lanes that have a living creature) or `strongest` (the lane of the strongest living creature).

6.10.1 An empty or knocked-out slot is passed through: it takes nothing and the next row keeps its own falloff. **A living Guard in the lane takes its hit (with armor) and stops the lance**: nobody behind it is hit.

6.10.2 With a line that is not a multiple of three, Middle is the widest row, and a lane past the end of a shorter row has nobody there. The same goes for an empty board slot (a gap): the lance passes through it and hits the creature further back in that column.

**6.11 Pincer (`pincer`: Briar Pincer, Briar Cage).** (Silence, 6.4, picks its ends the same way.) An area hit on the first and the last living creature of each row (`scope` `rows`, Front first) or of the whole line (`scope` `row`, used by Briar Cage in the dungeon). A group with one creature is hit once. A group with nobody is skipped.

**6.12 Charge (`charge`: Great Wave, Seed Burst, and the dungeon bosses' signature moves).** A charge wraps a sweep, barrage, slam, lance or pincer. Its trigger is the **landing** round.

6.12.1 **Announcement.** At the start of the round before landing (2.3 step 3) the inner move picks its victims from the creatures standing then, with that round's dice, and the log names them (and the rows, for a sweep). The marks are fixed from then on.

6.12.2 **Landing.** In the landing round the marked creatures that are still standing are hit, at the move's power, as the inner move says (a charged slam is aimed; a Guard steps in at landing). A creature that fell in between is **spared**: it is skipped, and nobody is aimed again.

6.12.3 A charge never lands in round 1 (there is no round before it) and never in an enrage round (nothing is announced after the last base round).

6.12.4 **Charge and Shield Wall.** An ability's effects start at the start of the round it fires in. An ability pressed during the announcement round fires at the start of the **landing** round (live pressing sets `fireAtRound` to the round now playing plus one), so a 1-round Shield Wall pressed then covers the landing, and only the landing. A wall that is set for the announcement round itself (a stored `fireAtRound` equal to it) with 1 round ends before the landing; with 2 rounds it covers the landing too (8.3).

**6.13 Dungeon signature.** At a landmark depth (every `RULES.dungeon.landmarkEvery` 7th) the room boss also has its charged `signature` move, after its own moves in the order of moves.

## 7. Floors, retreat and overtime

**7.1 The phase floor (Phases 1 and 2 only).** The boss's pool cannot go below a floor: the stage's clear line (`RULES.raid.phases[].clearAtLossBp`). Phase 1 clears at 30% of the boss's maximum HP lost, so 70% is left; Phase 2 at 85% lost, so 15% is left for the finale. The floor is rounded so that reaching it always counts as cleared.

7.1.1 A creature hit that reaches the floor counts only down to it (2.4.5): the damage above the floor, and its credit, is not counted.

7.1.2 **Retreat.** The moment the pool reaches the floor, the boss retreats and the stage ends **at once**: the creatures that have not yet acted do not act, and the boss does not take its turn. The stage is cleared. Damage past the floor counts for nothing.

7.1.3 The finale has no floor: the boss can fall to 0 (2.4.5 counts only the HP it had left).

**7.2 Overtime (enrage).** In the finale (`RULES.raid.enrage`) and in a dungeon boss room (`RULES.dungeon.enrage`, switchable with `enabled`; normal dungeon rooms have no overtime), when the base rounds run out with the boss and at least one creature standing, extra rounds are played: 3 in the raid (`RULES.raid.enrage.rounds`), 2 in the dungeon (`RULES.dungeon.enrage.rounds`).

7.2.1 An enrage round runs as every other round (2.3 to 2.6) with these changes:

- The boss's moves rest: none is due, no charge is announced, no reflect arms.
- Finale abilities do not fire. A Rally or Shield Wall that is still running keeps applying.
- Creatures act as normal, **before the boss**: so the first overtime round is a free round for the team, and the boss's plain attack and then the enrage hit come after.
- After the boss's plain attack, the boss makes the **enrage hit**: an area hit on every living creature (a creature that fell to the plain attack is skipped) at `powerBp` of its Attack (`RULES.raid.enrage.powerBp`, `RULES.dungeon.enrage.powerBp`). Cover, armor and Shield Wall apply. It can crit.

7.2.2 Overtime ends on a kill (the creatures win), a wipe (they lose) or when the rounds run out (they lose; a boss still standing is a loss).

_Example._ With a boss Attack of 100 and an enrage `powerBp` of 500%, the enrage hit proposes 500 on each creature. The cap is off (3.2 step 6), so a creature with 400 HP is knocked out (the hit shows 500). Beside a living Guard it takes 300 (cover) and survives with 100; a Guard itself takes 375 (armor) and survives with 25.

## 8. Finale abilities

**8.1 What and when.** A finale ability is a short list of effects a player sets to fire in a chosen round. There are four basic ones (Rally, Shield Wall, Re-mark, Purge) and creature abilities (Tidal Mark, Flare Strike ...), unlocked by a creature of the player's team (`finale-abilities.json`).

8.1.1 Abilities exist in the **finale** and in the **dungeon** (where the player's chosen ones fire once in every room). Phase 1 and Phase 2 have none. They fire at round start (2.3 step 6), after Support effects, before any creature acts.

8.1.2 The round is the player's choice, or the ability's default (`defaultRound`). In the live finale, pressing an ability fires it at the start of the next round (`fireAtRound` is the round now playing plus one). Shield Wall's default is the round of the boss's first row attack from round 2 on (`defaultAtZoneHit`; a charged sweep counts in the round it lands), or `defaultRound` if it has none.

8.1.3 Abilities fire only in the base rounds. A round that never comes, or one after the fight has ended, does nothing. An ability's effects happen in the order of its list.

**8.2 Rally** (`rally`: `damageBp`, `rounds`). Every creature's hits on the boss deal that much more, starting this round, for `rounds` rounds. Basic Rally is 10% for 1 round. The bonus adds to other bonuses (2.4.3). Rallies running together add up.

**8.3 Shield Wall** (`shield_wall`: `zone`, `reduceBp`, `rounds`). Hits on one row are reduced (3.3), starting this round, for `rounds` rounds. A wall covers the round it is fired in and `rounds` - 1 after it. The basic one is 50% for 1 round on a row the player chooses (default: the row of the boss's first row attack, else Front). A creature's own version (`zone: own`) covers the row that creature stands in, even if it has fallen.

_Example._ A Shield Wall of `rounds` 1 fired in round 4 covers round 4 only. To guard against a charged sweep that lands in round 5, it must fire at the start of round 5: pressed during round 4, the announcement round, it does (6.12.4). Fired in round 4 itself with 1 round, it does not reach round 5.

**8.4 Re-mark** (`re_mark`: `element`). The boss's mark becomes that element, replacing any mark, even a Setter's. `own` is the element of the creature the ability belongs to. A basic Re-mark uses the player's chosen element, else the element of the player's first living creature.

**8.5 Purge** (`purge`: `rounds`). Switches the boss's adaptation off, starting this round, for `rounds` rounds; it comes back the round after. An adaptation is the resist chosen after Phase 1 (`adaptations.json`), in force in Phase 2 and the finale. Purge does nothing when none is in force (always the case in the dungeon).

**8.6 Creature strike** (`strike`: `atkBp`). The creature hits the boss at once, for that share of **its** Attack (Flare Strike 220%).

8.6.1 It is an ordinary creature hit: matchup, Rally, mark, reaction, crit, adaptation, the floor and no overkill all apply, and it can be reflected (5.4).

8.6.2 It does not use up the creature's Support boost, and it does not receive one. It has its own crit die (9.2).

8.6.3 **A strike lands even if its creature is knocked out or silenced.** The creature is the source, not a target. If the boss has fallen or retreated, it does not land.

## 9. Randomness

**9.1 What is random.** Only these:

- A fighter's **dodge** (14), in fights whose stored rules have it: a hit it takes, or a hit it dodges on the boss's side, is dodged when its die is under the dodge chance.
- A creature's **crit**: chance `RULES.combat.luck.critChanceBp` (5%) plus the species bonus, extra damage `critBp` (+50%), capped at `critMaxChanceBp` (30%) and `critMaxBp` (+150%).
- The boss's **crit** on a hit (3.1.1): `bossCritChanceBp` (5%), `bossCritBp` (+50%), the same caps.
- **Barrage targets** (6.8) and **random slam victims** (6.9.1).
- The **lance lane**, if `random` (6.10).
- The **Guard roll** among several Guards (4.2.3).
- The **chance lines** of gear (section 11), on each creature's own luck dice.

Off today (`RULES.combat.luck`): damage spread (`spreadBp` 0), Fortune streaks (`surgeChanceBp`, `slumpChanceBp` 0), and a random plain-attack target (`bossRandomTargetBp` 0). Nothing else is random: every other target, order and tie follows a rule above.

**9.2 Dice, not rolls on demand.** Randomness is dice drawn at round start (2.3 step 2), never later. A creature has a crit die per round for its turn and a second for an ability's strike. The boss has a crit die per slot per round for its plain attack and another for its moves. Pattern dice (40 a round) feed barrages, random slams and lanes. One Guard die per slot feeds the roll. When the boss makes more than one plain attack (2.5.2), the crit dice of the second and third attack (one per slot each) are drawn after all of these, and only then, so a fight with one attack a round draws exactly what it always did and a second attack never moves another die. Each kind of die is drawn every round whenever its feature is on (crits, patterns, the Guard roll), whether or not a rule uses it, so what one rule does never changes another's dice. **The luck dice of the chance lines** (11) are the very last dice of the round, after all of these, and are drawn only when some creature of the fight carries a chance line: a fight without one draws exactly what it always did. **The effect dice of status effects** (13.3) come after even those, and are drawn only when the fight's input has `effects`. **The dodge dice** (14.5) are the very last of the round, after the effect dice, and are drawn only when the fight's stored rules have `dodge`. The stream of dice is one line, so the dice a round adds move the dice of the rounds after it (as the luck dice already do); inside one round every die keeps its place, so a fight with dodge off draws exactly what it always drew and one rule never moves another rule's die in the same round.

**9.3 Where they come from.** The server draws a fresh seed from `crypto.getRandomValues` at the moment the fight is resolved (a raid stage, a dungeon run). Nobody, including the client, can know it before then. Dice come from that seed. The seed, the fight's input and its rules (`rules`, `luck`, floor, enrage) are stored, so a fight replays exactly, and a later retune never changes an old fight. Tests and the balance simulator use seeded dice.

## 10. The modifier sheet

Added 2026-10-16 (step 1 of `gear-and-creatures-v2.md`, section 14). Gear, talents and the day's weather will not touch the engine one by one. They are folded, before the fight, into one small table of plain integers per creature, **the sheet** (`FightSlot.mods`, type `SlotMods` in `packages/engine/src/types.ts`; checked by `resolveMods` in `mods.ts`). Nothing in the game fills it yet.

**10.1 The rules of the sheet.**

- **Absent means none.** A slot without `mods`, or with `mods: {}`, or with every number 0, plays exactly as before: the same dice, the same events, the same totals. Every stored fight and the replay fixture stay as they were. The log events carry the new optional fields (`sheetBp`, `warded`) only when a sheet changed something.
- **Plain integers.** Basis points unless the field says otherwise (a "pt" on gear is 100 basis points). A negative bonus is a penalty; a negative reduction makes the creature take more (Boons and Omens can use both). Fields are checked on entry and a bad sheet throws: unknown fields, fractions, numbers outside the field's range (bonuses from -100000 to 100000, reductions from -100000 to 10000, `pierceBp` 0 to 10000, `lingerRounds` 0 to 3, `ignoreSilence` 0 or 1) and unknown element, role or reaction keys.
- **Conditions are resolved before the fight.** "If the wearer is Tide" or "for this week's boss" is decided by whoever builds the sheet. The engine sees numbers, except where the answer depends on the fight itself: the boss's element (`vsElementBp` and `wardBp` are keyed by element, so one sheet serves a dungeon's three rooms) and who stands beside the creature (10.4).
- **One step each.** Every field is read at exactly one step below. No field changes a die or the number of dice drawn, except that a chance line (section 11) makes the fight draw luck dice (after every other die, so only when some creature has one).

**10.2 The creature's hit (2.4.3).** These add to the hit's one combined bonus, together with the Support boost, Rally, crit and mutators (they add, then multiply once). The `hit` event's `bonusBp` includes them and `sheetBp` is their share.

| Field          | Adds to                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `vsElementBp`  | Any hit on a boss of that element (by element).                                                                                       |
| `markedFoeBp`  | A hit on a marked boss that does not set off a reaction (5.2): the hit that does nothing, or the Setter hit that replaces the mark.   |
| `firstHitBp`   | The creature's first turn hit of the fight. An ability's strike (8.6) is not a turn hit: it neither gets this nor uses it up.         |
| `markingHitBp` | A hit that leaves a mark (5.1) or, as a Setter, replaces one (5.2). A hit that sets off a reaction does neither.                      |
| `strikeBp`     | An ability's strike (8.6) only.                                                                                                       |
| `besideRoleBp` | Any hit while a living creature of that role stands beside it (10.4).                                                                 |
| `pierceBp`     | Not a bonus: the boss's adaptation resists this creature's hits this much less (`resistBp` x (10000 - pierce) / 10000, rounded down). |

**10.3 The reaction (5.3).** `keenReactionBp` is read where the crit die is compared; the others where the reaction's bonus is worked out.

| Field            | Effect                                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reactionBp`     | The bonus of that reaction (by reaction id) when this creature sets it off.                                                                                                                                                                   |
| `pounceBp`       | Added to the reaction multiplier's percentage next to a Payoff's own bonus: a Payoff's factor is 110%, and pounce 8 points makes it 118% (a creature that is not a Payoff: 108%).                                                             |
| `ownerMarkBp`    | The reaction bonus when someone sets off a reaction on a mark **this creature** left. It is the Setter's sheet that counts, not the Payoff's.                                                                                                 |
| `keenReactionBp` | Crit chance (basis points) on a hit that sets off a reaction. The chance stays under `critMaxChanceBp`, and crits stay off when `luck` has them off.                                                                                          |
| `shareBp`        | A Support's: the bonus of reactions set off by the creatures beside it, added to the element's own (4.5.3: Spark's `reactionBp`). It works for any Support's element, is credited to the Support, and does not apply to a reflected reaction. |

`reactionBp`, `ownerMarkBp`, Spark's `reactionBp` and `shareBp` all add together into the one factor on the reaction's bonus (`10000 + sum`). The `reaction` event's `sheetBp` is the sum of `reactionBp`, `ownerMarkBp` and `pounceBp` (the pounce counted in points of the multiplier, so the number is a guide, not an exact share).

**10.4 The position line.** `besideRoleBp: { guard: 1000 }` means "+10% damage on every hit while a living Guard stands beside it". "Beside" is 1.5: in the raid the slots directly left and right **in the same row**, in the dungeon the plain line. It is looked at when the hit is made, so a Guard that was knocked out no longer counts and nothing is cached. One bonus per role however many creatures of that role stand beside (a Guard on each side counts once); different roles add. The first gear release uses this one line, _Guard's shadow_ (`gear-and-creatures-v2.md` 5.8). The other position lines in section 6.1 follow the same pattern later.

**10.5 The taker (3.2 step 5).** The reductions of the creature that **takes** the hit (the Guard, if one stepped in), each a share taken off, each rounding down, in this order, always **after** Shield Wall, armor and cover and **before** the single-hit cap:

1. `wardBp`: the hit comes from a boss of that element (by element).
2. `chargedBp`: the hit is the landing of a charged move (6.12), including a charged slam's splash.
3. The shape: `areaBp` for an area hit (1.16), `aimedBp` for an aimed hit (1.15, the plain attack included), `reflectedBp` for a reflected hit (1.17). A hit has one shape.
4. `takenBp`: every hit.

The order matters only through rounding, and it is fixed. _Example._ A hit of 11 on a creature with a 10% ward and 25% off every hit: the ward leaves 9, then every-hit leaves 6 (the other way round would leave 7). A Guard with 25% armor and 10% off every hit takes 11 down to 9 (armor), then 8 (sheet). The damage that armor or cover is credited for (4.8.1) is what it really saved given the steps after it, so the sheet never moves credit between creatures. The `boss_hit` event's `warded` is the damage the sheet took off (negative: added). A hit a Shield Wall stops has none.

`healReceivedBp` is read wherever the creature is healed: a Support's Mend (4.5.3), Kind Rain (10.9), Second wind, Second breath (sections 11 and 12) and Hollow Weave (10.10). The heal is scaled by `10000 + healReceivedBp` (rounded down; Long Shadows makes it weaker, Well-fed stronger), then limited to what is missing as always (4.5.4).

**10.6 Roles (section 4).** Each is added to the number the rules already give:

| Field     | Where                                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `armorBp` | A Guard's armor (4.1): `guardArmorBp` plus this, between 0 and 100%. Not a Guard: nothing.                                                |
| `coverBp` | A Guard's cover (4.3) for the creatures beside it: `coverBp` plus the **covering Guard's** field (not the covered creature's), 0 to 100%. |
| `boostBp` | A Support's boost (4.5.2) on each creature beside it, added to the boost (15%, or the element's).                                         |
| `mendBp`  | A Support's heal (4.5.3), added to the element's: a Support whose element does not heal heals once this is above 0.                       |
| `shareBp` | See 10.3.                                                                                                                                 |

**10.7 Abilities and silence.**

- `lingerRounds` adds rounds to the Rally, Shield Wall and timed Purge of the creature's **own** ability (8.2, 8.3, 8.5; an ability with a creature, `AbilityChoice.creatureId`). A Purge without `rounds` already lasts to the end. A basic ability belongs to no creature, so its sheet never lengthens it. The one exception is the day's Lantern Light: `FightInput.lingerAllRounds` (0 to 3, absent: 0) adds the same rounds to **every** ability's timed effects, basic ones included, on top of the ability's own creature's `lingerRounds` (so a creature with Lingering gear on a Lantern Light day gets both, once each). The weather puts its round only in this field, never also in a creature's sheet (`weatherSky` in `@creatures/game`; the worker, the dungeon run and the simulator pass it on with the other sky fields), so a creature's ability is not lengthened twice. Fights stored without the field replay as they were.
- `ignoreSilence: 1` makes silence (6.4) do nothing to it. The silence still picks the ends (of each row in the raid, of the line in the dungeon) as always, so it is wasted on this creature, and no `silence` event is written for it.

**10.8 In the log.** `describeEvent` mentions the sheet in plain text where a player would ask why: a hit or a reaction that carries `sheetBp` ("(+12% from modifiers)"), and a boss hit that carries `warded` ("Its modifiers take off 20."). Names are text only.

**10.9 The hooks of the weather (2026-10-18; Lantern Light added 2026-10-19).** Kind Rain, Morning Haze, Bramble Season and Lantern Light are not sheet numbers, so each is an optional field of the fight input (`FightInput`; the dungeon run has `rainHealBp`, `hazeLeft`, `brambleBp` and `lingerAllRounds`, copied into every room). Absent, empty or 0 means exactly the fight as it was: no event, no die, so every stored fight replays. None of them draws a die. The builders (`skyFightFields`, `skyRunFields` in `sky.ts`, from `weatherSky` in `@creatures/game`) leave a field out on a plain day.

| Field             | Meaning                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rainHealBp`      | Kind Rain. Each living creature heals this share of its max HP (rounded down) at round start, after the Supports' Mend (2.3 step 5a). Its own `healReceivedBp` applies like for a Mend (Long Shadows makes it weaker), never above what is missing, never a revival.                                                                                                    |
| `skipFirstTurn`   | Morning Haze. Creature ids that skip their first turn (2.4.2). The raid names the first creature standing in each board row (zone, `firstOfEachRow`, read from the fight's `board`: empty slots before it do not matter; a row of one or two is all Middle, so one creature); the dungeon names `team[0]` in every room (`hazeLeft`), since each room is a fresh fight. |
| `brambleBp`       | Bramble Season. The share of the first reaction's bonus each round that goes back at the creature that set it off (5.4.5).                                                                                                                                                                                                                                              |
| `lingerAllRounds` | Lantern Light. Rounds (0 to 3) added to the Rally, Shield Wall and timed Purge of every ability, basic ones included, on top of the ability's creature's `lingerRounds` (10.7). The day's linger is only here, never also on a creature's sheet.                                                                                                                        |

The log: `sky_heal` (`heals`: creature and HP really healed, in row order, not written when nobody needed healing), `skip` with `reason: 'haze'`, and on a `reaction` the optional `bramble` (`bp`, `amount` sent back; the event's `bonus` is what the boss took) followed by a `boss_hit` with source `reflect`.

**10.10 The 3-piece effects of the gear sets (2026-10-18).** A set's 3-piece bonus reaches the fight as a field of the wearer's sheet (`SlotMods`; the 2-piece bonus is an ordinary line and the sets are built in `gear-sets.json`). Each is absent (so a stored fight replays unchanged) unless the creature wears the whole set, and none draws a die.

| Set              | Field                          | Effect in the fight                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tidepool Finery  | `unreflected`                  | The first reaction the creature cashes in a fight cannot be reflected by Backdraft: the trap is spent on it without effect (`proof` on the `reaction` event, 5.4).                                                                                                           |
| Forge-Warm Kit   | `critWindowBp`                 | After the creature sets off a reaction (not a reflected one), its crits deal this much more crit damage until the end of the next round (`warm` on the `hit`).                                                                                                               |
| Hollow Weave     | `healOnReactionBp`             | Whenever the creature cashes a reaction (not a reflected one) it heals this share of its max HP, rounded down, changed by its own `healReceivedBp` like every heal, never above what is missing. A `heal` event with the creature at both ends and no `cause`.               |
| Ridge Copper     | `chainMark`                    | After the creature cashes a reaction (not a reflected one) the boss keeps the creature's own mark, so another creature can cash on it (a `mark` event).                                                                                                                      |
| Warden's Watch   | `coverReach`                   | A Guard's cover also reaches the creature two slots away in its row (1.5.3).                                                                                                                                                                                                 |
| Hearth Helpers   | `boostReach`                   | A Support's boost also lands on the creature two slots away: the boost only, not the Mend or the cleanse (1.5.3).                                                                                                                                                            |
| First Footprints | `sealMark`                     | The first mark the creature leaves in a fight cannot be replaced by another creature's hit. A finale ability's Re-mark still can.                                                                                                                                            |
| Pounce Set       | `firstReactionCrit`            | The first reaction the creature sets off in a fight is a critical hit (only when crits are on; it draws no extra die).                                                                                                                                                       |
| Lantern Night    | `lingerRounds` (on its Guards) | A gift of the row, folded in by `@creatures/game` (not a separate engine field): every Guard in the row of a wearer of all three pieces gets +1 `lingerRounds` (10.7), so its own ability's Rally, Shield Wall and timed Purge last one round more. Wearers do not stack it. |

## 11. Chance lines (2026-10-18)

Gear lines that work some of the time (`gear-and-creatures-v2.md` 6.3). Each is a field of the sheet (`SlotMods`) that holds the **chance in basis points** (0 to 10000; the line's tier gives 4 / 6 / 8 / 10 / 12%, 2 points more on an Epic or a Festival piece). Absent or 0 means the creature has no such line, and a fight where no creature has any draws exactly what it always drew.

**11.1 The luck dice.** When some creature of the fight has a chance line (`hasChance`), every round draws `LUCK_DICE` (10) dice for **every** creature, uniform in [0, 10000), after every other die of the round (9.2), whether or not a rule uses them. A chance of C fires when its die is below C. The dice are numbered by what they decide, so one line never moves another's: 0 Second wind, 1 Echo, 2 Steady paws, 3 Warm heart, 4 Quick re-mark, 5 Spill-over, and 6 to 9 Sidestep (the creature's 1st to 4th area hit that round; later ones use the 4th). The same seed and input always give the same fight, and the dice come from the fight's injected RNG as all others do.

**11.2 The lines.** What a line does when it fires is fixed by its design (`CHANCE_FX`, not tiered): a different size is a new line.

| Line          | Field           | Moment and effect                                                                                                                                                                                                                                          |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Second wind   | `secondWindBp`  | Round start (2.3 step 5b): the creature heals 5% of its max HP, changed by its own `healReceivedBp`, never above what is missing. A `heal` event with `cause: second_wind` (nothing is written when no HP was missing).                                    |
| Echo          | `echoBp`        | After a **turn** hit (not an ability's strike), if the boss still stands: the hit lands again for 30% of its **plain** damage (no reaction bonus, no mark, no crit), counted down to the phase floor like any hit. A `proc` event `echo` with `bossHp`.    |
| Sidestep      | `sidestepBp`    | An **area** hit that would reach the creature (as the taker) deals nothing; before Shield Wall, armor and cover. A `boss_hit` with `damage: 0` and `sidestep`. Aimed and reflected hits are never sidestepped.                                             |
| Steady paws   | `steadyPawsBp`  | A silence that the boss's move would put on the creature is shrugged off (die 2 of that round): no `silence` event, a `proc` event `steady_paws`. Checked after Unbothered (`ignoreSilence`).                                                              |
| Warm heart    | `warmHeartBp`   | Round start: a living creature beside it (the one with the most Attack, ties to the lower slot) gets a 10% boost on its next hit (a boost that stays apart from a Support's own). `proc` `warm_heart`.                                                     |
| Quick re-mark | `quickRemarkBp` | A hit by a creature that is not a Setter, on a boss whose mark is of another element and is not sealed, replaces the mark as a Setter's hit would (5.2). Also counts as a marking hit for `markingHitBp`. `proc` `quick_remark` after the `mark` event.    |
| Spill-over    | `spillOverBp`   | A reaction the creature sets off (not a reflected one) leaves the creature's own mark standing afterwards, like Ridge Copper's `chainMark` (which already does it every time: with both, Spill-over does nothing). `mark` event, then `proc` `spill_over`. |

Two chance lines work outside the fight and are rolled by the server with its live randomness (`crypto.getRandomValues`), when the result is claimed:

- **Tinker's luck** (`GearRules.tinkersLuckBp`): each item of a dismantle job the wearer runs has the chance to refund its **full craft cost**: the plain craft's parts for the base and item level (`craftCost`: scrap by item level, plus one shard of the base's element, no Reach). The refund of each kind of part is lifted to that cost if the ranges gave less; glimmer and Essence stay as rolled. One extra die for each item, after that item's other draws, only when the worker has the line. The result says how many items it refunded (`tinkered`).
- **Second look** (`GearRules.secondLookBp`): a **duplicate** the explorer's trip brings rolls its talent twice (one more die for the chance, then a second roll) and keeps the better. "Better" is the talent's worth to the creature of that line the player has (`talentScore`, the same stand-in Equip best and Recommended use); a tie keeps the first roll. The catch says so (`secondLook`).

## 12. Trigger lines (2026-10-18)

Gear lines that wait for a defined moment (`gear-and-creatures-v2.md` 6.4). Each is a field of the sheet with its own number (a bonus, boost, cut or heal in basis points, tiered by the line) or a flag. None draws a die. Each **writes a `proc` event when it fires** (`describeEvent` has a sentence for every kind). "Next hit" means the creature's next **turn** hit (an ability's strike neither gets nor spends it, like `firstHitBp`); the bonus is added to the hit's one combined bonus and shows in `sheetBp`.

| Line          | Field            | Moment                                                                                                                            | Effect                                                                                                                     |
| ------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Payback       | `paybackBp`      | A Guard step-in (4.2, also for a reflected hit): the creature that takes a hit meant for a neighbour, while it stands afterwards. | Its next turn hit deals this much more (does not stack: a new one replaces it).                                            |
| Kindling      | `kindlingBp`     | Round 1 starts (each room of a dungeon is a fresh round 1).                                                                       | Each living creature beside it gets a boost of this size on its first hit, apart from a Support's boost.                   |
| Opening mark  | `openingMark`    | Round 1 starts and the boss has no mark (the first creature in slot order that has the line).                                     | It leaves its own mark (a `mark` event) before the first creature acts.                                                    |
| Rally cry     | `rallyCryBp`     | A creature beside it is knocked out (any cause, in the raid inside its row).                                                      | All its hits (turns and strikes) deal this much more for the rest of the fight; stacks once for each neighbour that falls. |
| Ember tail    | `emberTailBp`    | It crits (a turn hit or a strike; crits must be on).                                                                              | Its next turn hit deals this much more (replaces an earlier one).                                                          |
| Storm warning | `stormWarningBp` | A charge is announced (2.3 step 3) with it among the marks.                                                                       | It takes this much less from that landing (every hit of it, splash included), at the sheet step of 3.2.                    |
| Stubborn      | `stubborn`       | A hit would knock it out, once a fight (the hit may be a reflected one: Bramble Season, Backdraft).                               | It stays at 1 HP. The `boss_hit` still shows the full damage and carries `stubborn`; HP lost is what it really lost.       |
| Last stand    | `lastStandBp`    | A hit leaves it standing at a quarter of its max HP or less, once a fight (also when it started the fight below a quarter).       | It takes this much less from every hit from then on.                                                                       |
| Overflow      | `overflowBp`     | It sets off a reaction (not a reflected one).                                                                                     | The next living creature in the round's turn order gets a boost of this size on its next hit (none if it acts last).       |
| Second breath | `secondBreathBp` | The first enrage round starts (2.3 step 5b).                                                                                      | It heals this share of its max HP (as Second wind: `healReceivedBp`, never above what is missing). `heal` `second_breath`. |
| Patient       | `patientBp`      | A silence lands on it (not one it shrugged off or ignored).                                                                       | Its next turn hit deals this much more, spent on the first hit it makes after the lost turn.                               |
| Shared warmth | `sharedWarmthBp` | A Support's Mend heals it (really restores HP).                                                                                   | That Support's next boost, to everyone it boosts, is this much bigger (it waits until the Support next boosts).            |

**12.1 Order and interplay.** The boosts the lines give are in the same list as a Support's (`buffs`), spent on the creature's next hit together with it and counted in `bonusBp`; they are credited as support credit to the creature whose line gave them, and a Support's own boost from the same creature never replaces one of them. Stubborn works in the taker step (3.2 step 7) and Last stand is checked after it; so a Stubborn creature at a quarter of its HP after the hit can fire both. Round-start lines act after the Supports and Kind Rain and before finale abilities, so a finale Re-mark can still replace an Opening mark.

## 13. Status effects (2026-10-19)

The general system for debuffs now and buffs later (`speed-and-dodge.md` section 3). It is off in a fight unless the fight's input says so, nothing in shipped content applies an effect yet, and a stored fight replays as it was.

**13.1 What an effect is.** A status effect is content (`status-effects.json`, `StatusEffectSchema`): `id`, `name`, `kind` (`debuff` or `buff`), `maxStacks` (1 or more), `turns` (1 or more, the base duration) and `perStack`, a strict object of optional signed numbers in basis points per stack: `spdBp` (Speed; negative is slower) and `damageDealtBp` (the damage the fighter deals; negative is less). Today there is one, **Mired** (debuff, at most 5 stacks, 3 turns, Speed -3% and damage dealt -3% a stack). On a fighter an effect is `{ id, stacks, turnsLeft }`; every creature and the boss (a foe too) carry a list of them, and each effect id is in the list at most once.

**13.2 Applying** (`applyEffect(state, target, effectId, powerBp, source, durationTurns = 0)`). The one call every source uses. Application power is in basis points: `floor(power / 10000)` stacks are certain, plus one more with a chance of `power % 10000` out of 10000. A power under 10000 is a chance of one stack.

- A roll of **0 stacks is a miss and changes nothing**: no event, the timer stays as it was, and on a fighter without the effect it adds nothing.
- Any roll of **1 or more stacks** adds them, up to `maxStacks`, and **sets the timer back to the full duration**: the effect's `turns` plus the source's `durationTurns` bonus. That includes an application on a fighter already at the cap (it adds 0 stacks and still refreshes). One `effect_apply` event says how many stacks it really added (`stacksAdded`, maybe 0), the stacks and the turns left.
- A knocked-out creature gets nothing. With effects off in the fight, nothing applies.
- _Example._ Mired at 2 stacks with 1 turn left is hit by a 140% application and the extra-stack die is 3000 (under 4000): 1 + 1 stacks, so it goes to 4 and back to 3 turns. If the die had been 5000 it would be 3 stacks. A 60% application with a die of 6000 or more changes nothing at all.

**13.3 Dice.** The extra-stack chance rolls on **effect dice**: `FightInput.effects = { dice: N }` (1 to 256) makes every round draw N uniform dice in [0, 10000), at the very end of the round's dice, after the luck dice (9.2). An application takes the next unused die of the round, in order, only if its power has a fractional part (a whole number of stacks takes none); it adds the extra stack when the die is **below** the chance. The pool starts over every round. **If a round's pool runs out, every further chance counts as a miss**: whoever builds the input sizes it generously (a sweep that hits every creature of a big raid applies once per creature). Without `effects` the fight draws no effect die and applies nothing, so every fight stored before this replays exactly. The fight's stored input holds `effects`, so a replay has the same dice.

**13.4 Turns.** An effect counts down on its **target's own turns**: at the end of each of the target's turns `turnsLeft` goes down by 1, and at 0 the effect ends with an `effect_expire` event. **All its stacks fall off together.**

- The boss's turn is its whole boss turn (2.5), once a round. An effect applied to the boss by a creature in round 1 has already seen the boss turn of round 1 by the time it is counted: 3 turns from a creature's hit in round 1 ends at the end of the boss turn of round 3. A boss that fell or retreated earlier in the round has no boss turn.
- A creature's turn is counted even when it was skipped (silence, Morning Haze), so a silenced creature's debuff wears off all the same.
- **A knocked-out creature's effects end at once, silently** (no `effect_expire`; the `knockout` event says it). Nothing is counted for a creature that is out.
- Enrage rounds count down as every other round.

**13.5 What stacks do.** Per-stack numbers are added up over the fighter's effects (stacks times the number, each effect) and folded in where the fighter's numbers are made:

- `damageDealtBp`, for a creature: one more term in the hit's one combined bonus (2.4.3, 10.2), next to Support boost, Rally, crit and the sheet; the `hit` event's `bonusBp` includes it and `effectBp` is its share. A debuff takes damage off the hit (never below 0). It applies to turn hits and ability strikes alike.
- `damageDealtBp`, for the boss: one more term in the percentage a boss hit's proposed damage is worked out from, next to crits and the mutators' `bossDamageBp` (3.1): every plain attack, move and enrage hit. **A reflected hit (5.4) is not changed**: it is a creature's reaction coming back, not the boss's own damage.
- `spdBp`: the fighter's Speed is `floor(Speed x (10000 + sum of spdBp x stacks) / 10000)`, never below 0, read through `effectiveSpd(state, fighter)` (`fight-effects.ts`). Dodge reads it (14.1); a boss or foe's base is its content `baseSpd` (0 when absent). The `speed` turn order is not changed (no shipped boss uses it).

**13.6 Purge.** A boss move `op: purge` (any trigger, any boss or foe; the content schema has nothing else on it) removes **every debuff** from the boss, in its place in the boss's move order (2.5 step 1). It writes the `gimmick` event as any move does and, if it removed anything, one `effect_purge` event listing each effect and its stacks. It never removes a buff and never touches the adaptation (8.5 is a different Purge). The forecast has no warning for it (it aims at nobody).

**13.7 Cleanse.** The cleanse of a Support (4.5.3, Tide) also removes every debuff from each neighbour it reaches at round start, after the silence, writing one `effect_cleanse` event per removed effect (the `cleanse` event is still only for silence). It never removes a buff and a Support does not cleanse itself.

**13.8 Sources.** Today only these put an effect on a fighter: a boss move's optional `applies: { effect, powerBp, durationTurns? }` (on hit zone, strike, sweep, barrage, slam, lance, pincer and charge moves; content tests check the effect exists), and a test-only `FightOptions.effectHook`. A move with `applies` puts the effect on **every creature it hits**: the creature that takes each hit (a Guard that stepped in, not the creature it was aimed at) and the takers of a slam's splash, right after the hit, if the taker still stands. A hit a Shield Wall or Sidestep stopped still counts as a hit for now; **a dodged hit (14) applies nothing**. A charge applies when it lands. Creature-side sources (a Guard hit, a Support at round start, reactions, gear lines) are later slices and call `applyEffect` the same way.

**13.9 Log.** `effect_apply`, `effect_expire`, `effect_purge` and `effect_cleanse`; `describeEvent` has a sentence for each ("Old Bogback is Mired x3 (3 turns).", "Old Bogback is no longer Mired.", "Old Bogback shakes off Mired.", "Support clears Mired from Cindle."). `target` is a creature id, or null for the boss. The game's UI shows them only as log lines for now.

**13.10 Creature-side sources (Mire, 2026-10-19).** All of these do nothing in a fight with effects off, and all go through `applyEffect`.

- **Reaction riders** (optional fields of a reaction in `reactions.json`). `appliesToFoe: { effect, powerBp }`: a reaction hit that lands (not a reflected one) puts the effect on the boss right after the reaction event, with the hitter as the source. **Smother** (Mire on Scorched) applies Mired at 10000. `consumes: { effect, bonusPerStackBp }`: the stacks of the effect on the boss are counted before the hit, each adds `bonusPerStackBp` to the reaction's bonus (the share added to the bonus factor, next to modifiers and Support effects, 5.3), and after the hit the effect is removed at once (an `effect_consume` event: reaction, effect, stacks, bonus; written only when stacks went). **Flare** (Ember on Muddied) burns Mired at 2000 a stack, so 3 stacks make the bonus 160% of itself. A reflected reaction deals no bonus, so it burns nothing. Ember and Mire set off each other's marks, so either can go first.
- **Passive abilities** (`FinaleAbility.effects` ops `on_hit_taken` and `round_start`, each `{ apply: { effect, powerBp, durationTurns? } }`, creature abilities only). They are on from round 1 for the whole fight, whatever round the ability itself "fires" in (so the fight up to a round never depends on a later press; the ability still fires and writes its `ability` event, and its other effects, like a Shield Wall, work as before). `on_hit_taken`: each time the ability's creature takes a boss hit that deals damage (a plain attack, a move, an enrage hit, the creature a Guard stepped in for is the Guard; not a dodged, shielded or sidestepped hit, not a reflected reaction) the boss gets the effect, once per hit, at that power. `round_start`: at round start, with the creature's Support action (so only while it lives and is not silenced), the boss gets the effect once. Mudlump's Mud Wall and Bogwarden's Bog Hold use the first (Mired at 6000 and 8000), Squelch Song and Deep Croak the second (6000 and 8000).
- **Sheet fields** (`SlotMods`, filled by gear lines and talents): `debuffResistBp` (0 to 10000, Clean coat) cuts each stack's numbers of every debuff on the wearer (Mired x2 with 50%: -3% instead of -6%, Speed included; buffs and the boss are not touched); `debuffPowerBp` (Heavy hand) is added to the application power of every debuff the creature applies as the source; `debuffDurationTurns` (0 to 10, Clinging) is added to the turns of those. The effect dice and the order of application are unchanged.

## 14. Dodge (2026-10-19)

Speed gives a chance to take nothing from a hit (`speed-and-dodge.md` section 2). It is off unless the fight's stored rules carry it (`FightRules.dodge`, copied from `RULES.combat.dodge` by `liveFightRules()` only while `RULES.combat.dodge.enabled`; today it is false, so no fight has it and a stored fight without it replays as it was). Zoomies, gear and talents that raise Speed now matter through it (the wording of the talents changes in a later slice).

**14.1 The chance.** A fighter's dodge chance is `min(maxBp, floor(Speed x perSpeedBp) + flat dodge)` (`RULES.combat.dodge`: `perSpeedBp` 10, `maxBp` 5000, so 100 Speed is 10% and nobody goes past 50%). Speed is `effectiveSpd`: the stats' Speed with the fighter's status effects folded in, so Mired lowers it (13.5). A creature uses the Speed of its stats (gear and talents are already in them) and its sheet's flat `dodgeBp` (Light-footed, later gear). A boss or foe uses its content `baseSpd` (optional, 0 when absent; a raid boss's `baseSpd` is not scaled by Boss Rank) and has no flat dodge. Against an **area hit** the chance is `areaShareBp` (5000, half) of the chance above, rounded down, plus the sheet's `areaDodgeBp` in full, capped at `maxBp` again (Sidestep will fold into `areaDodgeBp` later; its own chance line and dice are unchanged).

**14.2 Which hits a creature can dodge.**

| Hit                                                                                         | Chance                        |
| ------------------------------------------------------------------------------------------- | ----------------------------- |
| Aimed hit: the plain attack, a strike's or chain's first hit, a slam's main hit             | Full                          |
| Area hit: row attack, sweep, barrage shell, lance, pincer, a slam's splash, a chain's jumps | Area chance (14.1)            |
| A charge landing (every hit of it, splash included)                                         | Full, whatever the hit's kind |
| The enrage hit                                                                              | Full                          |
| A reflected hit (5.4, Bramble Season)                                                       | Never                         |
| A hit a Guard stepped in to take (4.2)                                                      | Never: the Guard chose it     |

A hit aimed at a Guard is rolled by that Guard like any aimed hit. A Guard's cover (4.3) is a reduction, not a redirect, so a covered neighbour still rolls its own dodge. Each jump of a chain rolls, and a dodge does not stop the chain.

**14.3 Where it sits in the hit.** The target is picked, a Guard steps in or not, then the taker rolls dodge (3.2 step 1), before Sidestep, Shield Wall, armor, cover, the sheet and the crit. A dodged hit is a `boss_hit` with `damage: 0` and `dodged: true` (and `splash` for a splash). It is as if the hit never happened: no HP is lost, nothing that waits for a hit taken fires (Payback, Last stand, Stubborn, Rally cry, a knock-out), and a move's `applies` effect (13.8) is not put on the creature. Sidestep is only rolled when the dodge failed (its dice are numbered as before, a dodged area hit still counts as an area hit the creature met).

**14.4 The boss dodges creature hits.** The boss (a foe too) rolls against every hit of a creature on it: its turn hit and each ability strike. It does not roll for an Echo or any follow-up: a dodged hit has none. Its chance is the boss's Speed (with its effects, Mired) times `perSpeedBp`, capped (14.1). A dodged hit is a `hit` event with `damage: 0` and `dodged: true`; no damage, no crit, no reaction, no credit, no Echo, no Overflow or Ember tail, no boost, first-hit bonus, Payback or Patient bonus spent, and a reflect trap is not sprung by it. **Marks (Misa: setup never misses):**

- A **Setter's** dodged hit still leaves its mark when the boss has none, and replaces a mark of another element exactly as its hit would (5.1, 5.2, a sealed mark stays), and is credited as normal setup: a `mark` event follows the `hit`.
- Any **other role's** dodged hit leaves no mark and does not trigger Quick re-mark.
- A dodged hit that would have set off a reaction (a Payoff's, or anyone's) sets off nothing: the existing mark stands for the next hit.

**14.5 Dice.** The dodge dice are drawn at round start, after every other die of the round, the effect dice included (9.2), and only when the fight's stored rules have `dodge`. In this order: for each creature in slot order `DODGE_TAKEN_DICE` (8) dice for the hits it takes; then one die for each creature in slot order for the boss's roll against its turn hit; then one die for each for the boss's roll against its ability strike. All are uniform in [0, 10000) and a hit dodges when its die is **below** the chance. The Nth hit a creature takes in a round (as the taker, counted for every hit it takes, whether or not that hit can roll) uses its die N (the first is die 0); a creature that takes more than eight hits in a round uses the last die for every later one, as Sidestep does with its 4th. A creature's turn hit uses the creature's turn die, and its strike the creature's strike die (by slot), so a hit's roll never depends on how the other hits went.

**14.6 Log.** `boss_hit` and `hit` carry the optional `dodged: true`. `describeEvent` says "Mudlump dodges!" (and "Mudlump dodges the splash.") for a dodged boss hit and "Old Bogback dodges Cindle's hit." (or "... Cindle's Flare Strike.") for a dodged creature hit. The game's UI shows a dodged hit as a 0 for now.
