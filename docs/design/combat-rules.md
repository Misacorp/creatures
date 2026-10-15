# Combat rules reference

Status: written 2026-10-15 from the engine (`packages/engine/src/fight.ts`, `patterns.ts`, `zones.ts`, `affects.ts`, `dungeon.ts`, `gimmick-schedule.ts`), `RULES` (`packages/game/src/rules/config.ts`) and the content data; revised the same day after the lead's decisions on its open questions (Shield Wall, chain and overkill were fixed in the engine; the terms row and line were settled). Style borrowed from card-game rules references (`docs/research/card-game-rules.md`). This document describes **what the engine does**. If the two disagree, the engine is right until a decision says otherwise (`decisions.md`).

## How to read this

- Rules are numbered (3.2, 3.2.1). An _Example_ follows each rule that is easy to misread. All example numbers are made up for the example (a boss Attack of 100 and so on), they are not balance values.
- Every number names the `RULES` field (or content field) it comes from, in `code`. The field is the truth; the number printed next to it is its value on 2026-10-15 and may be retuned. A field set to 0 is "off".
- All maths is whole numbers. Percentages are basis points in code (10000 = 100%). **Every division rounds down**, so a share that is taken away rounds down and what is left rounds up.
- **Old fights replay as they were fought.** A fight stored without rules (before the attack-pattern work) has none of these: armor, cover, the hit cap, element effects for Supports, a Guard roll, the Shield Wall of the creature that takes the hit (1.19, 3.3), the chain's "no creature twice" (6.6), and no overkill on the boss (2.4.5). A Guard in such a fight has 30% more HP (`RULES.combat.guardHpBp`). This document describes fights with rules, which is every new fight (`liveFightRules()`).
- **Words that mean one thing each.** "Row", "line", "hit", "damage", "reduce", "instead" and "beside" are used exactly as defined in section 1.
- "The boss" means a raid boss or a dungeon foe or room boss, unless a rule says otherwise. It is one engine.

## 1. Terms

**1.1 Creature.** A player's creature in a fight. It has an element (Tide, Ember, Grove, Spark), a role (Setter, Payoff, Guard, Support), Attack, Speed and HP. The boss is not a creature.

**1.2 Line.** All the creatures one team brings, left to right. In the raid the line is three rows side by side: three creatures per player (`RULES.raid.teamSize`), the whole party; guests fill a small party up (`RULES.combat.guestRowSize`, `guestsBelowPlayers`). In the dungeon the line is three creatures (`RULES.dungeon.teamSize`), and each creature is a row of its own (1.4).

**1.3 Slot.** A numbered place in the line, counted from the left. Empty places in a formation are dropped before the fight, so slots are counted over the creatures that came. A creature keeps its slot for the whole fight. A knocked-out creature's slot stays; the others do not close up.

**1.4 Row.** Front, Middle or Back: the line cut into three parts. Front and Back each get a third of the slots, rounded down; Middle gets the rest. A line of one or two slots is all Middle. The stage draws each row as a line of its own, and player text says "row" for it ("sweeps the MIDDLE row"). **In code a row is called a zone** (`zone`, `zoneNeighbours`, `hit_zone`, `nearestLivingZone`); the content fields `sweep.rows` and `pincer.scope: rows` already say row.

_Example._ 9 slots are 3 / 3 / 3. 10 slots are 3 / 4 / 3. In the dungeon the line has three slots, so each slot is a row of its own: the left creature is Front, the middle one Middle, the right one Back.

**1.5 Beside.** The slot directly left or right of a creature.

1.5.1 In the raid, beside stops at the edge of a row (`zoneNeighbours`). The last Front slot is not beside the first Middle slot (decision 2026-10-14, "Raid neighbours stop at row edges").

1.5.2 In the dungeon, beside is the plain line (`neighbours`): the left and the right slot, whatever the rows. (Every slot is its own row there, so a row edge would leave nothing beside anyone.)

**1.6 Lane.** A slot position inside a row, read across all three rows: the creature at position 2 of Front, of Middle and of Back are in the same lane. With a line of 3N slots, a lane has three creatures. In the dungeon there is one lane.

**1.7 Living, knocked out.** A creature is living while its HP is above 0. At 0 it is knocked out (the game never says "dead"). A knocked-out creature stays out for the rest of the fight. It does not act, is not a target of any boss rule, gives no buff and receives no buff or healing. Nothing revives it. (In the dungeon the run carries HP from room to room, so it stays out for the run.)

**1.8 Boss and foe.** The boss is the creature-side's opponent. A raid boss is a boss. A dungeon enemy is a foe; a foe of kind `boss` is a room boss. Foes and bosses follow the same rules.

**1.9 Plain attack and move.** The plain attack is what every boss does every round (`RULES.combat.bossAttackBp`, 100% of its Attack). A move is a special action from the boss's content (its `gimmicks`: Undertow, Cinder Fall, and so on). Moves come due on a schedule (`every: N` or each round).

**1.10 Attack.** One thing the boss does that can hit creatures: the plain attack, or one move (including a charged move landing). An attack makes zero or more hits. Everything the boss does in one round is its **boss turn** (2.5).

**1.11 Hit.** One attack on one creature, resolved in the fixed order of section 3. An attack with many hits resolves them one after another, completely, in the order its rule lists.

**1.12 Proposed damage.** The amount a hit would deal before section 3 changes it: boss Attack times the attack's power, plus a crit if it crits (3.1).

**1.13 Damage.** What a hit deals after section 3 has changed it. Damage dealt and damage taken are the same number. **A creature loses at most the HP it has left, but the hit shows its full damage:** a creature with 30 HP left that takes a 100 hit shows 100 and is knocked out (as in card games, damage dealt can exceed what is left). Credit counts only the HP really lost (4.8). A hit that a Shield Wall stops is logged as 0.

**1.14 Source.** What a hit comes from: the plain attack, a move, the enrage hit, or a reflected hit.

**1.15 Aimed hit.** A hit with one chosen target. A Guard can take it instead (4.2). Aimed hits are: the plain attack, the first hit of a strike or chain, a slam's main hit, and a reflected hit.

**1.16 Area hit.** Every other hit: a row attack, a sweep, a barrage shell, a slam's splash, a chain's jumps, a lance, a pincer, an enrage hit. No Guard steps in for an area hit, but a Guard beside the victim covers it (4.3).

**1.17 Reflected hit.** Damage a reaction sends back at the creature that set it off (5.4). It is a new hit with the boss as source, not a redirect.

**1.18 Redirect.** A rule that says a different creature takes a hit **instead**. A hit is redirected at most once, and never to a knocked-out creature. The only redirect is the Guard's (4.2). The creature that takes the hit is the **taker**; the creature it was aimed at is the **aimed creature**. They are the same unless a Guard stepped in.

**1.19 Reduce.** Take a share off damage. The reductions are Shield Wall, armor and cover (section 3). Reducing never changes who is hit. Each reduction belongs to the taker: the Shield Wall of the taker's row, the taker's armor, the cover of a Guard beside the taker.

**1.20 Mark.** The element left on the boss by a creature's hit (Soaked, Scorched, Overgrown, Charged). The boss has at most one mark at a time.

**1.21 Reaction.** The extra damage when a creature of the right element hits a marked boss (Steam, Overload, Wildfire, Grounding). A reaction clears the mark.

**1.22 Setup and payoff.** The **setup** is leaving a mark. The **payoff hit** is the hit that cashes it in (sets off the reaction). The roles are written with capitals: a **Setter** is good at setup, a **Payoff** at the payoff hit. Any role can do either.

## 2. A fight

**2.1 Stages.** Everything is one engine fight against one boss, with one line.

2.1.1 A raid week has three stages for each party: **Phase 1** (Friday), **Phase 2** (Saturday) and the **finale** (Sunday). Boss HP carries from stage to stage (`RULES.raid.phases`). A creature's HP does not: each stage starts everyone at full HP.

2.1.2 A dungeon run is **three rooms** (`RULES.dungeon.rooms`): two normal foes, then a room boss. HP carries from room to room, and so does being knocked out. Every room is a fresh fight: no mark carries over, and the room's rounds start at 1.

2.1.3 Room modifiers (Flooded, Thorns, and so on) are plain changes to the room's numbers or one extra foe move, applied before the fight starts. They add no new rule.

**2.2 Rounds.** A fight is played in numbered rounds, from 1. Each round has the steps in 2.3 to 2.6, in that order. The step order never changes.

2.2.1 Round limits: Phase 1 and Phase 2 have 10 rounds each (`RULES.raid.phases[].rounds`). The finale has the boss's `finaleRounds` (12 for all four bosses). A normal dungeon foe has 6 rounds and a room boss 8 (`rounds` in `dungeon-foes.json`).

2.2.2 Overtime (enrage, section 7) adds rounds after the limit, in the finale and in a dungeon boss room only.

**2.3 Round start.** In this order:

1. The round is announced. If it is an enrage round, enrage is announced.
2. Dice are drawn (9.2). Nothing later in the round changes them.
3. A charge that lands next round is announced and its victims are marked (6.12). Not in enrage rounds.
4. If the boss has a reflect move due this round, it arms (5.4). Not in enrage rounds.
5. Supports act (4.5): each living, non-silenced Support in slot order boosts, heals and cleanses the creatures beside it.
6. Finale abilities set for this round fire, in the order they were stored (section 8). Not in enrage rounds. If the boss has fallen or retreated, they do not fire.

**2.4 Creature turns.** Creatures act one at a time in the boss's turn order.

2.4.1 Turn order is fixed at the start of the fight. A raid boss has one of: `left_to_right`, `right_to_left`, or `speed` (highest Speed first, ties to the lower slot). Today: Tidal Colossus and Storm Sovereign left to right, Thornmother right to left, Cinder Wyrm by speed. The dungeon is always left to right (`RULES.dungeon.turnOrder`), whatever the foe or the room says.

2.4.2 A knocked-out creature is skipped. A silenced creature skips its turn and its silence counts down by one (6.4). Every other creature hits the boss (2.4.3).

2.4.3 A creature's hit on the boss deals its Attack, times the element matchup (`RULES.combat.strongBp` 150% against the element it beats, `weakBp` 75% against the element that beats it, otherwise 100%), times one combined bonus (Support boost, Rally, crit, mutators; they add together, then multiply once), minus the boss's resist if it has adapted. Then marks and reactions (section 5).

2.4.4 If the boss's pool reaches 0, or reaches its phase floor (section 7), the creatures after it do not act and the boss does not take its turn.

2.4.5 **No overkill.** A hit on the boss counts only up to the HP the boss had left on that hit, down to 0 (a kill) or down to the phase floor (a retreat, 7.1). The part above is not damage: it is not in the log's `damage`, the reaction bonus (the plain hit is counted first, the bonus gets what is left), the credit, or the totals per element. The boss then falls (or retreats) and the fight stops (2.7).

_Example._ The boss has 150 HP left. A creature's plain hit would deal 100 and its reaction bonus 212, 312 in all. 100 counts, then 50 of the bonus: the log says 150, the boss is at 0, and the setup is credited from a bonus of 50.

**2.5 The boss turn.** If the boss is still up:

1. Its moves that are due this round, in the order of its content list. Each move picks its targets just before it lands, from the creatures standing at that moment. (None in an enrage round.)
2. Its plain attack.
3. In an enrage round only: the enrage hit (7.2).

So the plain attack comes **after** the moves, and it picks its target after they have done their damage. This is how the game plays, on purpose: a move can knock out the front creature and the plain attack then goes for the next one standing.

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

1. **Who takes it:** the Guard step-in, or the Guard roll (4.2). The rest of the steps belong to the taker.
2. **Shield Wall** on the taker's row (3.3).
3. **Armor**, if the taker is a Guard (4.1).
4. **Cover**, if it is an area hit and the taker is beside a living Guard (4.3).
5. **The single-hit cap**: off (`RULES.combat.maxHitBp` 0). If it were above 0, no aimed or area hit would deal more than that share of the taker's maximum HP (never less than 1). It never limits a reflected hit.
6. **HP**: the damage is taken, the taker loses that much HP, but never more than it has left (1.13).

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

**4.3 Guard: cover.** A creature right beside a living Guard (1.5) takes 40% less from **area hits** (`RULES.combat.coverBp`). It applies at step 4 of 3.2, to splash, sweeps, barrage shells, lance hits, pincers, chain jumps and enrage hits alike. A creature beside two Guards is covered once (the left one counts and is credited). The damage prevented is credited to the Guard (a score, not a rule).

_Example._ In the raid, a Guard at the end of the Front row covers its Front neighbour but not the first Middle slot: beside stops at the row edge (1.5.1). In the dungeon, a Guard in the middle covers both its neighbours.

**4.4 A Lance stops at a Guard.** A lance hits the creature in its lane in each row, Front to Back. A living Guard in the lane takes its hit (with its armor) and stops the lance: nobody behind it is hit (6.10).

**4.5 Support.** At the start of each round (2.3 step 5), every living Support that is not silenced does the following for each living creature beside it, in slot order.

4.5.1 **Reach.** Beside is as in 1.5: in the raid the reach stops at the edge of the Support's row, in the dungeon it is the plain line. A Support beside a knocked-out creature gives that slot nothing: it does not reach past it.

4.5.2 **Boost.** The creature's next hit on the boss deals more: 15% (`RULES.combat.supportBuffBp`), or 25% for an Ember Support (`RULES.combat.supportFx.ember.buffBp`). It waits until the creature hits; a silenced creature keeps it. A second boost from the same Support replaces the first; boosts from different Supports add up. A boost already given stays if the Support is later knocked out.

4.5.3 **Element effects.** Tide: heals 4% of the creature's max HP (`supportFx.tide.healBp`), and clears its silence (`supportFx.tide.cleanse`). Grove: heals 6% (`supportFx.grove.healBp`). Spark: when the creature sets off a reaction, the reaction's bonus damage is 15% larger (`supportFx.spark.reactionBp`; not when the reaction is reflected). Ember: the stronger boost above.

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

**5.3 Cashing in.** A creature whose element is the reaction's trigger, and that hits a boss carrying that mark, sets off the reaction (`reactions.json`):

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

5.4.4 **One reflection a round.** It is armed for one round only; the next round arms it again. Only the first reaction of the round is reflected: a second reaction in the same round goes through unreflected, as an ordinary reaction. An ability's strike from a creature that is knocked out is never reflected.

_Example._ Wyrm's Backdraft is armed. Splashet's plain hit is 100; Steam makes it 450, so the bonus is 350. The boss takes 100. A Guard stands in Splashet's row: it takes the 350 instead, armor prevents 87 (25%), so it takes 263.

## 6. Boss moves

**6.1 In general.** Each move names its power as a share of boss Attack for each hit. A move is aimed or area (1.15, 1.16), and picks only **living** creatures. When a rule below has no living target, it does nothing.

**6.2 Plain attack.** One aimed hit, `RULES.combat.bossAttackBp` of Attack, on the target of 4.2.5.

**6.3 Row attack (`hit_zone`: Undertow, Thorn Rain).** An area hit on every living creature of the aimed row, at the move's `power`.

6.3.1 **Nearest-living-row fallback.** If nobody stands in the aimed row, the attack goes to the nearest row that has someone: one step away first; on a tie Front before Back (`nearestLivingZone`). It does nothing only when the whole line is down.

_Example._ Undertow aims Front. Front is knocked out, Middle and Back stand. It hits Middle (one step), not Back (two). If Middle is aimed and Front and Back both stand, it hits Front.

6.3.2 In the dungeon every row is one slot: a row attack hits the creature at that place, and passes to the next one if it is down.

**6.4 Silence (`silence_ends`: Bramble Bind, Sea Mist, Thorn Snap, Tangle).** No damage. The leftmost and the rightmost living creature of the whole line (not of each row) are silenced: they skip their next `turns` turns (1 for every boss today). One creature standing is silenced once. A silence already running is not added to, it lasts as long as the longer one. A silenced creature skips its turn when it would have acted, and the count goes down then. A silenced Support gives nothing (4.5.5). A Tide Support beside a silenced creature clears it at the next round start (4.5.3).

6.4.1 Silence is applied after the creatures act, so it first bites in the next round.

**6.5 Reflect (`reflect_first_reaction`).** Not an attack. It arms the trap of 5.4.

**6.6 Strike and chain (`strike_highest_atk`: Lightning Rod, Zap Dive, Arc Lash).** A first **aimed** hit on the strongest living creature (highest Attack; ties to the lower slot), at `power`. With `jumps` above 0, jump k (1 to `jumps`) is an **area** hit on the k-th next strongest creature at `power` times `decayBp` to the power k (each step rounded down; default 55%). The creatures are ranked once, before any hit lands, so a jump is not re-aimed.

6.6.1 **No creature is hit twice by the same chain.** The jumps go down the ranking after the strongest. A creature the chain has already hit is skipped, and the jump goes to the next strongest not yet hit. The only creature that can already have been hit is the one that took the first hit: a Guard that stepped in for it. So a Guard that took the first hit is skipped by the jumps even if it is the next strongest, and the chain reaches one creature further down.

_Example._ Attack order A (strongest), G (a Guard), C, D. The strike aimed at A is taken by G. Jump 1 skips G and hits C, jump 2 hits D. (Without rules, in an old fight, jump 1 hit G again.)

6.6.2 The `gimmick` event lists the creatures as picked by the ranking, before any Guard stepped in; the hits that follow are the truth.

**6.7 Sweep (`sweep`: Great Wave, Flood Gate).** An area hit on every living creature of one row. `rows` is a walk: firing n hits `rows[(n - 1) mod length]`. A named row with nobody standing falls back like 6.3.1. With `all`, every living creature of every row is hit (a row with nobody is skipped).

**6.8 Barrage (`barrage`: Cinder Fall, Seed Burst, Thorn Rain, Flare Up).** Shells land on distinct living creatures, each an area hit at `power`. Shells cannot be stepped in for, but cover works.

6.8.1 Number of shells: living creatures times `shareBp`, rounded up, held between `min` and `max` (and never above the living count).

6.8.2 Fairness: no creature is hit twice in one volley. A creature hit by this move's **last volley** is skipped (not "never the same twice running" without exception), **unless fewer than the shell count of other creatures are standing**: then all the others are hit and the rest are taken from the last volley's creatures. The last volley is remembered **per move**: a boss with two barrage moves keeps two memories, and one does not see the other's volley. The picks are a shuffle driven by the round's dice (9.2).

**6.9 Slam (`slam`: Coil Crush, Thunderclap, Root Grab, Anvil Fall).** An aimed hit at `power` on the victim, then a **splash**.

6.9.1 The victim: `front` (picked exactly as the plain attack picks, including the Guard and its roll, 4.2.5), `strongest` (highest Attack, ties to the lower slot), `left` (the leftmost living creature), or `random` (one die over the living creatures).

6.9.2 The **impact** is the creature that took the hit: the Guard if one stepped in, else the victim. Every living creature beside the impact takes `splashBp` of the move's damage (worked out as in 3.2's example: from the move's own amount before any reduction) as an **area** hit, so cover and Shield Wall apply to it. The splash goes beside the impact even if the impact was knocked out by the hit.

**6.10 Lance (`lance`: Riptide).** An area hit on the creature in the chosen lane of each row, Front then Middle then Back. Row number r (0, 1, 2) takes `power` times `falloffBp` to the power r (each step rounded down). The lane is `random` (one die over the lanes that have a living creature) or `strongest` (the lane of the strongest living creature).

6.10.1 An empty or knocked-out slot is passed through: it takes nothing and the next row keeps its own falloff. **A living Guard in the lane takes its hit (with armor) and stops the lance**: nobody behind it is hit.

6.10.2 With a line that is not a multiple of three, Middle is the widest row, and a lane past the end of a shorter row has nobody there.

**6.11 Pincer (`pincer`: Briar Pincer, Briar Cage).** An area hit on the first and the last living creature of each row (`scope` `rows`, Front first) or of the whole line (`scope` `row`, used by Briar Cage in the dungeon). A group with one creature is hit once. A group with nobody is skipped.

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

_Example._ With a boss Attack of 100 and an enrage `powerBp` of 500%, the enrage hit proposes 500 on each creature. The cap is off (3.2 step 5), so a creature with 400 HP is knocked out (the hit shows 500). Beside a living Guard it takes 300 (cover) and survives with 100; a Guard itself takes 375 (armor) and survives with 25.

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

- A creature's **crit**: chance `RULES.combat.luck.critChanceBp` (5%) plus the species bonus, extra damage `critBp` (+50%), capped at `critMaxChanceBp` (30%) and `critMaxBp` (+150%).
- The boss's **crit** on a hit (3.1.1): `bossCritChanceBp` (5%), `bossCritBp` (+50%), the same caps.
- **Barrage targets** (6.8) and **random slam victims** (6.9.1).
- The **lance lane**, if `random` (6.10).
- The **Guard roll** among several Guards (4.2.3).

Off today (`RULES.combat.luck`): damage spread (`spreadBp` 0), Fortune streaks (`surgeChanceBp`, `slumpChanceBp` 0), and a random plain-attack target (`bossRandomTargetBp` 0). Nothing else is random: every other target, order and tie follows a rule above.

**9.2 Dice, not rolls on demand.** Randomness is dice drawn at round start (2.3 step 2), never later. A creature has a crit die per round for its turn and a second for an ability's strike. The boss has a crit die per slot per round for its plain attack and another for its moves. Pattern dice (40 a round) feed barrages, random slams and lanes. One Guard die per slot feeds the roll. Each kind of die is drawn every round whenever its feature is on (crits, patterns, the Guard roll), whether or not a rule uses it, so what one rule does never changes another's dice.

**9.3 Where they come from.** The server draws a fresh seed from `crypto.getRandomValues` at the moment the fight is resolved (a raid stage, a dungeon run). Nobody, including the client, can know it before then. Dice come from that seed. The seed, the fight's input and its rules (`rules`, `luck`, floor, enrage) are stored, so a fight replays exactly, and a later retune never changes an old fight. Tests and the balance simulator use seeded dice.
