# Proposal 001: combat v2 rules

Status: **proposed**, v0.3 (2026-10-26). Author: lead agent, from the design conversation with Misa (2026-10-25 and 26), three reviews of v0.1 and the lab. Prototype: `packages/lab`. Older drafts (v0.1, v0.2) live only in the design library artifact; this file replaces them.

## Motivation

Players push their top three creatures and everything else waits. Every activity rewards the same three, levels decide too much, and the reaction system makes one Setter-plus-Payoff pair the answer to every fight. The rework moves the reason to bring a creature from its level to its species (Knacks), gives the boss more agency (turns between rows, slot patterns, rule cards), and adds systems that ask different questions (armour, healing, attrition).

## Rules

Each rule names what it replaces in `combat-rules.md` and where it sits. "Today" means the shipped rules.

**R1. Dodge before intercept** (replaces 3.2 step 1 and 14.3).

1. The attack picks its target (R2).
2. The target rolls dodge. A hit that cannot be dodged skips the roll. A dodge ends the hit and the target's on-dodge effects fire.
3. Only if the dodge failed, a Guard whose reach includes the target takes the hit instead. The Guard does not roll. Today's tie rule among several Guards stays (nearest, then leftmost in the lab).
4. Everything after (armour, cover, reductions) belongs to whoever takes the hit.

**R2. Targets are slots** (replaces 6.x targeting and 6.9.2 splash).

1. A boss attack is an **anchor** (front-most, strongest, strongest Payoff, random, last round's top hitter) and a **shape** around it: one slot, the slot and its two row neighbours, the row, the column, the ends of every row, a random row, everything.
2. Each living creature in the shape takes its own hit. One slot is an aimed hit; any other shape is an area hit.
3. Each creature rolls its own dodge (area hits at half chance; a charged landing at full chance). Guards intercept aimed hits; area hits only with an effect that says so.

**R3. Marks.** The boss can carry a mark of each element at once. Each shows a count, x1 to x3. A mark stays until cashed or shed.

**R4. Who marks.** A Setter's hit that sets off no reaction leaves its element's mark, or adds 1 to its count. Other roles mark only through an effect that says so. A hit that sets off a reaction leaves no mark by the base rules; an effect (a Knack, gear) may still add a mark of any element on that hit (Misa, 2026-10-26).

**R5. Who cashes.** Only a Payoff (or an effect that says so) cashes a mark: a Payoff's hit on a boss carrying a mark its element triggers sets off that reaction. One reaction per hit: if several marks could be cashed, the oldest. A reaction uses 1 from the count unless an effect spends more (R17).

**R6. Order inside a creature's hit.** Damage (Attack, element chart, boosts, crit), then the boss's dodge roll, then the reaction step (R5), then armour and Blocked (R13), then the mark step (R4), then after-hit effects. A Setter's hit that the boss dodges or Blocks still marks (setup never misses). A hit that deals no damage by its Knack is not rolled for dodge.

**R7. Reaction bonus.** Bonus = plain hit x (Payoff multiplier - 1) x the effect's factor x (1 + extra counts spent x the effect's share). Starting Payoff multiplier: x2 (today x4.95). Target: a Setter and a Payoff together clearly beat two plain hitters, but do not double them; against armour, the big hit is what breaks through.

**R8. The round and the arena.**

1. The arena has a number of rows set by the boss (today three). Row 0 is the front.
2. Round start: Supports act in slot order, then start-of-round Knacks.
3. Then for each row from the front: its creatures act left to right, then **the boss takes a turn**: its moves due on that turn, its plain attack, then shedding of marks if a rule card says so.
4. The dungeon keeps its single line and today's order (one boss turn after the line).

**R9. Taunt.** Replaces the plain attack's target only (moves keep their own anchors). Several taunters: the front-most, then leftmost. A Guard may still intercept for a non-Guard taunter after its failed dodge.

**R10. Store.** A Store holds up to 3 of a named resource. Gains past 3 are lost. It empties on knock-out and at the end of the fight. A spend on a turn that is dodged, skipped or silenced keeps it. At most one Store per creature line.

**R11. Knacks.** One Knack equipped per creature; swapping is free before any fight and locks with the raid phase. Stage 1 forms have all their Knacks at catch; stage 2 forms keep the line's Knack when the role stays and get their own at evolution. Absent players' creatures use their saved Knack (default: the first listed). Knacks replace creature finale abilities.

**R12. Silence.** A silenced creature's Knack, talents and gear effects do nothing until it ends. Its stats and its role's verb still work (open question 3).

**R13. Armour and Blocked.** Foes and creatures have Armour, a flat amount taken off every hit. A hit at or below armour is **Blocked** and deals nothing (Misa, 2026-10-26). Guards are armoured rather than only high in HP.

**R14. Raid attrition.** A raid weekend's stages share the boss's HP. Creatures keep their HP between stages, nobody heals between stages, and a knocked-out creature is out for the weekend. Players may swap creatures between stages; a replacement takes an empty slot. The dungeon is unchanged.

**R15. Buffs and debuffs.** An effect stacks up to its own maximum; different effects add; all hit bonuses from buffs together are capped (lab: +150%). Debuffs on the boss (Mired) have their own maximum. Never design for "bring seven of this buff".

**R16. Support shapes and healing.** A Support's base reach is the creatures beside it. Knacks may reshape it (two places away, every creature in front of it in its column). Heals can crit. Some bosses may need well-placed healers.

**R17. Spend.** An effect that spends names what (counts of a mark, a Store, a share of HP) and how much ("all", "one extra"). A spend that cannot be paid does nothing.

**R18. The live finale.** Creature finale abilities go (R11). The basic Rally, Shield Wall and Purge stay as the live input for now. Relics, items brought into the finale, are an idea for later.

## Drawbacks

- Damage per reaction drops (a Payoff x2 instead of x4.95), and the boss acts more often. Bosses are retuned with the release; encounters are ours to tune.
- Teams without a Setter, or without a Knack that marks, cannot react at all.
- Removing replacement marks retires gear lines (Re-mark, Quick re-mark, First Footprints' seal, marking-hit) that need new jobs.
- Mire's debuff came from finale abilities; it must move into Knacks (Mud Wall, Squelch Song) before abilities go.
- Boss turns after every row multiply how often the boss acts; its numbers per turn must fall.
- More rules to read. Keywords explain themselves on tap; players teach each other.

## Alternatives considered

- Lasting and fading marks, with non-Payoffs cashing fading ones (v0.2). Dropped: two tracks were hard to understand.
- Swift and Last to change turn order (v0.1, v0.2). Dropped: they hurt readability and erase the order puzzle.
- Layered marks (one under another). Dropped for several marks at once.
- Pips for counts. Changed to numbers (x3).

## Open questions

1. Payoff multiplier: x2 (lab start), x2.5 or x3? The lab sweeps it next.
2. Should a counter card for Leave a Trail chains exist (for example "the boss carries one mark at most"), or is the chain fine as the first standout build?
3. Silence: should it also stop the role's verb (a silenced Setter does not mark)?
4. Taunt variants (taunt a row, a column) after the basic one is tested.
5. How many boss turns per round for arenas with many rows (one per row, or one per two rows)?

## Testing plan

1. **Lab** (`packages/lab`, done): the rules above as a pure prototype, with tests and a report of best teams per rule card.
2. **Reviewer panel** (skill `design-panel`, done): four reviewers against the principles after each change of the proposal.
3. **Lab UI on staging** (next): a staging-only page that runs a lab fight with a chosen board, Knacks and rule cards, shows a step log, and runs 100 seeds. Misa judges the feel.
4. **Port to the engine** behind a flag, with stored fights still replaying under their old rules.
5. **Experimental season** in production, labelled; weekly retunes in patch notes. Signals: Knack picks and swaps, creatures used beyond each player's top three, winning combos, and a quick "was this fun?" after the raid.
