# Proposal 001: combat v2 rules

Status: **proposed**, v0.5 (2026-10-26; Misa answered the first panel's questions). Author: lead agent, from the design conversation with Misa (2026-10-25 and 26), three reviews of v0.1, the first panel on v0.3 (`reviews/2026-10-26-panel-1.md`) and the lab. Prototype: `packages/lab` (its `fight.ts` follows these rules step by step; a test covers each rule that changed).

## Motivation

Players push their top three creatures and everything else waits. Every activity rewards the same three, levels decide too much, and the reaction system makes one Setter-plus-Payoff pair the answer to every fight. The rework moves the reason to bring a creature from its level to its species (Knacks), gives the boss more agency (turns between rows, slot patterns, rule cards), and adds systems that ask different questions (armour, healing, attrition).

## Rules

Each rule names what it replaces in `combat-rules.md`. Durations count the affected creature's own turns unless they say rounds.

**R1. Dodge before intercept** (replaces 3.2 step 1 and 14.3).

1. The attack picks its target slots (R2).
2. Each target rolls dodge (its Nth roll this round uses its die N). A dodge ends that hit and the target's on-dodge effects fire.
3. Only if the dodge failed, a Guard whose reach includes the target takes the hit instead (the nearest, then the leftmost). The Guard does not roll.
4. Everything after (reductions, cover, armour) belongs to whoever takes the hit.
5. A move that deals no damage (a silence) is not dodged or intercepted.

**R2. Targets are slots.**

1. A boss attack is an **anchor** and a **shape**. Anchors: front-most (front row first, then leftmost), strongest (highest Attack; ties to the front, then the left), strongest Payoff (else strongest), random, Grudge (last round's top damage; in round 1, the strongest). Shapes: one slot, a line of three (the anchor and its row neighbours), the row, the column, the ends of every row, a random row, everything.
2. Each living creature in the shape takes its own hit. One slot is aimed. In a line of three, the anchor's hit is aimed and its neighbours' are area hits. Every other shape is area.
3. Area hits are dodged at half chance; a Charged hit at full chance. Guards intercept aimed hits; area or Charged hits only with an effect that says so.

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

**R7. Reaction bonus.** Bonus = plain hit x (Payoff multiplier - 1) x the bonus factor. The factor is the Knack's own factor, times (1 + extra counts spent x the Knack's share), times Baked Shell's x2; all of it together is capped at x3. Starting Payoff multiplier: **x2** (today x4.95). The first panel measured x2.5 as close to doubling two plain hitters and x3 as past it, so x2 stays.

**R8. The round and the arena.**

1. The arena's row count is set by the boss (today three; Misa, 2026-10-26). Row 0 is the front.
2. Round start, in slot order (front row first, left to right): Support verbs, then round-start Knacks. Then the boss **announces** its Charged moves of the round: their slots are rolled now and shown.
3. For each row from the front: its creatures act left to right (Supports hit too), then **the boss takes a turn**: its moves due on that turn, its plain attack, then Clean Scales sheds the marks that were on it when that turn began (unless Sealed).
4. The boss takes a turn after every row of the arena, empty or not.
5. Reflective Hide arms at the end of each boss turn (not before the first).
6. The dungeon keeps its single line and today's order (one boss turn after the line).

**R9. Taunt.** Taunt becomes the anchor of every plain attack, whatever its anchor; moves keep their own anchors. Several taunters: the front-most, then the leftmost. A Guard may still intercept for a non-Guard taunter after its failed dodge.

**R10. Store.** A Store holds up to 3 of a named resource. Gains past 3 are lost. It empties on knock-out and at the end of the fight. A spend on a turn that is dodged, skipped or silenced keeps it. A Store fed by reactions gains at most 1 per boss turn. At most one Store per creature line.

**R11. Knacks.** One Knack per creature, or none. Swapping is free before any fight and locks with the raid phase. Stage 1 forms have all their Knacks at catch; stage 2 forms keep the line's Knack when the role stays and get their own at evolution. An absent player's creature uses the Knack its owner last saved, or none. Knacks replace creature finale abilities.

**R12. Silence.** Until the end of the creature's Nth turn, its Knack (stat bonuses included), talents, gear effects **and its role's verb** do nothing (Misa, 2026-10-26): a silenced Setter does not mark, a Payoff does not cash, a Guard does not intercept or cover, a Support does not boost or heal. It still makes its plain hit with its stats.

**R13. Armour and Blocked.** Foes and creatures have Armour, a flat amount taken off every hit. A hit at or below armour is **Blocked** and deals nothing (Misa, 2026-10-26). Guards are armoured rather than only high in HP.

**R14. Raid attrition.** A raid weekend's stages share the boss's HP. Only HP carries: creatures keep their HP between stages, nobody heals between stages, and a knocked-out creature is out for the weekend. Marks, Stores, Mired and "each fight" effects start fresh each stage. Players may swap creatures between stages; a replacement takes an empty slot. A knocked-out creature does not come back that weekend (Misa, 2026-10-26: players have spare creatures by week 2, so no extra mechanic). The dungeon is unchanged.

**R15. Buffs and debuffs.** An effect stacks up to its own maximum; different effects add; all hit boosts together are capped (lab: +150%), and reaction-bonus factors have their own cap (R7). Debuffs on the boss (Mired) have their own maximum. Never design for "bring seven of this buff".

**R16. Support shapes and healing.** A Support's base reach is the creatures beside it. Knacks may reshape it (one place further, every creature in front of it in its column). Heals can crit. Some bosses may need well-placed healers.

**R17. Spend.** An effect that spends names what (part of a mark's count, a Store, a share of HP) and how much ("all", "one extra"). A spend that cannot be paid does nothing.

**R18. The live finale.** Creature finale abilities go (R11). The basic Rally, Shield Wall and Purge stay as the live input for now. Relics, items brought into the finale, are an idea for later.

**R19. Swap requests (raid).** A player can ask another player to swap the slots of two creatures on the raid board, so pairings across players can be arranged (Misa, 2026-10-26: "we do it manually now; a system would help"). The other player accepts or declines; an accepted swap moves both creatures in one step; open requests end at the next phase lock. Design and build with the raid board (roadmap, "Swap requests").

## On the board (from the readability review)

What the fight and the raid board must show, so each rule can be read before it plays (P-08). Everything stays small and in a fixed place; the boss stays the focus.

- **Marks:** one strip under the boss, oldest first, element icon and "x2"; a lock on a Sealed mark; marks about to be shed blink one step before the boss turn. Debuffs (Mired) sit apart from marks.
- **Boss turns:** a small strip at the edge: row 1, boss, row 2, boss, row 3, boss; a move icon on the step where a move is due; countdowns as numbers in one unit.
- **Targets:** slots chosen by a fixed rule light up on the board; Charged and random moves light theirs when announced; the plain attack is one small marker on its current target (the taunter, if any).
- **Armour:** a shield with a number on the boss card; a cracked-shield icon on a creature whose plain hit would be Blocked; a Blocked hit shows the shield and 0.
- **Creatures:** a silenced creature's Knack chip is crossed out with a countdown; a Store is a three-step meter; a Payoff shows the mark it would cash ("Charged x2").
- **Raid weekend:** the shared boss HP bar with a tick per stage and "Stage 2 of 3"; carried HP in the creature list; knocked-out creatures greyed, "Out this weekend".
- **Cards and answers:** each rule card is an icon on the boss card; the same icon sits on creatures whose Knack answers it, **only once the lab shows that answer works** (P-13).
- **Text:** Knack text at most two lines on a 390 px card, keywords as chips, reach and heal shapes as tiny grid icons. Intent, formulas and rule numbers never appear in the game.

## Gear: what changes (plan, not built)

Today's gear lines were priced for x4.95 reactions and for rules that are going. Before the port:

- Every gear effect that equals a Knack takes the Knack's name (P-06), or is retired: Ridge Copper's three-piece and Spill-over (Leave a Trail), Warden's Watch's three-piece and Wide stance (Wide Reach), Hearth Helpers (Wide Warmth), Riposte (Retaliate), First Footprints (Seal), Opening mark (gives any role a free mark, so retire or make it a Setter-only line).
- Reaction-bonus lines (reaction bonus, Payoff's pounce, Spark-share, Owner's mark, Four winds, the two-piece set bonuses) scale up about 4x for x2 reactions.
- Per-element lines become "its own element", so they do not multiply with 10+ elements.
- Marks and trails come only from Knacks, never from gear.

## Drawbacks

- Damage per reaction drops (a Payoff x2 instead of x4.95) and the boss acts more often; bosses are retuned with the release.
- Teams without a Setter, or without a Knack that marks, cannot react at all.
- Mire's debuff came from finale abilities; it moves into Knacks (Mud Wall, Squelch Song) before abilities go. Mire still has no Setter or Payoff, so its two reactions cannot happen yet.
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
3. **Lab UI on staging** (next): a staging-only page that runs a lab fight with a chosen board, Knacks and rule cards, shows a step log, and runs 100 seeds. Misa judges the feel.
4. **Port to the engine** behind a flag, with stored fights still replaying under their old rules.
5. **Experimental season** in production, labelled; weekly retunes in patch notes. Signals: Knack picks and swaps, creatures used beyond each player's top three, winning combos, and a quick "was this fun?" after the raid.
