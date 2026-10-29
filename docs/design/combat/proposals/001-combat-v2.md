# Proposal 001: combat v2 rules

Status: **proposed**, v0.8 (2026-10-29: the raid bosses, dungeon foes and Build-up, `reviews/2026-10-28-panel-4.md`); v0.7 (2026-10-28: the talent library and the third panel, `reviews/2026-10-28-panel-3.md`); v0.6 (2026-10-26; Misa answered the first panel's questions; the second panel's fixes for the species and talent slice are in, `reviews/2026-10-26-panel-2.md`). Author: lead agent, from the design conversation with Misa (2026-10-25 and 26), three reviews of v0.1, the first panel on v0.3 (`reviews/2026-10-26-panel-1.md`) and the lab. Prototype: `packages/lab` (its `fight.ts` follows these rules step by step; a test covers each rule that changed).

## Motivation

Players push their top three creatures and everything else waits. Every activity rewards the same three, levels decide too much, and the reaction system makes one Setter-plus-Payoff pair the answer to every fight. The rework moves the reason to bring a creature from its level to its species (Knacks), gives the boss more agency (turns between rows, slot patterns, rule cards), and adds systems that ask different questions (armour, healing, attrition).

## Rules

Each rule names what it replaces in `combat-rules.md`. Durations count the affected creature's own turns unless they say rounds.

**R1. Dodge before intercept** (replaces 3.2 step 1 and 14.3).

1. The attack picks its target slots (R2).
2. Each target rolls dodge (its Nth roll this round uses its die N). A dodge ends that hit and the target's on-dodge effects fire.
3. Only if the dodge failed, a Guard whose reach includes the target takes the hit instead (the nearest, then the leftmost). The Guard does not roll. A creature that intercepts through an effect (Carry Them) covers only the creatures beside it, and only when no Guard can.
4. Everything after (reductions, cover, armour) belongs to whoever takes the hit.
5. A move that deals no damage (a silence) is not dodged or intercepted.

**R2. Targets are slots.**

1. A boss attack is an **anchor** and a **shape**. Anchors: front-most (front row first, then leftmost), back-most (the back-most living creature), strongest (highest Attack; ties to the front, then the left), strongest Payoff (else strongest), most hurt (lowest share of HP), random, Grudge (last round's top damage; in round 1, the strongest). Shapes: one slot, a line of three (the anchor and its row neighbours), the row, several rows, the column, several columns, a cross (the anchor and the slots touching it), a checker (every other slot), the ends of every row (the arena's first and last slots, R21.1), a random row, a **scatter** (several different random creatures), a **Leap** (below), everything. A count on a shape (scatter, row ends, Leap jumps, several columns) may be given per 4 columns, so a pattern covers the same share of a wide raid row as of a four-wide one. An aimed move may also have several anchors per 4 columns (it picks that many targets by its anchor), so one aimed hit does not thin out in a wide raid.
2. Each living creature in the shape takes its own hit. One slot is aimed. In a line of three, the anchor's hit is aimed and its neighbours' are area hits. Every other shape is area.
3. Area hits are dodged at half chance; a Wind-up hit at full chance. Guards intercept aimed hits; area or Wind-up hits only with an effect that says so (a Wind-up single hit included). A Guard takes at most one hit of a move: if it intercepts one, it does not also take its own.
4. **Leap** (panel 4): the anchor takes the aimed hit. Each jump goes to the strongest creature not yet hit in an adjacent slot (beside it, in front or behind; ties to the front, then the left) and deals the move's power times the decay per jump. Every jump is chosen before any hit lands; dodges and intercepts do not change the path.
5. **Wind-up** is the name for a boss move announced with its slots (it was called Charged; the Spark mark keeps that name).

**R3. Marks.** The boss can carry a mark of each element at once, each with a count from x1 to x3. A mark stays until cashed or shed. The board shows marks in one strip, oldest first.

**R4. Who marks.** A Setter's hit that sets off no reaction leaves its element's mark, or adds 1 to its count. Other roles mark only through an effect that says so. A hit that sets off a reaction leaves no mark by the base rules; an effect may still add a mark of any element on that hit (Misa, 2026-10-26).

**R5. Who cashes.**

1. Only a Payoff, or an effect that says so, cashes a mark.
2. Of the marks the hit may cash (its element triggers them, the count meets the Knack's minimum, and Fizzle allows it), it cashes the oldest. One reaction per hit.
3. A reaction lowers the count by 1, unless an effect spends more (R17).
4. **Chain cap:** a reaction on a mark left by Leave a Trail leaves no further trail.

**R6. Order inside a creature's hit.**

1. Plain damage: Attack, the element chart, boosts (capped, R15), the Knack's share, a crit.
2. The boss rolls dodge. A hit that deals no damage by its Knack is not rolled.
3. Reaction (R5): choose the mark, work out the bonus (R7), apply Adapts, Baked Shell (once), then Reflective Hide.
4. Cap (Stone Skin), then armour: at or below armour the hit is **Blocked** (R13). A count spent in step 3 stays spent.
5. Mark (R4). A Setter's hit that the boss dodged or Blocked still marks: setup never misses.
6. After-hit effects.

**R7. Reaction bonus.** Bonus = plain hit x (Payoff multiplier - 1) x the bonus factor. The factor is the Knack's own factor, times (1 + extra counts spent x the Knack's share), times Baked Shell's x2, times a crit talent's raise on a crit (Big Finish); all of it together is capped at x3. Starting Payoff multiplier: **x2** (today x4.95). The first panel measured x2.5 as close to doubling two plain hitters and x3 as past it, so x2 stays. Talent raises (Opportunist, Quick Draw, Owner's Mark, Hungry, Big Finish) are further factors; every factor multiplies, and the total is capped at x3.

**R8. The round and the arena.**

1. The arena's row count is set by the boss (today three; Misa, 2026-10-26). Row 0 is the front.
2. Round start, in three steps: a) every Support's verb (or the Support-shape Knack that replaces it), in slot order (front row first, left to right); b) round-start Knacks and talents (Hearth, Mud Wall's Mired), in slot order; b2) the boss's Build-up steps up if due (R22); c) the boss **announces** every move due this round whose targets use a roll (a random anchor, a scatter, a random row, a Leap) and every Wind-up move: their slots are rolled now and shown, with the move's icon on each targeted creature (Misa, 2026-10-28: players cannot stop it, but watching it come is exciting). An announced move lands on those slots; a target knocked out in the meantime is skipped; it never re-aims. Being a Wind-up only changes how its hits are dodged and intercepted.
3. For each row from the front: its creatures act left to right (Supports hit too), then **the boss takes a turn**: its moves due on that turn, its plain attack, then Clean Scales sheds the marks that were on it when that turn began (unless Sealed).
4. The boss takes a turn after every row of the arena, empty or not.
5. Reflective Hide arms at the end of each boss turn (not before the first).
6. **Debuffs fade** (Misa, 2026-10-28): at the end of every second round the boss loses 1 Mired stack (Clinging: every third round while a living creature has it; panel 3). A rule card may also clear every debuff on a round it announces at round start (Shake It Off: every 3 rounds, at the end of that round's last boss turn).
7. The dungeon keeps its single line and today's order (one boss turn after the line).

**R9. Taunt.** Taunt becomes the anchor of every plain attack, whatever its anchor; moves keep their own anchors. Several taunters: the front-most, then the leftmost. A Guard may still intercept for a non-Guard taunter after its failed dodge. A plain attack with no anchor (a scatter, a random row, the ends of every row, everything) ignores Taunt.

**R10. Store.** A Store holds up to 3 of a named resource. Gains past 3 are lost. It empties on knock-out and at the end of the fight. A spend on a turn that is dodged, skipped or silenced keeps it. A Store fed by reactions gains at most 1 per round (not per boss turn, so arenas with more rows do not fill it faster). At most one Store per creature line.

**R11. Knacks.** One Knack per creature, or none. Swapping is free before any fight and locks with the raid phase. A creature knows every Knack of its form from the moment it is caught, so a base form is useful from day one. Evolving adds the new form's own Knacks to the ones it knew (Misa, 2026-10-27): evolution grows the Knack list, so the evolved form brings something new. On a role change (Mossback, a Setter, into Bloomback, a Payoff) it keeps only the new form's Knacks, since the old role's would do nothing; an equipped Knack it no longer knows becomes none. An absent player's creature uses the Knack its owner last saved, or none. Knacks replace creature finale abilities.

**R12. Silence.** Until the end of the creature's Nth turn, its Knack (stat bonuses included), talents, gear effects **and its role's verb** do nothing (Misa, 2026-10-26): a silenced Setter does not mark, a Payoff does not cash, a Guard does not intercept or cover, a Support does not boost or heal. It still makes its plain hit with its stats.

1. **Wards.** Before a silencing move lands, every target that cannot be silenced is noted (its own Unbothered, or a living, unsilenced Lantern Glow beside it); then the rest are silenced. A Lantern Glow silenced by that same move still wards its neighbours from that move, not from the next.
2. **Talents while silenced** (panel 3): its talents do nothing. Triggers do not arm, rhythm counters do not count, and once-per-fight effects are not spent (a first hit made while silenced is not its First Pounce). An effect stored before the silence stays stored.

**R13. Armour and Blocked.** Foes and creatures have Armour, a flat amount taken off every hit. A hit at or below armour is **Blocked** and deals nothing (Misa, 2026-10-26). Guards are armoured rather than only high in HP. **Every creature has armour** (Misa, 2026-10-28): it is a stat of each species, not of its role, shown in the stat block like HP, Attack and Speed. Each line starts with its own base armour; lines that start as Guards lean higher, and an evolution never lowers it, whatever the new role. Talents, Knacks and gear (the Armor line included) may raise anyone's; no armour effect is limited to Guards. One species will have the highest armour and stand out for it: a choice to build around, balanced by its element, Knacks and talents.

**R14. Raid attrition.** A raid weekend's stages share the boss's HP. Only HP carries: creatures keep their HP between stages, nobody heals between stages, and a knocked-out creature is out for the weekend. Marks, Stores, Mired and "each fight" effects start fresh each stage. Players may swap creatures between stages; a replacement takes an empty slot. A knocked-out creature does not come back that weekend (Misa, 2026-10-26: players have spare creatures by week 2, so no extra mechanic). The round count restarts each stage. A raid boss's weekend HP grows with the number of players (R14.1). **The dungeon** (panel 4): between rooms only HP carries; a knocked-out creature stays out until the camp's swap brings a fresh one; the camp keeps today's choices (rest, swap a creature, take a keepsake; push on or head home); a clear is beating the day's floor boss.

1. Boss HP per weekend: base x (players / 4) to the power of the boss's exponent (lab: 0.15 to 1.23; shipped game: 1.1), growing in a straight line past 10 players (with the exponent alone, 15 copies of an unprepared trio overwhelmed the boss).

**R15. Buffs and debuffs.** An effect stacks up to its own maximum; different effects add; all hit boosts together are capped (lab: +150%), and reaction-bonus factors have their own cap (R7). **Auras** (an effect a creature gives others: dodge beside it or in its row, area cut): of the auras of one kind reaching a creature, only the largest applies. A creature's own Knack and talents add to it. Debuffs on the boss (Mired) have their own maximum. Never design for "bring seven of this buff". **One cap on cuts** (panel 3): every cut a creature gets on one hit (Row Wards and other auras, cover, Long Shadow, Front-liner, Brace) multiplies, and the total cut is capped at 75%, before armour.

**R16. Support shapes and healing.** A Support's base reach is the creatures beside it. Knacks may reshape it (one place further, every creature in front of it in its column). Heals can crit. Some bosses may need well-placed healers.

1. A Support-shape Knack replaces the whole verb (boost and heal) unless it says "also". Its text starts "Instead of its boost and heal:" and says whether "its row" includes the creature itself.

**R17. Spend.** An effect that spends names what (part of a mark's count, a Store, a share of HP) and how much ("all", "one extra"). A spend that cannot be paid does nothing.

**R18. The live finale.** Creature finale abilities go (R11). The basic Rally, Shield Wall and Purge stay as the live input for now. Relics, items brought into the finale, are an idea for later.

**R19. Swap requests (raid).** A player can ask another player to swap the slots of two creatures on the raid board, so pairings across players can be arranged (Misa, 2026-10-26: "we do it manually now; a system would help"). The other player accepts or declines; an accepted swap moves both creatures in one step; open requests end at the next phase lock. Design and build with the raid board (roadmap, "Swap requests"). A request may also move a creature into an empty slot (panel 3).

**R20. Talents.** One shared library of combat talents; each creature line links to its own pool of seven from it (Misa, 2026-10-27), so two lines of the same role roll different tools. Branch forms share the line's pool. A line's pool says which talents can appear on its creatures; each creature grows its own library over time (Misa, 2026-10-27):

- A creature starts with the talent it was found with; a starter starts with a set talent instead of a roll.
- **Every talent found goes into its line's Talent Book automatically** (Misa, 2026-10-28): a duplicate catch records its talent there, and the duplicate choice is only about the creature (Fuse, Release or Keep), no longer about the talent.
- **Learning costs once, swapping is free.** A creature learns a talent from its line's book by paying Bait the first time (chosen on the creature screen, as today); after that it may swap among the talents it has learned for free, any time before the raid locks. A talent that only one line can roll stays with that line: another line must find it itself.
- Slots open with level. A golden talent is 1.25 times the value (Misa, 2026-10-28); a talent with no number has its own small golden extra, which never changes a shared limit. The migration rerolls talents from the new pools, and a golden talent rolls golden (Misa, 2026-10-27).

1. A talent adds numbers or flags to the creature's Knack (the same grammar): numbers add, flags combine; a Support shape comes only from the Knack. Talent hit bonuses count toward the hit-boost cap (R15), crit raises toward the reaction cap (R7).
2. One name per effect, one number per name, across Knacks, talents and gear (P-06). A talent never repeats a Knack's effect, and Seal is never a talent, so a roll never decides the Knack choice.
3. Every species uses the shared names (Misa, 2026-10-26): today's species-named talents go at the migration. A pool gives each role in its line at least three talents that work for it; a talent that does nothing for a form's role is idle on it (shown as such, as in the game today). New talents join the library as new effects; no talent is unique to one species by rule (P-09), though a pool may be the only one that has it.
4. Max HP from a talent (Hardy) is set when the fight starts, so silence does not take it away.
5. Silence blanks talents (R12).
6. "Its first hit each fight" means its first hit that gets past dodge and armour, in each fight and each raid stage (R14); Twin Strike's second hit is not a first hit. A first hit made while silenced uses it up.
7. Conditions like "while a living Guard stands beside it" are read as each hit is worked out (R6 step 1).
8. **Evolution and role changes** (Misa, 2026-10-27; built with the game integration, phase 4): when an evolution changes the role, each slotted talent that is idle for the new role is replaced by a random roll from the line's pool among the talents that work for the new role and are not in the creature's book yet. The evolution screen shows the replaced talents as unknown cards that turn over to reveal the new ones. Book entries that become idle stay in the book. Until this is built, idle talents after a role change are accepted.

**R21. Conditions and finishing blows** (the talent library, `modifiers.md`; lab 2026-10-28).

1. **Row end:** the first or last slot of its row in the arena (stable, and the owner chooses it). **Front row:** row 0.
2. **A mark set this boss turn:** a count added since the last boss turn ended.
3. **Flank Guard:** a Guard's reach goes to one side only, with twice the slots; both flanks together cancel out.
4. **Cull:** a hit that leaves a foe below the effect's share of its full HP (5%; in a raid weekend, of the weekend's shared HP) defeats it. The HP removed this way counts as the killing blow, not as the creature's damage.
5. **Killing blow:** the creature whose damage (or Cull) takes the foe's last HP. Effects may trigger on it (for example more loot for the raid, granted by the server like all loot). Killing-blow rewards go to the whole raid, never to one player, since turn order decides who lands it.
6. **The fight ends** the moment the foe reaches 0 HP: nothing else acts.
7. **Hits and counters:** a creature's hits are its own attacks (Twin Strike's two included). A counter (Retaliate, Shoulder Charge) deals damage and can land the killing blow, but it is not a hit: it never triggers Cull or an "its hits" effect.
8. **Cover and reach:** cover comes from the Guard with the largest cover whose reach includes the taker; reach counts across empty and knocked-out slots; every reach effect (Hearth, Baked Shell) follows a Flank Guard's reshaped reach.

**R22. Build-up** (a boss's Escalation; Misa's idea, 2026-10-28; panel 4).

1. A boss may have one Build-up: a **feed** (reactions it takes, its HP lost, rounds, crits it takes, its dodges, creatures it knocks out, marks it sheds), a **count per step**, a **cap**, a **growth** per step (Attack, dodge, armour, attacks per turn, Leap jumps, scatter targets, area size) and an optional **change of pattern** at a step (Thornmother's Second Bloom). Growth adds up in a straight line.
2. Feeds count when the event happens; HP lost and rounds are read at round start.
3. **Steps** apply at round start (R8.2 b2), at most one per round. Each Mired stack on the boss then **slows** the count (lab: a quarter of a step per stack); Mired never freezes it.
4. **Across a weekend** the count, the steps and any change of pattern carry like the boss's HP.
5. A change of pattern at a share of the weekend's HP is **announced a round ahead** and is not slowed by Mired, so every server sees it.
6. Build-up is not a Store (R10's limits do not apply).

**R23. Element and Reaction Resistance** (rule cards). From stage 2 of a weekend, the element (or reaction) with the most total damage so far is resisted: its creatures' hits deal less from R6 step 1 (counters are not cut). It is shown at the stage break, before swaps; ties give no resistance.

## On the board (from the readability review)

What the fight and the raid board must show, so each rule can be read before it plays (P-08). Everything stays small and in a fixed place; the boss stays the focus.

- **Marks:** one strip under the boss, oldest first, element icon and "x2"; a lock on a Sealed mark; marks about to be shed blink one step before the boss turn. Debuffs (Mired) sit apart from marks.
- **Boss turns:** a small strip at the edge: row 1, boss, row 2, boss, row 3, boss; a move icon on the step where a move is due; countdowns as numbers in one unit.
- **Targets:** slots chosen by a fixed rule light up on the board; Charged and random moves light theirs when announced; the plain attack is one small marker on its current target (the taunter, if any).
- **Armour:** a shield with a number on the boss card; a cracked-shield icon on a creature whose plain hit would be Blocked; a Blocked hit shows the shield and 0.
- **Creatures:** a silenced creature's Knack chip is crossed out with a countdown; a Store is a three-step meter; a Payoff shows the mark it would cash ("Charged x2").
- **Raid weekend:** the shared boss HP bar with a tick per stage and "Stage 2 of 3"; carried HP in the creature list; knocked-out creatures greyed, "Out this weekend".
- **Cards and answers:** each rule card is an icon on the boss card; the same icon sits on creatures whose Knack answers it, **only once the lab shows that answer works** (P-13).
- **Conditions and auras** (panel 2): every slot shows its role icon; a Knack or talent with a condition (Guard's Shadow, Territorial) has a chip that lights while the condition holds, and the picker previews it against the current placement; tapping a creature lights the slots its auras and reach cover, in a friendly look unlike boss-target lights; a creature that intercepts through an effect shows the same shield bracket under the slots it covers as a Guard.
- **Silence wards:** a warded creature shows a small "no silence" mark; when a silencing move is announced, warded targets show that mark instead of the crossed-out Knack chip.
- **The boss card** (panel 4), shown with the weekend's announcement: header (picture, name, element, armour, HP), then rule-card icons and the Build-up meter, then the plain attack, then the moves as small tiles (a tiny arena with the shape lit, how often in rounds, a Wind-up badge), grouped by what they aim at (front-most, strongest, Payoff, back-most, most hurt, row ends, anywhere). A change of pattern sits behind a notch ("at 50%"). About 8 tiles fit a row at 390 px.
- **Build-up on the board:** HP-fed steps as notches on the boss HP bar; round-fed steps on the boss-turn strip; event-fed steps as a pip meter with the feed's icon ("3 / 5"); a mud lock while Mired slows it; shapes redrawn after a step.
- **Announced attacks:** the move's icon on every targeted creature at round start (R8.2c).
- **Resistances:** a chip on the boss during stage 1 showing the leading element or reaction; from stage 2 the resisted icon with a shield.
- **Dungeon:** the map shows each room's foe, element, rule-card icon and its move tile up front; the camp repeats the rooms ahead and the floor boss, with carried HP and knocked-out creatures greyed.
- **Talent conditions** (panel 3): a chip that lights while its condition holds and updates as creatures fall (Shoulder to Shoulder with its 0 to 2 count, Odd One Out, Edge-walker, Front-liner); counters for Slow Burn (the round and its bonus) and for rhythms (pips); once-per-fight talents lit until spent, then grey; a notch on the boss HP bar for Cull and Finisher, drawn only when a creature on the board has them; a small "fresh" spark on a mark added since the boss's last turn (Quick Draw); an arrow on a Flank Guard's chip toward the side it covers. The Talent Book previews whether each condition holds in the current placement.
- **Talents on the card:** stat talents fold into the stat numbers with a small dot; only talents that change behaviour (Unflappable, Second Wind, First Strike, Big Finish) get a chip.
- **Text:** Knack text at most two lines on a 390 px card, keywords as chips, reach and heal shapes as tiny grid icons. Intent, formulas and rule numbers never appear in the game.

## Gear: what changes (plan, not built)

Today's gear lines were priced for x4.95 reactions and for rules that are going. Before the port:

- Every gear effect that equals a Knack takes the Knack's name (P-06), or is retired: Ridge Copper's three-piece and Spill-over (Leave a Trail), Warden's Watch's three-piece and Wide stance (Wide Reach), Hearth Helpers (Wide Warmth), Riposte (Retaliate), First Footprints (Seal), Opening mark (gives any role a free mark, so retire or make it a Setter-only line).
- Reaction-bonus lines (reaction bonus, Payoff's pounce, Spark-share, Owner's mark, Four winds, the two-piece set bonuses) scale up about 4x for x2 reactions.
- Per-element lines become "its own element", so they do not multiply with 10+ elements.
- Marks and trails come only from Knacks, never from gear.
- Names collide today (panel 2): the gear lines Steady paws (a silence chance) and Warm heart (a boost chance) share names with old talents, and Unbothered, Well-fed, First pounce, Guard's shadow and Riposte repeat a talent or Knack's effect under another name. In the port, each gear effect takes the talent's or Knack's name (Unflappable, First Strike, Guard's Shadow, Retaliate), or is retired; chance-based silence wards go (P-04).

## Drawbacks

- Damage per reaction drops (a Payoff x2 instead of x4.95) and the boss acts more often; bosses are retuned with the release.
- Teams without a Setter, or without a Knack that marks, cannot react at all.
- Mire's debuff came from finale abilities; it moves into Knacks (Mud Wall, Squelch Song) before abilities go. Mire still has no Setter or Payoff, so its two reactions cannot happen yet: a content gap (new species and art), tracked in the roadmap.
- More rules to read. Keywords explain themselves on tap; players teach each other.
- In the raid, pairings depend on who places first (each player places only their own creatures); swap requests (R19) answer it.

## Alternatives considered

- Lasting and fading marks, with non-Payoffs cashing fading ones (v0.2). Dropped: two tracks were hard to understand.
- Swift and Last to change turn order. Dropped: they hurt readability and erase the order puzzle.
- Layered marks. Dropped for several marks at once.
- "The boss carries one mark at most" as the chain counter. Dropped: the lab showed it does nothing (a chain never holds two marks at once). Fizzle and the chain cap replace it.
- A minimum damage on every hit instead of Blocked (a reviewer's proposal). Not taken: Misa chose Blocked; the board's cracked-shield icon makes it predictable instead.

## Open questions for Misa

1. **Taunt variants** (a row, a column) after the basic one is tested.
2. **Boss turns per round** in arenas with many rows: one per row, or one per two rows?

Answered (2026-10-26): attrition stays as written (R14); silence stops the role too (R12); swap requests become part of the design (R19).

## Testing plan

1. **Lab** (`packages/lab`, done): the rules above as a pure prototype, with tests and a report.
2. **Reviewer panel** (skill `design-panel`, done; first run on v0.3).
3. **Lab page on staging** (built 2026-10-26): `https://creatures-staging.misacorp.dev/combat-lab.html`, also linked from the DEV panel. Set up the arena, the boss, rule cards and a board of forms, Knacks and levels (or a preset), run one fight and read its log by round and row, or run 100 seeds. The address holds the setup, so a link reproduces a fight. Code: `apps/activity/src/combat-lab/`; a staging-only build input like the workbench, so production never ships it. Misa judges the feel here.
4. **Port to the engine** behind a flag, with stored fights still replaying under their old rules.
5. **Experimental season** in production, labelled; weekly retunes in patch notes. Signals: Knack picks and swaps, creatures used beyond each player's top three, winning combos, and a quick "was this fun?" after the raid.
